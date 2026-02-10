// ========================================
// Factory Stock 篩選器功能
// ========================================

function toggleFactoryAll(checkbox, filterType) {
    const panel = document.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
    if (!panel) return;
    
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
    updateFactoryFilter(filterType);
}

function updateFactoryFilter(filterType) {
    renderFactoryStockTable();
}

function renderFactoryStockTable() {
    const fixedBody = document.getElementById('factory-stock-fixed-body');
    const scrollBody = document.getElementById('factory-stock-scroll-body');
    
    if (!fixedBody || !scrollBody) return;
    
    // 獲取所有篩選器的選中值
    const factoryFilters = getSelectedFilters('factory');
    const companyFilters = getSelectedFilters('company');
    const marketplaceFilters = getSelectedFilters('marketplace');
    const categoryFilters = getSelectedFilters('category');
    const seriesFilters = getSelectedFilters('series');
    const skuFilter = document.getElementById('factory-sku-input')?.value.toLowerCase() || '';
    
    // 篩選資料
    let filteredData = factoryStockData.filter(item => {
        // Factory 篩選
        if (factoryFilters.length > 0 && !factoryFilters.includes(item.factory)) {
            return false;
        }
        
        // Company 篩選
        if (companyFilters.length > 0 && !companyFilters.includes(item.company)) {
            return false;
        }
        
        // Marketplace 篩選
        if (marketplaceFilters.length > 0 && !marketplaceFilters.includes(item.marketplace)) {
            return false;
        }
        
        // Category 篩選
        if (categoryFilters.length > 0 && !categoryFilters.includes(item.category)) {
            return false;
        }
        
        // Series 篩選
        if (seriesFilters.length > 0 && !seriesFilters.includes(item.series)) {
            return false;
        }
        
        // SKU 搜尋
        if (skuFilter && !item.sku.toLowerCase().includes(skuFilter)) {
            return false;
        }
        
        return true;
    });
    
    // 計算動態月份標題
    const today = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = today.getMonth();
    const month0 = monthNames[currentMonth];
    const month1 = monthNames[(currentMonth + 1) % 12];
    const month2 = monthNames[(currentMonth + 2) % 12];
    
    // 更新 header 月份標題
    const header0 = document.getElementById('factory-month-0');
    const header1 = document.getElementById('factory-month-1');
    const header2 = document.getElementById('factory-month-2');
    if (header0) header0.textContent = `${month0} Orders`;
    if (header1) header1.textContent = `${month1} Orders`;
    if (header2) header2.textContent = `${month2} Orders`;
    
    // 渲染左側固定欄 (SKU)
    fixedBody.innerHTML = filteredData.map(item => `
        <div class="fixed-row">${item.sku}</div>
    `).join('');
    
    // 渲染右側滾動欄 (其他欄位) - 加上千分位符號
    scrollBody.innerHTML = filteredData.map(item => `
        <div class="scroll-row">
            <div class="scroll-cell">${item.company}</div>
            <div class="scroll-cell">${item.marketplace}</div>
            <div class="scroll-cell">${item.category}</div>
            <div class="scroll-cell">${item.series}</div>
            <div class="scroll-cell">${item.factory}</div>
            <div class="scroll-cell">${item.stock.toLocaleString()}</div>
            <div class="scroll-cell">${item.completedOrderMonth0.toLocaleString()}</div>
            <div class="scroll-cell">${item.completedOrderMonth1.toLocaleString()}</div>
            <div class="scroll-cell">${item.completedOrderMonth2.toLocaleString()}</div>
        </div>
    `).join('');
}

function getSelectedFilters(filterType) {
    const panel = document.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
    if (!panel) return [];
    
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function initFactoryDropdown() {
    const triggers = document.querySelectorAll('#factory-stock-section .fc-dropdown-trigger');
    
    triggers.forEach(trigger => {
        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            const filterType = this.dataset.filter;
            const panel = document.querySelector(`#factory-stock-section .fc-dropdown-panel[data-filter="${filterType}"]`);
            
            // 關閉其他 panel
            document.querySelectorAll('#factory-stock-section .fc-dropdown-panel').forEach(p => {
                if (p !== panel) p.classList.remove('is-open');
            });
            
            // 切換當前 panel
            if (panel) {
                panel.classList.toggle('is-open');
            }
        });
    });
    
    // 防止 panel 內部點擊關閉
    document.querySelectorAll('#factory-stock-section .fc-dropdown-panel').forEach(panel => {
        panel.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
    
    // 點擊外部關閉
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#factory-stock-section .filter-group--dropdown')) {
            document.querySelectorAll('#factory-stock-section .fc-dropdown-panel').forEach(p => {
                p.classList.remove('is-open');
            });
        }
    });
}

// 暴露函數到全域
window.toggleFactoryAll = toggleFactoryAll;
window.updateFactoryFilter = updateFactoryFilter;
window.renderFactoryStockTable = renderFactoryStockTable;
window.initFactoryDropdown = initFactoryDropdown;
