// ========================================
// Overseas Stock Page (Warehouse Stock 子模組)
// 海外倉庫存快照頁 (3PL / FBA / Marketplace Warehouse)
// UI 完全參考 Factory Stock。資料來源:
//   overseas_inventory_snapshot, warehouses, sku_details, overseas_inventory_movements
// MVP: 只讀取現有資料 + Import Snapshot + Manual Adjustment + Movement Log。
//      不實作補貨計算、不接 Request Order、不新增公式。
// ========================================

var _overseasDbLoadTried = false;
var _overseasActiveTab = 'snapshot';
var _overseasSnapshotRendered = [];   // filtered rows currently rendered (for More Info lookup)
var _overseasSnapshotCountry = null;  // selected Snapshot country tab (null = none/show all)
var _overseasMovementSearched = false; // Movement Log renders rows only after Search is clicked

// Month list not needed here; Overseas Stock has no month columns.

// F1-7J-A3 · bounded scoped read cutover. Canonical mode sources Overseas Stock's 4 tables (overseas_inventory_snapshot,
// overseas_inventory_movements, warehouses, sku_details) from ONE bounded getTable-based scoped read
// (KM.DB.loadScopedTables) — NO whole-DB loadOperationDb, NO app-prime dependency. Kill switch:
// window.KM_SCOPED_PAGE_READS = false → Legacy. BEFORE == AFTER (same normalizers + filters). Raw overseas inventory
// stays DISTINCT from site inventory / sitePlanningAllocation / incoming (read-only transport only).
var _osReadModel = null;   // scoped read-model or null = Legacy
function _osScopedActive() {
    return typeof window !== 'undefined' && window.KM_SCOPED_PAGE_READS !== false &&
        window.KM && window.KM.DB && typeof window.KM.DB.loadScopedTables === 'function' &&
        // F1-7M-B2-HOTFIX: cache-independent cloud eligibility (cold _opDbCache==null is still scoped-active) — was
        // getDataSourceMode() === 'google-sheet', which forced the first scoped page per session onto legacy getOperationDb.
        window.KM.DB.isScopedReadEligible && window.KM.DB.isScopedReadEligible();
}
function _osGet(key) {
    if (_osReadModel) return _osReadModel[key] || [];
    var g = 'get' + key.charAt(0).toUpperCase() + key.slice(1);
    return (window.KM && window.KM.DB && window.KM.DB[g]) ? (window.KM.DB[g]() || []) : [];
}
var _OS_TABLES = ['overseas_inventory_snapshot', 'overseas_inventory_movements', 'warehouses', 'sku_details'];
// F1-7M-B5 bounded readback: an overseas write can only mutate overseas_inventory_snapshot + overseas_inventory_movements
// (proven — 05_overseas_inventory_handlers.gs writes only those; warehouses is read-only for validation, sku_details is
// not referenced at all). warehouses + sku_details are mount-loaded static reference, so re-read ONLY the two mutable
// tables and MERGE their fresh slices onto the retained model. normalizeOperationDb returns every key (empties for absent
// ones), so only the two named camelCase slices are overlaid — a blanket assign would clobber the retained static tables.
var _OS_MUTABLE_TABLES = ['overseas_inventory_snapshot', 'overseas_inventory_movements'];
function _osAfterWrite(cb) {
    if (!_osScopedActive()) { if (cb) cb(); return; }
    if (!_osReadModel) {
        window.KM.DB.loadScopedTables(_OS_TABLES).then(function (m) { _osReadModel = m; if (cb) cb(); }).catch(function () { if (cb) cb(); });
        return;
    }
    window.KM.DB.loadScopedTables(_OS_MUTABLE_TABLES)
        .then(function (m) { _osReadModel = Object.assign({}, _osReadModel, { overseasInventorySnapshot: m.overseasInventorySnapshot, overseasInventoryMovements: m.overseasInventoryMovements }); if (cb) cb(); })
        .catch(function () { if (cb) cb(); });
}

// F1-7M-D5 · bounded INITIAL_LOADING affordance in the snapshot table body while the FIRST scoped read is in flight
// (was a blank region until data). Region-scoped only; the subsequent render fully replaces the placeholder. No-op if
// the region/loadState is unavailable.
function _osShowInitialLoading_(root) {
    try {
        var el = root && root.querySelector('#overseas-snapshot-scroll-body');
        if (el && window.KM && window.KM.loadState) window.KM.loadState.bindElement(el, 'Loading overseas stock…').beginLoad(false);
    } catch (e) {}
}
function initOverseasStockPage() {
    console.log('✅ Overseas Stock: initOverseasStockPage called');
    var root = document.querySelector('#overseas-stock-section');
    if (!root) {
        console.error('❌ Overseas Stock: Section not found');
        return;
    }

    // Ensure page data is loaded once, then re-init. (Overseas Stock has no demo data layer.)
    // F1-7J-A3: canonical → bounded scoped read; Legacy kill-switch → broad loadOperationDb. Fail-closed (no broad fallback).
    if (_osScopedActive() && !_osReadModel && !_overseasDbLoadTried) {
        _overseasDbLoadTried = true;
        _osShowInitialLoading_(root);   // F1-7M-D5: bounded INITIAL_LOADING affordance instead of a blank region
        window.KM.DB.loadScopedTables(_OS_TABLES).then(function (m) { _osReadModel = m; initOverseasStockPage(); }).catch(function () { initOverseasStockPage(); });
        return;
    }
    if (!_osScopedActive() && !window._opDbCache && !_overseasDbLoadTried) {
        _overseasDbLoadTried = true;
        var loader = (window.KM && window.KM.DB && window.KM.DB.loadOperationDb)
            ? window.KM.DB.loadOperationDb
            : (window.reloadOperationDb || null);
        if (loader) {
            loader({ force: true }).then(function() { initOverseasStockPage(); }).catch(function() { initOverseasStockPage(); });
            return;
        }
    }

    var snapPanel = root.querySelector('[data-tab-panel="snapshot"]');
    var movPanel = root.querySelector('[data-tab-panel="movement"]');

    // Rebuild filter options from DB-backed data BEFORE event binding (scoped per tab panel).
    _populateOverseasFiltersFromDb(snapPanel);
    _populateOverseasMovementFiltersFromDb(movPanel);

    // Bind Snapshot tab checkbox-dropdown filters (re-render snapshot on change).
    _bindOverseasFilterControls(snapPanel, function() { renderOverseasSnapshotTable(root); });
    // Bind Movement Log tab checkbox-dropdown filters. Changing a filter requires Search again (Part B).
    _bindOverseasFilterControls(movPanel, function() { _overseasMovementSearched = false; renderOverseasMovementTable(root); });

    // Bind SKU inputs
    var skuInput = root.querySelector('#overseas-sku-input');
    if (skuInput) skuInput.oninput = function() { renderOverseasSnapshotTable(root); };
    var movSkuInput = root.querySelector('#overseas-mov-sku-input');
    if (movSkuInput) movSkuInput.oninput = function() { _overseasMovementSearched = false; renderOverseasMovementTable(root); };

    // Bind the Movement Log date-range picker (Forecast-Review-style) once + sync trigger text.
    _bindOverseasDatePicker();
    _updateOverseasMovDateTriggerText();

    // Outside click closes dropdowns
    if (root._clickHandler) document.removeEventListener('click', root._clickHandler);
    var handleOutsideClick = function(e) {
        if (!root.contains(e.target)) {
            root.querySelectorAll('.fc-dropdown-panel').forEach(function(p) { p.classList.remove('is-open'); });
        }
    };
    root._clickHandler = handleOutsideClick;
    document.addEventListener('click', handleOutsideClick);

    // Init filter texts (scoped per panel)
    ['company', 'warehouse', 'category', 'series'].forEach(function(type) { updateOverseasFilterText(type, snapPanel); });
    ['country', 'marketplace', 'warehouse', 'movementType', 'category', 'series'].forEach(function(type) { updateOverseasFilterText(type, movPanel); });

    // Build the Snapshot country tabs (Part A).
    _renderOverseasCountryTabs(root);

    // Movement Log starts empty on each mount; rows render only after Search (Part B).
    _overseasMovementSearched = false;

    // Render the active tab
    if (_overseasActiveTab === 'movement') {
        renderOverseasMovementTable(root);
    } else {
        renderOverseasSnapshotTable(root);
    }

    _bindOverseasScrollSync(root);

    // Drag-to-resize on the Overseas Inventory (snapshot) data columns — reuses the SKU Details resize
    // engine via the shared dual-layer adapter. Header cells are static, so this runs once at mount;
    // filter/pagination re-renders reuse the same handles + injected width rule.
    if (window.KM && window.KM.ui && window.KM.ui.dualLayerResize) {
        window.KM.ui.dualLayerResize.init({
            sectionId: 'overseas-stock-section',
            scrollHeaderSel: '#overseas-snapshot-scroll-header',
            scrollBodySel: '#overseas-snapshot-scroll-body',
            page: 'overseas-stock', group: 'overseas-inventory'
        });
    }
}

// container = the tab panel (snapshot or movement) so the same data-filter names don't collide.
function updateOverseasFilterText(filterType, container) {
    if (!container) container = document.querySelector('#overseas-stock-section');
    var panel = container.querySelector('.fc-dropdown-panel[data-filter="' + filterType + '"]');
    var trigger = container.querySelector('.fc-dropdown-trigger[data-filter="' + filterType + '"]');
    if (!panel || !trigger) return;
    var textSpan = trigger.querySelector('.fc-dropdown-text');
    var checked = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    var total = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
    if (checked.length === 0) textSpan.textContent = 'None';
    else if (checked.length === total.length) textSpan.textContent = 'All';
    else textSpan.textContent = checked.length + ' selected';
}

