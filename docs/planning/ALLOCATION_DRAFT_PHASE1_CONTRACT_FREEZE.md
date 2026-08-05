# Phase-1 Shipping Allocation Draft — Contract Freeze (Round C2-D1, 2026-08-05)

> **Status: DECISION LANDED / SOURCE-FROZEN. NO MIGRATION APPLIED. NO RUNTIME CHANGED. NO LIVE DB ACCESSED.**
> This document is the **single Phase-1 authority** for the `shipping_allocation_drafts` / `shipping_allocation_draft_lines`
> schema, the Active-Draft / Submit key, and the (future, user-operated) header migration. It lands the user-confirmed
> decisions **D-C2-1 … D-C2-4** and freezes the byte-for-byte Model-1 headers taken from the running-stack owner.

Owner-of-record for Phase-1 runtime schema. Companion owners (now annotated to agree): `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6, `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §807. Demoted to Phase-2 design reference: `SHIPPING_ALLOCATION_TO_SHIPMENT_CANONICAL_AMENDMENT_2026-07-27.md`.

---

## 1. User-confirmed decisions (landed)

| ID | Decision | Landing |
|---|---|---|
| **D-C2-1** | `shipping_allocation_drafts` uses **Model 1** (running-stack 23-column header). No `recommendation_group_no`; `recommended_shipping_method` / `recommended_last_mile_delivery` are **not** header columns; route/method/source/destination are **line-level**. | Frozen in §3 |
| **D-C2-2** | Phase-1 Active-Draft / Submit business key = **K3** (see §4). `draft_version` is **not** a natural key. `recommendation_group_no` is **not** in the Phase-1 key. | Frozen in §4 |
| **D-C2-3** | **Line-level route grain**: selected source/destination warehouse, selected shipping method + last-mile, `route_no`, `planned_qty`, `recommended_qty` snapshot, route-specific note/status. | Frozen in §3.2 / §5 |
| **D-C2-4** | The 2026-07-27 **Model-2 Amendment** (`recommendation_group_no`, 26-col header, header-level recommended method/last-mile, K2 key, air/sea multi-head) is **`PHASE_2_DEFERRED` — NOT ACTIVE FOR PHASE-1 RUNTIME — SUPERSEDED FOR PHASE-1 IMPLEMENTATION**. Retained as history + Phase-2 design reference; never runtime authority for Phase 1. | §6 |

---

## 2. Source-of-truth verification (§3 gate — did the Model-1 owners agree?)

Two Model-1 owners were compared field-by-field:

