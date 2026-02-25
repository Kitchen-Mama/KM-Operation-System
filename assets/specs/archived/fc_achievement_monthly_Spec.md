# BigQuery 聚合表：FC 達成率月度表
## FC Achievement Monthly Specification

**文件版本**: v1.0  
**最後更新**: 2026-01-XX  
**負責人**: Data Engineering Team

---

## 一、Overview（文件目的）

### 1.1 表格名稱

```
project.os_agg.fc_achievement_monthly
```

**說明**: `project` 請替換為實際 GCP 專案 ID，`os_agg` 為聚合層 dataset。

### 1.2 表格用途

此表作為所有「FC 達成率 / Last 3 Month Overview / FC Achievement 報表」的唯一後端數據來源，支援以下功能：

- ✅ Operation System 的「Last 3 Month Overview」區塊
- ✅ Forecast Review 頁面的「Forecast Accuracy」統計
- ✅ Request Order 系統的「歷史達成率」展開區
- ✅ 未來的「FC Achievement Overview」獨立頁面

**查詢粒度**: 按照「月份 × 公司 × 國家 × 站點 × SKU」粒度，查看每月 Forecast vs Actual 的表現。

### 1.3 資料來源

| 來源表 | 說明 |
|--------|------|
| `raw.daily_sales` | 每日銷售原始數據（極大量，不建議直接查詢）|
| `os_agg.monthly_sales_summary` | 月度實績聚合表（由 daily_sales 聚合而來）|
| `os_agg.fc_monthly_plan` | 月度 FC 計畫表（來自 FC Summary 系統）|

### 1.4 為什麼需要這張表

| 問題 | 解決方案 |
|------|---------|
| ❌ 前端直接掃描日銷售原始表 → 查詢時間 >5秒 | ✅ 查詢預聚合表 → <0.5秒 |
| ❌ BQ 成本高（$150/月） | ✅ 降低 99% 成本（$1.5/月）|
| ❌ 高峰期系統不穩定 | ✅ 離峰批次計算，查詢簡單快速 |
| ❌ 數據量增長導致系統崩潰 | ✅ 數據量可控，線性增長 |

---

## 二、Grain（粒度與主鍵）

### 2.1 邏輯粒度

一列代表：**某一月份 × 公司 × 國家 × 站點 × SKU** 的一筆 FC 達成率紀錄。

```
Grain = month_date + company + country + marketplace + site + sku
```

### 2.2 主鍵說明

| 欄位 | 說明 | 範例 |
|------|------|------|
| `month_date` | 該月份的第一天 | `2026-01-01` 代表 2026 年 1 月 |
| `company` | 公司別 | `Kitchen Mama`, `Responsible Industrial` |
| `country` | 國家碼 | `US`, `JP`, `DE`, `EU` |
| `marketplace` | 銷售平台 | `Amazon`, `Target`, `Shopee` |
| `site` | 站點/倉別代碼 | `US-AMZ-FBA`, `US-WINIT`, `DE-AMZ-DEBR2`, `RT-US` |
| `sku` | Internal SKU | `KM-OP-001`, `KM-FP-002` |

**唯一性約束**: 上述 6 個欄位組合必須唯一，不允許重複。

---

## 三、Schema 設計（欄位一覽）

### 3.1 維度欄位（Dimensions）

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

### 3.2 度量欄位（Metrics）

| 欄位名 | 型別 | 必填 | 說明 | 計算公式 |
|--------|------|------|------|---------|
| `forecast_units` | INT64 | ✅ | 該月預測 FC 數量 | 來自 `fc_monthly_plan` |
| `actual_units` | INT64 | ✅ | 該月實際銷售/出貨量 | 來自 `monthly_sales_summary` |
| `variance_units` | INT64 | ✅ | 預測差異量 | `actual_units - forecast_units` |
| `achievement_rate` | FLOAT64 | ✅ | 達成率（%）| `SAFE_DIVIDE(actual_units, forecast_units) * 100` |
| `actual_revenue` | FLOAT64 | ⭕ | 該月實際營收 | 來自 `monthly_sales_summary` |
| `sessions` | INT64 | ⭕ | 該月 Sessions 總和 | 來自 `monthly_sales_summary` |
| `avg_usp` | FLOAT64 | ⭕ | 該月平均 Unit Session Percentage | 加權平均或簡單平均 |