// Bind checkbox-dropdown filter controls within a container (snapshot OR movement panel).
// onChange is invoked after any filter change. Scoping by container prevents the two tabs'
// identically-named filters (category/series) from interfering.
function _bindOverseasFilterControls(container, onChange) {
    if (!container) return;
    container.querySelectorAll('.fc-dropdown-trigger').forEach(function(trigger) {
        trigger.onclick = function(e) {
            e.stopPropagation();
            var filterType = this.dataset.filter;
            var panel = container.querySelector('.fc-dropdown-panel[data-filter="' + filterType + '"]');
            container.querySelectorAll('.fc-dropdown-panel').forEach(function(p) { if (p !== panel) p.classList.remove('is-open'); });
            if (panel) panel.classList.toggle('is-open');
        };
    });
    container.querySelectorAll('.fc-dropdown-panel').forEach(function(panel) {
        panel.onclick = function(e) { e.stopPropagation(); };
        var filterType = panel.dataset.filter;
        var allCheckbox = panel.querySelector('input[value=""]');
        var otherCheckboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
        if (allCheckbox) {
            allCheckbox.onchange = function() {
                var isChecked = this.checked;
                otherCheckboxes.forEach(function(cb) { cb.checked = isChecked; });
                updateOverseasFilterText(filterType, container);
                onChange();
            };
        }
        otherCheckboxes.forEach(function(checkbox) {
            checkbox.onchange = function() {
                var checkedCount = Array.prototype.filter.call(otherCheckboxes, function(cb) { return cb.checked; }).length;
                if (allCheckbox) allCheckbox.checked = checkedCount === otherCheckboxes.length;
                updateOverseasFilterText(filterType, container);
                onChange();
            };
        });
    });
}

// Read selected values for a checkbox-dropdown filter scoped to a container.
// Returns [] when "All" is checked or every option is checked (= no filtering).
function _overseasGetFilter(container, type) {
    if (!container) return [];
    var panel = container.querySelector('.fc-dropdown-panel[data-filter="' + type + '"]');
    if (!panel) return [];
    var allCheckbox = panel.querySelector('input[value=""]');
    var otherCheckboxes = panel.querySelectorAll('input:not([value=""])');
    var checkedBoxes = Array.prototype.filter.call(otherCheckboxes, function(cb) { return cb.checked; });
    if ((allCheckbox && allCheckbox.checked) || checkedBoxes.length === otherCheckboxes.length) return [];
    return checkedBoxes.map(function(cb) { return cb.value; });
}

// ----------------------------------------------------------------------------
// Data joins
// ----------------------------------------------------------------------------
// warehouse_id convention (documentation only): WH-{COMPANY}-{COUNTRY}-{TYPE}-{NAME}
// company / country / warehouse_name / warehouse_type live ONLY on `warehouses` and are
// joined into the snapshot view by warehouse_id (NOT stored on the snapshot row).
function _overseasWarehouseMap() {
    var rows = _osGet('warehouses');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    var map = {};
    rows.forEach(function(w) {
        if (w.warehouseId) map[w.warehouseId] = w;
    });
    return map;
}

function _overseasSkuMetaMap() {
    var details = _osGet('skuDetails');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    var map = {};
    details.forEach(function(d) { if (d.sku) map[d.sku] = { category: d.category || '', series: d.series || '' }; });
    return map;
}

// Snapshot view: source of truth = overseas_inventory_snapshot ONLY.
// warehouses join → company / country / warehouse_name; sku_details join → category / series.
function _getDbOverseasSnapshotData() {
    var rows = _osGet('overseasInventorySnapshot');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    var whMap = _overseasWarehouseMap();
    var skuMeta = _overseasSkuMetaMap();
    return rows.map(function(r) {
        var wh = whMap[r.warehouseId];
        var found = !!wh;
        if (!wh) wh = {};
        var meta = skuMeta[r.sku] || { category: '', series: '' };
        return {
            snapshotId: r.snapshotId,
            sku: r.sku,
            siteSku: r.siteSku,
            // company / country / warehouse metadata come ONLY from the warehouses join (by warehouse_id).
            company: wh.company || '',
            country: wh.country || '',
            marketplace: wh.marketplace || '',
            warehouseId: r.warehouseId,
            // If warehouse_id is missing or unmatched, show "Unknown" (never crash); see warehouseFound.
            warehouseName: wh.warehouseName || (r.warehouseId ? 'Unknown' : ''),
            warehouseType: wh.warehouseType || '',
            warehouseFound: found,
            category: meta.category,
            series: meta.series,
            availableStock: Number(r.availableStock) || 0,
            reservedStock: Number(r.reservedStock) || 0,
            damagedStock: Number(r.damagedStock) || 0,
            onTheWayQty: Number(r.onTheWayQty) || 0,
            onTheWayEta: r.onTheWayEta,
            onTheWayBucket: r.onTheWayBucket,
            eventStatus: r.eventStatus,
            reorderPoint: Number(r.reorderPoint) || 0,
            overstockPoint: Number(r.overstockPoint) || 0,
            lastMovementAt: r.lastMovementAt,
            note: r.note
        };
    });
}

// MVP Warning (display-only, NOT a replenishment calculation / no projection formula).
// Derived purely from data already present on the snapshot row. Priority:
//   DAMAGED  (damaged_stock > 0)
//   OVER STOCK (overstock_point set and available_stock >= overstock_point)
//   LOW STOCK  (reorder_point set and available_stock <= reorder_point; or available_stock <= 0)
//   -          (otherwise)
// reorder_point / overstock_point are OPTIONAL snapshot columns; absent -> 0 (rule skipped).
// This is intentionally a placeholder for the future Inventory Projection Engine.
function _overseasWarning(item) {
    if (item.damagedStock > 0) return 'DAMAGED';
    if (item.overstockPoint > 0 && item.availableStock >= item.overstockPoint) return 'OVER STOCK';
    if (item.reorderPoint > 0 && item.availableStock <= item.reorderPoint) return 'LOW STOCK';
    if (item.reorderPoint <= 0 && item.availableStock <= 0) return 'LOW STOCK';
    return '-';
}

function _overseasWarningHtml(warn) {
    if (warn === 'DAMAGED') return '<span class="ovs-warn ovs-warn--damaged">DAMAGED</span>';
    if (warn === 'OVER STOCK') return '<span class="ovs-warn ovs-warn--over">OVER STOCK</span>';
    if (warn === 'LOW STOCK') return '<span class="ovs-warn ovs-warn--low">LOW STOCK</span>';
    return '<span class="ovs-warn ovs-warn--none">-</span>';
}

function _ovsEscapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ----------------------------------------------------------------------------
// Snapshot country tabs — generated from distinct joined warehouses.country.
// No hardcoded list; computed from already-loaded/joined rows (no backend per click).
// Default selects US if present, else the first country; none → empty (no tabs).
// ----------------------------------------------------------------------------
function _renderOverseasCountryTabs(root) {
    if (!root) root = document.querySelector('#overseas-stock-section');
    var container = root.querySelector('#overseas-country-tabs');
    if (!container) return;
    var countries = _overseasDistinct(_getDbOverseasSnapshotData(), 'country');

    if (countries.length === 0) {
        container.innerHTML = '';
        _overseasSnapshotCountry = null;
        return;
    }
    // Keep current selection if still valid; else default to US, else first country.
    if (!_overseasSnapshotCountry || countries.indexOf(_overseasSnapshotCountry) === -1) {
        _overseasSnapshotCountry = (countries.indexOf('US') !== -1) ? 'US' : countries[0];
    }
    container.innerHTML = countries.map(function(c) {
        var active = (c === _overseasSnapshotCountry) ? ' is-active' : '';
        return '<button type="button" class="ovs-country-tab' + active + '" data-country="' + _ovsEscapeHtml(c) + '">' + _ovsEscapeHtml(c) + '</button>';
    }).join('');
    container.querySelectorAll('.ovs-country-tab').forEach(function(btn) {
        btn.onclick = function() {
            _overseasSnapshotCountry = btn.dataset.country;
            container.querySelectorAll('.ovs-country-tab').forEach(function(b) { b.classList.toggle('is-active', b === btn); });
            renderOverseasSnapshotTable(root);
        };
    });
}

// ----------------------------------------------------------------------------
// Snapshot table render
// ----------------------------------------------------------------------------
function renderOverseasSnapshotTable(root) {
    if (!root) root = document.querySelector('#overseas-stock-section');
    var fixedBody = root.querySelector('#overseas-snapshot-fixed-body');
    var scrollBody = root.querySelector('#overseas-snapshot-scroll-body');
    if (!fixedBody || !scrollBody) { console.error('❌ Overseas Stock: snapshot DOM not found'); return; }

    var data = _getDbOverseasSnapshotData();
    if (!data || data.length === 0) {
        _overseasSnapshotRendered = [];
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8">尚未連接資料來源</div>';
        return;
    }

    // Scope filter reads to the snapshot panel (movement panel shares some data-filter names).
    var snapPanel = root.querySelector('[data-tab-panel="snapshot"]') || root;
    var filters = {
        company: _overseasGetFilter(snapPanel, 'company'),
        warehouse: _overseasGetFilter(snapPanel, 'warehouse'),
        category: _overseasGetFilter(snapPanel, 'category'),
        series: _overseasGetFilter(snapPanel, 'series'),
        sku: (root.querySelector('#overseas-sku-input') && root.querySelector('#overseas-sku-input').value.toLowerCase()) || ''
    };

    var filtered = data.filter(function(item) {
        // Selected country tab (combined with the other filters). Null = no country selected (show all).
        if (_overseasSnapshotCountry && item.country !== _overseasSnapshotCountry) return false;
        if (filters.company.length > 0 && filters.company.indexOf(item.company) === -1) return false;
        if (filters.warehouse.length > 0 && filters.warehouse.indexOf(item.warehouseName) === -1) return false;
        if (filters.category.length > 0 && filters.category.indexOf(item.category) === -1) return false;
        if (filters.series.length > 0 && filters.series.indexOf(item.series) === -1) return false;
        if (filters.sku && item.sku.toLowerCase().indexOf(filters.sku) === -1) return false;
        return true;
    });

    _overseasSnapshotRendered = filtered;

    if (filtered.length === 0) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8">No data found</div>';
        return;
    }

    fixedBody.innerHTML = filtered.map(function(item) { return '<div class="fixed-row">' + _ovsEscapeHtml(item.sku) + '</div>'; }).join('');
    scrollBody.innerHTML = filtered.map(function(item, idx) {
        var warn = _overseasWarning(item);
        return '<div class="scroll-row">' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(item.company) + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(item.country) + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(item.category) + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(item.series) + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(item.warehouseName) + '</div>' +
            '<div class="scroll-cell scroll-cell--num">' + item.availableStock.toLocaleString() + '</div>' +
            '<div class="scroll-cell scroll-cell--num">' + item.reservedStock.toLocaleString() + '</div>' +
            '<div class="scroll-cell scroll-cell--num">' + item.damagedStock.toLocaleString() + '</div>' +
            '<div class="scroll-cell scroll-cell--num">' + item.onTheWayQty.toLocaleString() + '</div>' +
            '<div class="scroll-cell">' + _overseasWarningHtml(warn) + '</div>' +
            '<div class="scroll-cell"><button type="button" class="ovs-info-btn" onclick="openOverseasInfo(' + idx + ')">More Info</button></div>' +
            '</div>';
    }).join('');
}

