# FC Summary 功能實現計劃

## 概述
在FC Summary頁面新增Base FC編輯和Target%規則功能

## 實現階段

### 階段1: UI結構添加

#### 1.1 在index.html中添加：
- Tab區域右側添加操作按鈕組
- 新增Target% Rules Tab
- 新增Add SKU Modal
- 新增Add Target Rule Modal
- 新增Edit Confirmation Modal

#### 1.2 在fc-summary.css中添加：
- 按鈕組樣式
- Modal樣式
- 編輯模式樣式
- Target% Tab樣式

### 階段2: Base FC編輯功能

#### 2.1 數據結構（data.js）：
```javascript
// 保持現有fcRegularData和fcEventData
// 添加編輯狀態追蹤
let fcEditState = {
  isEditing: false,
  currentTab: 'regular',
  modifiedRows: new Map()
};
```

#### 2.2 編輯功能（fc-summary.js）：
- `enterEditMode()`: 進入編輯模式
- `exitEditMode()`: 退出編輯模式
- `saveChanges()`: 保存修改
- `cancelChanges()`: 取消修改
- `addNewSKU()`: 新增SKU
- `validateFCData()`: 驗證數據

### 階段3: Target%規則系統

#### 3.1 數據結構（data.js）：
```javascript
let targetRules = [
  {
    id: 'rule-1',
    scope: 'Category', // 'Category' | 'Series' | 'SKU'
    year: 2026,
    company: 'All',
    marketplace: 'All',
    category: 'Openers',
    series: null,
    sku: null,
    percentages: {
      jan: 100, feb: 100, mar: 100, apr: 100,
      may: 100, jun: 100, jul: 100, aug: 100,
      sep: 100, oct: 100, nov: 100, dec: 100
    }
  }
];
```

#### 3.2 計算邏輯（fc-summary.js）：
```javascript
function getEffectiveTargetPct({ sku, year, month, category, series }) {
  // 1. 查找SKU level rule
  // 2. 查找Series level rule
  // 3. 查找Category level rule
  // 4. 返回100%（默認）
}

function calculateEffectiveFC(baseFC, targetPct) {
  return Math.round(baseFC * targetPct / 100);
}
```

## 文件修改清單

### 需要修改的文件：
1. **index.html** - 添加UI元素
2. **fc-summary.css** - 添加樣式
3. **fc-summary.js** - 添加邏輯
4. **data.js** - 添加數據結構

### 不修改的文件：
- app.js（除非需要添加全局輔助函數）
- forecast.js
- 其他頁面相關文件

## 實現優先級

### P0 (必須實現):
1. Edit Base FC按鈕和編輯模式
2. 月份數值可編輯
3. Save/Cancel功能
4. Target% Rules Tab基本結構
5. getEffectiveTargetPct()計算邏輯

### P1 (重要):
1. Add SKU功能
2. Add Target Rule功能
3. 編輯確認Modal
4. 數據驗證

### P2 (可選):
1. 權限檢查
2. Audit Log預留
3. Target%來源顯示tooltip

## 下一步行動
由於代碼量大，建議：
1. 先實現核心編輯功能（P0）
2. 測試基本流程
3. 再添加完整功能（P1）
4. 最後優化體驗（P2）
