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
    // Date-only display (strip any time/timezone the cell might carry).
    function dateOnly(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return '--';
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? (m[1] + '-' + m[2] + '-' + m[3]) : esc(s);
    }
    // Canonical order_status (falls back to legacy status for old rows).
    function poStatus(o) { return String(o.orderStatus || o.status || '').trim().toLowerCase(); }
    function useDb() {
        return !!(window.KM && window.KM.DB && window.KM.DB.isCloudWriteEnabled &&
            window.KM.DB.isCloudWriteEnabled() && window.KM.DB.getPurchaseOrders);
    }

    // ---- F1-7C · scoped Purchase Order workspace read cutover (mirrors the F1-7B Weekly pattern) ----
    function _polEffectiveWorkspace() {
        return !!(window.KM && window.KM.api && typeof window.KM.api.workspaceApiActive === 'function' &&
            window.KM.api.workspaceApiActive('purchaseOrder'));
    }
    var _polReadModel = null;   // workspace-sourced {orders, lines, skuDetails, warehouses}, or null = Legacy (broad cache)
    var _polReadSeq = 0;
    var _polRegion = null;
    function _polRegion_() {
        if (_polRegion) return _polRegion;
        if (typeof document === 'undefined' || !(window.KM && window.KM.loadState)) return null;
        _polRegion = window.KM.loadState.createRegion({ render: function (state) {
            var tb = document.getElementById('pol-tbody'); if (!tb) return;
            if (state === window.KM.loadState.STATES.INITIAL_LOADING) {
                tb.innerHTML = '<tr><td colspan="9" class="procurement-empty">Loading purchase orders…</td></tr>';
            }   // READY / EMPTY / ERROR / REFRESHING → renderRows / _polRenderError_ paint the real content.
        } });
        return _polRegion;
    }
    // Scoped read: Workspace (canonical) → getWorkspace('purchaseOrder') → adapt; Legacy → broad cache. Fail-closed.
    function _polRefresh_() {
        var mySeq = ++_polReadSeq;
        var rg = _polRegion_();
        if (_polEffectiveWorkspace()) {
            var _tb = document.getElementById('pol-tbody');
            var _hasRows = !!(_tb && _tb.querySelector('tr') && !_tb.querySelector('.procurement-empty'));
            if (rg) rg.beginLoad(_hasRows);
            if (!(window.KM.api && typeof window.KM.api.getWorkspace === 'function')) { _polRenderError_({ code: 'WORKSPACE_UNAVAILABLE', message: 'Purchase Order Workspace API unavailable.' }); return; }
            Promise.resolve(window.KM.api.getWorkspace('purchaseOrder', { page: { number: 1, size: 2000 } })).then(function (env) {
                if (mySeq !== _polReadSeq) return;
                if (env && env.success) {
                    _polReadModel = window.KM.DB.adaptPurchaseOrderWorkspace(env.data);
                    if (rg) rg.set(_polReadModel.orders.length ? window.KM.loadState.STATES.READY : window.KM.loadState.STATES.EMPTY);
                    renderRows();
                } else {
                    _polRenderError_((env && env.errors && env.errors[0]) || { code: 'WORKSPACE_ERROR', message: 'Purchase Order workspace request failed.' });
                }
            }).catch(function (e) { if (mySeq !== _polReadSeq) return; _polRenderError_({ code: 'PO_READ_FAILED', message: String(e && e.message || e) }); });
            return;
        }
        // Legacy broad-DB path (unchanged behavior) — no silent fallback FROM Workspace mode (this branch is Legacy-only).
        _polReadModel = null;
        if (!window._opDbCache && window.KM.DB.loadOperationDb) {
            window.KM.DB.loadOperationDb({ force: true }).then(renderRows).catch(renderRows);
        } else {
            renderRows();
        }
    }
    // Fail-closed bounded region error (never a legacy full-DB render, never a "No records" empty-state).
    function _polRenderError_(err) {
        _polReadModel = null;
        var rg = _polRegion_(); if (rg) rg.set(window.KM.loadState.STATES.ERROR);
        var tbody = document.getElementById('pol-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="procurement-empty" style="color:#B91C1C;">Purchase Order read error: ' + esc((err && err.message) || 'failed') + ' [' + esc((err && err.code) || 'READ_FAILED') + ']</td></tr>';
        var meta0 = document.getElementById('pol-result-meta'); if (meta0) meta0.innerHTML = '';
        var pg0 = document.getElementById('pol-pagination'); if (pg0) pg0.style.display = 'none';
    }

    // Pagination (25 PO rows / page). Reset to 1 on filter / search / reset / date-apply / tab-switch.
    var POL_PAGE_SIZE = 25;
    var polPage = 1;
    // Active tab: 'in_production' (default) | 'ready'.
    var polTab = 'in_production';
    // Order Gantt panel — default COLLAPSED.
    var polGanttOpen = false;

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
            tbody.innerHTML = '<tr><td colspan="9" class="procurement-empty">Purchase Orders are stored in the Operation DB. Enable the cloud DB to use this page.</td></tr>';
            var meta0 = document.getElementById('pol-result-meta'); if (meta0) meta0.innerHTML = '';
            var pg0 = document.getElementById('pol-pagination'); if (pg0) pg0.style.display = 'none';
            return;
        }
        if (note) note.innerHTML = '';
        _polRefresh_();   // Workspace (canonical) or Legacy — the broad-DB load lives only in the Legacy branch.
    }

    // ── Tab classification (In Production vs Ready / Completed) ─────────────────
    // Cancelled is classified into Ready/Completed (with a cancelled badge) so it never
    // pollutes active production; it also surfaces when the Status filter picks cancelled.
    // NOTE: `draft` is intentionally NOT in either tab — this page is the PO Remaining /
    // historical overview; Draft POs live only in the Purchase Order Workspace and are
    // excluded entirely in applyFilters().
    var IN_PRODUCTION_STATUS = {
        issued: 1, supplier_confirmed: 1, confirmed: 1,
        in_production: 1, partial_completed: 1
    };
    var READY_STATUS = {
        completed: 1, partial_shipped: 1, partially_shipped: 1, shipped: 1,
        ready_to_ship: 1, closure: 1, cancelled: 1
    };
    function tabOf(status) {
        if (READY_STATUS[status]) return 'ready';
        if (IN_PRODUCTION_STATUS[status]) return 'in_production';
        return 'in_production';   // unknown/legacy → active production by default
    }

    // Build one model per PURCHASE ORDER (not per line): header + aggregated line detail.
    // buildModels() joins sku_details (category/series) and warehouses (factory name), groups
    // purchase_order_lines by purchase_order_id, and computes PO-level qty + distinct-SKU totals.
    function buildModels() {
        // F1-7C: source from the scoped Purchase Order workspace read-model when canonical; else the Legacy broad cache.
        var orders = _polReadModel ? _polReadModel.orders : (window.KM.DB.getPurchaseOrders() || []);
        var lines = _polReadModel ? _polReadModel.lines : (window.KM.DB.getPurchaseOrderLines() || []);

        var skuInfo = {};
        (_polReadModel ? _polReadModel.skuDetails : ((window.KM.DB.getSkuDetails && window.KM.DB.getSkuDetails()) || [])).forEach(function (s) {
            skuInfo[String(s.sku || '').toLowerCase()] = { category: s.category || '', series: s.series || '' };
        });
        var whName = {};
        (_polReadModel ? _polReadModel.warehouses : ((window.KM.DB.getWarehouses && window.KM.DB.getWarehouses()) || [])).forEach(function (w) {
            if (w.warehouseId) whName[String(w.warehouseId).trim().toUpperCase()] = w.warehouseName || '';
        });
        // Factory display, fallback order: (1) warehouse_name by warehouse_id, (2) warehouse_name by
        // factory_id, (3) raw factory_id, (4) raw warehouse_id, (5) '' → dash() renders '--'.
        // warehouse_id resolves to a name FIRST — never show a raw factory_id when warehouse_id maps.
        function factoryLabel(o) {
            var fid = String(o.factoryId || '').trim(), wid = String(o.warehouseId || '').trim();
            return (wid && whName[wid.toUpperCase()]) || (fid && whName[fid.toUpperCase()]) || fid || wid || '';
        }

        var linesByPo = {};
        lines.forEach(function (l) {
            var id = l.purchaseOrderId;
            if (!id) return;
            (linesByPo[id] = linesByPo[id] || []).push(l);
        });

        return orders.map(function (o) {
            var poLines = linesByPo[o.purchaseOrderId] || [];
            var distinct = {}, seriesSet = {}, catSet = {};
            var ordered = 0, completed = 0, shipped = 0, remaining = 0;
            var detail = poLines.map(function (l) {
                var info = skuInfo[String(l.sku || '').toLowerCase()] || { category: '', series: '' };
                var category = info.category || '';
                var series = l.series || info.series || '';
                // remaining_qty = available-to-ship = completed_qty − shipped_qty (clamp ≥ 0). BACKEND-OWNED: in
                // Workspace mode the DTO always supplies it (never client-derived); the max(0, completed − shipped)
                // fallback survives ONLY for old broad-cache (Legacy) rows whose persisted cell is blank (F1-7C §9).
                var rem = (_polReadModel || (l.remainingQty !== '' && l.remainingQty != null))
                    ? num(l.remainingQty) : Math.max(0, num(l.completedQty) - num(l.shippedQty));
                var sku = String(l.sku || '').trim();
                if (sku) distinct[sku.toLowerCase()] = sku;
                if (series) seriesSet[series] = 1;
                if (category) catSet[category] = 1;
                ordered += num(l.orderedQty);
                completed += num(l.completedQty);
                shipped += num(l.shippedQty);
                remaining += num(rem);
                return { l: l, category: category, series: series, remaining: rem };
            });
            var skuList = Object.keys(distinct).map(function (k) { return distinct[k]; });

            // Aggregate the SAME SKU within this PO into ONE row (qty columns summed).
            // Company split (km/resus/restw) is intentionally NOT carried here (§7.1).
            var bySku = {};
            detail.forEach(function (d) {
                var sku = String(d.l.sku || '').trim();
                var key = sku.toLowerCase() || '(blank)';
                if (!bySku[key]) bySku[key] = { sku: sku, category: d.category, series: d.series, completed: 0, shipped: 0, remaining: 0, note: '' };
                var row = bySku[key];
                row.completed += num(d.l.completedQty);
                row.shipped += num(d.l.shippedQty);
                row.remaining += num(d.remaining);
                if (!row.category && d.category) row.category = d.category;
                if (!row.series && d.series) row.series = d.series;
                if (!row.note && d.l.note) row.note = String(d.l.note).trim();
            });
            var skuRows = Object.keys(bySku).map(function (k) { return bySku[k]; });
            // Sort by Category → Series → SKU so repeated Category/Series are contiguous (row-span merge).
            skuRows.sort(function (a, b) {
                return String(a.category).localeCompare(String(b.category)) ||
                    String(a.series).localeCompare(String(b.series)) ||
                    String(a.sku).localeCompare(String(b.sku));
            });

            return {
                o: o,
                lines: detail,
                skuRows: skuRows,
                factory: factoryLabel(o),
                status: poStatus(o),
                skuList: skuList,
                skuCount: skuList.length,
                seriesList: Object.keys(seriesSet),
                categoryList: Object.keys(catSet),
                ordered: ordered, completed: completed, shipped: shipped, remaining: remaining
            };
        });
    }

    // Shared multi-select state (SKU-Details-style KM.ui.multiFilter). [] = All (no restriction);
    // multiple values within a filter = OR; across filters = AND (applyFilters). Draft Status is
    // excluded from this page regardless (applyFilters), so it is not offered as an option.
    var polFilterState = { status: [], supplier: [], category: [], series: [] };
    var POL_STATUS_OPTS = [
        { value: 'issued', label: 'Issued' }, { value: 'in_production', label: 'In Production' },
        { value: 'partial_completed', label: 'Partial Completed' }, { value: 'completed', label: 'Completed' },
        { value: 'partial_shipped', label: 'Partial Shipped' }, { value: 'shipped', label: 'Shipped' },
        { value: 'closure', label: 'Closure' }, { value: 'cancelled', label: 'Cancelled' }
    ];

    // Create-or-update ONE shared multi-select on its mount (idempotent: KM.ui.multiFilter.create reuses
    // the controller + refreshes options, dropping selections no longer in the option universe — this is
    // the cascading downstream-cleanup). onChange writes the selection array back into polFilterState and
    // re-renders through the existing render/query path (no parallel state owner, no native <select>).
    function _polMountFilter(key, label, mountId, options) {
        if (!(window.KM && window.KM.ui && window.KM.ui.multiFilter)) return;
        var mount = document.getElementById(mountId);
        if (!mount) return;
        KM.ui.multiFilter.create({
            mount: mount, filterId: mountId, label: label, options: options,
            selectedValues: polFilterState[key],
            onChange: function (vals) { polFilterState[key] = vals; polPage = 1; renderRows(); }
        });
        // Keep state in sync when setOptions pruned a now-invalid selection.
        if (mount.__kmfCtl) polFilterState[key] = mount.__kmfCtl.getSelected();
    }

    // Populate Status / Supplier / Category / Series shared multi-selects from the current PO List data
    // (option values are the raw strings; selection is preserved + pruned across reloads).
    function populateFilterOptions(models) {
        var suppliers = {}, categories = {}, series = {};
        models.forEach(function (m) {
            var sup = String(m.o.supplierName || m.o.supplierId || '').trim();
            if (sup) suppliers[sup] = 1;
            m.categoryList.forEach(function (c) { if (c) categories[c] = 1; });
            m.seriesList.forEach(function (s) { if (s) series[s] = 1; });
        });
        function sortedOpts(map) {
            return Object.keys(map).sort(function (a, b) { return a.localeCompare(b); })
                .map(function (v) { return { value: v, label: v }; });
        }
        _polMountFilter('status', 'Status', 'pol-f-status-mount', POL_STATUS_OPTS);
        _polMountFilter('supplier', 'Supplier', 'pol-f-supplier-mount', sortedOpts(suppliers));
        _polMountFilter('category', 'Category', 'pol-f-category-mount', sortedOpts(categories));
        _polMountFilter('series', 'Series', 'pol-f-series-mount', sortedOpts(series));
    }

    // Apply header + line filters (dropdowns exact-match; SKU is free-text contains).
    // Tab filtering is applied separately by the active tab.
    function applyFilters(models) {
        // Multi-select: [] = All; within a filter OR; across filters AND. (SKU stays free-text contains.)
        var fStatus = polFilterState.status, fSupplier = polFilterState.supplier,
            fCategory = polFilterState.category, fSeries = polFilterState.series;
        var fSku = val('pol-f-sku').toLowerCase();
        var fFrom = polDateState.createdFrom, fTo = polDateState.createdTo;
        return models.filter(function (m) {
            var o = m.o;
            // Draft POs never appear here (Remaining/historical overview) — they belong to the Workspace.
            if (m.status === 'draft') return false;
            if (fStatus.length && fStatus.indexOf(m.status) === -1) return false;
            if (fSupplier.length && fSupplier.indexOf(String(o.supplierName || o.supplierId || '').trim()) === -1) return false;
            if (fCategory.length && !m.categoryList.some(function (c) { return fCategory.indexOf(c) !== -1; })) return false;
            if (fSeries.length && !m.seriesList.some(function (s) { return fSeries.indexOf(s) !== -1; })) return false;
            if (fSku && m.skuList.join(' ').toLowerCase().indexOf(fSku) === -1) return false;
            var created = String(o.createdAt || '').slice(0, 10);
            if (fFrom && created && created < fFrom) return false;
            if (fTo && created && created > fTo) return false;
            return true;
        });
    }

    // PO Remaining Overview — PO groups with SKU rows VISIBLE (no expand). Repeated
    // PO / Supplier·Factory / Category / Series cells are row-span merged; same SKU inside
    // a PO is aggregated into one row (§7). Company split (KM/ResUS/ResTW) is NOT shown.
    function renderRows() {
        var tbody = document.getElementById('pol-tbody');
        if (!tbody) return;

        var models = buildModels();
        populateFilterOptions(models);

        // Filter first, then split by tab (pagination is per-tab PO groups).
        var filtered = applyFilters(models);
        var inProd = filtered.filter(function (m) { return tabOf(m.status) === 'in_production'; });
        var ready = filtered.filter(function (m) { return tabOf(m.status) === 'ready'; });
        renderTabCounts(inProd.length, ready.length);

        var rows = (polTab === 'ready' ? ready : inProd).slice();
        // Newest first by PO created_at.
        rows.sort(function (a, b) { return String(b.o.createdAt || '').localeCompare(String(a.o.createdAt || '')); });

        var meta = document.getElementById('pol-result-meta');
        var pg = document.getElementById('pol-pagination');

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="procurement-empty">No purchase orders match the filters.</td></tr>';
            if (meta) meta.innerHTML = '';
            if (pg) pg.style.display = 'none';
            renderGantt([]);
            return;
        }

        // List meta: PO count + distinct SKU + total remaining (across the active tab).
        var distinct = {}, totalRemaining = 0;
        rows.forEach(function (m) {
            m.skuList.forEach(function (s) { distinct[s.toLowerCase()] = 1; });
            totalRemaining += num(m.remaining);
        });
        if (meta) {
            meta.innerHTML = '<strong>' + rows.length + '</strong> PO' + (rows.length === 1 ? '' : 's') +
                ' · <strong>' + Object.keys(distinct).length + '</strong> SKU' + (Object.keys(distinct).length === 1 ? '' : 's') + ' (distinct)' +
                ' · <strong>' + totalRemaining.toLocaleString() + '</strong> remaining';
        }

        // Gantt renders the SAME filtered + tab set (all groups, not just the current page).
        renderGantt(rows);

        // Pagination — 25 PO GROUPS / page.
        var totalPages = Math.max(1, Math.ceil(rows.length / POL_PAGE_SIZE));
        if (polPage > totalPages) polPage = totalPages;
        var start = (polPage - 1) * POL_PAGE_SIZE;
        var pageRows = rows.slice(start, start + POL_PAGE_SIZE);

        tbody.innerHTML = pageRows.map(renderPoGroup).join('');

        if (pg) {
            if (rows.length <= POL_PAGE_SIZE) { pg.style.display = 'none'; pg.innerHTML = ''; }
            else {
                pg.style.display = '';
                var from = start + 1, to = Math.min(polPage * POL_PAGE_SIZE, rows.length);
                pg.innerHTML =
                    '<button class="pc-btn pc-btn--default" ' + (polPage <= 1 ? 'disabled' : '') + ' onclick="polGoPage(' + (polPage - 1) + ')">‹ Previous</button>' +
                    '<span class="pol-page-info">Page ' + polPage + ' of ' + totalPages + ' · showing ' + from + '–' + to + ' of ' + rows.length + ' POs</span>' +
                    '<button class="pc-btn pc-btn--default" ' + (polPage >= totalPages ? 'disabled' : '') + ' onclick="polGoPage(' + (polPage + 1) + ')">Next ›</button>';
            }
        }
    }

    // Render one PO group = a block of <tr> (one per aggregated SKU) with row-span merged
    // PO / Supplier·Factory (whole group) and Category / Series (consecutive-equal runs).
    function renderPoGroup(m) {
        var o = m.o;
        var id = o.purchaseOrderId;
        var poNo = o.poNo || o.purchaseOrderNo || id;
        var status = m.status;
        var skuRows = m.skuRows.length ? m.skuRows
            : [{ sku: '', category: '', series: '', completed: 0, shipped: 0, remaining: 0, note: '' }];
        var span = skuRows.length;

        // Category / Series run-lengths (rows are pre-sorted by category → series → sku).
        function runStart(i, key) {
            return i === 0 || skuRows[i][key] !== skuRows[i - 1][key] ||
                (key === 'series' && skuRows[i].category !== skuRows[i - 1].category);
        }
        function runLen(i, key) {
            var n = 1;
            while (i + n < skuRows.length && skuRows[i + n][key] === skuRows[i][key] &&
                (key !== 'series' || skuRows[i + n].category === skuRows[i].category)) n++;
            return n;
        }

        // PO cell (rowspan whole group): PO No link + status badge + ready date.
        // Inline min-width overrides .pol-cell--po (150px) → 112px, i.e. 25% narrower PO column.
        var poCell = '<td class="pol-cell pol-cell--po" rowspan="' + span + '" style="min-width:112px;">' +
            '<a href="#" class="pol-po-link" onclick="polOpenOverview(\'' + esc(id) + '\');return false;">' + dash(poNo) + '</a>' +
            '<span class="pol-po-badge procurement-badge procurement-badge--' + esc(status) + '">' + esc(PO_STATUS_LABEL[status] || status || '--') + '</span>' +
            '<span class="pol-secondary">Ready: ' + dateOnly(o.expectedCompletionDate) + '</span></td>';
        // Supplier / Factory cell (rowspan whole group).
        var supCell = '<td class="pol-cell" rowspan="' + span + '">' +
            '<span class="pol-primary">' + dash(o.supplierName || o.supplierId) + '</span>' +
            '<span class="pol-secondary">' + dash(m.factory) + '</span></td>';

        return skuRows.map(function (r, i) {
            var cells = '';
            if (i === 0) cells += poCell + supCell;
            if (runStart(i, 'category')) cells += '<td class="pol-cell pol-merge" rowspan="' + runLen(i, 'category') + '">' + dash(r.category) + '</td>';
            if (runStart(i, 'series')) cells += '<td class="pol-cell pol-merge" rowspan="' + runLen(i, 'series') + '">' + dash(r.series) + '</td>';
            var remCls = (num(r.remaining) <= 0) ? 'pol-rem--done' : 'pol-rem--active';
            cells += '<td class="pol-cell">' + dash(r.sku) + '</td>' +
                '<td class="pol-cell pc-num">' + num(r.completed).toLocaleString() + '</td>' +
                '<td class="pol-cell pc-num">' + num(r.shipped).toLocaleString() + '</td>' +
                '<td class="pol-cell pc-num"><span class="pol-rem ' + remCls + '">' + num(r.remaining).toLocaleString() + '</span></td>' +
                '<td class="pol-cell">' + dash(r.note) + '</td>';
            var cls = 'pol-sku-row' + (i === 0 ? ' pol-group-start' : '');
            return '<tr class="' + cls + '">' + cells + '</tr>';
        }).join('');
    }

    // ── Order Gantt (collapsible MVP) ──────────────────────────────────────────
    // X = timeline (min→max of visible POs' schedule dates); Y = PO No; one bar per PO
    // spanning inspection → expected_completion → expected_ship, with per-date ticks.
    function toMs(v) {
        var s = String(v == null ? '' : v).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
        var d = new Date(s + 'T00:00:00');
        return isNaN(d.getTime()) ? null : d.getTime();
    }
    function msToDate(ms) {
        var d = new Date(ms);
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + mm + '-' + dd;
    }
    function renderGantt(models) {
        var body = document.getElementById('pol-gantt-body');
        if (!body) return;
        if (!polGanttOpen) { return; }   // collapsed → skip render work until opened

        // Assemble lanes: each PO with ≥1 schedule date.
        var lanes = [], noSchedule = 0, gMin = null, gMax = null;
        models.forEach(function (m) {
            var o = m.o;
            var dIns = toMs(o.inspectionDate), dComp = toMs(o.expectedCompletionDate), dShip = toMs(o.expectedShipDate);
            var pts = [dIns, dComp, dShip].filter(function (x) { return x != null; });
            if (!pts.length) { noSchedule++; return; }
            var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
            if (gMin === null || lo < gMin) gMin = lo;
            if (gMax === null || hi > gMax) gMax = hi;
            lanes.push({ m: m, lo: lo, hi: hi, ins: dIns, comp: dComp, ship: dShip });
        });

        if (!lanes.length) {
            body.innerHTML = '<div class="pol-gantt-empty">No PO schedule dates (inspection / expected completion / expected ship) in the current filter' +
                (noSchedule ? ' — ' + noSchedule + ' PO' + (noSchedule === 1 ? '' : 's') + ' without dates' : '') + '.</div>';
            return;
        }
        var range = Math.max(1, gMax - gMin);
        function pct(ms) { return ((ms - gMin) / range) * 100; }

        // X-axis ticks: start · mid · end.
        var mid = gMin + range / 2;
        var axis = '<div class="pol-gantt-axis">' +
            '<span style="left:0%">' + msToDate(gMin) + '</span>' +
            '<span style="left:50%">' + msToDate(mid) + '</span>' +
            '<span style="left:100%">' + msToDate(gMax) + '</span></div>';

        var lanesHtml = lanes.map(function (ln) {
            var m = ln.m, o = m.o;
            var poNo = o.poNo || o.purchaseOrderNo || o.purchaseOrderId;
            var left = pct(ln.lo), width = Math.max(1.5, pct(ln.hi) - pct(ln.lo));
            // Tooltip: PO No · SKU list + per-SKU qty · expected completion · status.
            var skuLines = m.skuRows.map(function (r) {
                return '  ' + (r.sku || '(blank)') + ': C' + num(r.completed) + '/S' + num(r.shipped) + '/R' + num(r.remaining);
            }).join('\n');
            var tip = poNo + '\nSKUs:\n' + (skuLines || '  --') +
                '\nExpected Completion: ' + dateOnly(o.expectedCompletionDate) +
                '\nStatus: ' + (PO_STATUS_LABEL[m.status] || m.status || '--');
            function tick(ms, cls, label) {
                if (ms == null) return '';
                return '<span class="pol-gantt-tick ' + cls + '" style="left:' + pct(ms) + '%" title="' + esc(label) + '"></span>';
            }
            return '<div class="pol-gantt-lane" title="' + esc(tip) + '">' +
                '<div class="pol-gantt-label"><a href="#" class="pol-po-link" onclick="polOpenOverview(\'' + esc(o.purchaseOrderId) + '\');return false;">' + dash(poNo) + '</a></div>' +
                '<div class="pol-gantt-track">' +
                    '<div class="pol-gantt-bar pol-gantt-bar--' + esc(m.status) + '" style="left:' + left + '%;width:' + width + '%"></div>' +
                    tick(ln.ins, 'tick-ins', 'Inspection: ' + dateOnly(o.inspectionDate)) +
                    tick(ln.comp, 'tick-comp', 'Expected Completion: ' + dateOnly(o.expectedCompletionDate)) +
                    tick(ln.ship, 'tick-ship', 'Expected Ship: ' + dateOnly(o.expectedShipDate)) +
                '</div></div>';
        }).join('');

        var legend = '<div class="pol-gantt-legend">' +
            '<span><i class="tick-ins"></i>Inspection</span>' +
            '<span><i class="tick-comp"></i>Expected Completion</span>' +
            '<span><i class="tick-ship"></i>Expected Ship</span>' +
            (noSchedule ? '<span class="pol-gantt-note">' + noSchedule + ' PO' + (noSchedule === 1 ? '' : 's') + ' hidden (no dates)</span>' : '') +
            '</div>';
        body.innerHTML = legend + axis + '<div class="pol-gantt-lanes">' + lanesHtml + '</div>';
    }

    // Toggle the collapsible Gantt panel.
    function toggleGantt() {
        polGanttOpen = !polGanttOpen;
        var panel = document.getElementById('pol-gantt');
        var caret = document.getElementById('pol-gantt-caret');
        if (panel) panel.classList.toggle('is-open', polGanttOpen);
        if (caret) caret.textContent = polGanttOpen ? '▾' : '▸';
        if (polGanttOpen) renderRows();   // build lanes on first open / refresh
    }

    // Tab count badges.
    function renderTabCounts(inProd, ready) {
        var a = document.getElementById('pol-tab-count-in_production');
        var b = document.getElementById('pol-tab-count-ready');
        if (a) a.textContent = '(' + inProd + ')';
        if (b) b.textContent = '(' + ready + ')';
    }

    // Switch tab (resets to page 1).
    function setTab(tab) {
        polTab = (tab === 'ready') ? 'ready' : 'in_production';
        document.querySelectorAll('#pol-tabs .pol-tab').forEach(function (el) {
            el.classList.toggle('is-active', el.dataset.tab === polTab);
        });
        polPage = 1;
        renderRows();
    }

    // Search resets to page 1 (filters apply before pagination); pagination buttons keep the page.
    function search() { polPage = 1; renderRows(); }
    function goPage(p) { polPage = Math.max(1, p); renderRows(); }

    // View → lightweight modal listing the PO lines.
    // F1-7J-A: read-model-first (Workspace → _polReadModel; Legacy → broad getters) — same accessor pattern as
    // renderRows (lines 154-155). Opening the modal in canonical mode requires ZERO broad-DB fetch. BEFORE==AFTER:
    // the purchaseOrder adapter yields the same orders/lines arrays; no remaining_qty is computed here.
    function view(id) {
        var orders = _polReadModel ? _polReadModel.orders : (window.KM.DB.getPurchaseOrders() || []);
        var o = orders.filter(function (x) { return x.purchaseOrderId === id; })[0];
        if (!o) { alert('Purchase order not found.'); return; }
        var lines = (_polReadModel ? _polReadModel.lines : (window.KM.DB.getPurchaseOrderLines() || [])).filter(function (l) { return l.purchaseOrderId === id; });
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
        // Navigate to the PO Overview v2 page (same-DB cards). Deep-link/scroll is best-effort:
        // the card may be on another page of the Overview's own pagination.
        if (typeof showSection === 'function') showSection('purchase-order-overview');
        setTimeout(function () {
            var card = document.getElementById('po-card-' + id);
            if (card && typeof window.poToggleCard === 'function') {
                if (!card.classList.contains('is-expanded')) window.poToggleCard(id);   // v2 uses .is-expanded
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 200);
    }

    function reset() {
        // Clear the shared multi-selects (state + controllers) and the SKU free-text.
        polFilterState = { status: [], supplier: [], category: [], series: [] };
        ['pol-f-status-mount', 'pol-f-supplier-mount', 'pol-f-category-mount', 'pol-f-series-mount'].forEach(function (mid) {
            var mt = document.getElementById(mid); if (mt && mt.__kmfCtl) mt.__kmfCtl.setSelected([]);
        });
        var skuEl = document.getElementById('pol-f-sku'); if (skuEl) skuEl.value = '';
        // Clear the Date range → trigger back to "All".
        polDateState.dateRange = { start: null, end: null, preset: null };
        polDateState.createdFrom = '';
        polDateState.createdTo = '';
        polUpdateDateTriggerText();
        polPage = 1;   // filters changed → back to page 1
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
        polPage = 1;   // date filter changed → back to page 1
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

    window.polSearch = search;
    window.polGoPage = goPage;
    window.polSetTab = setTab;
    window.polToggleGantt = toggleGantt;
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
