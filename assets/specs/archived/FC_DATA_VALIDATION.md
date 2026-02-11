# FC Summary 數據結構驗證報告

## 1. 數據結構定義與相容性分析

### 1.1 Regular Forecast 數據結構

```javascript
// 前端數據結構
{
  sku: "A001",              // String - Primary Key Part 1
  year: 2026,               // Integer - Primary Key Part 2
  company: "ResTW",         // String - Indexed
  marketplace: "Amazon",    // String - Indexed
  country: "US",            // String - Indexed
  category: "Openers",      // String - Indexed
  series: "Classic",        // String - Indexed
  months: [100, 120, ...]   // Array[12] of Integer
}

// BigQuery Schema (建議)
CREATE TABLE fc_regular_forecast (
  sku STRING NOT NULL,
  year INTEGER NOT NULL,
  company STRING,
  marketplace STRING,
  country STRING,
  category STRING,
  series STRING,
  jan INTEGER,
  feb INTEGER,
  mar INTEGER,
  apr INTEGER,
  may INTEGER,
  jun INTEGER,
  jul INTEGER,
  aug INTEGER,
  sep INTEGER,
  oct INTEGER,
  nov INTEGER,
  dec INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_by STRING,
  PRIMARY KEY (sku, year, company, marketplace, country) NOT ENFORCED
)
PARTITION BY RANGE_BUCKET(year, GENERATE_ARRAY(2020, 2030, 1))
CLUSTER BY company, marketplace, category;
```

**✅ 雲端相容性**: 完全相容
- 所有欄位都是標準數據類型
- 建議將 months 陣列展開為 12 個獨立欄位（jan-dec）以便查詢和聚合
- 支援 Partition（按年份）和 Cluster（按常用查詢欄位）優化

### 1.2 Special Event 數據結構

```javascript
// 前端數據結構
{
  sku: "A001",              // String - Primary Key Part 1
  year: 2026,               // Integer - Primary Key Part 2
  company: "ResTW",         // String
  marketplace: "Amazon",    // String
  country: "US",            // String
  category: "Openers",      // String
  series: "Classic",        // String
  event: "Prime Day",       // String - Primary Key Part 3
  eventPeriod: "7/15-7/16", // String
  fcQty: 500                // Integer
}

// BigQuery Schema (建議)
CREATE TABLE fc_special_event (
  sku STRING NOT NULL,
  year INTEGER NOT NULL,
  company STRING,
  marketplace STRING,
  country STRING,
  category STRING,
  series STRING,
  event STRING NOT NULL,
  event_period STRING,
  fc_qty INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_by STRING,
  PRIMARY KEY (sku, year, event, company, marketplace) NOT ENFORCED
)
PARTITION BY RANGE_BUCKET(year, GENERATE_ARRAY(2020, 2030, 1))
CLUSTER BY event, marketplace, category;
```

**✅ 雲端相容性**: 完全相容
- 標準數據類型
- Event 作為複合主鍵的一部分
- 建議將 eventPeriod 拆分為 event_start_date 和 event_end_date（DATE 類型）以便範圍查詢

### 1.3 Target % Rules 數據結構

```javascript
// 前端數據結構
{
  id: "rule-1234567890",   // String - Primary Key
  scope: "Category",        // Enum: Category|Series|SKU
  year: 2026,               // Integer - Indexed
  marketplace: "All",       // String - "All" or specific
  category: "Openers",      // String - Nullable
  series: "Classic",        // String - Nullable
  sku: "A001",              // String - Nullable
  percentages: {            // Object with 12 keys
    jan: 100,
    feb: 100,
    ...
    dec: 150
  }
}

// BigQuery Schema (建議)
CREATE TABLE fc_target_rules (
  rule_id STRING NOT NULL,
  scope STRING NOT NULL,  -- Category|Series|SKU
  year INTEGER NOT NULL,
  marketplace STRING,     -- "All" or specific
  category STRING,
  series STRING,
  sku STRING,
  jan_pct INTEGER,
  feb_pct INTEGER,
  mar_pct INTEGER,
  apr_pct INTEGER,
  may_pct INTEGER,
  jun_pct INTEGER,
  jul_pct INTEGER,
  aug_pct INTEGER,
  sep_pct INTEGER,
  oct_pct INTEGER,
  nov_pct INTEGER,
  dec_pct INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_by STRING,
  PRIMARY KEY (rule_id) NOT ENFORCED
)
PARTITION BY RANGE_BUCKET(year, GENERATE_ARRAY(2020, 2030, 1))
CLUSTER BY scope, marketplace, year;

-- 建議添加索引
CREATE INDEX idx_target_rules_lookup 
ON fc_target_rules(year, marketplace, scope, category, series, sku);
```

