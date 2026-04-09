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
// ========================================
// Homepage - 已搬移至 pages/home.js
// ========================================
// 區塊切換函式
function showSection(section) {
    // 隱藏所有區塊
    document.getElementById('home-section').style.display = 'none';
    document.getElementById('world-time-bar').style.display = 'none';
    document.querySelectorAll('.module-section').forEach(sec => sec.classList.remove('active'));
    
    // 呼叫生命週期切換（如果已註冊）
    if (window.KM && window.KM.lifecycle && window.KM.lifecycle.switchTo) {
        const sectionMap = {
            'restock': 'replenishment-section',
            'ops': 'ops-section',
            'factory-stock': 'factory-stock-section',
            'forecast': 'forecast-section',
            'request-order': 'request-order-section',
            'fc-summary': 'fc-summary-section',
            'skuDetails': 'sku-section',
            'supplychain': 'supplychain-section',
            'shippingplan': 'shippingplan-section',
            'shippinghistory': 'shippinghistory-section'
        };
        const targetSectionId = sectionMap[section];
        if (targetSectionId) {
            KM.lifecycle.switchTo(targetSectionId);
        }
    }
    
    // 顯示選擇的區塊
    const sectionMap = {
        'restock': 'replenishment-section',
        'ops': 'ops-section', 
        'factory-stock': 'factory-stock-section',
        'forecast': 'forecast-section',
        'request-order': 'request-order-section',
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
    if (section === 'request-order') {
        setTimeout(() => {
            if (window.initRequestOrderSection) {
                window.initRequestOrderSection();
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
        if (window.initFactoryStockPage) {
            window.initFactoryStockPage();
        }
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

// ========================================
// SKU Details - 已搬移至 pages/sku-details.js
// ========================================

// ========================================
// Inventory Replenishment (Stage 1)
// ========================================
// Inventory Replenishment (批次1: Mock Data+核心計算渲染) - 已搬移至 pages/inventory-replenishment.js
// ========================================
// Inventory Replenishment (批次2: 操作+Allocation) - 已搬移至 pages/inventory-replenishment.js
// ========================================

// ========================================
// Shipping Plan - 已搬移至 pages/shipping-plan.js
// ========================================

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
// Replenishment Charts+Modals - 已搬移至 pages/inventory-replenishment.js
// ========================================

// ========================================
// Factory Stock - 已搬移至 pages/factory-stock.js (舊版殘留已移除)
// ========================================
// Initialize SKU FC Decision Section
if (typeof initFcSkuDecisionSection === 'function') {
    initFcSkuDecisionSection();
}


// 初始化時載入紀錄和世界時間
window.addEventListener('DOMContentLoaded', () => {
    renderRecords();
    initWorldTimes();
    renderHomepage();
    initSkuUnifiedScroll();

    // 設定初始頁面生命週期（首頁）
    if (window.KM && window.KM.lifecycle && window.KM.lifecycle.switchTo) {
        KM.lifecycle.switchTo('home-section');
    }
});
