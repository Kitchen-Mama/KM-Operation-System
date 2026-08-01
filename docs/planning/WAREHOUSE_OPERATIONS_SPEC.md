# Warehouse Operations — Navigation & Workflow Spec

**Status:** 🟡 Draft v2.2 — **Spec only.** NO Runtime, HTML, CSS, JS, Apps Script, API, DB migration, or navigation code change. Nothing here is implemented. This document is authoritative **only for Warehouse Operations navigation / page layout / shared UI conventions**. It **defers** inventory schemas to `DATABASE_RELATIONSHIP_MAP.md`, the Overseas Inbound receiving contract to `OVERSEAS_INBOUND_SPEC.md`, the Overseas Outbound fulfillment contract to `OVERSEAS_OUTBOUND_SPEC.md`, and Shipment execution / endpoint linkage to `SHIPMENT_CENTER_SPEC.md`.
**Last Updated:** 2026-07-22
**Maintained By:** Development Team
**Related / Authority chain:**
- [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) — **authority for canonical schemas and relationships** (`factory_stock`, `factory_stock_movements`, `overseas_inventory_snapshot`, `overseas_inventory_movements`, `warehouses`, and the planned Overseas Inbound/Outbound operation tables).
- [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) §23 — **authority for Formal Shipment, endpoint semantics, transfer mapping, managed-overseas detection, auto-create/link, shipout push direction, and gates**; and for Shipment execution / consolidation / `shipment_id`.
- [`OVERSEAS_INBOUND_SPEC.md`](./OVERSEAS_INBOUND_SPEC.md) — **authority for the destination receiving operation + receipt lifecycle.**
- [`OVERSEAS_OUTBOUND_SPEC.md`](./OVERSEAS_OUTBOUND_SPEC.md) — **authority for the origin fulfillment operation + shipout lifecycle.**
- [`OVERSEAS_STOCK_SPEC.md`](../../assets/specs/active/pages/OVERSEAS_STOCK_SPEC.md), [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md) — **authority for inventory balance + movement posting rules.**
- [`SYSTEM_RUNTIME_ARCHITECTURE.md`](./SYSTEM_RUNTIME_ARCHITECTURE.md) — **authority for module boundaries and runtime event flow.**

> **Scope boundary.** This spec decides **navigation, page layout, and shared UI conventions** — and which existing tables each view reads. It does **not** define inventory columns (owned by `DATABASE_RELATIONSHIP_MAP.md`), does **not** own the receiving operation (owned by `OVERSEAS_INBOUND_SPEC.md`) or the outbound operation (owned by `OVERSEAS_OUTBOUND_SPEC.md`), does **not** redefine Shipment truth (owned by `SHIPMENT_CENTER_SPEC.md`), and creates **no** new tables. Warehouse **Master administration** (managing the `warehouses` table) is **out of scope of this navigation group** — it lives under **Admin → Master Data → Warehouses**.

---

## 1. Purpose

Establish the **Warehouse** navigation group as **four separate pages** — **Factory Inventory**, **Overseas Inventory**, **Overseas Inbound**, **Overseas Outbound** — with explicit user-facing names. Factory Inventory and Overseas Inventory may **share the Warehouse navigation group** but remain **separate inventory domains, separate pages, separate queries, separate balances, and separate movement ledgers** (`DATABASE_RELATIONSHIP_MAP.md` §6.0). This spec defines the target information architecture without changing any runtime.

> **Phase-1 anchor (P1-C, 2026-07-22):** this is the Phase-1 **P1-C** scope (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §1A) — Warehouse Master + the four separate pages **Factory Inventory / Overseas Inventory / Overseas Inbound / Overseas Outbound**. Canonical: **Inbound Planning Request ≠ Warehouse Receiving Operation** (separate names, records, and lifecycles — `OVERSEAS_INBOUND_SPEC.md`), and **Delivered ≠ Received** (a carrier delivery never increases inventory; the Warehouse Receipt is the inventory-increase authority — `DATABASE_RELATIONSHIP_MAP.md` §6.0, `SHIPMENT_ROUTE_AND_EVENT_SPEC.md` §5.4).

