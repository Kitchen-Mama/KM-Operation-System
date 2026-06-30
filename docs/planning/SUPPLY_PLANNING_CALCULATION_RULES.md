# Supply Planning Calculation Rules

**Status:** 🟢 Draft v3.3 — Calculation Specification (NOT implementation)
**Last Updated:** 2026-06-29
**Maintained By:** Development Team
**Related:** [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md) (operational flow), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) (table relationships), [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md) (Inventory Table mapping + AI Suggestion display), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md)

> **Changelog v1 → v2:** Added Document Scope, Company/Ownership context, explicit Inventory Sources, Target Days logic, carton rounding, Request Order role, Inventory Replenishment vs Request Order distinction, validation rules, and expanded current/future month projection with on-the-way and pull-forward special-event terms. Sign convention now explicit in the source formulas.
>
> **Changelog v3.2 → v3.3:** Normalized Avg Sales architecture alignment (no logic change): (1) added §22.6 **Runtime Calculation Rule** — `normalized_avg_sales_per_day` is a **Runtime result, not a DB column**; persisted only at Submit Plan into `shipping_plan_lines.snapshot_avg_sales_per_day`. (2) Renamed the Avg-Sales method/source snapshot field to **`snapshot_avg_sales_source`** (records the *source* of the Avg Sales basis, not an algorithm). (3) Defined `snapshot_avg_sales_source` as a fixed enum (`weekly_7d`, `normalized_30d`, `manual_override`, `forecast_override`, `ai_adjusted`; runtime uses the first two, rest Future Extension). (4) **Fully decoupled Source from Warning** — removed combined tokens (`normalized_30d_low_sample`, `weekly_7d_fallback_insufficient_normal_days`); §22.3 fallback ladder now sets `source` + `warning` independently.
>
> **Changelog v3.1 → v3.2:** Added the **Normalized Avg Sales / Day Rule** (§22) — when a SKU had a Special Event / Campaign / Deal day in the recent window, Avg Sales/Day is computed from `amazon_daily_sales_snapshot` over the **latest 30 completed days excluding today**, **excluding** event/promotion days, instead of `sales_units_7d ÷ 7`. Includes the normal-day fallback ladder (≥7 normal days → normalized; 3–6 → normalized + `low_sample_warning`; <3 → weekly fallback + `insufficient_normal_days`) and the Forecast-Driven note. Requires the Daily Sales snapshot window to be 30 completed days (see `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`).
>
> **Changelog v3 → v3.1:** Added the **Supply Planning Optimization Goal** (§21) — the system default objective and its priority order (Supply Safety → Lowest Logistics Cost → Minimum Number of Shipments → Container Utilization), the slowest-first / 45-day-sea-freight default, and the rule that faster logistics is only escalated when the 18-day Minimum Survival Stock cannot otherwise be met (never default to air).
>
> **Changelog v2 → v3:** Added the **Overseas Shared Inventory Allocation Engine** (§20) — allocation scope (same company + same country), 18-day minimum survival stock (highest priority), `allocation_priority`-based distribution, Platform vs Self vs Hybrid behavior, the Sales-Driven / Forecast-Driven Need calculation alignment (Safety Days = 30), and the future Shipping/Factory/Carrier allocation extension. Synchronizes the finalized Inventory Table rules from `INVENTORY_TABLE_MAPPING_SPEC.md` v1.0.

---

## 1. Document Scope

This document defines **calculation rules only** — the math for forecast projection, shortage/surplus, reallocation, and order need.

- **Operational flow** (pages, steps, approvals, persistence) is defined in [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md).
- **Table relationships** (FKs, layers, page-to-table map) are defined in [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md).

No code. No DB schema. No implementation.

> **Notation:** Formulas express business intent. Supply/inventory terms are **added** (`+`); demand/forecast consumption terms are **subtracted** (`−`). A *Projected Balance* is a net position: `> 0` surplus, `< 0` shortage.

---

## 2. Core Calculation Layers

Two **independent** layers — do not collapse them:

| Layer | Name | Purpose | Output |
|-------|------|---------|--------|
| **Layer A** | Forecast / Inventory Projection | Month-by-month projected balance per company × marketplace × SKU | Shortage / Surplus |
| **Layer B** | Order Planning / Reallocation | Net company surpluses against shortages → real order need | Order Need |

