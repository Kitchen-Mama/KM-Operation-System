# Kitchen Mama Operation System — 專案現況報告

**最後更新**: 2026-04-09  
**版本**: v3.0  
**技術棧**: HTML / CSS / Vanilla JS + Chart.js  
**架構**: 單頁應用 (SPA)，模組化 CSS + JS

---

## 一、系統總覽

| 項目 | 狀態 |
|------|------|
| 類型 | 單頁應用 (SPA) |
| 技術棧 | HTML / CSS / Vanilla JS + Chart.js |
| 頁面數量 | 10 個功能頁面 + 1 首頁 |
| 主入口 | `index.html`（~2100 行） |
| 全域控制 | `app.js`（~2400 行） |
| 表格規範 | TableTemplate_ScrollXY_Standard v2.0 |
| Sidebar | Collapsible（展開 240px / 收合 64px） |

---

## 二、頁面完成狀態

| # | 頁面名稱 | Section ID | 狀態 | 說明 |
|---|----------|-----------|------|------|
| 1 | 首頁 | `home-section` | ✅ 完成 | Upcoming Event、2026 Goal、公告、Urgent Issue、Personal Notes |
| 2 | 補貨試算器 | `replenishment-section` | ✅ 完成 | 基本計算功能 |
| 3 | 貨物庫存表 (Inventory Replenishment) | `ops-section` | ✅ 完成 | Overview Table + Detailed Table + 展開面板 |
| 4 | Factory Stock | `factory-stock-section` | ✅ 完成 | 篩選器 + 編輯模式 |
| 5 | Forecast Review | `forecast-section` | ✅ 完成 | 圖表 + 統計卡片 + Achievement |
| 6 | 下單系統 (Request Order) | `request-order-section` | ✅ 完成 | 兩層表頭 + 展開面板 + Send Request |
| 7 | FC Summary | `fc-summary-section` | ✅ 完成 | Regular / Event / Target Rules 三分頁 |
| 8 | SKU Details | `sku-section` | ✅ 完成 | Upcoming / Running / Phasing Out 三區塊 |
| 9 | Shipping Plan | `shippingplan-section` | ✅ 完成 | Draft / Pending / Approved 卡片式 |
| 10 | Shipment Overview | `shippinghistory-section` | ✅ 完成 | 篩選 + 搜尋 |
| 11 | Supply Chain Canvas | `supplychain-section` | ✅ 完成 | 畫布工具列 + 縮放 |
| — | Shipping Management | — | 🔒 Stage 2 | 尚未開發 |

---

## 三、最近完成的功能（2026-03 ~ 2026-04）

### 3.1 下單系統表頭重構
- 兩層式表頭結構（Group Header + Sub Header）
- SKU / Risk / Country / Marketplace 跨兩行垂直置中
- 群組分隔：Upcoming FC → Inventory & Ongoing → Coverage & Time → Decision
- Shortage (M1/M2/M3) 隱藏但保留篩選功能
- 視覺層次優化：深綠大標題 + 淺綠小標題 + 灰色基本資訊欄
- 新增 `request-order-table.css` 獨立樣式檔

### 3.2 Inventory Overview Table（新增）
- 位置：篩選器與 Detailed Table 之間
- 結構：dual-layer-table 兩層式表頭
- 標題 Schema：
  - Rowspan（跨兩行）：Warning、Recommend
  - Sales（大標題）→ 1d / 7d / 30d / 90d
  - Amazon（大標題）→ FBA
  - 3rd WH（大標題）→ David / Winit
  - Overseas On The Way（大標題）→ ≤18 Days / ≤45 Days
  - Factory（大標題）→ 侑鑫 / 勝一
- 互動：Series Tabs 篩選 + Shipment Popover 點擊展開
- Mock Data：7 筆（CO1100 / CO1150 / CO1200 系列）
- 配色：Sales 區塊使用藍色系（#9BC2E6 / #CDE1F2）

