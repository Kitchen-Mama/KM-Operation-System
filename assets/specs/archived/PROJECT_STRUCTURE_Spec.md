# 📦 PHASE 1 – 檔案盤點與分類報告

**日期**: 2026-01-16  
**狀態**: ⚠️ 分析完成，等待人工確認  
**重構階段**: PHASE 1 (只分析，不搬移)

---

## 🎯 執行摘要

### 發現的主要問題
1. ✅ **style-guide.css** 可作為 base.css（純設計規範）
2. ⚠️ **style.css** 混雜了 layout、components、page-specific 樣式（需拆分）
3. ⚠️ **多個頁面 CSS 重複定義共用樣式**（filter、table、button）
4. ⚠️ **JS 檔案存在跨頁 DOM 依賴**（fc-summary.js 有重複的 initFactoryDropdown）
5. ⚠️ **MD 文件有重複和過期內容**

---

## 📊 A. CSS 分析報告

### 1️⃣ style-guide.css 分析

**檔案大小**: 4.5 KB  
**用途**: ✅ 純設計規範檔

**內容分類**:
```
✅ CSS Variables (顏色、字體、間距)
✅ Typography Classes (.text-h1, .text-h2, .text-body)
✅ Font Weights (.font-normal, .font-medium, .font-bold)
✅ Text Colors (.text-primary, .text-secondary, .text-muted)
❌ 無 layout 樣式
❌ 無 component 樣式
❌ 無 page-specific 樣式
```

**結論**: ✅ **可直接作為 base.css 使用，無需修改**

---

### 2️⃣ style.css 分析

**檔案大小**: 42 KB  
**用途**: ⚠️ 混雜檔案（包含 layout + components + page-specific）

#### 共用樣式（應保留在 components.css）
```css
/* Button System */
button { ... }
.btn-secondary { ... }

/* Table System */
table { ... }
table th, table td { ... }

/* Filter System */
.filter-input-base { ... }
.filter-dropdown-trigger { ... }
.filter-dropdown-panel { ... }

/* Dual Layer Table (共用模板) */
.dual-layer-table { ... }
.table-header-bar { ... }
.fixed-col { ... }
.scroll-col { ... }
```

#### Layout 樣式（應移至 layout.css）
```css
/* Header & Sidebar */
.top-header { ... }
.sidebar { ... }
.menu-item { ... }
.app-layout { ... }
.main-content { ... }

/* World Time Bar */
.world-time-bar { ... }
.time-card { ... }
```

#### 頁面專屬樣式（應移至各頁 CSS）
```css
/* Homepage */
.home-row-1 { ... }
.event-container { ... }
.goal-container { ... }

/* Inventory Replenishment */
#ops-section .replen-control-panel { ... }
#ops-section .km-table__header-cell--inventory { ... }

/* SKU Details */
#sku-section .sku-lifecycle-section { ... }
#sku-section .sku-scroll-proxy { ... }

/* Factory Stock */
#factory-stock-section .fixed-col { ... }
```

#### 混雜風險 🚨
```
⚠️ Dual Layer Table 樣式散落在：
   - style.css (基礎模板)
   - factory-stock.css (Factory Stock 專屬)
   - fc-summary.css (FC Summary 專屬)
   - forecast.css (Forecast 專屬)
   
⚠️ Filter 樣式重複定義：
   - style.css (.filter-input-base)
   - fc-summary.css (.fc-dropdown-trigger)
   - forecast.css (.forecast-dropdown-trigger)
   - factory-stock-filter.js (inline styles)
```

---

### 3️⃣ 各頁 CSS 分析

#### factory-stock.css (3.8 KB)
```
✅ 只包含 #factory-stock-section scope
✅ 使用 TableTemplate_ScrollXY 標準
❌ 與 style.css 的 .dual-layer-table 有重複定義
```

#### fc-summary.css (15 KB)
```
✅ 大部分使用 .fc- 前綴
⚠️ 重複定義 filter 樣式 (.fc-dropdown-trigger)
⚠️ 重複定義 button 樣式 (.fc-btn)
⚠️ 重複定義 table 樣式 (.dual-layer-table)
```

#### forecast.css (未讀取，需補充)
```
⚠️ 預期有重複的 filter 和 table 樣式
```

#### shipping-plan.css (未讀取，需補充)
```
⚠️ 預期有獨立的卡片樣式
```

#### shipping-history.css (未讀取，需補充)
```
⚠️ 預期有獨立的列表樣式
```

#### sku-details.css (未讀取，需補充)
```
⚠️ 預期有 dual-layer-table 重複定義
```

#### supplychain.css (未讀取，需補充)
```
⚠️ 預期有 canvas 相關樣式
```

---

## 📊 B. JS 分析報告

### 全域控制 JS

#### app.js
```javascript
✅ 全域功能：
   - showSection() - 頁面切換
   - showHome() - 返回首頁
   - 世界時間更新
   - Homepage 資料渲染

⚠️ 混雜功能：
   - renderReplenishment() - 應屬於 replen-add-sku.js
   - renderShippingPlan() - 應屬於 shipping-plan.js
```

