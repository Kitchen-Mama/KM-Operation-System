# Overseas Outbound Spec — Origin Fulfillment Operation (CANONICAL)

**Status:** 🟡 Draft v1 — Spec only (NO code, NO Apps Script, NO DB migration, NO UI). All tables are **planned design — NOT implemented.**
**Last Updated:** 2026-07-22
**Maintained By:** Development Team
**Related:** [`WAREHOUSE_OPERATIONS_SPEC.md`](./WAREHOUSE_OPERATIONS_SPEC.md), [`OVERSEAS_INBOUND_SPEC.md`](./OVERSEAS_INBOUND_SPEC.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) §23, [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) (P1-B reserve/deduct), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md)

> **AUTHORITY (CANONICAL 2026-07-22).** This is the **single canonical Overseas Outbound authority** — the **origin-side overseas warehouse picking / packing / shipping (fulfillment) operation** and its WMS/API details. It owns the outbound **operation + confirmation contract and lifecycle**. Navigation / page layout is owned by `WAREHOUSE_OPERATIONS_SPEC.md` §5; endpoint semantics / auto-create trigger / shipout push direction by `SHIPMENT_CENTER_SPEC.md` §23; **inventory movement posting** by the inventory specs (referenced, not restated here). **Spec only — nothing here is implemented.**

> **UI STATUS UPDATE (2026-07-23).** A **Preview-Mode Operation Workspace UI** now exists for the Overseas Outbound page (interactive list / KPI / create-edit drawer / warehouse selector / shipment mapping / SKU-lines editor / lock→submit→pick→pack→ship-confirm lifecycle / projected Movement-Impact panel / empty-loading-error states). It is a **non-authoritative front-end shell only**: the lifecycle runs in an **in-memory session store**, and **no stock is reserved or deducted and no `overseas_inventory_movements` are posted** — the runtime tables + handlers are still NOT implemented. Selectors and the movement projection read real `shipments`/`shipment_lines`/`warehouses`/`overseas_inventory_snapshot`; the Lock/Ship-Confirm actions map 1:1 to the planned reserve/deduct handlers. See `project-current-state.md` (2026-07-23 Overseas workspace entry).

---

## 1. Purpose & Positioning

Overseas Outbound represents goods being **fulfilled FROM a managed overseas warehouse** — the origin-side warehouse operation that picks, packs, and ships out inventory already held overseas, then returns an actual **Shipout Confirmation** that deducts overseas inventory.

- **Dedicated, separate page** under the Warehouse navigation group. Shares only reusable UI components with Overseas Inbound / Overseas Inventory / Factory Inventory; **routes, state, primary actions, queries, validation, and lifecycle are separate.** **Never render Inbound operations on this page.**
- **Auto-created / linked from a Formal Shipment** whose **origin** is a qualifying managed overseas warehouse (`origin_warehouse_id` resolves to an active, non-factory `warehouses` record with `is_shipping_enabled = TRUE`). Direction is **runtime-derived, never user-selected** (`SHIPMENT_CENTER_SPEC.md` §23.5).
- **Company-scoped:** `WH-KM-US-3PL-AMZLGS` and `WH-RESUS-US-3PL-AMZLGS` are distinct identities — never cross-route; match by `warehouse_id` + validated company.
- **NOT a Shipment Draft, NOT a planning record.** It is a lightweight operational supplement that drives an **Overseas Inventory decrease on confirmed shipout only.**

---

## 2. Canonical Flow (Shipout push compatibility)

Two **directional** integration pushes exist and must never be conflated:

- **Outbound Instruction Push** — **KM System → Warehouse/WMS** (we tell the warehouse what to ship).
- **Shipout Confirmation Push** — **Warehouse/WMS → KM System** (the warehouse tells us what actually shipped).

