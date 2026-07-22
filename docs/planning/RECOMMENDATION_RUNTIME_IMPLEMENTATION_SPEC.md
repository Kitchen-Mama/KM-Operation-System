# Recommendation Runtime Implementation Spec — Daily Pipeline, Weekly Shipping & Monthly Order Recommendations

**Status:** 🟡 Draft v1.0 — **SPECIFICATION ONLY.** No Runtime, Apps Script, frontend, trigger, DB column, or sheet tab is created here. Function-level runtime status below was **verified by read-only audit** (2026-07-20).
**Last Updated:** 2026-07-20
**Maintained By:** Development Team
**Related / Authority chain:**
- [`SYSTEM_RUNTIME_ARCHITECTURE.md`](./SYSTEM_RUNTIME_ARCHITECTURE.md) §7A — canonical cadence (this spec is its implementation contract).
- [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) §20/§23/§24 — the recommendation **calculation** authority (this spec does not restate formulas).
- [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md), [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) §3.6/§3.7 — Draft tables.
- [`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`](./AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md) — Daily Amazon import.
- [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) — schema authority.

> **Scope.** Implementation-ready Runtime contract for the recommendation pipeline: the existing Daily entry point, two **future** no-arg scheduler entry points, source-readiness, cycle idempotency, recommendation-vs-user-quantity protection, Draft persistence, and future trigger installation. **No formulas are redefined** (owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`).

> **Canonical schedule (Asia/Taipei; Apps Script triggers fire within the hour window, not at an exact minute):** Daily Amazon Report Pipeline **12:00–13:00** · validation/readiness buffer **13:00–14:00** · Weekly Shipping Recommendation **Monday 14:00–15:00** · Monthly Order Recommendation **day 5, 15:00–16:00**. Windows are staged so the Monday-the-5th case keeps Weekly (14:00–15:00) and Monthly (15:00–16:00) in separate, non-overlapping windows.

---

## A. Daily Report Pipeline

- **Entry point (EXISTING / VERIFIED):** `runAmazonSnapshotImports()` — `assets/specs/active/apps-script/07_amazon_import_runner.gs:14`, a no-argument loop over `IMPORT_CONFIGS` → `runAmazonSnapshotImport_(cfg,'scheduler',{})`. Safe as a no-arg time-trigger entry point.
- **What it does (VERIFIED):** imports the four configured Amazon sources and writes `amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_weekly_sales_snapshot` (full rewrite), `amazon_daily_sales_snapshot` (rolling upsert), plus append-only logs `import_sync_runs` and `import_sync_issues`.
- **What it does NOT do (VERIFIED):** it does **not** run Shared-FBM allocation, Days of Supply, or Suggested-Qty recalculation; it does **not** call any Weekly/Monthly recommendation; it has **no** link to `shipping_allocation_drafts`. **Do not claim otherwise.**
- **Canonical trigger:** every day, Asia/Taipei, **12:00–13:00** window.
- **Legacy metadata:** `06_amazon_import_config.gs:184` `scheduleTime: '16:00'` is **LEGACY / SUPERSEDED as a schedule** — it is **config metadata never consumed by Runtime** (only `scheduleTimezone` is read, for BQ date math/pruning). The operative daily trigger is the manually-installed 12:00–13:00 trigger on `runAmazonSnapshotImports`. See §11 for reconciliation. **Do NOT prescribe a second duplicate same-day Daily Sales import.**
- **Auditable result:** each configured source must produce an auditable `import_sync_runs` row. A job is **not** source-ready merely because the outer function returned; **required configured sources must be individually successful for the applicable business date/batch**, and a partial source failure must remain visible and **block** dependent recommendation generation (§H).
- **Three separate readiness concepts (do not conflate):** (1) imported-source readiness; (2) Analysis-calculation readiness; (3) recommendation readiness (§H).

---

## B. Weekly Shipping Scheduler Contract — `runWeeklyShippingRecommendation()` *(NOT IMPLEMENTED — future)*

> **Status: DOES NOT EXIST** (audited: zero occurrences repo-wide). Specified here as a **future** no-argument entry point. Do not claim it exists; do not install a Weekly trigger until it exists and is manually tested (§I).

- **Schedule:** Monday, Asia/Taipei, **14:00–15:00** window.
- **Required responsibilities (in order):**
  1. Acquire a **script lock / concurrency guard** (`LockService` or equivalent); abort safely if another run holds it.
  2. Resolve current **ISO year + ISO week**.
  3. Verify **Daily Source Readiness** (§H.1).
  4. Verify **Analysis Readiness** (§H.2) — required calculated inputs present/current.
  5. Build recommendations using the **canonical Supply Planning formulas** (`SUPPLY_PLANNING_CALCULATION_RULES.md` §20/§23/§24) — this spec adds no formula.
  6. Create **or resume** exactly **one** Shipping Recommendation Draft per **cycle key = ISO_YEAR + ISO_WEEK + Scope** (§G).
  7. Persist recommendation **headers and lines** (§C).
  8. Initialize the **user quantity only when a new line is first created** (§D).
  9. **Never overwrite existing user edits** on retry/rerun.
  10. Return a **structured summary**: `{ success, skipped, resumed, failed, issues }` counts.
  11. **Never report success after partial persistence failure** — fail closed and resumable (§G).

---

## C. Shipping Draft Schema Contract

> **FINALIZED 2026-07-22 — canonical schema owner = `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6** (mirrored in `DATABASE_RELATIONSHIP_MAP.md` §7.5). This section previously listed an interim header with `sku`/`plan_month`/`target_window`/`source_type` + "REQUIRED DB DESIGN" gaps; those gaps are now folded into the canonical schema below. Still **spec + DB design only — no `HEADERS_` constant / writer exists in code.** **No separate `shipping_allocation_suggestions` table** (recommendation snapshot + user value are columns on the same line).

**`shipping_allocation_drafts` (header — canonical):** `allocation_draft_id` (PK), `planning_cycle` (ISO `YYYY-Www` = the cycle key; supersedes separate `iso_year`/`iso_week`/`cycle_key`/`plan_month`), `source_page`, `company`, `country`, `marketplace`, `status`, **`generation_type`** (`scheduled`/`manual_refresh`/`user_created` — replaces `source_type`), `calculation_run_id` (idempotency), `calculated_at`, `source_data_as_of` (which Daily batch/analysis as-of the recommendation used — supersedes `source_batch_ref`), `draft_version`, `created_*`/`updated_*`, `submitted_*`, `cancelled_*` + `cancel_reason`, `note`. **REMOVED:** `sku`, `target_window`, `source_type`. **Uniqueness:** `planning_cycle + company + country + marketplace + draft_version`; retry of the same `calculation_run_id` is idempotent.

**`shipping_allocation_draft_lines` (canonical):** identity (`allocation_draft_line_id`, `allocation_draft_id`, `sku`, `site_sku`, `route_no`, `line_status`); window (`window_code`, `window_start_date`, `window_end_date`, `required_by_date`); recommendation input snapshots (`regular_demand_snapshot`, `special_event_demand_snapshot`, `destination_stock_snapshot`, `qualified_incoming_snapshot`, `approved_supply_snapshot`, `calculated_gap_qty`, `source_warehouse_id`, `source_available_qty_snapshot`, `units_per_carton`); system recommendation snapshot (`recommended_qty`, `recommended_route_rule_id`, `recommended_rate_card_id`, `recommended_lead_time_id`, `recommended_carrier_id`, `recommended_shipping_method`, `recommended_last_mile_delivery`, `recommended_expected_arrival`, `recommended_estimated_cost`, `recommendation_reason`, `recommendation_flags`); user Execution Plan (`planned_qty`, `ship_from`, `destination`, `selected_rate_card_id`, `selected_lead_time_id`, `selected_carrier_id`, `selected_shipping_method`, `selected_last_mile_delivery`, `expected_arrival`, `override_reason`); audit (`note`, `created_at`, `updated_at`).

**MUST NOT store** (derive at Runtime): `uncovered_qty`, `coverage_status`, `window_label`, route display string, source display name. `required_by_date` is kept on the line (calc/DB field) even though hidden from the compact Recommendation Summary.

**Legacy naming:** the new canonical quantities are **`recommended_qty`** (system snapshot) and **`planned_qty`** (user). The misspelled **`recommand_shipment_draft_qty`** is a **LEGACY READ/MIGRATION ALIAS for `recommended_qty` only** (never the new canonical column); `shipment_draft_qty` / `qty` are legacy aliases for `planned_qty`. Do NOT introduce the misspelling as a new column.

---

## D. Shipping Quantity Protection

Canonical pair (FINALIZED 2026-07-22): **`recommended_qty`** = immutable system recommendation snapshot *(legacy alias `recommand_shipment_draft_qty`)*; **`planned_qty`** = user-controlled execution quantity *(legacy alias `shipment_draft_qty`/`qty`)*.
- **On first line creation:** `planned_qty = recommended_qty`.
- **After first creation:** users may update `planned_qty` and add/delete lines per the Draft workflow; **scheduler retries must not reset `planned_qty`**; the **Daily pipeline must not modify either committed Draft field** (`recommended_qty` or `planned_qty`); a **weekly rerun for the same cycle resumes/idempotently repairs the same batch** (§G) and must **not** create a second active batch or silently refresh recommendations over user edits. A deliberate **Regenerate** action follows the `draft_version` rule and preserves auditability.

---

## E. Monthly Order Scheduler Contract — `runMonthlyOrderRecommendation()` *(NOT IMPLEMENTED — future)*

> **Status: DOES NOT EXIST** (audited). The monthly **calculation engine** also does not exist (`recommended_qty` is passthrough-blank; `13_procurement_handlers.gs:607` `recommended_qty: '', // Calculation Engine not implemented`). Specified here as a **future** no-arg entry point.

- **Schedule:** day 5 of each month, Asia/Taipei, **15:00–16:00** window.
- **Required responsibilities (in order):**
  1. Acquire concurrency guard.
  2. Resolve **Year + Month + Scope**.
  3. Validate **Daily Source + Analysis readiness** (§H).
  4. Run the **canonical order recommendation calculation** (`SUPPLY_PLANNING_CALCULATION_RULES.md`; engine to be built — no formula added here).
  5. Create **or resume** exactly **one** request allocation Draft per **cycle key = YEAR + MONTH + Scope** (§G).
  6. Populate **`recommended_qty`**.
  7. Initialize **`order_qty` only on first line creation** (§F).
  8. **Never overwrite user-modified `order_qty`** on retry.
  9. **Reuse the existing body-driven request-allocation writers where safe** (`handleUpsertRequestOrderAllocationDraft_` / `handleUpsertRequestOrderAllocationDraftLines_` / `handleSubmitRequestOrderAllocationDrafts_`, `15_request_allocation_handlers.gs`) **via a new scheduler-safe orchestration layer** — the no-arg runner assembles the payload (with a resolved `request_allocation_draft_id` for idempotency, §G/§F) and calls the writers. **Document the orchestration layer as REQUIRED (NOT IMPLEMENTED).**
  10. **Never attach a trigger directly to a `body`-parameter handler** (§I).

---

## F. Order Quantity Protection

Canonical pair: **`recommended_qty`** = system recommendation snapshot; **`order_qty`** = user-controlled order quantity.
- **On first line creation:** `order_qty = recommended_qty`.
- **After first creation:** the recommendation job must **not** overwrite `order_qty`; the manual **"Send Request"** flow continues to consume the user-confirmed quantity; retries must **not** create duplicate headers. **The current caller omits `request_allocation_draft_id`, so every "Send Request" mints a new `RAD-…` header** (`15_request_allocation_handlers.gs:76`; caller `request-order.js:1693`) — this **caller-omission cannot remain the scheduler's idempotency mechanism**; the scheduler must resolve the cycle's existing draft id first (§G).

---

## G. Cycle Idempotency

Deterministic cycle keys: **Shipping = `ISO_YEAR + ISO_WEEK + Scope`**; **Order = `YEAR + MONTH + Scope`**.
- **One active Draft header per cycle key + Scope.** A rerun must **locate the existing cycle before creating anything**.
- **Line identity must be deterministic or exactly resolvable** (e.g. stable natural key within the draft). Retry may **insert missing lines** or **repair incomplete system-owned fields** but must **preserve user-owned quantities** (`shipment_draft_qty` / `order_qty`).
- Concurrent executions must **not mint duplicate Draft IDs** (script lock, §B.1/§E.1).
- A **failed partial run remains failed/incomplete and is safely resumable**; **no empty-success response**.
- **REQUIRED DB DESIGN / NOT CREATED / NOT IMPLEMENTED:** neither Draft table today persists a reliable cycle key. Shipping headers lack `iso_year`/`iso_week`/`cycle_key` (§C). The request header has `planning_cycle` but **no code dedups by it**, and header creation is not idempotent (§F). **Do not pretend the `note` field is a reliable idempotency key.** A dedicated `cycle_key` (or unique index equivalent) is required per table.

---

## H. Source Readiness — three distinct states

1. **Import Readiness** — required source imports completed **successfully** for the applicable date/batch (each configured source has a successful `import_sync_runs` result; no blocking `import_sync_issues`).
2. **Analysis Readiness** — all required **calculated** inputs for the recommendation are present and current (Shared-FBM allocation, Days of Supply, Suggested Qty — `SUPPLY_PLANNING_CALCULATION_RULES.md`). *(Note: these are NOT produced by `runAmazonSnapshotImports` — §A — so Analysis Readiness is a distinct, currently-unbuilt step.)*
3. **Recommendation Readiness** — Import + Analysis readiness both pass **and** the cycle is eligible to run (not already completed for this cycle key, §G).

**Fail-closed rule:** stale / missing / partial / failed source or analysis → **no Draft creation**; the error must **identify the missing source or calculation**; manual retry is safe after correction.

**RUNTIME/DB MAPPING GAP:** use `import_sync_runs` / `import_sync_issues` only where their **actual schema supports** batch-level readiness. If they **cannot express a single Daily Pipeline batch identity** (one logical "today's pipeline succeeded" signal spanning all configured sources), flag it — a batch/run-group identifier is **RUNTIME MAPPING REQUIRED**. Do not assume a single outer return value implies batch success.

---

## I. Trigger Installation Boundary

Future **manual** trigger configuration (Apps Script console — operational deployment step, **not** part of this spec):
- `runAmazonSnapshotImports` — Daily, **12:00–13:00**. **Currently the ONLY safe/available entry point.**
- `runWeeklyShippingRecommendation` — Weekly Monday, **14:00–15:00**. **Do not create until the no-arg entry point exists and is manually tested.**
- `runMonthlyOrderRecommendation` — Monthly day 5, **15:00–16:00**. **Do not create until implemented + tested.**

Hard rules:
- **Never bind a trigger** to `handleUpsertRequestOrderAllocationDraft_(body)`, `handleUpsertRequestOrderAllocationDraftLines_(body)`, or `handleSubmitRequestOrderAllocationDrafts_(body)` — they require a `body` argument (a time trigger passes none).
- **Apps Script project timezone AND Spreadsheet timezone must both be Asia/Taipei.**
- No `ScriptApp.newTrigger(...).timeBased()` installer exists today (audited); installation remains manual/operational.

---

## J. Runtime Implementation Sequence (recommended future order)

1. **Phase 1** — Reconcile the 16:00 metadata (§11) and configure/test the **Daily 12:00–13:00** trigger on `runAmazonSnapshotImports`.
2. **Phase 2** — Implement the **Import + Analysis readiness** contract (§H), incl. a batch identity if `import_sync_runs` can't express one.
3. **Phase 3** — Implement shipping Draft **schema + accessors + writer** and the **calculation engine** (canonical `recommended_qty` / `planned_qty`; legacy alias `recommand_shipment_draft_qty`).
4. **Phase 4** — Implement `runWeeklyShippingRecommendation()` with cycle idempotency (§B/§G).
5. **Phase 5** — Implement the request-order **recommendation engine** and the **monthly orchestration layer** around the existing writers (§E.9).
6. **Phase 6** — Implement `runMonthlyOrderRecommendation()` with cycle idempotency (§E/§G).
7. **Phase 7** — Manual tests + failure/retry tests, **then** install the Weekly/Monthly triggers (§I).

---

## K. Status Classification (per behavior)

| Behavior | Classification | Evidence |
|---|---|---|
| `runAmazonSnapshotImports()` no-arg Daily entry | **EXISTING / VERIFIED** | `07_amazon_import_runner.gs:14` |
| Amazon snapshot writers + import logs | **EXISTING / VERIFIED** | `07/08/09_*.gs` |
| `runAmazonSnapshotImports` runs allocation/DoS/Suggested-Qty | **NOT the case (VERIFIED)** — do not claim | audit |
| `runWeeklyShippingRecommendation()` | **NOT IMPLEMENTED** | zero grep hits |
| Shipping calc engine / writer / getter / schema-in-code | **NOT IMPLEMENTED** | no HEADERS/ensure/writer |
| `shipping_allocation_drafts` headers (spec) | spec-only; cycle fields **REQUIRED DB DESIGN** | §C |
| `recommand_shipment_draft_qty` | **REQUIRED DB DESIGN** + **LEGACY NAMING** | §C/§D |
| `runMonthlyOrderRecommendation()` + monthly engine | **NOT IMPLEMENTED** | audit; `13_..:607` |
| Request-order Draft writers/getters/router/frontend | **EXISTING / VERIFIED** (manual, body-driven) | `15_*.gs`, `01_router.gs:170-179` |
| `recommended_qty` population | **PARTIALLY IMPLEMENTED** — column exists, always blank at runtime (passthrough) | `15_..:123`, `request-order.js:1703` |
| Cycle idempotency (both) | **NOT IMPLEMENTED** + **REQUIRED DB DESIGN** (cycle key) | §G |
| Source-readiness gate (3 states) | **NOT IMPLEMENTED**; batch identity **RUNTIME MAPPING REQUIRED** | §H |
| Time-trigger installer | **NOT IMPLEMENTED** (manual) | no `newTrigger` in `.gs` |
| `scheduleTime:'16:00'` as active schedule | **LEGACY / SUPERSEDED** (metadata, unconsumed) | `06_..:184`; §11 |
| Risk / notification | **FUTURE ADD-ON** | (out of scope) |

---

## Implementation Status

**NOT IMPLEMENTED.** This is a specification. No Runtime, Apps Script, frontend, trigger, DB column, sheet tab, or `project-current-state.md` is created or changed. Only `runAmazonSnapshotImports()` exists today; the two recommendation entry points, both calculation engines' recommendation output, cycle idempotency, and the source-readiness gate are future work per §J.

**No build. No redeploy. No migration. No trigger installation.**

**End of Document**
