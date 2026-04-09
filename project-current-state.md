# Kitchen Mama Operation System — 專案現況報告

**更新日期**: 2025-01-17（拆分完成後）  
**app.js**: 2596 → 392 行（-85%）  
**Lifecycle 註冊**: 10/10 頁面

---

## 一、專案概覽

| 項目 | 內容 |
|------|------|
| 類型 | 單頁應用程式 (SPA) |
| 技術棧 | HTML / CSS / Vanilla JS + Chart.js |
| 頁面數量 | 10 個功能頁面 |
| 主入口 | `index.html`（~2060 行） |
| 全域控制 | `app.js`（392 行） |

---

## 二、完整檔案結構

```
Operation System/
├── index.html                          # 主入口
├── project-current-state.md            # 本文件
├── SYSTEM_ARCHITECTURE.md              # 系統架構文檔 (v3.0)
├── REQUEST_ORDER_ENHANCEMENT_SPEC.md
├── blueprint.css / blueprint.js        # 藍圖相關
├── system-blueprint.html
│
├── assets/
│   ├── css/
│   │   ├── base.css              (220 行)  # Design Tokens (CSS Variables)
│   │   ├── components.css        (823 行)  # 共用元件 (Button, Filter, Table)
│   │   ├── layout.css            (235 行)  # 全站佈局 (Header, Sidebar, Main)
│   │   └── pages/
│   │       ├── home.css                (231 行)
│   │       ├── inventory-replenishment.css (784 行)
│   │       ├── factory-stock.css       (240 行)
│   │       ├── fc-overview.css         (853 行)  # FC Summary 主樣式
│   │       ├── fc-raw-data.css         (551 行)  # FC Summary 資料表樣式
│   │       ├── forecast.css            (未列入，由 forecast.js 對應)
│   │       ├── request-order.css       (1538 行)
│   │       ├── sku-details.css         (232 行)
│   │       ├── shipping-plan.css       (216 行)
│   │       ├── shipping-history.css    (51 行)
│   │       ├── supply-chain-canvas.css (727 行)
│   │       └── supplychain.css         (9 行)   # 舊版殘留
│   │
│   ├── js/
│   │   ├── core/                       # 核心系統（必須最先載入）
│   │   │   ├── namespace.js      (42 行)   # window.KM 命名空間
│   │   │   ├── lifecycle.js      (86 行)   # 頁面 mount/unmount 管理
│   │   │   └── state.js          (184 行)  # 集中式狀態管理
│   │   │
│   │   ├── utils/                      # 工具函式
│   │   │   ├── data.js           (1619 行) # DataRepo + 所有 mock data
│   │   │   ├── forecast-engine.js (101 行) # Forecast 計算引擎
│   │   │   └── scroll-sync.js    (146 行)  # 滾動同步工具
│   │   │
│   │   ├── pages/                      # 頁面邏輯（每頁獨立 owner）
│   │   │   ├── home.js                 (122 行)
│   │   │   ├── inventory-replenishment.js (1512 行)
│   │   │   ├── factory-stock.js        (250 行)
│   │   │   ├── fc-summary.js           (1736 行)
│   │   │   ├── forecast.js             (1770 行)
│   │   │   ├── request-order.js        (1108 行)
│   │   │   ├── sku-details.js          (316 行)
│   │   │   ├── shipping-plan.js        (558 行)
│   │   │   ├── shipping-history.js     (627 行)
│   │   │   └── supplychain.js          (1572 行)
│   │   │
│   │   └── app.js                (392 行)  # 全域控制（showSection、世界時間、DOMContentLoaded）
│   │
│   ├── specs/
│   │   ├── active/               (11 檔)   # 活躍規範
│   │   ├── archived/             (4 檔)    # 已封存
│   │   ├── completed/            (3 檔)    # 已完成
│   │   └── logs/                 (1 檔)    # 開發日誌
│   │
│   ├── img/
│   │   └── KM_Red_LOGO (5).png
│   │
│   └── audit-reports/                  # 審計報告（4 個子目錄）
│
└── backup_legacy_files_20260116/       # 舊版備份（22 檔）
```

---

## 三、JS 載入順序（index.html 中）

