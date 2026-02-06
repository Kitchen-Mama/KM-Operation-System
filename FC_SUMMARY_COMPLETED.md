# FC Summary 功能實現總結

## 已完成的核心功能

### ✅ A. Base FC 編輯功能

#### 1. UI 元素
- **操作按鈕組** (位於 Tab 右側)
  - Edit Base FC - 進入編輯模式
  - Add SKU - 新增 SKU
  - Save Changes - 保存修改 (編輯模式顯示)
  - Cancel - 取消修改 (編輯模式顯示)

#### 2. 編輯模式
- **二段確認機制**: 點擊 Edit Base FC 會彈出確認 Modal
- **可編輯欄位**:
  - Company (下拉選單)
  - Marketplace (下拉選單)
  - Category (下拉選單)
  - Series (下拉選單)
  - Jan~Dec 月份數值 (數字輸入框)
- **唯讀欄位**: SKU, Year
- **即時計算**: Total FC 自動更新

#### 3. Add SKU 功能
- **Modal 表單**包含:
  - SKU (必填)
  - Year (自動填入當前選擇的年份，唯讀)
  - Company, Marketplace, Country, Category, Series (下拉選單)
  - Base FC for all months (快速填入所有月份)
  - Jan~Dec 個別月份調整
- **驗證**: 防止重複 SKU+Year 組合

#### 4. 數據管理
- **修改追蹤**: 使用 `fcEditState.modifiedRows` Map 追蹤變更
- **取消恢復**: 保存原始數據，取消時可恢復
- **驗證機制**: 保存前檢查數值有效性

### ✅ B. Target % 規則系統

#### 1. Target % Rules Tab
- **新增第三個 Tab**: Target % Rules
- **獨立表格**顯示規則:
  - Scope (Category/Series/SKU)
  - Year
  - Category, Series, SKU
  - Jan%~Dec% (12個月的百分比)
  - Actions (Delete 按鈕)

#### 2. Add Target Rule 功能
- **動態表單**:
  - Scope 選擇會動態顯示/隱藏相關欄位
  - Category scope: 只需 Category
  - Series scope: 需要 Category + Series
  - SKU scope: 需要 SKU (+ Category/Series 顯示用)
- **快速設定**: Apply to all months 可一次設定所有月份
- **個別調整**: 每個月份可單獨設定百分比

#### 3. 優先順序計算邏輯
```javascript
getEffectiveTargetPct({ sku, year, month, category, series })
```
- **優先級**: SKU > Series > Category > Default (100%)
- **計算公式**: `Effective_FC = Base_FC × Target% / 100`

#### 4. 規則管理
- **新增規則**: 通過 Modal 表單
- **刪除規則**: 每列有 Delete 按鈕
- **數據存儲**: 使用 `targetRules` 陣列

### ✅ C. UI/UX 改進

#### 1. 樣式系統
- **按鈕樣式**: 統一的 `.fc-btn` 系列
- **Modal 樣式**: 響應式 Modal 設計
- **編輯狀態**: 可編輯儲存格有黃色背景提示
- **唯讀狀態**: 唯讀儲存格有灰色背景

#### 2. 交互設計
- **Tab 切換**: 三個 Tab 之間平滑切換
- **Modal 管理**: 統一的 Modal 開關機制
- **表單驗證**: 即時驗證和錯誤提示

## 文件修改清單

### 修改的文件:
1. ✅ **index.html**
   - 添加 Target % Rules Tab
   - 添加操作按鈕組
   - 添加 3 個 Modal (Edit Confirm, Add SKU, Add Target Rule)

2. ✅ **fc-summary.css**
   - 添加按鈕樣式 (`.fc-btn` 系列)
   - 添加 Modal 樣式
   - 添加編輯模式樣式 (`.fc-cell-editable`, `.fc-cell-readonly`)
   - 添加表單樣式

3. ✅ **fc-summary.js**
   - 添加編輯狀態管理 (`fcEditState`)
   - 添加編輯模式函數 (enter/exit/save/cancel)
   - 添加 Add SKU 功能
   - 添加 Target % 規則系統
   - 添加 `getEffectiveTargetPct()` 計算邏輯
   - 添加 Modal 管理函數

## 核心功能函數

### Base FC 編輯:
- `enterFcEditMode()` - 進入編輯模式
- `confirmFcEdit()` - 確認編輯
- `renderFcRegularTableEditable()` - 渲染可編輯表格
- `updateFcCell()` - 更新儲存格
- `updateFcMonth()` - 更新月份數值
- `saveFcChanges()` - 保存變更
- `cancelFcEdit()` - 取消編輯
- `exitEditMode()` - 退出編輯模式

### Add SKU:
- `openAddSkuModal()` - 打開新增 Modal
- `fillAllMonths()` - 填充所有月份
- `saveNewSku()` - 保存新 SKU

### Target % 規則:
- `openAddTargetRuleModal()` - 打開規則 Modal
- `updateTargetScopeFields()` - 更新 Scope 欄位顯示
- `fillAllTargetMonths()` - 填充所有月份百分比
- `saveNewTargetRule()` - 保存新規則
- `getEffectiveTargetPct()` - 計算有效 Target%
- `calculateEffectiveFC()` - 計算 Effective FC
- `renderTargetRulesTable()` - 渲染規則表格
- `deleteTargetRule()` - 刪除規則

### Modal 管理:
- `showFcModal()` - 顯示 Modal
- `closeFcModal()` - 關閉 Modal

## 使用流程

### 編輯 Base FC:
1. 選擇 Year
2. 點擊 "Edit Base FC"
3. 確認警告訊息
4. 修改 Company/Marketplace/Category/Series 或月份數值
5. 點擊 "Save Changes" 或 "Cancel"

### 新增 SKU:
1. 選擇 Year
2. 點擊 "+ Add SKU"
3. 填寫 SKU 和其他資訊
4. 可選: 使用 "Base FC for all months" 快速填入
5. 調整個別月份
6. 點擊 "Save"

### 設定 Target % 規則:
1. 切換到 "Target % Rules" Tab
2. 點擊 "+ Add Target Rule"
3. 選擇 Scope (Category/Series/SKU)
4. 填寫對應欄位
5. 設定月份百分比
6. 點擊 "Save"

## 數據流

```
Base FC (fcRegularData)
    ↓
Target % Rules (targetRules)
    ↓
getEffectiveTargetPct()
    ↓
Effective FC = Base FC × Target% / 100
    ↓
用於 Inventory Replenishment 等其他頁面
```

## 下一步建議

### 可選增強功能:
1. **權限檢查**: 添加用戶角色驗證
2. **Audit Log**: 記錄所有變更歷史
3. **批次操作**: 批次設定 Target%
4. **Target% 來源顯示**: 在 Regular/Event Tab 顯示當前使用的 Target% 來源
5. **Effective FC 欄位**: 在表格中顯示計算後的 Effective FC
6. **後端整合**: 連接真實 API 保存數據

### 測試建議:
1. 測試編輯模式的進入/退出
2. 測試 Add SKU 的重複檢查
3. 測試 Target% 優先順序計算
4. 測試 Modal 的開關
5. 測試數據驗證

## 注意事項

1. **數據持久化**: 目前數據保存在前端記憶體中，刷新頁面會丟失
2. **其他頁面**: Inventory Replenishment 等頁面需要調用 `getEffectiveTargetPct()` 來使用 Target%
3. **Year 必選**: 所有操作都需要先選擇 Year
4. **編輯限制**: 編輯模式下只能修改當前 Year 的數據
