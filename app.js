// Firebase 初始化 (暫時註解)
// import { db } from './firebase-config.js';
// import { collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Homepage 渲染函式 - Stage 1
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
        'forecast': 'forecast-section',
        'shipment': 'shipment-section',
        'skuDetails': 'sku-section'
    };
    
    if (sectionMap[section]) {
        document.getElementById(sectionMap[section]).classList.add('active');
    }
    
    // 更新選單狀態
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    if (event && event.target) {
        event.target.closest('.menu-item').classList.add('active');
    }
    
    if (section === 'forecast') {
        renderForecastChart();
    }
    if (section === 'shipment') {
        renderWeeklyShippingPlans();
    }
    if (section === 'skuDetails') {
        renderSkuDetailsTable();
        setTimeout(() => {
            if (window.updateSkuScrollWidth) {
                window.updateSkuScrollWidth();
            }
        }, 100);
    }
    if (section === 'ops') {
        renderReplenishment();
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

// 渲染 Dashboard 1
function renderDashboard1() {
    const selectedFactory = document.getElementById('factorySelect').value;
    const tableBody = document.getElementById('dashboard1Body');
    
    if (!selectedFactory) {
        tableBody.innerHTML = '';
        updateSummary();
        return;
    }
    
    const factoryData = window.DataRepo.getFactoryInventory(selectedFactory);
    tableBody.innerHTML = factoryData.map(item => `
        <tr>
            <td>${item.sku}</td>
            <td>${item.stock}</td>
            <td><input type="number" id="qty_${item.sku}" placeholder="輸入數量" oninput="updateSummary()"></td>
            <td id="boxes_${item.sku}">0</td>
        </tr>
    `).join('');
    
    updateSummary();
}

// 更新 Summary
function updateSummary() {
    let totalQty = 0;
    let totalBoxes = 0;
    
    const selectedFactory = document.getElementById('factorySelect').value;
    if (!selectedFactory) {
        document.getElementById('totalQty').textContent = '0';
        document.getElementById('totalBoxes').textContent = '0';
        return;
    }
    
    const factoryData = window.DataRepo.getFactoryInventory(selectedFactory);
    factoryData.forEach(item => {
        const qtyInput = document.getElementById(`qty_${item.sku}`);
        if (qtyInput) {
            const qty = parseInt(qtyInput.value) || 0;
            const boxes = Math.ceil(qty / 40);
            
            document.getElementById(`boxes_${item.sku}`).textContent = boxes;
            totalQty += qty;
            totalBoxes += boxes;
        }
    });
    
    document.getElementById('totalQty').textContent = totalQty;
    document.getElementById('totalBoxes').textContent = totalBoxes;
}

// 提交 Dashboard 1
function submitDashboard1() {
    const selectedFactory = document.getElementById('factorySelect').value;
    if (!selectedFactory) return;
    
    const factoryData = window.DataRepo.getFactoryInventory(selectedFactory);
    const submittedItems = [];
    
    factoryData.forEach(item => {
        const qtyInput = document.getElementById(`qty_${item.sku}`);
        const qty = parseInt(qtyInput.value) || 0;
        
        if (qty > 0) {
            submittedItems.push({
                sku: item.sku,
                factoryStock: item.stock,
                qty: qty,
                boxes: Math.ceil(qty / 40)
            });
        }
    });
    
    if (submittedItems.length === 0) return;
    
    renderDashboard2(submittedItems);
    document.getElementById('dashboard2Section').style.display = 'block';
}

// 渲染 Dashboard 2
function renderDashboard2(items) {
    const tableBody = document.getElementById('dashboard2Body');
    const shippingMethods = window.DataRepo.getShippingMethods();
    
    tableBody.innerHTML = items.map(item => `
        <tr>
            <td>${item.sku}</td>
            <td>${item.factoryStock}</td>
            <td>${item.qty}</td>
            <td>${item.boxes}</td>
            <td>
                <select id="shipping_${item.sku}">
                    <option value="">選擇出貨方式</option>
                    ${shippingMethods.map(method => `<option value="${method}">${method}</option>`).join('')}
                </select>
            </td>
            <td><input type="text" id="note_${item.sku}" placeholder="輸入備註"></td>
        </tr>
    `).join('');
    
    window.currentDashboard2Items = items;
}

// 提交 Dashboard 2
function submitDashboard2() {
    if (!window.currentDashboard2Items) return;
    
    const shippingPlans = window.currentDashboard2Items.map(item => {
        const shippingMethod = document.getElementById(`shipping_${item.sku}`).value;
        const note = document.getElementById(`note_${item.sku}`).value;
        
        return {
            id: Date.now() + Math.random(),
            sku: item.sku,
            factoryStock: item.factoryStock,
            qty: item.qty,
            shippingMethod: shippingMethod,
            note: note,
            status: 'planning',
            createdAt: new Date().toISOString()
        };
    });
    
    shippingPlans.forEach(plan => {
        window.DataRepo.saveWeeklyShippingPlan(plan);
    });
    
    // 清空表單
    document.getElementById('factorySelect').value = '';
    renderDashboard1();
    document.getElementById('dashboard2Section').style.display = 'none';
    
    // 更新 Weekly Shipping Plans 顯示
    renderWeeklyShippingPlans();
}

// 渲染 Weekly Shipping Plans
function renderWeeklyShippingPlans() {
    const planningPlans = window.DataRepo.getWeeklyShippingPlans('planning');
    const ongoingPlans = window.DataRepo.getWeeklyShippingPlans('ongoing');
    const donePlans = window.DataRepo.getWeeklyShippingPlans('done');
    
    // Planning 表格
    document.getElementById('planningTableBody').innerHTML = planningPlans.map(plan => `
        <tr>
            <td>${plan.sku}</td>
            <td>${plan.factoryStock}</td>
            <td>${plan.qty}</td>
            <td>${plan.shippingMethod}</td>
            <td>${plan.note || ''}</td>
            <td>
                <button onclick="moveToOngoing('${plan.id}')">已提交</button>
                <button onclick="undoFromPlanning('${plan.id}')">Undo</button>
            </td>
        </tr>
    `).join('');
    
    // Ongoing 表格
    document.getElementById('ongoingTableBody').innerHTML = ongoingPlans.map(plan => `
        <tr>
            <td>${plan.sku}</td>
            <td>${plan.factoryStock}</td>
            <td>${plan.qty}</td>
            <td>${plan.shippingMethod}</td>
            <td>${plan.note || ''}</td>
            <td>
                <button onclick="moveToDone('${plan.id}')">已出貨</button>
                <button onclick="undoFromOngoing('${plan.id}')">Undo</button>
            </td>
        </tr>
    `).join('');
    
    // Done 表格
    document.getElementById('doneTableBody').innerHTML = donePlans.map(plan => `
        <tr>
            <td>${plan.sku}</td>
            <td>${plan.factoryStock}</td>
            <td>${plan.qty}</td>
            <td>${plan.shippingMethod}</td>
            <td>${plan.note || ''}</td>
            <td>-</td>
        </tr>
    `).join('');
}

// 移動到 Ongoing
function moveToOngoing(planId) {
    console.log('moveToOngoing called with planId:', planId);
    window.DataRepo.updateShippingPlanStatus(planId, 'ongoing');
    renderWeeklyShippingPlans();
}

// 移動到 Done
function moveToDone(planId) {
    console.log('moveToDone called with planId:', planId);
    window.DataRepo.updateShippingPlanStatus(planId, 'done');
    renderWeeklyShippingPlans();
}

// Undo 從 Ongoing 回到 Planning
function undoFromOngoing(planId) {
    console.log('undoFromOngoing called with planId:', planId);
    window.DataRepo.updateShippingPlanStatus(planId, 'planning');
    renderWeeklyShippingPlans();
}

// Undo 從 Planning 刪除出貨記錄
function undoFromPlanning(planId) {
    console.log('undoFromPlanning called with planId:', planId);
    window.DataRepo.removeShippingPlan(planId);
    renderWeeklyShippingPlans();
}

// 世界時間功能 - Stage 1 四格布局
const timeZones = {
    'AU': { timezone: 'Australia/Sydney', name: 'Australia' },
    'JP': { timezone: 'Asia/Tokyo', name: 'Japan' },
    'DE': { timezone: 'Europe/Berlin', name: 'Germany' },
    'UK': { timezone: 'Europe/London', name: 'UK' },
    'US-East': { timezone: 'America/New_York', name: 'US East' },
    'US-Middle': { timezone: 'America/Chicago', name: 'US Central' },
    'US-West': { timezone: 'America/Los_Angeles', name: 'US West' }
};

const TP_TIMEZONE = 'Asia/Taipei';

function getTimezoneOffset(timezone) {
    const now = new Date();
    const tpTime = new Date(now.toLocaleString('en-US', { timeZone: TP_TIMEZONE }));
    const targetTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const offsetHours = Math.round((targetTime - tpTime) / (1000 * 60 * 60));
    return offsetHours >= 0 ? `TP+${offsetHours}` : `TP${offsetHours}`;
}

function updateWorldTimes() {
    Object.keys(timeZones).forEach(zone => {
        const now = new Date();
        
        // 獲取當地時間
        const timeString = now.toLocaleTimeString('en-GB', {
            timeZone: timeZones[zone].timezone,
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // 獲取當地日期
        const dateString = now.toLocaleDateString('en-CA', {
            timeZone: timeZones[zone].timezone,
            year: '2-digit',
            month: '2-digit',
            day: '2-digit'
        }).replace(/-/g, '/');
        
        // 獲取 TP 時區偏移
        const offsetString = getTimezoneOffset(timeZones[zone].timezone);
        
        const card = document.getElementById(`card-${zone}`);
        if (card) {
            card.querySelector('.timezone-offset').textContent = offsetString;
            card.querySelector('.local-time').textContent = timeString;
            card.querySelector('.local-date').textContent = dateString;
        }
    });
}

// 初始化時間顯示並設定定時器
function initWorldTimes() {
    updateWorldTimes();
    setInterval(updateWorldTimes, 60000); // 每 60 秒更新
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
            <div class="scroll-cell" data-col="4">${item.category}</div>
            <div class="scroll-cell" data-col="5">${item.gs1Code}</div>
            <div class="scroll-cell" data-col="6">${item.gs1Type}</div>
            <div class="scroll-cell" data-col="7">${item.amzAsin}</div>
            <div class="scroll-cell" data-col="8">${item.itemDimensions}</div>
            <div class="scroll-cell" data-col="9">${item.itemWeight}</div>
            <div class="scroll-cell" data-col="10">${item.package}</div>
            <div class="scroll-cell" data-col="11">${item.packageWeight}</div>
            <div class="scroll-cell" data-col="12">${item.cartonDimensions}</div>
            <div class="scroll-cell" data-col="13">${item.cartonWeight}</div>
            <div class="scroll-cell" data-col="14">${item.unitsPerCarton}</div>
            <div class="scroll-cell" data-col="15">${item.hscode}</div>
            <div class="scroll-cell" data-col="16">${item.declaredValue}</div>
            <div class="scroll-cell" data-col="17">${item.minimumPrice}</div>
            <div class="scroll-cell" data-col="18">${item.msrp}</div>
            <div class="scroll-cell" data-col="19">${item.sellingPrice}</div>
            <div class="scroll-cell" data-col="20">${item.pm}</div>
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

// SKU Details 功能 - Stage 1 最小實作
function renderSkuDetails() {
    // 渲染 Categories
    const categoryList = document.getElementById('categoryList');
    const categories = window.DataRepo.getCategories();
    categoryList.innerHTML = categories.map(cat => 
        `<li onclick="filterByCategory('${cat}')">${cat}</li>`
    ).join('');
    
    // 渲染 SKU 表格
    renderSkuTable();
}

function renderSkuTable() {
    const skus = window.DataRepo.getSkus();
    const tbody = document.getElementById('skuDetailsBody');
    
    tbody.innerHTML = skus.map(sku => `
        <tr>
            <td>${sku.sku}</td>
            <td>${sku.productName}</td>
            <td>${sku.category}</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
        </tr>
    `).join('');
}

function filterSkus() {
    // Stage 1: 前端即時 filter
    const searchTerm = document.getElementById('skuSearchBox').value.toLowerCase();
    const rows = document.querySelectorAll('#skuDetailsBody tr');
    
    rows.forEach(row => {
        const sku = row.cells[0].textContent.toLowerCase();
        row.style.display = sku.includes(searchTerm) ? '' : 'none';
    });
}

function toggleFilterDropdown() {
    const dropdown = document.getElementById('filterDropdown');
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

function filterByCategory(category) {
    const rows = document.querySelectorAll('#skuDetailsBody tr');
    rows.forEach(row => {
        const rowCategory = row.cells[2].textContent;
        row.style.display = rowCategory === category ? '' : 'none';
    });
}

function showAddSkuModal() {
    // Stage 1: placeholder modal
    alert('新增 SKU 功能 - Stage 1 placeholder');
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
window.renderDashboard1 = renderDashboard1;
window.updateSummary = updateSummary;
window.submitDashboard1 = submitDashboard1;
window.submitDashboard2 = submitDashboard2;
window.moveToOngoing = moveToOngoing;
window.moveToDone = moveToDone;
window.undoFromOngoing = undoFromOngoing;
window.undoFromPlanning = undoFromPlanning;
window.renderWeeklyShippingPlans = renderWeeklyShippingPlans;
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
    { sku: "A001", lifecycle: "Mature", productName: "Can Opener Pro", forecast90d: 450, onTheWay: 20 },
    { sku: "B002", lifecycle: "New", productName: "Manual Opener Basic", forecast90d: 320, onTheWay: 15 },
    { sku: "C003", lifecycle: "Mature", productName: "Kitchen Tool Set", forecast90d: 1100, onTheWay: 50 },
    { sku: "D004", lifecycle: "Mature", productName: "Electric Peeler", forecast90d: 380, onTheWay: 10 },
    { sku: "E005", lifecycle: "New", productName: "Smart Opener", forecast90d: 600, onTheWay: 30 },
    { sku: "F006", lifecycle: "Phasing Out", productName: "Classic Knife", forecast90d: 280, onTheWay: 5 },
    { sku: "G007", lifecycle: "Mature", productName: "Food Processor", forecast90d: 750, onTheWay: 40 }
];

let currentExpandedRow = null;
let replenishmentPlans = {};

function getReplenishmentData() {
    const marketplace = document.getElementById('replenMarketplace').value;
    const siteData = window.DataRepo.getSiteSkus(marketplace);
    
    return siteData.map(item => {
        const mockData = replenishmentMockData.find(m => m.sku === item.sku) || {
            lifecycle: "Mature",
            productName: item.sku + " Product",
            forecast90d: Math.floor(Math.random() * 500) + 200,
            onTheWay: Math.floor(Math.random() * 30)
        };
        
        const avgDailySales = item.weeklyAvgSales / 7;
        const currentInventory = item.stock;
        const onTheWay = mockData.onTheWay;
        const daysOfSupply = ((currentInventory + onTheWay) / avgDailySales).toFixed(1);
        
        const targetDays = parseInt(document.getElementById('replenTargetDays').value) || 90;
        const targetInventory = avgDailySales * targetDays;
        const suggestedQty = Math.max(0, Math.ceil(targetInventory - currentInventory - onTheWay));
        
        return {
            sku: item.sku,
            lifecycle: mockData.lifecycle,
            productName: mockData.productName,
            currentInventory: currentInventory,
            avgDailySales: avgDailySales.toFixed(2),
            forecast90d: mockData.forecast90d,
            daysOfSupply: daysOfSupply,
            onTheWay: onTheWay,
            suggestedQty: suggestedQty,
            plannedQty: replenishmentPlans[item.sku] || 0,
            status: suggestedQty > 0 ? "Need Restock" : "Sufficient"
        };
    });
}

function renderReplenishment() {
    const data = getReplenishmentData();
    const fixedBody = document.getElementById('replenFixedBody');
    const scrollBody = document.getElementById('replenScrollBody');
    
    if (!fixedBody || !scrollBody) return;
    
    currentExpandedRow = null;
    
    fixedBody.innerHTML = data.map(item => `
        <div class="replen-fixed-row" data-sku="${item.sku}" onclick="toggleReplenRow('${item.sku}')">
            ${item.sku}
        </div>
    `).join('');
    
    scrollBody.innerHTML = data.map(item => `
        <div class="replen-scroll-row" data-sku="${item.sku}" onclick="toggleReplenRow('${item.sku}')">
            <div class="replen-cell">${item.lifecycle}</div>
            <div class="replen-cell">${item.productName}</div>
            <div class="replen-cell">${item.currentInventory}</div>
            <div class="replen-cell">${item.avgDailySales}</div>
            <div class="replen-cell">${item.forecast90d}</div>
            <div class="replen-cell">${item.daysOfSupply}</div>
            <div class="replen-cell">${item.onTheWay}</div>
            <div class="replen-cell">${item.suggestedQty}</div>
            <div class="replen-cell">
                <input type="number" value="${item.plannedQty}" 
                       onchange="updatePlannedQty('${item.sku}', this.value)"
                       onclick="event.stopPropagation()">
            </div>
            <div class="replen-cell">${item.status}</div>
        </div>
    `).join('');
}

function toggleReplenRow(sku) {
    const fixedRows = document.querySelectorAll('#ops-section .replen-fixed-row');
    const scrollRows = document.querySelectorAll('#ops-section .replen-scroll-row');
    const fixedBody = document.getElementById('replenFixedBody');
    const scrollBody = document.getElementById('replenScrollBody');
    
    const existingPanels = document.querySelectorAll('#ops-section .replen-expand-panel');
    existingPanels.forEach(panel => panel.remove());
    
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
    
    const expandHTML = `
        <div class="replen-expand-fixed">
            <strong>${sku}</strong>
            <div style="margin-top: 8px; font-size: 12px; color: #666;">
                Click row to close
            </div>
        </div>
        <div class="replen-expand-scroll">
            <div class="replen-expand-section">
                <h4>Sales Trend</h4>
                <p>Last 90 days sales chart</p>
                <p style="color: #666; font-size: 14px;">(Chart placeholder)</p>
            </div>
            <div class="replen-expand-section">
                <h4>Forecast Breakdown</h4>
                <p>Base Forecast: ${Math.floor(Math.random() * 300) + 100} units</p>
                <p>Promo Impact: +${Math.floor(Math.random() * 100)} units</p>
                <p><strong>Total: ${Math.floor(Math.random() * 400) + 200} units</strong></p>
            </div>
            <div class="replen-expand-section">
                <h4>Existing Plans</h4>
                <p>No plans created yet</p>
                <button onclick="createPlan('${sku}')" style="margin-top: 8px;">+ Create Plan</button>
            </div>
        </div>
    `;
    
    const expandPanelFixed = document.createElement('div');
    expandPanelFixed.className = 'replen-expand-panel';
    expandPanelFixed.innerHTML = expandHTML;
    
    const expandPanelScroll = document.createElement('div');
    expandPanelScroll.className = 'replen-expand-panel';
    expandPanelScroll.innerHTML = expandHTML;
    
    const rowIndex = Array.from(fixedRows).indexOf(fixedRow);
    if (rowIndex < fixedRows.length - 1) {
        fixedRows[rowIndex + 1].before(expandPanelFixed);
        scrollRows[rowIndex + 1].before(expandPanelScroll);
    } else {
        fixedBody.appendChild(expandPanelFixed);
        scrollBody.appendChild(expandPanelScroll);
    }
}

function updatePlannedQty(sku, qty) {
    replenishmentPlans[sku] = parseInt(qty) || 0;
}

function createPlan(sku) {
    console.log('Create plan for SKU:', sku);
    alert(`Create plan for ${sku} - Stage 1 placeholder`);
}

function submitReplenishmentPlans() {
    const plans = Object.entries(replenishmentPlans)
        .filter(([sku, qty]) => qty > 0)
        .map(([sku, qty]) => ({ sku, qty }));
    
    console.log('=== Replenishment Plans Submitted ===');
    console.log('Country:', document.getElementById('replenCountry').value);
    console.log('Marketplace:', document.getElementById('replenMarketplace').value);
    console.log('Target Days:', document.getElementById('replenTargetDays').value);
    console.log('Plans:', plans);
    console.log('=====================================');
    
    alert(`Submitted ${plans.length} replenishment plans. Check console for details.`);
}

window.renderReplenishment = renderReplenishment;
window.toggleReplenRow = toggleReplenRow;
window.updatePlannedQty = updatePlannedQty;
window.createPlan = createPlan;
window.submitReplenishmentPlans = submitReplenishmentPlans;
