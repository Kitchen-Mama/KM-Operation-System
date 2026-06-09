# Inventory Replenishment System - Product Specification

**Version:** 1.1  
**Stage:** Stage 1 (Manual Planning)  
**Last Updated:** 2025-01-XX

**Changelog v1.1:**
- Added SKU Lifecycle Type to Data Schema
- Introduced Draft Batch concept for bulk plan management
- Enhanced AI readiness documentation

---

## 1. System Overview & Stage Positioning

### 1.1 System Goal
Build an intelligent replenishment system that supports **New Products / Mature Products / Promotional Products**, with a scalable architecture designed for future AI-driven automation.

### 1.2 Stage 1 Scope
- **Manual replenishment planning only**
- No AI, no auto-replenishment
- All logic designed to be **replaceable by AI** in future stages
- Output: **Draft Shipping Plans** (not actual shipments)

### 1.3 Stage Roadmap
- **Stage 1:** Manual planning with structured data foundation
- **Stage 2:** AI-assisted suggestions (AI recommends, human approves)
- **Stage 3:** Fully automated replenishment with human oversight

---

## 2. Core User Roles & Use Cases

### 2.1 Primary User
**Supply Chain Manager / Inventory Planner**

### 2.2 Key Use Cases
1. Select Country & Marketplace
2. Set Target Days of Supply (default: 90 days)
3. Review SKU-level replenishment suggestions
4. Create 1~N replenishment plans per SKU (different shipping methods)
5. Submit plans as Shipping Drafts

---

## 3. Data Schema

### 3.1 Read-Only Data (System Calculated)
```
- Current Inventory (from WMS/ERP)
- Historical Sales (last 30/60/90 days)
- Forecast (system-generated or manual input)
- Days of Supply (calculated)
- On the Way (in-transit inventory)
- Suggested Replenishment Qty (calculated)
- SKU Lifecycle Type (New / Mature / Phasing Out)
```

### 3.1.1 SKU Lifecycle Type
**Purpose:** Enable AI to apply different replenishment strategies per lifecycle stage.

| Lifecycle Type | Definition | AI Strategy (Stage 2/3) |
|----------------|------------|-------------------------|
| **New** | <90 days since launch | Conservative forecast, higher safety stock |
| **Mature** | 90+ days, stable sales | Standard forecast, optimized inventory |
| **Phasing Out** | Marked for discontinuation | Minimize inventory, avoid overstock |

**Stage 1 Usage:**
- Display as read-only column in main table
- Filter/sort by lifecycle type
- Manual override available (admin only)

**AI Readiness:**
- Stage 2: AI adjusts forecast confidence based on lifecycle
- Stage 3: Auto-apply lifecycle-specific replenishment rules

### 3.2 Editable Data (User Input)
```
- Target Days of Supply (default: 90)
- Replenishment Plan Qty
- Shipping Method
- Priority Level
- Notes
```

### 3.3 Promo Handling
**Promo is NOT a mode** — it's a **Forecast influencer**:
```json
{
  "promoTitle": "Black Friday 2025",
  "promoForecastQty": 5000,
  "promoStartDate": "2025-11-25",
  "promoEndDate": "2025-11-30"
}
```

---

## 4. Main Table Structure

### 4.1 Replenishment Overview Table
Each row = 1 SKU

| Column | Type | Source | Editable |
|--------|------|--------|----------|
| SKU | String | Master Data | ❌ |
| Lifecycle Type | Enum | System | ⚠️ Admin Override |
| Product Name | String | Master Data | ❌ |
| Current Inventory | Integer | WMS | ❌ |
| Avg Daily Sales (30d) | Float | Sales Data | ❌ |
| Forecast (Next 90d) | Integer | Forecast Engine | ⚠️ Manual Override |
| Days of Supply | Float | Calculated | ❌ |
| On the Way | Integer | Logistics | ❌ |
| Suggested Replenishment | Integer | Calculated | ❌ |
| Planned Replenishment | Integer | User Input | ✅ |
| Status | Enum | System | ❌ |

### 4.2 Calculation Logic

#### Days of Supply
```
Days of Supply = (Current Inventory + On the Way) / Avg Daily Sales
```

#### Suggested Replenishment
```
Target Inventory = Avg Daily Sales × Target Days of Supply
Suggested Replenishment = MAX(0, Target Inventory - Current Inventory - On the Way)
```

---

## 5. SKU Detail (Expandable Layer)

When user clicks a SKU row, expand to show:

### 5.1 Detail Sections
1. **Sales Trend Chart** (last 90 days)
2. **Forecast Breakdown** (with promo impact)
3. **Existing Replenishment Plans** (list of 1~N plans)
4. **Create New Plan** (button)

### 5.2 Forecast Breakdown Example
```
Base Forecast: 3000 units
+ Promo Impact (Black Friday): +2000 units
= Total Forecast: 5000 units
```

---

## 6. Replenishment Plan Data Structure

### 6.1 Plan Schema
```json
{
  "planId": "uuid",
  "batchId": "batch-2025-01-15-001",
  "sku": "KM-001",
  "country": "US",
  "marketplace": "Amazon",
  "qty": 1000,
  "shippingMethod": "Air Freight",
  "priority": "High",
  "estimatedArrival": "2025-02-15",
  "notes": "Rush order for promo",
  "status": "Draft",
  "createdBy": "user@example.com",
  "createdAt": "2025-01-15T10:00:00Z"
}
```