- **A — Running stack (authoritative):** `16_shipping_allocation_handlers.gs` constants `SHIPPING_ALLOCATION_DRAFTS_HEADERS_` / `SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_`. This is what the write path validates against (`procurementEnsureSheet_` → `prodRequireSheet_` → `classifySchemaMismatch`) and what the file's `CANONICAL SYNC (2026-07-27)` note says matches the manually-adjusted live DB.
- **B — Design doc:** `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6 "FINALIZED canonical Draft model".

**Result:**
- `shipping_allocation_drafts` header — **identical** (23 columns, same order) in A and B. **No conflict.**
- `shipping_allocation_draft_lines` — one **minor doc-order drift**: §3.6 (B) lists `… route_no · override_reason · line_status …`, whereas the running stack (A) is `… route_no · line_status · override_reason …`, and A additionally carries the two **additive trailing** provenance columns `user_edited · user_edited_by` (documented in-code as *Phase-2C additive*). Per **D-C2-1** the **running stack (A) is canonical**; §3.6 (B) is annotated to defer to A for Phase-1 column order. This is a **reconciled** drift, **not** an open source conflict — no HALT.

Therefore the frozen Phase-1 header order below is taken **byte-for-byte from the running-stack owner (A)**.

---

## 3. FROZEN Phase-1 headers (byte-for-byte, from the running-stack owner)

### 3.1 `shipping_allocation_drafts` — Model 1, 23 columns

| # | Column | Owner | Class | Normal Runtime writes? | Null/blank policy | Migration-only may move position? |
|---|---|---|---|---|---|---|
| 1 | `allocation_draft_id` | Header | identity (PK) | yes (create) | never blank | yes (name-based) |
| 2 | `planning_cycle` | Header | scope / **K3** | yes | never blank | yes |
| 3 | `source_page` | Header | scope / **K3** | yes | never blank | yes |
| 4 | `company` | Header | scope / **K3** | yes | may be blank (legacy) | yes |
| 5 | `country` | Header | scope / **K3** | yes | never blank | yes |
| 6 | `marketplace` | Header | scope / **K3** | yes | never blank | yes |
| 7 | `status` | Header | lifecycle | yes | default `draft` | yes |
| 8 | `generation_type` | Header | provenance enum | yes | `scheduled`/`manual_refresh`/`user_created` | yes |
| 9 | `calculation_run_id` | Header | engine snapshot / idempotency | engine only | blank in manual flow (never faked) | yes |
| 10 | `formula_version` | Header | engine snapshot | engine only | blank until engine | yes |
| 11 | `calculated_at` | Header | engine snapshot | engine only | blank until engine | yes |
| 12 | `source_data_as_of` | Header | engine snapshot | engine only | blank until engine | yes |
| 13 | `draft_version` | Header | **version / concurrency (NOT a natural key)** | yes | default `1` | yes |
| 14 | `created_by` | Header | audit | yes (create) | set on create | yes |
| 15 | `created_at` | Header | audit | yes (create) | set on create | yes |
| 16 | `updated_by` | Header | audit | yes | set on write | yes |
| 17 | `updated_at` | Header | audit | yes | set on write | yes |
| 18 | `submitted_by` | Header | lifecycle (Submit) | yes (on submit) | blank until submit | yes |
| 19 | `submitted_at` | Header | lifecycle (Submit) | yes (on submit) | blank until submit | yes |
| 20 | `cancelled_by` | Header | lifecycle (soft-cancel) | yes (on cancel) | blank until cancel | yes |
| 21 | `cancelled_at` | Header | lifecycle (soft-cancel) | yes (on cancel) | blank until cancel | yes |
| 22 | `cancel_reason` | Header | lifecycle (soft-cancel) | yes (on cancel) | blank until cancel | yes |
| 23 | `note` | Header | free text | yes | may be blank | yes |

**No `recommendation_group_no`. No header-level `recommended_shipping_method` / `recommended_last_mile_delivery`.** Those are Phase-2 (§6) or line-level (§3.2).

### 3.2 `shipping_allocation_draft_lines` — 52 columns (running-stack order)

Grouped by classification (exact order = the running-stack constant; positions are frozen):

1. **Identity (1-4):** `allocation_draft_line_id` (PK) · `allocation_draft_id` (FK) · `sku` · `site_sku`.
2. **Window (5-8):** `window_code` · `window_start_date` · `window_end_date` · `required_by_date`.
3. **Engine input snapshots (9-14):** `regular_demand_snapshot` · `special_event_demand_snapshot` · `destination_stock_snapshot` · `qualified_incoming_snapshot` · `approved_supply_snapshot` · `calculated_gap_qty`.
4. **Engine recommendation — source/destination + sequence, immutable (15-21):** `recommended_source_warehouse_id` · `recommended_destination_warehouse_id` · `recommended_source_warehouse_code_snapshot` · `recommended_destination_warehouse_code_snapshot` · `source_initial_available_qty_snapshot` · `source_available_before_allocation_snapshot` · `allocation_sequence`.
5. **Engine recommendation — route/carrier/cost, immutable (22-31):** `recommended_route_rule_id` · `recommended_rate_card_id` · `recommended_lead_time_id` · `recommended_carrier_id` · `recommended_shipping_method` · `recommended_last_mile_delivery` · `recommended_expected_arrival` · `recommended_estimated_cost` · `recommendation_reason` · `recommendation_flags`.
6. **Engine recommended qty snapshot (32):** `recommended_qty` — immutable snapshot; **written only when the incoming line supplies it** (an Execution-Plan save that omits it PRESERVES the snapshot).
7. **User Execution Plan — the LINE-LEVEL route authority (33-45):** `planned_qty` · **`selected_source_warehouse_id`** (From) · **`selected_destination_warehouse_id`** (To) · `selected_source_warehouse_code_snapshot` · `selected_destination_warehouse_code_snapshot` · `selected_rate_card_id` · `selected_lead_time_id` · `selected_carrier_id` · **`selected_shipping_method`** (Method) · `selected_last_mile_delivery` · `expected_arrival` · `units_per_carton` · **`route_no`**.
8. **Lifecycle / audit (46-50):** `line_status` (terminal soft-cancel value = `cancelled`) · `override_reason` · `note` · `created_at` · `updated_at`.
9. **Additive provenance (51-52):** `user_edited` · `user_edited_by` — additive trailing columns; tolerated by the `ALLOW` extra-columns policy.

**Route / From / To / Shipping Method are line-level authorities (D-C2-3):** multiple routes of the same SKU are distinct lines, each with its own `selected_source_warehouse_id` / `selected_destination_warehouse_id` / `selected_shipping_method` / `route_no` and a stable `allocation_draft_line_id`. Phase-1 **must not** compress differing routes into a single header route. Legacy read-only aliases (`ship_from`→`selected_source_warehouse_id`, `destination`→`selected_destination_warehouse_id`, `source_warehouse_id`→`recommended_source_warehouse_id`) remain read-only; new writes use canonical names.

---

## 4. FROZEN Active-Draft / Submit business key — K3

<!-- K3-KEY-BEGIN -->
K3 (Phase-1 unique Active-Draft / Submit lookup key):
    recommendationType = WEEKLY_SHIPPING
  + planning_cycle
  + company
  + country
  + marketplace
  + source_page
<!-- K3-KEY-END -->

- **Count semantics:** `0` Active → CREATE · `1` Active → REUSE/UPDATE · `>1` Active → **BLOCKED_CONFLICT** (never latest-wins, never auto-merge, never auto-cleanup, never write).
- **`draft_version` is a version / concurrency / lineage field, NOT part of the natural key.** A retry of the same `calculation_run_id` is idempotent (resume/upsert the same Active Draft).
- **`recommendation_group_no` is NOT part of the Phase-1 key** (Phase-2, §6).
- This matches `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §807 ("Active-lookup key (never `draft_version`): `WEEKLY_SHIPPING + planning_cycle + company + country + marketplace + source_page`"). No change needed to that spec — it already agrees with K3.