**Core rule: Forecast shortage does NOT directly equal order quantity.** Order quantity is derived only after company-level surplus reallocation (Layer B).

```
Layer A (Projection) → shortage/surplus per company
        ↓
Layer B (Reallocation → Order Need) → order quantity
        ↓
Request Order / PO
```

---

## 3. Company and Ownership Context

**Companies:** `KM`, `ResUS`, `ResTW`.

**Ownership model:**
```
Factory → ResTW → KM / ResUS / ResTW → Customer
```

**Planning rule:**
- **Company is required** for `marketplace_skus` and forecast planning.
- **Country alone is not sufficient** — e.g. US can include both `KM` and `ResUS`. Operational ownership is keyed by `company + country + marketplace`.

---

## 4. Inventory Sources

Supply-side inputs to projection:

| Source | Definition | Table |
|--------|------------|-------|
| Marketplace inventory | Sellable stock at the marketplace | *future* marketplace inventory snapshot |
| Marketplace on-the-way | Inbound to marketplace | shipments + lines + eta |
| Overseas warehouse inventory | 3PL / overseas warehouse on-hand | `overseas_inventory_snapshot` |
| Overseas warehouse on-the-way | Inbound to overseas warehouse | shipments + lines + eta |
| Factory stock | Production-side on-hand (shared pool) | `factory_stock` |
| Completed / incoming production orders | Production arriving from POs | `purchase_orders` / `purchase_order_lines` / `production_schedule` |
| Shipment on-the-way | In-transit shipments by ETA | `shipments` + `shipment_lines` + eta |

**Clarifications:**
- `factory_stock` = **production-side** inventory.
- `overseas_inventory_snapshot` = **warehouse-side** inventory.
- `shipments` + `shipment_lines` + ETA = **on-the-way** source.
- **Shipping Allocation preview is NOT persisted in MVP** (no `shipping_allocation` DB).

---

## 5. Forecast Inputs

| Input | Table | Rule |
|-------|-------|------|
| Regular Forecast | `fc_regular_forecast` | Can be adjusted by target rules |
| Special Event Forecast | `fc_special_events` | Always 100%; not affected by target rules |
| Target Rules | `fc_target_rules` | Adjust Regular FC only; default 100% |

- **Regular FC** can be adjusted by target rules.
- **Default target rule = 100%.**
- **Special Event FC is always 100%** and **not affected by target rules**.

---

## 6. Target Days Logic

**Target Days** comes from the Inventory Replenishment page — user-selected planning coverage in days. **Default = 90 days.**

```
Required Coverage Demand = Target Days × Avg Sales Per Day
```

- Used for **Inventory Replenishment suggestions** (operational replenishment to a site).
- **Not necessarily the same** as the monthly Request Order projection (which uses month-by-month forecast, not a flat coverage window).

---

## 7. FC Share Logic

Used to allocate the **shared factory stock pool** fairly across SKUs / companies.

```
Company Total FC = Σ (all marketplace-SKU forecast under the same company)

SKU FC Share = Marketplace SKU FC ÷ Company Total FC
```

- **Current business rule:** use a **rolling future 4-month FC window** for FC share.
- **Purpose:** allocate shared factory stock based on expected near-term demand → produces *Allocated Factory Stock* used in projection.

**Example (one company, rolling 4-month FC):**

| Marketplace SKU | Rolling 4-mo FC | FC Share | Factory pool 500 → allocated |
|-----------------|-----------------|----------|------------------------------|
| Amazon US | 800 | 80% | 400 |
| Shopify US | 200 | 20% | 100 |
| **Total** | **1000** | **100%** | **500** |

---

## 8. Current Month Projection Logic

```
Current Month Projected Balance
  = Current Inventory
  + Allocated Factory Stock
  + Relevant On-The-Way Inventory
  − Remaining Days Demand
  − Next Month Target Adjusted Regular FC
  − Pull-Forward Special Event FC
```

Where:
```
Remaining Days Demand
  = Remaining Days In Current Month × Previous Month Avg Sales Per Day

Target Adjusted Regular FC
  = Regular FC × Target Rule %        (Default Target Rule = 100%)
```

