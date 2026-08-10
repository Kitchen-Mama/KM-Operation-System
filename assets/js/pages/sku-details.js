// SKU Details 統一滾動控制
(function() {
    let unifiedScroll = null;
    let scrollCols = [];
    let isInitialized = false;
    
    function initSkuScroll() {
        const skuSection = document.getElementById('sku-section');
        if (!skuSection || isInitialized) return;
        
        const skuDetailsSection = skuSection.querySelector('#skuDetailsSection');
        if (!skuDetailsSection) return;
        
        scrollCols = Array.from(skuSection.querySelectorAll('.scroll-col'));
        if (scrollCols.length === 0) return;
        
        if (!unifiedScroll) {
            unifiedScroll = document.createElement('div');
            unifiedScroll.className = 'sku-unified-scroll';
            unifiedScroll.innerHTML = '<div class="sku-unified-scroll-content"></div>';
            skuDetailsSection.appendChild(unifiedScroll);
        }
        
        isInitialized = true;
        updateScrollWidth();
        
        unifiedScroll.addEventListener('scroll', function() {
            const scrollLeft = this.scrollLeft;
            scrollCols.forEach(col => { col.scrollLeft = scrollLeft; });
        });
        
        scrollCols.forEach(col => {
            col.addEventListener('wheel', function(e) {
                if (e.shiftKey || e.deltaX !== 0) {
                    e.preventDefault();
                    const delta = e.shiftKey ? e.deltaY : e.deltaX;
                    unifiedScroll.scrollLeft += delta;
                }
            }, { passive: false });
        });
    }
    
    function updateScrollWidth() {
        if (!unifiedScroll || scrollCols.length === 0) return;
        let maxScrollWidth = 0;
        scrollCols.forEach(col => {
            if (col.scrollWidth > maxScrollWidth) maxScrollWidth = col.scrollWidth;
        });
        const content = unifiedScroll.querySelector('.sku-unified-scroll-content');
        content.style.width = (maxScrollWidth + 200) + 'px';
    }
    
    window.addEventListener('DOMContentLoaded', function() { setTimeout(initSkuScroll, 100); });
    window.addEventListener('resize', function() { updateScrollWidth(); });
    
    const observer = new MutationObserver(function() {
        const skuSection = document.getElementById('sku-section');
        if (skuSection && !skuSection.classList.contains('is-hidden')) {
            if (!isInitialized) setTimeout(initSkuScroll, 100);
            setTimeout(updateScrollWidth, 200);
        }
    });
    setTimeout(function() {
        const skuSection = document.getElementById('sku-section');
        if (skuSection) observer.observe(skuSection, { attributes: true, attributeFilter: ['class'] });
    }, 500);
    
    window.updateSkuScrollWidth = updateScrollWidth;
    window.initSkuScroll = initSkuScroll;
})();


// ========================================
// SKU Details Page Logic
// ========================================

function renderSkuDetailsTable() {
    const groups = window.getAllSkuDataWithOverrides ? getAllSkuDataWithOverrides() : null;
    if (groups) {
        renderSkuLifecycleTable('upcoming', groups['Upcoming SKU']);
        renderSkuLifecycleTable('running', groups['Running in the Market']);
        renderSkuLifecycleTable('phasing', groups['Phasing Out']);
        renderSkuLifecycleTable('closure', groups['Closure'] || []);
    } else {
        renderSkuLifecycleTable('upcoming', window.upcomingSkuData || []);
        renderSkuLifecycleTable('running', window.runningSkuData || []);
        renderSkuLifecycleTable('phasing', window.phasingOutSkuData || []);
    }
    // Rebuild filter options from the freshly-rendered rows (new Series/Category values appear here),
    // then re-apply the active Search/Series/Category filters so a re-render never resets them.
    populateSkuFilters();
    applySkuFilters();
    setTimeout(() => { syncSkuHeaderScroll(); }, 100);
}

// Item Dimensions cell: "{A} + {B} {unit}" when a secondary size exists, else "{A} {unit}".
// Each numeric group is a .dim-line span so the CM/IN unit toggle can still convert it; the unit
// suffix (.dim-unit) toggles cm↔in too. The secondary size is product-content display only — it is
// NOT used for carton CBM (logistics uses carton_* — see SKU_DETAILS_LOGISTICS_SPEC §2/§4).
function _skuItemDimCell(item) {
    var d1 = item.itemDimensions || item.item_dimensions || '';
    var d2 = item.itemDimensions2 || '';
    if (!d1 && !d2) return '';
    var unit = String(item.itemDimensionUnit || '').trim() || 'cm';
    var groups = [];
    if (d1) groups.push('<span class="dim-line">' + d1 + '</span>');
    if (d2) groups.push('<span class="dim-line">' + d2 + '</span>');
    return groups.join('<span class="dim-sep"> + </span>') +
        '<span class="dim-unit" data-base-unit="' + unit + '"> ' + unit + '</span>';
}
// Price cell: "{value} {unit}" (units have no metric/imperial toggle, so they are shown inline).
function _skuPrice(val, unit) {
    val = String(val == null ? '' : val).trim();
    if (!val) return '';
    unit = String(unit == null ? '' : unit).trim();
    return unit ? (val + ' ' + unit) : val;
}