// ----------------------------------------------------------------------------
// Movement Log table render
// ----------------------------------------------------------------------------
// Movement view: source of truth = overseas_inventory_movements ONLY.
// warehouses join (by warehouse_id) → country / marketplace / warehouse_name;
// sku_details join (by sku) → category / series. None of these are stored on the movement row.
function _getDbOverseasMovementData() {
    var rows = _osGet('overseasInventoryMovements');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    var whMap = _overseasWarehouseMap();
    var skuMeta = _overseasSkuMetaMap();
    return rows.map(function(m) {
        var wh = whMap[m.warehouseId] || {};
        var meta = skuMeta[m.sku] || { category: '', series: '' };
        return {
            sku: m.sku,
            warehouseId: m.warehouseId,
            warehouseName: wh.warehouseName || '',
            country: wh.country || '',
            marketplace: wh.marketplace || '',
            category: meta.category,
            series: meta.series,
            movementType: m.movementType,
            fromStockType: m.fromStockType || '',
            toStockType: m.toStockType || '',
            quantity: Number(m.quantity) || 0,
            quantityBefore: Number(m.quantityBefore) || 0,
            quantityAfter: Number(m.quantityAfter) || 0,
            referenceType: m.referenceType,
            referenceId: m.referenceId,
            createdBy: m.createdBy,
            createdAt: m.createdAt,
            movementDate: m.movementDate,
            reason: m.reason,
            note: m.note
        };
    });
}

function renderOverseasMovementTable(root) {
    if (!root) root = document.querySelector('#overseas-stock-section');
    var fixedBody = root.querySelector('#overseas-movement-fixed-body');
    var scrollBody = root.querySelector('#overseas-movement-scroll-body');
    if (!fixedBody || !scrollBody) { console.error('❌ Overseas Stock: movement DOM not found'); return; }

    // Search-gated (Part B): no rows until the user clicks Search.
    if (!_overseasMovementSearched) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8">Please select filters and click Search to view movement logs.</div>';
        return;
    }

    var data = _getDbOverseasMovementData();
    if (!data || data.length === 0) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8">尚未連接資料來源</div>';
        return;
    }

    // Read filters scoped to the movement panel.
    var movPanel = root.querySelector('[data-tab-panel="movement"]') || root;
    // Applied date range (inclusive, yyyy-MM-dd strings). Null/empty = no date filtering ("All dates").
    var startStr = _ovsMovDate.start ? _ovsFormatDate(_ovsMovDate.start) : '';
    var endStr = _ovsMovDate.end ? _ovsFormatDate(_ovsMovDate.end) : '';
    var filters = {
        country: _overseasGetFilter(movPanel, 'country'),
        marketplace: _overseasGetFilter(movPanel, 'marketplace'),
        warehouse: _overseasGetFilter(movPanel, 'warehouse'),
        movementType: _overseasGetFilter(movPanel, 'movementType'),
        category: _overseasGetFilter(movPanel, 'category'),
        series: _overseasGetFilter(movPanel, 'series'),
        sku: (root.querySelector('#overseas-mov-sku-input') && root.querySelector('#overseas-mov-sku-input').value.toLowerCase()) || ''
    };

    var filtered = data.filter(function(m) {
        if (startStr || endStr) {
            // Use movement_date when available, otherwise created_at.
            var rowDate = m.movementDate || m.createdAt || '';
            if (!rowDate) return false;
            if (startStr && rowDate < startStr) return false;
            if (endStr && rowDate > endStr) return false;
        }
        if (filters.country.length > 0 && filters.country.indexOf(m.country) === -1) return false;
        if (filters.marketplace.length > 0 && filters.marketplace.indexOf(m.marketplace) === -1) return false;
        if (filters.warehouse.length > 0 && filters.warehouse.indexOf(m.warehouseName) === -1) return false;
        if (filters.movementType.length > 0 && filters.movementType.indexOf(m.movementType) === -1) return false;
        if (filters.category.length > 0 && filters.category.indexOf(m.category) === -1) return false;
        if (filters.series.length > 0 && filters.series.indexOf(m.series) === -1) return false;
        if (filters.sku && String(m.sku).toLowerCase().indexOf(filters.sku) === -1) return false;
        return true;
    });

    // Most-recent first by created_at / movement_date (string compare on yyyy-MM-dd is fine).
    var sorted = filtered.slice().sort(function(a, b) {
        var ka = (a.createdAt || a.movementDate || ''), kb = (b.createdAt || b.movementDate || '');
        return ka < kb ? 1 : (ka > kb ? -1 : 0);
    });

    if (sorted.length === 0) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8">No data found</div>';
        return;
    }

    fixedBody.innerHTML = sorted.map(function(m) { return '<div class="fixed-row">' + _ovsEscapeHtml(m.sku) + '</div>'; }).join('');
    scrollBody.innerHTML = sorted.map(function(m) {
        var whName = m.warehouseName || m.warehouseId;
        return '<div class="scroll-row">' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(whName) + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(m.movementType) + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(m.fromStockType || '—') + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(m.toStockType || '—') + '</div>' +
            '<div class="scroll-cell scroll-cell--num">' + _ovsSignedQty(m.quantity) + '</div>' +
            '<div class="scroll-cell scroll-cell--num">' + (Number(m.quantityBefore) || 0).toLocaleString() + '</div>' +
            '<div class="scroll-cell scroll-cell--num">' + (Number(m.quantityAfter) || 0).toLocaleString() + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(m.referenceType) + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(m.referenceId) + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(m.createdBy) + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(m.createdAt || m.movementDate) + '</div>' +
            '<div class="scroll-cell">' + _ovsEscapeHtml(m.reason ? ('[' + m.reason + '] ' + (m.note || '')) : m.note) + '</div>' +
            '</div>';
    }).join('');
}

// ----------------------------------------------------------------------------
// Filter option population (Demo OFF / DB source)
// ----------------------------------------------------------------------------
// Shared option-rebuild helper: distinct non-empty values → checkbox dropdown (All + options).
// Demo OFF with no rows → only the "All" entry (no fake/hardcoded values).
function _overseasRebuildFilterPanel(container, filterType, values) {
    if (!container) return;
    var panel = container.querySelector('.fc-dropdown-panel[data-filter="' + filterType + '"]');
    if (!panel) return;
    var html = '<label class="fc-checkbox-item"><input type="checkbox" value="" checked> <strong>All</strong></label>';
    values.forEach(function(v) {
        html += '<label class="fc-checkbox-item"><input type="checkbox" value="' + _ovsEscapeHtml(v) + '" checked> ' + _ovsEscapeHtml(v) + '</label>';
    });
    panel.innerHTML = html;
}

function _overseasDistinct(data, key) {
    var arr = [];
    data.forEach(function(d) { var v = String(d[key] || '').trim(); if (v && arr.indexOf(v) === -1) arr.push(v); });
    arr.sort();
    return arr;
}

// Snapshot tab filter options (Company / Warehouse / Category / Series) from joined snapshot data.
function _populateOverseasFiltersFromDb(container) {
    if (!container) container = document.querySelector('[data-tab-panel="snapshot"]');
    if (!container) return;
    var data = _getDbOverseasSnapshotData();
    _overseasRebuildFilterPanel(container, 'company', _overseasDistinct(data, 'company'));
    _overseasRebuildFilterPanel(container, 'warehouse', _overseasDistinct(data, 'warehouseName'));
    _overseasRebuildFilterPanel(container, 'category', _overseasDistinct(data, 'category'));
    _overseasRebuildFilterPanel(container, 'series', _overseasDistinct(data, 'series'));
}

// Movement Log tab filter options (Country / Marketplace / Category / Series) from joined movement data.
// All distinct values come from REAL joined DB rows; no hardcoded options. Empty DB → only "All".
function _populateOverseasMovementFiltersFromDb(container) {
    if (!container) container = document.querySelector('[data-tab-panel="movement"]');
    if (!container) return;
    var data = _getDbOverseasMovementData();
    _overseasRebuildFilterPanel(container, 'country', _overseasDistinct(data, 'country'));
    _overseasRebuildFilterPanel(container, 'marketplace', _overseasDistinct(data, 'marketplace'));
    _overseasRebuildFilterPanel(container, 'warehouse', _overseasDistinct(data, 'warehouseName'));
    _overseasRebuildFilterPanel(container, 'movementType', _overseasDistinct(data, 'movementType'));
    _overseasRebuildFilterPanel(container, 'category', _overseasDistinct(data, 'category'));
    _overseasRebuildFilterPanel(container, 'series', _overseasDistinct(data, 'series'));
}

// After a DB write (import / adjustment) the filter universe may change. Repopulating a panel
// replaces its checkbox nodes, so we MUST re-bind change handlers afterwards. Resets selections
// to "All" (refreshed universe) for both tabs.
function _refreshOverseasFilters(root) {
    if (!root) root = document.querySelector('#overseas-stock-section');
    var snapPanel = root.querySelector('[data-tab-panel="snapshot"]');
    var movPanel = root.querySelector('[data-tab-panel="movement"]');
    _populateOverseasFiltersFromDb(snapPanel);
    _populateOverseasMovementFiltersFromDb(movPanel);
    _bindOverseasFilterControls(snapPanel, function() { renderOverseasSnapshotTable(root); });
    // Movement filter changes require pressing Search again (Part B).
    _bindOverseasFilterControls(movPanel, function() { _overseasMovementSearched = false; renderOverseasMovementTable(root); });
    ['company', 'warehouse', 'category', 'series'].forEach(function(t) { updateOverseasFilterText(t, snapPanel); });
    ['country', 'marketplace', 'category', 'series'].forEach(function(t) { updateOverseasFilterText(t, movPanel); });
    _renderOverseasCountryTabs(root);
}

