# Supply Chain Knowledge Canvas – Stage 1 Spec

**Version:** 1.0  
**Stage:** Stage 1 (Single-user, Knowledge Map)  
**Last Updated:** 2025-01-XX  

---

## 1. Purpose

建立一個「可視化供應鏈知識庫畫布」，用來承載公司從：

> 下單 → 生產 → 出貨 → 物流 → 清關 → 海外倉 → 站點運行 → 補貨

的整體流程，以圖像方式表達，作為之後系統規劃、教育訓練與溝通的共同基準圖。

> Stage 1 目標：**畫得出來、看得清楚、存得起來**  
> 不處理多人協作與外部系統串接。

---

## 2. Scope

### 2.1 In Scope（Stage 1 必做）

- 單一畫布（Single Canvas）
- 節點（Node）的：
  - 新增
  - 拖曳移動
  - 文字標題 / 備註編輯
- 線（Edge）的：
  - 新增（節點間連線）
  - 刪除
  - 顯示方向（箭頭）
  - 可附加簡短文字（如「30–35 days」）
- 畫布的：
  - 平移（Pan）
  - 縮放（Zoom）
  - Reset 到預設視角
- 畫布內容的儲存 / 載入（JSON）

### 2.2 Out of Scope（之後 Stage 2+ 再做）

- 多人同時編輯、即時協作
- 帳號 / 權限 / 版本歷史
- Undo / Redo 完整歷程
- 與 ERP / WMS / Amazon / Shopify API 串接
- 與 SKU / 補貨數據的自動關聯
- 手機版操作優化（Stage 1 以桌機為主）

---

## 3. Use Cases

1. **供應鏈全貌地圖**
   - 把工廠、港口、海外倉、銷售站點等，用節點畫出來
   - 節點之間以物流路線（海運 / 空運 / 卡車）串起來

2. **各國站點流程比較**
   - 例如 US / EU / JP 三個區域，各自有不同清關與倉儲流程
   - 在畫布上分區呈現，方便討論差異

3. **教育與 onboarding**
   - 新進同事可以在這張圖上理解整體運作
   - 可以放「備註」說明每個節點的角色與風險點

---

## 4. Page &amp; Layout Architecture

### 4.1 Page Layout（在既有系統中的新頁面）

新頁面名稱建議：**Supply Chain Canvas**  
位置：左側選單，排序在「SKU Details」下方。

整體結構沿用現有 layout：

```html
&lt;div class=&quot;app-layout&quot;&gt;
  &lt;aside class=&quot;sidebar&quot;&gt;...&lt;/aside&gt;

  &lt;main class=&quot;main-content&quot;&gt;
    &lt;!-- 其他頁面 section ... --&gt;

    &lt;section id=&quot;supplychain-section&quot; class=&quot;module-section is-hidden&quot;&gt;
      &lt;!-- Supply Chain Canvas Page 內容 --&gt;
    &lt;/section&gt;
  &lt;/main&gt;
&lt;/div&gt;
```

### 4.2 Supply Chain Canvas Page 結構

```html
&lt;section id=&quot;supplychain-section&quot; class=&quot;module-section&quot;&gt;
  &lt;div class=&quot;page-header&quot;&gt;
    &lt;h1&gt;Supply Chain Canvas&lt;/h1&gt;
  &lt;/div&gt;

  &lt;div class=&quot;sc-layout&quot;&gt;
    &lt;!-- 左側工具列 --&gt;
    &lt;div class=&quot;sc-toolbar&quot;&gt;
      &lt;!-- 選取 / 節點 / 線 / 文字 / 重置 --&gt;
    &lt;/div&gt;

    &lt;!-- 右側畫布視窗 --&gt;
    &lt;div class=&quot;sc-canvas-viewport&quot;&gt;
      &lt;div class=&quot;sc-canvas-content&quot;&gt;
        &lt;!-- Nodes + Edges 在這裡 render --&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  &lt;/div&gt;

  &lt;!-- 右下角狀態列 --&gt;
  &lt;div class=&quot;sc-status-bar&quot;&gt;
    &lt;span class=&quot;sc-zoom-indicator&quot;&gt;100%&lt;/span&gt;
    &lt;button class=&quot;sc-btn-reset&quot;&gt;Reset View&lt;/button&gt;
  &lt;/div&gt;
&lt;/section&gt;
```

---

## 5. Canvas 行為規範