function renderSkuLifecycleTable(section, data) {
    const fixedBody = document.getElementById(section + 'FixedBody');
    const scrollBody = document.getElementById(section + 'ScrollBody');
    if (!fixedBody || !scrollBody) return;
    if (!data || data.length === 0) {
        fixedBody.innerHTML = '<div class="fixed-row" style="color:#94a3b8;font-style:italic;">No SKUs</div>';
        scrollBody.innerHTML = '';
        return;
    }
    fixedBody.innerHTML = data.map(function(item) {
        // SKU cell. Single click SELECTS the row; double-click SELECTS + opens the SAME Edit SKU editor
        // used by the top "Edit SKU" action (no second modal, no extra data load). Only this cell edits.
        var skuEsc = String(item.sku).replace(/'/g, "\\'");
        var sel = (_selectedSku && String(item.sku) === String(_selectedSku)) ? ' sku-row-selected' : '';
        return '<div class="fixed-row' + sel + '" data-sku="' + _skuAttr(item.sku) + '" data-series="' + _skuAttr(item.series) + '" data-category="' + _skuAttr(item.category) + '" title="Double-click to edit SKU"' +
            ' onclick="selectSkuRow(\'' + skuEsc + '\')" ondblclick="skuRowDblEdit(\'' + skuEsc + '\', event)">' + item.sku + '</div>';
    }).join('');

    scrollBody.innerHTML = data.map(function(item) {
        var img = window.getNormalizedSkuImage ? getNormalizedSkuImage(item) : (item.image || '');
        var imgHtml = img
            ? '<img src="' + img + '" style="max-width:36px;max-height:36px;object-fit:contain;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'"><span style="display:none;color:#94a3b8">IMG</span>'
            : '<span style="color:#94a3b8">IMG</span>';
        // Status = normal DISPLAY field (edited only via the full Edit SKU modal — no inline dropdown).
        var currentLc = window.getNormalizedSkuStatus ? getNormalizedSkuStatus(item) : (item.status || '');
        var skuEsc = String(item.sku).replace(/'/g, "\\'");
        var sel = (_selectedSku && String(item.sku) === String(_selectedSku)) ? ' sku-row-selected' : '';

        // Column order (2026-07): Product Name CN after Product Name; AMZ ASIN removed; Product Use
        // before Material. Battery/Magnet render via _skuBoolDisplay (No / Yes / original enum text).
        return '<div class="scroll-row' + sel + '" data-sku="' + _skuAttr(item.sku) + '" data-series="' + _skuAttr(item.series) + '" data-category="' + _skuAttr(item.category) + '" onclick="selectSkuRow(\'' + skuEsc + '\')">' +
            '<div class="scroll-cell" data-col="1"><div class="image-placeholder">' + imgHtml + '</div></div>' +
            '<div class="scroll-cell" data-col="2">' + _skuDash(currentLc) + '</div>' +
            '<div class="scroll-cell" data-col="3">' + _skuDash(item.productName) + '</div>' +
            '<div class="scroll-cell" data-col="4">' + _skuDash(item.productNameCn) + '</div>' +
            '<div class="scroll-cell" data-col="5">' + _skuDash(item.series) + '</div>' +
            '<div class="scroll-cell" data-col="6">' + _skuDash(item.category) + '</div>' +
            '<div class="scroll-cell" data-col="7">' + _skuDash(item.gs1Code || item.gs1_code) + '</div>' +
            '<div class="scroll-cell" data-col="8">' + _skuDash(item.gs1Type || item.gs1_type) + '</div>' +
            '<div class="scroll-cell" data-col="9" data-unit="dim">' + _skuItemDimCell(item) + '</div>' +
            '<div class="scroll-cell" data-col="10" data-unit="wt">' + (item.itemWeight || item.item_weight || '') + '</div>' +
            '<div class="scroll-cell" data-col="11" data-unit="dim">' + (item.packageDimensions || item.package || item.package_dimensions || '') + '</div>' +
            '<div class="scroll-cell" data-col="12" data-unit="wt">' + (item.packageWeight || item.package_weight || '') + '</div>' +
            '<div class="scroll-cell" data-col="13" data-unit="dim">' + (item.cartonDimensions || item.carton_dimensions || '') + '</div>' +
            '<div class="scroll-cell" data-col="14" data-unit="wt">' + (item.cartonWeight || item.carton_weight || '') + '</div>' +
            '<div class="scroll-cell" data-col="15">' + (item.unitsPerCarton || item.units_per_carton || '') + '</div>' +
            // Product Use (customs-facing) sits immediately LEFT of Material. HS Code / Declared Value
            // live in tax_referral_rates. Prices use the single base_currency.
            '<div class="scroll-cell" data-col="16">' + _skuDash(item.productUse) + '</div>' +
            '<div class="scroll-cell" data-col="17">' + _skuDash(item.material) + '</div>' +
            '<div class="scroll-cell" data-col="18">' + _skuEnumDisplay(item.batteryType, SKU_BATTERY_LABELS_) + '</div>' +
            '<div class="scroll-cell" data-col="19">' + _skuMagnetDisplay(item.magnetType) + '</div>' +
            '<div class="scroll-cell" data-col="20">' + _skuPrice(item.minimumPrice || item.minimum_price, item.baseCurrency) + '</div>' +
            '<div class="scroll-cell" data-col="21">' + _skuPrice(item.msrp, item.baseCurrency) + '</div>' +
            '<div class="scroll-cell" data-col="22">' + _skuPrice(item.sellingPrice || item.selling_price, item.baseCurrency) + '</div>' +
            '<div class="scroll-cell" data-col="23">' + _skuDash(item.pm) + '</div>' +
        '</div>';
    }).join('');
    // Re-apply selection highlight after a re-render (both fixed + scroll rows).
    if (_selectedSku) selectSkuRow(_selectedSku, true);
}

// Display helpers.
function _skuAttr(v) { return String(v == null ? '' : v).replace(/"/g, '&quot;'); }
function _skuDash(v) { var s = String(v == null ? '' : v).trim(); return s === '' ? '--' : s; }
// Battery/Magnet display: false/none/blank → No; true → Yes; any other value (e.g. Lithium-Ion,
// magnetic) → the original text (extensibility preserved — never permanently boolean).
function _skuBoolDisplay(v) {
    var s = String(v == null ? '' : v).trim();
    var low = s.toLowerCase();
    if (s === '' || low === 'false' || low === 'none' || low === 'no' || low === 'n' || low === '0') return 'No';
    if (low === 'true' || low === 'yes' || low === 'y' || low === '1') return 'Yes';
    return s;
}
// Friendly enum display for the SKU table (Battery / Magnet). Canonical codes → friendly bilingual label;
// blank → '--'; any other (legacy/unrecognized) value → shown verbatim + "(Legacy)" so it is never a raw
// silent code but is also never destroyed/reinterpreted. The stored DB value is unchanged.
function _skuEnumDisplay(v, labels) {
    var s = String(v == null ? '' : v).trim();
    if (s === '') return '--';
    if (labels && labels[s]) return _skuEsc(labels[s]);
    return _skuEsc(s) + ' (Legacy)';
}

function handleSkuStatusChange(sku, newLifecycle) {
    var dropdown = event ? event.target : null;
    if (dropdown) dropdown.disabled = true;
    showSkuStatusToast('Saving...');

    if (window.KM && window.KM.DB && window.KM.DB.updateSkuLifecycle) {
        window.KM.DB.updateSkuLifecycle(sku, newLifecycle).then(function() {
            renderSkuDetailsTable();
            if (window.renderSkuHandbook) setTimeout(function() { renderSkuHandbook(); }, 50);
            showSkuStatusToast('Lifecycle updated.');
        }).catch(function(err) {
            showSkuStatusToast('Error: ' + (err.message || err));
            // Revert dropdown
            renderSkuDetailsTable();
        });
    } else {
        // F1-S1: no localStorage lifecycle persistence. Without the DB write path the change cannot be
        // saved (authority = sku_details.lifecycle only); re-render from the current data and say so.
        renderSkuDetailsTable();
        if (window.renderSkuHandbook) setTimeout(function() { renderSkuHandbook(); }, 50);
        showSkuStatusToast('Lifecycle not saved — database write unavailable.');
    }
}

function showSkuStatusToast(msg) {
    var toast = document.getElementById('sku-status-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sku-status-toast';
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#16a34a;color:white;padding:10px 20px;border-radius:8px;font-size:0.85rem;z-index:9999;opacity:0;transition:opacity 0.3s;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(function() { toast.style.opacity = '0'; }, 2500);
}

function handleExportStatusTemplate() {
    if (window.exportSkuStatusTemplate) exportSkuStatusTemplate();
}

function handleImportStatusTemplate() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = function() {
        if (!this.files[0]) return;
        showSkuStatusToast('Validating...');
        importSkuStatusTemplate(this.files[0]).then(function(result) { showImportPreview(result); });
    };
    input.click();
}

function showImportPreview(result) {
    var msg = 'Import Validation:\\nTotal: ' + result.total + ' | Valid: ' + result.valid + ' | Errors: ' + result.errors.length + '\\nNew: ' + result.newCount + ' | Update: ' + result.updateCount;
    if (result.errors.length > 0) { msg += '\\n\\nErrors (first 10):\\n'; result.errors.slice(0,10).forEach(function(e){msg+='Row '+e.row+' ['+e.field+']: '+e.message+'\\n';}); }
    msg += '\\n\\nCloud write-back for bulk import: next phase.';
    alert(msg);
    console.log('[Import Preview]', result);
    if (result.preview.length > 0) { console.log('Preview (20):'); console.table(result.preview.slice(0,20)); }
    if (result.errors.length > 0) { console.log('Errors:'); console.table(result.errors); }
    showSkuStatusToast('Validation complete.');
}

function syncSkuHeaderScroll() {
    var sections = ['upcoming', 'running', 'phasing', 'closure'];
    sections.forEach(function(section) {
        var scrollCol = document.querySelector('#sku-section [data-section="' + section + '"] .scroll-col');
        var scrollHeader = document.querySelector('#sku-section [data-section="' + section + '"] .scroll-header');
        if (!scrollCol || !scrollHeader) return;
        scrollCol.addEventListener('scroll', function() {
            scrollHeader.style.transform = 'translateX(-' + scrollCol.scrollLeft + 'px)';
        });
    });
}

function initSkuUnifiedScroll() {
    var xscroll = document.querySelector('#sku-section .sku-xscroll');
    var scrollCols = document.querySelectorAll('#sku-section .scroll-col');
    if (!xscroll || scrollCols.length === 0) return;
    xscroll.addEventListener('scroll', function() {
        var scrollLeft = this.scrollLeft;
        scrollCols.forEach(function(col) { col.scrollLeft = scrollLeft; });
    });
}

function toggleSection(sectionId) {
    var section = document.querySelector('[data-section="' + sectionId + '"]');
    if (!section) return;
    var arrow = section.querySelector('.arrow');
    section.classList.toggle('is-collapsed');
    if (section.classList.contains('is-collapsed')) {
        arrow.textContent = '\u25B6';
    } else {
        arrow.textContent = '\u25BC';
    }
}

function handleAddSku() {
    // Unified SkuMasterForm in ADD mode (same component as Edit; SKU editable until create).
    openSkuMasterForm('add');
}

// ========================================
// SKU Details — row selection + central "Edit SKU" editor
// A row is selected first (click), then the top "Edit SKU" action opens the full sku_details editor.
// Loads from KM.DB.getSkuDetails() and persists via KM.DB.upsertSkuDetail (sku_details upsert by sku;
// omitted fields preserved). SKU identity is read-only. No marketplace / factory-stock side effects.
// ========================================
var _selectedSku = null;

function _skuFindRecord(sku) {
    var list = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? (window.KM.DB.getSkuDetails() || []) : [];
    for (var i = 0; i < list.length; i++) { if (String(list[i].sku) === String(sku)) return list[i]; }
    return null;
}

// Integration point for the future Role/Permission system. For now always true.
function canEditSkuDetails() { return true; }

// Select a SKU row (highlights the matching fixed + scroll rows across all lifecycle sections).
// quiet = true when called during a re-render (do not scroll / re-store).
function selectSkuRow(sku, quiet) {
    _selectedSku = sku;
    var rows = document.querySelectorAll('#sku-section [data-sku]');
    rows.forEach(function(r) {
        if (String(r.getAttribute('data-sku')) === String(sku)) r.classList.add('sku-row-selected');
        else r.classList.remove('sku-row-selected');
    });
}

// Double-click the SKU cell → select that exact SKU and open the SAME editor as the toolbar button.
// Reuses selectSkuRow + handleEditSku (which loads the record); it never builds a second modal or a
// second data path. The SKU comes from the row's canonical value (not scraped from visible text).
function skuRowDblEdit(sku, ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    // A double-click incidentally word-selects the cell text; clear it so the SKU is not left highlighted.
    if (window.getSelection) { var s = window.getSelection(); if (s && s.removeAllRanges) s.removeAllRanges(); }
    var resolved = String(sku == null ? '' : sku).trim();
    if (!resolved) { showSkuStatusToast('Unable to open SKU details. Please select the SKU again.'); return; }
    selectSkuRow(resolved);   // apply the normal row selection first
    handleEditSku();          // reuse the existing Edit SKU opener + loader
}

// ── Canonical enums (Global Logistics Enums — CARRIER_AND_ROUTE_SPEC §4.5; retired legacy values excluded) ──
// Selectable canonical battery types (§E). rechargeable_lithium is RETIRED from selection but remains a
// readable Legacy value (preserved on save unless the user explicitly changes Battery Type).
var SKU_BATTERY_ENUM_ = ['no_battery', 'alkaline_battery', 'lithium_battery'];
// magnet_type is a REAL Boolean (finalized 2026-07-21) — NOT an enum. Yes → true, No → false.
// See _skuMagnetBool (normalization) / _skuMagnetControl (UI) / _skuMagnetDisplay (table).
var SKU_GS1_ENUM_ = ['UPC', 'EAN', 'GTIN'];
var SKU_CURRENCY_ENUM_ = ['USD', 'TWD', 'RMB', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'];
var SKU_DIM_UNIT_ENUM_ = ['cm', 'in'];
var SKU_WT_UNIT_ENUM_ = ['kg', 'lb'];

// Friendly display labels for canonical enum codes. The <option value> ALWAYS stays the canonical DB
// code (no_battery / magnetic / …) — only the visible text is friendly. Unknown/legacy stored codes are
// never silently mapped (see _skuEnumControl). GS1/Currency have no friendly map (label === value).
var SKU_BATTERY_LABELS_ = {
    no_battery: 'No Battery / 無電池',
    alkaline_battery: 'Alkaline Battery / 鹼性電池',
    lithium_battery: 'Lithium Battery / 鋰電池',
    rechargeable_lithium: 'Rechargeable Lithium Battery (Legacy)'   // retired canonical — display only, not selectable (§E)
};
// Magnet Boolean normalization (shared by table display + Add/Edit control). Mirrors the backend
// skuMagnetToBool_: explicit token classification, NEVER JS truthiness (Boolean("false") === true is wrong).
// Returns true / false / null (blank or unknown — never guessed).
function _skuMagnetBool(v) {
    if (v === true) return true;
    if (v === false) return false;
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === '') return null;
    if (s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'magnetic') return true;
    if (s === 'false' || s === 'no' || s === 'n' || s === '0' || s === 'no_magnet') return false;
    return null;
}
// Friendly Yes/No for the SKU table (true → Yes / 含磁性; false → No / 無磁性; blank/unknown → --).
function _skuMagnetDisplay(v) {
    var b = _skuMagnetBool(v);
    if (b === true) return 'Yes / 含磁性';
    if (b === false) return 'No / 無磁性';
    return '--';
}

// Preset options for the Material / Product Use tag selectors. These are UI DEFAULTS ONLY — they are NOT
// a separate DB truth and are never inserted as rows anywhere. Users may select any subset AND add custom
// values; only sku_details.material / sku_details.product_use are written (see _skuTagSerialize).
var SKU_MATERIAL_PRESETS_ = ['ABS Plastic', 'Stainless Steel', 'Aluminum', 'Silicone', 'PP', 'PC', 'TPR', 'Rubber', 'Glass', 'Ceramic', 'Wood', 'Paper / Cardboard', 'Other'];
var SKU_PRODUCT_USE_PRESETS_ = ['Home Kitchen', 'Restaurant', 'Commercial Use', 'Outdoor', 'Travel', 'Gift', 'Office / Pantry', 'Hospitality', 'Other'];

// Unified SkuMasterForm field set. tab: basic | sales. type: sku | select | enum | text | textarea | number.
// group headings render inside a tab. dim rows (L×W×H + unit) render via SKU_DIM_GROUPS_.
var SKU_FORM_FIELDS_ = [
    // Basic — Identity & lifecycle
    { key: 'sku', label: 'SKU', tab: 'basic', group: 'Identity & Status', type: 'sku', required: true },
    { key: 'lifecycle', label: 'Status', tab: 'basic', group: 'Identity & Status', type: 'select', options: null, required: true },
    { key: 'product_name', label: 'Product Name', tab: 'basic', group: 'Identity & Status', type: 'text' },
    { key: 'product_name_cn', label: 'Product Name CN (中文品名)', tab: 'basic', group: 'Identity & Status', type: 'text' },
    { key: 'series', label: 'Series', tab: 'basic', group: 'Identity & Status', type: 'combo', source: 'series' },
    { key: 'category', label: 'Category', tab: 'basic', group: 'Identity & Status', type: 'combo', source: 'category' },
    // Basic — Product attributes
    { key: 'gs1_code', label: 'GS1 Code', tab: 'basic', group: 'Product Attributes', type: 'text' },
    { key: 'gs1_type', label: 'GS1 Type', tab: 'basic', group: 'Product Attributes', type: 'enum', options: SKU_GS1_ENUM_ },
    { key: 'material', label: 'Material', tab: 'basic', group: 'Product Attributes', type: 'tags', presets: SKU_MATERIAL_PRESETS_, help: 'Pick presets or type a custom value (Enter / comma). Stored as " + "-joined text (e.g. ABS Plastic + Stainless Steel).' },
    { key: 'product_use', label: 'Product Use (用途 / 報關用途)', tab: 'basic', group: 'Product Attributes', type: 'tags', presets: SKU_PRODUCT_USE_PRESETS_, help: 'Pick presets or type a custom value (Enter / comma). Customs-facing.' },
    { key: 'battery_type', label: 'Battery Type', tab: 'basic', group: 'Product Attributes', type: 'enum', options: SKU_BATTERY_ENUM_, labels: SKU_BATTERY_LABELS_, help: 'Battery Type refers to the battery built into or supplied with the product, not a battery type the customer must purchase separately. A product requiring AAA batteries but shipped without batteries is No Battery.' },
    { key: 'magnet_type', label: 'Contains Magnet', tab: 'basic', group: 'Product Attributes', type: 'magnet' },
    // Basic — carton count (dims rendered separately)
    { key: 'units_per_carton', label: 'Units / Carton', tab: 'basic', group: 'Carton / Master Packaging', type: 'number' },
    // Sales — Master baseline commercial
    { key: 'minimum_price', label: 'Minimum Price', tab: 'sales', group: 'Baseline Commercial', type: 'number' },
    { key: 'msrp', label: 'MSRP', tab: 'sales', group: 'Baseline Commercial', type: 'number' },
    { key: 'selling_price', label: 'Selling Price', tab: 'sales', group: 'Baseline Commercial', type: 'number' },
    { key: 'base_currency', label: 'Base Currency', tab: 'sales', group: 'Baseline Commercial', type: 'enum', options: SKU_CURRENCY_ENUM_ },
    // 負責PM — kept as-is (OPEN DECISION on meaning); product-intrinsic column already in sku_details
    { key: 'pm', label: '負責 PM', tab: 'basic', group: 'Identity & Status', type: 'text' }
];

// Dimension groups: three numeric L×W×H + one unit select. Presentation only — maps to separate DB columns.
var SKU_DIM_GROUPS_ = [
    { tab: 'basic', group: 'Item Dimensions', title: 'Item Dimensions (L × W × H)', l: 'item_length', w: 'item_width', h: 'item_height', unit: 'item_dimension_unit', unitOptions: SKU_DIM_UNIT_ENUM_, wt: 'item_weight', wtUnit: 'item_weight_unit', wtUnitOptions: SKU_WT_UNIT_ENUM_ },
    { tab: 'basic', group: 'Package Dimensions', title: 'Package Dimensions (L × W × H)', l: 'package_length', w: 'package_width', h: 'package_height', unit: 'package_dimension_unit', unitOptions: SKU_DIM_UNIT_ENUM_, wt: 'package_weight', wtUnit: 'package_weight_unit', wtUnitOptions: SKU_WT_UNIT_ENUM_ },
    { tab: 'basic', group: 'Carton / Master Packaging', title: 'Carton Dimensions (L × W × H)', l: 'carton_length', w: 'carton_width', h: 'carton_height', unit: 'carton_dimension_unit', unitOptions: SKU_DIM_UNIT_ENUM_, wt: 'carton_weight', wtUnit: 'carton_weight_unit', wtUnitOptions: SKU_WT_UNIT_ENUM_ }
];
// All persisted keys (for payload build + preservation reasoning).
var SKU_DIM_KEYS_ = ['item_length','item_width','item_height','item_dimension_unit','item_weight','item_weight_unit','package_length','package_width','package_height','package_dimension_unit','package_weight','package_weight_unit','carton_length','carton_width','carton_height','carton_dimension_unit','carton_weight','carton_weight_unit'];

var _skuFormMode = 'edit';   // 'add' | 'edit'
var _skuFormSaving = false;

// Per-open registries for the creatable combobox + tag inputs. Keyed by the control's DOM id
// (combo) or the field key (tags). Rebuilt every time the form is opened (values read live from the
// cache so a Series/Category saved earlier appears the next time the form is opened).
var _skuComboData = {};   // id -> { opts:[...], kind:'series'|'category', active:-1 }
var _skuTagData = {};     // key -> { tags:[...], original:'<raw>', dirty:false }

function _skuEsc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ── Multi-value tag serialization (Material / Product Use) ────────────────────────────────────────
// Canonical decision (2026-07): safe reversible " + " delimiter. A stored value already using " + "
// splits into clean tags; ANY other non-empty value (including a bare-underscore legacy string such as
// "Stainless_Steel_ABS") loads as ONE preserved chip and is written back verbatim unless the user edits
// it. This never mis-splits ambiguous data and round-trips losslessly. Shared by both Add and Edit.
function _skuTagParse(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (s === '') return [];
    var parts = (s.indexOf('+') !== -1) ? s.split(/\s*\+\s*/) : [s];
    var seen = {}, out = [];
    parts.forEach(function (p) {
        var t = String(p).trim();
        if (t && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = 1; out.push(t); }
    });
    return out;
}
function _skuTagSerialize(tags) {
    var seen = {}, out = [];
    (tags || []).forEach(function (t) {
        var v = String(t == null ? '' : t).trim();
        if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; out.push(v); }
    });
    return out.join(' + ');
}

// Distinct, trimmed, non-empty existing values for a sku_details column (Series / Category options).
// Read live from KM.DB so newly-saved values become available after the next cache refresh. Case is
// preserved; duplicates that differ only by case are collapsed. Natural sort.
function _skuDistinctValues(field) {
    var list = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? (window.KM.DB.getSkuDetails() || []) : [];
    var seen = {}, out = [];
    list.forEach(function (r) {
        var v = (r && r.raw && r.raw[field] != null) ? r.raw[field] : (r ? r[field] : '');
        v = String(v == null ? '' : v).trim();
        if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; out.push(v); }
    });
    out.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); });
    return out;
}

// ── Creatable combobox (Series / Category) ──────────────────────────────────────────────────────────
// The committed value is `_skuComboData[id].value` — NOT the raw input text. Typing only FILTERS; a value
// is committed only by selecting an existing option or confirming the small "Add New" dialog. Newly added
// values are TEMPORARY form state (`.temp`): they show in THIS form's list only, never touch the DB or the
// page-level filters, and are discarded on reopen/close (the whole registry is rebuilt each form open).
// A temp value becomes a global option solely via a successful sku_details Save (no master table, no
// secondary write) — the next form open rebuilds DISTINCT persisted values.
function _skuComboControl(key, value, source, label) {
    var id = 'sku-f-' + key;
    var persisted = _skuDistinctValues(source);
    var v = String(value == null ? '' : value).trim();
    var temp = [];
    if (v && persisted.map(function (o) { return o.toLowerCase(); }).indexOf(v.toLowerCase()) === -1) temp.push(v);   // show a loaded value not yet in persisted
    _skuComboData[id] = { persisted: persisted, temp: temp, value: v, kind: source, active: -1 };
    return '<div class="skuf-combo">' +
        '<input id="' + id + '" class="skuf-combo-input" type="text" autocomplete="off" value="' + _skuEsc(v) + '"' +
            ' role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="' + id + '-list" aria-label="' + _skuEsc(label) + '"' +
            ' oninput="skuComboFilter(\'' + id + '\')" onfocus="skuComboFilter(\'' + id + '\')" onblur="skuComboBlur(\'' + id + '\')" onkeydown="skuComboKey(\'' + id + '\', event)">' +
        '<ul id="' + id + '-list" class="skuf-combo-list" role="listbox" hidden></ul>' +
    '</div>';
}
function _skuComboOptions(d) { return d.persisted.concat(d.temp); }

function skuComboFilter(id) {
    var input = document.getElementById(id), listEl = document.getElementById(id + '-list'), d = _skuComboData[id];
    if (!input || !listEl || !d) return;
    var q = String(input.value || '').trim(), ql = q.toLowerCase();
    var all = _skuComboOptions(d);
    var matches = (q === '') ? all.slice(0, 50) : all.filter(function (o) { return o.toLowerCase().indexOf(ql) !== -1; }).slice(0, 50);
    var html = matches.map(function (o) {
        return '<li class="skuf-combo-opt" role="option" data-val="' + _skuEsc(o) + '" onmousedown="event.preventDefault()" onclick="skuComboPick(\'' + id + '\', this)">' + _skuEsc(o) + '</li>';
    }).join('');
    if (!html) html = '<li class="skuf-combo-empty">No matching ' + _skuEsc(d.kind) + '.</li>';
    // Final action row ALWAYS opens the small Add-New dialog (typed text is never auto-committed).
    html += '<li class="skuf-combo-opt skuf-combo-opt--new" role="option" data-action="add" onmousedown="event.preventDefault()" onclick="skuComboPick(\'' + id + '\', this)">＋ Add new ' + _skuEsc(d.kind) + '…</li>';
    listEl.innerHTML = html;
    listEl.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    d.active = -1;
}

