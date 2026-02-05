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
    { site: "amazon", sku: "A001", stock: 150, weeklyAvgSales: 35 },
    { site: "amazon", sku: "B002", stock: 80, weeklyAvgSales: 21 },
    { site: "amazon", sku: "C003", stock: 200, weeklyAvgSales: 70 },
    { site: "amazon", sku: "D004", stock: 120, weeklyAvgSales: 28 },
    { site: "amazon", sku: "E005", stock: 95, weeklyAvgSales: 42 },
    { site: "amazon", sku: "F006", stock: 60, weeklyAvgSales: 14 },
    { site: "amazon", sku: "G007", stock: 180, weeklyAvgSales: 56 },
    { site: "amazon", sku: "H008", stock: 110, weeklyAvgSales: 35 },
    { site: "amazon", sku: "I009", stock: 140, weeklyAvgSales: 49 },
    { site: "amazon", sku: "J010", stock: 85, weeklyAvgSales: 28 },
    { site: "amazon", sku: "K011", stock: 70, weeklyAvgSales: 21 },
    { site: "amazon", sku: "L012", stock: 45, weeklyAvgSales: 14 },
    { site: "amazon", sku: "M013", stock: 130, weeklyAvgSales: 42 },
    { site: "amazon", sku: "N014", stock: 90, weeklyAvgSales: 28 },
    { site: "amazon", sku: "O015", stock: 160, weeklyAvgSales: 56 },
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
// SKU to Series mapping
function getSkuSeriesMap() {
    const map = {};
    [...upcomingSkuData, ...runningSkuData, ...phasingOutSkuData].forEach(item => {
        if (item.sku && item.series) {
            map[item.sku] = item.series;
        }
    });
    return map;
}

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
    },
    
    getSkuCategory(sku) {
        const allSkus = [...upcomingSkuData, ...runningSkuData, ...phasingOutSkuData];
        const skuInfo = allSkus.find(item => item.sku === sku);
        return skuInfo ? skuInfo.category : null;
    },
    
    getForecastReviewData(filters = {}) {
        let data = forecastReviewData.map(item => ({
            ...item,
            category: this.getSkuCategory(item.sku)
        }));
        
        // Filter by date range
        if (filters.startDate && filters.endDate) {
            data = data.filter(item => {
                const itemDate = parseDate(item.date);
                const start = new Date(filters.startDate);
                const end = new Date(filters.endDate);
                return itemDate >= start && itemDate <= end;
            });
        }
        
        // Filter by countries (array)
        if (filters.countries && filters.countries.length > 0) {
            data = data.filter(item => filters.countries.includes(item.marketplace));
        }
        
        // Filter by marketplaces (array)
        if (filters.marketplaces && filters.marketplaces.length > 0) {
            data = data.filter(item => filters.marketplaces.some(mp => item.channel.toLowerCase() === mp.toLowerCase()));
        }
        
        // Filter by categories (array)
        if (filters.categories && filters.categories.length > 0) {
            data = data.filter(item => filters.categories.includes(item.category));
        }
        
        // Filter by series (array) - use SKU Details mapping
        if (filters.series && filters.series.length > 0) {
            const skuSeriesMap = getSkuSeriesMap();
            data = data.filter(item => {
                const itemSeries = skuSeriesMap[item.sku];
                return itemSeries && filters.series.includes(itemSeries);
            });
        }
        
        // Filter by SKU
        if (filters.sku) {
            data = data.filter(item => item.sku.toLowerCase().includes(filters.sku.toLowerCase()));
        }
        
        return data;
    },
    
    getForecastReviewDataLastYear(filters = {}) {
        let data = forecastReviewDataLastYear.map(item => ({
            ...item,
            category: this.getSkuCategory(item.sku)
        }));
        
        // Filter by countries (array)
        if (filters.countries && filters.countries.length > 0) {
            data = data.filter(item => filters.countries.includes(item.marketplace));
        }
        
        // Filter by marketplaces (array)
        if (filters.marketplaces && filters.marketplaces.length > 0) {
            data = data.filter(item => filters.marketplaces.some(mp => item.channel.toLowerCase() === mp.toLowerCase()));
        }
        
        // Filter by categories (array)
        if (filters.categories && filters.categories.length > 0) {
            data = data.filter(item => filters.categories.includes(item.category));
        }
        
        // Filter by series (array) - use SKU Details mapping
        if (filters.series && filters.series.length > 0) {
            const skuSeriesMap = getSkuSeriesMap();
            data = data.filter(item => {
                const itemSeries = skuSeriesMap[item.sku];
                return itemSeries && filters.series.includes(itemSeries);
            });
        }
        
        // Filter by SKU
        if (filters.sku) {
            data = data.filter(item => item.sku.toLowerCase().includes(filters.sku.toLowerCase()));
        }
        
        return data;
    },
    
    getForecastReviewSummary(filters = {}) {
        const data = this.getForecastReviewData(filters);
        const lastYearData = this.getForecastReviewDataLastYear(filters);
        
        const totalSalesUnits = data.reduce((sum, item) => sum + item.salesUnits, 0);
        const totalSalesAmount = data.reduce((sum, item) => sum + item.salesAmount, 0);
        const totalSessions = data.reduce((sum, item) => sum + item.session, 0);
        
        const lastYearSalesUnits = lastYearData.reduce((sum, item) => sum + item.salesUnits, 0);
        const lastYearSalesAmount = lastYearData.reduce((sum, item) => sum + item.salesAmount, 0);
        const lastYearSessions = lastYearData.reduce((sum, item) => sum + item.session, 0);
        
        return {
            totalSalesUnits,
            totalSalesAmount,
            totalSessions,
            avgUnitSessionPercentage: data.length > 0 ? data.reduce((sum, item) => sum + item.unitSessionPercentage, 0) / data.length : 0,
            avgBuyBoxPercentage: data.length > 0 ? data.reduce((sum, item) => sum + item.buyBoxPercentage, 0) / data.length : 0,
            totalPageViews: data.reduce((sum, item) => sum + item.pageView, 0),
            lastYearSalesUnits,
            lastYearSalesAmount,
            lastYearSessions
        };
    }
};

