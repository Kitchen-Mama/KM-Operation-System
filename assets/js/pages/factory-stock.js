// Factory Stock篩選器功能

var _factoryDbLoadTried = false;

// F1-7J-A3 · bounded scoped read cutover. Canonical mode sources Factory Stock's 4 tables (factory_stock,
// factory_stock_movements, sku_details, warehouses) from ONE bounded getTable-based scoped read (KM.DB.loadScopedTables)
// — NO whole-DB loadOperationDb, NO app-prime dependency. Kill switch: window.KM_SCOPED_PAGE_READS = false → Legacy.
// BEFORE == AFTER: the scoped object is _opDbCache-shaped (same normalizers + filters), so _fsGet(key) equals the broad
// getter. Factory Stock stays NOT company-owned (shared-factory pool summed as-is; no factory→company inference); no
// Factory Stock initialization semantics change (read-only transport).
var _fsReadModel = null;   // scoped read-model or null = Legacy
function _fsScopedActive() {
    return typeof window !== 'undefined' && window.KM_SCOPED_PAGE_READS !== false &&
        window.KM && window.KM.DB && typeof window.KM.DB.loadScopedTables === 'function' &&
        // F1-7M-B2-HOTFIX: cache-independent cloud eligibility (cold _opDbCache==null is still scoped-active) — was
        // getDataSourceMode() === 'google-sheet', which forced the first scoped page per session onto legacy getOperationDb.
        window.KM.DB.isScopedReadEligible && window.KM.DB.isScopedReadEligible();
}
function _fsGet(key) {
    if (_fsReadModel) return _fsReadModel[key] || [];
    var g = 'get' + key.charAt(0).toUpperCase() + key.slice(1);
    return (window.KM && window.KM.DB && window.KM.DB[g]) ? (window.KM.DB[g]() || []) : [];
}
// Post-write reconcile: canonical → scoped re-read (the writer refreshed the broad cache the page no longer reads);
// Legacy → run cb immediately (writer already reloaded the broad cache). Writer payloads/side effects are UNCHANGED.
// F1-7M-B4 bounded readback: a factory write can only mutate factory_stock + factory_stock_movements (proven — the
// sole setValue/appendRow targets in 21_factory_inventory_handlers.gs). sku_details and warehouses are static reference
// the write CANNOT modify and are already held in _fsReadModel from mount, so re-read ONLY the two mutable tables and
// MERGE their fresh slices onto the retained model instead of re-fetching all four. normalizeOperationDb returns EVERY
// table key (empties for absent ones), so only the two named camelCase slices are overlaid — a blanket assign would
// clobber the retained skuDetails/warehouses with []. Fallback: model not yet primed (no mount load) → full 4-table
// read (unchanged behavior). Server stays authoritative for the mutable facts; no local mutation, no stale-fact cache.
// F1-7M-D5 · paint a bounded INITIAL_LOADING affordance into the table body while the FIRST scoped read is in flight
// (was a blank region until data). Region-scoped only (never a whole-app mask); the subsequent render fully replaces the
// placeholder (READY/EMPTY). Reuses the shared KM.loadState contract. No-op if the region/loadState is unavailable.
function _fsShowInitialLoading_(root) {
    try {
        var el = root && root.querySelector('#factory-stock-scroll-body');
        if (el && window.KM && window.KM.loadState) window.KM.loadState.bindElement(el, 'Loading factory stock…').beginLoad(false);
    } catch (e) {}
}
function _fsAfterWrite(cb) {
    if (!_fsScopedActive()) { if (cb) cb(); return; }
    if (!_fsReadModel) {
        window.KM.DB.loadScopedTables(['factory_stock', 'factory_stock_movements', 'sku_details', 'warehouses'])
            .then(function (m) { _fsReadModel = m; if (cb) cb(); })
            .catch(function () { if (cb) cb(); });
        return;
    }
    window.KM.DB.loadScopedTables(['factory_stock', 'factory_stock_movements'])
        .then(function (m) { _fsReadModel = Object.assign({}, _fsReadModel, { factoryStock: m.factoryStock, factoryStockMovements: m.factoryStockMovements }); if (cb) cb(); })
        .catch(function () { if (cb) cb(); });
}

function initFactoryStockPage() {
    console.log('✅ Factory Stock: initFactoryStockPage called');
    const root = document.querySelector('#factory-stock-section');
    if (!root) {
        console.error('❌ Factory Stock: Section not found');
        return;
    }

    var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();

    // Demo OFF: ensure the page data is loaded once, then re-init.
    // F1-7J-A3: canonical → bounded scoped read (factory_stock + movements + sku_details + warehouses); Legacy kill-switch
    // → broad loadOperationDb. Fail-closed: on scoped-read failure re-init WITHOUT a broad fallback (renders empty/bounded).
    if (!demoOn && _fsScopedActive() && !_fsReadModel && !_factoryDbLoadTried) {
        _factoryDbLoadTried = true;
        _fsShowInitialLoading_(root);   // F1-7M-D5: bounded INITIAL_LOADING affordance instead of a blank region
        window.KM.DB.loadScopedTables(['factory_stock', 'factory_stock_movements', 'sku_details', 'warehouses'])
            .then(function (m) { _fsReadModel = m; initFactoryStockPage(); })
            .catch(function () { initFactoryStockPage(); });
        return;
    }
    if (!demoOn && !_fsScopedActive() && !window._opDbCache && !_factoryDbLoadTried) {
        _factoryDbLoadTried = true;
        var loader = (window.KM && window.KM.DB && window.KM.DB.loadOperationDb)
            ? window.KM.DB.loadOperationDb
            : (window.reloadOperationDb || null);
        if (loader) {
            loader({ force: true }).then(function() { initFactoryStockPage(); }).catch(function() { initFactoryStockPage(); });
            return;
        }
    }

    // Demo OFF: rebuild filter options from DB-backed data (factory/company from factory_stock,
    // category/series joined from sku_details) BEFORE event binding below.
    if (!demoOn) {
        _populateFactoryFiltersFromDb(root);
    }

    // Always re-bind events (clean previous first)
    // Remove old outside-click handler
    if (root._clickHandler) {
        document.removeEventListener('click', root._clickHandler);
    }
    
    console.log('✅ Factory Stock: Data available:', !!window.factoryStockData, 'rows:', window.factoryStockData?.length);
    
    // 綁定dropdown trigger點擊事件 (use onclick to avoid duplicate listeners)
    root.querySelectorAll('.fc-dropdown-trigger').forEach(trigger => {
        trigger.onclick = function(e) {
            e.stopPropagation();
            const filterType = this.dataset.filter;
            const panel = root.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
            
            root.querySelectorAll('.fc-dropdown-panel').forEach(p => {
                if (p !== panel) p.classList.remove('is-open');
            });
            
            if (panel) panel.classList.toggle('is-open');
        };
    });
    
    // 綁定checkbox change事件
    root.querySelectorAll('.fc-dropdown-panel').forEach(panel => {
        panel.onclick = e => e.stopPropagation();
        
        const filterType = panel.dataset.filter;
        const allCheckbox = panel.querySelector('input[value=""]');
        const otherCheckboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
        
        // All checkbox事件 (use onchange to avoid duplicates)
        if (allCheckbox) {
            allCheckbox.onchange = function() {
                const isChecked = this.checked;
                otherCheckboxes.forEach(cb => cb.checked = isChecked);
                updateFilterText(filterType, root);
                renderFactoryStockTable(root);
            };
        }
        
        // 個別checkbox事件
        otherCheckboxes.forEach(checkbox => {
            checkbox.onchange = function() {
                const checkedCount = Array.from(otherCheckboxes).filter(cb => cb.checked).length;
                if (allCheckbox) {
                    allCheckbox.checked = checkedCount === otherCheckboxes.length;
                }
                updateFilterText(filterType, root);
                renderFactoryStockTable(root);
            };
        });
    });
    
    // 綁定SKU input事件
    const skuInput = root.querySelector('#factory-sku-input');
    if (skuInput) {
        skuInput.addEventListener('input', () => renderFactoryStockTable(root));
    }
    
    // 點擊外部關閉dropdown
    const handleOutsideClick = e => {
        if (!root.contains(e.target)) {
            root.querySelectorAll('.fc-dropdown-panel').forEach(p => p.classList.remove('is-open'));
        }
    };
    if (root._clickHandler) {
        document.removeEventListener('click', root._clickHandler);
    }
    root._clickHandler = handleOutsideClick;
    document.addEventListener('click', handleOutsideClick);
    
    // 初始化所有篩選器的顯示文字
    // F1-7N-UX-FACTORY-INVENTORY-REMOVE-COMPANY-FILTER-R1 — 'company' removed from the Factory Inventory filter bar
    // (factory-warehouse identity already carries company context). Data authority (item.company) is untouched.
    ['factory', 'country', 'category', 'series', 'stockStatus'].forEach(type => {
        updateFilterText(type, root);
    });
    
    // 立即渲染資料
    renderFactoryStockTable(root);

    // Movement Log (search-gated) init — additive; uses isolated fmv-* selectors so the
    // snapshot filters/table above are not affected.
    _initFactoryMovementLog(root);

    // 同步滾動
    setTimeout(() => {
        const scrollCol = root.querySelector('.scroll-col');
        const scrollHeader = root.querySelector('.scroll-header');
        if (scrollCol && scrollHeader) {
            if (scrollCol._syncHandler) {
                scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
            }
            scrollCol._syncHandler = () => {
                scrollHeader.style.transform = `translateX(-${scrollCol.scrollLeft}px)`;
            };
            scrollCol.addEventListener('scroll', scrollCol._syncHandler);
        }
        // Drag-to-resize on the Factory Inventory data columns (reuses the SKU Details resize engine
        // via the shared dual-layer adapter). Header cells are static, so this init runs once at mount;
        // filter/pagination re-renders reuse the same handles + injected width rule.
        if (window.KM && window.KM.ui && window.KM.ui.dualLayerResize) {
            window.KM.ui.dualLayerResize.init({
                sectionId: 'factory-stock-section',
                scrollHeaderSel: '#factory-stock-scroll-header',
                scrollBodySel: '#factory-stock-scroll-body',
                page: 'factory-stock', group: 'factory-inventory'
            });
        }
    }, 50);
}

// Backward compatibility
function initFactoryDropdown() {
    initFactoryStockPage();
}

function updateFilterText(filterType, root) {
    if (!root) root = document.querySelector('#factory-stock-section');
    const panel = root.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
    const trigger = root.querySelector(`.fc-dropdown-trigger[data-filter="${filterType}"]`);
    if (!panel || !trigger) return;
    
    const textSpan = trigger.querySelector('.fc-dropdown-text');
    const checked = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    const total = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
    
    if (checked.length === 0) {
        textSpan.textContent = 'None';
    } else if (checked.length === total.length) {
        textSpan.textContent = 'All';
    } else {
        textSpan.textContent = `${checked.length} selected`;
    }
}

