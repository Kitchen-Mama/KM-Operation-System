# Phase-1 Shipping Allocation Draft — Contract Freeze (Round C2-D1 → reconciled C2-D1R, 2026-08-05)

> **Status: DECISION LANDED / SOURCE RECONCILED TO THE EXISTING LIVE DB. NO MIGRATION APPLIED. NO LIVE DB ACCESSED.**
> The **existing user-approved live DB schema is the Phase-1 canonical authority**: `shipping_allocation_drafts` = **30 columns** (header-level route grain), `shipping_allocation_draft_lines` = **28 columns** (SKU + qty grain). This round aligns the system Header constants, handler write logic, frontend payload bridge, and documentation to that schema **byte-for-byte** — it does **not** redesign the DB and does **not** expand the line to 52 columns.

Owner-of-record for Phase-1 runtime schema. Companion owners (annotated to agree): `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6, `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §807, `SHIPPING_ALLOCATION_TO_SHIPMENT_CANONICAL_AMENDMENT_2026-07-27.md` (its 30-col header shape is now the live Phase-1 schema; only its air/sea multi-head behavior + K2 key remain Phase-2-deferred).

---

## 0. Correction history (why this file was reconciled)

C2-D1 froze a **23-col header / 52-col line (Model-1)** taken from the repository handler *constant*. The user then confirmed the **live DB does not match that** — it is the **30-col header / 28-col line** schema, and the DB is business-approved and canonical. The stale 23/52 constant was in fact the **root cause of `PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH`** (the handler validated the live 30-col header against a 23-col expectation → order mismatch at index 7 → fail-closed). **C2-D1R (this revision) reconciles source → the approved 30/28 schema.** No live DB was read or written by the agent in either round.

---

## 1. User-confirmed decisions (C2-D1R)

| ID | Decision |
|---|---|
| **D-C2-1** | Existing DB is canonical. `shipping_allocation_drafts` = **Model-2 30-col** header. Route context (`recommended_source_warehouse_id`, `recommended_destination_warehouse_id`, code snapshots, `recommended_shipping_method`, `recommended_last_mile_delivery`) is **header-level**. `recommendation_group_no` is present on the header but **Phase-1 does not use it** for multiple active drafts / multiple vessels. |
| **D-C2-2** | Active-Draft / Submit key = **K3** (§4). `draft_version` is version/concurrency lineage, **not** a natural key. `recommendation_group_no` is **not** in the key. |
| **D-C2-3** | **Line grain = SKU + qty.** All active lines under a Draft share the Draft header's single route context. No `selected_*` on the 28-col line. |
| **D-C2-4** | The 2026-07-27 Amendment's **30-col header shape is now the live Phase-1 schema**; its **air/sea multiple-Draft-Header split, `recommendation_group_no` multi-draft usage, and K2 key remain `PHASE_2_DEFERRED`**. Retained; nothing deleted. |

---

## 2. Phase-1 grain (header owns one route; line owns SKU + qty)

- One `shipping_allocation_drafts` row owns **one** From / To / Method / Last-mile route context.
- All active `shipping_allocation_draft_lines` under that Draft **share** that header route context; each line owns `sku` / `site_sku` + `planned_qty` (+ immutable `recommended_qty` snapshot).
- `recommended_qty` = system recommendation snapshot (immutable; written only when supplied). `planned_qty` = explicit user override. **Submit uses `planned_qty` when valid, else `recommended_qty`** (SC-1 authority preserved).
- **Two different routes in the same week** → Phase-1 handles via **separate Submit cycles / subsequent Drafts** (never a simultaneous multi-route Active Draft). Phase-2 may later activate `recommendation_group_no` / a split model.

---

## 3. FROZEN Phase-1 headers (byte-for-byte, from the reconciled running-stack constants)

### 3.1 `shipping_allocation_drafts` — 30 columns

`allocation_draft_id · planning_cycle · source_page · company · country · marketplace · status · recommended_source_warehouse_id · recommended_destination_warehouse_id · recommended_source_warehouse_code_snapshot · recommended_destination_warehouse_code_snapshot · recommendation_group_no · recommended_shipping_method · recommended_last_mile_delivery · generation_type · calculation_run_id · formula_version · calculated_at · source_data_as_of · draft_version · created_by · created_at · updated_by · updated_at · submitted_by · submitted_at · cancelled_by · cancelled_at · cancel_reason · note`

