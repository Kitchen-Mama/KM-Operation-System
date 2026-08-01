# Overseas Inbound Spec — Destination Receiving Operation (CANONICAL) + Inbound Planning Request (planning-layer)

**Status:** 🟡 Draft v2.2 — Spec only (NO code, NO Apps Script, NO DB migration, NO UI) — v2.1 = Batch B · B-2/B-3 residual: corrected the stale "six-value key" cross-reference to the five-value Shipping Group Key · **v2.2 (2026-08-01, Round 4D-C) added the External-Discovered Inbound review/adoption relationship (documentation only; Runtime NOT implemented)**
**Last Updated:** 2026-07-31
**Maintained By:** Development Team
**Related:** [`WAREHOUSE_OPERATIONS_SPEC.md`](./WAREHOUSE_OPERATIONS_SPEC.md), [`OVERSEAS_OUTBOUND_SPEC.md`](./OVERSEAS_OUTBOUND_SPEC.md), [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md)

> **Spec only.** New tables described here are *planned* design, not implemented. No code, Apps Script, API, DB migration, or UI.

> **UI STATUS UPDATE (2026-07-23).** A **Preview-Mode Operation Workspace UI** now exists for the Overseas Inbound page (interactive list / KPI / create-edit drawer / warehouse selector / shipment mapping / SKU-lines editor / receipt lifecycle / projected Movement-Impact panel / empty-loading-error states). It is a **non-authoritative front-end shell only**: the operation lifecycle runs in an **in-memory session store** and **no `overseas_inventory_movements` are posted and nothing is persisted** — the §10/§11 runtime tables + handlers are still NOT implemented. Selectors and the movement projection read real `shipments`/`shipment_lines`/`warehouses`/`overseas_inventory_snapshot`. The workspace lifecycle actions map 1:1 to the planned handlers so binding to real writers requires no drawer rework. See `project-current-state.md` (2026-07-23 Overseas workspace entry).

> **AUTHORITY & NAMING (CANONICAL 2026-07-22).** "**Overseas Inbound**" (the user-facing Warehouse page) means **exclusively the destination-side Warehouse Receiving Operation** — see **§9 (page)** and **§10 (operation contract)**, which are the authoritative definition of this spec. The earlier pre-shipment *planning* concept is **renamed to "Inbound Planning Request"** (a planning-layer input that lives on Overseas Inventory / Overseas Stock) and **no longer owns the Overseas Inbound page or its name**. The Inbound Planning Request and the Warehouse Receiving Operation are **separate records with separate lifecycles** — they are **never the same row/table**. Sections §§2–8 below are the historical planning-input framing, now **retitled Inbound Planning Request** and retained for continuity; where they conflict with §9/§10, **§9/§10 govern.**

---

## 1. Purpose & Positioning

- **(a) Overseas Inbound — Warehouse Operation layer — CANONICAL (§9 page + §10 contract):** the **dedicated Overseas Inbound page** representing the **destination overseas warehouse receiving / pre-advice operation** and its WMS/API details. It is **auto-created / linked from a FORMAL Shipment** (downstream of Execution), inherits Shipment fields, submits pre-advice, monitors API status, and records receipt results — driving Overseas Inventory movements **only on confirmed receipt**. **Delivered ≠ Received. Do NOT mix any Outbound UI into this page.**
- **(b) Inbound Planning Request — planning-layer input (§§2–8, renamed):** the earlier `overseas_inbound` / `overseas_inbound_lines` *pre-shipment planning draft* that flows Overseas Stock → Create **Inbound Planning Request** → Weekly Shipping Plan → approval → Execution Commit. This is a **planning input**, **NOT** a Shipment Draft, **NOT** an execution record, and **NOT** the Warehouse Receiving Operation.

