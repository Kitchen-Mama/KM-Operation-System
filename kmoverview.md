# KM Overview Spec 遵守守則

## 護欄原則
- **唯一 Spec 來源**：kmoverview.md 是唯一規範文件；未明確寫入視為不存在
- **Device 策略**：Desktop-first，Mobile-readable（Stage 1）

## 核心原則
1. **嚴格依照 Spec** - 僅能依照已定義的 Schema、User Flow、Scope 進行協作
2. **不自行擴充** - 未經明確要求，不新增 Schema、不擴充 Flow、不優化結構
3. **Stage 1（Foundation）限制** - 僅允許本地假資料、Create/Read、單頁面、單一主流程

## Schema 守則
### 允許存入的資料（Raw Data Only）
- `items`: sku, stock, avgDailySales, createdAt
- `records`: sku, targetDays, recommendQty, createdAt  
- `siteSkus`: site, sku, stock, weeklyAvgSales
- `forecastMonthly`: month, actualSales, forecastSales, createdAt

### 禁止存入 Schema 的內容
- ❌ 衍生計算值：daysOfCover, restockQty, forecast gap
- ❌ 顯示用資料組合
- ❌ UI 狀態：tab, filter, period, section

## User Flow 守則
### 補貨試算
1. 輸入 targetDays + SKU → 計算 recommendQty → 寫入 records

### Ops 管理  
1. 選擇站點 → 輸入 targetDays → 渲染 SKU 列表 → 即時計算顯示值

### Forecast 管理
1. 進入 Tab → 載入 12 個月資料 → 顯示 Actual vs Forecast 圖表

## 技術限制
- Frontend: HTML/CSS/Vanilla JS
- Data: 本地假資料
- 操作: 僅 Create/Read
- 架構: 單頁應用

## Stage 1（Foundation）範圍限制
- ❌ 外部 API 整合
- ❌ 使用者認證系統
- ❌ 跨資料源聚合
- ❌ 多層級權限管理

## 協作邊界
- 若需求超出 Stage 1（Foundation） → 明確指出「超出範圍」
- 若 Spec 不足 → 要求補充，不自行設計
- 僅依 Spec 回答，不做產品發想或架構設計