| Group | Columns | Class | Normal Runtime writes? |
|---|---|---|---|
| identity / scope (K3) | `allocation_draft_id`, `planning_cycle`, `source_page`, `company`, `country`, `marketplace` | identity / scope | yes |
| lifecycle | `status` | lifecycle | yes |
| **header route context** | `recommended_source_warehouse_id` (From), `recommended_destination_warehouse_id` (To), `recommended_source_warehouse_code_snapshot`, `recommended_destination_warehouse_code_snapshot`, `recommendation_group_no`, `recommended_shipping_method` (Method), `recommended_last_mile_delivery` (Last-mile) | route snapshot (**header-level**) | yes — on the Draft header |
| generation / calc provenance | `generation_type`, `calculation_run_id`, `formula_version`, `calculated_at`, `source_data_as_of` | engine snapshot | engine only (blank in manual flow) |
| version | `draft_version` | **version / concurrency (NOT a natural key)** | yes (default `1`) |
| audit | `created_by`, `created_at`, `updated_by`, `updated_at` | audit | yes |
| lifecycle | `submitted_by`, `submitted_at`, `cancelled_by`, `cancelled_at`, `cancel_reason`, `note` | lifecycle / audit | yes |

`recommendation_group_no` is a stored column but Phase-1 **never** writes >1 Active Draft per K3 by varying it.

### 3.2 `shipping_allocation_draft_lines` — 28 columns

`allocation_draft_line_id · allocation_draft_id · sku · site_sku · window_code · window_start_date · window_end_date · required_by_date · regular_demand_snapshot · special_event_demand_snapshot · destination_stock_snapshot · qualified_incoming_snapshot · approved_supply_snapshot · calculated_gap_qty · source_initial_available_qty_snapshot · source_available_before_allocation_snapshot · allocation_sequence · recommendation_reason · recommendation_flags · recommended_qty · planned_qty · units_per_carton · route_no · line_status · override_reason · note · created_at · updated_at`

- **Identity:** `allocation_draft_line_id` (PK) · `allocation_draft_id` (FK) · `sku` · `site_sku`.
- **Engine snapshots (immutable, written only when supplied):** window fields · demand/stock/supply snapshots · `calculated_gap_qty` · `source_initial_available_qty_snapshot` · `source_available_before_allocation_snapshot` · `allocation_sequence` · `recommendation_reason` · `recommendation_flags` · `recommended_qty`.
- **User Execution Plan (qty grain):** `planned_qty` · `units_per_carton` · `route_no`.
- **Lifecycle / audit:** `line_status` (terminal soft-cancel value = `cancelled`) · `override_reason` · `note` · `created_at` · `updated_at`.
- **No `selected_source_warehouse_id` / `selected_destination_warehouse_id` / `selected_shipping_method` / `selected_last_mile_delivery` / carrier-cost / `user_edited` / `user_edited_by` columns** — route context is on the header (D-C2-1/D-C2-3). Do **not** add them without a separate user-authorized migration.

---

## 4. FROZEN Active-Draft / Submit business key — K3 (unchanged)

<!-- K3-KEY-BEGIN -->
K3 (Phase-1 unique Active-Draft / Submit lookup key):
    recommendationType = WEEKLY_SHIPPING
  + planning_cycle
  + company
  + country
  + marketplace
  + source_page
<!-- K3-KEY-END -->

