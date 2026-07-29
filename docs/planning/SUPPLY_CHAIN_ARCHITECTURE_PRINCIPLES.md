# Supply Chain Architecture Principles

> **Owner Boundary (reviewed 2026-07-28).**
> - **Document Role:** the stable home for supply-chain **architecture language** (layers, truth, commit points, immutable flow).
> - **Canonical Owner For:** architecture-layer semantics — Analysis / **Persisted Recommendation Workspace** / Decision / Execution / Settlement truth; Decision Commit; Immutable Flow; Truth Flow; Single Source of Truth; Business Object Identity.
> - **Not Owner For:** formulas (`SUPPLY_PLANNING_CALCULATION_RULES.md`), schema (`DATABASE_RELATIONSHIP_MAP.md`), cadence/service boundary (`SYSTEM_RUNTIME_ARCHITECTURE.md`), E2E flow (`SUPPLY_CHAIN_SYSTEM_FLOW.md`), the **Reserve Trigger** (Batch B).
> - **Status:** Reviewed — Batch B Blockers Remain.
> - **Current Version:** v1.3 (Batch A repair: draft-persistence correction + Recommendation Workspace layer).
> - **Last Reviewed:** 2026-07-28.
> - **Depends On:** none (upstream authority for layer language).
> - **Blocked By:** Batch B — Factory Stock **Reserve Trigger** (see the consolidated Batch B Handoff).

**Status:** 🟢 v1.3 — Stable architecture principles (four-layer lifecycle + **Persisted Recommendation Workspace**)
**Last Updated:** 2026-07-28
**Changelog:**
- **v1.3 (2026-07-28)** — Draft-persistence rule stated (§3/§8A): a Recommendation Draft (Recommendation Workspace) may be persisted as a non-commit snapshot; `sessionStorage` is UI recovery only. Added the Persisted Recommendation Workspace state, the Recommendation Snapshot term, and the parallel Procurement branch. Factory Stock **Reserve Trigger** = BLOCKED — Requires Batch B. Documentation only; no DB/runtime change.
- v1.2 — Formalized the **four-layer lifecycle** (Analysis → Decision → Execution → **Settlement**): added §10 **Supply Chain Layer Lifecycle** (per-layer owner/truth/lifecycle, incl. **Decision Layer Completion** and the Execution lifecycle Draft→Booked→…→Closed), §11 **Truth Flow extended to Settlement**, §12 **Layer Responsibility**. Added **Settlement Truth** + **Decision Layer Completion** to §1A. Drives `shipping_plans.completed_at` / `completed_by` (Done) — see `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`.
- v1.1 — Added §4B **Snapshot Provenance** (Value + Source + Provenance; Provenance is architecture-reserved, not persisted) and §5A **Truth Flow Principle** (truth flows downstream, authority never flows back); added both to §1A terminology; cross-referenced from §4. No DB / runtime / API change.
**Maintained By:** Development Team
**Governs:** the layer language, immutable-flow discipline, decision/execution commit points, and single-source-of-truth rules used across all Kitchen Mama Operation System supply-chain specs.
**Referenced by:** [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md), [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), and future Export Center / API Architecture specs.

> **Purpose.** This is the **single, stable home** for the supply-chain architecture language. Individual specs (Inventory Replenishment, Weekly Shipping Plan, Shipment Draft/Overview, Request Order, Purchase Order, Export Center, API Architecture) should **reference** these principles rather than re-defining them, so the definitions never drift or conflict. This document introduces **no** code, DB schema, Apps Script, BigQuery, API, or runtime change.

---

## 1. Why this document exists

The supply-chain system runs across distinct **layers**, each with a different relationship to truth and time:
- the **Analysis Layer** must always reflect *now*;
- the **Decision Layer** must preserve *what was decided*;
- the **Execution Layer** must preserve *what actually happened*.

