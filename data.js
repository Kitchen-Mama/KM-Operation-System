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

// 工廠資料
const factories = ["工廠A", "工廠B"];

// 工廠庫存資料
const factoryInventory = [
    { sku: "A001", factory: "工廠A", stock: 500 },
    { sku: "B002", factory: "工廠A", stock: 300 },
    { sku: "C003", factory: "工廠A", stock: 800 },
    { sku: "A001", factory: "工廠B", stock: 400 },
    { sku: "D004", factory: "工廠B", stock: 250 },
    { sku: "E005", factory: "工廠B", stock: 600 }
];

// 出貨方式資料
const shippingMethods = ["海運", "空運", "陸運"];

// Weekly Shipping Plans 資料 - 從 localStorage 載入
let weeklyShippingPlans = JSON.parse(localStorage.getItem('weeklyShippingPlans')) || [];

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
    },
    
    getFactoryInventory(factory) {
        return factoryInventory.filter(item => item.factory === factory);
    },
    
    getShippingMethods() {
        return shippingMethods;
    },
    
    saveWeeklyShippingPlan(plan) {
        weeklyShippingPlans.unshift(plan);
        localStorage.setItem('weeklyShippingPlans', JSON.stringify(weeklyShippingPlans));
    },
    
    getWeeklyShippingPlans(status) {
        return weeklyShippingPlans.filter(plan => plan.status === status);
    },
    
    updateShippingPlanStatus(planId, newStatus) {
        console.log('Looking for planId:', planId, 'type:', typeof planId);
        console.log('Available plans:', weeklyShippingPlans.map(p => ({id: p.id, type: typeof p.id})));
        
        const plan = weeklyShippingPlans.find(p => p.id == planId);
        if (plan) {
            console.log('Found plan, updating status to:', newStatus);
            plan.status = newStatus;
            localStorage.setItem('weeklyShippingPlans', JSON.stringify(weeklyShippingPlans));
        } else {
            console.log('Plan not found!');
        }
    },
    
    removeShippingPlan(planId) {
        console.log('Removing planId:', planId);
        const index = weeklyShippingPlans.findIndex(p => p.id == planId);
        if (index !== -1) {
            weeklyShippingPlans.splice(index, 1);
            localStorage.setItem('weeklyShippingPlans', JSON.stringify(weeklyShippingPlans));
            console.log('Plan removed successfully');
        } else {
            console.log('Plan not found for removal!');
        }
    },
    
    getSkus() {
        return skus;
    },
    
    getCategories() {
        return categories;
    },
    
    getEvents() {
        return events;
    },
    
    getGoalData() {
        return goalData;
    },
    
    getAnnouncements() {
        return announcements;
    },
    
    getUrgentIssues() {
        return urgentIssues;
    },
    
    getPersonalTodos() {
        return personalTodos;
    },
    
    addPersonalTodo(todo) {
        personalTodos.push({ id: Date.now(), text: todo, createdAt: new Date().toISOString() });
        localStorage.setItem('personalTodos', JSON.stringify(personalTodos));
    }
};

// SKU Details 假資料 - 三個生命週期階段
const upcomingSkuData = [
    {
        sku: "KM-UP-001",
        image: "img1.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Smart Opener Pro",
        category: "Can Opener",
        gs1Code: "0012345678901",
        gs1Type: "UPC",
        amzAsin: "B08XYZ1234",
        itemDimensions: "8x3x2 in",
        itemWeight: "0.5 lbs",
        package: "Box",
        packageWeight: "0.8 lbs",
        cartonDimensions: "20x15x10 in",
        cartonWeight: "15 lbs",
        unitsPerCarton: 24,
        hscode: "8210.00",
        declaredValue: "$12.50",
        minimumPrice: "$19.99",
        msrp: "$29.99",
        sellingPrice: "$24.99",
        pm: "Alice"
    },
    {
        sku: "KM-UP-002",
        image: "img2.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Electric Peeler",
        category: "Kitchen Tools",
        gs1Code: "0012345678902",
        gs1Type: "UPC",
        amzAsin: "B08XYZ5678",
        itemDimensions: "6x4x3 in",
        itemWeight: "0.7 lbs",
        package: "Box",
        packageWeight: "1.0 lbs",
        cartonDimensions: "22x16x12 in",
        cartonWeight: "18 lbs",
        unitsPerCarton: 20,
        hscode: "8210.00",
        declaredValue: "$15.00",
        minimumPrice: "$24.99",
        msrp: "$34.99",
        sellingPrice: "$29.99",
        pm: "Bob"
    }
];

