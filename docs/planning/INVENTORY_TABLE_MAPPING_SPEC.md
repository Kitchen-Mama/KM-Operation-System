# Inventory Table Mapping Spec (Inventory Replenishment / 貨物庫存表)

**Status:** 🟢 v1.3 — Inventory Table Mapping **finalized** (Spec only — formulas owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`)
**Last Updated:** 2026-06-29
**Maintained By:** Development Team
**Authority / context (read, not overridden):** [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) (**authoritative for all formulas**), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`](./AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md), [`SYSTEM_RUNTIME_ARCHITECTURE.md`](./SYSTEM_RUNTIME_ARCHITECTURE.md).

> **Mapping + finalized rules.** This defines how the Inventory Replenishment main table (貨物庫存表) maps to data sources, the finalized AI-suggestion / replenishment direction, the Overseas Shared Inventory Allocation rule, and the Marketplace Fulfillment Model flow. It is **not** the final frontend and **not** the calculation engine code. Where this and a domain spec differ, the **domain spec wins** (formulas live in `SUPPLY_PLANNING_CALCULATION_RULES.md`).

> **Changelog v1.2 → v1.3:**
> - **Avg Sales/Day is no longer always `sales_units_7d ÷ 7`.** It now uses **`normalized_avg_sales_per_day`** (30-day daily-sales window excluding event/promotion days) when event/promotion contamination exists and enough normal days are available; otherwise it falls back to `sales_units_7d ÷ 7` (per `SUPPLY_PLANNING_CALCULATION_RULES.md` §22). **Sales Trend still shows the Past 7 complete days** — only the Avg Sales *calculation* may use the 30-day normalization (§8, §13).
>
> **Changelog v1.1 → v1.2:**
> - §5 Long Term Storage: kept the finalized Over 180+ formula and added the **report-version compatibility note** — `inv_age_365_plus_days` is the backward-compatible fallback for older Amazon reports, while `inv_age_366_to_455_days` / `inv_age_456_plus_days` are preferred when available. The importer now maps these buckets via `optionalFieldMap` (missing → blank/0, never fails the import).
>
> **Changelog v1.0 → v1.1:**
> - Added the **Special Event Preparation-Date rule** (§8.1): an event is bucketed by `Preparation Date = Event Start Date − 30 days`, not by the event date itself; all Need buckets (0–18 / 19–30 / 31–45 / 46–90) are judged against the Preparation Date; each event is counted once (no repeated accumulation).
>
> **Changelog v0.2 → v1.0:**
> - Filter scope finalized to **Company + Country + Marketplace** (Company added).
> - Stock Card mapping finalized (incl. **Unsellable** = `amazon_inventory_snapshot.unfulfillable_qty`).
> - Long Term Storage **Over 180+** finalized to sum `181_270 + 271_365 + 366_455 + 456_plus`.
> - Sales Trend finalized to **Past 7 Days** (previous 7 complete days, exclude today) + Apps Script requirement stated.
> - Added **First Layer Summary Mapping** (Current Stock / On The Way / 3rd Party Stock / Avg Sales per Day / 60 Days FC / Upcoming Event / Days of Supply / Suggested Qty / Factory CN / Factory TW).
> - **Sales Driven** algorithm replaced with cumulative incremental-bucket logic (count-once events, deduct-once on-the-way).
> - **Forecast Driven** finalized with Safety Days **30**.
> - Added **Overseas Shared Inventory Allocation** chapter (7 rules) — now official Supply Planning rule.
> - Added **Marketplace Fulfillment Model UI Flow** (platform_fulfilled / self_fulfilled / hybrid).

---

## 1. Positioning

- The Inventory Table is the **first operational view** for Supply Planning.
- It **reads** from: Amazon snapshots (`amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_daily_sales_snapshot`, `amazon_weekly_sales_snapshot`), FC forecast tables (`fc_regular_forecast`, `fc_target_rules`, `fc_special_events`), `warehouses` + `overseas_inventory_snapshot`, `factory_stock`, and shipment / on-the-way data.
- It must **always be scoped by Company + Country + Marketplace**.
- **Never aggregate** stock or sales across all marketplaces unless a future spec explicitly requests it.

