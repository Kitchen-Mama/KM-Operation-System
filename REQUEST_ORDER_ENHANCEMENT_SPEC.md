# 下單系統 UI 增強規格書
## Request Order System Enhancement Specification

> **設計原則**: 在現有結構上做最小化增強，不重構整體架構

---

## 📋 目標

在現有下單系統表格中增加以下決策資訊：
- Risk Level (風險等級)
- Remaining Days (站點剩餘天數)  
- Lead Time (補貨前置期)
- Shortage M1/M2/M3 (三期缺貨量)
- Suggested Order (建議下單量)
- Projected Coverage Days After Order (下單後預估庫存天數)

---

## 🎯 表格結構調整

### 現有結構
```
[Risk] [SKU] | [Country] [Marketplace] | [Last 3M Overview] | [Upcoming FC] | [Inventory & Ongoing] | [Action]
```

### 調整後結構
```
[Risk] [SKU] | [Country] [Marketplace] | [Last 3M Overview] | [Upcoming FC] | [Coverage & Time] | [Inventory & Ongoing] | [Shortage M1/M2/M3] | [Decision]
```

---

## 📐 HTML 結構範例

### 1️⃣ 表頭結構 (Level 1 + Level 2)

```html
<div class="km-table__header-row km-table__header-row--level1">
    <!-- Risk (新增) -->
    <div class="km-table__header-cell km-table__header-cell--rowspan" style="width:60px;">Risk</div>
    
    <!-- SKU (固定列) -->
    <div class="km-table__header-cell km-table__header-cell--rowspan" style="width:120px;">SKU</div>
    
    <!-- Country & Marketplace -->
    <div class="km-table__header-cell km-table__header-cell--rowspan" style="width:100px;">Country</div>
    <div class="km-table__header-cell km-table__header-cell--rowspan" style="width:120px;">Marketplace</div>
    
    <!-- Last 3 Month Overview (保持不變) -->
    <div class="km-table__header-cell" style="width:700px;">Last 3 Month Overview</div>
    
    <!-- Upcoming FC (保持不變) -->
    <div class="km-table__header-cell" style="width:280px;">Upcoming FC</div>
    
    <!-- Coverage & Time (新增) -->
    <div class="km-table__header-cell" style="width:200px;">Coverage & Time</div>
    
    <!-- Inventory & Ongoing Orders (保持不變) -->
    <div class="km-table__header-cell" style="width:560px;">Inventory & Ongoing</div>
    
    <!-- Shortage (新增) -->
    <div class="km-table__header-cell" style="width:300px;">Shortage</div>
    
    <!-- Decision (取代原 Action Items) -->
    <div class="km-table__header-cell" style="width:200px;">Decision</div>
</div>

<div class="km-table__header-row km-table__header-row--level2">
    <!-- Last 3M Overview 子欄位 (保持不變) -->
    <div class="km-table__header-cell" style="width:140px;">達成率</div>
    <div class="km-table__header-cell" style="width:140px;">Forecast</div>
    <div class="km-table__header-cell" style="width:140px;">Actual</div>
    <div class="km-table__header-cell" style="width:140px;">Sessions</div>
    <div class="km-table__header-cell" style="width:140px;">USP</div>
    
    <!-- Upcoming FC 子欄位 (保持不變) -->
    <div class="km-table__header-cell" style="width:140px;">Basic (T3)</div>
    <div class="km-table__header-cell" style="width:140px;">Special Events</div>
    
    <!-- Coverage & Time 子欄位 (新增) -->
    <div class="km-table__header-cell" style="width:100px;">Remaining</div>
    <div class="km-table__header-cell" style="width:100px;">Lead Time</div>
    
    <!-- Inventory & Ongoing 子欄位 (保持不變) -->
    <div class="km-table__header-cell" style="width:140px;">Site Stock</div>
    <div class="km-table__header-cell" style="width:140px;">3rd Party</div>
    <div class="km-table__header-cell" style="width:140px;">Factory Stock</div>
    <div class="km-table__header-cell" style="width:140px;">Ongoing Orders</div>
    
    <!-- Shortage 子欄位 (新增) -->
    <div class="km-table__header-cell" style="width:100px;">M1</div>
    <div class="km-table__header-cell" style="width:100px;">M2</div>
    <div class="km-table__header-cell" style="width:100px;">M3</div>
    
    <!-- Decision 子欄位 (新增) -->
    <div class="km-table__header-cell" style="width:200px;">Suggest Order</div>
</div>
```

### 2️⃣ 資料列結構範例

