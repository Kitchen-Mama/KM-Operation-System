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

## 2A. Phase 1 — Net Replenishment Need (P1-A, CANONICAL basic formula, 2026-07-22)

Phase 1 first delivers the **minimum verifiable, auditable, traceable** replenishment number (P1-A), before Allocation / order-deduction / shipment-deduction / receiving. **P1-A must not be blocked by the complete 90-Day engine — but the full 90-Day Rule-Based Supply Planning engine (four modes §2B) is P1-G and IS required before Phase-1 Go-Live** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §1A). **SUPERSEDED:** any earlier statement that "full 90-Day optimization is Post-Phase-1 / not required for Go-Live." Only **learning-based** features (AI, automatic statistical correction, dynamic Safety Stock / dynamic optimization, BigQuery intelligence) are Post-Phase-1.

```
Net Replenishment Need
  = Demand Within Planning Window
  − Sellable Current Stock
  − Qualified Incoming
  − Approved / Committed Supply          (clamp ≥ 0)
```

**Term definitions (canonical):**
- **Demand Within Planning Window** — the demand for the planning window from the current Sales-Driven / Forecast-Driven rule (Layer A projection + special-event pull-forward, §8–§10). The **planning window** is the configured target-days horizon (§6). **Event Demand is NOT deleted when a Shipment is created** — it is only *offset by qualified Supply*; creating a shipment never erases the underlying demand.
- **Sellable / usable Current Stock** — on-hand that can actually satisfy this demand at the relevant location: `available_stock = current_stock − reserved_stock` (excludes damaged / reserved / non-sellable). Platform-fulfilled (FBA) vs shared self-fulfilled pools are counted per §20 (not double-counted).
- **Qualified Incoming (canonical status range)** — incoming supply already committed enough to count against demand: **Approved Plan / Shipped / In Transit / Received-not-yet-reflected**, timed by ETA within the window. **Draft is NOT confirmed supply** and does **NOT** count as Qualified Incoming. (Received stock that has already increased `current_stock` is counted there, not double-counted here.)
- **Approved / Committed Supply** — approved Request/PO quantity not yet in the incoming/stock buckets above (production committed but pre-shipment), to avoid re-ordering what is already on order.

**Rules:**
- **Draft principle:** a Draft (Shipping Plan draft, Inbound Planning draft, unapproved Request) is **never** confirmed supply.
- **Recognition:** Approved Plan, Shipped, In Transit, Received are recognized per their status + ETA timing; each is counted **once** in exactly one bucket.
- **Carton / MOQ rounding** applies only when later demand can reasonably absorb it (§14) — the raw Net Need is computed first, rounding second.
- **Platform warehouses** compute + round per **final destination warehouse** independently; **overseas-warehouse consolidation** requires matching **Company + Warehouse + SKU + Route/Method** (§20, `SUPPLY_CHAIN_SYSTEM_FLOW.md`).
- **Traceability (required):** every Net Need must trace to its demand source, stock snapshot, qualified-incoming rows, and recommendation source (snapshot-frozen at decision, §22).
- **Scope:** P1-A establishes the correct base formula + data flow. The **rule-based 90-Day engine (four modes, buckets, target rules, 30-day safety, event lifecycle, shared-overseas allocation) is P1-G — Phase-1, pre-Go-Live** (§2B–§2E). Only **learning-based** correction (AI, automatic statistical correction, dynamic Safety Stock, BigQuery) is Post-Phase-1.

---

## 2B. The Four Replenishment Combinations (CANONICAL 2026-07-22)

Replenishment is the cross-product of two axes: **Demand Basis** (`sales_driven` / `forecast_driven`) × **Stock Basis** (`platform_fulfilled` / `self_fulfilled` = overseas-warehouse fulfilled).

| Mode | Demand | Current Stock basis |
|------|--------|---------------------|
| **A. Platform × Sales-Driven** | `normalized_avg_sales_per_day × planning-window days` + `special_event_demand` | latest valid **platform sellable** inventory snapshot |
| **B. Platform × Forecast-Driven** | target-adjusted Regular FC + 30-day safety demand + `special_event_demand` | latest valid **platform sellable** inventory snapshot |
| **C. Overseas × Sales-Driven** | `normalized_avg_sales_per_day × planning-window days` + `special_event_demand` | `site_planning_available` allocated from eligible overseas warehouses (§20) |
| **D. Overseas × Forecast-Driven** | target-adjusted Regular FC + 30-day safety demand + `special_event_demand` | `site_planning_available` allocated from eligible overseas warehouses (§20) |