---

## 2. Final Navigation (canonical, 2026-07-22)

```
Warehouse
├─ Factory Inventory       [page]   (factory_stock / factory_stock_movements)
├─ Overseas Inventory      [page]   (overseas_inventory_snapshot / overseas_inventory_movements)
├─ Overseas Inbound        [page]   (destination receiving operation)
└─ Overseas Outbound       [page]   (origin fulfillment operation)

Admin
└─ Master Data
   └─ Warehouses           [page]   (warehouses master — OUTSIDE this navigation)
```

- **Explicit labels are mandatory:** "Factory Inventory", "Overseas Inventory", "Overseas Inbound", "Overseas Outbound" — **NOT** the bare "Inventory" / "Inbound" / "Outbound". Reason: Factory and Overseas inventory are separate domains; the navigation must make clear which domain / operation each page concerns.
- **Factory Inventory and Overseas Inventory are SEPARATE inventory domains** — separate pages, separate queries, separate balances, separate movement ledgers. **Never merge Factory and Overseas inventory balances** (§6, §6A, `DATABASE_RELATIONSHIP_MAP.md` §6.0). Sharing the Warehouse navigation group is a grouping convenience only.
  - **Factory Inventory** reads `factory_stock` + `factory_stock_movements`; **`available_factory_stock = MAX(fac_current_stock − fac_reserved_stock, 0)`**.
  - **Overseas Inventory** reads `overseas_inventory_snapshot` + `overseas_inventory_movements`.
- **Inbound and Outbound are SEPARATE pages** — do **NOT** combine them into one operational page, and do **NOT** present Warehouse Operations as a single mandatory combined UI.
- **Factory Stock / Factory Inventory must not appear inside Overseas Inventory**, and Overseas Inventory must not appear inside Factory Inventory (see §6/§6A).
- **Warehouse Master administration** (Add/Edit Warehouse, `warehouses` maintenance) is **NOT** under this group — it lives under **Admin → Master Data → Warehouses**. Adding a warehouse master record **never creates or moves inventory** (`DATABASE_RELATIONSHIP_MAP.md` §8A: `warehouses` is a passive Reference Master).
- **Current live nav** is still "Warehouse Stock" → Factory Stock + Overseas Stock (`index.html`); the migration to the four explicit pages above is **documentation-only** here (no nav code changed).

---

## 3. Shared Components vs Separate Concerns

The four pages **may share reusable UI components**: KPI card components, filter components, operation status badges, API status badges, table utilities, detail-drawer layout, timeline components, missing-field checklist, retry/error components.

However, their **routes, page state, primary actions, data queries, validation rules, and operation lifecycle remain SEPARATE.** Sharing components is a UI convenience only — it must never merge the pages' state, balances, or data flows (and never merges Factory and Overseas inventory).

**Operation status vs API status are two distinct dimensions** (both pages): *Operation status* = the warehouse operation lifecycle (e.g. Draft → Submitted → Receiving/Processing → Completed / Exception). *API status* = the WMS/integration submission state (e.g. Not Submitted → Submitted → Acknowledged → Error/Retry). They are displayed as separate badges and never collapsed into one field.

---

## 4. Overseas Inbound page

Represents the **destination** overseas warehouse receiving / pre-advice operation and its WMS/API details. **Do NOT show Outbound operations on this page.** Full spec: `OVERSEAS_INBOUND_SPEC.md`.