### 6.1.1 Draft Batch Concept
**Purpose:** Group multiple plans for bulk operations and AI batch processing.

**Batch Schema:**
```json
{
  "batchId": "batch-2025-01-15-001",
  "batchName": "Q1 2025 Replenishment",
  "country": "US",
  "marketplace": "Amazon",
  "planCount": 25,
  "totalQty": 50000,
  "status": "Draft",
  "createdBy": "user@example.com",
  "createdAt": "2025-01-15T10:00:00Z",
  "submittedAt": null
}
```

**Stage 1 Usage:**
- User creates plans individually or in bulk
- Plans auto-assigned to current draft batch
- Submit entire batch at once (atomic operation)

**AI Readiness:**
- Stage 2: AI suggests optimal batch composition (cost/urgency balance)
- Stage 3: AI auto-creates batches based on:
  - Shipping cost optimization
  - Container utilization
  - Supplier lead times
  - Cross-SKU dependencies

### 6.2 Shipping Methods
- Air Freight
- Sea Freight
- Express
- Truck (Domestic)

### 6.3 Plan Status Flow
```
Draft → Submitted → Approved → In Transit → Delivered
```

---

## 7. User Flow

### 7.1 Main Flow
```
1. Select Country (e.g., US)
   ↓
2. Select Marketplace (e.g., Amazon)
   ↓
3. Set Target Days of Supply (default: 90)
   ↓
4. System displays Replenishment Overview Table
   ↓
5. User reviews Suggested Replenishment
   ↓
6. User clicks SKU to expand details
   ↓
7. User creates 1~N Replenishment Plans
   ↓
8. User submits plans as Shipping Drafts
```

### 7.2 Multi-Plan Scenario
**Example:** SKU-001 needs 5000 units
- Plan 1: 3000 units via Sea Freight (cheaper, slower)
- Plan 2: 2000 units via Air Freight (urgent, expensive)

---

## 8. Stage 2 & Stage 3 Preparation

### 8.1 AI Integration Points (Stage 2)
Replace manual calculations with AI models:
- **Forecast Engine:** ML-based demand prediction
- **Suggested Replenishment:** AI considers seasonality, promo, trends
- **Shipping Method Recommendation:** Cost vs. urgency optimization
- **Lifecycle-Aware Forecasting:** Different models for New/Mature/Phasing Out SKUs
- **Batch Optimization:** AI suggests optimal plan grouping

### 8.2 Auto-Planning (Stage 3)
- System auto-creates replenishment plans
- Human approval required before submission
- Exception handling for anomalies
- **Batch Auto-Creation:** AI groups plans by shipping route, cost, urgency
- **Lifecycle-Based Rules:** Auto-apply conservative/aggressive strategies

### 8.3 Data Requirements for AI
- Historical sales (2+ years)
- Promo calendar
- Seasonality patterns
- Lead time data
- Cost data (shipping, storage)
- **SKU lifecycle history** (launch dates, phase-out dates)
- **Batch performance data** (cost efficiency, delivery accuracy)

---

## 9. Technical Constraints

### 9.1 Performance
- Table must load <2s for 1000 SKUs
- Real-time calculation on Target Days change

### 9.2 Data Refresh
- Inventory: Every 1 hour
- Sales: Daily
- Forecast: Weekly

### 9.3 Promo Handling
- Promo is a **Forecast modifier**, not a separate mode
- Promo data stored in Forecast table with metadata

---

## 10. UI/UX Requirements

### 10.1 Main Table
- Sortable by all columns
- Filterable by Status, Category
- Expandable rows for SKU details

### 10.2 SKU Detail Panel
- Collapsible sections
- Inline plan creation
- Visual forecast breakdown

### 10.3 Bulk Actions
- Select multiple SKUs
- Batch create plans with same shipping method

---

## 11. API Endpoints (Stage 1)

### 11.1 Read Operations
```
GET /api/replenishment?country={country}&marketplace={marketplace}
GET /api/sku/{sku}/details
GET /api/sku/{sku}/plans
GET /api/batch/{batchId}
GET /api/batches?status={status}
```

### 11.2 Write Operations
```
POST /api/replenishment/plan
PUT /api/replenishment/plan/{planId}
DELETE /api/replenishment/plan/{planId}
POST /api/batch/create
POST /api/batch/{batchId}/submit
DELETE /api/batch/{batchId}
```

---

## 12. Success Metrics

### 12.1 Stage 1 KPIs
- Time to create replenishment plan: <5 min per SKU
- Plan accuracy: 90%+ (actual vs. planned)
- User adoption: 80%+ of planners use system

### 12.2 Future KPIs (Stage 2/3)
- AI suggestion acceptance rate: >70%
- Stockout reduction: 30%
- Overstock reduction: 20%

---

## Appendix A: Glossary

- **Days of Supply:** How many days current inventory can cover based on sales velocity
- **On the Way:** Inventory in transit (not yet in warehouse)
- **Suggested Replenishment:** System-calculated recommended order quantity
- **Shipping Draft:** Preliminary shipping plan (not yet executed)
- **Draft Batch:** Collection of replenishment plans grouped for bulk submission
- **SKU Lifecycle Type:** Classification of product maturity stage (New/Mature/Phasing Out)

---

## Appendix B: Future Enhancements

- Multi-warehouse support
- Cross-marketplace optimization
- Dynamic safety stock calculation
- Supplier lead time integration
- Cost optimization engine
