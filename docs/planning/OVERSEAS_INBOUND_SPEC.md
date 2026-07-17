# Overseas Inbound Spec (Overseas Stock Planning Input)

**Status:** 🟡 Draft v1 — Spec only (NO code, NO Apps Script, NO DB migration, NO UI)
**Last Updated:** 2026-07-02
**Maintained By:** Development Team
**Related:** [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md)

> **Spec only.** Defines the Overseas Inbound **planning input** — its flow, header/line schema, and status rules. It introduces **no** code, Apps Script, API, DB migration, or UI. New tables described here are *planned* design, not implemented.

---

## 1. Purpose & Positioning

**Overseas Inbound is a _planning input_ that lives on Overseas Stock.** It is **NOT** a Shipment Draft and **NOT** an execution record.

An Inbound Draft captures "we intend to bring these SKUs into this overseas warehouse/site." Once submitted, it flows through the **Weekly Shipping Plan (Decision Layer)** for approval before any Execution-Layer Shipment Draft is created. Overseas Stock is only updated **after** the resulting shipment is received.

**Layer roles (must hold):**

| Stage | Layer | Owns |
|-------|-------|------|
| **Inbound Draft** | **Planning Input** | `overseas_inbound` + `overseas_inbound_lines` — the intended inbound (editable, not committed) |
| **Weekly Shipping Plan** | **Decision Layer** | `shipping_plans` + `shipping_plan_lines` — the approval workflow |
| **Shipment Draft / Overview** | **Execution Layer** | `shipments` + `shipment_lines` — the physical movement |
| **Overseas Stock Receiving** | **Inventory Update** | `overseas_inventory_snapshot` / `overseas_inventory_movements` — stock changes only on receipt |

This mirrors the four-layer architecture in [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md): each layer copies upstream truth into its own records and never mutates upstream (Immutable Flow).

> **Planning input only — NOT Warehouse Receiving (CANONICAL SCOPE NOTE).** The current Overseas Inbound Spec defines **pre-shipment planning input only. It does not define the final Warehouse Receiving transaction or Inventory Movement reconciliation.** Actual Warehouse Receiving remains a **separate future domain** (PLANNED — NOT IMPLEMENTED). Overseas Inbound **must NOT**: directly create a Shipment Draft · directly deduct Factory Stock · directly increase `overseas_inventory_snapshot` · define actual received quantity · define damaged / missing / over-received quantities · close a Shipment · bypass Weekly Shipping Plan approval. The flow is: **Overseas Stock → Create Inbound Draft → Submit to Weekly Shipping Plan → Decision approval → explicit Execution Commit (Shipment) → later receiving.** Stock changes only on receipt, in the future receiving domain.

---

## 2. Flow (end-to-end)

```
Overseas Stock
   → Create Inbound Draft              (overseas_inbound, status = draft)
   → Add SKU Lines                     (overseas_inbound_lines)
   → Submit to Weekly Shipping Plan    (status = submitted_to_shipping_plan)
        ↓  creates
   Weekly Shipping Plan + shipping_plan_lines   (Decision Layer; status = draft/pending_approval)
        ↓  Pending Approval → Approved (Decision Layer approval — UNCHANGED)
        ↓  explicit Execution Commit (Approved → Create Shipment Draft; NOT automatic on approval)
   Shipment Draft + shipment_lines     (Execution Layer; created by the explicit Execution Commit, per SHIPMENT_CENTER_SPEC / WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §12.1)
        ↓  Ship
   Shipment Overview                   (shipped → in_transit → arrived → received)
        ↓  received
   Overseas Stock 入庫                  (overseas_inventory_snapshot / _movements updated on receipt)
```

**The Inbound Draft never skips the Weekly Shipping Plan.** Submit does **not** create a Shipment Draft directly; it creates a Weekly Shipping Plan that must be approved first.

---

## 3. Core Principles

- **Inbound Draft = Planning Input.** It is a proposal, not a commitment.
- **Weekly Shipping Plan = Decision Layer.** All submit/approve/reject lives there (this spec does **not** add a parallel approval workflow).
- **Shipment Draft = Execution Layer.** Created only from an **approved** Weekly Shipping Plan (existing behavior — see `SHIPMENT_CENTER_SPEC.md`).
- **Overseas Stock Receiving = Inventory Update.** Stock (`overseas_inventory_snapshot.available_stock` / physical) changes **only** when the shipment is **received**, via `overseas_inventory_movements` (the existing inventory update path).
- **Must NOT:** deduct `factory_stock` directly · write `overseas_inventory_snapshot.available_stock` directly at submit/approve · bypass Weekly Shipping Plan approval · create a Shipment Draft directly from an Inbound Draft.

---

## 4. Header — `overseas_inbound` (v1)