> **Note:** This is a **supply planning projection**, not a pure month-end accounting inventory formula. The current (partial) month consumes the **run-rate** remaining-days demand plus the forward-looking obligations (next-month target FC and any pulled-forward event demand) that must be covered from current position.

**Example:**

| Term | Value |
|------|-------|
| Current Inventory | 1,200 |
| Allocated Factory Stock | 300 |
| Relevant On-The-Way | 200 |
| Remaining Days Demand (10 × 50) | 500 |
| Next Month Target Adj. Regular FC | 900 |
| Pull-Forward Special Event FC | 0 |
| **Projected Balance** | 1,200 + 300 + 200 − 500 − 900 − 0 = **300 (surplus)** |

---

## 9. Future Month Projection Logic

For future month **N**:
```
Projected Balance[N]
  = Projected Balance[N-1]
  + Completed Orders / Incoming Production assigned to month N-1
  + Relevant incoming shipment / on-the-way arrivals
  − Target Adjusted Regular FC[N]
  − Pull-Forward Special Event FC[N]
```

- **Recursive:** each future month starts from the **prior month's projected balance**.
- Inventory arriving (production completed in N-1, shipments arriving) **adds**; that month's forecast (regular adjusted + pulled-forward event) **subtracts**.

**Example:**

| Month | Opening | + Incoming | − Reg FC (adj) | − Event FC | Closing |
|-------|---------|-----------|----------------|-----------|---------|
| Current | — | — | — | — | 300 |
| N+1 | 300 | 0 | 1,000 | 0 | −700 (shortage) |
| N+2 | −700 | 1,500 | 1,000 | 0 | −200 (shortage) |

---

## 10. Special Event Pull-Forward Logic

Special Event FC is **pulled into the month before the event period** — inventory must be prepared and shipped before the event starts.

**Example:** Event in **October** → demand impacts the **September** projection.

| Event | Event Month | Impacts Projection Month |
|-------|-------------|--------------------------|
| Fall Prime | October | September |
| Prime Day | July | June |
| BFCM | November | October |
| Spring Deal | March | February |

Special Event FC:
- **always 100%**
- **not adjusted by target rules**
- **MVP pulls forward by the previous month**; a future v2+ may support **lead-time based pull-forward**.

---

## 11. Shortage and Surplus Definitions

```
Projected Balance < 0   →  Shortage = ABS(Projected Balance)
Projected Balance > 0   →  Surplus  = Projected Balance
Projected Balance = 0   →  No shortage and no surplus
```

| Projected Balance | Shortage | Surplus |
|-------------------|----------|---------|
| −300 | 300 | 0 |
| 0 | 0 | 0 |
| +1,000 | 0 | 1,000 |

---

## 12. Company Reallocation Logic

Before creating the final order need, pool shortage/surplus across `KM` / `ResUS` / `ResTW`:

```
Total Shortage = Σ max(0, −company_projected_balance)
Total Surplus  = Σ max(0,  company_projected_balance)

Net Order Need = max(0, Total Shortage − Total Surplus)
```

**Example:**

| Company | Position |
|---------|----------|
| KM | Shortage 1,000 |
| ResTW | Shortage 500 |
| ResUS | Surplus 1,200 |

```
Total Shortage = 1,000 + 500 = 1,500
Total Surplus  = 1,200
Net Order Need = max(0, 1,500 − 1,200) = 300
```

> **Important:** This reallocation happens **after** forecast/inventory projection (Layer A) and **before** the final order recommendation (Layer B).

---

## 13. Factory Shared Pool Logic

**Factories:** `CN_YOUXIN`, `TW_SHENGYI` — **shared production resources, not companies.**

- Factory stock can be used as a **shared pool** in planning.
- **Company restriction should NOT block shortage calculation** — the goal is to compute **real net shortage** accurately across the group.
- **Future option:** factory **priority rules** may control allocation preference, e.g. `TW_SHENGYI` preferred for ResUS shipments or for specific series.

---

## 14. Order Need and Carton Rounding

```
Order Need = max(0, Total Shortage − Total Surplus)

Recommended Order Qty = CEILING(Order Need ÷ Units Per Carton) × Units Per Carton
```

- **Units Per Carton source:** `sku_details`.
- If `units_per_carton` is missing → **flag as validation error or require manual review** (do not silently default).