function _skuComboHi(opts, idx) {
    opts.forEach(function (o, i) { if (i === idx) o.classList.add('is-active'); else o.classList.remove('is-active'); });
    if (opts[idx] && opts[idx].scrollIntoView) opts[idx].scrollIntoView({ block: 'nearest' });
}
function _skuComboClose(id) {
    var input = document.getElementById(id), listEl = document.getElementById(id + '-list');
    if (listEl) listEl.hidden = true;
    if (input) input.setAttribute('aria-expanded', 'false');
}
// Restore the input display to the committed value (discards ephemeral filter text — never commits it).
function _skuComboRestore(id) { var input = document.getElementById(id), d = _skuComboData[id]; if (input && d) input.value = d.value || ''; }
function skuComboBlur(id) {
    setTimeout(function () {
        if (_skuComboAddTarget === id) return;   // Add-New dialog open for this combo — keep the input state
        _skuComboRestore(id); _skuComboClose(id);
    }, 150);
}
function skuComboKey(id, ev) {
    var listEl = document.getElementById(id + '-list'), d = _skuComboData[id];
    if (!listEl || !d) return;
    var opts = Array.prototype.slice.call(listEl.querySelectorAll('.skuf-combo-opt'));
    if (ev.key === 'ArrowDown') { ev.preventDefault(); if (listEl.hidden) { skuComboFilter(id); return; } d.active = Math.min(opts.length - 1, d.active + 1); _skuComboHi(opts, d.active); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (listEl.hidden) return; d.active = Math.max(0, d.active - 1); _skuComboHi(opts, d.active); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (!listEl.hidden && d.active >= 0 && opts[d.active]) skuComboPick(id, opts[d.active]); else _skuComboClose(id); }
    else if (ev.key === 'Escape') { if (!listEl.hidden) { ev.stopPropagation(); _skuComboRestore(id); _skuComboClose(id); } }
}
function skuComboPick(id, li) {
    if (!li) return;
    if (li.getAttribute('data-action') === 'add') { skuComboAddNewOpen(id); return; }   // → small dialog, never auto-commit
    var d = _skuComboData[id], input = document.getElementById(id);
    var val = li.getAttribute('data-val') || '';
    if (!d || !val) return;
    d.value = val;                     // commit the selected existing/temp option
    if (input) input.value = val;
    _skuComboClose(id);
}

// ── Series/Category "Add New" small dialog (explicit confirm; temporary until SKU save) ───────────────
var _skuComboAddTarget = null;   // combo input id the dialog is currently adding to
function _skuBuildComboAddDialog() {
    var ov = document.createElement('div');
    ov.id = 'sku-combo-addnew-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:10002;display:none;align-items:flex-start;justify-content:center;padding:clamp(60px,15vh,160px) 16px;';
    ov.innerHTML =
        '<div style="background:#fff;border-radius:10px;width:min(380px,94vw);box-shadow:0 12px 40px rgba(0,0,0,0.25);overflow:hidden;" onclick="event.stopPropagation()">' +
            '<div id="sku-combo-addnew-title" style="padding:14px 16px;border-bottom:1px solid #E2E8F0;font-weight:600;font-size:14px;color:#1E293B;">Add New</div>' +
            '<div style="padding:16px;">' +
                '<input id="sku-combo-addnew-input" type="text" autocomplete="off" placeholder="Enter a value" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;color:#1E293B;" onkeydown="skuComboAddNewKey(event)">' +
                '<div id="sku-combo-addnew-err" style="display:none;color:#DC2626;font-size:11px;margin-top:6px;"></div>' +
            '</div>' +
            '<div style="padding:12px 16px;border-top:1px solid #E2E8F0;display:flex;justify-content:flex-end;gap:8px;">' +
                '<button type="button" onclick="skuComboAddNewCancel()" style="padding:7px 14px;border:1px solid #CBD5E1;background:#fff;color:#334155;border-radius:6px;cursor:pointer;font-size:13px;">Cancel</button>' +
                '<button type="button" onclick="skuComboAddNewConfirm()" style="padding:7px 14px;border:none;background:#7DAB63;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">Add</button>' +
            '</div>' +
        '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) skuComboAddNewCancel(); });
    document.body.appendChild(ov);
    return ov;
}
function skuComboAddNewOpen(id) {
    var d = _skuComboData[id]; if (!d) return;
    _skuComboAddTarget = id;
    var ov = document.getElementById('sku-combo-addnew-overlay') || _skuBuildComboAddDialog();
    ov.querySelector('#sku-combo-addnew-title').textContent = (d.kind === 'series') ? 'Add New Series' : (d.kind === 'category' ? 'Add New Category' : 'Add New');
    var inp = ov.querySelector('#sku-combo-addnew-input'); inp.value = '';
    var err = ov.querySelector('#sku-combo-addnew-err'); err.style.display = 'none';
    _skuComboClose(id);
    ov.style.display = 'flex';
    setTimeout(function () { inp.focus(); }, 0);
}
function skuComboAddNewCancel() {
    var ov = document.getElementById('sku-combo-addnew-overlay'); if (ov) ov.style.display = 'none';
    _skuComboAddTarget = null;
}
function skuComboAddNewConfirm() {
    var id = _skuComboAddTarget, d = id && _skuComboData[id];
    if (!d) { skuComboAddNewCancel(); return; }
    var ov = document.getElementById('sku-combo-addnew-overlay');
    var inp = ov.querySelector('#sku-combo-addnew-input'), err = ov.querySelector('#sku-combo-addnew-err');
    var v = String(inp.value || '').trim();
    if (!v) { err.textContent = 'Enter a value.'; err.style.display = ''; return; }
    // Case-insensitive de-dup vs persisted + temp → select the existing value rather than duplicate it.
    var existing = _skuComboOptions(d).filter(function (o) { return o.toLowerCase() === v.toLowerCase(); })[0];
    if (existing) { d.value = existing; }
    else { d.temp.push(v); d.value = v; }   // temporary form-only option (never a DB write here)
    var input = document.getElementById(id); if (input) input.value = d.value;
    skuComboAddNewCancel();
}
function skuComboAddNewKey(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); skuComboAddNewConfirm(); }
    else if (ev.key === 'Escape') { ev.stopPropagation(); skuComboAddNewCancel(); }
}

// ── Tag / chip input with preset multi-select + creatable custom values ───────────────────────────
// ONE shared control for Material and Product Use. Presets are UI defaults (never a DB truth). There is
// NO #sku-f-<key> single input; the value is collected from _skuTagData in _skuCollectAndValidate. The
// inner text field is #sku-f-<key>-input (residual text is flushed on Save). A suggestion dropdown shows
// presets not yet selected (type to filter) + a "＋ Add new …: {typed}" custom row.
function _skuTagControl(key, raw, placeholder, presets) {
    var tags = _skuTagParse(raw);
    _skuTagData[key] = { tags: tags.slice(), original: String(raw == null ? '' : raw), dirty: false, presets: presets || [], active: -1 };
    return '<div class="skuf-tagwrap">' +
        '<div class="skuf-tags" id="sku-f-' + key + '-tags" onclick="var i=document.getElementById(\'sku-f-' + key + '-input\'); if(i) i.focus();">' +
            '<span class="skuf-chips" id="sku-f-' + key + '-chips">' + _skuTagChipsHtml(key) + '</span>' +
            '<input id="sku-f-' + key + '-input" class="skuf-tags-input" type="text" autocomplete="off" placeholder="' + _skuEsc(placeholder || 'Add…') + '"' +
                ' role="combobox" aria-expanded="false" aria-controls="sku-f-' + key + '-list" aria-label="Add ' + _skuEsc(key.replace(/_/g, ' ')) + '"' +
                ' onfocus="skuTagSuggest(\'' + key + '\')" oninput="skuTagSuggest(\'' + key + '\')" onkeydown="skuTagKey(\'' + key + '\', event)">' +
        '</div>' +
        '<ul id="sku-f-' + key + '-list" class="skuf-combo-list" role="listbox" hidden></ul>' +
    '</div>';
}
function _skuTagChipsHtml(key) {
    var d = _skuTagData[key];
    if (!d || !d.tags.length) return '';
    return d.tags.map(function (t, i) {
        return '<span class="skuf-chip"><span>' + _skuEsc(t) + '</span>' +
            '<button type="button" class="skuf-chip-x" title="Remove" aria-label="Remove ' + _skuEsc(t) + '" onclick="event.stopPropagation(); skuTagRemove(\'' + key + '\', ' + i + ')">×</button></span>';
    }).join('');
}
function _skuTagRerender(key) {
    var el = document.getElementById('sku-f-' + key + '-chips');
    if (el) el.innerHTML = _skuTagChipsHtml(key);
    var input = document.getElementById('sku-f-' + key + '-input');
    if (input) input.focus();
}
// Add one value as a chip (exact-duplicate + empty guarded). Returns true if it changed the set.
function _skuTagAddValue(key, value) {
    var d = _skuTagData[key];
    var v = String(value == null ? '' : value).trim();
    if (!d || !v) return false;
    if (d.tags.some(function (t) { return t.toLowerCase() === v.toLowerCase(); })) return false;
    d.tags.push(v); d.dirty = true;
    return true;
}
// Commit the residual typed text as a tag (used on Enter/comma and flushed on Save).
function _skuTagCommit(key) {
    var input = document.getElementById('sku-f-' + key + '-input');
    if (!input) return false;
    var changed = _skuTagAddValue(key, input.value);
    input.value = '';
    _skuTagRerender(key);
    return changed;
}
function skuTagRemove(key, idx) {
    var d = _skuTagData[key];
    if (!d || idx < 0 || idx >= d.tags.length) return;
    d.tags.splice(idx, 1); d.dirty = true; _skuTagRerender(key);
    skuTagSuggest(key);   // a removed preset returns to the suggestion list
}
// Render the preset/custom suggestion dropdown for the current typed text.
function skuTagSuggest(key) {
    var input = document.getElementById('sku-f-' + key + '-input'), listEl = document.getElementById('sku-f-' + key + '-list'), d = _skuTagData[key];
    if (!input || !listEl || !d) return;
    var q = String(input.value || '').trim(), ql = q.toLowerCase();
    var chosen = {}; d.tags.forEach(function (t) { chosen[t.toLowerCase()] = 1; });
    var presets = (d.presets || []).filter(function (p) { return !chosen[p.toLowerCase()] && (ql === '' || p.toLowerCase().indexOf(ql) !== -1); });
    var exactPreset = (d.presets || []).some(function (p) { return p.toLowerCase() === ql; });
    var noun = key.replace(/_/g, ' ');
    var html = presets.map(function (p) {
        return '<li class="skuf-combo-opt" role="option" data-val="' + _skuEsc(p) + '" onmousedown="event.preventDefault()" onclick="skuTagPick(\'' + key + '\', this)">' + _skuEsc(p) + '</li>';
    }).join('');
    if (q !== '' && !exactPreset && !chosen[ql]) {
        html += '<li class="skuf-combo-opt skuf-combo-opt--new" role="option" data-val="' + _skuEsc(q) + '" onmousedown="event.preventDefault()" onclick="skuTagPick(\'' + key + '\', this)">＋ Add new ' + _skuEsc(noun) + ': ' + _skuEsc(q) + '</li>';
    }
    if (!html) html = '<li class="skuf-combo-empty">All preset options selected — type to add a custom value.</li>';
    listEl.innerHTML = html;
    listEl.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    d.active = -1;
}
function skuTagPick(key, li) {
    var val = li ? (li.getAttribute('data-val') || '') : '';
    if (!val) return;
    _skuTagAddValue(key, val);
    var input = document.getElementById('sku-f-' + key + '-input');
    if (input) input.value = '';
    _skuTagRerender(key);
    skuTagSuggest(key);   // keep the dropdown open for further multi-select
}
function skuTagKey(key, ev) {
    var listEl = document.getElementById('sku-f-' + key + '-list'), d = _skuTagData[key];
    var opts = (listEl && !listEl.hidden) ? Array.prototype.slice.call(listEl.querySelectorAll('.skuf-combo-opt')) : [];
    if (ev.key === 'Enter') {
        ev.preventDefault();
        if (opts.length && d && d.active >= 0 && opts[d.active]) skuTagPick(key, opts[d.active]);
        else _skuTagCommit(key);
        return;
    }
    if (ev.key === ',') { ev.preventDefault(); _skuTagCommit(key); return; }
    if (ev.key === 'ArrowDown') { if (listEl && listEl.hidden) { skuTagSuggest(key); return; } ev.preventDefault(); if (d) { d.active = Math.min(opts.length - 1, d.active + 1); _skuComboHi(opts, d.active); } return; }
    if (ev.key === 'ArrowUp') { if (!opts.length) return; ev.preventDefault(); if (d) { d.active = Math.max(0, d.active - 1); _skuComboHi(opts, d.active); } return; }
    if (ev.key === 'Escape') { if (listEl && !listEl.hidden) { ev.stopPropagation(); listEl.hidden = true; if (this && this.setAttribute) this.setAttribute('aria-expanded', 'false'); } return; }
    if (ev.key === 'Backspace') {
        var input = document.getElementById('sku-f-' + key + '-input');
        if (input && d && input.value === '' && d.tags.length) { ev.preventDefault(); d.tags.pop(); d.dirty = true; _skuTagRerender(key); skuTagSuggest(key); }
    }
}

function _skuLoadValue(rec, key) {
    if (!rec) return '';
    if (key === 'sku') return rec.sku || '';
    if (key === 'lifecycle') {
        return (window.getNormalizedSkuStatus ? getNormalizedSkuStatus(rec) : '') || (rec.raw && rec.raw.lifecycle) || rec.lifecycle || '';
    }
    return (rec.raw && rec.raw[key] != null) ? rec.raw[key] : '';
}

function _skuValidLifecycles() { return window.VALID_LIFECYCLES || ['Upcoming SKU', 'Running in the Market', 'Phasing Out', 'Closure', 'Other']; }

// Render an enum <select>. If the stored value is not a canonical option (legacy/unrecognized), it is
// shown as a disabled "legacy" option and NOT auto-selected — the user must explicitly pick a canonical
// value before it can be saved (no silent coercion; the record is never destroyed on load).
function _skuEnumControl(id, value, options, labels) {
    var v = String(value == null ? '' : value).trim();
    var known = options.indexOf(v) !== -1;
    var legacy = (v !== '' && !known);
    var lbl = function (o) { return (labels && labels[o]) ? labels[o] : o; };   // friendly text; value stays canonical
    var html = '<select id="' + id + '" data-enum="1" class="skuf-enum' + (legacy ? ' is-legacy' : '') + '"' + (legacy ? ' data-legacy="' + _skuEsc(v) + '"' : '') + '>';
    html += '<option value=""' + (v === '' ? ' selected' : '') + '>— Select —</option>';
    if (legacy) { var lv = (labels && labels[v]) ? labels[v] : (v + ' (legacy)'); html += '<option value="__legacy__" selected disabled>⚠ ' + _skuEsc(lv) + ' — choose a current value</option>'; }
    html += options.map(function (o) { return '<option value="' + _skuEsc(o) + '"' + (known && o === v ? ' selected' : '') + '>' + _skuEsc(lbl(o)) + '</option>'; }).join('');
    html += '</select>';
    return html;
}