**Canonical stock rule (MUST):**
- A Marketplace SKU **not** fulfilled from a platform warehouse **MUST** use overseas-warehouse **Site Planning Available** as its Current Stock basis; it **MUST NOT** use platform inventory. A non-platform / self-fulfilled SKU's Current Stock is therefore its **overseas allocated available**, **never `0`** and **never platform stock**.
- **Platform inventory and overseas inventory MUST NOT be blindly added together.** They are separate supply buckets (§24; `DATABASE_RELATIONSHIP_MAP.md` §6.0).
- **Hybrid** marketplaces resolve fulfillment behavior at the **Marketplace-SKU level** (`fulfillment_model`); if one SKU genuinely uses both lanes, **explicit lane allocation** is required before calculation (no implicit merge).

## 2C. Sales-Driven Formula — exact-date buckets (Modes A & C)

Buckets (exact days from the calc date): **`0–18` / `19–30` / `31–45` / `46–90`**. For each bucket `b`:
```
Incremental Regular Demand[b] = normalized_avg_sales_per_day × bucket_day_count[b]
Bucket Need[b] = max( 0,
    Incremental Regular Demand[b]
  + Event Demand assigned to bucket b            (by Preparation Date, §5 / INVENTORY §8.1)
  − remaining current stock                       (applied cumulatively)
  − qualified incoming arriving in time (ETA ≤ bucket end)
  − approved committed supply eligible for this requirement )
```
- Stock and supply are consumed **cumulatively** across buckets (FIFO by ETA); **every demand row, event, incoming row, and inventory quantity is counted once only**.
- **Platform stock source (Mode A):** prefer the **latest valid platform snapshot**; **never subtract sales again** from an imported current snapshot; the Estimated ledger is **fallback only** when no valid snapshot exists, and such fallback inventory is labeled **Estimated Inventory**.
- **Overseas stock source (Mode C):** `current − reserved − damaged/hold/non-sellable`, then allocate within the **same Company + Country + eligible Warehouse + SKU** (§20): protect the **18-day survival stock first** (§20.3), distribute the remainder by demand weight + `allocation_priority` (§20.4); **never assign the whole shared pool to every site.**
- **Normalized Avg Sales** (§22): latest 30 completed days excluding today, excluding Campaign/Deal/Special-Event days; ≥7 normal days → normalized average; 3–6 → normalized average + `low_sample_warning`; <3 → `weekly_7d` fallback + `insufficient_normal_days`.

### 2C.1 Calculated Gap → Recommended Qty (CANONICAL 2026-07-22)

Per window `b`, the **Calculated Gap** is the destination demand remaining after destination stock + timely supply (this is `Bucket Need[b]` above; DB `calculated_gap_qty`):
```
Calculated Gap[b] = max( 0,
    Regular Demand[b] + Special Event Demand[b]
  − Remaining Destination Stock − Timely Qualified Incoming − Timely Approved Supply )
```
The **Recommended Qty** is what the system actually recommends **shipping**, after source availability + carton + route-timing feasibility:
```
Raw Recommended Qty[b]      = min( Calculated Gap[b], Eligible Source Available Qty )
Carton-adjusted Recommended Qty[b] = FLOOR( Raw Recommended Qty[b] / units_per_carton ) × units_per_carton
```
- **Three distinct quantities — never conflated:**
  1. **Destination shortage** = `Calculated Gap` (how much the destination needs).
  2. **Immediately-available source stock** = `Eligible Source Available Qty` (what can ship now from Factory/Overseas eligible source).
  3. **Production-required quantity** = `max(0, Calculated Gap − Eligible Source Available)` (what must be produced/ordered — feeds P1-B order recommendation).