function renderFactoryStockTable(root) {
    if (!root) root = document.querySelector('#factory-stock-section');
    const fixedBody = root.querySelector('#factory-stock-fixed-body');
    const scrollBody = root.querySelector('#factory-stock-scroll-body');
    
    if (!fixedBody || !scrollBody) {
        console.error('❌ Factory Stock: DOM elements not found');
        return;
    }
    
    // 檢查資料是否存在
    var _factoryData = null; // Default: no data
    if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
        _factoryData = _getDemoFactoryStockData();
    } else {
        _factoryData = _getDbFactoryStockData();
    }
    // === End Demo Data Layer ===
    if (!_factoryData || _factoryData.length === 0) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8">\u5c1a\u672a\u9023\u63a5\u8cc7\u6599\u4f86\u6e90</div>';
        return;
    }
    
    const getFilters = (type) => {
        const panel = root.querySelector(`.fc-dropdown-panel[data-filter="${type}"]`);
        if (!panel) return [];
        const allCheckbox = panel.querySelector('input[value=""]');
        const otherCheckboxes = panel.querySelectorAll('input:not([value=""])');
        const totalCount = otherCheckboxes.length;
        const checkedBoxes = Array.from(otherCheckboxes).filter(cb => cb.checked);
        const checkedCount = checkedBoxes.length;
        
        // 如果 All 被勾選，或所有子選項都被勾選，返回空陣列表示「不篩選」
        if ((allCheckbox && allCheckbox.checked) || checkedCount === totalCount) {
            return [];
        }
        
        // 返回已勾選的值
        return checkedBoxes.map(cb => cb.value);
    };
    
    const filters = {
        factory: getFilters('factory'),
        country: getFilters('country'),
        category: getFilters('category'),
        series: getFilters('series'),
        stockStatus: getFilters('stockStatus'),
        sku: root.querySelector('#factory-sku-input')?.value.toLowerCase() || ''
    };

    let data = _factoryData.filter(item => {
        if (filters.factory.length > 0 && !filters.factory.includes(item.factory)) return false;
        if (filters.country.length > 0 && !filters.country.includes(item.country)) return false;
        if (filters.category.length > 0 && !filters.category.includes(item.category)) return false;
        if (filters.series.length > 0 && !filters.series.includes(item.series)) return false;
        if (filters.stockStatus.length > 0 && !filters.stockStatus.includes(item.stockStatus)) return false;
        if (filters.sku && !item.sku.toLowerCase().includes(filters.sku)) return false;
        return true;
    });

    console.log(`✅ factory inventory render rows = ${data.length}`);

    // KPIs are computed from the FILTERED rows so they always reflect what the table shows.
    // available = MAX(current - reserved, 0). In Production / Pending Shipout have no authoritative
    // wired source → shown as "—" (not tracked), never fabricated.
    _renderFactoryKpis(data);

    if (data.length === 0) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8">No data found</div>';
        return;
    }

    var na = '<span class="fi-na" title="Not tracked yet">—</span>';
    fixedBody.innerHTML = data.map(item => `<div class="fixed-row">${_fmvEscapeHtml(item.sku)}</div>`).join('');
    scrollBody.innerHTML = data.map(item => `
        <div class="scroll-row">
            <div class="scroll-cell">${_fmvEscapeHtml(item.factory)}</div>
            <div class="scroll-cell scroll-cell--category">${_fmvEscapeHtml(item.category) || na}</div>
            <div class="scroll-cell scroll-cell--series">${_fmvEscapeHtml(item.series) || na}</div>
            <div class="scroll-cell scroll-cell--num">${item.currentStock.toLocaleString()}</div>
            <div class="scroll-cell scroll-cell--num">${item.reservedStock.toLocaleString()}</div>
            <div class="scroll-cell scroll-cell--num">${item.availableStock.toLocaleString()}</div>
            <div class="scroll-cell scroll-cell--num">${na}</div>
            <div class="scroll-cell scroll-cell--num">${na}</div>
            <div class="scroll-cell">${_fmvEscapeHtml(item.lastMovement) || na}</div>
        </div>
    `).join('');
}

// Compute + render the Factory Inventory KPI cards from the given (filtered) rows.
// Current / Reserved / Available are real sums; In Production / Pending Shipout stay "—" (no source).
function _renderFactoryKpis(rows) {
    var totals = (rows || []).reduce(function(acc, r) {
        acc.current += Number(r.currentStock) || 0;
        acc.reserved += Number(r.reservedStock) || 0;
        acc.available += Number(r.availableStock) || 0;
        return acc;
    }, { current: 0, reserved: 0, available: 0 });
    var set = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = (val == null) ? '—' : Number(val).toLocaleString();
    };
    set('fi-kpi-current', totals.current);
    set('fi-kpi-reserved', totals.reserved);
    set('fi-kpi-available', totals.available);
    // In Production / Pending Shipout: no authoritative wired source (see _getDbFactoryStockData). Keep "—".
    set('fi-kpi-inproduction', null);
    set('fi-kpi-pendingshipout', null);
}

window.initFactoryStockPage = initFactoryStockPage;
window.initFactoryDropdown = initFactoryDropdown;
window.renderFactoryStockTable = renderFactoryStockTable;



// ========================================
// Demo Data Layer: Phase 2B - Factory Stock Mapping
// ========================================
function _getDemoFactoryStockData() {
    var rows = window.KM.DemoData.getFactoryStockRows({});
    return rows.map(function(r) {
        var current = Number(r.factory_stock) || 0;
        var reserved = Number(r.reserved_qty) || 0;
        var available = Math.max(current - reserved, 0);
        var cat = r.category || '';
        var ser = r.series || '';
        var catSer = (cat && ser) ? (cat + ' / ' + ser) : (cat || ser || '');
        return {
            sku: r.sku,
            company: 'Kitchen Mama',
            country: r.country || 'CN',
            marketplace: 'US',
            category: cat,
            series: ser,
            categorySeries: catSer,
            factory: r.factory_name || '',
            warehouseId: r.warehouse_id || '',
            currentStock: current,
            reservedStock: reserved,
            availableStock: available,
            stockStatus: available > 0 ? 'In Stock' : 'Out of Stock',
            lastMovement: r.next_production_date || '',
            inProduction: null,
            pendingShipout: null
        };
    });
}

// ========================================
// Cloud (Demo OFF) DB connection: factory_stock + sku_details join
// ========================================
// ----------------------------------------------------------------------------
// factory_stock_id convention (documentation only — no write logic here):
//   Format: FSTK-{SKU}-{COMPANY}-{FACTORY_CODE}
//   Factory codes:
//     CN_YOUXIN  = 東莞侑鑫
//     TW_SHENGYI = 南投勝一
//   Examples:
//     FSTK-C01100-R-KM-CN_YOUXIN
//     FSTK-C01100-R-RESTW-TW_SHENGYI
//     FSTK-SP3210-R-RESUS-CN_YOUXIN
// ----------------------------------------------------------------------------
function _getDbFactoryStockData() {
    // Source of truth = factory_stock ONLY (Factory Inventory domain). Rows with current_stock = 0 are kept.
    // Overseas inventory (overseas_inventory_snapshot) is NEVER read here — the two domains stay separate.
    // Company / Factory name / Country are joined from warehouses via warehouse_id
    //   (company = warehouses.company, factory = warehouses.warehouse_name, country = warehouses.country).
    // sku_details is used solely to join category/series metadata (NOT as a row universe).
    // available_factory_stock = MAX(currentStock - reservedStock, 0).
    // In Production / Pending Shipout: NO authoritative wired source on factory_stock (only fac_current_stock /
    //   fac_reserved_stock exist). They are intentionally left null → rendered "—" (not fabricated / not derived
    //   from unrelated statuses). Documented gap: WAREHOUSE_OPERATIONS_SPEC §6A read-only joins not implemented.
    var rows = _fsGet('factoryStock');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    var whMap = _factoryWarehouseMap();
    var skuMeta = {};
    var details = _fsGet('skuDetails');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    details.forEach(function(d) { if (d.sku) skuMeta[d.sku] = { category: d.category || '', series: d.series || '' }; });
    return rows.map(function(r) {
        var meta = skuMeta[r.sku] || { category: '', series: '' };
        var wh = whMap[r.warehouseId] || {};
        var current = Number(r.currentStock) || 0;
        var reserved = Number(r.reservedStock) || 0;
        var available = Math.max(current - reserved, 0);
        var cat = meta.category || '';
        var ser = meta.series || '';
        var catSer = (cat && ser) ? (cat + ' / ' + ser) : (cat || ser || '');
        return {
            sku: r.sku,
            company: wh.company || r.company || '',
            country: wh.country || '',
            marketplace: '',
            category: cat,
            series: ser,
            categorySeries: catSer,
            factory: wh.warehouseName || r.factoryName || (r.warehouseId ? 'Unknown' : ''),
            warehouseId: r.warehouseId || '',
            currentStock: current,
            reservedStock: reserved,
            availableStock: available,
            stockStatus: available > 0 ? 'In Stock' : 'Out of Stock',
            lastMovement: r.lastTransactionAt || '',
            // No authoritative source — kept null; rendered as "—" (not tracked).
            inProduction: null,
            pendingShipout: null
        };
    });
}

// Rebuild factory/company/category/series filter options from DB-backed data (Demo OFF).
// Category/Series come from the sku_details join (NOT stored in factory_stock).
function _populateFactoryFiltersFromDb(root) {
    if (!root) root = document.querySelector('#factory-stock-section');
    if (!root) return;
    // Build options ONLY from actual factory_stock data (category/series via sku_details join).
    // No static/demo fallback: empty DB rebuilds panels with just the "All" entry (no fake options).
    var data = _getDbFactoryStockData();
    var distinct = function(key) {
        var arr = [];
        data.forEach(function(d) { var v = String(d[key] || '').trim(); if (v && arr.indexOf(v) === -1) arr.push(v); });
        arr.sort();
        return arr;
    };
    var rebuild = function(filterType, values) {
        var panel = root.querySelector('.fc-dropdown-panel[data-filter="' + filterType + '"]');
        if (!panel) return;
        var html = '<label class="fc-checkbox-item"><input type="checkbox" value="" checked> <strong>All</strong></label>';
        values.forEach(function(v) {
            html += '<label class="fc-checkbox-item"><input type="checkbox" value="' + v + '" checked> ' + v + '</label>';
        });
        panel.innerHTML = html;
    };
    rebuild('factory', distinct('factory'));
    // 'company' filter removed (F1-7N-UX-FACTORY-INVENTORY-REMOVE-COMPANY-FILTER-R1) — no company panel to rebuild.
    rebuild('country', distinct('country'));
    rebuild('category', distinct('category'));
    rebuild('series', distinct('series'));
    // Stock Status is a fixed set (In Stock / Out of Stock) — not rebuilt from data.
}

function _showFactoryDemoBadge() {
    var filterBar = document.querySelector('#factory-stock-section .fc-filter-bar');
    if (!filterBar) return;
    if (filterBar.querySelector('.demo-badge')) return;
    var badge = document.createElement('span');
    badge.className = 'demo-badge';
    badge.style.cssText = 'background:#8b5cf6;color:white;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:12px;vertical-align:middle;';
    badge.textContent = 'Demo Data Mode';
    filterBar.appendChild(badge);
}

function _removeFactoryDemoBadge() {
    var badge = document.querySelector('#factory-stock-section .demo-badge');
    if (badge) badge.remove();
}

// Patch renderFactoryStockTable to show/hide badge
var _origRenderFactoryStockTable = renderFactoryStockTable;
renderFactoryStockTable = function(root) {
    _origRenderFactoryStockTable(root);
    if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
        _showFactoryDemoBadge();
    } else {
        _removeFactoryDemoBadge();
    }
};
window.renderFactoryStockTable = renderFactoryStockTable;

// Debug helper
window.debugFactoryDemoData = function() {
    var enabled = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
    console.log('=== Factory Stock Demo Data Debug ===');
    console.log('Demo enabled:', enabled);
    if (!enabled) { console.log('Demo mode is OFF. Use setDemoDataMode(true) to enable.'); return; }
    var rows = window.KM.DemoData.getFactoryStockRows({});
    console.log('DemoData factoryStock rows:', rows.length);
    var mapped = _getDemoFactoryStockData();
    console.log('Mapped Factory Stock rows:', mapped.length);
    console.log('--- First 5 raw rows ---');
    console.table(rows.slice(0, 5));
    console.log('--- First 10 mapped rows ---');
    console.table(mapped.slice(0, 10));
};

// ========================================
// Factory Movement Log (Stage: search-gated read view)
// Source of truth = factory_stock_movements. Joins:
//   warehouse_id -> warehouses (factory/warehouse name), fallback factory_name field
//   sku -> sku_details (category / series)
// Self-contained: isolated fmv-* selectors + own state; the Factory Stock Snapshot is untouched.
// ========================================
var _factoryMovementSearched = false;       // no rows until Search is clicked
var _factoryMovBound = false;
var FACTORY_MOV_QTY_NUM = true;

