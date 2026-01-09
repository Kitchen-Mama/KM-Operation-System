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
    document.querySelectorAll('.module-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
}

// 區塊切換函式
function showSection(section) {
    // 隱藏所有區塊
    document.getElementById('home-section').style.display = 'none';
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
        renderSkuDetails();
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
    initWorldTimes(); // 初始化世界時間
    renderHomepage(); // 初始化 Homepage
});