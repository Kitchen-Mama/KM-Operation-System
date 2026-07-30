# Supply Chain System Flow

> **Owner Boundary (reviewed 2026-07-28).**
> - **Document Role:** the end-to-end **operational supply-chain flow** (pages, actions, records) across the weekly cycle.
> - **Canonical Owner For:** the E2E business flow and the two parallel branches (Shipping / Procurement).
> - **Not Owner For:** formulas (`SUPPLY_PLANNING_CALCULATION_RULES.md`), schema (`DATABASE_RELATIONSHIP_MAP.md`), cadence/service boundary (`SYSTEM_RUNTIME_ARCHITECTURE.md`), architecture-layer language (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`).
> - **Status:** Reviewed — B-1 Resolved (owner: Architecture Principles §8A.1); B-2…B-8 Blockers Remain.
> - **Current Version:** v1.4 (Batch B Round 1: B-1 Reserve Trigger resolved in §11 registry + `request_orders.request_status` residual fix).
> - **Last Reviewed:** 2026-07-30.
> - **Depends On:** Architecture Principles, Calculation Rules, Runtime Architecture, Database Relationship Map.
> - **Blocked By:** Batch B — Shipping Group Key · Qualified Incoming allowlist · Request→PO atomicity · B-5/B-7/B-8 (see §11 Batch B Blockers below). **B-1 Reserve Trigger no longer blocks — resolved (decision only; implementation not started).**

**Status:** 🟡 Draft v1.4 — Architecture Specification (documentation only; Batch A canonical repair 2026-07-28; Batch B Round 1 B-1 resolution 2026-07-30)
**Last Updated:** 2026-07-30
**Maintained By:** Development Team
**Related:** [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) (**authoritative architecture language**), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) (calculation logic), [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md) (Decision Layer / Submit Plan write contract), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), `assets/specs/active/SKU_MASTER_FLOW.md` (SKU/marketplace/pricing creation)

> This document defines the **operational supply chain flow** — the sequence of pages, actions, and records across Kitchen Mama's weekly supply cycle. It is **not** a formula specification; detailed shortage/surplus/order math lives in `SUPPLY_PLANNING_CALCULATION_RULES.md`. No code changes. No DB changes.

> **Update (2026-06-29):** Added the **Core Architecture Philosophy — Three-Layer Separation** (§2A: Analysis recalculates · Decision preserves planning · Execution preserves records · never mixed), the **Immutable Flow Principle** (downstream inherits/copies upstream, never mutates it), the **Single Source of Truth by layer** table, and the explicit **Decision Layer chain** (§5.1) — Inventory Replenishment → Submit Plan → Weekly Shipping Plan (Draft → Pending Approval → Approved) → Shipment Draft → Shipment Overview. Inventory Replenishment = **Analysis Layer**, Weekly Shipping Plan = **Decision Layer**, Shipment Draft/Overview = **Execution Layer**. The `shipping_plans` / `shipping_plan_lines` write contract (`plan_version`, `submit_batch_id`, line-level snapshots) is defined in [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md). The **Shipping Group Key** (key-field count and whether Marketplace is a key or header-derived) is **BLOCKED — Requires Batch B Canonical Decision** (§11 B-2).

> **Update (2026-07-03):** Documented the **Factory Stock Allocation → Shipping workflow** (§5.2), the **Allocation Rule** (§5.3 — existing inventory = shared pool; allocation recalculated weekly by FC Share; never permanently bound to a company), and the **Factory Stock inventory-effect lifecycle** (§5.4 — planning steps move nothing; the only verified physical effect is the `fac_current_stock` deduction at Confirm Shipment & Dispatch; the reserve event is resolved under B-1 as the successful Ready to Ship transition (`draft → ready_to_ship`) = Formal Shipment Execution Commit — decision only, not yet implemented). `factory_stock_allocation_plans` is a **weekly planning snapshot only** — it does **not** move, reserve, or change ownership of inventory. Column purposes for `factory_stock_allocation_plans` are documented in [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §6.

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

## 1A. Phase 1 Authoritative Implementation Order (CANONICAL — corrected 2026-07-22)

Principle: **Spec First / Database First / Mapping First / Runtime Last.** Phase 1 first closes the **most basic, verifiable, auditable, traceable** supply-chain loop (P1-A), then completes the remaining Phase-1 scope **including the full 90-Day Rule-Based Supply Planning engine (P1-G), which IS required before Phase-1 Go-Live.** Only **learning-based** features (AI, automatic statistical correction, dynamic optimization, BigQuery intelligence) are Post-Phase-1.

> **CORRECTION (2026-07-22):** the earlier ordering that placed *full 90-Day planning* in Post-Phase-1 / "NOT a blocker" is **SUPERSEDED.** 90-Day Rule-Based Supply Planning is **P1-G** — a Phase-1 requirement. P1-A must not be *blocked by* the complete 90-Day engine, but the 90-Day engine must be complete before Go-Live.

| Step | Scope | Status anchor |
|------|-------|---------------|
| **P1-A** | Basic **Net Replenishment Need** formula (`SUPPLY_PLANNING_CALCULATION_RULES.md` §2A): demand window − sellable stock − qualified incoming − approved/committed supply. Draft ≠ confirmed supply; event demand not deleted by creating a shipment. **First; not blocked by the full 90-Day engine.** | formula defined |
| **P1-B** | Existing Supply Allocation + Order Deduction + PO/Shipment quantity contract (`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` P1-B): `remaining_qty=MAX(completed−shipped,0)`, `unreceived_qty=MAX(ordered−completed,0)`; **deduct at Ship Confirm** (verified); **no double-deduct**. The **factory-stock reserve event is B-1 RESOLVED — trigger = the successful Ready to Ship transition (`draft → ready_to_ship`) = Formal Shipment Execution Commit** (owner §8A.1; identity origin factory `warehouse_id + sku`; decision only, implementation not started); overseas-outbound Lock reserve is owned by `OVERSEAS_OUTBOUND_SPEC.md` (separate domain). | consolidated |
| **P1-C** | Warehouse Menu (4 pages) + Overseas Inbound + Overseas Outbound: Warehouse Master (Admin → Master Data → Warehouses, outside the group); **Factory Inventory / Overseas Inventory / Overseas Inbound / Overseas Outbound** separate pages (Factory vs Overseas = separate domains, never merged balances); **Inbound Planning Request ≠** Warehouse **Receiving Operation** (separate records/lifecycles); Outbound: auto-create ≠ auto-submit, Lock reserves, Ship Confirm deducts actual shipped qty, instruction push KM→WMS precedes shipout confirmation WMS→KM (`WAREHOUSE_OPERATIONS_SPEC.md`, `OVERSEAS_INBOUND_SPEC.md`, `OVERSEAS_OUTBOUND_SPEC.md`). | separate pages + operation contracts defined |
| **P1-D** | Factory / Shipment / Overseas Inventory movement closed loop (§5.8) — every stock change writes a movement ledger row; never a blind balance overwrite. | flow defined |
| **P1-E** | Shipment Route Runtime + Events + ETA + Tracking foundation: Template selection → `shipment_routes` version snapshot → (optional) `shipment_route_nodes` → append-only `shipment_events` → status/ETA/map projection → reroute versions. Built **only after** the (already-completed) Template Reference DB. | spec only |
| **P1-F** | Full module API-ization — unified contract; frontend independent of Sheet column positions; GET/POST/PATCH/domain-action split; idempotency/validation/error-codes/audit; status transitions only via domain action; API versioning. | future |
| **P1-G** | **90-Day Rule-Based Supply Planning** — the complete rule-based engine (four modes §2B, exact-date buckets, target rules, 30-day safety, special-event lifecycle, shared-overseas allocation). **REQUIRED before Phase-1A Go-Live** (rule-based, not learning-based). | formula defined; engine pending |
| **P1-I** | **Phase-1A Go-Live:** Supply Chain Closed Loop verified → **GitHub deployment (system URL)** → controlled internal trial by approved employees. **NOT gated on Login / RBAC** (see boundary note below). | future |
| **P2-A** *(was P1-H)* | **Phase 2** — Login + Google Identity + People + `users`/`roles`/`permissions`/`user_roles`/`role_permissions` + backend token verification + KM session + API permission enforcement + company/country/marketplace/warehouse data scope + Admin User Management + login/security audit + **DB Capacity Monitor** (same phase) + Shipment On the Way World Map UI. | Phase 2 |
| **P2+** | **Phase 2+** — role-based system notification email (after Role & Permission); then a separate personal Gmail Connect integration (Gmail read / attachment sync / Amazon Case thread sync). Google **Login ≠ Gmail access**. | Phase 2+ |
| **Post-P1** | **Learning-based only:** AI demand forecast + explainable recommendation, automatic statistical correction, dynamic Safety Stock / dynamic optimization, forecast accuracy (bias/WAPE/MAPE), route actual lead-time calibration, cross-company borrowing, BigQuery historical/analytics/semantic layer. | deferred |

**Route DB reality (2026-07-22):** `shipment_route_templates` + `shipment_route_template_nodes` are **Reference DBs manually completed by the user** (read-only synced; not recreated). `shipment_routes` / `shipment_route_nodes` / `shipment_events` are **spec-only / NOT implemented** (Phase-1 P1-E). Authority: `SHIPMENT_ROUTE_AND_EVENT_SPEC.md`.

**Phase 1A / Phase 2 / Phase 2+ boundary (CANONICAL 2026-07-23):** **Login** = who the user is; **Permission** = what the user may do; **Deployment URL** = the system entry point (delivery/access, **not** authentication/authorization). **Phase 1A Go-Live** = Supply Chain Closed Loop (P1-A…P1-G) + **GitHub deployment URL** + controlled internal trial by approved employees; it is **NOT** gated on Google Login, Gmail, full RBAC, or DB Capacity Monitor, and **"knowing the URL" is not a security control**. Phase 1A puts **no** Client Secret / Refresh Token / API credential / sensitive data in the frontend, repo, Sheet, or any public environment, while keeping environment isolation, controlled sharing, and minimal data exposure. **Formal Login + Session + Role & Permission (+ DB Capacity Monitor) = Phase 2 (P2-A).** Role-based notification email + personal Gmail Connect = **Phase 2+** (Google Login ≠ Gmail access). Authority: `SYSTEM_ROADMAP.md` → "Phase 1A / Phase 2 / Phase 2+ Boundaries".

### 5.8 Phase-1 full inventory closed loop (P1-D)
```
Demand Calculation → Replenishment Recommendation → Supply Allocation → Request Order / PO
  → Production Completion → Factory Stock → Shipment Allocation (Draft; no reserve) → Ready to Ship (Reserve fac_reserved_stock)
  → Ship Confirm → Factory Stock Deduction (fac_current_stock; consume fac_reserved_stock; movement ledger) → Shipment In Transit
  → Destination Inbound Receive → Overseas Inventory Increase (movement ledger)
  → PO / Shipment / Allocation balance update → Recalculation
```
- **Every inventory change writes a `*_movements` ledger row** — never only overwrite a current balance.
- **Delivered ≠ Received:** carrier `delivered` never increases inventory; the **Warehouse Receipt** (`RECEIVED`) is the inventory-increase authority.
- **In-transit goods are never double-counted** as available at both the factory and the overseas warehouse (`DATABASE_RELATIONSHIP_MAP.md` §6.0).

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

> **Recommendation cadence (canonical 2026-07-20; `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A).** Three distinct cadences in **Asia/Taipei** (Apps Script triggers fire within the hour window, staged so each settles first): **Daily Report Pipeline 12:00** (window 12:00–13:00) refreshes **Analysis only** (creates/modifies no Draft, never overwrites user quantities); **Weekly Shipping Recommendation Monday 14:00** (window 14:00–15:00) creates `shipping_allocation_drafts`; **Monthly Order Recommendation the 5th at 15:00** (window 15:00–16:00) creates `request_order_allocation_drafts`. Both recommendation jobs are gated on Daily-Pipeline success (with a 13:00–14:00 validation buffer), sit in separate non-overlapping windows (Monday-the-5th does not collide), are idempotent per cycle key, and their recommended quantities never silently refresh from live Analysis; user quantities are never auto-overwritten. Risk/Danger alerts are a **FUTURE ADD-ON / NOT IMPLEMENTED**. All NOT IMPLEMENTED.