- **Carton rounding here is FLOOR** — a shipping recommendation ships only **whole cartons of what is actually available**, never a partial carton and never more than available. *(Distinct from the ORDER/production carton rule §14, which uses **CEILING** to round the order **up** so production covers the whole need. Shipping-from-available rounds down; order-to-cover-need rounds up.)*
- **Zero Factory Stock does NOT mean "no shipment can be recommended."** If `Eligible Source Available = 0` but the destination has a gap, the **production-required quantity** is surfaced (plan production → order), and a route can still be recommended for the post-production ship (Route Recommendation §Step B uses production lead time). Do not conclude "no shipment ever."
- `units_per_carton` from `sku_details`; a missing UPC → validation/manual review (never a silent default).

## 2D. Forecast-Driven Formula (Modes B & D)

```
Adjusted Regular FC = Regular FC × Target Rule
Target Rule priority: SKU > Series > Category > default 100%

Suggested Qty = max( 0,
    Forecast Month+1 + Forecast Month+2
  + 30-Day Safety Demand
  + Special Event Demand
  − Current Stock (for the selected fulfillment model — platform snapshot [B] or overseas Site Planning Available [D])
  − Qualified Incoming arriving in time
  − Approved / Committed Supply )
```
- **Forecast-Driven Avg Sales is display/reference only** — it must **not** replace Forecast as the demand basis.
- **Shared overseas allocation (Mode D):** Forecast demand / FC Share is an **allocation weight**, **not** ownership of duplicated physical stock; **never allocate more than the calculated site Need.**

## 2E. Qualified Incoming / Count-Once Contract (canonical)

A supply row is **Qualified Incoming** only when **all** hold: matching **SKU**; matching **Company**; matching **destination or eligible service scope**; **approved/qualified status**; **ETA ≤ requirement date**; **remaining unconsumed quantity > 0**. **Draft is never Qualified Incoming.**

Each physical quantity exists in **exactly one** active planning bucket, in this progression — never counted in two at once:
```
Committed Production → Approved Shipping Plan → In Transit → Delivered-not-Received → Received (Current Stock)
```
- Do **not** double-count the same quantity as PO committed supply **and** Approved Plan **and** Shipment On-the-Way **and** Current Stock.
- **Delivered ≠ Received:** a carrier `delivered` event never increases destination stock; destination stock rises **only at confirmed receipt/posting** (`SHIPMENT_ROUTE_AND_EVENT_SPEC.md` §5.4, `DATABASE_RELATIONSHIP_MAP.md` §6.0).

## 2F. Shipment ETA — display bucket vs qualification (CANONICAL 2026-07-22)

A Shipment is **displayed** in the window that contains its ETA. But **qualification is separate from the display bucket**:
```
A Shipment qualifies for a requirement ONLY when Shipment ETA ≤ Requirement Required-By Date.
```
- A shipment shown in a window still does **not** cover that window's gap if its ETA is after the Required-By date — it is flagged **In Transit — Late Risk** (visible, not covering; §10.1).
- **ETA source priority (highest wins):**
  1. **latest actual / runtime ETA** (from `shipment_events` projection),
  2. **formal Shipment planned ETA** (`shipments.eta`),
  3. **lead-time estimated ETA** (`today/ship-date + carrier_lead_times`).
- **Once a formal Shipment has an authoritative runtime ETA, do NOT keep replacing it** with a fresh carrier-lead-time estimate (the estimate is only the fallback before a real ETA exists).
- **Delivered ≠ Received:** delivered-not-received remains **Incoming**, not Current Stock, until confirmed receipt.

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
- `factory_stock` = **production-side** inventory (**Factory Inventory** domain).
- `overseas_inventory_snapshot` = **warehouse-side** inventory (**Overseas Inventory** domain).
- `shipments` + `shipment_lines` + ETA = **on-the-way** source.
- **Shipping Allocation preview is NOT persisted in MVP** (no `shipping_allocation` DB).
- **Inventory-domain separation (CANONICAL 2026-07-21 — authority `DATABASE_RELATIONSHIP_MAP.md` §6.0).** Factory Inventory (`factory_stock` / `factory_stock_movements`) and Overseas Inventory (`overseas_inventory_snapshot` / `overseas_inventory_movements`) are **separate domains** — the calculation engine reads each as a **distinct input** and must **never merge them into one balance**. **On-the-way / in-transit shipment quantities are a transportation state, NOT inventory at either endpoint** — they must never be double-counted as available inventory simultaneously at the factory and the overseas warehouse. Overseas on-hand rises only on confirmed receipt; factory on-hand falls on confirmed dispatch.

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