- **Header:** Title "Overseas Inbound"; subtitle "Shipments and goods expected to arrive at managed overseas warehouses."
- **KPI cards:** In Transit Units · Expected This Week · Awaiting Warehouse Submission · Receiving in Progress · Needs Action · Delayed.
- **Filters:** Company · Destination Warehouse · Inbound Status · Shipment Status · API Status · ETA range · Needs Action · Search (inbound no. / shipment no. / tracking no. / SKU).
- **Main table:** Inbound No. · Shipment No. · Company · Destination Warehouse · Origin · Units · Cartons · ETD · ETA · Shipment Status · Inbound Status · API Status · Missing Fields / Needs Action · Action.
- **Detail drawer / page:** Shipment summary · warehouse destination · SKU + quantity lines · transportation timeline · inbound/WMS-required fields · missing-field checklist · API submission history · API errors · retry action · receipt summary · overage/shortage/damage where applicable.

---

## 5. Overseas Outbound page

Represents the **origin** overseas warehouse picking / shipping operation and its WMS/API details. **Do NOT show Inbound operations on this page.**

- **Header:** Title "Overseas Outbound"; subtitle "Orders and shipments being fulfilled from managed overseas warehouses."
- **KPI cards:** Awaiting Submission · Processing Units · Ready to Ship · Shipped This Week · Needs Action · Delayed.
- **Filters:** Company · Origin Warehouse · Outbound Status · Shipment Status · API Status · Requested/expected ship date · Needs Action · Search (outbound no. / shipment no. / order reference / tracking no. / SKU).
- **Main table:** Outbound No. · Shipment No. / Order Reference · Company · Origin Warehouse · Destination · Units · Cartons · Requested Ship Date · Shipment Status · Outbound Status · API Status · Missing Fields / Needs Action · Action.
- **Detail drawer / page:** Shipment/order summary · warehouse origin · destination summary · SKU + requested quantities · allocation/pick/pack/ship timeline · outbound/WMS-required fields · missing-field checklist · API submission history · tracking + ship confirmation · API errors + retry action.

> The "Requested Ship Date" shown here is a display/operational concept sourced from the shipment context (`shipments.etd` and related), **not** a new `expected_ship_date` column on `shipments` / `shipping_plans`.

---

## 6. Overseas Inventory page

User-facing title **"Overseas Inventory"**. Represents current overseas warehouse inventory + warehouse inventory movements. Full spec: `OVERSEAS_STOCK_SPEC.md`.

- **Includes:** `overseas_inventory_snapshot`, `overseas_inventory_movements`, overseas warehouse-level balances, company/warehouse/SKU filters, warehouse inventory history + adjustments.
- **Excludes:** `factory_stock`, `factory_stock_movements`, factory inventory balances. **Do NOT mix Factory Inventory and Overseas Inventory in one default dataset.**
- **Relationship:** overseas balances change from **confirmed Inbound receipts** and **confirmed Outbound ship confirmations** (movement posting rules owned by the inventory / inbound / outbound specs; this page displays balances + movements).

---

## 6A. Factory Inventory page (canonical — runtime NOT implemented)

User-facing title **"Factory Inventory"**. Represents current factory-held inventory + factory movement ledger. A **separate page and separate domain** from Overseas Inventory — it reads **only** the factory tables and must never query/aggregate the overseas tables. Inventory schema authority: `DATABASE_RELATIONSHIP_MAP.md` §6/§6.0 (`factory_stock`, `factory_stock_movements`); factory reserved-stock lifecycle authority: `DATABASE_RELATIONSHIP_MAP.md` §6 + `SHIPMENT_CENTER_SPEC.md` §15.1.

- **Data sources:** `factory_stock` (balance), `factory_stock_movements` (ledger), joined to `warehouses` (factory warehouse identity, `is_factory_warehouse = TRUE`) and `sku_details` (category/series/UPC). **Excludes** `overseas_inventory_snapshot` / `overseas_inventory_movements`.
- **Balance rule (canonical):** **`available_factory_stock = MAX(fac_current_stock − fac_reserved_stock, 0)`**. Reserved is created at **Shipment Draft** (`fac_reserved_stock += qty`, `fac_current_stock` unchanged); deducted at **Shipment shipped** (`fac_current_stock −= qty`, `fac_reserved_stock −= qty`). Planning steps move nothing (`DATABASE_RELATIONSHIP_MAP.md` §6, Factory Reserved Stock lifecycle).