**說明**:
- `variance_units` 正值 = 超出預測（好），負值 = 未達預測（差）
- `achievement_rate` 範圍通常在 0-200%，超過 150% 可能需要檢視 FC 準確性
- `avg_usp` 計算方式由 ETL 決定，建議使用加權平均（以 sessions 為權重）

### 3.3 Metadata / 控制欄位（Metadata）

| 欄位名 | 型別 | 必填 | 說明 |
|--------|------|------|------|
| `data_source` | STRING | ⭕ | 資料來源標記，例如 `amz_us`, `target_us`, `shopee_tw` |
| `version` | STRING | ⭕ | FC 版本，例如 `base`, `high`, `low`（預留欄位）|
| `is_final` | BOOL | ✅ | 是否已月結封存（true = 該月資料不再變動）|
| `last_updated` | TIMESTAMP | ✅ | 此列最後更新時間戳 |

---

## 四、Physical Design（BigQuery 物理設計）

### 4.1 Partition 設計

```sql
PARTITION BY month_date
```

**說明**:
- 按照月份切分，方便查詢最近 N 個月
- 定期清除舊資料（例如保留 36 個月）
- 降低查詢成本（只掃描需要的分區）

**範例查詢**:
```sql
-- 只掃描最近 3 個月的分區
WHERE month_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
```

### 4.2 Cluster 設計

```sql
CLUSTER BY country, site, sku
```

**說明**:
- 常見查詢維度是「國家 + 站點 + SKU」
- 多數前端畫面會先選 Country/Site，再下鑽到 SKU
- 這樣設計可顯著減少掃描量，優化查詢成本與速度

**查詢效能提升**:
- ✅ 未 Cluster: 掃描整個分區（例如 100MB）
- ✅ 已 Cluster: 只掃描相關區塊（例如 5MB）
- ✅ 成本降低 95%，速度提升 10-20 倍

### 4.3 表格選項

```sql
OPTIONS(
  description="FC Achievement Monthly Aggregation Table",
  partition_expiration_days=1095,  -- 3 年後自動刪除舊分區
  require_partition_filter=true     -- 強制查詢必須包含 month_date 條件
)
```

---

## 五、ETL / Data Flow（資料來源與 ETL 流程）

### 5.1 上游來源表

#### 5.1.1 `raw.daily_sales`

**欄位範例**:
```
sale_date, company, country, marketplace, site, sku, 
units, revenue, sessions, unit_session_percentage, ...
```

**特性**:
- 每日新增數據，數據量極大
- 不建議前端直接查詢
- 僅供 ETL 批次處理使用

#### 5.1.2 `os_agg.monthly_sales_summary`

**欄位範例**:
```
month_date, company, country, marketplace, site, sku,
actual_units, actual_revenue, sessions, avg_usp, ...
```

**特性**:
- 由 `daily_sales` 聚合而來
- 提供月度實績數據
- 每日更新當月與上月數據

#### 5.1.3 `os_agg.fc_monthly_plan`

**欄位範例**:
```
month_date, company, country, marketplace, site, sku,
forecast_units, version, ...
```

**特性**:
- 存放每月 FC 預測計畫
- 來自 FC Summary 系統
- 支援多版本（base/high/low）

### 5.2 聚合步驟概述

