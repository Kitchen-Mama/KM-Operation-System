# Supply Chain Architecture Principles

**Status:** 🟢 v1.2 — Stable architecture principles (four-layer lifecycle; one small DB addition: `shipping_plans.completed_at` / `completed_by`)
**Last Updated:** 2026-06-30
**Changelog:**
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
| **Decision Truth** | The committed planning decision owned by Weekly Shipping Plan (`shipping_plans` / `shipping_plan_lines`). | §2.2 |
| **Execution Truth** | The physical execution record owned by Shipment (`shipments` / `shipment_lines`). | §2.3 |
| **Settlement Truth** | The final, immutable records owned by the Settlement Layer (history / documents / audit / KPI). | §10 |
| **Decision Layer Completion** | The Decision Layer's terminal state (Done): decision finished, Execution Layer has taken over, snapshot preserved (`completed_at`). | §10 |
| **Working Draft** | Temporary Decision inside Inventory Replenishment before Submit Plan; persists nothing (JS State + sessionStorage recovery). | §8A |
| **Decision Commit** | The moment Analysis output becomes a persisted decision = **Submit Plan**. | §3 |
| **Execution Commit** | Approved Weekly Shipping Plan → Create Shipment Draft. | §3A |
| **Decision Snapshot** | Immutable per-SKU planning context frozen on `shipping_plan_lines` at Decision Commit. | §4 |
| **Execution Snapshot** | Full copy of the Decision Snapshot taken when the Shipment Draft is created; owned by the Shipment Layer. | §4A |
| **Snapshot Provenance** | The conceptual model of a snapshot as Value + Source + Provenance; Provenance (why / which engine) is architecture-reserved, not persisted. | §4B |
| **Immutable Flow** | Every downstream layer copies upstream truth into its own snapshot, but never mutates upstream. | §5 |
| **Truth Flow Principle** | Truth flows downstream, context flows with it, authority never flows back. | §5A |
| **Single Source of Truth** | Each layer has one Owner / Truth / Snapshot; no duplicate authority. | §7 |
| **Business Object Identity** | Stable business-level identity of a logical object, independent of physical DB identity. | §8 |

> Canonical chain: **Analysis → Working Draft → Decision Commit → Decision Snapshot → Execution Commit → Execution Snapshot → Shipment Events → History → Documents.**

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
  - **No planning record is persisted.**
- **After Decision Commit:**
  - `shipping_plans` and `shipping_plan_lines` are created.
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
            | Working Draft        (Shipping Allocation — temporary, persists nothing; §8A)
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

- **Working Draft** (§8A) sits in the Analysis Layer before commit — editable, persists nothing.
- **Decision Commit** = Submit Plan (Analysis → Decision; §3); freezes the **Decision Snapshot** (§4).
- **Execution Commit** = converting an Approved Weekly Shipping Plan into a Shipment Draft (Decision → Execution; §3A); copies the **Execution Snapshot** (§4A) and **never recalculates** — see `SHIPMENT_CENTER_SPEC.md`.
- **Shipment Events → History → Documents** are derived downstream (e.g. `generated_documents`); produced from execution records and never feeding back upstream.

---

## 7. Single Source of Truth (by layer)

Each layer has an **Owner**, a **Truth** (its source of truth), and a **Snapshot** (the frozen copy it owns).

| Layer | Owner | Truth (Source of Truth) | Snapshot |
|-------|-------|-------------------------|----------|
| **Analysis** | Inventory Replenishment | Live inventory + forecast + sales source data | — (Runtime only; Working Draft is temporary, persists nothing) |
| **Decision** | Weekly Shipping Plan | `shipping_plans` + `shipping_plan_lines` | **Decision Snapshot** (§4) |
| **Execution** | Shipment (Draft / Overview) | `shipments` + `shipment_lines` | **Execution Snapshot** (§4A) |
| **Procurement** | Purchase Order | `purchase_orders` + `purchase_order_lines` | (procurement snapshot — future) |
| **Documents** | Export / Document Center | `generated_documents` | (derived output) |

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

## 8A. Shipping Allocation Working Draft Principle

**Definition:** the **Shipping Allocation Working Draft** is a **Temporary Decision** inside Inventory Replenishment. It is **NOT** a Decision Snapshot.

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
- **sessionStorage** is the **temporary recovery storage**.
- sessionStorage exists **only to recover the Working Draft before commit**.
- sessionStorage **must not be treated as a persisted decision record** (the committed record is `shipping_plans` / `shipping_plan_lines` after Submit Plan).

> Layer placement: the Working Draft belongs to the **Analysis Layer / Temporary Decision** state (it lives inside Inventory Replenishment). **Decision Truth** (§2.2) begins only **after** Submit Plan, when the Working Draft is committed into `shipping_plans` / `shipping_plan_lines` and the per-SKU **Decision Snapshot** (§4) is frozen.

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