// SKU Details 假資料 - 三個生命週期階段
const upcomingSkuData = [
    {
        sku: "KM-UP-001",
        image: "img1.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Smart Opener Pro",
        series: "CO1100",
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
        unitsPerCarton: 50,
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
        series: "EP2200",
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
        unitsPerCarton: 40,
        hscode: "8210.00",
        declaredValue: "$15.00",
        minimumPrice: "$24.99",
        msrp: "$34.99",
        sellingPrice: "$29.99",
        pm: "Bob"
    },
    {
        sku: "KM-UP-003",
        image: "img3.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Blender Max",
        series: "BL3300",
        category: "Appliances",
        gs1Code: "0012345678903",
        gs1Type: "UPC",
        amzAsin: "B08XYZ9012",
        itemDimensions: "9x5x4 in",
        itemWeight: "1.2 lbs",
        package: "Box",
        packageWeight: "1.5 lbs",
        cartonDimensions: "24x18x14 in",
        cartonWeight: "20 lbs",
        unitsPerCarton: 30,
        hscode: "8509.40",
        declaredValue: "$22.00",
        minimumPrice: "$34.99",
        msrp: "$49.99",
        sellingPrice: "$39.99",
        pm: "Charlie"
    },
    {
        sku: "KM-UP-004",
        image: "img4.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Grater Pro",
        series: "GR4400",
        category: "Kitchen Tools",
        gs1Code: "0012345678904",
        gs1Type: "UPC",
        amzAsin: "B08XYZ3456",
        itemDimensions: "7x4x2 in",
        itemWeight: "0.6 lbs",
        package: "Box",
        packageWeight: "0.9 lbs",
        cartonDimensions: "21x16x11 in",
        cartonWeight: "16 lbs",
        unitsPerCarton: 20,
        hscode: "8210.00",
        declaredValue: "$11.00",
        minimumPrice: "$17.99",
        msrp: "$26.99",
        sellingPrice: "$21.99",
        pm: "Diana"
    },
    {
        sku: "KM-UP-005",
        image: "img5.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Measuring Set",
        series: "MS5500",
        category: "Kitchen Tools",
        gs1Code: "0012345678905",
        gs1Type: "UPC",
        amzAsin: "B08XYZ7890",
        itemDimensions: "5x3x2 in",
        itemWeight: "0.3 lbs",
        package: "Box",
        packageWeight: "0.5 lbs",
        cartonDimensions: "18x14x10 in",
        cartonWeight: "12 lbs",
        unitsPerCarton: 30,
        hscode: "7323.93",
        declaredValue: "$8.00",
        minimumPrice: "$12.99",
        msrp: "$19.99",
        sellingPrice: "$14.99",
        pm: "Eve"
    },
    {
        sku: "KM-UP-006",
        image: "img6.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Spatula Set",
        series: "SP6600",
        category: "Kitchen Tools",
        gs1Code: "0012345678906",
        gs1Type: "UPC",
        amzAsin: "B08XYZ2345",
        itemDimensions: "10x2x1 in",
        itemWeight: "0.4 lbs",
        package: "Box",
        packageWeight: "0.6 lbs",
        cartonDimensions: "22x12x8 in",
        cartonWeight: "14 lbs",
        unitsPerCarton: 25,
        hscode: "3924.10",
        declaredValue: "$7.00",
        minimumPrice: "$11.99",
        msrp: "$17.99",
        sellingPrice: "$13.99",
        pm: "Frank"
    },
    {
        sku: "KM-UP-007",
        image: "img7.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Mixing Bowl Set",
        series: "MB7700",
        category: "Kitchen Tools",
        gs1Code: "0012345678907",
        gs1Type: "UPC",
        amzAsin: "B08XYZ6789",
        itemDimensions: "12x12x6 in",
        itemWeight: "2.0 lbs",
        package: "Box",
        packageWeight: "2.5 lbs",
        cartonDimensions: "26x20x14 in",
        cartonWeight: "28 lbs",
        unitsPerCarton: 12,
        hscode: "6912.00",
        declaredValue: "$16.00",
        minimumPrice: "$24.99",
        msrp: "$36.99",
        sellingPrice: "$29.99",
        pm: "Grace"
    },
    {
        sku: "KM-UP-008",
        image: "img8.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Air Fryer",
        series: "AF8800",
        category: "Appliances",
        gs1Code: "0012345678908",
        gs1Type: "UPC",
        amzAsin: "B08XYZ1111",
        itemDimensions: "14x12x13 in",
        itemWeight: "8.5 lbs",
        package: "Box",
        packageWeight: "9.5 lbs",
        cartonDimensions: "30x26x28 in",
        cartonWeight: "40 lbs",
        unitsPerCarton: 4,
        hscode: "8516.60",
        declaredValue: "$45.00",
        minimumPrice: "$69.99",
        msrp: "$99.99",
        sellingPrice: "$79.99",
        pm: "Helen"
    },
    {
        sku: "KM-UP-009",
        image: "img9.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Spice Rack",
        series: "SR9900",
        category: "Kitchen Tools",
        gs1Code: "0012345678909",
        gs1Type: "UPC",
        amzAsin: "B08XYZ2222",
        itemDimensions: "16x4x10 in",
        itemWeight: "3.2 lbs",
        package: "Box",
        packageWeight: "3.8 lbs",
        cartonDimensions: "34x20x22 in",
        cartonWeight: "32 lbs",
        unitsPerCarton: 8,
        hscode: "7323.99",
        declaredValue: "$18.00",
        minimumPrice: "$27.99",
        msrp: "$39.99",
        sellingPrice: "$32.99",
        pm: "Ian"
    },
    {
        sku: "KM-UP-010",
        image: "img10.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Pressure Cooker",
        series: "PC1000",
        category: "Appliances",
        gs1Code: "0012345678910",
        gs1Type: "UPC",
        amzAsin: "B08XYZ3333",
        itemDimensions: "13x13x14 in",
        itemWeight: "10.0 lbs",
        package: "Box",
        packageWeight: "11.5 lbs",
        cartonDimensions: "28x28x30 in",
        cartonWeight: "48 lbs",
        unitsPerCarton: 4,
        hscode: "7323.94",
        declaredValue: "$55.00",
        minimumPrice: "$84.99",
        msrp: "$119.99",
        sellingPrice: "$99.99",
        pm: "Julia"
    },
    {
        sku: "KM-UP-011",
        image: "img11.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Silicone Baking Mat",
        series: "BM1100",
        category: "Kitchen Tools",
        gs1Code: "0012345678911",
        gs1Type: "UPC",
        amzAsin: "B08XYZ4444",
        itemDimensions: "16x12x0.1 in",
        itemWeight: "0.4 lbs",
        package: "Wrap",
        packageWeight: "0.6 lbs",
        cartonDimensions: "34x26x4 in",
        cartonWeight: "15 lbs",
        unitsPerCarton: 25,
        hscode: "3924.10",
        declaredValue: "$5.00",
        minimumPrice: "$8.99",
        msrp: "$13.99",
        sellingPrice: "$10.99",
        pm: "Kevin"
    },
    {
        sku: "KM-UP-012",
        image: "img12.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Coffee Maker",
        series: "CM1200",
        category: "Appliances",
        gs1Code: "0012345678912",
        gs1Type: "UPC",
        amzAsin: "B08XYZ5555",
        itemDimensions: "10x8x12 in",
        itemWeight: "4.5 lbs",
        package: "Box",
        packageWeight: "5.2 lbs",
        cartonDimensions: "22x18x26 in",
        cartonWeight: "32 lbs",
        unitsPerCarton: 6,
        hscode: "8516.71",
        declaredValue: "$32.00",
        minimumPrice: "$49.99",
        msrp: "$69.99",
        sellingPrice: "$59.99",
        pm: "Linda"
    },
    {
        sku: "KM-UP-013",
        image: "img13.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Garlic Press",
        series: "GP1300",
        category: "Kitchen Tools",
        gs1Code: "0012345678913",
        gs1Type: "UPC",
        amzAsin: "B08XYZ6666",
        itemDimensions: "6x3x2 in",
        itemWeight: "0.5 lbs",
        package: "Box",
        packageWeight: "0.7 lbs",
        cartonDimensions: "20x16x12 in",
        cartonWeight: "16 lbs",
        unitsPerCarton: 24,
        hscode: "8210.00",
        declaredValue: "$8.00",
        minimumPrice: "$12.99",
        msrp: "$18.99",
        sellingPrice: "$14.99",
        pm: "Mark"
    },
    {
        sku: "KM-UP-014",
        image: "img14.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Toaster",
        series: "TO1400",
        category: "Appliances",
        gs1Code: "0012345678914",
        gs1Type: "UPC",
        amzAsin: "B08XYZ7777",
        itemDimensions: "11x7x8 in",
        itemWeight: "3.8 lbs",
        package: "Box",
        packageWeight: "4.5 lbs",
        cartonDimensions: "24x16x18 in",
        cartonWeight: "28 lbs",
        unitsPerCarton: 6,
        hscode: "8516.72",
        declaredValue: "$28.00",
        minimumPrice: "$42.99",
        msrp: "$59.99",
        sellingPrice: "$49.99",
        pm: "Nancy"
    },
    {
        sku: "KM-UP-015",
        image: "img15.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Vegetable Chopper",
        series: "VC1500",
        category: "Kitchen Tools",
        gs1Code: "0012345678915",
        gs1Type: "UPC",
        amzAsin: "B08XYZ8888",
        itemDimensions: "9x6x4 in",
        itemWeight: "1.2 lbs",
        package: "Box",
        packageWeight: "1.6 lbs",
        cartonDimensions: "20x14x10 in",
        cartonWeight: "20 lbs",
        unitsPerCarton: 12,
        hscode: "8210.00",
        declaredValue: "$14.00",
        minimumPrice: "$21.99",
        msrp: "$31.99",
        sellingPrice: "$25.99",
        pm: "Oliver"
    },
    {
        sku: "KM-UP-016",
        image: "img16.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Kettle Electric",
        series: "KE1600",
        category: "Appliances",
        gs1Code: "0012345678916",
        gs1Type: "UPC",
        amzAsin: "B08XYZ9999",
        itemDimensions: "9x7x10 in",
        itemWeight: "2.8 lbs",
        package: "Box",
        packageWeight: "3.4 lbs",
        cartonDimensions: "20x16x22 in",
        cartonWeight: "22 lbs",
        unitsPerCarton: 6,
        hscode: "8516.79",
        declaredValue: "$22.00",
        minimumPrice: "$33.99",
        msrp: "$47.99",
        sellingPrice: "$39.99",
        pm: "Paula"
    },
    {
        sku: "KM-UP-017",
        image: "img17.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Salad Spinner",
        series: "SS1700",
        category: "Kitchen Tools",
        gs1Code: "0012345678917",
        gs1Type: "UPC",
        amzAsin: "B08XYZ0000",
        itemDimensions: "10x10x7 in",
        itemWeight: "1.5 lbs",
        package: "Box",
        packageWeight: "1.9 lbs",
        cartonDimensions: "22x22x16 in",
        cartonWeight: "24 lbs",
        unitsPerCarton: 12,
        hscode: "7323.93",
        declaredValue: "$12.00",
        minimumPrice: "$18.99",
        msrp: "$27.99",
        sellingPrice: "$22.99",
        pm: "Quinn"
    },
    {
        sku: "KM-UP-018",
        image: "img18.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Microwave",
        series: "MW1800",
        category: "Appliances",
        gs1Code: "0012345678918",
        gs1Type: "UPC",
        amzAsin: "B08XYZ1010",
        itemDimensions: "20x16x12 in",
        itemWeight: "28.0 lbs",
        package: "Box",
        packageWeight: "30.0 lbs",
        cartonDimensions: "24x20x16 in",
        cartonWeight: "32 lbs",
        unitsPerCarton: 1,
        hscode: "8516.50",
        declaredValue: "$85.00",
        minimumPrice: "$129.99",
        msrp: "$179.99",
        sellingPrice: "$149.99",
        pm: "Rachel"
    },
    {
        sku: "KM-UP-019",
        image: "img19.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Dish Rack",
        series: "DR1900",
        category: "Kitchen Tools",
        gs1Code: "0012345678919",
        gs1Type: "UPC",
        amzAsin: "B08XYZ2020",
        itemDimensions: "18x13x6 in",
        itemWeight: "2.5 lbs",
        package: "Box",
        packageWeight: "3.0 lbs",
        cartonDimensions: "38x28x14 in",
        cartonWeight: "26 lbs",
        unitsPerCarton: 8,
        hscode: "7323.99",
        declaredValue: "$16.00",
        minimumPrice: "$24.99",
        msrp: "$36.99",
        sellingPrice: "$29.99",
        pm: "Steve"
    },
    {
        sku: "KM-UP-020",
        image: "img20.jpg",
        status: "Upcoming",
        productName: "Kitchen Mama Slow Cooker",
        series: "SC2000",
        category: "Appliances",
        gs1Code: "0012345678920",
        gs1Type: "UPC",
        amzAsin: "B08XYZ3030",
        itemDimensions: "14x11x10 in",
        itemWeight: "7.5 lbs",
        package: "Box",
        packageWeight: "8.5 lbs",
        cartonDimensions: "30x24x22 in",
        cartonWeight: "36 lbs",
        unitsPerCarton: 4,
        hscode: "8516.60",
        declaredValue: "$38.00",
        minimumPrice: "$57.99",
        msrp: "$79.99",
        sellingPrice: "$67.99",
        pm: "Tina"
    }
];