An **Inbound Planning Request** captures "we intend to bring these SKUs into this overseas warehouse/site." Once submitted, it flows through the **Weekly Shipping Plan (Decision Layer)** for approval before any Execution-Layer Shipment Draft is created. Overseas inventory is only updated **after** the resulting shipment is **received** by the Warehouse Receiving Operation (§10) — never by the planning request, and never merely because a shipment was Delivered.

**Layer roles (must hold):**

| Stage | Layer | Owns |
|-------|-------|------|
| **Inbound Planning Request** | **Planning Input** | `overseas_inbound` + `overseas_inbound_lines` — the intended inbound (editable, not committed) |
| **Weekly Shipping Plan** | **Decision Layer** | `shipping_plans` + `shipping_plan_lines` — the approval workflow |
| **Shipment Draft / Overview** | **Execution Layer** | `shipments` + `shipment_lines` — the physical movement |
| **Overseas Inbound (Warehouse Receiving Operation)** | **Warehouse Operation** | `overseas_inbound_operations` + `_operation_lines` + `overseas_inbound_receipts` + `_receipt_lines` (§10) — auto-created from a Formal Shipment; records actual receipt |
| **Overseas Inventory Update** | **Inventory Update** | `overseas_inventory_snapshot` / `overseas_inventory_movements` — stock changes **only** on confirmed receipt |

This mirrors the layered architecture in [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md): each layer copies upstream truth into its own records and never mutates upstream (Immutable Flow). **The Inbound Planning Request (planning) and the Overseas Inbound Warehouse Receiving Operation (§10) are distinct layers with distinct tables — never one shared record.**

> **Warehouse → Overseas Inbound (navigation note).** The actionable **Overseas Inbound** page lives under the **Warehouse** navigation group ([`WAREHOUSE_OPERATIONS_SPEC.md`](./WAREHOUSE_OPERATIONS_SPEC.md) §4) and **links to the physical `shipment_id`** — it does **not** duplicate Shipment Overview (the full history/map/document view). For a consolidated shipment (multiple linked Weekly Plans → one `shipment_id`), the receiving operation shows **one physical inbound** keyed by that single `shipment_id`. **NOT IMPLEMENTED.**

> **Inbound Planning Request ≠ Warehouse Receiving (CANONICAL SCOPE NOTE).** §§2–8 define the **Inbound Planning Request (pre-shipment planning input) only** — they do **not** define the Warehouse Receiving transaction or Inventory Movement reconciliation (owned by §10). The **Inbound Planning Request must NOT**: directly create a Shipment Draft · directly deduct Factory Stock · directly increase `overseas_inventory_snapshot` · define actual received quantity · define damaged / missing / over-received quantities · close a Shipment · bypass Weekly Shipping Plan approval. Its flow is: **Overseas Stock → Create Inbound Planning Request → Submit to Weekly Shipping Plan → Decision approval → explicit Execution Commit (Shipment) → Formal Shipment auto-creates the Overseas Inbound Receiving Operation (§10) → confirmed receipt updates inventory.** Stock changes only on confirmed receipt, in the Warehouse Receiving Operation.

---

## 2. Flow (end-to-end) — Inbound Planning Request (planning layer)

> **Naming:** in §§2–8, "**Inbound Planning Request**" is the canonical name for the planning-input record (`overseas_inbound` / `overseas_inbound_lines`); the older label "Inbound Draft" is equivalent and retained only where it appears in downstream historical text.

```
Overseas Stock
   → Create Inbound Planning Request   (overseas_inbound, status = draft)
   → Add SKU Lines                     (overseas_inbound_lines)
   → Submit to Weekly Shipping Plan    (status = submitted_to_shipping_plan)
        ↓  creates
   Weekly Shipping Plan + shipping_plan_lines   (Decision Layer; status = draft/pending_approval)
        ↓  Pending Approval → Approved (Decision Layer approval — UNCHANGED)
        ↓  explicit Execution Commit (Approved → Create Shipment Draft; NOT automatic on approval)
   Shipment Draft + shipment_lines     (Execution Layer; created by the explicit Execution Commit, per SHIPMENT_CENTER_SPEC / WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §12.1)
        ↓  Formal Shipment auto-creates the Overseas Inbound Receiving Operation (§10)
   Shipment Overview                   (shipped → in_transit → arrived → delivered)
        ↓  confirmed receipt (§10 — NOT merely Delivered)
   Overseas Inventory 入庫              (overseas_inventory_snapshot / _movements updated only on confirmed receipt)
```