> **FBA vs shared FBM inventory (CANONICAL 2026-07-22 addendum; owner v4.1).** **Amazon FBA / `platform_fulfilled` Current Stock is a separate bucket** (Current Stock = latest platform snapshot SSOT, or a labelled Estimated Ledger fallback — no re-deducting Sales against a snapshot) and is **never merged into 3PL Current Stock**. **This separation is Current-Stock composition only — a platform-fulfilled marketplace MAY still participate in the shared 3PL replenishment reserve** (warehouse-side eligibility: `company + country + warehouse_type='3PL' + is_active`); the reserve is shown separately as `3PL Replenishment Reserve` and can later replenish FBA. **Shared self-fulfilled FBM** stock is one physical pool (`company + warehouse_id + Master SKU`) distributed to marketplaces by three Analysis-Layer modes — **NORMAL_ALLOCATION / PROTECTED_REALLOCATION / SHORTAGE_ALLOCATION** — protecting an 18-day floor where the pool allows; allocation never moves inventory. Air vs Sea replenishment is a separate routing layer (Air only for a net 18-day shortage; Sea subtracts confirmed Air). All **NOT IMPLEMENTED**. Authoritative formula: [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) §23.6/§24 (v4.1 FINALIZED).

> **Baseline triggers (canonical 2026-07-20 v2 — two distinct triggers).** **Factory Stock** baseline is ensured by the `sku_details.lifecycle` transition into **`Running in the Market`** (idempotent by `warehouse_id + Master sku`) — NOT by Master-SKU or Marketplace-SKU creation. **Overseas Inventory** baseline/context is ensured when a **Marketplace SKU is added to planning scope** (physical shared-3PL grain `company + warehouse_id + Master sku`; marketplace = demand context only; shared pool counted once). Both **NOT IMPLEMENTED**. See [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md) §17.3A.1 and [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) §23.

