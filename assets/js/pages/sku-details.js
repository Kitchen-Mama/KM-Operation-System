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
            ? '<img src="' + img + '" style="max-width:36px;max-height:36px;object-fit:contain;" onerror="this.outerHTML=\'<span>IMG</span>\'">'
            : '<span>IMG</span>';
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
            '<div class="scroll-cell" data-col="6">' + item.gs1Code + '</div>' +
            '<div class="scroll-cell" data-col="7">' + item.gs1Type + '</div>' +
            '<div class="scroll-cell" data-col="8">' + item.amzAsin + '</div>' +
            '<div class="scroll-cell" data-col="9">' + item.itemDimensions + '</div>' +
            '<div class="scroll-cell" data-col="10">' + item.itemWeight + '</div>' +
            '<div class="scroll-cell" data-col="11">' + item.package + '</div>' +
            '<div class="scroll-cell" data-col="12">' + item.packageWeight + '</div>' +
            '<div class="scroll-cell" data-col="13">' + item.cartonDimensions + '</div>' +
            '<div class="scroll-cell" data-col="14">' + item.cartonWeight + '</div>' +
            '<div class="scroll-cell" data-col="15">' + item.unitsPerCarton + '</div>' +
            '<div class="scroll-cell" data-col="16">' + item.hscode + '</div>' +
            '<div class="scroll-cell" data-col="17">' + item.declaredValue + '</div>' +
            '<div class="scroll-cell" data-col="18">' + item.minimumPrice + '</div>' +
            '<div class="scroll-cell" data-col="19">' + item.msrp + '</div>' +
            '<div class="scroll-cell" data-col="20">' + item.sellingPrice + '</div>' +
            '<div class="scroll-cell" data-col="21">' + item.pm + '</div>' +
        '</div>';
    }).join('');
}

function handleSkuStatusChange(sku, newLifecycle) {
    if (window.setSkuLifecycleOverride) setSkuLifecycleOverride(sku, newLifecycle);
    renderSkuDetailsTable();
    if (window.renderSkuHandbook) setTimeout(function() { renderSkuHandbook(); }, 50);
    showSkuStatusToast('SKU status updated.');
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
        importSkuStatusTemplate(this.files[0]).then(function(result) {
            alert('Import complete:\n' + result.updated + ' SKUs updated.\n' + (result.added || 0) + ' SKUs added.\n' + result.skipped + ' rows skipped.');
            renderSkuDetailsTable();
            if (window.renderSkuHandbook) setTimeout(function() { renderSkuHandbook(); }, 50);
        });
    };
    input.click();
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
    alert('Add SKU \u529f\u80fd - Stage 1 placeholder');
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

// Lifecycle
if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('sku-section', {
        mount() {
            renderSkuDetailsTable();
            setTimeout(function() {
                if (window.initSkuScroll) initSkuScroll();
                if (window.updateSkuScrollWidth) updateSkuScrollWidth();
            }, 100);
        },
        unmount() {}
    });
}


// ========================================
// Unit Toggle (Metric ↔ Imperial)
// ========================================
var skuUnitSystem = 'metric'; // 'metric' = CM/KG, 'imperial' = IN/LB

function toggleSkuUnits() {
    skuUnitSystem = skuUnitSystem === 'metric' ? 'imperial' : 'metric';
    updateSkuUnitLabels();
}

function updateSkuUnitLabels() {
    var dimUnit = skuUnitSystem === 'metric' ? '(CM)' : '(IN)';
    var wtUnit = skuUnitSystem === 'metric' ? '(KG)' : '(LB)';
    var labels = document.querySelectorAll('#sku-section .unit-label');
    labels.forEach(function(label) {
        var parent = label.parentElement;
        if (!parent) return;
        var text = parent.textContent;
        if (text.includes('DM')) {
            label.textContent = dimUnit;
        } else if (text.includes('WT')) {
            label.textContent = wtUnit;
        }
    });
    // Update toggle button text
    var btn = document.querySelector('.sku-unit-toggle');
    if (btn) btn.textContent = skuUnitSystem === 'metric' ? 'CM/KG \u2194 IN/LB' : 'IN/LB \u2194 CM/KG';
}

window.toggleSkuUnits = toggleSkuUnits;
