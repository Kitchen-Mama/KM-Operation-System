# Prompt: 將 SKU Details 改造成 SKU Test-2 架構

現在請你幫我把「SKU Details 頁面」的表格，改造成跟 `SKU Test-2` 一樣的架構與行為。

## 重要前提

1. `SKU Test-2.html` + `sku-test-2.css` = ✅ 已驗證成功的「標準實作」
2. 我不希望再遇到：
   - sticky 失效
   - 左右欄位高度不對齊
   - 滾動時內容穿過表頭
   - 多個水平捲動條不同步
3. 請以「**最小改動**」為原則，只改：
   - `index.html` 裡 `SKU Details` 區塊的 HTML 結構
   - 對應的 CSS（例如 `sku-details.css`，如果目前有這個檔）
   - 如有必要，小幅調整 JS 渲染邏輯（例如 `app.js` 或 `sku-details.js`），但不可破壞既有功能

---

## 目前檔案結構（請先自行搜尋）

請在專案內找到並閱讀（只讀不改）：

- `SKU Test-2.html`
- `sku-test-2.css`
- `TableTemplate_ScrollXY.md`（參考規格）

再找到與 SKU Details 相關的檔案，例如（實際名稱請你在專案內搜尋）：

- `index.html`（主頁面 / 左側選單包含「SKU Details」）
- `sku-details.css` 或 `style.css` 中專門給 SKU Details 用的區塊
- `app.js` / `sku-details.js` 之類負責渲染 SKU Details 表格的 JS

---

## 目標：讓 SKU Details 的表格行為 = SKU Test-2

### 功能 DoD（缺一不可）

1. **垂直捲動**
   - 整個頁面的唯一垂直滾動源仍然是主內容區（例如 `.main-content` 或對應容器）
   - 在 SKU Details 區塊內，表頭必須 sticky 在視窗內，內容往下捲時會被表頭遮住（不會穿透）

2. **水平捲動**
   - SKU 欄位固定在左側（header + body 同時固定）
   - 右側所有欄位（Image / Status / Product Name / …）一起水平捲動
   - 水平捲動條只有一個（在右側 scroll 區域），不再出現在 SKU 左欄或外層容器

3. **對齊**
   - 每一列的 SKU cell 與右側欄位 row 高度完全一致（包括最後一列）
   - 不允許透過增加「多出來的空白列」或 padding hack 來假裝對齊

4. **互不干擾**
   - 其他頁面（例如 Inventory Replenishment, Weekly Shipping Plans…）不能被這次改動影響
   - 通用樣式（如 h1~h6、按鈕、全站色彩）可以共用，但 SKU Details 專用表格樣式應有自己的命名空間

---

## 技術要求

### 1. 採用 SKU Test-2 的結構概念

請把 `index.html` 中「Upcoming / Running in the Market / Phasing Out」這三塊 SKU 表格，全部改成 **類似 SKU Test-2 的 dual layer 架構**，概念如下：

- 對每一個 lifecycle 區塊（Upcoming / Running / Phasing）：
  - 一個外層容器，例如：`.sku-lifecycle-section`
  - 裡面有一個 `.dual-layer-table`
  - `.dual-layer-table` 內部結構對齊 SKU Test-2：

```html
<div class="dual-layer-table">

  <!-- Sticky Header Bar -->
  <div class="table-header-bar">
    <div class="fixed-header">
      <div class="header-cell">SKU</div>
    </div>
    <div class="scroll-header-viewport">
      <div class="scroll-header">
        <!-- Image / Status / Product Name / ... 對應原本欄位順序 -->
      </div>
    </div>
  </div>

  <!-- Body -->
  <div class="table-body-bar">
    <div class="fixed-col">
      <div class="fixed-body" id="upcomingFixedBody"><!-- 每列 SKU --></div>
    </div>

    <div class="scroll-col">
      <div class="scroll-body" id="upcomingScrollBody"><!-- 每列其它欄位 --></div>
    </div>
  </div>

</div>
```