```
Formal Shipment (origin = managed overseas warehouse)
  → auto-create / link Outbound Draft            (overseas_outbound_operations, status = draft; NO reserve, NO deduct)
  → complete provider / WMS-required fields
  → Lock and reserve stock                       (overseas_inventory: available → reserved; reserve happens at LOCK)
  → Submit outbound instruction to WMS           (Outbound Instruction Push: KM → WMS; api_status = submitted)
  → acknowledged                                 (api_status = acknowledged)
  → picking                                      (operation_status = picking)
  → packed                                       (operation_status = packed)
  → ready_to_ship                                (operation_status = ready_to_ship)
  → actual Shipout Confirmation returned to KM   (Shipout Confirmation Push: WMS → KM)
  → post overseas outbound movement              (overseas_inventory_movements)
  → reduce current_stock AND reserved_stock      (by ACTUAL shipped_qty only)
  → update Shipment shipped / tracking state
```

**Hard rules:**
- **Do NOT define "Shipout first, then push the outbound instruction."** The instruction push (KM→WMS) always precedes the shipout confirmation (WMS→KM).
- **Auto-create does NOT auto-submit** — creating/linking the Outbound Draft never pushes to WMS and never touches inventory.
- **Submit does NOT deduct physical stock** — submitting the instruction to WMS is a pre-advice; it moves no physical balance.
- **Lock reserves** stock (`available → reserved`); **Ship Confirm deducts** stock (`current_stock` and `reserved_stock` both decrease). **Reserve happens at Lock, never at Draft.**
- **Ship Confirm deducts only the actual shipped quantity.** A **Partial Ship Confirm deducts only `shipped_qty_this_confirmation`**, never the requested/planned qty.

---

## 3. Operation header — `overseas_outbound_operations`
| Column | Notes |
|--------|-------|
| `outbound_operation_id` | PK |
| `outbound_operation_no` | human-facing (e.g. `OBO-YYYYMMDD-##`) |
| `shipment_id` | FK → `shipments` (authoritative linkage; auto-created from a Formal Shipment) |
| `warehouse_id` | **origin** overseas `warehouses.warehouse_id` (structured; **never inferred from ship-from text**) |
| `company` | validated company (company-scoped identity) |
| `operation_type` | `outbound` (fixed for this table) |
| `operation_status` | operation lifecycle — see §7 (**distinct dimension from `api_status`**) |
| `api_status` | WMS/integration submission state — see §7 (**distinct dimension from `operation_status`**) |
| `requested_units` / `requested_cartons` | requested totals (from shipment) |
| `reserved_units` | rolled-up reserved qty (set at Lock; released on cancel) |
| `shipped_units` / `shipped_cartons` | rolled-up **actual** shipped (Σ confirmation lines) |
| `locked_at` / `locked_by` | reserve audit |
| `instruction_submitted_at` / `instruction_submitted_by` | Outbound Instruction Push audit |
| `acknowledged_at` | WMS acknowledgement |
| `first_shipped_at` / `last_shipped_at` | shipout window |
| `cancelled_at` / `cancelled_by` / `cancel_reason` | cancellation + reserve-release audit |
| `closed_at` / `closed_by` / `close_reason` | close audit (shipped ≠ closed — §7) |
| **`source_type` / `source_request_id`** | planning provenance (e.g. `inbound_planning_request` + id); intent SSOT is the Inbound Planning Request, execution SSOT is the Formal Shipment |
| **`destination_inbound_operation_id`** | cross-link to the parallel **destination Inbound operation** created by the SAME Formal Shipment orchestrator (`SHIPMENT_CENTER_SPEC.md` §23.11) — reference only |
| **`submission_mode` / `submission_status` / `submitted_at`** | Outbound Instruction Push channel + state + timestamp (distinct from `api_status`; blank in Phase-1 manual) |
| **`last_api_attempt_at` / `last_api_error`** | last external attempt time + error (diagnostics; no fake success) |
| **document/attachment** | referenced via the **Document Engine** (`generated_documents.related_entity_type='overseas_outbound_operation'`, `related_entity_id = outbound_operation_id`, `document_id`; `DOCUMENT_GENERATION_SYSTEM_SPEC.md` §D) — **no binary in this header** |
| `created_by` / `created_at` / `updated_by` / `updated_at` | audit (placeholder actors) |
| `note` | free text |