**Example:** Order Need = 300, Units Per Carton = 40 → CEILING(300/40) × 40 = 8 × 40 = **320**.

---

## 15. Request Order / 下單系統 Role

**Inputs:** forecast, inventory, factory stock, overseas warehouse stock, shipment on-the-way, company reallocation, carton rounding.

**Outputs:**
- Recommended order need
- Editable user request qty
- *Future:* `purchase_orders` / `purchase_order_lines`
- *Future:* generated documents

> **Request Order is the bridge between planning calculation and procurement records.**

---

## 16. Inventory Replenishment vs Request Order

| Aspect | Inventory Replenishment | Request Order / 下單系統 |
|--------|--------------------------|---------------------------|
| Level | Operational replenishment to marketplace / warehouse | Group-level procurement planning |
| Inputs | Target Days, avg sales, site inventory, on-the-way, shipping allocation preview | Monthly projection, shortage/surplus, reallocation |
| Math | Required Coverage Demand (Target Days × avg sales) | Net Order Need (after reallocation) + carton rounding |
| Persists | `shipping_plans` only when user submits | *Future:* `purchase_orders` |
| Question answered | "What to ship to the site now?" | "What must the group actually produce/order?" |

---

## 17. Validation Rules (high level)

- Required SKU must exist in `sku_details`.
- Required marketplace SKU must map to `company / country / marketplace`.
- `units_per_carton` required for carton rounding (else error / manual review).
- Missing target rules default to **100%**.
- Missing special event FC means **0**.
- Shipment on-the-way requires **ETA** to enter an ETA bucket.
- **Calculation preview must NOT persist unless the user submits.**

---

## 18. Non-Goals

- No AR/AP accounting formulas.
- No journal entries.
- No SO billing logic.
- No code implementation.
- No UI-specific error text.
- No automatic email sending.

---

## 19. Open Items

- Exact **current-month formula** final confirmation (interaction of remaining-days demand vs forward FC terms).
- **Lead-time based special-event pull-forward** (v2+; MVP uses previous month).
- **Factory priority allocation rules.**
- **TW_SHENGYI preferred-use rules.**
- **On-the-way bucket thresholds** final confirmation.
- **Carton number automation.**
- **`sales_orders` / ERP ownership layer** (future).
- Final **Inventory Projection Engine** implementation.

---

## 20. Overseas Shared Inventory Allocation Engine

Defines how **shared overseas warehouse inventory** is allocated across self-fulfilled sites. This is the calculation-engine form of the official rule in [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md) §16. **Calculation rule only — no code, no DB, no implementation.**

### 20.1 Allocation Scope

- Allocate **only within the same Company AND the same Country.**
- **Never allocate across companies. Never allocate across countries.**
- Eligible supply = `overseas_inventory_snapshot.available_stock` (`physical_stock − reserved_stock − damaged_stock`) across **eligible overseas warehouses** for that company + country.

### 20.2 Fulfillment Model behavior (Platform vs Self vs Hybrid)

| `fulfillment_model` | Shared allocation? | Behavior |
|---------------------|--------------------|----------|
| `platform_fulfilled` | **No** | Inventory belongs to the platform (e.g. Amazon FBA). Excluded from shared overseas allocation. |
| `self_fulfilled` | **Yes** | Uses shared overseas inventory; allocation **required**. |
| `hybrid` | Mixed | Platform inventory and 3rd-party (shared) inventory **both visible**; the **Marketplace SKU's** `fulfillment_model` decides whether that SKU participates in shared allocation. |

### 20.3 Minimum Survival Stock = 18 Days (highest priority)

- **Before any priority distribution**, every eligible self-fulfilled site must first receive enough inventory to **survive 18 days**.
```
Survival Need[site] = 18 × Avg Sales Per Day[site]
```
- Avg Sales Per Day per the Inventory Table mapping = `amazon_weekly_sales_snapshot.sales_units_7d ÷ 7` (rounded to 1 decimal), or the engine-defined run-rate.
- Survival allocation is the **highest priority**; only **remaining** inventory after all sites hit 18-day survival stock continues to §20.4.

### 20.4 Allocation Priority (remaining inventory)

