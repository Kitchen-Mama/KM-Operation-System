// Firebase 初始化
import { db } from './firebase-config.js';
import { collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// 區塊切換函式
function showSection(section) {
    document.getElementById('restockSection').style.display = section === 'restock' ? 'block' : 'none';
    document.getElementById('opsSection').style.display = section === 'ops' ? 'block' : 'none';
    document.getElementById('forecastSection').style.display = section === 'forecast' ? 'block' : 'none';
    
    if (section === 'forecast') {
        renderForecastChart();
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

// 渲染紀錄列表 - 從 Firebase 讀取
async function renderRecords() {
    const recordsList = document.getElementById('recordsList');
    try {
        const querySnapshot = await getDocs(collection(db, 'records'));
        const records = [];
        querySnapshot.forEach((doc) => {
            records.push(doc.data());
        });
        // 按時間排序，最新在前
        records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        recordsList.innerHTML = records.map(record => 
            `<li>SKU: ${record.sku}, 目標天數: ${record.targetDays}, 建議補貨量: ${record.recommendQty}, 時間: ${record.created_at}</li>`
        ).join('');
    } catch (error) {
        console.error('讀取紀錄失敗:', error);
        recordsList.innerHTML = '<li>讀取紀錄失敗</li>';
    }
}

// 計算補貨量函式 - 推送到 Firebase
async function calculateRestock() {
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
    
    // 建立紀錄並推送到 Firebase
    const record = {
        sku: sku,
        targetDays: targetDays,
        recommendQty: recommendQty,
        created_at: new Date().toISOString()
    };
    
    try {
        await addDoc(collection(db, 'records'), record);
        console.log('紀錄已推送到 Firebase');
        
        // 重新渲染列表
        await renderRecords();
    } catch (error) {
        console.error('推送紀錄失敗:', error);
        // 降級到本地儲存
        window.DataRepo.saveRecord(record);
        renderRecords();
    }
}

// 暴露函式到全域供 HTML 使用
window.showSection = showSection;
window.clearOpsTable = clearOpsTable;
window.renderOpsView = renderOpsView;
window.showForecast = showForecast;
window.renderForecastChart = renderForecastChart;
window.calculateRestock = calculateRestock;
window.renderRecords = renderRecords;
window.DataRepo = DataRepo;

// 初始化時載入紀錄
window.addEventListener('DOMContentLoaded', () => {
    renderRecords();
});