| Column | Notes |
|--------|-------|
| `inbound_id` | PK |
| `inbound_no` | human-facing number (e.g. `INB-YYYYMMDD-##`) |
| `company` | owning company |
| `country` | destination country |
| `marketplace` | destination marketplace (if applicable) |
| `destination_site` | destination site identifier |
| `destination_warehouse` | destination overseas warehouse (`warehouses.warehouse_id`) |
| `ship_from_type` | origin type (e.g. `factory` / `overseas_warehouse` / `supplier`) |
| `origin_warehouse` | source warehouse when applicable (`warehouses.warehouse_id`) |
| `shipping_method` | planned method (Air / Sea / Express / …) |
| `carrier_id` | planned carrier (`carriers.carrier_id`), optional at draft |
| `etd` | estimated departure |
| `eta` | estimated arrival |
| `status` | `draft` / `submitted_to_shipping_plan` / `cancelled` (§6) |
| `remark` | free text |
| `created_by` | placeholder actor (MVP; future Role & Permission) |
| `created_at` | |
| `updated_by` | |
| `updated_at` | |
| `submitted_by` | set on Submit |
| `submitted_at` | set on Submit |
| `cancelled_by` | set on soft Cancel |
| `cancelled_at` | set on soft Cancel |

> **Handoff metadata (recommended, future):** when Submit creates a Weekly Shipping Plan, record the linkage (e.g. `submitted_shipping_plan_id` / `submit_batch_id`) so the Inbound Draft can show its downstream plan. Copy-only; the plan never writes back to the inbound record.

---

## 5. Lines — `overseas_inbound_lines` (v1)

| Column | Notes |
|--------|-------|
| `inbound_line_id` | PK |
| `inbound_id` | FK → `overseas_inbound` |
| `sku` | |
| `product_name` | snapshot from `sku_details` (display) |
| `series` | snapshot from `sku_details` (display) |
| `qty` | planned inbound quantity |
| `units_per_carton` | from `sku_details.units_per_carton` |
| `carton_qty` | `CEILING(qty ÷ units_per_carton)` |
| `carton_cbm` | single-carton CBM (`L×W×H/1,000,000`, cm) from `sku_details` |
| `gross_weight` | `carton_qty × carton_weight` |
| `net_weight` | `qty × item_weight` |
| `note` | free text |
| `created_at` | |
| `updated_at` | |

> Logistics fields (`carton_cbm` / `gross_weight` / `net_weight`) follow the same computation as `shipping_plan_lines` (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §5.4 / `SKU_DETAILS_LOGISTICS_SPEC.md`). They are a planning snapshot; blanks when no `sku_details` logistics row exists (never fabricated).

---

## 6. Status Flow

```
draft ──submit──▶ submitted_to_shipping_plan
  │
  └──cancel──▶ cancelled            (soft; row + lines preserved, never deleted)
```

| Status | Meaning | Editable? |
|--------|---------|-----------|
| `draft` | being built on Overseas Stock | **Yes** — header + lines editable |
| `submitted_to_shipping_plan` | submitted; a Weekly Shipping Plan has been created | **No** — locked; further changes happen on the Weekly Shipping Plan |
| `cancelled` | soft-cancelled | No |

**Rules:**
- **Draft is editable** (header + lines).
- **Submit must NOT directly produce a Shipment Draft.** It sets `status = submitted_to_shipping_plan` and **creates a Weekly Shipping Plan + `shipping_plan_lines`** (Decision Layer).
- **Only an approved Weekly Shipping Plan advances to a Shipment Draft** (Execution Layer) — existing behavior; this spec does not change it.
- **Overseas Stock is updated only after the shipment is `received`** — via `overseas_inventory_movements` (Inventory Update); never at submit/approve.
- **Never** deduct `factory_stock` directly, **never** write `overseas_inventory_snapshot.available_stock` directly, **never** bypass Weekly Shipping Plan approval.

---

## 7. Non-Goals (v1)

Do **not** implement now: code · UI · Apps Script · API · DB migration · a parallel approval workflow on the inbound record · direct Shipment Draft creation · factory-stock deduction · direct overseas-stock write · carrier rate calculation · document generation · Role & Permission.

---

## 8. Open Items

- Exact Submit → Weekly Shipping Plan mapping (which header fields seed the plan; grouping key alignment with the plan's six-value key).
- Inbound → plan → shipment linkage fields (`submitted_shipping_plan_id`, etc.).
- Receiving reconciliation: matching a received shipment back to the originating Inbound Draft for reporting.
- Editing after submit (must go through the Weekly Shipping Plan; inbound stays locked).
- Multi-warehouse / mixed-origin inbound splitting.

---

**Draft v1 — Spec only. No code, DB, API, Apps Script, or UI changes are implied.**

**End of Document**