**KPI cards:**
- **Total Factory Stock** (Σ `fac_current_stock`)
- **Available Stock** (Σ `available_factory_stock`)
- **Reserved Stock** (Σ `fac_reserved_stock`)
- **Low Stock SKU** (count of SKUs at/under reorder threshold — display-only where a threshold column exists; no projection engine)
- **In Production** (open PO ordered-but-not-yet-completed qty, from the Procurement layer — display join, read-only)
- **Pending Shipout** (reserved-for-shipment qty awaiting dispatch — from `fac_reserved_stock` / linked Shipment Drafts, read-only)

**Filters:** Factory Warehouse · Company Context · Country · Category · Series · Stock Status (e.g. Low / Normal / Over / Damaged where available) · SKU Search.

**Main table:** Warehouse · SKU · Category-Series · Current · Reserved · Available · In Production · Pending Shipout · Last Movement · Action.

**Detail drawer / page:** warehouse identity · SKU summary (name/category/series/UPC) · current / reserved / available balances · **PO production** context (linked `purchase_orders` / `purchase_order_lines` in production) · **Shipment reservations** (linked Shipment Drafts holding reserved stock) · movement history (`factory_stock_movements`) · **permission-controlled adjustment** (future Role & Permission; not implemented) · related **Shipment** and **PO** links.

> **In Production / Pending Shipout / PO / Shipment joins are display/read-only** — the Factory Inventory page never writes to the Procurement or Shipment layers and never posts inventory itself. Factory stock movements are posted by the factory-dispatch / receiving paths owned by the inventory + shipment specs, not by this page.

---

## 7. Operation Creation, Company Routing & Idempotency (canonical — runtime NOT implemented)

Authority: `SHIPMENT_CENTER_SPEC.md` §23.5–§23.7, `SYSTEM_RUNTIME_ARCHITECTURE.md`.

- **Managed-overseas detection:** an endpoint qualifies only when its `warehouse_id` resolves to an **active** `warehouses` record, `is_factory_warehouse` is **not TRUE**, the relevant receiving/shipping capability is enabled (`is_receiving_enabled` / `is_shipping_enabled`), and the warehouse is supported by the applicable integration config. **Do not rely solely on `warehouse_type = 3PL`.**
- **Direction is runtime-derived, never user-selected:** destination qualifies (+ receiving enabled) → **Inbound**; origin qualifies (+ shipping enabled) → **Outbound**; both → one Inbound + one Outbound (**Transfer**); neither → none.
- **Idempotent auto-create/link** on the canonical trigger (Shipment becomes formal): create-or-link the required Inbound/Outbound Draft, copy common Shipment data, preserve `shipment_id` as authoritative linkage. **Operation uniqueness = `shipment_id + warehouse_id + operation_type`** (repeat runs never duplicate). **Auto-create does NOT auto-submit** — creating/linking the Draft never pushes to WMS and never reserves or deducts stock.
- **Separate idempotency keys are required** for each externally-visible action (never one shared key) — **8 scopes** (`SHIPMENT_CENTER_SPEC.md` §23.11): (1) **destination inbound operation create/link**, (2) **destination inbound external submission**, (3) **label/document retrieval**, (4) **origin shipout operation create/link**, (5) **origin shipout instruction submission** (outbound instruction push / inbound pre-advice push), (6) **receipt confirmation** (inbound), (7) **shipout confirmation** (outbound), (8) **reversal/correction**. Each key guarantees a repeated call is a no-op on the already-applied effect.
- **Dual-direction orchestration (future; Phase-1 manual — `SHIPMENT_CENTER_SPEC.md` §23.11):** the **Formal Shipment orchestrator** idempotently creates/links **both** the destination Inbound and the origin Shipout Instruction. The **Overseas Inbound Receiving Operation never creates the origin Shipout** and is not the planning SSOT. Destination inbound may be submitted externally to retrieve inbound references/labels; those + the shipout instruction form the **Factory Shipping Package** delivered to the factory. Labels/documents reference the **Document Engine** (`generated_documents`), never binary in the operation header.
- **Shipout push direction (canonical — `SHIPMENT_CENTER_SPEC.md` §23.10):** the **Outbound Instruction Push** is **KM System → Warehouse/WMS** (submit at Lock/Submit); the **Shipout Confirmation Push** is **Warehouse/WMS → KM System** (actual shipped result returned). **Never define "Shipout first, then push the outbound instruction."** Full lifecycle owned by `OVERSEAS_OUTBOUND_SPEC.md`.
- **Company routing:** `company + warehouse_id + operation_type → correct external account`. `WH-KM-US-3PL-AMZLGS` and `WH-RESUS-US-3PL-AMZLGS` are **distinct** identities — KM and ResUS never cross-route; match by `warehouse_id` + validated company, never by provider name / code / address.

