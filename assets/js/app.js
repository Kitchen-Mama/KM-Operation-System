// ========================================
// Menu Configuration
// ========================================
const menuConfig = [
    {
        id: "forecast",
        label: "Forecast Overview",
        icon: "📈",
        type: "parent",
        children: [
            { id: "forecast-review", label: "Forecast 管理", section: "forecast" },
            { id: "fc-summary", label: "FC Summary", section: "fc-summary" }
        ]
    }
];

// ========================================
// Menu Toggle Function
// ========================================
function toggleMenu(menuId) {
    const parent = document.querySelector(`[data-menu-id="${menuId}"]`);
    const children = document.querySelector(`.menu-children[data-parent="${menuId}"]`);

    if (!parent || !children) return;

    parent.classList.toggle("is-open");
    children.classList.toggle("is-open");
}

window.toggleMenu = toggleMenu;

// ========================================
// Homepage 渲染函式 - Stage 1
// ========================================
function renderHomepage() {
    renderEvents();
    renderGoal();
    renderRow2();
}

function renderRow2() {
    renderAnnouncements();
    renderUrgentIssues();
    renderPersonalTodos();
}

function renderAnnouncements() {
    const announcements = window.DataRepo.getAnnouncements();
    const announcementsList = document.getElementById('announcementsList');
    
    announcementsList.innerHTML = announcements.map(item => `
        <div class="announcement-item">
            <div class="item-title">${item.title}</div>
            <div class="item-time">${item.time}</div>
        </div>
    `).join('');
}

function renderUrgentIssues() {
    const urgentIssues = window.DataRepo.getUrgentIssues();
    const urgentIssuesList = document.getElementById('urgentIssuesList');
    
    urgentIssuesList.innerHTML = urgentIssues.map(item => `
        <div class="urgent-item">
            <div class="item-title">${item.title}</div>
        </div>
    `).join('');
}

function renderPersonalTodos() {
    const todos = window.DataRepo.getPersonalTodos();
    const todoList = document.getElementById('todoList');
    
    todoList.innerHTML = todos.map(todo => `
        <div class="todo-item">${todo.text}</div>
    `).join('');
}

function addTodo() {
    const input = document.getElementById('todoInput');
    const todoText = input.value.trim();
    
    if (todoText) {
        window.DataRepo.addPersonalTodo(todoText);
        input.value = '';
        renderPersonalTodos();
    }
}

function handleTodoEnter(event) {
    if (event.key === 'Enter') {
        addTodo();
    }
}

function renderEvents() {
    const events = window.DataRepo.getEvents();
    const eventsList = document.getElementById('eventsList');
    
    eventsList.innerHTML = events.map(event => `
        <div class="event-card">
            <div class="event-row">
                <span class="event-label">活動名稱</span>
                <span>${event.name}</span>
            </div>
            <div class="event-row">
                <span class="event-label">活動期間</span>
                <span>${event.startDate}~${event.endDate}</span>
            </div>
            <div class="event-row">
                <span class="event-label">Content</span>
                <span>${event.content}</span>
            </div>
        </div>
    `).join('');
}

function renderGoal() {
    const goal = window.DataRepo.getGoalData();
    const achievementRate = Math.round((goal.salesAmount / goal.goalAmount) * 100);
    
    document.getElementById('goalYear').textContent = `${goal.year} Goal`;
    document.getElementById('achievementRate').textContent = `${achievementRate}%`;
    document.getElementById('goalAmount').textContent = `Goal: $${goal.goalAmount.toLocaleString()}`;
    document.getElementById('salesAmount').textContent = `Sales: $${goal.salesAmount.toLocaleString()}`;
    document.getElementById('progressFill').style.width = `${achievementRate}%`;
    document.getElementById('progressText').textContent = `${achievementRate}%`;
}

// 回首頁函式
function showHome() {
    document.getElementById('home-section').style.display = 'block';
    document.getElementById('world-time-bar').style.display = 'flex';
    document.querySelectorAll('.module-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
}

// 區塊切換函式
function showSection(section) {
    // 隱藏所有區塊
    document.getElementById('home-section').style.display = 'none';
    document.getElementById('world-time-bar').style.display = 'none';
    document.querySelectorAll('.module-section').forEach(sec => sec.classList.remove('active'));
    
    // 顯示選擇的區塊
    const sectionMap = {
        'restock': 'replenishment-section',
        'ops': 'ops-section', 
        'factory-stock': 'factory-stock-section',
        'forecast': 'forecast-section',
        'fc-summary': 'fc-summary-section',
        'skuDetails': 'sku-section',
        'supplychain': 'supplychain-section',
        'shippingplan': 'shippingplan-section',
        'shippinghistory': 'shippinghistory-section'
    };
    
    const targetSectionId = sectionMap[section];
    if (targetSectionId) {
        const targetSection = document.getElementById(targetSectionId);
        if (targetSection) {
            targetSection.classList.add('active');
        } else {
            console.error('Section not found:', targetSectionId);
        }
    }
    
    // 更新選單狀態
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    if (typeof event !== 'undefined' && event && event.target) {
        const menuItem = event.target.closest('.menu-item');
        if (menuItem) {
            menuItem.classList.add('active');
        }
    }
    
    if (section === 'forecast') {
        setTimeout(() => {
            if (window.initForecastReviewPage) {
                window.initForecastReviewPage();
            }
        }, 100);
    }
    if (section === 'fc-summary') {
        setTimeout(() => {
            if (window.initFcSummaryPage) {
                window.initFcSummaryPage();
            }
        }, 100);
    }
    if (section === 'factory-stock') {
        setTimeout(() => {
            renderFactoryStockTable();
            initFactoryStockHeaderSync();
            initFactoryDropdown();
        }, 100);
    }
    if (section === 'skuDetails') {
        renderSkuDetailsTable();
        setTimeout(() => {
            if (window.initSkuScroll) {
                window.initSkuScroll();
            }
            if (window.updateSkuScrollWidth) {
                window.updateSkuScrollWidth();
            }
            if (window.updateSkuScrollHeight) {
                window.updateSkuScrollHeight();
            }
        }, 100);
    }
    if (section === 'ops') {
        renderReplenishment();
    }
    if (section === 'supplychain') {
        setTimeout(() => {
            if (window.CanvasController) {
                window.CanvasController.init();
            }
        }, 100);
    }
    if (section === 'shippinghistory') {
        setTimeout(() => {
            if (window.initShippingHistoryPage) {
                window.initShippingHistoryPage();
            }
        }, 200);
    }
}

// 清空運營管理表格
function clearOpsTable() {
    document.getElementById('opsTableBody').innerHTML = '';
}

// 渲染運營管理視圖
function renderOpsView() {
    const selectedSite = document.getElementById('siteSelect').value;
    const targetDays = parseFloat(document.getElementById('opsTargetDays').value) || 0;
    const tableBody = document.getElementById('opsTableBody');
    
    if (!selectedSite) {
        tableBody.innerHTML = '';
        return;
    }
    
    const siteData = window.DataRepo.getSiteSkus(selectedSite);
    tableBody.innerHTML = siteData.map(item => {
        const daysOfCover = Math.floor(item.stock / (item.weeklyAvgSales / 7));
        
        // 計算補貨數量
        const dailySales = item.weeklyAvgSales / 7;
        const targetSales = Math.ceil(dailySales * targetDays);
        const restockQty = Math.max(0, targetSales - item.stock);
        
        return `
            <tr>
                <td>${item.sku}</td>
                <td>${item.stock}</td>
                <td>${item.weeklyAvgSales}</td>
                <td>${daysOfCover}</td>
                <td>${restockQty}</td>
            </tr>
        `;
    }).join('');
}

// Forecast 查找和顯示函式
function showForecast() {
    const site = document.getElementById('forecastSiteSelect').value;
    const productType = document.getElementById('productTypeSelect').value;
    const selectedPeriod = document.getElementById('forecastPeriodSelect').value;
    const resultDiv = document.getElementById('forecastResult');
    
    if (!site || !productType) {
        resultDiv.innerHTML = '';
        return;
    }
    
    const forecastData = window.DataRepo.getForecastDataByMonth(site, productType, selectedPeriod);
    
    if (!forecastData) {
        resultDiv.innerHTML = '<p>找不到資料</p>';
        return;
    }
    
    resultDiv.innerHTML = `
        <h3>結果</h3>
        <p><strong>actualSales:</strong> ${forecastData.actualSales}</p>
        <p><strong>forecastSales:</strong> ${forecastData.forecastSales}</p>
    `;
}

// 渲染 Forecast 圖表
let forecastChartInstance = null;
function renderForecastChart() {
    const data = window.DataRepo.getForecastMonthly();
    const ctx = document.getElementById('forecastChart').getContext('2d');
    
    if (forecastChartInstance) {
        forecastChartInstance.destroy();
    }
    
    forecastChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(item => item.month),
            datasets: [
                {
                    label: 'Actual Sales',
                    data: data.map(item => item.actualSales),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                },
                {
                    label: 'Forecast Sales',
                    data: data.map(item => item.forecastSales),
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Actual vs Forecast Sales (12 Months)'
                }
            },
            scales: {
                y: {
                    beginAtZero: false
                }
            }
        }
    });
}

// 渲染紀錄列表 - 使用本地資料
function renderRecords() {
    const recordsList = document.getElementById('recordsList');
    const records = window.DataRepo.getRecords();
    
    recordsList.innerHTML = records.map(record => 
        `<li>SKU: ${record.sku}, 目標天數: ${record.targetDays}, 建議補貨量: ${record.recommendQty}, 時間: ${record.created_at}</li>`
    ).join('');
}

// 計算補貨量函式 - 使用本地資料
function calculateRestock() {
    const targetDays = parseFloat(document.getElementById('targetDays').value);
    const sku = document.getElementById('sku').value;
    const item = window.DataRepo.getItemBySku(sku);
    
    if (!item) {
        document.getElementById('result').innerHTML = '<p style="color: red;">找不到該SKU的商品</p>';
        return;
    }
    
    const recommendQty = Math.max(0, Math.ceil(item.avgDailySales * targetDays - item.stock));
    
    document.getElementById('result').innerHTML = `
        <p>stock: ${item.stock}</p>
        <p>avgDailySales: ${item.avgDailySales}</p>
        <p>targetDays: ${targetDays}</p>
        <p>recommendQty: ${recommendQty}</p>
    `;
    
    // 建立紀錄並儲存到本地
    const record = {
        sku: sku,
        targetDays: targetDays,
        recommendQty: recommendQty,
        created_at: new Date().toISOString()
    };
    
    window.DataRepo.saveRecord(record);
    renderRecords();
}

// SKU Details 渲染函數 - SKU Test-2 架構
function renderSkuDetailsTable() {
    renderSkuLifecycleTable('upcoming', upcomingSkuData);
    renderSkuLifecycleTable('running', runningSkuData);
    renderSkuLifecycleTable('phasing', phasingOutSkuData);
    
    // 初始化 header 同步
    setTimeout(() => {
        syncSkuHeaderScroll();
    }, 100);
}