```
Step 1: 聚合日銷售 → 月度實績
├─ 輸入: raw.daily_sales
├─ 輸出: os_agg.monthly_sales_summary
├─ 粒度: month_date + company + country + marketplace + site + sku
└─ 統計: actual_units, actual_revenue, sessions, avg_usp

Step 2: JOIN 實績 + FC 計畫 → 達成率
├─ 輸入: monthly_sales_summary + fc_monthly_plan
├─ JOIN Key: month_date + company + country + site + sku
├─ 計算: variance_units, achievement_rate
└─ 輸出: os_agg.fc_achievement_monthly
```

### 5.3 Scheduled Query 設計建議

#### 更新頻率
```
每日一次，凌晨 03:00 UTC（台灣時間 11:00）
```

#### 更新範圍
```sql
-- 只重算當月與上月（T+1 更新）
WHERE month_date >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)
```

**說明**:
- 舊月份視為已結算（`is_final = true`），不再更新
- 特殊情況需要重算歷史數據時，可手動執行完整更新

#### 執行策略
```
1. 刪除當月與上月的舊數據
2. 重新計算並插入新數據
3. 更新 is_final 標記（上月設為 true）
```

---

## 六、範例 DDL（示意用）

### 6.1 建表語句

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
  s.month_date,
  s.company,
  s.country,
  s.marketplace,
  s.site,
  s.sku,
  s.category,
  s.brand,
  s.series,
  
  -- Metrics from Sales
  s.actual_units,
  s.actual_revenue,
  s.sessions,
  s.avg_usp,
  
  -- Metrics from FC Plan
  COALESCE(f.forecast_units, 0) AS forecast_units,
  
  -- Calculated Metrics
  s.actual_units - COALESCE(f.forecast_units, 0) AS variance_units,
  SAFE_DIVIDE(s.actual_units, f.forecast_units) * 100 AS achievement_rate,
  
  -- Metadata
  'amz_raw' AS data_source,
  'base' AS version,
  CASE 
    WHEN s.month_date < DATE_TRUNC(CURRENT_DATE(), MONTH) THEN TRUE 
    ELSE FALSE 
  END AS is_final,
  CURRENT_TIMESTAMP() AS last_updated
  
FROM `project.os_agg.monthly_sales_summary` s
LEFT JOIN `project.os_agg.fc_monthly_plan` f
  ON  s.month_date = f.month_date
  AND s.company    = f.company
  AND s.country    = f.country
  AND s.site       = f.site
  AND s.sku        = f.sku
  AND f.version    = 'base'  -- 只使用 base 版本 FC
WHERE s.month_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 36 MONTH);
```

### 6.2 Scheduled Query 範例

```sql
-- 每日更新當月與上月數據
DELETE FROM `project.os_agg.fc_achievement_monthly`
WHERE month_date >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH);

INSERT INTO `project.os_agg.fc_achievement_monthly`
SELECT
  s.month_date,
  s.company,
  s.country,
  s.marketplace,
  s.site,
  s.sku,
  s.category,
  s.brand,
  s.series,
  s.actual_units,
  s.actual_revenue,
  s.sessions,
  s.avg_usp,
  COALESCE(f.forecast_units, 0) AS forecast_units,
  s.actual_units - COALESCE(f.forecast_units, 0) AS variance_units,
  SAFE_DIVIDE(s.actual_units, f.forecast_units) * 100 AS achievement_rate,
  'amz_raw' AS data_source,
  'base' AS version,
  CASE 
    WHEN s.month_date < DATE_TRUNC(CURRENT_DATE(), MONTH) THEN TRUE 
    ELSE FALSE 
  END AS is_final,
  CURRENT_TIMESTAMP() AS last_updated
FROM `project.os_agg.monthly_sales_summary` s
LEFT JOIN `project.os_agg.fc_monthly_plan` f
  ON  s.month_date = f.month_date
  AND s.company    = f.company
  AND s.country    = f.country
  AND s.site       = f.site
  AND s.sku        = f.sku
  AND f.version    = 'base'