function _fmvEscapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _factoryWarehouseMap() {
    var rows = _fsGet('warehouses');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    var map = {};
    rows.forEach(function(w) { if (w.warehouseId) map[w.warehouseId] = w; });
    return map;
}

function _factorySkuMetaMap() {
    var details = _fsGet('skuDetails');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    var map = {};
    details.forEach(function(d) { if (d.sku) map[d.sku] = { category: d.category || '', series: d.series || '' }; });
    return map;
}

// Joined movement rows. locationName = warehouse name (by warehouse_id) || factory_name field.
function _getDbFactoryMovementData() {
    var rows = _fsGet('factoryStockMovements');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    var whMap = _factoryWarehouseMap();
    var skuMeta = _factorySkuMetaMap();
    return rows.map(function(m) {
        var wh = whMap[m.warehouseId];
        var locationName = (wh && wh.warehouseName) ? wh.warehouseName : (m.factoryName || m.warehouseId || '');
        var meta = skuMeta[m.sku] || { category: '', series: '' };
        // Available before/after: prefer the normalizer's derived values (from the 4-way current/reserved
        // audit columns); the normalizer already falls back to legacy before_qty/after_qty when absent.
        var availBefore = (m.availableBefore != null) ? Number(m.availableBefore) : (Number(m.quantityBefore) || 0);
        var availAfter = (m.availableAfter != null) ? Number(m.availableAfter) : (Number(m.quantityAfter) || 0);
        return {
            sku: m.sku,
            locationName: locationName,
            category: meta.category,
            series: meta.series,
            movementType: m.movementType,
            quantity: Number(m.quantity) || 0,
            availableBefore: availBefore,
            availableAfter: availAfter,
            quantityBefore: Number(m.quantityBefore) || 0,
            quantityAfter: Number(m.quantityAfter) || 0,
            relatedEntityType: m.relatedEntityType,
            relatedEntityId: m.relatedEntityId,
            createdBy: m.createdBy,
            createdAt: m.createdAt,
            note: m.note
        };
    });
}

// Signed quantity display: +N for increases, -N for decreases (Movement Log requirement, Part G).
function _fmvSignedQty(n) {
    var v = Number(n) || 0;
    return (v > 0 ? '+' : '') + v.toLocaleString();
}

function _factoryMovDistinct(data, key) {
    var arr = [];
    data.forEach(function(d) { var v = String(d[key] || '').trim(); if (v && arr.indexOf(v) === -1) arr.push(v); });
    arr.sort();
    return arr;
}

function _factoryMovGetFilter(panel, type) {
    var p = panel.querySelector('.fmv-dropdown-panel[data-filter="' + type + '"]');
    if (!p) return [];
    var allCb = p.querySelector('input[value=""]');
    var others = p.querySelectorAll('input:not([value=""])');
    var checked = Array.prototype.filter.call(others, function(cb) { return cb.checked; });
    if ((allCb && allCb.checked) || checked.length === others.length) return [];
    return checked.map(function(cb) { return cb.value; });
}

function _updateFactoryMovFilterText(type, panel) {
    var p = panel.querySelector('.fmv-dropdown-panel[data-filter="' + type + '"]');
    var trigger = panel.querySelector('.fmv-dropdown-trigger[data-filter="' + type + '"]');
    if (!p || !trigger) return;
    var textSpan = trigger.querySelector('.fmv-dropdown-text');
    var checked = p.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    var total = p.querySelectorAll('input[type="checkbox"]:not([value=""])');
    if (checked.length === 0) textSpan.textContent = 'None';
    else if (checked.length === total.length) textSpan.textContent = 'All';
    else textSpan.textContent = checked.length + ' selected';
}

function _populateFactoryMovFilters(movPanel) {
    var data = _getDbFactoryMovementData();
    var rebuild = function(type, values) {
        var p = movPanel.querySelector('.fmv-dropdown-panel[data-filter="' + type + '"]');
        if (!p) return;
        var html = '<label class="fc-checkbox-item"><input type="checkbox" value="" checked> <strong>All</strong></label>';
        values.forEach(function(v) {
            html += '<label class="fc-checkbox-item"><input type="checkbox" value="' + _fmvEscapeHtml(v) + '" checked> ' + _fmvEscapeHtml(v) + '</label>';
        });
        p.innerHTML = html;
    };
    rebuild('warehouse', _factoryMovDistinct(data, 'locationName'));
    rebuild('movementType', _factoryMovDistinct(data, 'movementType'));
    rebuild('category', _factoryMovDistinct(data, 'category'));
    rebuild('series', _factoryMovDistinct(data, 'series'));
}

function _bindFactoryMovControls(movPanel) {
    var onChange = function() { _factoryMovementSearched = false; renderFactoryMovementTable(); };
    movPanel.querySelectorAll('.fmv-dropdown-trigger').forEach(function(trigger) {
        trigger.onclick = function(e) {
            e.stopPropagation();
            var type = this.dataset.filter;
            var p = movPanel.querySelector('.fmv-dropdown-panel[data-filter="' + type + '"]');
            movPanel.querySelectorAll('.fmv-dropdown-panel').forEach(function(x) { if (x !== p) x.classList.remove('is-open'); });
            if (p) p.classList.toggle('is-open');
        };
    });
    movPanel.querySelectorAll('.fmv-dropdown-panel').forEach(function(panel) {
        panel.onclick = function(e) { e.stopPropagation(); };
        var type = panel.dataset.filter;
        var allCb = panel.querySelector('input[value=""]');
        var others = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
        if (allCb) {
            allCb.onchange = function() {
                var c = this.checked; others.forEach(function(cb) { cb.checked = c; });
                _updateFactoryMovFilterText(type, movPanel); onChange();
            };
        }
        others.forEach(function(cb) {
            cb.onchange = function() {
                var cnt = Array.prototype.filter.call(others, function(x) { return x.checked; }).length;
                if (allCb) allCb.checked = cnt === others.length;
                _updateFactoryMovFilterText(type, movPanel); onChange();
            };
        });
    });
    // Outside click closes fmv panels.
    if (!movPanel._fmvOutside) {
        movPanel._fmvOutside = function(e) {
            var root = document.querySelector('#factory-stock-section');
            if (root && !root.contains(e.target)) return;
            if (!e.target.closest('.fmv-dropdown-trigger') && !e.target.closest('.fmv-dropdown-panel')) {
                movPanel.querySelectorAll('.fmv-dropdown-panel').forEach(function(p) { p.classList.remove('is-open'); });
            }
        };
        document.addEventListener('click', movPanel._fmvOutside, true);
    }
}

function _initFactoryMovementLog(root) {
    if (!root) root = document.querySelector('#factory-stock-section');
    var movPanel = root.querySelector('[data-fs-panel="movement"]');
    if (!movPanel) return;
    _populateFactoryMovFilters(movPanel);
    _bindFactoryMovControls(movPanel);
    ['warehouse', 'movementType', 'category', 'series'].forEach(function(t) { _updateFactoryMovFilterText(t, movPanel); });
    var skuInput = root.querySelector('#factory-mov-sku-input');
    if (skuInput) skuInput.oninput = function() { _factoryMovementSearched = false; renderFactoryMovementTable(); };
    // Bind the Forecast-Review-style date range picker (replaces the old preset <select>).
    _bindFactoryMovDatePicker();
    _updateFactoryMovDateTriggerText();
    // Reset to instruction state on each mount.
    _factoryMovementSearched = false;
    renderFactoryMovementTable();
}

function renderFactoryMovementTable(root) {
    if (!root) root = document.querySelector('#factory-stock-section');
    var fixedBody = root.querySelector('#factory-movement-fixed-body');
    var scrollBody = root.querySelector('#factory-movement-scroll-body');
    if (!fixedBody || !scrollBody) return;

    if (!_factoryMovementSearched) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8">Please select filters and click Search to view movement logs.</div>';
        return;
    }

    var data = _getDbFactoryMovementData();
    if (!data || data.length === 0) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8">尚未連接資料來源</div>';
        return;
    }

    var movPanel = root.querySelector('[data-fs-panel="movement"]') || root;
    // Date range from the picker (inclusive, yyyy-MM-dd). Empty = no date filter. Filters by created_at.
    var startStr = _fmvMovDate.start ? _fmvFormatDate(_fmvMovDate.start) : '';
    var endStr = _fmvMovDate.end ? _fmvFormatDate(_fmvMovDate.end) : '';
    var filters = {
        warehouse: _factoryMovGetFilter(movPanel, 'warehouse'),
        movementType: _factoryMovGetFilter(movPanel, 'movementType'),
        category: _factoryMovGetFilter(movPanel, 'category'),
        series: _factoryMovGetFilter(movPanel, 'series'),
        sku: (root.querySelector('#factory-mov-sku-input') && root.querySelector('#factory-mov-sku-input').value.toLowerCase()) || ''
    };

    var filtered = data.filter(function(m) {
        if (startStr || endStr) {
            var rowDate = (m.createdAt || '').slice(0, 10);
            if (!rowDate) return false;
            if (startStr && rowDate < startStr) return false;
            if (endStr && rowDate > endStr) return false;
        }
        if (filters.warehouse.length > 0 && filters.warehouse.indexOf(m.locationName) === -1) return false;
        if (filters.movementType.length > 0 && filters.movementType.indexOf(m.movementType) === -1) return false;
        if (filters.category.length > 0 && filters.category.indexOf(m.category) === -1) return false;
        if (filters.series.length > 0 && filters.series.indexOf(m.series) === -1) return false;
        if (filters.sku && String(m.sku).toLowerCase().indexOf(filters.sku) === -1) return false;
        return true;
    });

    var sorted = filtered.slice().sort(function(a, b) {
        var ka = (a.createdAt || ''), kb = (b.createdAt || '');
        return ka < kb ? 1 : (ka > kb ? -1 : 0);
    });

    if (sorted.length === 0) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8">No data found</div>';
        return;
    }

    fixedBody.innerHTML = sorted.map(function(m) { return '<div class="fixed-row">' + _fmvEscapeHtml(m.sku) + '</div>'; }).join('');
    scrollBody.innerHTML = sorted.map(function(m) {
        return '<div class="scroll-row">' +
            '<div class="scroll-cell">' + _fmvEscapeHtml(m.locationName) + '</div>' +
            '<div class="scroll-cell">' + _fmvEscapeHtml(m.movementType) + '</div>' +
            '<div class="scroll-cell scroll-cell--num">' + _fmvSignedQty(m.quantity) + '</div>' +
            '<div class="scroll-cell">' + _fmvEscapeHtml(m.relatedEntityType) + '</div>' +
            '<div class="scroll-cell">' + _fmvEscapeHtml(m.relatedEntityId) + '</div>' +
            '<div class="scroll-cell scroll-cell--num">' + (Number(m.availableBefore) || 0).toLocaleString() + '</div>' +
            '<div class="scroll-cell scroll-cell--num">' + (Number(m.availableAfter) || 0).toLocaleString() + '</div>' +
            '<div class="scroll-cell">' + _fmvEscapeHtml(m.createdBy) + '</div>' +
            '<div class="scroll-cell">' + _fmvEscapeHtml(m.createdAt) + '</div>' +
            '<div class="scroll-cell">' + _fmvEscapeHtml(m.note) + '</div>' +
            '</div>';
    }).join('');

    // Movement table horizontal scroll sync.
    setTimeout(function() {
        var scrollCol = root.querySelector('#factory-movement-scroll-col');
        var scrollHeader = root.querySelector('#factory-movement-scroll-header');
        if (scrollCol && scrollHeader) {
            if (scrollCol._syncHandler) scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
            scrollCol._syncHandler = function() { scrollHeader.style.transform = 'translateX(-' + scrollCol.scrollLeft + 'px)'; };
            scrollCol.addEventListener('scroll', scrollCol._syncHandler);
        }
    }, 50);
}

function runFactoryMovementSearch() {
    _factoryMovementSearched = true;
    renderFactoryMovementTable();
}

