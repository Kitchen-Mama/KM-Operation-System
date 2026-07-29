# Recommendation Runtime Implementation Spec — Daily Pipeline, Weekly Shipping & Monthly Order Recommendations

> **Owner Boundary (reviewed 2026-07-28).**
> - **Document Role:** Temporary **implementation contract** for the recommendation pipeline (Daily / Weekly Shipping / Monthly Order). NOT a permanent canonical owner.
> - **Classification:** Planning / Implementation.
> - **Lifecycle:** **Temporary** — once the pipeline is built and verified, this doc moves to History; the permanent rules live in its Canonical Owners.
> - **Canonical Owners (this doc restates none of them):** `SUPPLY_PLANNING_CALCULATION_RULES.md` (formulas) · `SYSTEM_RUNTIME_ARCHITECTURE.md` (cadence / service boundary) · `DATABASE_RELATIONSHIP_MAP.md` (schema) · `SUPPLY_CHAIN_SYSTEM_FLOW.md` (E2E flow).
> - **Canonical Owner For:** nothing permanent (implementation sequencing only).
> - **Not Owner For:** formulas, DB schema, Reserve Trigger, cadence — all deferred to the owners above.
> - **Status:** Reviewed — Batch B Blockers Remain.
> - **Current Version:** Draft v1.0 (unchanged).
> - **Last Reviewed:** 2026-07-28.
> - **Depends On:** the four Canonical Owners above.
> - **Blocked By:** Batch B (Reserve Trigger, cycle-key persistence design, Qualified Incoming allowlist) — see the consolidated Batch B Handoff.

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

> **Canonical schedule is owned by [`SYSTEM_RUNTIME_ARCHITECTURE.md`](./SYSTEM_RUNTIME_ARCHITECTURE.md) §7A** (Daily 12:00–13:00 · validation buffer 13:00–14:00 · Weekly Mon 14:00–15:00 · Monthly day-5 15:00–16:00, Asia/Taipei). This spec does **not** re-define the cadence — it references it and sequences the implementation work against it.

---

## A. Daily Report Pipeline

- **Entry point (Status: Source-Verified — Deployment/Runtime UNVERIFIED):** `runAmazonSnapshotImports()` — `assets/specs/active/apps-script/07_amazon_import_runner.gs:14`, a no-argument loop over `IMPORT_CONFIGS` → `runAmazonSnapshotImport_(cfg,'scheduler',{})`. Safe as a no-arg time-trigger entry point. (Source mirror only; not proof of deployment or a successful run.)
- **What it does (source-verified by audit — source mirror; Deployment/Runtime UNVERIFIED):** imports the four configured Amazon sources and writes `amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_weekly_sales_snapshot` (full rewrite), `amazon_daily_sales_snapshot` (**`rolling_upsert`** — `amazonUpsertRollingSnapshot_`, wired from the runner, 90-day gap-aware config; **Runtime verification PENDING, owner `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`**), plus append-only logs `import_sync_runs` and `import_sync_issues`.
- **What it does NOT do (verified by audit):** it does **not** run Shared-FBM allocation, Days of Supply, or Suggested-Qty recalculation; it does **not** call any Weekly/Monthly recommendation; it has **no** link to `shipping_allocation_drafts`. **Do not claim otherwise.**
- **Canonical trigger:** every day, Asia/Taipei, **12:00–13:00** window.
- **Legacy metadata:** `06_amazon_import_config.gs:184` `scheduleTime: '16:00'` is **LEGACY / SUPERSEDED as a schedule** — it is **config metadata never consumed by Runtime** (only `scheduleTimezone` is read, for BQ date math/pruning). The operative daily trigger is the manually-installed 12:00–13:00 trigger on `runAmazonSnapshotImports`. See §J (Phase 1) for the reconciliation sequence. **Do NOT prescribe a second duplicate same-day Daily Sales import.**
- **Auditable result:** each configured source must produce an auditable `import_sync_runs` row. A job is **not** source-ready merely because the outer function returned; **required configured sources must be individually successful for the applicable business date/batch**, and a partial source failure must remain visible and **block** dependent recommendation generation (§H).
- **Three separate readiness concepts (do not conflate):** (1) imported-source readiness; (2) Analysis-calculation readiness; (3) recommendation readiness (§H).

---

## B. Weekly Shipping Scheduler Contract — `runWeeklyShippingRecommendation()` *(Status: Not Started)*

> **Status: Not Started** (audited: zero occurrences repo-wide). Specified here as a future no-argument entry point. Do not claim it exists; do not install a Weekly trigger until it exists and is manually tested (§I).

