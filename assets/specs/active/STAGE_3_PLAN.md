# Stage 3 實作計畫 - 雲端整合與效能優化

**前置條件**: Core 系統（Namespace、Lifecycle、State Management）已整合至所有頁面，架構穩定不再大改

---

## 📋 待辦事項總覽

### Phase 4: API Layer（雲端資料移植）
**目標**: 將靜態 DataRepo 無痛升級為雲端 API 資料源

**實作項目**:
1. ✅ 建立 `assets/js/core/api.js` - API 請求核心
2. ✅ 設計統一的 API 介面規範
3. ✅ 實作快取機制（使用 State Management）
4. ✅ 錯誤處理與重試邏輯
5. ✅ 向下相容層（保留 DataRepo 介面）

**預期成果**:
- 現有頁面無需修改即可切換資料源
- 支援本地/雲端雙模式運行
- 自動快取減少重複請求

---

### Phase 5: Loading State + Async（資料拉取優化）
**目標**: 消除資料載入卡頓，提升使用者體驗

**實作項目**:
1. ✅ 建立 Loading State 管理機制
2. ✅ 設計統一的 Loading UI 元件
3. ✅ 改造所有頁面為非同步載入
4. ✅ 實作骨架屏（Skeleton Screen）
5. ✅ 錯誤狀態 UI（Error State）

**預期成果**:
- 所有資料請求改為非同步
- 載入過程有明確視覺回饋
- 錯誤狀態有友善提示

---

### Phase 6: HTML 模組化（架構優化）
**目標**: 解決 index.html 過於龐大的問題，提升可維護性與擴充性

**實作項目**:
1. ✅ 建立 `assets/pages/` 資料夾結構
2. ✅ 拆分所有頁面 HTML 為獨立檔案
3. ✅ 實作動態載入機制（Lazy Loading）
4. ✅ 整合 Lifecycle 系統自動管理
5. ✅ 更新 app.js 頁面切換邏輯

**預期成果**:
- index.html 從 ~2000 行縮減至 ~200 行
- 每個頁面獨立維護，多人協作無衝突
- 按需載入，提升初始載入速度
- 支援 20+ 頁面擴充無壓力

---

## 🎯 Phase 4 詳細規劃 - API Layer

### 4.1 建立 API 核心 (`assets/js/core/api.js`)

**功能需求**:
```javascript
KM.api = {
    // 基礎請求方法
    get(endpoint, options),
    post(endpoint, data, options),
    put(endpoint, data, options),
    delete(endpoint, options),
    
    // 快取管理
    cache: {
        set(key, data, ttl),
        get(key),
        clear(key)
    },
    
    // 錯誤處理
    onError(callback),
    
    // 環境切換
    setMode('local' | 'cloud')
};
```

### 4.2 向下相容層設計

**策略**: 保留 DataRepo 介面，內部切換資料源
```javascript
// 現有程式碼無需修改
const data = DataRepo.getForecastData();

// 內部實作自動判斷
DataRepo.getForecastData = async function() {
    if (KM.api.mode === 'cloud') {
        return await KM.api.get('/forecast/data');
    }
    return localStaticData; // 原本的靜態資料
};
```

### 4.3 快取策略

**使用 State Management 作為快取層**:
- 短期快取：存在 `KM.state`（記憶體）
- 長期快取：使用 `KM.state.persist()`（localStorage）
- TTL 管理：自動過期清除

### 4.4 實作檢查清單

- [ ] 建立 `api.js` 核心檔案
- [ ] 實作 GET/POST/PUT/DELETE 方法
- [ ] 整合 State Management 作為快取層
- [ ] 實作 TTL 過期機制
- [ ] 建立錯誤處理與重試邏輯
- [ ] 改造 DataRepo 為相容層
- [ ] 測試本地/雲端模式切換
- [ ] 更新 `index.html` 載入順序

---

## 🎯 Phase 5 詳細規劃 - Loading State + Async