// ----------------------------------------------------------------------------
// Factory Movement Date Range Picker (same UX/style as Forecast Review / Overseas).
// Self-contained: own state + fmvd-* ids/classes. Filters by created_at. Apply requires Search again.
// ----------------------------------------------------------------------------
var _fmvMovDate = { start: null, end: null, preset: null };
var _fmvMovDateTemp = { start: null, end: null, preset: null };
var _fmvMovCalMonths = { start: new Date(), end: new Date() };
var _fmvDatePickerBound = false;
var FMV_PRESET_LABELS = {
    'today': 'Today', 'yesterday': 'Yesterday',
    'last-7-days': 'Last 7 days', 'last-30-days': 'Last 30 days',
    'last-60-days': 'Last 60 days', 'last-90-days': 'Last 90 days',
    'last-month': 'Last month', 'last-2-months': 'Last 2 months',
    'last-3-months': 'Last 3 months', 'last-year': 'Last year'
};

function _fmvFormatDate(date) {
    if (!date) return '';
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}
function _fmvSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function _bindFactoryMovDatePicker() {
    if (_fmvDatePickerBound) return;
    var modal = document.getElementById('fmvDateModal');
    var backdrop = document.getElementById('fmvDateBackdrop');
    if (!modal || !backdrop) return;
    var cancelBtn = document.getElementById('fmvDateCancel');
    var clearBtn = document.getElementById('fmvDateClear');
    var applyBtn = document.getElementById('fmvDateApply');
    if (cancelBtn) cancelBtn.onclick = function() { closeFactoryMovDateModal(); };
    if (applyBtn) applyBtn.onclick = function() { _applyFactoryMovDate(); };
    if (clearBtn) clearBtn.onclick = function() { _clearFactoryMovDate(); };
    backdrop.onclick = function() { closeFactoryMovDateModal(); };
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) closeFactoryMovDateModal();
    });
    modal.querySelectorAll('.fmvd-preset-item').forEach(function(item) {
        item.onclick = function() { _factoryPresetClick(item.dataset.preset); };
    });
    modal.querySelectorAll('.fmvd-calendar-nav').forEach(function(btn) {
        btn.onclick = function() { _factoryCalendarNav(btn.dataset.nav); };
    });
    _fmvDatePickerBound = true;
}

function openFactoryMovDateModal() {
    var modal = document.getElementById('fmvDateModal');
    var backdrop = document.getElementById('fmvDateBackdrop');
    if (!modal || !backdrop) return;
    _fmvMovDateTemp = { start: _fmvMovDate.start, end: _fmvMovDate.end, preset: _fmvMovDate.preset };
    _fmvMovCalMonths.start = _fmvMovDate.start ? new Date(_fmvMovDate.start) : new Date();
    _fmvMovCalMonths.end = _fmvMovDate.end ? new Date(_fmvMovDate.end) : new Date();
    backdrop.classList.add('is-open');
    modal.classList.add('is-open');
    _updateFactoryMovDateInputs();
    _updateFactoryPresetHighlight();
    _renderFactoryCalendars();
}

function closeFactoryMovDateModal() {
    var modal = document.getElementById('fmvDateModal');
    var backdrop = document.getElementById('fmvDateBackdrop');
    if (modal) modal.classList.remove('is-open');
    if (backdrop) backdrop.classList.remove('is-open');
}

function _applyFactoryMovDate() {
    _fmvMovDate = { start: _fmvMovDateTemp.start, end: _fmvMovDateTemp.end, preset: _fmvMovDateTemp.preset };
    _updateFactoryMovDateTriggerText();
    closeFactoryMovDateModal();
    // Changing the date requires pressing Search again (search-gated consistency).
    _factoryMovementSearched = false;
    renderFactoryMovementTable();
}

function _clearFactoryMovDate() {
    _fmvMovDate = { start: null, end: null, preset: null };
    _fmvMovDateTemp = { start: null, end: null, preset: null };
    _updateFactoryMovDateTriggerText();
    _updateFactoryPresetHighlight();
    closeFactoryMovDateModal();
    _factoryMovementSearched = false;
    renderFactoryMovementTable();
}

function _updateFactoryMovDateTriggerText() {
    var span = document.getElementById('factory-mov-date-text');
    if (!span) return;
    if (_fmvMovDate.preset) span.textContent = FMV_PRESET_LABELS[_fmvMovDate.preset] || 'Custom range';
    else if (_fmvMovDate.start && _fmvMovDate.end) span.textContent = _fmvFormatDate(_fmvMovDate.start) + ' ~ ' + _fmvFormatDate(_fmvMovDate.end);
    else span.textContent = 'All dates';
}

function _factoryPresetClick(preset) {
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
    _fmvMovDateTemp.start = start;
    _fmvMovDateTemp.end = end;
    _fmvMovDateTemp.preset = preset;
    _fmvMovCalMonths.start = new Date(start);
    _fmvMovCalMonths.end = new Date(end);
    _updateFactoryMovDateInputs();
    _updateFactoryPresetHighlight();
    _renderFactoryCalendars();
}

function _updateFactoryPresetHighlight() {
    document.querySelectorAll('#factory-stock-section .fmvd-preset-item').forEach(function(item) {
        item.classList.toggle('is-active', item.dataset.preset === _fmvMovDateTemp.preset);
    });
}

function _updateFactoryMovDateInputs() {
    var s = document.getElementById('fmvStartDisplay');
    var e = document.getElementById('fmvEndDisplay');
    if (s) s.value = _fmvFormatDate(_fmvMovDateTemp.start);
    if (e) e.value = _fmvFormatDate(_fmvMovDateTemp.end);
}

function _factoryCalendarNav(nav) {
    switch (nav) {
        case 'prev-start': _fmvMovCalMonths.start.setMonth(_fmvMovCalMonths.start.getMonth() - 1); break;
        case 'next-start': _fmvMovCalMonths.start.setMonth(_fmvMovCalMonths.start.getMonth() + 1); break;
        case 'prev-end': _fmvMovCalMonths.end.setMonth(_fmvMovCalMonths.end.getMonth() - 1); break;
        case 'next-end': _fmvMovCalMonths.end.setMonth(_fmvMovCalMonths.end.getMonth() + 1); break;
    }
    _renderFactoryCalendars();
}

function _renderFactoryCalendars() {
    _renderFactoryCalendar('start');
    _renderFactoryCalendar('end');
}

function _renderFactoryCalendar(type) {
    var month = _fmvMovCalMonths[type];
    var cap = type.charAt(0).toUpperCase() + type.slice(1);
    var titleEl = document.getElementById('fmvCalendar' + cap + 'Title');
    var bodyEl = document.getElementById('fmvCalendar' + cap + 'Body');
    if (!titleEl || !bodyEl) return;
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    titleEl.textContent = monthNames[month.getMonth()] + ' ' + month.getFullYear();
    var lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    var startDow = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    var html = '';
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(function(d) { html += '<div class="fr-calendar-weekday">' + d + '</div>'; });
    for (var i = 0; i < startDow; i++) html += '<div class="fr-calendar-day is-disabled"></div>';
    var start = _fmvMovDateTemp.start, end = _fmvMovDateTemp.end, todayD = new Date();
    for (var day = 1; day <= lastDay.getDate(); day++) {
        var date = new Date(month.getFullYear(), month.getMonth(), day);
        var classes = ['fr-calendar-day'];
        if (start && _fmvSameDay(date, start)) classes.push('is-start');
        if (end && _fmvSameDay(date, end)) classes.push('is-end');
        if (start && end && date > start && date < end) classes.push('is-in-range');
        if (_fmvSameDay(date, todayD)) classes.push('is-today');
        html += '<div class="' + classes.join(' ') + '" data-date="' + date.toISOString() + '" data-type="' + type + '">' + day + '</div>';
    }
    bodyEl.innerHTML = html;
    bodyEl.querySelectorAll('.fr-calendar-day:not(.is-disabled)').forEach(function(dayEl) {
        dayEl.onclick = function() { _factoryDayClick(new Date(dayEl.dataset.date), dayEl.dataset.type); };
    });
}

function _factoryDayClick(date, calType) {
    var start = _fmvMovDateTemp.start, end = _fmvMovDateTemp.end;
    if (calType === 'start') {
        if (end && date > end) { _fmvMovDateTemp.start = end; _fmvMovDateTemp.end = date; }
        else { _fmvMovDateTemp.start = date; }
    } else {
        if (start && date < start) { _fmvMovDateTemp.end = start; _fmvMovDateTemp.start = date; }
        else { _fmvMovDateTemp.end = date; }
    }
    _fmvMovDateTemp.preset = null;
    _updateFactoryMovDateInputs();
    _updateFactoryPresetHighlight();
    _renderFactoryCalendars();
}

window.openFactoryMovDateModal = openFactoryMovDateModal;
window.closeFactoryMovDateModal = closeFactoryMovDateModal;

function switchFactoryTab(tab) {
    var root = document.querySelector('#factory-stock-section');
    if (!root) return;
    root.querySelectorAll('.fs-tab').forEach(function(b) { b.classList.toggle('is-active', b.dataset.fsTab === tab); });
    root.querySelectorAll('.fs-tab-panel').forEach(function(p) { p.style.display = (p.dataset.fsPanel === tab) ? '' : 'none'; });
    if (tab === 'movement') renderFactoryMovementTable(root);
    else renderFactoryStockTable(root);
}

window.switchFactoryTab = switchFactoryTab;
window.runFactoryMovementSearch = runFactoryMovementSearch;
window.renderFactoryMovementTable = renderFactoryMovementTable;

// ============================================================================
// Factory Inventory Adjustment modal (2026-07-23)
// Select ONE factory_stock record, set the NEW Available quantity, add a required Reason/Note.
// Only Available is adjusted (Reserved is never editable). Confirm -> backend atomic write
// (factory_stock + factory_stock_movements) via KM.DB.adjustFactoryInventory, then re-GET + re-render.
// NOT an inline edit; a unique record must be selected first.
// ============================================================================
var _factoryAdjustRecords = [];
var _factoryAdjustSelected = null;
var _factoryAdjustSubmitting = false;
var _factoryAdjustKeyBound = false;

function openFactoryInventoryAdjustModal() {
    var overlay = document.getElementById('factory-adjust-overlay');
    var modal = document.getElementById('factory-adjust-modal');
    if (!modal || !overlay) return;
    // Records come from the real DB-backed factory_stock join (this is a real write; never demo rows).
    _factoryAdjustRecords = _getDbFactoryStockData() || [];
    var sel = document.getElementById('factory-adjust-record');
    if (sel) {
        var opts = ['<option value="">Select SKU / Warehouse…</option>'];
        _factoryAdjustRecords.forEach(function(rec, i) {
            var label = rec.sku + ' — ' + (rec.factory || rec.warehouseId || '?') +
                (rec.company ? ' (' + rec.company + (rec.country ? '/' + rec.country : '') + ')' : '');
            opts.push('<option value="' + i + '">' + _fmvEscapeHtml(label) + '</option>');
        });
        sel.innerHTML = opts.join('');
    }
    _factoryAdjustSelected = null;
    _factoryAdjustSubmitting = false;
    ['factory-adjust-sku', 'factory-adjust-warehouse', 'factory-adjust-company', 'factory-adjust-country', 'factory-adjust-current', 'factory-adjust-delta']
        .forEach(function(id) { var el = document.getElementById(id); if (el) el.textContent = '—'; });
    var newEl = document.getElementById('factory-adjust-new'); if (newEl) { newEl.value = ''; newEl.disabled = true; }
    var noteEl = document.getElementById('factory-adjust-note'); if (noteEl) noteEl.value = '';
    var refEl = document.getElementById('factory-adjust-reference'); if (refEl) refEl.value = '';
    var preview = document.getElementById('factory-adjust-preview'); if (preview) { preview.hidden = true; preview.innerHTML = ''; }
    var result = document.getElementById('factory-adjust-result'); if (result) { result.hidden = true; result.innerHTML = ''; }
    var btn = document.getElementById('factory-adjust-confirm-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Confirm Adjustment'; }
    overlay.classList.add('is-open');
    modal.classList.add('is-open');
    // Close on Escape (bound once).
    if (!_factoryAdjustKeyBound) {
        document.addEventListener('keydown', function(e) {
            var m = document.getElementById('factory-adjust-modal');
            if (e.key === 'Escape' && m && m.classList.contains('is-open')) closeFactoryInventoryAdjustModal();
        });
        _factoryAdjustKeyBound = true;
    }
}

