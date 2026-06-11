# Supply Chain System Flow

**Status:** 🟡 Draft v1 — Architecture Specification (documentation only)
**Last Updated:** 2026-06-09
**Maintained By:** Development Team
**Related:** [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) (calculation logic), `assets/specs/active/SKU_MASTER_FLOW.md` (SKU/marketplace/pricing creation)

> This document defines the **operational supply chain flow** — the sequence of pages, actions, and records across Kitchen Mama's weekly supply cycle. It is **not** a formula specification; detailed shortage/surplus/order math lives in `SUPPLY_PLANNING_CALCULATION_RULES.md`. No code changes. No DB changes.

---

## 1. Purpose

This document describes **how work flows through the system** end-to-end: from inventory replenishment calculation, through shipment planning and execution, to forecast review and order requests, and finally document generation.

It defines:
- The **layers** the system operates across (physical, planning, ownership, document).
- The **roles** of companies and factories.
- The **main weekly flow** (9 operational steps).
- The **persistence and document rules** that govern what becomes a saved record.

It intentionally does **not** define calculation formulas (see the calculation rules doc) or accounting/ERP behavior (future scope).

---

## 2. System Layers

Kitchen Mama's supply chain operates across four conceptual layers that run in parallel:

| Layer | Concern | Examples |
|-------|---------|----------|
| **Physical Supply Chain Flow** | Movement of goods | Factory production → factory stock → shipment → marketplace/3PL |
| **Planning / Forecast Flow** | What we expect & plan to move | Inventory Replenishment, FC Summary, Request Order |
| **Ownership / ERP Flow** | Who owns / bills / accounts for goods | Company demand routing, SO/AR/AP (future ERP) |
| **Document / Export Flow** | Paper trail & outputs | Shipment docs, PO/SO, Invoice, Packing List, carrier booking |

```
Planning / Forecast Flow   →  decides quantities & timing
        ↓
Physical Supply Chain Flow →  moves the actual goods
        ↓
Ownership / ERP Flow       →  records who owns/pays (future)
        ↓
Document / Export Flow     →  produces the paperwork
```

These layers are **separate**: a physical shipment can occur independently of how ownership/billing is recorded, and documents are generated from execution records, not from plans.

---

## 3. Company Roles

| Company | Role |
|---------|------|
| **KM** | Kitchen Mama — brand and operating entity |
| **ResTW** | Procurement and supply chain hub (central coordination) |
| **ResUS** | US operating entity |

**Rules:**
- **KM and ResUS generally place demand/order requests through ResTW.**
- **ResTW acts as the central procurement / production coordination hub.**
- Detailed **AR/AP / accounting is future ERP scope**, not current system scope.

```
KM   ──demand──▶ ResTW (procurement hub) ──orders──▶ Factories
ResUS ─demand──▶ ResTW
```

---

## 4. Factory Roles

| Factory | Name | Role |
|---------|------|------|
| **CN_YOUXIN** | 東莞侑鑫 | Manufacturer / factory stock pool |
| **TW_SHENGYI** | 南投勝一 | Manufacturer / factory stock pool |

- Factories are **production resources, not company entities**.
- Factory stock is a **shared pool**; allocation to companies is a planning concern (see FC Share in the calculation rules doc).

---

## 5. Main Weekly Supply Flow

```
1. Inventory Replenishment ─▶ 2. Factory Stock / PO Validation ─▶ 3. Shipping Plan (Draft→Approval)
        ─▶ 4. Formal Shipment Creation ─▶ 5. Shipment On The Way ─▶ 6. Shipping History
   (parallel/periodic) 7. FC Summary Monthly Review ─▶ 8. Request Order / 下單系統 ─▶ 9. Export / Document Center
```

### Step 1 — Inventory Replenishment
- User selects **Country, Marketplace, Target Days**.
- System calculates current inventory, sales, forecast, factory stock, on-the-way, and **suggested replenishment**.
- **Shipping Allocation is a calculation preview only.**
- A **persisted record starts only after Submit Plan**, which creates `shipping_plans` / `shipping_plan_lines`.
- **No separate `shipping_allocation` DB for MVP.**

### Step 2 — Factory Stock / PO Weekly Validation
- Factory users may review `factory_stock`, future purchase orders, and production schedule.
- Purpose: **verify stock and production availability before shipment planning**.
- Reduces the risk of submitting shipment details that factories cannot fulfill.

### Step 3 — Shipping Plan
- User reviews the **Draft** shipping plan.
- User can adjust **SKU qty, carrier, estimated cost, shipping method, notes**.
- **Submit** sends to approval.
- **Manager / COO can approve or reject with notes.**
- An **approved plan can be converted into a formal shipment**.

### Step 4 — Formal Shipment Creation
- **Formal Shipment is separate from Shipping Plan.** Shipping Plan = planning/approval; Shipment = actual logistics execution record.
- User fills `shipment_id` / `shipment_no`, `reference_id`, `warehouse_id`, and tracking / container / BL / invoice details as needed.
- **Header and line data are copied from `shipping_plans` and `shipping_plan_lines` as a shipment snapshot.**
- `shipments` / `shipment_lines` become the **source for documents and on-the-way visibility**.

### Step 5 — Shipment On The Way
- Reads `shipments` + `shipment_lines` + `shipment_events` + `shipment_routes`.
- Shows active in-transit status and **ETA buckets**.
- **On The Way is operational visualization, not a separate shipment DB.**

