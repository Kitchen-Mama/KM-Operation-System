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
    { site: "amazon", sku: "A001", stock: 150, weeklyAvgSales: 5 },
    { site: "amazon", sku: "B002", stock: 80, weeklyAvgSales: 21 },
    { site: "amazon", sku: "C003", stock: 200, weeklyAvgSales: 70 },
    { site: "shopify", sku: "A001", stock: 120, weeklyAvgSales: 28 },
    { site: "shopify", sku: "D004", stock: 60, weeklyAvgSales: 14 },
    { site: "shopify", sku: "E005", stock: 90, weeklyAvgSales: 42 },
    { site: "target", sku: "B002", stock: 100, weeklyAvgSales: 35 },
    { site: "target", sku: "F006", stock: 75, weeklyAvgSales: 21 },
    { site: "target", sku: "G007", stock: 180, weeklyAvgSales: 56 }
];

// Forecast 資料
const forecastData = [
    // 12月資料
    { site: "amazon", productType: "Can Opener", actualSales: 1250, forecastSales: 1200, createdAt: "2024-12-01" },
    { site: "amazon", productType: "Manual Opener", actualSales: 850, forecastSales: 900, createdAt: "2024-12-01" },
    { site: "amazon", productType: "Kitchen Tools", actualSales: 2100, forecastSales: 2000, createdAt: "2024-12-01" },
    { site: "shopify", productType: "Can Opener", actualSales: 980, forecastSales: 1000, createdAt: "2024-12-01" },
    { site: "shopify", productType: "Manual Opener", actualSales: 650, forecastSales: 700, createdAt: "2024-12-01" },
    { site: "shopify", productType: "Kitchen Tools", actualSales: 1800, forecastSales: 1750, createdAt: "2024-12-01" },
    { site: "target", productType: "Can Opener", actualSales: 1100, forecastSales: 1150, createdAt: "2024-12-01" },
    { site: "target", productType: "Manual Opener", actualSales: 750, forecastSales: 800, createdAt: "2024-12-01" },
    { site: "target", productType: "Kitchen Tools", actualSales: 1950, forecastSales: 1900, createdAt: "2024-12-01" },
    
    // 11月資料
    { site: "amazon", productType: "Can Opener", actualSales: 1180, forecastSales: 1150, createdAt: "2024-11-01" },
    { site: "amazon", productType: "Manual Opener", actualSales: 920, forecastSales: 880, createdAt: "2024-11-01" },
    { site: "amazon", productType: "Kitchen Tools", actualSales: 1950, forecastSales: 2050, createdAt: "2024-11-01" },
    { site: "shopify", productType: "Can Opener", actualSales: 890, forecastSales: 950, createdAt: "2024-11-01" },
    { site: "shopify", productType: "Manual Opener", actualSales: 720, forecastSales: 680, createdAt: "2024-11-01" },
    { site: "shopify", productType: "Kitchen Tools", actualSales: 1650, forecastSales: 1700, createdAt: "2024-11-01" },
    { site: "target", productType: "Can Opener", actualSales: 1050, forecastSales: 1100, createdAt: "2024-11-01" },
    { site: "target", productType: "Manual Opener", actualSales: 680, forecastSales: 720, createdAt: "2024-11-01" },
    { site: "target", productType: "Kitchen Tools", actualSales: 1850, forecastSales: 1800, createdAt: "2024-11-01" },
    
    // 10月資料
    { site: "amazon", productType: "Can Opener", actualSales: 1320, forecastSales: 1280, createdAt: "2024-10-01" },
    { site: "amazon", productType: "Manual Opener", actualSales: 780, forecastSales: 820, createdAt: "2024-10-01" },
    { site: "amazon", productType: "Kitchen Tools", actualSales: 2250, forecastSales: 2200, createdAt: "2024-10-01" },
    { site: "shopify", productType: "Can Opener", actualSales: 1020, forecastSales: 980, createdAt: "2024-10-01" },
    { site: "shopify", productType: "Manual Opener", actualSales: 590, forecastSales: 630, createdAt: "2024-10-01" },
    { site: "shopify", productType: "Kitchen Tools", actualSales: 1920, forecastSales: 1880, createdAt: "2024-10-01" },
    { site: "target", productType: "Can Opener", actualSales: 1200, forecastSales: 1180, createdAt: "2024-10-01" },
    { site: "target", productType: "Manual Opener", actualSales: 820, forecastSales: 780, createdAt: "2024-10-01" },
    { site: "target", productType: "Kitchen Tools", actualSales: 2050, forecastSales: 2100, createdAt: "2024-10-01" }
];

// 月度 Forecast 資料（12 個月）
const forecastMonthly = [
    { month: "2024-01", actualSales: 15000, forecastSales: 14500, createdAt: "2024-01-31" },
    { month: "2024-02", actualSales: 16200, forecastSales: 15800, createdAt: "2024-02-29" },
    { month: "2024-03", actualSales: 17500, forecastSales: 17200, createdAt: "2024-03-31" },
    { month: "2024-04", actualSales: 16800, forecastSales: 17500, createdAt: "2024-04-30" },
    { month: "2024-05", actualSales: 18200, forecastSales: 18000, createdAt: "2024-05-31" },
    { month: "2024-06", actualSales: 19500, forecastSales: 19200, createdAt: "2024-06-30" },
    { month: "2024-07", actualSales: 20100, forecastSales: 19800, createdAt: "2024-07-31" },
    { month: "2024-08", actualSales: 19800, forecastSales: 20500, createdAt: "2024-08-31" },
    { month: "2024-09", actualSales: 21200, forecastSales: 20800, createdAt: "2024-09-30" },
    { month: "2024-10", actualSales: 22500, forecastSales: 22000, createdAt: "2024-10-31" },
    { month: "2024-11", actualSales: 21800, forecastSales: 22500, createdAt: "2024-11-30" },
    { month: "2024-12", actualSales: 23000, forecastSales: 22800, createdAt: "2024-12-31" }
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
    },
    
    getForecastData(site, productType) {
        return forecastData.find(item => item.site === site && item.productType === productType);
    },
    
    getForecastDataByMonth(site, productType, yearMonth) {
        return forecastData.find(item => 
            item.site === site && 
            item.productType === productType && 
            item.createdAt.startsWith(yearMonth)
        );
    },
    
    getForecastMonthly() {
        return forecastMonthly;
    }
};

// 保留舊函式以維持相容性
function findItemBySku(sku) {
    return DataRepo.getItemBySku(sku);
}

// 暴露 DataRepo 到全域
window.DataRepo = DataRepo;