function closeFactoryInventoryAdjustModal() {
    var overlay = document.getElementById('factory-adjust-overlay');
    var modal = document.getElementById('factory-adjust-modal');
    if (overlay) overlay.classList.remove('is-open');
    if (modal) modal.classList.remove('is-open');
}

function onFactoryAdjustRecordChange() {
    var sel = document.getElementById('factory-adjust-record');
    var idx = sel ? parseInt(sel.value, 10) : NaN;
    var rec = (!isNaN(idx) && _factoryAdjustRecords[idx]) ? _factoryAdjustRecords[idx] : null;
    _factoryAdjustSelected = rec;
    var set = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = (v == null || v === '') ? '—' : v; };
    var newEl = document.getElementById('factory-adjust-new');
    if (!rec) {
        ['factory-adjust-sku', 'factory-adjust-warehouse', 'factory-adjust-company', 'factory-adjust-country', 'factory-adjust-current', 'factory-adjust-delta']
            .forEach(function(id) { set(id, '—'); });
        if (newEl) { newEl.value = ''; newEl.disabled = true; }
        _factoryAdjustUpdateValidity();
        return;
    }
    set('factory-adjust-sku', rec.sku);
    set('factory-adjust-warehouse', rec.factory || rec.warehouseId || '—');
    set('factory-adjust-company', rec.company || '—');
    set('factory-adjust-country', rec.country || '—');
    set('factory-adjust-current', Number(rec.availableStock || 0).toLocaleString());
    set('factory-adjust-delta', '—');
    if (newEl) { newEl.disabled = false; newEl.value = ''; newEl.focus(); }
    onFactoryAdjustQtyInput();
}

// Parse the New Available input. { ok, value } | { ok:false, empty } | { ok:false, invalid }
function _factoryAdjustNewValue() {
    var el = document.getElementById('factory-adjust-new');
    var raw = el ? String(el.value).trim() : '';
    if (raw === '') return { ok: false, empty: true };
    if (!/^\d+$/.test(raw)) return { ok: false, invalid: true };   // integer >= 0 only
    return { ok: true, value: parseInt(raw, 10) };
}

function onFactoryAdjustQtyInput() {
    var rec = _factoryAdjustSelected;
    var deltaEl = document.getElementById('factory-adjust-delta');
    var preview = document.getElementById('factory-adjust-preview');
    if (!rec) { if (deltaEl) deltaEl.textContent = '—'; if (preview) preview.hidden = true; _factoryAdjustUpdateValidity(); return; }
    var cur = Number(rec.availableStock || 0);
    var nv = _factoryAdjustNewValue();
    if (nv.ok) {
        var delta = nv.value - cur;
        if (deltaEl) deltaEl.textContent = _fmvSignedQty(delta);
        // Preview "Current Available → New Available" before Confirm (Part D rule 4).
        if (preview) { preview.hidden = false; preview.innerHTML = 'Available: <strong>' + cur.toLocaleString() + '</strong> &rarr; <strong>' + nv.value.toLocaleString() + '</strong> (' + _fmvSignedQty(delta) + ')'; }
    } else {
        if (deltaEl) deltaEl.textContent = '—';
        if (preview) { preview.hidden = true; preview.innerHTML = ''; }
    }
    _factoryAdjustUpdateValidity();
}

function _factoryAdjustUpdateValidity() {
    var btn = document.getElementById('factory-adjust-confirm-btn');
    if (!btn) return;
    var rec = _factoryAdjustSelected;
    var nv = _factoryAdjustNewValue();
    var noteEl = document.getElementById('factory-adjust-note');
    var noteOk = noteEl && String(noteEl.value).trim() !== '';
    // Confirm enabled only when: a record is loaded, New Available is a valid int != current, note is filled.
    var valid = !!rec && nv.ok && nv.value !== Number(rec.availableStock || 0) && noteOk && !_factoryAdjustSubmitting;
    btn.disabled = !valid;
}

function confirmFactoryInventoryAdjustment() {
    if (_factoryAdjustSubmitting) return;              // double-submit guard (Part D rule 5)
    var rec = _factoryAdjustSelected;
    var nv = _factoryAdjustNewValue();
    var noteEl = document.getElementById('factory-adjust-note');
    var note = noteEl ? String(noteEl.value).trim() : '';
    var refEl = document.getElementById('factory-adjust-reference');
    var reference = refEl ? String(refEl.value).trim() : '';
    var resultEl = document.getElementById('factory-adjust-result');
    var show = function(html, isErr) {
        if (!resultEl) return;
        resultEl.hidden = false;
        resultEl.innerHTML = isErr ? ('<div style="color:#dc2626;font-weight:600;">Error: ' + _fmvEscapeHtml(html) + '</div>') : html;
    };

    if (!rec) { show('Please select a stock record.', true); return; }
    if (nv.empty) { show('New Available is required.', true); return; }
    if (nv.invalid) { show('New Available must be a whole number ≥ 0.', true); return; }
    if (nv.value === Number(rec.availableStock || 0)) { show('New Available equals Current Available; nothing to adjust.', true); return; }
    if (!note) { show('Reason / Note is required.', true); return; }
    if (!(window.KM && window.KM.DB && window.KM.DB.adjustFactoryInventory)) { show('Adjustment API is not available.', true); return; }

    _factoryAdjustSubmitting = true;
    var btn = document.getElementById('factory-adjust-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Applying…'; }

    window.KM.DB.adjustFactoryInventory({
        warehouse_id: rec.warehouseId,
        sku: rec.sku,
        new_available: nv.value,
        note: note,
        reference_id: reference,
        created_by: 'operation-system'          // Phase 1 runtime identity; not user-entered
    }).then(function(result) {
        _factoryAdjustSubmitting = false;
        if (!result || result.success === false) {
            if (btn) { btn.disabled = false; btn.textContent = 'Confirm Adjustment'; }
            show(result && result.error ? result.error : 'Adjustment failed. API may not be configured.', true);
            return;
        }
        var d = result.data || {};
        show('<div style="color:#16a34a;font-weight:600;margin-bottom:4px;">Adjustment applied.</div>' +
            '<div>Movement: ' + _fmvEscapeHtml(d.movement_id || '') + '</div>' +
            '<div>Reference: ' + _fmvEscapeHtml(d.reference_id || '') + '</div>' +
            '<div>Available: ' + _fmvEscapeHtml(String(d.before_available)) + ' &rarr; ' + _fmvEscapeHtml(String(d.after_available)) + ' (' + _fmvSignedQty(d.quantity) + ')</div>', false);
        if (btn) { btn.textContent = 'Done'; }
        // F1-7J-A3: the writer re-GET the broad cache; canonical mode re-reads the SCOPED tables before re-render (keeps
        // filters); refresh the movement log if its tab is visible so the new row shows immediately.
        var root = document.querySelector('#factory-stock-section');
        _fsAfterWrite(function () {
            renderFactoryStockTable(root);
            var movPanel = root && root.querySelector('[data-fs-panel="movement"]');
            var movVisible = movPanel && movPanel.style.display !== 'none';
            if (movVisible) { _factoryMovementSearched = true; renderFactoryMovementTable(root); }
        });
    }).catch(function(err) {
        _factoryAdjustSubmitting = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Confirm Adjustment'; }
        show(err && err.message ? err.message : 'Adjustment request failed.', true);
    });
}

window.openFactoryInventoryAdjustModal = openFactoryInventoryAdjustModal;
window.closeFactoryInventoryAdjustModal = closeFactoryInventoryAdjustModal;
window.onFactoryAdjustRecordChange = onFactoryAdjustRecordChange;
window.onFactoryAdjustQtyInput = onFactoryAdjustQtyInput;
window.confirmFactoryInventoryAdjustment = confirmFactoryInventoryAdjustment;

// ============================================================
// F0-HOTFIX-FI1 — Factory Inventory Initial Stock Import (SET_CURRENT_STOCK). READ-then-write via the
// two-phase factoryInventory.import.validate / .commit actions. Identity = warehouse_id + sku. Reuses the
// generic ExcelJS template builder (KM.templateExport) for the .xlsx template and accepts .xlsx or .csv on
// upload (browser parse). NO supplier, NO marketplace, NO site_sku. The importer SETS current stock (never
// ADD), never writes reserved, never touches orders/shipments/forecast/recommendation. One request per phase;
// double-click sends ONE commit; the committed ACK is decoupled from a TARGETED readback (never a whole-DB
// reload). All authoritative validation is server-side; client checks are advisory only.
// __FIIPAGE_START__ (test extraction marker — do not remove)
var _FII_TEMPLATE_HEADERS = ['warehouse_id', 'warehouse_code', 'sku', 'current_stock_qty', 'effective_date', 'note'];
var _FII_REQUIRED_HEADERS = ['warehouse_id', 'sku', 'current_stock_qty'];
var _FII_MAX_ROWS = 5000;
var _FII_MAX_BYTES = 5 * 1024 * 1024;   // 5 MB
var _fiiRows = null;         // parsed rows (client)
var _fiiValidated = null;    // last server validate response.data
var _fiiBatchId = null;      // stable import batch id (generated at validate; REUSED on commit + retry — idempotency)
var _fiiSubmitting = false;  // commit double-submit guard (one commit per click)
var _fiiCompleted = false;   // F1-7N: after a successful commit the primary button becomes "Done" (closes; never re-imports)
var _fiiKeyBound = false;
// F1-7N-UX-INVENTORY-IMPORT-WAREHOUSE-SCOPE-GUARDS-R1 — the user MUST explicitly select a factory before import.
var _fiiFactory = { warehouseId: '', warehouseCode: '' };