// ----------------------------------------------------------------------------
// Tabs
// ----------------------------------------------------------------------------
function switchOverseasTab(tab) {
    _overseasActiveTab = tab;
    var root = document.querySelector('#overseas-stock-section');
    if (!root) return;
    root.querySelectorAll('.ovs-tab').forEach(function(b) { b.classList.toggle('is-active', b.dataset.tab === tab); });
    root.querySelectorAll('.ovs-tab-panel').forEach(function(p) { p.style.display = (p.dataset.tabPanel === tab) ? '' : 'none'; });
    if (tab === 'movement') renderOverseasMovementTable(root);
    else renderOverseasSnapshotTable(root);
    _bindOverseasScrollSync(root);
}

// Header/body horizontal scroll sync for whichever tab is visible.
function _bindOverseasScrollSync(root) {
    if (!root) root = document.querySelector('#overseas-stock-section');
    setTimeout(function() {
        root.querySelectorAll('.ovs-tab-panel').forEach(function(panel) {
            if (panel.style.display === 'none') return;
            var scrollCol = panel.querySelector('.scroll-col');
            var scrollHeader = panel.querySelector('.scroll-header');
            if (scrollCol && scrollHeader) {
                if (scrollCol._syncHandler) scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
                scrollCol._syncHandler = function() { scrollHeader.style.transform = 'translateX(-' + scrollCol.scrollLeft + 'px)'; };
                scrollCol.addEventListener('scroll', scrollCol._syncHandler);
            }
        });
    }, 50);
}

// ----------------------------------------------------------------------------
// Modal controller
// ----------------------------------------------------------------------------
function _showOverseasModal(id) {
    var root = document.querySelector('#overseas-stock-section');
    if (!root) return;
    var overlay = root.querySelector('#overseas-modal-overlay');
    if (overlay) overlay.classList.add('is-open');
    root.querySelectorAll('.ovs-modal').forEach(function(m) { m.classList.toggle('is-open', m.id === id); });
}

function closeOverseasModals() {
    var root = document.querySelector('#overseas-stock-section');
    if (!root) return;
    var overlay = root.querySelector('#overseas-modal-overlay');
    if (overlay) overlay.classList.remove('is-open');
    root.querySelectorAll('.ovs-modal').forEach(function(m) { m.classList.remove('is-open'); });
}

// ----------------------------------------------------------------------------
// More Info modal
// ----------------------------------------------------------------------------
function openOverseasInfo(idx) {
    var item = _overseasSnapshotRendered[idx];
    if (!item) return;
    var body = document.getElementById('overseas-info-body');
    if (!body) return;
    var row = function(label, val) {
        return '<div class="ovs-info-label">' + _ovsEscapeHtml(label) + '</div>' +
               '<div class="ovs-info-value">' + _ovsEscapeHtml(val == null || val === '' ? '—' : val) + '</div>';
    };
    // Warn when the snapshot row's warehouse_id has no matching warehouses row (metadata can't be joined).
    var warnHtml = '';
    if (!item.warehouseFound) {
        warnHtml = '<div style="color:#b45309;background:#fef3c7;border-radius:6px;padding:6px 10px;font-size:12px;margin-bottom:10px;">' +
            '⚠ ' + (item.warehouseId ? ('warehouse_id "' + _ovsEscapeHtml(item.warehouseId) + '" not found in warehouses — company/country unavailable.') : 'This row has no warehouse_id.') +
            '</div>';
    }
    body.innerHTML = warnHtml + '<div class="ovs-info-grid">' +
        row('SKU', item.sku) +
        row('Company', item.company) +
        row('Country', item.country) +
        row('Warehouse Name', item.warehouseName) +
        row('Warehouse ID', item.warehouseId) +
        row('Site SKU', item.siteSku) +
        row('On The Way ETA', item.onTheWayEta) +
        row('On The Way Bucket', item.onTheWayBucket) +
        row('Shipment Status', item.eventStatus) +
        row('Last Movement At', item.lastMovementAt) +
        row('Note', item.note) +
        '</div>';
    _showOverseasModal('overseas-info-modal');
}

// ----------------------------------------------------------------------------
// Import Overseas Inventory Snapshot (mirror Import FC / Import SKU UX)
// ----------------------------------------------------------------------------
var OVERSEAS_IMPORT_HEADERS = ['warehouse_id', 'sku', 'available_stock', 'reserved_stock', 'damaged_stock', 'on_the_way_qty', 'on_the_way_eta', 'note'];
var OVERSEAS_QTY_FIELDS = ['available_stock', 'reserved_stock', 'damaged_stock', 'on_the_way_qty'];

// ===== F1-UX-OVERSEAS-INVENTORY-SCOPED-IMPORT-R1 — relationally-filtered import scope (Company/Country/Warehouse) =====
// Company / Country / Warehouse come ONLY from the canonical `warehouses` master (active, NON-factory = Overseas/3PL).
// The three selectors relationally constrain one another; a valid scope gates BOTH the scoped template download and the
// file import. `warehouse_id` is the sole identity authority; company/country are resolved from it (never inferred).
// The server re-validates the scope + every row — this frontend filtering is UX only.
var _ovsImportScope = { company: '', country: '', warehouseId: '' };

function _ovsEligibleWarehouses() {
    return (_osGet('warehouses') || [])
        .filter(function (w) { return w && w.warehouseId && w.isFactoryWarehouse !== true && w.isActive !== false; });
}
function _ovsWhById(id) { var t = String(id || '').trim(); return _ovsEligibleWarehouses().filter(function (w) { return String(w.warehouseId).trim() === t; })[0] || null; }
function _ovsWhCompany(w) { return String((w && w.company) || '').trim(); }
function _ovsWhCountry(w) { return String((w && w.country) || '').trim(); }
function _ovsDistinctSorted(arr) { var seen = {}, out = []; (arr || []).forEach(function (v) { v = String(v || '').trim(); if (v && !seen[v]) { seen[v] = 1; out.push(v); } }); return out.sort(); }

// Relational option sets: companies constrained by the current COUNTRY; countries by the current COMPANY; warehouses by BOTH.
function _ovsScopeOptions() {
    var whs = _ovsEligibleWarehouses(), sc = _ovsImportScope;
    var companies = _ovsDistinctSorted(whs.filter(function (w) { return !sc.country || _ovsWhCountry(w) === sc.country; }).map(_ovsWhCompany));
    var countries = _ovsDistinctSorted(whs.filter(function (w) { return !sc.company || _ovsWhCompany(w) === sc.company; }).map(_ovsWhCountry));
    var warehouses = whs.filter(function (w) { return (!sc.company || _ovsWhCompany(w) === sc.company) && (!sc.country || _ovsWhCountry(w) === sc.country); });
    return { companies: companies, countries: countries, warehouses: warehouses };
}
function _ovsImportScopeValid() {
    var sc = _ovsImportScope;
    if (!sc.company || !sc.country || !sc.warehouseId) return false;
    var w = _ovsWhById(sc.warehouseId);
    return !!(w && _ovsWhCompany(w) === sc.company && _ovsWhCountry(w) === sc.country);
}
function _ovsSanitizeFilePart_(s) { return String(s || '').trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'NA'; }

function onOverseasImportScopeChange(kind, value) {
    var sc = _ovsImportScope;
    value = String(value == null ? '' : value).trim();
    if (kind === 'warehouse') {
        sc.warehouseId = value;
        var w = _ovsWhById(value);
        if (w) { sc.company = _ovsWhCompany(w); sc.country = _ovsWhCountry(w); }   // converge company/country to the warehouse
    } else if (kind === 'company') { sc.company = value; }
    else if (kind === 'country') { sc.country = value; }
    // prune impossible combinations
    if (sc.warehouseId) {
        var cw = _ovsWhById(sc.warehouseId);
        if (!cw || (sc.company && _ovsWhCompany(cw) !== sc.company) || (sc.country && _ovsWhCountry(cw) !== sc.country)) sc.warehouseId = '';
    }
    if (sc.company && sc.country) {
        var any = _ovsEligibleWarehouses().some(function (w2) { return _ovsWhCompany(w2) === sc.company && _ovsWhCountry(w2) === sc.country; });
        if (!any) { if (kind === 'company') sc.country = ''; else if (kind === 'country') sc.company = ''; }
    }
    _ovsClearImportFile_();   // switching scope invalidates any file prepared for the previous warehouse context
    _ovsRenderImportScope();
}

function _ovsRenderImportScope() {
    var opts = _ovsScopeOptions(), sc = _ovsImportScope;
    function fill(id, values, selected, placeholder) {
        var el = document.getElementById(id); if (!el) return;
        el.innerHTML = '<option value="">' + placeholder + '</option>' +
            values.map(function (v) { return '<option value="' + _ovsEscapeHtml(v) + '"' + (v === selected ? ' selected' : '') + '>' + _ovsEscapeHtml(v) + '</option>'; }).join('');
        el.value = selected || '';
    }
    fill('overseas-import-company', opts.companies, sc.company, opts.companies.length ? 'Select company…' : 'No eligible warehouses');
    fill('overseas-import-country', opts.countries, sc.country, opts.countries.length ? 'Select country…' : '—');
    var whEl = document.getElementById('overseas-import-warehouse');
    if (whEl) {
        whEl.innerHTML = '<option value="">' + (opts.warehouses.length ? 'Select warehouse…' : 'No eligible warehouses') + '</option>' +
            opts.warehouses.map(function (w) { var label = (w.warehouseName ? w.warehouseName + ' — ' : '') + w.warehouseId; return '<option value="' + _ovsEscapeHtml(w.warehouseId) + '"' + (w.warehouseId === sc.warehouseId ? ' selected' : '') + '>' + _ovsEscapeHtml(label) + '</option>'; }).join('');
        whEl.value = sc.warehouseId || '';
    }
    var valid = _ovsImportScopeValid();
    var readout = document.getElementById('overseas-import-scope-readout');
    if (readout) {
        if (valid) {
            var vw = _ovsWhById(sc.warehouseId);
            readout.style.display = 'block';
            readout.innerHTML = '<strong>Import Scope</strong> — Company: <strong>' + _ovsEscapeHtml(sc.company) + '</strong> · Country: <strong>' + _ovsEscapeHtml(sc.country) + '</strong> · Warehouse: <strong>' + _ovsEscapeHtml((vw && vw.warehouseName ? vw.warehouseName + ' / ' : '') + sc.warehouseId) + '</strong>';
        } else { readout.style.display = 'none'; readout.innerHTML = ''; }
    }
    var link = document.getElementById('overseas-import-template-link');
    if (link) { link.style.opacity = valid ? '1' : '0.45'; link.style.pointerEvents = valid ? '' : 'none'; link.setAttribute('aria-disabled', valid ? 'false' : 'true'); }
    var fileEl = document.getElementById('overseas-import-file');
    if (fileEl) fileEl.disabled = !valid;
    var runBtn = document.getElementById('overseas-import-run-btn');
    if (runBtn) runBtn.disabled = !valid || !(fileEl && fileEl.files && fileEl.files.length) || runBtn.dataset.mode === 'done';
}
function _ovsClearImportFile_() {
    var fileEl = document.getElementById('overseas-import-file'); if (fileEl) fileEl.value = '';
    var resultEl = document.getElementById('overseas-import-result'); if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    var runBtn = document.getElementById('overseas-import-run-btn'); if (runBtn) { runBtn.textContent = 'Import'; runBtn.dataset.mode = ''; }
}