```
1. Chart.js (CDN)

2. core/namespace.js          ← 建立 window.KM
3. core/lifecycle.js          ← 頁面生命週期
4. core/state.js              ← 狀態管理

5. utils/forecast-engine.js   ← Forecast 計算
6. utils/data.js              ← DataRepo + mock data
7. utils/scroll-sync.js       ← 滾動同步

8.  pages/home.js
9.  pages/inventory-replenishment.js
10. pages/factory-stock.js
11. pages/fc-summary.js
12. pages/forecast.js
13. pages/request-order.js
14. pages/sku-details.js
15. pages/shipping-plan.js
16. pages/shipping-history.js
17. pages/supplychain.js

18. app.js                    ← 最後（全域控制）
```

**載入規則**：Core → Utils → Pages → App。Pages 之間無順序依賴。

---

## 四、CSS 載入順序（index.html 中）

```
1. base.css          ← CSS Variables, Typography
2. components.css    ← Button, Filter, Table, Dual Layer Table
3. layout.css        ← Header, Sidebar, Main Content
4. pages/*.css       ← 各頁面專屬樣式（順序不重要）
```

---

## 五、10 頁面完整對照表

| # | 頁面 | Section ID | CSS 檔 | JS 檔 | Lifecycle | 入口函式 |
|---|------|-----------|--------|-------|:---------:|---------|
| 1 | Home | `home-section` | `home.css` | `home.js` | ✅ | `renderHomepage()` |
| 2 | Inventory Replenishment | `ops-section` | `inventory-replenishment.css` | `inventory-replenishment.js` | ✅ | `renderReplenishment()` |
| 3 | Factory Stock | `factory-stock-section` | `factory-stock.css` | `factory-stock.js` | ✅ | `initFactoryStockPage()` |
| 4 | Forecast Review | `forecast-section` | `fc-overview.css` | `forecast.js` | ✅ | `initForecastReviewPage()` |
| 5 | Request Order | `request-order-section` | `request-order.css` | `request-order.js` | ✅ | `initRequestOrderSection()` |
| 6 | FC Summary | `fc-summary-section` | `fc-overview.css` + `fc-raw-data.css` | `fc-summary.js` | ✅ | `initFcSummaryPage()` |
| 7 | SKU Details | `sku-section` | `sku-details.css` | `sku-details.js` | ✅ | `renderSkuDetailsTable()` |
| 8 | Shipping Plan | `shippingplan-section` | `shipping-plan.css` | `shipping-plan.js` | ✅ | `renderShippingPlan()` |
| 9 | Shipping History | `shippinghistory-section` | `shipping-history.css` | `shipping-history.js` | ✅ | `initShippingHistoryPage()` |
| 10 | Supply Chain Canvas | `supplychain-section` | `supply-chain-canvas.css` | `supplychain.js` | ✅ | `CanvasController.init()` |

---

## 六、app.js 剩餘內容（392 行）

| 區塊 | 行數 | 說明 | 歸屬 |
|------|------|------|------|
| menuConfig + toggleMenu | ~30 | 選單配置與切換 | 全域 |
| showSection | ~120 | 頁面路由（含 lifecycle.switchTo + 手動 init 雙重呼叫） | 全域 |
| clearOpsTable + renderOpsView | ~30 | 補貨試算器（`#replenishment-section`） | 舊版小功能 |
| showForecast + renderForecastChart | ~50 | Forecast 基礎渲染（舊版） | 舊版小功能 |
| renderRecords + calculateRestock | ~30 | 補貨試算紀錄 | 舊版小功能 |
| initWorldTimes + updateWorldTimes | ~35 | 世界時間 | 全域 |
| DOMContentLoaded | ~12 | 初始化入口 | 全域 |
| 搬移註解 | ~50 | 各頁搬移標記 | — |

---

## 七、Core 系統狀態

### Namespace（✅ 完成 + 使用中）
- `window.KM` → `KM.pages`, `KM.utils`, `KM.state`, `KM.lifecycle`

### Lifecycle（✅ 完成 + 10/10 頁面已註冊）

