# Forecast Review Aggregation Layer Master Specification

**文件版本**: v1.0  
**最後更新**: 2026-01-XX  
**負責人**: Data Engineering Team  
**適用系統**: Operation System, Forecast Review, Request Order, FC Overview

---

## 1. Overview

### 1.1 為什麼需要 Aggregation Layer

現有系統面臨的核心問題：

| 問題類型 | 現況 | 影響 |
|---------|------|------|
| **效能問題** | 前端直接查詢 `raw.daily_sales` | 查詢時間 >5秒，用戶體驗差 |
| **成本問題** | 每次查詢掃描 TB 級數據 | BigQuery 成本 $150+/月 |
| **穩定性問題** | 高峰期系統響應緩慢/超時 | 業務流程中斷，影響決策 |
| **管理性問題** | 多個系統重複計算相同指標 | 數據不一致，維護困難 |

### 1.2 解決方案

建立統一的 **Aggregation Layer**，作為所有 Forecast Review、FC Achievement 相關查詢的唯一數據來源：

- ✅ **效能提升**: 查詢時間從 >5秒 降至 <2秒
- ✅ **成本控制**: BigQuery 成本降低 99%（$150 → $1.5/月）
- ✅ **系統穩定**: 離峰批次計算，查詢簡單快速
- ✅ **數據一致**: 單一數據源，統一計算邏輯

### 1.3 禁止直接查詢 Raw Layer

**嚴格禁止** 前端系統直接查詢 `raw.daily_sales`：

```sql
-- ❌ 禁止：直接查詢原始表
SELECT * FROM raw.daily_sales WHERE ...

-- ✅ 允許：查詢聚合表
SELECT * FROM os_agg.fc_review_daily_agg WHERE ...
```

**執行策略**:
- 移除前端對 `raw.daily_sales` 的查詢權限
- 所有查詢必須透過 Aggregation Layer
- 建立監控機制，檢測違規查詢

---

## 2. Aggregation Layer Architecture

### 2.1 整體架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                        Raw Layer                            │
├─────────────────────────────────────────────────────────────┤
│  raw.daily_sales (TB級，禁止前端直接查詢)                    │
│  raw.fc_plan                                               │
│  raw.inventory_data                                         │
└─────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────┐
│                   Aggregation Layer                         │
├─────────────────────────────────────────────────────────────┤
│  ├─ fc_review_daily_agg      (≤30天查詢)                   │
│  ├─ fc_review_weekly_agg     (30-90天查詢)                 │
│  ├─ fc_review_monthly_agg    (>90天查詢)                   │
│  └─ fc_achievement_monthly   (FC達成率專用)                 │
└─────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                              │
├─────────────────────────────────────────────────────────────┤
│  Intelligent Query Routing + Cache Strategy                │
└─────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────┐
│                  Operation System                           │
├─────────────────────────────────────────────────────────────┤
│  ├─ Forecast Review Page                                   │
│  ├─ Request Order System                                   │
│  ├─ FC Overview Dashboard                                  │
│  └─ Last 3 Month Overview                                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 數據流向

```
Raw Data → ETL Pipeline → Aggregation Tables → API → Frontend
   ↓           ↓              ↓                ↓        ↓
TB級數據    批次處理      GB級聚合表        智能路由   <2秒響應
```

---

## 3. 表級詳細規格

### 3.1 fc_achievement_monthly

#### 3.1.1 Grain 定義
```
Grain = month_date + company + country + site + sku
```

一列代表：某一月份 × 公司 × 國家 × 站點 × SKU 的 FC 達成率記錄

#### 3.1.2 Schema