### 5.1 Loading State 管理

**整合至 State Management**:
```javascript
// 使用現有的 State Management 系統
KM.state.set('loading.forecast', true);
KM.state.subscribe('loading.forecast', (isLoading) => {
    // 自動更新 UI
});
```

### 5.2 統一 Loading UI 元件

**建立共用元件** (`assets/css/components.css`):
```css
.km-loading-overlay { /* 全頁遮罩 */ }
.km-loading-spinner { /* 載入動畫 */ }
.km-skeleton { /* 骨架屏 */ }
```

**建立共用函式** (`assets/js/utils/loading.js`):
```javascript
KM.utils.loading = {
    show(target),
    hide(target),
    showSkeleton(target),
    hideSkeleton(target)
};
```

### 5.3 頁面改造流程

**以 Forecast 頁面為例**:
1. 將 `initForecast()` 改為 `async`
2. 資料請求前顯示 Loading
3. 資料載入後隱藏 Loading
4. 錯誤時顯示 Error State

### 5.4 實作檢查清單

- [ ] 建立 `assets/js/utils/loading.js`
- [ ] 設計 Loading UI 元件（CSS）
- [ ] 設計骨架屏樣式
- [ ] 設計錯誤狀態 UI
- [ ] 改造 Forecast 頁面（示範）
- [ ] 改造 RO 頁面
- [ ] 改造 FC 頁面
- [ ] 改造 Replenishment 頁面
- [ ] 改造 SKU 頁面
- [ ] 改造 SP 頁面
- [ ] 改造 History 頁面
- [ ] 測試所有頁面載入流程

---

## 🎯 Phase 6 詳細規劃 - HTML 模組化

### 6.1 當前問題

**index.html 過於龐大**:
- 當前行數: ~2000 行（包含所有頁面 HTML）
- 維護困難: 新增頁面需在 index.html 中加入大量代碼
- 協作衝突: 多人同時編輯 index.html 容易產生衝突
- 載入效能: 即使只需一個頁面，也要載入所有頁面 HTML

### 6.2 目標架構

**拆分後的結構**:
```
assets/pages/
├── home.html                      # 首頁
├── forecast.html                  # Forecast Review
├── request-order.html             # Request Order
├── fc-summary.html                # FC Summary
├── factory-stock.html             # Factory Stock
├── inventory-replenishment.html   # Inventory Replenishment
├── sku-details.html               # SKU Details
├── shipping-plan.html             # Shipping Plan
├── shipping-history.html          # Shipping History
└── supply-chain-canvas.html       # Supply Chain Canvas
```

**index.html 保留內容**:
```html
<!DOCTYPE html>
<html>
<head>
    <!-- CSS 載入 -->
</head>
<body>
    <!-- 固定 Header -->
    <header class="top-header">...</header>
    
    <!-- 主應用區 -->
    <div class="app-layout">
        <!-- 側邊選單 -->
        <nav class="sidebar">...</nav>
        
        <!-- 內容區（空容器，動態載入） -->
        <div class="main-content">
            <main class="content-area">
                <!-- 世界時間列 -->
                <div class="world-time-bar"></div>
                
                <!-- 頁面容器（動態載入 HTML） -->
                <section id="home-section" class="module-section"></section>
                <section id="forecast-section" class="module-section"></section>
                <section id="request-order-section" class="module-section"></section>
                <!-- ... 其他頁面容器 ... -->
            </main>
        </div>
    </div>
    
    <!-- JS 載入 -->
</body>
</html>
```

### 6.3 動態載入機制