### 5.1 滑鼠操作

**平移（Pan）**
- 當「Select Tool」啟用時，在畫布空白處按住左鍵拖曳 → 平移畫布

**縮放（Zoom）**
- 滾輪向上：放大
- 滾輪向下：縮小
- 範圍建議：50% ~ 200%
- 當縮放變化時，右下角 `sc-zoom-indicator` 更新數字

技術建議：使用 `transform: translate(...) scale(...)` 實作，不使用 nested scroll 來做平移。

### 5.2 工具列（Toolbar）

工具列固定在左側，包含：

**Select Tool**
- 預設工具
- 可點選節點 / 線，並拖曳節點

**Add Node**
- 點下後，在畫布上點一下 → 新增一個 Node
- 新增後切回 Select Tool

**Add Edge**
- 點下後：
  - 第一次點節點 → 起點
  - 第二次點節點 → 終點
  - 自動建立 Edge，然後切回 Select Tool

**Text / Note（可選 Stage 1 做最簡單版）**
- 可在畫布上加純文字說明（不連線）

**Reset View**
- 一鍵把畫布中心 / 縮放恢復到預設狀態（例如 scale=1, translate=0,0）

---

## 6. Node 規範

### 6.1 Node 共通屬性

```json
{
  "id": "node-amazon-us",
  "type": "region",
  "label": "Amazon US",
  "x": 1200,
  "y": 400,
  "color": "#2563EB",
  "note": "Primary market; FBA + FBM",
  "meta": {
    "region": "US",
    "channel": "Amazon"
  }
}
```

必要欄位：
- **id**: string – 唯一識別
- **type**: "region" | "process" | "warehouse"（Stage 1 至少支援前兩種）
- **label**: UI 顯示文字
- **x, y**: 在畫布中的座標位置（以畫布中心為 0,0）
- **color**: 用來分群，例如不同顏色代表不同區域或類型
- **note**: 節點備註，顯示在側邊或 tooltip

### 6.2 節點樣式建議

**Region / Country Node**
- 形狀：六邊形
- 用於：Amazon US / EU / JP、Shopify US / CA / EU 等

**Process Node**
- 形狀：圓角矩形
- 用於：Place PO / Production / Export Customs / Ocean Freight / Import Customs / FBA Inbound / FC Transfer…

### 6.3 節點互動

- **クリック（點一下）**：選取節點，高亮顯示
- **拖曳**：變更 x, y 位置
- **雙擊（或右側 Detail 面板）**：
  - 編輯 label
  - 編輯 note
  - 選擇顏色（用簡單幾種預設色即可）

---

## 7. Edge 規範

### 7.1 Edge 資料結構

```json
{
  "id": "edge-cn-factory-to-us-port",
  "from": "node-factory-cn",
  "to": "node-us-port",
  "direction": "one-way",
  "style": "solid",
  "label": "Ocean · 30–35 days"
}
```

必要欄位：
- **id**: 唯一識別
- **from**: 起點 node id
- **to**: 終點 node id
- **direction**: "one-way" | "two-way"
- **style**: "solid" | "dashed"
- **label**: 短文字，例如：
  - "Ocean · 30–35 days"
  - "Air · 5–7 days"
  - "Data Sync"

### 7.2 Edge 畫法

1. 選擇「Add Edge」工具
2. 點第一個節點（from）
3. 點第二個節點（to）
4. 畫出帶箭頭的線，預設 direction="one-way"，style="solid"

---

## 8. 資料儲存格式（JSON）

整張圖的儲存與載入格式：

```json
{
  "meta": {
    "name": "Global Supply Chain Map",
    "version": "stage-1",
    "updatedAt": "2025-01-20T10:00:00Z"
  },
  "nodes": [ /* Node[] */ ],
  "edges": [ /* Edge[] */ ]
}
```

Stage 1 可先使用 LocalStorage / 單一 JSON 檔儲存，不強制後端實作。

---

## 9. Stage 1 Definition of Done (DoD)

**畫布操作**
- ✅ 可以平移 / 縮放
- ✅ 右下角顯示目前 Zoom %
- ✅ Reset View 可正常回到預設視角

**Node**
- ✅ 可新增 / 拖曳 / 刪除（刪除可以先不做 UI，只需在 Stage 1 有程式介面即可）
- ✅ 節點 label 可以編輯
- ✅ 節點 note 可編輯並儲存