**重要**：
- 三個 lifecycle section 各自獨立，每個都有自己的 `.dual-layer-table`
- 每個 section 的 `fixedBody` 和 `scrollBody` ID 要不同（例如 `upcomingFixedBody`, `runningFixedBody`, `phasingFixedBody`）
- 保留原本的 section header（可折疊的 "▼ Upcoming SKU" 等）

### 2. CSS 命名空間

所有 SKU Details 專用的樣式，請加上 `#sku-section` 前綴，例如：

```css
#sku-section .dual-layer-table { ... }
#sku-section .table-header-bar { ... }
#sku-section .fixed-header { ... }
#sku-section .scroll-header-viewport { ... }
#sku-section .fixed-col { ... }
#sku-section .scroll-col { ... }
```

這樣可以確保不會影響到其他頁面（例如 Inventory Replenishment）。

### 3. 欄位寬度設定

請參考 SKU Test-2 的做法，為每個欄位設定明確寬度：

```css
/* SKU Details 有 20 個欄位，請根據實際需求設定寬度 */
#sku-section .scroll-header .header-cell:nth-child(1) { width: 80px; }   /* Image */
#sku-section .scroll-header .header-cell:nth-child(2) { width: 100px; }  /* Status */
#sku-section .scroll-header .header-cell:nth-child(3) { width: 200px; }  /* Product Name */
/* ... 繼續設定其他欄位 ... */

/* scroll-cell 也要對應設定 */
#sku-section .scroll-cell:nth-child(1) { width: 80px; }
#sku-section .scroll-cell:nth-child(2) { width: 100px; }
/* ... */
```

### 4. JS 渲染邏輯調整

請修改 `app.js` 中的 `renderSkuLifecycleTable()` 函數，改成：

```javascript
function renderSkuLifecycleTable(section, data) {
    const fixedBody = document.getElementById(`${section}FixedBody`);
    const scrollBody = document.getElementById(`${section}ScrollBody`);
    
    if (!fixedBody || !scrollBody) return;
    
    // Render fixed column (SKU)
    fixedBody.innerHTML = data.map(item => `
        <div class="fixed-row">${item.sku}</div>
    `).join('');
    
    // Render scrollable columns
    scrollBody.innerHTML = data.map(item => `
        <div class="scroll-row">
            <div class="scroll-cell"><div class="image-placeholder">IMG</div></div>
            <div class="scroll-cell">${item.status}</div>
            <div class="scroll-cell">${item.productName}</div>
            <div class="scroll-cell">${item.category}</div>
            <div class="scroll-cell">${item.gs1Code}</div>
            <div class="scroll-cell">${item.gs1Type}</div>
            <div class="scroll-cell">${item.amzAsin}</div>
            <div class="scroll-cell">${item.itemDimensions}</div>
            <div class="scroll-cell">${item.itemWeight}</div>
            <div class="scroll-cell">${item.package}</div>
            <div class="scroll-cell">${item.packageWeight}</div>
            <div class="scroll-cell">${item.cartonDimensions}</div>
            <div class="scroll-cell">${item.cartonWeight}</div>
            <div class="scroll-cell">${item.unitsPerCarton}</div>
            <div class="scroll-cell">${item.hscode}</div>
            <div class="scroll-cell">${item.declaredValue}</div>
            <div class="scroll-cell">${item.minimumPrice}</div>
            <div class="scroll-cell">${item.msrp}</div>
            <div class="scroll-cell">${item.sellingPrice}</div>
            <div class="scroll-cell">${item.pm}</div>
        </div>
    `).join('');
}
```

### 5. Header 水平滾動同步

請新增或修改 JS，為每個 lifecycle section 的 scroll-col 添加 header 同步：

```javascript
function syncSkuHeaderScroll() {
    const sections = ['upcoming', 'running', 'phasing'];
    
    sections.forEach(section => {
        const scrollCol = document.querySelector(`#sku-section [data-section="${section}"] .scroll-col`);
        const scrollHeader = document.querySelector(`#sku-section [data-section="${section}"] .scroll-header`);
        
        if (!scrollCol || !scrollHeader) return;
        
        scrollCol.addEventListener('scroll', () => {
            scrollHeader.style.transform = `translateX(-${scrollCol.scrollLeft}px)`;
        });
    });
}