---

## 2. Filter scope (mandatory)

- **Company + Country + Marketplace are mandatory runtime filters.**
- Only the **selected marketplace's data** is displayed. **Never aggregate all marketplaces together.**
- All stock, sales, forecast, long-term-storage, event, shipment, allocation, and recommendation logic must be computed **within the selected Company + Country + Marketplace**.
- **SKU is already the unique key inside the table** (display grain = SKU). SKU and Status are already wired and out of scope for this mapping.

---

## 3. Database sync — overseas inventory (current DB structure)

These tables have **already been updated in the DB**. Documented for mapping reference. **No schema change is proposed by this spec.**

### 3.1 `overseas_inventory_snapshot` (current columns)

```
overseas_inventory_id, snapshot_date, warehouse_id, sku, site_sku,
physical_stock, available_stock, reserved_stock, damaged_stock,
on_the_way_qty, on_the_way_eta, on_the_way_bucket,
last_movement_at, updated_by, created_at, updated_at, note
```

**Stock definitions (authoritative for warehouse-side inventory):**
- `physical_stock` = physical warehouse inventory (on-hand).
- `reserved_stock` = reserved by planning / allocation.
- `damaged_stock` = unsellable / damaged at the warehouse.
- `available_stock` = `physical_stock − reserved_stock − damaged_stock`.
- `on_the_way_qty` / `on_the_way_eta` / `on_the_way_bucket` = inbound-to-warehouse quantity, its ETA, and the ETA bucket — the **warehouse-side On-the-Way source** used by the Sales Driven shipment deduction (§14).

> `overseas_inventory_snapshot` is **warehouse-side** inventory (3PL / overseas warehouse), **not** Amazon FBA stock and **not** factory stock. Amazon FBA stock comes from `amazon_inventory_snapshot` (§4); factory stock from `factory_stock` (§13).

### 3.2 `overseas_inventory_movements` (movement ledger — future reservation control)

```
movement_id, movement_date, warehouse_id, sku, site_sku,
movement_type, movement_scope, from_stock_type, to_stock_type,
quantity, quantity_before, quantity_after,
before_physical_stock, after_physical_stock,
before_reserved_stock, after_reserved_stock,
before_available_stock, after_available_stock,
reference_type, reference_id, source_module, created_by, created_at, note
```

- Records each movement and the **before/after balances per stock type** (physical / reserved / available); `movement_scope` classifies the movement domain.
- `from_stock_type → to_stock_type` models transitions such as `available → reserved` (allocation hold) and `reserved → available` (release).
- **Future reservation control:** this ledger is the intended mechanism to make `reserved_stock` auditable so allocation/planning can place and release holds. **No reservation logic / write path / UI is implemented or implied here.**

---

## 4. Stock Card Mapping

Scope: selected Company + Country + Marketplace, per SKU. Source: `amazon_inventory_snapshot`.

| UI field | Source |
|----------|--------|
| **Available** | `amazon_inventory_snapshot.available_qty` |
| **FC Transfer** | `amazon_inventory_snapshot.fc_transfer_qty` |
| **FC Processing** | `amazon_inventory_snapshot.fc_processing_qty` |
| **Customer Orders** | `amazon_inventory_snapshot.customer_order_qty` |
| **Unsellable** | `amazon_inventory_snapshot.unfulfillable_qty` (field already exists in DB) |

---

## 5. Long Term Storage

Scope: selected Company + Country + Marketplace, per SKU. Source: `amazon_inventory_health_snapshot`.
Purpose: identify **slow-moving inventory** for promotion / discount / ad actions.

| UI field | Meaning | Source |
|----------|---------|--------|
| **Over 90+** | stock aged **91–180 days** | `amazon_inventory_health_snapshot.inv_age_91_to_180_days` |
| **Over 180+** | stock aged **above 180 days** | sum of the buckets below |