---

## 5. Migration classification taxonomy (PLAN-ONLY this round)

The read-only diagnostic (§8) + the pure plan builder classify the live header into exactly one of:

| Token | Meaning | Safe to auto-plan? |
|---|---|---|
| `NO_MIGRATION_REQUIRED` | live header == canonical (exact) | n/a |
| `REORDER_ONLY_SAFE_CANDIDATE` | all canonical present, no populated extras, order differs | yes — name-based reorder |
| `EXTRA_EMPTY_COLUMNS_SAFE_CANDIDATE` | canonical is an exact prefix; only empty extra columns trail | yes — preserve legacy empties |
| `EXTRA_POPULATED_COLUMNS_REQUIRES_MAPPING_DECISION` | non-canonical column(s) carry data | **no — user decision** |
| `MISSING_CANONICAL_COLUMN_REQUIRES_MIGRATION` | a canonical column is absent | needs add-column migration |
| `DUPLICATE_OR_BLANK_HEADER_BLOCKED` | duplicate or blank header cell | **blocked** |
| `UNKNOWN_BLOCKED` | sheet missing / indeterminate | **blocked** |

**Proposed-mapping actions:** `KEEP` · `MOVE` · `ADD_BLANK` · `PRESERVE_LEGACY` · `DECISION_REQUIRED`. **`DELETE` is never emitted** — dropping any column is a later, explicit, separately-authorized user decision.

---

## 6. Row-preservation rules for the FUTURE user-operated migration (frozen; no apply this round)

A live header re-order/align migration (when authorized in a later round) **must**:

1. take an immutable full-Spreadsheet backup **and** a per-sheet backup tab first;
2. record PRE exact header, PRE row count, PRE row-content hash;
3. map values **by header name**, never by current column position alone;
4. **block** if any unknown populated column exists (`EXTRA_POPULATED_COLUMNS_REQUIRES_MAPPING_DECISION`);
5. keep **dry-run and apply as separate steps**; apply requires the exact expected current-header hash and aborts on any drift after the dry-run;
6. prove `POST row count == PRE row count` and a name-based-remapped `POST business-data hash == PRE` (value preservation);
7. carry a rollback reference; have **no** normal-Runtime reachability and **no** automatic execution from page load / Save / Submit / router / trigger.

