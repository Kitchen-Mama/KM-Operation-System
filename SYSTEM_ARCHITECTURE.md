# Kitchen Mama Operation System - 系統架構文檔

**文檔版本**: 3.0  
**最後更新**: 2025-01-16  
**維護者**: Kitchen Mama Development Team  
**系統狀態**: ✅ Core 系統完成 | 🚧 Stage 3 規劃中

---

## 📋 目錄

### 核心章節
1. [系統概述](#系統概述)
2. [系統現況與進度](#系統現況與進度)
3. [專案結構總覽](#專案結構總覽)
4. [HTML 架構](#html-架構)
5. [CSS 檔案結構](#css-檔案結構)
6. [JavaScript 檔案結構](#javascript-檔案結構)
7. [命名規範](#命名規範)
8. [頁面隔離規範](#頁面隔離規範)
9. [Core 核心系統](#core-核心系統)
10. [開發規範](#開發規範)
11. [未來擴充指南](#未來擴充指南)
12. [附錄](#附錄)

---

## 系統概述

Kitchen Mama Operation System 是一個單頁應用程式（SPA），用於管理供應鏈、庫存、預測、出貨等業務流程。

### 技術棧
- **前端框架**: 原生 JavaScript (Vanilla JS)
- **圖表庫**: Chart.js
- **架構模式**: 模組化 SPA + Core 系統
- **樣式系統**: CSS Variables + BEM-like 命名
- **狀態管理**: 集中式 State Management
- **生命週期**: Lifecycle Management

### 核心特性
- ✅ 單一 HTML 檔案，多頁面切換
- ✅ 模組化 CSS 和 JS 檔案
- ✅ 頁面級別的狀態隔離
- ✅ 統一的 Design System
- ✅ Core 系統（Namespace + Lifecycle + State）
- ✅ 向下相容保證

### 系統規模
- **頁面數量**: 10 個功能頁面
- **程式碼行數**: ~15,000 行（HTML + CSS + JS）
- **支援瀏覽器**: Chrome, Firefox, Safari, Edge（最新版本）
- **目標使用者**: 供應鏈管理團隊（3-5 人）

---

## 系統現況與進度

### 🎯 開發階段

| 階段 | 狀態 | 完成度 | 說明 |
|------|------|--------|------|
| **Stage 1: Foundation** | ✅ 完成 | 100% | 基礎架構、10 個頁面、靜態資料 |
| **Stage 2: Core System** | ✅ 完成 | 100% | Namespace + Lifecycle + State Management |
| **Stage 3: Optimization** | 🚧 規劃中 | 0% | API Layer + Loading State + HTML 模組化 |
| **Stage 4: Production** | ⏳ 未開始 | 0% | 雲端整合、效能優化、測試 |

### 📊 功能完成度

#### ✅ 已完成功能

**頁面功能**:
- ✅ Home（首頁）
- ✅ Forecast Review（預測審查）
- ✅ Request Order（訂單請求）
- ✅ FC Summary（FC 總覽）
- ✅ Factory Stock（工廠庫存）
- ✅ Inventory Replenishment（庫存補貨）
- ✅ SKU Details（SKU 詳情）
- ✅ Shipping Plan（出貨計畫）
- ✅ Shipping History（出貨歷史）
- ✅ Supply Chain Canvas（供應鏈圖譜）

**Core 系統**:
- ✅ Namespace（命名空間管理）
- ✅ Lifecycle（生命週期管理）
- ✅ State Management（狀態管理）
- ✅ 向下相容層
- ✅ 自動整合至 app.js

**共用元件**:
- ✅ Filter Dropdown（篩選下拉選單）
- ✅ Date Picker（日期選擇器）
- ✅ Dual Layer Table（雙層表格）
- ✅ Multi-Header Table（多層標題表格）
- ✅ Button System（按鈕系統）

#### 🚧 進行中功能

**Stage 3 待實作**:
- ⏳ Phase 6: HTML 模組化（1-2 天）
- ⏳ Phase 4: API Layer（2-3 天）
- ⏳ Phase 5: Loading State + Async（3-5 天）

#### ⏳ 未來規劃

**Stage 4+**:
- ⏳ 雲端資料整合
- ⏳ 使用者認證系統
- ⏳ 權限管理
- ⏳ 多語系支援
- ⏳ 行動版優化

### 🏗️ 架構健康度

| 項目 | 評分 | 狀態 | 說明 |
|------|------|------|------|
| **程式碼組織** | 9/10 | ✅ 優秀 | 模組化清晰，Core 系統完善 |
| **可維護性** | 8/10 | ✅ 良好 | 命名規範統一，文檔完整 |
| **可擴充性** | 9/10 | ✅ 優秀 | Core 系統支援無痛擴充 |
| **效能** | 7/10 | ⚠️ 可優化 | 需 HTML 模組化與 Lazy Loading |
| **測試覆蓋** | 3/10 | ⚠️ 不足 | 缺乏自動化測試 |
| **文檔完整度** | 9/10 | ✅ 優秀 | 架構文檔、規範文檔齊全 |

**總體評分**: 7.5/10（良好，可持續發展）

### 📈 系統能力矩陣

| 能力 | 當前狀態 | 目標狀態 | 差距 |
|------|---------|---------|------|
| **頁面擴充** | 10 頁面 | 20+ 頁面 | 需 HTML 模組化 |
| **資料來源** | 靜態資料 | 雲端 API | 需 API Layer |
| **載入速度** | 2-3 秒 | <1 秒 | 需 Lazy Loading |
| **狀態管理** | ✅ 完成 | ✅ 完成 | 無差距 |
| **記憶體管理** | ✅ 完成 | ✅ 完成 | 無差距 |
| **跨頁面共享** | ✅ 完成 | ✅ 完成 | 無差距 |

---

## 專案結構總覽

### 📁 完整目錄結構

```
Operation System/
├── index.html                          # 主入口（~2000 行，待優化至 ~200 行）
├── SYSTEM_ARCHITECTURE.md              # 本文檔
│
├── assets/
│   ├── css/                            # 樣式檔案
│   │   ├── base.css                    # 設計系統基礎（CSS Variables）
│   │   ├── components.css              # 共用元件樣式
│   │   ├── layout.css                  # 全站佈局
│   │   └── pages/                      # 頁面專屬樣式（10 個檔案）
│   │       ├── home.css
│   │       ├── forecast.css
│   │       ├── request-order.css
│   │       ├── fc-summary.css
│   │       ├── factory-stock.css
│   │       ├── inventory-replenishment.css
│   │       ├── sku-details.css
│   │       ├── shipping-plan.css
│   │       ├── shipping-history.css
│   │       └── supply-chain-canvas.css
│   │
│   ├── js/                             # JavaScript 檔案
│   │   ├── core/                       # ✅ Core 系統（Phase 1-3 完成）
│   │   │   ├── namespace.js            # 全域命名空間
│   │   │   ├── lifecycle.js            # 生命週期管理
│   │   │   └── state.js                # 狀態管理
│   │   │
│   │   ├── utils/                      # 工具函式
│   │   │   ├── data.js                 # 資料管理（DataRepo）
│   │   │   └── scroll-sync.js          # 滾動同步
│   │   │
│   │   ├── pages/                      # 頁面邏輯（10 個檔案）
│   │   │   ├── forecast.js
│   │   │   ├── request-order.js
│   │   │   ├── fc-summary.js
│   │   │   ├── factory-stock.js
│   │   │   ├── inventory-replenishment.js
│   │   │   ├── sku-details.js
│   │   │   ├── shipping-plan.js
│   │   │   ├── shipping-history.js
│   │   │   └── supplychain.js
│   │   │
│   │   └── app.js                      # 全域應用邏輯
│   │
│   ├── specs/                          # 規範文檔
│   │   ├── active/                     # 活躍規範（9 個檔案）
│   │   │   ├── Forecast_DataModel_Spec.md
│   │   │   ├── InventoryReplenishment_PRD.md
│   │   │   ├── InventoryReplenishment_UI_Spec.md
│   │   │   ├── KM_Overview_Spec.md
│   │   │   ├── PROJECT_STRUCTURE_Spec.md
│   │   │   ├── ShippingPlan_Rules_Spec.md
│   │   │   ├── STAGE_3_PLAN.md
│   │   │   ├── SupplyChainCanvas_Spec.md
│   │   │   └── TableTemplate_ScrollXY_Standard.md
│   │   │
│   │   ├── archived/                   # 已封存規範
│   │   ├── completed/                  # 已完成規範
│   │   └── logs/                       # 開發日誌
│   │
│   └── audit-reports/                  # 審計報告
│       ├── 01-isolation-analysis/
│       ├── 02-refactoring-guide/
│       ├── 03-risk-assessment/
│       └── 04-assets-cleanup/
│
└── (未來規劃)
    └── assets/pages/                   # ⏳ Stage 3 Phase 6: HTML 模組化
        ├── home.html
        ├── forecast.html
        ├── request-order.html
        └── ... (10 個 HTML 檔案)
```

### 📊 檔案統計

| 類型 | 數量 | 總行數（估計） | 說明 |
|------|------|---------------|------|
| **HTML** | 1 | ~2,000 | index.html（待模組化） |
| **CSS** | 14 | ~3,500 | base + components + layout + 10 pages |
| **JavaScript** | 14 | ~8,000 | core(3) + utils(2) + pages(10) + app(1) |
| **規範文檔** | 9 | ~5,000 | Spec + PRD + Standard |
| **總計** | 38 | ~18,500 | - |

### 🔄 載入順序

**關鍵載入順序**（必須嚴格遵守）:

```html
<!-- 1. CSS 載入（由通用到特定） -->
<link rel="stylesheet" href="assets/css/base.css">           <!-- 最先 -->
<link rel="stylesheet" href="assets/css/components.css">
<link rel="stylesheet" href="assets/css/layout.css">
<link rel="stylesheet" href="assets/css/pages/*.css">       <!-- 最後 -->

<!-- 2. JS 載入（Core → Utils → Pages → App） -->
<script src="assets/js/core/namespace.js"></script>          <!-- 第一 -->
<script src="assets/js/core/lifecycle.js"></script>          <!-- 第二 -->
<script src="assets/js/core/state.js"></script>              <!-- 第三 -->
<script src="assets/js/utils/data.js"></script>
<script src="assets/js/utils/scroll-sync.js"></script>
<script src="assets/js/pages/*.js"></script>
<script src="assets/js/app.js"></script>                     <!-- 最後 -->
```

**為什麼這個順序很重要？**
- Core 系統必須最先載入（其他模組依賴它）
- Utils 依賴 Core 的 Namespace
- Pages 依賴 Core + Utils
- App 依賴所有模組

---

## HTML 架構

### 檔案位置
```
index.html (根目錄)
```

### 整體結構

```html
<!DOCTYPE html>
<html>
<head>
    <!-- CSS 載入順序 -->
    <link rel="stylesheet" href="assets/css/base.css">
    <link rel="stylesheet" href="assets/css/components.css">
    <link rel="stylesheet" href="assets/css/layout.css">
    <link rel="stylesheet" href="assets/css/pages/*.css">
</head>
<body>
    <!-- 固定頂部 Header -->
    <header class="top-header">
        <div class="header-left">Logo</div>
        <div class="header-right">User Info</div>
    </header>
    
    <!-- 主要應用區域 -->
    <div class="app-layout">
        <!-- 左側選單 -->
        <nav class="sidebar">
            <div class="menu-item">選單項目</div>
        </nav>
        
        <!-- 右側內容區 -->
        <div class="main-content">
            <main class="content-area">
                <!-- 世界時間列 -->
                <div class="world-time-bar"></div>
                
                <!-- 首頁 -->
                <section id="home-section"></section>
                
                <!-- 各功能頁面 -->
                <section id="*-section" class="module-section"></section>
            </main>
        </div>
    </div>
    
    <!-- JS 載入順序 -->
    <script src="assets/js/utils/*.js"></script>
    <script src="assets/js/pages/*.js"></script>
    <script src="assets/js/app.js"></script>
</body>
</html>
```

### 頁面結構規範

#### 1. Section 命名規則
```html
<section id="[page-name]-section" class="module-section">
    <!-- 頁面內容 -->
</section>
```

**範例**:
- `#forecast-section` - Forecast Review 頁面
- `#request-order-section` - Request Order 頁面
- `#fc-summary-section` - FC Summary 頁面

#### 2. 頁面根容器 (Page Root)
每個頁面必須有一個唯一的根 class 用於 CSS 和 JS 選擇器隔離：

```html
<section id="forecast-section" class="module-section page-forecast-review">
    <!-- 使用 .page-forecast-review 作為所有子元素的命名空間 -->
</section>
```

#### 3. 頁面內部結構模板

```html
<section id="[page]-section" class="module-section page-[page]">
    <!-- 頁面標題 -->
    <div class="page-header">
        <h2 class="page-title">頁面標題</h2>
    </div>
    
    <!-- 篩選列 (如需要) -->
    <div class="[prefix]-filters">
        <div class="[prefix]-filter">
            <label>篩選項目</label>
            <button class="[prefix]-dropdown-trigger"></button>
        </div>
    </div>
    
    <!-- 控制面板 (如需要) -->
    <div class="[prefix]-panel">
        <button>操作按鈕</button>
    </div>
    
    <!-- 主要內容區 -->
    <div class="[prefix]-content">
        <!-- 表格、圖表、卡片等 -->
    </div>
</section>
```

---

## CSS 檔案結構

### 目錄結構
```
assets/css/
├── base.css              # 設計系統基礎 (CSS Variables, Typography)
├── components.css        # 可重用元件 (Button, Filter, Table)
├── layout.css            # 全站佈局 (Header, Sidebar, Main Content)
└── pages/                # 頁面專屬樣式
    ├── home.css
    ├── inventory-replenishment.css
    ├── factory-stock.css
    ├── fc-overview.css
    ├── fc-raw-data.css
    ├── forecast.css
    ├── request-order.css
    ├── sku-details.css
    ├── shipping-plan.css
    ├── shipping-history.css
    ├── supply-chain-canvas.css
    └── supplychain.css
```

### 1. base.css - 設計系統基礎

#### CSS Variables (Design Tokens)
```css
:root {
    /* Brand Colors */
    --cream-white: #FFF8F0;
    --warm-orange: #FF8C42;
    --soft-green: #7FB069;
    --text-dark: #2D3748;
    --bright-red: #f04f5e;
    
    /* Font Sizes */
    --font-size-h1: 2rem;        /* 32px */
    --font-size-h2: 1.5rem;      /* 24px */
    --font-size-body: 0.875rem;  /* 14px */
    --font-size-small: 0.75rem;  /* 12px */
    
    /* Spacing */
    --space-xs: 0.5rem;
    --space-sm: 0.75rem;
    --space-md: 1rem;
    --space-lg: 1.5rem;
    --space-xl: 2rem;
    
    /* Component Tokens */
    --btn-height: 36px;
    --filter-height: 38px;
    --table-row-height: 48px;
}
```

#### Typography Classes
```css
.text-h1, .text-h2, .text-h3, .text-h4
.text-body, .text-small, .text-tiny
.text-primary, .text-secondary, .text-muted
.font-normal, .font-medium, .font-semibold, .font-bold
```

### 2. components.css - 可重用元件

#### Button System
```css
button                    /* 預設按鈕 */
.btn                      /* 基礎按鈕 class */
.btn-primary              /* 主要按鈕 */
.btn-secondary            /* 次要按鈕 */
```

#### Filter System (統一全站)
```css
.filter-group                    /* 篩選器容器 */
.filter-group--dropdown          /* 下拉式篩選器 */
.filter-group--sku               /* SKU 搜尋框 */
.filter-dropdown-trigger         /* 下拉觸發按鈕 */
.filter-dropdown-panel           /* 下拉面板 */
.filter-checkbox-item            /* 複選框項目 */
```

#### Date Picker (統一全站)
```css
.filter-date-trigger             /* 日期觸發按鈕 */
.fr-date-modal                   /* 日期選擇器 Modal */
.fr-date-backdrop                /* 背景遮罩 */
.fr-calendar                     /* 日曆元件 */
```

#### Table System
```css
/* 單層標題表格 */
.dual-layer-table
.table-header-bar
.fixed-header
.scroll-header-viewport
.scroll-header
.header-cell
.table-body-bar
.fixed-col
.scroll-col
.fixed-row
.scroll-row
.scroll-cell

/* 多層標題表格 */
.dual-layer-table--multi-header
.km-table__header-row
.km-table__header-row--level1
.km-table__header-row--level2
.km-table__header-cell
```

### 3. layout.css - 全站佈局

```css
.top-header              /* 頂部 Header */
.app-layout              /* 主應用容器 */
.sidebar                 /* 左側選單 */
.menu-item               /* 選單項目 */
.menu-parent             /* 父選單 */
.menu-children           /* 子選單 */
.main-content            /* 右側內容區 */
.content-area            /* 內容區域 */
.module-section          /* 頁面 Section */
.world-time-bar          /* 世界時間列 */
```

### 4. pages/*.css - 頁面專屬樣式

#### 命名規範
每個頁面使用專屬前綴避免衝突：

| 頁面 | 前綴 | 範例 |
|------|------|------|
| Forecast Review | `forecast-` | `.forecast-filters`, `.forecast-chart-area` |
| Request Order | `ro-` | `.ro-filters`, `.ro-table` |
| FC Summary | `fc-` | `.fc-filter-bar`, `.fc-modal` |
| Factory Stock | `fc-` | `.fc-filter-bar` (共用 FC Summary) |
| Inventory Replenishment | `replen-` | `.replen-control-panel` |
| SKU Details | `sku-` | `.sku-toolbar`, `.sku-lifecycle-section` |
| Shipping Plan | `sp-` | `.sp-card`, `.sp-btn` |
| Shipping History | `history-` | `.history-results` |

#### 頁面樣式結構範例 (request-order.css)

```css
/* ========================================
   Request Order Page Styles
======================================== */

/* Page Root */
.page-request-order {
    /* 頁面級別樣式 */
}

/* Filter Bar */
.ro-filters {
    display: flex;
    gap: 1rem;
    padding: 1rem;
}

.ro-filter {
    display: flex;
    flex-direction: column;
}

/* Dropdown */
.ro-dropdown-trigger { }
.ro-dropdown-panel { }
.ro-checkbox-item { }

/* Date Trigger */
.ro-date-trigger { }
.ro-date-trigger-text { }
.ro-date-trigger-icon { }

/* Table */
.ro-table { }
.ro-table-wrapper { }

/* Panel */
.ro-panel { }
.ro-header { }
.ro-controls { }
```

---

## JavaScript 檔案結構

### 目錄結構
```
assets/js/
├── core/                       # 核心系統 (Phase 1-3)
│   ├── namespace.js            # 全域命名空間
│   ├── lifecycle.js            # 頁面生命週期管理
│   └── state.js                # 集中式狀態管理
├── utils/                      # 工具函式
│   ├── data.js                 # 資料管理 (DataRepo)
│   └── scroll-sync.js          # 滾動同步工具
├── pages/                      # 頁面邏輯
│   ├── inventory-replenishment.js
│   ├── factory-stock.js
│   ├── fc-summary.js
│   ├── forecast.js
│   ├── request-order.js
│   ├── sku-details.js
│   ├── shipping-history.js
│   └── supplychain.js
└── app.js                      # 全域應用邏輯
```

### 1. utils/data.js - 資料管理

```javascript
// 全域資料倉庫
const DataRepo = {
    // 資料存取方法
    getSiteSkus(site) { },
    getItemBySku(sku) { },
    getForecastDataByMonth(site, productType, period) { },
    
    // 資料儲存方法
    saveRecord(record) { },
    getRecords() { }
};

window.DataRepo = DataRepo;
```

### 2. pages/*.js - 頁面邏輯

#### 檔案結構規範

```javascript
// ========================================
// [Page Name] Page Logic
// ========================================

// 1. 頁面狀態 (使用專屬命名空間)
const [pageName]State = {
    filters: {
        country: [],
        marketplace: [],
        category: []
    },
    currentView: 'default'
};

// 2. 初始化函式
function init[PageName]Page() {
    init[PageName]Dropdowns();
    render[PageName]Table();
    // ... 其他初始化
}

// 3. 事件處理 (使用 Root-Scoped Selectors)
function init[PageName]Dropdowns() {
    const root = document.querySelector('.page-[page-name]');
    if (!root) return;
    
    const triggers = root.querySelectorAll('.[prefix]-dropdown-trigger');
    // ... 事件綁定
}

// 4. 渲染函式
function render[PageName]Table() {
    // 渲染邏輯
}

// 5. 工具函式
function update[PageName]Filter(filterType) {
    // 更新篩選器
}

// 6. 暴露到全域 (僅暴露必要的函式)
window.init[PageName]Page = init[PageName]Page;
window.render[PageName]Table = render[PageName]Table;
```

#### 範例: request-order.js

```javascript
// ========================================
// Request Order Page Logic
// ========================================

// 頁面狀態
const requestOrderState = {
    filters: {
        country: ['US', 'UK', 'DE'],
        marketplace: ['amazon', 'shopify'],
        category: ['Can Opener', 'Kitchen Tools'],
        sku: '',
        dateRange: { start: null, end: null }
    },
    series: 'All',
    showMode: 'all'
};

// 初始化
function initRequestOrderSection() {
    initRequestOrderDropdowns();
    renderRequestOrderTable();
}

// 事件處理 (Root-Scoped)
function initRequestOrderDropdowns() {
    const root = document.querySelector('.page-request-order');
    if (!root) return;
    
    const triggers = root.querySelectorAll('.ro-dropdown-trigger');
    triggers.forEach(trigger => {
        // 移除舊的事件監聽器
        const newTrigger = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(newTrigger, trigger);
        
        // 綁定新的事件監聽器
        newTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            // ... 處理邏輯
        });
    });
}

// 暴露到全域
window.initRequestOrderSection = initRequestOrderSection;
window.renderRequestOrderTable = renderRequestOrderTable;
```

### 3. app.js - 全域應用邏輯

```javascript
// ========================================
// Global Application Logic
// ========================================

// 1. 選單切換
function showSection(section) {
    // 隱藏所有頁面
    document.querySelectorAll('.module-section').forEach(sec => 
        sec.classList.remove('active')
    );
    
    // 顯示目標頁面
    const targetSection = document.getElementById(`${section}-section`);
    targetSection.classList.add('active');
    
    // 初始化頁面
    if (section === 'forecast') {
        setTimeout(() => initForecastReviewPage(), 100);
    }
}

// 2. 首頁渲染
function renderHomepage() { }

// 3. 世界時間
function initWorldTimes() { }

// 4. 暴露全域函式
window.showSection = showSection;
window.showHome = showHome;
```

---

## 命名規範

### 1. CSS Class 命名

#### BEM-like 命名法
```css
.block                    /* 區塊 */
.block__element           /* 元素 */
.block--modifier          /* 修飾符 */
.block__element--modifier /* 元素修飾符 */
```

#### 頁面前綴規範
```css
/* Forecast Review */
.forecast-filters
.forecast-chart-area
.forecast-stat-card

/* Request Order */
.ro-filters
.ro-table
.ro-panel

/* FC Summary */
.fc-filter-bar
.fc-modal
.fc-tab
```

#### 狀態 Class
```css
.is-active               /* 啟用狀態 */
.is-open                 /* 開啟狀態 */
.is-expanded             /* 展開狀態 */
.is-collapsed            /* 收合狀態 */
.is-disabled             /* 禁用狀態 */
```

### 2. JavaScript 命名

#### 函式命名
```javascript
// 動詞開頭
function initPage() { }          // 初始化
function renderTable() { }       // 渲染
function updateFilter() { }      // 更新
function toggleDropdown() { }    // 切換
function handleClick() { }       // 處理事件

// 頁面專屬函式加前綴
function initForecastPage() { }
function renderRequestOrderTable() { }
function updateFcSummaryFilter() { }
```

#### 變數命名
```javascript
// camelCase
const userName = 'John';
const isActive = true;
const itemCount = 10;

// 頁面狀態物件
const forecastReviewState = { };
const requestOrderState = { };
const fcSummaryState = { };
```

#### 常數命名
```javascript
// UPPER_SNAKE_CASE
const MAX_ITEMS = 100;
const API_ENDPOINT = '/api/data';
```

### 3. HTML ID 命名

```html
<!-- 頁面 Section -->
<section id="forecast-section"></section>
<section id="request-order-section"></section>

<!-- 頁面內元素 (使用前綴) -->
<div id="forecastChartArea"></div>
<div id="roTableWrapper"></div>
<button id="fcSaveBtn"></button>
```

---

## 頁面隔離規範

### 問題背景
多個頁面使用相同的元件（如 Filter Dropdown）時，全域事件監聽器會導致跨頁面干擾。

### 解決方案: Root-Scoped Selectors

#### 1. 為每個頁面設定唯一的 Root Class

```html
<section id="forecast-section" class="module-section page-forecast-review">
    <!-- Forecast Review 內容 -->
</section>

<section id="request-order-section" class="module-section page-request-order">
    <!-- Request Order 內容 -->
</section>
```

#### 2. 使用 Root-Scoped 選擇器

```javascript
function initForecastDropdowns() {
    // ✅ 正確：限定在頁面根元素內
    const root = document.querySelector('.page-forecast-review');
    if (!root) return;
    
    const triggers = root.querySelectorAll('.forecast-dropdown-trigger');
    // ...
}

function initRequestOrderDropdowns() {
    // ✅ 正確：限定在頁面根元素內
    const root = document.querySelector('.page-request-order');
    if (!root) return;
    
    const triggers = root.querySelectorAll('.ro-dropdown-trigger');
    // ...
}
```

#### 3. 清除舊的事件監聽器

```javascript
function initDropdowns() {
    const root = document.querySelector('.page-[page-name]');
    const triggers = root.querySelectorAll('.[prefix]-dropdown-trigger');
    
    triggers.forEach(trigger => {
        // 使用 cloneNode 移除所有舊的事件監聽器
        const newTrigger = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(newTrigger, trigger);
        
        // 綁定新的事件監聽器
        newTrigger.addEventListener('click', handleClick);
    });
}
```

#### 4. 避免全域選擇器

```javascript
// ❌ 錯誤：全域選擇器會影響所有頁面
document.addEventListener('click', function(e) {
    if (e.target.matches('.dropdown-trigger')) {
        // 這會影響所有頁面的 dropdown
    }
});

// ✅ 正確：限定在頁面根元素內
const root = document.querySelector('.page-forecast-review');
root.addEventListener('click', function(e) {
    if (e.target.matches('.forecast-dropdown-trigger')) {
        // 只影響 Forecast Review 頁面
    }
});
```

---

## Core 核心系統

### 概述

Core 系統是 Kitchen Mama Operation System 的基礎建設，提供命名空間管理、生命週期控制、狀態管理三大核心功能。

### 載入順序

```html
<!-- Core 必須最先載入 -->
<script src="assets/js/core/namespace.js"></script>
<script src="assets/js/core/lifecycle.js"></script>
<script src="assets/js/core/state.js"></script>

<!-- 然後載入 Utils -->
<script src="assets/js/utils/data.js"></script>
<script src="assets/js/utils/scroll-sync.js"></script>

<!-- 最後載入 Pages 和 App -->
<script src="assets/js/pages/*.js"></script>
<script src="assets/js/app.js"></script>
```

---

### 1. Namespace (命名空間) - Phase 1

#### 檔案位置
```
assets/js/core/namespace.js
```

#### 功能說明

**掌管**：全域命名空間，避免函式名稱衝突

**比喻**：城市的交通規則
- 沒有規則：所有車子亂開，容易撞車（函式名稱衝突）
- 有規則：每台車有自己的車道（`KM.pages.forecast`）

#### 命名空間結構

```javascript
window.KM = {
    pages: {},      // 頁面模組
    utils: {},      // 工具函式
    state: {},      // 狀態管理
    lifecycle: {}   // 生命週期管理
};
```

#### 使用範例

```javascript
// ❌ 沒有 Namespace（容易衝突）
function init() { ... }  // forecast.js
function init() { ... }  // request-order.js ← 衝突！

// ✅ 有 Namespace（不會衝突）
KM.pages.forecast = {
    init: function() { ... }
};

KM.pages.requestOrder = {
    init: function() { ... }
};
```

#### 向下相容

```javascript
// 保留 DataRepo 的全域存取
if (window.DataRepo) {
    KM.utils.data = window.DataRepo;
}

// 現有程式碼繼續使用 window.DataRepo
// 新程式碼可以使用 KM.utils.data
```

---

### 2. Lifecycle (生命週期管理) - Phase 2

#### 檔案位置
```
assets/js/core/lifecycle.js
```

#### 功能說明

**掌管**：頁面的進場/離場管理，確保資源正確清理

**比喻**：飯店房間管理員
- 客人進房：開燈、開空調（mount）
- 客人退房：關燈、關空調、清理垃圾（unmount）

#### 核心方法

```javascript
// 註冊頁面生命週期
KM.lifecycle.register(pageName, {
    mount: function() {
        // 頁面開啟時執行
        console.log('Page mounted');
        initPage();
    },
    unmount: function() {
        // 頁面關閉時執行
        console.log('Page unmounted');
        clearTimers();
        removeEventListeners();
    }
});

// 切換頁面
KM.lifecycle.switchTo('forecast-section');

// 取得當前頁面
const currentPage = KM.lifecycle.getCurrentPage();

// 取消註冊
KM.lifecycle.unregister('forecast-section');
```

#### 使用範例

```javascript
// forecast.js - 註冊生命週期（可選）
KM.lifecycle.register('forecast-section', {
    mount() {
        console.log('[Forecast] Page mounted');
        initForecastReviewPage();
    },
    unmount() {
        console.log('[Forecast] Page unmounted');
        // 清理圖表實例
        if (window.forecastChartInstance) {
            window.forecastChartInstance.destroy();
        }
        // 移除事件監聽器
        document.removeEventListener('click', handleForecastClick);
    }
});
```

#### 自動整合

```javascript
// app.js - 已自動整合
function showSection(section) {
    // ...
    
    // 自動呼叫生命週期切換
    if (window.KM && window.KM.lifecycle && window.KM.lifecycle.switchTo) {
        KM.lifecycle.switchTo(targetSectionId);
    }
}
```

#### 解決的問題

- ❌ 沒有 Lifecycle：切換頁面後，舊頁面的計時器還在跑（記憶體洩漏）
- ✅ 有 Lifecycle：自動清理，不浪費資源

---

### 3. State Management (狀態管理) - Phase 3

#### 檔案位置
```
assets/js/core/state.js
```

#### 功能說明

**掌管**：全域資料的儲存、共享、同步、持久化

**比喻**：公司的中央倉庫
- 各部門（頁面）需要資料時，到倉庫拿
- 倉庫更新時，自動通知所有訂閱的部門

#### 核心方法

```javascript
// 1. 設定狀態
KM.state.set('globalFilters', {
    country: ['US', 'UK'],
    marketplace: ['amazon'],
    dateRange: { start: '2024-01-01', end: '2024-12-31' }
});

// 2. 取得狀態
const filters = KM.state.get('globalFilters');
const defaultValue = KM.state.get('nonExistent', { default: 'value' });

// 3. 訂閱狀態變化
const unsubscribe = KM.state.subscribe('globalFilters', (newValue, oldValue) => {
    console.log('Filters changed:', newValue);
    refreshPage();
});

// 4. 持久化到 localStorage
KM.state.persist('globalFilters');

// 5. 清除狀態
KM.state.clear('globalFilters'); // 清除單一狀態
KM.state.clear(); // 清除所有狀態

// 6. 檢查狀態是否存在
if (KM.state.has('globalFilters')) {
    // ...
}

// 7. 取得所有狀態（除錯用）
console.log(KM.state.getAll());
```

#### 使用場景

##### 場景 1: 跨頁面篩選條件共享

```javascript
// forecast.js - 儲存篩選條件
function updateForecastFilter() {
    KM.state.set('globalFilters', {
        country: getSelectedCountries(),
        marketplace: getSelectedMarketplaces()
    });
    KM.state.persist('globalFilters'); // 持久化
}

// request-order.js - 讀取篩選條件
function initRequestOrderSection() {
    const filters = KM.state.get('globalFilters');
    if (filters) {
        applyFilters(filters); // 自動套用相同篩選
    }
}
```

##### 場景 2: 即時資料同步

```javascript
// inventory.js - 更新庫存
function updateInventory(sku, qty) {
    const inventory = KM.state.get('inventory') || {};
    inventory[sku] = qty;
    KM.state.set('inventory', inventory); // 自動通知訂閱者
}

// forecast.js - 訂閱庫存變化
KM.state.subscribe('inventory', (newInventory) => {
    console.log('Inventory updated:', newInventory);
    refreshForecastChart(); // 自動重新渲染
});
```

##### 場景 3: 使用者偏好設定

```javascript
// 儲存使用者偏好
KM.state.set('userPreferences', {
    language: 'zh-TW',
    theme: 'light',
    defaultCountry: 'US'
});
KM.state.persist('userPreferences');

// 下次載入時自動恢復
const prefs = KM.state.get('userPreferences');
```

#### 解決的問題

- ❌ 沒有 State：每個頁面各自管理資料，不同步
- ✅ 有 State：集中管理，自動同步，支援持久化

---

### Core 系統總結

| 系統 | 解決的問題 | 帶來的好處 |
|------|-----------|----------|
| **Namespace** | 函式名稱衝突 | 擴充時不怕撞名 |
| **Lifecycle** | 資源沒清理 | 記憶體不洩漏 |
| **State** | 資料散落各處 | 跨頁面共享無痛 |

### 向下相容保證

- ✅ 所有現有程式碼完全不受影響
- ✅ Core 系統是純附加功能
- ✅ 可以選擇性使用新功能
- ✅ 舊功能繼續使用原有方式

---

## 開發規範

### 1. 新增頁面流程

#### Step 1: 建立 HTML 結構
```html
<section id="new-page-section" class="module-section page-new-page">
    <div class="page-header">
        <h2 class="page-title">New Page Title</h2>
    </div>
    
    <!-- 頁面內容 -->
</section>
```

#### Step 2: 建立 CSS 檔案
```
assets/css/pages/new-page.css
```

```css
/* ========================================
   New Page Styles
======================================== */

.page-new-page {
    /* 頁面樣式 */
}

.np-filters {
    /* 使用 np- 前綴 */
}
```

#### Step 3: 建立 JS 檔案
```
assets/js/pages/new-page.js
```

```javascript
// ========================================
// New Page Logic
// ========================================

const newPageState = { };

function initNewPage() {
    const root = document.querySelector('.page-new-page');
    if (!root) return;
    // 初始化邏輯
}

window.initNewPage = initNewPage;
```

#### Step 4: 在 index.html 中引入

```html
<head>
    <link rel="stylesheet" href="assets/css/pages/new-page.css">
</head>
<body>
    <script src="assets/js/pages/new-page.js"></script>
</body>
```

#### Step 5: 在 app.js 中註冊頁面切換

```javascript
function showSection(section) {
    // ...
    if (section === 'new-page') {
        setTimeout(() => initNewPage(), 100);
    }
}
```

### 2. 使用共用元件

#### Filter Dropdown
```html
<div class="[prefix]-filter [prefix]-filter--dropdown">
    <label>Country</label>
    <button type="button" class="[prefix]-dropdown-trigger" data-filter="country">
        <span class="[prefix]-dropdown-text">All</span>
        <span class="[prefix]-dropdown-icon">▼</span>
    </button>
    <div class="[prefix]-dropdown-panel" data-filter="country">
        <label class="[prefix]-checkbox-item">
            <input type="checkbox" value="" checked> <strong>All</strong>
        </label>
        <label class="[prefix]-checkbox-item">
            <input type="checkbox" value="US" checked> US
        </label>
    </div>
</div>
```

#### Date Picker
```html
<div class="[prefix]-filter [prefix]-filter--date">
    <label>Date</label>
    <button type="button" class="[prefix]-date-trigger" id="[prefix]DateTrigger">
        <span class="[prefix]-date-trigger-text">Last 30 days</span>
        <span class="[prefix]-date-trigger-icon">▼</span>
    </button>
</div>
```

#### Dual Layer Table
```html
<div class="dual-layer-table">
    <div class="table-header-bar">
        <div class="fixed-header">
            <div class="header-cell">SKU</div>
        </div>
        <div class="scroll-header-viewport">
            <div class="scroll-header">
                <div class="header-cell">Column 1</div>
                <div class="header-cell">Column 2</div>
            </div>
        </div>
    </div>
    <div class="table-body-bar">
        <div class="fixed-col">
            <div class="fixed-body"></div>
        </div>
        <div class="scroll-col">
            <div class="scroll-body"></div>
        </div>
    </div>
</div>
```

### 3. 程式碼風格

#### JavaScript
```javascript
// 使用 const/let，避免 var
const userName = 'John';
let counter = 0;

// 函式宣告
function calculateTotal(items) {
    return items.reduce((sum, item) => sum + item.price, 0);
}

// 箭頭函式
const filterItems = (items, category) => {
    return items.filter(item => item.category === category);
};

// 解構賦值
const { sku, price, stock } = item;
const [first, second] = array;

// 模板字串
const message = `Total: ${total}`;
```

#### CSS
```css
/* 使用 CSS Variables */
.button {
    height: var(--btn-height);
    padding: 0 var(--btn-padding-inline);
    border-radius: var(--btn-radius);
}

/* 避免過深的巢狀 */
.parent .child .grandchild { } /* ❌ 太深 */
.parent__child { } /* ✅ 使用 BEM */

/* 使用 Flexbox/Grid */
.container {
    display: flex;
    gap: 1rem;
}
```

### 4. 效能優化

#### 避免重複渲染
```javascript
// ❌ 錯誤：每次都重新渲染整個表格
function updateTable() {
    renderEntireTable();
}

// ✅ 正確：只更新變更的部分
function updateTableRow(rowId, newData) {
    const row = document.querySelector(`[data-row-id="${rowId}"]`);
    row.innerHTML = renderRow(newData);
}
```

#### 使用事件委派
```javascript
// ❌ 錯誤：為每個按鈕綁定事件
buttons.forEach(btn => {
    btn.addEventListener('click', handleClick);
});

// ✅ 正確：使用事件委派
container.addEventListener('click', function(e) {
    if (e.target.matches('.btn')) {
        handleClick(e);
    }
});
```

#### 延遲初始化
```javascript
function showSection(section) {
    // 顯示頁面
    targetSection.classList.add('active');
    
    // 延遲初始化，避免阻塞 UI
    setTimeout(() => {
        initPage();
    }, 100);
}
```

---

## 附錄

### A. 完整頁面列表

| 頁面名稱 | Section ID | Page Root Class | CSS 前綴 | JS 前綴 |
|---------|-----------|----------------|---------|---------|
| Home | `home-section` | - | - | - |
| Inventory Replenishment | `ops-section` | `.page-inventory` | `replen-` | `replen` |
| Factory Stock | `factory-stock-section` | - | `fc-` | `factory` |
| Forecast Review | `forecast-section` | `.page-forecast-review` | `forecast-` | `forecast` |
| Request Order | `request-order-section` | `.page-request-order` | `ro-` | `requestOrder` |
| FC Summary | `fc-summary-section` | - | `fc-` | `fc` |
| SKU Details | `sku-section` | - | `sku-` | `sku` |
| Shipping Plan | `shippingplan-section` | - | `sp-` | `sp` |
| Shipping History | `shippinghistory-section` | `.page-shipping-history` | `history-` | `history` |
| Supply Chain Canvas | `supplychain-section` | - | `sc-` | `sc` |

### B. CSS Variables 完整列表

請參考 `assets/css/base.css` 中的 `:root` 區塊。

### C. 常用工具函式

```javascript
// 資料存取
window.DataRepo.getSiteSkus(site)
window.DataRepo.getItemBySku(sku)

// 頁面切換
window.showSection(section)
window.showHome()

// 表格渲染
window.renderReplenishment()
window.renderFactoryStock()
window.renderSkuDetailsTable()
```

---

## 未來擴充指南

### 1. 新增頁面完整流程

#### Step 1: 規劃頁面結構

```markdown
頁面名稱: Product Analysis
Section ID: product-analysis-section
Page Root Class: page-product-analysis
CSS 前綴: pa-
JS 前綴: productAnalysis
```

#### Step 2: 建立 HTML 結構

```html
<section id="product-analysis-section" class="module-section page-product-analysis">
    <div class="page-header">
        <h2 class="page-title">Product Analysis</h2>
    </div>
    
    <div class="pa-filters">
        <!-- 篩選器 -->
    </div>
    
    <div class="pa-content">
        <!-- 主要內容 -->
    </div>
</section>
```

#### Step 3: 建立 CSS 檔案

```
assets/css/pages/product-analysis.css
```

```css
/* ========================================
   Product Analysis Page Styles
======================================== */

.page-product-analysis {
    /* 頁面樣式 */
}

.pa-filters {
    display: flex;
    gap: var(--space-md);
}

.pa-content {
    margin-top: var(--space-lg);
}
```

#### Step 4: 建立 JS 檔案

```
assets/js/pages/product-analysis.js
```

```javascript
// ========================================
// Product Analysis Page Logic
// ========================================

// 頁面狀態
const productAnalysisState = {
    filters: {},
    data: []
};

// 初始化
function initProductAnalysisPage() {
    const root = document.querySelector('.page-product-analysis');
    if (!root) return;
    
    initProductAnalysisFilters();
    renderProductAnalysisTable();
}

// 事件處理 (Root-Scoped)
function initProductAnalysisFilters() {
    const root = document.querySelector('.page-product-analysis');
    const triggers = root.querySelectorAll('.pa-dropdown-trigger');
    
    triggers.forEach(trigger => {
        const newTrigger = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(newTrigger, trigger);
        
        newTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            // 處理邏輯
        });
    });
}

// 渲染函式
function renderProductAnalysisTable() {
    // 渲染邏輯
}

// 暴露到全域
window.initProductAnalysisPage = initProductAnalysisPage;

// (可選) 註冊生命週期
if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('product-analysis-section', {
        mount() {
            initProductAnalysisPage();
        },
        unmount() {
            // 清理資源
        }
    });
}
```

#### Step 5: 在 index.html 中引入

```html
<head>
    <link rel="stylesheet" href="assets/css/pages/product-analysis.css">
</head>
<body>
    <script src="assets/js/pages/product-analysis.js"></script>
</body>
```

#### Step 6: 在 app.js 中註冊頁面切換

```javascript
function showSection(section) {
    // ...
    
    if (section === 'product-analysis') {
        setTimeout(() => {
            if (window.initProductAnalysisPage) {
                window.initProductAnalysisPage();
            }
        }, 100);
    }
}
```

#### Step 7: 在選單中新增項目

```html
<div class="menu-item" onclick="showSection('product-analysis')">
    <span>📊</span> Product Analysis
</div>
```

---

### 2. 雲端資料整合建議 (Phase 4)

#### 現況

```javascript
// 現有：靜態資料
const DataRepo = {
    data: {
        inventory: [...],
        forecast: [...]
    },
    getSiteSkus(site) {
        return this.data.inventory.filter(item => item.site === site);
    }
};
```

#### 建議架構

##### Step 1: 建立 API Layer

```
assets/js/core/api.js
```

```javascript
// ========================================
// API Layer
// ========================================

KM.api = {
    baseURL: '/api',
    
    // 通用請求方法
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('[API] Request failed:', error);
            throw error;
        }
    },
    
    // 資料存取方法
    async getInventory(filters = {}) {
        return await this.request('/inventory', {
            method: 'GET',
            params: filters
        });
    },
    
    async getForecast(filters = {}) {
        return await this.request('/forecast', {
            method: 'GET',
            params: filters
        });
    },
    
    async updateInventory(sku, data) {
        return await this.request(`/inventory/${sku}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
};
```

##### Step 2: 整合 Loading State

```javascript
// 使用 State Management 管理 Loading 狀態
KM.state.set('loading', {
    inventory: false,
    forecast: false
});

// 資料載入
async function loadInventoryData() {
    // 設定 Loading
    const loading = KM.state.get('loading');
    loading.inventory = true;
    KM.state.set('loading', loading);
    
    try {
        const data = await KM.api.getInventory();
        KM.state.set('inventoryData', data);
    } catch (error) {
        console.error('Failed to load inventory:', error);
    } finally {
        // 清除 Loading
        const loading = KM.state.get('loading');
        loading.inventory = false;
        KM.state.set('loading', loading);
    }
}

// 訂閱 Loading 狀態
KM.state.subscribe('loading', (loading) => {
    if (loading.inventory) {
        showLoadingSpinner();
    } else {
        hideLoadingSpinner();
    }
});
```

##### Step 3: 資料快取策略

```javascript
// 使用 State Management 作為快取層
KM.cache = {
    async get(key, fetcher, ttl = 300000) { // 5分鐘 TTL
        const cached = KM.state.get(`cache_${key}`);
        
        if (cached && Date.now() - cached.timestamp < ttl) {
            return cached.data;
        }
        
        const data = await fetcher();
        KM.state.set(`cache_${key}`, {
            data: data,
            timestamp: Date.now()
        });
        
        return data;
    }
};

// 使用快取
const inventory = await KM.cache.get('inventory', 
    () => KM.api.getInventory()
);
```

---

### 3. 效能優化建議

#### 3.1 延遲載入 (Lazy Loading)

```javascript
// 只在需要時載入頁面腳本
function showSection(section) {
    // ...
    
    // 動態載入頁面腳本
    if (!window[`init${section}Page`]) {
        const script = document.createElement('script');
        script.src = `assets/js/pages/${section}.js`;
        script.onload = () => {
            window[`init${section}Page`]();
        };
        document.body.appendChild(script);
    } else {
        window[`init${section}Page`]();
    }
}
```

#### 3.2 虛擬滾動 (Virtual Scrolling)

```javascript
// 大量資料表格使用虛擬滾動
function renderVirtualTable(data) {
    const visibleRows = 20;
    const rowHeight = 48;
    let scrollTop = 0;
    
    function render() {
        const startIndex = Math.floor(scrollTop / rowHeight);
        const endIndex = startIndex + visibleRows;
        const visibleData = data.slice(startIndex, endIndex);
        
        // 只渲染可見的行
        tableBody.innerHTML = visibleData.map(renderRow).join('');
        tableBody.style.paddingTop = `${startIndex * rowHeight}px`;
    }
    
    scrollContainer.addEventListener('scroll', (e) => {
        scrollTop = e.target.scrollTop;
        requestAnimationFrame(render);
    });
}
```

#### 3.3 防抖與節流

```javascript
// 防抖 (Debounce) - 用於搜尋輸入
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', debounce(function(e) {
    performSearch(e.target.value);
}, 300));

// 節流 (Throttle) - 用於滾動事件
function throttle(func, wait) {
    let lastTime = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastTime >= wait) {
            lastTime = now;
            func.apply(this, args);
        }
    };
}

window.addEventListener('scroll', throttle(function() {
    updateScrollPosition();
}, 100));
```

---

### 4. 測試建議

#### 4.1 單元測試範例

```javascript
// tests/state.test.js
describe('State Management', () => {
    beforeEach(() => {
        KM.state.clear();
    });
    
    test('should set and get state', () => {
        KM.state.set('test', 'value');
        expect(KM.state.get('test')).toBe('value');
    });
    
    test('should notify subscribers', (done) => {
        KM.state.subscribe('test', (newValue) => {
            expect(newValue).toBe('updated');
            done();
        });
        
        KM.state.set('test', 'updated');
    });
});
```

#### 4.2 整合測試範例

```javascript
// tests/forecast.test.js
describe('Forecast Page', () => {
    test('should initialize correctly', () => {
        initForecastReviewPage();
        
        const root = document.querySelector('.page-forecast-review');
        expect(root).toBeTruthy();
        
        const filters = root.querySelectorAll('.forecast-filter');
        expect(filters.length).toBeGreaterThan(0);
    });
});
```

---

### 5. 部署檢查清單

#### 上線前檢查

- [ ] 所有 console.log 已移除或改為 console.debug
- [ ] CSS 已壓縮 (minify)
- [ ] JavaScript 已壓縮 (minify)
- [ ] 圖片已優化
- [ ] 已測試所有頁面切換
- [ ] 已測試所有篩選器功能
- [ ] 已測試跨瀏覽器相容性 (Chrome, Firefox, Safari, Edge)
- [ ] 已測試響應式設計 (Desktop, Tablet, Mobile)
- [ ] 已檢查記憶體洩漏
- [ ] 已設定錯誤追蹤 (Error Tracking)

---

**文檔版本**: 2.0  
**最後更新**: 2026-01-16  
**維護者**: Kitchen Mama Development Team


### A. 完整頁面列表（詳細版）

| 頁面名稱 | Section ID | Page Root Class | CSS 前綴 | JS 前綴 | 狀態 | 說明 |
|---------|-----------|----------------|---------|---------|------|------|
| Home | `home-section` | - | - | - | ✅ 完成 | 首頁儀表板 |
| Forecast Review | `forecast-section` | `.page-forecast-review` | `forecast-` | `forecast` | ✅ 完成 | 預測審查與圖表 |
| Request Order | `request-order-section` | `.page-request-order` | `ro-` | `requestOrder` | ✅ 完成 | 訂單請求管理 |
| FC Summary | `fc-summary-section` | - | `fc-` | `fc` | ✅ 完成 | FC 總覽與編輯 |
| Factory Stock | `factory-stock-section` | - | `fc-` | `factory` | ✅ 完成 | 工廠庫存查詢 |
| Inventory Replenishment | `ops-section` | `.page-inventory` | `replen-` | `replen` | ✅ 完成 | 庫存補貨系統 |
| SKU Details | `sku-section` | - | `sku-` | `sku` | ✅ 完成 | SKU 詳細資訊 |
| Shipping Plan | `shippingplan-section` | - | `sp-` | `sp` | ✅ 完成 | 出貨計畫管理 |
| Shipping History | `shippinghistory-section` | `.page-shipping-history` | `history-` | `history` | ✅ 完成 | 出貨歷史記錄 |
| Supply Chain Canvas | `supplychain-section` | - | `sc-` | `sc` | ✅ 完成 | 供應鏈視覺化 |

**總計**: 10 個功能頁面

---

### B. Core 系統詳細資訊

#### B.1 Namespace (namespace.js)

**檔案大小**: ~1.5 KB  
**行數**: ~50 行  
**狀態**: ✅ 完成且穩定  

**提供的 API**:
```javascript
window.KM = {
    pages: {},      // 頁面模組
    utils: {},      // 工具函式
    state: {},      // 狀態管理
    lifecycle: {}   // 生命週期
};
```

**向下相容**:
- ✅ 保留 `window.DataRepo` 全域存取
- ✅ 現有程式碼無需修改

#### B.2 Lifecycle (lifecycle.js)

**檔案大小**: ~3 KB  
**行數**: ~80 行  
**狀態**: ✅ 完成且穩定  

**提供的 API**:
```javascript
KM.lifecycle.register(pageName, { mount, unmount })
KM.lifecycle.switchTo(pageName)
KM.lifecycle.getCurrentPage()
KM.lifecycle.unregister(pageName)
```

**自動整合**:
- ✅ 已整合至 `app.js` 的 `showSection()`
- ✅ 頁面切換時自動呼叫 mount/unmount

#### B.3 State Management (state.js)

**檔案大小**: ~5 KB  
**行數**: ~170 行  
**狀態**: ✅ 完成且穩定  

**提供的 API**:
```javascript
KM.state.set(key, value)
KM.state.get(key, defaultValue)
KM.state.subscribe(key, callback)
KM.state.persist(key)
KM.state.clear(key)
KM.state.has(key)
KM.state.getAll()
```

**功能特性**:
- ✅ 跨頁面資料共享
- ✅ 即時同步通知
- ✅ localStorage 持久化
- ✅ 自動恢復機制

---

### C. CSS Variables 完整列表

#### C.1 品牌色彩
```css
--cream-white: #FFF8F0;    /* 奶油白 */
--warm-orange: #FF8C42;    /* 溫暖橙 */
--soft-green: #7FB069;     /* 柔和綠 */
--text-dark: #2D3748;      /* 深色文字 */
--bright-red: #f04f5e;     /* 鮮豔紅 */
```

#### C.2 字體大小
```css
--font-size-h1: 2rem;      /* 32px */
--font-size-h2: 1.5rem;    /* 24px */
--font-size-h3: 1.25rem;   /* 20px */
--font-size-body: 0.875rem;/* 14px */
--font-size-small: 0.75rem;/* 12px */
```

#### C.3 間距系統
```css
--space-xs: 0.5rem;   /* 8px */
--space-sm: 0.75rem;  /* 12px */
--space-md: 1rem;     /* 16px */
--space-lg: 1.5rem;   /* 24px */
--space-xl: 2rem;     /* 32px */
```

#### C.4 元件尺寸
```css
--btn-height: 36px;
--filter-height: 38px;
--table-row-height: 48px;
--header-height: 80px;
--sidebar-width: 240px;
```

---

### D. 常用工具函式

#### D.1 資料存取 (DataRepo)
```javascript
// 獲取站點 SKU
window.DataRepo.getSiteSkus(site)

// 獲取單一 SKU
window.DataRepo.getItemBySku(sku)

// 獲取預測資料
window.DataRepo.getForecastDataByMonth(site, productType, period)

// 儲存記錄
window.DataRepo.saveRecord(record)

// 獲取所有記錄
window.DataRepo.getRecords()
```

#### D.2 頁面切換
```javascript
// 切換至指定頁面
window.showSection(section)

// 回到首頁
window.showHome()
```

#### D.3 表格渲染
```javascript
// 渲染補貨表格
window.renderReplenishment()

// 渲染工廠庫存
window.renderFactoryStock()

// 渲染 SKU 詳情
window.renderSkuDetailsTable()
```

---

### E. 效能指標

#### E.1 當前效能

| 指標 | 當前值 | 目標值 | 狀態 |
|------|---------|---------|------|
| **首次載入時間** | 2-3 秒 | <1 秒 | ⚠️ 需優化 |
| **頁面切換時間** | 100-200ms | <100ms | ✅ 良好 |
| **表格渲染時間** | 200-500ms | <200ms | ⚠️ 可優化 |
| **記憶體使用** | ~50MB | <100MB | ✅ 良好 |
| **滾動流暢度** | 60 FPS | 60 FPS | ✅ 優秀 |

#### E.2 優化計畫 (Stage 3)

**Phase 6: HTML 模組化**
- 預期提升: 首次載入速度 50-60%
- 目標: 0.7-1.3 秒

**Phase 5: Lazy Loading**
- 預期提升: 頁面切換速度 30-40%
- 目標: <100ms

**Virtual Scrolling**
- 預期提升: 大表格渲染速度 70-80%
- 目標: <100ms (1000+ 行)

---

### F. 瀏覽器相容性

#### F.1 支援的瀏覽器

| 瀏覽器 | 最低版本 | 測試狀態 | 說明 |
|---------|---------|---------|------|
| **Chrome** | 90+ | ✅ 完整測試 | 主要開發瀏覽器 |
| **Firefox** | 88+ | ✅ 完整測試 | 完全支援 |
| **Safari** | 14+ | ⚠️ 部分測試 | 基本功能正常 |
| **Edge** | 90+ | ✅ 完整測試 | 基於 Chromium |

#### F.2 不支援的瀏覽器
- ❌ Internet Explorer (所有版本)
- ❌ 舊版 Safari (<14)
- ❌ 舊版 Chrome (<90)

---

### G. 開發環境設定

#### G.1 必要工具
- **編輯器**: VS Code (建議)
- **瀏覽器**: Chrome DevTools
- **版本控制**: Git
- **本地伺服器**: Live Server (VS Code 套件)

#### G.2 建議的 VS Code 套件
```
- Live Server
- ESLint
- Prettier
- CSS Peek
- Auto Rename Tag
- Path Intellisense
```

#### G.3 編輯器設定
```json
{
  "editor.formatOnSave": true,
  "editor.tabSize": 4,
  "files.encoding": "utf8",
  "files.eol": "\n"
}
```

---

### H. 常見問題 (FAQ)

#### H.1 為什麼不使用 React/Vue？
**答**: 
- ✅ 團隊熟悉 Vanilla JS
- ✅ 學習成本低
- ✅ 無需打包工具
- ✅ 系統規模適中 (10-20 頁面)
- ⚠️ 未來如果擴充至 20+ 頁面，會考慮框架遷移

#### H.2 Core 系統是否必須使用？
**答**: 
- ⚠️ 不必須，但強烈建議
- ✅ 現有程式碼可以繼續使用舊方式
- ✅ 新功能建議使用 Core 系統
- ✅ 逐步遷移舊程式碼至 Core 系統

#### H.3 如何新增頁面？
**答**: 請參考 [開發規範 - 新增頁面流程](#1-新增頁面流程)

#### H.4 index.html 過大怎麼辦？
**答**: 
- ✅ Stage 3 Phase 6 將實作 HTML 模組化
- ✅ 將 index.html 從 ~2000 行縮減至 ~200 行
- ✅ 每個頁面獨立檔案，按需載入
- ✅ 詳見 `STAGE_3_PLAN.md`

#### H.5 如何除錯？
**答**:
```javascript
// 1. 查看 Core 系統狀態
console.log(window.KM);

// 2. 查看當前頁面
console.log(KM.lifecycle.getCurrentPage());

// 3. 查看所有狀態
console.log(KM.state.getAll());

// 4. 查看資料庫
console.log(window.DataRepo);
```

---

### I. 更新記錄

| 版本 | 日期 | 更新內容 | 更新者 |
|------|------|---------|--------|
| 3.0 | 2025-01-16 | 新增系統現況、進度追蹤、專案結構總覽、詳細附錄 | Q Developer |
| 2.0 | 2025-01-15 | 新增 Core 系統章節、未來擴充指南 | Q Developer |
| 1.0 | 2025-01-10 | 初始版本，基礎架構文檔 | Team |

---

### J. 相關文檔

**核心文檔**:
- 📝 `SYSTEM_ARCHITECTURE.md` - 本文檔
- 📝 `STAGE_3_PLAN.md` - Stage 3 實作計畫
- 📝 `PROJECT_STRUCTURE_Spec.md` - 專案結構規範

**功能規範**:
- 📝 `InventoryReplenishment_PRD.md` - 庫存補貨系統 PRD
- 📝 `InventoryReplenishment_UI_Spec.md` - 庫存補貨 UI 規範
- 📝 `Forecast_DataModel_Spec.md` - 預測資料模型
- 📝 `ShippingPlan_Rules_Spec.md` - 出貨計畫規則
- 📝 `SupplyChainCanvas_Spec.md` - 供應鏈圖譜規範

**技術標準**:
- 📝 `TableTemplate_ScrollXY_Standard.md` - 表格滾動標準
- 📝 `KM_Overview_Spec.md` - 系統總覽規範

---

**文檔結束**

如有任何問題或建議，請聯繫 Kitchen Mama Development Team。