function openOverseasImportModal() {
    _ovsImportScope = { company: '', country: '', warehouseId: '' };
    _ovsClearImportFile_();
    _ovsRenderImportScope();
    _showOverseasModal('overseas-import-modal');
}

// F1-INVENTORY-IMPORT-WAREHOUSE-SAFETY-R1 — warehouse identity hardening. The template is now an .xlsx built by the
// shared generic builder (KM.templateExport) with warehouse_id as a DROPDOWN restricted to canonical ACTIVE,
// NON-FACTORY (Overseas/3PL) warehouses — the SAME is_active + is_factory_warehouse fields the server re-validates —
// so an admin can never free-type an arbitrary / Factory / inactive warehouse identity into the snapshot import.
// warehouse_id is the sole canonical identity (no free-text warehouse column). Legacy .csv is still ACCEPTED on
// import (backward compatible) but is never the generated format. Falls back to the safe .csv template only if the
// ExcelJS engine is unavailable (still dropdown-less, but the server validation is the authoritative gate).
function downloadOverseasImportTemplate() {
    // F1-UX-OVERSEAS-INVENTORY-SCOPED-IMPORT-R1: the template is SCOPED to the selected warehouse. Only a valid
    // Company/Country/Warehouse context produces a template; warehouse_id is fixed to the selected one (single-value
    // dropdown + prefilled example row). The user never determines company/country/warehouse_name.
    if (!_ovsImportScopeValid()) { alert('Select Company, Country and Warehouse first.'); return; }
    var sc = _ovsImportScope;
    var selWh = _ovsWhById(sc.warehouseId);
    var whName = (selWh && selWh.warehouseName) || sc.warehouseId;
    var fnamePart = _ovsSanitizeFilePart_(sc.company) + '_' + _ovsSanitizeFilePart_(sc.country) + '_' + _ovsSanitizeFilePart_(sc.warehouseId);
    if (!(window.KM && window.KM.templateExport && window.KM.templateExport.buildAndDownload)) { _downloadOverseasCsvTemplateFallback_(sc.warehouseId, fnamePart); return; }
    var skus = (_osGet('skuDetails') || []).map(function (s) { return s.sku; }).filter(Boolean);
    var columns = [
        { key: 'warehouse_id', header: 'warehouse_id', kind: 'business', width: 26, comment: 'REQUIRED. Prefilled with the selected warehouse (' + sc.warehouseId + '). Do NOT change — one file = one warehouse; the server rejects any other warehouse_id.', dropdown: [sc.warehouseId] },
        { key: 'sku', header: 'sku', kind: 'business', width: 22, comment: 'REQUIRED. Canonical SKU.' },
        { key: 'available_stock', header: 'available_stock', kind: 'business', width: 14, comment: 'Number >= 0 (decimals round UP). Blank = 0.' },
        { key: 'reserved_stock', header: 'reserved_stock', kind: 'business', width: 14, comment: 'Number >= 0. Blank = 0.' },
        { key: 'damaged_stock', header: 'damaged_stock', kind: 'business', width: 14, comment: 'Number >= 0. Blank = 0.' },
        { key: 'on_the_way_qty', header: 'on_the_way_qty', kind: 'business', width: 14, comment: 'Number >= 0. Blank = 0.' },
        { key: 'on_the_way_eta', header: 'on_the_way_eta', kind: 'business', width: 16, comment: 'Optional ISO date YYYY-MM-DD.' },
        { key: 'note', header: 'note', kind: 'business', width: 30, comment: 'Optional note.' }
    ];
    var spec = {
        filename: 'Overseas_Inventory_' + fnamePart + '_Import_Template.xlsx',
        sheetName: 'Overseas Inventory Import',
        instructionRow: 'This import updates ONE overseas warehouse only — Company: ' + sc.company + ' · Country: ' + sc.country + ' · Warehouse: ' + whName + ' (' + sc.warehouseId + '). warehouse_id is prefilled; do not mix warehouses. Imported quantities BECOME the current snapshot for warehouse_id + sku. The server rejects any other / Factory / inactive / unknown warehouse.',
        masterTemplate: true,
        columns: columns,
        exampleRow: { warehouse_id: sc.warehouseId, sku: (skus[0] || 'SAMPLE-SKU'), available_stock: 0, reserved_stock: 0, damaged_stock: 0, on_the_way_qty: 0, on_the_way_eta: '', note: '' },
        system: { template_id: 'overseas_inventory_import', template_name: 'Overseas Inventory Snapshot Import', template_version: '3', module: 'overseas_inventory', export_mode: 'import', source_system: 'operation-system', scope_company: sc.company, scope_country: sc.country, scope_warehouse_id: sc.warehouseId }
    };
    window.KM.templateExport.buildAndDownload(spec).catch(function (err) { alert('Template download failed: ' + (err && err.message ? err.message : err)); });
}
// Safe .csv fallback ONLY when ExcelJS is unavailable — prefilled with the SELECTED scoped warehouse_id, never arbitrary.
function _downloadOverseasCsvTemplateFallback_(exampleWhId, fnamePart) {
    var csv = OVERSEAS_IMPORT_HEADERS.join(',') + '\n' + (exampleWhId + ',SAMPLE-SKU,0,0,0,0,,') + '\n';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'Overseas_Inventory_' + (fnamePart || 'Import') + '_Template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Quote / escaped-quote / CRLF aware CSV parser.
function _parseOverseasCsv(text) {
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

function _ovsRenderImportError(message) {
    var box = document.getElementById('overseas-import-result');
    if (!box) { alert(message); return; }
    box.style.display = 'block';
    box.innerHTML = '<div style="color:#dc2626;font-weight:600;">Error: ' + _ovsEscapeHtml(message) + '</div>';
}

function _ovsRenderImportResult(data) {
    var box = document.getElementById('overseas-import-result');
    if (!box) return;
    var s = data.summary || { total: 0, created: 0, updated: 0, skipped: 0, error: 0 };
    var results = data.results || [];
    var html = '<div style="font-weight:600;display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">' +
        '<span>Total: ' + s.total + '</span>' +
        '<span style="color:#16a34a;">Created: ' + s.created + '</span>' +
        '<span style="color:#0080bb;">Updated: ' + s.updated + '</span>' +
        '<span style="color:#d97706;">Skipped: ' + s.skipped + '</span>' +
        '<span style="color:#dc2626;">Error: ' + s.error + '</span></div>';
    html += results.map(function(rr) {
        var color = rr.status === 'created' ? '#16a34a' : rr.status === 'updated' ? '#0080bb' : rr.status === 'skipped' ? '#d97706' : '#dc2626';
        return '<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #f1f5f9;">' +
            '<span style="font-weight:600;min-width:64px;color:' + color + ';">' + _ovsEscapeHtml(rr.status) + '</span>' +
            '<span>#' + _ovsEscapeHtml(String(rr.rowIndex)) + '</span>' +
            '<span>' + _ovsEscapeHtml(rr.sku || '') + '</span>' +
            '<span>' + _ovsEscapeHtml(rr.message || '') + '</span></div>';
    }).join('');
    box.style.display = 'block';
    box.innerHTML = html;
}

// Read a .csv file into the CSV-shaped `cells` 2D array (Promise).
function _parseOverseasCsvFile(file) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('Could not read the selected file.')); };
        reader.onload = function (e) { try { resolve(_parseOverseasCsv(e.target.result)); } catch (err) { reject(new Error('Failed to parse CSV: ' + (err && err.message ? err.message : err))); } };
        reader.readAsText(file);
    });
}
// ExcelJS cell → plain trimmed text (formula → computed result; rich text flattened; Date → ISO date).
function _ovsCellText(cell) {
    var v = cell ? cell.value : null;
    if (v == null) return '';
    if (typeof v === 'object') {
        if (v.result != null) return String(v.result);
        if (v.text != null) return String(v.text);
        if (Array.isArray(v.richText)) return v.richText.map(function (t) { return t.text; }).join('');
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return '';
    }
    return String(v);
}
function _ovsXlsxRowValues(row) {
    var out = [];
    var n = row && row.cellCount ? row.cellCount : (row && row.actualCellCount ? row.actualCellCount : 0);
    var last = Math.max(n, (row && row._cells ? row._cells.length : 0), 32);
    for (var c = 1; c <= last; c++) out.push(_ovsCellText(row.getCell(c)).trim());
    return out;
}
// Parse a KM.templateExport .xlsx into the same `cells` 2D array [headerRow, ...dataRows] the CSV path produces —
// skipping the hidden _SYSTEM sheet, the pre-header instruction row(s), the example row (row_type='example'), blanks.
function _parseOverseasXlsx(file) {
    return new Promise(function (resolve, reject) {
        if (!(window.ExcelJS && window.ExcelJS.Workbook)) { reject(new Error('XLSX engine (ExcelJS) not loaded. Use the .csv template instead.')); return; }
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('Could not read the selected file.')); };
        reader.onload = function () {
            var wb = new window.ExcelJS.Workbook();
            wb.xlsx.load(reader.result).then(function () {
                var ws = null;
                wb.eachSheet(function (sheet) { if (!ws && String(sheet.name) !== '_SYSTEM') ws = sheet; });
                if (!ws) { reject(new Error('No worksheet found in the workbook.')); return; }
                var headerRowIdx = -1, headers = [];
                for (var r = 1; r <= Math.min(ws.rowCount, 12); r++) {
                    var lc = _ovsXlsxRowValues(ws.getRow(r)).map(function (v) { return String(v).trim().toLowerCase(); });
                    if (lc.indexOf('warehouse_id') >= 0 && lc.indexOf('sku') >= 0) { headerRowIdx = r; headers = lc; break; }
                }
                if (headerRowIdx < 0) { reject(new Error('Header row (warehouse_id, sku) not found in the workbook.')); return; }
                while (headers.length && headers[headers.length - 1] === '') headers.pop();
                var rowTypeIdx = headers.indexOf('row_type');
                var cells = [headers];
                for (var rr = headerRowIdx + 1; rr <= ws.rowCount; rr++) {
                    var vals = _ovsXlsxRowValues(ws.getRow(rr));
                    if (!vals.length || vals.every(function (c) { return String(c).trim() === ''; })) continue;
                    if (rowTypeIdx >= 0 && String(vals[rowTypeIdx] || '').trim().toLowerCase() === 'example') continue;
                    cells.push(vals);
                }
                resolve(cells);
            }).catch(function (e) { reject(new Error('Could not parse the workbook: ' + (e && e.message ? e.message : e))); });
        };
        reader.readAsArrayBuffer(file);
    });
}