### 3.3 Sidebar Collapsible 改造
- 展開寬度：240px（顯示 icon + label）
- 收合寬度：64px（只顯示 icon）
- Toggle 按鈕：Menu 文字 + ◀ 圖示
- 收合時子選單自動隱藏
- 主內容區自動跟隨調整 margin-left
- 背景色：#18181b（深色主題）
- 文字色：#d4d4d8（淺灰白）
- Hover tooltip：使用 title attribute

### 3.4 Forecast Review Aggregation Master Spec
- 整合 FC Achievement Monthly 和 Forecast Review 多粒度聚合層
- 4 張聚合表：daily_agg / weekly_agg / monthly_agg / fc_achievement
- 智慧查詢路由：≤30天用 daily、30-90天用 weekly、>90天用 monthly
- SLA 目標：<0.5s / <1s / <2s

---

## 四、檔案結構

```
Operation System/
├── index.html                          # 主入口（~2100 行）
├── SYSTEM_ARCHITECTURE.md              # 系統架構文件
├── REQUEST_ORDER_ENHANCEMENT_SPEC.md   # 下單系統增強規格
├── assets/
│   ├── css/
│   │   ├── base.css                    # Design Tokens (CSS Variables)
│   │   ├── components.css              # 共用元件 (Button, Filter, Table)
│   │   ├── layout.css                  # 全站佈局 (Header, Sidebar, Main)
│   │   └── pages/
│   │       ├── home.css
│   │       ├── inventory-replenishment.css
│   │       ├── factory-stock.css
│   │       ├── fc-overview.css
│   │       ├── fc-raw-data.css
│   │       ├── request-order.css
│   │       ├── request-order-table.css  # 下單系統表頭專用
│   │       ├── sku-details.css
│   │       ├── shipping-plan.css
│   │       ├── shipping-history.css
│   │       └── supply-chain-canvas.css
│   ├── js/
│   │   ├── core/
│   │   │   ├── namespace.js            # KM 全域命名空間
│   │   │   ├── lifecycle.js            # 頁面生命週期管理
│   │   │   └── state.js               # 集中式狀態管理
│   │   ├── utils/
│   │   │   ├── data.js                 # Mock 資料 (DataRepo)
│   │   │   ├── forecast-engine.js      # Forecast 計算引擎
│   │   │   └── scroll-sync.js          # 表格滾動同步
│   │   ├── pages/
│   │   │   ├── inventory-replenishment.js  # 含 Overview Table
│   │   │   ├── factory-stock.js
│   │   │   ├── fc-summary.js
│   │   │   ├── forecast.js
│   │   │   ├── request-order.js
│   │   │   ├── sku-details.js
│   │   │   ├── shipping-plan.js
│   │   │   ├── shipping-history.js
│   │   │   └── supplychain.js
│   │   └── app.js                      # 全域控制 (~2400 行)
│   ├── img/
│   │   └── KM_Red_LOGO (5).png
│   └── specs/
│       ├── active/                     # 正在使用的規範
│       │   ├── project-current-state.md
│       │   ├── KM_Overview_Spec.md
│       │   ├── PROJECT_STRUCTURE_Spec.md
│       │   ├── TableTemplate_ScrollXY_Standard.md
│       │   ├── InventoryReplenishment_PRD.md
│       │   ├── InventoryReplenishment_UI_Spec.md
│       │   ├── Forecast_DataModel_Spec.md
│       │   ├── Forecast_Order_Engine_Spec.md
│       │   ├── Forecast_Review_Aggregation_Master_Spec.md
│       │   ├── ShippingPlan_Rules_Spec.md
│       │   ├── SupplyChainCanvas_Spec.md
│       │   └── STAGE_3_PLAN.md
│       ├── archived/
│       ├── completed/
│       └── logs/
└── backup_legacy_files_20260116/       # 重構前備份
```

---

## 五、核心架構

### 5.1 JS 模組載入順序
```
1. chart.js (CDN)
2. core/namespace.js → core/lifecycle.js → core/state.js
3. utils/forecast-engine.js → utils/data.js → utils/scroll-sync.js
4. pages/*.js (各頁面模組)
5. app.js (全域控制，最後載入)
```