**Over 180+ (finalized):**
```
Over 180+ = inv_age_181_to_270_days
          + inv_age_271_to_365_days
          + inv_age_366_to_455_days
          + inv_age_456_plus_days
```

> **Report-version compatibility (importer optional buckets).** Amazon Inventory Health reports differ by marketplace / report version. The importer now treats the variable age buckets as **optional** (`optionalFieldMap`, per [`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`](./AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md) §7.2 / §9.1): a missing bucket maps to **blank (0 in the sum)** and never fails the import.
> - **`inv_age_366_to_455_days` + `inv_age_456_plus_days` are preferred** when the source provides them (finer detail).
> - **`inv_age_365_plus_days` is the backward-compatible fallback** for older Amazon report versions that only expose a single `365+` top bucket. When present it represents all stock >365 days; when the finer buckets are present instead, it is blank/0.
> - Because the buckets are mutually exclusive per report version, the finalized sum stays correct whichever set the source supplies (absent buckets contribute 0). The Inventory Table reads whatever the snapshot holds — no Inventory-Table change is implied here.

---

## 6. Sales Trend — Past 7 Days

- **Display:** **Past 7 Days** (no longer 4 days). Show each day's sales individually.
- **Source:** `amazon_daily_sales_snapshot.sales_units`.
- **Filter:** Company + Country + Marketplace + SKU.

**Apps Script note:** the Daily Sales snapshot now imports the **previous 30 complete days, excluding today** (`06_amazon_import_config.gs`: `lookbackDays: 30`, `excludeToday: true`). This single snapshot serves **two** purposes:
- **Sales Trend display = the most recent 7 complete days** (unchanged — show each of the last 7 completed `snapshot_date` rows, excluding today).
- **Avg Sales/Day calculation may use the full 30 completed days** for event/promotion normalization (§13; `SUPPLY_PLANNING_CALCULATION_RULES.md` §22).

> **Trend vs Avg Sales are separate:** the trend chart stays at 7 days; the wider 30-day window exists only to compute a clean Avg Sales/Day baseline. No new `amazon_daily_sales_snapshot` column and no BigQuery schema change.

---

## 7. Forecast Breakdown — Next 3 Months

- **Display:** the **next 3 months** of forecast; show **each month** and the **total**.
- **Source:** `fc_regular_forecast`.
- **Target Rules must already be applied before display.**

**Target Rule Priority (only ONE rule may apply): SKU > Series > Category**
- If a **SKU-level** rule exists → use it.
- Else if a **Series-level** rule exists → use it.
- Else if a **Category-level** rule exists → use it.
- The lower-priority level applies **only when** the higher level does not exist. **Never stack** SKU + Series + Category.

