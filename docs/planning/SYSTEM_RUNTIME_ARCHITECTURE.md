# Kitchen Mama Operation System — Runtime Architecture

**Status:** 🟡 Draft v1.2 — Runtime Architecture Specification (architecture only · NO code, NO Apps Script, NO API, NO SQL, NO DB change, NO implementation)
**Last Updated:** 2026-06-26
**Maintained By:** Development Team / Enterprise System Architect
**Scope:** Authoritative **runtime blueprint** for the whole system — how data flows at runtime, who owns it, what triggers recalculation, and how layers depend on one another.

**Authority / source documents (this doc synthesizes, it does not override them):**
- [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) — table relationships / entity layers.
- [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md) — operational weekly flow + persistence rules.
- [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) — **authoritative for all calculation formulas** (runtime must not duplicate them).
- [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) — shipment lifecycle, reservation/deduction timing.
- [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md) — three-layer request, PO draft/issued, `available_to_ship`.
- [`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`](./AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md) — import framework, snapshot governance, freshness, quality, write-protection.

> **Rule-driven, not feature-driven.** Every design follows: **Business Rule → Database → Data Lifecycle → Runtime Mapping → Implementation.** This document is the *Runtime Mapping* layer. It is **not** an Apps Script design, **not** an API specification, and **not** an implementation document. Where this document and a domain spec differ, the **domain spec is authoritative**.

### Changelog

- **Draft v1.2 (2026-06-26)** — Named the **Daily Sales freshness fields** the runtime/UI must read — `latest_source_date`, `data_window_start_date`, `data_window_end_date`, `is_fallback_used`, `data_age_days` (now defined as importer-generated headers in `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` v1.4 §7.4 / §16). Updated §9 Freshness accordingly.
- **Draft v1.1 (2026-06-26)** — Aligned with `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` v1.3: documented the **Daily Sales fallback** (rolling 4-day default → per-group latest-available fallback) and the requirement that runtime/UI **expose the actual data date range used**; noted that the Import Layer's normalization includes **Amazon numeric placeholder normalization** (`365+`→`365`, `/`→null); refined freshness + open questions accordingly.
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
| 2 | **Import Layer** | Read sources by header name, map → destination, normalize (incl. **Amazon numeric placeholders** `365+`→`365`, `/`→null), generate metadata/hash/batch, record runs/issues; for BigQuery daily sales apply the rolling-window **+ per-group latest-available fallback** | interpret business meaning |
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
| **Daily Sales** | BigQuery `Raw Daily Sales` | Sales / OP | Import Service (rolling 4-day, 16:00 Asia/Taipei; **per-group latest-available fallback** when window empty) | `amazon_daily_sales_snapshot` | Importer only | Forecast Service, dashboards | derived; **actual data date range exposed** (may differ per group) | rolling window refresh, fallback to latest |
| **Forecast** | User + future AI | OP (forecast) | — (UI/edit) | `fc_regular_forecast`, `fc_special_events`, `fc_target_rules` | Authorized users | Calculation Engine, Request Order | last edit | user-maintained, periodic review |
| **Factory Stock** | Factory ops / movements | OP / Factory | — | `factory_stock`, `factory_stock_movements` | Execution events (reserve/deduct), authorized users | Planning, Shipment, Request | event-driven | reserve on approval, deduct on Confirm & Ship |
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

> The order branch **produces** supply (factory stock); the shipment branch **consumes** it. They meet at `factory_stock` / `available_to_ship`. The receiving step closes the loop into the **next** cycle — it never edits the current snapshot.

---

## 7. Trigger Rules

What events cause the runtime to react. (Conceptual — actual scheduling/eventing is future implementation.)

| Trigger event | Primary effect | Downstream recompute candidates |
|---------------|----------------|----------------------------------|
| **Snapshot imported** (sync run success) | snapshot tab refreshed; freshness updated | Inventory projection, replenishment, dashboards |
| **Forecast updated** (base/event/target edit) | forecast inputs change | projection, shortage/surplus, request order need |
| **Replenishment override set** | a planning input is manually adjusted | replenishment suggestion, shipping plan |
| **Shipping plan approved** | plan becomes convertible; factory stock **reserved** | factory stock available, shipment creation readiness |
| **Shipment confirmed (Confirm & Ship)** | `factory_stock.current_stock` **deducted**; reserved released | inventory projection, available_to_ship, on-the-way |
| **PO completed** (production) | `completed_qty` increases | `available_to_ship`, shipment allocation |
| **Factory stock changed** (movement) | physical supply changes | projection, replenishment, request order |
| **Receiving recorded** | destination inventory increases | next-cycle snapshot / projection |

**Trigger principle:** a trigger fires a **recompute of derived data only**. It never rewrites the source that triggered it.

---

## 8. Recalculation Rules

**When the system recomputes:**
- A **direct input** to a derived value changes (snapshot refresh, forecast edit, override, factory stock movement, PO completion, shipment confirmation).
- A user explicitly requests a recalculation (opens a planning page / refreshes).

**Which modules are affected** (only those downstream of the change, per §6):
- Snapshot change → Inventory Service → Projection → Replenishment → (plan readiness).
- Forecast change → Projection + Request Order need.
- Factory stock / PO change → `available_to_ship` + shipment allocation + replenishment.

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
- **Actual data date range must be visible.** For Daily Sales, the rolling-4-day default may fall back to **latest-available data per country/marketplace/channel/sku group** (see import spec §4). The runtime/UI must **expose the actual date range used** (per group where it differs) so freshness is honest — a fallback snapshot reads as `delayed`/`stale`, not `fresh`, when its latest date is behind the expected cadence. Groups may legitimately show **different latest dates**; the system must not force one global latest date.
- **Daily Sales freshness fields the runtime/UI must read** (importer-generated, defined in import spec v1.4 §7.4 / §16):
  - `latest_source_date` — the most recent source date present (drives the "data as of …" label).
  - `data_window_start_date` / `data_window_end_date` — the actual date range covered (per group on the snapshot; min/max on the run).
  - `is_fallback_used` — whether latest-available fallback was used (show a "fallback / latest available" indicator instead of "live").
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
        ↓  (scheduled sync — e.g. daily 16:00 Asia/Taipei for BQ daily sales)
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
- **Fallback granularity & display:** when Daily Sales falls back to latest-available per group, how is the per-group date range surfaced in the UI, and how do downstream calculations treat mixed dates within one snapshot?
- **Fallback vs freshness mapping:** exactly which `freshness_status` does a fallback snapshot map to (`delayed` vs `stale`) given the gap between its latest date and the expected cadence?
- **Placeholder accounting:** should normalized Amazon placeholders (`365+`, `/`) be tallied per run (e.g. on `import_sync_runs`), and is the `365+ → 365` open-bound loss acceptable for all downstream uses or does Days-of-Supply need the "or more" flag?
- **Service boundary in MVP:** which services are real runtime components vs conceptual groupings until the API layer exists?
- **Override interaction with recompute:** precedence rules when an override and a fresh snapshot disagree.
- **Versioning enforcement:** where are `*_schema_version` markers stored and checked at runtime?

---

**Draft v1 — Runtime Architecture Specification. Architecture only. No code, Apps Script, API, SQL, DB, frontend, or existing-spec changes are implied by this document. Domain specs remain authoritative for their domains.**

**End of Document**