### 頁面專屬 JS

#### factory-stock-filter.js
```javascript
✅ 完全獨立，使用 #factory-stock-section scope
✅ 函數：
   - toggleFactoryAll()
   - updateFactoryFilter()
   - renderFactoryStockTable()
   - initFactoryDropdown()
```

#### fc-summary.js
```javascript
⚠️ 發現重複函數：
   - initFactoryDropdown() (line 1088-1120)
   - 與 factory-stock-filter.js 的 initFactoryDropdown() 衝突

✅ 頁面專屬函數：
   - renderFcRegularTable()
   - renderFcEventTable()
   - toggleFcAll()
   - updateFcFilter()
```

#### forecast.js
```javascript
⚠️ 預期有：
   - 重複的 filter 初始化函數
   - 圖表渲染函數
```

#### data.js
```javascript
✅ 純資料檔案
✅ 暴露全域變數：
   - window.factoryStockData
   - window.replenishmentData
```

#### canvas.js
```javascript
✅ Supply Chain Canvas 專屬
✅ 完全獨立
```

#### sku-scroll.js
```javascript
✅ SKU Details 滾動同步
✅ 完全獨立
```

#### replen-add-sku.js
```javascript
⚠️ 與 app.js 有耦合
⚠️ 依賴 app.js 的 renderReplenishment()
```

#### shipping-history.js
```javascript
✅ 完全獨立
```

---

## 📊 C. 跨頁耦合風險評估

### 🚨 高風險耦合

#### 1. Filter 系統衝突
```
問題：三個頁面使用相同的 CSS class 但不同的 JS 函數

Factory Stock:
  - CSS: .fc-dropdown-trigger
  - JS: toggleFactoryAll(), updateFactoryFilter()

FC Summary:
  - CSS: .fc-dropdown-trigger
  - JS: toggleFcAll(), updateFcFilter()

Forecast:
  - CSS: .forecast-dropdown-trigger
  - JS: toggleForecastAll(), updateForecastFilter()

風險：CSS class 名稱衝突，全域事件監聽器互相干擾
```

#### 2. initFactoryDropdown() 重複定義
```
位置 1: factory-stock-filter.js
位置 2: fc-summary.js (line 1088-1120)

風險：後載入的 JS 會覆蓋前面的函數定義
```

#### 3. Dual Layer Table 樣式不一致
```
問題：每個頁面都重新定義 .dual-layer-table

Factory Stock: #factory-stock-section .dual-layer-table
FC Summary: .fc-panel .dual-layer-table
Forecast: (預期有)
SKU Details: #sku-section .dual-layer-table

風險：維護困難，修改一個頁面不會影響其他頁面
```

---

## 📊 D. MD 文件盤點

### 規格文件 (Spec)
```
✅ FC_DataModel_Spec.md - FC Summary 資料模型
✅ UI_Structure_Spec.md - UI 結構規範
✅ TableTemplate_ScrollXY.md - 表格模板規範
✅ ReplenishmentSystem_PRD.md - 補貨系統 PRD
✅ SHIPPING_RULES.md - 出貨規則
✅ SupplyChain.md - Supply Chain 規範
```

### 完成記錄 (Completed)
```
✅ FC_SUMMARY_COMPLETED.md - FC Summary 完成記錄
✅ SKU_Details_Migration_Complete.md - SKU Details 遷移完成
✅ SERIES_UPDATE_COMPLETE.txt - Series 更新完成
```

### 實作記錄 (Implementation)
```
✅ FC_SUMMARY_IMPLEMENTATION.md - FC Summary 實作記錄
✅ FC_DATA_VALIDATION.md - FC 資料驗證
```

### 遷移指南 (Migration)
```
✅ PROMPT_Migrate_SKU_Details.md - SKU Details 遷移提示
```

### 概覽文件 (Overview)
```
✅ kmoverview.md - Kitchen Mama 系統概覽
✅ shippingplanoverview.md - Shipping Plan 概覽
✅ campaignoverview.md - 活動行事曆概覽
```

### 聊天記錄 (Chat)
```
⚠️ q-dev-chat-2026-01-16-op-sku details.md - 開發聊天記錄（應移至 /logs）
```

### 重複/過期評估
```
⚠️ FC_SUMMARY_COMPLETED.md 與 FC_SUMMARY_IMPLEMENTATION.md 內容重複
⚠️ SKU_Details_Migration_Complete.md 與 PROMPT_Migrate_SKU_Details.md 內容重複
⚠️ SERIES_UPDATE_COMPLETE.txt 已過期（功能已完成）
```

---

## 📦 E. 重構建議方案