WHERE s.month_date >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH);
```

**說明**:
- 實際 project/dataset 名稱依環境調整
- 可改為 Scheduled Query 形式，每日排程執行
- 建議執行時間：凌晨 03:00 UTC

---

## 七、Query Patterns / Usage（查詢模式與使用情境）

### 7.1 Last 3 Months FC Achievement（Operation System）

**使用場景**: Operation System 畫面左上角「Last 3 Month Overview」區塊

```sql
SELECT 
  month_date,
  sku,
  forecast_units,
  actual_units,
  achievement_rate,
  sessions,
  avg_usp
FROM `project.os_agg.fc_achievement_monthly`
WHERE country = 'US'
  AND site = 'US-AMZ-FBA'
  AND sku = 'KM-OP-001'
  AND month_date >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 3 MONTH)
ORDER BY month_date DESC;
```

**預期結果**:
```
month_date  | sku        | forecast | actual | achievement_rate | sessions | avg_usp
2026-01-01  | KM-OP-001  | 5000     | 4750   | 95.0            | 12000    | 12.5
2025-12-01  | KM-OP-001  | 4800     | 4600   | 95.8            | 11500    | 12.3
2025-11-01  | KM-OP-001  | 4500     | 4200   | 93.3            | 10800    | 12.1
```

### 7.2 年度 FC 達成率趨勢（Category 層級）

**使用場景**: Forecast Review 頁面的「Category Achievement」統計

```sql
SELECT
  month_date,
  country,
  site,
  category,
  SUM(forecast_units) AS fc_units,
  SUM(actual_units)   AS actual_units,
  SAFE_DIVIDE(SUM(actual_units), SUM(forecast_units)) * 100 AS achievement_rate
FROM `project.os_agg.fc_achievement_monthly`
WHERE country = 'US'
  AND site LIKE 'US-AMZ-%'
  AND month_date BETWEEN '2025-01-01' AND '2025-12-01'
GROUP BY 1,2,3,4
ORDER BY month_date;
```

### 7.3 SKU 績效排名（Top 5 Growth / Worst）

**使用場景**: Forecast Review 頁面的「Top 5 Growth SKUs」和「Top 5 Worst SKUs」

```sql
-- Top 5 Growth SKUs
SELECT
  sku,
  AVG(achievement_rate) AS avg_achievement_rate,
  SUM(actual_units) AS total_actual,
  SUM(variance_units) AS total_variance
FROM `project.os_agg.fc_achievement_monthly`
WHERE country = 'US'
  AND month_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
GROUP BY sku
ORDER BY avg_achievement_rate DESC
LIMIT 5;

-- Top 5 Worst SKUs
SELECT
  sku,
  AVG(achievement_rate) AS avg_achievement_rate,
  SUM(actual_units) AS total_actual,
  SUM(variance_units) AS total_variance
FROM `project.os_agg.fc_achievement_monthly`
WHERE country = 'US'
  AND month_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
GROUP BY sku
ORDER BY avg_achievement_rate ASC
LIMIT 5;
```

### 7.4 前端 API 設計建議

```javascript
// API Endpoint
GET /api/fc-achievement?sku=KM-OP-001&period=last-3-months