function _fiiEl(id) { return document.getElementById(id); }
// PURE: eligible factory picker set — active canonical factories only (is_factory_warehouse + warehouse_type=FACTORY);
// never inferred from country/name. Mirrors the server factoryImportScopeCheck_ authority.
function _fiiEligibleFactories() {
  return (_fsGet('warehouses') || []).filter(function (w) {
    if (!w || !w.warehouseId) return false;
    if (w.isActive === false) return false;
    if (w.isFactoryWarehouse !== true) return false;
    var t = String(w.warehouseType || '').trim().toUpperCase();
    if (t && t !== 'FACTORY') return false;   // canonical FACTORY type when present
    return true;
  });
}
// PURE advisory row scope check (server is authority): factory selected + every row matches selected warehouse_id
// (and warehouse_code when both supplied). Returns { ok } or { ok:false, error }.
function _fiiFactoryScopeCheck(rows, scope) {
  scope = scope || {};
  var selWh = String(scope.warehouse_id || '').trim();
  if (!selWh) return { ok: false, error: 'Select a factory before importing.' };
  var selCode = String(scope.warehouse_code || '').trim();
  for (var i = 0; i < (rows || []).length; i++) {
    var row = rows[i] || {};
    var rn = (typeof row.__row === 'number') ? row.__row : (i + 1);
    var rwh = String(row.warehouse_id || '').trim();
    if (rwh && rwh !== selWh) return { ok: false, error: 'Row ' + rn + ' warehouse_id "' + rwh + '" does not match the selected factory "' + selWh + '". One import file = one factory.' };
    var rcode = String(row.warehouse_code || '').trim();
    if (rcode && selCode && rcode.toLowerCase() !== selCode.toLowerCase()) return { ok: false, error: 'Row ' + rn + ' warehouse_code "' + rcode + '" does not match the selected factory code "' + selCode + '".' };
  }
  return { ok: true };
}
function _fiiPopulateFactories() {
  var sel = _fiiEl('factory-import-factory'); if (!sel) return;
  var facs = _fiiEligibleFactories();
  sel.innerHTML = '<option value="">' + (facs.length ? 'Select factory…' : 'No active factories') + '</option>' +
    facs.map(function (w) {
      var name = w.warehouseName || w.warehouseCode || w.warehouseId;
      return '<option value="' + _fiiEsc(w.warehouseId) + '" data-code="' + _fiiEsc(w.warehouseCode || '') + '">' + _fiiEsc(name) + (w.warehouseCode ? ' (' + _fiiEsc(w.warehouseCode) + ')' : '') + ' — ' + _fiiEsc(w.warehouseId) + '</option>';
    }).join('');
  sel.value = _fiiFactory.warehouseId || '';
}
function _fiiOnFactoryChosen() {
  var sel = _fiiEl('factory-import-factory');
  var opt = sel && sel.selectedOptions && sel.selectedOptions[0];
  _fiiFactory = { warehouseId: sel ? String(sel.value || '').trim() : '', warehouseCode: opt ? String(opt.getAttribute('data-code') || '').trim() : '' };
  var fileEl = _fiiEl('factory-import-file'); if (fileEl) { fileEl.value = ''; fileEl.disabled = !_fiiFactory.warehouseId; }
  _fiiRows = null; _fiiValidated = null;
  _fiiHide('factory-import-summary'); _fiiHide('factory-import-preview-wrap'); _fiiHide('factory-import-result');
  var cb = _fiiEl('factory-import-confirm-btn'); if (cb) cb.disabled = true;
  var ro = _fiiEl('factory-import-scope-readout');
  if (ro) {
    if (_fiiFactory.warehouseId) { ro.style.display = 'block'; ro.innerHTML = 'Import scope — Factory: <strong>' + _fiiEsc(_fiiFactory.warehouseId) + (_fiiFactory.warehouseCode ? ' / ' + _fiiEsc(_fiiFactory.warehouseCode) : '') + '</strong>. One file = one factory.'; }
    else { ro.style.display = 'none'; ro.innerHTML = ''; }
  }
  _fiiSetText('factory-import-parsestat', '');
}
function _fiiSetText(id, t) { var e = _fiiEl(id); if (e) e.textContent = t; }
function _fiiShow(id) { var e = _fiiEl(id); if (e) e.hidden = false; }
function _fiiHide(id) { var e = _fiiEl(id); if (e) e.hidden = true; }
function _fiiEsc(v) { return (typeof _fmvEscapeHtml === 'function') ? _fmvEscapeHtml(v == null ? '' : v) : String(v == null ? '' : v); }
function _fiiParseError(msg) {
  _fiiRows = null; _fiiValidated = null;
  _fiiSetText('factory-import-parsestat', '');
  _fiiHide('factory-import-summary'); _fiiHide('factory-import-preview-wrap');
  var r = _fiiEl('factory-import-result'); if (r) { r.hidden = false; r.innerHTML = '<div class="fii-error">' + _fiiEsc(msg) + '</div>'; }
  var cb = _fiiEl('factory-import-confirm-btn'); if (cb) cb.disabled = true;
}

function openFactoryImportModal() {
  var overlay = _fiiEl('factory-import-overlay'), modal = _fiiEl('factory-import-modal');
  if (!modal || !overlay) return;
  _fiiRows = null; _fiiValidated = null; _fiiBatchId = null; _fiiSubmitting = false; _fiiCompleted = false;
  _fiiFactory = { warehouseId: '', warehouseCode: '' };
  _fiiPopulateFactories();
  var roEl = _fiiEl('factory-import-scope-readout'); if (roEl) { roEl.style.display = 'none'; roEl.innerHTML = ''; }
  var fileEl = _fiiEl('factory-import-file'); if (fileEl) { fileEl.value = ''; fileEl.disabled = true; }   // enabled only after a factory is chosen
  _fiiSetText('factory-import-parsestat', '');
  _fiiHide('factory-import-summary'); _fiiHide('factory-import-preview-wrap'); _fiiHide('factory-import-result');
  var cb = _fiiEl('factory-import-confirm-btn'); if (cb) { cb.disabled = true; cb.textContent = 'Import'; }
  overlay.classList.add('is-open'); modal.classList.add('is-open');
  if (!_fiiKeyBound) {
    document.addEventListener('keydown', function (e) { var m = _fiiEl('factory-import-modal'); if (e.key === 'Escape' && m && m.classList.contains('is-open')) closeFactoryImportModal(); });
    _fiiKeyBound = true;
  }
}
function closeFactoryImportModal() { var o = _fiiEl('factory-import-overlay'), m = _fiiEl('factory-import-modal'); if (o) o.classList.remove('is-open'); if (m) m.classList.remove('is-open'); }

function _fiiSanitizeFilePart_(s) { return String(s || '').trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'NA'; }
// F1-7N-UX-FACTORY-IMPORT-TEMPLATE-SCOPE-AND-DONE-FIX-R1 — the template is SCOPED to the CURRENTLY selected factory
// (mirrors the Overseas scoped template): warehouse_id dropdown = the selected id only, example row prefilled with the
// selected factory. Regenerated fresh from _fiiFactory on every click (no Blob cache), so switching factories without a
// reload always yields the selected factory's template. If no factory is selected, do NOT emit an unscoped/default
// template — use the existing notice convention. Column contract + SET_CURRENT_STOCK semantics are unchanged.
function downloadFactoryImportTemplate() {
  if (!(window.KM && window.KM.templateExport && window.KM.templateExport.buildAndDownload)) { alert('Template engine (ExcelJS) not available.'); return; }
  if (!_fiiFactory.warehouseId) { alert('Select a factory first.'); return; }
  var selId = _fiiFactory.warehouseId, selCode = _fiiFactory.warehouseCode || '';
  var skus = (_fsGet('skuDetails') || []).map(function (s) { return s.sku; }).filter(Boolean);
  var columns = [
    { key: 'warehouse_id', header: 'warehouse_id', kind: 'business', width: 22, comment: 'REQUIRED. Prefilled with the selected factory (' + selId + '). Do NOT change — one file = one factory; the server rejects any other warehouse_id.', dropdown: [selId] },
    { key: 'warehouse_code', header: 'warehouse_code', kind: 'business', width: 18, comment: 'Optional human-readable check — must be the selected factory code' + (selCode ? ' (' + selCode + ')' : '') + '. Conflicting with warehouse_id rejects the row (WAREHOUSE_ID_CODE_MISMATCH).' },
    { key: 'sku', header: 'sku', kind: 'business', width: 22, comment: 'REQUIRED. Canonical SKU from SKU Details (NOT site_sku).' },
    { key: 'current_stock_qty', header: 'current_stock_qty', kind: 'business', width: 18, comment: 'REQUIRED non-negative whole number. 0 valid; BLANK = missing (not 0); negatives/decimals rejected. SETS current stock.' },
    { key: 'effective_date', header: 'effective_date', kind: 'business', width: 15, comment: 'Optional ISO date YYYY-MM-DD (audit only). Blank → server write date.' },
    { key: 'note', header: 'note', kind: 'business', width: 30, comment: 'Optional note (max 500 chars).' }
  ];
  var spec = {
    filename: 'Factory_Inventory_' + _fiiSanitizeFilePart_(selId) + '_Import_Template.xlsx',
    sheetName: 'Factory Inventory Import',
    instructionRow: 'This import updates ONE factory only — Factory: ' + selId + (selCode ? ' / ' + selCode : '') + '. warehouse_id is prefilled; do not mix factories. SET_CURRENT_STOCK — imported current_stock_qty BECOMES the factory current stock for warehouse_id + sku (it does NOT add). Reserved / in-production / pending shipout / orders / shipments are never changed. The server rejects any other / non-factory / inactive warehouse.',
    masterTemplate: true,
    columns: columns,
    exampleRow: { warehouse_id: selId, warehouse_code: selCode, sku: (skus[0] || 'CO1100-R'), current_stock_qty: 0, effective_date: '', note: 'initial import' },
    system: { template_id: 'factory_inventory_import', template_name: 'Factory Inventory Import', template_version: '2', module: 'factory_inventory', export_mode: 'import', source_system: 'operation-system', scope_warehouse_id: selId }
  };
  window.KM.templateExport.buildAndDownload(spec).catch(function (err) { alert('Template download failed: ' + (err && err.message ? err.message : err)); });
}

// ---- Parsing (browser; .xlsx via ExcelJS, .csv hand-parsed). Reads cell VALUES only. ----
function _fiiSplitCsvLine(line) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else { q = false; } } else { cur += c; } }
    else { if (c === '"') { q = true; } else if (c === ',') { out.push(cur); cur = ''; } else { cur += c; } }
  }
  out.push(cur);
  return out;
}
function _fiiAssertHeaders(headers) {
  var seen = {};
  headers.forEach(function (h) {
    if (String(h).trim() === '') throw new Error('Blank column header in the file.');
    if (seen[h]) throw new Error('Duplicate column header: ' + h);
    seen[h] = 1;
  });
  for (var i = 0; i < _FII_REQUIRED_HEADERS.length; i++) {
    if (headers.indexOf(_FII_REQUIRED_HEADERS[i]) < 0) throw new Error('Missing required column: ' + _FII_REQUIRED_HEADERS[i]);
  }
}
function _fiiCsvToRows(text) {
  var raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  while (raw.length && raw[raw.length - 1] === '') raw.pop();
  if (!raw.length) throw new Error('Empty file.');
  var headers = _fiiSplitCsvLine(raw[0]).map(function (h) { return String(h).trim().toLowerCase(); });
  _fiiAssertHeaders(headers);
  var rows = [];
  for (var i = 1; i < raw.length; i++) {
    if (raw[i] === '') continue;
    var cells = _fiiSplitCsvLine(raw[i]);
    var obj = { __row: i + 1 };
    headers.forEach(function (h, ci) { obj[h] = cells[ci] != null ? String(cells[ci]).trim() : ''; });
    if (String(obj.row_type || '').trim().toLowerCase() === 'example') continue;
    rows.push(obj);
    if (rows.length > _FII_MAX_ROWS) throw new Error('Too many rows (max ' + _FII_MAX_ROWS + ').');
  }
  return rows;
}
function _fiiParseCsv(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function () { reject(new Error('Could not read the file.')); };
    reader.onload = function () { try { resolve(_fiiCsvToRows(String(reader.result || ''))); } catch (e) { reject(e); } };
    reader.readAsText(file);
  });
}
function _fiiCellText(cell) {
  var v = cell ? cell.value : null;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.result != null) return String(v.result);         // formula → computed result (never the formula text)
    if (v.text != null) return String(v.text);
    if (Array.isArray(v.richText)) return v.richText.map(function (t) { return t.text; }).join('');
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }
  return String(v);
}
function _fiiXlsxRowValues(row) {
  var out = [];
  var n = row && row.cellCount ? row.cellCount : (row && row.actualCellCount ? row.actualCellCount : 0);
  var last = Math.max(n, (row && row._cells ? row._cells.length : 0), 32);
  for (var c = 1; c <= last; c++) out.push(_fiiCellText(row.getCell(c)).trim());
  return out;
}
function _fiiParseXlsx(file) {
  return new Promise(function (resolve, reject) {
    if (!(window.ExcelJS && window.ExcelJS.Workbook)) { reject(new Error('XLSX engine (ExcelJS) not loaded.')); return; }
    var reader = new FileReader();
    reader.onerror = function () { reject(new Error('Could not read the file.')); };
    reader.onload = function () {
      var wb = new window.ExcelJS.Workbook();
      wb.xlsx.load(reader.result).then(function () {
        var ws = null;
        wb.eachSheet(function (sheet) { if (!ws && String(sheet.name) !== '_SYSTEM') ws = sheet; });
        if (!ws) { reject(new Error('No worksheet found.')); return; }
        var headerRowIdx = -1, headers = [];
        for (var r = 1; r <= Math.min(ws.rowCount, 12); r++) {
          var lc = _fiiXlsxRowValues(ws.getRow(r)).map(function (v) { return String(v).trim().toLowerCase(); });
          if (lc.indexOf('warehouse_id') >= 0 && lc.indexOf('sku') >= 0) { headerRowIdx = r; headers = lc; break; }
        }
        if (headerRowIdx < 0) { reject(new Error('Header row (warehouse_id, sku, current_stock_qty) not found.')); return; }
        // trim trailing blank header cells
        while (headers.length && headers[headers.length - 1] === '') headers.pop();
        try { _fiiAssertHeaders(headers); } catch (e) { reject(e); return; }
        var rows = [];
        for (var rr = headerRowIdx + 1; rr <= ws.rowCount; rr++) {
          var cells = _fiiXlsxRowValues(ws.getRow(rr));
          if (!cells.length || cells.every(function (c) { return String(c).trim() === ''; })) continue;
          var obj = { __row: rr };
          headers.forEach(function (h, ci) { obj[h] = cells[ci] != null ? String(cells[ci]).trim() : ''; });
          if (String(obj.row_type || '').trim().toLowerCase() === 'example') continue;
          rows.push(obj);
          if (rows.length > _FII_MAX_ROWS) { reject(new Error('Too many rows (max ' + _FII_MAX_ROWS + ').')); return; }
        }
        resolve(rows);
      }).catch(function (e) { reject(new Error('Could not parse the workbook: ' + (e && e.message ? e.message : e))); });
    };
    reader.readAsArrayBuffer(file);
  });
}