- After all eligible sites reach 18-day survival stock, distribute the **remaining** inventory by **`marketplaces.allocation_priority`**.
- **Higher number = higher priority.** Editable by PM.
- Ties / leftover rounding reconciliation: see Open Items (integer allocation rounding).

### 20.5 Need Calculation alignment (Sales Driven / Forecast Driven)

The allocation consumes the **Need** produced by the Inventory Table engines (`INVENTORY_TABLE_MAPPING_SPEC.md` §14–§15):

- **Sales Driven** — cumulative incremental Need over buckets `0–18 / 19–30 / 31–45 / 46–90`. **Each upcoming event counted once; each on-the-way shipment deducted once** (FIFO by ETA). `Suggested Qty` = final remaining demand after Current Stock, On-the-Way, and Upcoming Event are processed (min 0).
- **Forecast Driven** — `Suggested Qty = max(0, Forecast Month+1 + Forecast Month+2 + Safety Stock − Current Stock − Qualified On-the-Way)`, with **Safety Days = 30** and Target Rule (SKU > Series > Category) already applied (min 0).

### 20.6 Future Shipping Allocation Extension

- `allocation_priority` becomes the **system-wide shared allocation priority**.
- Future **Factory Allocation**, **Shipping Allocation**, and **Carrier Capacity** allocation may **reuse the same priority field** rather than defining parallel priorities.
- This remains **planning only** — it does not deduct physical stock, transfer ownership, or create intercompany SO/PO/AR/AP. Physical deduction still happens only at shipment **Confirm & Ship** (`SHIPMENT_CENTER_SPEC.md` §15.1).

> **Open items (this engine):** eligible-warehouse resolution; integer allocation rounding + reconciliation vs physical available stock; cross-site / cross-company borrowing of unused allocation (planning exception only — see `SHIPMENT_CENTER_SPEC.md` §19.3); exact Avg-Sales-Per-Day run-rate window.

---

## 21. Supply Planning Optimization Goal

Defines the **system default objective** the planning engine optimizes toward when proposing replenishment / shipping. This is a calculation/priority rule only — it does **not** change any shortage/projection/allocation formula and is **not** an implementation.

### 21.1 System Default Objective (priority order)

The system optimizes in this strict priority order — a lower priority is improved **only without sacrificing a higher one**:

| Priority | Goal | Meaning |
|----------|------|---------|
| **Priority 1** | **Supply Safety** | Demand coverage / no stockout. Highest priority — never traded away. Must at minimum satisfy the **18-day Minimum Survival Stock** (§20.3) for eligible self-fulfilled sites. |
| **Priority 2** | **Lowest Logistics Cost** | Among options that keep supply safe, choose the cheapest. The system should **always try to satisfy demand by the slowest available shipping method first** (slowest = cheapest). |
| **Priority 3** | **Minimum Number of Shipments** | Prefer fewer, consolidated shipments over many small ones. |
| **Priority 4** | **Container Utilization** | Fill containers efficiently (improve fill rate) once the above are satisfied. |

### 21.2 Default shipping behavior

- The system should **default to planning 45-day sea freight** (the slowest / cheapest mode).
- Faster logistics is **escalated step-by-step only when** the **18-day Minimum Survival Stock cannot be met** by the slower mode (i.e. supply safety, Priority 1, would be violated).
- **The system must NOT default to recommending air freight.** Air (and other expedited modes) are exceptions used only to protect supply safety, never the default proposal.

> This goal frames how suggestions are ranked; it does not override the Need calculation (§14–§15 of the Inventory Table mapping), the allocation engine (§20), or Shipment Center execution (which remains a separate module). Shipment-method allocation detail lives in the future Allocation / Shipment specs.

---

## 22. Normalized Avg Sales / Day Rule

Avg Sales/Day drives Days of Supply and the Sales-Driven replenishment baseline. A single Special Event / Campaign / Deal day can spike weekly sales and **falsely inflate** the baseline, over-ordering. This rule **excludes event/promotion days** from the baseline when contamination is present.

### 22.1 Default

```
Avg Sales/Day = amazon_weekly_sales_snapshot.sales_units_7d ÷ 7
```

### 22.2 Exception — event/promotion contamination

If, **within the recent window, the SKU has any day overlapping a Special Event / Campaign / Deal**, do **NOT** use `sales_units_7d ÷ 7`. Compute a **Normalized Avg Sales** from `amazon_daily_sales_snapshot` instead.

