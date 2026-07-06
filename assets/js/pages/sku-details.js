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
        return '<div class="fixed-row">' + item.sku + '</div>';
    }).join('');

    scrollBody.innerHTML = data.map(function(item) {
        var img = window.getNormalizedSkuImage ? getNormalizedSkuImage(item) : (item.image || '');
        var imgHtml = img
            ? '<img src="' + img + '" style="max-width:36px;max-height:36px;object-fit:contain;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'"><span style="display:none;color:#94a3b8">IMG</span>'
            : '<span style="color:#94a3b8">IMG</span>';
        var currentLc = window.getNormalizedSkuStatus ? getNormalizedSkuStatus(item) : (item.status || '');
        var validLc = window.VALID_LIFECYCLES || ['Upcoming SKU','Running in the Market','Phasing Out','Closure'];
        var lcOptions = validLc.map(function(lc) {
            return '<option value="' + lc + '"' + (lc === currentLc ? ' selected' : '') + '>' + lc + '</option>';
        }).join('');

        return '<div class="scroll-row">' +
            '<div class="scroll-cell" data-col="1"><div class="image-placeholder">' + imgHtml + '</div></div>' +
            '<div class="scroll-cell" data-col="2"><select class="sku-status-dropdown" onchange="handleSkuStatusChange(\'' + item.sku + '\', this.value)" onclick="event.stopPropagation()">' + lcOptions + '</select></div>' +
            '<div class="scroll-cell" data-col="3">' + item.productName + '</div>' +
            '<div class="scroll-cell" data-col="4">' + item.series + '</div>' +
            '<div class="scroll-cell" data-col="5">' + item.category + '</div>' +
            '<div class="scroll-cell" data-col="6">' + (item.gs1Code || item.gs1_code || '') + '</div>' +
            '<div class="scroll-cell" data-col="7">' + (item.gs1Type || item.gs1_type || '') + '</div>' +
            '<div class="scroll-cell" data-col="8">' + (item.amzAsin || item.amz_asin || '') + '</div>' +
            '<div class="scroll-cell" data-col="9" data-unit="dim">' + _skuItemDimCell(item) + '</div>' +
            '<div class="scroll-cell" data-col="10" data-unit="wt">' + (item.itemWeight || item.item_weight || '') + '</div>' +
            '<div class="scroll-cell" data-col="11" data-unit="dim">' + (item.packageDimensions || item.package || item.package_dimensions || '') + '</div>' +
            '<div class="scroll-cell" data-col="12" data-unit="wt">' + (item.packageWeight || item.package_weight || '') + '</div>' +
            '<div class="scroll-cell" data-col="13" data-unit="dim">' + (item.cartonDimensions || item.carton_dimensions || '') + '</div>' +
            '<div class="scroll-cell" data-col="14" data-unit="wt">' + (item.cartonWeight || item.carton_weight || '') + '</div>' +
            '<div class="scroll-cell" data-col="15">' + (item.unitsPerCarton || item.units_per_carton || '') + '</div>' +
            // SKU Domain v2.0: cols 16/17/18 = Material / Battery Type / Magnet Type (two INDEPENDENT
            // attributes, 1:1 with sku_details.battery_type / magnet_type). HS Code + Declared Value
            // moved to tax_referral_rates. Prices use the single base_currency.
            '<div class="scroll-cell" data-col="16">' + (item.material || '') + '</div>' +
            '<div class="scroll-cell" data-col="17">' + (item.batteryType || '') + '</div>' +
            '<div class="scroll-cell" data-col="18">' + (item.magnetType || '') + '</div>' +
            '<div class="scroll-cell" data-col="19">' + _skuPrice(item.minimumPrice || item.minimum_price, item.baseCurrency) + '</div>' +
            '<div class="scroll-cell" data-col="20">' + _skuPrice(item.msrp, item.baseCurrency) + '</div>' +
            '<div class="scroll-cell" data-col="21">' + _skuPrice(item.sellingPrice || item.selling_price, item.baseCurrency) + '</div>' +
            '<div class="scroll-cell" data-col="22">' + item.pm + '</div>' +
        '</div>';
    }).join('');
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