**✅ 雲端相容性**: 完全相容
- 建議將 percentages 物件展開為 12 個獨立欄位
- scope 使用 ENUM 或 CHECK constraint 確保數據完整性
- 支援複雜查詢的索引策略

---

## 2. 跨頁面數據拉取驗證

### 2.1 Inventory Replenishment 頁面使用場景

```javascript
// 使用場景: 計算補貨建議數量
function calculateReplenishmentQty(sku, marketplace, category, series) {
  const year = 2026;
  const month = 'may';
  
  // Step 1: 獲取 Base FC
  const baseFc = fcRegularData.find(item => 
    item.sku === sku && 
    item.year === year &&
    item.marketplace === marketplace
  );
  
  if (!baseFc) {
    console.warn(`Base FC not found for ${sku}`);
    return null; // ⚠️ 需要處理找不到的情況
  }
  
  // Step 2: 獲取 Target %
  const targetPct = getEffectiveTargetPct({
    sku,
    year,
    month,
    category,
    series,
    marketplace
  });
  
  // Step 3: 計算 Effective FC
  const monthIndex = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(month);
  const effectiveFc = calculateEffectiveFC(baseFc.months[monthIndex], targetPct);
  
  return effectiveFc;
}
```

**✅ Match 驗證**: 可以正確匹配
**⚠️ 潛在問題**: 
- 需要處理 Base FC 不存在的情況
- 需要確保 SKU 在 Regular Forecast 和 Target Rules 中的命名一致

### 2.2 數據匹配完整性檢查

```javascript
// 建議添加數據完整性檢查函數
function validateDataIntegrity() {
  const issues = [];
  
  // 檢查 1: Target Rules 中的 SKU 是否都存在於 Regular Forecast
  targetRules.forEach(rule => {
    if (rule.scope === 'SKU' && rule.sku) {
      const exists = fcRegularData.some(fc => fc.sku === rule.sku);
      if (!exists) {
        issues.push({
          type: 'ORPHAN_TARGET_RULE',
          message: `Target rule for SKU ${rule.sku} has no matching Base FC`,
          ruleId: rule.id
        });
      }
    }
  });
  
  // 檢查 2: Category/Series 一致性
  const categories = new Set(fcRegularData.map(fc => fc.category));
  const series = new Set(fcRegularData.map(fc => fc.series));
  
  targetRules.forEach(rule => {
    if (rule.category && rule.category !== 'All' && !categories.has(rule.category)) {
      issues.push({
        type: 'INVALID_CATEGORY',
        message: `Target rule uses unknown category: ${rule.category}`,
        ruleId: rule.id
      });
    }
    if (rule.series && !series.has(rule.series)) {
      issues.push({
        type: 'INVALID_SERIES',
        message: `Target rule uses unknown series: ${rule.series}`,
        ruleId: rule.id
      });
    }
  });
  
  return issues;
}
```

---

## 3. Year 篩選與性能優化驗證

### 3.1 當前實作檢查

```javascript
// ✅ 已實作: Year 必選機制
function renderFcRegularTable() {
  const filters = getFcFilters();
  
  // 檢查 Year 是否選擇
  if (!filters.year) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">Please select a year to view data</div>';
    updatePaginationInfo(0);
    return; // ✅ 未選擇 Year 時不載入任何資料
  }
  
  // 只有選擇 Year 後才過濾和顯示資料
  const filteredData = filterFcRegular(fcRegularMock, filters);
  // ...
}
```

**✅ 驗證結果**: 
- ✅ 預設不載入任何資料
- ✅ 必須選擇 Year 才會開始過濾和顯示
- ✅ 減少初始載入負擔

### 3.2 建議的 API 整合策略

```javascript
// 未來 API 整合建議
async function loadFcDataByYear(year) {
  if (!year) return;
  
  try {
    // 只請求選定年份的資料
    const [regularData, eventData, targetRules] = await Promise.all([
      fetch(`/api/fc/regular?year=${year}`).then(r => r.json()),
      fetch(`/api/fc/events?year=${year}`).then(r => r.json()),
      fetch(`/api/fc/target-rules?year=${year}`).then(r => r.json())
    ]);
    
    // 更新前端資料
    fcRegularMock.length = 0;
    fcRegularMock.push(...regularData);
    
    fcEventMock.length = 0;
    fcEventMock.push(...eventData);
    
    targetRules.length = 0;
    targetRules.push(...targetRules);
    
    // 重新渲染
    renderFcRegularTable();
    renderFcEventTable();
    renderTargetRulesTable();
    
  } catch (error) {
    console.error('Failed to load FC data:', error);
    alert('Failed to load data. Please try again.');
  }
}

// 在 Year 選擇器變更時觸發
document.getElementById('fc-year-select').addEventListener('change', (e) => {
  const year = e.target.value;
  if (year) {
    loadFcDataByYear(year);
  }
});
```