> **Shipment consolidation (canonical 2026-07-20).** Whether one Submit produces separate marketplace-specific plans depends on the **Shipping Group Key** — specifically whether Marketplace is part of the key — which is **BLOCKED — Requires Batch B Canonical Decision** (§11 B-2). Independently of that decision, at the Execution Layer, multiple approved plans sharing a compatible physical route/destination may be **consolidated by explicit human confirmation** ("Ready to Create") into **one physical `shipments` row**, linked via **`shipment_plan_links`** (many plans → one shipment). Per-plan/marketplace source stays traceable (Demand-source allocation axis); PO/FIFO supply stays on the separate Supply-source axis. See [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) §2.A. Consolidation is **NOT IMPLEMENTED**.

---

## 2A. Core Architecture Philosophy — Three-Layer Separation

> **The full, stable architecture principles are centralized in [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md)** (layer language, Decision Commit, Decision Snapshot, Snapshot Provenance, Immutable Flow, Truth Flow Principle, Single Source of Truth, Business Object Identity). The summary below is kept here for flow context; that file governs the definitions.
>
> **Every layer owns its own truth. Every downstream layer copies the upstream truth into its own snapshot — but downstream must never mutate upstream.**

> ### 🧭 The core architecture philosophy of the Kitchen Mama Supply Chain System
>
> 1. **Inventory Replenishment always RECALCULATES.** It is the Analysis Layer — it re-derives stock, sales, Days of Supply, and suggestions from the latest data every time. It owns no decision and no execution record.
> 2. **Weekly Shipping Plan always PRESERVES planning decisions.** It is the Decision Layer — at Submit Plan it **snapshots** the decision basis (stock, avg sales, days of supply, suggested qty, target days, method) and never silently drifts with live data afterward.
> 3. **Shipment always PRESERVES execution records.** It is the Execution Layer — it copies the approved plan as an execution snapshot and tracks the physical movement; it never recalculates planning.
>
> **These three layers must NEVER be mixed.**
> - Analysis must not be treated as a decision.
> - A decision must not be re-derived from live analysis after it is made.
> - Execution must not recompute the planning decision.

See [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md) for how the Decision Layer snapshots and preserves the plan, and [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) for how the Execution Layer copies (never recalculates) the decision.

### Immutable Flow Principle

> **Every downstream layer inherits the upstream layer, but never mutates it.**

```
Inventory Replenishment
        ↓
Weekly Shipping Plan
```
- Weekly Shipping Plan **may copy** live analysis data into a **Decision Snapshot**.
- Weekly Shipping Plan **must never mutate** Inventory Replenishment data.

```
Weekly Shipping Plan
        ↓
Shipment
```
- Shipment **may copy** approved Weekly Shipping Plan data into an **Execution Snapshot**.
- Shipment **must never mutate** the Weekly Shipping Plan decision.

This is the **Immutable Flow** principle: each layer reads/copies from upstream into its own frozen snapshot and owns only its own records; it never writes back into the layer above it.

The companion **Truth Flow Principle** states the direction of authority: *truth flows downstream, context flows with it, authority never flows back* (Shipment inherits Shipping Plan but never edits it; Shipping Plan inherits Inventory Replenishment but never edits it; Inventory inherits Amazon Runtime Data but never edits it). Both are defined authoritatively in [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) §5 / §5A — referenced here, not redefined.

### Single Source of Truth (by layer)

| Layer | Source of Truth |
|-------|-----------------|
| **Analysis** | Live inventory + forecast + sales source data |
| **Decision** | `shipping_plans` + `shipping_plan_lines` |
| **Execution** | `shipments` + `shipment_lines` |
| **Procurement** | `purchase_orders` + `purchase_order_lines` |
| **Documents** | `generated_documents` |

> **No new DB is required for this principle** — it is a discipline over the existing tables: read upstream, freeze a snapshot, own only your layer's records.

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

### 5.1 Decision Layer chain (Inventory Replenishment → Weekly Shipping Plan → Shipment)

The shipment-planning portion of Steps 1, 3, and 4 forms a three-layer chain. Weekly Shipping Plan is the **Decision Layer** that sits between inventory analysis and shipment execution:

```
Inventory Replenishment  (Analysis Layer — what the data says / suggests)
   ├─ Recommendation Summary  (system suggestion: Target Window / Suggested Qty / Route / Reason — READ-ONLY, never submitted)
   └─ Execution Plan          (PM's actual routes: Ship From / Destination / Suggested Qty / Shipping Method)
        ↓
Execution Plan Working Draft        (Persisted Recommendation Workspace — MAY persist to a non-commit DB Draft
                                     [shipping_allocation_drafts/_lines]; sessionStorage = UI recovery only;
                                     editable many times; commits NOTHING; "Shipping Allocation" = legacy name)
        ↓  Submit Plan = Decision Commit   (reads ONLY the Execution Plan; group by the Shipping Group Key [see Batch B blocker §11]; the ONLY creator of plans)
Weekly Shipping Plan — Draft        (Decision Layer; editable Shipping Qty)
        ↓  Submit for approval
Pending Approval                    (read-only; Manager → COO; Reject requires reason → back to Draft)
        ↓  Approve
Approved                            (read-only)
        ↓  Execution Commit  (Approved → Create Shipment Draft; copies Execution Snapshot)
Shipment Draft                      (Execution Layer; shipments.status = draft)
        ↓  Done  (Decision Layer Completion — plan leaves Active view; row preserved)
Weekly Shipping Plan Completed      (Decision Layer finished; completed_at set)
        ↓
Shipment Lifecycle                  (Execution Layer: Draft → Booked → Ready to Ship → Shipped → In Transit → Arrived → Received → Closed)
        ↓
Settlement Layer                    (final immutable records: documents / audit / KPI)
        ↓
History                             (Shipment History / Shipping History)
        ↓
Documents                           (Invoice / Packing List / Commercial Invoice / POD / generated_documents)
```

> **Four-layer lifecycle (Supply Chain Architecture v1.2):** Analysis → Decision → Execution → **Settlement**. **Decision Layer Completion (Done)** marks the plan Completed (`shipping_plans.completed_at`) — it is independent of the shipment lifecycle and does not change any shipment status. See [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) §10–§12.

**Execution Layer scope:** **Shipment Draft, Shipment Overview, and Shipping History all belong to the Execution Layer.** After **Execution Commit** they read/copy the Decision Snapshot into the **Execution Snapshot** and **must NOT recalculate the Decision** (Current Stock / Avg Sales / Days of Supply / Suggested Qty / Target Days / FC / Event context are copied, never re-derived). See [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) §3A (Execution Commit) + §4A (Execution Snapshot).