**The Inbound Planning Request never skips the Weekly Shipping Plan.** Submit does **not** create a Shipment Draft directly; it creates a Weekly Shipping Plan that must be approved first. The **receiving operation** (§10) is a separate downstream record, not this planning request.

---

## 3. Core Principles (Inbound Planning Request)

- **Inbound Planning Request = Planning Input.** It is a proposal, not a commitment.
- **Weekly Shipping Plan = Decision Layer.** All submit/approve/reject lives there (this spec does **not** add a parallel approval workflow).
- **Shipment Draft = Execution Layer.** Created only from an **approved** Weekly Shipping Plan (existing behavior — see `SHIPMENT_CENTER_SPEC.md`).
- **Overseas Stock Receiving = Inventory Update.** Stock (`overseas_inventory_snapshot.wh_available_stock` / physical) changes **only** when the shipment is **received**, via `overseas_inventory_movements` (the existing inventory update path).
- **Must NOT:** deduct `factory_stock` directly · write `overseas_inventory_snapshot.wh_available_stock` directly at submit/approve · bypass Weekly Shipping Plan approval · create a Shipment Draft directly from an Inbound Draft.

---

## 4. Inbound Planning Request Header — `overseas_inbound` (v1)

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

## 5. Inbound Planning Request Lines — `overseas_inbound_lines` (v1)

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
- **Never** deduct `factory_stock` directly, **never** write `overseas_inventory_snapshot.wh_available_stock` directly, **never** bypass Weekly Shipping Plan approval.

---

## 7. Non-Goals (v1)

Do **not** implement now: code · UI · Apps Script · API · DB migration · a parallel approval workflow on the inbound record · direct Shipment Draft creation · factory-stock deduction · direct overseas-stock write · carrier rate calculation · document generation · Role & Permission.

---

## 8. Open Items

