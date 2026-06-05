# Shipment / Inventory Flow Architecture Audit Report

> **Note (2026-06):** This audit report reflects the pre-DB-schema state of the shipment flow. The finalized v1 Shipment / Inventory / PO / Carrier schema is now documented in `SHIPMENT_DATABASE_SCHEMA.md`. If any table suggestion in this audit conflicts with `SHIPMENT_DATABASE_SCHEMA.md`, the schema document is the source of truth.

**Audit 日期**: 2025-06  
**執行方式**: 只讀檔案，未修改任何程式碼  
**範圍**: Inventory Replenishment → Shipping Plan → Shipment History → Shipping Management

---

## 1. Executive Summary

| 指標 | 狀態 |
|------|------|
| 頁面 UI 完成度 | 4/5 頁有 UI（Shipping Management 尚未開發） |
| 跨頁連動 | 有基礎串接（Inventory → Shipping Plan → History） |
| 資料持久化 | 全部用 sessionStorage（關閉瀏覽器即消失） |
| 雲端 DB | 0% |
| Carrier DB | 不存在 |
| 文件生成 | 不存在 |
| 審核流程 | 有 UI（Draft/Pending/Approved），但無真正權限控制 |

**最大缺口**: 所有出貨流程資料只存在 sessionStorage，無持久化 DB。Shipping Management 完全不存在。Carrier / Document Generation 為零。

---

## 2. Page-by-page Current State

---

### Page: Inventory Replenishment / 貨物庫存表

#### A. Current Status
- ✅ UI Completed
- ✅ DemoData Connected
- ✅ Mock Fallback preserved (disabled by default)
- ❌ Cloud Read Not Connected
- ❌ Cloud Write Not Enabled

#### B. Files
- HTML: `#ops-section` (index.html)
- JS: `assets/js/pages/inventory-replenishment.js` (1613 lines)
- CSS: `assets/css/pages/inventory-replenishment.css`
- Data: `demo-shared-data.js` / `data.js` (fallback disabled)

#### C. Section / Sidebar
- Section ID: `ops-section`
- Sidebar: 「貨物庫存表」
- showSection key: `'ops'`
- Lifecycle: ✅ `KM.lifecycle.register('ops-section', ...)`

#### D. Data Source
優先順序:
1. KM.DemoData.getInventoryRows() (when Demo ON)
2. `return []` (when Demo OFF — no data source)
3. ~~DataRepo.getSiteSkus() + replenishmentMockData~~ (disabled)

#### E. Main Functions
| Function | Purpose |
|----------|---------|
| `getReplenishmentData()` | 資料取得（含 DemoData 分支） |
| `renderReplenishment()` | 主表格渲染 |
| `renderIrOverview()` | Overview 表格渲染 |
| `initReplenHeaderSync()` | Header 滾動同步 |
| `toggleReplenRow(sku)` | 展開/收合詳情面板 |
| `submitReplenishmentPlans()` | ⭐ 推送到 Shipping Plan |
| `initializeShippingAllocation()` | Shipping 分配初始化 |
| `addShippingMethod()` / `removeShippingMethod()` | 運輸方式管理 |
| `initSalesTrendChart()` / `initAchievementChart()` | 展開面板圖表 |
| `openAddMarketplaceModal()` | 新增 Marketplace |

#### F. Current Fields (Render)
- sku, lifecycle, company, marketplace
- currentInventory, onTheWay, thirdPartyStock
- avgDailySales, forecast60d, upcomingEventQty
- daysOfSupply, needsAlert, suggestedQty
- cnStock, twStock
- need18, need30, need45Plus

#### G. Current User Actions
- ✅ Filter (Country, Marketplace, LTS)
- ✅ Expand row detail
- ✅ Add Shipping Method / Remove
- ✅ Submit Plan → 推送到 Shipping Plan
- ✅ Add Marketplace modal
- ✅ Add Country
- ❌ Export
- ❌ Cloud save