**維度欄位 (Dimensions)**:
| 欄位名 | 型別 | 必填 | 說明 |
|--------|------|------|------|
| `month_date` | DATE | ✅ | 月度代表日，例如 2026-01-01 |
| `company` | STRING | ✅ | 公司別（例如 Kitchen Mama, Responsible Industrial）|
| `country` | STRING | ✅ | 國家碼，如 `US`, `JP`, `DE`, `EU` |
| `marketplace` | STRING | ✅ | 銷售平台，如 `Amazon`, `Target`, `Shopee` |
| `site` | STRING | ✅ | 站點/倉別代碼，如 `US-AMZ-FBA`, `US-WINIT`, `DE-AMZ-DEBR2` |
| `sku` | STRING | ✅ | Internal SKU，例如 `KM-OP-001` |
| `category` | STRING | ⭕ | 商品類別，如 `Can Opener`, `Kitchen Tools` |
| `brand` | STRING | ⭕ | 品牌名稱，如 `Kitchen Mama` |
| `series` | STRING | ⭕ | 產品系列/家族名稱，如 `Classic`, `Deluxe` |

**度量欄位 (Metrics)**:
| 欄位名 | 型別 | 必填 | 說明 | 計算公式 |
|--------|------|------|------|----------|
| `forecast_units` | INT64 | ✅ | 該月預測 FC 數量 | 來自 `fc_monthly_plan` |
| `actual_units` | INT64 | ✅ | 該月實際銷售/出貨量 | 來自 `monthly_sales_summary` |
| `variance_units` | INT64 | ✅ | 預測差異量 | `actual_units - forecast_units` |
| `achievement_rate` | FLOAT64 | ✅ | 達成率（%）| `SAFE_DIVIDE(actual_units, forecast_units) * 100` |
| `actual_revenue` | FLOAT64 | ⭕ | 該月實際營收 | 來自 `monthly_sales_summary` |
| `sessions` | INT64 | ⭕ | 該月 Sessions 總和 | 來自 `monthly_sales_summary` |
| `avg_usp` | FLOAT64 | ⭕ | 該月平均 Unit Session Percentage | 加權平均或簡單平均 |

**Metadata / 控制欄位**:
| 欄位名 | 型別 | 必填 | 說明 |
|--------|------|------|------|
| `data_source` | STRING | ⭕ | 資料來源標記，例如 `amz_us`, `target_us`, `shopee_tw` |
| `version` | STRING | ⭕ | FC 版本，例如 `base`, `high`, `low`（預留欄位）|
| `is_final` | BOOL | ✅ | 是否已月結封存（true = 該月資料不再變動）|
| `last_updated` | TIMESTAMP | ✅ | 此列最後更新時間戳 |

#### 3.1.3 achievement_rate 計算公式

```sql
-- 標準計算
achievement_rate = SAFE_DIVIDE(actual_units, forecast_units) * 100

-- forecast_units = 0 的處理方式
CASE 
  WHEN forecast_units = 0 AND actual_units = 0 THEN NULL
  WHEN forecast_units = 0 AND actual_units > 0 THEN 999.99  -- 標記為異常高值
  ELSE SAFE_DIVIDE(actual_units, forecast_units) * 100
END AS achievement_rate
```

#### 3.1.4 Partition / Cluster 設計

```sql
PARTITION BY month_date
CLUSTER BY country, site, sku
OPTIONS(
  partition_expiration_days=1095,  -- 3年自動刪除
  require_partition_filter=true    -- 強制分區過濾
)
```

#### 3.1.5 ETL 更新策略

**初始化**:
```sql
-- 一次性載入歷史36個月數據
WHERE month_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 36 MONTH)
```

**每日排程**:
```sql
-- 每日03:00 UTC，只更新當月與上月
WHERE month_date >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)
```

**執行策略**:
1. 刪除當月與上月的舊數據
2. 重新計算並插入新數據  
3. 更新 is_final 標記（上月設為 true）

