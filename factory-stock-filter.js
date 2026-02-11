// ========================================
// Factory Stock 篩選器功能
// ========================================

function toggleFactoryAll(checkbox, filterType) {
    const panel = document.querySelector(`#factory-stock-section .fc-dropdown-panel[data-filter="${filterType}"]`);
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
    
    const factoryFilters = getSelectedFilters('factory');
    const companyFilters = getSelectedFilters('company');
    const marketplaceFilters = getSelectedFilters('marketplace');
    const categoryFilters = getSelectedFilters('category');
    const seriesFilters = getSelectedFilters('series');
    const skuFilter = document.getElementById('factory-sku-input')?.value.toLowerCase() || '';
    
    let filteredData = (window.factoryStockData || []).filter(item => {
        if (factoryFilters.length > 0 && !factoryFilters.includes(item.factory)) return false;
        if (companyFilters.length > 0 && !companyFilters.includes(item.company)) return false;
        if (marketplaceFilters.length > 0 && !marketplaceFilters.includes(item.marketplace)) return false;
        if (categoryFilters.length > 0 && !categoryFilters.includes(item.category)) return false;
        if (seriesFilters.length > 0 && !seriesFilters.includes(item.series)) return false;
        if (skuFilter && !item.sku.toLowerCase().includes(skuFilter)) return false;
        return true;
    });
    
    const today = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = today.getMonth();
    
    const header0 = document.getElementById('factory-month-0');
    const header1 = document.getElementById('factory-month-1');
    const header2 = document.getElementById('factory-month-2');
    if (header0) header0.textContent = `${monthNames[currentMonth]} Orders`;
    if (header1) header1.textContent = `${monthNames[(currentMonth + 1) % 12]} Orders`;
    if (header2) header2.textContent = `${monthNames[(currentMonth + 2) % 12]} Orders`;
    
    fixedBody.innerHTML = filteredData.map(item => `
        <div class="fixed-row">${item.sku}</div>
    `).join('');
    
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
    const panel = document.querySelector(`#factory-stock-section .fc-dropdown-panel[data-filter="${filterType}"]`);
    if (!panel) return [];
    
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function initFactoryDropdown() {
    const section = document.getElementById('factory-stock-section');
    if (!section) return;
    
    const triggers = section.querySelectorAll('.fc-dropdown-trigger');
    
    triggers.forEach(trigger => {
        const newTrigger = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(newTrigger, trigger);
        
        newTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            const filterType = this.dataset.filter;
            const panel = section.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
            
            section.querySelectorAll('.fc-dropdown-panel').forEach(p => {
                if (p !== panel) p.classList.remove('is-open');
            });
            
            if (panel) {
                panel.classList.toggle('is-open');
            }
        });
    });
    
    section.querySelectorAll('.fc-dropdown-panel').forEach(panel => {
        const newPanel = panel.cloneNode(true);
        panel.parentNode.replaceChild(newPanel, panel);
        
        newPanel.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
    
    if (!section._factoryClickHandler) {
        section._factoryClickHandler = function(e) {
            if (!section.contains(e.target) || !e.target.closest('.filter-group--dropdown')) {
                section.querySelectorAll('.fc-dropdown-panel').forEach(p => {
                    p.classList.remove('is-open');
                });
            }
        };
        document.addEventListener('click', section._factoryClickHandler);
    }
}

window.toggleFactoryAll = toggleFactoryAll;
window.updateFactoryFilter = updateFactoryFilter;
window.renderFactoryStockTable = renderFactoryStockTable;
window.initFactoryDropdown = initFactoryDropdown;