function runOverseasImport() {
    var runBtn = document.getElementById('overseas-import-run-btn');
    if (runBtn && runBtn.dataset.mode === 'done') { closeOverseasModals(); return; }

    if (!_ovsImportScopeValid()) { alert('Select a valid Company / Country / Warehouse scope first.'); return; }
    var fileEl = document.getElementById('overseas-import-file');
    if (!fileEl || !fileEl.files || !fileEl.files.length) { alert('Please choose an .xlsx or .csv file first.'); return; }
    if (!(window.KM && window.KM.DB && window.KM.DB.importOverseasInventorySnapshotBatch)) { alert('Import API is not available.'); return; }

    var file = fileEl.files[0];
    var name = String(file.name || '').toLowerCase();
    var isXlsx = /\.xlsx$/.test(name), isCsv = /\.csv$/.test(name);
    if (!isXlsx && !isCsv) { _ovsRenderImportError('Unsupported file type. Use .xlsx or .csv.'); return; }
    (isXlsx ? _parseOverseasXlsx(file) : _parseOverseasCsvFile(file))
        .then(function (cells) { _ovsProcessImportCells(cells, runBtn); })
        .catch(function (err) { _ovsRenderImportError((err && err.message) ? err.message : 'Could not read the file.'); });
}

// Shared row extraction + backend call (fed by either the .xlsx or .csv parser). warehouse_id identity is
// re-validated on the server (active + non-factory); this client pass only does field/number shape checks.
function _ovsProcessImportCells(cells, runBtn) {
        if (!cells || cells.length < 2) { _ovsRenderImportError('No data rows found (need a header row + at least one data row).'); return; }
        var headers = cells[0].map(function(h) { return String(h == null ? '' : h).trim().toLowerCase(); });
        var idxOf = {};
        OVERSEAS_IMPORT_HEADERS.forEach(function(h) { idxOf[h] = headers.indexOf(h); });
        if (idxOf['warehouse_id'] === -1) { _ovsRenderImportError('File is missing the required "warehouse_id" header.'); return; }
        if (idxOf['sku'] === -1) { _ovsRenderImportError('File is missing the required "sku" header.'); return; }

        var rows = [];
        var clientErrors = [];
        var dataRowNum = 0;
        var NUMERIC_RE = /^\d+(\.\d+)?$/;
        for (var r = 1; r < cells.length; r++) {
            var raw = cells[r];
            var allEmpty = raw.every(function(v) { return String(v == null ? '' : v).trim() === ''; });
            if (allEmpty) continue;
            dataRowNum++;
            var warehouseId = String(raw[idxOf['warehouse_id']] == null ? '' : raw[idxOf['warehouse_id']]).trim();
            var sku = String(raw[idxOf['sku']] == null ? '' : raw[idxOf['sku']]).trim();
            var qtyObj = {};
            var badQty = null;
            for (var qi = 0; qi < OVERSEAS_QTY_FIELDS.length; qi++) {
                var f = OVERSEAS_QTY_FIELDS[qi];
                var ci = idxOf[f];
                var v = ci === -1 ? '' : String(raw[ci] == null ? '' : raw[ci]).trim();
                if (v === '') { qtyObj[f] = 0; continue; }
                if (!NUMERIC_RE.test(v)) { badQty = { col: f, val: v }; break; }
                qtyObj[f] = Math.ceil(parseFloat(v)); // round up to whole units
            }
            if (badQty) {
                clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'Invalid (number >= 0 required): ' + badQty.col + '="' + badQty.val + '"' });
                continue;
            }
            if (!warehouseId) { clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'warehouse_id is required' }); continue; }
            if (!sku) { clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'sku is required' }); continue; }
            var obj = { warehouse_id: warehouseId, sku: sku };
            OVERSEAS_QTY_FIELDS.forEach(function(f) { obj[f] = qtyObj[f]; });
            obj.on_the_way_eta = idxOf['on_the_way_eta'] === -1 ? '' : String(raw[idxOf['on_the_way_eta']] == null ? '' : raw[idxOf['on_the_way_eta']]).trim();
            obj.note = idxOf['note'] === -1 ? '' : String(raw[idxOf['note']] == null ? '' : raw[idxOf['note']]).trim();
            rows.push(obj);
        }

        if (rows.length === 0 && clientErrors.length === 0) { _ovsRenderImportError('No data rows found.'); return; }
        if (rows.length === 0) {
            _ovsRenderImportResult({ summary: { total: clientErrors.length, created: 0, updated: 0, skipped: 0, error: clientErrors.length }, results: clientErrors });
            return;
        }

        if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Importing...'; }
        // F1-UX-OVERSEAS-INVENTORY-SCOPED-IMPORT-R1: carry the SELECTED context; the server re-validates the scope +
        // every row against the canonical warehouses master (frontend filtering is UX only).
        var _ovsScope = { company: _ovsImportScope.company, country: _ovsImportScope.country, warehouse_id: _ovsImportScope.warehouseId };
        window.KM.DB.importOverseasInventorySnapshotBatch(rows, { createdBy: 'operation-system', scope: _ovsScope })
            .then(function(result) {
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
                if (!result || result.success === false) {
                    _ovsRenderImportError(result && result.error ? result.error : 'Import failed. API may not be configured.');
                    return;
                }
                var d = result.data || {};
                var s = d.summary || { total: 0, created: 0, updated: 0, skipped: 0, error: 0 };
                var mergedSummary = {
                    total: (s.total || 0) + clientErrors.length,
                    created: s.created || 0,
                    updated: s.updated || 0,
                    skipped: s.skipped || 0,
                    error: (s.error || 0) + clientErrors.length
                };
                var mergedResults = clientErrors.concat(d.results || []);
                _ovsRenderImportResult({ summary: mergedSummary, results: mergedResults });
                // Wrapper already reloaded the DB cache on success — refresh filters + re-render tables.
                var root = document.querySelector('#overseas-stock-section');
                // F1-7J-A3: canonical → scoped re-read before re-render (writer refreshed the broad cache the page no longer reads).
                _osAfterWrite(function () {
                    _refreshOverseasFilters(root);
                    renderOverseasSnapshotTable(root);
                    renderOverseasMovementTable(root);
                });
                if (mergedSummary.error === 0 && runBtn) { runBtn.textContent = 'Done'; runBtn.dataset.mode = 'done'; }
            })
            .catch(function(err) {
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
                _ovsRenderImportError(err && err.message ? err.message : 'Import request failed.');
            });
}

// ----------------------------------------------------------------------------
// Inventory Adjustment (renamed 2026-07-23 from "Manual Adjustment")
// Select ONE snapshot record, set the NEW Available quantity, add a required Reason/Note.
// Only available_stock is adjusted (reserved / physical / damaged / on-the-way untouched).
// Confirm -> KM.DB.adjustOverseasInventory (backend atomic snapshot + movement write) -> re-GET.
// NOT an inline edit; a unique record must be selected first.
// ----------------------------------------------------------------------------
var _overseasAdjustRecords = [];
var _overseasAdjustSelected = null;
var _overseasAdjustSubmitting = false;

// Signed quantity display: +N for increases, -N for decreases (Movement Log requirement, Part G).
function _ovsSignedQty(n) {
    var v = Number(n) || 0;
    return (v > 0 ? '+' : '') + v.toLocaleString();
}

function openOverseasAdjustModal() {
    // Records = real snapshot rows (must already exist). Each option is a unique warehouse_id + sku pair.
    _overseasAdjustRecords = _getDbOverseasSnapshotData() || [];
    var sel = document.getElementById('overseas-adjust-record');
    if (sel) {
        var opts = ['<option value="">Select SKU / Warehouse…</option>'];
        _overseasAdjustRecords.forEach(function(rec, i) {
            var label = rec.sku + ' — ' + (rec.warehouseName || rec.warehouseId || '?') +
                (rec.company ? ' (' + rec.company + (rec.country ? '/' + rec.country : '') + ')' : '');
            opts.push('<option value="' + i + '">' + _ovsEscapeHtml(label) + '</option>');
        });
        sel.innerHTML = opts.join('');
    }
    _overseasAdjustSelected = null;
    _overseasAdjustSubmitting = false;
    ['overseas-adjust-sku', 'overseas-adjust-sitesku', 'overseas-adjust-wh-name', 'overseas-adjust-company', 'overseas-adjust-country', 'overseas-adjust-current', 'overseas-adjust-delta']
        .forEach(function(id) { var el = document.getElementById(id); if (el) el.textContent = '—'; });
    var newEl = document.getElementById('overseas-adjust-new'); if (newEl) { newEl.value = ''; newEl.disabled = true; }
    var noteEl = document.getElementById('overseas-adjust-note'); if (noteEl) noteEl.value = '';
    var refEl = document.getElementById('overseas-adjust-reference'); if (refEl) refEl.value = '';
    var preview = document.getElementById('overseas-adjust-preview'); if (preview) { preview.hidden = true; preview.innerHTML = ''; }
    var resultEl = document.getElementById('overseas-adjust-result');
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    var runBtn = document.getElementById('overseas-adjust-run-btn');
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Confirm Adjustment'; }
    _showOverseasModal('overseas-adjust-modal');
}

