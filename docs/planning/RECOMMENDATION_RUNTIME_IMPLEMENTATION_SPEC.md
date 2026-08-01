# Recommendation Runtime Implementation Spec — Daily Pipeline, Weekly Shipping & Monthly Order Recommendations

> **Owner Boundary (reviewed 2026-07-28).**
> - **Document Role:** Temporary **implementation contract** for the recommendation pipeline (Daily / Weekly Shipping / Monthly Order). NOT a permanent canonical owner.
> - **Classification:** Planning / Implementation.
> - **Lifecycle:** **Temporary** — once the pipeline is built and verified, this doc moves to History; the permanent rules live in its Canonical Owners.
> - **Canonical Owners (this doc restates none of them):** `SUPPLY_PLANNING_CALCULATION_RULES.md` (formulas) · `SYSTEM_RUNTIME_ARCHITECTURE.md` (cadence / service boundary) · `DATABASE_RELATIONSHIP_MAP.md` (schema) · `SUPPLY_CHAIN_SYSTEM_FLOW.md` (E2E flow).
> - **Canonical Owner For:** nothing permanent (implementation sequencing only).
> - **Not Owner For:** formulas, DB schema, Reserve Trigger (B-1 owner = `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1), cadence — all deferred to the owners above.
> - **Status:** Reviewed — B-1 / B-2 / B-3 RESOLVED (decision only); **B-4 CONTRACT RESOLVED — RUNTIME NOT IMPLEMENTED** (Runtime prerequisites open — see the B-4 Minimal Runtime Plan §B4-Plan below); B-5 / B-6 / B-7 / B-8 UNRESOLVED.
> - **Current Version:** Draft v1.1 (Round 4D-C: added the External-Origin-Aware Implementation Order + the Daily-Import / external-sync / scheduler no-auto-admit guards. B4-R1–B4-R5 are now implemented and test-verified at source / pure-module level, including the B4-R4.1 downstream-projection contract repair and the B4-R5 external incoming authority fail-closed adapter; Apps Script deployment / live Runtime / external ingestion / review actions UNVERIFIED; B4-R6–B4-R8 not implemented). Draft v1.0 (Batch B Round 1 registry sync — B-1 resolved).
> - **Last Reviewed:** 2026-07-30.
> - **Depends On:** the four Canonical Owners above.
> - **Blocked By:** Batch B — **B-4 Runtime implementation prerequisites** (described in §B4-Plan) · **B-7** persisted recommendation-cycle / unique-key design · B-5 / B-6 / B-8 where applicable. **B-1 / B-2 / B-3 are RESOLVED (decision only); the B-4 contract is RESOLVED and B-4 Runtime implementation is IN PROGRESS (B4-R1 + B4-R2 SOURCE IMPLEMENTED — TEST VERIFIED at source level; B4-R3 PURE MODULE IMPLEMENTED — UNIT TEST VERIFIED; B4-R4 PURE ADAPTER IMPLEMENTED — UNIT / INTEGRATION-FIXTURE / DOWNSTREAM-PROJECTION-CONTRACT VERIFIED; B4-R5 PURE EXTERNAL-AUTHORITY ADAPTER IMPLEMENTED — UNIT / CROSS-ADAPTER-FIXTURE VERIFIED; Apps Script deployment / live runtime / integration / external ingestion / review actions UNVERIFIED); there is no "next open decision = B-2". The current authorized implementation task is B4-R6 (§B4-Plan).**

**Status:** 🟡 Draft v1.1 — **SPECIFICATION ONLY.** No Runtime, Apps Script, frontend, trigger, DB column, or sheet tab is created here. Function-level runtime status below was **verified by read-only audit** (2026-07-20).
**Last Updated:** 2026-08-01 (Round 4D-C — external-origin-aware implementation order; content-additive, nothing implemented)
**Maintained By:** Development Team
**Related / Authority chain:**
- [`SYSTEM_RUNTIME_ARCHITECTURE.md`](./SYSTEM_RUNTIME_ARCHITECTURE.md) §7A — canonical cadence (this spec is its implementation contract).
- [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) §20/§23/§24 — the recommendation **calculation** authority (this spec does not restate formulas).
- [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md), [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) §3.6/§3.7 — Draft tables.
- [`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`](./AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md) — Daily Amazon import.
- [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) — schema authority.

> **Scope.** Implementation-ready Runtime contract for the recommendation pipeline: the existing Daily entry point, two **future** no-arg scheduler entry points, source-readiness, cycle idempotency, recommendation-vs-user-quantity protection, Draft persistence, and future trigger installation. **No formulas are redefined** (owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`).