| 頁面 | mount | unmount 清理 |
|------|:-----:|:----------:|
| Home | renderHomepage | — |
| Inventory Replenishment | renderReplenishment | chart + scroll + expand panels |
| Factory Stock | initFactoryStockPage | scroll + click listener + init flag |
| Forecast Review | initForecastReviewPage | 3 個 Chart.js destroy |
| Request Order | initRequestOrderSection | — |
| FC Summary | initFcSummaryPage | — |
| SKU Details | renderSkuDetailsTable + scroll | — |
| Shipping Plan | renderShippingPlan | — |
| Shipping History | initShippingHistoryPage | — |
| Supply Chain Canvas | CanvasController.init | — |

### State Management（✅ 完成，尚未廣泛採用）
- 各頁仍使用自己的 state 物件
- Shipping Plan 仍使用 sessionStorage
- 未來統一遷移時機：Stage 3

---

## 八、assets 目錄規劃與規範

### 8.1 `assets/css/` 規範

```
css/
├── base.css          # 只放 Design Tokens（CSS Variables、Typography、Color）
├── components.css    # 只放可重用元件（Button、Filter、Table、Modal）
├── layout.css        # 只放全站佈局（Header、Sidebar、Main Content）
└── pages/
    └── [page-name].css   # 只放該頁面專屬樣式
```

**規則：**
- 全站共用 → `base.css` / `components.css` / `layout.css`
- 頁面專屬 → `pages/[page-name].css`，必須限定在頁面容器下（如 `#ops-section .replen-*`）
- 禁止在 `base.css` 中放頁面特化樣式
- 禁止在 `pages/*.css` 中覆蓋全站元件樣式

### 8.2 `assets/js/` 規範

```
js/
├── core/             # 核心系統（不可修改，除非升級 Core）
│   ├── namespace.js  # 第 1 個載入
│   ├── lifecycle.js  # 第 2 個載入
│   └── state.js      # 第 3 個載入
│
├── utils/            # 共用工具（跨頁面使用）
│   ├── data.js       # DataRepo + mock data
│   └── *.js          # 其他工具函式
│
├── pages/            # 頁面邏輯（每頁一個檔案，獨立 owner）
│   └── [page-name].js
│
└── app.js            # 全域控制（showSection、DOMContentLoaded、世界時間）
```

**規則：**
- 每個頁面的邏輯**只能**在 `pages/[page-name].js` 中
- `app.js` 只放全域控制，不放任何頁面邏輯
- 頁面間不直接呼叫彼此的函式，透過 `window` 全域暴露
- 新增工具函式 → `utils/`，不放在 `pages/` 或 `app.js`

### 8.3 `assets/specs/` 規範

```
specs/
├── active/           # 正在使用的規範（唯一真實來源）
├── archived/         # 過期但保留參考的規範
├── completed/        # 已完成的任務記錄
└── logs/             # 開發日誌
```

**規則：**
- 新規範 → `active/`
- 規範過期 → 移至 `archived/`
- 任務完成 → 移至 `completed/`

### 8.4 `assets/img/` 規範

- 只放專案使用的圖片資源
- 命名規則：`[用途]-[描述].[ext]`

---

## 九、新增頁面指南

### Step 1：規劃

```
頁面名稱: [Page Name]
Section ID: [page-name]-section
CSS 前綴: [prefix]-
JS 入口函式: init[PageName]Page()
```

### Step 2：建立 HTML（在 index.html 中）

```html
<section id="[page-name]-section" class="module-section">
    <!-- 頁面內容 -->
</section>
```

### Step 3：建立 CSS

檔案：`assets/css/pages/[page-name].css`

```css
/* 所有樣式必須限定在頁面容器下 */
#[page-name]-section .prefix-element {
    /* 樣式 */
}
```

在 `index.html` 的 `<head>` 中加入：
```html
<link rel="stylesheet" href="assets/css/pages/[page-name].css">
```

### Step 4：建立 JS

檔案：`assets/js/pages/[page-name].js`

```javascript
// ========================================
// [Page Name] Page Logic
// ========================================

function init[PageName]Page() {
    console.log('[PageName] init');
    // 初始化邏輯
}

// 暴露到全域
window.init[PageName]Page = init[PageName]Page;

// Lifecycle 註冊
if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('[page-name]-section', {
        mount() {
            console.log('[PageName] mount');
            init[PageName]Page();
        },
        unmount() {
            console.log('[PageName] unmount');
            // 清理 chart / interval / listener
        }
    });
}
```

