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
        
        // 創建統一滾動條
        if (!unifiedScroll) {
            unifiedScroll = document.createElement('div');
            unifiedScroll.className = 'sku-unified-scroll';
            unifiedScroll.innerHTML = '<div class="sku-unified-scroll-content"></div>';
            skuDetailsSection.appendChild(unifiedScroll);
        }
        
        isInitialized = true;
        
        // 計算最大寬度
        updateScrollWidth();
        
        // 監聽統一滾動條
        unifiedScroll.addEventListener('scroll', function() {
            const scrollLeft = this.scrollLeft;
            scrollCols.forEach(col => {
                col.scrollLeft = scrollLeft;
            });
        });
        
        // 支援 Shift+滾輪 和 水平滾輪
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
            const scrollWidth = col.scrollWidth;
            if (scrollWidth > maxScrollWidth) {
                maxScrollWidth = scrollWidth;
            }
        });
        
        const content = unifiedScroll.querySelector('.sku-unified-scroll-content');
        const fixedColWidth = 200;
        content.style.width = (maxScrollWidth + fixedColWidth) + 'px';
    }
    
    window.addEventListener('DOMContentLoaded', function() {
        setTimeout(initSkuScroll, 100);
    });
    
    window.addEventListener('resize', function() {
        updateScrollWidth();
    });
    
    // 監聽 SKU Details 頁面切換
    const observer = new MutationObserver(function() {
        const skuSection = document.getElementById('sku-section');
        if (skuSection && !skuSection.classList.contains('is-hidden')) {
            if (!isInitialized) {
                setTimeout(initSkuScroll, 100);
            }
            setTimeout(updateScrollWidth, 200);
        }
    });
    
    setTimeout(function() {
        const skuSection = document.getElementById('sku-section');
        if (skuSection) {
            observer.observe(skuSection, { attributes: true, attributeFilter: ['class'] });
        }
    }, 500);
    
    window.updateSkuScrollWidth = updateScrollWidth;
    window.initSkuScroll = initSkuScroll;
})();


// ========================================
// SKU Details Page Logic
// 從 app.js 搬移，不改行為
// ========================================

function renderSkuDetailsTable() {
    renderSkuLifecycleTable('upcoming', upcomingSkuData);
    renderSkuLifecycleTable('running', runningSkuData);
    renderSkuLifecycleTable('phasing', phasingOutSkuData);
    setTimeout(() => {
        syncSkuHeaderScroll();
    }, 100);
}

function renderSkuLifecycleTable(section, data) {
    const fixedBody = document.getElementById(`${section}FixedBody`);
    const scrollBody = document.getElementById(`${section}ScrollBody`);
    if (!fixedBody || !scrollBody) return;
    fixedBody.innerHTML = data.map(item => `
        <div class="fixed-row">${item.sku}</div>
    `).join('');
    scrollBody.innerHTML = data.map(item => `
        <div class="scroll-row">
            <div class="scroll-cell" data-col="1"><div class="image-placeholder">IMG</div></div>
            <div class="scroll-cell" data-col="2">${item.status}</div>
            <div class="scroll-cell" data-col="3">${item.productName}</div>
            <div class="scroll-cell" data-col="4">${item.series}</div>
            <div class="scroll-cell" data-col="5">${item.category}</div>
            <div class="scroll-cell" data-col="6">${item.gs1Code}</div>
            <div class="scroll-cell" data-col="7">${item.gs1Type}</div>
            <div class="scroll-cell" data-col="8">${item.amzAsin}</div>
            <div class="scroll-cell" data-col="9">${item.itemDimensions}</div>
            <div class="scroll-cell" data-col="10">${item.itemWeight}</div>
            <div class="scroll-cell" data-col="11">${item.package}</div>
            <div class="scroll-cell" data-col="12">${item.packageWeight}</div>
            <div class="scroll-cell" data-col="13">${item.cartonDimensions}</div>
            <div class="scroll-cell" data-col="14">${item.cartonWeight}</div>
            <div class="scroll-cell" data-col="15">${item.unitsPerCarton}</div>
            <div class="scroll-cell" data-col="16">${item.hscode}</div>
            <div class="scroll-cell" data-col="17">${item.declaredValue}</div>
            <div class="scroll-cell" data-col="18">${item.minimumPrice}</div>
            <div class="scroll-cell" data-col="19">${item.msrp}</div>
            <div class="scroll-cell" data-col="20">${item.sellingPrice}</div>
            <div class="scroll-cell" data-col="21">${item.pm}</div>
        </div>
    `).join('');
}

function syncSkuHeaderScroll() {
    const sections = ['upcoming', 'running', 'phasing'];
    sections.forEach(section => {
        const scrollCol = document.querySelector(`#sku-section [data-section="${section}"] .scroll-col`);
        const scrollHeader = document.querySelector(`#sku-section [data-section="${section}"] .scroll-header`);
        if (!scrollCol || !scrollHeader) return;
        scrollCol.addEventListener('scroll', () => {
            scrollHeader.style.transform = `translateX(-${scrollCol.scrollLeft}px)`;
        });
    });
}

function initSkuUnifiedScroll() {
    const xscroll = document.querySelector('#sku-section .sku-xscroll');
    const scrollCols = document.querySelectorAll('#sku-section .scroll-col');
    if (!xscroll || scrollCols.length === 0) return;
    xscroll.addEventListener('scroll', function() {
        const scrollLeft = this.scrollLeft;
        scrollCols.forEach(col => {
            col.scrollLeft = scrollLeft;
        });
    });
}

