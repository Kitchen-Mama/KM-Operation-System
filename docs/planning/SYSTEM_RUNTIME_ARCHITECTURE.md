# Kitchen Mama Operation System — Runtime Architecture

> **Owner Boundary (reviewed 2026-07-28).**
> - **Document Role:** the **Runtime Mapping** layer — service boundary, triggers, cadence, read/calculate/snapshot/write ownership, idempotency, commit boundary.
> - **Canonical Owner For:** service/trigger/cadence boundaries and runtime ownership classes.
> - **Not Owner For:** formulas (`SUPPLY_PLANNING_CALCULATION_RULES.md`), schema (`DATABASE_RELATIONSHIP_MAP.md`), E2E flow (`SUPPLY_CHAIN_SYSTEM_FLOW.md`), layer language (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`), the **Reserve Trigger** (B-1 owner = `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1).
> - **Status:** Reviewed — B-1 / B-2 / B-3 RESOLVED (decision only; owners §8A.1 / `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.1 / §3.1B); **B-4 CONTRACT RESOLVED — RUNTIME NOT IMPLEMENTED**; B-5 / B-6 / B-7 / B-8 UNRESOLVED.
> - **Current Version:** Draft v1.5 (Round 4D-C: landed the **External-Origin Quarantine → Admission pipeline** + fail-closed authority rule + notification-as-future-Runtime-service + DTO-first/Ledger-later; architecture only, no code/DB). v1.4 (Batch B Round 1: B-1 Reserve Trigger resolved as the **Ready to Ship transition (`draft → ready_to_ship`) = Formal Shipment Execution Commit** — decision only, runtime not started).
> - **Last Reviewed:** 2026-07-30.
> - **Depends On:** DB Map, System Flow, Calculation Rules (formulas), domain specs.
> - **Blocked By:** Batch B — **B-4 Qualified Incoming Runtime prerequisites** — canonical Shipment quantity reader, destination identity read, normalized supply candidates, authority/admission classification, deduplication, ten-gate Runtime and Line Runtime integration; the B-4 **contract itself is resolved** (see `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-4). **B-1 / B-2 / B-3 RESOLVED (decision only); B-4 CONTRACT RESOLVED — RUNTIME NOT IMPLEMENTED; B-5 / B-6 / B-7 / B-8 UNRESOLVED.**

**Status:** 🟡 Draft v1.5 — Runtime Architecture Specification (architecture only · NO code, NO Apps Script, NO API, NO SQL, NO DB change, NO implementation; Batch A canonical repair 2026-07-28; Batch B Round 1 B-1 resolution 2026-07-30; Round 4D-C External-Origin Quarantine/Admission pipeline 2026-08-01)
**Last Updated:** 2026-08-01
**Maintained By:** Development Team / Enterprise System Architect
**Scope:** Authoritative **runtime blueprint** for the whole system — how data flows at runtime, who owns it, what triggers recalculation, and how layers depend on one another.

**Authority / source documents (this doc synthesizes, it does not override them):**
- [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) — table relationships / entity layers.
- [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md) — operational weekly flow + persistence rules.
- [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) — **authoritative for all calculation formulas** (runtime must not duplicate them).
- [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) — shipment lifecycle, reservation/deduction timing.
- [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) — **CURRENT** Procurement Phase 1 (implemented schema, Request/PO status lifecycle, Convert-to-PO, `available_to_ship`); [`PURCHASE_ORDER_SPEC.md`](./PURCHASE_ORDER_SPEC.md) — PO v2 Workspace / Receive. [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md) is the **EXTENDED / FUTURE** three-layer reference only (not current authority).
- [`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`](./AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md) — import framework, snapshot governance, freshness, quality, write-protection.

> **Rule-driven, not feature-driven.** Every design follows: **Business Rule → Database → Data Lifecycle → Runtime Mapping → Implementation.** This document is the *Runtime Mapping* layer. It is **not** an Apps Script design, **not** an API specification, and **not** an implementation document. Where this document and a domain spec differ, the **domain spec is authoritative**.

### Changelog

- **Draft v1.4 (2026-07-30, acceptance-corrected)** — **B-1 Reserve Trigger resolved** (owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1): the reserve event is the **successful Ready to Ship** transition (`draft → ready_to_ship`) = Formal Shipment Execution Commit — **distinct** from the non-reserving Create-Shipment-Draft (Execution Commit). §7 trigger table split into Plan-approval/Create-Draft (no reserve) · Ready-to-Ship (canonical reserve, Runtime Not Started) · Ship (existing `fac_current_stock` deduction; reserved-stock consumption not implemented). Removed the stale "BLOCKED — Exact reservation event requires Batch B" residual. Reserve identity = origin factory `warehouse_id + sku`; cancel/release = B-8. **Decision only — Runtime / trigger / atomic writer / reservation Not Started / Unverified; no trigger or writer deployed.**
- **Draft v1.5 (2026-08-01)** — Round 4D-C: landed the **External-Origin Quarantine → Admission pipeline**, the **fail-closed** authority rule (unknown/external-unlinked → contribution 0), **notification as a future Runtime service** (not UI-only), and **Runtime DTO first / Review-Reconciliation Ledger later** (derived, not SSOT). Architecture only; no code/DB/Runtime.
- **Draft v1.3 (2026-07-28)** — Batch A canonical repair: recorded the Factory Stock **Reserve event blocker** (B-1) and `fac_current_stock` deduct-only verified state; clarified **import ≠ recommendation**; reconciled the 16:00 cadence reference to §7A. (Changelog entry backfilled 2026-07-30.)
- **Draft v1.2 (2026-06-26)** — Named the **Daily Sales freshness fields** the runtime/UI must read — `latest_source_date`, `data_window_start_date`, `data_window_end_date`, `is_fallback_used`, `data_age_days` (now defined as importer-generated headers in `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` v1.4 §7.4 / §16). Updated §9 Freshness accordingly.
- **Draft v1.1 (2026-06-26)** — Aligned Daily Sales handling with `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` (import window + cadence owned there; the current canonical is the gap-aware rolling 90-completed-day upsert) and required that runtime/UI **expose the actual data date range used**; noted the Import Layer's **Amazon numeric placeholder normalization** (`365+`→`365`, `/`→null); refined freshness + open questions.
- **Draft v1 (2026-06-26)** — Initial Runtime Architecture: philosophy, canonical data flow, layers, lifecycle, module boundaries, dependency, triggers, recalculation, freshness, ownership, event flow, logging, service catalog, future API, design principles.

---

## 1. Runtime Philosophy

The system runs as a **one-directional pipeline**: data enters from sources, is frozen into snapshots, is interpreted by services, is computed by engines, becomes plans, becomes execution records, becomes documents, and is finally served. Each stage reads from the stage before it and **never writes backward**.

```
Source
   ↓
Import
   ↓
Snapshot              (single source of truth for imported data)
   ↓
Business Services     (interpret snapshots + master data)
   ↓
Calculation Engine    (formulas — SUPPLY_PLANNING_CALCULATION_RULES.md)
   ↓
Planning Engine       (replenishment / shipping plan / request order)
   ↓
Execution Modules     (shipments, purchase orders, factory stock movements)
   ↓
Documents             (generated from execution records)
   ↓
API                   (future serving layer)
```