```html
<div class="scroll-row">
    <!-- Risk Badge (新增) -->
    <div class="scroll-cell col-risk">
        <span class="badge-risk badge-risk--critical" data-field="riskLevel">Critical</span>
    </div>
    
    <!-- Country & Marketplace -->
    <div class="scroll-cell">US</div>
    <div class="scroll-cell">Amazon</div>
    
    <!-- Last 3M Overview (保持不變) -->
    <div class="scroll-cell">95%</div>
    <div class="scroll-cell">5,000</div>
    <div class="scroll-cell">4,750</div>
    <div class="scroll-cell">12,000</div>
    <div class="scroll-cell">12.5%</div>
    
    <!-- Upcoming FC (保持不變) -->
    <div class="scroll-cell">4,200</div>
    <div class="scroll-cell">800</div>
    
    <!-- Coverage & Time (新增) -->
    <div class="scroll-cell col-coverage">
        <div class="coverage-info">
            <span class="coverage-days" data-field="remainingDays">32d</span>
            <span class="coverage-target">/ 60d</span>
        </div>
        <div class="coverage-bar">
            <div class="coverage-bar__fill" style="width: 53%;"></div>
        </div>
    </div>
    <div class="scroll-cell col-leadtime">
        <span data-field="leadTimeDays">45d</span>
    </div>
    
    <!-- Inventory & Ongoing (保持不變) -->
    <div class="scroll-cell">1,200</div>
    <div class="scroll-cell">350</div>
    <div class="scroll-cell">800</div>
    <div class="scroll-cell">500</div>
    
    <!-- Shortage (新增) -->
    <div class="scroll-cell col-shortage col-shortage--negative" data-field="shortageMonth1">-350</div>
    <div class="scroll-cell col-shortage col-shortage--neutral" data-field="shortageMonth2">0</div>
    <div class="scroll-cell col-shortage col-shortage--positive" data-field="shortageMonth3">120</div>
    
    <!-- Decision (新增) -->
    <div class="scroll-cell col-decision">
        <div class="decision-summary">
            <div class="decision-row">
                <span class="decision-label">Need:</span>
                <span class="decision-value" data-field="totalNeedUnits">1,500</span>
                <span class="decision-unit">pcs</span>
            </div>
            <div class="decision-row">
                <span class="decision-label">Suggest:</span>
                <span class="decision-value" data-field="suggestedOrderCases">125</span>
                <span class="decision-unit">cases</span>
            </div>
            <div class="decision-row decision-row--coverage">
                <span class="decision-label">After:</span>
                <span class="decision-value" data-field="projectedCoverageDaysAfterOrder">52d</span>
            </div>
        </div>
        <button class="btn-request" data-action="request-order">Request</button>
    </div>
</div>
```

---

## 🎨 CSS 樣式規格

### 1️⃣ Risk Badge

```css
/* Risk 欄位容器 */
.col-risk {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
}

/* Risk Badge 基礎樣式 */
.badge-risk {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
}

/* Risk 狀態顏色 */
.badge-risk--critical {
    background: #FEE2E2;
    color: #DC2626;
    border: 1px solid #FCA5A5;
}

.badge-risk--warning {
    background: #FEF3C7;
    color: #D97706;
    border: 1px solid #FCD34D;
}

.badge-risk--safe {
    background: #D1FAE5;
    color: #059669;
    border: 1px solid #6EE7B7;
}

.badge-risk--overstock {
    background: #DBEAFE;
    color: #2563EB;
    border: 1px solid #93C5FD;
}
```

### 2️⃣ Coverage & Time

```css
/* Coverage 欄位 */
.col-coverage {
    padding: 6px 8px;
}

.coverage-info {
    display: flex;
    align-items: baseline;
    gap: 2px;
    margin-bottom: 4px;
    font-size: 12px;
}

.coverage-days {
    font-weight: 600;
    color: #1F2937;
}

.coverage-target {
    font-size: 11px;
    color: #9CA3AF;
}

/* Coverage Progress Bar */
.coverage-bar {
    width: 100%;
    height: 4px;
    background: #E5E7EB;
    border-radius: 2px;
    overflow: hidden;
}

.coverage-bar__fill {
    height: 100%;
    background: #7FB069;
    transition: width 0.3s ease;
}

/* Lead Time 欄位 */
.col-leadtime {
    font-size: 12px;
    font-weight: 500;
    color: #6B7280;
    text-align: center;
}
```

### 3️⃣ Shortage

```css
/* Shortage 欄位基礎 */
.col-shortage {
    font-size: 12px;
    font-weight: 600;
    text-align: right;
    padding: 6px 8px;
}

/* Shortage 狀態顏色 */
.col-shortage--negative {
    color: #DC2626;
    background: #FEF2F2;
}

.col-shortage--neutral {
    color: #6B7280;
}

.col-shortage--positive {
    color: #059669;
    background: #F0FDF4;
}
```

### 4️⃣ Decision