> **Phase 2 menu/pages (current).** The left menu groups **Shipment Center → Weekly Shipping Plan (Decision Layer) / Shipment Draft / Shipment Overview (Execution Layer)** — grouping only, not a layer merge.
> - **Shipment Draft = execution working area** (three sections: **Draft → Ready to Ship → Shipped**, `hidden_from_draft_at IS NULL`). Execution fields editable in Draft / Ready to Ship. **Save** updates fields only — it does **NOT** create history or enter Overview. **Ship** validates required fields (carrier, ETD, ETA, tracking-or-booking, totals) then `status = shipped` (+ `shipped_at` / `shipped_by`) — **only Ship makes a shipment official**. **Done** sets `hidden_from_draft_at` → the Shipped card leaves the Draft workspace (still in Overview; row never deleted).
> - **Shipment Overview = official shipped/history view**: shows only `shipped` / `in_transit` / `arrived` / `received` / `closed`; read-only fields; a per-card Advance → steps the post-ship lifecycle. `draft` / `ready_to_ship` never appear here.
> - Both pages read `shipments` / `shipment_lines`, **display Marketplace**, and show logistics + Decision Snapshot **read-only** (copied, never recalculated). **No factory-stock side effects** (deferred).

> **Overseas Inbound (planning input — spec [`OVERSEAS_INBOUND_SPEC.md`](./OVERSEAS_INBOUND_SPEC.md)):** an Inbound Draft created on **Overseas Stock** is a **planning input**, **not** a Shipment Draft. **Submit does NOT create a Shipment Draft directly — it creates a Weekly Shipping Plan + `shipping_plan_lines` (Decision Layer)**; only an **approved** plan advances to a Shipment Draft (existing Execution Commit). Overseas Stock (`overseas_inventory_snapshot`) is updated **only after the shipment is `received`** (via `overseas_inventory_movements`) — Submit/Approve never writes overseas available stock and never deducts `factory_stock`. Flow: `Overseas Stock → Inbound Draft → Submit to Weekly Shipping Plan → Pending Approval → Approved → Shipment Draft → Ship → received → Overseas Stock 入庫`. Planned design — not implemented.

- **Execution Plan Working Draft exists BEFORE Decision Commit** ("Shipping Allocation" = legacy name). It belongs to the **Persisted Recommendation Workspace** state (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A) — edited freely (ship-from / destination / qty / method per route), surviving collapse/expand and re-render. **It MAY persist to a non-commit DB Draft** (`shipping_allocation_drafts` / `_lines`); `sessionStorage` is UI recovery only, never the sole owner. Persisting it **does not commit**: it **creates no `shipping_plans` / `shipping_plan_lines`**, **never** updates an existing Weekly Shipping Plan, is **not** Qualified Incoming, and **never** reserves/deducts stock. The **Recommendation Summary** (system suggestion) is separate and **never submitted**. See [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) §8A and [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md) §11.
- **Decision Snapshot begins only after Submit Plan.** **Submit Plan** writes `shipping_plans` + `shipping_plan_lines` and **snapshots the decision context** (Current Stock, Avg Sales/Day, Days of Supply, Suggested Qty, Target Days, Shipping Method, Inventory Snapshot Date) so the plan does not drift with daily inventory changes. See [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md).
- **Shipping Qty is editable only in Draft**; Pending Approval / Approved are read-only.
- **Immutable Flow:** every downstream layer **inherits/copies** the upstream truth into its own snapshot, but **never mutates upstream**. **Shipment does not recalculate planning** — it copies the approved plan as an execution snapshot (`SHIPMENT_CENTER_SPEC.md`). Plan-layer status (`draft / pending_approval / approved / rejected / cancelled`) is distinct from shipment execution status.

### 5.2 Factory Stock Allocation → Shipping workflow (finalized)

The finalized Factory → Shipping workflow. **Allocation is a planning snapshot only** — physical inventory is never moved, reserved, or re-owned by the allocation step.

```
Factory Stock / Overseas Stock
        ↓
Weekly inventory confirmation                 (manual now; future API)
        ↓
Calculate available stock allocation by FC Share
   (using fc_regular_forecast + target rules)
        ↓
Save allocation snapshot into
   factory_stock_allocation_plans             (NO inventory movement)
        ↓
Reflect allocated quantity to Inventory Replenishment
   (CN / TW available quantity display)
        ↓
Submit Plan
        ↓
Weekly Shipping Plan
        ↓
Approval
        ↓
Shipment Draft
        ↓
Confirm Shipment & Dispatch
   (fac_current_stock −= dispatched qty; writes factory_stock_movements)
        ↓
Shipment Overview
```
> Canonical Factory Stock balance names (2026-07-21): `fac_current_stock` / `fac_reserved_stock` (see `DATABASE_RELATIONSHIP_MAP.md` Inventory Field Namespace Rule).