#### H. Current Gaps
- ❌ 無持久化 DB
- ❌ 無雲端庫存快照
- ❌ Submit Plan 只寫入 sessionStorage
- ❌ 無歷史記錄追蹤
- ❌ 無 Carrier DB 整合
- ❌ AI Suggestion 是 placeholder

---

### Page: Factory Stock

#### A. Current Status
- ✅ UI Completed
- ✅ DemoData Connected
- ❌ Cloud Read Not Connected
- ❌ Cloud Write Not Enabled

#### B. Files
- HTML: `#factory-stock-section`
- JS: `assets/js/pages/factory-stock.js` (320 lines)
- CSS: `assets/css/pages/factory-stock.css`
- Data: `demo-shared-data.js` / ~~`window.factoryStockData`~~ (disabled)

#### C. Section / Sidebar
- Section ID: `factory-stock-section`
- Sidebar: 「Factory Stock」
- showSection key: `'factory-stock'`
- Lifecycle: ✅

#### D. Data Source
1. KM.DemoData.getFactoryStockRows() (Demo ON)
2. `null` → 顯示空狀態 (Demo OFF)
3. ~~window.factoryStockData~~ (disabled)

#### E. Main Functions
| Function | Purpose |
|----------|---------|
| `initFactoryStockPage()` | 初始化（含篩選器、渲染、滾動同步） |
| `renderFactoryStockTable(root)` | 表格渲染 |
| `updateFilterText(filterType, root)` | 篩選器文字更新 |

#### F. Current Fields
- sku, company, category, series, factory, stock
- completedOrderMonth0, completedOrderMonth1, completedOrderMonth2

#### G. Current User Actions
- ✅ Filter (Factory, Company, Category, Series, SKU search)
- ✅ Edit button (存在但功能為 placeholder)
- ❌ No export
- ❌ No cloud write
- ❌ No import from factory system

#### H. Current Gaps
- ❌ 無工廠資料導入機制
- ❌ 無 production status / QC status 顯示
- ❌ 無 next production date
- ❌ Edit 功能只是 placeholder
- ❌ 無與 Inventory 的即時同步

---

### Page: Weekly Shipping Plan / Shipping Plan

#### A. Current Status
- ✅ UI Completed (卡片式)
- ❌ DemoData Not Connected (直接讀 sessionStorage)
- ❌ Cloud DB Not Connected
- ✅ Approval workflow exists (sessionStorage-based)

#### B. Files
- HTML: `#shippingplan-section`
- JS: `assets/js/pages/shipping-plan.js` (558 lines)
- CSS: `assets/css/pages/shipping-plan.css`
- Data: `sessionStorage('allShippingPlans')`

#### C. Section / Sidebar
- Section ID: `shippingplan-section`
- Sidebar: 「Shipping Plan」
- showSection key: `'shippingplan'`
- Lifecycle: ✅

#### D. Data Source
- `sessionStorage.getItem('allShippingPlans')` — 唯一資料源
- 資料由 Inventory Replenishment 的 `submitReplenishmentPlans()` 寫入
- 無 DemoData 接入
- 無雲端 DB

#### E. Main Functions
| Function | Purpose |
|----------|---------|
| `renderShippingPlan()` | 主渲染（分三區：Draft/Pending/Approved） |
| `renderPlanCards()` | 渲染單一狀態的卡片 |
| `toggleShippingPlanCard()` | 展開/收合卡片 |
| `submitToPending()` | Draft → Pending Approval |
| `approvePlan()` | Pending → Approved |
| `sendBackToDraft()` | Pending → Draft |
| `markAsDone()` | ⭐ Approved → 產生 History record → 刪除 |
| `cancelShippingPlanCard()` | 刪除 plan |
| `filterByStatus()` | 狀態篩選 |
| `showNoteInput()` / `saveNote()` | 備註系統 |
| `updateCarrierCost()` | Carrier 費用計算 |
| `validateShippingQty()` | 數量驗證 |

