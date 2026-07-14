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
        // Plain SKU cell. Row is SELECTABLE (click) — editing happens via the top "Edit SKU" action.
        var skuEsc = String(item.sku).replace(/'/g, "\\'");
        var sel = (_selectedSku && String(item.sku) === String(_selectedSku)) ? ' sku-row-selected' : '';
        return '<div class="fixed-row' + sel + '" data-sku="' + _skuAttr(item.sku) + '" onclick="selectSkuRow(\'' + skuEsc + '\')">' + item.sku + '</div>';
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
        return '<div class="scroll-row' + sel + '" data-sku="' + _skuAttr(item.sku) + '" onclick="selectSkuRow(\'' + skuEsc + '\')">' +
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
            '<div class="scroll-cell" data-col="18">' + _skuBoolDisplay(item.batteryType) + '</div>' +
            '<div class="scroll-cell" data-col="19">' + _skuBoolDisplay(item.magnetType) + '</div>' +
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
        // Fallback: localStorage only
        if (window.setSkuLifecycleOverride) setSkuLifecycleOverride(sku, newLifecycle);
        renderSkuDetailsTable();
        if (window.renderSkuHandbook) setTimeout(function() { renderSkuHandbook(); }, 50);
        showSkuStatusToast('Lifecycle updated (local).');
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
    alert('Add SKU cloud write-back is not enabled yet. This will be implemented in the next phase.');
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

// Full editable field set (snake_case DB columns). type: readonly | lifecycle | text | textarea | number.
var SKU_EDIT_FIELDS_ = [
    { key: 'sku', label: 'SKU', type: 'readonly' },
    { key: 'lifecycle', label: 'Status', type: 'lifecycle' },
    { key: 'product_name', label: 'Product Name', type: 'text' },
    { key: 'product_name_cn', label: 'Product Name CN (中文品名)', type: 'text' },
    { key: 'series', label: 'Series', type: 'text' },
    { key: 'category', label: 'Category', type: 'text' },
    { key: 'gs1_code', label: 'GS1 Code', type: 'text' },
    { key: 'gs1_type', label: 'GS1 Type', type: 'text' },
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'battery_type', label: 'Battery Type (false/none or e.g. Lithium-Ion)', type: 'text' },
    { key: 'magnet_type', label: 'Magnet Type (false/none/true)', type: 'text' },
    { key: 'product_use', label: 'Product Use (用途 / 報關用途)', type: 'textarea' },
    { key: 'units_per_carton', label: 'Units / Carton', type: 'number' },
    { key: 'item_length', label: 'Item L', type: 'number' },
    { key: 'item_width', label: 'Item W', type: 'number' },
    { key: 'item_height', label: 'Item H', type: 'number' },
    { key: 'item_dimension_unit', label: 'Item Dim Unit', type: 'text' },
    { key: 'item_weight', label: 'Item Weight', type: 'number' },
    { key: 'item_weight_unit', label: 'Item Weight Unit', type: 'text' },
    { key: 'package_length', label: 'Package L', type: 'number' },
    { key: 'package_width', label: 'Package W', type: 'number' },
    { key: 'package_height', label: 'Package H', type: 'number' },
    { key: 'package_dimension_unit', label: 'Package Dim Unit', type: 'text' },
    { key: 'package_weight', label: 'Package Weight', type: 'number' },
    { key: 'package_weight_unit', label: 'Package Weight Unit', type: 'text' },
    { key: 'carton_length', label: 'Carton L', type: 'number' },
    { key: 'carton_width', label: 'Carton W', type: 'number' },
    { key: 'carton_height', label: 'Carton H', type: 'number' },
    { key: 'carton_dimension_unit', label: 'Carton Dim Unit', type: 'text' },
    { key: 'carton_weight', label: 'Carton Weight', type: 'number' },
    { key: 'carton_weight_unit', label: 'Carton Weight Unit', type: 'text' },
    { key: 'minimum_price', label: 'Minimum Price', type: 'number' },
    { key: 'msrp', label: 'MSRP', type: 'number' },
    { key: 'selling_price', label: 'Selling Price', type: 'number' },
    { key: 'base_currency', label: 'Base Currency', type: 'text' },
    { key: 'pm', label: '負責PM', type: 'text' }
];

function _skuEditLoadValue(rec, f) {
    if (!rec) return '';
    if (f.key === 'sku') return rec.sku || '';
    if (f.key === 'lifecycle') {
        return (window.getNormalizedSkuStatus ? getNormalizedSkuStatus(rec) : '') ||
            (rec.raw && rec.raw.lifecycle) || rec.lifecycle || '';
    }
    return (rec.raw && rec.raw[f.key] != null) ? rec.raw[f.key] : '';
}

function _buildSkuEditModal() {
    var overlay = document.createElement('div');
    overlay.id = 'sku-edit-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:10000;display:none;align-items:center;justify-content:center;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:10px;width:min(720px,94vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.2);overflow:hidden;">' +
            '<div style="padding:14px 18px;border-bottom:1px solid #E2E8F0;font-weight:600;font-size:15px;color:#1E293B;" id="sku-edit-title">Edit SKU</div>' +
            '<div id="sku-edit-body" style="padding:18px;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;"></div>' +
            '<div style="padding:14px 18px;border-top:1px solid #E2E8F0;display:flex;justify-content:flex-end;gap:10px;">' +
                '<button type="button" onclick="closeSkuEdit()" style="padding:8px 16px;border:1px solid #CBD5E1;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;">Cancel</button>' +
                '<button type="button" onclick="saveSkuEdit()" style="padding:8px 16px;border:none;background:#3B82F6;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;">Save</button>' +
            '</div>' +
        '</div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeSkuEdit(); });
    return overlay;
}