**範例 DDL**:
```sql
CREATE OR REPLACE TABLE `project.os_agg.fc_achievement_monthly`
PARTITION BY month_date
CLUSTER BY country, site, sku
OPTIONS(
  description="FC Achievement Monthly Aggregation Table",
  partition_expiration_days=1095,
  require_partition_filter=true
)
AS
SELECT
  -- Dimensions
  s.month_date, s.company, s.country, s.marketplace, s.site, s.sku,
  s.category, s.brand, s.series,
  
  -- Metrics from Sales
  s.actual_units, s.actual_revenue, s.sessions, s.avg_usp,
  
  -- Metrics from FC Plan
  COALESCE(f.forecast_units, 0) AS forecast_units,
  
  -- Calculated Metrics
  s.actual_units - COALESCE(f.forecast_units, 0) AS variance_units,
  SAFE_DIVIDE(s.actual_units, f.forecast_units) * 100 AS achievement_rate,
  
  -- Metadata
  'amz_raw' AS data_source, 'base' AS version,
  CASE WHEN s.month_date < DATE_TRUNC(CURRENT_DATE(), MONTH) THEN TRUE ELSE FALSE END AS is_final,
  CURRENT_TIMESTAMP() AS last_updated
  
FROM `project.os_agg.monthly_sales_summary` s
LEFT JOIN `project.os_agg.fc_monthly_plan` f
  ON s.month_date = f.month_date AND s.company = f.company 
  AND s.country = f.country AND s.site = f.site AND s.sku = f.sku
  AND f.version = 'base'
WHERE s.month_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 36 MONTH);
```

### 3.2 fc_review_daily_agg

#### 3.2.1 Grain 定義
```
Grain = sale_date + company + country + site + sku
```

#### 3.2.2 Schema
| 欄位 | 型別 | 說明 |
|------|------|------|
| `sale_date` | DATE | 銷售日期 |
| `company` | STRING | 公司別 |
| `country` | STRING | 國家碼 |
| `site` | STRING | 站點代碼 |
| `sku` | STRING | Internal SKU |
| `units` | INT64 | 當日銷售量 |
| `revenue` | FLOAT64 | 當日營收 |
| `sessions` | INT64 | 當日 Sessions |
| `unit_session_percentage` | FLOAT64 | 當日 USP |

#### 3.2.3 Partition / Cluster
```sql
PARTITION BY sale_date
CLUSTER BY country, site, sku
OPTIONS(
  partition_expiration_days=90,    -- 90天自動刪除
  require_partition_filter=true
)
```

#### 3.2.4 用途
- **查詢範圍**: ≤30天
- **使用場景**: 近期詳細趨勢分析、日級別 Forecast Review
- **性能目標**: <0.5秒

### 3.3 fc_review_weekly_agg

#### 3.3.1 Grain 定義
```
Grain = week_start_date + company + country + site + sku
```

#### 3.3.2 Schema
| 欄位 | 型別 | 說明 |
|------|------|------|
| `week_start_date` | DATE | 週開始日期 (週一) |
| `company` | STRING | 公司別 |
| `country` | STRING | 國家碼 |
| `site` | STRING | 站點代碼 |
| `sku` | STRING | Internal SKU |
| `units` | INT64 | 週銷售量總和 |
| `revenue` | FLOAT64 | 週營收總和 |
| `avg_sessions` | FLOAT64 | 週平均 Sessions |
| `avg_usp` | FLOAT64 | 週平均 USP |

#### 3.3.3 Partition / Cluster
```sql
PARTITION BY week_start_date
CLUSTER BY country, site, sku
OPTIONS(
  partition_expiration_days=365,   -- 1年自動刪除
  require_partition_filter=true
)
```

#### 3.3.4 用途
- **查詢範圍**: 30-90天
- **使用場景**: 中期趨勢分析、週級別 Forecast Review
- **性能目標**: <1秒

### 3.4 fc_review_monthly_agg

#### 3.4.1 Grain 定義
```
Grain = month_date + company + country + site + sku
```

#### 3.4.2 Schema
| 欄位 | 型別 | 說明 |
|------|------|------|
| `month_date` | DATE | 月份第一天 |
| `company` | STRING | 公司別 |
| `country` | STRING | 國家碼 |
| `site` | STRING | 站點代碼 |
| `sku` | STRING | Internal SKU |
| `units` | INT64 | 月銷售量總和 |
| `revenue` | FLOAT64 | 月營收總和 |
| `avg_sessions` | FLOAT64 | 月平均 Sessions |
| `avg_usp` | FLOAT64 | 月平均 USP |

#### 3.4.3 Partition / Cluster
```sql
PARTITION BY month_date
CLUSTER BY country, site, sku
OPTIONS(
  partition_expiration_days=1095,  -- 3年自動刪除
  require_partition_filter=true
)
```