#### F. Current Fields (Card Summary)
- Status, Submitted Date, Country, Marketplace
- Shipping Method, Total SKU, Total Pcs, Total Cartons
- Total Cost, Unit Cost

#### F2. Current Fields (Card Detail)
- SKU table: sku, currentInventory, avgDailySales, daysOfSupply, qty, cartons
- Plan Rationale: targetDays, method, notes
- Cost Breakdown: carrier, carrierFee, duty, totalCost, unitCost

#### G. Current User Actions
- ✅ Filter by Country / Status
- ✅ Expand / Collapse card
- ✅ Submit (Draft → Pending)
- ✅ Approve (Pending → Approved)
- ✅ Send Back (Pending → Draft)
- ✅ Mark as Done (Approved → History)
- ✅ Cancel (Delete)
- ✅ Add Note
- ✅ Change Carrier (recalculate cost)
- ✅ Validate shipping qty
- ❌ No export / document generation
- ❌ No tracking number
- ❌ No ETD/ETA

#### H. Current Gaps
- ❌ 資料只在 sessionStorage（關閉瀏覽器即消失）
- ❌ 無真正權限控制（任何人可 approve）
- ❌ 無 Carrier DB（硬編碼 DHL/FedEx/UPS/Maersk）
- ❌ 無 ETD / ETA
- ❌ 無 shipment document 生成
- ❌ 無 DemoData 接入
- ❌ 無雲端持久化
- ❌ Carrier 費率硬編碼（$2.0-$3.5 固定）

---

### Page: Shipment History / Shipment Overview

#### A. Current Status
- ✅ UI Completed
- ❌ DemoData Not Connected
- ❌ Cloud DB Not Connected

#### B. Files
- HTML: `#shippinghistory-section`
- JS: `assets/js/pages/shipping-history.js` (627 lines)
- CSS: `assets/css/pages/shipping-history.css`
- Data: `sessionStorage('shippingHistory')` + built-in mock

#### C. Section / Sidebar
- Section ID: `shippinghistory-section`
- Sidebar: 「Shipment Overview」
- showSection key: `'shippinghistory'`
- Lifecycle: ✅

#### D. Data Source
優先順序:
1. `sessionStorage.getItem('shippingHistory')` (由 Shipping Plan markAsDone 寫入)
2. `shippingHistoryMockData` (內建 mock fallback)

#### E. Main Functions
| Function | Purpose |
|----------|---------|
| `initShippingHistoryPage()` | 初始化 |
| `loadHistoryData()` | 讀取 sessionStorage 或 fallback mock |
| `onHistorySearch()` | 搜尋觸發 |
| `collectFilterParams()` | 收集篩選條件 |
| `filterHistoryData()` | 篩選 |
| `renderHistoryResults()` | 渲染結果 |
| Date picker 相關 | 日期範圍選擇 |

#### F. Current Fields
- id, date, country, marketplace, method
- totalPcs, totalCartons, totalCost, unitCost
- skus: [{sku, qty}]

#### F2. Missing Fields (compared to real shipment tracking)
- ❌ No shipment_id
- ❌ No carrier_name
- ❌ No tracking_number
- ❌ No container_no / BL no
- ❌ No ETD / ETA / actual_arrival
- ❌ No status (in_transit / arrived / customs)
- ❌ No invoice_no
- ❌ No packing_list

#### G. Current User Actions
- ✅ Filter by Date / Country / SKU / Shipping Method
- ✅ Search
- ✅ View list
- ❌ No detail view per shipment
- ❌ No status tracking
- ❌ No document download
- ❌ No export

#### H. Current Gaps
- ❌ 資料來自 sessionStorage + mock（非持久化）
- ❌ 無 shipment detail 展開
- ❌ 無 ETD/ETA/tracking
- ❌ 無 carrier 顯示
- ❌ 無 document 下載
- ❌ 無 status update
- ❌ 與真實出貨流程脫節

---

### Page: Shipping Management