- Exact Submit → Weekly Shipping Plan mapping (which header fields seed the plan; grouping key alignment with the plan's **five-value Shipping Group Key** — `company + country + origin_endpoint + destination_endpoint + shipping_method`; Marketplace is NOT a key field, B-2/B-3 RESOLVED 2026-07-31, `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.1).
- Inbound → plan → shipment linkage fields (`submitted_shipping_plan_id`, etc.).
- Receiving reconciliation: matching a received shipment back to the originating Inbound Draft for reporting.
- Editing after submit (must go through the Weekly Shipping Plan; inbound stays locked).
- Multi-warehouse / mixed-origin inbound splitting.

---

## 9. Overseas Inbound Page — Warehouse Operation Layer (CANONICAL 2026-07-21 — SPEC ONLY; runtime NOT implemented)

Authority for endpoint semantics / detection / auto-create / gates: `SHIPMENT_CENTER_SPEC.md` §23; page layout: `WAREHOUSE_OPERATIONS_SPEC.md` §4.

- **Dedicated, separate page.** "Overseas Inbound" is its own navigation route + page (explicit label — not "Inbound"). It shares only reusable UI components with Overseas Outbound / Overseas Inventory; routes, state, primary actions, queries, validation, and lifecycle are separate. **Never render Outbound operations on this page.**
- **Purpose:** show goods moving toward overseas warehouses · expected arrival quantities · complete inbound/WMS-required details · submit inbound **pre-advice** · monitor API status · record receipt results + exceptions.
- **Formal Shipment → auto-create / link Inbound Draft (idempotent):** when a Shipment becomes formal (or reaches the canonical operation-creation trigger), if `destination_warehouse_id` resolves to a **qualifying overseas warehouse** (active `warehouses` record, `is_factory_warehouse` **not TRUE**, `is_receiving_enabled = TRUE`, integration-supported) → create/link **one** Overseas Inbound Draft. Idempotency key = **shipment + destination warehouse + inbound direction** (repeat runs never duplicate). `shipment_id` is the authoritative linkage; the user is **not** asked to search for or manually create the operation.
- **Destination warehouse classification.** Factory warehouses (`is_factory_warehouse = TRUE`) never create an Overseas Inbound. Do **not** rely solely on `warehouse_type = 3PL`. Company-scoped: KM vs ResUS AMZLGS are distinct identities and never cross-route (match by `warehouse_id` + validated company).
- **Shipment field inheritance.** Copy common Shipment data (company, destination warehouse identity, SKU + quantity lines, cartons, ETD/ETA, tracking) into the operation; do **not** restate route/documents/events — reference the shipment. Warehouse identity is the structured `destination_warehouse_id` / `warehouse_id` — **never inferred from `destination` text**.
- **WMS detail completion + pre-advice submission (gate).** Saving the Shipment Draft is allowed even when WMS details are incomplete. Selecting the managed overseas destination shows a **non-blocking** notice ("This shipment is destined for a managed overseas warehouse. An Overseas Inbound operation will be created and may require additional warehouse details before submission."). **Submitting the pre-advice to WMS/API is blocked** when provider-required fields are missing — show the exact missing-field checklist + a direct action to open the operation record.
- **Receipt completion → inventory movement boundary.** On confirmed receipt, record receipt results (incl. overage/shortage/damage where applicable); **Overseas Inventory balances change only on confirmed receipt**, via `overseas_inventory_movements` (posting rules owned by the inventory specs — this page does not define them). This page does **not** deduct factory stock or write `overseas_inventory_snapshot` directly.
- **Operation status vs API status** are separate badges (operation lifecycle vs WMS submission state).

---

## 10. Overseas Inbound Receiving Operation — Contract (CANONICAL 2026-07-22 — SPEC ONLY; runtime + tables NOT implemented)

This is the authoritative **destination-side Warehouse Receiving Operation** contract. All tables below are **planned design — not created / not implemented**. Movement-posting into `overseas_inventory_snapshot` / `overseas_inventory_movements` is **referenced** here but **owned by the inventory specs** (`INVENTORY_TABLE_MAPPING_SPEC.md` / `DATABASE_RELATIONSHIP_MAP.md` §6.0) — this spec does not restate the posting mechanics.

### 10.1 Operation header — `overseas_inbound_operations`
| Column | Notes |
|--------|-------|
| `inbound_operation_id` | PK |
| `inbound_operation_no` | human-facing (e.g. `IBO-YYYYMMDD-##`) |
| `shipment_id` | FK → `shipments` (authoritative linkage; **auto-created from a Formal Shipment**) |
| `warehouse_id` | destination overseas `warehouses.warehouse_id` (structured; **never inferred from destination text**) |
| `company` | validated company (company-scoped identity; KM ≠ ResUS even for same provider) |
| `operation_type` | `inbound` (fixed for this table) |
| `operation_status` | operation lifecycle — see §10.5 (**distinct dimension from `api_status`**) |
| `api_status` | WMS/integration submission state — see §10.6 (**distinct dimension from `operation_status`**) |
| `expected_units` / `expected_cartons` | expected totals (from shipment) |
| `received_units` / `received_cartons` | rolled-up actual good received (Σ receipt lines) |
| `pre_advice_submitted_at` / `pre_advice_submitted_by` | pre-advice push audit |
| `first_received_at` / `last_received_at` | receiving window |
| `closed_at` / `closed_by` / `close_reason` | close audit (received ≠ closed — §10.7) |
| **`source_type` / `source_request_id`** | planning provenance (e.g. `inbound_planning_request` + its id) — the planning intent SSOT is the Inbound Planning Request; this operation is downstream of the Formal Shipment |
| **`origin_shipout_operation_id`** | cross-link to the parallel **origin Shipout Instruction** created by the SAME Formal Shipment orchestrator (§11 / `SHIPMENT_CENTER_SPEC.md` §23.11). The Inbound never *creates* it — this is a reference only |
| **`external_inbound_id` / `external_inbound_reference`** | external warehouse/platform/carrier inbound reference retrieved after external submission (future) |
| **`submission_mode` / `submission_status` / `submitted_at`** | external-submission channel + state + timestamp (distinct from `api_status`; blank in Phase-1 manual) |
| **`label_status` / `label_retrieved_at`** | retrieved shipping-label / carton-label / appointment-document state + timestamp |
| **`last_api_attempt_at` / `last_api_error`** | last external attempt time + error (diagnostics; no fake success) |
| **document/attachment** | **referenced via the Document Engine** — `generated_documents.related_entity_type = 'overseas_inbound_operation'`, `related_entity_id = inbound_operation_id`, `document_id` reference (`DOCUMENT_GENERATION_SYSTEM_SPEC.md` §D). **Label/carton-label/appointment binaries are NEVER stored in this header** |
| `created_by` / `created_at` / `updated_by` / `updated_at` | audit (placeholder actors; future Role & Permission) |
| `note` | free text |

**Operation uniqueness:** `shipment_id + warehouse_id + operation_type` (§6/§7 auto-create idempotency). The destination Inbound and the origin Shipout Instruction are **both created/linked by the Formal Shipment orchestrator** — the Inbound never creates the Shipout (dual-direction orchestration + Phase-1 manual boundary: **§11** / `SHIPMENT_CENTER_SPEC.md` §23.11).

### 10.2 Operation lines — `overseas_inbound_operation_lines`
| Column | Notes |
|--------|-------|
| `inbound_operation_line_id` | PK |
| `inbound_operation_id` | FK |
| `sku` / `site_sku` | product identity |
| `expected_qty` | planned/expected inbound qty (copied from shipment line; **planned only, never the inventory increase**) |
| `received_good_qty` | rolled-up good qty received (Σ receipt lines, this SKU) |
| `received_damaged_qty` | rolled-up damaged qty received |
| `over_short_qty` | derived reconciliation = `received_good_qty + received_damaged_qty − expected_qty` (positive = over, negative = short) |
| `units_per_carton` | from `sku_details` |
| `line_status` | `pending` / `partially_received` / `received` / `closed` |
| `note` / `created_at` / `updated_at` | audit |

### 10.3 Receipts — `overseas_inbound_receipts`
A receipt is **one physical receiving event** against the operation (supports **partial receipt** — many receipts per operation).
| Column | Notes |
|--------|-------|
| `receipt_id` | PK |
| `inbound_operation_id` | FK |
| `receipt_no` | human-facing (e.g. `RCPT-YYYYMMDD-##`) |
| `receipt_status` | `draft` / `confirmed` / `reversed` |
| `received_at` / `received_by` | actual receipt date + receiver |
| `receipt_idempotency_key` | **required** — de-dupes a confirmed receipt (a retried confirmation with the same key posts inventory **once**) |
| `wms_receipt_ref` | external WMS receipt reference (when applicable) |
| `movement_posted` / `movement_batch_id` | whether/where this receipt's `overseas_inventory_movements` were posted |
| `reversal_of_receipt_id` | set when this row reverses/corrects a prior receipt |
| `note` / `created_at` / `updated_at` | audit |

### 10.4 Receipt lines — `overseas_inbound_receipt_lines`
| Column | Notes |
|--------|-------|
| `receipt_line_id` | PK |
| `receipt_id` | FK |
| `inbound_operation_line_id` | FK (the operation line being received against) |
| `sku` / `site_sku` | product identity |
| `received_good_qty` | good/sellable qty this receipt |
| `received_damaged_qty` | damaged qty this receipt |
| `over_receipt_qty` / `short_receipt_qty` | reconciliation vs expected (informational; over-receipt allowed but flagged) |
| `damage_disposition` | `quarantine` / `scrap` / `return_to_vendor` / `pending` (disposition of the damaged qty) |
| `note` / `created_at` | audit |

### 10.5 Partial / over / short / damaged rules
- **Partial receipt:** multiple `overseas_inbound_receipts` may confirm against one operation; each posts **only the good qty received in that receipt**. The operation is not closed until it is explicitly closed (§10.7).
- **Over-receipt:** allowed but **flagged** (`over_receipt_qty > 0`); the good over-received qty still increases inventory (the physical goods exist), with an exception surfaced for review.
- **Short receipt:** `short_receipt_qty > 0` is recorded; the operation stays `partially_received` (open) so the remainder can arrive or be closed short with a reason.
- **Damaged qty:** `received_damaged_qty` **never increases sellable inventory**; it is posted (if at all) to a **damaged** stock bucket per the inventory spec and carries a `damage_disposition`. **Only eligible good quantity increases sellable inventory.**

### 10.6 Movement posting (references inventory spec — not restated here)
- **Confirmed receipt** (`receipt_status = confirmed`) posts `overseas_inventory_movements` (+ updates `overseas_inventory_snapshot`) for the **good received qty** only, keyed by `receipt_idempotency_key` so a retry posts **once**.
- **Never** directly changes `factory_stock` / `factory_stock_movements`.
- **Delivered ≠ Received:** a carrier `delivered` event **never** posts inventory; only a confirmed Warehouse Receipt does (`SHIPMENT_ROUTE_AND_EVENT_SPEC.md` §5.4).
- **Formal Shipment creation does NOT increase Overseas Inventory** — goods in transit are a transportation state (`DATABASE_RELATIONSHIP_MAP.md` §6.0).

### 10.7 Reversal / correction; Received vs Closed
- **Reversal / correction:** a confirmed receipt is corrected by a **reversing receipt** (`reversal_of_receipt_id` set; own idempotency key) that posts a compensating `overseas_inventory_movements` entry — the original is never silently mutated. Audit trail preserved.
- **Received ≠ Closed (two separate states):** an operation reaching fully-received quantity is **`received`** but stays open for late corrections/returns; **Close** is an explicit terminal action (`closed_at`/`closed_by`/`close_reason`) after which no new receipts post without a reversal. `operation_status` and `api_status` are **separate dimensions** (never one field): `operation_status ∈ {draft, submitted, acknowledged, receiving, partially_received, received, closed, exception}`; `api_status ∈ {not_submitted, submitted, acknowledged, error, retry}`.

### 10.8 Idempotency (distinct keys — 8 scopes, never one shared key)
Separate idempotency keys are required for each externally-visible action; a key is **never reused** across actions (each guarantees a repeated call is a no-op on its already-applied effect). Full dual-direction set (`SHIPMENT_CENTER_SPEC.md` §23.11):
1. **destination inbound operation create/link** (`shipment_id + warehouse_id + operation_type=inbound`).
2. **destination inbound external submission** (`submission_status` / `submitted_at`).
3. **label / document retrieval** (`label_status` / `label_retrieved_at`).
4. **origin shipout operation create/link** (`shipment_id + warehouse_id + operation_type=outbound` — owned by `OVERSEAS_OUTBOUND_SPEC.md`; created by the Formal Shipment orchestrator, **not** by this Inbound).
5. **origin shipout instruction submission** (Outbound Instruction Push; `OVERSEAS_OUTBOUND_SPEC.md`).
6. **receipt confirmation** (`receipt_idempotency_key`).
7. **shipout confirmation** (`confirmation_idempotency_key`; `OVERSEAS_OUTBOUND_SPEC.md`).
8. **reversal / correction** (own key per reversing receipt/confirmation).

---

## 11. Dual-Direction Fulfillment Orchestration (FUTURE; Phase-1 MANUAL — this Inbound's role)

> **Canonical owner of the end-to-end orchestration = `SHIPMENT_CENTER_SPEC.md` §23.11.** This section states only this **destination Inbound's** role within it. **Runtime NOT implemented; Phase-1 is fully manual.**

- **Terminology boundary (MUST hold):** this **Overseas Inbound Receiving Operation is the destination receiving record ONLY.** It does **NOT** create/push the origin Shipout Instruction, does **NOT** own factory shipout creation, and is **NOT** the planning SSOT. The **Formal Shipment orchestrator** idempotently creates/links **both** the destination Inbound and the origin Shipout Instruction (`SHIPMENT_CENTER_SPEC.md` §23.11). `origin_shipout_operation_id` on this header is a **reference to** that parallel record, not a creation authority.
- **External submission + label retrieval (future):** the destination Inbound data **may** be submitted to an external warehouse/platform/carrier system; the system **may** retrieve `external_inbound_id`/reference + shipping label + carton label + appointment documents. Retrieved documents are referenced via the **Document Engine** (`generated_documents.related_entity_type='overseas_inbound_operation'`; `DOCUMENT_GENERATION_SYSTEM_SPEC.md` §D) — **never stored as binary in this header**.
- **Factory Shipping Package (future):** the origin **Shipout Instruction + destination inbound references + retrieved labels/documents** may be packaged together and provided to the factory / origin party for shipment execution. Origin shipment execution generates departure/shipping events; **destination receipt confirmation posts only confirmed good qty** to Overseas Inventory.
- **Phase-1 MANUAL (none implemented):** manually create/record the Inbound; manually maintain transit quantities + status; manually upload/register retrieved labels/inbound documents; manually assemble + hand the Factory Shipping Package to the factory; manually update departure/transit/arrival status; manually confirm receipt. **MUST NOT be claimed implemented:** automatic destination Inbound submission · automatic shipping-label retrieval · automatic origin Shipout creation · factory API delivery · WMS/API synchronization · automatic inventory reservation/deduction · automatic Formal Shipment orchestration.

---

## External-Discovered Inbound — Review / Adoption Relationship (CANONICAL 2026-08-01 Round 4D-C — documentation only; Runtime NOT implemented)

- An **externally discovered inbound** (OMS/WMS/platform, no accepted KM lineage) is **NOT automatically an Overseas Inbound Receiving Operation** and **not** a receipt.
- It enters **quarantine / review** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §12); contribution to planning / stock = **0** until resolved.
- **Adopt** may create or link a KM **Inbound Operation** through an explicit controlled action (orchestrator `SHIPMENT_CENTER_SPEC.md` §23.11); the original external reference is preserved.
- **Receive Confirm (§10) remains the sole inventory authority** — `overseas_inventory_snapshot` / `overseas_inventory_movements` change **only** on a validated, idempotent KM Receive Confirm; an **external receipt report alone never adds stock**.
- No fuzzy matching (stable source identity only). **No Runtime for quarantine / review / Adopt / receiving is implemented in this round.**

---

**Draft v2.2 — §§1–8 Inbound Planning Request (planning layer, renamed) + §9 page layer (canonical) + §10 Warehouse Receiving Operation contract (canonical, 2026-07-22) + §11 dual-direction orchestration role (future; Phase-1 manual; canonical owner = SHIPMENT_CENTER §23.11). Spec only — no code, DB, API, Apps Script, or UI changes are implied. All §10 tables are planned design, NOT implemented.**

**End of Document**