> **Canonical cadence is owned by [`SYSTEM_RUNTIME_ARCHITECTURE.md`](./SYSTEM_RUNTIME_ARCHITECTURE.md) §7A** (Daily · validation buffer · Weekly · Monthly windows, Asia/Taipei — the exact times are defined there). This spec does **not** re-define or restate the cadence times — it references the §7A owner and sequences the implementation work against it.

---

## A. Daily Report Pipeline

- **Entry point (Current Status: In Progress — Source Code Present: Verified; Deployment/Runtime UNVERIFIED):** `runAmazonSnapshotImports()` — `assets/specs/active/apps-script/07_amazon_import_runner.gs:14`, a no-argument loop over `IMPORT_CONFIGS` → `runAmazonSnapshotImport_(cfg,'scheduler',{})`. Safe as a no-arg time-trigger entry point. (Source mirror only; not proof of deployment or a successful run.)
- **What it does (source-verified by audit — source mirror; Deployment/Runtime UNVERIFIED):** imports the four configured Amazon sources and writes `amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_weekly_sales_snapshot` (full rewrite), `amazon_daily_sales_snapshot` (**`rolling_upsert`** — `amazonUpsertRollingSnapshot_`, wired from the runner, 90-day gap-aware config; **Runtime verification PENDING, owner `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`**), plus append-only logs `import_sync_runs` and `import_sync_issues`.
- **What it does NOT do (verified by audit):** it does **not** run Shared-FBM allocation, Days of Supply, or Suggested-Qty recalculation; it does **not** call any Weekly/Monthly recommendation; it has **no** link to `shipping_allocation_drafts`. **Do not claim otherwise.**
- **Canonical target cadence:** owned by [`SYSTEM_RUNTIME_ARCHITECTURE.md`](./SYSTEM_RUNTIME_ARCHITECTURE.md) §7A (this spec restates no times). **Whether the trigger is currently installed and running remains Deployment/Runtime UNVERIFIED.**
- **Legacy metadata:** `06_amazon_import_config.gs:184` `scheduleTime: '16:00'` is **LEGACY / SUPERSEDED / not consumed by Runtime** (only `scheduleTimezone` is read, for BQ date math/pruning) — it is **not** the current cadence and must not be presented as one. The daily trigger on `runAmazonSnapshotImports` targets the §7A cadence; whether it is installed and running is **Deployment/Runtime UNVERIFIED**. See §J (Phase 1) for the reconciliation sequence. **Do NOT prescribe a second duplicate same-day Daily Sales import.**
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

- **Work items (this spec) — split (see §K):** (1) the **existing body-driven persistence handler** (`16_shipping_allocation_handlers.gs`: `handleUpsertShippingAllocationDraft_` / `…DraftLines_` / `handleSubmitShippingAllocationDrafts_` + `SHIPPING_ALLOCATION_DRAFTS_HEADERS_` / `procurementEnsureSheet_`) is **In Progress — Source Code Present: Verified; Deployment/Runtime UNVERIFIED**; (2) the **recommendation calculation engine**, (3) the **scheduler-safe accessor / orchestration**, and (4) the **no-arg weekly scheduler** are **Not Started**. This spec wires an accessor around the existing handler; it introduces **no schema**.
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
- `runAmazonSnapshotImports` — Daily, at the **§7A cadence** (`SYSTEM_RUNTIME_ARCHITECTURE.md` §7A; no times restated here). Currently the only **no-arg** entry point safe to attach; whether a trigger is installed and running is **Deployment/Runtime UNVERIFIED**.
- `runWeeklyShippingRecommendation` — Weekly, at the **§7A cadence**. **Do not create until the no-arg entry point exists and is manually tested.**
- `runMonthlyOrderRecommendation` — Monthly, at the **§7A cadence**. **Do not create until implemented + tested.**

