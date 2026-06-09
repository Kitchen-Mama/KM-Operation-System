# FC_DataModel_Spec.md
Forecast Data Model – Source of Truth Design

## 1. Purpose（目的）

本文件定義 Forecast（FC）資料的 **來源資料結構（Source of Truth）**、  
雲端資料表（BigQuery）設計原則，以及前端頁面如何安全、有效率地存取資料。

目標：
- 支援 **多公司 / 多站點 / 多 SKU / 多年度**
- 同時支援 **Regular Forecast** 與 **Special Event Forecast**
- 保留使用者熟悉的「表格編輯體驗」
- 提供後續頁面（Forecast Review / Inventory / Replenishment / Shipping Plan）穩定可拉取的資料來源
- 避免資料重複、避免效能問題

---

## 2. Forecast Data Categories（資料分類）

Forecast 資料分為兩大類，**邏輯上分開、UI 上可切換、資料層可整合**：

1. **Regular Forecast**
   - 月常態銷售預測
   - 通常為 12 個月（或更多）規劃
   - 主要用於年度 / 月度補貨與生產規劃

2. **Special Event Forecast**
   - 特定活動（Spring Deal / Prime Day / BFCM…）
   - 非固定月份，與行銷活動強綁
   - 用於活動備貨與短期產能調整

---

## 3. Raw Data Source（原始來源資料）

### 3.1 Regular Forecast – Raw Structure

來源：  
- Google Sheet：`FC_Regular` tab  
- 對應 BigQuery table：`fc_regular_wide`

資料結構（Wide Table）：

| Column Name | Type | Description |
|------------|------|-------------|
| year | INTEGER | Forecast 年度 |
| company | STRING | 公司主體（例如 ResTW / ResUS） |
| marketplace | STRING | 銷售平台（Amazon / Walmart…） |
| country | STRING | 國家 |
| category | STRING | 產品類別 |
| series | STRING | 產品系列 |
| sku | STRING | SKU |
| m1 ~ m12 | INTEGER | 每月 Forecast 數量（1~12 月） |

設計原則：
- 保留「一列 = 一個 SKU + 一個年度」的可讀性
- 方便 Planner 在 Sheet / UI 中直接調整
- 不在 Raw Table 做複雜計算

---

### 3.2 Special Event Forecast – Raw Structure

來源：  
- Google Sheet：`FC_SpecialEvent` tab  
- 對應 BigQuery table：`fc_event`

資料結構（Long Table）：

| Column Name | Type | Description |
|------------|------|-------------|
| year | INTEGER | 年度 |
| company | STRING | 公司主體 |
| marketplace | STRING | 銷售平台 |
| country | STRING | 國家 |
| sku | STRING | SKU |
| event | STRING | 活動名稱（SpringDeal / PrimeDay / BFCM…） |
| event_start_date | DATE | 活動開始日（optional） |
| event_end_date | DATE | 活動結束日（optional） |
| fc_qty | INTEGER | 活動預測數量 |

設計原則：
- 一列只代表一個 Event
- Event 名稱為穩定維度（避免 UI hard-code）
- 可彈性新增新活動，不影響 Regular FC

---

## 4. BigQuery View Layer（標準化資料層）

Raw table 不直接給前端與其他系統使用，  
需透過 View 進行結構統一與解耦。

---

### 4.1 Regular Forecast – Long View

View Name：
- `v_fc_regular_long`

來源：
- `fc_regular_wide`

輸出結構：

| Column Name | Type | Description |
|------------|------|-------------|
| year | INTEGER | 年度 |
| company | STRING | 公司 |
| marketplace | STRING | 平台 |
| country | STRING | 國家 |
| sku | STRING | SKU |
| month | INTEGER | 月份（1~12） |
| fc_qty | INTEGER | Forecast 數量 |
| fc_type | STRING | 固定為 'Regular' |

用途：
- 提供圖表、趨勢、補貨邏輯計算
- 與 Actual Sales 做 Join
- 避免前端處理寬表

---

### 4.2 Special Event Forecast View

View Name：
- `v_fc_event`

來源：
- `fc_event`

輸出結構（基本不變）：

| Column Name | Type |
|------------|------|
| year | INTEGER |
| company | STRING |
| marketplace | STRING |
| country | STRING |
| sku | STRING |
| event | STRING |
| fc_qty | INTEGER |
| fc_type | STRING |

fc_type 固定為 'Event'

---

### 4.3 Unified Forecast View（Optional）

View Name：
- `v_fc_all`

用途：
- 需要「所有 Forecast 一起分析」時使用
- 不影響 UI 是否分 Tab 顯示

---

## 5. Frontend Usage Rules（前端使用規則）

### 5.1 UI 結構

- Forecast 總表頁面：
  - Tab 1：Regular Forecast
  - Tab 2：Special Event Forecast

UI 行為：
- 切換 Tab ≠ 切換資料來源概念
- 僅影響 API Query 的 View

---

### 5.2 API 查詢原則

- 所有 API 查詢 **必須帶篩選條件**
  - year（必填）
  - company / marketplace / country（至少一個）
- 禁止一次拉取「所有年度、所有公司、所有 SKU」

---

## 6. Actual Sales & Achievement Rate（實際銷售與達成率）

設計原則：
- **Forecast 與 Actual Sales 不混存在同一張 Raw Table**
- Actual Sales 為獨立資料源（Shopify / Amazon API / ETL）

推薦呈現方式（非資料模型限制）：
- 頁面層：
  - 預設只顯示 Forecast
  - 點擊「Review / Compare」才顯示 Actual & Achievement
- 或：
  - 表格主欄位：Forecast
  - Hover / Expand 顯示 Actual & % Achievement

避免：
- Raw Table 中直接存達成率（Derived Data）

---

## 7. Extensibility（擴充性）

此資料模型可支援：
- 新年度 FC
- 新公司 / 新 Marketplace
- 新 Event 類型
- 未來加入：
  - Forecast Versioning
  - Approval Flow
  - Scenario Planning（Best / Base / Worst）

---

## 8. Non-Goals（本階段不處理）

- Forecast 計算邏輯
- Safety Stock / Replenishment Algorithm
- Production Allocation Algorithm

以上由其他 Spec 定義。

---

## 9. Summary（結論）

- Regular 與 Event **資料層分離是正確的**
- UI 使用 Tab 切換是正確的
- BigQuery View 是所有分析與頁面的唯一穩定入口
- 本 Spec 為 Forecast 系統的 Source of Truth 設計