**實作方式** (`app.js`):
```javascript
// 頁面 HTML 快取
const pageCache = new Map();

// 動態載入頁面 HTML
async function loadPageHTML(pageName) {
    // 檢查快取
    if (pageCache.has(pageName)) {
        return pageCache.get(pageName);
    }
    
    try {
        const response = await fetch(`assets/pages/${pageName}.html`);
        if (!response.ok) {
            throw new Error(`Failed to load ${pageName}.html`);
        }
        
        const html = await response.text();
        pageCache.set(pageName, html);
        return html;
    } catch (error) {
        console.error(`[App] Failed to load page HTML:`, error);
        return '<div class="error-state">Failed to load page</div>';
    }
}

// 修改後的 showSection 函式
async function showSection(section) {
    // 隱藏所有頁面
    document.querySelectorAll('.module-section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    const targetSectionId = `${section}-section`;
    const targetSection = document.getElementById(targetSectionId);
    
    if (!targetSection) {
        console.error(`[App] Section not found: ${targetSectionId}`);
        return;
    }
    
    // 如果頁面 HTML 尚未載入
    if (!targetSection.dataset.loaded) {
        const html = await loadPageHTML(section);
        targetSection.innerHTML = html;
        targetSection.dataset.loaded = 'true';
    }
    
    // 顯示頁面
    targetSection.classList.add('active');
    
    // 呼叫生命週期（自動初始化頁面）
    if (window.KM && window.KM.lifecycle && window.KM.lifecycle.switchTo) {
        KM.lifecycle.switchTo(targetSectionId);
    }
}
```

### 6.4 頁面 HTML 檔案範例

**forecast.html**:
```html
<!-- Forecast Review Page -->
<div class="page-header">
    <h2 class="page-title">Forecast Review</h2>
</div>

<div class="forecast-filters">
    <!-- 篩選器 -->
</div>

<div class="forecast-content">
    <!-- 圖表與表格 -->
</div>
```

**注意事項**:
- 不包含 `<section>` 標籤（已在 index.html 中）
- 只包含頁面內部的 HTML 結構
- 保持原有的 class 命名與結構

### 6.5 實作檢查清單

#### 準備階段
- [ ] 建立 `assets/pages/` 資料夾
- [ ] 修改 `app.js` 加入動態載入邏輯
- [ ] 測試動態載入機制（使用一個頁面測試）

#### 頁面拆分階段
- [ ] 拆分 Home 頁面
- [ ] 拆分 Forecast Review 頁面
- [ ] 拆分 Request Order 頁面
- [ ] 拆分 FC Summary 頁面
- [ ] 拆分 Factory Stock 頁面
- [ ] 拆分 Inventory Replenishment 頁面
- [ ] 拆分 SKU Details 頁面
- [ ] 拆分 Shipping Plan 頁面
- [ ] 拆分 Shipping History 頁面
- [ ] 拆分 Supply Chain Canvas 頁面

#### 驗證階段
- [ ] 測試所有頁面切換正常
- [ ] 測試頁面初始化正常（Lifecycle 觸發）
- [ ] 測試快取機制正常運作
- [ ] 測試錯誤處理（載入失敗情況）
- [ ] 驗證 index.html 行數縮減至 ~200 行

### 6.6 向下相容保證

**不影響現有功能**:
- ✅ 所有 CSS class 保持不變
- ✅ 所有 JS 函式保持不變
- ✅ 所有頁面邏輯保持不變
- ✅ Lifecycle 系統自動整合
- ✅ 使用者體驗無感知（除了更快的初始載入）

**唯一變更**:
- index.html 中的頁面 HTML 移至獨立檔案
- app.js 加入動態載入邏輯

### 6.7 效能優化

**Lazy Loading 優勢**:
- 初始載入只需載入框架（~200 行 HTML）
- 首頁載入時間縮短 60-70%
- 按需載入其他頁面（使用者點擊時才載入）
- HTML 快取避免重複請求

**預期效能提升**:
```
當前: 載入 index.html (~2000 行) → 2-3 秒
優化後: 載入 index.html (~200 行) → 0.5-1 秒
       + 首次進入頁面載入 HTML → 0.2-0.3 秒
總計首次進入: 0.7-1.3 秒（提升 50-60%）
```