// Magnet Boolean control (Yes/No). The <option value> is the string "true"/"false"; collect converts it to
// a REAL Boolean. A blank placeholder means "not set" (omitted from the payload → existing value preserved).
// A legacy value (magnetic/no_magnet/TRUE/FALSE) preselects Yes/No, so saving canonicalizes it to Boolean.
function _skuMagnetControl(id, value) {
    var b = _skuMagnetBool(value);
    return '<select id="' + id + '" data-magnet="1" class="skuf-enum">' +
        '<option value=""' + (b === null ? ' selected' : '') + '>— Select —</option>' +
        '<option value="true"' + (b === true ? ' selected' : '') + '>Yes / 含磁性</option>' +
        '<option value="false"' + (b === false ? ' selected' : '') + '>No / 無磁性</option>' +
    '</select>';
}

function _skuFieldControl(f, rec) {
    var id = 'sku-f-' + f.key;
    var val = _skuLoadValue(rec, f.key);
    if (f.type === 'sku') {
        var ro = (_skuFormMode === 'edit');
        return '<input id="' + id + '" type="text" value="' + _skuEsc(val) + '"' + (ro ? ' readonly' : '') +
            ' style="padding:7px 9px;border:1px solid ' + (ro ? '#E2E8F0' : '#CBD5E1') + ';border-radius:6px;font-size:13px;background:' + (ro ? '#F1F5F9' : '#fff') + ';color:' + (ro ? '#64748B' : '#1E293B') + ';">';
    }
    if (f.type === 'select') { // lifecycle
        var lcs = _skuValidLifecycles();
        return '<select id="' + id + '" style="padding:7px 9px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;background:#fff;color:#1E293B;">' +
            lcs.map(function (lc) { return '<option value="' + _skuEsc(lc) + '"' + (String(lc) === String(val) ? ' selected' : '') + '>' + _skuEsc(lc) + '</option>'; }).join('') + '</select>';
    }
    if (f.type === 'enum') return _skuEnumControl(id, val, f.options, f.labels);
    if (f.type === 'magnet') return _skuMagnetControl(id, val);
    if (f.type === 'combo') return _skuComboControl(f.key, val, f.source, f.label);
    if (f.type === 'tags') return _skuTagControl(f.key, val, f.placeholder, f.presets);
    if (f.type === 'textarea') return '<textarea id="' + id + '" rows="2" style="padding:7px 9px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;resize:vertical;color:#1E293B;">' + _skuEsc(val) + '</textarea>';
    return '<input id="' + id + '" type="' + (f.type === 'number' ? 'number' : 'text') + '" value="' + _skuEsc(val) + '" style="padding:7px 9px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;color:#1E293B;">';
}

function _skuFieldBlock(f, rec) {
    var wide = (f.type === 'textarea' || f.type === 'tags') ? 'grid-column:1 / -1;' : '';
    var req = f.required ? ' <span style="color:#DC2626;">*</span>' : '';
    var help = f.help ? '<div class="skuf-help">' + _skuEsc(f.help) + '</div>' : '';
    return '<div style="display:flex;flex-direction:column;gap:3px;' + wide + '"><label style="font-size:11px;color:#64748B;">' + _skuEsc(f.label) + req + '</label>' + _skuFieldControl(f, rec) + help + '</div>';
}

function _skuDimBlock(d, rec) {
    var mk = function (key, ph) { return '<input id="sku-f-' + key + '" class="skuf-num" type="number" placeholder="' + ph + '" value="' + _skuEsc(_skuLoadValue(rec, key)) + '">'; };
    var unitSel = function (key, opts, canonical) {
        if (_skuFormMode === 'add') {
            // F1-SKU-DETAILS-UNIT-R1 — NEW SKUs are canonical metric ONLY. The unit is LOCKED to cm/kg: a disabled
            // select whose SOLE option is the canonical unit (its .value is still read by the collector), shown as a
            // fixed muted label. The user cannot pick in/lb. Edit mode keeps the existing selectable behavior below.
            return '<select id="sku-f-' + key + '" class="skuf-unit-sel skuf-unit-locked" disabled title="New SKUs use canonical metric units (cm / kg)" style="background:#F1F5F9;color:#334155;cursor:not-allowed;"><option value="' + canonical + '" selected>' + canonical + '</option></select>';
        }
        var v = String(_skuLoadValue(rec, key) || '').trim();
        return '<select id="sku-f-' + key + '" class="skuf-unit-sel"><option value="">—</option>' +
            opts.map(function (o) { return '<option value="' + _skuEsc(o) + '"' + (o === v ? ' selected' : '') + '>' + _skuEsc(o) + '</option>'; }).join('') + '</select>';
    };
    var cell = function (lab, ctrl) { return '<div><label style="font-size:10px;color:#94A3B8;display:block;margin-bottom:2px;">' + lab + '</label>' + ctrl + '</div>'; };
    return '<div style="grid-column:1 / -1;border:1px solid #EEF2F7;border-radius:8px;padding:10px 12px;">' +
        '<div style="font-size:11px;color:#475569;font-weight:600;margin-bottom:6px;">' + _skuEsc(d.title) + '</div>' +
        '<div class="skuf-dim-grid">' +
            cell('L', mk(d.l, 'L')) + cell('W', mk(d.w, 'W')) + cell('H', mk(d.h, 'H')) + cell('Unit', unitSel(d.unit, d.unitOptions, 'cm')) +
        '</div>' +
        '<div class="skuf-wt-grid">' +
            cell('Weight', mk(d.wt, 'Weight')) + cell('Wt Unit', unitSel(d.wtUnit, d.wtUnitOptions, 'kg')) +
        '</div>' +
    '</div>';
}

// Render one tab panel (basic|sales) by grouping fields + dim groups under their group headings.
function _skuRenderTab(tab, rec) {
    // Ordered group names as they first appear for this tab.
    var order = [];
    SKU_FORM_FIELDS_.forEach(function (f) { if (f.tab === tab && order.indexOf(f.group) === -1) order.push(f.group); });
    SKU_DIM_GROUPS_.forEach(function (d) { if (d.tab === tab && order.indexOf(d.group) === -1) order.push(d.group); });
    return order.map(function (grp) {
        var blocks = '';
        SKU_FORM_FIELDS_.forEach(function (f) { if (f.tab === tab && f.group === grp) blocks += _skuFieldBlock(f, rec); });
        SKU_DIM_GROUPS_.forEach(function (d) { if (d.tab === tab && d.group === grp) blocks += _skuDimBlock(d, rec); });
        return '<div style="margin-bottom:14px;"><div style="font-size:12px;font-weight:700;color:#0F172A;margin:4px 0 8px;border-bottom:1px solid #E2E8F0;padding-bottom:4px;">' + _skuEsc(grp) + '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;">' + blocks + '</div></div>';
    }).join('');
}

function _skuTabButton(key, label) {
    return '<button type="button" role="tab" data-tab="' + key + '" aria-selected="false" onclick="skuSwitchTab(\'' + key + '\')" ' +
        'style="padding:8px 12px;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;font-size:13px;color:#475569;">' + label +
        '<span class="sku-tab-err" data-tab-err="' + key + '" style="display:none;color:#DC2626;margin-left:5px;font-weight:700;">!</span></button>';
}

function skuSwitchTab(tab) {
    var overlay = document.getElementById('sku-edit-modal-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('[role="tab"]').forEach(function (b) {
        var on = b.getAttribute('data-tab') === tab;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.style.borderBottomColor = on ? '#7DAB63' : 'transparent';
        b.style.color = on ? '#0F172A' : '#475569';
        b.style.fontWeight = on ? '700' : '400';
    });
    overlay.querySelectorAll('[role="tabpanel"]').forEach(function (p) { p.style.display = (p.getAttribute('data-panel') === tab) ? 'block' : 'none'; });
}

function _buildSkuMasterFormModal() {
    var overlay = document.createElement('div');
    overlay.id = 'sku-edit-modal-overlay';
    // Top-anchored: the dialog aligns to a stable top offset (never vertically re-centered), so switching
    // tabs never moves the header / tab bar. Only the body height adapts (short tab → shorter dialog; long
    // tab → capped at max-height with the body scrolling). The overlay itself scrolls on very small screens.
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:10000;display:none;align-items:flex-start;justify-content:center;padding:clamp(24px,8vh,96px) 16px 24px;overflow-y:auto;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:10px;width:min(760px,95vw);max-height:calc(100vh - clamp(24px,8vh,96px) - 24px);display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.2);overflow:hidden;">' +
            '<div style="padding:14px 18px;border-bottom:1px solid #E2E8F0;font-weight:600;font-size:15px;color:#1E293B;flex-shrink:0;" id="sku-edit-title">SKU</div>' +
            '<div role="tablist" style="display:flex;gap:4px;padding:0 12px;border-bottom:1px solid #E2E8F0;flex-wrap:wrap;flex-shrink:0;">' +
                _skuTabButton('basic', '基礎資訊 / Basic') +
                _skuTabButton('sales', '銷售資訊 / Sales') +
                _skuTabButton('supplier', '供應商資訊 / Supplier') +
                _skuTabButton('logs', '日誌 / Logs') +
            '</div>' +
            '<div id="sku-edit-body" style="padding:16px 18px;overflow-y:auto;flex:1;min-height:0;">' +
                '<div role="tabpanel" data-panel="basic"></div>' +
                '<div role="tabpanel" data-panel="sales" style="display:none;"></div>' +
                '<div role="tabpanel" data-panel="supplier" style="display:none;"></div>' +
                '<div role="tabpanel" data-panel="logs" style="display:none;"></div>' +
            '</div>' +
            '<div style="padding:14px 18px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-shrink:0;">' +
                '<div style="display:flex;gap:8px;align-items:center;">' +
                    '<button type="button" id="sku-tax-btn" onclick="handleSkuTaxRates()" title="Maintain Series-level HS Code & tax records (tax_referral_rates)" style="padding:8px 14px;border:1px solid #CBD5E1;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;color:#0F766E;">HS Code &amp; Tax Rates</button>' +
                    '<button type="button" id="sku-cleardraft-btn" onclick="handleClearSkuAddDraft()" title="Discard the unsaved Add SKU draft and reset the form" style="padding:8px 14px;border:1px solid #FCA5A5;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;color:#B91C1C;display:none;">Clear Draft</button>' +
                '</div>' +
                '<div style="display:flex;gap:10px;">' +
                    '<button type="button" onclick="closeSkuEdit()" style="padding:8px 16px;border:1px solid #CBD5E1;background:#fff;color:#334155;border-radius:6px;cursor:pointer;font-size:13px;">Cancel</button>' +
                    '<button type="button" id="sku-save-btn" onclick="saveSkuMasterForm()" style="padding:8px 16px;border:none;background:#7DAB63;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">Save</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeSkuEdit(); });
    // F1-SKU-DETAILS-DRAFT-R1 — FRONTEND-ONLY unsaved-draft autosave: a debounced snapshot on any field edit
    // (delegated input/change; ADD mode only, guarded inside _skuAddDraftSaveDebounced_). Writes localStorage
    // only — NO API/DB call, NO validation/submit, NO rerender.
    overlay.addEventListener('input', function () { _skuAddDraftSaveDebounced_(overlay); });
    overlay.addEventListener('change', function () { _skuAddDraftSaveDebounced_(overlay); });
    return overlay;
}

function _skuSalesNotice() {
    return '<div style="grid-column:1 / -1;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:8px 10px;font-size:12px;color:#166534;">' +
        'These are Product Master baseline values. Marketplace-, country-, and effective-date pricing is managed in Pricing List / Regional Details.</div>';
}

function _skuRegionalTaxNav(rec) {
    if (_skuFormMode !== 'edit' || !rec) {
        return '<div style="grid-column:1 / -1;font-size:12px;color:#94A3B8;font-style:italic;">Regional marketplace information and Series/Country tax rates can be added after the Master SKU is created.</div>';
    }
    var series = String((rec.raw && rec.raw.series) || rec.series || '').trim();
    return '<div style="grid-column:1 / -1;border-top:1px dashed #E2E8F0;margin-top:8px;padding-top:10px;">' +
        '<div style="font-size:11px;color:#64748B;font-weight:600;margin-bottom:6px;">Regional &amp; Tax (navigation — no Regional/Tax data is written from here)</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
            '<button type="button" onclick="skuViewRegionalDetails()" style="padding:6px 12px;border:1px solid #CBD5E1;background:#fff;color:#334155;border-radius:6px;cursor:pointer;font-size:12px;">View Regional Details</button>' +
            '<button type="button" onclick="handleSkuTaxRates()" style="padding:6px 12px;border:1px solid #CBD5E1;background:#fff;color:#0F766E;border-radius:6px;cursor:pointer;font-size:12px;">HS Code &amp; Tax Rates' + (series ? ' — Series ' + _skuEsc(series) : '') + '</button>' +
        '</div></div>';
}

function _skuSupplierPanel() {
    return '<div style="padding:18px;text-align:center;color:#64748B;background:#F8FAFC;border:1px dashed #E2E8F0;border-radius:8px;">' +
        '<div style="font-size:13px;font-weight:600;color:#475569;">Supplier Information</div>' +
        '<div style="font-size:12px;margin-top:6px;">Supplier management is not implemented yet. It will be managed through Supplier Master and SKU–Supplier relationships.</div></div>';
}