function handleEditSku() {
    if (!canEditSkuDetails()) { alert('You do not have permission to edit SKU Details.'); return; }
    if (!_selectedSku) { alert('Select a SKU row first, then click Edit SKU.'); return; }
    var rec = _skuFindRecord(_selectedSku);
    var overlay = document.getElementById('sku-edit-modal-overlay');
    if (!overlay) { overlay = _buildSkuEditModal(); document.body.appendChild(overlay); }
    overlay.querySelector('#sku-edit-title').textContent = 'Edit SKU — ' + _selectedSku;
    var validLc = window.VALID_LIFECYCLES || ['Upcoming SKU', 'Running in the Market', 'Phasing Out', 'Closure'];
    var esc = function(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var body = overlay.querySelector('#sku-edit-body');
    body.innerHTML = SKU_EDIT_FIELDS_.map(function(f) {
        var val = _skuEditLoadValue(rec, f);
        var id = 'sku-edit-f-' + f.key;
        var wide = (f.type === 'textarea') ? 'grid-column:1 / -1;' : '';
        var control;
        if (f.type === 'readonly') {
            control = '<input id="' + id + '" type="text" value="' + esc(val) + '" readonly ' +
                'style="padding:7px 9px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;background:#F1F5F9;color:#64748B;">';
        } else if (f.type === 'lifecycle') {
            var opts = validLc.map(function(lc) { return '<option value="' + esc(lc) + '"' + (String(lc) === String(val) ? ' selected' : '') + '>' + esc(lc) + '</option>'; }).join('');
            control = '<select id="' + id + '" style="padding:7px 9px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;">' + opts + '</select>';
        } else if (f.type === 'textarea') {
            control = '<textarea id="' + id + '" rows="2" style="padding:7px 9px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;resize:vertical;">' + esc(val) + '</textarea>';
        } else {
            control = '<input id="' + id + '" type="' + (f.type === 'number' ? 'number' : 'text') + '" value="' + esc(val) + '" ' +
                'style="padding:7px 9px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;">';
        }
        return '<div style="display:flex;flex-direction:column;gap:3px;' + wide + '">' +
            '<label style="font-size:11px;color:#64748B;">' + esc(f.label) + '</label>' + control + '</div>';
    }).join('');
    overlay.style.display = 'flex';
}

function closeSkuEdit() {
    var o = document.getElementById('sku-edit-modal-overlay');
    if (o) o.style.display = 'none';
}

function saveSkuEdit() {
    var o = document.getElementById('sku-edit-modal-overlay');
    if (!o) return;
    var sku = _selectedSku;
    if (!sku) { alert('No SKU selected.'); return; }
    // Collect every editable field (SKU is read-only / the match key). Fields rendered here are always
    // sent (blank = intentional clear); columns NOT in this editor are preserved by the backend.
    var payload = { sku: sku };
    SKU_EDIT_FIELDS_.forEach(function(f) {
        if (f.type === 'readonly') return;
        var el = o.querySelector('#sku-edit-f-' + f.key);
        if (!el) return;
        payload[f.key] = (el.value == null ? '' : String(el.value)).trim();
    });
    if (!(window.KM && window.KM.DB && window.KM.DB.upsertSkuDetail)) {
        alert('Save unavailable (KM.DB.upsertSkuDetail not configured).');
        return;
    }
    showSkuStatusToast('Saving...');
    window.KM.DB.upsertSkuDetail(payload).then(function() {
        showSkuStatusToast('Saved.');
        closeSkuEdit();
        renderSkuDetailsTable();
        if (window.renderSkuHandbook) setTimeout(function() { renderSkuHandbook(); }, 50);
    }).catch(function(err) {
        showSkuStatusToast('Error: ' + (err && err.message ? err.message : err));
    });
}

function handleSkuSearch() {
    var searchTerm = document.getElementById('skuSearchInput').value.toLowerCase();
    var fixedBodies = document.querySelectorAll('#sku-section .fixed-body');
    var scrollBodies = document.querySelectorAll('#sku-section .scroll-body');
    fixedBodies.forEach(function(fixedBody, index) {
        var fixedRows = fixedBody.querySelectorAll('.fixed-row');
        var scrollBody = scrollBodies[index];
        var scrollRows = scrollBody ? scrollBody.querySelectorAll('.scroll-row') : [];
        fixedRows.forEach(function(fixedRow, rowIndex) {
            var skuText = fixedRow.textContent.toLowerCase();
            var shouldShow = skuText.includes(searchTerm);
            fixedRow.style.display = shouldShow ? '' : 'none';
            if (scrollRows[rowIndex]) scrollRows[rowIndex].style.display = shouldShow ? '' : 'none';
        });
    });
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

// Display panel close on outside click
document.addEventListener('click', function(event) {
    var displayDropdown = document.querySelector('.display-dropdown');
    var panel = document.getElementById('displayPanel');
    if (displayDropdown && panel && !displayDropdown.contains(event.target)) {
        panel.classList.remove('show');
    }
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
window.toggleDisplayPanel = toggleDisplayPanel;
window.toggleColumn = toggleColumn;
window.toggleAllColumns = toggleAllColumns;
window.selectSkuRow = selectSkuRow;
window.canEditSkuDetails = canEditSkuDetails;
window.handleEditSku = handleEditSku;
window.closeSkuEdit = closeSkuEdit;
window.saveSkuEdit = saveSkuEdit;

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