**Philosophy statements (coding is NOT discussed here):**
- **Forward-only flow.** A later stage may read earlier stages; it must never mutate them.
- **Snapshots are frozen truth.** Once imported, a snapshot is the agreed reality until the next sync; downstream stages interpret it but never edit it.
- **Calculation is pure.** The calculation engine reads inputs and produces outputs; it writes **no** source data.
- **Plans are intentions, execution is reality.** Planning expresses what we intend; execution records what actually happened. They are separate stores.
- **Documents are derived.** They are rendered from execution records and can be regenerated at any time without changing anything upstream.

---

## 2. Canonical Data Flow (權威資料流)

This is the **single authoritative end-to-end flow** for the whole system. Every other chapter is a refinement of this picture.

```
Amazon API  (+ other external sources)
        │
        ▼
Amazon Snapshot (Raw)                     ← BigQuery / Google-Sheet source exports
        │
        ▼
Snapshot Tables (Single Source of Truth)  ← amazon_*_snapshot, overseas_inventory_snapshot
        │                                    governed by import_sync_runs / import_sync_issues
        ▼
Business Services
        │
        ├── Inventory Service
        ├── Forecast Service
        ├── Shipment Service
        └── Order Service
        │
        ▼
Calculation Engine                        ← formulas owned by SUPPLY_PLANNING_CALCULATION_RULES.md
        │
        ▼
Planning Modules                          ← Inventory Replenishment · Weekly Shipping Plan · Request Order
        │
        ▼
Execution Modules                         ← shipments · purchase_orders · factory_stock movements
        │
        ▼
Documents / Reports                       ← document_templates → generated_documents
        │
        ▼
Future API
```

**Reading the canonical flow:**
- **Snapshot Tables are the single source of truth** for all imported data. Business Services never re-read the raw Amazon export; they read the snapshot.
- **Business Services** are the only components allowed to interpret snapshots + master data into runtime concepts (available inventory, demand, shippable qty, order need).
- **Calculation Engine** consumes service outputs and applies the formula rules — it is stateless with respect to source data.
- **Planning → Execution → Documents → API** is the same forward chain as §1, expanded.

Everything below this chapter elaborates ownership, triggers, dependencies, and freshness **on top of this one flow**.

---

## 3. Runtime Layers

| # | Layer | Responsibility | Must NOT |
|---|-------|----------------|----------|
| 1 | **External Sources** | Origin of raw data: Amazon (API/report exports), BigQuery raw tables, factory/warehouse/carrier inputs | — |
| 2 | **Import Layer** | Read sources by header name, map → destination, normalize (incl. **Amazon numeric placeholders** `365+`→`365`, `/`→null), generate metadata/hash/batch, record runs/issues; for BigQuery daily sales apply the **gap-aware rolling 90-completed-day upsert** (window + strategy owned by `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` §7.4 — the earlier "latest-available fallback" is superseded and NOT executed) | interpret business meaning; substitute latest-available data for missing in-window dates |
| 3 | **Snapshot Layer** | Hold the **latest** imported snapshot as the **single source of truth**; import-only | be manually edited; hold permanent row-level history (MVP) |
| 4 | **Business Data Layer** | Master data + business services that interpret snapshots (SKU, marketplace, inventory, forecast, factory stock) | recompute planning math |
| 5 | **Calculation Layer** | Apply formula rules (projection, shortage/surplus, reallocation, order need, carton rounding) | write to source/snapshot |
| 6 | **Planning Layer** | Turn calculations into intentions: replenishment suggestions, shipping plans, request orders | own physical inventory |
| 7 | **Execution Layer** | Record reality: shipments, POs, factory stock movements, receiving | recalculate planning |
| 8 | **Presentation Layer** | Render pages/dashboards from the layers below; show freshness/quality warnings | be a source of truth |
| 9 | **API Layer** *(future)* | Serve the runtime services to clients; later replace Apps Script bridge | bypass services to touch DB directly |

Each layer depends **only on the layer(s) below it**. A higher layer never mutates a lower one.

---

## 4. Runtime Data Lifecycle

For each data type: where it comes from, who owns/writes/reads it, and how it lives. (Storage names reference existing/planned tabs per the source specs — no schema is defined or changed here.)

| Data type | Source | Owner | Importer | Storage | Who writes | Who reads | Freshness | Lifecycle |
|-----------|--------|-------|----------|---------|-----------|-----------|-----------|-----------|
| **Amazon Inventory** | Amazon report → Google Sheet "Combined Sheet" | OP / Supply Chain | Import Service | `amazon_inventory_snapshot` | Importer only | Inventory Service, dashboards | derived from `import_sync_runs` | clear-and-rewrite each sync |
| **Amazon Inventory Health** | Amazon report → Sheet | OP / Supply Chain | Import Service | `amazon_inventory_health_snapshot` | Importer only | Inventory Service | derived | clear-and-rewrite |
| **Weekly Sales** | Amazon report → Sheet | Sales / OP | Import Service | `amazon_weekly_sales_snapshot` | Importer only | Forecast Service, dashboards | derived | clear-and-rewrite |
| **Daily Sales** | BigQuery `Raw Daily Sales` | Sales / OP | Import Service — window + cadence owned by `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` §7.4 (gap-aware rolling **90-completed-day** upsert) and §7A (Daily Report Pipeline 12:00–13:00). *(Any earlier "rolling 4-day / 16:00 / latest-available fallback" wording is superseded by those owners; runtime implementation is UNVERIFIED.)* | `amazon_daily_sales_snapshot` | Importer only | Forecast Service, dashboards | derived; actual data date range exposed | rolling 90-day upsert (per owner) |
| **Forecast** | User + future AI | OP (forecast) | — (UI/edit) | `fc_regular_forecast`, `fc_special_events`, `fc_target_rules` | Authorized users | Calculation Engine, Request Order | last edit | user-maintained, periodic review |
| **Factory Stock** | Factory ops / movements | OP / Factory | — | `factory_stock`, `factory_stock_movements` | Execution events (deduct at Ship; reserve at Ready to Ship = Formal Shipment Execution Commit, B-1), authorized users | Planning, Shipment, Request | event-driven | **deduct `fac_current_stock` at Ship / Confirm Shipment & Dispatch (verified); reserve `fac_reserved_stock` at Ready to Ship = Formal Shipment Execution Commit (B-1 resolved, owner §8A.1; origin factory `warehouse_id + sku`; decision only — runtime Not Started); release/rollback = B-8** (§7 note / SYSTEM_FLOW §11 B-1) |
| **Overseas / 3PL / FBA Stock** | Receiving + Amazon API | OP / Supply Chain | Import (FBA) / receiving | `overseas_inventory_snapshot`, `overseas_inventory_movements` | Importer (FBA) / receiving | Inventory projection | derived/event | snapshot + movements |
| **Shipping Plan** | Planning (Submit Plan) | OP | — | `shipping_plans`, `shipping_plan_lines` | Planning (on submit/approval) | Shipment creation | plan timestamp | draft → approved → converted |
| **Shipment** | Execution (create from plan) | OP / Logistics | — | `shipments`, `shipment_lines` (+ events/routes) | Execution only | On-the-way, history, documents | execution timestamp | draft → … → completed |
| **Request Order** | Planning (下單系統) | OP / Procurement | — | `request_orders`, `request_order_lines`, `request_order_line_sources` | Planning (push) + approval | PO conversion | request timestamp | draft → pending → approved → converted |
| **Purchase Order** | Execution (from approved request) | Procurement / Factory | — | `purchase_orders`, `purchase_order_lines`, `production_schedule` | Execution only | Shipment allocation | execution timestamp | draft → issued → in_production → completed → closed |
| **Documents** | Derived from execution | Dev / System | — | `document_templates`, `generated_documents` | Document Service | users (download) | generated_at | regenerable, never authoritative |
| **Import Runs / Issues** | Importer | Dev / System | Import Service | `import_sync_runs`, `import_sync_issues` | Importer / System | freshness/quality, audit | per run | append per sync |
| **Replenishment Overrides** | User decisions | OP / Planner | — | `inventory_replenishment_overrides` | Authorized users | Calculation/Planning | edit time | user-maintained, traceable |
| **Daily Status** *(future)* | System calculation | OP / System | — | `inventory_replenishment_daily_status` | System calculation only | dashboards | recompute | derived, recomputable |