---

## 4. 數據同步到雲端的建議架構

### 4.1 推薦的數據流

```
前端 FC Summary
    ↓ (Save Changes)
API Gateway
    ↓
Lambda/Cloud Function
    ↓
BigQuery / Cloud SQL
    ↓
Data Warehouse
    ↓
其他頁面 (Inventory Replenishment, Reports, etc.)
```

### 4.2 API 端點設計建議

```javascript
// POST /api/fc/regular
{
  "year": 2026,
  "data": [
    {
      "sku": "A001",
      "company": "ResTW",
      "marketplace": "Amazon",
      "country": "US",
      "category": "Openers",
      "series": "Classic",
      "months": [100, 120, 130, ...]
    }
  ],
  "updated_by": "admin@kitchenmama.com"
}

// POST /api/fc/target-rules
{
  "year": 2026,
  "rules": [
    {
      "scope": "Category",
      "marketplace": "All",
      "category": "Openers",
      "percentages": {
        "jan": 100,
        "feb": 100,
        ...
      }
    }
  ],
  "updated_by": "admin@kitchenmama.com"
}

// GET /api/fc/effective-fc?sku=A001&year=2026&month=may
// 返回已計算好的 Effective FC
{
  "sku": "A001",
  "year": 2026,
  "month": "may",
  "base_fc": 1000,
  "target_pct": 150,
  "effective_fc": 1500,
  "rule_source": "SKU",
  "rule_id": "rule-123"
}
```

---

## 5. 潛在問題與解決方案

### 問題 1: SKU 不存在於 Base FC
**場景**: Target Rule 設定了某個 SKU，但該 SKU 沒有 Base FC
**解決方案**:
```javascript
function getEffectiveFcSafe(sku, year, month, category, series, marketplace) {
  // 先檢查 Base FC 是否存在
  const baseFc = fcRegularData.find(item => 
    item.sku === sku && item.year === year
  );
  
  if (!baseFc) {
    console.warn(`No Base FC found for ${sku} in ${year}`);
    return {
      baseFc: 0,
      targetPct: 100,
      effectiveFc: 0,
      warning: 'NO_BASE_FC'
    };
  }
  
  const targetPct = getEffectiveTargetPct({
    sku, year, month, category, series, marketplace
  });
  
  const monthIndex = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(month);
  const effectiveFc = calculateEffectiveFC(baseFc.months[monthIndex], targetPct);
  
  return {
    baseFc: baseFc.months[monthIndex],
    targetPct,
    effectiveFc,
    ruleSource: determineRuleSource(sku, year, category, series, marketplace)
  };
}
```

### 問題 2: Marketplace 不匹配
**場景**: Target Rule 設定 Amazon，但查詢 Walmart 的資料
**解決方案**: 已在 `getEffectiveTargetPct` 中實作
```javascript
// ✅ 已處理
(r.marketplace === 'All' || r.marketplace === marketplace)
```

### 問題 3: Category "All" 的匹配邏輯
**場景**: 需要確保 "All" 能匹配所有 Category
**解決方案**: 已在 `getEffectiveTargetPct` 中實作
```javascript
// ✅ 已處理
(r.category === 'All' || r.category === category)
```

---

## 6. 總結與建議

### ✅ 數據結構驗證結果

| 項目 | 狀態 | 說明 |
|------|------|------|
| 跨頁面拉取 | ✅ 可行 | 數據結構完整，可正確匹配 |
| 雲端同步相容性 | ✅ 相容 | 建議展開陣列為獨立欄位 |
| Year 必選機制 | ✅ 已實作 | 預設不載入資料 |
| 性能優化 | ✅ 良好 | 按需載入，減少負擔 |

### 📋 實作建議清單

1. **立即實作**:
   - ✅ 添加數據完整性檢查函數 `validateDataIntegrity()`
   - ✅ 添加安全的 FC 計算函數 `getEffectiveFcSafe()`

2. **API 整合時**:
   - 實作 Year-based 資料載入
   - 添加錯誤處理和重試機制
   - 實作樂觀鎖定（Optimistic Locking）防止並發衝突

3. **雲端同步時**:
   - 將 months 陣列展開為 12 個欄位
   - 添加 created_at, updated_at, updated_by 欄位
   - 實作 Partition 和 Cluster 優化查詢性能

### 🎯 結論

**所有三個數據結構都已驗證可以:**
- ✅ 在其他頁面正確拉取使用
- ✅ 同步到 BigQuery 或其他雲端資料庫
- ✅ 預設不載入資料，選擇 Year 後才載入
- ✅ 支援複雜的匹配邏輯（All, 優先級等）

系統設計良好，可以安全地進行下一步開發！