### 5.2 頁面切換機制
- `showSection(section)` 控制頁面顯示/隱藏
- 使用 `KM.lifecycle.switchTo()` 觸發生命週期
- 各頁面透過 `window.renderXxx()` 初始化

### 5.3 表格架構（TableTemplate_ScrollXY_Standard v2.0）
- 所有資料表格使用 `dual-layer-table` div 結構
- 禁止使用 `<table>` HTML 元素
- Fixed column (sticky left) + Scroll column (overflow-x: auto)
- Header scroll sync 使用 `transform: translateX()`
- 統一行高 48px + border-box

### 5.4 Sidebar 架構
- State：DOM class `#appSidebar.is-collapsed`
- 切換：`toggleSidebar()` in app.js
- CSS：`.sidebar.is-collapsed ~ .main-content { margin-left: 64px }`
- 子選單收合時自動隱藏

---

## 六、開發階段進度

### Stage 1（Foundation）— ✅ 已完成
- [x] 所有 10 個頁面 UI 建置
- [x] Mock Data 驅動
- [x] 基本互動（篩選、切換、展開）
- [x] CSS 模組化拆分
- [x] JS 模組化拆分
- [x] Core 系統（Namespace / Lifecycle / State）
- [x] TableTemplate_ScrollXY_Standard 規範制定

### Stage 2（功能深化）— 🔄 進行中
- [x] 下單系統計算邏輯（Shortage / Suggest Order）
- [x] Forecast Review 圖表與統計
- [x] FC Summary 三分頁完整功能
- [x] Inventory Overview Table
- [x] Sidebar Collapsible
- [x] 下單系統兩層表頭重構
- [ ] Shipping Management（尚未開始）
- [ ] 真實資料串接準備

### Stage 3（雲端整合）— 📋 已規劃未執行
- [ ] Phase 4: API Layer（雲端資料移植）
- [ ] Phase 5: Loading State + Async
- [ ] Phase 6: HTML 模組化（index.html 拆分）

---

## 七、已知技術債

| 項目 | 嚴重度 | 說明 |
|------|--------|------|
| app.js 過大 | 中 | ~2400 行，含 Replenishment 完整邏輯 |
| index.html 過大 | 中 | ~2100 行，所有頁面 HTML 集中 |
| CSS 特異性衝突 | 低 | `#ops-section` 規則影響 Overview Table |
| Filter 系統重複 | 低 | 各頁面各自定義 dropdown 樣式 |
| Detailed Table box-shadow 遮蓋 | 已修復 | 用 z-index 121 隔離 Overview |

---

## 八、規範文件索引

| 文件 | 用途 |
|------|------|
| `TableTemplate_ScrollXY_Standard.md` | 表格架構強制規範 |
| `KM_Overview_Spec.md` | 系統開發守則與限制 |
| `PROJECT_STRUCTURE_Spec.md` | 檔案結構分析與重構計畫 |
| `STAGE_3_PLAN.md` | Stage 3 實作計畫 |
| `Forecast_Review_Aggregation_Master_Spec.md` | 聚合層技術規格 |
| `Forecast_DataModel_Spec.md` | Forecast 資料模型 |
| `Forecast_Order_Engine_Spec.md` | 下單計算引擎規格 |
| `InventoryReplenishment_PRD.md` | 庫存補貨 PRD |
| `ShippingPlan_Rules_Spec.md` | 出貨規則 |

---

## 九、下一步建議

1. **Overview Table 顯示修復驗證** — 確認 z-index / box-shadow 修復生效
2. **Overview Table 欄位對齊微調** — Sales 大小標題等寬對齊
3. **Shipping Management** — Stage 2 最後一個未開發頁面
4. **Phase 6: HTML 模組化** — 解決 index.html 過大問題
5. **真實資料串接準備** — 定義 API 介面規格

---

**文件維護者**: Kitchen Mama Engineering  
**更新頻率**: 每次重大功能完成後更新