**Audit:** every snapshot row carries importer-generated metadata (`source_*`, `sync_batch_id`, `source_row_hash`, timestamps); every import produces an `import_sync_runs` record and zero-or-more `import_sync_issues` (see `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`).

---

## 5. Runtime Module Boundary

Each module owns one responsibility; **no module duplicates another's**.

| Module | Owns | Reads | Writes | Does NOT |
|--------|------|-------|--------|----------|
| **Import Module** | bringing external data in + governance | external sources | snapshot tabs, run/issue logs | interpret business meaning, calculate |
| **Inventory Module** | current inventory truth across sites + factory | inventory snapshots, movements | factory/overseas movements (via events) | forecast, plan shipments |
| **Forecast Module** | demand expectation (base/event/target) | sales snapshots, user input | forecast tabs | own inventory, decide orders directly |
| **Calculation Engine** | applying formula rules | inventory + forecast + factory + on-the-way | nothing persistent (produces values) | own data, persist source |
| **Planning Modules** | intentions: replenishment, shipping plan, request order | calculation outputs | `shipping_plans`, `request_orders` (on submit) | move physical stock, issue POs |
| **Shipment Module** | shipment execution + tracking | approved plans, factory stock | `shipments`/`shipment_lines`, stock reserve/deduct | recalculate the plan |
| **Order Module** | request approval + PO execution | approved requests, production | `purchase_orders`/lines, `production_schedule` | own the approval-vs-execution boundary incorrectly (approval = request layer) |
| **Document Module** | rendering documents | execution records + templates | `generated_documents` | change upstream records |

**Boundary rule:** when two modules seem to need the same write, the **lower-layer / owning module writes**, and the other module **reads**. Planning reads inventory; it does not write it. Shipment reads the plan; it does not rewrite it.

**Inventory-domain separation (CANONICAL 2026-07-21 — authority `DATABASE_RELATIONSHIP_MAP.md` §6.0).** The Inventory Module owns **two separate domains** with separate ledgers, never merged: **Factory Inventory** (`factory_stock` / `factory_stock_movements`) and **Overseas Inventory** (`overseas_inventory_snapshot` / `overseas_inventory_movements`). Factory reservation/deduction writes **only** factory tables; overseas receipt/outbound writes **only** overseas tables. A Shipment is **in-transit transportation state** (`shipments` / `shipment_events`), not an inventory balance — **formal Shipment creation adds no Overseas Inventory**; overseas balances change only on **confirmed Overseas Inbound receipt** (increase) / **confirmed Overseas Outbound ship-out** (decrease). **In-transit goods are never double-counted at both endpoints.** No runtime path may redirect factory writes into overseas ledgers (or vice-versa), and Warehouse Master never implies one universal ledger.

**Overseas Warehouse Operation module boundary (2026-07-22 — SPEC ONLY; canonical: `OVERSEAS_INBOUND_SPEC.md` §10 / `OVERSEAS_OUTBOUND_SPEC.md` / `SHIPMENT_CENTER_SPEC.md` §23).** The **Overseas Inbound (Receiving)** and **Overseas Outbound (Fulfillment)** operations are **two separate modules / pages** under the Warehouse group — never one combined operation — and are distinct from **Factory Inventory** and **Overseas Inventory** pages (four pages total; Warehouse Master lives under Admin → Master Data). They are **auto-created/linked from a Formal Shipment** (idempotent; operation uniqueness `shipment_id + warehouse_id + operation_type`; direction runtime-derived). **Inbound Planning Request (planning layer) ≠ Warehouse Receiving Operation (this module)** — separate records/lifecycles. Runtime event flow: **auto-create ≠ auto-submit**; **Lock reserves** overseas stock (`available → reserved`); the **Outbound Instruction Push (KM → WMS)** at Submit moves **no** physical stock; the **Shipout Confirmation Push (WMS → KM)** posts the deduction of **actual shipped qty only** (partial = `shipped_qty_this_confirmation`); confirmed **Inbound receipt** posts the increase (good qty only, damaged never sellable); **Delivered ≠ Received**. These modules **read** `shipments` / `warehouses` and **write** only their own operation/receipt/confirmation tables + (via the Inventory Module) `overseas_inventory_movements` — **never `factory_stock`**. Separate idempotency keys per action. **NOT IMPLEMENTED — spec only.**

**Warehouse Reference Master boundary (2026-07 — SPEC ONLY; canonical: `SHIPMENT_CENTER_SPEC.md` §22.0).** `warehouses` is a **passive Reference Master** — modules **read** it (Shipment Draft destination selection, Warehouse Lookup, Route/Shipment-Route init, map points, Document address lookup, Overseas Inbound / Receiving destination). Reading or creating warehouse rows **must NOT** trigger any side effect: no inventory create/split/move/allocate, no `overseas_inventory_snapshot`/`overseas_inventory_movements` write, no Shipment Events/Routes, no Warehouse Receipts. **Inventory source separation:** Amazon FBA inventory stays **report-driven** (`company + marketplace/site + country + SKU`); **FC-level inventory is never inferred from physical FBA warehouse rows.** Identity: the **Warehouse Master row identity is `warehouses.warehouse_id`** (canonical); on `shipments` the sole canonical destination endpoint is `shipments.destination_warehouse_id` and the sole canonical origin endpoint is `shipments.origin_warehouse_id`, with `shipments.warehouse_id` only a **destination compatibility mirror / read-fallback** and `source_warehouse_id` a **non-canonical migration-pending Runtime gap**; `warehouse_code` is a **display snapshot** (not globally unique, never an identity); `company` (business context) ≠ `warehouse_owner` (physical operator). **Warehouse Picker status is component-level (canonical matrix `SHIPMENT_CENTER_SPEC.md` §23.8): spec FINALIZED; frontend selector/controls CODE-COMPLETE; backend compatibility `warehouse_id` acceptance SOURCE IMPLEMENTED; Apps Script redeploy PENDING; live GET/save/reload NOT VERIFIED; `destination_warehouse_id` canonical persistence NOT IMPLEMENTED; full end-to-end Runtime NOT ACCEPTED / NOT LIVE-VERIFIED. Legacy aggregate migration: NOT EXECUTED; Inventory & Overseas Inbound runtime: unchanged.** *(Frontend code-complete does NOT mean full Runtime accepted, deployed, live-verified, or that `destination_warehouse_id` persistence exists.)*