> **Canonical scope (2026-07-20):** FC Share is a **proportional WEIGHTING input** for the remaining-pool step of shared allocation (§23.2 step 4) — **not** the only overseas shared-allocation method (18-day survival §20.3 and `allocation_priority` §20.4 come first) and **not** a hard entitlement (`SHIPMENT_CENTER_SPEC.md` §19.2 V1). FC Share **weights a division of one physical pool; it never duplicates physical stock** across marketplaces (§23.1/§23.5).

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

> **CANONICAL (2026-07-22): the calculation engine uses the EXACT Preparation Date.**
> ```
> Event Preparation Date = Event Start Date − 30 calendar days
> ```
> The engine judges all Need buckets (`0–18 / 19–30 / 31–45 / 46–90`) against the **Preparation Date** (`INVENTORY_TABLE_MAPPING_SPEC.md` §8.1, authoritative). The **Monthly UI** places the event demand in the **month containing the Preparation Date**.
>
> **SUPERSEDED:** the previous rule that event demand is *always* placed into the calendar month **before the event period** is now only a **legacy monthly approximation** (retained below for the coarse monthly-projection view). Where the exact-date rule and the previous-month approximation differ, the **exact Preparation Date wins.**

**Legacy monthly approximation (retained, superseded by the exact-date rule above):** Event in **October** → roughly the **September** projection.

| Event | Event Month | (Legacy) Impacts Projection Month | Exact-date basis |
|-------|-------------|-----------------------------------|------------------|
| Fall Prime | October | September | month containing (Event Start − 30d) |
| Prime Day | July | June | month containing (Event Start − 30d) |
| BFCM | November | October | month containing (Event Start − 30d) |
| Spring Deal | March | February | month containing (Event Start − 30d) |

Special Event Demand (canonical contract):
- **Additive** to Regular Demand; **always 100%**; **not affected by Target Rules**.
- **NOT deleted by Shipping Plan or Shipment creation** — offset **only** by timely eligible supply.
- **Sales-Driven:** event dates are **excluded from Normalized Avg Sales** (§22.2); the event FC is then added **exactly once** — do **not** double-count event uplift through both the sales run-rate and the event FC.

### 10.1 Special Event Coverage Lifecycle (CANONICAL 2026-07-22)

```
Not Planned → Draft Planned → Approved Planned → In Transit → In Transit — Late Risk
  → Partially Received → Received → Closed / Archived
```

**Recognition rules:**
- **Not Planned** — event demand exists, no supply yet; full gap.
- **Draft Planned** — displayed as pending; **does NOT reduce confirmed risk** (Draft ≠ qualified supply).
- **Approved Planned** — offsets demand **only when planned arrival is on time** (ETA ≤ Preparation/Required Date).
- **In Transit** — Qualified Incoming **only when ETA ≤ Required Date**.
- **In Transit — Late Risk** — incoming stays visible but **does not cover** the original time gap (ETA > Required Date).
- **Partially Received** — offset **only the actual received quantity**; recalculate the residual gap.
- **Received** — move quantity from Incoming to Current Stock; **never count both**.
- **Closed / Archived** — removed from the Active Recommendation Summary; **History/Audit preserved**.

```
Event Net Gap = max( 0,
    Event Demand − Timely Approved Supply − Timely Qualified Incoming − Received Qty )
```

**Event Close conditions (all must hold):** event period ended · no unresolved residual gap · no open shipment exception · no pending partial receipt · audit data preserved. (Exceptions to any condition keep the event Active.)

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
- **Special-event pull-forward:** canonical rule is the **exact Preparation Date = Event Start − 30 days** (§10, `INVENTORY_TABLE_MAPPING_SPEC.md` §8.1). *(The old "MVP uses previous calendar month" is a superseded legacy approximation, §10.)* Future lead-time-based pull-forward (per-route offset) is a v2+ refinement of the 30-day default.
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
- Eligible supply = `overseas_inventory_snapshot.wh_available_stock` (`wh_physical_stock − wh_reserved_stock − wh_damaged_stock`) across **eligible overseas warehouses** for that company + country. *(2026-07-21: canonical `wh_*` names; formula unchanged.)*

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