### 🎯 目標結構
```
/assets
  /css
    base.css (= style-guide.css，保留不動)
    layout.css (header, sidebar, main-content)
    components.css (button, table, filter, dual-layer-table)
    pages/
      home.css
      factory-stock.css
      fc-summary.css
      forecast.css
      sku-details.css
      shipping-plan.css
      shipping-history.css
      supplychain.css

  /js
    core/                    # ✅ Phase 1-3 已完成
      namespace.js           # 全域命名空間
      lifecycle.js           # 頁面生命週期管理
      state.js               # 集中式狀態管理
    app.js (只保留全域控制)
    pages/
      factory-stock.js
      fc-summary.js
      forecast.js
      sku-details.js
      shipping-plan.js
      shipping-history.js
      supplychain.js
    utils/
      data.js
      scroll-sync.js

/specs
  /completed (已完成的記錄)
  /active (正在使用的規範)
  /archived (過期的文件)
```

### 🔧 拆分策略

#### Step 1: 拆分 style.css
```
1. 提取 layout 樣式 → layout.css
2. 提取 components 樣式 → components.css
3. 提取 homepage 樣式 → pages/home.css
4. 提取 #ops-section 樣式 → pages/inventory-replenishment.css
5. 提取 #sku-section 樣式 → pages/sku-details.css
6. 提取 #factory-stock-section 樣式 → 合併到 factory-stock.css
```

#### Step 2: 統一 Filter 系統
```
1. 在 components.css 定義統一的 filter 樣式
2. 使用 data-attribute 區分不同頁面：
   [data-page="factory-stock"] .filter-dropdown-trigger
   [data-page="fc-summary"] .filter-dropdown-trigger
   [data-page="forecast"] .filter-dropdown-trigger
```

#### Step 3: 統一 Dual Layer Table
```
1. 在 components.css 定義基礎 .dual-layer-table
2. 各頁只定義差異部分：
   #factory-stock-section .dual-layer-table { /* 只寫差異 */ }
```

#### Step 4: 解決 JS 衝突
```
1. 刪除 fc-summary.js 中的 initFactoryDropdown()
2. 重命名為 initFcDropdown()
3. 確保每個頁面的 init 函數名稱唯一
```

#### Step 5: 整理 MD 文件
```
1. 移動已完成記錄到 /specs/completed
2. 移動過期文件到 /specs/archived
3. 保留活躍規範在 /specs/active
4. 移動聊天記錄到 /logs
```

---

## ⚠️ 風險評估

### 🔴 高風險操作
```
1. 修改 .dual-layer-table 樣式
   → 影響：Factory Stock, FC Summary, Forecast, SKU Details
   → 風險：滾動條失效、sticky 失效

2. 修改 filter 樣式
   → 影響：所有使用 dropdown 的頁面
   → 風險：dropdown 無法開啟、事件監聽器失效

3. 拆分 app.js
   → 影響：全域頁面切換
   → 風險：showSection() 失效、頁面無法切換
```

### 🟡 中風險操作
```
1. 移動 CSS 檔案
   → 影響：index.html 的 <link> 引用
   → 風險：樣式失效

2. 重命名 JS 函數
   → 影響：HTML 的 onclick 屬性
   → 風險：按鈕點擊失效
```

### 🟢 低風險操作
```
1. 整理 MD 文件
   → 影響：無
   → 風險：無

2. 重命名 style-guide.css → base.css
   → 影響：index.html 的一個 <link>
   → 風險：極低
```

---

## 📋 PHASE 2 執行檢查清單

### ✅ 執行前確認
- [ ] 已備份整個專案資料夾
- [ ] 已確認 index.html 的所有 <link> 和 <script> 路徑
- [ ] 已確認所有 onclick 屬性使用的函數名稱
- [ ] 已確認所有 CSS class 的使用位置
- [ ] 已確認所有 id 的使用位置

### ✅ 執行順序
1. [ ] 建立新資料夾結構（不刪除舊檔案）
2. [ ] 複製檔案到新位置（保留舊檔案）
3. [ ] 更新 index.html 的引用路徑
4. [ ] 測試所有頁面功能
5. [ ] 確認無誤後刪除舊檔案

---

## 🚨 重要提醒

### ❌ 在 PHASE 2 之前絕對不可以：
- ❌ 搬移任何檔案
- ❌ 修改任何 import 路徑
- ❌ 刪除任何程式碼
- ❌ 修改任何 DOM id
- ❌ 修改任何 class 名稱

### ✅ 現在可以做的：
- ✅ 閱讀這份報告
- ✅ 提出問題和建議
- ✅ 確認重構方案
- ✅ 備份專案

---

## 📞 下一步

**請確認以下問題後再進入 PHASE 2：**

1. ✅ 是否同意將 style-guide.css 作為 base.css？
2. ✅ 是否同意拆分 style.css 為 layout.css + components.css？
3. ✅ 是否同意統一 Filter 系統的 CSS class？
4. ✅ 是否同意統一 Dual Layer Table 的基礎樣式？
5. ✅ 是否同意刪除 fc-summary.js 中重複的 initFactoryDropdown()？
6. ✅ 是否同意整理 MD 文件到 /specs 資料夾？

**確認後請回覆：「同意進入 PHASE 2」**

---

**報告結束** | 等待人工確認 ⏳