**Operation uniqueness:** `shipment_id + warehouse_id + operation_type` (idempotent auto-create — `SHIPMENT_CENTER_SPEC.md` §23.7). This origin Shipout Instruction and the parallel destination Inbound are **both created/linked by the Formal Shipment orchestrator** (`SHIPMENT_CENTER_SPEC.md` §23.11) — the destination Inbound never creates this record.

## 4. Operation lines — `overseas_outbound_operation_lines`
| Column | Notes |
|--------|-------|
| `outbound_operation_line_id` | PK |
| `outbound_operation_id` | FK |
| `sku` / `site_sku` | product identity |
| `requested_qty` | requested outbound qty (copied from shipment line) |
| `approved_qty` | approved-to-fulfill qty (may equal requested) |
| `reserved_qty` | qty reserved at Lock (`available → reserved`) |
| `shipped_qty` | rolled-up **actual** shipped (Σ confirmation lines) — **never the requested qty** |
| `units_per_carton` | from `sku_details` |
| `line_status` | `pending` / `reserved` / `partially_shipped` / `shipped` / `cancelled` / `closed` |
| `note` / `created_at` / `updated_at` | audit |

## 5. Ship confirmations — `overseas_outbound_confirmations`
A confirmation is **one physical shipout event** (supports **partial shipment** — many confirmations per operation).
| Column | Notes |
|--------|-------|
| `confirmation_id` | PK |
| `outbound_operation_id` | FK |
| `confirmation_no` | human-facing (e.g. `SHOUT-YYYYMMDD-##`) |
| `confirmation_status` | `draft` / `confirmed` / `reversed` |
| `shipped_at` / `confirmed_by` | actual shipout date + actor |
| `confirmation_idempotency_key` | **required** — de-dupes a confirmed shipout (a retried confirmation with the same key posts inventory **once**) |
| `wms_shipment_ref` / `tracking_number` | external WMS/carrier references |
| `movement_posted` / `movement_batch_id` | whether/where this confirmation's `overseas_inventory_movements` were posted |
| `reversal_of_confirmation_id` | set when this row reverses/corrects a prior confirmation |
| `note` / `created_at` / `updated_at` | audit |

## 6. Confirmation lines — `overseas_outbound_confirmation_lines`
| Column | Notes |
|--------|-------|
| `confirmation_line_id` | PK |
| `confirmation_id` | FK |
| `outbound_operation_line_id` | FK (the operation line being shipped against) |
| `sku` / `site_sku` | product identity |
| `shipped_qty_this_confirmation` | **actual** qty shipped in THIS confirmation — the **only** qty deducted |
| `note` / `created_at` | audit |

---

## 7. Lifecycle, status dimensions, partial, cancellation

**Two separate status dimensions (never one field):**
- `operation_status ∈ {draft, locked, submitted, acknowledged, picking, packed, ready_to_ship, partially_shipped, shipped, cancelled, closed, exception}`
- `api_status ∈ {not_submitted, submitted, acknowledged, error, retry}` (WMS integration state)

**Lifecycle:** `draft → locked → submitted → acknowledged → picking → packed → ready_to_ship → (partially_shipped)* → shipped → closed`. Cancellable up to shipout.