function _fiiOnFileChosen() {
  var fileEl = _fiiEl('factory-import-file');
  var file = fileEl && fileEl.files && fileEl.files[0];
  _fiiValidated = null; _fiiRows = null;
  _fiiHide('factory-import-summary'); _fiiHide('factory-import-preview-wrap'); _fiiHide('factory-import-result');
  var cb = _fiiEl('factory-import-confirm-btn'); if (cb) cb.disabled = true;
  if (!file) { _fiiSetText('factory-import-parsestat', ''); return; }
  if (file.size > _FII_MAX_BYTES) { _fiiParseError('File too large (max 5 MB).'); return; }
  var name = String(file.name || '').toLowerCase();
  var isXlsx = /\.xlsx$/.test(name), isCsv = /\.csv$/.test(name);
  if (!isXlsx && !isCsv) { _fiiParseError('Unsupported file type. Use .xlsx or .csv.'); return; }
  _fiiSetText('factory-import-parsestat', 'Parsing…');
  (isXlsx ? _fiiParseXlsx(file) : _fiiParseCsv(file))
    .then(function (rows) { _fiiRows = rows; return _fiiValidate(); })
    .catch(function (err) { _fiiParseError(err && err.message ? err.message : String(err)); });
}

// Advisory-only client duplicate check (server is authoritative). Returns {identical, conflict} counts.
function _fiiClientDupScan(rows) {
  var seen = {}, identical = 0, conflict = 0;
  (rows || []).forEach(function (r) {
    var wh = String(r.warehouse_id || '').trim(), sku = String(r.sku || '').trim(), q = String(r.current_stock_qty == null ? '' : r.current_stock_qty).trim();
    if (!wh || !sku) return;
    var k = wh + '||' + sku;
    if (!seen.hasOwnProperty(k)) seen[k] = q;
    else if (seen[k] === q) identical++; else conflict++;
  });
  return { identical: identical, conflict: conflict };
}
function _fiiMakeBatchId() {
  var d = new Date();
  var ymd = '' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  var suffix = (Math.abs((Date.now() % 0xffffffff)).toString(16) + '00000000').slice(0, 8).toUpperCase();
  return 'FII-' + ymd + '-' + suffix;
}
function _fiiValidate() {
  var rows = _fiiRows || [];
  if (!rows.length) { _fiiParseError('No data rows found in the file.'); return Promise.resolve(); }
  // F1-7N advisory scope pre-check (server re-validates authoritatively): factory selected + one-factory-per-file.
  var _scope = { warehouse_id: _fiiFactory.warehouseId, warehouse_code: _fiiFactory.warehouseCode };
  var _sc = _fiiFactoryScopeCheck(rows, _scope);
  if (!_sc.ok) { _fiiParseError(_sc.error); return Promise.resolve(); }
  _fiiSetText('factory-import-parsestat', 'Validating ' + rows.length + ' row(s)…');
  _fiiBatchId = _fiiMakeBatchId();
  if (!(window.KM && window.KM.DB && window.KM.DB.factoryInventoryImportValidate)) { _fiiParseError('Import API not available.'); return Promise.resolve(); }
  return Promise.resolve(window.KM.DB.factoryInventoryImportValidate({ rows: rows, importBatchId: _fiiBatchId, created_by: 'operation-system', scope: _scope }))
    .then(function (resp) {
      if (!resp || resp.success === false) { _fiiParseError((resp && resp.error) || 'Validation failed.'); return; }
      _fiiValidated = resp.data || null;
      if (_fiiValidated && _fiiValidated.importBatchId) _fiiBatchId = _fiiValidated.importBatchId;
      _fiiRenderPreview(_fiiValidated);
    })
    .catch(function (err) { _fiiParseError(err && err.message ? err.message : String(err)); });
}

function _fiiRenderPreview(data) {
  data = data || {}; var s = data.summary || {};
  _fiiSetText('factory-import-parsestat', '');
  var sumEl = _fiiEl('factory-import-summary');
  if (sumEl) {
    sumEl.hidden = false;
    var affWh = {}, affSku = {}; (data.previewRows || []).forEach(function (p) { if (p.warehouse_id) affWh[p.warehouse_id] = 1; if (p.sku) affSku[p.sku] = 1; });
    sumEl.innerHTML =
      '<div class="fii-mode">Mode: <strong>SET_CURRENT_STOCK</strong> · Batch <code>' + _fiiEsc(data.importBatchId || '') + '</code></div>' +
      '<div class="fii-counts">Total ' + (s.totalRows || 0) + ' · Valid ' + (s.validRows || 0) + ' · Invalid <strong class="' + ((s.invalidRows || 0) > 0 ? 'fii-bad' : '') + '">' + (s.invalidRows || 0) + '</strong>' +
      ' · Create ' + (s.createRows || 0) + ' · Update ' + (s.updateRows || 0) + ' · Unchanged ' + (s.unchangedRows || 0) + ' · Duplicate ' + (s.duplicateRows || 0) +
      ' · Factories ' + Object.keys(affWh).length + ' · SKUs ' + Object.keys(affSku).length + '</div>';
  }
  var wrap = _fiiEl('factory-import-preview-wrap'), body = _fiiEl('factory-import-preview-body');
  if (wrap && body) {
    wrap.hidden = false;
    body.innerHTML = (data.previewRows || []).map(function (p) {
      var cls = 'fii-st-' + String(p.status || '').toLowerCase();
      var diff = (p.difference == null) ? '—' : (p.difference > 0 ? '+' + p.difference : String(p.difference));
      return '<tr class="' + cls + '">' +
        '<td>' + _fiiEsc(String(p.row)) + '</td>' +
        '<td>' + _fiiEsc(p.warehouse_id) + '</td>' +
        '<td>' + _fiiEsc(p.sku) + '</td>' +
        '<td class="fii-num">' + (p.existingCurrentStock == null ? '—' : _fiiEsc(String(p.existingCurrentStock))) + '</td>' +
        '<td class="fii-num">' + (p.importedCurrentStock == null ? '—' : _fiiEsc(String(p.importedCurrentStock))) + '</td>' +
        '<td class="fii-num">' + _fiiEsc(diff) + '</td>' +
        '<td>' + _fiiEsc(p.status) + '</td>' +
        '<td>' + (p.issue ? '<code>' + _fiiEsc(p.issue) + '</code>' : '') + '</td>' +
        '<td>' + _fiiEsc(p.note) + '</td>' +
        '</tr>';
    }).join('');
  }
  // ATOMIC gate: any blocking (invalid) row disables Confirm; nothing-to-write also disables it.
  var canImport = (s.invalidRows || 0) === 0 && ((s.createRows || 0) + (s.updateRows || 0)) > 0;
  var cb = _fiiEl('factory-import-confirm-btn');
  if (cb) { cb.disabled = !canImport; cb.textContent = 'Import'; }
  var note = _fiiEl('factory-import-blocknote');
  if (note) note.textContent = (s.invalidRows || 0) > 0 ? ('Import blocked — ' + s.invalidRows + ' invalid row(s). Fix the file and re-upload. Nothing will be written.') :
    (((s.createRows || 0) + (s.updateRows || 0)) === 0 ? 'Nothing to import (all rows unchanged).' : 'This import will SET Factory Current Stock to the imported quantities. It will NOT add. It will NOT change reserved / in-production / pending shipout / orders / shipments.');
}