- Count semantics: `0` → CREATE · `1` → REUSE/UPDATE · `>1` → **BLOCKED_CONFLICT** (never latest-wins / auto-merge / auto-cleanup).
- **`draft_version` is version / concurrency / lineage, NOT part of the natural key.** `recommendation_group_no` is **not** in the Phase-1 key. Matches `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §807 ("never `draft_version`").

---

## 5. Persistence bridge mapping (C2-D1R §7 — reconciled)

| Execution Plan input | Persisted to |
|---|---|
| From | `shipping_allocation_drafts.recommended_source_warehouse_id` (+ `_code_snapshot`) — **header** |
| To | `shipping_allocation_drafts.recommended_destination_warehouse_id` (+ `_code_snapshot`); Amazon logical → `destination_marketplace`, blank id — **header** |
| Method | `shipping_allocation_drafts.recommended_shipping_method` — **header** |
| Last-mile | `shipping_allocation_drafts.recommended_last_mile_delivery` — **header** |
| Qty | `shipping_allocation_draft_lines.planned_qty` — **line** |
| System recommendation | `shipping_allocation_draft_lines.recommended_qty` (system line only; preserved on user edits) — **line** |
| SKU | `shipping_allocation_draft_lines.sku` / `site_sku` — **line** |
| Route sequence | `shipping_allocation_draft_lines.route_no` / `allocation_sequence` (where supplied) — **line** |

Frontend owners: `IRDraft.buildDraftHeaderPayload` (adds header route context), `IRDraft.buildDraftLinePayload` (28-col line, no `selected_*`), `inventory-replenishment.js` `_flushDraftDbPersist` (derives the header route from the scope's complete routes — Phase-1 single-route). Backend owner: `16_shipping_allocation_handlers.gs` (`sadUpsertDraftHeaderCore_` writes the header route; `sadHeaderRouteIsComplete_` gate → `PLAN_HEADER_INCOMPLETE`; `sadLineIsComplete_` = SKU + Qty>0 gate → `PLAN_LINE_INCOMPLETE`).

---

## 6. Save / Cancel / Submit rules

- **Save (batch):** persistable when the header route context is complete (From + To + Method) **and** ≥1 line has valid Qty. Partial header route → `PLAN_HEADER_INCOMPLETE`; partial line → `PLAN_LINE_INCOMPLETE`; neither silently skipped; zero mutation on rejection. One batch command (header, then lines).
- **Cancel:** writes `status` + `cancelled_by` + `cancelled_at` + `cancel_reason` + `updated_by/at`; never deletes header or lines; idempotent (repeat cancel is benign).
- **Submit:** whole-Draft only; validates unique K3 Active Draft + complete header route + complete lines + integer qty + source availability under LockService; all-or-nothing; deterministic downstream; **no reservation, no stock deduction.** *(The full Submit → `shipping_plans`/`shipping_plan_lines` handoff is not yet built — the current handler marks the Draft `submitted`; the deterministic Weekly-Plan creation is forward work, C2-D2, and requires live verification.)*

---

## 7. Migration decision

Because source is now reconciled to the approved 30/28 schema, the expected outcome of the read-only audit against the live DB is **`NO_MIGRATION_REQUIRED`** (live headers should exactly match the frozen 30/28 order). **No migration is created and none is applied.** If the audit instead reports drift, use the C2-D1 read-only evidence tool + the plan-only classifier (`REORDER_ONLY_SAFE_CANDIDATE` / `EXTRA_*` / `MISSING_CANONICAL_COLUMN_REQUIRES_MIGRATION`) to decide a separate, user-operated migration (never auto-apply, never DELETE).

---

## 8. Running-stack status (accurate)

- Handler constants + write logic + frontend payload builders + docs: **SOURCE RECONCILED to 30/28 (header-route grain).**
- Live persistence: the handler now validates the live 30-col header against a **30-col** expectation, so the prior `HEADER_ORDER_MISMATCH` should no longer fire — **NOT LIVE VERIFIED** (no live write this round; primary DB in use).
- The three allocation-draft adapters (`upsertShippingAllocationDraft` / `…Lines` / `submitShippingAllocationDrafts`) still use the pre-C1 pattern — **C1-reliability alignment remains deferred** (post-verification).
- Read-only evidence tool `41_shipping_allocation_schema_audit.gs` remains valid; its canonical is now the reconciled 30/28 constants, so the user can run it to **prove live == 30/28 → `NO_MIGRATION_REQUIRED`.**

---

## 9. C2-D2 runtime completion + Submit HALT (2026-08-05)

**Completed (source/test-verified, LIVE NOT VERIFIED):**
- **K3 hard enforcement** — a single centralized resolver `sadResolveActiveDraft_(sh, scope)` (key = `planning_cycle + company + country + marketplace + source_page`; **never** `draft_version`, **never** `recommendation_group_no`) used by Save, Cancel and the targeted readback. **`0` → CREATE · `1` → REUSE/UPDATE · `>1` → `BLOCKED_CONFLICT`** (zero mutation, returns all conflicting Draft ids).
- **One route per Draft (§7)** — the frontend blocks **`MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1`** when the complete lines carry >1 distinct From/To/Method/Last-mile context (never silently persists only route0; `IRDraft.distinctRouteContexts`).
- **Targeted read-only readback** — `getShippingAllocationDraftWorkspace` (`handleGetShippingAllocationDraftWorkspace_`) reads **only** the two draft tables (never `getOperationDb`) → `{ status: NO_ACTIVE_DRAFT | ACTIVE_DRAFT_FOUND | BLOCKED_CONFLICT, draft, lines, issues }`.
- **Whole-Draft Cancel** — `cancelShippingAllocationDraft` (`handleCancelShippingAllocationDraft_`): soft-cancel (`status`/`cancelled_by`/`cancelled_at`/`cancel_reason` + `updated_*`), **preserves Header + Lines**, idempotent (repeat → benign `already_cancelled`), submitted Draft not cancellable (SC-1 not inferred).
- **C1 reliability alignment** — the Save/Cancel/Submit adapters delegate to the canonical `_kmWeeklyCommand_` runner (ack decoupled from readback, structured error codes, never throw, **no internal whole-DB `loadOperationDb`**); the readback adapter is text-first.

**HALTED — Submit → Weekly Shipping Plan handoff (§14–§19):** deferred by design because the required authority is **unresolved in source/spec**, per the round's §17/§25 HALT conditions:
1. **Source-availability / L2 commitment authority is unresolved.** `handleCreateShippingPlansBatch_` performs **no** source-stock reread, aggregation, or availability check, and the supply-planning calculation engines are **NOT IMPLEMENTED** — there is no authoritative available-qty / L2-commitment set to validate `requested ≤ available` under lock. Inventing one is prohibited.
2. **No deterministic downstream identity.** The existing writer generates **random-UUID** `shipping_plan_id` / `shipping_plan_line_id` / `submit_batch_id` (`Utilities.getUuid()`), so idempotent retry (same `draftId + draftVersion` → the same downstream ids, no duplicates) cannot be guaranteed.
3. **Idempotency would require a new lineage column.** `shipping_plans` / `shipping_plan_lines` carry **no** `allocation_draft_id` / `allocation_draft_line_id` lineage column, so a retry-safe Draft→Plan link cannot be recorded without **adding a DB column** — prohibited (§24, no schema expansion).
4. **No logical transaction / compensation** exists in the writer (§18): a plain append loop with no downstream verify-then-mark-source or rollback.

**Also flagged:** an existing "Submit Plan" control (`inventory-replenishment.js`) submits **local Execution-Plan UI state** directly to `createShippingPlansBatch` — this predates C2-D2 and does **not** satisfy §14 (DB-authoritative reread under lock) / §12 (no local-only submit). It was **not** modified this round (ripping out a working pre-existing control is an unverifiable live-behavior change); the DB-authoritative Submit that would replace it stays HALTed until (1)–(3) are resolved by a separate authorized decision (supply authority + a deterministic id/lineage scheme, potentially a user-approved additive lineage column).

---

## 10. C2-D2A-UI — Allocation Draft persistence UI workflow (2026-08-05)

**Truthful persistence state machine** (`IRDraftWorkspace`, `inventory-compat.js` — pure, deps-injected, DOM-free, Node-tested): canonical states `NOT_SAVED / SAVING / SAVED / SAVE_FAILED / CONFLICT / CANCELLED / SUBMITTED` (transient `LOADING_DRAFT`). State is derived from **committed acknowledgements + the targeted readback**, never from toast text.

- **Initial load / Refresh** — one `getShippingAllocationDraftWorkspace` request per resolved K3 scope, stale-load sequence-guarded; `NO_ACTIVE_DRAFT`→NOT_SAVED, `ACTIVE_DRAFT_FOUND`→state from the DB draft's own status, `BLOCKED_CONFLICT`→CONFLICT (no guessed draft). **Never `getOperationDb` / `loadOperationDb`.**
- **Save** — client-validates (multi-route → header route → line qty) → SAVING (double-click guarded, IN_FLIGHT) → adapter save → **exactly one** targeted readback → SAVED (shows `allocation_draft_id` / `draft_version` / DB timestamp / “Saved to DB”). Committed-but-readback-failed → **stays SAVED** with `WRITE_COMMITTED_READBACK_FAILED` + “已寫入資料庫，正在重新確認狀態” + Retry Readback (never re-sends Save). Pre-commit failure → SAVE_FAILED with a structured code (inputs retained). `recommended_qty` and persisted `allocation_draft_line_id` pass through unmodified.
- **Cancel** — a gated Cancel control (eligible SAVED draft only) with a confirmation showing Draft ID / scope / line count → one `cancelShippingAllocationDraft` → one targeted readback → CANCELLED, Header/Lines kept visible as read-only history; repeat cancel is benign (`ALREADY_CANCELLED`); no hard delete.
- **Local recovery** — sessionStorage is an **unsaved buffer only**. `compareLocalVsDb` (normalized route + line signature) → `IDENTICAL`/`DIFFERENT`; on `DIFFERENT` an explicit **Use DB (default) / Restore Local / Review** decision (`resolveLocalDecision`); restoring local → NOT_SAVED (no immediate write, no silent merge); **SUBMITTED/CANCELLED DB drafts can never be overwritten by local restore** (`DB_TERMINAL_LOCKED`).
- **Structured error codes** (never message parsing): the C1 runner now surfaces canonical leading-token codes (`BLOCKED_CONFLICT`, `PLAN_HEADER_INCOMPLETE`, `PLAN_LINE_INCOMPLETE`, `MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1`, `NO_ACTIVE_DRAFT`, `IMMUTABLE_TERMINAL_STATUS`, …) and preserves `conflictIds` into `error.details`.

**Legacy "Submit Plan" control disposition (§9 of the round):** the existing control is classified as a **legacy / manual Shipping-Plan creation path** (it calls `createShippingPlansBatch` from local Execution-Plan state). It is kept **separate** from the Allocation Draft persistence panel and is **not** wired to any Draft submit handler; the new `IRDraftWorkspace` exposes **no submit**, and the page never marks a Draft submitted from local UI. The **DB-authoritative Submit → Weekly Shipping Plan handoff is not yet available** and remains HALTed (§9). No local data marks a Draft submitted.

**Live browser checklist:** enter a scope → panel shows NOT_SAVED (no DB draft) / SAVED (DB draft, with id+version) / CONFLICT (duplicate) / SUBMITTED / CANCELLED; complete a route+line → Save → SAVED after one targeted readback (no whole-DB reload in the network tab); duplicate route → block message; Cancel → confirmation → CANCELLED history; refresh → only the targeted read fires.

## 11. F1-7N-FB-2A — Execution Plan save observability + no local persistence fallback (2026-08-25)

Closes a production `BUSINESS_COMMAND_ERROR` on `upsertShippingAllocationDraft` (affected table
`shipping_allocation_drafts`) whose surface read "Could not save to the database — kept locally".

### 11.1 What `BUSINESS_COMMAND_ERROR` actually was
It is **not a backend reason**. `_kmClassifyBusinessError_` returns it as the CLIENT fallback for any handler
error string that is neither an "already/cannot" pattern nor a member of `KM_CANONICAL_CODES`, and the
Execution Plan error surface then rendered code / table / missingHeader / requestId but **never `message`** —
the only field carrying the typed reason. The screenshot was therefore the system reporting *"an error I have
no label for"*, with the label discarded. It **excludes** the eight canonical rejections (`PLAN_HEADER_INCOMPLETE`,
`BLOCKED_CONFLICT`, `IMMUTABLE_TERMINAL_STATUS`, …) — those would have shown their own code.

The reasons the handler can emit that fell outside the list:

| reason | source | zero-write | retryable |
| --- | --- | --- | --- |
| `PRODUCTION_SAFETY:<token>` (`SCHEMA_NOT_PROVISIONED` / `HEADER_MISSING` / `HEADER_ORDER_MISMATCH` / `HEADER_BLANK` / `HEADER_DUPLICATE` / `HEADER_UNEXPECTED` / `ROW_WIDTH_MISMATCH` / `MISSING_REQUIRED_HEADER` / `WRONG_SPREADSHEET_TARGET`) | `prodRequireSheet_` / `prodRequireColumns_`, thrown out of `procurementEnsureSheet_` on the FIRST statement of `sadUpsertDraftHeaderCore_`, surfaced by the router's top-level catch as `err.message` | proven | no — needs schema reconciliation |
| `ROUTE_INCOMPLETE_NEW_DRAFT` | `sadResolveActiveDraftK2OrK3_` BLOCK | stated | yes, after completing the route |
| `LEGACY_ROUTE_RECONCILIATION_REQUIRED` | `sadResolveActiveDraftK2OrK3_` BLOCK | stated | no — explicit user migration |
| `K2_ROUTE_RECONCILIATION_REQUIRED` | `sadLegacyReconcileReason_` | stated | no — explicit user migration |
| `LOCK_UNAVAILABLE` / `LOCK_ERROR` | `handleUpsertShippingAllocationDraft_` lock stage | proven | yes |

`PRODUCTION_SAFETY:*` is the leading candidate for the observed failure because it fires before any payload
logic, for every payload, and a route the frontend refuses to persist unless `IRDraft.isRouteComplete` passes
cannot reach the K3 branch that raises the two `*_RECONCILIATION_REQUIRED`/`ROUTE_INCOMPLETE_NEW_DRAFT`
reasons on a first save. **Which token it is cannot be named from a screenshot** — `TEMP_SHIPPING_ALLOCATION_DRAFT_DIAGNOSE`
names it read-only.

### 11.2 Frozen rules added
1. Those reasons are members of `KM_CANONICAL_CODES` (schema refusals keep the full `PRODUCTION_SAFETY:<token>`),
   so the browser never flattens them again.
2. A failed write is **never** represented as Saved. The typed values stay visible, labelled
   `Unsaved — database update failed`; the sessionStorage recovery cache carries the UNSAVED marks so a reload
   cannot promote a failed write into canonical state; a successful DB hydrate voids those marks (the DB is the SSOT).
3. **Saved requires** a response carrying the persisted `allocation_draft_id` **and** its `created`/`updated`
   classification. A bare `success:true` is `PERSISTENCE_NOT_ACKNOWLEDGED` — a failed save. Retry reuses the same
   deterministic `SADH-K2-` identity, so it UPDATEs rather than duplicating.
4. **Submit Plan fails closed** while any route is unsaved. Submit sends only persisted draft ids and the backend
   re-reads persisted rows, so an unsaved route would be silently absent from an apparently complete plan.
5. Every Execution Plan write is covered: header upsert, line upsert, line soft-cancel (delete) and header
   soft-cancel. A swallowed cancel failure was its own false-persistence path.

### 11.3 Read-only diagnostic (`TEMP_SHIPPING_ALLOCATION_DRAFT_DIAGNOSE`, 63_)
Runs the write path's own gates in the write path's own order and reports the exact token — it reimplements no
business rule: `prodRequireSheet_`/`prodRequireColumns_` → `sadHeaderRouteIsComplete_` →
`sadResolveActiveDraftK2OrK3_` → `sadLegacyReconcileReason_`, plus the existing
`auditShippingAllocationSchemaReadOnly` (41_) header-drift report. Reads only; never provisions a sheet, never
takes a lock, never touches Drive, never invokes a handler, and returns no spreadsheet/Drive id.
Also routed as `system.shippingAllocationDraftDiagnostic`, and the four Execution Plan actions are now covered
by `system.health` symbol probing.

## 12. F1-7N-FB-2A — Site Inventory explicit Search gate (2026-08-25)

Selecting Country or Marketplace must not load data. Two filter states are now distinct: **PENDING** (the
selectors) and **APPLIED** (`_irSearch.applied`, assigned in exactly one place, only on a successful Search).
The primary render and `_getCloudReplenishmentData` read APPLIED, so a selector change can only mark the result
stale — it cannot repaint or fetch.

Three auto-load paths were removed: the mount's `_irWorkspaceRefresh_()` + render; `initReplenRecoContext()`'s
`_irRecoTrigger()`; and `onReplenRecoScopeChanged()`'s `_irRecoTrigger()` — the last bound to BOTH selector
`onchange` handlers, each of which documented itself as making "NO API call" while issuing two scope reads and
then repainting the table via `_irRecoRefreshVelocityCells_`. Search now owns every data read, is single-flight,
sequence-guarded on both success and failure, validates filters before issuing anything, and never self-retries.
States are mutually exclusive: PRE_SEARCH ("Select Country and Marketplace, then press Search.") / LOADING /
READY / EMPTY / ERROR — "No data" is never shown before a successful Search.

**The LTS filter is unchanged**: source-proven a client-side `.filter()` over the already-loaded rows in both
data paths, never a server query parameter, so it is still read live and applied immediately.

**Residual, disclosed:** the Country/Marketplace option lists derive from `marketplaces` inside the same
`inventoryReplenishment` workspace payload as the inventory rows, so the selectors cannot be populated without
one read. That read is deferred to first interaction with a selector (single-flight) rather than run on mount —
so opening the page issues no inventory workspace request — but a user who opens a selector before searching
still causes exactly one. Making that read genuinely registry-only would need an include-gated slim mode in
`60_api_v1_inventory_replenishment_workspace.gs`; not done here.