**This round ships no apply function.** Only the read-only evidence tool and the pure plan classifier exist.

---

## 7. Running-stack status (accurate)

- Inventory Replenishment → Allocation Draft **frontend + handler bridge: SOURCE PRESENT.** `inventory-replenishment.js` (`_flushDraftDbPersist`, `_newDraftLineId`, soft-cancel, `_hydrateAllocationDraftFromDb`) + `16_shipping_allocation_handlers.gs` (`upsertShippingAllocationDraft` / `…Lines` / `submitShippingAllocationDrafts`, with recommended-snapshot quantity protection) already exist.
- Current live persistence: **LIVE BLOCKED BY SCHEMA MISMATCH** — the live `shipping_allocation_drafts` header order fails the production-safety prefix check (`HEADER_ORDER_MISMATCH`), which fails closed (no runtime auto-repair, S0-2). The UI keeps a `sessionStorage` recovery buffer labeled *not saved to DB* (never canonical).
- **NOT LIVE VERIFIED**: no draft has been confirmed persisted against the live DB this round.
- The three allocation-draft adapters still use the pre-C1 pattern (`await loadOperationDb({force:true})`); **C1-reliability alignment is deferred** to a post-migration round (C2-D2).
- Submit handoff to Weekly Shipping Plan remains **incomplete** until persistence + schema verification pass.

---

## 8. Read-only live header evidence tool

`assets/specs/active/apps-script/41_shipping_allocation_schema_audit.gs` → `auditShippingAllocationSchemaReadOnly()`:

- **editor-run only; NOT routed** (no `doGet`/`doPost`/router/trigger/page reference; no Runtime function calls it);
- exact Production-DB-ID guard (fail closed; masked id in output; no active/fuzzy fallback);
- inspects only `shipping_allocation_drafts` + `shipping_allocation_draft_lines`;
- **zero mutation** (no insert/delete/move/setValues/clear/create/repair — physically read-path only);
- returns per table: `table, exists, rowCount, columnCount, actualHeaders, canonicalHeaders, actualHeaderHash, canonicalHeaderHash, exactMatch, prefixMatch, firstMismatchIndex, mismatchAt, missingHeaders, extraHeaders, duplicateHeaders, blankHeaderIndexes, reorderedHeaders, populatedExtraColumns` (name + index + **non-blank count only**, never values), `dataRowContentHash` (deterministic; never raw contents), `migrationClassification`, `proposedMigrationPlan`.

### 8.1 User execution steps (user-owned; no agent live access)
1. Manually copy `41_shipping_allocation_schema_audit.gs` into the bound Apps Script project (it needs `16_…` present for the canonical constants; **no new deployment version** — it is an editor function, not a web-app change).
2. In the editor, run `auditShippingAllocationSchemaReadOnly` against the configured Production DB.
3. Copy the logged JSON (it contains **no** business values).

### 8.2 Evidence to return for C2-D2
Per table: `actualHeaders`, `actualHeaderHash`, `exactMatch`, `firstMismatchIndex`/`mismatchAt`, `missingHeaders`, `extraHeaders`, `duplicateHeaders`, `blankHeaderIndexes`, `populatedExtraColumns` (with counts), `migrationClassification`, and PRE `rowCount` + `dataRowContentHash`. That output feeds the C2-D2 migration decision (reorder-only vs mapping-decision vs blocked).

---

## 9. Release classification

New diagnostic `41_shipping_allocation_schema_audit.gs` = `APPS_SCRIPT_SYNC_REQUIRED` **only to run the audit** (additive, not routed, no runtime reachability, no deployment version). Docs = `DOCUMENTATION_ONLY`. Test = `GIT_ONLY`. **No `BUNDLE_REBUILD_REQUIRED` (false). No frontend change. No `.gs` runtime/route change.** Not pushed, not deployed, no live DB accessed.