#### A. Current Status
- ❌ **Not Started**
- Sidebar 入口存在但標示為 `menu-item--disabled` + "Stage 2" badge
- 無 section HTML
- 無 JS 檔案
- 無 CSS 檔案

#### B-H. N/A

---

## 3. Current Cross-page Flow

```
Inventory Replenishment
    │
    │ submitReplenishmentPlans()
    │ → 寫入 sessionStorage('allShippingPlans')
    │ → showSection('shippingplan')
    │ → renderShippingPlan()
    ▼
Weekly Shipping Plan
    │
    │ markAsDone(planId, method)
    │ → 寫入 sessionStorage('shippingHistory')
    │ → 從 allShippingPlans 刪除
    ▼
Shipment History
    │
    │ loadHistoryData()
    │ → 讀取 sessionStorage('shippingHistory')
    │ → fallback: shippingHistoryMockData
    ▼
Shipping Management ← ❌ 不存在
```

**連動狀態**: 有基礎串接，但全靠 sessionStorage，無持久化。

---

## 4. Existing Functions & Buttons

### 可用按鈕（功能完整）

| 頁面 | 按鈕 | 功能 |
|------|------|------|
| Inventory | Submit Plan | 推送到 Shipping Plan ✅ |
| Inventory | + Add Marketplace | 新增 Marketplace ✅ |
| Shipping Plan | Expand/Collapse | 展開卡片 ✅ |
| Shipping Plan | Submit | Draft → Pending ✅ |
| Shipping Plan | Approve | Pending → Approved ✅ |
| Shipping Plan | Send Back | Pending → Draft ✅ |
| Shipping Plan | Done | Approved → History ✅ |
| Shipping Plan | Cancel | 刪除 ✅ |
| Shipping Plan | + Add Note | 加備註 ✅ |
| Shipment History | Search | 搜尋/篩選 ✅ |

### Placeholder 按鈕（UI 存在但功能不完整）

| 頁面 | 按鈕 | 狀態 |
|------|------|------|
| Inventory | View AI recommendation | Placeholder（展開面板但無真正 AI） |
| Factory Stock | Edit | Placeholder（onclick 存在但無完整功能） |
| Shipping Management | Sidebar entry | Disabled + "Stage 2" badge |

---

## 5. Current Data Sources

| 頁面 | 資料源 | 持久化 |
|------|--------|:------:|
| Inventory Replenishment | DemoData / 空 | ❌ |
| Factory Stock | DemoData / 空 | ❌ |
| Shipping Plan | sessionStorage | ❌ (關閉即消失) |
| Shipment History | sessionStorage + mock | ❌ |
| Shipping Management | N/A | N/A |

---

## 6. Missing Data Models

> **Historical note (2026-06):** The following section is historical recommendation from audit time. Final schema is maintained separately in `SHIPMENT_DATABASE_SCHEMA.md`.

以下為未來需要的 DB Tables（只列建議，不建立）：

### 6.1 inventory_snapshots
存各站點庫存快照（每日或每次匯入時記錄）。

### 6.2 factory_stock
工廠庫存（按 SKU × 工廠），含 production_status, qc_status。

### 6.3 shipping_plans
Shipping Plan 主表：plan_id, country, marketplace, status, created_by, approved_by, dates。

### 6.4 shipping_plan_lines
Shipping Plan SKU 明細：plan_id, sku, requested_qty, approved_qty, shipping_method, source_reason。

### 6.5 shipments
出貨主表：shipment_id, plan_id, carrier_id, tracking, container, status, ETD, ETA, actual_arrival。

### 6.6 shipment_lines
出貨 SKU 明細：shipment_id, sku, qty, carton_qty, cbm, weight。

### 6.7 carriers
物流商主資料：carrier_id, name, type, contact, service_level。

### 6.8 carrier_rate_cards
費率表：carrier_id, origin, destination, method, rate, effective_dates。