const runningSkuData = [
    {
        sku: "KM-001",
        image: "img3.jpg",
        status: "Active",
        productName: "Kitchen Mama Can Opener Classic",
        category: "Can Opener",
        gs1Code: "0012345678903",
        gs1Type: "UPC",
        amzAsin: "B07ABC1234",
        itemDimensions: "7x3x2 in",
        itemWeight: "0.4 lbs",
        package: "Box",
        packageWeight: "0.7 lbs",
        cartonDimensions: "18x14x10 in",
        cartonWeight: "12 lbs",
        unitsPerCarton: 30,
        hscode: "8210.00",
        declaredValue: "$10.00",
        minimumPrice: "$16.99",
        msrp: "$24.99",
        sellingPrice: "$19.99",
        pm: "Charlie"
    },
    {
        sku: "KM-002",
        image: "img4.jpg",
        status: "Active",
        productName: "Kitchen Mama Food Processor Deluxe",
        category: "Appliances",
        gs1Code: "0012345678904",
        gs1Type: "UPC",
        amzAsin: "B07DEF5678",
        itemDimensions: "10x8x6 in",
        itemWeight: "2.5 lbs",
        package: "Box",
        packageWeight: "3.0 lbs",
        cartonDimensions: "25x20x15 in",
        cartonWeight: "35 lbs",
        unitsPerCarton: 12,
        hscode: "8509.40",
        declaredValue: "$35.00",
        minimumPrice: "$59.99",
        msrp: "$89.99",
        sellingPrice: "$74.99",
        pm: "Diana"
    },
    {
        sku: "KM-003",
        image: "img5.jpg",
        status: "Active",
        productName: "Kitchen Mama Knife Set Premium",
        category: "Kitchen Tools",
        gs1Code: "0012345678905",
        gs1Type: "UPC",
        amzAsin: "B07GHI9012",
        itemDimensions: "12x4x2 in",
        itemWeight: "1.2 lbs",
        package: "Box",
        packageWeight: "1.5 lbs",
        cartonDimensions: "24x18x12 in",
        cartonWeight: "22 lbs",
        unitsPerCarton: 15,
        hscode: "8211.91",
        declaredValue: "$18.00",
        minimumPrice: "$29.99",
        msrp: "$44.99",
        sellingPrice: "$36.99",
        pm: "Eve"
    }
];

const phasingOutSkuData = [
    {
        sku: "KM-OLD-003",
        image: "img6.jpg",
        status: "Phasing Out",
        productName: "Kitchen Mama Classic Cutting Board",
        category: "Kitchen Tools",
        gs1Code: "0012345678906",
        gs1Type: "UPC",
        amzAsin: "B06JKL3456",
        itemDimensions: "14x10x0.5 in",
        itemWeight: "1.8 lbs",
        package: "Wrap",
        packageWeight: "2.0 lbs",
        cartonDimensions: "28x22x8 in",
        cartonWeight: "25 lbs",
        unitsPerCarton: 12,
        hscode: "4419.19",
        declaredValue: "$8.00",
        minimumPrice: "$12.99",
        msrp: "$19.99",
        sellingPrice: "$14.99",
        pm: "Frank"
    }
];

// Stage 1 SKU Details 資料 - 僅允許 sku, productName, category, createdAt
const skus = [
    { sku: "A001", productName: "Can Opener Pro", category: "Can Opener", createdAt: "2024-01-01" },
    { sku: "B002", productName: "Manual Opener Basic", category: "Manual Opener", createdAt: "2024-01-02" },
    { sku: "C003", productName: "Kitchen Tool Set", category: "Kitchen Tools", createdAt: "2024-01-03" }
];

// Categories 陣列
const categories = ["Can Opener", "Manual Opener", "Kitchen Tools"];

// Homepage 資料 - Stage 1
const events = [
    { name: "Black Friday Sale", startDate: "2024-11-29", endDate: "2024-12-02", content: "All products 30% off" },
    { name: "Holiday Campaign", startDate: "2024-12-15", endDate: "2024-12-31", content: "Gift bundle promotion" },
    { name: "New Year Launch", startDate: "2025-01-01", endDate: "2025-01-15", content: "New product series" }
];

const goalData = {
    year: 2026,
    goalAmount: 5000000,
    salesAmount: 4200000
};

// Homepage Row 2 資料 - Stage 1
const announcements = [
    { title: "Q4 銷售目標更新", time: "2024-12-20 14:30" },
    { title: "新產品上市時程", time: "2024-12-19 09:15" },
    { title: "年終庫存盤點通知", time: "2024-12-18 16:45" }
];

const urgentIssues = [
    { title: "Amazon 庫存不足警告", severity: "high" },
    { title: "Shopify 系統異常", severity: "medium" },
    { title: "運輸延遲通知", severity: "low" }
];

// 個人提醒代辦 - 使用 localStorage
let personalTodos = JSON.parse(localStorage.getItem('personalTodos')) || [];

// 保留舊函式以維持相容性
function findItemBySku(sku) {
    return DataRepo.getItemBySku(sku);
}

// 暴露 DataRepo 到全域
window.DataRepo = DataRepo;