- **Schedule:** owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A (this spec restates no times).
- **Required responsibilities (in order):**
  1. Acquire a **script lock / concurrency guard** (`LockService` or equivalent); abort safely if another run holds it.
  2. Resolve the current recommendation cycle + Scope (cycle-grouping cadence owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A).
  3. Verify **Daily Source Readiness** (§H.1).
  4. Verify **Analysis Readiness** (§H.2) — required calculated inputs present/current.
  5. Build recommendations using the **canonical Supply Planning formulas** (`SUPPLY_PLANNING_CALCULATION_RULES.md` §20/§23/§24) — this spec adds no formula.
  6. Create **or resume** exactly **one** Shipping Recommendation Draft per cycle + Scope. The persisted **cycle / unique key mechanism is Blocked — B-7** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11); this spec proposes no key column or unique index.
  7. Persist recommendation **headers and lines** (§C).
  8. Initialize the **user quantity only when a new line is first created** (§D).
  9. **Never overwrite existing user edits** on retry/rerun.
  10. Return a **structured summary**: `{ success, skipped, resumed, failed, issues }` counts.
  11. **Never report success after partial persistence failure** — fail closed and resumable (§G).

---

## C. Shipping Draft Schema — reference only (this spec defines NO schema)

The `shipping_allocation_drafts` / `shipping_allocation_draft_lines` schema (header columns, line columns, uniqueness, "MUST NOT store" derived fields, and canonical vs legacy quantity names) is **owned by [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) §3.6** and mirrored in **[`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §7.5**. This spec **does not reproduce or amend that schema** — it only consumes it.

- **Work item (this spec):** wire a writer/accessor for that schema. **Status: table + body-driven writer exist (`16_shipping_allocation_handlers.gs`); the recommendation-generating calc engine + no-arg scheduler do NOT (§B/§K).**
- **Quantity names:** canonical = `recommended_qty` (system) + `planned_qty` (user); `recommand_shipment_draft_qty` / `shipment_draft_qty` / `qty` are **legacy read/migration aliases only** — full definition in the schema owner. This spec introduces no new column.

---

## D. Shipping Quantity Protection

The quantity **column names** (system `recommended_qty` vs user `planned_qty`, and their legacy aliases) are **owned by the schema owner** `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6 (mirrored in `DATABASE_RELATIONSHIP_MAP.md` §7.5) — this spec restates no schema. It specifies only the **protection behaviour** between the system snapshot and the user quantity:
- **On first line creation:** user quantity = system recommendation.
- **After first creation:** users may update `planned_qty` and add/delete lines per the Draft workflow; **scheduler retries must not reset `planned_qty`**; the **Daily pipeline must not modify either committed Draft field** (`recommended_qty` or `planned_qty`); a **weekly rerun for the same cycle resumes/idempotently repairs the same batch** (§G) and must **not** create a second active batch or silently refresh recommendations over user edits. A deliberate **Regenerate** action follows the `draft_version` rule and preserves auditability.

---

## E. Monthly Order Scheduler Contract — `runMonthlyOrderRecommendation()` *(Status: Not Started)*

> **Status: Not Started** (audited). The monthly **calculation engine** is also Not Started (`recommended_qty` is passthrough-blank; `13_procurement_handlers.gs:607` `recommended_qty: '', // Calculation Engine not implemented`). Specified here as a future no-arg entry point.

- **Schedule:** owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A (this spec restates no times).
- **Required responsibilities (in order):**
  1. Acquire concurrency guard.
  2. Resolve the current monthly recommendation cycle + Scope (cycle-grouping cadence owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A).
  3. Validate **Daily Source + Analysis readiness** (§H).
  4. Run the **canonical order recommendation calculation** (`SUPPLY_PLANNING_CALCULATION_RULES.md`; engine to be built — no formula added here).
  5. Create **or resume** exactly **one** request allocation Draft per cycle + Scope. The persisted **cycle / unique key mechanism is Blocked — B-7** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11); this spec proposes no key column or unique index.
  6. Populate **`recommended_qty`**.
  7. Initialize **`order_qty` only on first line creation** (§F).
  8. **Never overwrite user-modified `order_qty`** on retry.
  9. **Reuse the existing body-driven request-allocation writers where safe** (`handleUpsertRequestOrderAllocationDraft_` / `handleUpsertRequestOrderAllocationDraftLines_` / `handleSubmitRequestOrderAllocationDrafts_`, `15_request_allocation_handlers.gs`) **via a new scheduler-safe orchestration layer** — the no-arg runner assembles the payload (with a resolved `request_allocation_draft_id` for idempotency, §G/§F) and calls the writers. **Orchestration layer status: Not Started.**
  10. **Never attach a trigger directly to a `body`-parameter handler** (§I).

---

## F. Order Quantity Protection

Canonical pair: **`recommended_qty`** = system recommendation snapshot; **`order_qty`** = user-controlled order quantity.
- **On first line creation:** `order_qty = recommended_qty`.
- **After first creation:** the recommendation job must **not** overwrite `order_qty`; the manual **"Send Request"** flow continues to consume the user-confirmed quantity; retries must **not** create duplicate headers. **The current caller omits `request_allocation_draft_id`, so every "Send Request" mints a new `RAD-…` header** (`15_request_allocation_handlers.gs:76`; caller `request-order.js:1693`) — this **caller-omission cannot remain the scheduler's idempotency mechanism**; the scheduler must resolve the cycle's existing draft id first (§G).

---

## G. Cycle Idempotency

**Status: Blocked — B-7 Recommendation Cycle／Unique Key** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11). The recommendation **cadence** (when the weekly/monthly job runs) is owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A; the **persisted cycle / unique key mechanism is not decided** and this spec proposes none (no dedicated column, no composite key, no unique index).