---

## 6. Runtime Dependency

Downstream features depend on upstream freshness. Dependency is **one-directional**.

```
Amazon Snapshot (inventory / health / sales)
        ↓
Inventory Snapshot (consolidated view across sites + factory + overseas)
        ↓
Inventory Projection            (Calculation Engine: current + future month)
        ↓
Inventory Replenishment         (Planning: suggested replenishment)
        ↓
Weekly Shipping Plan            (Planning: approved plan)
        ↓
Shipment                        (Execution: shipments / shipment_lines)
        ↓
Receiving / Inventory Update    (feeds back into the NEXT cycle's snapshot, not the current one)
```

**Parallel order branch (shares factory stock):**
```
Forecast + Inventory + Factory Stock + On-the-way
        ↓
Request Order (下單系統)
        ↓
Purchase Order → Production Completion
        ↓
available_to_ship = completed_qty − shipped_qty
        ↓
Shipment allocation   ── meets the shipment branch at factory stock
```

> The order branch **produces** supply (factory stock); the shipment branch **consumes** it. They meet at `factory_stock`: the PO/FIFO measure of producible supply is `available_to_ship` = `completed_qty` − `shipped_qty` (PO/FIFO domain), which is **distinct** from Factory Stock's own `fac_available_stock` = MAX(`fac_current_stock` − `fac_reserved_stock`, 0) — the two availabilities never share a name. The receiving step closes the loop into the **next** cycle — it never edits the current snapshot.

---

## 7. Trigger Rules

What events cause the runtime to react. (Conceptual — actual scheduling/eventing is future implementation.)

| Trigger event | Primary effect | Downstream recompute candidates |
|---------------|----------------|----------------------------------|
| **Snapshot imported** (sync run success) | snapshot tab refreshed; freshness updated | Inventory projection, replenishment, dashboards |
| **Forecast updated** (base/event/target edit) | forecast inputs change | projection, shortage/surplus, request order need |
| **Replenishment override set** | a planning input is manually adjusted | replenishment suggestion, shipping plan |
| **Shipping plan approved** | plan becomes convertible; **no inventory movement** (approval does **not** reserve; the reserve event is the later **Ready to Ship transition (`draft → ready_to_ship`) = Formal Shipment Execution Commit**, B-1 resolved — owner §8A.1; decision only, runtime not started) | shipment creation readiness |
| **Execution Commit / Create Shipment Draft** | one physical `shipments` row created (`status = draft`); may consolidate **multiple approved plans** via `shipment_plan_links` (human-confirmed); persists plan-source + PO allocations + Execution Snapshot. **No factory-stock reserve is written** — the Approved-Plan → Draft handoff is **non-reserving** (the reserve event is the later Ready to Ship, B-1). | consolidated shipment, plan/marketplace traceability, PO allocation |
| **Ready to Ship / Formal Shipment Execution Commit** (`draft → ready_to_ship`) | **Canonical Factory Stock reserve trigger (B-1, owner §8A.1).** Reserves `fac_reserved_stock` for a **factory-origin** shipment (identity origin factory `warehouse_id + sku`; overseas origin → Overseas Outbound Lock / `wh_reserved_stock`, not `factory_stock`), atomically with the status transition. **Runtime Not Started / Not Verified — no reserve writer is deployed.** | Factory Stock reservation-state change → recompute/validate `fac_available_stock` = MAX(`fac_current_stock` − `fac_reserved_stock`, 0) *(derived, not a DB column)*. **Does NOT change the PO/FIFO `available_to_ship` quantity.** |
| **Lifecycle → `Running in the Market`** (transition) | ensures `factory_stock` baseline (idempotent by `warehouse_id + Master sku`; `fac_current_stock=0`, `fac_reserved_stock=0`) — **NOT** on Master- or Marketplace-SKU create | factory stock rows exist for planning |
| **Marketplace SKU added to planning scope** | ensures **Overseas Inventory** baseline/context (physical grain `company + warehouse_id + Master sku`; marketplace = demand context, not physical grain) — shared 3PL counted once | overseas shared-pool planning |
| **Ship (Confirm & Ship)** | `factory_stock.fac_current_stock` **deducted** (verified — `22_shipment_dispatch_handlers.gs`); writes `factory_stock_movements`. Canonical intent also **consumes `fac_reserved_stock`**, but **reserved-stock consumption is NOT implemented** (no reserve is written today); release/rollback status mapping is **B-8 (BLOCKED)**. | **Factory domain:** `factory_stock` deduction/consumption → `factory_stock_movements` ledger/audit → recompute `fac_available_stock` → inventory projection / on-the-way. **PO/FIFO domain:** the PO/FIFO `available_to_ship` changes **only if** the dispatch writer updates `purchase_order_lines.shipped_qty` — via that PO/FIFO writer, **never by the Factory Stock deduction itself**. |
| **PO completed** (production) | `completed_qty` increases | `available_to_ship`, shipment allocation |
| **Factory stock changed** (movement) | physical supply changes | projection, replenishment, request order |
| **Receiving recorded** | destination inventory increases | next-cycle snapshot / projection |

**Trigger principle:** a trigger fires a **recompute of derived data only**. It never rewrites the source that triggered it.

> **Reservation / Recommendation boundary (canonical).**
> ```
> Recommendation Snapshot Write
>   ≠ Decision Commit
>   ≠ Stock Reservation
>   ≠ Inventory Movement
>
> RESOLVED (B-1) — the exact reservation event is the successful Ready to Ship transition
> (draft → ready_to_ship) = Formal Shipment Execution Commit; owner ARCHITECTURE §8A.1.
> Decision only — Runtime Not Started / Not Verified.
> ```
> **Verified current code (2026-07-28):** no reserve logic exists; `fac_reserved_stock` is never written — the only factory-stock mutation is a hard **deduction of `fac_current_stock` at Confirm Shipment & Dispatch** (`22_shipment_dispatch_handlers.gs`). The single Reserve Trigger is **resolved (B-1)** as the successful **Ready to Ship** transition (`draft → ready_to_ship`) = **Formal Shipment Execution Commit** (owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1) — a **Canonical decision only; Implementation / Runtime / Deployment Not Started; Runtime Verification Not Verified.** No reserve trigger, atomic writer, or reservation runtime is deployed. Cancel / release / rollback status mapping is **B-8 (BLOCKED)**.
>
**Import / recommendation outcome boundary — five distinct stages, never auto-equal:**

| Stage | Meaning |
|---|---|
| **Import Job Completed** | Import process finished without execution error |
| **Snapshot Persist Verified** | Expected snapshot rows were written and verified |
| **Analysis Ready** | Required normalized inputs are eligible for calculation |
| **Recommendation Snapshot Written** | Non-commit recommendation result was persisted |
| **Decision Committed** | User action created formal business commitment |