> Target-rule math is owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`; this spec fixes the **resolution priority** and the display window.

---

## 8. Upcoming Event — Next 3 Months

- **Source:** `fc_special_events`.
- **Display window:** next 3 months only.
- **Display fields:** Event Name · Period · FC Qty · **Total Event Qty**.
- **Each event counts once** for AI Suggestion (§14) — never double-count one event across multiple Need buckets.

### 8.1 Special Event Preparation-Date Rule (authoritative)

Event demand must be prepared **before** the event begins, so an event is **not** placed in a Need bucket by its event date — it is placed by its **Preparation Date**:

```
Preparation Date = Event Start Date − 30 days
```

- **All Need buckets (0–18 / 19–30 / 31–45 / 46–90) are judged against the Preparation Date**, not the event start/end date. The bucket is the one whose day-window (counted from today) contains the Preparation Date.
- **Each event is counted once.** An event contributes its `fc_qty` to exactly one Need bucket (the one its Preparation Date falls into) and **must not be accumulated again** in any other bucket or in a later recalculation pass.
- If the Preparation Date is already in the past (event imminent), the event falls into the earliest bucket (0–18d).
- This rule supersedes the previous "attribute by event period" wording in §14 and is the authoritative event-timing rule for both the Sales Driven and Forecast Driven engines.

> Example: an event starting **Aug 15** has Preparation Date **Jul 16**. If today is **Jul 1**, the Preparation Date is 15 days out → it lands in the **0–18d** bucket (not by the Aug 15 event date).

---

## 9. Shipping Shipment

- **Still pending — no mapping yet. Placeholder retained.**
- Future mapping to shipment / On-the-Way modules per [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) (`shipments` + `shipment_lines` + ETA) and warehouse-side `overseas_inventory_snapshot.on_the_way_*`.

---

## 10. Achievement Rate

- **Pending.** Will depend on the future Monthly Sales BigQuery summary (see §21).

---

## 11. AI Suggestion columns (display)

Old display replaced. New layout (incremental, non-overlapping windows):

| UI column | Meaning |
|-----------|---------|
| **Need 0–18d** | net incremental qty needed to cover demand within the next 0–18 days |
| **Need 19–30d** | net incremental qty needed to cover the 19–30 day window |
| **Need 31–45d** | net incremental qty needed to cover the 31–45 day window |
| **Need 46–90d** | net incremental qty needed to cover the 46–90 day window |
| **Suggested Qty** | final remaining demand after Current Stock, On-the-Way, and Upcoming Event are processed |

- Each Need bucket has a **minimum value of 0**.
- Which engine fills the buckets depends on the SKU's `replenishment_model` (and fulfillment model): **Sales Driven** (§14) or **Forecast Driven** (§15).

---

## 12. Days of Supply — UI color rule

| Days of Supply | Color | Meaning |
|----------------|-------|---------|
| **< 30** | 🔴 Red | low coverage — needs action |
| **30 – 150** | Normal | healthy coverage |
| **> 150** | 🟤 Khaki / Brown | long inventory warning (potential overstock) |

These are **UI display thresholds only**; the Days of Supply value is computed per §13 / the calculation engine.

---

## 13. First Layer Summary Mapping

Top-level per-SKU summary row (scope: selected Company + Country + Marketplace).

| Summary field | Definition / source |
|---------------|---------------------|
| **Current Stock** | `Available + FC Transfer + FC Processing` (from `amazon_inventory_snapshot`) |
| **On The Way** | Shipping Shipment Total — **pending implementation** (§9) |
| **3rd Party Stock** | total **available stock** across eligible Overseas Warehouses (`overseas_inventory_snapshot.available_stock`, eligible warehouses only — see §16) |
| **Avg Sales / Day** | **Primary:** `normalized_avg_sales_per_day` (30-day daily-sales window, event/promotion days excluded) when contamination exists and enough normal days are available; **Fallback:** `amazon_weekly_sales_snapshot.sales_units_7d ÷ 7`. **Rounded to 1 decimal.** This Avg Sales is a **Runtime calculation result** (not persisted); the adopted **source** + **warning** are frozen only at Submit Plan. Per `SUPPLY_PLANNING_CALCULATION_RULES.md` §22 (§22.6 runtime rule). |
| **60 Days FC** | `Forecast Month+1 + Forecast Month+2` (**Target Rule already applied**, §7) |
| **Upcoming Event** | Total Event FC (`fc_special_events`, §8) |
| **Days of Supply** | `Current Stock ÷ Avg Sales per Day` (UI color per §12) |
| **Suggested Qty** | output from AI Suggestion (§14 / §15) |
| **Factory CN** | `factory_stock.current_stock` where the warehouse resolves to a **CN** factory (`warehouses.country = CN`, `is_factory_warehouse = TRUE`) |
| **Factory TW** | `factory_stock.current_stock` where the warehouse resolves to a **TW** factory (`warehouses.country = TW`, `is_factory_warehouse = TRUE`) |

> `factory_stock` has no `company` / `factory_name`; CN/TW factory is resolved via `warehouse_id → warehouses` (per `SHIPMENT_CENTER_SPEC.md` §0). Factory stock is **physical, shared** stock (display only; not deducted here).

---

## 14. Sales Driven Calculation (replaces old algorithm)

> **Direction / intent — final math owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`.**