function onOverseasAdjustRecordChange() {
    var sel = document.getElementById('overseas-adjust-record');
    var idx = sel ? parseInt(sel.value, 10) : NaN;
    var rec = (!isNaN(idx) && _overseasAdjustRecords[idx]) ? _overseasAdjustRecords[idx] : null;
    _overseasAdjustSelected = rec;
    var set = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = (v == null || v === '') ? '—' : v; };
    var newEl = document.getElementById('overseas-adjust-new');
    if (!rec) {
        ['overseas-adjust-sku', 'overseas-adjust-sitesku', 'overseas-adjust-wh-name', 'overseas-adjust-company', 'overseas-adjust-country', 'overseas-adjust-current', 'overseas-adjust-delta']
            .forEach(function(id) { set(id, '—'); });
        if (newEl) { newEl.value = ''; newEl.disabled = true; }
        _overseasAdjustUpdateValidity();
        return;
    }
    set('overseas-adjust-sku', rec.sku);
    set('overseas-adjust-sitesku', rec.siteSku || '—');
    set('overseas-adjust-wh-name', rec.warehouseName || rec.warehouseId || '—');
    set('overseas-adjust-company', rec.company || '—');
    set('overseas-adjust-country', rec.country || '—');
    set('overseas-adjust-current', Number(rec.availableStock || 0).toLocaleString());
    set('overseas-adjust-delta', '—');
    if (newEl) { newEl.disabled = false; newEl.value = ''; newEl.focus(); }
    onOverseasAdjustQtyInput();
}

// Parse New Available. { ok, value } | { ok:false, empty } | { ok:false, invalid }
function _overseasAdjustNewValue() {
    var el = document.getElementById('overseas-adjust-new');
    var raw = el ? String(el.value).trim() : '';
    if (raw === '') return { ok: false, empty: true };
    if (!/^\d+$/.test(raw)) return { ok: false, invalid: true };   // integer >= 0 only
    return { ok: true, value: parseInt(raw, 10) };
}

function onOverseasAdjustQtyInput() {
    var rec = _overseasAdjustSelected;
    var deltaEl = document.getElementById('overseas-adjust-delta');
    var preview = document.getElementById('overseas-adjust-preview');
    if (!rec) { if (deltaEl) deltaEl.textContent = '—'; if (preview) preview.hidden = true; _overseasAdjustUpdateValidity(); return; }
    var cur = Number(rec.availableStock || 0);
    var nv = _overseasAdjustNewValue();
    if (nv.ok) {
        var delta = nv.value - cur;
        if (deltaEl) deltaEl.textContent = _ovsSignedQty(delta);
        // Preview "Current Available → New Available" before Confirm (Part D rule 4).
        if (preview) { preview.hidden = false; preview.innerHTML = 'Available: <strong>' + cur.toLocaleString() + '</strong> &rarr; <strong>' + nv.value.toLocaleString() + '</strong> (' + _ovsSignedQty(delta) + ')'; }
    } else {
        if (deltaEl) deltaEl.textContent = '—';
        if (preview) { preview.hidden = true; preview.innerHTML = ''; }
    }
    _overseasAdjustUpdateValidity();
}

function _overseasAdjustUpdateValidity() {
    var btn = document.getElementById('overseas-adjust-run-btn');
    if (!btn) return;
    var rec = _overseasAdjustSelected;
    var nv = _overseasAdjustNewValue();
    var noteEl = document.getElementById('overseas-adjust-note');
    var noteOk = noteEl && String(noteEl.value).trim() !== '';
    var valid = !!rec && nv.ok && nv.value !== Number(rec.availableStock || 0) && noteOk && !_overseasAdjustSubmitting;
    btn.disabled = !valid;
}

function _ovsRenderAdjustResult(html, isError) {
    var box = document.getElementById('overseas-adjust-result');
    if (!box) { if (isError) alert(html); return; }
    box.style.display = 'block';
    box.innerHTML = isError ? ('<div style="color:#dc2626;font-weight:600;">Error: ' + _ovsEscapeHtml(html) + '</div>') : html;
}

function runOverseasAdjust() {
    if (_overseasAdjustSubmitting) return;              // double-submit guard (Part D rule 5)
    var rec = _overseasAdjustSelected;
    var nv = _overseasAdjustNewValue();
    var noteEl = document.getElementById('overseas-adjust-note');
    var note = noteEl ? String(noteEl.value).trim() : '';
    var refEl = document.getElementById('overseas-adjust-reference');
    var reference = refEl ? String(refEl.value).trim() : '';

    if (!rec) { _ovsRenderAdjustResult('Please select a stock record.', true); return; }
    if (nv.empty) { _ovsRenderAdjustResult('New Available is required.', true); return; }
    if (nv.invalid) { _ovsRenderAdjustResult('New Available must be a whole number ≥ 0.', true); return; }
    if (nv.value === Number(rec.availableStock || 0)) { _ovsRenderAdjustResult('New Available equals Current Available; nothing to adjust.', true); return; }
    if (!note) { _ovsRenderAdjustResult('Reason / Note is required.', true); return; }
    if (!(window.KM && window.KM.DB && window.KM.DB.adjustOverseasInventory)) { _ovsRenderAdjustResult('Adjustment API is not available.', true); return; }

    _overseasAdjustSubmitting = true;
    var runBtn = document.getElementById('overseas-adjust-run-btn');
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Applying…'; }

    window.KM.DB.adjustOverseasInventory({
        warehouse_id: rec.warehouseId,
        sku: rec.sku,
        new_available: nv.value,
        note: note,
        reference_id: reference,
        created_by: 'operation-system'          // Phase 1 runtime identity; not user-entered
    }).then(function(result) {
        _overseasAdjustSubmitting = false;
        if (!result || result.success === false) {
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Confirm Adjustment'; }
            _ovsRenderAdjustResult(result && result.error ? result.error : 'Adjustment failed. API may not be configured.', true);
            return;
        }
        var d = result.data || {};
        _ovsRenderAdjustResult(
            '<div style="color:#16a34a;font-weight:600;margin-bottom:4px;">Adjustment applied.</div>' +
            '<div>Movement: ' + _ovsEscapeHtml(d.movement_id || '') + '</div>' +
            '<div>Reference: ' + _ovsEscapeHtml(d.reference_id || '') + '</div>' +
            '<div>Available: ' + _ovsEscapeHtml(String(d.before_available)) + ' &rarr; ' + _ovsEscapeHtml(String(d.after_available)) + ' (' + _ovsSignedQty(d.quantity) + ')</div>',
            false
        );
        if (runBtn) { runBtn.textContent = 'Done'; }
        // F1-7J-A3: canonical → scoped re-read before re-render (writer refreshed the broad cache the page no longer reads).
        var root = document.querySelector('#overseas-stock-section');
        _osAfterWrite(function () {
            _refreshOverseasFilters(root);
            renderOverseasSnapshotTable(root);
            if (_overseasActiveTab === 'movement') { _overseasMovementSearched = true; renderOverseasMovementTable(root); }
        });
    }).catch(function(err) {
        _overseasAdjustSubmitting = false;
        if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Confirm Adjustment'; }
        _ovsRenderAdjustResult(err && err.message ? err.message : 'Adjustment request failed.', true);
    });
}

// ----------------------------------------------------------------------------
// Movement Log Date Range Picker
// Same UX/style as Forecast Review, but a SELF-CONTAINED duplicate: own state,
// own functions, own ovs-date-* DOM ids/classes. Forecast Review code is never called
// or modified. Default = no range ("All dates") to preserve prior show-all behavior.
// ----------------------------------------------------------------------------
var _ovsMovDate = { start: null, end: null, preset: null };       // applied range
var _ovsMovDateTemp = { start: null, end: null, preset: null };   // pending range (in modal)
var _ovsMovCalMonths = { start: new Date(), end: new Date() };
var _ovsDatePickerBound = false;

var OVS_PRESET_LABELS = {
    'today': 'Today', 'yesterday': 'Yesterday',
    'last-7-days': 'Last 7 days', 'last-30-days': 'Last 30 days',
    'last-60-days': 'Last 60 days', 'last-90-days': 'Last 90 days',
    'last-month': 'Last month', 'last-2-months': 'Last 2 months',
    'last-3-months': 'Last 3 months', 'last-year': 'Last year'
};

function _ovsFormatDate(date) {
    if (!date) return '';
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

function _ovsSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Bind the picker controls once (DOM is static in index.html).
function _bindOverseasDatePicker() {
    if (_ovsDatePickerBound) return;
    var modal = document.getElementById('ovsDateModal');
    var backdrop = document.getElementById('ovsDateBackdrop');
    if (!modal || !backdrop) return;

    var cancelBtn = document.getElementById('ovsDateCancel');
    var clearBtn = document.getElementById('ovsDateClear');
    var applyBtn = document.getElementById('ovsDateApply');
    if (cancelBtn) cancelBtn.onclick = function() { closeOverseasMovDateModal(); };
    if (applyBtn) applyBtn.onclick = function() { _applyOverseasMovDate(); };
    if (clearBtn) clearBtn.onclick = function() { _clearOverseasMovDate(); };
    backdrop.onclick = function() { closeOverseasMovDateModal(); };

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) closeOverseasMovDateModal();
    });

    var sidebar = document.querySelector('#overseas-stock-section .ovs-date-sidebar');
    if (sidebar) {
        sidebar.querySelectorAll('.ovs-preset-item').forEach(function(item) {
            item.onclick = function() { _overseasPresetClick(item.dataset.preset); };
        });
    }
    modal.querySelectorAll('.ovs-calendar-nav').forEach(function(btn) {
        btn.onclick = function() { _overseasCalendarNav(btn.dataset.nav); };
    });

    _ovsDatePickerBound = true;
    _updateOverseasMovDateTriggerText();
}