function renderSkuLifecycleTable(section, data) {
    const fixedBody = document.getElementById(`${section}FixedBody`);
    const scrollBody = document.getElementById(`${section}ScrollBody`);
    
    if (!fixedBody || !scrollBody) return;
    
    // 渲染左側固定欄 (SKU)
    fixedBody.innerHTML = data.map(item => `
        <div class="fixed-row">${item.sku}</div>
    `).join('');
    
    // 渲染右側滾動欄 (其他欄位)
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

// SKU Header 水平滾動同步
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

// 暴露函式到全域供 HTML 使用
window.showHome = showHome;
window.showSection = showSection;
window.addTodo = addTodo;
window.handleTodoEnter = handleTodoEnter;
window.clearOpsTable = clearOpsTable;
window.renderOpsView = renderOpsView;
window.showForecast = showForecast;
window.renderForecastChart = renderForecastChart;
window.calculateRestock = calculateRestock;
window.renderRecords = renderRecords;
window.DataRepo = DataRepo;

// 初始化時載入紀錄和世界時間
window.addEventListener('DOMContentLoaded', () => {
    renderRecords();
    initWorldTimes();
    renderHomepage();
    initSkuUnifiedScroll();
});

// SKU Details 統一滾動控制
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
// SKU Details 收合功能
function toggleSection(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    const arrow = section.querySelector('.arrow');
    
    section.classList.toggle('is-collapsed');
    
    if (section.classList.contains('is-collapsed')) {
        arrow.textContent = '▶';
    } else {
        arrow.textContent = '▼';
    }
}

window.toggleSection = toggleSection;


// SKU Toolbar 功能
function handleAddSku() {
    console.log('Add SKU clicked');
    alert('Add SKU 功能 - Stage 1 placeholder');
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

// 點擊外部關閉 Display panel
document.addEventListener('click', function(event) {
    const displayDropdown = document.querySelector('.display-dropdown');
    const panel = document.getElementById('displayPanel');
    
    if (displayDropdown && panel && !displayDropdown.contains(event.target)) {
        panel.classList.remove('show');
    }
});

window.handleAddSku = handleAddSku;
window.handleSkuSearch = handleSkuSearch;
window.toggleDisplayPanel = toggleDisplayPanel;
window.toggleColumn = toggleColumn;
window.toggleAllColumns = toggleAllColumns;


// ========================================
// Inventory Replenishment (Stage 1)
// ========================================

const replenishmentMockData = [
    { sku: "A001", lifecycle: "Mature", productName: "Can Opener Pro", forecast90d: 450, onTheWay: 20, unitsPerCarton: 40 },
    { sku: "B002", lifecycle: "New", productName: "Manual Opener Basic", forecast90d: 320, onTheWay: 15, unitsPerCarton: 50 },
    { sku: "C003", lifecycle: "Mature", productName: "Kitchen Tool Set", forecast90d: 1100, onTheWay: 50, unitsPerCarton: 30 },
    { sku: "D004", lifecycle: "Mature", productName: "Electric Peeler", forecast90d: 380, onTheWay: 10, unitsPerCarton: 40 },
    { sku: "E005", lifecycle: "New", productName: "Smart Opener", forecast90d: 600, onTheWay: 30, unitsPerCarton: 50 },
    { sku: "F006", lifecycle: "Phasing Out", productName: "Classic Knife", forecast90d: 280, onTheWay: 5, unitsPerCarton: 30 },
    { sku: "G007", lifecycle: "Mature", productName: "Food Processor", forecast90d: 750, onTheWay: 40, unitsPerCarton: 40 }
];

const specialEvents = [
    { name: "Spring Deal", startDate: "3/22", endDate: "3/29", month: 3, tag: "Special Event" },
    { name: "Prime Day", startDate: "7/15", endDate: "7/16", month: 7, tag: "Special Event" },
    { name: "Fall Prime", startDate: "10/20", endDate: "10/21", month: 10, tag: "Special Event" },
    { name: "BFCM", startDate: "11/20", endDate: "12/1", month: 11, tag: "Special Event" }
];

const skuEventData = [
    { sku: "A001", events: [{ name: "Spring Deal", qty: 500 }, { name: "Prime Day", qty: 800 }] },
    { sku: "B002", events: [{ name: "BFCM", qty: 1200 }] },
    { sku: "C003", events: [{ name: "Prime Day", qty: 1500 }, { name: "Fall Prime", qty: 900 }] },
    { sku: "D004", events: [{ name: "Spring Deal", qty: 400 }] },
    { sku: "E005", events: [{ name: "BFCM", qty: 2000 }] },
    { sku: "F006", events: [] },
    { sku: "G007", events: [{ name: "Prime Day", qty: 1000 }, { name: "BFCM", qty: 1800 }] }
];

// 運輸方式資料結構 (Stage 1 靜態資料)
const shippingMethodsByMarket = {
    'US-amazon': [
        { name: '3rd Party', leadTime: 7, priority: 1, costLevel: 'Medium' },
        { name: 'Air Freight', leadTime: 12, priority: 4, costLevel: 'High' },
        { name: 'Private Ship', leadTime: 25, priority: 3, costLevel: 'Medium' },
        { name: 'AGL Ship', leadTime: 45, priority: 2, costLevel: 'Low' }
    ],
    'UK-amazon': [
        { name: '3rd Party', leadTime: 7, priority: 1, costLevel: 'Medium' },
        { name: 'Air Freight', leadTime: 10, priority: 4, costLevel: 'High' },
        { name: 'Sea Freight', leadTime: 35, priority: 2, costLevel: 'Low' }
    ],
    'DE-amazon': [
        { name: '3rd Party', leadTime: 7, priority: 1, costLevel: 'Medium' },
        { name: 'Air Freight', leadTime: 10, priority: 4, costLevel: 'High' },
        { name: 'Sea Freight', leadTime: 35, priority: 2, costLevel: 'Low' }
    ]
};

let currentExpandedRow = null;
let replenishmentPlans = {};
let replenishmentNotes = {};
let replenishmentShippingMethods = {};
let cachedExpandData = {};

// Stage 2 預留：多方案運輸計算函數
function calculateShippingSuggestions(skuData, marketplace) {
    // Stage 1: 返回空陣列
    // Stage 2: 實作多方案計算邏輯
    // 計算邏輯：
    // 1. 計算斷貨時間點
    // 2. 優先使用 3rd Party Stock
    // 3. 從 AGL Ship (最慢/最便宜) 開始填補缺口
    // 4. 依序使用 Private Ship, Air Freight
    return [];
}

function getReplenishmentData() {
    const marketplace = document.getElementById('replenMarketplace').value;
    const siteData = window.DataRepo.getSiteSkus(marketplace);
    const targetDays = parseInt(document.getElementById('replenTargetDays').value) || 90;
    const ltsFilter = document.getElementById('replenLTSFilter').value;
    
    return siteData.map(item => {
        const mockData = replenishmentMockData.find(m => m.sku === item.sku) || {
            lifecycle: "Mature",
            productName: item.sku + " Product",
            forecast90d: Math.floor(Math.random() * 500) + 200,
            onTheWay: Math.floor(Math.random() * 30),
            unitsPerCarton: 40
        };
        
        // Add marketplace and company from siteData
        mockData.marketplace = item.site;
        // Assign company based on SKU
        if (item.sku === 'A001' || item.sku === 'C003' || item.sku === 'E005' || item.sku === 'G007') {
            mockData.company = 'Res US';
        } else if (item.sku === 'B002' || item.sku === 'D004' || item.sku === 'F006') {
            mockData.company = 'Res TW';
        } else {
            mockData.company = 'Kitchen Mama';
        }
        
        // Mock expand panel data - 根據 SKU 設定不同規模
        // 使用快取避免每次展開時數據變動
        if (!cachedExpandData[item.sku]) {
            let available, fcTransfer, fcProcessing, winitStock, onusStock, within18days, within30days, within45days, lastWeek;
            let fcNextMonth, fcNext2Month, fcLastMonth, fcLast2Month, achievementLastMonth, achievementLast2Month;
            let salesDay2, salesDay3, salesDay4;
            
            if (item.sku === 'A001' || item.sku === 'B002') {
            // 大規模數量
            available = Math.floor(Math.random() * 2000) + 3000;
            fcTransfer = Math.floor(Math.random() * 500) + 800;
            fcProcessing = Math.floor(Math.random() * 500) + 600;
            winitStock = Math.floor(Math.random() * 300) + 500;
            onusStock = Math.floor(Math.random() * 300) + 400;
            within18days = Math.floor(Math.random() * 800) + 1200;
            within30days = Math.floor(Math.random() * 600) + 800;
            within45days = Math.floor(Math.random() * 600) + 800;
            lastWeek = Math.floor(Math.random() * 500) + 1500;
            fcNextMonth = Math.floor(Math.random() * 5000) + 8000;
            fcNext2Month = Math.floor(Math.random() * 5000) + 7000;
            fcLastMonth = Math.floor(Math.random() * 5000) + 7500;
            fcLast2Month = Math.floor(Math.random() * 4000) + 7000;
            salesDay2 = Math.floor(Math.random() * 100) + 200;
            salesDay3 = Math.floor(Math.random() * 100) + 180;
            salesDay4 = Math.floor(Math.random() * 100) + 170;
        } else if (item.sku === 'C003' || item.sku === 'D004') {
            // 小規模數量
            available = Math.floor(Math.random() * 100) + 50;
            fcTransfer = Math.floor(Math.random() * 30) + 20;
            fcProcessing = Math.floor(Math.random() * 30) + 15;
            winitStock = Math.floor(Math.random() * 20) + 10;
            onusStock = Math.floor(Math.random() * 20) + 8;
            within18days = Math.floor(Math.random() * 50) + 30;
            within30days = Math.floor(Math.random() * 40) + 20;
            within45days = Math.floor(Math.random() * 40) + 20;
            lastWeek = Math.floor(Math.random() * 80) + 120;
            fcNextMonth = Math.floor(Math.random() * 500) + 800;
            fcNext2Month = Math.floor(Math.random() * 500) + 700;
            fcLastMonth = Math.floor(Math.random() * 500) + 750;
            fcLast2Month = Math.floor(Math.random() * 400) + 700;
            salesDay2 = Math.floor(Math.random() * 20) + 15;
            salesDay3 = Math.floor(Math.random() * 20) + 12;
            salesDay4 = Math.floor(Math.random() * 20) + 10;
        } else {
            // 中等規模數量
            available = Math.floor(Math.random() * 500) + 300;
            fcTransfer = Math.floor(Math.random() * 100) + 80;
            fcProcessing = Math.floor(Math.random() * 100) + 60;
            winitStock = Math.floor(Math.random() * 80) + 50;
            onusStock = Math.floor(Math.random() * 60) + 40;
            within18days = Math.floor(Math.random() * 200) + 150;
            within30days = Math.floor(Math.random() * 150) + 100;
            within45days = Math.floor(Math.random() * 150) + 100;
            lastWeek = Math.floor(Math.random() * 200) + 400;
            fcNextMonth = Math.floor(Math.random() * 2000) + 3000;
            fcNext2Month = Math.floor(Math.random() * 2000) + 2500;
            fcLastMonth = Math.floor(Math.random() * 2000) + 2800;
            fcLast2Month = Math.floor(Math.random() * 1500) + 2500;
            salesDay2 = Math.floor(Math.random() * 40) + 50;
            salesDay3 = Math.floor(Math.random() * 40) + 45;
            salesDay4 = Math.floor(Math.random() * 40) + 40;
        }
        
            achievementLastMonth = Math.floor(Math.random() * 20) + 85;
            achievementLast2Month = Math.floor(Math.random() * 20) + 80;
            
            // LTS data - 部分 SKU 設為 0 以測試篩選
            let over90, over180;
            if (item.sku === 'B002' || item.sku === 'D004') {
                over90 = 0;
                over180 = 0;
            } else if (item.sku === 'F006') {
                over90 = Math.floor(Math.random() * 15) + 5;
                over180 = 0;
            } else {
                over90 = Math.floor(Math.random() * 15) + 5;
                over180 = Math.floor(Math.random() * 8) + 2;
            }
            
            // Factory stock - 快取以避免每次計算時變動
            const cnStock = Math.floor(Math.random() * 5000) + 1000;
            const twStock = Math.floor(Math.random() * 3000) + 500;
            
            cachedExpandData[item.sku] = {
                available, fcTransfer, fcProcessing, winitStock, onusStock,
                within18days, within30days, within45days, lastWeek, fcNextMonth, fcNext2Month,
                fcLastMonth, fcLast2Month, achievementLastMonth, achievementLast2Month,
                salesDay2, salesDay3, salesDay4, over90, over180, cnStock, twStock
            };
        }
        
        const expandData = cachedExpandData[item.sku];
        
        // Dynamic sales trend (past 3 days)
        const today = new Date();
        const day2ago = new Date(today);
        day2ago.setDate(today.getDate() - 2);
        const day3ago = new Date(today);
        day3ago.setDate(today.getDate() - 3);
        const day4ago = new Date(today);
        day4ago.setDate(today.getDate() - 4);
        
        // Dynamic forecast months
        const monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
        const currentMonth = today.getMonth();
        const nextMonthIndex = (currentMonth + 1) % 12;
        const next2MonthIndex = (currentMonth + 2) % 12;
        const next3MonthIndex = (currentMonth + 3) % 12;
        const lastMonthIndex = (currentMonth - 1 + 12) % 12;
        const last2MonthIndex = (currentMonth - 2 + 12) % 12;
        
        // Generate FC for next 3 months
        const fcNext3Month = Math.floor(Math.random() * 5000) + 7000;
        
        // 60 days FC = The Following 前兩個月份的 FC 總和
        const forecast60d = expandData.fcNextMonth + expandData.fcNext2Month;
        
        // Get upcoming events for this SKU (檢查接下來三個月內的事件)
        const skuEvents = skuEventData.find(e => e.sku === item.sku)?.events || [];
        const next3Months = [
            (currentMonth + 1) % 12 || 12,
            (currentMonth + 2) % 12 || 12,
            (currentMonth + 3) % 12 || 12
        ];
        
        // 篩選出接下來三個月內的事件
        const filteredEvents = skuEvents.filter(e => {
            const event = specialEvents.find(se => se.name === e.name);
            return event && next3Months.includes(event.month);
        });
        
        const upcomingEventQty = filteredEvents.length > 0 ? filteredEvents[0].qty : null;
        
        const upcomingEventsText = filteredEvents.length > 0
            ? filteredEvents.map(e => {
                const event = specialEvents.find(se => se.name === e.name);
                return `<div class="replen-card__row"><span class="replen-card__label">${e.name} (${event?.startDate}~${event?.endDate})</span><span class="replen-card__value">${e.qty}</span></div>`;
              }).join('')
            : '<div class="replen-card__row"><span class="replen-card__label">No upcoming event</span><span class="replen-card__value">-</span></div>';
        
        // 1. Current Stock = Available + FC Transfer + FC Processing
        const currentInventory = expandData.available + expandData.fcTransfer + expandData.fcProcessing;
        
        // 2. On the Way = 根據期望天數動態計算
        let onTheWay;
        if (targetDays <= 18) {
            onTheWay = expandData.within18days;
        } else if (targetDays <= 30) {
            onTheWay = expandData.within18days + expandData.within30days;
        } else {
            onTheWay = expandData.within18days + expandData.within30days + expandData.within45days;
        }
        
        // 3. 3rd Party Stock = 3rd Party Stock 加總
        const thirdPartyStock = expandData.winitStock + expandData.onusStock;
        
        // 4. Avg. Sales/day = Last Week / 7
        const avgDailySales = expandData.lastWeek / 7;
        
        // Days of Supply = Current Stock / Avg. Sales
        const daysOfSupply = (currentInventory / avgDailySales).toFixed(1);
        
        // 檢查是否需要紅燈警示：Days of Supply < 18 且 (Current Stock + Within 18 days) / Avg. Sales < 18
        const daysWithin18 = ((currentInventory + expandData.within18days) / avgDailySales).toFixed(1);
        const needsAlert = parseFloat(daysOfSupply) < 18 && parseFloat(daysWithin18) < 18;
        
        // Suggested Qty - 依產品生命週期計算 (不包含 3rd Party Stock)
        let need18, need30, need45Plus;
        
        if (mockData.lifecycle === 'New') {
            // New 產品：60 days FC + 本月剩餘天數銷售 - (Current Stock + On the Way)
            const totalInventory = currentInventory + onTheWay;
            
            // 計算本月剩餘天數
            const today = new Date();
            const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            const remainingDays = lastDayOfMonth.getDate() - today.getDate();
            const remainingSales = remainingDays > 0 ? remainingDays * avgDailySales : 0;
            
            // New 產品的分時段計算（基於 FC）
            const totalDemand = forecast60d + remainingSales;
            const demand18 = totalDemand * (Math.min(18, targetDays) / targetDays);
            const demand30 = totalDemand * (Math.min(30, targetDays) / targetDays);
            
            const available18 = currentInventory + expandData.within18days;
            const available30 = currentInventory + expandData.within18days + expandData.within30days;
            const availableTotal = currentInventory + expandData.within18days + expandData.within30days + expandData.within45days;
            
            need18 = Math.max(0, Math.ceil(demand18 - available18));
            need30 = Math.max(0, Math.ceil(demand30 - available30 - need18));
            need45Plus = Math.max(0, Math.ceil(totalDemand - availableTotal - need18 - need30));
        } else {
            // Mature / Phasing Out：分時段計算（基於 Avg Sales）
            const demand18 = avgDailySales * Math.min(18, targetDays);
            const demand30 = avgDailySales * Math.min(30, targetDays);
            const demandTotal = avgDailySales * targetDays;
            
            const available18 = currentInventory + expandData.within18days;
            const available30 = currentInventory + expandData.within18days + expandData.within30days;
            const availableTotal = currentInventory + expandData.within18days + expandData.within30days + expandData.within45days;
            
            need18 = Math.max(0, Math.ceil(demand18 - available18));
            need30 = Math.max(0, Math.ceil(demand30 - available30 - need18));
            need45Plus = Math.max(0, Math.ceil(demandTotal - availableTotal - need18 - need30));
        }
        
        // Suggested Qty = 三個時段的加總
        let suggestedQty = need18 + need30 + need45Plus;
        
        // 進位到整箱數量
        const unitsPerCarton = mockData.unitsPerCarton || 40;
        if (suggestedQty > 0) {
            suggestedQty = Math.ceil(suggestedQty / unitsPerCarton) * unitsPerCarton;
        }
        
        return {
            sku: item.sku,
            lifecycle: mockData.lifecycle,
            productName: mockData.productName,
            marketplace: mockData.marketplace,
            company: mockData.company,
            currentInventory: currentInventory,
            avgDailySales: avgDailySales.toFixed(2),
            forecast60d: forecast60d,
            daysOfSupply: daysOfSupply,
            needsAlert: needsAlert,
            onTheWay: onTheWay,
            thirdPartyStock: thirdPartyStock,
            suggestedQty: suggestedQty,
            need18: need18,
            need30: need30,
            need45Plus: need45Plus,
            plannedQty: replenishmentPlans[item.sku] || 0,
            note: replenishmentNotes[item.sku] || '',
            status: suggestedQty > 0 ? "Need Restock" : "Sufficient",
            upcomingEventQty: upcomingEventQty,
            cnStock: expandData.cnStock,
            twStock: expandData.twStock,
            // Expand panel data
            available: expandData.available,
            fcTransfer: expandData.fcTransfer,
            fcProcessing: expandData.fcProcessing,
            winitStock: expandData.winitStock,
            onusStock: expandData.onusStock,
            within18days: expandData.within18days,
            within30days: expandData.within30days,
            within45days: expandData.within45days,
            lastWeek: expandData.lastWeek,
            // Sales trend dates and values
            day2ago: `${day2ago.getMonth() + 1}/${day2ago.getDate()}`,
            day3ago: `${day3ago.getMonth() + 1}/${day3ago.getDate()}`,
            day4ago: `${day4ago.getMonth() + 1}/${day4ago.getDate()}`,
            salesDay2: expandData.salesDay2,
            salesDay3: expandData.salesDay3,
            salesDay4: expandData.salesDay4,
            // Forecast months
            nextMonth: monthNames[nextMonthIndex],
            next2Month: monthNames[next2MonthIndex],
            next3Month: monthNames[next3MonthIndex],
            lastMonth: monthNames[lastMonthIndex],
            last2Month: monthNames[last2MonthIndex],
            fcNextMonth: expandData.fcNextMonth,
            fcNext2Month: expandData.fcNext2Month,
            fcNext3Month: fcNext3Month,
            fcLastMonth: expandData.fcLastMonth,
            fcLast2Month: expandData.fcLast2Month,
            achievementLastMonth: expandData.achievementLastMonth,
            achievementLast2Month: expandData.achievementLast2Month,
            upcomingEventsText: upcomingEventsText
        };
    }).filter(item => {
        if (!ltsFilter) return true;
        const expandData = cachedExpandData[item.sku];
        if (!expandData) return true;
        
        if (ltsFilter === 'over90') return expandData.over90 > 0;
        if (ltsFilter === 'over180') return expandData.over180 > 0;
        return true;
    });
}

function renderReplenishment() {
    const data = getReplenishmentData();
    const fixedBody = document.getElementById('replenFixedBody');
    const scrollBody = document.getElementById('replenScrollBody');
    
    if (!fixedBody || !scrollBody) return;
    
    currentExpandedRow = null;
    
    // Render fixed column (SKU)
    fixedBody.innerHTML = data.map(item => `
        <div class="fixed-row" data-sku="${item.sku}" onclick="toggleReplenRow('${item.sku}')">
            ${item.sku}
        </div>
    `).join('');
    
    // Render scrollable columns
    scrollBody.innerHTML = data.map(item => `
        <div class="scroll-row" data-sku="${item.sku}" onclick="toggleReplenRow('${item.sku}')">
            <div class="scroll-cell">${item.lifecycle}</div>
            <div class="scroll-cell">${item.company}</div>
            <div class="scroll-cell">${item.marketplace}</div>
            <div class="scroll-cell">${item.currentInventory}</div>
            <div class="scroll-cell">${item.onTheWay}</div>
            <div class="scroll-cell">${item.thirdPartyStock}</div>
            <div class="scroll-cell">${item.avgDailySales}</div>
            <div class="scroll-cell">${item.forecast60d}</div>
            <div class="scroll-cell">${item.upcomingEventQty !== null ? item.upcomingEventQty : '-'}</div>
            <div class="scroll-cell${item.needsAlert ? ' alert-red' : ''}">${item.daysOfSupply}</div>
            <div class="scroll-cell">${item.suggestedQty}</div>
            <div class="scroll-cell" style="display: flex; gap: 4px; align-items: center; justify-content: center; width: 120px; min-width: 120px; max-width: 120px; flex-shrink: 0;">
                <span style="color: #64748B; font-size: 12px; cursor: pointer;" onclick="openShippingAllocation(event, '${item.sku}')">See Details</span>
                <button class="planned-qty-config-btn" 
                        onclick="openShippingAllocation(event, '${item.sku}')"
                        title="Configure shipping allocation"
                        style="padding: 4px 8px; font-size: 12px; margin: 0; min-width: auto;">⚙️</button>
            </div>
            <div class="scroll-cell">${item.cnStock || 0}</div>
            <div class="scroll-cell">${item.twStock || 0}</div>
            <div class="scroll-cell ai-action-cell" onclick="openAISuggestion(event, '${item.sku}')" style="width: 175px; min-width: 175px; max-width: 175px; flex-shrink: 0;">
                <span class="ai-action-cell__text">View AI recommendation</span>
            </div>
        </div>
    `).join('');
    
    // Initialize header scroll sync
    initReplenHeaderSync();
}

function initReplenHeaderSync() {
    const scrollCol = document.querySelector('#ops-section .scroll-col');
    const scrollHeader = document.querySelector('#ops-section .scroll-header');
    
    if (!scrollCol || !scrollHeader) return;
    
    // Remove existing listener to avoid duplicates
    scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
    
    // Create and store handler
    scrollCol._syncHandler = () => {
        scrollHeader.style.transform = `translateX(-${scrollCol.scrollLeft}px)`;
    };
    
    scrollCol.addEventListener('scroll', scrollCol._syncHandler);
}

function toggleReplenRow(sku) {
    const fixedRows = document.querySelectorAll('#ops-section .fixed-row');
    const scrollRows = document.querySelectorAll('#ops-section .scroll-row');
    const fixedBody = document.getElementById('replenFixedBody');
    const scrollBody = document.getElementById('replenScrollBody');
    
    const existingFixedPanels = document.querySelectorAll('#ops-section .fixed-body .replen-expand-panel');
    const existingScrollPanels = document.querySelectorAll('#ops-section .scroll-body .replen-expand-panel');
    existingFixedPanels.forEach(panel => panel.remove());
    existingScrollPanels.forEach(panel => panel.remove());
    
    fixedRows.forEach(row => row.classList.remove('expanded'));
    scrollRows.forEach(row => row.classList.remove('expanded'));
    
    if (currentExpandedRow === sku) {
        currentExpandedRow = null;
        return;
    }
    
    currentExpandedRow = sku;
    const fixedRow = Array.from(fixedRows).find(row => row.dataset.sku === sku);
    const scrollRow = Array.from(scrollRows).find(row => row.dataset.sku === sku);
    
    if (fixedRow) fixedRow.classList.add('expanded');
    if (scrollRow) scrollRow.classList.add('expanded');
    
    const data = getReplenishmentData();
    const skuData = data.find(item => item.sku === sku);
    
    const expandFixedHTML = `
        <div class="replen-expand-panel replen-expand-panel--fixed">
            <div class="replen-expand-fixed">
                <strong>${sku}</strong>
                <div style="margin-top: 8px; font-size: 14px; color: #333;">
                    ${skuData?.productName || 'Product Name'}
                </div>
                <div style="margin-top: 8px; font-size: 12px; color: #666;">
                    Click row to close
                </div>
            </div>
        </div>
    `;
    
    // TODO (Stage 2 / 3):
    // Replace rule-based suggestion with AI / seasonality model
    // - incorporate historical promotions, deals, yearly cycle
    // - weekly replenishment recommendation
    
    const expandScrollHTML = `
        <div class="replen-expand-panel replen-expand-panel--scroll">
            <div class="replen-expand-scroll">
                <div class="ir-panel ir-panel--inventory-group">
                    <section class="replen-expand-section--inventory">
                        <div class="replen-card-grid">
                            <article class="replen-card replen-card--stock">
                                <h4 class="replen-card__title">Stock</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Available</span><span class="replen-card__value">${skuData?.available || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">FC Transfer</span><span class="replen-card__value">${skuData?.fcTransfer || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">FC Processing</span><span class="replen-card__value">${skuData?.fcProcessing || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">C Orders</span><span class="replen-card__value">10</span></div>
                            </article>
                            <article class="replen-card replen-card--lts">
                                <h4 class="replen-card__title">Long Term Storage</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Over 90+</span><span class="replen-card__value">${cachedExpandData[sku]?.over90 || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Over 180+</span><span class="replen-card__value">${cachedExpandData[sku]?.over180 || 0}</span></div>
                            </article>
                            <article class="replen-card replen-card--shipping">
                                <h4 class="replen-card__title">Shipping Shipment</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Within 18 days</span><span class="replen-card__value">${skuData?.within18days || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Within 30 days</span><span class="replen-card__value">${skuData?.within30days || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Within 45 days</span><span class="replen-card__value">${skuData?.within45days || 0}</span></div>
                            </article>
                            <article class="replen-card replen-card--third-party">
                                <h4 class="replen-card__title">3rd Party Stock</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Winit</span><span class="replen-card__value">${skuData?.winitStock || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">ONUS</span><span class="replen-card__value">${skuData?.onusStock || 0}</span></div>
                            </article>
                        </div>
                    </section>
                </div>
                <div class="ir-panel-column">
                    <article class="ir-panel replen-card replen-card--sales-trend">
                        <h4 class="replen-card__title">Sales Trend (Past Week)</h4>
                        <canvas id="sales-trend-chart-${sku}" style="max-height: 100px;"></canvas>
                    </article>
                    <article class="ir-panel replen-card replen-card--achievement">
                        <h4 class="replen-card__title">Achievement Rate (Past 3 Months)</h4>
                        <canvas id="achievement-chart-${sku}" style="max-height: 100px;"></canvas>
                    </article>
                </div>
                <div class="ir-panel-column">
                    <article class="ir-panel replen-card replen-card--forecast">
                        <h4 class="replen-card__title">Forecast Breakdown</h4>
                        <div class="replen-card__row" style="font-weight: 600; margin-top: 4px;"><span class="replen-card__label">The Following</span><span class="replen-card__value"></span></div>
                        <div class="replen-card__row"><span class="replen-card__label">${skuData?.nextMonth || '-'}</span><span class="replen-card__value">${skuData?.fcNextMonth || 0}</span></div>
                        <div class="replen-card__row"><span class="replen-card__label">${skuData?.next2Month || '-'}</span><span class="replen-card__value">${skuData?.fcNext2Month || 0}</span></div>
                        <div class="replen-card__row"><span class="replen-card__label">${skuData?.next3Month || '-'}</span><span class="replen-card__value">${skuData?.fcNext3Month || 0}</span></div>
                        <div class="replen-card__row" style="font-weight: 600;"><span class="replen-card__label">Total</span><span class="replen-card__value">${(skuData?.fcNextMonth || 0) + (skuData?.fcNext2Month || 0) + (skuData?.fcNext3Month || 0)}</span></div>
                    </article>
                    <article class="ir-panel replen-card replen-card--upcoming">
                        <h4 class="replen-card__title">Upcoming Event</h4>
                        ${skuData?.upcomingEventsText || '<div class="replen-card__row"><span class="replen-card__label">No upcoming event</span><span class="replen-card__value">-</span></div>'}
                    </article>
                </div>
                <article class="ir-panel replen-card--suggestion-allocation">
                    <div class="replen-card replen-card--ai-suggestion">
                        <h4 class="replen-card__title">AI Suggestion (Stage 1 Basic)</h4>
                        <div class="replen-card__row"><span class="replen-card__label">18天內 Need</span><span class="replen-card__value">${skuData?.need18 || 0}</span></div>
                        <div class="replen-card__row"><span class="replen-card__label">30天內 Need</span><span class="replen-card__value">${skuData?.need30 || 0}</span></div>
                        <div class="replen-card__row"><span class="replen-card__label">30天以上 Need</span><span class="replen-card__value">${skuData?.need45Plus || 0}</span></div>
                        <div class="replen-card__row" style="border-top: 1px solid var(--border-light); margin-top: 4px; padding-top: 4px; font-weight: 600;"><span class="replen-card__label">Total</span><span class="replen-card__value">${skuData?.suggestedQty || 0}</span></div>
                    </div>
                    <div class="replen-card replen-card--shipping-allocation" id="shipping-allocation-${sku}" style="margin-top: 12px;">
                        <h4 class="replen-card__title">Shipping Allocation</h4>
                        <div class="replen-card__row">
                            <select class="replen-card__select" onchange="addShippingMethod(event, '${sku}')" onclick="event.stopPropagation()">
                                <option value="">+ Add Method</option>
                                <option value="Air Freight">Air Freight</option>
                                <option value="Sea Freight">Sea Freight</option>
                                <option value="Express">Express</option>
                                <option value="Rail Freight">Rail Freight</option>
                            </select>
                        </div>
                        <div id="shipping-methods-${sku}" class="shipping-methods-list"></div>
                        <div class="replen-card__summary" style="border-top: 1px solid var(--border-light); margin-top: 4px; padding-top: 4px; display: flex; justify-content: space-between; font-weight: 600;">
                            <span class="replen-card__summary-label">Total</span>
                            <span class="replen-card__summary-value" id="allocation-total-${sku}">0</span>
                        </div>
                        <div class="replen-card__hint" id="allocation-hint-${sku}" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Factory Stock Available</div>
                    </div>
                </article>
                <article class="ir-panel replen-card replen-card--shipping-plan">
                    <h4 class="replen-card__title">Shipping Plan Suggestions <span style="font-size: 10px; color: #94A3B8;">(Stage 2)</span></h4>
                    <div class="replen-card__placeholder" style="padding: 16px; text-align: center; color: #94A3B8; font-size: 12px; border: 1px dashed #E2E8F0; border-radius: 4px;">
                        Multi-method shipping optimization<br/>will be available in Stage 2
                    </div>
                </article>
            </div>
        </div>
    `;
    
    const expandPanelFixed = document.createElement('div');
    expandPanelFixed.innerHTML = expandFixedHTML;
    const fixedElement = expandPanelFixed.firstElementChild;
    
    const expandPanelScroll = document.createElement('div');
    expandPanelScroll.innerHTML = expandScrollHTML;
    const scrollElement = expandPanelScroll.firstElementChild;
    
    const rowIndex = Array.from(fixedRows).indexOf(fixedRow);
    if (rowIndex < fixedRows.length - 1) {
        fixedRows[rowIndex + 1].before(fixedElement);
        scrollRows[rowIndex + 1].before(scrollElement);
    } else {
        fixedBody.appendChild(fixedElement);
        scrollBody.appendChild(scrollElement);
    }
    
    // Sync heights after DOM insertion
    setTimeout(() => {
        syncExpandPanelHeight(sku);
        
        // Auto-populate Shipping Allocation based on AI Suggestion
        initializeShippingAllocation(sku, skuData);
        
        // Initialize charts
        initSalesTrendChart(sku, skuData);
        initAchievementChart(sku, skuData);
        
        // Re-sync after initialization
        setTimeout(() => syncExpandPanelHeight(sku), 50);
    }, 0);
}

function updatePlannedQty(sku, qty) {
    replenishmentPlans[sku] = parseInt(qty) || 0;
}

function updateShippingMethod(sku, method) {
    replenishmentShippingMethods[sku] = method;
}

function updateGlobalShippingMethod(method) {
    // 全域運輸方式選擇，可用於批次設定或顯示
    console.log('Global shipping method selected:', method);
}

function updateReplenNote(sku, note) {
    replenishmentNotes[sku] = note;
}

function createPlan(sku) {
    console.log('Create plan for SKU:', sku);
    alert(`Create plan for ${sku} - Stage 1 placeholder`);
}

function submitReplenishmentPlans() {
    const data = getReplenishmentData();
    const country = document.getElementById('replenCountry').value;
    const marketplace = document.getElementById('replenMarketplace').value;
    const targetDays = document.getElementById('replenTargetDays').value;
    const shippingPlans = {};
    
    console.log('=== Submit Plan Debug ===');
    console.log('Total SKUs:', data.length);
    
    // 檢查所有 SKU 的 Shipping Allocation
    data.forEach(item => {
        const methodsList = document.getElementById(`shipping-methods-${item.sku}`);
        
        if (methodsList) {
            // SKU 已展開，收集實際填寫的數值
            const inputs = methodsList.querySelectorAll('input[type="number"]');
            inputs.forEach(input => {
                const method = input.dataset.method;
                const qty = parseInt(input.value) || 0;
                
                if (qty > 0 && method) {
                    if (!shippingPlans[method]) {
                        shippingPlans[method] = [];
                    }
                    shippingPlans[method].push({
                        sku: item.sku,
                        qty: qty,
                        skuData: item
                    });
                }
            });
        } else {
            // SKU 未展開，使用 AI Suggestion 預設分配（僅 US-Amazon）
            if (country === 'US' && marketplace === 'amazon') {
                const mockData = replenishmentMockData.find(m => m.sku === item.sku);
                const unitsPerCarton = mockData?.unitsPerCarton || 40;
                
                if (item.need18 > 0) {
                    const roundedQty = Math.ceil(item.need18 / unitsPerCarton) * unitsPerCarton;
                    if (!shippingPlans['Air Freight']) shippingPlans['Air Freight'] = [];
                    shippingPlans['Air Freight'].push({ 
                        sku: item.sku, 
                        qty: roundedQty,
                        skuData: item
                    });
                }
                if (item.need30 > 0) {
                    const roundedQty = Math.ceil(item.need30 / unitsPerCarton) * unitsPerCarton;
                    if (!shippingPlans['Private Ship']) shippingPlans['Private Ship'] = [];
                    shippingPlans['Private Ship'].push({ 
                        sku: item.sku, 
                        qty: roundedQty,
                        skuData: item
                    });
                }
                if (item.need45Plus > 0) {
                    const roundedQty = Math.ceil(item.need45Plus / unitsPerCarton) * unitsPerCarton;
                    if (!shippingPlans['AGL Ship']) shippingPlans['AGL Ship'] = [];
                    shippingPlans['AGL Ship'].push({ 
                        sku: item.sku, 
                        qty: roundedQty,
                        skuData: item
                    });
                }
            }
        }
    });
    
    console.log('Shipping Plans:', shippingPlans);
    console.log('Total Methods:', Object.keys(shippingPlans).length);
    
    // 檢查是否有任何數值
    let totalSkus = 0;
    Object.keys(shippingPlans).forEach(method => {
        totalSkus += shippingPlans[method].length;
    });
    
    if (totalSkus === 0) {
        alert('No SKUs Submitted');
        return;
    }
    
    // 讀取現有資料
    let allPlans = [];
    const existingData = sessionStorage.getItem('allShippingPlans');
    if (existingData) {
        allPlans = JSON.parse(existingData);
    }
    
    // 新增本次提交的資料（每個 method 獨立 status 和 note）
    const newPlan = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        country: country,
        marketplace: marketplace,
        targetDays: targetDays,
        plans: shippingPlans,
        status: {},
        notes: {}
    };
    
    // 為每個 method 初始化 status 和 notes（notes 改為陣列）
    Object.keys(shippingPlans).forEach(method => {
        newPlan.status[method] = 'draft';
        newPlan.notes[method] = [];
    });
    allPlans.push(newPlan);
    
    // 儲存累積的資料
    sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
    console.log('Saved to sessionStorage:', allPlans);
    
    // 顯示推送結果
    alert(`推送成功！\n總 SKU 數: ${totalSkus}\n總運輸方式: ${Object.keys(shippingPlans).length}`);
    
    // 導向 Shipping Plan 頁面
    showSection('shippingplan');
    
    // 延遲渲染確保 DOM 已顯示
    setTimeout(() => {
        renderShippingPlan();
    }, 100);
}

window.renderReplenishment = renderReplenishment;
window.toggleReplenRow = toggleReplenRow;
window.updatePlannedQty = updatePlannedQty;
window.updateShippingMethod = updateShippingMethod;
window.updateGlobalShippingMethod = updateGlobalShippingMethod;
window.updateReplenNote = updateReplenNote;
window.createPlan = createPlan;
window.submitReplenishmentPlans = submitReplenishmentPlans;

function openShippingAllocation(event, sku) {
    event.stopPropagation();
    const fixedRows = document.querySelectorAll('#ops-section .fixed-row');
    const targetRow = Array.from(fixedRows).find(row => row.dataset.sku === sku);
    
    if (targetRow && targetRow.classList.contains('expanded')) {
        toggleReplenRow(sku);
    } else {
        if (!targetRow || !targetRow.classList.contains('expanded')) {
            toggleReplenRow(sku);
        }
        setTimeout(() => {
            const allocationCard = document.getElementById(`shipping-allocation-${sku}`);
            if (allocationCard) {
                allocationCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    }
}

function openAISuggestion(event, sku) {
    event.stopPropagation();
    const fixedRows = document.querySelectorAll('#ops-section .fixed-row');
    const targetRow = Array.from(fixedRows).find(row => row.dataset.sku === sku);
    if (!targetRow || !targetRow.classList.contains('expanded')) {
        toggleReplenRow(sku);
    }
}

function updateShippingAllocationTotal(sku) {
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    if (!methodsList) return;
    
    const inputs = methodsList.querySelectorAll('input[type="number"]');
    let total = 0;
    inputs.forEach(input => {
        total += parseInt(input.value) || 0;
    });
    
    const totalSpan = document.getElementById(`allocation-total-${sku}`);
    const hintDiv = document.getElementById(`allocation-hint-${sku}`);
    
    if (totalSpan) totalSpan.textContent = total;
    
    if (hintDiv) {
        // 獲取工廠庫存 (CN + TW)
        const data = getReplenishmentData();
        const skuData = data.find(item => item.sku === sku);
        const factoryStock = (skuData?.cnStock || 0) + (skuData?.twStock || 0);
        
        if (total > factoryStock) {
            hintDiv.style.color = '#991B1B';
            hintDiv.textContent = `Insufficient Stock (Factory: ${factoryStock}, Need: ${total})`;
        } else {
            hintDiv.style.color = 'var(--text-muted)';
            hintDiv.textContent = `Factory Stock Available: ${factoryStock} units`;
        }
    }
}

function addShippingMethod(event, sku) {
    const select = event.target;
    const method = select.value;
    if (!method) return;
    
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    if (!methodsList) return;
    
    const methodRow = document.createElement('div');
    methodRow.className = 'replen-card__row';
    methodRow.innerHTML = `
        <span class="replen-card__label">${method}</span>
        <input class="replen-card__input" type="number" value="0" 
               oninput="updateShippingAllocationTotal('${sku}')" 
               onclick="event.stopPropagation()" 
               data-method="${method}">
        <button class="replen-card__remove-btn" 
                onclick="removeShippingMethod(event, '${sku}')" 
                title="Remove">×</button>
    `;
    
    methodsList.appendChild(methodRow);
    select.value = '';
    updateShippingAllocationTotal(sku);
    syncExpandPanelHeight(sku);
}

function removeShippingMethod(event, sku) {
    event.stopPropagation();
    const row = event.target.closest('.replen-card__row');
    if (row) {
        row.remove();
        updateShippingAllocationTotal(sku);
        syncExpandPanelHeight(sku);
    }
}

function syncExpandPanelHeight(sku) {
    setTimeout(() => {
        const fixedPanel = document.querySelector(`#ops-section .fixed-body .replen-expand-panel`);
        const scrollPanel = document.querySelector(`#ops-section .scroll-body .replen-expand-panel`);
        
        if (fixedPanel && scrollPanel) {
            // 移除之前設定的固定高度
            fixedPanel.style.height = 'auto';
            scrollPanel.style.height = 'auto';
            
            // 強制重新計算
            setTimeout(() => {
                const fixedHeight = fixedPanel.scrollHeight;
                const scrollHeight = scrollPanel.scrollHeight;
                const maxHeight = Math.max(fixedHeight, scrollHeight);
                
                // 設定相同高度
                fixedPanel.style.height = maxHeight + 'px';
                scrollPanel.style.height = maxHeight + 'px';
            }, 0);
        }
    }, 0);
}

window.addShippingMethod = addShippingMethod;
window.removeShippingMethod = removeShippingMethod;

function initializeShippingAllocation(sku, skuData) {
    const marketplace = document.getElementById('replenMarketplace').value;
    const country = document.getElementById('replenCountry').value;
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    
    if (!methodsList || !skuData) return;
    
    // US-Amazon 預設規則
    if (country === 'US' && marketplace === 'amazon') {
        if (skuData.need18 > 0) {
            addPredefinedMethod(sku, 'Air Freight', skuData.need18);
        }
        if (skuData.need30 > 0) {
            addPredefinedMethod(sku, 'Private Ship', skuData.need30);
        }
        if (skuData.need45Plus > 0) {
            addPredefinedMethod(sku, 'AGL Ship', skuData.need45Plus);
        }
    }
    
    updateShippingAllocationTotal(sku);
}

function addPredefinedMethod(sku, method, quantity) {
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    if (!methodsList) return;
    
    // 進位到整箱數量
    const mockData = replenishmentMockData.find(m => m.sku === sku);
    const unitsPerCarton = mockData?.unitsPerCarton || 40;
    const roundedQty = quantity > 0 ? Math.ceil(quantity / unitsPerCarton) * unitsPerCarton : 0;
    
    const methodRow = document.createElement('div');
    methodRow.className = 'replen-card__row';
    methodRow.innerHTML = `
        <span class="replen-card__label">${method}</span>
        <input class="replen-card__input" type="number" value="${roundedQty}" 
               oninput="updateShippingAllocationTotal('${sku}')" 
               onclick="event.stopPropagation()" 
               data-method="${method}">
        <button class="replen-card__remove-btn" 
                onclick="removeShippingMethod(event, '${sku}')" 
                title="Remove">×</button>
    `;
    
    methodsList.appendChild(methodRow);
}

window.initializeShippingAllocation = initializeShippingAllocation;

window.openShippingAllocation = openShippingAllocation;
window.openAISuggestion = openAISuggestion;
window.updateShippingAllocationTotal = updateShippingAllocationTotal;

// ========================================
// Shipping Plan Page
// ========================================

function renderShippingPlan() {
    console.log('=== Render Shipping Plan ===');
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    console.log('sessionStorage data:', allPlansStr);
    
    if (!allPlansStr) {
        console.log('No data in sessionStorage');
        document.getElementById('shippingPlanCards').innerHTML = '<p>No shipping plans available.</p>';
        document.getElementById('pendingApprovalCards').innerHTML = '<p>No pending approvals.</p>';
        document.getElementById('approvedCards').innerHTML = '<p>No approved plans.</p>';
        return;
    }
    
    let allPlans = JSON.parse(allPlansStr);
    
    // 確保所有 plan 都有 status 和 notes 物件
    allPlans = allPlans.map(plan => {
        if (!plan.status || typeof plan.status === 'string') {
            const newStatus = {};
            Object.keys(plan.plans).forEach(method => {
                newStatus[method] = plan.status || 'draft';
            });
            plan.status = newStatus;
        }
        if (!plan.notes) {
            plan.notes = {};
        }
        return plan;
    });
    
    console.log('Parsed allPlans:', allPlans);
    
    // 篩選國家
    const countryFilter = document.getElementById('spCountryFilter').value;
    const filteredPlans = countryFilter ? allPlans.filter(p => p.country === countryFilter) : allPlans;
    
    // 分離 draft、pendingApproval 和 approved（檢查每個 method 的 status）
    const draftPlans = filteredPlans.filter(p => {
        return Object.keys(p.plans).some(method => p.status[method] === 'draft');
    });
    const pendingPlans = filteredPlans.filter(p => {
        return Object.keys(p.plans).some(method => p.status[method] === 'pendingApproval');
    });
    const approvedPlans = filteredPlans.filter(p => {
        return Object.keys(p.plans).some(method => p.status[method] === 'approved');
    });
    
    // 如果沒有任何資料，確保顯示 No... 訊息
    if (allPlans.length === 0) {
        document.getElementById('shippingPlanCards').innerHTML = '<p>No shipping plans available.</p>';
        document.getElementById('pendingApprovalCards').innerHTML = '<p>No pending approvals.</p>';
        document.getElementById('approvedCards').innerHTML = '<p>No approved plans.</p>';
        return;
    }
    
    const draftCardCount = renderPlanCards('shippingPlanCards', draftPlans, 'draft', 0);
    const pendingCardCount = renderPlanCards('pendingApprovalCards', pendingPlans, 'pendingApproval', draftCardCount);
    renderPlanCards('approvedCards', approvedPlans, 'approved', pendingCardCount);
    
    console.log('Render complete');
}

function renderPlanCards(containerId, plans, statusType, startIndex) {
    const cardsContainer = document.getElementById(containerId);
    cardsContainer.innerHTML = '';
    
    // 檢查是否有符合該 statusType 的 method
    let hasMatchingPlans = false;
    plans.forEach(planData => {
        if (!planData.status || typeof planData.status === 'string') {
            planData.status = {};
            Object.keys(planData.plans).forEach(m => planData.status[m] = 'draft');
        }
        if (!planData.notes) {
            planData.notes = {};
        }
        Object.keys(planData.plans).forEach(method => {
            if (planData.status[method] === statusType) {
                hasMatchingPlans = true;
            }
        });
    });
    
    if (!hasMatchingPlans) {
        const messages = {
            'draft': 'No shipping plans available.',
            'pendingApproval': 'No pending approvals.',
            'approved': 'No approved plans.'
        };
        cardsContainer.innerHTML = `<p>${messages[statusType]}</p>`;
        return startIndex;
    }
    
    let cardIndex = startIndex;
    plans.forEach(planData => {
        // 確保 status 和 notes 物件存在
        if (!planData.status || typeof planData.status === 'string') {
            planData.status = {};
            Object.keys(planData.plans).forEach(m => planData.status[m] = 'draft');
        }
        if (!planData.notes) {
            planData.notes = {};
        }
        // 確保 notes 是陣列
        Object.keys(planData.plans).forEach(m => {
            if (!Array.isArray(planData.notes[m])) {
                planData.notes[m] = planData.notes[m] ? [planData.notes[m]] : [];
            }
        });
        
        Object.keys(planData.plans).forEach(method => {
            // 只渲染符合當前 statusType 的 method
            if (planData.status[method] !== statusType) return;
            const skus = planData.plans[method];
            const totalPcs = skus.reduce((sum, item) => sum + item.qty, 0);
            const mockData = replenishmentMockData.find(m => m.sku === skus[0].sku);
            const unitsPerCarton = mockData?.unitsPerCarton || 40;
            const totalCartons = Math.ceil(totalPcs / unitsPerCarton);
            const totalCost = totalPcs * 2.5;
            const unitCost = 2.5;
            
            // 根據 statusType 決定按鈕
            let actionButtons;
            if (statusType === 'draft') {
                actionButtons = `
                    <button class="sp-btn sp-btn-expand" onclick="toggleShippingPlanCard(${cardIndex})">Expand</button>
                    <button class="sp-btn sp-btn-submit" onclick="submitToPending(${planData.id}, '${method}')">Submit</button>
                    <button class="sp-btn sp-btn-cancel" onclick="cancelShippingPlanCard(${planData.id}, '${method}')">Cancel</button>
                `;
            } else if (statusType === 'pendingApproval') {
                actionButtons = `
                    <button class="sp-btn sp-btn-expand" onclick="toggleShippingPlanCard(${cardIndex})">Expand</button>
                    <button class="sp-btn sp-btn-submit" onclick="approvePlan(${planData.id}, '${method}')">Approve</button>
                    <button class="sp-btn sp-btn-cancel" onclick="sendBackToDraft(${planData.id}, '${method}')">Send Back</button>
                `;
            } else {
                actionButtons = `
                    <button class="sp-btn sp-btn-expand" onclick="toggleShippingPlanCard(${cardIndex})">Expand</button>
                    <button class="sp-btn sp-btn-submit" onclick="markAsDone(${planData.id}, '${method}')">Done</button>
                `;
            }
            
            const card = document.createElement('div');
            card.className = 'sp-card';
            card.setAttribute('data-plan-id', planData.id);
            card.setAttribute('data-method', method);
            card.setAttribute('data-status', statusType);
            card.innerHTML = `
                <div class="sp-card-header">
                    <div class="sp-card-summary">
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Status</span>
                            <span class="plan-status-badge plan-status-badge--${statusType}">${statusType === 'draft' ? 'Draft' : statusType === 'pendingApproval' ? 'Pending Approval' : 'Approved'}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Submitted Date</span>
                            <span class="sp-summary-value">${planData.date}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Country</span>
                            <span class="sp-summary-value">${planData.country}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Marketplace</span>
                            <span class="sp-summary-value">${planData.marketplace}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Shipping Method</span>
                            <span class="sp-summary-value">${method}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Total SKU</span>
                            <span class="sp-summary-value">${skus.length}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Total Pcs</span>
                            <span class="sp-summary-value">${totalPcs}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Total Cartons</span>
                            <span class="sp-summary-value">${totalCartons}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Total Cost</span>
                            <span class="sp-summary-value">$${totalCost.toFixed(2)}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Unit Cost</span>
                            <span class="sp-summary-value">$${unitCost.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="sp-card-actions">
                        ${actionButtons}
                    </div>
                </div>
                <div class="sp-card-details">
                    <div class="sp-details-grid">
                        <div class="sp-section">
                            <h4 class="sp-section-title">SKU Shipping Details</h4>
                            <table class="sp-sku-table">
                                <thead>
                                    <tr>
                                        <th>SKU</th>
                                        <th>Current Stock</th>
                                        <th>Avg. Sales</th>
                                        <th>Days of Supply</th>
                                        <th>Shipping Qty</th>
                                        <th>Cartons</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${skus.map(item => {
                                        const itemMockData = replenishmentMockData.find(m => m.sku === item.sku);
                                        const itemUnitsPerCarton = itemMockData?.unitsPerCarton || 40;
                                        return `
                                        <tr>
                                            <td>${item.sku}</td>
                                            <td>${item.skuData.currentInventory}</td>
                                            <td>${item.skuData.avgDailySales}</td>
                                            <td>${item.skuData.daysOfSupply}</td>
                                            <td>
                                                <input type="number" value="${item.qty}" max="${item.qty}" 
                                                       oninput="validateShippingQty(this, ${item.qty})" 
                                                       style="text-align: right;">
                                                <div class="qty-error" style="display: none; color: #EF4444; font-size: 11px; margin-top: 2px;">不可大於 ${item.qty}</div>
                                            </td>
                                            <td>${Math.ceil(item.qty / itemUnitsPerCarton)}</td>
                                        </tr>
                                    `}).join('')}
                                </tbody>
                            </table>
                        </div>
                        <div class="sp-section">
                            <h4 class="sp-section-title" style="display: flex; justify-content: space-between; align-items: center;">
                                <span>Plan Rationale</span>
                                <button class="sp-btn sp-btn-submit" onclick="showNoteInput(${cardIndex})" style="font-size: 12px; padding: 4px 12px;">+ Add Note</button>
                            </h4>
                            <div class="sp-rationale-text">
                                <div class="sp-rationale-item"><strong>Target Days:</strong> ${planData.targetDays}</div>
                                <div class="sp-rationale-item"><strong>Method:</strong> ${method}</div>
                                <div id="note-input-${cardIndex}" style="display: none; margin-top: 8px;">
                                    <textarea id="note-text-${cardIndex}" style="width: 100%; min-height: 60px; padding: 8px; border: 1px solid #E2E8F0; border-radius: 4px; font-size: 13px; resize: vertical;"></textarea>
                                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
                                        <button onclick="cancelNote(${cardIndex})" style="background: #EF4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">✕</button>
                                        <button onclick="saveNote(${cardIndex})" style="background: #10B981; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">✓</button>
                                    </div>
                                </div>
                                <div id="note-display-${cardIndex}" style="margin-top: 8px;">${planData.notes[method] && planData.notes[method].length > 0 ? planData.notes[method].map(note => `<div class="sp-rationale-item" style="background: #F0F9FF; padding: 8px; border-radius: 4px; border-left: 3px solid #3B82F6; margin-bottom: 4px;"><strong>Note:</strong> ${note}</div>`).join('') : ''}</div>
                            </div>
                        </div>
                        <div class="sp-section">
                            <h4 class="sp-section-title">Cost Breakdown</h4>
                            <div class="sp-cost-row">
                                <span class="sp-cost-label">Carrier Name</span>
                                <select onchange="updateCarrierCost(${cardIndex}, this.value, ${totalPcs})" style="padding: 4px 8px; border: 1px solid #E2E8F0; border-radius: 4px; font-size: 13px;">
                                    <option value="DHL">DHL</option>
                                    <option value="FedEx">FedEx</option>
                                    <option value="UPS">UPS</option>
                                    <option value="Maersk">Maersk</option>
                                </select>
                            </div>
                            <div class="sp-cost-row">
                                <span class="sp-cost-label">Carrier Fee</span>
                                <span class="sp-cost-value" id="carrier-fee-${cardIndex}">$${(totalCost * 0.7).toFixed(2)}</span>
                            </div>
                            <div class="sp-cost-row">
                                <span class="sp-cost-label">Duty / Custom</span>
                                <span class="sp-cost-value" id="duty-${cardIndex}">$${(totalCost * 0.3).toFixed(2)}</span>
                            </div>
                            <div class="sp-cost-row">
                                <span class="sp-cost-label">Total Cost</span>
                                <span class="sp-cost-value" id="total-cost-${cardIndex}">$${totalCost.toFixed(2)}</span>
                            </div>
                            <div class="sp-cost-row">
                                <span class="sp-cost-label">Unit Cost</span>
                                <span class="sp-cost-value" id="unit-cost-${cardIndex}">$${unitCost.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            cardsContainer.appendChild(card);
            cardIndex++;
        });
    });
    
    return cardIndex;
}

function toggleShippingPlanCard(index) {
    const cards = document.querySelectorAll('.sp-card');
    const card = cards[index];
    const btn = card.querySelector('.sp-btn-expand');
    
    card.classList.toggle('is-expanded');
    btn.textContent = card.classList.contains('is-expanded') ? 'Collapse' : 'Expand';
}

function submitShippingPlanCard(index) {
    alert('Shipping Plan submitted successfully!');
}

function cancelShippingPlanCard(planId, method) {
    if (!confirm('Cancel this shipping plan?')) return;
    
    // 從 sessionStorage 刪除資料
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    if (allPlansStr) {
        const allPlans = JSON.parse(allPlansStr);
        const plan = allPlans.find(p => p.id === planId);
        
        if (plan && plan.plans[method]) {
            // 刪除該 method
            delete plan.plans[method];
            
            // 如果該 plan 沒有任何 method 了，刪除整個 plan
            if (Object.keys(plan.plans).length === 0) {
                const planIndex = allPlans.findIndex(p => p.id === planId);
                if (planIndex >= 0) {
                    allPlans.splice(planIndex, 1);
                }
            }
            
            // 更新 sessionStorage
            sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
        }
    }
    
    // 重新渲染
    renderShippingPlan();
}

window.renderShippingPlan = renderShippingPlan;
window.toggleShippingPlanCard = toggleShippingPlanCard;
window.submitShippingPlanCard = submitShippingPlanCard;
window.cancelShippingPlanCard = cancelShippingPlanCard;

function validateShippingQty(input, maxQty) {
    const value = parseInt(input.value) || 0;
    const errorDiv = input.nextElementSibling;
    
    if (value > maxQty) {
        input.style.border = '2px solid #EF4444';
        input.style.background = '#FEE2E2';
        if (errorDiv) errorDiv.style.display = 'block';
    } else {
        input.style.border = '1px solid #E2E8F0';
        input.style.background = 'white';
        if (errorDiv) errorDiv.style.display = 'none';
    }
}

window.validateShippingQty = validateShippingQty;

function showNoteInput(cardIndex) {
    const inputDiv = document.getElementById(`note-input-${cardIndex}`);
    if (inputDiv) {
        inputDiv.style.display = 'block';
    }
}

function cancelNote(cardIndex) {
    const inputDiv = document.getElementById(`note-input-${cardIndex}`);
    const textarea = document.getElementById(`note-text-${cardIndex}`);
    if (inputDiv) inputDiv.style.display = 'none';
    if (textarea) textarea.value = '';
}

function saveNote(cardIndex) {
    const textarea = document.getElementById(`note-text-${cardIndex}`);
    const displayDiv = document.getElementById(`note-display-${cardIndex}`);
    const inputDiv = document.getElementById(`note-input-${cardIndex}`);
    const cards = document.querySelectorAll('.sp-card');
    const card = cards[cardIndex];
    
    if (textarea && displayDiv && card) {
        const noteText = textarea.value.trim();
        if (noteText) {
            const planId = parseInt(card.getAttribute('data-plan-id'));
            const method = card.getAttribute('data-method');
            
            // 儲存到 sessionStorage
            const allPlansStr = sessionStorage.getItem('allShippingPlans');
            if (allPlansStr) {
                const allPlans = JSON.parse(allPlansStr);
                const plan = allPlans.find(p => p.id === planId);
                if (plan) {
                    if (!plan.notes) plan.notes = {};
                    if (!Array.isArray(plan.notes[method])) plan.notes[method] = [];
                    plan.notes[method].push(noteText);
                    sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
                }
            }
            
            // 更新顯示（累加）
            const newNoteHtml = `<div class="sp-rationale-item" style="background: #F0F9FF; padding: 8px; border-radius: 4px; border-left: 3px solid #3B82F6; margin-bottom: 4px;"><strong>Note:</strong> ${noteText}</div>`;
            displayDiv.innerHTML += newNoteHtml;
            textarea.value = '';
            if (inputDiv) inputDiv.style.display = 'none';
        }
    }
}

window.showNoteInput = showNoteInput;
window.cancelNote = cancelNote;
window.saveNote = saveNote;

function updateCarrierCost(cardIndex, carrier, totalPcs) {
    // 不同 Carrier 的單位成本
    const carrierRates = {
        'DHL': 3.5,
        'FedEx': 3.2,
        'UPS': 3.0,
        'Maersk': 2.0
    };
    
    const unitCost = carrierRates[carrier] || 2.5;
    const totalCost = totalPcs * unitCost;
    const carrierFee = totalCost * 0.7;
    const duty = totalCost * 0.3;
    
    // 更新顯示
    document.getElementById(`carrier-fee-${cardIndex}`).textContent = `$${carrierFee.toFixed(2)}`;
    document.getElementById(`duty-${cardIndex}`).textContent = `$${duty.toFixed(2)}`;
    document.getElementById(`total-cost-${cardIndex}`).textContent = `$${totalCost.toFixed(2)}`;
    document.getElementById(`unit-cost-${cardIndex}`).textContent = `$${unitCost.toFixed(2)}`;
}

window.updateCarrierCost = updateCarrierCost;

function submitToPending(planId, method) {
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    if (!allPlansStr) return;
    
    const allPlans = JSON.parse(allPlansStr);
    const plan = allPlans.find(p => p.id === planId);
    
    if (plan) {
        if (!plan.status || typeof plan.status === 'string') {
            plan.status = {};
        }
        plan.status[method] = 'pendingApproval';
        sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
        renderShippingPlan();
    }
}

function approvePlan(planId, method) {
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    if (!allPlansStr) return;
    
    const allPlans = JSON.parse(allPlansStr);
    const plan = allPlans.find(p => p.id === planId);
    
    if (plan) {
        if (!plan.status || typeof plan.status === 'string') {
            plan.status = {};
        }
        plan.status[method] = 'approved';
        sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
        renderShippingPlan();
    }
}

function sendBackToDraft(planId, method) {
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    if (!allPlansStr) return;
    
    const allPlans = JSON.parse(allPlansStr);
    const plan = allPlans.find(p => p.id === planId);
    
    if (plan) {
        if (!plan.status || typeof plan.status === 'string') {
            plan.status = {};
        }
        plan.status[method] = 'draft';
        sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
        renderShippingPlan();
    }
}

window.submitToPending = submitToPending;
window.approvePlan = approvePlan;
window.sendBackToDraft = sendBackToDraft;

function markAsDone(planId, method) {
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    if (!allPlansStr) return;
    
    const allPlans = JSON.parse(allPlansStr);
    const plan = allPlans.find(p => p.id === planId);
    
    if (plan && plan.plans[method]) {
        // 準備傳送到 Shipping History 的資料
        const skus = plan.plans[method];
        const totalPcs = skus.reduce((sum, item) => sum + item.qty, 0);
        const mockData = replenishmentMockData.find(m => m.sku === skus[0].sku);
        const unitsPerCarton = mockData?.unitsPerCarton || 40;
        const totalCartons = Math.ceil(totalPcs / unitsPerCarton);
        const unitCost = 2.5;
        const totalCost = totalPcs * unitCost;
        
        const historyRecord = {
            id: `SP-${plan.date.replace(/-/g, '')}-${plan.id}`,
            date: new Date().toISOString().split('T')[0],
            country: plan.country,
            marketplace: plan.marketplace,
            method: method,
            totalPcs: totalPcs,
            totalCartons: totalCartons,
            totalCost: totalCost,
            unitCost: unitCost,
            skus: skus.map(item => ({ sku: item.sku, qty: item.qty }))
        };
        
        // 儲存到 Shipping History
        let historyData = [];
        const existingHistory = sessionStorage.getItem('shippingHistory');
        if (existingHistory) {
            historyData = JSON.parse(existingHistory);
        }
        historyData.push(historyRecord);
        sessionStorage.setItem('shippingHistory', JSON.stringify(historyData));
        
        // 從 Shipping Plan 中刪除
        delete plan.plans[method];
        if (plan.status) delete plan.status[method];
        if (plan.notes) delete plan.notes[method];
        
        // 如果沒有其他 method 了，刪除整個 plan
        if (Object.keys(plan.plans).length === 0) {
            const planIndex = allPlans.findIndex(p => p.id === planId);
            if (planIndex >= 0) {
                allPlans.splice(planIndex, 1);
            }
        }
        
        sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
        
        alert('Plan marked as Done and sent to Shipping History.');
        renderShippingPlan();
    }
}

window.markAsDone = markAsDone;

function filterByStatus() {
    const statusFilter = document.getElementById('spStatusFilter').value;
    const allCards = document.querySelectorAll('.sp-card');
    
    // 控制標題顯示
    const draftTitle = document.getElementById('draftSectionTitle');
    const pendingTitle = document.getElementById('pendingSectionTitle');
    const approvedTitle = document.getElementById('approvedSectionTitle');
    const draftCards = document.getElementById('shippingPlanCards');
    const pendingCards = document.getElementById('pendingApprovalCards');
    const approvedCards = document.getElementById('approvedCards');
    
    if (statusFilter === 'all') {
        // 顯示所有
        draftTitle.style.display = '';
        pendingTitle.style.display = '';
        approvedTitle.style.display = '';
        draftCards.style.display = '';
        pendingCards.style.display = '';
        approvedCards.style.display = '';
        allCards.forEach(card => card.style.display = '');
    } else {
        // 隱藏所有標題和容器
        draftTitle.style.display = 'none';
        pendingTitle.style.display = 'none';
        approvedTitle.style.display = 'none';
        draftCards.style.display = 'none';
        pendingCards.style.display = 'none';
        approvedCards.style.display = 'none';
        
        // 只顯示選中的狀態
        if (statusFilter === 'draft') {
            draftTitle.style.display = '';
            draftCards.style.display = '';
        } else if (statusFilter === 'pendingApproval') {
            pendingTitle.style.display = '';
            pendingCards.style.display = '';
        } else if (statusFilter === 'approved') {
            approvedTitle.style.display = '';
            approvedCards.style.display = '';
        }
        
        // 顯示對應狀態的卡片
        allCards.forEach(card => {
            const cardStatus = card.getAttribute('data-status');
            card.style.display = cardStatus === statusFilter ? '' : 'none';
        });
    }
}

window.filterByStatus = filterByStatus;

// ========================================
// 世界時間功能
// ========================================

function initWorldTimes() {
    updateWorldTimes();
    setInterval(updateWorldTimes, 1000);
}

function updateWorldTimes() {
    const timezones = [
        { id: 'AU', offset: 11, name: 'Australia' },
        { id: 'JP', offset: 9, name: 'Japan' },
        { id: 'DE', offset: 1, name: 'Germany' },
        { id: 'UK', offset: 0, name: 'UK' },
        { id: 'US-East', offset: -5, name: 'US East' },
        { id: 'US-Middle', offset: -6, name: 'US Central' },
        { id: 'US-West', offset: -8, name: 'US West' }
    ];
    
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    
    timezones.forEach(tz => {
        const localTime = new Date(utc + (3600000 * tz.offset));
        const card = document.getElementById(`card-${tz.id}`);
        
        if (card) {
            const dateStr = `${localTime.getMonth() + 1}/${localTime.getDate()}/${localTime.getFullYear().toString().slice(-2)}`;
            const timeStr = localTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            const offsetStr = `TP${tz.offset >= 0 ? '+' : ''}${tz.offset}`;
            
            card.querySelector('.local-date').textContent = dateStr;
            card.querySelector('.local-time').textContent = timeStr;
            card.querySelector('.timezone-offset').textContent = offsetStr;
        }
    });
}

window.initWorldTimes = initWorldTimes;
window.updateWorldTimes = updateWorldTimes;

// ========================================
// Replenishment Charts
// ========================================

function initSalesTrendChart(sku, skuData) {
    const canvas = document.getElementById(`sales-trend-chart-${sku}`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const today = new Date();
    const labels = [];
    const data = [];
    
    // Generate past 7 days data
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
        
        // Generate random sales data based on SKU
        const baseValue = skuData.lastWeek / 7;
        const variance = baseValue * 0.3;
        data.push(Math.round(baseValue + (Math.random() - 0.5) * variance));
    }
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales Units',
                data: data,
                borderColor: '#3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

function initAchievementChart(sku, skuData) {
    const canvas = document.getElementById(`achievement-chart-${sku}`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const today = new Date();
    const labels = [];
    const data = [];
    
    // Generate past 3 months data
    for (let i = 2; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        labels.push(monthNames[date.getMonth()]);
        
        // Generate achievement rate (80-110%)
        data.push(Math.round(80 + Math.random() * 30));
    }
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Achievement Rate (%)',
                data: data,
                borderColor: '#10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y + '%';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    beginAtZero: false,
                    min: 70,
                    max: 120,
                    ticks: {
                        font: {
                            size: 10
                        },
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}

window.initSalesTrendChart = initSalesTrendChart;
window.initAchievementChart = initAchievementChart;


// Add Marketplace Modal Functions
function openAddMarketplaceModal() {
    const modal = document.getElementById('add-marketplace-modal');
    const overlay = document.getElementById('replen-modal-overlay');
    if (modal && overlay) {
        modal.classList.add('is-open');
        overlay.classList.add('is-open');
    }
}

function closeAddMarketplaceModal() {
    const modal = document.getElementById('add-marketplace-modal');
    const overlay = document.getElementById('replen-modal-overlay');
    if (modal && overlay) {
        modal.classList.remove('is-open');
        overlay.classList.remove('is-open');
    }
    // Clear inputs
    document.getElementById('add-mp-country').value = 'US';
    document.getElementById('add-mp-company').value = 'Kitchen Mama';
    document.getElementById('add-mp-marketplace').value = '';
}

function saveMarketplace() {
    const country = document.getElementById('add-mp-country').value;
    const company = document.getElementById('add-mp-company').value;
    const marketplace = document.getElementById('add-mp-marketplace').value.trim();
    
    if (!marketplace) {
        alert('Please enter marketplace name');
        return;
    }
    
    // TODO: Stage 2 - Save to database and update filters
    console.log('Add Marketplace:', { country, company, marketplace });
    alert(`Marketplace added:\nCountry: ${country}\nCompany: ${company}\nMarketplace: ${marketplace}`);
    
    closeAddMarketplaceModal();
}

window.openAddMarketplaceModal = openAddMarketplaceModal;
window.closeAddMarketplaceModal = closeAddMarketplaceModal;
window.saveMarketplace = saveMarketplace;

// Add Country Functions
function showAddCountryInput() {
    const container = document.getElementById('add-country-input-container');
    if (container) {
        container.style.display = 'block';
    }
}

function cancelAddCountry() {
    const container = document.getElementById('add-country-input-container');
    const input = document.getElementById('new-country-code');
    if (container) container.style.display = 'none';
    if (input) input.value = '';
}

function addNewCountry() {
    const input = document.getElementById('new-country-code');
    const select = document.getElementById('add-mp-country');
    
    if (!input || !select) return;
    
    const countryCode = input.value.trim().toUpperCase();
    
    if (!countryCode) {
        alert('Please enter a country code');
        return;
    }
    
    // Check if country already exists
    const existingOptions = Array.from(select.options);
    if (existingOptions.some(opt => opt.value === countryCode)) {
        alert('Country code already exists');
        return;
    }
    
    // Add new option
    const newOption = document.createElement('option');
    newOption.value = countryCode;
    newOption.textContent = countryCode;
    select.appendChild(newOption);
    
    // Select the new option
    select.value = countryCode;
    
    // Clear and hide input
    input.value = '';
    const container = document.getElementById('add-country-input-container');
    if (container) container.style.display = 'none';
}

window.showAddCountryInput = showAddCountryInput;
window.cancelAddCountry = cancelAddCountry;
window.addNewCountry = addNewCountry;

// ========================================
// Factory Stock
// ========================================

function renderFactoryStock() {
    const fixedBody = document.getElementById('factory-stock-fixed-body');
    const scrollBody = document.getElementById('factory-stock-scroll-body');
    
    if (!fixedBody || !scrollBody) return;
    
    // 計算動態月份標題
    const today = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = today.getMonth();
    const month0 = monthNames[currentMonth];
    const month1 = monthNames[(currentMonth + 1) % 12];
    const month2 = monthNames[(currentMonth + 2) % 12];
    
    // 更新 header 月份標題
    document.getElementById('factory-month-0').textContent = `${month0} Orders`;
    document.getElementById('factory-month-1').textContent = `${month1} Orders`;
    document.getElementById('factory-month-2').textContent = `${month2} Orders`;
    
    // 渲染左側固定欄 (SKU)
    fixedBody.innerHTML = factoryStockData.map(item => `
        <div class="fixed-row">${item.sku}</div>
    `).join('');
    
    // 渲染右側滾動欄 (其他欄位)
    scrollBody.innerHTML = factoryStockData.map(item => `
        <div class="scroll-row">
            <div class="scroll-cell">${item.company}</div>
            <div class="scroll-cell">${item.marketplace}</div>
            <div class="scroll-cell">${item.category}</div>
            <div class="scroll-cell">${item.series}</div>
            <div class="scroll-cell">${item.factory}</div>
            <div class="scroll-cell">${item.stock}</div>
            <div class="scroll-cell">${item.completedOrderMonth0}</div>
            <div class="scroll-cell">${item.completedOrderMonth1}</div>
            <div class="scroll-cell">${item.completedOrderMonth2}</div>
        </div>
    `).join('');
}

function initFactoryStockHeaderSync() {
    const scrollCol = document.querySelector('#factory-stock-section .scroll-col');
    const scrollHeader = document.querySelector('#factory-stock-section .scroll-header');
    
    if (!scrollCol || !scrollHeader) return;
    
    // Remove existing listener to avoid duplicates
    scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
    
    // Create and store handler
    scrollCol._syncHandler = () => {
        scrollHeader.style.transform = `translateX(-${scrollCol.scrollLeft}px)`;
    };
    
    scrollCol.addEventListener('scroll', scrollCol._syncHandler);
}

window.renderFactoryStock = renderFactoryStock;
window.initFactoryStockHeaderSync = initFactoryStockHeaderSync;

// Factory Stock Filter Functions
function toggleFactoryFilter(checkbox, filterType) {
    const panel = document.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
    updateFactoryFilter(filterType);
}

function updateFactoryFilter(filterType) {
    renderFactoryStock();
}

window.toggleFactoryFilter = toggleFactoryFilter;
window.updateFactoryFilter = updateFactoryFilter;