Hard rules:
- **Never bind a trigger** to `handleUpsertRequestOrderAllocationDraft_(body)`, `handleUpsertRequestOrderAllocationDraftLines_(body)`, or `handleSubmitRequestOrderAllocationDrafts_(body)` — they require a `body` argument (a time trigger passes none).
- **Apps Script project timezone AND Spreadsheet timezone must both be Asia/Taipei.**
- No `ScriptApp.newTrigger(...).timeBased()` installer exists today (audited); installation remains a **manual / operational** step. **No automatic trigger installer is planned by this spec.**

---

## J. Runtime Implementation Sequence (recommended future order)

1. **Phase 1** — Reconcile the legacy `16:00` metadata (§A Legacy metadata) and configure/test the **Daily** trigger on `runAmazonSnapshotImports` at the **§7A cadence** (times owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A).
2. **Phase 2** — Implement the **Import + Analysis readiness** contract (§H), incl. a batch identity if `import_sync_runs` can't express one.
3. **Phase 3** — **Reuse or safely extend the existing shipping persistence path** (`16_shipping_allocation_handlers.gs` body-driven upsert/lines/submit; schema owned by `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6 / `DATABASE_RELATIONSHIP_MAP.md` §7.5). Implement **only the missing** recommendation **calculation engine** and **scheduler-safe accessors / orchestration** (canonical `recommended_qty` / `planned_qty`; legacy alias `recommand_shipment_draft_qty`). **This spec creates/modifies no schema.**
4. **Phase 4** — Implement `runWeeklyShippingRecommendation()` with cycle idempotency (§B/§G).
5. **Phase 5** — Implement the request-order **recommendation engine** and the **monthly orchestration layer** around the existing writers (§E.9).
6. **Phase 6** — Implement `runMonthlyOrderRecommendation()` with cycle idempotency (§E/§G).
7. **Phase 7** — Manual tests + failure/retry tests, **then** install the Weekly/Monthly triggers (§I).

---

## K. Work-item Status (Current Status ∈ {Not Started · In Progress · Verified Complete · Blocked})

Each row's **Current Status** uses exactly one of the four canonical values: **Not Started · In Progress · Verified Complete · Blocked** (Blocked = awaits a Batch B decision). Source-code existence is recorded as a **separate evidence annotation** (`Source Code Present: Verified`), **never as a Current Status value**: a work item whose code path exists and is wired in the Apps Script **source mirror** — but whose **Apps Script Deployment and Runtime execution are UNVERIFIED in this environment** — is **In Progress**, not "Verified Complete". A function name is **never** treated as implementation proof; **no item is Verified Complete without Code + DB + Runtime + Test evidence** (unavailable here). Source evidence, deployment evidence, and runtime evidence are classified separately.

| Work item | Status | Evidence |
|---|---|---|
| `runAmazonSnapshotImports()` no-arg Daily entry | **In Progress** — Source Code Present: Verified; Deployment/Runtime UNVERIFIED | `07_amazon_import_runner.gs:14` |
| Amazon snapshot writers + import logs (incl. Daily Sales `rolling_upsert`) | **In Progress** — Source Code Present: Verified; Deployment/Runtime UNVERIFIED (owner `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`) | `07/08/09_*.gs` |
| Request-order Draft body-driven writers/getters/router/frontend | **In Progress** — Source Code Present: Verified; Deployment/Runtime UNVERIFIED | `15_*.gs`, `01_router.gs:170-179` |
| `runAmazonSnapshotImports` running allocation/DoS/Suggested-Qty | **Not Started** (verified absent — do not claim) | audit |
| `recommended_qty` population by a recommendation engine | **Not Started** | canonical column / passthrough path exists (`15_..:123`, `request-order.js:1703`), but **no recommendation engine populates it** — column existence ≠ engine started |
| `runWeeklyShippingRecommendation()` | **Not Started** | zero grep hits |
| Shipping Draft persistence handler — body-driven upsert/lines/submit + HEADERS + ensure-sheet | **In Progress** — Source Code Present: Verified; Deployment/Runtime UNVERIFIED | `16_shipping_allocation_handlers.gs` (`handleUpsertShippingAllocationDraft_`:115 / `…DraftLines_`:199 / `handleSubmitShippingAllocationDrafts_`:278) |
| Shipping **recommendation calculation engine** | **Not Started** | audit — no calc engine populates `recommended_qty` |
| Shipping **scheduler-safe accessor / orchestration** (wrapping the existing handler for the no-arg weekly job) | **Not Started** | audit — no scheduler-safe wrapper exists |
| `runMonthlyOrderRecommendation()` + monthly engine | **Not Started** | audit; `13_..:607` |
| Manual trigger configuration and runtime verification | **Not Started** | no verified installation/runtime evidence (`newTrigger` absent in `.gs`, audited). **No automatic trigger installer is planned by this spec.** |
| Cycle idempotency (both) — **persisted recommendation cycle / unique-key mechanism** | **Blocked** — B-7 (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11); undecided. *(Recommendation **cadence** is owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A — a separate concern from the persisted key.)* | §G |
| Source-readiness gate (3 states) — batch-identity persistence | **Not Started** | **Runtime/DB Mapping Required**; whether the existing `import_sync_runs` / `import_sync_issues` logs can express a single Daily-Pipeline batch identity remains **UNVERIFIED**. No Batch B decision ID governs this — it is **not** a Blocker (§H) |
| Reserve Trigger dependency (does any recommendation step reserve stock?) | **B-1 RESOLVED (decision only)** — **No recommendation step reserves.** Reserve happens only at the **Formal Shipment Execution Commit** (owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1), which is not part of this pipeline. **B-1 Implementation = Not Started; Runtime Verification = Not Verified.** | owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1; registry `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-1. *(§D specifies quantity protection, not the Reserve Trigger.)* |

*(Schema, schedule, cycle-key definition, and the quantity-name contract are owned elsewhere and only referenced here — see §C / §A / §G. `recommand_shipment_draft_qty` is a legacy alias defined by the schema owner, not a work item.)*

---

## Implementation Status

This is an implementation **work tracker / handoff spec** — no Runtime, Apps Script, frontend, trigger, DB column, sheet tab, or `project-current-state.md` is created or changed. Per §K: `runAmazonSnapshotImports()` and the Amazon writers + the request-order body-driven writers + the **shipping-draft body-driven persistence handler** (`16_shipping_allocation_handlers.gs`) are **In Progress** (Source Code Present: Verified — source mirror only; **Apps Script Deployment/Runtime UNVERIFIED**); the two recommendation scheduler entry points, both recommendation **calculation engines**, the scheduler-safe orchestration, `recommended_qty` engine population, the **source-readiness gate** (Runtime/DB mapping required — **not** a Batch B blocker), and manual trigger configuration/verification are **Not Started**; the **persisted cycle/unique-key mechanism** (B-7) remains **Blocked**. The **Reserve Trigger dependency** (B-1) is **RESOLVED (decision only)** — no recommendation step reserves; reserve happens only at the Formal Shipment Execution Commit (owner §8A.1), with B-1 **Implementation Not Started / Runtime Not Verified**.

**No build. No redeploy. No migration. No trigger installation.**

---

## External-Origin-Aware Implementation Order (CANONICAL 2026-08-01 Round 4D-C — implementation tracker; B4-R1–B4-R5 implemented + test-verified at source/pure-module level, B4-R6–B4-R8 not implemented, no deployment / live Runtime / external ingestion / review actions verified)

Temporary implementation sequence for B-4 Runtime (owner references §A–§K; `SUPPLY_CHAIN_SYSTEM_FLOW.md` §12; `SUPPLY_PLANNING_CALCULATION_RULES.md` §38). **No Runtime, Apps Script, DB, trigger, or scheduler is created by this spec.**

1. canonical `shipment_qty` reader repair
2. `destination_warehouse_id` planning read / backfill
3. normalized supply candidate DTO
4. KM Shipment Incoming Adapter
5. external record identity adapter
6. external authority classifier
7. quarantine state
8. exception / review read model
9. notification event contract
10. Link / Adopt / Reject / Ignore domain actions
11. planning admission resolver
12. lineage resolver
13. ownership resolver
14. deduplication
15. ten-gate Qualified Incoming
16. Required-By comparison
17. Line Runtime integration
18. Golden #12 / #13 / #14
19. new external-quarantine scenarios
20. remaining ledger / allocation scenarios
21. Recommendation Writer
22. B-7 cycle key
23. scheduler
24. retry / lock / failure recovery
25. production verification

**Explicit guards:** Daily Import does **not** automatically approve external records; external sync does **not** automatically admit planning supply; the scheduler must **not** count review-pending external records.

---

## §B4-Plan. B-4 Minimal Runtime Implementation Plan (CANONICAL 2026-08-01 Round 4D-D — planning only; NO Runtime; version retained Draft v1.1)

Refines the External-Origin-Aware Implementation Order (above) into the **smallest dependency-ordered, independently-testable batches** that can truthfully execute Golden #12 / #13 / #14. **B4-R1–B4-R5 are implemented and test-verified at source / pure-module level (Apps Script deployment / live Runtime / external ingestion / review actions UNVERIFIED); B4-R6–B4-R8 are not implemented.** Main is the sole canonical repository. No schema migration, no scheduler, no receiving, no external API, no notification, no ledger.

**Minimal target (must):** read canonical KM Shipment rows + canonical `shipment_lines.shipment_qty` → resolve destination identity → normalize deterministic supply candidates → B-4 authority / admission classification (exclude external-unlinked / quarantined, fail-closed) → per-table status allowlist → resolve ETA + Required-By → remaining qty → stable-lineage dedup → §2E ten-gate → qualified qty + excluded / late / review breakdown → one Line Runtime fixture path (feed the existing `calculateGap` `timelyQualifiedIncoming` input). Persistence / Scheduler / Receiving / external API deferred.

**Schema boundary:** (A) sufficient now — `shipments.status` / `shipments.eta`, `shipment_lines.shipment_qty`, company / country / marketplace / sku; (B) writer/read alignment only (no new column) — `shipments.destination_warehouse_id` (accepted + mirrored, `12_shipment_handlers.gs:499/709`; legacy-row backfill = data, not schema); (C) future migration — none required for #12/#13/#14; (D) not needed — Supply Ledger / review / notification / receiving tables; (E) B-5 / B-8 — `request_order_line_sources` grain, cancellation-release. **No schema landed this round.**

| Batch | Purpose | Expected files | Kind | Dependency class | Status after |
|---|---|---|---|---|---|
| **B4-R1** | Canonical Shipment source repair — read `shipment_lines.shipment_qty` primary, legacy `qty` explicit fallback | `13_procurement_handlers.gs` (`procurementOnTheWayMaps_`) + source test | I/O (source) | SOURCE EXISTS — REPAIR REQUIRED | **SOURCE IMPLEMENTED — TEST VERIFIED** (2026-08-01; `assets/tests/procurement-shipment-qty-source.test.js`, 23 assertions) — Apps Script deployment / live runtime **UNVERIFIED** |
| **B4-R2** | Destination identity planning-read — `destination_warehouse_id` → compat `warehouse_id` fallback; missing → review/block | shipment reader + test | I/O (source) | SOURCE EXISTS — EXTEND REQUIRED (no new column) | **SOURCE IMPLEMENTED — TEST VERIFIED** (2026-08-01; `assets/tests/shipment-destination-identity-source.test.js`, 25 assertions) — Apps Script deployment / live runtime **UNVERIFIED** |
| **B4-R3** | Normalized supply candidate pure DTO — deterministic builder (authority type, source key, lineage key, status/qty/ETA); no persistence | new pure module + unit | pure | NEW PURE MODULE REQUIRED | **PURE MODULE IMPLEMENTED — UNIT TEST VERIFIED** (2026-08-01; `assets/js/core/supply-planning-supply-candidates.js` + `assets/tests/supply-planning-supply-candidates.test.js`, 54 assertions) — Runtime adapter / Apps Script integration **UNVERIFIED** |
| **B4-R4** | KM Shipment Incoming Adapter — status allowlist, remaining qty, ETA, company/SKU/destination scope, exclusion reasons + downstream source-metadata projection | adapter module + fixtures | adapter | NEW ADAPTER REQUIRED | **PURE ADAPTER IMPLEMENTED — UNIT / INTEGRATION FIXTURE / DOWNSTREAM PROJECTION CONTRACT VERIFIED** (2026-08-01; `assets/js/core/supply-planning-incoming-adapters.js` + `assets/tests/supply-planning-incoming-adapters.test.js`, 80 assertions incl. B4-R4.1 downstream-projection repair) — Apps Script / Line Runtime integration **UNVERIFIED** |
| **B4-R5** | External authority fail-closed adapter — linked evidence = 0 separately; unlinked/quarantined = 0; pure admission classification (no notification/review) | adapter module + fixtures | adapter | NEW ADAPTER REQUIRED | **PURE EXTERNAL-AUTHORITY ADAPTER IMPLEMENTED — UNIT / CROSS-ADAPTER FIXTURE VERIFIED** (2026-08-01; `assets/js/core/supply-planning-external-incoming-adapters.js` + `assets/tests/supply-planning-external-incoming-adapters.test.js`, 82 assertions) — external ingestion / review actions / Apps Script / Line Runtime integration **UNVERIFIED** |
| **B4-R6** | Dedup + ten-gate Qualified Incoming engine — stable-key dedup, ownership precedence, Required-By, late/missing-ETA breakdown; no ledger | pure engine + unit | pure | NEW PURE MODULE REQUIRED | qualified-incoming engine |
| **B4-R7** | Minimal Line Runtime integration — assemble one SKU/company/destination/window; feed Incoming → `calculateGap.timelyQualifiedIncoming`; no scheduler/writer/persistence | integration glue + fixture | orchestration (minimal) | NEW ORCHESTRATION REQUIRED | one line path |
| **B4-R8** | Golden #12 / #13 / #14 promotion — executable fixtures; Matrix promotion only after all Runtime assertions pass | golden test file | test | EXTEND (tests) | #12/#13/#14 executed |

**Merge/split:** R1 and R2 are both small source read-alignments and MAY merge if kept independently testable; R3 → R4 → R5 → R6 stay separate (distinct pure/adapter contracts); R7 and R8 stay separate (integration vs promotion). Do not merge any batch that would couple a source repair with an admission decision.

**Gates (each batch):** syntax / import-export · unit assertions · adapter / lineage / dedup fixtures · no input mutation · no source write · no recommendation persistence · no external automatic admission · no schema drift · **Unit 325 / Golden 117 / Matrix 25-15-0 preserved until B4-R8**; post-B4-R8 Matrix + assertion counts are determined by the actual added tests, never invented in advance.

**First implementation task = B4-R1** (source evidence confirmed: `procurementOnTheWayMaps_` reads legacy `qty` at `13_:432/438`; `shipment_qty` already exists / written / read-with-fallback in `12_:58/534/612`). Small, no product decision, no schema migration, independently testable, does not imply a complete Qualified Incoming Runtime, lands in Main. **B4-R1 executed 2026-08-01 — SOURCE IMPLEMENTED — TEST VERIFIED** (`procurementOnTheWayMaps_` now reads `shipment_qty` primary via the pure `procShipmentLineQty_` helper, legacy `qty` read-compat only; canonical 0 never falls back; canonical/legacy never summed; read-only; status filter / aggregation keys / return shape unchanged). **Apps Script deployment / live runtime UNVERIFIED.** **B4-R2 executed 2026-08-01 — SOURCE IMPLEMENTED — TEST VERIFIED** (`shipment-destination-identity-source.test.js`, 25 assertions): `destination_warehouse_id` primary, legacy `warehouse_id` read-compat fallback, missing destination explicit (`__MISSING_DEST__`), additive `byDest` destination-scoped feed for B4-R3 (does not alter `exact` / `bySku` or totals; `warehouse_code` / display text / origin `source_warehouse_id` never used as identity). **B4-R3 executed 2026-08-01 — PURE MODULE IMPLEMENTED — UNIT TEST VERIFIED** (`assets/js/core/supply-planning-supply-candidates.js`, `buildKmShipmentSupplyCandidate`, 54 assertions): deterministic `shipment:<id>:<lineId>` identity + lineage, B4-R1 quantity + B4-R2 destination precedence reproduced purely, `KM_CANONICAL` / `KM_SHIPMENT_LINE` in `KM_3PL_OVERSEAS`, source-completeness review flags, pure / immutable / clock-free / DB-free (no status allowlist, no Qualified Incoming, no ETA/Required-By, no dedup, no calculateGap, no persistence; physical lineage from the Shipment-line key, never from aggregate `bySku`/`byDest`). **B4-R4 executed 2026-08-01 — PURE ADAPTER IMPLEMENTED — UNIT / INTEGRATION-FIXTURE / DOWNSTREAM-PROJECTION-CONTRACT VERIFIED** (`assets/js/core/supply-planning-incoming-adapters.js`, `adaptKmShipmentIncomingCandidate`, 80 assertions): canonical Shipment Incoming allowlist (`ready_to_ship` / `shipped` / `in_transit` / `arrived`), scope match (company / SKU / destination + optional country / marketplace), positive `quantityRemaining`, destination + ETA presence, deterministic exclusion/review reasons, fail-closed authority/source/domain; **source-level only — NOT final Qualified Incoming** (no Required-By / ETA-late, no dedup, no ownership precedence, no calculateGap, no persistence). **B4-R4.1 executed 2026-08-01 — DOWNSTREAM PROJECTION CONTRACT REPAIR**: the returned `candidate` snapshot now preserves the normalized B4-R3 source metadata later B4-R6 processing needs — actual `eta` value (preserved verbatim, never parsed; `etaPresent` unchanged), `company` / `country` / `marketplace` / `siteSku`, `sourceUpdatedAt` (preserved, not freshness-evaluated), `destinationIdentitySource` (owned by B4-R3, not re-inferred), and `linkedPurchaseOrderLineId` / `linkedShippingPlanLineId` lineage — as a fresh isolated snapshot (never the input candidate reference); no `sourceEligible` / status / scope / quantity / authority behavior changed. **B4-R5 executed 2026-08-01 — PURE EXTERNAL-AUTHORITY ADAPTER IMPLEMENTED — UNIT / CROSS-ADAPTER-FIXTURE VERIFIED** (`assets/js/core/supply-planning-external-incoming-adapters.js`, `adaptExternalIncomingAuthority`, 82 assertions): classifies one normalized external 3PL/OMS/WMS incoming observation and fails **closed** — for EVERY external record `planningEligible = false` and `adapterEligibleQuantity = 0` (§38 / §12). Accepted authority states `LINKED_EXTERNAL_EVIDENCE` / `EXTERNAL_UNLINKED_QUARANTINED` / `ADOPTION_PENDING` / `ADOPTED_TO_KM` / `REJECTED_EXTERNAL_RECORD` / `IGNORED_FOR_PLANNING` / `SUPERSEDED` / `REVERSED` map to deterministic `stateClass`; missing/unknown fail closed; linked evidence is execution-evidence-only and never contributes separately; adopted rows contribute 0 directly (only the resulting KM canonical Shipment enters planning — count-once); unlinked/quarantined = 0 whether fresh or stale; stable external identity + linkage defects surface as deterministic review reasons; supported sources `EXTERNAL_INBOUND_RECORD` / `EXTERNAL_WMS_INBOUND` / `EXTERNAL_OMS_INBOUND` in domain `EXTERNAL_3PL_OVERSEAS` (KM_SHIPMENT_LINE / PLATFORM_FBA / EXTERNAL_OUTBOUND_RECORD fail closed); pure / deterministic / non-mutating / clock-free / locale-free / DB-free / API-free / UI-free / persistence-free — **classifies only** (no Link/Adopt/Reject/Ignore write, no KM record creation, no notification, no ingestion, no reconciliation update, no state transition, no dedup, no ownership precedence, no Required-By/ETA-late, no final Qualified Incoming, no calculateGap). Three cross-adapter fixtures prove authority separation (linked evidence + KM Shipment, unlinked external, adopted external + resulting KM Shipment) with no summing/dedup. **Current authorized task = B4-R6** (Dedup + Ten-Gate Qualified Incoming Engine); B4-R6–B4-R8 not implemented. B-4 overall remains CONTRACT RESOLVED with Runtime implementation in progress at source/pure-module level only (no deployment; the registry / other owner docs' "RUNTIME NOT IMPLEMENTED" wording stays until a deployment round).

**End of Document**