// F1-7N: the primary button is relabeled "Done" after a successful commit; clicking it then closes (never re-imports).
function _fiiDone() {
  _fiiCompleted = false; _fiiSubmitting = false;
  _fiiRows = null; _fiiValidated = null; _fiiBatchId = null;
  _fiiHide('factory-import-result'); _fiiHide('factory-import-summary'); _fiiHide('factory-import-preview-wrap');
  closeFactoryImportModal();                                      // clears the overlay + modal is-open state (no invisible backdrop)
}
function confirmFactoryImport() {
  if (_fiiCompleted) { _fiiDone(); return; }                     // the button is now "Done" → close, do NOT re-import
  if (_fiiSubmitting) return;                                     // double-click → ONE commit
  if (!_fiiValidated || !_fiiBatchId) return;
  if ((_fiiValidated.summary && _fiiValidated.summary.invalidRows) > 0) return;   // never commit a blocking batch
  _fiiSubmitting = true;
  var btn = _fiiEl('factory-import-confirm-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
  Promise.resolve(window.KM.DB.factoryInventoryImportCommit({ rows: _fiiRows, importBatchId: _fiiBatchId, created_by: 'operation-system', scope: { warehouse_id: _fiiFactory.warehouseId, warehouse_code: _fiiFactory.warehouseCode } }))
    .then(function (resp) {
      if (!resp || resp.success === false) {
        _fiiSubmitting = false; if (btn) { btn.disabled = false; btn.textContent = 'Import'; }
        _fiiRenderResult(resp, true); return;
      }
      _fiiRenderResult(resp, false);
      // F1-7N: commit succeeded — the primary button becomes an enabled "Done" that CLOSES (via _fiiCompleted branch).
      _fiiCompleted = true; _fiiSubmitting = false;
      if (btn) { btn.textContent = 'Done'; btn.disabled = false; }
      return _fiiRefreshAfterCommit();                            // decoupled targeted readback (never whole-DB reload) — runs exactly once here
    })
    .catch(function (err) {
      // Commit ACK unknown (transport error) — reassure, do NOT resend automatically.
      _fiiSubmitting = false; if (btn) { btn.disabled = false; btn.textContent = 'Import'; }
      _fiiRenderResult({ error: (err && err.message) ? err.message : String(err) }, true);
    });
}
function _fiiRenderResult(resp, isErr) {
  var el = _fiiEl('factory-import-result'); if (!el) return;
  el.hidden = false;
  if (isErr) { el.innerHTML = '<div class="fii-error">Import failed: ' + _fiiEsc(resp && resp.error ? resp.error : 'unknown error') + '</div>'; return; }
  var d = (resp && resp.data) || {};
  el.innerHTML = '<div class="fii-ok">Import committed.</div>' +
    '<div>Batch <code>' + _fiiEsc(d.importBatchId || '') + '</code></div>' +
    '<div>Created ' + (d.createdRows || 0) + ' · Updated ' + (d.updatedRows || 0) + ' · Unchanged ' + (d.unchangedRows || 0) + ' · Movements ' + (d.movementRows || 0) + ' · Failed ' + (d.failedRows || 0) + '</div>';
}
function _fiiRefreshAfterCommit() {
  var root = document.querySelector('#factory-stock-section');
  // F1-7J-A3: canonical → scoped re-read (bounded); Legacy → the existing targeted broad re-GET (refreshFactoryStockTables).
  if (_fsScopedActive()) {
    return new Promise(function (resolve) {
      _fsAfterWrite(function () {
        if (typeof renderFactoryStockTable === 'function') renderFactoryStockTable(root);
        var mp = root && root.querySelector('[data-fs-panel="movement"]');
        if (mp && mp.style.display !== 'none' && typeof renderFactoryMovementTable === 'function') { _factoryMovementSearched = true; renderFactoryMovementTable(root); }
        resolve();
      });
    });
  }
  if (!(window.KM && window.KM.DB && window.KM.DB.refreshFactoryStockTables)) { if (typeof renderFactoryStockTable === 'function') renderFactoryStockTable(root); return; }
  return Promise.resolve(window.KM.DB.refreshFactoryStockTables())
    .then(function () {
      if (typeof renderFactoryStockTable === 'function') renderFactoryStockTable(root);
      var movPanel = root && root.querySelector('[data-fs-panel="movement"]');
      if (movPanel && movPanel.style.display !== 'none' && typeof renderFactoryMovementTable === 'function') { _factoryMovementSearched = true; renderFactoryMovementTable(root); }
    })
    .catch(function () {
      var res = _fiiEl('factory-import-result'); if (res) res.innerHTML += '<div class="fii-reconfirm">Import committed. Reconfirming Factory Inventory…</div>';
    });
}
// __FIIPAGE_END__ (test extraction marker — do not remove)

window.openFactoryImportModal = openFactoryImportModal;
window.closeFactoryImportModal = closeFactoryImportModal;
window.downloadFactoryImportTemplate = downloadFactoryImportTemplate;
window._fiiOnFileChosen = _fiiOnFileChosen;
window._fiiOnFactoryChosen = _fiiOnFactoryChosen;
window.confirmFactoryImport = confirmFactoryImport;
window._fiiDone = _fiiDone;

// ========================================
// Lifecycle 註冊
// ========================================
// Ensure the Factory Stock markup is present before initFactoryStockPage runs.
// Idempotent: if #factory-stock-section already exists, resolves immediately (no re-fetch, no
// duplicate). Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureFactoryStockMarkup() {
    if (document.getElementById('factory-stock-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('factory-stock', 'assets/html/pages/factory-stock.html', '#factory-stock-mount')
            .then(function() {
                if (!document.getElementById('factory-stock-section')) {
                    console.warn('[FactoryStock] partial loaded but #factory-stock-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[FactoryStock] failed to load partial:', err);
                return false;
            });
    }
    console.warn('[FactoryStock] KM.partialLoader unavailable; markup not loaded.');
    return Promise.resolve(false);
}

if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('factory-stock-section', {
        mount() {
            console.log('[FactoryStock] mount');
            // Markup is partial-loaded (Phase 3-2). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open) and init.
            _ensureFactoryStockMarkup().then(function() {
                var sec = document.getElementById('factory-stock-section');
                if (sec) sec.classList.add('active');
                if (window.initFactoryStockPage) {
                    window.initFactoryStockPage();
                }
            });
        },
        unmount() {
            console.log('[FactoryStock] unmount');
            var root = document.querySelector('#factory-stock-section');
            if (root) {
                var scrollCol = root.querySelector('.scroll-col');
                if (scrollCol && scrollCol._syncHandler) {
                    scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
                }
                if (root._clickHandler) {
                    document.removeEventListener('click', root._clickHandler);
                }
            }
        }
    });
}

// ============================================================================
// F1-7N-UX-WAREHOUSE-ACTIONS-MORE-OPTIONS-R1 — "More Options" dropdown (UI-only consolidation of Import Inventory +
// Inventory Adjustment). Mirrors the Site Inventory / SKU Details More Options idiom: page-scoped trigger + list,
// outside-click + Escape close, keyboard nav, guarded single global-listener binding. Each item calls the EXISTING
// handler verbatim — no second flow, no inventory/API/formula change, no write on open.
// ============================================================================
var _factoryActionsBound = false;
function _factoryActionsEls() {
    return {
        menu: document.getElementById('factoryActionsMenu'),
        trigger: document.getElementById('factoryActionsTrigger'),
        list: document.getElementById('factoryActionsList')
    };
}
function _factoryActionsItems() {
    var e = _factoryActionsEls();
    if (!e.list) return [];
    return Array.prototype.slice.call(e.list.querySelectorAll('.fs-actions-menu__item'))
        .filter(function (b) { return !b.disabled; });
}
function _factoryActionsOpen() {
    var e = _factoryActionsEls();
    if (!e.list || !e.trigger || !e.list.hidden) return;
    e.list.hidden = false;
    e.trigger.setAttribute('aria-expanded', 'true');
    if (e.menu) e.menu.classList.add('is-open');
    _factoryBindActionsMenuGlobal();
    var first = _factoryActionsItems()[0];
    if (first) first.focus();
}
function _factoryActionsClose(returnFocus) {
    var e = _factoryActionsEls();
    if (!e.list || e.list.hidden) return;
    e.list.hidden = true;
    if (e.trigger) e.trigger.setAttribute('aria-expanded', 'false');
    if (e.menu) e.menu.classList.remove('is-open');
    if (returnFocus && e.trigger) e.trigger.focus();
}
// Click trigger → toggle. stopPropagation so the just-fired click doesn't hit the outside-click closer.
function toggleFactoryActionsMenu(ev) {
    if (ev) { try { ev.stopPropagation(); } catch (_e) {} }
    var e = _factoryActionsEls();
    if (!e.list) return;
    if (e.list.hidden) _factoryActionsOpen(); else _factoryActionsClose(false);
}
// Run one action = reuse the EXISTING handler verbatim, then close the menu (one item → one handler call).
function runFactoryAction(kind) {
    _factoryActionsClose(false);
    if (kind === 'import' && typeof openFactoryImportModal === 'function') return openFactoryImportModal();
    if (kind === 'adjust' && typeof openFactoryInventoryAdjustModal === 'function') return openFactoryInventoryAdjustModal();
    if (kind === 'twSettings' && typeof openTwFactorySettingsModal === 'function') return openTwFactorySettingsModal();
}
// Bind outside-click + keyboard ONCE (guarded — repeated open/close never stacks listeners). Acts only while open.
function _factoryBindActionsMenuGlobal() {
    if (_factoryActionsBound) return;
    document.addEventListener('click', function (ev) {
        var e = _factoryActionsEls();
        if (!e.list || e.list.hidden) return;
        if (ev.target && ev.target.closest && ev.target.closest('#factoryActionsMenu')) return; // inside
        _factoryActionsClose(false);
    });
    document.addEventListener('keydown', function (ev) {
        var e = _factoryActionsEls();
        if (!e.list || e.list.hidden) return;
        var items = _factoryActionsItems();
        if (!items.length) return;
        var idx = items.indexOf(document.activeElement);
        if (ev.key === 'Escape') { ev.preventDefault(); _factoryActionsClose(true); }
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); (items[(idx + 1) % items.length] || items[0]).focus(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); (items[(idx - 1 + items.length) % items.length] || items[items.length - 1]).focus(); }
        else if (ev.key === 'Home') { ev.preventDefault(); items[0].focus(); }
        else if (ev.key === 'End') { ev.preventDefault(); items[items.length - 1].focus(); }
        else if (ev.key === 'Tab') { _factoryActionsClose(false); }
    });
    _factoryActionsBound = true;
}
window.toggleFactoryActionsMenu = toggleFactoryActionsMenu;
window.runFactoryAction = runFactoryAction;

// ============================================================================
// F1-7N-TW-FACTORY-OPERATIONAL-CONFIG-R1 — TW Factory Settings modal. Two Phase-1 TW operational-policy toggles
// (New SKU Participation, General Allocation) persisted in the KM_FACTORY_OPERATION_CONFIG Script-Property blob via
// factoryOperationConfig.get / .save. READ-only on open; SAVE changes operational policy ONLY (no inventory write,
// no Sheet tab, no row create/delete). Missing config → both OFF. No localStorage.
// ============================================================================
var _twSettingsSubmitting = false;
var _twSettingsKeyBound = false;
function _twSettingsEls() {
    return {
        overlay: document.getElementById('tw-factory-settings-overlay'),
        modal: document.getElementById('tw-factory-settings-modal'),
        newsku: document.getElementById('tw-setting-newsku'),
        genalloc: document.getElementById('tw-setting-genalloc'),
        result: document.getElementById('tw-factory-settings-result'),
        saveBtn: document.getElementById('tw-factory-settings-save-btn')
    };
}
function closeTwFactorySettingsModal() {
    var e = _twSettingsEls();
    if (e.overlay) e.overlay.classList.remove('is-open');
    if (e.modal) e.modal.classList.remove('is-open');
    _twSettingsSubmitting = false;
}
// Open + READ-BACK the current policy from the backend config (never localStorage). Absent config → both OFF.
function openTwFactorySettingsModal() {
    var e = _twSettingsEls();
    if (!e.overlay || !e.modal) return;
    if (e.result) { e.result.hidden = true; e.result.innerHTML = ''; }
    // fail-safe defaults shown immediately; the async read overwrites them with the persisted policy.
    if (e.newsku) e.newsku.checked = false;
    if (e.genalloc) e.genalloc.checked = false;
    if (e.saveBtn) { e.saveBtn.disabled = false; e.saveBtn.textContent = 'Save'; }
    _twSettingsSubmitting = false;
    e.overlay.classList.add('is-open');
    e.modal.classList.add('is-open');
    if (!_twSettingsKeyBound) {
        document.addEventListener('keydown', function (ev) {
            var els = _twSettingsEls();
            if (!els.modal || !els.modal.classList.contains('is-open')) return;
            if (ev.key === 'Escape') { ev.preventDefault(); closeTwFactorySettingsModal(); }
        });
        _twSettingsKeyBound = true;
    }
    if (window.KM && window.KM.DB && typeof window.KM.DB.getFactoryOperationConfig === 'function') {
        window.KM.DB.getFactoryOperationConfig().then(function (data) {
            var tw = (data && data.tw) || {};
            var els = _twSettingsEls();
            if (els.newsku) els.newsku.checked = tw.newSkuParticipationEnabled === true;
            if (els.genalloc) els.genalloc.checked = tw.generalAllocationEnabled === true;
        }).catch(function (err) {
            console.warn('[FactoryStock] TW settings read failed:', err);
        });
    }
}
// SAVE = operational policy ONLY. Sends the two booleans; no inventory payload, no row mutation.
function saveTwFactorySettings() {
    if (_twSettingsSubmitting) return;
    var e = _twSettingsEls();
    if (!e.modal) return;
    var payload = { tw: {
        newSkuParticipationEnabled: !!(e.newsku && e.newsku.checked),
        generalAllocationEnabled: !!(e.genalloc && e.genalloc.checked)
    } };
    if (!(window.KM && window.KM.DB && typeof window.KM.DB.saveFactoryOperationConfig === 'function')) {
        if (e.result) { e.result.hidden = false; e.result.textContent = 'API not configured — settings not saved.'; }
        return;
    }
    _twSettingsSubmitting = true;
    if (e.saveBtn) { e.saveBtn.disabled = true; e.saveBtn.textContent = 'Saving…'; }
    window.KM.DB.saveFactoryOperationConfig(payload).then(function () {
        closeTwFactorySettingsModal();
    }).catch(function (err) {
        _twSettingsSubmitting = false;
        if (e.saveBtn) { e.saveBtn.disabled = false; e.saveBtn.textContent = 'Save'; }
        if (e.result) { e.result.hidden = false; e.result.textContent = 'Save failed: ' + ((err && err.message) || err); }
    });
}
window.openTwFactorySettingsModal = openTwFactorySettingsModal;
window.closeTwFactorySettingsModal = closeTwFactorySettingsModal;
window.saveTwFactorySettings = saveTwFactorySettings;