- **Draft → Lock:** Lock reserves stock (`overseas_inventory` `available → reserved`, `reserved_qty` set). **Reserve happens at Lock, never at Draft.** No physical deduction.
- **Submit (Outbound Instruction Push, KM→WMS):** submits the instruction; `api_status = submitted`. **No physical deduction.** Blocked if provider-required fields are missing (missing-field checklist — `WAREHOUSE_OPERATIONS_SPEC.md` §8).
- **Acknowledge → picking → packed → ready_to_ship:** operational progress; still no deduction.
- **Ship Confirm (Shipout Confirmation Push, WMS→KM):** posts `overseas_inventory_movements` and **deducts `current_stock` and `reserved_stock` by the actual shipped qty only**. **Partial Ship Confirm deducts only `shipped_qty_this_confirmation`.** Operation stays `partially_shipped` until all lines are fully shipped or closed.
- **Cancellation:** cancelling before shipout **releases the reserve** (`reserved → available`, `reserved_qty → 0`); it never deducts physical stock. A partially-shipped operation cancels only its **unshipped remainder** (already-shipped qty stays deducted).
- **Shipped ≠ Closed:** reaching fully-shipped qty is `shipped`; **Close** is an explicit terminal action (`closed_at`/`closed_by`/`close_reason`) after which no new confirmations post without a reversal.

## 8. Movement posting (references inventory spec — not restated here)
- **Confirmed shipout** posts `overseas_inventory_movements` (+ updates `overseas_inventory_snapshot`): `current_stock −= shipped_qty`, `reserved_stock −= shipped_qty`, keyed by `confirmation_idempotency_key` so a retry posts **once**.
- **Factory Inventory is NOT affected by an Overseas Outbound operation** (`DATABASE_RELATIONSHIP_MAP.md` §6.0). Factory stock reservation/deduction uses only the factory tables.
- **Formal Shipment creation does NOT decrease Overseas Inventory** — only a confirmed shipout does. Goods in transit remain a transportation state; **in-transit goods are never double-counted** at both endpoints.

## 9. Reversal / correction
A confirmed shipout is corrected by a **reversing confirmation** (`reversal_of_confirmation_id` set; own idempotency key) posting a compensating movement (restores `current_stock`/`reserved_stock` as appropriate) — the original is never silently mutated. Audit trail preserved.

## 10. Idempotency (distinct keys — 8 scopes, never one shared key)
Separate idempotency keys are required per externally-visible action; a key is **never reused** across actions. Full dual-direction set (`SHIPMENT_CENTER_SPEC.md` §23.11): (1) destination inbound operation create/link (`OVERSEAS_INBOUND_SPEC.md`), (2) destination inbound external submission, (3) label/document retrieval, (4) **origin shipout operation create/link** (`shipment_id + warehouse_id + operation_type=outbound`), (5) **origin shipout instruction submission** (Outbound Instruction Push), (6) receipt confirmation (`OVERSEAS_INBOUND_SPEC.md`), (7) **shipout confirmation** (`confirmation_idempotency_key`), (8) **reversal/correction** (own key per reversing confirmation). Each guarantees a repeated call is a no-op on its already-applied effect.

## 11. Relationship to allocation / reserve-deduct binding
Reserve @ Lock / Deduct @ Ship Confirm is the overseas-warehouse counterpart of the factory reserve/deduct binding (`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` P1-B / `SHIPMENT_CENTER_SPEC.md` §15.1). The shipment-line allocation link (`shipment_line_allocations` — planned; `DATABASE_RELATIONSHIP_MAP.md` §8B) ties outbound lines to their supply source. All **PLANNED — NOT implemented.**

---

## 12. Out of Scope / Deferred
Code · UI · Apps Script · API · DB migration · the actual inventory posting mechanics (owned by the inventory specs) · `warehouse_outbound_addresses` / `warehouse_outbound_packages` / `warehouse_outbound_package_items` (deferred tables — `WAREHOUSE_OPERATIONS_SPEC.md` §9) · external WMS credential storage (only a `credential_reference` pointer, never a secret) · Role & Permission. **World Map is secondary/deferred** — primary view is KPI + Table + Detail Drawer.

---

**Draft v1 — Spec only. All `overseas_outbound_*` tables are planned design, NOT created / NOT implemented. No runtime, UI, API, Apps Script, DB, or live-data change is implied.**

**End of Document**