**Rules (each fails independently; an earlier stage never implies a later one):**
- Import Job Completed **≠** Snapshot Persist Verified.
- Snapshot Persist Verified **≠** Analysis Ready.
- Analysis Ready **≠** Recommendation Snapshot Written.
- Recommendation Snapshot Written **≠** Decision Committed (and **≠** Stock Reservation **≠** Inventory Movement).
- A successful Amazon import **must not** be used to prove the Recommendation Runtime is deployed or complete.

(Downstream of Decision Committed the same discipline continues into Execution Entity Created → Inventory Movement Applied → Settlement Completed.)

---

## 7A. Recommendation Scheduler & Cadence (CANONICAL 2026-07-20)

Authoritative schedule for the recommendation pipeline. **Spec only — no Apps Script trigger, Runtime, or DB is created here.** Implementation contract (entry points, source-readiness, cycle idempotency, Draft persistence, trigger-install boundary): [`RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md`](./RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md). **Verified runtime status:** only `runAmazonSnapshotImports()` exists; `runWeeklyShippingRecommendation()` and `runMonthlyOrderRecommendation()` **DO NOT EXIST** and the shipping-recommendation calc/writer layer is **NOT IMPLEMENTED**.

**Timezone (canonical):** **Asia/Taipei (Taiwan Time, UTC+08:00)** for ALL scheduling below. The Runtime must **not** rely on the executing user's browser timezone; both the **Google Spreadsheet timezone and the Apps Script project timezone must be Asia/Taipei.**

| Job | Cadence (Asia/Taipei) | Trigger window | Layer | Creates / Modifies |
|---|---|---|---|---|
| **Daily Report Pipeline** | every day **12:00** | **12:00–13:00** | **Analysis only** | updates snapshots/analysis; **creates/modifies NO Draft** |
| *(Report validation / buffer)* | daily | **13:00–14:00** | — | validation/settling window before recommendations |
| **Weekly Shipping Recommendation** | every **Monday 14:00** | **Mon 14:00–15:00** | Recommendation snapshot | `shipping_allocation_drafts` → `_lines` (one cycle / ISO week / Scope) |
| **Monthly Order Recommendation** | every month on the **5th, 15:00** | **day 5, 15:00–16:00** | Recommendation snapshot | `request_order_allocation_drafts` → `_lines` (one cycle / Year+Month / Scope) |

> **Trigger-window note (why times, not exact minutes):** Google Apps Script time-driven triggers fire **within the selected hour window**, not guaranteed at the first minute. The four windows above (Daily 12:00–13:00 · validation/buffer 13:00–14:00 · Weekly Mon 14:00–15:00 · Monthly day-5 15:00–16:00) are staged so each stage settles before the next. **When the 5th falls on a Monday, the Weekly (14:00–15:00) and Monthly (15:00–16:00) recommendations remain in separate, non-overlapping windows.**

**Daily Report Pipeline (12:00):** import/update platform inventory reports, daily sales reports, forecast/source snapshots, qualified on-the-way; recalc FBA confirmed/estimated status; recalc Shared FBM Planning Allocation; refresh Analysis-Layer Days of Supply & Suggested Qty. It **does NOT** create `shipping_allocation_drafts`/`_lines` or `request_order_allocation_drafts`/`_lines`, modify an existing Draft, overwrite user-entered quantities, submit a Weekly Shipping Plan, or create a Request Order / Shipment / PO. **Daily refresh is Analysis Layer only.**

> **Staged success — never conflate (Batch A 2026-07-28).** The canonical outcome stages are owned by `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` (Outcome-stage separation table): **Import Job Completed ≠ Snapshot Persist Verified ≠ Analysis Ready ≠ Recommendation Snapshot Written ≠ Decision Committed.** An earlier stage never implies a later one: **Import Job Completed** (the import process finished) does **not** prove snapshots were verified-persisted, nor that replenishment/order **Analysis** ran, nor that any **Recommendation Snapshot** was written, nor that anything was **committed**. Each stage has its own success signal and its own readiness gate (§H of `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md`). Do not report a recommendation as "done" on the strength of an import completing.
> **16:00 reconciliation (RESOLVED as canonical schedule; operational move pending).** §4/§11 and `06_amazon_import_config.gs:184` reference `scheduleTime: '16:00'` for the BQ daily-sales import. This is **LEGACY / SUPERSEDED as a schedule** — `scheduleTime` is **config metadata never consumed by Runtime** (only `scheduleTimezone` is read); 16:00 is **too late** for the Monday 14:00 recommendation. Canonical: the **single** daily trigger on `runAmazonSnapshotImports` runs in the **12:00–13:00** window. **Do NOT add a duplicate same-day daily-sales import.** Moving the installed trigger is an **operational step** (`RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md` §A / §J Phase 1); no config value is changed by spec.

**Source-readiness gate (both recommendation jobs):** the latest required Daily Report Pipeline batch for that cycle **must have completed successfully** first. If the required batch is incomplete/failed: **do not** generate a partial/stale recommendation silently, **do not** create an empty-success Draft; report a clear **source-readiness error**; allow safe **manual retry** after the pipeline succeeds. (Weekly 14:00 and Monthly 15:00 both run after the 12:00 pipeline + 13:00–14:00 validation buffer; the two recommendation windows never overlap, so a Monday-the-5th does not collide.)

**Runtime entry points (truthful status):**
- **Daily Report Pipeline — `runAmazonSnapshotImports()`:** **EXISTING** in the Apps Script source (`07_amazon_import_runner.gs`) and **explicitly safe for a time-based trigger** (no required arguments).
- **Weekly Shipping Recommendation entry point:** **REQUIRES RUNTIME VERIFICATION — not claimed to exist.** A trigger must **not** be configured against an empty or parameterized handler.
- **Monthly Order Recommendation entry point:** **REQUIRES RUNTIME VERIFICATION — not claimed to exist.** Same rule.
- **A recommendation scheduler entry point MUST:** accept no required arguments; enforce source-data readiness; be idempotent by recommendation cycle (see Duplicate-run protection below; the persisted cycle-key mechanism is **B-7**); never overwrite user quantity; never report success after a partial failure.

**Recommendation vs user quantity (both layers):** the system recommendation is captured **once** at Draft generation; the user-operational quantity is **initialized from it** on new-line creation and thereafter **independently editable and independently visible**. Automated reports/schedulers **never overwrite the user quantity**, and **never silently refresh** a Draft's recommended quantity from live Analysis.
- **Shipping:** **`recommended_qty`** (system snapshot; canonical 2026-07-22, legacy alias `recommand_shipment_draft_qty`) → initializes **`planned_qty`** (user qty; legacy alias `shipment_draft_qty`). Schema owner `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6.
- **Order:** `recommended_qty` (system snapshot) → initializes `order_qty` (user qty).

**Snapshot boundary:** Daily Analysis stays live/recalculable; a Recommendation Draft is a **point-in-time working snapshot** created only by the Monday Shipping job, the monthly-5th Order job, or a future manually-initiated Exception action. **No** "latest live recommendation / daily difference / Compare Changes / automatic version replacement" requirement is introduced. **No daily Draft versioning.**

**Duplicate-run protection (idempotent):** there must be **one active recommendation batch per recommendation cycle + Scope** (a cycle = one weekly run for Shipping, one monthly run for Order); repeated/retried execution for the same cycle must be **idempotent** (no duplicate Draft headers/lines, no reset of user-edited fields); a failed partial run **must not report success**. The **persisted cycle / unique-key mechanism** — whether a dedicated key column, composite key, or unique index, and its exact composition — is **Blocked — B-7** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11). **No DB column, key, or index is decided or added here.**

**Legacy naming:** the canonical shipping-draft quantities are **`recommended_qty`** (system snapshot) + **`planned_qty`** (user) — schema owner `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6. The misspelled **`recommand_shipment_draft_qty`** and **`shipment_draft_qty`** are **LEGACY READ/MIGRATION ALIASES only** (for `recommended_qty` / `planned_qty` respectively) — do NOT introduce them as new canonical columns.