**Conceptual future integration-mapping attributes** (NOT a table in this task; do **not** create it): `warehouse_id`, `company`, `provider`, `external_account_id`, `external_warehouse_code`, `inbound_enabled`, `outbound_enabled`, `credential_reference`, `is_active`.

> **Security:** secrets/credentials **MUST NOT** be stored as plain text in Google Sheets — the mapping may hold only a `credential_reference` (pointer), never the secret. No credentials, table, or API are created here.

---

## 8. Validation Gates (canonical — runtime NOT implemented)

- **Saving Shipment Draft:** allowed even when overseas warehouse API details are incomplete.
- **Selecting a managed overseas warehouse:** show a **non-blocking** notice that an Overseas Inbound/Outbound operation will be required.
- **Submitting the warehouse operation to WMS/API:** block if provider-required fields are incomplete; show the exact missing-field checklist; provide a direct action to open the correct operation record.
- **Marking the Shipment shipped/dispatched:** apply the finalized business gate; if successful warehouse submission is required before dispatch, block and link directly to the relevant Inbound/Outbound record; **do not block unrelated normal shipments.**

---

## 8A. Phase-1 Inbound / Outbound Readiness Audit (2026-07-22 — NOT a claim of implementation)

This audit records which contracts are **specified** vs **missing** for P1-C / P1-D. Nothing here is implemented in code (verified: no receiving/outbound posting in any `.gs`). Each missing contract is classified **Blocking** (must exist before the P1-D inventory loop can run correctly) or **Non-blocking**, with the authoritative MD that must own it. **Implementation status is not fabricated.**

**Boundary invariants (already canonical — reaffirmed):** Inbound **Planning ≠** Warehouse **Receiving**; Outbound **Planning ≠** inventory **deduction**; **Shipment Draft does not deduct stock**; **Lock reserves** stock; **Ship Confirm deducts** stock; **Receive Confirm increases** overseas stock; **Delivered ≠ Received** (`SUPPLY_PLANNING_CALCULATION_RULES.md` §2E, `SHIPMENT_ROUTE_AND_EVENT_SPEC.md` §5.4).