> **`factory_stock_allocation_plans` is ONLY a planning snapshot.** It does **NOT** move inventory, reserve inventory, or change ownership. It records *how much factory stock a planning cycle intends to make available by FC Share* — the physical `factory_stock` balance is untouched by allocation. The one verified physical effect is the **deduction of `fac_current_stock` at Confirm Shipment & Dispatch** (§5.4). Column-level purposes are in [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §6.

### 5.3 Allocation Rule (shared pool, recalculated weekly)

- **Existing inventory = Shared Pool.** Factory stock is one shared pool across companies (§4).
- **New purchase orders may carry intended-company information**, **but** factory allocation is **recalculated weekly** and is **not** bound to that company permanently.
- **Do NOT permanently bind factory inventory to a company.** Ownership/company intent is metadata, not a physical partition of stock.
- **Allocation always follows the FC Share calculation** (`fc_regular_forecast` + target rules). A new `allocation_version` each cycle lets recalculation happen **without losing historical plans**.

### 5.4 Factory Stock inventory-effect lifecycle

Planning steps (Submit Plan / Weekly Shipping Plan / Approval) change **no** inventory — they are Decision-Layer records. A **Recommendation Draft does not reserve or deduct** stock. Canonical lifecycle:
```
Plan Approval
→ Create Shipment Draft (Execution Commit; status = draft; copy Execution Snapshot; NO reserve)
→ Draft create / save / edit (NO reserve)
→ Ready to Ship = Formal Shipment Execution Commit (reserve Factory Stock where the origin is a factory warehouse)
→ Ship (deduct fac_current_stock and consume fac_reserved_stock)
```

| Effect | Event | Status | Verified state (2026-07-30) |
|--------|-------|--------|-----------------------------|
| **(handoff) Create Shipment Draft** | Approved Plan → Draft (Execution Commit) | **No reserve** | status = draft; snapshot copied; inventory untouched |
| **Reserve `fac_reserved_stock`** | **Ready to Ship** (`draft → ready_to_ship`) = Formal Shipment Execution Commit | **B-1 RESOLVED (decision only)** — owner §8A.1. **Implementation / Runtime / Deployment Not Started.** | No reserve logic exists in code yet; `fac_reserved_stock` is never written. Decision does not assert a writer/transaction exists. |
| **Deduct `fac_current_stock` + consume `fac_reserved_stock`** | **Ship** (Confirm Shipment & Dispatch) | `fac_current_stock` deduction Current Verified; reserved-stock consumption NOT implemented | Deducted at **Confirm Shipment & Dispatch** (`22_shipment_dispatch_handlers.gs`); writes `factory_stock_movements`. |

> **B-1 RESOLVED — Factory Stock Reserve Trigger = the successful Ready to Ship transition (`draft → ready_to_ship`) = Formal Shipment Execution Commit** (single Canonical owner: `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1). Plan approval, **Create Shipment Draft (the Approved-Plan → Draft Execution Commit)**, and Draft create / save / edit do **not** reserve. Reservation applies **only** to a **factory-origin** shipment; identity = **origin factory `warehouse_id (= shipments.origin_warehouse_id) + sku`** (never `shipments.warehouse_id` / `destination_warehouse_id` / `warehouse_code` / `company` / `factory_name`); an **overseas origin** uses the Overseas Outbound Lock / `wh_reserved_stock` (not `factory_stock`, §5.7). **Ship** deducts `fac_current_stock` + consumes `fac_reserved_stock`. **Cancel / unlock / reject / reopen / return-to-draft / negative-delta release / release status mapping remain BLOCKED under B-8** (§11). **Decision only — do NOT implement any reserve/release write from this alone; Implementation / Runtime / Deployment Not Started.**

### 5.5 Procurement lifecycle (finalized)

The finalized Request Order → Purchase Order chain. Draft layers are **editable recommendation scratchpads** (no procurement commitment); official records begin only at **Send Request** / **Approve**.

```
Recommendation Engine
        ↓
request_order_allocation_drafts
request_order_allocation_draft_lines      (editable recommendation — regenerable; no commitment)
        ↓  Send Request
request_orders
request_order_lines                       (OFFICIAL Request Order — created only on Send Request)
        ↓
request_order_line_sources                (per-line demand-origin sources; final grain / lifecycle = B-5)
        ↓  Approve
purchase_orders
purchase_order_lines                      (Procurement Commitment)
        ↓
request_order_po_links                    (Request ↔ PO relationship; supports split/merge)
        ↓
Purchase Order Export Template            (ALWAYS from purchase_orders / purchase_order_lines)
```

**Rules:**
1. **`request_order_allocation_drafts` / `request_order_allocation_draft_lines`** — a **temporary, editable** recommendation **generated by the calculation engine**; **can be regenerated** at any time. No stock movement, no procurement commitment. (Persistence layer already documented — `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.7.)
2. **`request_orders` / `request_order_lines`** — the **official Request Order**, **created only after the user presses "Send Request"** (never auto-created from a draft).
3. **`request_order_line_sources`** — records per-source demand-origin detail. **Columns recorded in prior documentation (not current Runtime evidence; Runtime UNVERIFIED; NOT a canonical FINAL schema):** `company` / `country` / `marketplace` / **`tier_type` (T1/T2/T3)** / **`source_month` (YYYY-MM)** / `requested_qty` / `approved_qty` / `shortage_qty` / `source_type` / `note`. **Runtime Write/Read Path = UNVERIFIED (this repair):** prior documentation recorded a possible write/read shape (a source row per request line at Send Request; the Request Order Draft *Company Allocation* popup showing rows, with legacy pre-write requests falling back to `request_order_lines` grouped by company). That observation was **not re-verified in this repair** and must not be treated as current or Canonical Runtime behaviour. **The final grain, primary/unique key, writer contract, lineage, per-source status lifecycle, any "source of truth" designation, and any append-only / never-deleted guarantee are Blocked — Requires Batch B Canonical Decision (§11 B-5)** — the above is prior documentation only (not current Runtime evidence), not a canonical decision. Canonical header status is **`request_orders.request_status`** (legacy `status` deprecated, read-fallback only); canonical bucket is **`request_order_lines.request_bucket`** (`tier_type` on lines deprecated). Deprecated `request_order_lines` columns (`final_order_qty`, `forecast_qty`, `current_stock`, `on_the_way_qty`, `factory_allocated_qty`, `reallocation_qty`, `source_company_count`, `source_site_count`, `product_name`, `need_reason`, `related_entity_type`, `related_entity_id`) are **no longer written or source of truth** (kept for back-compat, not deleted). Per-company allocation on lines is `km_qty` / `resus_qty` / `restw_qty`.
4. **`request_order_po_links`** *(new — spec only)* — the **relationship table** between Request Orders and Purchase Orders. Supports **one Request → multiple POs**, **multiple Requests → one PO**, **supplier split**, **factory split**, and **future expansion**. (This is the many-to-many join; the legacy one-time `request_orders.request_status = converted_to_po` marker + copied `purchase_orders.request_order_id` remain valid for simple 1→1 traceability.)
5. **Purchase Order Export Template** — **always generated from `purchase_orders` / `purchase_order_lines`**, **never from a Draft** (Request Order / allocation draft). The template is an Execution/Commitment output, not a planning preview.
6. **T1 / T2 / T3 buckets are PRESERVED at the Request Layer** — `request_order_lines.request_bucket` (+ `request_month`) is set on every line and **never merged at the Request stage**. **T1/T2/T3 are demand buckets, NOT direct PO-grouping rules.** The **PO Layer may merge later** (T1 urgent PO / T2+T3 normal PO / custom supplier·factory·SKU·series grouping) via **`request_order_po_links`**. Send Request does not force three PO records. Full-carton qty is enforced before an order becomes official.
7. **Request Order Draft = Decision Layer; Purchase Order Overview = Execution Layer (finalized).** ALL ordering decisions — **Approved qty, company split (KM/ResUS/ResTW), T1 vs T2+T3, schedule dates, tier cancel** — are completed in **Request Order Draft**. **PO Overview inherits the approved result** and handles execution only (supplier / factory / payment / delivery dates); its **split/merge logic is PAUSED** and must not re-decide T1/T2/T3 until an explicit future design. Company split was, in prior documentation, described as **one `request_order_line` per company** (`company` column) — a **legacy / provisional** description, **not** current Runtime evidence (Runtime UNVERIFIED) and **not** a canonical DB grain / uniqueness decision (Blocked under B-5, §11); a structured `request_order_line_sources` company-split field remains spec-only. **Factory display = `warehouses.warehouse_name`; `warehouse_id` stays the source of truth** (default Tier 1 = `WH-TW-CN-FACTORY-YOUXIN`).

### 5.6 Shipment lifecycle (finalized)

The finalized Shipping Allocation → Shipment chain. Same discipline: draft = editable recommendation; official records begin at **Submit Plan** / **Approve**.

```
Recommendation Engine
        ↓
shipping_allocation_drafts
shipping_allocation_draft_lines           (editable recommendation — regenerable; no commitment)
        ↓  Submit Plan
shipping_plans
shipping_plan_lines                       (OFFICIAL Shipping Plan — created on Submit Plan)
        ↓  Approve
shipments
shipment_lines                            (OFFICIAL shipment — created after approval)
        ↓
shipment_events                           (complete shipment lifecycle log)
        ↓
Shipping Export Template                  (ALWAYS from shipments / shipment_lines)
```

**Rules:**
1. **`shipping_allocation_drafts` / `shipping_allocation_draft_lines`** — an **editable** recommendation **generated by the recommendation engine**; **can be regenerated**. No stock movement (planning scratchpad). (Documented — `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6.)
2. **`shipping_plans` / `shipping_plan_lines`** — the **official Shipping Plan**, **created after Submit Plan** (Decision Commit).
3. **`shipments` / `shipment_lines`** — the **official shipment**, **created after approval** (Execution Commit copies the approved plan as an execution snapshot).
4. **`shipment_events`** — the **complete shipment lifecycle log**, e.g. **Created / Approved / Booked / Loaded / Departed / Arrived / Custom Clearance / Delivered / Received / Cancelled**. Designed to **support future tracking integration** (carrier/API events append here).
5. **Shipping Export Template** — **always generated from `shipments` / `shipment_lines`**, **never from a Draft** (shipping-allocation draft / shipping plan draft).

> These two lifecycles are the **finalized** architecture for future implementation. **Runtime status = UNVERIFIED (this repair):** prior documentation recorded a possible implementation shape for `request_order_line_sources` (a DB tab with a header constant `13_procurement_handlers.gs:57`; a write at Create/Send Request; an `approved_qty` sync on Save · Submit · Convert to PO; a read by the adapter + Request Order Draft Company-Allocation UI). That observation was **not re-verified in this repair** and must not be treated as current or Canonical Runtime behaviour. **B-5 boundary (NOT canonical):** the source table's final grain, the one-row-per-line mapping, its source authority, the append-only guarantee, and the writer / synchronization contract remain **Blocked under B-5** (§11). Other elements likewise remain pending (Runtime UNVERIFIED): per-source **status lifecycle** (source-row status behaviour on cancel — `13_procurement_handlers.gs:1178`), the future **three-layer source design**, **`request_order_po_links`**, and **`shipment_events`** as a full lifecycle log. No schema/code change is made by this doc sync.

### 5.7 Overseas Warehouse Operation branch (CANONICAL 2026-07-21 — runtime NOT implemented)

After a shipment becomes formal, the system evaluates its **origin / destination warehouse identities** and idempotently auto-creates/links the required **overseas warehouse operation**. Authority: `SHIPMENT_CENTER_SPEC.md` §23; pages: `WAREHOUSE_OPERATIONS_SPEC.md`.

```
Weekly Shipping Plan
        ↓  Execution Commit
Shipment Draft            (common transportation data completed; endpoints carried from the plan)
        ↓  Ship / formalize
Formal Shipment
        ↓
Shipment Overview / Shipment Events
        ↓  auto-create / link Overseas Warehouse Operation (idempotent; direction runtime-derived)
        ├─ destination = qualifying overseas WH (+ is_receiving_enabled)  →  Overseas Inbound  branch
        └─ origin      = qualifying overseas WH (+ is_shipping_enabled)   →  Overseas Outbound branch
        ↓  WMS / API execution (pre-advice / outbound order → submit → monitor → result)
Confirmed receipt (Inbound)  |  Confirmed ship-out (Outbound)
        ↓
Overseas Inventory Movement   (overseas_inventory_movements; balances change only on confirmed execution)
```

- **Overseas Inbound and Overseas Outbound are SEPARATE operational branches and SEPARATE pages** — never one combined operation. An overseas-to-overseas **Transfer** produces **one Outbound (origin) + one Inbound (destination)**; a factory or non-qualifying endpoint produces neither. Contracts: `OVERSEAS_INBOUND_SPEC.md` §10 (receiving: `overseas_inbound_operations` / `_operation_lines` / `_receipts` / `_receipt_lines`), `OVERSEAS_OUTBOUND_SPEC.md` §3–§6 (fulfillment: `overseas_outbound_operations` / `_operation_lines` / `_confirmations` / `_confirmation_lines`). **All planned design — not implemented.**
- **Direction is runtime-derived** from origin/destination identity — never a user-entered field. **Operation uniqueness = `shipment_id + warehouse_id + operation_type`**; `shipment_id` is the authoritative linkage. **Separate idempotency keys** per action (create/link · WMS submission · receipt confirmation · shipout confirmation · reversal). **Auto-create ≠ auto-submit; Submit ≠ deduct.**
- **Shipout push direction:** **Outbound Instruction Push = KM → WMS** (at Submit, after Lock reserves); **Shipout Confirmation Push = WMS → KM** (actual shipped). Ship Confirm deducts **only actual shipped qty** (partial = `shipped_qty_this_confirmation`). **Never "shipout first, then push."**
- **Overseas Inventory** (`overseas_inventory_snapshot` / `_movements`) updates **only** on confirmed receipt (increase, good qty only) / confirmed ship-out (decrease, actual shipped qty) and **excludes** Factory Inventory. **Delivered ≠ Received.**

**Dual-direction fulfillment orchestration (FUTURE; Phase-1 MANUAL — canonical owner `SHIPMENT_CENTER_SPEC.md` §23.11).** One execution event drives **both** a destination Inbound **and** an origin Shipout Instruction; the destination-side external references/labels are packaged with the shipout instruction for the origin party (e.g. factory) to execute. The **Formal Shipment orchestrator** creates both — the Overseas Inbound Receiving Operation never creates the origin Shipout and is not the planning SSOT:

```
Inbound Planning Request                       (planning intent SSOT)
   → Formal Shipment / Orchestrator            (execution SSOT)
        ├─→ Destination Inbound  →  external submission  →  external reference / label retrieval
        └─→ Origin Shipout Instruction          (parallel; created by the orchestrator, NOT the Inbound)

Destination Inbound reference/labels  +  Origin Shipout Instruction
   → Factory Shipping Package
   → Factory shipment (departure / shipping events)
   → Overseas Inbound Receiving
   → Receipt confirmation (confirmed good qty only)
   → Overseas Inventory
```
- **Phase-1 is fully MANUAL** (create/record inbound; maintain transit qty+status; upload/register retrieved labels/docs; assemble + hand the Factory Shipping Package to the factory; update departure/transit/arrival; confirm receipt). **NOT implemented:** automatic destination-inbound submission · shipping-label retrieval · origin-shipout creation · factory API delivery · WMS/API sync · automatic reservation/deduction · automatic Formal Shipment orchestration.
- Labels/carton-labels/appointment docs reference the **Document Engine** (`generated_documents`) — never binary in the operation header. **8 separate idempotency scopes** (§23.11) — never one shared key.

**Inventory-domain separation (CANONICAL 2026-07-21 — authority `DATABASE_RELATIONSHIP_MAP.md` §6.0).** Factory Inventory and Overseas Inventory are **separate domains** — a factory→overseas shipment never merges the two into one shared balance:

```
Factory dispatch confirmed
   → Factory Stock deduction (factory_stock_movements)          [Factory Inventory domain]
   → Shipment in transit (shipments / shipment_events)          [transportation state — NOT inventory]
   → (no Overseas Inventory increase while merely in transit)
   → Overseas Inbound receipt confirmed
   → Overseas Inventory increase (overseas_inventory_movements → overseas_inventory_snapshot)   [Overseas domain]

Overseas Outbound confirmed shipped
   → Overseas Inventory decrease (overseas_inventory_movements → overseas_inventory_snapshot)   [Overseas domain only]
   → transportation lifecycle continues (shipments / shipment_events)
```
- **In-transit goods are never simultaneously counted as both Factory Inventory and Overseas Inventory.** A confirmed factory dispatch consumes Factory Inventory per the finalized reservation/deduction lifecycle (§5.4/§5.6); a confirmed overseas receipt creates the Overseas Inventory balance. **Overseas Outbound never affects Factory Inventory.**

### Step 1 — Inventory Replenishment
- User selects **Country, Marketplace, Target Days**.
- System calculates current inventory, sales, forecast, factory stock, on-the-way, and **suggested replenishment**.
- **Recommendation Summary is a calculation preview only** (system suggestion; never submitted). The **Execution Plan** is the PM's actual plan that Submit Plan reads.
- **Decision Truth starts only after Submit Plan**, which creates `shipping_plans` / `shipping_plan_lines`. The pre-commit Execution Plan is a **non-commit Recommendation Draft** that MAY persist to `shipping_allocation_drafts` / `_lines` (§5.6) — persisting it is not a Decision.
- **The formal Shipping Plan is `shipping_plans` / `shipping_plan_lines`; the recommendation Draft is `shipping_allocation_drafts` / `_lines`** — two distinct stores, neither a substitute for the other.

### Step 2 — Factory Stock / PO Weekly Validation
- Factory users may review `factory_stock`, future purchase orders, and production schedule.
- Purpose: **verify stock and production availability before shipment planning**.
- Reduces the risk of submitting shipment details that factories cannot fulfill.
- **Weekly inventory confirmation** here feeds the **Factory Stock Allocation** step: available stock is allocated by **FC Share** and saved as a planning snapshot in `factory_stock_allocation_plans` (no inventory movement) — see §5.2–§5.4.

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
- **Read-model ownership (field-level SSOT: [`SHIPMENT_ROUTE_AND_EVENT_SPEC.md`](./SHIPMENT_ROUTE_AND_EVENT_SPEC.md)):** shipment header/status = `shipments`; **planned map line = `shipment_routes`** (per-shipment snapshot copied from `shipment_route_templates` + nodes, resolved via `warehouses.logistics_region`); **actual timeline = `shipment_events`** (append-only); **current position = latest valid event**; **next planned node = first pending route node**. Routes/events are non-blocking enrichment — `shipments`/`shipment_lines` remain Execution Truth; Event → Shipment-status mapping is an Open Decision. Planned + all four tables are **documented, not implemented**.

### Step 6 — Shipping History
- Reads `shipments` + `shipment_lines`.
- Historical table / search view of completed or all shipments.
- **No separate Shipping History DB.**

### Step 7 — FC Summary Monthly Review
- Monthly or periodic review of `fc_regular_forecast`.
- User can add/edit base forecast, special events, target rules.
- **Special event and target rules feed the future calculation engine.**
- **FC Summary is forecast management, not direct order execution.**
- **FC Summary does NOT create SKUs / FC base rows** (the "+ Add SKU" button is removed for data safety). SKU + FC base-row creation is owned by the **SKU Details / Inventory SKU flow** (and batch Import Forecast). See [`FC_SUMMARY_SPEC.md`](./FC_SUMMARY_SPEC.md) §1.1.
- **Special Event forecast** (`fc_special_events`) has two linked sources — **Campaign** (promotion source of truth) and **FC Summary direct** (supply-chain forecast source of truth) — joined by `campaign_id` / `campaign_sku_line_id`, never blind two-way synced. Event Flag = **Normal** creates no special-event row (baseline is `fc_regular_forecast`); Event Flag != Normal requires FC Qty. See [`FC_SUMMARY_SPEC.md`](./FC_SUMMARY_SPEC.md) §9–§10, §12.
- **FC Summary Special Event Builder v2** creates deal-priced events in **Single SKU** (≤8 rows) or **Category / Series** group-card mode (grouped by **category + series** only; `regular_price` is a per-SKU value, **not** part of the group key — `fc-summary.js:2643`). Save target = `campaigns` → `campaign_sku_lines` → `fc_special_events`. The campaign / line writers **SOURCE-EXIST and are router-wired** (`20_campaign_write_handlers.gs`); a **single atomic three-table Save is NOT implemented** (client-side sequential writes; `handleUpsertFcSpecialEvent_` rejects an event with a blank `campaign_id` (refusing a link-less write — this is fake-success prevention, NOT orphan prevention), but it does NOT validate that the referenced parent campaign exists and no DB foreign-key enforcement or atomic three-table transaction/rollback is proven — so full orphan prevention remains **Not Proven / Risk Exists**); **Deployment/Runtime UNVERIFIED**. See [`FC_SUMMARY_SPEC.md`](./FC_SUMMARY_SPEC.md) §9, §12.

### Step 8 — Request Order / 下單系統
- Existing page.
- Reads forecast, inventory, factory stock, on-the-way, warehouse stock.
- Calculates **shortage / surplus and final order need**.
- **Forecast shortage does NOT directly equal order qty.**
- Reallocation and order-need logic are defined in [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md).
- User can review, adjust, and send the request.
- Send Request persists `request_orders` / `request_order_lines`; only a later Approve / Convert action creates `purchase_orders` / `purchase_order_lines` and related PO documents. Request Order and Purchase Order are distinct lifecycle stages.

> **Procurement Layer Phase 1 (implemented — API-ready foundation):** the Procurement Center adds **Request Order Draft** (a UI/page label ONLY — it does NOT change the storage boundary: the pre-Send editable working state is persisted in `request_order_allocation_drafts` + `request_order_allocation_draft_lines`, a **non-commit Recommendation Workspace**, NOT the formal Request Order tables. **Send Request** copies eligible allocation-draft lines into `request_orders` + `request_order_lines` — the **formal, approval-stage Request Order** whose internal `request_status` may be Draft / Pending Approval / Approved. **Approve / Convert** is a later action that creates `purchase_orders` + `purchase_order_lines`), **Purchase Order Overview** (= Procurement Commitment dashboard; `purchase_orders` + `purchase_order_lines`), and **Purchase Order List** (= PO operational list / history). **Immutable Flow:** `Shipment / Inventory / Factory Stock` → Request Recommendation Workspace (`request_order_allocation_drafts` / `_lines`) → **Send Request** → Formal Request Order (`request_orders` / `request_order_lines`) → **Approve / Convert** → Purchase Order (`purchase_orders` / `purchase_order_lines`) — downstream copies upstream, never writes back (PO ⇏ Request Order; Request Order ⇏ Shipment / Inventory / Factory Stock). No auto-procurement engine, supplier API, or payment flow in Phase 1. See [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md).

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
| 8 Request Order | forecast, inventory, factory, on-the-way | Send Request → `request_orders` / `request_order_lines`; Approve / Convert → `purchase_orders` / `purchase_order_lines` (separate downstream stage — Send Request never writes PO directly; atomicity remains BLOCKED — B-6) |
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
- **Live Analysis / calculation preview** is transient (recomputed, not committed). The **Recommendation Draft (Recommendation Workspace) MAY be persisted** to `shipping_allocation_drafts` / `_lines` as a non-commit snapshot; `sessionStorage` is UI recovery only. Persisting a Draft is never a Decision Commit.
- **Approved plans become shipments through explicit user action** (Step 4), not automatically.
- **Shipments are historical snapshots** and **must not rely only on a `shipping_plans` join to reconstruct actual shipment state** — the snapshot (header + lines copied at creation) is the authoritative shipment record.

| Artifact | Persisted? | Trigger |
|----------|-----------|---------|
| Live Analysis / replenishment calculation | No (transient) | — (recomputed, not committed) |
| Recommendation Summary (system suggestion) | No (transient) | — (display of the Draft snapshot; never submitted) |
| Recommendation Draft (Execution Plan Working Draft) | **Optional — non-commit** | MAY persist to `shipping_allocation_drafts` / `_lines`; `sessionStorage` = UI recovery only; not a Decision |
| `shipping_plans` / lines (Decision Truth) | Yes | Submit Plan |
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

## 11. Batch B Canonical Decisions Required (consolidated blockers)

The following are the Batch B decisions. **B-1 is RESOLVED** (Batch B Round 1, 2026-07-30 — decision only; owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1); **B-2 … B-8 remain NOT decided** and must not be guessed or pre-implemented. Undecided rows use the marker — **`BLOCKED — Requires Batch B Canonical Decision`** — and point here. Each row lists the conflict, the affected docs, and what is forbidden until the decision closes.

**Batch B Decision Registry — fixed IDs, titles and order (B-1 … B-8). Do not renumber, merge, or rename.**

| Decision ID | Blocked Decision (fixed title) | Conflict Evidence | Affected Owners | Pre-decision Prohibition |
|---|---|---|---|---|
| **B-1** | **Exact Reserve Trigger** — **RESOLVED (2026-07-30, decision only)** | **Resolved:** reserve trigger = the **successful Ready to Ship** transition (`draft → ready_to_ship`) = Formal Shipment Execution Commit; Plan approval / Create Draft (Execution Commit) / Draft create-save-edit do not reserve; identity = **origin factory `warehouse_id (= shipments.origin_warehouse_id) + sku`** (never `shipments.warehouse_id`/`destination_warehouse_id`/`warehouse_code`/`company`/`factory_name`); overseas origin → Overseas Outbound Lock / `wh_reserved_stock`, not `factory_stock`. **Ship** deducts `fac_current_stock` + consumes `fac_reserved_stock`. Prior reserve@approval / reserve@draft interpretations withdrawn. **Single Canonical owner: Architecture Principles §8A.1.** | this doc, Blueprint, Runtime Architecture, Architecture Principles §8A.1, DB Map, Shipment Center | Decision resolved; **Implementation / Runtime / Deployment Not Started; Runtime Verification Not Verified.** Still forbidden from this decision alone: implementing a reserve write, treating `fac_reserved_stock` as maintained, or reserving before Ready to Ship. **Cancel / unlock / reject / reopen / return-to-draft / negative-delta release / release status mapping remain B-8 (BLOCKED) — not owned by B-1.** |
| **B-2** | **Shipping Group Key** | Current code groups by 5 route fields; historical "six-value" wording exists in other specs' revision notes. No Batch A body asserts either as canonical. | this doc, WEEKLY_SHIPPING_PLAN_MAPPING_SPEC, DATABASE_RELATIONSHIP_MAP | Asserting any key-field set as canonical; depending on an assumed key. |
| **B-3** | **Marketplace Header／Line placement** | Code derives marketplace onto the plan header; older specs treated it as a group-key member. Undecided. | this doc, WEEKLY_SHIPPING_PLAN_MAPPING_SPEC, DATABASE_RELATIONSHIP_MAP | Modeling Marketplace as a plan-group key column, or asserting header-vs-line as decided. |
| **B-4** | **Qualified Incoming table-specific DB Status Allowlist** | Code uses a terminal-state denylist proxy (`13_procurement_handlers.gs:407`); no positive allowlist. | this doc, Inventory Table Mapping, Calculation Rules (business semantics owner), Runtime | Creating a positive DB Status Allowlist; treating raw On-the-way as Qualified Incoming. |
| **B-5** | **`request_order_line_sources` final Grain／Writer／Lineage／Lifecycle** | Table + a qty write/read path exist in code; final grain, writer contract, lineage, per-source status lifecycle are not established. | this doc §5.5/§5.6, DB Map | Claiming final grain/writer/lineage/lifecycle or "one company = one line = one source" as canonical. |
| **B-6** | **Request → PO Atomic Flow** | Single-action handler `handleCreatePurchaseOrderFromRequest_` exists but is **not** lock-wrapped and has **no** rollback. | this doc §5.5, Blueprint §7, DB Map | Claiming atomic/transactional/rollback-safe conversion. |
| **B-7** | **Recommendation Cycle／Unique Key** | No Draft table persists a reliable cycle key; header creation is not idempotent. | Recommendation Runtime Spec, Runtime Architecture, DB Map | Proposing a dedicated `cycle_key` column, composite key, or unique index as decided. |
| **B-8** | **Cancellation／Rollback status mapping** | Release-on-cancel/unlock/reject/reopen for reservations and source rows is undefined. | this doc, Calculation Rules (business semantics), DB Map | Defining a cancellation/rollback status mapping or reservation-release rule. |

> These blockers are **spec-consolidation only** — no code, Apps Script, DB, or runtime is changed by recording them here. A Recommendation Draft may be persisted as a planning artifact; it is not Decision Truth, is not Qualified Incoming, does not reserve inventory, and does not create Inventory Movement. **B-1 is now resolved** (trigger = the successful Ready to Ship transition (`draft → ready_to_ship`) = Formal Shipment Execution Commit; decision only — owner §8A.1); excluding Draft was consistent with that resolution. B-2 … B-8 remain open.

---

**v1.4 Architecture Specification. Documentation only; no code or DB changes are implied by this document. Calculation formulas are frozen in `SUPPLY_PLANNING_CALCULATION_RULES.md` v4.1 FINALIZED. B-1 Reserve Trigger resolved (§11 — decision only, owner §8A.1); Batch B blockers B-2 … B-8 (§11) remain open.**

**End of Document**