Mixing these (e.g. recomputing a saved decision from live data, or letting execution rewrite a plan) silently corrupts history and audit. This file formalizes the language and rules that keep them separate.

---

## 1A. Architecture Terminology (canonical — all specs reference these, never redefine)

These are the **official, single-definition** terms for the Kitchen Mama Supply Chain System. Every other spec must **reference** them and must **not** re-define them.

| Term | One-line definition | Section |
|------|---------------------|---------|
| **Analysis Truth** | The live, always-recalculated state owned by Inventory Replenishment. | §2.1 |
| **Decision Truth** | The committed **Shipping** planning decision owned by Weekly Shipping Plan (`shipping_plans` / `shipping_plan_lines`). The **parallel Procurement branch** commits via its own Request Order execution record (`request_orders` / `request_order_lines`, owned by `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`) — a separate committed record, **not** this Shipping Decision Truth and **not** owned by Weekly Shipping Plan. | §2.2 |
| **Execution Truth** | The physical execution record owned by Shipment (`shipments` / `shipment_lines`). | §2.3 |
| **Settlement Truth** | The final, immutable records owned by the Settlement Layer (history / documents / audit / KPI). | §10 |
| **Decision Layer Completion** | The Decision Layer's terminal state (Done): decision finished, Execution Layer has taken over, snapshot preserved (`completed_at`). | §10 |
| **Recommendation Snapshot** | The **non-committed** system recommendation held in the **Persisted Recommendation Workspace** (may be a DB Draft). It is analysis output made durable — **not** Decision Truth, **not** Qualified Incoming, and it **never** reserves/deducts stock. | §8A |
| **Working Draft** | The user-editable state layered on the Recommendation Snapshot before commit (Submit Plan / Send Request). It **may be persisted to a DB Draft** (non-commit); `sessionStorage` is **UI recovery only**, never the sole owner. | §8A |
| **Decision Commit** | The moment Analysis output becomes a persisted decision = **Submit Plan**. | §3 |
| **Execution Commit** | Approved Weekly Shipping Plan → Create Shipment Draft. | §3A |
| **Decision Snapshot** | Immutable per-SKU planning context frozen on `shipping_plan_lines` at Decision Commit. | §4 |
| **Execution Snapshot** | Full copy of the Decision Snapshot taken when the Shipment Draft is created; owned by the Shipment Layer. | §4A |
| **Snapshot Provenance** | The conceptual model of a snapshot as Value + Source + Provenance; Provenance (why / which engine) is architecture-reserved, not persisted. | §4B |
| **Immutable Flow** | Every downstream layer copies upstream truth into its own snapshot, but never mutates upstream. | §5 |
| **Truth Flow Principle** | Truth flows downstream, context flows with it, authority never flows back. | §5A |
| **Single Source of Truth** | Each layer has one Owner / Truth / Snapshot; no duplicate authority. | §7 |
| **Business Object Identity** | Stable business-level identity of a logical object, independent of physical DB identity. | §8 |

