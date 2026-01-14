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

## CSS/JS Namespace 規章（Stage 1）

### 全站共用樣式（允許放在 style.css 根層級）
**Design Tokens**
- CSS Variables: `--cream-white`, `--warm-orange`, `--soft-green`, `--text-dark`, `--space-*`, `--radius-*`
- 品牌色、間距、圓角、陰影等 tokens

**基礎元件（無頁面特化）**
- 按鈕: `.btn-primary`, `.btn-secondary`, `.btn-ghost`
- 卡片: `.card`, `.card-blue`, `.card-pink` 等
- 輸入框: `input`, `select`, `textarea` 基礎樣式
- 通用 hover/focus 狀態

**全站布局**
- `.top-header`, `.sidebar`, `.main-content`, `.content-area`
- `.app-layout`, `.world-time-bar`

### 頁面特化樣式（必須限定在頁面容器下）
**Home 頁面**
- 容器: `#home-section`
- 樣式: `.home-row-1`, `.home-row-2`, `.event-container`, `.goal-container`

**SKU Details 頁面**
- 容器: `#sku-section`
- 樣式: `.sku-toolbar`, `.sku-xscroll`, `.sku-details-table`, `.col-sku`
- 特殊: `.sku-section-header`, `.sku-lifecycle-section`

**其他頁面**
- Forecast: `#forecast-section`
- Shipment: `#shipment-section`
- Ops: `#ops-section`
- Restock: `#replenishment-section`

### 禁止的全域污染
❌ **不可在根層級使用**
- `table`, `th`, `td` (必須加 class: `.sku-details-table th`)
- `body { overflow-x: hidden }` (除非有明確註解)
- `* { ... }` 過度通用的選擇器
- `.section`, `.card`, `.header` 等過於通用的 class

### JS 事件綁定規則
- 只在對應頁面容器下 querySelector
- 例: `document.querySelector('#sku-section .sku-search')`
- 避免全域 ID 衝突（如多個頁面都有 `#searchInput`）

### Overflow 規則
- ❌ 禁止在 `body`, `html`, `.main-content` 設 `overflow-x: hidden`
- ✅ 只在需要滾動的特定容器設 `overflow-x: auto`（如 `.sku-xscroll`）
- 原因: `overflow: hidden` 會阻止內部 `position: sticky` 生效

### Sticky 定位規則
- 必須使用 `border-collapse: separate` (不可用 `collapse`)
- 祖先層不可有 `overflow: hidden`, `transform`, `filter`, `perspective`
- 滾動容器必須是 sticky 元素的直接或間接父層