### Step 6 — Shipping History
- Reads `shipments` + `shipment_lines`.
- Historical table / search view of completed or all shipments.
- **No separate Shipping History DB.**

### Step 7 — FC Summary Monthly Review
- Monthly or periodic review of `fc_regular_forecast`.
- User can add/edit base forecast, special events, target rules.
- **Special event and target rules feed the future calculation engine.**
- **FC Summary is forecast management, not direct order execution.**

### Step 8 — Request Order / 下單系統
- Existing page.
- Reads forecast, inventory, factory stock, on-the-way, warehouse stock.
- Calculates **shortage / surplus and final order need**.
- **Forecast shortage does NOT directly equal order qty.**
- Reallocation and order-need logic are defined in [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md).
- User can review, adjust, and send the request.
- Future output creates `purchase_orders` / `purchase_order_lines` and documents.

### Step 9 — Export / Document Center
- Future page / module. **Template Management is only a sub-tab.**
- Generated documents include:
  - 出貨明細 (shipment detail)
  - PO order
  - SO order
  - Invoice
  - Packing List
  - Carrier booking / 托單
- Uses `document_templates` and `generated_documents`.
- Advertising/sales reports may later use the same `generated_documents` pattern or a separate reporting module.

**Record creation summary:**

| Step | Reads | Writes (on explicit action) |
|------|-------|------------------------------|
| 1 Inventory Replenishment | inventory, sales, forecast, factory_stock | `shipping_plans`, `shipping_plan_lines` (on Submit Plan) |
| 2 Factory Stock / PO Validation | `factory_stock`, POs, production schedule | — (review only) |
| 3 Shipping Plan | `shipping_plans` / lines | status/approval updates |
| 4 Formal Shipment | `shipping_plans` / lines (snapshot) | `shipments`, `shipment_lines` |
| 5 On The Way | shipments, lines, events, routes | — (visualization) |
| 6 Shipping History | shipments, lines | — (read) |
| 7 FC Summary | `fc_regular_forecast` (+ events/targets) | forecast edits |
| 8 Request Order | forecast, inventory, factory, on-the-way | future `purchase_orders` / lines |
| 9 Document Center | `document_templates` | `generated_documents` |

---

## 6. Ownership Layer

- **Physical shipment flow and ownership/billing flow are separate.**
- Goods may be **produced by CN_YOUXIN or TW_SHENGYI**.
- **Operational demand may come from KM, ResTW, or ResUS.**
- **ResTW is the default procurement hub.**
- **Future SO/AR/AP accounting will be an ERP Phase**, not current MVP.
- `sales_orders` / `sales_order_lines` are **future scope**.

```
Physical:  Factory (CN_YOUXIN / TW_SHENGYI) ──▶ Shipment ──▶ Marketplace / 3PL
Ownership: Demand (KM / ResUS) ──▶ ResTW (hub) ──▶ [future SO/AR/AP — ERP]
```

> A single physical shipment does not, by itself, define ownership/billing. Ownership records (SO/AR/AP) are layered on later in the ERP phase and must not be assumed by the MVP execution records.

---

## 7. Data Persistence Rules

- **Calculation previews are not persisted unless the user submits.**
- **Shipping Allocation preview does not require a DB in MVP.**
- **Approved plans become shipments through explicit user action** (Step 4), not automatically.
- **Shipments are historical snapshots** and **must not rely only on a `shipping_plans` join to reconstruct actual shipment state** — the snapshot (header + lines copied at creation) is the authoritative shipment record.

| Artifact | Persisted? | Trigger |
|----------|-----------|---------|
| Replenishment calculation | No | — (preview) |
| Shipping Allocation preview | No | — (preview, no DB in MVP) |
| `shipping_plans` / lines | Yes | Submit Plan |
| `shipments` / `shipment_lines` | Yes (snapshot) | Explicit "create shipment" |
| `generated_documents` | Yes | Document generation |

---

## 8. Document Generation Rules

- **Formal shipment can generate shipment-related documents** (出貨明細, Packing List, carrier booking / 托單, Invoice, etc.).
- **Request Order / PO can generate PO documents.**
- `generated_documents` stores **output file records** (the generated artifacts), produced from `document_templates`.

```
shipments / shipment_lines ──▶ shipment documents ──▶ generated_documents
purchase_orders / lines    ──▶ PO documents       ──▶ generated_documents
document_templates ─────────(template source)──────────┘
```

---

## 9. Non-goals

- **No accounting journal entries.**
- **No AR/AP automation.**
- **No email automation in MVP.**
- **No detailed formula implementation here** (see `SUPPLY_PLANNING_CALCULATION_RULES.md`).
- **No code.**

---

## 10. Open Items

- **Carton number automation rules** for Amazon / carrier docs.
- Future **`sales_orders` / `sales_order_lines`** (ownership/SO scope).
- **Exact shipment document templates** (layout/fields per document type).
- **Warehouse management UI**.
- **Permission / role model** (who can submit, approve, create shipment, generate documents).
- **Future ERP accounting layer** (AR/AP, journal, SO billing).

---

**Draft v1 Architecture Specification — subject to revision. Documentation only; no code or DB changes are implied by this document.**

**End of Document**
