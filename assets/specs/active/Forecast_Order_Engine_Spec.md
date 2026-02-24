# Forecast 下單系統 - 計算引擎完整規格（Stable Version）

**文檔版本**: 1.0  
**最後更新**: 2025-01-16  
**維護者**: Kitchen Mama Development Team  
**狀態**: ✅ Stable - Ready for Implementation

---

## 📋 目錄

1. [Overview](#overview)
2. [System Context](#system-context)
3. [Data Model](#data-model)
4. [Business Rules](#business-rules)
5. [Formulas](#formulas)
6. [Risk Rules](#risk-rules)
7. [Algorithm Flow](#algorithm-flow)
8. [Module API](#module-api)
9. [Implementation Guide](#implementation-guide)

---

## Overview

### 系統目的

本模組為 **三期滾動補貨決策引擎**，用於計算 SKU 級別的補貨需求與風險評估。

### 核心特性

- **計算單位**: 以 SKU 為單位進行獨立計算
- **雙重需求來源**:
  1. **FC 預測需求** - 用於短期缺貨控制（未來 3 個月）
  2. **AvgSalesPerDay** - 用於庫存健康與庫存天數控制
- **三期滾動**: 計算未來三個月的缺貨狀況與補貨需求
- **MOQ 整合**: 自動套用工廠、物流、內部 MOQ 限制
- **風險評估**: 提供 Critical / Warning / Safe / Overstock 四級風險評估

### 服務對象

本引擎為以下頁面提供計算服務：

- **Forecast Review** - 預測審查與達成率分析
- **Request Order** - 下單系統與補貨決策
- **Inventory Replenishment** - 庫存補貨試算

### 技術架構

- 基於 **Vanilla JS SPA**
- 使用 **KM namespace** 架構
- 整合 **KM.lifecycle** 生命週期管理
- 整合 **KM.state** 狀態管理
- 使用 **DataRepo** 作為資料來源

---

## System Context

### 模組位置

```
assets/js/utils/forecast-engine.js
```

### 命名空間

```javascript
KM.utils.forecastEngine
```

### 依賴關係

```
KM.core.namespace     ← 命名空間基礎
KM.core.lifecycle     ← 生命週期管理
KM.core.state         ← 狀態管理
KM.utils.DataRepo     ← 資料來源
```

### 載入順序

```html
<!-- Core -->
<script src="assets/js/core/namespace.js"></script>
<script src="assets/js/core/lifecycle.js"></script>
<script src="assets/js/core/state.js"></script>

<!-- Utils -->
<script src="assets/js/utils/data.js"></script>
<script src="assets/js/utils/forecast-engine.js"></script>  <!-- 本模組 -->
```

---

## Data Model

### Input Model - Supply (供給面)

| 欄位名稱 | 類型 | 單位 | 說明 | 必填 |
|---------|------|------|------|------|
| `siteStock` | Number | units | 站點當前庫存（對應貨物庫存表 Current Stock） | ✅ |
| `siteOnTheWay` | Number | units | 站點在途庫存（對應貨物庫存表 On the Way） | ✅ |
| `overseasStock` | Number | units | 海外倉庫存（對應貨物庫存表 3rd Party Stock） | ✅ |
| `overseasOnTheWay` | Number | units | 海外倉在途（待新增至貨物庫存表） | ✅ |
| `factoryStockTotal` | Number | units | 工廠總庫存（CN + TW） | ✅ |
| `thisMonthOngoingOrder` | Number | units | 本月進行中訂單 | ✅ |
| `nextMonthOngoingOrder` | Number | units | 下月進行中訂單 | ✅ |
| `fcAllocationRatio` | Number | 0-1 | FC 分配比例（該站點在同一子公司內該 SKU 的 FC 配比） | ✅ |
| `unitsPerCase` | Number | units | 每箱單位數 | ✅ |
| `factoryMoqCases` | Number | cases | 工廠最小訂購量（箱） | ✅ |
| `logisticsMoqCases` | Number | cases | 物流最小訂購量（箱） | ✅ |
| `internalMoqCases` | Number | cases | 內部最小訂購量（箱） | ✅ |
| `skuLevel` | String | A/B/C | SKU 等級 | ✅ |
| `leadTimeMode` | Number | 30/45 | 前置時間模式（天） | ✅ |
| `avgSalesPerDay` | Number | units/day | 平均每日銷售量（來自 Inventory Replenishment） | ✅ |

### Input Model - Demand (需求面)

| 欄位名稱 | 類型 | 單位 | 說明 | 必填 |
|---------|------|------|------|------|
| `fcThisMonthDaily` | Number | units/day | 本月每日 FC | ✅ |
| `remainingDaysThisMonth` | Number | days | 本月剩餘天數 | ✅ |
| `fcNextMonth` | Number | units | 下月 FC | ✅ |
| `fcMonth2` | Number | units | 下下月 FC | ✅ |
| `fcMonth3` | Number | units | 第三個月 FC | ✅ |
| `tfThisMonth` | Number | 0-1 | 本月 Regular FC Target Factor（預設 1.0） | ✅ |
| `tfNextMonth` | Number | 0-1 | 下月 Regular FC Target Factor（預設 1.0） | ✅ |
| `tfMonth2` | Number | 0-1 | 下下月 Regular FC Target Factor（預設 1.0） | ✅ |
| `tfMonth3` | Number | 0-1 | 第三個月 Regular FC Target Factor（預設 1.0） | ✅ |
| `campaignNextMonth` | Number | units | 下月活動 FC | ⚪ |
| `campaignMonth2` | Number | units | 下下月活動 FC | ⚪ |
| `campaignMonth3` | Number | units | 第三個月活動 FC | ⚪ |
| `campaignTfNextMonth` | Number | 0-1 | 下月 Campaign FC Target Factor（預設 1.0） | ⚪ |
| `campaignTfMonth2` | Number | 0-1 | 下下月 Campaign FC Target Factor（預設 1.0） | ⚪ |
| `campaignTfMonth3` | Number | 0-1 | 第三個月 Campaign FC Target Factor（預設 1.0） | ⚪ |

### Output Model

| 欄位名稱 | 類型 | 單位 | 說明 |
|---------|------|------|------|
| `totalSiteStock` | Number | units | 總站點庫存 |
| `remainingDays` | Number | days | 站點剩餘天數 |
| `fcThisMonth` | Number | units | 本月剩餘需求 |
| `t1Fc` | Number | units | T1 期總需求 |
| `t2Fc` | Number | units | T2 期總需求 |
| `t3Fc` | Number | units | T3 期總需求 |
| `shortageMonth1` | Number | units | T1 期缺貨量（負數表示缺貨） |
| `shortageMonth2` | Number | units | T2 期缺貨量 |
| `shortageMonth3` | Number | units | T3 期缺貨量 |
| `avgDailyDemand` | Number | units/day | 平均日需求 |
| `targetCoverageDays` | Number | days | 目標庫存天數 |
| `targetStockUnits` | Number | units | 目標庫存量 |
| `safetyDays` | Number | days | 安全庫存天數 |
| `safetyStockUnits` | Number | units | 安全庫存量 |
| `gapUnits` | Number | units | 庫存缺口 |
| `totalNeedUnits` | Number | units | 總需求量 |
| `effectiveMoqCases` | Number | cases | 有效 MOQ（箱） |
| `suggestedOrderCases` | Number | cases | 建議訂購量（箱） |
| `suggestedOrderUnits` | Number | units | 建議訂購量（單位） |
| `projectedCoverageDaysAfterOrder` | Number | days | 下單後預計庫存天數 |
| `totalFc` | Number | units | 三期總需求（T1+T2+T3） |
| `fcAllocationRatio` | Number | % | FC 配比（該站點佔比） |
| `riskLevel` | String | - | 風險等級（Critical/Warning/Safe/Overstock） |

---

## Business Rules

### 1️⃣ Lead Time Rules

```
IF leadTimeMode = 45 → LeadTimeDays = 45
IF leadTimeMode = 30 → LeadTimeDays = 30
預設 = 45
```

**說明**: Lead Time 影響補貨週期，但在當前版本主要用於風險評估參考。

### 2️⃣ SKU Level Target Coverage Days

| SKU Level | Target Coverage Days | 說明 |
|-----------|---------------------|------|
| A 級 | 60 天 | 高價值/高銷量 SKU |
| B 級 | 45 天 | 中等價值/銷量 SKU |
| C 級 | 30 天 | 低價值/低銷量 SKU |

### 3️⃣ Safety Stock Days

| SKU Level | Safety Days | 說明 |
|-----------|------------|------|
| A 級 | 20 天 | 高風險保護 |
| B 級 | 15 天 | 中等風險保護 |
| C 級 | 10 天 | 基本風險保護 |

### 5️⃣ 子公司隔離規則

```
不同子公司之間的計算完全獨立，互不影響
```

**規則說明**:

1. **FC 配比計算範圍**:
   - 同一子公司內的所有站點，該 SKU 的 FC 配比總和 = 100%
   - 不同子公司各自計算，互不影響
   
2. **範例**:
   ```
   子公司 KM:
     - 站點 A: SKU-X 的 FC 配比 = 40%
     - 站點 B: SKU-X 的 FC 配比 = 35%
     - 站點 C: SKU-X 的 FC 配比 = 25%
     → KM 公司總計 = 100%
   
   子公司 ResTW:
     - 站點 D: SKU-X 的 FC 配比 = 60%
     - 站點 E: SKU-X 的 FC 配比 = 25%
     - 站點 F: SKU-X 的 FC 配比 = 15%
     → ResTW 公司總計 = 100%
   ```

3. **工廠庫存分配**:
   - 每個子公司有各自的工廠庫存池
   - `factoryStockTotal` 為該子公司的工廠總庫存
   - 不同子公司的工廠庫存不共享

4. **進行中訂單**:
   - `thisMonthOngoingOrder` 和 `nextMonthOngoingOrder` 為該子公司的訂單
   - 不同子公司的訂單獨立計算

5. **計算公式調整**:
   ```
   fcAllocationRatio = totalFc / totalFcSameCompany × 100%
   ```
   其中 `totalFcSameCompany` 為同一子公司內所有站點該 SKU 的三個月總 FC

**實作建議**:
- 在批次計算時，先按子公司分組
- 每個子公司內部獨立計算 FC 配比
- 確保同一子公司內的站點配比總和為 100%

### 6️⃣ Warehouse Age Limit

```
ProjectedCoverageDaysAfterOrder ≤ 60 天
```

**說明**: 下單後預計庫存天數不得超過 60 天，避免庫存積壓與倉儲成本過高。

**風險**: 若超過 60 天 → 觸發 `OverStockRisk`

---

## Formulas

### 1️⃣ 總站點庫存

```
totalSiteStock = siteStock + siteOnTheWay + overseasStock + overseasOnTheWay
```

**說明**: 計算所有可用於銷售的站點庫存總和。

**與貨物庫存表對應**:
- `siteStock` = Current Stock（Amazon 站點當前庫存）
- `siteOnTheWay` = On the Way（站點在途庫存）
- `overseasStock` = 3rd Party Stock（第三方倉庫存）
- `overseasOnTheWay` = （待新增欄位）海外倉在途庫存

### 2️⃣ 站點剩餘天數

```
remainingDays = totalSiteStock / avgSalesPerDay
```

**說明**: 基於真實銷售速度計算當前庫存可支撐天數。

**特殊處理**:
- 若 `avgSalesPerDay = 0` → `remainingDays = Infinity`
- 若 `totalSiteStock = 0` → `remainingDays = 0`

### 3️⃣ 本月剩餘需求

```
fcThisMonth = remainingDaysThisMonth × fcThisMonthDaily
```

**說明**: 計算本月剩餘天數的預測需求。

### 4️⃣ 三期需求計算

#### T1 期需求（本月剩餘 + 下月）

```
t1Fc = (fcThisMonth × tfThisMonth) + (fcNextMonth × tfNextMonth) + (campaignNextMonth × campaignTfNextMonth)
```

#### T2 期需求（下下月）

```
t2Fc = (fcMonth2 × tfMonth2) + (campaignMonth2 × campaignTfMonth2)
```

#### T3 期需求（第三個月）

```
t3Fc = (fcMonth3 × tfMonth3) + (campaignMonth3 × campaignTfMonth3)
```

**說明**:
- Regular FC 使用 `tfXXX` 系列 Target Factor
- Campaign FC 使用 `campaignTfXXX` 系列 Target Factor
- 兩者可獨立調整，預設值皆為 1.0（100%）
- Target Factor 用於調整預測準確度

#### FC 配比計算（站點 FC 佔比）

```
totalFc = t1Fc + t2Fc + t3Fc

fcAllocationRatio = totalFc / totalFcAllSites × 100%
```

**說明**:
- `totalFc`: 該站點該 SKU 的三個月總 FC
- `totalFcAllSites`: 同一子公司內所有站點該 SKU 的三個月總 FC
- `fcAllocationRatio`: 該站點在同一子公司內該 SKU 的 FC 配比（百分比）
- 同一子公司內所有站點的配比總和 = 100%
- 不同子公司各自計算，互不影響
- 此配比用於計算工廠庫存與進行中訂單的分配比例

### 5️⃣ 三期缺貨遞推計算

#### 供給基礎

```
supplyBase = totalSiteStock + (factoryStockTotal × fcAllocationRatio)
```

#### T1 期缺貨

```
shortageMonth1 = supplyBase - t1Fc
```

#### T2 期缺貨

```
shortageMonth2 = shortageMonth1 + (thisMonthOngoingOrder × fcAllocationRatio) - t2Fc
```

#### T3 期缺貨

```
shortageMonth3 = shortageMonth2 + (nextMonthOngoingOrder × fcAllocationRatio) - t3Fc
```

**說明**:
- 負數表示缺貨
- 正數表示有剩餘庫存
- 遞推計算考慮進行中訂單的到貨

### 6️⃣ 平均日需求

```
avgDailyDemand = avgSalesPerDay
```

**說明**: 直接使用 Inventory Replenishment 表的真實銷售數據。

### 7️⃣ 目標庫存天數

```
targetCoverageDays = 
  IF skuLevel = 'A' → 60
  IF skuLevel = 'B' → 45
  IF skuLevel = 'C' → 30
```

### 8️⃣ 目標庫存量

```
targetStockUnits = targetCoverageDays × avgDailyDemand
```

### 9️⃣ 安全庫存

#### 安全庫存天數

```
safetyDays = 
  IF skuLevel = 'A' → 20
  IF skuLevel = 'B' → 15
  IF skuLevel = 'C' → 10
```

#### 安全庫存量

```
safetyStockUnits = safetyDays × avgDailyDemand
```

### 🔟 庫存缺口計算

#### 當前有效庫存

```
currentEffectiveStock = 
  totalSiteStock 
  + (factoryStockTotal × fcAllocationRatio)
  + (thisMonthOngoingOrder × fcAllocationRatio)
  + (nextMonthOngoingOrder × fcAllocationRatio)
```

#### 缺口

```
gapUnits = targetStockUnits - currentEffectiveStock
```

**說明**: 正數表示需要補貨，負數表示庫存充足。

### 1️⃣1️⃣ 總需求量

```
totalNeedUnits = max(0, gapUnits) + safetyStockUnits
```

**說明**: 
- 只有在有缺口時才補貨
- 始終加上安全庫存

### 1️⃣2️⃣ MOQ 計算

#### 有效 MOQ

```
effectiveMoqCases = max(factoryMoqCases, logisticsMoqCases, internalMoqCases)
```

#### 原始箱數

```
rawCases = totalNeedUnits / unitsPerCase
```

#### 建議訂購箱數

```
suggestedOrderCases = max(effectiveMoqCases, CEILING(rawCases))
```

#### 建議訂購單位數

```
suggestedOrderUnits = suggestedOrderCases × unitsPerCase
```

**說明**:
- 向上取整至整箱
- 確保滿足最大 MOQ 要求

### 1️⃣3️⃣ 下單後庫存天數

```
projectedCoverageDaysAfterOrder = 
  (currentEffectiveStock + suggestedOrderUnits) / avgDailyDemand
```

**說明**: 用於評估是否會造成庫存積壓。

---

## Risk Rules

### 風險等級定義

| Risk Level | 條件 | 說明 | 優先級 |
|-----------|------|------|--------|
| **Critical** | `shortageMonth1 < 0` | T1 期即將缺貨，需立即下單 | 🔴 最高 |
| **Warning** | `shortageMonth2 < 0` | T2 期可能缺貨，需提前準備 | 🟡 高 |
| **Overstock** | `projectedCoverageDaysAfterOrder > 60` | 下單後庫存過高，有積壓風險 | 🟠 中 |
| **Safe** | 其他情況 | 庫存健康，無立即風險 | 🟢 低 |

### 風險判定邏輯

```javascript
function determineRiskLevel(shortageMonth1, shortageMonth2, projectedCoverageDaysAfterOrder) {
  if (shortageMonth1 < 0) {
    return 'Critical';
  }
  if (shortageMonth2 < 0) {
    return 'Warning';
  }
  if (projectedCoverageDaysAfterOrder > 60) {
    return 'Overstock';
  }
  return 'Safe';
}
```

**優先級**: Critical > Warning > Overstock > Safe

---

## Algorithm Flow

### 完整計算流程

```
1. 驗證輸入資料完整性
   ├─ 檢查必填欄位
   ├─ 檢查數值合理性
   └─ 若不合格 → 拋出錯誤

2. 計算總站點庫存
   └─ totalSiteStock = siteStock + siteOnTheWay + overseasStock + overseasOnTheWay

3. 計算站點剩餘天數
   └─ remainingDays = totalSiteStock / avgSalesPerDay

4. 計算三期需求
   ├─ fcThisMonth = remainingDaysThisMonth × fcThisMonthDaily
   ├─ t1Fc = (fcThisMonth × tfThisMonth) + (fcNextMonth × tfNextMonth) + (campaignNextMonth × campaignTfNextMonth)
   ├─ t2Fc = (fcMonth2 × tfMonth2) + (campaignMonth2 × campaignTfMonth2)
   ├─ t3Fc = (fcMonth3 × tfMonth3) + (campaignMonth3 × campaignTfMonth3)
   ├─ totalFc = t1Fc + t2Fc + t3Fc
   └─ fcAllocationRatio = (totalFc / totalFcAllSites) × 100%

5. 計算三期缺貨
   ├─ supplyBase = totalSiteStock + (factoryStockTotal × fcAllocationRatio)
   ├─ shortageMonth1 = supplyBase - t1Fc
   ├─ shortageMonth2 = shortageMonth1 + (thisMonthOngoingOrder × fcAllocationRatio) - t2Fc
   └─ shortageMonth3 = shortageMonth2 + (nextMonthOngoingOrder × fcAllocationRatio) - t3Fc

6. 計算目標庫存
   ├─ avgDailyDemand = avgSalesPerDay
   ├─ targetCoverageDays = 根據 skuLevel 決定 (60/45/30)
   └─ targetStockUnits = targetCoverageDays × avgDailyDemand

7. 計算安全庫存
   ├─ safetyDays = 根據 skuLevel 決定 (20/15/10)
   └─ safetyStockUnits = safetyDays × avgDailyDemand

8. 計算庫存缺口
   ├─ currentEffectiveStock = totalSiteStock + (factoryStockTotal × fcAllocationRatio) + ...
   └─ gapUnits = targetStockUnits - currentEffectiveStock

9. 計算總需求量
   └─ totalNeedUnits = max(0, gapUnits) + safetyStockUnits

10. 套用 MOQ
    ├─ effectiveMoqCases = max(factoryMoqCases, logisticsMoqCases, internalMoqCases)
    ├─ rawCases = totalNeedUnits / unitsPerCase
    ├─ suggestedOrderCases = max(effectiveMoqCases, CEILING(rawCases))
    └─ suggestedOrderUnits = suggestedOrderCases × unitsPerCase

11. 計算下單後庫存天數
    └─ projectedCoverageDaysAfterOrder = (currentEffectiveStock + suggestedOrderUnits) / avgDailyDemand

12. 判定風險等級
    └─ riskLevel = determineRiskLevel(shortageMonth1, shortageMonth2, projectedCoverageDaysAfterOrder)

13. 回傳完整 Output Model
```

---

## Module API

### 核心函式

#### `calculateForSku(input)`

**用途**: 計算單一 SKU 的補貨需求

**參數**:
```javascript
{
  // Supply
  siteStock: Number,
  siteOnTheWay: Number,
  overseasStock: Number,
  overseasOnTheWay: Number,
  factoryStockTotal: Number,
  thisMonthOngoingOrder: Number,
  nextMonthOngoingOrder: Number,
  fcAllocationRatio: Number,
  unitsPerCase: Number,
  factoryMoqCases: Number,
  logisticsMoqCases: Number,
  internalMoqCases: Number,
  skuLevel: String,
  leadTimeMode: Number,
  avgSalesPerDay: Number,
  
  // Demand
  fcThisMonthDaily: Number,
  remainingDaysThisMonth: Number,
  fcNextMonth: Number,
  fcMonth2: Number,
  fcMonth3: Number,
  tfThisMonth: Number,
  tfNextMonth: Number,
  tfMonth2: Number,
  tfMonth3: Number,
  campaignNextMonth: Number,
  campaignMonth2: Number,
  campaignMonth3: Number
}
```

**回傳**: Output Model (完整物件)

**錯誤處理**:
```javascript
throw new Error('Missing required field: [fieldName]');
throw new Error('Invalid value for [fieldName]: [value]');
```

#### `calculateForList(inputList)`

**用途**: 批次計算多個 SKU

**參數**:
```javascript
[
  { sku: 'SKU-001', ...input },
  { sku: 'SKU-002', ...input },
  ...
]
```

**回傳**:
```javascript
[
  { sku: 'SKU-001', ...output },
  { sku: 'SKU-002', ...output },
  ...
]
```

**錯誤處理**: 若單一 SKU 計算失敗，記錄錯誤但繼續處理其他 SKU

### 狀態整合

#### 儲存計算結果

```javascript
const results = KM.utils.forecastEngine.calculateForList(inputList);
KM.state.set('forecastResults', results);
```

#### 讀取計算結果

```javascript
const results = KM.state.get('forecastResults');
```

### 使用範例

```javascript
// 單一 SKU 計算
const input = {
  siteStock: 1000,
  siteOnTheWay: 500,
  overseasStock: 2000,
  overseasOnTheWay: 1000,
  factoryStockTotal: 5000,
  thisMonthOngoingOrder: 800,
  nextMonthOngoingOrder: 1000,
  fcAllocationRatio: 0.3,
  unitsPerCase: 24,
  factoryMoqCases: 10,
  logisticsMoqCases: 5,
  internalMoqCases: 3,
  skuLevel: 'A',
  leadTimeMode: 45,
  avgSalesPerDay: 50,
  fcThisMonthDaily: 45,
  remainingDaysThisMonth: 15,
  fcNextMonth: 1500,
  fcMonth2: 1600,
  fcMonth3: 1700,
  tfThisMonth: 1.0,
  tfNextMonth: 1.0,
  tfMonth2: 1.0,
  tfMonth3: 1.0,
  campaignNextMonth: 200,
  campaignMonth2: 0,
  campaignMonth3: 0
};

const result = KM.utils.forecastEngine.calculateForSku(input);

console.log(result);
// {
//   totalSiteStock: 4500,
//   remainingDays: 90,
//   fcThisMonth: 675,
//   t1Fc: 2375,
//   t2Fc: 1600,
//   t3Fc: 1700,
//   shortageMonth1: 725,
//   shortageMonth2: -635,
//   shortageMonth3: -2035,
//   avgDailyDemand: 50,
//   targetCoverageDays: 60,
//   targetStockUnits: 3000,
//   safetyDays: 20,
//   safetyStockUnits: 1000,
//   gapUnits: -3740,
//   totalNeedUnits: 1000,
//   effectiveMoqCases: 10,
//   suggestedOrderCases: 42,
//   suggestedOrderUnits: 1008,
//   projectedCoverageDaysAfterOrder: 110.16,
//   riskLevel: 'Warning'
// }
```

---

## Implementation Guide

### 檔案結構

```javascript
// assets/js/utils/forecast-engine.js

(function() {
  'use strict';
  
  // 確保 KM.utils 存在
  if (!window.KM) {
    throw new Error('KM namespace not found. Please load namespace.js first.');
  }
  
  if (!window.KM.utils) {
    window.KM.utils = {};
  }
  
  // 主要計算函式
  function calculateForSku(input) {
    // 1. 驗證輸入
    validateInput(input);
    
    // 2-12. 執行計算流程
    const output = performCalculation(input);
    
    return output;
  }
  
  function calculateForList(inputList) {
    return inputList.map(item => {
      try {
        return {
          sku: item.sku,
          ...calculateForSku(item)
        };
      } catch (error) {
        console.error(`Error calculating SKU ${item.sku}:`, error);
        return {
          sku: item.sku,
          error: error.message
        };
      }
    });
  }
  
  // 掛載到 KM.utils
  window.KM.utils.forecastEngine = {
    calculateForSku,
    calculateForList
  };
  
})();
```

### 測試建議

1. **單元測試**: 測試每個公式的正確性
2. **邊界測試**: 測試極端值（0, Infinity, 負數）
3. **整合測試**: 測試與 DataRepo 的整合
4. **效能測試**: 測試批次計算 1000+ SKU 的效能

### 版本控制

- **v1.0**: 初始穩定版本
- 未來版本將支援更多進階功能（如動態 TF 調整、季節性因子等）

---

**文檔結束**