在 `index.html` 的 `<body>` 尾部、`app.js` 之前加入：
```html
<script src="assets/js/pages/[page-name].js"></script>
```

### Step 5：註冊路由

在 `app.js` 的 `showSection()` 中，兩個 `sectionMap` 都加入：
```javascript
'[page-name]': '[page-name]-section',
```

### Step 6：加入選單

在 `index.html` 的 sidebar 中加入：
```html
<div class="menu-item" onclick="showSection('[page-name]')">
    <span>📊</span> [Page Name]
</div>
```

### Step 7：驗收

| 項目 | 檢查 |
|------|------|
| 從 sidebar 進入 | 頁面正常渲染 |
| 切到其他頁再回來 | 正常（lifecycle mount 觸發） |
| Console | 有 `[PageName] mount` / `unmount` log |
| CSS 不污染其他頁 | 樣式限定在 section 容器下 |
| JS 不污染其他頁 | 函式用頁面前綴命名 |

---

## 十、拆分執行記錄

### 已完成的頁面拆分

| # | 頁面 | 回合 2 (搬函式) | 回合 3 (lifecycle) | app.js 減少 |
|---|------|:-:|:-:|:-:|
| 1 | Shipping Plan | ✅ 新建 shipping-plan.js | ✅ | -597 |
| 2 | Home | ✅ 新建 home.js | ✅ | -105 |
| 3 | Factory Stock | ✅ 移除舊版殘留 | ✅ 含 unmount 清理 | -76 |
| 4 | SKU Details | ✅ 搬至 sku-details.js | ✅ | -229 |
| 5 | Inventory Replenishment | ✅ 分 3 批搬移 | ✅ 含 unmount 清理 | -1197 |
| 6 | Forecast Review | — (已獨立) | ✅ 含 3 chart destroy | — |
| 7 | Request Order | — (已獨立) | ✅ | — |
| 8 | FC Summary | — (已獨立) | ✅ | — |
| 9 | Shipping History | — (已獨立) | ✅ | — |
| 10 | Supply Chain Canvas | — (已獨立) | ✅ | — |

### 瘦身成果
- 初始：2596 行
- 最終：392 行
- 減少：2204 行（85%）

---

## 十一、已知保留項與未來待辦

### 保留項（非 bug，是刻意保留）

| 項目 | 原因 | 何時處理 |
|------|------|---------|
| showSection 中手動 init + lifecycle 雙重呼叫 | 確保向下相容 | 確認 lifecycle 穩定後移除手動 init |
| sessionStorage 未遷移至 KM.state | 跨頁共享，需同步遷移 | Stage 3 統一處理 |
| app.js 中舊版小功能（補貨試算器、showForecast） | 屬於 `#replenishment-section` 舊版 | 可獨立拆分或移除 |
| supplychain.css（9 行）殘留 | 極小，無害 | 可合併至 supply-chain-canvas.css |

### Stage 3 待辦

| Phase | 內容 | 前置條件 |
|-------|------|---------|
| Phase 6 | HTML 模組化（index.html 拆分） | 當前架構穩定 |
| Phase 4 | API Layer（core/api.js） | Phase 6 完成 |
| Phase 5 | Loading State + Async | Phase 4 完成 |

---

## 十二、架構健康度（更新後）

| 項目 | 拆分前 | 拆分後 | 變化 |
|------|:------:|:------:|:----:|
| CSS 模組化 | 8/10 | 8/10 | — |
| JS 模組化 | 5/10 | **9/10** | +4 |
| Core 系統完成度 | 9/10 | 9/10 | — |
| Core 系統採用度 | 3/10 | **7/10** | +4 |
| 文檔完整度 | 9/10 | 9/10 | — |
| 可維護性 | 6/10 | **9/10** | +3 |
| 可擴充性 | 8/10 | **9/10** | +1 |
| 測試覆蓋 | 1/10 | 1/10 | — |

**總體評分**: 6.1/10 → **7.6/10**

---

**報告結束**