### Overseas Inbound (Warehouse Receiving) — contract readiness
| Contract | Status | Class | Owner MD |
|---|---|---|---|
| Source Shipment / PO / transfer relationship | specified (`shipment_id` linkage) | — | OVERSEAS_INBOUND_SPEC §9 |
| Expected SKU + qty vs **actual received qty** | **MISSING** (lines carry planned qty only; no `received_qty`) | **Blocking** | OVERSEAS_INBOUND_SPEC (new Receiving section) |
| Partial receipt / over-receipt / shortage / damage | display-mention only; no rule | **Blocking** | OVERSEAS_INBOUND_SPEC |
| Destination warehouse | specified | — | OVERSEAS_INBOUND_SPEC §4 |
| Received date / receiving user | **MISSING** (no `received_at`/`received_by`) | **Blocking** | OVERSEAS_INBOUND_SPEC |
| Inventory movement creation (on receipt) | deferred to inventory spec (posting rule not written) | **Blocking** | INVENTORY_TABLE_MAPPING_SPEC / DATABASE_RELATIONSHIP_MAP §6.0 |
| Idempotency (receipt-level) | operation-create idempotency only; receipt-level **MISSING** | **Blocking** | OVERSEAS_INBOUND_SPEC |
| Rollback / correction / reversal movement | **MISSING** | Non-blocking (needed before GA, not for first happy-path) | OVERSEAS_INBOUND_SPEC |
| Delivered ≠ Received | specified (cross-doc) | — | SHIPMENT_ROUTE_AND_EVENT_SPEC §5.4 |
| Close conditions | **MISSING** (status flow lacks received/closed) | Non-blocking | OVERSEAS_INBOUND_SPEC §6 |
| Audit trail | partial (actors/timestamps) | Non-blocking | OVERSEAS_INBOUND_SPEC |

### Overseas Outbound — contract readiness
> **RESOLVED (2026-07-22):** [`OVERSEAS_OUTBOUND_SPEC.md`](./OVERSEAS_OUTBOUND_SPEC.md) now exists as the canonical Overseas Outbound authority (operation header/lines, ship confirmations, draft→lock→submit→acknowledge→pick→pack→ship-confirm lifecycle, partial shipment, cancellation/reserved-stock release, idempotent WMS submission + idempotent ship confirmation, reversal/correction, movement posting, operation-status vs API-status). The contracts below are now **specified** there (the movement-posting rule remains deferred to the inventory specs). Runtime still **NOT implemented**.

| Contract | Status | Class | Owner MD |
|---|---|---|---|
| Source Execution Plan / Shipment relationship | partial (direction derived from origin) | **Blocking** | new OVERSEAS_OUTBOUND_SPEC |
| Warehouse + company ownership | specified (page-level, company-scoped) | — | WAREHOUSE_OPERATIONS_SPEC §5/§7 |
| requested / approved / **reserved** / **shipped** qty | **MISSING** | **Blocking** | new OVERSEAS_OUTBOUND_SPEC |
| Cancellation / release (of reserve) | **MISSING** | **Blocking** | new OVERSEAS_OUTBOUND_SPEC |
| Partial shipment | **MISSING** | **Blocking** | new OVERSEAS_OUTBOUND_SPEC |
| Pick / pack / ship-confirm lifecycle | display-mention only | **Blocking** | new OVERSEAS_OUTBOUND_SPEC |
| Reserve @ lock / Deduct @ Ship Confirm | specified elsewhere, not in outbound doc | **Blocking** (must be bound to outbound) | new OVERSEAS_OUTBOUND_SPEC (ref REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC P1-B / SHIPMENT_CENTER §15.1) |
| Shipment line allocation link | planned table only (`shipment_line_allocations`) | **Blocking** | DATABASE_RELATIONSHIP_MAP §8B |
| Idempotency | operation-create only | Non-blocking | new OVERSEAS_OUTBOUND_SPEC |
| Inventory movement (deduct on ship) | deferred to inventory spec | **Blocking** | INVENTORY_TABLE_MAPPING_SPEC / §6.0 |
| Audit trail | partial | Non-blocking | new OVERSEAS_OUTBOUND_SPEC |

**Summary:** the receiving/outbound **quantity + movement-posting + reserve/deduct binding + received/close states** are now **specified** in `OVERSEAS_INBOUND_SPEC.md` §10 (receiving) and `OVERSEAS_OUTBOUND_SPEC.md` (fulfillment); the **movement-posting rule itself** (the write into `overseas_inventory_movements` / `_snapshot`) remains **deferred to the inventory specs** and is the last **Blocking** contract before the P1-D closed loop can run. **No code implements any of these yet.**