**Shipping-draft persistence capability status (do NOT collapse into one "Not Implemented"):**
| Capability | Status |
|---|---|
| `shipping_allocation_drafts` table | **Schema Exists** |
| `shipping_allocation_draft_lines` table | **Schema Exists** |
| Body-driven Draft getter | **Source Exists** (`getShippingAllocationDrafts` / `_Lines` adapter + Apps Script) |
| Body-driven Draft create/update/cancel writer | **Source Exists** (`16_shipping_allocation_handlers.gs`: `handleUpsertShippingAllocationDraft_` / `handleUpsertShippingAllocationDraftLines_` / `handleSubmitShippingAllocationDrafts_`; router-wired `01_router.gs`) |
| UI adapter integration (active call path) | **Not Verified** — active Execution-Plan call path not confirmed here (System Repair 1 territory; do not infer from handler existence) |
| Recommendation calculation engine | **Not Implemented** |
| No-arg recommendation scheduler | **Not Implemented** |
| Automatic generation / orchestration | **Not Implemented** |
| Deployment / production verification | **Not Verified** (no deployment evidence in this environment) |

**Invariant:** the Draft persistence table + body-driven CRUD **source exist**; the recommendation engine, scheduler and automatic generation may still be **Not Implemented**; and **source existence does not prove deployment or production behaviour**. (Supersedes the earlier "Persistence remains spec/DB-design only — no writer in code" wording, which was factually incorrect about the writer source.)

**Risk / Danger Alerts:** **FUTURE ADD-ON / NOT IMPLEMENTED.** Future scope may include Homepage risk display, notification dedup, severity changes, unresolved reminders, resolved state, Exception Shipping Draft, Exception Order Draft. **No notification table/workflow/permission/trigger is defined now.**

---

## 8. Recalculation Rules

**When the system recomputes:**
- A **direct input** to a derived value changes (snapshot refresh, forecast edit, override, factory stock movement, PO completion, shipment confirmation).
- A user explicitly requests a recalculation (opens a planning page / refreshes).

**Which modules are affected** (only those downstream of the change, per §6):
- Snapshot change → Inventory Service → Projection → Replenishment → (plan readiness).
- Forecast change → Projection + Request Order need.
- **Factory Stock current/reserved movement** → recompute `fac_available_stock` = MAX(`fac_current_stock` − `fac_reserved_stock`, 0) *(derived, not a DB column)* → factory-availability-dependent projections/checks + replenishment.
- **PO completion / PO shipped-qty / FIFO allocation change** → `available_to_ship` = `completed_qty` − `shipped_qty` → shipment allocation. *(These two availabilities are **separate concepts and must never share a name**: Factory Stock availability = `fac_available_stock`; PO/FIFO shipment eligibility = `available_to_ship`.)*

**When nothing should happen:**
- Editing a **document** (documents are derived; regenerating changes nothing upstream).
- Editing a **plan** does not retro-change inventory truth; it only changes the intention.
- A **failed import** does **not** overwrite the existing snapshot (the last good snapshot stays; downstream keeps using it but freshness degrades — §9).
- Re-running an import with **identical data** (same `source_row_hash`) yields the same result — recomputation is **idempotent**.

**Recalculation principle:** recomputation must be **re-runnable and deterministic** — same snapshot + same overrides + same forecast → same output. This is exactly why snapshots are write-protected and overrides are separate (§5, §10).

---

## 9. Freshness Rules

Reuses the Import Framework freshness model (`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` §19/§22). Freshness is **derived from `import_sync_runs`**, never manually set.

| Freshness state | Meaning | Downstream behavior |
|-----------------|---------|---------------------|
| **Fresh** | within expected refresh window | safe to use |
| **Warning / Delayed** | later than expected but usable | show a warning on dependent pages |
| **Expired / Stale** | well past max delay | dependent calculations marked **unreliable** |
| **Blocked / Failed** | last sync failed / no usable snapshot | dependent calculations may be **blocked** or clearly flagged |

- Each consuming page (replenishment, Site Health Dashboard) checks the freshness of the snapshots it depends on (§6) before presenting results.
- Freshness degradation **does not delete** data — the last good snapshot remains; only its trust level changes.
- A blocked dependency should surface *why* (which snapshot, last successful sync) rather than silently failing.
- **Actual data date range must be visible.** The canonical Daily Sales path is the **gap-aware rolling 90-completed-day upsert** (owner `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` §4 / §7.4); missing in-window dates are recorded as `source_unavailable` and **retried, never substituted by latest-available data**. The runtime/UI must **expose the actual date range used** (per group where it differs) so freshness is honest — a snapshot whose latest in-window date is behind the expected cadence reads as `delayed`/`stale`, not `fresh`. Groups may legitimately show **different latest dates**; the system must not force one global latest date.
- **Daily Sales freshness fields the runtime/UI must read** (importer-generated, defined in import spec v1.4 §7.4 / §16):
  - `latest_source_date` — the most recent source date present (drives the "data as of …" label).
  - `data_window_start_date` / `data_window_end_date` — the actual date range covered (per group on the snapshot; min/max on the run).
  - `is_fallback_used` — **legacy compatibility field**; the canonical gap-aware path performs **no** latest-available fallback and writes `FALSE`/blank (import spec §4). Older rows may retain historical `TRUE`; surface as-is, but never treat a snapshot with missing in-window dates as complete.
  - `data_age_days` — age of the latest source date vs sync date (drives fresh / delayed / stale thresholds).
  These let dashboards display an honest "data as of `latest_source_date` (range `start`–`end`, fallback: yes/no, age `N` days)" badge rather than implying every row is current.

---

## 10. Runtime Ownership

For every runtime data category, the ownership class governs **who may write**.

| Category | Ownership class | Write rule |
|----------|-----------------|-----------|
| Snapshot tables (`amazon_*_snapshot`, FBA snapshot) | **Snapshot / Importer-owned** | Importer only — import-only, never hand-edited (§4 of import spec, write-protection) |
| `import_sync_runs` / `import_sync_issues` | **System-owned** | Importer / System only |
| Master data (SKU, marketplace, pricing) | **User-owned** | Authorized users (via existing admin flows) |
| Forecast (`fc_*`) | **User-owned** | Authorized users |
| `inventory_replenishment_overrides` | **User-owned** | Authorized users (the sanctioned correction path) |
| Calculation outputs (projection, suggestions) | **Derived** | Not persisted as source; recomputable |
| `inventory_replenishment_daily_status` *(future)* | **System / Derived** | System calculation only |
| `shipping_plans`, `request_orders` | **User-owned (planning)** | Planning modules on submit/approval |
| `shipments`, `purchase_orders`, `factory_stock` movements | **Execution-owned** | Execution modules only |
| `generated_documents` | **Generated** | Document Service only |
| Snapshot-as-read on dashboards | **Read-only** | nobody writes via presentation |
| Future API resources | **Future API** | served via services, not direct DB writes |