```css
/* Decision 欄位容器 */
.col-decision {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px;
}

/* Decision Summary */
.decision-summary {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.decision-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 11px;
}

.decision-label {
    color: #6B7280;
    min-width: 40px;
}

.decision-value {
    font-weight: 600;
    color: #1F2937;
}

.decision-unit {
    color: #9CA3AF;
    font-size: 10px;
}

.decision-row--coverage .decision-value {
    color: #7FB069;
}

/* Request Button */
.btn-request {
    padding: 4px 12px;
    background: #7FB069;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}

.btn-request:hover {
    background: #6A9B57;
}

/* Risk-based button colors (可由 JS 動態添加) */
.btn-request--critical {
    background: #DC2626;
}

.btn-request--critical:hover {
    background: #B91C1C;
}

.btn-request--warning {
    background: #F59E0B;
}

.btn-request--warning:hover {
    background: #D97706;
}
```

---

## 📊 資料欄位對應

### JavaScript Data Fields

```javascript
{
  // Risk & Basic Info
  riskLevel: 'Critical',           // 'Critical' | 'Warning' | 'Safe' | 'Overstock'
  sku: 'KM-OP-001',
  country: 'US',
  marketplace: 'Amazon',
  
  // Last 3M Overview (保持不變)
  achievementRate: 95,
  forecast: 5000,
  actual: 4750,
  sessions: 12000,
  usp: '12.5%',
  
  // Upcoming FC (保持不變)
  basicFcT3: 4200,
  specialEventsFc: 800,
  
  // Coverage & Time (新增)
  remainingDays: 32,               // 站點剩餘天數
  targetCoverageDays: 60,          // 目標庫存天數
  leadTimeDays: 45,                // 補貨前置期
  
  // Inventory & Ongoing (保持不變)
  siteStock: 1200,
  thirdPartyStock: 350,
  factoryStock: 800,
  totalOngoingOrders: 500,
  
  // Shortage (新增)
  shortageMonth1: -350,            // 負數=缺貨
  shortageMonth2: 0,
  shortageMonth3: 120,             // 正數=有餘
  
  // Decision (新增)
  totalNeedUnits: 1500,            // 總需求量 (pcs)
  suggestedOrderCases: 125,        // 建議訂購量 (cases)
  suggestedOrderUnits: 1500,       // 建議訂購量 (units)
  projectedCoverageDaysAfterOrder: 52  // 下單後預估庫存天數
}
```

---

## 🔄 JS 渲染邏輯調整

### 最小化修改點

1. **renderRequestOrderTable()** - 更新表頭和資料列 HTML
2. **generateMockRequestOrderData()** - 確保包含新欄位
3. **新增 helper function**:

```javascript
// 計算 Coverage Bar 寬度
function calculateCoverageWidth(remaining, target) {
  return Math.min(100, (remaining / target) * 100);
}

// 判斷 Shortage 狀態 class
function getShortageClass(value) {
  if (value < 0) return 'col-shortage--negative';
  if (value > 0) return 'col-shortage--positive';
  return 'col-shortage--neutral';
}

// 判斷 Risk-based button class
function getRequestButtonClass(riskLevel) {
  if (riskLevel === 'Critical') return 'btn-request--critical';
  if (riskLevel === 'Warning') return 'btn-request--warning';
  return '';
}
```

---

## ✅ 實作檢查清單

- [ ] 更新 HTML 表頭結構 (Level 1 + Level 2)
- [ ] 更新資料列 HTML 結構
- [ ] 新增 CSS 樣式 (badge-risk, col-coverage, col-shortage, col-decision)
- [ ] 更新 JS 資料模型 (新增欄位)
- [ ] 更新 renderRequestOrderTable() 函數
- [ ] 測試不同 Risk Level 的視覺效果
- [ ] 測試 Shortage 正負值的顏色顯示
- [ ] 測試 Coverage Bar 的寬度計算
- [ ] 確認表格橫向滾動正常
- [ ] 確認與現有篩選器功能相容

---

## 📝 注意事項

1. **不改動現有四大區塊的核心邏輯**，只在中間插入新區塊
2. **保持現有 dual-layer-table 結構**，不重構表格系統
3. **CSS 使用現有綠色系 (#7FB069)**，不引入新色系
4. **data-field 屬性**方便未來 JS 動態更新數值
5. **所有數值都是 placeholder**，實際計算由 forecast-engine.js 提供
6. **Risk Badge 和 Button 顏色可由 JS 動態控制** (透過 class)

---

## 🎯 預期效果

- ✅ 一眼看出 SKU 風險等級 (Risk Badge)
- ✅ 快速判斷庫存剩餘天數 (Coverage Bar)
- ✅ 清楚看到三期缺貨狀況 (Shortage 紅綠標示)
- ✅ 明確的下單建議 (Decision 區塊)
- ✅ 保持現有表格結構和操作流程
- ✅ 視覺層級清晰，決策資訊突出

---

**文檔版本**: v1.0  
**最後更新**: 2025-01-XX  
**負責人**: Amazon Q Developer