function _skuLogsPanel(rec) {
    if (_skuFormMode === 'add') {
        return '<div style="padding:18px;color:#64748B;background:#F8FAFC;border:1px dashed #E2E8F0;border-radius:8px;font-size:12px;">This SKU has not been created yet. Metadata (created/updated) will appear after creation.</div>';
    }
    var createdAt = (rec && rec.raw && rec.raw.created_at) || (rec && rec.createdAt) || '';
    var updatedAt = (rec && rec.raw && rec.raw.updated_at) || (rec && rec.updatedAt) || '';
    var row = function (k, v) { return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #F1F5F9;"><span style="color:#64748B;font-size:12px;">' + k + '</span><span style="color:#1E293B;font-size:12px;">' + _skuEsc(v || '—') + '</span></div>'; };
    return '<div style="font-size:12px;">' +
        row('Created At', createdAt) + row('Updated At', updatedAt) +
        '<div style="margin-top:10px;color:#94A3B8;font-style:italic;">Change author is not tracked yet.</div>' +
        '<div style="margin-top:4px;color:#94A3B8;font-style:italic;">Detailed change history is not available yet.</div>' +
    '</div>';
}

function skuViewRegionalDetails() {
    // Navigation only — never writes Regional data through this form.
    if (window.showSection) { try { showSection('sku-regional-details'); } catch (e) {} }
    else { showSkuStatusToast('Open SKU Regional Details from the sidebar.'); }
}

// ── F1-SKU-DETAILS-DRAFT-R1 — Add SKU unsaved-draft cache (FRONTEND-ONLY) ─────────────────────────────
// Keeps the in-progress Add SKU form alive across accidental close / Cancel / navigation / refresh / reopen.
// Values are snapshotted (debounced) to localStorage as the user edits; on the next Add open they seed the SAME
// control builders edit mode uses (so chips / combos / enums / selects restore for free). It NEVER writes any DB
// record — creation stays the sole authority of saveSkuMasterForm(). Cleared ONLY on a confirmed Create success
// or an explicit Clear Draft. No secrets are cached (plain SKU business fields only). Any parse/version error is
// swallowed so the modal always opens. Add-mode ONLY — Edit prefills from the live record, never the draft.
var SKU_ADD_DRAFT_KEY_ = 'KM_SKU_DETAILS_ADD_DRAFT_V1';
var SKU_ADD_DRAFT_VERSION_ = 1;
var _skuAddDraftTimer = null;
function _skuHasLocalStorage_() { try { return typeof localStorage !== 'undefined' && localStorage; } catch (e) { return false; } }
// Snapshot every current form field generically by its canonical #sku-f-<key> value element (the SAME elements
// the collector reads) + the active tab. Obsolete/renamed fields need no special-casing — whatever exists is saved.
function _skuAddDraftCollectFields_(overlay) {
    var fields = {};
    var els = overlay.querySelectorAll('[id^="sku-f-"]');
    Array.prototype.forEach.call(els, function (el) {
        var key = String(el.id).slice('sku-f-'.length);
        if (key) fields[key] = (el.value == null ? '' : String(el.value));
    });
    return fields;
}
function _skuAddDraftAnyValue_(fields) {
    for (var k in fields) { if (fields.hasOwnProperty(k) && String(fields[k]).trim() !== '') return true; }
    return false;
}
function _skuAddDraftActiveTab_(overlay) {
    var t = overlay.querySelector('[role="tab"][aria-selected="true"]');
    return (t && t.getAttribute('data-tab')) || 'basic';
}
function _skuAddDraftSave_(overlay) {
    if (_skuFormMode !== 'add' || !overlay || !_skuHasLocalStorage_()) return;
    try {
        var fields = _skuAddDraftCollectFields_(overlay);
        // Never persist an all-empty draft (avoids clobbering a real draft with a blank reopen/first paint).
        if (!_skuAddDraftAnyValue_(fields)) { return; }
        var draft = { version: SKU_ADD_DRAFT_VERSION_, savedAt: new Date().toISOString(), fields: fields, activeTab: _skuAddDraftActiveTab_(overlay) };
        localStorage.setItem(SKU_ADD_DRAFT_KEY_, JSON.stringify(draft));
    } catch (e) { /* quota / serialization — a failed draft save must never break the form */ }
}
function _skuAddDraftSaveDebounced_(overlay) {
    if (_skuFormMode !== 'add') return;
    if (_skuAddDraftTimer && typeof clearTimeout === 'function') clearTimeout(_skuAddDraftTimer);
    _skuAddDraftTimer = (typeof setTimeout === 'function') ? setTimeout(function () { _skuAddDraftSave_(overlay); }, 400) : (function () { _skuAddDraftSave_(overlay); })();
}
// Read + validate the draft. Returns null on absent / corrupt / unsupported-version (never throws).
function _skuAddDraftLoad_() {
    if (!_skuHasLocalStorage_()) return null;
    var raw; try { raw = localStorage.getItem(SKU_ADD_DRAFT_KEY_); } catch (e) { return null; }
    if (!raw) return null;
    var d; try { d = JSON.parse(raw); } catch (e) { _skuAddDraftClear_(); return null; }
    if (!d || d.version !== SKU_ADD_DRAFT_VERSION_ || !d.fields || typeof d.fields !== 'object') { _skuAddDraftClear_(); return null; }
    return d;
}
function _skuAddDraftClear_() { if (!_skuHasLocalStorage_()) return; try { localStorage.removeItem(SKU_ADD_DRAFT_KEY_); } catch (e) {} }
// F1-SKU-DETAILS-UNIT-R1 — legacy cached-draft unit safety. NEW drafts store cm/kg only, but an OLDER draft may
// carry in/lb. Since NO trusted unit-conversion helper exists in SKU Details, we DO NOT reinterpret the numbers
// (19.5 in must never silently become 19.5 cm): for any dimension group whose cached unit is non-metric we CLEAR
// that group's ambiguous numeric values and normalize the unit token to the canonical cm/kg (the user re-enters
// under the locked metric labels). Empty or already-metric groups are preserved untouched.
function _skuAddDraftSanitizeUnitsFields_(fields) {
    var f = Object.assign({}, (fields || {}));
    (SKU_DIM_GROUPS_ || []).forEach(function (d) {
        var du = String(f[d.unit] == null ? '' : f[d.unit]).trim().toLowerCase();
        if (du && du !== 'cm') { f[d.l] = ''; f[d.w] = ''; f[d.h] = ''; }   // non-metric legacy dimensions → drop (never reinterpret)
        f[d.unit] = 'cm';
        var wu = String(f[d.wtUnit] == null ? '' : f[d.wtUnit]).trim().toLowerCase();
        if (wu && wu !== 'kg') { f[d.wt] = ''; }                            // non-metric legacy weight → drop
        f[d.wtUnit] = 'kg';
    });
    return f;
}
// Shape a draft into the rec the existing control builders consume (_skuLoadValue reads rec.sku / rec.raw[key]).
function _skuAddDraftAsRec_(draft) {
    if (!draft || !draft.fields) return null;
    var f = _skuAddDraftSanitizeUnitsFields_(draft.fields);   // metric-unit safety for a legacy non-metric draft
    return { sku: f.sku || '', lifecycle: f.lifecycle || '', raw: Object.assign({}, f) };
}
// Explicit discard (Clear Draft button): remove the cache + reopen a clean Add form (never touches the DB).
function handleClearSkuAddDraft() {
    _skuAddDraftClear_();
    if (_skuFormMode === 'add') openSkuMasterForm('add');
    showSkuStatusToast('Add SKU draft cleared.');
}
window.handleClearSkuAddDraft = handleClearSkuAddDraft;

// Open the unified form. mode 'add' → blank + editable SKU + Create; 'edit' → load record + read-only SKU + Save.
function openSkuMasterForm(mode) {
    if (!canEditSkuDetails()) { alert('You do not have permission to edit SKU Details.'); return; }
    _skuFormMode = (mode === 'add') ? 'add' : 'edit';
    var rec = null, _addDraft = null;
    if (_skuFormMode === 'edit') {
        if (!_selectedSku) { alert('Select a SKU row first, then click Edit SKU.'); return; }
        rec = _skuFindRecord(_selectedSku);
        if (!rec) { showSkuStatusToast('Unable to open SKU details. Please select the SKU again.'); return; }
    } else {
        // ADD: seed the form from the unsaved draft (if any) via the SAME control builders edit mode uses — a
        // corrupt/obsolete draft returns null (clean form). NO DB read/write; creation stays saveSkuMasterForm's job.
        _addDraft = _skuAddDraftLoad_();
        if (_addDraft) rec = _skuAddDraftAsRec_(_addDraft);
    }
    var overlay = document.getElementById('sku-edit-modal-overlay');
    if (!overlay) { overlay = _buildSkuMasterFormModal(); document.body.appendChild(overlay); }
    _skuFormSaving = false;
    overlay.querySelector('#sku-edit-title').textContent = (_skuFormMode === 'add') ? 'Add SKU' : ('Edit SKU — ' + _selectedSku);
    var saveBtn = overlay.querySelector('#sku-save-btn'); if (saveBtn) { saveBtn.textContent = (_skuFormMode === 'add') ? 'Create SKU' : 'Save Changes'; saveBtn.disabled = false; }
    var taxBtn = overlay.querySelector('#sku-tax-btn'); if (taxBtn) taxBtn.style.display = (_skuFormMode === 'add') ? 'none' : '';   // tax subpage needs a created SKU/Series
    // Panels
    overlay.querySelector('[data-panel="basic"]').innerHTML = _skuRenderTab('basic', rec);
    overlay.querySelector('[data-panel="sales"]').innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;">' + _skuSalesNotice() +
        SKU_FORM_FIELDS_.filter(function (f) { return f.tab === 'sales'; }).map(function (f) { return _skuFieldBlock(f, rec); }).join('') +
        _skuRegionalTaxNav(rec) + '</div>';
    overlay.querySelector('[data-panel="supplier"]').innerHTML = _skuSupplierPanel();
    overlay.querySelector('[data-panel="logs"]').innerHTML = _skuLogsPanel(rec);
    // Clear Draft — ADD-only explicit discard; shown only when an unsaved draft is actually restored.
    var clearBtn = overlay.querySelector('#sku-cleardraft-btn'); if (clearBtn) clearBtn.style.display = (_skuFormMode === 'add' && _addDraft) ? '' : 'none';
    skuSwitchTab('basic');
    // Restore the draft's active tab when practical (any invalid/absent value stays on basic).
    if (_skuFormMode === 'add' && _addDraft && _addDraft.activeTab && overlay.querySelector('[role="tab"][data-tab="' + _addDraft.activeTab + '"]')) skuSwitchTab(_addDraft.activeTab);
    overlay.style.display = 'flex';
}

function handleEditSku() { openSkuMasterForm('edit'); }

function closeSkuEdit() {
    var o = document.getElementById('sku-edit-modal-overlay');
    if (o) o.style.display = 'none';
}

// Validate + collect the payload. Returns { payload, firstErrorTab, firstErrorId, errors:[] }.
function _skuCollectAndValidate(overlay) {
    var errors = [], firstErrorTab = null, firstErrorId = null;
    var mark = function (tab, id, msg) { errors.push(msg); if (!firstErrorId) { firstErrorTab = tab; firstErrorId = id; } };
    var get = function (key) { var el = overlay.querySelector('#sku-f-' + key); return el ? String(el.value == null ? '' : el.value).trim() : undefined; };
    var payload = {};

    // SKU
    var sku = get('sku');
    if (_skuFormMode === 'add') { if (!sku) mark('basic', 'sku-f-sku', 'SKU is required.'); payload.sku = sku; }
    else { payload.sku = _selectedSku; }   // immutable in edit

    // Enumerated scalar + text + combo + tag fields
    SKU_FORM_FIELDS_.forEach(function (f) {
        if (f.key === 'sku') return;
        if (f.type === 'tags') {
            _skuTagCommit(f.key);   // flush any residual typed text into a tag before serializing
            var td = _skuTagData[f.key] || { tags: [], original: '', dirty: false };
            // Untouched → write the original stored value verbatim (never rewrite a value the user did not edit).
            payload[f.key] = td.dirty ? _skuTagSerialize(td.tags) : td.original;
            return;
        }
        if (f.type === 'magnet') {
            var mel = overlay.querySelector('#sku-f-' + f.key);
            var mv = mel ? String(mel.value || '') : '';
            if (mv === 'true') payload[f.key] = true;        // REAL Boolean, not a string
            else if (mv === 'false') payload[f.key] = false;
            // '' (— Select —) → omit → backend preserves the existing value (never blanks silently)
            return;
        }
        if (f.type === 'combo') {
            // The committed value is authoritative (arbitrary typing in the field is NOT auto-committed).
            var cd = _skuComboData['sku-f-' + f.key];
            payload[f.key] = cd ? String(cd.value || '') : '';
            return;
        }
        var el = overlay.querySelector('#sku-f-' + f.key);
        if (!el) return;
        var v = String(el.value == null ? '' : el.value).trim();
        if (f.key === 'lifecycle') {
            if (_skuValidLifecycles().indexOf(v) === -1) mark('basic', 'sku-f-lifecycle', 'Select a valid Status.');
        }
        if (f.type === 'enum') {
            var legacyRaw = el.getAttribute('data-legacy');
            if (legacyRaw && v === '__legacy__') { payload[f.key] = legacyRaw; return; }   // untouched legacy → PRESERVE verbatim (no bulk migration; §E/§K)
            if (legacyRaw && v === '') { mark(f.tab, 'sku-f-' + f.key, f.label + ': choose a current value to replace the legacy value.'); }   // explicitly edited away from legacy → must pick a canonical value
        }
        if (v === '__legacy__') v = '';
        if (f.type === 'number' && v !== '') {
            var n = Number(v);
            if (isNaN(n) || n < 0) mark(f.tab, 'sku-f-' + f.key, f.label + ' must be a non-negative number.');
            if (f.key === 'units_per_carton' && v !== '' && (!Number.isInteger(n) || n < 1)) mark(f.tab, 'sku-f-' + f.key, 'Units / Carton must be a positive integer.');
        }
        payload[f.key] = v;
    });

    // Dimension groups (numeric ≥ 0)
    SKU_DIM_KEYS_.forEach(function (key) {
        var el = overlay.querySelector('#sku-f-' + key);
        if (!el) return;
        var v = String(el.value == null ? '' : el.value).trim();
        var isNum = /_length$|_width$|_height$|_weight$/.test(key);
        if (isNum && v !== '') { var n = Number(v); if (isNaN(n) || n < 0) mark('basic', 'sku-f-' + key, key + ' must be a non-negative number.'); }
        payload[key] = v;
    });

    // F1-SKU-DETAILS-UNIT-R1 — CANONICAL WRITE CONTRACT (ADD only): NEW SKUs persist metric units ONLY. Force the
    // six unit tokens at the payload boundary — dimension→cm, weight→kg — regardless of the (locked) control value.
    // Defensive against stale browser state / a legacy cached draft / DOM tampering leaving in/lb. ADD numbers are
    // entered fresh under the cm/kg labels, so forcing the token is a unit-token normalization (never a numeric
    // reinterpretation). Existing canonical field names; NO new unit columns. Edit mode is untouched (per-record).
    if (_skuFormMode === 'add') {
        payload.item_dimension_unit = 'cm'; payload.package_dimension_unit = 'cm'; payload.carton_dimension_unit = 'cm';
        payload.item_weight_unit = 'kg'; payload.package_weight_unit = 'kg'; payload.carton_weight_unit = 'kg';
    }

    return { payload: payload, firstErrorTab: firstErrorTab, firstErrorId: firstErrorId, errors: errors };
}

function _skuSetSaving(overlay, on) {
    _skuFormSaving = on;
    var btn = overlay.querySelector('#sku-save-btn');
    if (btn) { btn.disabled = on; btn.textContent = on ? 'Saving…' : (_skuFormMode === 'add' ? 'Create SKU' : 'Save Changes'); }
}

function saveSkuMasterForm() {
    var overlay = document.getElementById('sku-edit-modal-overlay');
    if (!overlay || _skuFormSaving) return;
    // reset tab error markers
    overlay.querySelectorAll('.sku-tab-err').forEach(function (s) { s.style.display = 'none'; });

    var vr = _skuCollectAndValidate(overlay);
    if (vr.errors.length) {
        var errTabSpan = overlay.querySelector('.sku-tab-err[data-tab-err="' + vr.firstErrorTab + '"]');
        if (errTabSpan) errTabSpan.style.display = 'inline';
        if (vr.firstErrorTab) skuSwitchTab(vr.firstErrorTab);
        var firstEl = vr.firstErrorId && overlay.querySelector('#' + vr.firstErrorId);
        if (firstEl && firstEl.focus) firstEl.focus();
        showSkuStatusToast(vr.errors[0]);
        return;
    }
    if (!(window.KM && window.KM.DB && window.KM.DB.upsertSkuDetail)) { alert('Save unavailable (KM.DB.upsertSkuDetail not configured).'); return; }

    var payload = vr.payload;
    payload.mode = _skuFormMode;   // backend enforces duplicate (add) / not-found (edit)
    _skuSetSaving(overlay, true);
    showSkuStatusToast(_skuFormMode === 'add' ? 'Creating…' : 'Saving…');
    window.KM.DB.upsertSkuDetail(payload).then(function (data) {
        var savedSku = payload.sku;
        var baseline = data && data.factory_baseline;
        if (payload.mode === 'add') _skuAddDraftClear_();   // confirmed Create success → discard the unsaved draft (only here, never before success)
        closeSkuEdit();
        renderSkuDetailsTable();
        if (window.renderSkuHandbook) setTimeout(function () { renderSkuHandbook(); }, 50);
        selectSkuRow(savedSku);
        var msg = (_skuFormMode === 'add') ? 'SKU created.' : 'Saved.';
        if (baseline && baseline.triggered) {
            if (baseline.status === 'ok') msg += ' Factory baseline ensured (' + (baseline.created ? baseline.created.length : 0) + ' new, ' + (baseline.skipped ? baseline.skipped.length : 0) + ' existing).';
            else if (baseline.status === 'db_mapping_gap') msg += ' ⚠ Factory baseline skipped (DB mapping gap): ' + (baseline.warnings || []).join('; ');
            else if (baseline.status === 'partial' || baseline.status === 'error') msg += ' ⚠ Factory baseline INCOMPLETE: ' + (baseline.warnings || []).join('; ') + ' — safe to retry by saving again.';
        }
        showSkuStatusToast(msg);
        if (baseline && (baseline.status === 'partial' || baseline.status === 'error' || baseline.status === 'db_mapping_gap')) {
            alert(msg + '\n\n(The SKU itself was saved; the factory baseline step reported an issue and is idempotent — re-saving into Running retries only the missing rows.)');
        }
    }).catch(function (err) {
        _skuSetSaving(overlay, false);
        var code = err && err.error_code, m = err && err.message ? err.message : String(err);
        if (code === 'duplicate_sku' || /already exists/i.test(m)) showSkuStatusToast('That SKU already exists — pick a different SKU.');
        else if (code === 'not_found' || /not found/i.test(m)) showSkuStatusToast('This SKU no longer exists; refresh and try again.');
        else showSkuStatusToast('Error: ' + m);
    });
}

// ========================================
// SKU Details — HS Code & Tax Rates subpage (Tax & Referral Rate Master V2)
// Maintains Series-level tax_referral_rates rows WITHOUT opening the raw sheet. Writes go to
// tax_referral_rates via KM.DB.upsertTaxReferralRate (NEVER into sku_details). Parent-rate CRUD +
// versioning is live; the component editor is DEFERRED — components render READ-ONLY. No fake saves.
// See TAX_AND_REFERRAL_RATES_SPEC.md §9.
// ========================================
var _taxSeries = null;   // the Series whose rates the tax modal is showing

function _taxEsc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _taxDash(v) { var s = String(v == null ? '' : v).trim(); return s === '' ? '--' : _taxEsc(s); }

// DISPLAY ONLY — country route in logistics/import direction: Country of Origin → Duty Country.
// Does NOT touch tax_referral_rates fields, the business key, lookup, or payloads (TAX spec §…).
// Uses the Unicode right arrow "→"; em dash "—" for a missing side; a single "—" when both are missing.
function formatTaxCountryRoute(countryOfOrigin, dutyCountry) {
    var o = String(countryOfOrigin == null ? '' : countryOfOrigin).trim();
    var d = String(dutyCountry == null ? '' : dutyCountry).trim();
    if (!o && !d) return '—';   // both missing → single em dash
    return (o ? _taxEsc(o) : '—') + ' → ' + (d ? _taxEsc(d) : '—');
}

// Parent-rate fields for the add/edit/version form (snake_case DB columns). type: text | number | date.
var TAX_RATE_FORM_FIELDS_ = [
    { key: 'country_of_origin', label: 'Country of Origin (ISO-2, e.g. CN)', type: 'text' },
    { key: 'duty_country', label: 'Duty Country (ISO-2, e.g. US)', type: 'text' },
    { key: 'hscode', label: 'HS Code', type: 'text' },
    { key: 'duty_rate', label: 'Duty Rate (% e.g. 25)', type: 'number' },
    { key: 'vat_no', label: 'VAT No', type: 'text' },
    { key: 'vat_rate', label: 'VAT Rate (%)', type: 'number' },
    { key: 'eori_no', label: 'EORI No', type: 'text' },
    { key: 'port_tax_rate', label: 'Port Tax Rate (%)', type: 'number' },
    { key: 'referral_fee_rate', label: 'Referral Fee Rate (%)', type: 'number' },
    { key: 'declared_value', label: 'Declared Value (unit)', type: 'number' },
    { key: 'declared_currency', label: 'Declared Currency (ISO, e.g. USD)', type: 'text' },
    { key: 'effective_from', label: 'Effective From', type: 'date' },
    { key: 'effective_to', label: 'Effective To (blank = open-ended)', type: 'date' },
    { key: 'note', label: 'Note', type: 'text' }
];

// Open the tax modal for the currently-selected SKU's Series (inherited; read-only in tax rows).
function handleSkuTaxRates() {
    if (!canEditSkuDetails()) { alert('You do not have permission to edit tax records.'); return; }
    var rec = _selectedSku ? _skuFindRecord(_selectedSku) : null;
    var series = rec ? String((rec.raw && rec.raw.series) || rec.series || '').trim() : '';
    if (!series) { alert('Select a SKU with a Series first. Tax records are maintained per Series.'); return; }
    _taxSeries = series;
    var overlay = document.getElementById('sku-tax-modal-overlay');
    if (!overlay) { overlay = _buildSkuTaxModal(); document.body.appendChild(overlay); }
    overlay.querySelector('#sku-tax-title').textContent = 'HS Code & Tax Rates — Series ' + series;
    _renderSkuTaxList();
    overlay.style.display = 'flex';
}

function _buildSkuTaxModal() {
    var overlay = document.createElement('div');
    overlay.id = 'sku-tax-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:10001;display:none;align-items:center;justify-content:center;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:10px;width:min(900px,96vw);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.22);overflow:hidden;">' +
            '<div style="padding:14px 18px;border-bottom:1px solid #E2E8F0;font-weight:600;font-size:15px;color:#1E293B;display:flex;justify-content:space-between;align-items:center;">' +
                '<span id="sku-tax-title">HS Code & Tax Rates</span>' +
                '<button type="button" onclick="closeSkuTax()" style="border:none;background:none;font-size:18px;cursor:pointer;color:#64748B;">&times;</button>' +
            '</div>' +
            '<div id="sku-tax-body" style="padding:16px 18px;overflow-y:auto;"></div>' +
        '</div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeSkuTax(); });
    return overlay;
}

function closeSkuTax() { var o = document.getElementById('sku-tax-modal-overlay'); if (o) o.style.display = 'none'; }

// List all tax_referral_rates rows for the current Series (all countries + versions) + read-only components.
function _renderSkuTaxList() {
    var body = document.getElementById('sku-tax-body');
    if (!body) return;
    var rates = (window.KM && KM.DB && KM.DB.getTaxReferralRates) ? (KM.DB.getTaxReferralRates() || []) : [];
    var comps = (window.KM && KM.DB && KM.DB.getTaxRateComponents) ? (KM.DB.getTaxRateComponents() || []) : [];
    var rows = rates.filter(function(r) { return String(r.series || '').trim().toUpperCase() === String(_taxSeries).toUpperCase(); });
    // Sort: duty country, then origin, then effective_from descending (newest first).
    rows.sort(function(a, b) {
        var k = String(a.dutyCountry).localeCompare(String(b.dutyCountry)); if (k) return k;
        var o = String(a.countryOfOrigin).localeCompare(String(b.countryOfOrigin)); if (o) return o;
        return String(b.effectiveFrom).localeCompare(String(a.effectiveFrom));
    });

    var head =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<div style="font-size:12px;color:#64748B;">Series-level tax master (parent = one row per Origin × Duty Country × effective period). Writes to <code>tax_referral_rates</code> — never <code>sku_details</code>.</div>' +
            '<button type="button" onclick="openSkuTaxForm(\'add\')" style="padding:7px 14px;border:none;background:#0F766E;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap;">+ Add Country Rate</button>' +
        '</div>';

    if (!rows.length) {
        body.innerHTML = head + '<div style="padding:24px;text-align:center;color:#94A3B8;font-style:italic;border:1px dashed #E2E8F0;border-radius:8px;">No tax records for this Series yet. Click “+ Add Country Rate”.</div>';
        return;
    }

    var cards = rows.map(function(r) {
        var rid = _taxEsc(r.taxRateId);
        var ridJs = String(r.taxRateId).replace(/'/g, "\\'");
        var myComps = comps.filter(function(c) { return String(c.taxRateId) === String(r.taxRateId); });
        var openEnded = String(r.effectiveTo || '').trim() === '';
        var period = _taxDash(r.effectiveFrom) + ' → ' + (openEnded ? '<span style="color:#0F766E;">open-ended</span>' : _taxDash(r.effectiveTo));
        var compHtml;
        if (myComps.length) {
            compHtml = '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px;">' +
                '<thead><tr style="color:#64748B;text-align:left;">' +
                    '<th style="padding:3px 6px;">Code</th><th style="padding:3px 6px;">Type</th><th style="padding:3px 6px;">Rate Type</th><th style="padding:3px 6px;">Value</th><th style="padding:3px 6px;">Per-Unit</th><th style="padding:3px 6px;">Effective</th></tr></thead>' +
                '<tbody>' + myComps.map(function(c) {
                    return '<tr style="border-top:1px solid #F1F5F9;">' +
                        '<td style="padding:3px 6px;">' + _taxDash(c.componentCode) + '</td>' +
                        '<td style="padding:3px 6px;">' + _taxDash(c.componentType) + '</td>' +
                        '<td style="padding:3px 6px;">' + _taxDash(c.rateType) + '</td>' +
                        '<td style="padding:3px 6px;">' + _taxDash(c.rateValue) + '</td>' +
                        '<td style="padding:3px 6px;">' + (c.amountPerUnit === '' || c.amountPerUnit == null ? '--' : _taxEsc(c.amountPerUnit + ' ' + (c.amountCurrency || '') + '/' + (c.quantityUnit || ''))) + '</td>' +
                        '<td style="padding:3px 6px;">' + _taxDash(c.effectiveFrom) + '→' + (String(c.effectiveTo||'').trim()===''?'∞':_taxEsc(c.effectiveTo)) + '</td>' +
                    '</tr>';
                }).join('') + '</tbody></table>';
        } else {
            compHtml = '<div style="font-size:11px;color:#94A3B8;font-style:italic;margin-top:4px;">No components.</div>';
        }

        return '<div style="border:1px solid #E2E8F0;border-radius:8px;padding:12px 14px;margin-bottom:10px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">' +
                '<div>' +
                    '<div style="font-weight:600;font-size:13px;color:#1E293B;">' + formatTaxCountryRoute(r.countryOfOrigin, r.dutyCountry) +
                        '<span style="font-size:11px;color:#64748B;font-weight:400;margin-left:8px;">HS ' + _taxDash(r.hscode) + '</span></div>' +
                    '<div style="font-size:11px;color:#64748B;margin-top:3px;">' + rid + '</div>' +
                    '<div style="font-size:11px;color:#475569;margin-top:4px;">Duty ' + _taxDash(r.dutyRate) + '% · VAT ' + _taxDash(r.vatRate) + '% · Port ' + _taxDash(r.portTaxRate) + '% · Referral ' + _taxDash(r.referralFeeRate) + '% · Declared ' + _taxDash(r.declaredValue) + ' ' + _taxDash(r.declaredCurrency) + '</div>' +
                    '<div style="font-size:11px;color:#475569;margin-top:2px;">VAT No ' + _taxDash(r.vatNo) + ' · EORI ' + _taxDash(r.eoriNo) + '</div>' +
                    '<div style="font-size:11px;color:#475569;margin-top:2px;">Effective: ' + period + '</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:6px;white-space:nowrap;">' +
                    '<button type="button" onclick="openSkuTaxForm(\'edit\',\'' + ridJs + '\')" style="padding:5px 10px;border:1px solid #CBD5E1;background:#fff;color:#334155;border-radius:5px;cursor:pointer;font-size:12px;">Edit</button>' +
                    '<button type="button" onclick="openSkuTaxForm(\'version\',\'' + ridJs + '\')" style="padding:5px 10px;border:1px solid #CBD5E1;background:#fff;color:#334155;border-radius:5px;cursor:pointer;font-size:12px;">New Version</button>' +
                '</div>' +
            '</div>' +
            '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #E2E8F0;">' +
                '<div style="font-size:11px;color:#64748B;font-weight:600;">Components <span style="font-weight:400;font-style:italic;">(read-only — editor deferred)</span></div>' +
                compHtml +
            '</div>' +
        '</div>';
    }).join('');

    body.innerHTML = head + cards;
}

// Open the parent-rate form. mode: 'add' | 'edit' | 'version'. On edit/version, prefill from taxRateId.
function openSkuTaxForm(mode, taxRateId) {
    var rates = (window.KM && KM.DB && KM.DB.getTaxReferralRates) ? (KM.DB.getTaxReferralRates() || []) : [];
    var src = null;
    if (taxRateId) { for (var i = 0; i < rates.length; i++) { if (String(rates[i].taxRateId) === String(taxRateId)) { src = rates[i]; break; } } }
    var body = document.getElementById('sku-tax-body');
    if (!body) return;

    var titleMap = { add: 'Add Country Rate', edit: 'Edit Rate (correct current version)', version: 'New Effective Version' };
    function val(k) {
        if (!src) return '';
        if (mode === 'version' && (k === 'effective_from')) return '';   // force a new start date
        if (mode === 'version' && (k === 'effective_to')) return '';
        return (src.raw && src.raw[k] != null && src.raw[k] !== '') ? src.raw[k] : _taxFormFallback(src, k);
    }

    var fieldsHtml = TAX_RATE_FORM_FIELDS_.map(function(f) {
        var v = val(f.key);
        var id = 'sku-tax-f-' + f.key;
        var t = (f.type === 'number') ? 'number' : (f.type === 'date' ? 'date' : 'text');
        return '<div style="display:flex;flex-direction:column;gap:3px;">' +
            '<label style="font-size:11px;color:#64748B;">' + _taxEsc(f.label) + '</label>' +
            '<input id="' + id + '" type="' + t + '" value="' + _taxEsc(v) + '" style="padding:7px 9px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;">' +
        '</div>';
    }).join('');

    var versionExtra = (mode === 'version')
        ? '<label style="grid-column:1 / -1;display:flex;align-items:center;gap:8px;font-size:12px;color:#475569;"><input type="checkbox" id="sku-tax-close-prev" checked> Close the previous open-ended version (set its Effective To = new Effective From − 1 day)</label>'
        : '';

    var hiddenId = (mode === 'edit' && src) ? src.taxRateId : '';

    body.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<div style="font-weight:600;font-size:14px;color:#1E293B;">' + _taxEsc(titleMap[mode] || 'Rate') + ' — Series ' + _taxEsc(_taxSeries) + '</div>' +
            '<button type="button" onclick="_renderSkuTaxList()" style="padding:6px 12px;border:1px solid #CBD5E1;background:#fff;color:#334155;border-radius:6px;cursor:pointer;font-size:12px;">&larr; Back to list</button>' +
        '</div>' +
        (mode === 'version' ? '<div style="font-size:11px;color:#B45309;background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:8px 10px;margin-bottom:10px;">A new version creates a NEW row + new tax_rate_id and preserves the prior row (history). Set a new Effective From.</div>' : '') +
        '<input type="hidden" id="sku-tax-edit-id" value="' + _taxEsc(hiddenId) + '">' +
        '<input type="hidden" id="sku-tax-mode" value="' + _taxEsc(mode) + '">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;">' +
            '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:11px;color:#64748B;">Series (inherited — edit via SKU editor)</label>' +
                '<input type="text" value="' + _taxEsc(_taxSeries) + '" readonly style="padding:7px 9px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;background:#F1F5F9;color:#64748B;"></div>' +
            fieldsHtml +
            versionExtra +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">' +
            '<button type="button" onclick="_renderSkuTaxList()" style="padding:8px 16px;border:1px solid #CBD5E1;background:#fff;color:#334155;border-radius:6px;cursor:pointer;font-size:13px;">Cancel</button>' +
            '<button type="button" onclick="saveSkuTaxRate()" style="padding:8px 16px;border:none;background:#0F766E;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;">Save Rate</button>' +
        '</div>';
}

// Fallback reader when normalizeTaxReferralRateRecord exposes a camelCase value but raw is sparse.
function _taxFormFallback(src, k) {
    var map = { country_of_origin: 'countryOfOrigin', duty_country: 'dutyCountry', hscode: 'hscode',
        duty_rate: 'dutyRate', vat_no: 'vatNo', vat_rate: 'vatRate', eori_no: 'eoriNo',
        port_tax_rate: 'portTaxRate', referral_fee_rate: 'referralFeeRate', declared_value: 'declaredValue',
        declared_currency: 'declaredCurrency', effective_from: 'effectiveFrom', effective_to: 'effectiveTo', note: 'note' };
    var cc = map[k];
    return (cc && src[cc] != null) ? src[cc] : '';
}

function saveSkuTaxRate() {
    var body = document.getElementById('sku-tax-body');
    if (!body) return;
    var mode = (document.getElementById('sku-tax-mode') || {}).value || 'add';
    var editId = (document.getElementById('sku-tax-edit-id') || {}).value || '';
    var payload = { series: _taxSeries };
    TAX_RATE_FORM_FIELDS_.forEach(function(f) {
        var el = document.getElementById('sku-tax-f-' + f.key);
        if (!el) return;
        payload[f.key] = (el.value == null ? '' : String(el.value)).trim();
    });
    // Required business-key fields for a new row (correction/edit reuses the stored key).
    if (mode !== 'edit') {
        if (!payload.country_of_origin) { alert('Country of Origin is required.'); return; }
        if (!payload.duty_country) { alert('Duty Country is required.'); return; }
        if (!payload.effective_from) { alert('Effective From is required.'); return; }
    }
    if (mode === 'edit') { payload.tax_rate_id = editId; }
    if (mode === 'version') {
        payload.create_version = true;
        var cp = document.getElementById('sku-tax-close-prev');
        payload.close_previous = !!(cp && cp.checked);
    }
    if (!(window.KM && window.KM.DB && window.KM.DB.upsertTaxReferralRate)) {
        alert('Save unavailable (KM.DB.upsertTaxReferralRate not configured).');
        return;
    }
    showSkuStatusToast('Saving tax rate...');
    window.KM.DB.upsertTaxReferralRate(payload).then(function(data) {
        var warn = (data && data.warnings && data.warnings.length) ? ('\n\nWarning:\n' + data.warnings.join('\n')) : '';
        showSkuStatusToast('Tax rate saved.');
        if (warn) alert('Saved: ' + ((data && data.tax_rate_id) || '') + warn);
        _renderSkuTaxList();
    }).catch(function(err) {
        showSkuStatusToast('Error: ' + (err && err.message ? err.message : err));
    });
}

// Search now delegates to the combined filter (Search AND Series AND Category). SKU-text search behavior
// is preserved exactly (case-insensitive substring over the SKU value).
function handleSkuSearch() { applySkuFilters(); }

// ── Toolbar Category / Series MULTI-SELECT + combined filtering ───────────────────────────────────
// Options = DISTINCT non-empty data-category / data-series across ALL rendered lifecycle rows (so they
// always match what is on screen and pick up new values after a save + refresh). Empty selection = All.
// AND between Category and Series; OR within each (a row matches if its value is in the selected set).
// Series options narrow to the selected Categories, but a still-selected Series is never silently
// dropped. Filtering is show/hide only — it never mutates data. Applies to EVERY .sku-lifecycle-section
// (Upcoming SKU, Running in the Market, Phasing, Closure) at once.
var _skuMultiState = { category: [], series: [] };   // selected values; [] = All
var _skuCatSeriesMap = {};                            // category -> [series...] (for Series narrowing)
var _skuAllOptions = { category: [], series: [] };    // full distinct option universe

function _skuFilterEls() { return { search: document.getElementById('skuSearchInput') }; }

// (Re)build the option universe from rendered rows, prune selections to still-existing values, re-render
// both dropdowns. Called on init and after a save+refresh.
function populateSkuFilters() {
    var rows = document.querySelectorAll('#sku-section .fixed-body .fixed-row[data-sku]');
    var catMap = {}, serMap = {}, catSer = {};
    rows.forEach(function (r) {
        var c = String(r.getAttribute('data-category') || '').trim();
        var s = String(r.getAttribute('data-series') || '').trim();
        if (c && !catMap[c.toLowerCase()]) catMap[c.toLowerCase()] = c;
        if (s && !serMap[s.toLowerCase()]) serMap[s.toLowerCase()] = s;
        if (c) { catSer[c] = catSer[c] || {}; if (s) catSer[c][s] = true; }
    });
    var sortVals = function (m) {
        return Object.keys(m).map(function (k) { return m[k]; })
            .sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); });
    };
    _skuAllOptions.category = sortVals(catMap);
    _skuAllOptions.series = sortVals(serMap);
    _skuCatSeriesMap = {};
    Object.keys(catSer).forEach(function (c) { _skuCatSeriesMap[c] = Object.keys(catSer[c]); });
    // Prune selections to values that still exist (drop stale; keep valid — never invents a value).
    _skuMultiState.category = _skuMultiState.category.filter(function (v) { return _skuAllOptions.category.indexOf(v) !== -1; });
    _skuMultiState.series = _skuMultiState.series.filter(function (v) { return _skuAllOptions.series.indexOf(v) !== -1; });
    _skuRenderFilterOptions('category');
    _skuRenderFilterOptions('series');
    _skuUpdateFilterLabel('category');
    _skuUpdateFilterLabel('series');
}