// Response Format
{
  "sku": "KM-OP-001",
  "country": "US",
  "site": "US-AMZ-FBA",
  "months": [
    {
      "month": "2026-01",
      "forecast": 5000,
      "actual": 4750,
      "achievement_rate": 95.0,
      "variance": -250,
      "sessions": 12000,
      "usp": 12.5
    },
    // ... 最近3個月
  ],
  "summary": {
    "avg_achievement_rate": 94.7,
    "total_forecast": 14300,
    "total_actual": 13550,
    "total_variance": -750
  },
  "cached_at": "2026-02-15T08:00:00Z"
}
```

**重要原則**:
- ✅ Operation System 的「Last 3 Month Overview」只讀這張表
- ✅ 未來的「FC Achievement Overview 頁面」只讀這張表
- ❌ 不直接查 `raw.daily_sales` 原始資料
- ✅ 確保查詢速度、成本與穩定性

---

## 八、權限與安全性

### 8.1 Dataset 隔離

```
raw.*                  → 原始數據層（限 ETL 存取）
os_agg.*               → 聚合數據層（前端/API 可讀）
os_app.*               → 應用層（前端寫入）
```

**建議**:
- 將 `fc_achievement_monthly` 放在專用 dataset `os_agg`
- 與 `raw` 分離，降低誤操作風險

### 8.2 IAM 權限設計

| 角色 | Dataset | 權限 | 說明 |
|------|---------|------|------|
| ETL Service Account | `raw.*` | Read/Write | 可讀寫原始數據 |
| ETL Service Account | `os_agg.*` | Read/Write | 可讀寫聚合表 |
| API Service Account | `os_agg.*` | Read Only | 只能讀取聚合表 |
| API Service Account | `raw.*` | ❌ No Access | 不可存取原始數據 |
| Frontend Users | `os_agg.*` | Read Only | 透過 API 間接存取 |

### 8.3 Authorized Views（可選）

若需要更細緻控制，可利用 BigQuery Authorized Views：

```sql
-- 建立視圖限制只能看自己公司的數據
CREATE VIEW `project.os_agg.fc_achievement_km_only` AS
SELECT *
FROM `project.os_agg.fc_achievement_monthly`
WHERE company = 'Kitchen Mama';

-- 授權特定服務帳號只能存取此視圖
```

### 8.4 資料遮罩（Data Masking）

若需要保護敏感欄位（例如 revenue），可使用 BigQuery Column-level Security：

```sql
-- 對非管理員隱藏營收數據
CREATE POLICY mask_revenue
ON `project.os_agg.fc_achievement_monthly`
GRANT TO ('group:analysts@company.com')
FILTER USING (TRUE)
MASK (actual_revenue USING NULL);
```

---

## 九、監控與維護

### 9.1 資料品質檢查

```sql
-- 檢查是否有重複資料
SELECT 
  month_date, company, country, site, sku, 
  COUNT(*) as cnt
FROM `project.os_agg.fc_achievement_monthly`
GROUP BY 1,2,3,4,5
HAVING cnt > 1;

-- 檢查是否有異常達成率
SELECT *
FROM `project.os_agg.fc_achievement_monthly`
WHERE achievement_rate > 200 OR achievement_rate < 0;

-- 檢查最後更新時間
SELECT 
  MAX(last_updated) as last_update,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(last_updated), HOUR) as hours_ago
FROM `project.os_agg.fc_achievement_monthly`;
```

### 9.2 效能監控

```sql
-- 查詢成本分析（查看 BQ Console）
-- 監控指標：
-- - 平均查詢時間 < 1 秒
-- - 平均掃描量 < 10MB
-- - 每日查詢成本 < $0.1
```

### 9.3 定期維護

| 任務 | 頻率 | 說明 |
|------|------|------|
| 檢查資料完整性 | 每週 | 確保無遺漏月份 |
| 清理過期分區 | 每月 | 刪除 36 個月前的數據 |
| 重新計算歷史數據 | 按需 | FC 調整時重算 |
| 更新 Cluster 統計 | 每季 | 優化查詢效能 |

---

## 十、附錄

### 10.1 相關文件

- [Forecast Order Engine Spec](./Forecast_Order_Engine_Spec.md)
- [FC Summary Implementation](./FC_SUMMARY_IMPLEMENTATION.md)
- [Inventory Replenishment PRD](./InventoryReplenishment_PRD.md)

### 10.2 變更歷史

| 版本 | 日期 | 變更內容 | 負責人 |
|------|------|---------|--------|
| v1.0 | 2026-01-XX | 初版建立 | Data Engineering Team |

### 10.3 聯絡資訊

- **Data Engineering Team**: data-eng@company.com
- **Product Owner**: product@company.com
- **Technical Support**: tech-support@company.com

---

**文件結束**