const runningSkuData = [
    {
        sku: "KM-001",
        image: "img3.jpg",
        status: "Active",
        productName: "Kitchen Mama Can Opener Classic",
        series: "CO1100",
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
        unitsPerCarton: 50,
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
        series: "FP2200",
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
        unitsPerCarton: 30,
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
        series: "KS3300",
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
        unitsPerCarton: 40,
        hscode: "8211.91",
        declaredValue: "$18.00",
        minimumPrice: "$29.99",
        msrp: "$44.99",
        sellingPrice: "$36.99",
        pm: "Eve"
    },
    {
        sku: "KM-004",
        image: "img8.jpg",
        status: "Active",
        productName: "Kitchen Mama Whisk Set",
        series: "WS4400",
        category: "Kitchen Tools",
        gs1Code: "0012345678908",
        gs1Type: "UPC",
        amzAsin: "B07JKL3456",
        itemDimensions: "11x3x2 in",
        itemWeight: "0.5 lbs",
        package: "Box",
        packageWeight: "0.8 lbs",
        cartonDimensions: "23x15x11 in",
        cartonWeight: "17 lbs",
        unitsPerCarton: 24,
        hscode: "8210.00",
        declaredValue: "$9.00",
        minimumPrice: "$14.99",
        msrp: "$22.99",
        sellingPrice: "$17.99",
        pm: "Henry"
    },
    {
        sku: "KM-005",
        image: "img9.jpg",
        status: "Active",
        productName: "Kitchen Mama Cutting Mat",
        series: "CM5500",
        category: "Kitchen Tools",
        gs1Code: "0012345678909",
        gs1Type: "UPC",
        amzAsin: "B07MNO7890",
        itemDimensions: "15x11x0.2 in",
        itemWeight: "0.8 lbs",
        package: "Wrap",
        packageWeight: "1.0 lbs",
        cartonDimensions: "30x24x6 in",
        cartonWeight: "20 lbs",
        unitsPerCarton: 20,
        hscode: "3924.10",
        declaredValue: "$6.00",
        minimumPrice: "$9.99",
        msrp: "$14.99",
        sellingPrice: "$11.99",
        pm: "Iris"
    },
    {
        sku: "KM-006",
        image: "img10.jpg",
        status: "Active",
        productName: "Kitchen Mama Colander",
        series: "CL6600",
        category: "Kitchen Tools",
        gs1Code: "0012345678910",
        gs1Type: "UPC",
        amzAsin: "B07PQR1234",
        itemDimensions: "10x10x5 in",
        itemWeight: "1.0 lbs",
        package: "Box",
        packageWeight: "1.3 lbs",
        cartonDimensions: "22x18x12 in",
        cartonWeight: "18 lbs",
        unitsPerCarton: 15,
        hscode: "7323.93",
        declaredValue: "$10.00",
        minimumPrice: "$15.99",
        msrp: "$23.99",
        sellingPrice: "$18.99",
        pm: "Jack"
    },
    {
        sku: "KM-007",
        image: "img11.jpg",
        status: "Active",
        productName: "Kitchen Mama Timer Digital",
        series: "TD7700",
        category: "Appliances",
        gs1Code: "0012345678911",
        gs1Type: "UPC",
        amzAsin: "B07STU5678",
        itemDimensions: "3x3x1 in",
        itemWeight: "0.2 lbs",
        package: "Box",
        packageWeight: "0.4 lbs",
        cartonDimensions: "16x12x8 in",
        cartonWeight: "10 lbs",
        unitsPerCarton: 30,
        hscode: "9104.00",
        declaredValue: "$5.00",
        minimumPrice: "$8.99",
        msrp: "$13.99",
        sellingPrice: "$10.99",
        pm: "Kate"
    }
];