// Candidate options for a filter. Series narrows to series under the selected categories, UNIONed with
// any currently-selected series so a valid selection is never hidden or cleared.
function _skuCandidateOptions(kind) {
    if (kind === 'category') return _skuAllOptions.category.slice();
    var cats = _skuMultiState.category;
    if (!cats.length) return _skuAllOptions.series.slice();
    var set = {};
    cats.forEach(function (c) { (_skuCatSeriesMap[c] || []).forEach(function (s) { set[s] = true; }); });
    _skuMultiState.series.forEach(function (s) { set[s] = true; });   // keep selected series visible
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); });
}

function _skuRenderFilterOptions(kind) {
    var list = document.getElementById(kind === 'category' ? 'skuCategoryList' : 'skuSeriesList');
    if (!list) return;
    var opts = _skuCandidateOptions(kind);
    var sel = _skuMultiState[kind];
    if (!opts.length) { list.innerHTML = '<div class="skuf-empty">No options</div>'; return; }
    list.innerHTML = opts.map(function (v) {
        var isSel = sel.indexOf(v) !== -1;
        return '<label class="skuf-item" role="option" aria-selected="' + (isSel ? 'true' : 'false') + '">' +
            '<input type="checkbox" value="' + _skuEsc(v) + '"' + (isSel ? ' checked' : '') + ' onchange="onSkuFilterToggle(\'' + kind + '\')"> ' +
            '<span>' + _skuEsc(v) + '</span></label>';
    }).join('');
    onSkuFilterOptionSearch(kind);   // re-apply any active option-search text
}

