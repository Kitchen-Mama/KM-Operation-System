// Firebase 資料初始化腳本
import { db } from './firebase-config.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";



// 本地資料
const items = [
    { sku: "A001", stock: 50, avgDailySales: 5.2, createdAt: "2024-01-01" },
    { sku: "B002", stock: 30, avgDailySales: 3.8, createdAt: "2024-01-02" },
    { sku: "C003", stock: 100, avgDailySales: 12.5, createdAt: "2024-01-03" }
];

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

// 上傳資料到 Firebase
async function uploadData() {
    try {
        console.log('開始上傳 items...');
        for (const item of items) {
            await addDoc(collection(db, 'items'), item);
            console.log(`已上傳: ${item.sku}`);
        }
        
        console.log('開始上傳 siteSkus...');
        for (const siteSku of siteSkus) {
            await addDoc(collection(db, 'siteSkus'), siteSku);
            console.log(`已上傳: ${siteSku.site} - ${siteSku.sku}`);
        }
        
        console.log('所有資料上傳完成！');
    } catch (error) {
        console.error('上傳失敗:', error);
    }
}

// 執行上傳
uploadData();