#### 3.4.4 用途
- **查詢範圍**: >90天
- **使用場景**: 長期趨勢分析、年度 Forecast Review
- **性能目標**: <2秒

---

## 4. Intelligent Query Routing

### 4.1 自動路由規則

API 層根據查詢時間範圍自動選擇最適合的聚合表：

```javascript
function selectAggregationTable(startDate, endDate) {
  const daysDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);
  
  if (daysDiff <= 30) {
    return 'fc_review_daily_agg';     // <0.5秒
  } else if (daysDiff <= 90) {
    return 'fc_review_weekly_agg';    // <1秒
  } else {
    return 'fc_review_monthly_agg';   // <2秒
  }
}
```

### 4.2 查詢優化邏輯

**Daily Aggregation (≤30天)**:
```sql
SELECT 
  sale_date,
  SUM(units) as total_units,
  SUM(revenue) as total_revenue
FROM os_agg.fc_review_daily_agg
WHERE sale_date BETWEEN @start_date AND @end_date
  AND country = @country
  AND site = @site
GROUP BY sale_date
ORDER BY sale_date;
```

**Weekly Aggregation (30-90天)**:
```sql
SELECT 
  week_start_date,
  SUM(units) as total_units,
  SUM(revenue) as total_revenue
FROM os_agg.fc_review_weekly_agg
WHERE week_start_date BETWEEN @start_week AND @end_week
  AND country = @country
  AND site = @site
GROUP BY week_start_date
ORDER BY week_start_date;
```

**Monthly Aggregation (>90天)**:
```sql
SELECT 
  month_date,
  SUM(units) as total_units,
  SUM(revenue) as total_revenue
FROM os_agg.fc_review_monthly_agg
WHERE month_date BETWEEN @start_month AND @end_month
  AND country = @country
  AND site = @site
GROUP BY month_date
ORDER BY month_date;
```

### 4.3 為何確保 <2秒 查詢

| 優化策略 | 效果 |
|---------|------|
| **Partition Pruning** | 只掃描相關時間分區，減少 90% 數據量 |
| **Cluster Optimization** | 按查詢維度聚集，減少 95% IO |
| **Pre-aggregation** | 避免複雜 JOIN 和計算，直接讀取結果 |
| **Intelligent Routing** | 選擇最小粒度表，最小化掃描量 |

---

## 5. Forecast Review Page Integration

### 5.1 一年資料查詢策略

當 Forecast Review 頁面需要拉取一年資料時：

```sql
-- ✅ 只查詢 monthly_agg，避免掃描日級數據
SELECT 
  month_date,
  sku,
  SUM(units) as monthly_units,
  SUM(revenue) as monthly_revenue,
  AVG(avg_usp) as monthly_avg_usp
FROM os_agg.fc_review_monthly_agg
WHERE month_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
  AND country = 'US'
  AND site = 'US-AMZ-FBA'
GROUP BY month_date, sku
ORDER BY month_date DESC, sku;
```

### 5.2 前端輕量處理

前端只執行簡單的加總和平均計算：

```javascript
// ✅ 前端只做輕量聚合
const yearlyTotal = monthlyData.reduce((sum, month) => {
  return sum + month.monthly_units;
}, 0);

const avgMonthlyUSP = monthlyData.reduce((sum, month) => {
  return sum + month.monthly_avg_usp;
}, 0) / monthlyData.length;
```

**禁止前端重算**:
```javascript
// ❌ 禁止：前端重新計算複雜指標
const recalculatedUSP = calculateUSPFromRaw(rawData);

// ✅ 允許：使用預計算結果
const usp = aggregatedData.monthly_avg_usp;
```

### 5.3 範例 API 格式

```http
GET /api/forecast-review/data
```

**Request Parameters**:
```json
{
  "startDate": "2025-01-01",
  "endDate": "2025-12-31",
  "country": "US",
  "site": "US-AMZ-FBA",
  "sku": ["KM-OP-001", "KM-FP-002"],
  "granularity": "auto"  // 自動選擇 daily/weekly/monthly
}
```