function _skuUpdateFilterLabel(kind) {
    var el = document.getElementById(kind === 'category' ? 'skuCategoryLabel' : 'skuSeriesLabel');
    if (!el) return;
    var n = _skuMultiState[kind].length;
    el.textContent = n === 0 ? (kind === 'category' ? 'All Categories' : 'All Series') : (n + ' selected');
}

function onSkuFilterToggle(kind) {
    var list = document.getElementById(kind === 'category' ? 'skuCategoryList' : 'skuSeriesList');
    if (!list) return;
    var checked = list.querySelectorAll('input[type="checkbox"]:checked');
    _skuMultiState[kind] = Array.prototype.map.call(checked, function (cb) { return cb.value; });
    list.querySelectorAll('.skuf-item').forEach(function (item) {
        var cb = item.querySelector('input'); if (cb) item.setAttribute('aria-selected', cb.checked ? 'true' : 'false');
    });
    _skuUpdateFilterLabel(kind);
    if (kind === 'category') { _skuRenderFilterOptions('series'); _skuUpdateFilterLabel('series'); }  // re-narrow Series
    applySkuFilters();
}

function skuFilterSelectAll(kind) {
    _skuMultiState[kind] = _skuCandidateOptions(kind).slice();
    _skuRenderFilterOptions(kind); _skuUpdateFilterLabel(kind);
    if (kind === 'category') { _skuRenderFilterOptions('series'); _skuUpdateFilterLabel('series'); }
    applySkuFilters();
}

function skuFilterClear(kind) {
    _skuMultiState[kind] = [];
    _skuRenderFilterOptions(kind); _skuUpdateFilterLabel(kind);
    if (kind === 'category') { _skuRenderFilterOptions('series'); _skuUpdateFilterLabel('series'); }
    applySkuFilters();
}

// Option-search inside a panel: show/hide options by text; does NOT change the selection.
function onSkuFilterOptionSearch(kind) {
    var input = document.getElementById(kind === 'category' ? 'skuCategorySearch' : 'skuSeriesSearch');
    var list = document.getElementById(kind === 'category' ? 'skuCategoryList' : 'skuSeriesList');
    if (!input || !list) return;
    var q = String(input.value || '').toLowerCase().trim();
    list.querySelectorAll('.skuf-item').forEach(function (item) {
        var txt = (item.textContent || '').toLowerCase();
        item.style.display = (q === '' || txt.indexOf(q) !== -1) ? '' : 'none';
    });
}

function toggleSkuFilterPanel(kind, ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    var panel = document.getElementById(kind === 'category' ? 'skuCategoryPanel' : 'skuSeriesPanel');
    var trig = document.getElementById(kind === 'category' ? 'skuCategoryTrigger' : 'skuSeriesTrigger');
    var other = document.getElementById(kind === 'category' ? 'skuSeriesPanel' : 'skuCategoryPanel');
    var otherTrig = document.getElementById(kind === 'category' ? 'skuSeriesTrigger' : 'skuCategoryTrigger');
    if (other) other.hidden = true;
    if (otherTrig) otherTrig.setAttribute('aria-expanded', 'false');
    if (!panel) return;
    var opening = panel.hidden;
    panel.hidden = !opening;
    if (trig) trig.setAttribute('aria-expanded', opening ? 'true' : 'false');
}

function _skuCloseFilterPanels() {
    ['skuCategoryPanel', 'skuSeriesPanel'].forEach(function (id) { var p = document.getElementById(id); if (p) p.hidden = true; });
    ['skuCategoryTrigger', 'skuSeriesTrigger'].forEach(function (id) { var t = document.getElementById(id); if (t) t.setAttribute('aria-expanded', 'false'); });
}
// Outside-click + Escape close (bound once at module load).
document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && !event.target.closest('.skuf-multi')) _skuCloseFilterPanels();
});
document.addEventListener('keydown', function (event) { if (event.key === 'Escape') _skuCloseFilterPanels(); });

function handleSkuFilterChange() { applySkuFilters(); }

function applySkuFilters() {
    var els = _skuFilterEls();
    var q = els.search ? String(els.search.value || '').toLowerCase().trim() : '';
    var cats = _skuMultiState.category, sers = _skuMultiState.series;
    var sections = document.querySelectorAll('#sku-section .sku-lifecycle-section');
    sections.forEach(function (section) {
        var fixedRows = section.querySelectorAll('.fixed-body .fixed-row');
        var scrollRows = section.querySelectorAll('.scroll-body .scroll-row');
        var visible = 0, dataRows = 0;
        fixedRows.forEach(function (fr, i) {
            if (!fr.hasAttribute('data-sku')) return;   // skip the "No SKUs" placeholder row
            dataRows++;
            var sku = String(fr.getAttribute('data-sku') || '');
            var rowSeries = String(fr.getAttribute('data-series') || '');
            var rowCat = String(fr.getAttribute('data-category') || '');
            var show = (q === '' || sku.toLowerCase().indexOf(q) !== -1) &&
                (cats.length === 0 || cats.indexOf(rowCat) !== -1) &&
                (sers.length === 0 || sers.indexOf(rowSeries) !== -1);
            fr.style.display = show ? '' : 'none';
            if (scrollRows[i]) scrollRows[i].style.display = show ? '' : 'none';
            if (show) visible++;
        });
        _skuToggleGroupEmpty(section, dataRows > 0 && visible === 0);
    });
}

function _skuToggleGroupEmpty(section, showEmpty) {
    var table = section.querySelector('.dual-layer-table');
    if (!table) return;
    var note = section.querySelector('.sku-filter-empty');
    if (showEmpty) {
        if (!note) {
            note = document.createElement('div');
            note.className = 'sku-filter-empty';
            note.textContent = 'No SKUs match the current filters.';
            table.parentNode.insertBefore(note, table.nextSibling);
        }
        note.style.display = '';
    } else if (note) {
        note.style.display = 'none';
    }
}

// ── More Options menu (Export / Import / Refresh DB) ──────────────────────────────────────────────
function toggleMoreOptions(ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    var panel = document.getElementById('moreOptionsPanel'), btn = document.getElementById('moreOptionsBtn');
    if (!panel) return;
    var open = panel.classList.toggle('show');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeMoreOptions() {
    var panel = document.getElementById('moreOptionsPanel'), btn = document.getElementById('moreOptionsBtn');
    if (panel) panel.classList.remove('show');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleDisplayPanel() {
    var panel = document.getElementById('displayPanel');
    panel.classList.toggle('show');
}

function toggleColumn(colIndex) {
    var sections = document.querySelectorAll('#sku-section .sku-lifecycle-section');
    sections.forEach(function(section) {
        if (colIndex === 0) {
            var fixedCol = section.querySelector('.fixed-col');
            if (fixedCol) fixedCol.style.display = fixedCol.style.display !== 'none' ? 'none' : '';
        } else {
            var headerCells = section.querySelectorAll('.scroll-header .header-cell[data-col="' + colIndex + '"]');
            var scrollCells = section.querySelectorAll('.scroll-col .scroll-cell[data-col="' + colIndex + '"]');
            headerCells.forEach(function(cell) { cell.style.display = cell.style.display !== 'none' ? 'none' : ''; });
            scrollCells.forEach(function(cell) { cell.style.display = cell.style.display !== 'none' ? 'none' : ''; });
        }
    });
    updateAllCheckbox();
    if (window.updateSkuScrollWidth) setTimeout(function() { window.updateSkuScrollWidth(); }, 50);
}

function toggleAllColumns() {
    var checkAll = document.getElementById('checkAll');
    var colCheckboxes = document.querySelectorAll('.col-checkbox');
    var sections = document.querySelectorAll('#sku-section .sku-lifecycle-section');
    colCheckboxes.forEach(function(checkbox) {
        checkbox.checked = checkAll.checked;
        var colIndex = parseInt(checkbox.dataset.col);
        sections.forEach(function(section) {
            if (colIndex === 0) {
                var fixedCol = section.querySelector('.fixed-col');
                if (fixedCol) fixedCol.style.display = checkAll.checked ? '' : 'none';
            } else {
                section.querySelectorAll('.scroll-header .header-cell[data-col="' + colIndex + '"]').forEach(function(c) { c.style.display = checkAll.checked ? '' : 'none'; });
                section.querySelectorAll('.scroll-col .scroll-cell[data-col="' + colIndex + '"]').forEach(function(c) { c.style.display = checkAll.checked ? '' : 'none'; });
            }
        });
    });
    if (window.updateSkuScrollWidth) setTimeout(function() { window.updateSkuScrollWidth(); }, 50);
}

function updateAllCheckbox() {
    var checkAll = document.getElementById('checkAll');
    var colCheckboxes = document.querySelectorAll('.col-checkbox');
    checkAll.checked = Array.from(colCheckboxes).every(function(cb) { return cb.checked; });
}

// Display panel + More Options menu close on outside click / Escape.
document.addEventListener('click', function(event) {
    var displayDropdown = document.querySelector('.display-dropdown');
    var panel = document.getElementById('displayPanel');
    if (displayDropdown && panel && !displayDropdown.contains(event.target)) {
        panel.classList.remove('show');
    }
    var moreDropdown = document.querySelector('#sku-section .more-options-dropdown');
    if (moreDropdown && !moreDropdown.contains(event.target)) closeMoreOptions();
});
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') closeMoreOptions();
});