Idempotency work items (to implement once B-7 is decided):
- **One active Draft header per recommendation cycle + Scope.** A rerun must **locate the existing cycle before creating anything**.
- **Line identity must be deterministic or exactly resolvable** within the draft. Retry may **insert missing lines** or **repair incomplete system-owned fields** but must **preserve user-owned quantities** (`planned_qty` / `order_qty`; `shipment_draft_qty` is a legacy read/migration alias for `planned_qty`, never the canonical column — owner defines the names).
- Concurrent executions must **not mint duplicate Draft IDs** (script lock, §B.1/§E.1).
- A **failed partial run remains failed/incomplete and is safely resumable**; **no empty-success response**.
- **Current gap (verified):** neither Draft table persists a reliable cycle key today; the request header's `planning_cycle` is **not** dedup'd by any code, so header creation is not idempotent (§F). The `note` field is **not** a reliable idempotency key.

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

1. **Phase 1** — Reconcile the 16:00 metadata (§A Legacy metadata) and configure/test the **Daily 12:00–13:00** trigger on `runAmazonSnapshotImports`.
2. **Phase 2** — Implement the **Import + Analysis readiness** contract (§H), incl. a batch identity if `import_sync_runs` can't express one.
3. **Phase 3** — Implement shipping Draft **schema + accessors + writer** and the **calculation engine** (canonical `recommended_qty` / `planned_qty`; legacy alias `recommand_shipment_draft_qty`).
4. **Phase 4** — Implement `runWeeklyShippingRecommendation()` with cycle idempotency (§B/§G).
5. **Phase 5** — Implement the request-order **recommendation engine** and the **monthly orchestration layer** around the existing writers (§E.9).
6. **Phase 6** — Implement `runMonthlyOrderRecommendation()` with cycle idempotency (§E/§G).
7. **Phase 7** — Manual tests + failure/retry tests, **then** install the Weekly/Monthly triggers (§I).

---

## K. Work-item Status (four allowed states only)

Each row uses exactly one of: **Source-Verified** (the code path exists and is wired in the Apps Script **source mirror** — Code evidence only; **Apps Script Deployment and Runtime execution are UNVERIFIED in this environment**. Source existence does not prove deployment or runtime behavior; this specification separately classifies source evidence, deployment evidence, and runtime evidence) · **In Progress** · **Not Started** · **Blocked** (awaits a Batch B decision). A function name is **never** treated as implementation proof, and no item is marked runtime-complete without deployment + runtime evidence (unavailable here).

| Work item | Status | Evidence |
|---|---|---|
| `runAmazonSnapshotImports()` no-arg Daily entry | **Source-Verified** (Deployment/Runtime UNVERIFIED) | `07_amazon_import_runner.gs:14` |
| Amazon snapshot writers + import logs (incl. Daily Sales `rolling_upsert`) | **Source-Verified** (Deployment/Runtime UNVERIFIED — owner `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`) | `07/08/09_*.gs` |
| Request-order Draft body-driven writers/getters/router/frontend | **Source-Verified** (Deployment/Runtime UNVERIFIED) | `15_*.gs`, `01_router.gs:170-179` |
| `runAmazonSnapshotImports` running allocation/DoS/Suggested-Qty | **Not Started** (verified absent — do not claim) | audit |
| `recommended_qty` population by an engine | **In Progress** — column exists, blank at runtime (passthrough); engine not built | `15_..:123`, `request-order.js:1703` |
| `runWeeklyShippingRecommendation()` | **Not Started** | zero grep hits |
| Shipping calc engine / writer / getter / schema-in-code | **Not Started** | no HEADERS/ensure/writer |
| `runMonthlyOrderRecommendation()` + monthly engine | **Not Started** | audit; `13_..:607` |
| Time-trigger installer | **Not Started** (manual op only) | no `newTrigger` in `.gs` |
| Cycle idempotency (both) — persist the cycle key (definition owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A) | **Blocked** | §G |
| Source-readiness gate (3 states) — batch-identity persistence | **Blocked** | §H |
| Reserve Trigger dependency (does any recommendation step reserve stock?) | **Blocked** — Batch B (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-1) | §D |

*(Schema, schedule, cycle-key definition, and the quantity-name contract are owned elsewhere and only referenced here — see §C / §A / §G. `recommand_shipment_draft_qty` is a legacy alias defined by the schema owner, not a work item.)*

---

## Implementation Status

This is an implementation **work tracker / handoff spec** — no Runtime, Apps Script, frontend, trigger, DB column, sheet tab, or `project-current-state.md` is created or changed. Per §K: `runAmazonSnapshotImports()` and the Amazon writers + the request-order body-driven writers are **Source-Verified** (source mirror only; **Apps Script Deployment/Runtime UNVERIFIED**); the two recommendation scheduler entry points and both recommendation engines are **Not Started**; cycle idempotency, the source-readiness gate, and the reserve dependency are **Blocked**.

**No build. No redeploy. No migration. No trigger installation.**

**End of Document**