---

## 8B. Authority Boundaries (canonical, 2026-07-22)

| Authority | Owns |
|---|---|
| **WAREHOUSE_OPERATIONS_SPEC** (this doc) | Warehouse **navigation, page layout, shared UI conventions**; Factory Inventory + Overseas Inventory page layouts. |
| **OVERSEAS_INBOUND_SPEC** | The **destination receiving operation** and **receipt lifecycle** (operation/receipt schema, partial/over/short/damage, received-vs-closed). |
| **OVERSEAS_OUTBOUND_SPEC** | The **origin fulfillment operation** and **shipout lifecycle** (draft→lock→submit→ack→pick→pack→ship-confirm, partial, cancellation/release). |
| **DATABASE_RELATIONSHIP_MAP** | **Canonical schemas and relationships** (all tables + keys). |
| **SHIPMENT_CENTER_SPEC** | **Formal Shipment** and **endpoint linkage** (auto-create trigger, shipout push direction §23.10). |
| **INVENTORY specs** (`INVENTORY_TABLE_MAPPING_SPEC` / `OVERSEAS_STOCK_SPEC` / §6.0) | **Inventory balance + movement posting rules** (the actual `overseas_inventory_movements` / `factory_stock_movements` writes). |
| **SYSTEM_RUNTIME_ARCHITECTURE** | **Module boundaries + runtime event flow.** |

These boundaries are non-overlapping: a rule stated in one authority is **referenced** (not re-defined) by the others. Where an operation spec needs a movement rule, it **references** the inventory spec rather than restating it.

---

## 9. Deferred / Out of Scope

- **Deferred tables (do NOT create/implement in this task):** `warehouse_outbound_addresses`, `warehouse_outbound_packages`, `warehouse_outbound_package_items`.
- **World Map** remains a **secondary/deferred** visualization: the **primary** operational view for all three pages is **KPI + Table + Detail Drawer/Page**; the optional future World Map shows active routes + quantities. **Do NOT make the map the primary operation interface.**
- Return · Crossdock · Work Order (future nav items) · Warehouse Master admin UI · external API integration + routing table + credentials · any inventory posting/reservation rule (owned by inventory & shipment specs) · any new DB table or column.

---

## 10. Implementation Status

**PARTIALLY IMPLEMENTED (2026-07-22).** The **Warehouse navigation** is now finalized in the live sidebar (`index.html`): the group is labeled **Warehouse** with four entries — **Factory Inventory** and **Overseas Inventory** are active routes (the existing `factory-stock` / `overseas-stock` sections, relabeled — no duplicate pages, route keys + section ids unchanged); **Overseas Inbound** and **Overseas Outbound** appear as **disabled "Soon"** entries (spec-only, not built). The **Factory Inventory page** (§6A) is implemented by enhancing the existing Factory Stock page (`assets/html/pages/factory-stock.html` + `assets/js/pages/factory-stock.js` + `assets/css/pages/factory-stock.css`): KPI row (Current / Reserved / Available / In Production / Pending Shipout), columns (Warehouse / SKU / Category-Series / Current / Reserved / Available / In Production / Pending Shipout / Last Movement), Country + Stock Status filters, `available_factory_stock = MAX(fac_current_stock − fac_reserved_stock, 0)`, reading only `factory_stock` (+ `warehouses` / `sku_details` joins) — never overseas tables. **In Production / Pending Shipout have no authoritative wired source** → rendered as an explicit "—" (not tracked), never fabricated. **Still NOT implemented / spec-only:** the Overseas Inbound / Overseas Outbound operation pages + contracts, the operation/receipt/confirmation tables, inventory movement posting, WMS/API, the Factory adjustment workflow (existing "Edit" button is a dead placeholder — preserved, not wired), and the Warehouse Master admin (Admin → Master Data → Warehouses). **No Apps Script / API / DB migration / redeploy in this task.**