> **Formal access control** (who is an "authorized user", role gating of cost/payment data, portal scope) is deferred to a future **Role & Permission Spec**. This document defines ownership **conceptually**.

---

## 11. Runtime Event Flow

End-to-end runtime event chain (the §2 canonical flow expressed as events):

```
Amazon (report / API / BigQuery)
        ↓  (scheduled sync — canonical Daily Report Pipeline 12:00–13:00 Asia/Taipei; §7A. The legacy "16:00" config metadata is SUPERSEDED — see §7A 16:00 reconciliation)
Importer            → writes snapshot + import_sync_runs / import_sync_issues
        ↓
Snapshot            → single source of truth (write-protected)
        ↓
Inventory Service   → consolidates inventory across sites / factory / overseas
        ↓
Projection          → Calculation Engine applies formula rules
        ↓
Planning            → replenishment suggestion → Weekly Shipping Plan (Submit → approve)
        ↓
Shipment            → create shipment (snapshot of plan) → Confirm & Ship (stock deduction)
        ↓
History             → on-the-way / shipping history (read views over shipments)
        ↓
Documents           → generated_documents rendered from execution records
        ↓
(future) API        → serves all of the above to clients
```

Each arrow is a **forward hand-off**; the receiving stage reads, computes, and writes only its own store.

---

## 12. Runtime Logging

Conceptual governance of what is recorded and how the system stays auditable (no schema defined here beyond what import specs already document).

| Concern | Mechanism | Notes |
|---------|-----------|-------|
| **Logs** | `import_sync_runs` (per-run summary: rows read/written/skipped/error/duplicate, status, quality) | one record per import run |
| **Audit** | `import_sync_issues` (per-issue: type, level, action_taken, source key) + row-level `source_*` metadata | every issue and every row is traceable to a run |
| **History** | execution records are snapshots (`shipments`/`shipment_lines` copy at creation); snapshot tabs hold **latest only** (MVP) | long-term history is a future BigQuery / history-table concern |
| **Override** | `inventory_replenishment_overrides` — business corrections live here, **not** inside snapshots | keeps recalculation re-runnable |
| **Version** | conceptual `importer_version` / `config_version` / `source_schema_version` / `destination_schema_version` | bump when Amazon/BQ headers or mapping change |
| **Rollback** | re-run import from source (idempotent via `source_row_hash`); revert overrides; regenerate documents | snapshots are reproducible from source, so rollback = re-sync |

**Logging principle:** every derived state must be **explainable** — from any number on a dashboard you can trace back to the run, the snapshot, and the source.

---

## 13. Runtime Service Catalog

Conceptual runtime services (logical responsibilities, **not** APIs and **not** code modules):

| Service | Responsibility | Reads | Produces |
|---------|----------------|-------|----------|
| **Import Service** | run config-driven imports, governance, logging | external sources | snapshots + run/issue logs |
| **Inventory Service** | consolidated inventory truth (site + factory + overseas + on-the-way) | inventory snapshots, movements | inventory view |
| **Forecast Service** | base/event/target demand | sales snapshots, forecast inputs | forecast view |
| **Planning Service** | replenishment + shipping plan intentions | calculation outputs | plan suggestions / plans |
| **Shipment Service** | shipment lifecycle + tracking | plans, factory stock | shipment execution records |
| **Order Service** | request approval + PO execution | approved requests, production | POs, production status |
| **Document Service** | render documents from records | execution records + templates | generated documents |
| **Notification Service** *(future)* | freshness/risk alerts, approvals | freshness, plan/shipment events | notifications |

