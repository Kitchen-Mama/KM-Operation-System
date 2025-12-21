// 本地測試資料
const items = [
    {
        sku: "A001",
        stock: 50,
        avgDailySales: 5.2,
        createdAt: "2024-01-01"
    },
    {
        sku: "B002", 
        stock: 30,
        avgDailySales: 3.8,
        createdAt: "2024-01-02"
    },
    {
        sku: "C003",
        stock: 100,
        avgDailySales: 12.5,
        createdAt: "2024-01-03"
    }
];

// 試算紀錄陣列
const records = [];

// 站點 SKU 資料
const siteSkus = [
    { site: "amazon", sku: "A001", stock: 150, weeklyAvgSales: 35 },
    { site: "amazon", sku: "B002", stock: 80, weeklyAvgSales: 21 },
    { site: "amazon", sku: "C003", stock: 200, weeklyAvgSales: 70 },
    { site: "shopify", sku: "A001", stock: 120, weeklyAvgSales: 28 },
    { site: "shopify", sku: "D004", stock: 60, weeklyAvgSales: 14 },
    { site: "shopify", sku: "E005", stock: 90, weeklyAvgSales: 42 },
    { site: "target", sku: "B002", stock: 100, weeklyAvgSales: 35 },
    { site: "target", sku: "F006", stock: 75, weeklyAvgSales: 21 },
    { site: "target", sku: "G007", stock: 180, weeklyAvgSales: 56 }
];

// 資料存取物件
const DataRepo = {
    getItemBySku(sku) {
        const item = items.find(item => item.sku === sku);
        return item || null;
    },
    
    saveRecord(record) {
        records.unshift(record);
    },
    
    getRecords() {
        return records;
    },
    
    getSiteSkus(site) {
        return siteSkus.filter(item => item.site === site);
    }
};

// 保留舊函式以維持相容性
function findItemBySku(sku) {
    return DataRepo.getItemBySku(sku);
}