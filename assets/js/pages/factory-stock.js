// Factory Stock篩選器功能

function initFactoryStockPage() {
    console.log('✅ Factory Stock: initFactoryStockPage called');
    const root = document.querySelector('#factory-stock-section');
    if (!root) {
        console.error('❌ Factory Stock: Section not found');
        return;
    }
    
    // Prevent duplicate initialization
    if (root._factoryStockInitialized) {
        console.log('⚠️ Factory Stock: Already initialized, skipping');
        return;
    }
    root._factoryStockInitialized = true;
    
    console.log('✅ Factory Stock: Data available:', !!window.factoryStockData, 'rows:', window.factoryStockData?.length);
    
    // 綁定dropdown trigger點擊事件
    root.querySelectorAll('.fc-dropdown-trigger').forEach(trigger => {
        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            const filterType = this.dataset.filter;
            const panel = root.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
            
            root.querySelectorAll('.fc-dropdown-panel').forEach(p => {
                if (p !== panel) p.classList.remove('is-open');
            });
            
            if (panel) panel.classList.toggle('is-open');
        });
    });
    
    // 綁定checkbox change事件
    root.querySelectorAll('.fc-dropdown-panel').forEach(panel => {
        panel.addEventListener('click', e => e.stopPropagation());
        
        const filterType = panel.dataset.filter;
        const allCheckbox = panel.querySelector('input[value=""]');
        const otherCheckboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
        
        // All checkbox事件
        if (allCheckbox) {
            allCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                otherCheckboxes.forEach(cb => cb.checked = isChecked);
                updateFilterText(filterType, root);
                renderFactoryStockTable(root);
                console.log(`✅ all = ${isChecked}, selectedCount = ${isChecked ? otherCheckboxes.length : 0}`);
            });
        }
        
        // 個別checkbox事件
        otherCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const checkedCount = Array.from(otherCheckboxes).filter(cb => cb.checked).length;
                if (allCheckbox) {
                    allCheckbox.checked = checkedCount === otherCheckboxes.length;
                }
                updateFilterText(filterType, root);
                renderFactoryStockTable(root);
                console.log(`✅ filter changed: {dimension: ${filterType}, selected: [${Array.from(otherCheckboxes).filter(cb => cb.checked).map(cb => cb.value).join(', ')}]}, selectedCount = ${checkedCount}`);
            });
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
    ['factory', 'company', 'category', 'series'].forEach(type => {
        updateFilterText(type, root);
    });
    
    // 立即渲染資料
    renderFactoryStockTable(root);
    
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
    if (!window.factoryStockData || window.factoryStockData.length === 0) {
        console.error('❌ Factory Stock: No data available');
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#EF4444">No data available</div>';
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
        company: getFilters('company'),
        category: getFilters('category'),
        series: getFilters('series'),
        sku: root.querySelector('#factory-sku-input')?.value.toLowerCase() || ''
    };
    
    let data = window.factoryStockData.filter(item => {
        if (filters.factory.length > 0 && !filters.factory.includes(item.factory)) return false;
        if (filters.company.length > 0 && !filters.company.includes(item.company)) return false;
        if (filters.category.length > 0 && !filters.category.includes(item.category)) return false;
        if (filters.series.length > 0 && !filters.series.includes(item.series)) return false;
        if (filters.sku && !item.sku.toLowerCase().includes(filters.sku)) return false;
        return true;
    });
    
    console.log(`✅ factory stock initial render rows = ${data.length}`);
    
    const today = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = today.getMonth();
    
    ['factory-month-0', 'factory-month-1', 'factory-month-2'].forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `${months[(m + i) % 12]} Orders`;
    });
    
    if (data.length === 0) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8">No data found</div>';
        return;
    }
    
    fixedBody.innerHTML = data.map(item => `<div class="fixed-row">${item.sku}</div>`).join('');
    scrollBody.innerHTML = data.map(item => `
        <div class="scroll-row">
            <div class="scroll-cell">${item.company}</div>
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

window.initFactoryStockPage = initFactoryStockPage;
window.initFactoryDropdown = initFactoryDropdown;
window.renderFactoryStockTable = renderFactoryStockTable;