- **Window:** the **latest 30 completed days, excluding today**.
- **Event / Promotion Days source:** `fc_special_events`, `campaigns`, `campaign_sku_lines` (any day overlapping an event/campaign/deal period in scope for the SKU).
- **Normal Sales Days = (latest 30 completed days) − (Event / Promotion Days).**

```
normalized_avg_sales_per_day = sum(sales_units on normal days) ÷ count(normal days)
```

### 22.3 Fallback ladder (by available normal days)

**Source and Warning are fully decoupled** — the source records *which* Avg Sales basis was used; the warning records *data quality*. They are independent fields (never combined into one token).

| `normal_days_count` | `source` | Avg Sales/Day used | `warning` |
|---------------------|----------|--------------------|-----------|
| **≥ 7** | `normalized_30d` | `normalized_avg_sales_per_day` | blank |
| **3 – 6** | `normalized_30d` | `normalized_avg_sales_per_day` | `low_sample_warning` |
| **< 3** | `weekly_7d` | `sales_units_7d ÷ 7` (weekly fallback) | `insufficient_normal_days` |

- **Correct:** `source = normalized_30d` + `warning = low_sample_warning` (two separate values). **Do NOT** combine into `normalized_30d_low_sample`.
- When no contamination exists in the window, the default (§22.1) applies → `source = weekly_7d`, `warning = blank`; if weekly data is nonetheless event-affected but still used, `warning = event_contaminated_weekly_sales`.

### 22.4 Forecast-Driven SKUs

- For **Forecast-Driven** SKUs, **Avg Sales is auxiliary reference only** and **must not** be the primary replenishment basis (the Forecast-Driven formula in `INVENTORY_TABLE_MAPPING_SPEC.md` §15 governs). The normalization still applies to the displayed Avg Sales, but it does not drive the Forecast-Driven suggested qty.

### 22.5 Persistence at Decision Commit

The **chosen** Avg Sales/Day, the **source**, the **normal/excluded day counts**, and any **warning** are frozen onto `shipping_plan_lines` at Submit Plan (Decision Commit) via `snapshot_avg_sales_per_day`, `snapshot_avg_sales_source`, `snapshot_normal_days_count`, `snapshot_excluded_event_days_count`, `snapshot_avg_sales_warning` (see `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §5). The snapshot is the Decision Truth and is never recalculated afterward (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`).

**Snapshot Provenance (architecture reserved).** `snapshot_avg_sales_source` is the **current persisted metadata** — it records the **Source** that produced the value (`weekly_7d` / `normalized_30d` / …). The broader **Snapshot Provenance** concept — *which engine / decision produced the value* (AI Engine, Forecast Engine, Planning Engine, Promotion Normalization, Current MVP Rule) — is **architecture-reserved for a future AI / Planning audit trail** and is **NOT persisted** today (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §4B). **No new column / table is added by this note.**

> **Scope:** this rule defines the calculation; it adds **no new table** and **no BigQuery schema change**. It depends only on the Daily Sales snapshot covering 30 completed days (`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`).

### 22.6 Runtime Calculation Rule (Runtime result vs Persistent data)

**`normalized_avg_sales_per_day` is a Runtime Calculation Result, NOT a Database Column.**

- The **Runtime Engine recalculates it every time** from the 30-day Daily Sales snapshot + event/promotion overlap; it is never stored.
- The **Inventory Table displays the Runtime result** (Analysis Layer — always reflects the latest data; `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §2.1).
- It is **not written to any persistent table** during analysis.
- **Only at Submit Plan (Decision Commit)** is the final adopted Avg Sales/Day written to **`shipping_plan_lines.snapshot_avg_sales_per_day`** (together with `snapshot_avg_sales_source` / `snapshot_avg_sales_warning` / day counts). From that moment it is an **immutable Decision Snapshot** (Decision Layer) and is never recalculated (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §4, §8A).

> In short: **Analysis Layer = Runtime recompute (not persisted); Decision Layer = frozen snapshot at Submit Plan.** This rule changes no calculation logic — it only states where the value lives.

---

**Draft v3.3 Calculation Specification — subject to revision. No code or DB changes are implied by this document.**

**End of Document**