**Need is cumulative across time buckets:** `0–18`, `19–30`, `31–45`, `46–90`. Each bucket calculates **only incremental demand** for its window.

### 14.1 Count-once / deduct-once rules (must hold)

- **Upcoming Events:** each event may be counted **once only** — never double-count. An event is attributed to the single Need bucket whose window contains its **Preparation Date = Event Start Date − 30 days** (see §8.1), not its event date.
- **On-the-Way shipments:** shipment quantity **must also be deducted** from Need, and a given shipment quantity **can only be deducted once** — never double-deduct. Earlier-arriving shipments offset the earliest unmet demand first (FIFO by ETA bucket).

### 14.2 Bucket logic

```
For each bucket (0–18 → 19–30 → 31–45 → 46–90), in order:

  Incremental Demand[b]  = base sales demand within bucket b's window only
  Event[b]               = event FC whose period falls in bucket b   (count once)
  Shipment[b]            = remaining on-the-way qty arriving within bucket b
                           (FIFO; not already consumed by an earlier bucket — deduct once)

  Need[b] = max(0, Incremental Demand[b] + Event[b] − Shipment[b]
                   − stock still available after earlier buckets )
```

- **Current Stock**, **On-the-Way**, and **Upcoming Event** are applied cumulatively across buckets so nothing is counted/deducted twice.

### 14.3 Suggested Qty

```
Suggested Qty = final remaining demand AFTER
                Current Stock, On-the-Way, and Upcoming Event have all been processed
Minimum value = 0.
```

> Equivalent roll-up view: `Suggested Qty = Need 0–18d + Need 19–30d + Need 31–45d + Need 46–90d` (each floored at 0). The authoritative ordering of stock vs on-the-way vs event consumption is owned by `SUPPLY_PLANNING_CALCULATION_RULES.md` §20.

---

## 15. Forecast Driven Calculation (finalized)

> **Direction / intent — final math owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`.** Safety Days updated to **30**.

```
Suggested Qty = max(0,
                  Forecast Month+1
                + Forecast Month+2
                + Safety Stock                 (Safety Days = 30 × daily demand)
                − Current Stock
                − Qualified On-the-Way )