// 在 DOMContentLoaded 或 showSection('skuDetails') 時呼叫
window.addEventListener('DOMContentLoaded', () => {
    syncSkuHeaderScroll();
});
```

---

## 必須遵守的規則（來自 TableTemplate_ScrollXY.md）

### ✅ DO

1. `.main-content` 是唯一垂直滾動源（不要加 padding）
2. `.table-header-bar` 使用 `position: sticky; top: 0; z-index: 120;`
3. `.fixed-header` **不要** 加 `position: sticky`（由 `.table-header-bar` 統一負責）
4. `.fixed-col` 使用 `position: sticky; left: 0; z-index: 110;`
5. `.scroll-col` 是唯一水平滾動源（`overflow-x: auto; overflow-y: hidden;`）
6. 所有 row 統一高度：`height: 48px; box-sizing: border-box;`
7. Border 放在 row 層級，不要放在 cell 層級
8. 使用 `padding-bottom: var(--scrollbar-h);` 補償 scrollbar 高度

### ❌ DON'T

1. 不要在 `.dual-layer-table` 加 `overflow: hidden`（會破壞 sticky）
2. 不要把 header 放在 `.fixed-col` 裡面
3. 不要使用 `<table>` 元素或 `colspan`
4. 不要創建多個需要 JS 同步的 scroll 容器
5. 不要在 `.fixed-header` 加 `position: sticky; left: 0;`（會衝突）
6. 不要讓 border 一邊在 row、一邊在 cell（會造成高度不一致）

---

## 驗收標準

完成後，請確認以下項目：

- [ ] 垂直捲動時，三個 section 的 header 都會 sticky 在視窗頂部
- [ ] 水平捲動時，SKU 欄位固定在左側不動
- [ ] 每個 section 只有一個水平捲動條（在右側 scroll-col）
- [ ] 所有 row 高度完全對齊（可用 console 執行 `verifyAlignment()` 驗證）
- [ ] 內容往上捲時會被 header 遮住（不會穿透）
- [ ] SKU 欄位會遮住右側內容（不會被右側內容蓋住）
- [ ] 其他頁面（Inventory Replenishment 等）功能正常，不受影響
- [ ] 原本的功能（折疊 section、搜尋、Display 篩選）仍然正常運作

---

## 輸出要求

請提供：

1. **HTML diff**：`index.html` 中 SKU Details section 的結構變更
2. **CSS diff**：`sku-details.css`（或相關檔案）的樣式變更
3. **JS diff**：`app.js` 中 `renderSkuLifecycleTable()` 和相關函數的變更
4. **驗證結果**：在 console 執行 `verifyAlignment()` 的截圖或輸出

---

## 參考資料

- **結構範本**：`SKU Test-2.html`
- **樣式範本**：`sku-test-2.css`
- **完整規格**：`TableTemplate_ScrollXY.md`

**重要**：遇到任何不確定的地方，請參考這三個檔案作為「唯一真相」。

---

## 常見問題預防

### Q: 為什麼 header 沒有 sticky？
A: 檢查是否有祖先元素設定 `overflow: hidden`，移除它。

### Q: 為什麼 row 高度不對齊？
A: 確保 `.fixed-row` 和 `.scroll-row` 都有 `height: 48px; box-sizing: border-box;`，且 border 都在 row 層級。

### Q: 為什麼內容會穿過 header？
A: 確保 `.table-header-bar` 有 `z-index: 120;` 且背景不透明。

### Q: 為什麼 SKU 欄位被右側內容蓋住？
A: 確保 `.fixed-col` 的 `z-index: 110;` 高於 `.scroll-col`。

### Q: 為什麼有多個水平捲動條？
A: 確保只有 `.scroll-col` 有 `overflow-x: auto`，其他容器都是 `overflow-x: hidden` 或 `visible`。

---

**請開始執行改造，並在完成後提供 diff 和驗證結果。**