function openOverseasMovDateModal() {
    var modal = document.getElementById('ovsDateModal');
    var backdrop = document.getElementById('ovsDateBackdrop');
    if (!modal || !backdrop) return;
    // Copy applied range to temp (Cancel discards edits).
    _ovsMovDateTemp = { start: _ovsMovDate.start, end: _ovsMovDate.end, preset: _ovsMovDate.preset };
    _ovsMovCalMonths.start = _ovsMovDate.start ? new Date(_ovsMovDate.start) : new Date();
    _ovsMovCalMonths.end = _ovsMovDate.end ? new Date(_ovsMovDate.end) : new Date();
    backdrop.classList.add('is-open');
    modal.classList.add('is-open');
    _updateOverseasMovDateInputs();
    _updateOverseasPresetHighlight();
    _renderOverseasCalendars();
}

function closeOverseasMovDateModal() {
    var modal = document.getElementById('ovsDateModal');
    var backdrop = document.getElementById('ovsDateBackdrop');
    if (modal) modal.classList.remove('is-open');
    if (backdrop) backdrop.classList.remove('is-open');
}

function _applyOverseasMovDate() {
    _ovsMovDate = { start: _ovsMovDateTemp.start, end: _ovsMovDateTemp.end, preset: _ovsMovDateTemp.preset };
    _updateOverseasMovDateTriggerText();
    closeOverseasMovDateModal();
    // Changing the date requires pressing Search again (Part B consistency).
    _overseasMovementSearched = false;
    renderOverseasMovementTable();
}

// Clear → reset to "All dates" (no range). Still requires Search to re-render rows.
function _clearOverseasMovDate() {
    _ovsMovDate = { start: null, end: null, preset: null };
    _ovsMovDateTemp = { start: null, end: null, preset: null };
    _updateOverseasMovDateTriggerText();
    _updateOverseasPresetHighlight();
    closeOverseasMovDateModal();
    _overseasMovementSearched = false;
    renderOverseasMovementTable();
}

// Part B: Search button — render Movement Log rows for the current filters.
function runOverseasMovementSearch() {
    _overseasMovementSearched = true;
    renderOverseasMovementTable();
    _bindOverseasScrollSync(document.querySelector('#overseas-stock-section'));
}

function _updateOverseasMovDateTriggerText() {
    var span = document.getElementById('overseas-mov-date-text');
    if (!span) return;
    if (_ovsMovDate.preset) {
        span.textContent = OVS_PRESET_LABELS[_ovsMovDate.preset] || 'Custom range';
    } else if (_ovsMovDate.start && _ovsMovDate.end) {
        span.textContent = _ovsFormatDate(_ovsMovDate.start) + ' ~ ' + _ovsFormatDate(_ovsMovDate.end);
    } else {
        span.textContent = 'All dates';
    }
}

function _overseasPresetClick(preset) {
    var today = new Date();
    var start = new Date();
    var end = new Date(today);
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
    _ovsMovDateTemp.start = start;
    _ovsMovDateTemp.end = end;
    _ovsMovDateTemp.preset = preset;
    _ovsMovCalMonths.start = new Date(start);
    _ovsMovCalMonths.end = new Date(end);
    _updateOverseasMovDateInputs();
    _updateOverseasPresetHighlight();
    _renderOverseasCalendars();
}

function _updateOverseasPresetHighlight() {
    document.querySelectorAll('#overseas-stock-section .ovs-preset-item').forEach(function(item) {
        item.classList.toggle('is-active', item.dataset.preset === _ovsMovDateTemp.preset);
    });
}

function _updateOverseasMovDateInputs() {
    var s = document.getElementById('ovsStartDisplay');
    var e = document.getElementById('ovsEndDisplay');
    if (s) s.value = _ovsFormatDate(_ovsMovDateTemp.start);
    if (e) e.value = _ovsFormatDate(_ovsMovDateTemp.end);
}

function _overseasCalendarNav(nav) {
    switch (nav) {
        case 'prev-start': _ovsMovCalMonths.start.setMonth(_ovsMovCalMonths.start.getMonth() - 1); break;
        case 'next-start': _ovsMovCalMonths.start.setMonth(_ovsMovCalMonths.start.getMonth() + 1); break;
        case 'prev-end': _ovsMovCalMonths.end.setMonth(_ovsMovCalMonths.end.getMonth() - 1); break;
        case 'next-end': _ovsMovCalMonths.end.setMonth(_ovsMovCalMonths.end.getMonth() + 1); break;
    }
    _renderOverseasCalendars();
}

function _renderOverseasCalendars() {
    _renderOverseasCalendar('start');
    _renderOverseasCalendar('end');
}

function _renderOverseasCalendar(type) {
    var month = _ovsMovCalMonths[type];
    var cap = type.charAt(0).toUpperCase() + type.slice(1);
    var titleEl = document.getElementById('ovsCalendar' + cap + 'Title');
    var bodyEl = document.getElementById('ovsCalendar' + cap + 'Body');
    if (!titleEl || !bodyEl) return;

    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    titleEl.textContent = monthNames[month.getMonth()] + ' ' + month.getFullYear();

    var lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    var startDayOfWeek = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    var html = '';
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(function(d) { html += '<div class="ovs-calendar-weekday">' + d + '</div>'; });
    for (var i = 0; i < startDayOfWeek; i++) html += '<div class="ovs-calendar-day is-disabled"></div>';

    var start = _ovsMovDateTemp.start, end = _ovsMovDateTemp.end, todayD = new Date();
    for (var day = 1; day <= lastDay.getDate(); day++) {
        var date = new Date(month.getFullYear(), month.getMonth(), day);
        var classes = ['ovs-calendar-day'];
        if (start && _ovsSameDay(date, start)) classes.push('is-start');
        if (end && _ovsSameDay(date, end)) classes.push('is-end');
        if (start && end && date > start && date < end) classes.push('is-in-range');
        if (_ovsSameDay(date, todayD)) classes.push('is-today');
        html += '<div class="' + classes.join(' ') + '" data-date="' + date.toISOString() + '" data-type="' + type + '">' + day + '</div>';
    }
    bodyEl.innerHTML = html;
    bodyEl.querySelectorAll('.ovs-calendar-day:not(.is-disabled)').forEach(function(dayEl) {
        dayEl.onclick = function() { _overseasDayClick(new Date(dayEl.dataset.date), dayEl.dataset.type); };
    });
}

function _overseasDayClick(date, calType) {
    var start = _ovsMovDateTemp.start, end = _ovsMovDateTemp.end;
    if (calType === 'start') {
        if (end && date > end) { _ovsMovDateTemp.start = end; _ovsMovDateTemp.end = date; }
        else { _ovsMovDateTemp.start = date; }
    } else {
        if (start && date < start) { _ovsMovDateTemp.end = start; _ovsMovDateTemp.start = date; }
        else { _ovsMovDateTemp.end = date; }
    }
    _ovsMovDateTemp.preset = null;
    _updateOverseasMovDateInputs();
    _updateOverseasPresetHighlight();
    _renderOverseasCalendars();
}

// ----------------------------------------------------------------------------
// Exports
// ----------------------------------------------------------------------------
window.openOverseasMovDateModal = openOverseasMovDateModal;
window.closeOverseasMovDateModal = closeOverseasMovDateModal;
window.runOverseasMovementSearch = runOverseasMovementSearch;
window.initOverseasStockPage = initOverseasStockPage;
window.renderOverseasSnapshotTable = renderOverseasSnapshotTable;
window.renderOverseasMovementTable = renderOverseasMovementTable;
window.switchOverseasTab = switchOverseasTab;
window.openOverseasInfo = openOverseasInfo;
window.closeOverseasModals = closeOverseasModals;
window.openOverseasImportModal = openOverseasImportModal;
window.downloadOverseasImportTemplate = downloadOverseasImportTemplate;
window.runOverseasImport = runOverseasImport;
window.onOverseasImportScopeChange = onOverseasImportScopeChange;   // F1-UX scoped import selectors (inline onchange)
window._ovsRenderImportScope = _ovsRenderImportScope;               // file-input onchange re-evaluates the Import gate
window.openOverseasAdjustModal = openOverseasAdjustModal;
window.onOverseasAdjustRecordChange = onOverseasAdjustRecordChange;
window.onOverseasAdjustQtyInput = onOverseasAdjustQtyInput;
window.runOverseasAdjust = runOverseasAdjust;

// ----------------------------------------------------------------------------
// Lifecycle 註冊
// ----------------------------------------------------------------------------
// Ensure the Overseas Stock markup is present before initialization (Phase 3-3).
// Idempotent: if #overseas-stock-section already exists, resolves immediately (no re-fetch, no
// duplicate). Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureOverseasStockMarkup() {
    if (document.getElementById('overseas-stock-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('overseas-stock', 'assets/html/pages/overseas-stock.html', '#overseas-stock-mount')
            .then(function() {
                if (!document.getElementById('overseas-stock-section')) {
                    console.warn('[OverseasStock] partial loaded but #overseas-stock-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[OverseasStock] failed to load partial:', err);
                return false;
            });
    }
    console.warn('[OverseasStock] KM.partialLoader unavailable; markup not loaded.');
    return Promise.resolve(false);
}

if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('overseas-stock-section', {
        mount: function() {
            console.log('[OverseasStock] mount');
            // Markup is partial-loaded (Phase 3-3). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open) and init.
            _ensureOverseasStockMarkup().then(function() {
                var sec = document.getElementById('overseas-stock-section');
                if (sec) sec.classList.add('active');
                if (window.initOverseasStockPage) window.initOverseasStockPage();
            });
        },
        unmount: function() {
            console.log('[OverseasStock] unmount');
            var root = document.querySelector('#overseas-stock-section');
            if (root) {
                root.querySelectorAll('.scroll-col').forEach(function(scrollCol) {
                    if (scrollCol._syncHandler) scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
                });
                if (root._clickHandler) document.removeEventListener('click', root._clickHandler);
                closeOverseasModals();
            }
        }
    });
}