Target Rule must already be applied to the forecast (SKU > Series > Category, §7).
Minimum value = 0.
```

Where:
- **Forecast Month+1 / Month+2** = target-adjusted regular forecast for the next two months.
- **Safety Stock** = 30 days of demand (Safety Days = 30).
- **Current Stock** = on-hand sellable for the scope (per the engine spec).
- **Qualified On-the-Way** = incoming shipment qty that qualifies for the coverage window.

---

## 16. Overseas Shared Inventory Allocation (official Supply Planning rule)

This chapter is the **official Supply Planning allocation rule**. The calculation-engine form lives in `SUPPLY_PLANNING_CALCULATION_RULES.md` §20.

**Rule 1 — Allocation Scope.** Allocate inventory **only within the same Company and same Country**. **Never** allocate across companies or across countries.

**Rule 2 — Platform Fulfilled.** **No shared allocation.** Inventory belongs to the platform (e.g. Amazon FBA). It is not pooled into shared overseas allocation.

**Rule 3 — Self Fulfilled.** Uses **shared overseas inventory**; allocation is **required**.

**Rule 4 — Hybrid.** Display **Platform Inventory** and **3rd Party Inventory** — **both sections remain visible**. The **Marketplace SKU's fulfillment model decides** the final fulfillment behavior.

**Rule 5 — Minimum Survival Stock = 18 Days (highest priority).** Every eligible Self-Fulfilled site must **first** receive enough inventory to **survive 18 days**. Only the **remaining** inventory continues to further allocation.

**Rule 6 — Allocation Priority.** After all sites reach the 18-day survival stock, remaining inventory is allocated by **`marketplaces.allocation_priority`** — **higher number = higher priority**. Editable by PM.

**Rule 7 — Future Shared Allocation.** `allocation_priority` becomes the **system-wide shared allocation rule**; future **Factory Allocation**, **Shipping Allocation**, and **Carrier Capacity** may reuse this same priority.

---

## 17. Marketplace Fulfillment Model & UI Flow

### 17.1 Fulfillment model values

`platform_fulfilled` · `self_fulfilled` · `hybrid` (stored on `marketplaces.fulfillment_model`; SKU-level override on `marketplace_skus.fulfillment_model`).

### 17.2 Add Marketplace

- Must choose a **Fulfillment Model**: `platform_fulfilled` / `self_fulfilled` / `hybrid`.

### 17.3 Add SKU

- If the marketplace is **Platform** → the SKU Fulfillment Model field is **locked** (to `platform_fulfilled`).
- If the marketplace is **Self** → the SKU Fulfillment Model field is **locked** (to `self_fulfilled`).
- If the marketplace is **Hybrid** → the **PM must select** the SKU Fulfillment Model.

### 17.4 Inventory UI behavior

- **Platform** → display the Platform Inventory layout.
- **Self** → hide the Platform Stock Card; **3rd Party Inventory becomes the primary inventory**.
- **Hybrid** → display **both** Platform and 3rd Party inventory.

---

## 18. Mixed Carton — future extension

- The DB now contains **`mixed_carton_rules`** (newly added table).
- **Current version: Future Extension only — NO implementation.** No mapping / formula / write path / UI is defined here.

---

## 19. DB / Runtime impact

- **No DB schema change, no frontend, no Apps Script, no BigQuery, no API** is implemented by this spec task.
- **Newest DB structures referenced** (synced in `DATABASE_RELATIONSHIP_MAP.md`): `marketplaces.fulfillment_model`, `marketplaces.allocation_priority`, `marketplace_skus.fulfillment_model`, `overseas_inventory_snapshot` (physical/available/reserved/damaged/on_the_way_*), `overseas_inventory_movements` (movement_scope + before/after per stock type), `mixed_carton_rules`.
- **Existing fields/tables referenced:** `amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_daily_sales_snapshot`, `amazon_weekly_sales_snapshot`, `fc_regular_forecast`, `fc_target_rules`, `fc_special_events`, `warehouses`, `factory_stock`.

---

## 20. Monthly Sales Summary — future design note

- **Preferred source:** a future BigQuery table **`AmazonSales.amazon_monthly_sales_summary`**, generated from `Raw Daily Sales` by a scheduled query.
- Deferred because Amazon data may be delayed / corrected / backfilled. A future spec must define: monthly close date, refresh window, prior-month recalculation, append-vs-MERGE, and whether a Google Sheet snapshot is needed for frontend speed.
- **Achievement Rate (§10) depends on this.**

---

## 21. Open Questions

- **Inventory-health finer buckets (§5):** confirm `inv_age_366_to_455_days` / `inv_age_456_plus_days` are added to the Amazon Inventory Health source + import mapping to feed the finalized Over 180+ formula.
- **Shipping Shipment / On-the-Way (§9, §13):** finalize the shipment source mapping and reconcile warehouse-side `overseas_inventory_snapshot.on_the_way_*` with marketplace-level `shipments` to avoid double-counting.
- **Demand run-rate window (§14):** confirm which daily/weekly sales window drives Sales Driven base demand.
- **Event-to-bucket attribution (§8, §14):** confirm attribution by `event_period` start and handling of multi-bucket-spanning events (still count-once).
- **Current Stock definition (§15):** confirm Forecast Driven "Current Stock" source (FBA `available_qty` vs warehouse `available_stock` vs combined).
- **Eligible Overseas Warehouses (§13, §16):** confirm warehouse eligibility resolution for 3rd Party Stock and Self-Fulfilled allocation.
- **Allocation rounding (§16):** integer rounding / reconciliation vs physical available stock (aligns with `SHIPMENT_CENTER_SPEC.md` §19.1).
- **Monthly close / recalculation (§10, §20).**

---

**v1.0 — Inventory Table Mapping finalized. Mapping + rule direction only; no frontend, calculation-engine code, Apps Script, BigQuery, API, or DB change is implied. All formulas remain owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`.**

**End of Document**