**Response Format**:
```json
{
  "metadata": {
    "queryTime": "0.8s",
    "tableUsed": "fc_review_monthly_agg",
    "recordCount": 144
  },
  "data": [
    {
      "period": "2025-01-01",
      "sku": "KM-OP-001",
      "units": 4750,
      "revenue": 142500.0,
      "sessions": 12000,
      "usp": 12.5,
      "forecast_units": 5000,
      "achievement_rate": 95.0
    }
  ]
}
```

---

## 6. Cache Strategy

### 6.1 Redis TTL 策略

| 數據類型 | TTL | 原因 |
|---------|-----|------|
| **歷史數據** (>1個月前) | 24小時 | 數據穩定，不常變動 |
| **當月數據** | 1小時 | 每日更新，需要較新數據 |
| **實時數據** (今日) | 15分鐘 | 可能頻繁更新 |

### 6.2 Cache Key 設計

```
Pattern: fc_review:{table}:{country}:{site}:{start_date}:{end_date}:{hash}

Examples:
- fc_review:daily:US:US-AMZ-FBA:2026-01-01:2026-01-31:a1b2c3
- fc_review:monthly:US:US-AMZ-FBA:2025-01-01:2025-12-31:d4e5f6
- fc_achievement:monthly:US:US-AMZ-FBA:2025-10-01:2025-12-31:g7h8i9
```

### 6.3 Cache 更新策略

```javascript
// 智能 Cache 更新
function getCacheKey(params) {
  const table = selectAggregationTable(params.startDate, params.endDate);
  const hash = generateHash(params);
  return `fc_review:${table}:${params.country}:${params.site}:${params.startDate}:${params.endDate}:${hash}`;
}

function getTTL(startDate, endDate) {
  const isHistorical = endDate < getCurrentMonth();
  const isCurrentMonth = startDate <= getCurrentMonth() && endDate >= getCurrentMonth();
  
  if (isHistorical) return 24 * 60 * 60;      // 24小時
  if (isCurrentMonth) return 60 * 60;         // 1小時
  return 15 * 60;                             // 15分鐘
}
```

---

## 7. Performance Targets

### 7.1 SLA 定義

| 查詢範圍 | 目標響應時間 | 使用表 | 監控閾值 |
|---------|-------------|--------|---------|
| ≤ 30天 | **<0.5秒** | fc_review_daily_agg | 0.8秒 |
| 30-90天 | **<1秒** | fc_review_weekly_agg | 1.5秒 |
| >90天 | **<2秒** | fc_review_monthly_agg | 3秒 |
| FC達成率 | **<0.5秒** | fc_achievement_monthly | 0.8秒 |

### 7.2 性能監控

**監控指標**:
```sql
-- 查詢性能監控
SELECT 
  job_id,
  query,
  total_slot_ms / 1000 as duration_seconds,
  total_bytes_processed / 1024 / 1024 / 1024 as gb_processed,
  creation_time
FROM `region-us`.INFORMATION_SCHEMA.JOBS_BY_PROJECT
WHERE statement_type = 'SELECT'
  AND query LIKE '%fc_review_%'
  AND creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
ORDER BY duration_seconds DESC;
```

**告警規則**:
- 查詢時間超過 SLA 閾值 → 立即告警
- 單日查詢成本超過 $5 → 告警
- 聚合表更新失敗 → 立即告警

### 7.3 容量規劃

**預估數據量**:
```
Daily Agg:   30天 × 10K SKUs × 5 sites = 1.5M rows (≈100MB)
Weekly Agg:  52週 × 10K SKUs × 5 sites = 2.6M rows (≈200MB)  
Monthly Agg: 36月 × 10K SKUs × 5 sites = 1.8M rows (≈150MB)
FC Achievement: 36月 × 10K SKUs × 5 sites = 1.8M rows (≈120MB)

Total: ≈570MB (vs 原始 TB級數據)
```

---

## 8. Governance & Data Quality

### 8.1 Duplicate 檢查

**每日檢查重複記錄**:
```sql
-- 檢查 fc_achievement_monthly 重複
SELECT 
  month_date, company, country, site, sku,
  COUNT(*) as duplicate_count
FROM os_agg.fc_achievement_monthly
WHERE month_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
GROUP BY month_date, company, country, site, sku
HAVING COUNT(*) > 1;
```