## 23. Shared Overseas Physical Pool — Grain, Deduplication, Allocation & Display (CANONICAL CORRECTION 2026-07-20)

Refines §7 (FC Share) and §20 (Overseas Shared Inventory Allocation Engine). **The shared physical pool is counted ONCE; per-marketplace figures are a distribution of that pool, never extra supply.** Analysis Layer only — no persistence table is created.

### 23.1 Physical grain (build the pool exactly once)
- **Shared Physical Pool Key = `company + warehouse_id + Master SKU`.** **Marketplace is NOT part of the physical grain** for shared 3PL stock.
- **Physical Available = `wh_physical_stock − wh_reserved_stock − wh_damaged_stock`** (per eligible warehouse row).
- If several eligible 3PL warehouses form one operational pool: **Shared Physical Available = SUM(deduplicated eligible warehouse rows)**, deduplicated by `company + warehouse_id + Master SKU` — **never by marketplace row**.
- **Shared self-fulfilled marketplaces** (Shopify / Target / Walmart / Wayfair / other self-fulfilled) **may share one physical warehouse inventory**. Adding multiple Marketplace SKUs for one Master SKU must **not** duplicate the physical pool.
- **PROHIBITED** (only 1,000 physical units exist):
  ```
  Shopify 1,000 + Target 1,000 + Walmart 1,000 + Wayfair 1,000 = 4,000   ← WRONG
  ```

### 23.2 Allocation sequence (each Marketplace demand independent, one shared pool)
1. **One Physical Shared Pool** (§23.1).
2. **Each eligible Marketplace's demand** via the **existing** Need formulas (§20.5): Sales-Driven or Forecast-Driven. **Do not replace these formulas.**
3. **18-day survival first** (§20.3, preserved): every eligible site first receives up to its **actual Need**, capped at survival need; if the pool can't satisfy all 18-day needs, distribute by the **existing shortage/priority rule** (§20.4 `allocation_priority`).
4. **Remaining pool** → remaining unmet Need: **FC Share** (§7) is the proportional **weight for Forecast-Driven** demand; **sales/run-rate** weight for Sales-Driven; `allocation_priority` is a priority/tie-break input. **Never allocate more than a site's calculated Need** unless explicitly classified as unused/unallocated pool. FC Share is a **weighting input, not a hard entitlement and not duplicated physical stock** (see also `SHIPMENT_CENTER_SPEC.md` §19.2 V1).
5. **Integer/carton reconciliation:** integer quantities; deterministic rounding remainder; **never exceed Shared Physical Available.**

### 23.3 Required invariants
```
site_shared_allocation_qty >= 0
SUM(site_shared_allocation_qty) <= shared_physical_available_qty
unallocated_shared_pool_qty = shared_physical_available_qty − SUM(site_shared_allocation_qty)
unallocated_shared_pool_qty >= 0
```
The allocation is **Analysis Layer only** — not physical stock, not ownership, not inventory movement, not a second snapshot row; recalculable; **never added back to physical stock totals.**

