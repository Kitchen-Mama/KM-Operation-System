// 本地測試資料
const items = [
    {
        sku: "CO1100-R",
        stock: 50,
        avgDailySales: 5.2,
        createdAt: "2024-01-01"
    },
    {
        sku: "CO1100-S", 
        stock: 30,
        avgDailySales: 3.8,
        createdAt: "2024-01-02"
    },
    {
        sku: "CO1150-R",
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
    { sku: "CO1100-R", factory: "工廠A", stock: 500 },
    { sku: "CO1100-S", factory: "工廠A", stock: 300 },
    { sku: "CO1150-R", factory: "工廠A", stock: 800 },
    { sku: "CO1100-R", factory: "工廠B", stock: 400 },
    { sku: "CO1150-AG", factory: "工廠B", stock: 250 },
    { sku: "SP3120-R", factory: "工廠B", stock: 600 }
];

// 出貨方式資料
const shippingMethods = ["海運", "空運", "陸運"];

// Weekly Shipping Plans 資料 - 從 localStorage 載入
let weeklyShippingPlans = JSON.parse(localStorage.getItem('weeklyShippingPlans')) || [];

// 站點 SKU 資料
const siteSkus = [
    { site: "Amazon", sku: "CO1100-R", stock: 150, weeklyAvgSales: 35 },
    { site: "Amazon", sku: "CO1100-S", stock: 80, weeklyAvgSales: 21 },
    { site: "Amazon", sku: "CO1150-R", stock: 200, weeklyAvgSales: 70 },
    { site: "Amazon", sku: "CO1150-AG", stock: 120, weeklyAvgSales: 28 },
    { site: "Amazon", sku: "SP3120-R", stock: 95, weeklyAvgSales: 42 },
    { site: "Amazon", sku: "SP3410-R", stock: 60, weeklyAvgSales: 14 },
    { site: "Amazon", sku: "MO5600-R", stock: 180, weeklyAvgSales: 56 },
    { site: "Amazon", sku: "MO5600-M", stock: 110, weeklyAvgSales: 35 },
    { site: "Amazon", sku: "CO1100-T", stock: 140, weeklyAvgSales: 49 },
    { site: "Amazon", sku: "CO1100-W", stock: 85, weeklyAvgSales: 28 },
    { site: "Amazon", sku: "CO1150-N", stock: 70, weeklyAvgSales: 21 },
    { site: "Amazon", sku: "CO1150-MB", stock: 45, weeklyAvgSales: 14 },
    { site: "Amazon", sku: "SP3120-M", stock: 130, weeklyAvgSales: 42 },
    { site: "Amazon", sku: "SP3120-B", stock: 90, weeklyAvgSales: 28 },
    { site: "Amazon", sku: "SP3410-M", stock: 160, weeklyAvgSales: 56 },
    { site: "Shopify", sku: "CO1100-R", stock: 120, weeklyAvgSales: 28 },
    { site: "Shopify", sku: "CO1150-AG", stock: 60, weeklyAvgSales: 14 },
    { site: "Shopify", sku: "SP3120-R", stock: 90, weeklyAvgSales: 42 },
    { site: "Target", sku: "CO1100-S", stock: 100, weeklyAvgSales: 35 },
    { site: "Target", sku: "SP3410-R", stock: 75, weeklyAvgSales: 21 },
    { site: "Target", sku: "MO5600-R", stock: 180, weeklyAvgSales: 56 },
    { site: "KM Walmart", sku: "CO1100-R", stock: 95, weeklyAvgSales: 30 },
    { site: "KM Walmart", sku: "CO1150-R", stock: 65, weeklyAvgSales: 18 },
    { site: "KM Walmart", sku: "SP3120-M", stock: 50, weeklyAvgSales: 12 },
    { site: "KM Walmart", sku: "MO5600-R", stock: 70, weeklyAvgSales: 22 }
];

// Forecast 資料
const forecastData = [
    // 12月資料
    { site: "amazon", productType: "Can Opener", actualSales: 1250, forecastSales: 1200, createdAt: "2024-12-01" },
    { site: "amazon", productType: "Manual Opener", actualSales: 850, forecastSales: 900, createdAt: "2024-12-01" },
    { site: "amazon", productType: "Silicone Product", actualSales: 2100, forecastSales: 2000, createdAt: "2024-12-01" },
    { site: "shopify", productType: "Can Opener", actualSales: 980, forecastSales: 1000, createdAt: "2024-12-01" },
    { site: "shopify", productType: "Manual Opener", actualSales: 650, forecastSales: 700, createdAt: "2024-12-01" },
    { site: "shopify", productType: "Silicone Product", actualSales: 1800, forecastSales: 1750, createdAt: "2024-12-01" },
    { site: "target", productType: "Can Opener", actualSales: 1100, forecastSales: 1150, createdAt: "2024-12-01" },
    { site: "target", productType: "Manual Opener", actualSales: 750, forecastSales: 800, createdAt: "2024-12-01" },
    { site: "target", productType: "Silicone Product", actualSales: 1950, forecastSales: 1900, createdAt: "2024-12-01" },
    
    // 11月資料
    { site: "amazon", productType: "Can Opener", actualSales: 1180, forecastSales: 1150, createdAt: "2024-11-01" },
    { site: "amazon", productType: "Manual Opener", actualSales: 920, forecastSales: 880, createdAt: "2024-11-01" },
    { site: "amazon", productType: "Silicone Product", actualSales: 1950, forecastSales: 2050, createdAt: "2024-11-01" },
    { site: "shopify", productType: "Can Opener", actualSales: 890, forecastSales: 950, createdAt: "2024-11-01" },
    { site: "shopify", productType: "Manual Opener", actualSales: 720, forecastSales: 680, createdAt: "2024-11-01" },
    { site: "shopify", productType: "Silicone Product", actualSales: 1650, forecastSales: 1700, createdAt: "2024-11-01" },
    { site: "target", productType: "Can Opener", actualSales: 1050, forecastSales: 1100, createdAt: "2024-11-01" },
    { site: "target", productType: "Manual Opener", actualSales: 680, forecastSales: 720, createdAt: "2024-11-01" },
    { site: "target", productType: "Silicone Product", actualSales: 1850, forecastSales: 1800, createdAt: "2024-11-01" },
    
    // 10月資料
    { site: "amazon", productType: "Can Opener", actualSales: 1320, forecastSales: 1280, createdAt: "2024-10-01" },
    { site: "amazon", productType: "Manual Opener", actualSales: 780, forecastSales: 820, createdAt: "2024-10-01" },
    { site: "amazon", productType: "Silicone Product", actualSales: 2250, forecastSales: 2200, createdAt: "2024-10-01" },
    { site: "shopify", productType: "Can Opener", actualSales: 1020, forecastSales: 980, createdAt: "2024-10-01" },
    { site: "shopify", productType: "Manual Opener", actualSales: 590, forecastSales: 630, createdAt: "2024-10-01" },
    { site: "shopify", productType: "Silicone Product", actualSales: 1920, forecastSales: 1880, createdAt: "2024-10-01" },
    { site: "target", productType: "Can Opener", actualSales: 1200, forecastSales: 1180, createdAt: "2024-10-01" },
    { site: "target", productType: "Manual Opener", actualSales: 820, forecastSales: 780, createdAt: "2024-10-01" },
    { site: "target", productType: "Silicone Product", actualSales: 2050, forecastSales: 2100, createdAt: "2024-10-01" }
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


// SKU Details - 統一假資料（3 Category / 5 Series / 21 SKUs）
const upcomingSkuData = [
    { sku: "CO1150-ZW", image: "", status: "Upcoming", productName: "Kitchen Mama Auto 2.0 Electric Can Opener - Marble Black", series: "CO1150", category: "Electric Can Opener", gs1Code: "0012345678909", gs1Type: "UPC", amzAsin: "B0CO1150ZW", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8509.80", declaredValue: "$10.00", minimumPrice: "$24.99", msrp: "$34.99", sellingPrice: "$29.99", pm: "Alice" },
    { sku: "CO1150-XR", image: "", status: "Upcoming", productName: "Kitchen Mama Auto 2.0 Electric Can Opener - Marble White", series: "CO1150", category: "Electric Can Opener", gs1Code: "0012345678910", gs1Type: "UPC", amzAsin: "B0CO1150XR", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8509.80", declaredValue: "$10.00", minimumPrice: "$24.99", msrp: "$34.99", sellingPrice: "$29.99", pm: "Alice" },
];

const runningSkuData = [
    { sku: "CO1100-R", image: "", status: "Active", productName: "Kitchen Mama Auto Electric Can Opener - Red", series: "CO1100", category: "Electric Can Opener", gs1Code: "0012345678901", gs1Type: "UPC", amzAsin: "B0CO1100R", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8509.80", declaredValue: "$10.00", minimumPrice: "$19.99", msrp: "$29.99", sellingPrice: "$24.99", pm: "Alice" },
    { sku: "CO1100-S", image: "", status: "Active", productName: "Kitchen Mama Auto Electric Can Opener - Sky Blue", series: "CO1100", category: "Electric Can Opener", gs1Code: "0012345678902", gs1Type: "UPC", amzAsin: "B0CO1100S", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8509.80", declaredValue: "$10.00", minimumPrice: "$19.99", msrp: "$29.99", sellingPrice: "$24.99", pm: "Alice" },
    { sku: "CO1100-T", image: "", status: "Active", productName: "Kitchen Mama Auto Electric Can Opener - Teal", series: "CO1100", category: "Electric Can Opener", gs1Code: "0012345678903", gs1Type: "UPC", amzAsin: "B0CO1100T", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8509.80", declaredValue: "$10.00", minimumPrice: "$19.99", msrp: "$29.99", sellingPrice: "$24.99", pm: "Alice" },
    { sku: "CO1100-W", image: "", status: "Active", productName: "Kitchen Mama Auto Electric Can Opener - White", series: "CO1100", category: "Electric Can Opener", gs1Code: "0012345678904", gs1Type: "UPC", amzAsin: "B0CO1100W", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8509.80", declaredValue: "$10.00", minimumPrice: "$19.99", msrp: "$29.99", sellingPrice: "$24.99", pm: "Alice" },
    { sku: "CO1150-R", image: "", status: "Active", productName: "Kitchen Mama Auto 2.0 Electric Can Opener - Red", series: "CO1150", category: "Electric Can Opener", gs1Code: "0012345678905", gs1Type: "UPC", amzAsin: "B0CO1150R", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8509.80", declaredValue: "$10.00", minimumPrice: "$24.99", msrp: "$34.99", sellingPrice: "$29.99", pm: "Alice" },
    { sku: "CO1150-N", image: "", status: "Active", productName: "Kitchen Mama Auto 2.0 Electric Can Opener - Navy Blue", series: "CO1150", category: "Electric Can Opener", gs1Code: "0012345678906", gs1Type: "UPC", amzAsin: "B0CO1150N", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8509.80", declaredValue: "$10.00", minimumPrice: "$24.99", msrp: "$34.99", sellingPrice: "$29.99", pm: "Alice" },
    { sku: "CO1150-AG", image: "", status: "Active", productName: "Kitchen Mama Auto 2.0 Electric Can Opener - Alpine Green", series: "CO1150", category: "Electric Can Opener", gs1Code: "0012345678907", gs1Type: "UPC", amzAsin: "B0CO1150AG", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8509.80", declaredValue: "$10.00", minimumPrice: "$24.99", msrp: "$34.99", sellingPrice: "$29.99", pm: "Alice" },
    { sku: "CO1150-MB", image: "", status: "Active", productName: "Kitchen Mama Auto 2.0 Electric Can Opener - Morandi Blue", series: "CO1150", category: "Electric Can Opener", gs1Code: "0012345678908", gs1Type: "UPC", amzAsin: "B0CO1150MB", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8509.80", declaredValue: "$10.00", minimumPrice: "$24.99", msrp: "$34.99", sellingPrice: "$29.99", pm: "Alice" },
    { sku: "SP3120-R", image: "", status: "Active", productName: "Kitchen Mama Waltzgrip Silicone Brushes - Red", series: "SP3120", category: "Silicone Product", gs1Code: "0012345678911", gs1Type: "UPC", amzAsin: "B0SP3120R", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "3924.10", declaredValue: "$10.00", minimumPrice: "$9.99", msrp: "$14.99", sellingPrice: "$12.99", pm: "Alice" },
    { sku: "SP3120-M", image: "", status: "Active", productName: "Kitchen Mama Waltzgrip Silicone Brushes - Metal Gray", series: "SP3120", category: "Silicone Product", gs1Code: "0012345678912", gs1Type: "UPC", amzAsin: "B0SP3120M", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "3924.10", declaredValue: "$10.00", minimumPrice: "$9.99", msrp: "$14.99", sellingPrice: "$12.99", pm: "Alice" },
    { sku: "SP3120-B", image: "", status: "Active", productName: "Kitchen Mama Waltzgrip Silicone Brushes - Blue", series: "SP3120", category: "Silicone Product", gs1Code: "0012345678913", gs1Type: "UPC", amzAsin: "B0SP3120B", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "3924.10", declaredValue: "$10.00", minimumPrice: "$9.99", msrp: "$14.99", sellingPrice: "$12.99", pm: "Alice" },
    { sku: "SP3120-T", image: "", status: "Active", productName: "Kitchen Mama Waltzgrip Silicone Brushes - Teal", series: "SP3120", category: "Silicone Product", gs1Code: "0012345678914", gs1Type: "UPC", amzAsin: "B0SP3120T", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "3924.10", declaredValue: "$10.00", minimumPrice: "$9.99", msrp: "$14.99", sellingPrice: "$12.99", pm: "Alice" },
    { sku: "SP3120-Y", image: "", status: "Active", productName: "Kitchen Mama Waltzgrip Silicone Brushes - Yellow", series: "SP3120", category: "Silicone Product", gs1Code: "0012345678915", gs1Type: "UPC", amzAsin: "B0SP3120Y", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "3924.10", declaredValue: "$10.00", minimumPrice: "$9.99", msrp: "$14.99", sellingPrice: "$12.99", pm: "Alice" },
    { sku: "SP3410-R", image: "", status: "Active", productName: "Kitchen Mama Waltzgrip Silicone Pancake Turner - Red", series: "SP3410", category: "Silicone Product", gs1Code: "0012345678916", gs1Type: "UPC", amzAsin: "B0SP3410R", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "3924.10", declaredValue: "$10.00", minimumPrice: "$11.99", msrp: "$16.99", sellingPrice: "$14.99", pm: "Alice" },
    { sku: "SP3410-M", image: "", status: "Active", productName: "Kitchen Mama Waltzgrip Silicone Pancake Turner - Metal Gray", series: "SP3410", category: "Silicone Product", gs1Code: "0012345678917", gs1Type: "UPC", amzAsin: "B0SP3410M", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "3924.10", declaredValue: "$10.00", minimumPrice: "$11.99", msrp: "$16.99", sellingPrice: "$14.99", pm: "Alice" },
    { sku: "SP3410-B", image: "", status: "Active", productName: "Kitchen Mama Waltzgrip Silicone Pancake Turner - Blue", series: "SP3410", category: "Silicone Product", gs1Code: "0012345678918", gs1Type: "UPC", amzAsin: "B0SP3410B", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "3924.10", declaredValue: "$10.00", minimumPrice: "$11.99", msrp: "$16.99", sellingPrice: "$14.99", pm: "Alice" },
    { sku: "SP3410-T", image: "", status: "Active", productName: "Kitchen Mama Waltzgrip Silicone Pancake Turner - Teal", series: "SP3410", category: "Silicone Product", gs1Code: "0012345678919", gs1Type: "UPC", amzAsin: "B0SP3410T", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "3924.10", declaredValue: "$10.00", minimumPrice: "$11.99", msrp: "$16.99", sellingPrice: "$14.99", pm: "Alice" },
    { sku: "SP3410-Y", image: "", status: "Active", productName: "Kitchen Mama Waltzgrip Silicone Pancake Turner - Yellow", series: "SP3410", category: "Silicone Product", gs1Code: "0012345678920", gs1Type: "UPC", amzAsin: "B0SP3410Y", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "3924.10", declaredValue: "$10.00", minimumPrice: "$11.99", msrp: "$16.99", sellingPrice: "$14.99", pm: "Alice" },
    { sku: "MO5600-R", image: "", status: "Active", productName: "Kitchen Mama Manual Can Opener - Red", series: "MO5600", category: "Manual Opener", gs1Code: "0012345678921", gs1Type: "UPC", amzAsin: "B0MO5600R", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8210.00", declaredValue: "$10.00", minimumPrice: "$13.99", msrp: "$19.99", sellingPrice: "$16.99", pm: "Alice" },
    { sku: "MO5600-M", image: "", status: "Active", productName: "Kitchen Mama Manual Can Opener - Metal Gray", series: "MO5600", category: "Manual Opener", gs1Code: "0012345678922", gs1Type: "UPC", amzAsin: "B0MO5600M", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8210.00", declaredValue: "$10.00", minimumPrice: "$13.99", msrp: "$19.99", sellingPrice: "$16.99", pm: "Alice" },
    { sku: "MO5600-T", image: "", status: "Active", productName: "Kitchen Mama Manual Can Opener - Teal", series: "MO5600", category: "Manual Opener", gs1Code: "0012345678923", gs1Type: "UPC", amzAsin: "B0MO5600T", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8210.00", declaredValue: "$10.00", minimumPrice: "$13.99", msrp: "$19.99", sellingPrice: "$16.99", pm: "Alice" },
    { sku: "MO5600-W", image: "", status: "Active", productName: "Kitchen Mama Manual Can Opener - White", series: "MO5600", category: "Manual Opener", gs1Code: "0012345678924", gs1Type: "UPC", amzAsin: "B0MO5600W", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8210.00", declaredValue: "$10.00", minimumPrice: "$13.99", msrp: "$19.99", sellingPrice: "$16.99", pm: "Alice" },
    { sku: "MO5600-B", image: "", status: "Active", productName: "Kitchen Mama Manual Can Opener - Blue", series: "MO5600", category: "Manual Opener", gs1Code: "0012345678925", gs1Type: "UPC", amzAsin: "B0MO5600B", itemDimensions: "8x3x2 in", itemWeight: "0.5 lbs", package: "Box", packageWeight: "0.8 lbs", cartonDimensions: "20x15x10 in", cartonWeight: "12 lbs", unitsPerCarton: 24, hscode: "8210.00", declaredValue: "$10.00", minimumPrice: "$13.99", msrp: "$19.99", sellingPrice: "$16.99", pm: "Alice" },
];

const phasingOutSkuData = [

];

// FC Regular Data (using unified SKUs)
const fcRegularData = [
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'US', category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-R', months: [200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300, 310] },
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'US', category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-S', months: [250, 260, 270, 280, 290, 300, 310, 320, 330, 340, 350, 360] },
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'US', category: 'Electric Can Opener', series: 'CO1150', sku: 'CO1150-R', months: [300, 310, 320, 330, 340, 350, 360, 370, 380, 390, 400, 410] },
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'US', category: 'Electric Can Opener', series: 'CO1150', sku: 'CO1150-AG', months: [350, 360, 370, 380, 390, 400, 410, 420, 430, 440, 450, 460] },
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'US', category: 'Silicone Product', series: 'SP3120', sku: 'SP3120-R', months: [400, 410, 420, 430, 440, 450, 460, 470, 480, 490, 500, 510] },
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'US', category: 'Silicone Product', series: 'SP3410', sku: 'SP3410-R', months: [450, 460, 470, 480, 490, 500, 510, 520, 530, 540, 550, 560] },
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'US', category: 'Manual Opener', series: 'MO5600', sku: 'MO5600-R', months: [500, 510, 520, 530, 540, 550, 560, 570, 580, 590, 600, 610] },
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'CA', category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-R', months: [100, 108, 116, 124, 132, 140, 148, 156, 164, 172, 180, 188] },
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'CA', category: 'Electric Can Opener', series: 'CO1150', sku: 'CO1150-R', months: [130, 138, 146, 154, 162, 170, 178, 186, 194, 202, 210, 218] },
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'CA', category: 'Silicone Product', series: 'SP3120', sku: 'SP3120-M', months: [160, 168, 176, 184, 192, 200, 208, 216, 224, 232, 240, 248] },
  { year: 2026, company: 'ResEU', marketplace: 'Amazon', country: 'JP', category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-T', months: [80, 87, 94, 101, 108, 115, 122, 129, 136, 143, 150, 157] },
  { year: 2026, company: 'ResEU', marketplace: 'Amazon', country: 'JP', category: 'Silicone Product', series: 'SP3120', sku: 'SP3120-B', months: [105, 112, 119, 126, 133, 140, 147, 154, 161, 168, 175, 182] },
  { year: 2026, company: 'ResEU', marketplace: 'Amazon', country: 'JP', category: 'Manual Opener', series: 'MO5600', sku: 'MO5600-M', months: [130, 137, 144, 151, 158, 165, 172, 179, 186, 193, 200, 207] },
];

// FC Event Data
const fcEventData = [
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'US', category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-R', event: 'Prime Day', eventPeriod: '2026/07/15-2026/07/16', fcQty: 800 },
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'US', category: 'Electric Can Opener', series: 'CO1150', sku: 'CO1150-R', event: 'BFCM', eventPeriod: '2026/11/27-2026/12/02', fcQty: 1200 },
  { year: 2026, company: 'ResTW', marketplace: 'Amazon', country: 'US', category: 'Silicone Product', series: 'SP3120', sku: 'SP3120-R', event: 'Prime Day', eventPeriod: '2026/07/15-2026/07/16', fcQty: 500 },
];

// Factory Stock Data
const factoryStockData = [
  { sku: 'CO1100-R', company: 'Kitchen Mama', category: 'Electric Can Opener', series: 'CO1100', factory: 'CN', stock: 1000, monthlyProduction: [333, 383, 433] },
  { sku: 'CO1100-S', company: 'Kitchen Mama', category: 'Electric Can Opener', series: 'CO1100', factory: 'TW', stock: 1200, monthlyProduction: [400, 450, 500] },
  { sku: 'CO1100-T', company: 'Kitchen Mama', category: 'Electric Can Opener', series: 'CO1100', factory: 'CN', stock: 1400, monthlyProduction: [466, 516, 566] },
  { sku: 'CO1100-W', company: 'Kitchen Mama', category: 'Electric Can Opener', series: 'CO1100', factory: 'TW', stock: 1600, monthlyProduction: [533, 583, 633] },
  { sku: 'CO1150-R', company: 'Kitchen Mama', category: 'Electric Can Opener', series: 'CO1150', factory: 'CN', stock: 1800, monthlyProduction: [600, 650, 700] },
  { sku: 'CO1150-N', company: 'Kitchen Mama', category: 'Electric Can Opener', series: 'CO1150', factory: 'TW', stock: 2000, monthlyProduction: [666, 716, 766] },
  { sku: 'CO1150-AG', company: 'Kitchen Mama', category: 'Electric Can Opener', series: 'CO1150', factory: 'CN', stock: 2200, monthlyProduction: [733, 783, 833] },
  { sku: 'SP3120-R', company: 'Kitchen Mama', category: 'Silicone Product', series: 'SP3120', factory: 'TW', stock: 2400, monthlyProduction: [800, 850, 900] },
  { sku: 'SP3120-M', company: 'Kitchen Mama', category: 'Silicone Product', series: 'SP3120', factory: 'CN', stock: 2600, monthlyProduction: [866, 916, 966] },
  { sku: 'SP3410-R', company: 'Kitchen Mama', category: 'Silicone Product', series: 'SP3410', factory: 'TW', stock: 2800, monthlyProduction: [933, 983, 1033] },
  { sku: 'MO5600-R', company: 'Kitchen Mama', category: 'Manual Opener', series: 'MO5600', factory: 'CN', stock: 3000, monthlyProduction: [1000, 1050, 1100] },
  { sku: 'MO5600-M', company: 'Kitchen Mama', category: 'Manual Opener', series: 'MO5600', factory: 'TW', stock: 3200, monthlyProduction: [1066, 1116, 1166] },
];

// 匯出資料到全域
window.fcRegularData = fcRegularData;
window.fcEventData = fcEventData;
window.factoryStockData = factoryStockData;
window.upcomingSkuData = upcomingSkuData;
window.runningSkuData = runningSkuData;
window.phasingOutSkuData = phasingOutSkuData;
window.DataRepo = DataRepo;