// Expose
window.renderSkuDetailsTable = renderSkuDetailsTable;
window.handleSkuStatusChange = handleSkuStatusChange;
window.handleExportStatusTemplate = handleExportStatusTemplate;
window.handleImportStatusTemplate = handleImportStatusTemplate;
window.initSkuUnifiedScroll = initSkuUnifiedScroll;
window.toggleSection = toggleSection;
window.handleAddSku = handleAddSku;
window.handleSkuSearch = handleSkuSearch;
window.handleSkuFilterChange = handleSkuFilterChange;
window.populateSkuFilters = populateSkuFilters;
window.toggleSkuFilterPanel = toggleSkuFilterPanel;
window.onSkuFilterToggle = onSkuFilterToggle;
window.skuFilterSelectAll = skuFilterSelectAll;
window.skuFilterClear = skuFilterClear;
window.onSkuFilterOptionSearch = onSkuFilterOptionSearch;
window.applySkuFilters = applySkuFilters;
window.toggleMoreOptions = toggleMoreOptions;
window.closeMoreOptions = closeMoreOptions;
window.toggleDisplayPanel = toggleDisplayPanel;
window.toggleColumn = toggleColumn;
window.toggleAllColumns = toggleAllColumns;
window.selectSkuRow = selectSkuRow;
window.skuRowDblEdit = skuRowDblEdit;
window.canEditSkuDetails = canEditSkuDetails;
window.handleEditSku = handleEditSku;
window.openSkuMasterForm = openSkuMasterForm;
window.skuSwitchTab = skuSwitchTab;
window.skuViewRegionalDetails = skuViewRegionalDetails;
window.closeSkuEdit = closeSkuEdit;
window.saveSkuMasterForm = saveSkuMasterForm;
// Creatable combobox + tag input handlers (referenced by inline handlers in the JS-built modal).
window.skuComboFilter = skuComboFilter;
window.skuComboKey = skuComboKey;
window.skuComboPick = skuComboPick;
window.skuComboBlur = skuComboBlur;
window.skuComboAddNewOpen = skuComboAddNewOpen;
window.skuComboAddNewConfirm = skuComboAddNewConfirm;
window.skuComboAddNewCancel = skuComboAddNewCancel;
window.skuComboAddNewKey = skuComboAddNewKey;
window.skuTagKey = skuTagKey;
window.skuTagRemove = skuTagRemove;
window.skuTagSuggest = skuTagSuggest;
window.skuTagPick = skuTagPick;

// Close any open combobox / tag dropdown whose container does not contain the click (once, at module
// load). Keeps the clicked control's own list open so tag multi-select keeps working.
document.addEventListener('click', function (e) {
    var lists = document.querySelectorAll('.skuf-combo-list');
    for (var i = 0; i < lists.length; i++) {
        var wrap = lists[i].closest('.skuf-combo') || lists[i].closest('.skuf-tagwrap');
        if (!wrap || !(e.target && wrap.contains(e.target))) lists[i].hidden = true;
    }
});
window.handleSkuTaxRates = handleSkuTaxRates;
window.closeSkuTax = closeSkuTax;
window.openSkuTaxForm = openSkuTaxForm;
window.saveSkuTaxRate = saveSkuTaxRate;
window._renderSkuTaxList = _renderSkuTaxList;
window.formatTaxCountryRoute = formatTaxCountryRoute;

// Ensure the SKU Details markup is present before rendering / scroll init runs.
// Idempotent: if #sku-section already exists, resolves immediately (no re-fetch, no
// duplicate). Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureSkuDetailsMarkup() {
    if (document.getElementById('sku-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('sku-details', 'assets/html/pages/sku-details.html', '#sku-details-mount')
            .then(function() {
                if (!document.getElementById('sku-section')) {
                    console.warn('[SkuDetails] partial loaded but #sku-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[SkuDetails] failed to load partial:', err);
                return false;
            });
    }
    console.warn('[SkuDetails] KM.partialLoader unavailable; markup not loaded.');
    return Promise.resolve(false);
}

// Lifecycle
if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('sku-section', {
        mount() {
            // Markup is partial-loaded (Phase 3-7). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open) and run the
            // existing render + scroll init unchanged.
            _ensureSkuDetailsMarkup().then(function() {
                var sec = document.getElementById('sku-section');
                if (sec) sec.classList.add('active');
                renderSkuDetailsTable();
                setTimeout(function() {
                    if (window.initSkuScroll) initSkuScroll();
                    if (window.initSkuResizableColumns) initSkuResizableColumns();   // resizable columns pilot
                    if (window.updateSkuScrollWidth) updateSkuScrollWidth();
                }, 100);
            });
        },
        unmount() {}
    });
}


// ========================================
// Unit Toggle (Metric / Imperial) with value conversion
// ========================================
var skuUnitSystem = 'metric';
var CM_TO_IN = 0.393701;
var KG_TO_LB = 2.20462;

function toggleSkuUnits() {
    var oldSystem = skuUnitSystem;
    skuUnitSystem = skuUnitSystem === 'metric' ? 'imperial' : 'metric';
    updateSkuUnitLabels();
    convertSkuUnitValues();
}

function updateSkuUnitLabels() {
    var dimUnit = skuUnitSystem === 'metric' ? '(CM)' : '(IN)';
    var wtUnit = skuUnitSystem === 'metric' ? '(KG)' : '(LB)';
    document.querySelectorAll('#sku-section .unit-label').forEach(function(label) {
        var parent = label.parentElement;
        if (!parent) return;
        var text = parent.textContent;
        if (text.includes('DM')) label.textContent = dimUnit;
        else if (text.includes('WT')) label.textContent = wtUnit;
    });
    var btn = document.querySelector('.sku-unit-toggle');
    if (btn) btn.textContent = skuUnitSystem === 'metric' ? 'CM/KG \u2194 IN/LB' : 'IN/LB \u2194 CM/KG';
}

function convertSkuUnitValues() {
    document.querySelectorAll('#sku-section .scroll-cell[data-unit=dim]').forEach(function(cell) {
        // Multi-line cells (item dimensions with a secondary size): convert each .dim-line span.
        var lines = cell.querySelectorAll('.dim-line');
        if (lines.length) {
            lines.forEach(function(span) {
                var lraw = span.getAttribute('data-raw');
                if (!lraw) { lraw = span.textContent.trim(); span.setAttribute('data-raw', lraw); }
                span.textContent = skuUnitSystem === 'imperial' ? convertDimStr(lraw, CM_TO_IN) : lraw;
            });
            // Toggle the inline unit suffix (only when the stored base unit is cm — the converter's baseline).
            var unitSpan = cell.querySelector('.dim-unit');
            if (unitSpan) {
                var base = (unitSpan.getAttribute('data-base-unit') || 'cm').toLowerCase();
                if (base === 'cm' || base === '') unitSpan.textContent = ' ' + (skuUnitSystem === 'imperial' ? 'in' : 'cm');
            }
            return;
        }
        var raw = cell.getAttribute('data-raw');
        if (!raw) { raw = cell.textContent.trim(); cell.setAttribute('data-raw', raw); }
        cell.textContent = skuUnitSystem === 'imperial' ? convertDimStr(raw, CM_TO_IN) : raw;
    });
    document.querySelectorAll('#sku-section .scroll-cell[data-unit=wt]').forEach(function(cell) {
        var raw = cell.getAttribute('data-raw');
        if (!raw) { raw = cell.textContent.trim(); cell.setAttribute('data-raw', raw); }
        cell.textContent = skuUnitSystem === 'imperial' ? convertWtStr(raw, KG_TO_LB) : raw;
    });
}

function convertDimStr(str, factor) {
    if (!str || str === '-' || str === '') return str;
    var parts = str.split(/\s*[xX\u00d7]\s*/);
    if (parts.length >= 2) return parts.map(function(p) { var n = parseFloat(p); return isNaN(n) ? p : (n * factor).toFixed(1); }).join(' x ');
    var n = parseFloat(str); return isNaN(n) ? str : (n * factor).toFixed(1);
}

function convertWtStr(str, factor) {
    if (!str || str === '-' || str === '') return str;
    var n = parseFloat(str); return isNaN(n) ? str : (n * factor).toFixed(3);
}

window.toggleSkuUnits = toggleSkuUnits;


// ========================================
// Resizable Table Columns (pilot — SKU Details only). Uses the shared KM.ui.resizableColumns utility.
// Stable column keys (NOT index/label); one width map shared by all four status tables (same schema);
// persisted to localStorage; restored after reload / filter / search / unit switch / Display / rerender.
// ========================================
// col = the existing data-col index (0 = fixed SKU column). key = stable identity. def matches the base
// CSS width; min/max are content-sensitive clamps. Keys mirror the canonical column schema.
var SKU_RESIZE_COLUMNS = [
  { key: 'sku',                col: 0,  def: 120, min: 90,  max: 260, label: 'SKU' },
  { key: 'image',              col: 1,  def: 64,  min: 48,  max: 140, label: 'Image' },
  { key: 'status',             col: 2,  def: 100, min: 80,  max: 200, label: 'Status' },
  { key: 'product_name',       col: 3,  def: 180, min: 120, max: 440, label: 'Product Name' },
  { key: 'product_name_cn',    col: 4,  def: 180, min: 120, max: 440, label: 'Product Name CN' },
  { key: 'series',             col: 5,  def: 100, min: 80,  max: 240, label: 'Series' },
  { key: 'category',           col: 6,  def: 120, min: 90,  max: 260, label: 'Category' },
  { key: 'gs1_code',           col: 7,  def: 120, min: 90,  max: 240, label: 'GS1 Code' },
  { key: 'gs1_type',           col: 8,  def: 80,  min: 70,  max: 200, label: 'GS1 Type' },
  { key: 'item_dimensions',    col: 9,  def: 150, min: 110, max: 280, label: 'Item DM' },
  { key: 'item_weight',        col: 10, def: 110, min: 90,  max: 240, label: 'Item WT' },
  { key: 'package_dimensions', col: 11, def: 150, min: 110, max: 280, label: 'Package DM' },
  { key: 'package_weight',     col: 12, def: 110, min: 90,  max: 240, label: 'Package WT' },
  { key: 'carton_dimensions',  col: 13, def: 150, min: 110, max: 280, label: 'Carton DM' },
  { key: 'carton_weight',      col: 14, def: 110, min: 90,  max: 240, label: 'Carton WT' },
  { key: 'units_per_carton',   col: 15, def: 80,  min: 70,  max: 200, label: '單箱數量' },
  { key: 'product_use',        col: 16, def: 140, min: 100, max: 320, label: 'Product Use' },
  { key: 'material',           col: 17, def: 90,  min: 80,  max: 280, label: 'Material' },
  { key: 'battery_type',       col: 18, def: 80,  min: 70,  max: 220, label: 'Battery Type' },
  { key: 'magnet_type',        col: 19, def: 80,  min: 70,  max: 220, label: 'Magnet Type' },
  { key: 'minimum_price',      col: 20, def: 120, min: 90,  max: 240, label: 'Minimum Price' },
  { key: 'msrp',               col: 21, def: 80,  min: 70,  max: 220, label: 'MSRP' },
  { key: 'selling_price',      col: 22, def: 100, min: 80,  max: 240, label: 'Selling Price' },
  { key: 'pm',                 col: 23, def: 80,  min: 70,  max: 220, label: '負責PM' }
];
var _skuResizeCtl = null;
function initSkuResizableColumns() {
  var lib = window.KM && window.KM.ui && window.KM.ui.resizableColumns;
  var root = document.getElementById('sku-section');
  if (!lib || !root) return;
  if (_skuResizeCtl) { _skuResizeCtl.refresh(); return; }   // idempotent — re-apply, never duplicate handles
  _skuResizeCtl = lib.create({
    root: root,
    storage: { key: 'km.ui.tableWidths.v1', page: 'sku-details', group: 'master-sku-tables' },
    columns: SKU_RESIZE_COLUMNS,
    getHeaderCells: function (c) {
      return c.col === 0
        ? root.querySelectorAll('.fixed-header .header-cell')
        : root.querySelectorAll('.scroll-header .header-cell[data-col="' + c.col + '"]');
    },
    cssRule: function (c, w) {
      if (c.col === 0) {
        return '#sku-section .fixed-header, #sku-section .fixed-header .header-cell, #sku-section .fixed-col, ' +
               '#sku-section .fixed-body, #sku-section .fixed-row { width:' + w + 'px; min-width:' + w + 'px; max-width:' + w + 'px; }';
      }
      return '#sku-section .scroll-header .header-cell[data-col="' + c.col + '"], ' +
             '#sku-section .scroll-col .scroll-cell[data-col="' + c.col + '"] { width:' + w + 'px; min-width:' + w + 'px; max-width:' + w + 'px; }';
    },
    afterApply: function () { if (window.updateSkuScrollWidth) window.updateSkuScrollWidth(); }
  });
  if (_skuResizeCtl) _skuResizeCtl.init();
}
// Reset Column Widths (Display panel action) — resets ONLY the SKU Details tables; does not touch column
// show/hide, filters, search, unit selection, or any other page's localStorage.
function resetSkuColumnWidths() {
  if (_skuResizeCtl) _skuResizeCtl.resetAll();
  var panel = document.getElementById('displayPanel'); if (panel) panel.classList.remove('show');
}
window.initSkuResizableColumns = initSkuResizableColumns;
window.resetSkuColumnWidths = resetSkuColumnWidths;


// Refresh DB button handler
function handleRefreshDb() {
    showSkuStatusToast('Loading...');
    if (window.reloadOperationDb) {
        window.reloadOperationDb({ force: true }).then(function() {
            showSkuStatusToast('Reload successful.');
        }).catch(function(err) {
            showSkuStatusToast('Reload failed: ' + (err.message || err));
        });
    }
}
window.handleRefreshDb = handleRefreshDb;


// Debug helper for template tools
window.debugSkuTemplateTools = function() {
    var mode = (window.KM && window.KM.DB && window.KM.DB.getDataSourceMode) ? window.KM.DB.getDataSourceMode() : 'unknown';
    var dbItems = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
    console.log('=== SKU Template Tools Debug ===');
    console.log('Data Source Mode:', mode);
    console.log('Export source:', dbItems.length > 0 ? 'KM.DB (' + dbItems.length + ' SKUs)' : 'mock fallback');
    var SKU_HEADERS = ['sku','product_name','category','series','lifecycle','image_url','gs1_code','gs1_type','amz_asin','item_length','item_width','item_height','item_length_2','item_width_2','item_height_2','item_dimension_unit','item_weight','item_weight_unit','package_length','package_width','package_height','package_dimension_unit','package_weight','package_weight_unit','carton_length','carton_width','carton_height','carton_dimension_unit','carton_weight','carton_weight_unit','units_per_carton','hscode','declared_value','declared_value_unit','minimum_price','minimum_price_unit','msrp','msrp_unit','selling_price','selling_unit','pm','created_at','updated_at'];
    console.log('Export schema headers:', SKU_HEADERS);
    console.log('Import expected schema:', SKU_HEADERS.filter(function(h){ return h !== 'created_at' && h !== 'updated_at'; }));
    console.log('Import required fields:', ['sku','product_name','category','series','lifecycle']);
    console.log('Has bulk import cloud write action:', false, '(next phase)');
    console.log('Current SKU count:', dbItems.length);
    console.log('=== End ===');
};
window.showImportPreview = showImportPreview;
