# Supply Planning Calculation Rules

**Status:** 🟢 Draft v2 — Calculation Specification (NOT implementation)
**Last Updated:** 2026-06-09
**Maintained By:** Development Team
**Related:** [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md) (operational flow), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) (table relationships)

> **Changelog v1 → v2:** Added Document Scope, Company/Ownership context, explicit Inventory Sources, Target Days logic, carton rounding, Request Order role, Inventory Replenishment vs Request Order distinction, validation rules, and expanded current/future month projection with on-the-way and pull-forward special-event terms. Sign convention now explicit in the source formulas.

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

**Draft v2 Calculation Specification — subject to revision. No code or DB changes are implied by this document.**

**End of Document**