**Edge**
- ✅ 可在兩個節點間畫線
- ✅ 線的起訖點會跟著節點移動
- ✅ 線上可顯示簡短 label

**資料持久化**
- ✅ 可將目前畫布狀態序列化成 JSON
- ✅ 可從 JSON 還原同一張圖

**整體體驗**
- ✅ 在桌機瀏覽器 (Chrome / Edge / Firefox / Safari) 上操作流暢
- ✅ 頁面載入時間合理，不會卡死

---

## 10. Stage 1 初步架構（新頁面 + 選單排序）

### 10.1 架構說明

#### 10.1.1 新頁面 ID & 選單

- 新的頁面 section：`#supplychain-section`
- 左側選單新增一個 item：
  - 文案：`Supply Chain Canvas`（或你想用中文「供應鏈圖譜」）
  - Icon 暫時可沿用一般頁面 icon
  - 排序：在 `SKU Details` 的下面

Sidebar 片段（概念示意）：

```html
&lt;nav class=&quot;sidebar-nav&quot;&gt;
  &lt;!-- ... 其他項目 ... --&gt;
  &lt;button class=&quot;nav-item&quot; data-target=&quot;sku-section&quot;&gt;SKU Details&lt;/button&gt;
  &lt;button class=&quot;nav-item&quot; data-target=&quot;supplychain-section&quot;&gt;Supply Chain Canvas&lt;/button&gt;
&lt;/nav&gt;
```

JS 切換邏輯沿用你現在的：
- 點 sidebar button → 把所有 `.module-section` 加上 `is-hidden`
- 再對應 ID 的 section 移除 `is-hidden`

#### 10.1.2 新頁面的 HTML 骨架

建議直接放在 `index.html` 的 `main.main-content` 裡面，緊接在 `#sku-section` 後面：

```html
&lt;section id=&quot;supplychain-section&quot; class=&quot;module-section is-hidden&quot;&gt;
  &lt;div class=&quot;ops-section-header&quot;&gt;
    &lt;h1&gt;Supply Chain Canvas&lt;/h1&gt;
  &lt;/div&gt;

  &lt;div class=&quot;sc-layout&quot;&gt;
    &lt;div class=&quot;sc-toolbar&quot;&gt;
      &lt;button class=&quot;sc-tool sc-tool--select is-active&quot;&gt;Select&lt;/button&gt;
      &lt;button class=&quot;sc-tool sc-tool--node&quot;&gt;Node&lt;/button&gt;
      &lt;button class=&quot;sc-tool sc-tool--edge&quot;&gt;Edge&lt;/button&gt;
      &lt;!-- 預留文字工具 --&gt;
      &lt;!-- &lt;button class=&quot;sc-tool sc-tool--text&quot;&gt;Text&lt;/button&gt; --&gt;
      &lt;button class=&quot;sc-tool sc-tool--reset&quot;&gt;Reset&lt;/button&gt;
    &lt;/div&gt;

    &lt;div class=&quot;sc-canvas-viewport&quot;&gt;
      &lt;div class=&quot;sc-canvas-content&quot; id=&quot;scCanvas&quot;&gt;
        &lt;!-- 之後由 JS 動態 render nodes &amp; edges --&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  &lt;/div&gt;

  &lt;div class=&quot;sc-status-bar&quot;&gt;
    &lt;span class=&quot;sc-zoom-indicator&quot;&gt;100%&lt;/span&gt;
    &lt;button class=&quot;sc-btn-reset&quot;&gt;Reset View&lt;/button&gt;
  &lt;/div&gt;
&lt;/section&gt;
```

#### 10.1.3 CSS 命名空間建議

為了不要跟現在的 table / SKU layout 打架，這頁統一用 `sc-` prefix：

```css
/* 頁面 layout */
.sc-layout {
  display: flex;
  height: calc(100vh - 200px); /* 視情況微調，避開 header */
}

/* 左側工具列 */
.sc-toolbar {
  width: 80px;
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* 右側畫布區 */
.sc-canvas-viewport {
  flex: 1;
  overflow: hidden; /* 不使用 scroll，平移交給 transform */
  position: relative;
  background: #f8fafc;
}

.sc-canvas-content {
  width: 100%;
  height: 100%;
  transform-origin: center center;
  /* 之後由 JS 改寫 translate + scale */
}

/* 狀態列 */
.sc-status-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: #64748b;
}
```