function toggleSection(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    const arrow = section.querySelector('.arrow');
    section.classList.toggle('is-collapsed');
    if (section.classList.contains('is-collapsed')) {
        arrow.textContent = '\u25B6';
    } else {
        arrow.textContent = '\u25BC';
    }
}

function handleAddSku() {
    console.log('Add SKU clicked');
    alert('Add SKU \u529f\u80fd - Stage 1 placeholder');
}

function handleSkuSearch() {
    const searchTerm = document.getElementById('skuSearchInput').value.toLowerCase();
    const fixedBodies = document.querySelectorAll('#sku-section .fixed-body');
    const scrollBodies = document.querySelectorAll('#sku-section .scroll-body');
    fixedBodies.forEach((fixedBody, index) => {
        const fixedRows = fixedBody.querySelectorAll('.fixed-row');
        const scrollBody = scrollBodies[index];
        const scrollRows = scrollBody ? scrollBody.querySelectorAll('.scroll-row') : [];
        fixedRows.forEach((fixedRow, rowIndex) => {
            const skuText = fixedRow.textContent.toLowerCase();
            const shouldShow = skuText.includes(searchTerm);
            fixedRow.style.display = shouldShow ? '' : 'none';
            if (scrollRows[rowIndex]) {
                scrollRows[rowIndex].style.display = shouldShow ? '' : 'none';
            }
        });
    });
}

function toggleDisplayPanel() {
    const panel = document.getElementById('displayPanel');
    panel.classList.toggle('show');
}

function toggleColumn(colIndex) {
    const sections = document.querySelectorAll('#sku-section .sku-lifecycle-section');
    sections.forEach(section => {
        if (colIndex === 0) {
            const fixedCol = section.querySelector('.fixed-col');
            if (fixedCol) {
                const isVisible = fixedCol.style.display !== 'none';
                fixedCol.style.display = isVisible ? 'none' : '';
            }
        } else {
            const headerCells = section.querySelectorAll('.scroll-header .header-cell[data-col="' + colIndex + '"]');
            const scrollCells = section.querySelectorAll('.scroll-col .scroll-cell[data-col="' + colIndex + '"]');
            headerCells.forEach(cell => {
                const isVisible = cell.style.display !== 'none';
                cell.style.display = isVisible ? 'none' : '';
            });
            scrollCells.forEach(cell => {
                const isVisible = cell.style.display !== 'none';
                cell.style.display = isVisible ? 'none' : '';
            });
        }
    });
    updateAllCheckbox();
    if (window.updateSkuScrollWidth) {
        setTimeout(() => window.updateSkuScrollWidth(), 50);
    }
}

function toggleAllColumns() {
    const checkAll = document.getElementById('checkAll');
    const colCheckboxes = document.querySelectorAll('.col-checkbox');
    const sections = document.querySelectorAll('#sku-section .sku-lifecycle-section');
    colCheckboxes.forEach(checkbox => {
        checkbox.checked = checkAll.checked;
        const colIndex = parseInt(checkbox.dataset.col);
        sections.forEach(section => {
            if (colIndex === 0) {
                const fixedCol = section.querySelector('.fixed-col');
                if (fixedCol) {
                    fixedCol.style.display = checkAll.checked ? '' : 'none';
                }
            } else {
                const headerCells = section.querySelectorAll('.scroll-header .header-cell[data-col="' + colIndex + '"]');
                const scrollCells = section.querySelectorAll('.scroll-col .scroll-cell[data-col="' + colIndex + '"]');
                headerCells.forEach(cell => {
                    cell.style.display = checkAll.checked ? '' : 'none';
                });
                scrollCells.forEach(cell => {
                    cell.style.display = checkAll.checked ? '' : 'none';
                });
            }
        });
    });
    if (window.updateSkuScrollWidth) {
        setTimeout(() => window.updateSkuScrollWidth(), 50);
    }
}

function updateAllCheckbox() {
    const checkAll = document.getElementById('checkAll');
    const colCheckboxes = document.querySelectorAll('.col-checkbox');
    const allChecked = Array.from(colCheckboxes).every(cb => cb.checked);
    checkAll.checked = allChecked;
}

// Display panel 外部點擊關閉
document.addEventListener('click', function(event) {
    const displayDropdown = document.querySelector('.display-dropdown');
    const panel = document.getElementById('displayPanel');
    if (displayDropdown && panel && !displayDropdown.contains(event.target)) {
        panel.classList.remove('show');
    }
});

// 暴露到全域
window.renderSkuDetailsTable = renderSkuDetailsTable;
window.initSkuUnifiedScroll = initSkuUnifiedScroll;
window.toggleSection = toggleSection;
window.handleAddSku = handleAddSku;
window.handleSkuSearch = handleSkuSearch;
window.toggleDisplayPanel = toggleDisplayPanel;
window.toggleColumn = toggleColumn;
window.toggleAllColumns = toggleAllColumns;


// ========================================
// Lifecycle 註冊
// ========================================
if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('sku-section', {
        mount() {
            console.log('[SKUDetails] mount');
            renderSkuDetailsTable();
            setTimeout(() => {
                if (window.initSkuScroll) {
                    window.initSkuScroll();
                }
                if (window.updateSkuScrollWidth) {
                    window.updateSkuScrollWidth();
                }
            }, 100);
        },
        unmount() {
            console.log('[SKUDetails] unmount');
        }
    });
}