### 6.9 shipment_documents
文件記錄：document_id, shipment_id, type (PO/SO/Invoice/PackingList), file_url, generated_at。

---

## 7. Architecture Risks

### 🔴 High Risk

| Risk | Impact |
|------|--------|
| 所有出貨資料在 sessionStorage | 關閉瀏覽器即永久消失 |
| Shipping Plan 無真正審核權限 | 任何人可 approve / reject |
| Carrier 費率硬編碼 | 無法反映真實成本 |

### 🟡 Medium Risk

| Risk | Impact |
|------|--------|
| Inventory mock data 與 Factory Stock mock data 獨立維護 | 未來同步困難 |
| Shipping Plan 與 Request Order 概念有重疊 | Request Order 也有 "suggest order"，需釐清邊界 |
| Shipment History 無 detail view | 無法追蹤個別 shipment 狀態 |
| DemoData 未接入 Shipping Plan / History | Demo 時這兩頁無假資料 |

### 🟢 Low Risk

| Risk | Impact |
|------|--------|
| Factory Stock 的 "Edit" 是 placeholder | 使用者可能誤點 |
| shippingHistoryMockData 內建但與 DemoData 無關 | 兩套假資料並存 |
| Shipping Management disabled 但使用者可見 | 可能造成混淆 |

---

## 8. Recommended Build Order

| # | 項目 | 前置 | 預估複雜度 |
|---|------|------|:----------:|
| 1 | Shipping Plan + History 接入 DemoData | DemoData 已完成 | 低 |
| 2 | 定義 DB Schema（shipping_plans, shipments, carriers） | 無 | 低（只定義） |
| 3 | Shipping Plan 改用 KM.state.persist() 取代 sessionStorage | KM.state 已有 | 中 |
| 4 | Shipment History 加入 detail view + status | #3 | 中 |
| 5 | Carrier DB 頁面 + 資料 | #2 | 中 |
| 6 | Shipping Plan 加入 ETD/ETA/carrier selection from DB | #5 | 中 |
| 7 | Document Generation (PO/SO/Invoice) | #4, #5 | 高 |
| 8 | Shipping Management 頁面（在途追蹤） | #4, #6 | 高 |
| 9 | Factory Stock 工廠資料導入 | #2 | 中 |
| 10 | 全流程雲端化（Google Sheet 或 Supabase） | #2-#6 | 高 |

---

## 9. Do Not Touch Yet

| 項目 | 原因 |
|------|------|
| SKU Details / SKU Handbook | 已有獨立 Google Sheet 連動，不在出貨流程範圍 |
| Apps Script | 目前只服務 SKU 系統，出貨流程需要另建 |
| Promotion Risk / Campaign | 完全獨立功能 |
| DemoData 核心檔 | 已穩定，除非要加 shipping demo data |
| Request Order | 與 Shipping Plan 有概念重疊，需先釐清邊界再動 |

---

## 10. Key Finding: Request Order vs Shipping Plan 邊界問題

**目前兩頁概念重疊**:
- Request Order: 「我需要下單給工廠」的建議
- Shipping Plan: 「我要出貨到海外站點」的計畫

**建議邊界**:
```
Request Order = 向工廠下單（PO to Factory）
Shipping Plan = 從工廠/倉庫出貨到海外（Shipment to Destination）
```

目前 `submitReplenishmentPlans()` 直接從 Inventory 推到 Shipping Plan，跳過了 Request Order。這代表 Request Order 目前是獨立的「查看建議」頁面，沒有和出貨流程串接。

---

**Audit 完成。未修改任何檔案。**


---

## Inventory Replenishment — Table Layout Issue Resolved (2026-06)

- Table layout visual issue resolved (right-side green blank).
- Inventory Replenishment is classified as a **User Operation Table**. It has passed the first table layout polish and will serve as the reference for future operation tables.
- Header/body scroll sync issue resolved.
- No data logic changes.
- Still needs future DB integration according to Shipment DB schema (currently DemoData only).