> Canonical chain (Batch A 2026-07-28): **Live Analysis → Persisted Recommendation Workspace (non-commit Draft) → Decision Commit → Decision Snapshot → Execution / Settlement.** Expanded: Analysis → Recommendation Snapshot / Working Draft → Decision Commit (Submit Plan — Shipping; the parallel Procurement branch's Send Request creates the Request Order execution record, not a Shipping Decision Commit) → Decision Snapshot → Execution Commit → Execution Snapshot → Shipment Events → History → Documents.
>
> **Two parallel business branches (never sequential — Engine A does not feed Engine B):**
> - **Shipping:** Engine A → Shipping Recommendation Workspace → Decision Commit (Submit Plan) → Shipping Plan → Shipment → Receive / Close.
> - **Procurement:** Engine B → Request Recommendation Workspace → **Request Execution Transition (Send Request)** → Request Order (execution record) → Purchase Order → Production / Receiving → Factory Stock. *(Send Request is the procurement request-execution transition, not a Shipping Decision Commit and not Shipping Decision Truth.)*
> They **meet only at Factory Stock** (Procurement produces it; Shipping consumes it) — see `SUPPLY_CHAIN_SYSTEM_FLOW.md` §5.5/§5.6 and `SYSTEM_RUNTIME_ARCHITECTURE.md` §6.

---

## 2. Core Architecture Language (official terms)

### 2.1 Analysis Layer

- **Owned by:** Inventory Replenishment (貨物庫存表).
- **Purpose:** recalculate from **live data**.
- **Source of Truth:** live inventory, forecast, sales, snapshot imports, factory stock, overseas stock.
- **Rules:**
  - Analysis **can change whenever source data changes**.
  - Analysis **must not be treated as a committed decision**.

### 2.2 Decision Layer

- **Owned by:** Weekly Shipping Plan.
- **Purpose:** convert analysis output into a **saved business decision**.
- **Source of Truth:** `shipping_plans`, `shipping_plan_lines`.
- **Rules:**
  - The Decision Layer **preserves what the PM decided at Decision Commit** (§3).
  - It **must not silently drift** with live inventory after creation.

### 2.3 Execution Layer

- **Owned by:** Shipment Draft / Shipment Overview.
- **Purpose:** execute approved decisions and track physical movement.
- **Source of Truth:** `shipments`, `shipment_lines`.
- **Rules:**
  - Shipment **copies approved plan data as an execution snapshot**.
  - Shipment **must never recalculate planning logic**.

> These three layers map directly to the "Three-Layer Separation" philosophy in `SUPPLY_CHAIN_SYSTEM_FLOW.md` §2A; this file is the authoritative definition.

---

## 3. Decision Commit

**Decision Commit** is the moment when analysis output becomes a **persisted planning decision**.

**In the current system: Submit Plan = Decision Commit.**

- **Before Decision Commit:**
  - Inventory Replenishment recalculates from live data.
  - Draft or Recommendation records **may be persisted** (a Recommendation Workspace / Draft snapshot). Such records are **planning artifacts only** — they are **not** Decision Truth, Qualified Incoming, Inventory Reservation, Inventory Movement, Request Order commitment, PO commitment, or Shipment commitment.
- **After Decision Commit:**
  - `shipping_plans` and `shipping_plan_lines` are created (Decision Truth begins here).
  - The line-level **Decision Snapshot** (§4) is **frozen**.

---

## 3A. Execution Commit

**Definition:**
```
Execution Commit  =  Approved Weekly Shipping Plan  →  Create Shipment Draft
```

**After Execution Commit:**
- `shipments` are created.
- `shipment_lines` are created.
- The **Decision Snapshot** is **copied** (not recomputed).
- An **Execution Snapshot** (§4A) is created.

**The Execution Layer must NOT recalculate any of:**
- Current Stock
- Avg Sales
- Days of Supply
- Suggested Qty
- Target Days
- FC Context
- Event Context

All of these are **copied directly** from the Decision Snapshot. **Shipment only executes** — it never re-derives planning values.

---

## 4. Decision Snapshot

**Decision Snapshot** is the **immutable per-SKU planning context** captured at Decision Commit.

- **Stored only on:** `shipping_plan_lines`.
- **Required fields:**
  - `snapshot_current_stock`
  - `snapshot_avg_sales_per_day` — the **final adopted** Avg Sales/Day (a Runtime result frozen here at commit; see §3 / `SUPPLY_PLANNING_CALCULATION_RULES.md` §22.6)
  - `snapshot_days_of_supply`
  - `snapshot_suggested_qty`
  - `snapshot_target_days`
  - `snapshot_fc_context`
  - `snapshot_event_context`
  - `snapshot_avg_sales_source` — which Avg Sales **source** the decision adopted
  - `snapshot_avg_sales_warning` — Avg Sales data-quality warning (independent of source)
  - `snapshot_normal_days_count`, `snapshot_excluded_event_days_count`
- **`snapshot_avg_sales_source` allowed values (fixed enum):** `weekly_7d`, `normalized_30d`, `manual_override`, `forecast_override`, `ai_adjusted`. This records the **final Source** of the Avg Sales value — **not** a calculation method. Runtime currently produces only `weekly_7d` / `normalized_30d`; the other three are reserved Future Extension.
- **`snapshot_avg_sales_warning` is an independent field** (`blank` / `low_sample_warning` / `insufficient_normal_days` / `event_contaminated_weekly_sales`). **Source and Warning must never be combined** into one token.
- **Rules:**
  - The Decision Snapshot becomes the **source of truth for Shipment execution**.
  - It **must never be recalculated after commit**.

> Field-level definitions and the Submit-Plan write contract live in `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` (§0 Glossary, §5.2, §5.3); this file governs the principle and owns the `snapshot_avg_sales_source` enum.
>
> **Snapshot Provenance (§4B):** the persisted snapshot stores the **Value** (`snapshot_avg_sales_per_day`) and the **Source** (`snapshot_avg_sales_source`). The **Provenance** (which engine / decision produced it) is **architecture-reserved, not persisted** — see §4B.

---

## 4A. Execution Snapshot

**Definition:**
```
Execution Snapshot  =  the full copy of the Decision Snapshot taken when the Shipment Draft is created
```

- The **Execution Snapshot belongs to the Shipment Layer** (`shipments` / `shipment_lines`).
- The Execution Snapshot **may never modify the Decision Snapshot**.
- **Shipment can never push back to / recompute the Weekly Shipping Plan.**
- It is created at **Execution Commit** (§3A) by copying the Decision Snapshot verbatim; the Execution Layer adds only execution data (carton numbers, ETD/ETA, tracking, etc.), never planning recomputation.

> Decision Snapshot (Decision Layer, owned by Weekly Shipping Plan) → copied into → Execution Snapshot (Execution Layer, owned by Shipment). The copy is one-way and immutable upstream.

---

## 4B. Snapshot Provenance

A **Snapshot** conceptually consists of **three parts**:

```
Snapshot  =  Snapshot Value  +  Snapshot Source  +  Snapshot Provenance
```

| Part | Meaning | Example | Persisted today? |
|------|---------|---------|------------------|
| **Snapshot Value** | The frozen business value. | `snapshot_avg_sales_per_day` = 12.4 | ✅ Persisted (Decision Snapshot, §4) |
| **Snapshot Source** | Which business **source** produced the value. | `weekly_7d`, `normalized_30d`, `manual_override`, `forecast_override`, `ai_adjusted` | ✅ Persisted as `snapshot_avg_sales_source` (§4) |
| **Snapshot Provenance** | **Why / by which engine / by which decision** the value exists. | `AI Engine v2`, `Forecast Engine`, `Manual Override`, `Planning Engine`, `Promotion Normalization`, `Current MVP Rule` | ❌ **NOT persisted — architecture only** |

**Snapshot Provenance is architecture-reserved:**
- It is **NOT persisted**. There is **no DB column** and **no new field** for it now.
- It exists in the architecture **only** to reserve the concept for a **future AI Audit Trail** (recording which engine / decision / model version produced a snapshot value).
- The currently persisted `snapshot_avg_sales_source` captures the **Source** part only; the **Provenance** part (engine / model version / decision lineage) remains a **future extension**.

> **No DB changes. No new columns. Architecture reservation only.** This section defines vocabulary so future AI / Planning modules can attach provenance without re-modeling the snapshot.

---

## 5. Immutable Flow Principle

> **Every layer owns its own truth. Every downstream layer copies the upstream truth into its own snapshot. But downstream must never mutate upstream.**

(Equivalently: *every downstream layer inherits the upstream layer, but never mutates it.*)

**The full chain:**
```
Analysis Truth
      ↓  Decision Commit
Decision Truth
      ↓  Execution Commit
Execution Truth
      ↓
History
      ↓
Documents
```

**Examples:**
- Inventory Replenishment owns **Analysis Truth**.
- Weekly Shipping Plan **copies Analysis Truth into Decision Truth** (at Decision Commit → Decision Snapshot).
- Shipment **copies Decision Truth into Execution Truth** (at Execution Commit → Execution Snapshot).
- Shipment **must never mutate** Weekly Shipping Plan.
- Weekly Shipping Plan **must never mutate** Inventory Replenishment.
- History and Documents are **derived downstream** and never feed back upstream.

**Why it matters:** the copy-into-own-snapshot rule is what makes history and audit trustworthy — each layer's record is stable regardless of what later changes upstream or downstream.

---

## 5A. Truth Flow Principle

> **Truth flows downstream. Context flows with it. Authority never flows back.**

```
Analysis Layer
      ↓
Decision Layer
      ↓
Execution Layer
```

Each **downstream** layer **inherits** the upstream truth (value **and** its context), but **never mutates** the upstream layer.

**Examples:**
- **Shipment inherits Shipping Plan. Shipment never edits Shipping Plan.**
- **Shipping Plan inherits Inventory Replenishment. Shipping Plan never edits Inventory Replenishment.**
- **Inventory inherits Amazon Runtime Data. Inventory never edits Amazon Runtime Data.**

**Relationship to §5 Immutable Flow:** Immutable Flow states the *mechanism* (each layer copies into its own snapshot and owns only its records). Truth Flow states the *direction of authority* (truth + context move downstream; authority never moves upstream). Together they guarantee a downstream layer can read everything it needs and change nothing it does not own.

---

## 6. Architecture Diagram

```
        Analysis Truth
   (Inventory Replenishment)
            |
            | Recommendation Workspace  (Execution Plan Working Draft — non-commit; MAY persist to a DB Draft; §8A)
            v
            | Decision Commit      (Submit Plan)
            v
        Decision Truth
    (Weekly Shipping Plan)         ── freezes Decision Snapshot (§4)
            |
            | Execution Commit     (Approved → Create Shipment Draft; §3A)
            v
        Execution Truth
         (Shipment)                ── copies Execution Snapshot (§4A)
            |
            v
       Shipment Events
            |
            v
         History
            |
            v
        Documents
```

- **Working Draft / Recommendation Workspace** (§8A) sits before Decision Commit — editable; **may persist to a non-commit DB Draft** (Recommendation Snapshot); `sessionStorage` is UI recovery only. Persisting it is never a commit.
- **Decision Commit** = Submit Plan (Analysis → Decision; §3); freezes the **Decision Snapshot** (§4).
- **Execution Commit** = converting an Approved Weekly Shipping Plan into a Shipment Draft (Decision → Execution; §3A); copies the **Execution Snapshot** (§4A) and **never recalculates** — see `SHIPMENT_CENTER_SPEC.md`.
- **Shipment Events → History → Documents** are derived downstream (e.g. `generated_documents`); produced from execution records and never feeding back upstream.

---

## 7. Single Source of Truth (by layer)

Each layer has an **Owner**, a **Truth** (its source of truth), and a **Snapshot** (the frozen copy it owns).

| Layer | Owner | Truth (Source of Truth) | Snapshot |
|-------|-------|-------------------------|----------|
| **Analysis** | Inventory Replenishment | Live inventory + forecast + sales source data | — (recomputed at Runtime) |
| **Persisted Recommendation Workspace** | Inventory Replenishment / 下單系統 (Draft) | `shipping_allocation_drafts` / `request_order_allocation_drafts` (+ `_lines`) | **Recommendation Snapshot** — non-commit; not Decision Truth, not Qualified Incoming, no reserve/deduct/movement |
| **Decision** | Weekly Shipping Plan | `shipping_plans` + `shipping_plan_lines` | **Decision Snapshot** (§4) |
| **Execution** | Shipment (Draft / Overview) | `shipments` + `shipment_lines` | **Execution Snapshot** (§4A) |
| **Procurement (Planning)** | Request Order Draft | `request_orders` + `request_order_lines` | Procurement Planning Draft (copies upstream demand; never writes back) |
| **Procurement (Commitment)** | Purchase Order | `purchase_orders` + `purchase_order_lines` | Procurement Commitment (copies from the approved Request Order; never writes back) |
| **Documents** | Export / Document Center | `generated_documents` | (derived output) |

> **Procurement Layer Phase 1 (Immutable Flow):** `Shipment / Inventory / Factory Stock` → **Request Order Draft** (Procurement Planning Draft) → **Purchase Order** (Procurement Commitment). Downstream copies upstream but never writes back: **PO does not write Request Order; Request Order does not write Shipment / Inventory / Factory Stock.** Request Order / PO are **API-ready** modules (see [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md)). Future links to Shipment / Factory Stock / Supplier Price List are copy-only references.

> **Overseas Inbound (planning input, Immutable Flow):** an Overseas Inbound Draft is a **planning input** that feeds the **Decision Layer** — **Submit creates a Weekly Shipping Plan** (never a Shipment Draft directly, never a direct overseas-stock or factory-stock write). Only an approved plan reaches the Execution Layer; Overseas Stock updates only on shipment **receipt**. See [`OVERSEAS_INBOUND_SPEC.md`](./OVERSEAS_INBOUND_SPEC.md).

> **Master edits never rewrite snapshots (Immutable Flow):** editing a master record — e.g. **SKU Details Add/Edit** ([`SKU_DETAILS_ADD_EDIT_SPEC.md`](./SKU_DETAILS_ADD_EDIT_SPEC.md)) — updates `sku_details` only. Historical **Decision / Execution / PO snapshots** (`shipping_plan_lines` / `shipment_lines` / `purchase_order_lines`) captured product name, dims, weights, and prices at commit time and are **frozen**; the master is a live reference only for **new** records.

> **No new DB is required for this principle.** It is a discipline over existing tables: read upstream, freeze a snapshot, own only your layer's records. **Analysis Truth** has no persisted snapshot (it is recomputed at runtime); **Decision Truth** owns the **Decision Snapshot**; **Execution Truth** owns the **Execution Snapshot**.

---

## 8. Business Object Identity (future-oriented principle)

**Business Object Identity** is the **stable business-level identity of one logical object**, independent of how it is physically stored.

- **Example:** one logical Weekly Shipping Plan may later have multiple historical versions. Its **Business Identity never changes**, even though its **physical DB identity may change** if future versioning uses a one-row-per-version model.

**Current MVP (Weekly Shipping Plan):**
- `shipping_plan_id` = physical DB identity.
- `parent_shipping_plan_id = shipping_plan_id` (the business-identity anchor; equals self in MVP).
- `plan_version` tracks decision revisions **on the same row** (reject → resubmit increments the version without creating a new row).

**Future model (reference only):**
- The **business identity / parent id** can group **multiple physical version rows** (each version is its own row pointing back to the original via `parent_shipping_plan_id`).

> **Do NOT add any new DB field now.** This is documented as a **future architecture principle** so later versioning upgrades do not require changing the conceptual model. The `parent_shipping_plan_id` field already reserved in `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` is the upgrade hook.

---

## 8A. Execution Plan Working Draft Principle *(formerly "Shipping Allocation Working Draft")*

**Definition:** the **Execution Plan Working Draft** is a **non-commit planning artifact (Recommendation Workspace)** inside Inventory Replenishment. It backs the **Execution Plan** block (Inventory Replenishment second-layer right panel; `INVENTORY_TABLE_MAPPING_SPEC.md` §11). It is **NOT** a Decision Snapshot and **NOT** Decision Truth.

> **Recommendation Summary vs Execution Plan.** The **Recommendation Summary** is the read-only **system suggestion** (per-window need + suggested route + reason) and is **never committed**. The **Execution Plan** is the PM's actual plan and is the **only** thing **Submit Plan** commits. "Shipping Allocation" is the legacy name for the Execution Plan.

**Rules:**
- Working Draft may be edited **many times** before Submit Plan.
- Working Draft **does not create `shipping_plans`**.
- Working Draft **does not create `shipping_plan_lines`**.
- Working Draft **does not update** existing Weekly Shipping Plans.
- **Submit Plan is the only Decision Commit.**
- A **Decision Snapshot can only be created from the Working Draft at Submit Plan.**
- **No other UI action may create a Decision Snapshot** (collapse/expand, edit method/ship-from/destination/qty, re-render — none of these commit).

**Storage rule:**
- **JS State** is the live editing state.
- The **Recommendation Draft (Recommendation Workspace) MAY be persisted to a DB Draft table** — a **non-commit snapshot** used for versioning, multi-user collaboration, pre-approval editing, and traceability. (Shipping = `shipping_allocation_drafts` / `_lines`; Order = `request_order_allocation_drafts` / `_lines` — schema owner `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6/§3.7.) When a persisted Draft exists it is the **SSOT for the active cycle's working state**.
- **`sessionStorage` is UI recovery ONLY** — never the sole Draft owner and never a decision record.
- **Persisting a Draft never makes it a commitment.** A persisted Recommendation Draft is **NOT** Qualified Incoming, does **NOT** reserve or deduct factory / overseas stock, creates **NO** inventory movement, and is **NOT** Decision Truth. Only a formal user action creates committed truth: **Submit Plan** creates Shipping Decision Truth (Weekly Shipping Plan); **Send Request** creates the Procurement Request Order execution record (**not** Shipping Decision Truth).

> Layer placement: the Working Draft / Recommendation Workspace belongs to the **Analysis Layer + Persisted Recommendation Workspace** state (it lives inside Inventory Replenishment / 下單系統). Commitment then happens on **two parallel branches**: **Submit Plan** freezes the **Shipping Decision Truth** (`shipping_plans` / `shipping_plan_lines`, owned by Weekly Shipping Plan) with its per-SKU **Decision Snapshot** (§4); **Send Request** creates the **Procurement branch's Request Order execution record** (`request_orders` / `request_order_lines`, owned by `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`) — a parallel committed record, **not** the Weekly-Shipping-Plan-owned Shipping Decision Truth. A Draft is neither until one of those actions occurs.

> **BLOCKED — Requires Batch B Canonical Decision (Factory Stock Reserve Trigger).** The single event that first **reserves** factory stock (Plan Lock / Approval / Create Shipment Draft / Execution Commit / other) is **not decided**. **Verified current code (2026-07-28):** there is **no reserve logic in code at all** — the only factory-stock mutation is a hard **deduction of `fac_current_stock` at Confirm Shipment & Dispatch** (`22_shipment_dispatch_handlers.gs`); `fac_reserved_stock` is never written. The reserve-on-approval / reserve-on-draft lifecycles described across the specs are **spec-only / not implemented** and currently disagree — they must NOT be treated as decided. See the consolidated Batch B Handoff.

---

## 9. How specs should use this document

- Spec authors **reference** these terms (Analysis/Decision/Execution Layer, Decision Commit, Decision Snapshot, Snapshot Provenance, Immutable Flow, Truth Flow Principle, Single Source of Truth, Business Object Identity) instead of re-defining them.
- If a spec needs a layer-specific nuance, it **extends** (not contradicts) these principles and links back here.
- On any conflict between a feature spec and this document about layer semantics, **this document governs** the architecture language; the feature spec governs its own field-level mapping.

---

## 10. Supply Chain Layer Lifecycle (v1.2 — four layers)

Kitchen Mama Supply Chain is a **four-layer** architecture. Each layer owns its Truth and a lifecycle; **no layer may modify another layer's Truth** (§12).

```
Analysis Layer → Decision Layer → Execution Layer → Settlement Layer
```

### Layer 1 — Analysis Layer
- **Owner:** Inventory Replenishment.
- **Truth:** Analysis Truth.
- **Purpose:** live calculation / live analysis / Planning Runtime. **Persists no Decision.**

### Layer 2 — Decision Layer
- **Owner:** Weekly Shipping Plan.
- **Truth:** Decision Truth.
- **Purpose:** Decision Commit, Decision Snapshot, Approval, Planning Version.
- **Decision Layer Lifecycle:**
  ```
  Draft → Pending Approval → Approved → Execution Commit (Create Shipment Draft) → Completed
  ```
- **Completed** means: the Decision Layer has finished its job and the Execution Layer has taken over; the **Decision Snapshot is preserved permanently**. Completed does **NOT** mean the shipment is done / shipped / arrived — only that the **decision** is complete. (Implementation: `shipping_plans.completed_at` / `completed_by`; the plan leaves the Active view but the row is never deleted — `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`.)

### Layer 3 — Execution Layer
- **Owner:** Shipment.
- **Truth:** Execution Truth.
- **Purpose:** execution — Booking, Carrier, Shipment, Container, Tracking, Execution Snapshot.
- **Execution Layer Lifecycle:**
  ```
  Draft → Booked → Ready to Ship → Shipped → In Transit → Arrived → Received → Closed
  ```
- The Execution Layer is **fully independent** and **must NOT modify the Decision Layer**.
- **UI split:** **Shipment Draft = the execution working area** (`draft → ready_to_ship → shipped`, hidden after Done); **Shipment Overview = the official shipped/history view** (`shipped` onward). **Save** only edits execution fields (not official, not in Overview); **Ship** makes the shipment official (`shipped_at`) and puts it in Overview; **Done** only hides the card from the Draft workspace (row preserved). The UI groups the Decision-Layer **Weekly Shipping Plan** together with the Execution-Layer **Shipment Draft / Shipment Overview** under one **Shipment Center** menu — a grouping convenience, **not** a layer merge (`SHIPMENT_CENTER_SPEC.md` §3–§5).

### Layer 4 — Settlement Layer
- **Owner:** Export Center / Documents / History / Reports / Audit.
- **Truth:** Settlement Truth.
- **Purpose:** all **final, immutable records** — Shipment History, Export Documents (Invoice / Packing List / Commercial Invoice / POD), Generated Documents, Audit Trail, KPI.
- The Settlement Layer **only stores final results**; it never feeds back upstream.

---

## 11. Truth Flow (v1.2 — extended to Settlement)

```
Analysis Truth
   ↓ Decision Commit
Decision Truth
   ↓ Execution Commit
Execution Truth
   ↓ Decision Layer Completed   (Decision Layer hands off; snapshot preserved)
Shipment Lifecycle
   ↓
Settlement
   ↓
History
   ↓
Documents
```

This extends §5A (Truth Flow Principle): **truth flows downstream, context flows with it, authority never flows back** — now through all four layers and into Settlement.

---

## 12. Layer Responsibility

- **Analysis Layer** — only analyzes.
- **Decision Layer** — only decides.
- **Execution Layer** — only executes.
- **Settlement Layer** — only stores final results.

**No layer may modify another layer's Truth.** Each reads/copies upstream into its own snapshot and owns only its own records (§5 Immutable Flow, §5A Truth Flow).

---

**v1.2 — Supply Chain Architecture Principles. Four-layer lifecycle (Analysis → Decision → Execution → Settlement) + Decision Layer Completion. Stable, reusable architecture language. Spec only; no runtime change is implied beyond the documented `shipping_plans.completed_at` / `completed_by` Decision-Layer-completion fields.**

**End of Document**