**No build. No redeploy. No migration.**

---

## External Exception / Reconciliation Workspace (CANONICAL 2026-08-01 Round 4D-C — spec only; Runtime NOT implemented)

Future Warehouse Operations workspace for resolving externally discovered, unlinked OMS/WMS/platform operations (owner flow `SUPPLY_CHAIN_SYSTEM_FLOW.md` §12; admission `SUPPLY_PLANNING_CALCULATION_RULES.md` §38). **Nothing here is implemented** (no queue, action, notification, or UI is built).

- **Queue:** quarantined external operations awaiting human resolution; unrelated valid records are never blocked.
- **Filters:** provider · company · warehouse · SKU · direction (inbound/outbound) · authority state · review status · age.
- **Severity + Owner + Age:** each case carries a severity, a responsible operational role/user, and an open-age.
- **Actions:** **Link · Adopt · Reject · Ignore for Planning · Request More Information** (the §12.3 human actions; no generic "Approve").
- **Audit history:** actor, timestamp, action, reason/note preserved for every resolution.
- **Status separation (do not collapse into one field):** operation state · external API/submission state · reconciliation result · review workflow are **distinct dimensions**.

---

### Changelog
- **v2.2 (2026-08-01, Round 4D-C):** Added the future **External Exception / Reconciliation Workspace** conventions (queue · filters · severity · owner · age · Link/Adopt/Reject/Ignore-for-Planning/Request-More-Info · audit history) and the operation/API/reconciliation/review status-separation rule. Spec only — no runtime, no UI.
- **v2.1 (2026-07-22):** SUPERSEDES v2.0's three-page navigation. Finalized to **four separate pages** — **Factory Inventory / Overseas Inventory / Overseas Inbound / Overseas Outbound** — under the Warehouse group, with **Warehouse Master moved explicitly to Admin → Master Data → Warehouses** (outside this group). Added the **Factory Inventory page UI spec** (§6A: KPI Total/Available/Reserved/Low-Stock/In-Production/Pending-Shipout; filters; main table; detail drawer; `available_factory_stock = MAX(fac_current_stock − fac_reserved_stock, 0)`). Reaffirmed Factory vs Overseas as separate domains/pages/queries/balances/ledgers (§2). Added §7 **separate idempotency keys** (create/link · WMS submission · receipt confirmation · shipout confirmation · reversal) + **operation uniqueness `shipment_id + warehouse_id + operation_type`** + **auto-create ≠ auto-submit** + **shipout push direction** reference. Added §8B **Authority Boundaries** table. Marked the §8A Overseas Outbound gap **RESOLVED** (new `OVERSEAS_OUTBOUND_SPEC.md`). Spec only — no runtime.
- **SUPERSEDED:** Factory Inventory and Overseas Inventory are now confirmed as separate inventory domains. See the canonical inventory separation section (`DATABASE_RELATIONSHIP_MAP.md` §6.0). The v1.0 "Inventory module with Factory Inventory + Overseas Inventory tabs" wording below is retired — Overseas Inventory is a standalone page that excludes Factory Inventory (§6), and Factory Inventory is its own standalone page (§6A).
- **v2.0 (2026-07-21):** SUPERSEDES v1.0. Finalized to **three separate pages** — **Overseas Inventory / Overseas Inbound / Overseas Outbound** — with mandatory explicit labels. **Overseas Outbound promoted from FUTURE to a first-class page.** Replaced the single combined "Inventory" module (which had Factory + Overseas tabs) with a standalone **Overseas Inventory** page that **excludes Factory Inventory** from its default dataset. Added per-page KPI/filters/table/detail layouts, operation-status vs API-status separation, shared-components-only rule, idempotent auto-create + company routing, validation gates, and deferred outbound address/package tables + World Map. (v1.0 had grouped Inbound + a combined Factory/Overseas Inventory module under one "Warehouse Operations" nav with Outbound deferred — superseded.)

**End of Document**
