// 區塊切換函式
function showSection(section) {
    document.getElementById('restockSection').style.display = section === 'restock' ? 'block' : 'none';
    document.getElementById('opsSection').style.display = section === 'ops' ? 'block' : 'none';
}

// 渲染運營管理視圖
function renderOpsView() {
    const selectedSite = document.getElementById('siteSelect').value;
    const tableBody = document.getElementById('opsTableBody');
    
    if (!selectedSite) {
        tableBody.innerHTML = '';
        return;
    }
    
    const siteData = DataRepo.getSiteSkus(selectedSite);
    tableBody.innerHTML = siteData.map(item => {
        const daysOfCover = Math.floor(item.stock / (item.weeklyAvgSales / 7));
        return `
            <tr>
                <td>${item.sku}</td>
                <td>${item.stock}</td>
                <td>${item.weeklyAvgSales}</td>
                <td>${daysOfCover}</td>
            </tr>
        `;
    }).join('');
}

// 渲染紀錄列表
function renderRecords() {
    const recordsList = document.getElementById('recordsList');
    const records = DataRepo.getRecords();
    recordsList.innerHTML = records.map(record => 
        `<li>SKU: ${record.sku}, 目標天數: ${record.targetDays}, 建議補貨量: ${record.recommendQty}, 時間: ${record.createdAt}</li>`
    ).join('');
}

// 計算補貨量函式
function calculateRestock() {
    const targetDays = parseFloat(document.getElementById('targetDays').value);
    const sku = document.getElementById('sku').value;
    const item = DataRepo.getItemBySku(sku);
    const recommendQty = Math.max(0, Math.ceil(item.avgDailySales * targetDays - item.stock));
    
    document.getElementById('result').innerHTML = `
        <p>stock: ${item.stock}</p>
        <p>avgDailySales: ${item.avgDailySales}</p>
        <p>targetDays: ${targetDays}</p>
        <p>recommendQty: ${recommendQty}</p>
    `;
    
    // 建立紀錄並存入
    const record = {
        sku: sku,
        targetDays: targetDays,
        recommendQty: recommendQty,
        createdAt: new Date().toISOString()
    };
    DataRepo.saveRecord(record);
    
    // 重新渲染列表
    renderRecords();
}