const phasingOutSkuData = [
    {
        sku: "KM-OLD-001",
        image: "img12.jpg",
        status: "Phasing Out",
        productName: "Kitchen Mama Classic Cutting Board",
        series: "CB0100",
        category: "Kitchen Tools",
        gs1Code: "0012345678912",
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
    },
    {
        sku: "KM-OLD-002",
        image: "img13.jpg",
        status: "Phasing Out",
        productName: "Kitchen Mama Basic Peeler",
        series: "BP0200",
        category: "Kitchen Tools",
        gs1Code: "0012345678913",
        gs1Type: "UPC",
        amzAsin: "B06MNO7890",
        itemDimensions: "6x2x1 in",
        itemWeight: "0.2 lbs",
        package: "Blister",
        packageWeight: "0.3 lbs",
        cartonDimensions: "20x15x8 in",
        cartonWeight: "8 lbs",
        unitsPerCarton: 30,
        hscode: "8210.00",
        declaredValue: "$3.00",
        minimumPrice: "$5.99",
        msrp: "$8.99",
        sellingPrice: "$6.99",
        pm: "Laura"
    },
    {
        sku: "KM-OLD-003",
        image: "img14.jpg",
        status: "Phasing Out",
        productName: "Kitchen Mama Old Opener",
        series: "CO1100",
        category: "Can Opener",
        gs1Code: "0012345678914",
        gs1Type: "UPC",
        amzAsin: "B06PQR1234",
        itemDimensions: "7x3x2 in",
        itemWeight: "0.4 lbs",
        package: "Box",
        packageWeight: "0.6 lbs",
        cartonDimensions: "18x14x10 in",
        cartonWeight: "13 lbs",
        unitsPerCarton: 25,
        hscode: "8210.00",
        declaredValue: "$7.00",
        minimumPrice: "$11.99",
        msrp: "$17.99",
        sellingPrice: "$13.99",
        pm: "Mike"
    },
    {
        sku: "KM-OLD-004",
        image: "img15.jpg",
        status: "Phasing Out",
        productName: "Kitchen Mama Simple Grater",
        series: "SG0400",
        category: "Kitchen Tools",
        gs1Code: "0012345678915",
        gs1Type: "UPC",
        amzAsin: "B06STU5678",
        itemDimensions: "8x3x1 in",
        itemWeight: "0.3 lbs",
        package: "Box",
        packageWeight: "0.5 lbs",
        cartonDimensions: "19x14x9 in",
        cartonWeight: "11 lbs",
        unitsPerCarton: 25,
        hscode: "8210.00",
        declaredValue: "$4.00",
        minimumPrice: "$7.99",
        msrp: "$11.99",
        sellingPrice: "$8.99",
        pm: "Nancy"
    },
    {
        sku: "KM-OLD-005",
        image: "img16.jpg",
        status: "Phasing Out",
        productName: "Kitchen Mama Basic Tongs",
        series: "BT0500",
        category: "Kitchen Tools",
        gs1Code: "0012345678916",
        gs1Type: "UPC",
        amzAsin: "B06VWX9012",
        itemDimensions: "9x2x1 in",
        itemWeight: "0.3 lbs",
        package: "Box",
        packageWeight: "0.5 lbs",
        cartonDimensions: "20x14x9 in",
        cartonWeight: "12 lbs",
        unitsPerCarton: 28,
        hscode: "8215.99",
        declaredValue: "$4.00",
        minimumPrice: "$6.99",
        msrp: "$10.99",
        sellingPrice: "$7.99",
        pm: "Oscar"
    },
    {
        sku: "KM-OLD-006",
        image: "img17.jpg",
        status: "Phasing Out",
        productName: "Kitchen Mama Old Ladle",
        series: "OL0600",
        category: "Kitchen Tools",
        gs1Code: "0012345678917",
        gs1Type: "UPC",
        amzAsin: "B06YZA3456",
        itemDimensions: "12x4x2 in",
        itemWeight: "0.4 lbs",
        package: "Box",
        packageWeight: "0.6 lbs",
        cartonDimensions: "24x16x10 in",
        cartonWeight: "14 lbs",
        unitsPerCarton: 25,
        hscode: "7323.93",
        declaredValue: "$5.00",
        minimumPrice: "$8.99",
        msrp: "$13.99",
        sellingPrice: "$9.99",
        pm: "Paul"
    },
    {
        sku: "KM-OLD-007",
        image: "img18.jpg",
        status: "Phasing Out",
        productName: "Kitchen Mama Classic Strainer",
        series: "CS0700",
        category: "Kitchen Tools",
        gs1Code: "0012345678918",
        gs1Type: "UPC",
        amzAsin: "B06BCD7890",
        itemDimensions: "8x8x4 in",
        itemWeight: "0.6 lbs",
        package: "Box",
        packageWeight: "0.8 lbs",
        cartonDimensions: "20x16x12 in",
        cartonWeight: "16 lbs",
        unitsPerCarton: 20,
        hscode: "7323.93",
        declaredValue: "$6.00",
        minimumPrice: "$9.99",
        msrp: "$14.99",
        sellingPrice: "$11.99",
        pm: "Quinn"
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

// 日期解析工具函數
function parseDate(dateStr) {
    const parts = dateStr.split('/');
    return new Date(parts[2], parts[0] - 1, parts[1]);
}

// 假匯率（轉換為 USD）
const exchangeRates = {
    'USD': 1,
    'JPY': 0.0067,
    'GBP': 1.27,
    'EUR': 1.09,
    'CAD': 0.74
};

// Forecast Review 假資料（2026年）
const forecastReviewData = [
    // Amazon US - KM-001
    { date: "2/2/2026", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 45, forecastUnits: 48, salesAmount: 899.55, forecastAmount: 959.52, currency: "USD", session: 1250, pageView: 2100, unitSessionPercentage: 3.6, buyBoxPercentage: 95 },
    { date: "2/3/2026", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 52, forecastUnits: 50, salesAmount: 1039.48, forecastAmount: 999.50, currency: "USD", session: 1380, pageView: 2280, unitSessionPercentage: 3.8, buyBoxPercentage: 96 },
    { date: "2/4/2026", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 38, forecastUnits: 42, salesAmount: 759.62, forecastAmount: 839.58, currency: "USD", session: 1120, pageView: 1890, unitSessionPercentage: 3.4, buyBoxPercentage: 94 },
    { date: "2/5/2026", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 61, forecastUnits: 55, salesAmount: 1219.39, forecastAmount: 1099.45, currency: "USD", session: 1520, pageView: 2450, unitSessionPercentage: 4.0, buyBoxPercentage: 97 },
    { date: "2/6/2026", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 48, forecastUnits: 47, salesAmount: 959.52, forecastAmount: 939.53, currency: "USD", session: 1290, pageView: 2150, unitSessionPercentage: 3.7, buyBoxPercentage: 95 },
    { date: "2/3/2026", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 52, salesAmount: 1039.48, currency: "USD", session: 1380, pageView: 2280, unitSessionPercentage: 3.8, buyBoxPercentage: 96 },
    { date: "2/4/2026", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 38, salesAmount: 759.62, currency: "USD", session: 1120, pageView: 1890, unitSessionPercentage: 3.4, buyBoxPercentage: 94 },
    { date: "2/5/2026", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 61, salesAmount: 1219.39, currency: "USD", session: 1520, pageView: 2450, unitSessionPercentage: 4.0, buyBoxPercentage: 97 },
    { date: "2/6/2026", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 48, salesAmount: 959.52, currency: "USD", session: 1290, pageView: 2150, unitSessionPercentage: 3.7, buyBoxPercentage: 95 },
    
    // Amazon JP - KM-001
    { date: "2/2/2026", channel: "Amazon", marketplace: "JP", sku: "KM-001", salesUnits: 28, salesAmount: 3360, currency: "JPY", session: 850, pageView: 1420, unitSessionPercentage: 3.3, buyBoxPercentage: 92 },
    { date: "2/3/2026", channel: "Amazon", marketplace: "JP", sku: "KM-001", salesUnits: 32, salesAmount: 3840, currency: "JPY", session: 920, pageView: 1580, unitSessionPercentage: 3.5, buyBoxPercentage: 93 },
    { date: "2/4/2026", channel: "Amazon", marketplace: "JP", sku: "KM-001", salesUnits: 25, salesAmount: 3000, currency: "JPY", session: 780, pageView: 1320, unitSessionPercentage: 3.2, buyBoxPercentage: 91 },
    { date: "2/5/2026", channel: "Amazon", marketplace: "JP", sku: "KM-001", salesUnits: 35, salesAmount: 4200, currency: "JPY", session: 1050, pageView: 1750, unitSessionPercentage: 3.3, buyBoxPercentage: 94 },
    { date: "2/6/2026", channel: "Amazon", marketplace: "JP", sku: "KM-001", salesUnits: 30, salesAmount: 3600, currency: "JPY", session: 890, pageView: 1480, unitSessionPercentage: 3.4, buyBoxPercentage: 92 },
    
    // Amazon UK - KM-002
    { date: "2/2/2026", channel: "Amazon", marketplace: "UK", sku: "KM-002", salesUnits: 18, salesAmount: 1349.82, currency: "GBP", session: 620, pageView: 1050, unitSessionPercentage: 2.9, buyBoxPercentage: 89 },
    { date: "2/3/2026", channel: "Amazon", marketplace: "UK", sku: "KM-002", salesUnits: 22, salesAmount: 1649.78, currency: "GBP", session: 710, pageView: 1180, unitSessionPercentage: 3.1, buyBoxPercentage: 90 },
    { date: "2/4/2026", channel: "Amazon", marketplace: "UK", sku: "KM-002", salesUnits: 15, salesAmount: 1124.85, currency: "GBP", session: 580, pageView: 980, unitSessionPercentage: 2.6, buyBoxPercentage: 88 },
    { date: "2/5/2026", channel: "Amazon", marketplace: "UK", sku: "KM-002", salesUnits: 25, salesAmount: 1874.75, currency: "GBP", session: 780, pageView: 1290, unitSessionPercentage: 3.2, buyBoxPercentage: 91 },
    { date: "2/6/2026", channel: "Amazon", marketplace: "UK", sku: "KM-002", salesUnits: 20, salesAmount: 1499.80, currency: "GBP", session: 680, pageView: 1120, unitSessionPercentage: 2.9, buyBoxPercentage: 89 },
    
    // Amazon DE - KM-003
    { date: "2/2/2026", channel: "Amazon", marketplace: "DE", sku: "KM-003", salesUnits: 33, salesAmount: 1220.67, currency: "EUR", session: 980, pageView: 1640, unitSessionPercentage: 3.4, buyBoxPercentage: 93 },
    { date: "2/3/2026", channel: "Amazon", marketplace: "DE", sku: "KM-003", salesUnits: 38, salesAmount: 1405.62, currency: "EUR", session: 1080, pageView: 1820, unitSessionPercentage: 3.5, buyBoxPercentage: 94 },
    { date: "2/4/2026", channel: "Amazon", marketplace: "DE", sku: "KM-003", salesUnits: 29, salesAmount: 1072.71, currency: "EUR", session: 890, pageView: 1490, unitSessionPercentage: 3.3, buyBoxPercentage: 92 },
    { date: "2/5/2026", channel: "Amazon", marketplace: "DE", sku: "KM-003", salesUnits: 42, salesAmount: 1553.58, currency: "EUR", session: 1180, pageView: 1980, unitSessionPercentage: 3.6, buyBoxPercentage: 95 },
    { date: "2/6/2026", channel: "Amazon", marketplace: "DE", sku: "KM-003", salesUnits: 36, salesAmount: 1331.64, currency: "EUR", session: 1020, pageView: 1710, unitSessionPercentage: 3.5, buyBoxPercentage: 93 },
    
    // Amazon CA - KM-004
    { date: "2/2/2026", channel: "Amazon", marketplace: "CA", sku: "KM-004", salesUnits: 24, salesAmount: 431.76, currency: "CAD", session: 720, pageView: 1200, unitSessionPercentage: 3.3, buyBoxPercentage: 90 },
    { date: "2/3/2026", channel: "Amazon", marketplace: "CA", sku: "KM-004", salesUnits: 28, salesAmount: 503.72, currency: "CAD", session: 810, pageView: 1350, unitSessionPercentage: 3.5, buyBoxPercentage: 91 },
    { date: "2/4/2026", channel: "Amazon", marketplace: "CA", sku: "KM-004", salesUnits: 21, salesAmount: 377.79, currency: "CAD", session: 670, pageView: 1120, unitSessionPercentage: 3.1, buyBoxPercentage: 89 },
    { date: "2/5/2026", channel: "Amazon", marketplace: "CA", sku: "KM-004", salesUnits: 31, salesAmount: 557.69, currency: "CAD", session: 890, pageView: 1480, unitSessionPercentage: 3.5, buyBoxPercentage: 92 },
    { date: "2/6/2026", channel: "Amazon", marketplace: "CA", sku: "KM-004", salesUnits: 26, salesAmount: 467.74, currency: "CAD", session: 760, pageView: 1270, unitSessionPercentage: 3.4, buyBoxPercentage: 90 },
    
    // Shopify - KM-005
    { date: "2/2/2026", channel: "Shopify", marketplace: "US", sku: "KM-005", salesUnits: 12, salesAmount: 143.88, currency: "USD", session: 450, pageView: 780, unitSessionPercentage: 2.7, buyBoxPercentage: 100 },
    { date: "2/3/2026", channel: "Shopify", marketplace: "US", sku: "KM-005", salesUnits: 15, salesAmount: 179.85, currency: "USD", session: 520, pageView: 890, unitSessionPercentage: 2.9, buyBoxPercentage: 100 },
    { date: "2/4/2026", channel: "Shopify", marketplace: "US", sku: "KM-005", salesUnits: 10, salesAmount: 119.90, currency: "USD", session: 410, pageView: 710, unitSessionPercentage: 2.4, buyBoxPercentage: 100 },
    { date: "2/5/2026", channel: "Shopify", marketplace: "US", sku: "KM-005", salesUnits: 18, salesAmount: 215.82, currency: "USD", session: 580, pageView: 960, unitSessionPercentage: 3.1, buyBoxPercentage: 100 },
    { date: "2/6/2026", channel: "Shopify", marketplace: "US", sku: "KM-005", salesUnits: 14, salesAmount: 167.86, currency: "USD", session: 490, pageView: 820, unitSessionPercentage: 2.9, buyBoxPercentage: 100 },
    
    // Target - KM-006
    { date: "2/2/2026", channel: "Target", marketplace: "US", sku: "KM-006", salesUnits: 35, salesAmount: 664.65, currency: "USD", session: 920, pageView: 1540, unitSessionPercentage: 3.8, buyBoxPercentage: 87 },
    { date: "2/3/2026", channel: "Target", marketplace: "US", sku: "KM-006", salesUnits: 41, salesAmount: 778.59, currency: "USD", session: 1050, pageView: 1750, unitSessionPercentage: 3.9, buyBoxPercentage: 88 },
    { date: "2/4/2026", channel: "Target", marketplace: "US", sku: "KM-006", salesUnits: 28, salesAmount: 531.72, currency: "USD", session: 820, pageView: 1380, unitSessionPercentage: 3.4, buyBoxPercentage: 86 },
    { date: "2/5/2026", channel: "Target", marketplace: "US", sku: "KM-006", salesUnits: 46, salesAmount: 873.54, currency: "USD", session: 1150, pageView: 1920, unitSessionPercentage: 4.0, buyBoxPercentage: 89 },
    { date: "2/6/2026", channel: "Target", marketplace: "US", sku: "KM-006", salesUnits: 38, salesAmount: 721.62, currency: "USD", session: 980, pageView: 1640, unitSessionPercentage: 3.9, buyBoxPercentage: 87 },
    
    // Amazon US - KM-007
    { date: "2/2/2026", channel: "Amazon", marketplace: "US", sku: "KM-007", salesUnits: 56, salesAmount: 614.44, currency: "USD", session: 1420, pageView: 2380, unitSessionPercentage: 3.9, buyBoxPercentage: 96 },
    { date: "2/3/2026", channel: "Amazon", marketplace: "US", sku: "KM-007", salesUnits: 63, salesAmount: 691.37, currency: "USD", session: 1580, pageView: 2640, unitSessionPercentage: 4.0, buyBoxPercentage: 97 },
    { date: "2/4/2026", channel: "Amazon", marketplace: "US", sku: "KM-007", salesUnits: 49, salesAmount: 537.51, currency: "USD", session: 1280, pageView: 2140, unitSessionPercentage: 3.8, buyBoxPercentage: 95 },
    { date: "2/5/2026", channel: "Amazon", marketplace: "US", sku: "KM-007", salesUnits: 71, salesAmount: 779.29, currency: "USD", session: 1720, pageView: 2880, unitSessionPercentage: 4.1, buyBoxPercentage: 98 },
    { date: "2/6/2026", channel: "Amazon", marketplace: "US", sku: "KM-007", salesUnits: 58, salesAmount: 636.42, currency: "USD", session: 1480, pageView: 2480, unitSessionPercentage: 3.9, buyBoxPercentage: 96 },
    
    // Amazon FR - KM-UP-001
    { date: "2/2/2026", channel: "Amazon", marketplace: "FR", sku: "KM-UP-001", salesUnits: 22, salesAmount: 549.78, currency: "EUR", session: 680, pageView: 1140, unitSessionPercentage: 3.2, buyBoxPercentage: 91 },
    { date: "2/3/2026", channel: "Amazon", marketplace: "FR", sku: "KM-UP-001", salesUnits: 26, salesAmount: 649.74, currency: "EUR", session: 760, pageView: 1280, unitSessionPercentage: 3.4, buyBoxPercentage: 92 },
    { date: "2/4/2026", channel: "Amazon", marketplace: "FR", sku: "KM-UP-001", salesUnits: 19, salesAmount: 474.81, currency: "EUR", session: 620, pageView: 1040, unitSessionPercentage: 3.1, buyBoxPercentage: 90 },
    { date: "2/5/2026", channel: "Amazon", marketplace: "FR", sku: "KM-UP-001", salesUnits: 29, salesAmount: 724.71, currency: "EUR", session: 840, pageView: 1410, unitSessionPercentage: 3.5, buyBoxPercentage: 93 },
    { date: "2/6/2026", channel: "Amazon", marketplace: "FR", sku: "KM-UP-001", salesUnits: 24, salesAmount: 599.76, currency: "EUR", session: 710, pageView: 1190, unitSessionPercentage: 3.4, buyBoxPercentage: 91 },
    
    // Amazon IT - KM-UP-002
    { date: "2/2/2026", channel: "Amazon", marketplace: "IT", sku: "KM-UP-002", salesUnits: 16, salesAmount: 479.84, currency: "EUR", session: 520, pageView: 870, unitSessionPercentage: 3.1, buyBoxPercentage: 88 },
    { date: "2/3/2026", channel: "Amazon", marketplace: "IT", sku: "KM-UP-002", salesUnits: 19, salesAmount: 569.81, currency: "EUR", session: 590, pageView: 990, unitSessionPercentage: 3.2, buyBoxPercentage: 89 },
    { date: "2/4/2026", channel: "Amazon", marketplace: "IT", sku: "KM-UP-002", salesUnits: 14, salesAmount: 419.86, currency: "EUR", session: 480, pageView: 810, unitSessionPercentage: 2.9, buyBoxPercentage: 87 },
    { date: "2/5/2026", channel: "Amazon", marketplace: "IT", sku: "KM-UP-002", salesUnits: 21, salesAmount: 629.79, currency: "EUR", session: 650, pageView: 1090, unitSessionPercentage: 3.2, buyBoxPercentage: 90 },
    { date: "2/6/2026", channel: "Amazon", marketplace: "IT", sku: "KM-UP-002", salesUnits: 17, salesAmount: 509.83, currency: "EUR", session: 550, pageView: 920, unitSessionPercentage: 3.1, buyBoxPercentage: 88 },
    
    // Amazon ES - KM-UP-003
    { date: "2/2/2026", channel: "Amazon", marketplace: "ES", sku: "KM-UP-003", salesUnits: 27, salesAmount: 1079.73, currency: "EUR", session: 780, pageView: 1310, unitSessionPercentage: 3.5, buyBoxPercentage: 92 },
    { date: "2/3/2026", channel: "Amazon", marketplace: "ES", sku: "KM-UP-003", salesUnits: 31, salesAmount: 1239.69, currency: "EUR", session: 870, pageView: 1460, unitSessionPercentage: 3.6, buyBoxPercentage: 93 },
    { date: "2/4/2026", channel: "Amazon", marketplace: "ES", sku: "KM-UP-003", salesUnits: 23, salesAmount: 919.77, currency: "EUR", session: 710, pageView: 1190, unitSessionPercentage: 3.2, buyBoxPercentage: 91 },
    { date: "2/5/2026", channel: "Amazon", marketplace: "ES", sku: "KM-UP-003", salesUnits: 34, salesAmount: 1359.66, currency: "EUR", session: 950, pageView: 1590, unitSessionPercentage: 3.6, buyBoxPercentage: 94 },
    { date: "2/6/2026", channel: "Amazon", marketplace: "ES", sku: "KM-UP-003", salesUnits: 29, salesAmount: 1159.71, currency: "EUR", session: 820, pageView: 1380, unitSessionPercentage: 3.5, buyBoxPercentage: 92 },
    
    // Walmart - KM-OLD-001
    { date: "2/2/2026", channel: "Walmart", marketplace: "US", sku: "KM-OLD-001", salesUnits: 8, salesAmount: 119.92, currency: "USD", session: 320, pageView: 540, unitSessionPercentage: 2.5, buyBoxPercentage: 82 },
    { date: "2/3/2026", channel: "Walmart", marketplace: "US", sku: "KM-OLD-001", salesUnits: 10, salesAmount: 149.90, currency: "USD", session: 380, pageView: 640, unitSessionPercentage: 2.6, buyBoxPercentage: 83 },
    { date: "2/4/2026", channel: "Walmart", marketplace: "US", sku: "KM-OLD-001", salesUnits: 6, salesAmount: 89.94, currency: "USD", session: 290, pageView: 490, unitSessionPercentage: 2.1, buyBoxPercentage: 81 },
    { date: "2/5/2026", channel: "Walmart", marketplace: "US", sku: "KM-OLD-001", salesUnits: 11, salesAmount: 164.89, currency: "USD", session: 410, pageView: 690, unitSessionPercentage: 2.7, buyBoxPercentage: 84 },
    { date: "2/6/2026", channel: "Walmart", marketplace: "US", sku: "KM-OLD-001", salesUnits: 9, salesAmount: 134.91, currency: "USD", session: 350, pageView: 590, unitSessionPercentage: 2.6, buyBoxPercentage: 82 }
];

// 去年同期資料（2025年）
const forecastReviewDataLastYear = [
    // Amazon US - KM-001
    { date: "2/2/2025", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 38, salesAmount: 759.62, currency: "USD", session: 1050, pageView: 1780, unitSessionPercentage: 3.6, buyBoxPercentage: 93 },
    { date: "2/3/2025", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 44, salesAmount: 879.56, currency: "USD", session: 1180, pageView: 1950, unitSessionPercentage: 3.7, buyBoxPercentage: 94 },
    { date: "2/4/2025", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 32, salesAmount: 639.68, currency: "USD", session: 950, pageView: 1620, unitSessionPercentage: 3.4, buyBoxPercentage: 92 },
    { date: "2/5/2025", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 51, salesAmount: 1019.49, currency: "USD", session: 1320, pageView: 2150, unitSessionPercentage: 3.9, buyBoxPercentage: 95 },
    { date: "2/6/2025", channel: "Amazon", marketplace: "US", sku: "KM-001", salesUnits: 41, salesAmount: 819.59, currency: "USD", session: 1120, pageView: 1880, unitSessionPercentage: 3.7, buyBoxPercentage: 93 },
    
    // Amazon JP - KM-001
    { date: "2/2/2025", channel: "Amazon", marketplace: "JP", sku: "KM-001", salesUnits: 24, salesAmount: 2880, currency: "JPY", session: 720, pageView: 1210, unitSessionPercentage: 3.3, buyBoxPercentage: 90 },
    { date: "2/3/2025", channel: "Amazon", marketplace: "JP", sku: "KM-001", salesUnits: 27, salesAmount: 3240, currency: "JPY", session: 790, pageView: 1350, unitSessionPercentage: 3.4, buyBoxPercentage: 91 },
    { date: "2/4/2025", channel: "Amazon", marketplace: "JP", sku: "KM-001", salesUnits: 21, salesAmount: 2520, currency: "JPY", session: 660, pageView: 1120, unitSessionPercentage: 3.2, buyBoxPercentage: 89 },
    { date: "2/5/2025", channel: "Amazon", marketplace: "JP", sku: "KM-001", salesUnits: 30, salesAmount: 3600, currency: "JPY", session: 910, pageView: 1520, unitSessionPercentage: 3.3, buyBoxPercentage: 92 },
    { date: "2/6/2025", channel: "Amazon", marketplace: "JP", sku: "KM-001", salesUnits: 26, salesAmount: 3120, currency: "JPY", session: 770, pageView: 1290, unitSessionPercentage: 3.4, buyBoxPercentage: 90 },
    
    // Amazon UK - KM-002
    { date: "2/2/2025", channel: "Amazon", marketplace: "UK", sku: "KM-002", salesUnits: 15, salesAmount: 1124.85, currency: "GBP", session: 530, pageView: 890, unitSessionPercentage: 2.8, buyBoxPercentage: 87 },
    { date: "2/3/2025", channel: "Amazon", marketplace: "UK", sku: "KM-002", salesUnits: 19, salesAmount: 1424.81, currency: "GBP", session: 620, pageView: 1030, unitSessionPercentage: 3.1, buyBoxPercentage: 88 },
    { date: "2/4/2025", channel: "Amazon", marketplace: "UK", sku: "KM-002", salesUnits: 13, salesAmount: 974.87, currency: "GBP", session: 490, pageView: 830, unitSessionPercentage: 2.7, buyBoxPercentage: 86 },
    { date: "2/5/2025", channel: "Amazon", marketplace: "UK", sku: "KM-002", salesUnits: 21, salesAmount: 1574.79, currency: "GBP", session: 680, pageView: 1130, unitSessionPercentage: 3.1, buyBoxPercentage: 89 },
    { date: "2/6/2025", channel: "Amazon", marketplace: "UK", sku: "KM-002", salesUnits: 17, salesAmount: 1274.83, currency: "GBP", session: 590, pageView: 980, unitSessionPercentage: 2.9, buyBoxPercentage: 87 },
    
    // Shopify - KM-005
    { date: "2/2/2025", channel: "Shopify", marketplace: "US", sku: "KM-005", salesUnits: 10, salesAmount: 119.90, currency: "USD", session: 380, pageView: 660, unitSessionPercentage: 2.6, buyBoxPercentage: 100 },
    { date: "2/3/2025", channel: "Shopify", marketplace: "US", sku: "KM-005", salesUnits: 13, salesAmount: 155.87, currency: "USD", session: 450, pageView: 770, unitSessionPercentage: 2.9, buyBoxPercentage: 100 },
    { date: "2/4/2025", channel: "Shopify", marketplace: "US", sku: "KM-005", salesUnits: 8, salesAmount: 95.92, currency: "USD", session: 350, pageView: 610, unitSessionPercentage: 2.3, buyBoxPercentage: 100 },
    { date: "2/5/2025", channel: "Shopify", marketplace: "US", sku: "KM-005", salesUnits: 15, salesAmount: 179.85, currency: "USD", session: 500, pageView: 830, unitSessionPercentage: 3.0, buyBoxPercentage: 100 },
    { date: "2/6/2025", channel: "Shopify", marketplace: "US", sku: "KM-005", salesUnits: 12, salesAmount: 143.88, currency: "USD", session: 420, pageView: 710, unitSessionPercentage: 2.9, buyBoxPercentage: 100 },
    
    // Target - KM-006
    { date: "2/2/2025", channel: "Target", marketplace: "US", sku: "KM-006", salesUnits: 30, salesAmount: 569.70, currency: "USD", session: 790, pageView: 1320, unitSessionPercentage: 3.8, buyBoxPercentage: 85 },
    { date: "2/3/2025", channel: "Target", marketplace: "US", sku: "KM-006", salesUnits: 35, salesAmount: 664.65, currency: "USD", session: 910, pageView: 1520, unitSessionPercentage: 3.8, buyBoxPercentage: 86 },
    { date: "2/4/2025", channel: "Target", marketplace: "US", sku: "KM-006", salesUnits: 24, salesAmount: 455.76, currency: "USD", session: 710, pageView: 1190, unitSessionPercentage: 3.4, buyBoxPercentage: 84 },
    { date: "2/5/2025", channel: "Target", marketplace: "US", sku: "KM-006", salesUnits: 39, salesAmount: 740.61, currency: "USD", session: 1000, pageView: 1670, unitSessionPercentage: 3.9, buyBoxPercentage: 87 },
    { date: "2/6/2025", channel: "Target", marketplace: "US", sku: "KM-006", salesUnits: 32, salesAmount: 607.68, currency: "USD", session: 850, pageView: 1420, unitSessionPercentage: 3.8, buyBoxPercentage: 85 }
];

// 暴露 DataRepo 到全域
window.DataRepo = DataRepo;