---

## 📊 實作優先順序

### 建議順序
1. **Phase 6 優先** - HTML 模組化（解決架構問題）
2. **Phase 4 跟進** - 建立 API Layer 基礎設施
3. **Phase 5 最後** - 基於 API Layer 實作 Loading State

**理由**:
- Phase 6 是架構層面的優化，越早做越好
- Phase 4/5 依賴穩定的頁面結構
- Phase 6 完成後，Phase 4/5 實作更順暢

### 時程預估
- Phase 6: 1-2 天（動態載入機制 + 10 個頁面拆分 + 測試）
- Phase 4: 2-3 天（API 核心 + 相容層 + 測試）
- Phase 5: 3-5 天（UI 元件 + 7 個頁面改造 + 測試）
- **總計**: 約 1.5-2 週完成

---

## ✅ 成功標準

### Phase 4 完成標準
- ✅ 可切換本地/雲端模式
- ✅ 現有程式碼無需修改即可運行
- ✅ 快取機制正常運作
- ✅ 錯誤處理完善

### Phase 5 完成標準
- ✅ 所有頁面改為非同步載入
- ✅ 載入過程有視覺回饋
- ✅ 錯誤狀態有友善提示
- ✅ 無卡頓感

### Phase 6 完成標準
- ✅ index.html 行數縮減至 ~200 行
- ✅ 所有頁面 HTML 拆分為獨立檔案
- ✅ 動態載入機制正常運作
- ✅ 頁面切換無感知（使用者體驗不變）
- ✅ 快取機制避免重複載入
- ✅ 初始載入速度提升 50%+

---

## 📝 備註

### 為什麼延後到 Stage 3？
1. **架構穩定性**: 需要 Core 系統完全整合到所有頁面
2. **避免重複工作**: 架構調整時不需重複修改 API 層
3. **資料結構確定**: 所有頁面的資料格式已經穩定
4. **測試完整性**: Core 系統已經過充分測試

### 前置作業（Stage 2 需完成）
- ✅ Core 系統整合至所有頁面
- ✅ 所有頁面使用 Lifecycle 管理
- ✅ 所有頁面使用 State Management
- ✅ 架構不再有大幅調整

---

---

## 🎯 Phase 6 vs 未來框架遷移

### Phase 6（當前建議）
**優點**:
- ✅ 保持 Vanilla JS 架構
- ✅ 學習成本低
- ✅ 向下相容 100%
- ✅ 實作時間短（1-2 天）
- ✅ 立即解決 index.html 問題

**適用場景**:
- 系統規模: 10-20 頁面
- 團隊規模: 1-3 人
- 維護週期: 1-2 年

### 框架遷移（長期考慮）
**選項**: Vue.js / React / Svelte

**優點**:
- ✅ 元件化開發
- ✅ 生態系完整
- ✅ 支援 50+ 頁面
- ✅ 開發效率更高

**缺點**:
- ❌ 學習成本高
- ❌ 需重寫大量程式碼
- ❌ 實作時間長（2-4 週）
- ❌ 可能破壞現有功能

**建議時機**:
- 系統規模 > 20 頁面
- 團隊規模 > 3 人
- 有專職前端工程師

### 決策建議

**現階段（Stage 3）**:
- ✅ 執行 Phase 6（HTML 模組化）
- ✅ 保持 Vanilla JS 架構
- ✅ 快速解決當前問題

**未來（1-2 年後）**:
- 如果系統持續成長至 20+ 頁面
- 如果團隊擴大至 5+ 人
- 再考慮框架遷移

**關鍵點**: Phase 6 的 Core 系統（Namespace、Lifecycle、State）可無縫遷移至任何框架，不會浪費！

---

**文件版本**: 2.0  
**建立日期**: 2025-01-16  
**最後更新**: 2025-01-16  
**變更記錄**: 新增 Phase 6 HTML 模組化計畫