**自動修復機制**:
```sql
-- 刪除重複，保留最新記錄
DELETE FROM os_agg.fc_achievement_monthly
WHERE (month_date, company, country, site, sku, last_updated) NOT IN (
  SELECT month_date, company, country, site, sku, MAX(last_updated)
  FROM os_agg.fc_achievement_monthly
  GROUP BY month_date, company, country, site, sku
);
```

### 8.2 異常 achievement_rate 檢查

**檢查異常達成率**:
```sql
-- 檢查異常高/低達成率
SELECT 
  month_date, sku, 
  forecast_units, actual_units, achievement_rate
FROM os_agg.fc_achievement_monthly
WHERE achievement_rate > 200 OR achievement_rate < 50
  AND forecast_units > 0
  AND month_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
ORDER BY achievement_rate DESC;
```

**告警規則**:
- achievement_rate > 300% → 立即告警
- achievement_rate < 30% 且 forecast_units > 100 → 告警
- forecast_units = 0 但 actual_units > 0 → 警告

### 8.3 last_updated 監控

**檢查數據新鮮度**:
```sql
-- 檢查各表最後更新時間
SELECT 
  'fc_achievement_monthly' as table_name,
  MAX(last_updated) as last_update_time,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(last_updated), HOUR) as hours_since_update
FROM os_agg.fc_achievement_monthly

UNION ALL

SELECT 
  'fc_review_daily_agg' as table_name,
  MAX(last_updated) as last_update_time,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(last_updated), HOUR) as hours_since_update
FROM os_agg.fc_review_daily_agg;
```

**SLA 要求**:
- 所有聚合表必須在每日 06:00 UTC 前完成更新
- 超過 26小時未更新 → 立即告警

### 8.4 Partition Filter 強制要求

**所有查詢必須包含分區過濾**:
```sql
-- ✅ 正確：包含分區過濾
SELECT * FROM os_agg.fc_achievement_monthly
WHERE month_date >= '2025-10-01'  -- 必須包含
  AND country = 'US';

-- ❌ 錯誤：缺少分區過濾
SELECT * FROM os_agg.fc_achievement_monthly
WHERE country = 'US';  -- 會被拒絕
```

**實施方式**:
- 所有聚合表設定 `require_partition_filter=true`
- API 層自動添加分區過濾條件
- 監控違規查詢並告警

---

## 9. Implementation Roadmap

### Phase 1: 基礎建設 (Week 1-2)
- [ ] 創建 4 個聚合表的 DDL
- [ ] 建立 ETL Pipeline
- [ ] 實施 Partition/Cluster 策略

### Phase 2: 數據遷移 (Week 3)
- [ ] 歷史數據初始化載入
- [ ] 數據質量驗證
- [ ] 性能測試

### Phase 3: API 整合 (Week 4)
- [ ] 實施 Intelligent Query Routing
- [ ] 建立 Cache Strategy
- [ ] API 端點開發

### Phase 4: 前端整合 (Week 5-6)
- [ ] Forecast Review 頁面改造
- [ ] Operation System 整合
- [ ] 移除對 raw.daily_sales 的直接查詢

### Phase 5: 監控與優化 (Week 7-8)
- [ ] 建立監控 Dashboard
- [ ] 實施告警機制
- [ ] 性能調優

---

## 10. Success Metrics

### 10.1 技術指標
- [ ] 查詢響應時間達到 SLA 要求
- [ ] BigQuery 成本降低 >95%
- [ ] 系統可用性 >99.9%
- [ ] 數據新鮮度 <6小時

### 10.2 業務指標
- [ ] 用戶查詢等待時間減少 >80%
- [ ] Forecast Review 使用率提升 >50%
- [ ] 數據不一致問題減少 >90%
- [ ] 開發維護工作量減少 >60%

---

**文件結束**

此規格文件為企業級正式版本，涵蓋所有 Forecast Review 和 FC Achievement 相關的聚合需求。所有相關系統必須嚴格遵循此規格進行開發和維護。