The **Calculation Engine** sits beneath Planning/Inventory/Forecast services as a shared, pure computation utility (formulas owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`). No service owns another service's data.

---

## 14. Future API Architecture

High level only — **no API specification, no endpoints, no implementation.**

```
Frontend (SPA / dashboards)
        ↓
API Layer               (future — replaces the Apps Script bridge)
        ↓
Runtime Services        (§13 — Import / Inventory / Forecast / Planning / Shipment / Order / Document)
        ↓
Database                (Google Sheet DB today → Cloud DB future)
        ↓
BigQuery                (analytics / raw daily sales / future warehouse)
```

- The frontend talks to the **API**, the API talks to **services**, services talk to the **database / BigQuery**.
- Clients must **not** bypass services to touch the database directly.
- Today's Apps Script bridge is the **interim** stand-in for the API layer; the migration target is a formal backend API + cloud DB (per `project-current-state.md` positioning).

---

## 14A. Overseas Warehouse Operation — Runtime Classification (CANONICAL 2026-07-21 — NOT implemented)

High level only — no implementation is created here. Authority: `SHIPMENT_CENTER_SPEC.md` §23, `WAREHOUSE_OPERATIONS_SPEC.md`.

- **Endpoint-based classification (not text-based).** The runtime classifies a shipment's warehouse operation from its **structured endpoint identities** — `origin_warehouse_id` / `destination_warehouse_id` resolved against the `warehouses` Master. **Warehouse identity is NEVER inferred from `ship_from` / `destination` display text, `warehouse_code`, `warehouse_name`, or address.** `warehouse_id` is the authoritative key; `warehouse_code` is a display/snapshot value only.
- **Warehouse Master capability checks.** An endpoint qualifies as a managed overseas warehouse only when its `warehouse_id` resolves to an **active** record, `is_factory_warehouse` is **not TRUE**, the relevant capability is enabled (`is_receiving_enabled` for inbound / `is_shipping_enabled` for outbound), and the warehouse is supported by the applicable integration config. Do **not** classify solely by `warehouse_type = 3PL`.
- **Runtime-derived direction.** destination qualifies → Inbound; origin qualifies → Outbound; both → Transfer (one of each); neither → none. **Never a user-entered `shipment_direction` / `warehouse_operation_type`.**
- **Company-scoped routing.** `company + warehouse_id + operation_type → correct external account`. KM and ResUS AMZLGS records are distinct identities and never cross-route; the runtime validates company ownership against the selected `warehouse_id` before routing.
- **Idempotent operation creation.** On the canonical trigger (shipment becomes formal), create-or-link the required Inbound/Outbound Draft keyed by **shipment + warehouse + direction**; repeated runs never duplicate. `shipment_id` is preserved as the authoritative linkage.
- **Dual-direction orchestration (future; Phase-1 manual — canonical `SHIPMENT_CENTER_SPEC.md` §23.11).** The **Formal Shipment orchestrator** is the single record that creates/links **both** the destination Inbound **and** the origin Shipout Instruction. The **Overseas Inbound Receiving module never creates the origin Shipout** and is not the planning SSOT (intent SSOT = Inbound Planning Request; execution SSOT = Formal Shipment). Destination Inbound may be submitted externally to retrieve inbound references/labels; those + the shipout instruction form the **Factory Shipping Package** handed to the factory. **8 separate idempotency scopes** (never one shared key); label/document binaries reference the **Document Engine** (`generated_documents`), never the operation header. **Phase-1 fully manual; none of the automation is implemented.**
- **API submit / query / webhook / retry flow (future).** Each operation carries operation-status and a **separate** API-status; the WMS/integration flow is submit → acknowledge/query → webhook/poll result → retry-on-error, with an idempotency key, external order id, push status, `pushed_at` / `last_synced_at`, `last_api_attempt_at` / `last_api_error`, and retry/error state. Provider-required-field validation gates submission (not Draft save). Secrets are never stored in Sheets (pointer/`credential_reference` only).

---

## 14B. Route Runtime & Event Projection (CANONICAL 2026-07-22 — spec only, NOT implemented)

Authority: `SHIPMENT_ROUTE_AND_EVENT_SPEC.md`. Phase-1 P1-E.

- **Reference vs Runtime split:** `shipment_route_templates` + `shipment_route_template_nodes` are **Reference DBs manually completed by the user** (blueprints). `shipment_routes` (per-shipment route-version snapshot), optional `shipment_route_nodes`, and `shipment_events` (append-only) are the **Runtime** layer — **not implemented** (absent from all code).
- **A Template is never a shipment's live state.** At Shipment Confirm the chosen template version is **copied** into a `shipment_routes` version snapshot (planned dates = `ETD + cumulative default_offset_days`); template edits never rewrite existing snapshots.
- **Projection, not rewrite:** current status / current node / ETA / map position / progress% are **PROJECTED from the latest valid `shipment_events`** — never stored as a current-state row that replaces event history. Events are **append-only**; `(source_type, source_event_id)` is unique (idempotent API writes); corrections/reversals are new events.
- **Reroute** creates a new `shipment_routes` version (`is_current=TRUE`), links `supersedes_shipment_route_id`, appends a `ROUTE_CHANGED` event; the old version is retained (`superseded`). Exactly one `is_current` route per shipment.
- **Delivered ≠ Received:** a carrier `delivered` event never increases inventory; the Warehouse Receipt (`RECEIVED`) is the inventory-increase authority. Route/Event write failure is **non-blocking** — it must not corrupt Shipment execution; no route/event is required to Ship in Phase 1.
- **World Map** reads Runtime only (Shipment header + current `shipment_route` + latest valid `shipment_event` + node snapshot) — never a Template as live truth.

---

## 15. Design Principles

1. **Single Source of Truth** — each datum has exactly one authoritative store; everything else reads it.
2. **Snapshot First** — imported data lands in a write-protected snapshot before any interpretation.
3. **Calculation Never Writes Source** — the calculation engine is pure; it produces values, not source mutations.
4. **Derived Data Never Owns Data** — projections, suggestions, statuses, and documents are recomputable, never authoritative.
5. **Planning Never Owns Inventory** — plans express intent; physical inventory truth lives in the inventory/execution layers.
6. **Execution Never Recalculates Planning** — execution records reality; it does not re-derive the plan that produced it.
7. **Business Rules before Runtime** — runtime mapping implements business rules; it never invents them.
8. **Data Lifecycle First** — every data type's source/owner/writer/reader/freshness is defined before any feature is built on it.

> These principles are the **invariants**. Any future feature, service, or API that violates one of them is, by definition, a design error to be corrected — not an exception to be accommodated.

---

## 16. Non-Goals

This document does **not**:
- Write Apps Script, API, SQL, or any code.
- Modify the database, existing specs, or the frontend.
- Define calculation formulas (owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`).
- Define API endpoints, request/response shapes, or auth.
- Define the Role & Permission model (future spec).
- Define replenishment-override or daily-status field rules (future replenishment/status specs).
- Implement scheduling, eventing, or notification mechanisms.

---

## 17. Open Questions

- **Eventing mechanism:** are recalculations push (event-driven) or pull (recompute on page open) in MVP vs future?
- **Daily status materialization:** is `inventory_replenishment_daily_status` precomputed nightly or computed on demand?
- **History store:** when does row-level history move from "latest snapshot only" to BigQuery / a dedicated history table?
- **Cross-snapshot consistency:** how is partial freshness handled when (e.g.) daily sales is fresh but inventory snapshot is stale?
- **Date-range granularity & display:** when Daily Sales groups have different latest in-window dates (or `source_unavailable` gaps within the rolling 90-day window), how is the per-group date range surfaced in the UI, and how do downstream calculations treat mixed dates within one snapshot?
- **Incomplete-window vs freshness mapping:** exactly which `freshness_status` does a snapshot with `source_unavailable` in-window dates map to (`delayed` vs `stale`) given the gap between its latest date and the expected cadence?
- **Placeholder accounting:** should normalized Amazon placeholders (`365+`, `/`) be tallied per run (e.g. on `import_sync_runs`), and is the `365+ → 365` open-bound loss acceptable for all downstream uses or does Days-of-Supply need the "or more" flag?
- **Service boundary in MVP:** which services are real runtime components vs conceptual groupings until the API layer exists?
- **Override interaction with recompute:** precedence rules when an override and a fresh snapshot disagree.
- **Versioning enforcement:** where are `*_schema_version` markers stored and checked at runtime?

---

## External-Origin Quarantine → Admission Pipeline (CANONICAL 2026-08-01 Round 4D-C — architecture only; Runtime NOT implemented)

**Authority hierarchy:** the KM Operation System is the internal SSOT; OMS/WMS/platform are downstream execution / observation systems. External data affects KM only through **validated, idempotent KM transactions** (Derived Data Never Owns Data).

**Pipeline (external-origin):**
```
External Ingestion
  → Stable Identity Validation
  → Authority Classification
  → Quarantine
  → Exception Creation
  → Notification
  → Human Resolution
  → KM Link / Adopt / Reject / Ignore
  → Planning Admission
  → Source Adapter
  → Normalized Candidate (Runtime DTO)
  → Dedup
  → Qualified Incoming (`SUPPLY_PLANNING_CALCULATION_RULES.md` §2E / §38)
  → Recommendation
```

**Normal KM-origin pipeline** bypasses external quarantine because KM canonical identity already exists.

**Fail-closed rule:** unknown or external-unlinked authority → visible + reviewable → planning contribution **0**. Freshness never authorizes admission.

**Notification** is a **future Runtime service** (exception / notification / review), **not** UI-only behavior — **NOT implemented** here (no email, webhook, UI, or scheduler).

**Persistence:** **Runtime DTO first**; a persisted Review / Reconciliation Ledger comes **later** and remains **derived / auditable, not a source of truth**.

---

**Draft v1.5 — Runtime Architecture Specification. Architecture only. No code, Apps Script, API, SQL, DB, frontend, or existing-spec changes are implied by this document. B-1 Reserve Trigger resolved (the Ready to Ship transition (`draft → ready_to_ship`) = Formal Shipment Execution Commit; owner §8A.1) — decision only, Runtime / trigger / writer Not Started / Unverified. Domain specs remain authoritative for their domains.**

**End of Document**