### 23.4 Inventory Replenishment display semantics
- **Displayed Site Planning Available = Exclusive Site Stock + Shared Warehouse Allocation for the current site.** For a pure shared-3PL marketplace, Exclusive Site Stock is normally zero, so **Displayed Current Stock = Shared Warehouse Allocation**.
- The number MUST be labelled **"Planning Available"** or **"Shared Warehouse Allocation"** — it must **not** imply the site physically owns the entire pool.
- **Expanded stock detail** distinguishes: Physical Shared Pool · Allocated to Current Site · Allocated to Other Sites · Unallocated Pool · Reserved · Damaged · Qualified On-the-Way.
- **Days of Supply & Suggested Qty** for the selected marketplace use **its Site Planning Available + its Qualified On-the-Way + its own sales/forecast demand** — **never the entire shared physical pool.** (Where §20.5 Forecast-Driven uses "Current Stock", substitute the site's allocated Planning Available.)

### 23.5 All-Marketplace aggregation
When **All Marketplaces** is selected: **physical stock deduplicated by `company + warehouse_id + Master SKU` and counted once.** Marketplace planning allocations may be shown as a breakdown that **sums to ≤ the physical pool** and are **never added to** it. PROHIBITED: `Physical Pool + Shopify + Target + Walmart + Wayfair`. Allocations are a **distribution** of the pool, not extra supply.

### 23.6 Fulfillment-model boundary
- **`platform_fulfilled`** (e.g. Amazon FBA): platform inventory is **exclusive** and **excluded** from the shared self-fulfilled 3PL allocation.
- **`self_fulfilled`** (Shopify / Target / Walmart / Wayfair on shared 3PL): **participates** in shared allocation.
- **`hybrid`:** platform stock and shared 3PL stock are **separate supply buckets** — only the self-fulfilled/shared portion participates; **never collapse the two physical buckets before calculation.**

**Runtime status: NOT IMPLEMENTED / Runtime Mapping Required.** No new persistence table is created.

---

## 24. FBA Inventory Source + Three-Mode Shared FBM Allocation (CANONICAL ADDENDUM 2026-07-20)

Incremental addition on top of §23 (does not reverse it) and §20. Analysis Layer only; **no persistence table, no DB/Runtime change.**

> **ADDENDUM (2026-07-22) — 3PL RESERVE participation vs Current-Stock separation.** The exclusion below
> concerns **Current Stock composition** only: platform (FBA) inventory is never *merged into* a
> marketplace's sellable Current Stock, and self-fulfilled Planning Available is never labelled platform
> stock. It does **NOT** mean a platform-fulfilled marketplace is barred from the shared overseas **3PL
> replenishment reserve**. The 3PL pool is a company+country replenishment reserve that can later
> replenish the platform warehouse (e.g. FBA inbound); therefore the **"3rd Party Stock" / Site Planning
> Available display allocates the shared 3PL pool across every scoped marketplace regardless of
> fulfillment model** (eligibility is warehouse-side only: `company + country + warehouse_type='3PL' +
> is_active`). This supersedes the earlier "platform-fulfilled excluded from the 3PL display" behavior in
> Inventory Replenishment. It remains **display/planning only** — no movement, no reservation, no snapshot
> write, and it does not merge 3PL qty into platform Current Stock.

### 24.1 Fulfillment inventory separation (formalized)
- **`platform_fulfilled` (e.g. Amazon FBA):** platform inventory is exclusive for **Current Stock composition** — it is **never combined with shared 3PL inventory into Current Stock**, and self-fulfilled Planning Available is never labelled as platform stock. Current Stock from the platform source (§24.2). *(Per the 2026-07-22 addendum above, this does not exclude the marketplace from the shared 3PL **reserve** display / Site Planning Available.)*
- **`self_fulfilled` (Shopify/Target/Walmart/Wayfair on shared 3PL):** physical inventory held **once** by `company + warehouse_id + Master SKU`; marketplace is a demand/planning dimension, not physical identity. Each eligible marketplace gets a **recalculated virtual Planning Allocation**; `SUM(site allocations) ≤ shared physical available`; virtual allocation moves no inventory and creates no ownership.
- **`hybrid`:** platform and shared 3PL are **separate supply buckets** — platform portion follows §24.2, shared portion follows §24.3–§24.6; **never collapse both into one Current Stock before calculation.**

### 24.2 FBA inventory source precedence (two mutually-exclusive modes)
**Mode 1 — Platform Snapshot Mode (canonical preferred).** When a current platform inventory report exists: `FBA Current Stock = latest valid platform inventory snapshot value` (source e.g. `amazon_inventory_snapshot` or another verified platform report).
- The latest imported snapshot is the platform Current-Stock **SSOT**. **Do NOT subtract Sales Report quantities again** from an imported snapshot (double-deduct). Snapshots stay independent by the existing platform grain `company + country/site + marketplace + SKU`. **Warehouse Reference Master rows never infer FBA quantity.**

**Mode 2 — Estimated Ledger Mode (fallback only; when no sufficiently current snapshot exists):**
```
Estimated FBA Stock =
    opening_confirmed_stock
  + confirmed_platform_inbound_receipts + returns_to_sellable + positive_adjustments
  − fulfilled_sales − removals − disposals − lost_or_damaged_adjustments − other_verified_outbound_adjustments
```
- Sales-Report deduction **alone** is insufficient to reproduce actual FBA stock (returns/transfers/removals/loss/damage/reconciliation/platform adjustments all move it). Result labelled **"Estimated Inventory"** (stored/displayed as estimate, not confirmed truth). A newer platform snapshot **replaces/reconciles** the estimate. **Never apply Snapshot Mode and Estimated deduction to the same interval.**
- If some adjustment sources are unavailable in V1: use only verified sources, show a stale/estimate warning, **do not fabricate adjustments** → classify the missing reconciliation flow as **Runtime Mapping Required**.

### 24.3 Shared FBM physical pool
`Shared Pool Key = company + warehouse_id + Master SKU`. `shared_physical_available_qty = wh_physical_stock − wh_reserved_stock − wh_damaged_stock`; multi-warehouse pool = `SUM(deduplicated eligible physical rows)` deduped by `company + warehouse_id + Master SKU` — **never dedupe/duplicate by marketplace.**
**Reconciliation:** `SUM(site_planning_allocation_qty) + unallocated_shared_pool_qty = shared_physical_available_qty`; both terms `>= 0`.

### 24.4 Daily demand inputs
Per eligible site *i*, `daily_demand_i` from the **existing** rules — Sales-Driven (canonical Avg Sales/Day / normalized §22) or Forecast-Driven (canonical forecast → daily via the existing period/day convention). **Do not replace the existing Need formulas.**
`minimum_18d_need_i = CEILING(daily_demand_i × 18)`, capped by the site's applicable calculated Need where the existing Need formula requires. The 18-day value here is a **display-allocation protection floor** and a **logistics risk threshold** — not ownership, not a persisted partition.

### 24.5 Mode A — NORMAL_ALLOCATION
**Condition:** `shared_physical_available_qty >= SUM(minimum_18d_need_i)`.
1. Give each site its `minimum_18d_need_i`.
2. `remaining_pool = shared_physical_available_qty − SUM(minimum_18d_need_i)`.
3. Distribute `remaining_pool` by demand weight — Forecast-Driven: FC Share (§7); Sales-Driven: sales/run-rate share; `allocation_priority` = tie-break/remainder order **that must not reduce any site below its 18-day floor.**
4. Never allocate above a site's applicable calculated Need; leftover stays `unallocated_shared_pool_qty`.
`site_planning_allocation_i = minimum_18d_need_i + allocated_remaining_qty_i`.

### 24.6 Mode B — PROTECTED_REALLOCATION
**Condition:** pool can protect all sites 18 days, **but** an initial FC/Sales-Share split leaves ≥1 site below its 18-day need. Rebalance the **virtual** allocation automatically; take only from a donor's allocation **above** its own 18-day need; **never reduce a donor below its 18-day need.** Analysis-Layer recalculation — not a physical transfer, no approval, no inventory movement.
```
receiver_shortage_i = MAX(minimum_18d_need_i − provisional_site_allocation_i, 0)
donor_surplus_j     = MAX(provisional_site_allocation_j − minimum_18d_need_j, 0)
protected_reallocation_qty <= MIN(receiver_shortage, available donor surplus)
donor_final_allocation_j >= minimum_18d_need_j   (invariant)
```
If the total pool can protect all sites, the final allocation **must not** leave any site below 18 days merely due to its initial FC/Sales Share.

### 24.7 Mode C — SHORTAGE_ALLOCATION
**Condition:** `shared_physical_available_qty < SUM(minimum_18d_need_i)`. Do **not** pretend every site reaches 18 days. Weighted shortage distribution:
```
priority_factor_i = MAX(allocation_priority_i, 1)
weighted_survival_need_i = minimum_18d_need_i × priority_factor_i
raw_shortage_allocation_i = shared_physical_available_qty × weighted_survival_need_i ÷ SUM(weighted_survival_need)
```
Rules: allocation ≤ site's applicable Need; non-negative integer; remaining integer units via **deterministic largest-remainder**, order = (1) higher `allocation_priority`, (2) larger unmet 18-day need, (3) stable marketplace key; pool total never negative; **lower-priority sites are never silently dropped**; if the priority scale causes starvation/extreme concentration, **Runtime must warn** rather than silently return misleading allocation.
Outputs: `coverage_rate = shared_physical_available_qty ÷ SUM(minimum_18d_need_i)`; per site `estimated_days_of_supply_i = site_planning_allocation_i ÷ daily_demand_i`; `shortage_to_18d_i = MAX(minimum_18d_need_i − site_planning_allocation_i, 0)`; display state `SHORTAGE_ALLOCATION`.

### 24.8 `allocation_priority` role by mode
- **NORMAL:** tie-break + remaining-pool distribution; **cannot** break another site's 18-day protection.
- **PROTECTED_REALLOCATION:** may set donor/remainder order; **cannot** reduce a donor below 18 days.
- **SHORTAGE:** active weighted-shortage input; higher priority = proportionally stronger protection.
- Priority is **not** physical ownership, guaranteed stock, a separate balance, or permission to exceed physical available.

### 24.9 Inventory Replenishment display contract
- **platform_fulfilled/FBA:** show Platform Current Stock · source mode (Confirmed Snapshot | Estimated) · snapshot/import date · stale/estimate warning where applicable · Platform On-the-Way separately. **Do NOT show Shared Warehouse Allocation for pure FBA.**
- **self_fulfilled/FBM:** primary value **"Planning Available"**; expanded detail: Physical Shared Pool · Allocated to Current Site · Allocated to Other Sites · Unallocated Pool · Reserved · Damaged · Qualified On-the-Way · Allocation Mode · Estimated Days of Supply · Shortage to 18 Days · Allocation Priority · Last Calculated At. **Never** label site Planning Available as confirmed site-owned physical stock.

### 24.10 Daily recalculation boundary
> **Cadence (canonical, `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A):** the Daily Report Pipeline runs **12:00 Asia/Taipei** and updates **Analysis only** — it creates/modifies **no** recommendation Draft. Recommendation Drafts are created only by the **Weekly Shipping Recommendation (Mon 14:00, window 14:00–15:00)** and **Monthly Order Recommendation (5th, 15:00, window 15:00–16:00)**, each gated on Daily-Pipeline success (13:00–14:00 validation buffer) and idempotent per cycle key.

Shared FBM Planning Allocation may recalculate **daily** from latest physical inventory / reservations+damage / sales+forecast demand / qualified on-the-way / allocation_priority. Inventory Replenishment is **Analysis Layer** and may change daily. Daily recalculation **must NOT mutate**: previously submitted Weekly Shipping Plans, approved plans, Shipment Draft execution snapshots, shipment lines, documents, or historical allocation snapshots. **At Submit Plan:** copy the current Planning Available + calculation context into the Decision Snapshot. **After Execution Commit:** the Shipment reads the committed snapshot and never recalculates it. (Consistent with §21/§22 Analysis-vs-Decision layering and `SHIPMENT_CENTER_SPEC.md` Immutable Flow.)

### 24.11 Air vs Sea recommendation boundary
Keep inventory display allocation **separate** from shipping recommendation.
```
air_shortage_qty = MAX(minimum_18d_need − site_planning_available − qualified_on_the_way_arriving_within_18_days, 0)
```
Air freight is suggested **only** when a shortage occurs inside the 18-day window **and** slower confirmed inbound cannot arrive before it. **Air must NOT be recommended merely because the site has demand within 18 days.**
```
Sea (Sales-Driven):    sea_need = target_days × avg_sales_per_day − site_planning_available − qualified_on_the_way − confirmed_air_qty
Sea (Forecast-Driven): sea_need = applicable_forecast_demand + canonical_safety_stock − site_planning_available − qualified_on_the_way − confirmed_air_qty
Suggested Sea Qty = MAX(sea_need, 0)   → then apply existing carton/container rules
```
`confirmed_air_qty` is **deducted from Sea Need** so the same shortage is not replenished twice. This routing layer **aligns with**, and does not replace, the existing canonical Need formulas (§20.5).

**Runtime status: NOT IMPLEMENTED / Runtime Mapping Required.** No new persistence table.

---

**Draft v3.5 Calculation Specification — subject to revision. No code or DB changes are implied by this document.**

**End of Document**
