# Inventory AI Plan — draft lifecycle (CANONICAL)

**Status:** CANONICAL · **Recorded:** F1-7N-FB-4C, 2026-08-26
**Owners:** `61_api_v1_weekly_ai_plan.gs` (generation) · `69_api_v1_ai_plan_lifecycle.gs` (lifecycle) ·
`16_shipping_allocation_handlers.gs` (identity, status enum, active sets)

---

## 1. The rule

> **Inventory AI Plan is the automated proposal source for shipping allocation drafts. Each SUCCESSFUL new
> generation run REPLACES the earlier, still-`draft`, AI-generated results of the same scope. The older rows are
> KEPT and marked `expired` — never deleted.**

## 2. Statuses

| status | meaning |
| --- | --- |
| `draft` | the **active** proposal — editable, displayed, submittable |
| `expired` | **superseded** by a newer successful AI Plan run. Audit only: not editable, not submittable, not shown in the Execution Plan by default |
| `site_confirmed`, `submitted`, `cancelled` | unchanged |

`expired` is **not** a synonym for `cancelled`. Cancelled is a human decision to abandon a plan; expired is the
system recording that a newer successful run replaced it. Different cause, different audit columns, different
meaning in a report. **Using `cancelled` to mean expired is forbidden**, as is recording the fact in free text.

`expired` is **terminal**: `SAD_TERMINAL_STATUSES_` and `SAD_TERMINAL_LINE_STATUSES_` include it, so no writer may
mutate an expired row and no active-set scan returns one.

## 3. What may be expired

A header is expired **only when every one of these holds**:

- same AI Plan business scope — `source_page` = `inventory_replenishment`, same `company`, `country`,
  `marketplace`, and (when the run names one) the same `planning_cycle`;
- provenance is **AI** (`generation_type` ∈ scheduled / manual_refresh / system_generated, or it carries a
  `generation_run_id`). A row marked `user_created` is **never** AI;
- status is exactly `draft`;
- its `generation_run_id` differs from the current run;
- it is not one of the rows the current run just committed.

## 4. What may never be expired

Manual-source rows · `submitted` · `approved` · `site_confirmed` · `transferred` · `cancelled` · already
`expired` · `partially_submitted` · rows of another country/marketplace/company/cycle · the current run's own
rows. Each exclusion is **reported per row** with its reason (`MANUAL_SOURCE`, `PROTECTED_STATUS_SUBMITTED`,
`OUT_OF_SCOPE`, `CURRENT_RUN_OUTPUT`, `SAME_GENERATION_RUN`, `NOT_DRAFT`) — never silently skipped.

A row a user **edited** but which is still an AI-sourced `draft` **is** expired (the business decision recorded
here). Its `planned_qty`, `override_reason`, `note` and every snapshot are left **byte-identical**; only the
lifecycle columns move. The expired row is a complete audit record, not a mutilated one.

## 5. Audit columns (minimal schema extension)

`shipping_allocation_drafts` gains four columns:

| column | purpose |
| --- | --- |
| `generation_run_id` | which run owns this row |
| `expired_at` | when it was superseded |
| `expired_by_run_id` | which run superseded it |
| `expiration_reason` | always `SUPERSEDED_BY_NEW_AI_PLAN` |

`shipping_allocation_draft_lines.line_status` gains the value `expired`.

**Until those columns exist the WHOLE GENERATION COMMAND REFUSES** with
`AI_PLAN_LIFECYCLE_SCHEMA_NOT_READY`, before its first write.

> **CORRECTION (F1-7N-FB-4C-ADDENDUM-MIGRATION §A).** F1-7N-FB-4C described this as fail-closed and it was not.
> Its schema check sat inside the expiration step, which runs in Stage 3 — *after* every header and line of the
> new run is already committed. On an unmigrated database a run therefore wrote the new AI drafts, then reached
> the lifecycle, then discovered the columns were missing and expired nothing — leaving the new draft *and* the
> old draft both active for the same scope. That is fail-**open** with a footnote: the exact duplicate-active-plan
> state the lifecycle exists to prevent, produced by the lifecycle's own safety check.

The gate now runs in Stage 1, before any write, and returns `success:false` with `zero_write:true`,
`created_headers:0`, `created_lines:0`, `expired_headers:0`, `expired_lines:0`, the missing table, the missing
columns, any invalid status authority, the expected migration version, and the exact next action. It must pass
before a new header, a new line, a current-run attachment, an expiration, or any status transition.

Expiring a row whose lineage cannot be recorded — or hiding the lineage in `note` — remains forbidden.

### 5b. Migration ownership and ordering

The columns are added by `TEMP_migrate_shipping_allocation_ai_lifecycle.gs` (USER-run):
`TEMP_AI_LIFECYCLE_SCHEMA_DIAGNOSE` → `TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN` →
`TEMP_AI_LIFECYCLE_MIGRATE_COMMIT({ mode:'COMMIT', checksum })` → `TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE`.

**Code sync and migration are order-independent.** `SHIPPING_ALLOCATION_DRAFTS_HEADERS_` stays the frozen 30-column
*required* contract (extra columns are allowed by this table's additive contract), and the canonical
post-migration order lives in `SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_`. The write gate validates against
the canonical order with the lifecycle tail marked optional, so a pre-migration sheet (30 columns) and a migrated
sheet (34) are **both** exact — and any reorder, rename, duplicate, blank or unknown extra column still fails
closed. Neither the sync alone nor the migration alone can break a write; the lifecycle simply stays gated until
the columns exist.

**Canonical column order is append-only and fixed:** `generation_run_id`, `expired_at`, `expired_by_run_id`,
`expiration_reason`, at indexes 30–33. No live column is ever reordered or rewritten. If the live header is not an
exact prefix of the canonical order, the migration **STOPS** and reports the drift rather than reordering anything.

`shipping_allocation_draft_lines.line_status` **already exists**, so the migration adds no line column — only the
enum gains `expired` (`SAD_LINE_STATUSES_`), which both validators now accept positively.

### 5c. Existing-row lineage (§E)

Every existing row is classified as exactly one of `AI_LINEAGE_RESOLVED`, `MANUAL_SOURCE`, `TERMINAL`,
`LEGACY_AI_LINEAGE_UNRESOLVED`, `SOURCE_UNKNOWN`, `IDENTITY_CONFLICT`.

`generation_run_id` is **never invented**. It is backfilled only where it is *recomputable from the shipped
formula* over fields already stored on the row — `AIRUN-<FNV1a('AIPLAN-' + FNV1a(planning_cycle | company |
country | marketplace | calculation_run_id))>` — and the report names the source columns and the exact value
mapping. **A timestamp is never a lineage authority.** A row with no `calculation_run_id` is left blank, reported
as `LEGACY_AI_LINEAGE_UNRESOLVED`, **not** expired, and blocks lifecycle activation for its conflicting scope
until a human dispositions it. `expired_at` / `expired_by_run_id` / `expiration_reason` initialize blank; a
historical expiration timestamp is never manufactured.

## 6. The staged flow (never expire-then-compute)

**Forbidden:** expire the old rows, then compute, then fail — leaving no active plan.

| stage | does | writes |
| --- | --- | --- |
| **1 Compute / Validate** | mint the immutable `generation_run_id` / `execution_key`; compute the full recommendation for **every** group; validate scope, SKU, route, quantity, warehouse, method; **then run the activation gate** (§5, §8b) — schema, column order, status authority, migration version, run id, and unresolved identity collisions | **none** |
| **2 Prepare** | build the complete manifest of creates / updates / expirations; detect duplicate business identity and conflicting active runs; checksum it | **none** |
| **3 Commit** | revalidate scope; upsert this run's headers; upsert its lines; exact read-after-write; **only then** expire older AI drafts; re-verify | yes |

Stage 3's re-verification checks the active set, the expired set, the absence of a duplicate active identity, and
that **no old AI draft is still active in the replaced scope**.

**On failure:** each stage's outcome is reported; success is never claimed; the run rolls back where it safely
can and reports `INDETERMINATE` where it cannot; an indeterminate write is **never** auto-retried; and **the
previous active plan is never expired because of a failed current run**.

## 7. Zero-result run

A run that successfully computes **0 recommendations is a SUCCESS**. It expires the same scope's older AI drafts,
creates **no** empty header and **no** empty line, keeps its run audit, and the UI says *"no recommendation for
this scope this cycle"*. `ALL_BLOCKED` is **not** this case — something went wrong, so nothing is expired.

## 8. Active uniqueness and manual precedence

> **ONE ACTIVE BUSINESS DECISION PER CANONICAL IDENTITY.**
> **A current manual Execution Plan is the binding operator decision; an AI Plan is advisory and must not create
> a second active draft for the same canonical business identity.**
> **Multiple routes remain allowed, because each route is a different K2 header identity.**

Identity is the **existing canonical K2 route group key** (`sadK2GroupKey_`) — no second hash is defined anywhere.

### 8a. Why precedence needs its own gate

Under the frozen K2 contract one canonical identity is **one header row**. So an AI run targeting a route an
operator has already planned does not create a second row — it *resolves to the operator's row* and regenerates
it, bumping `draft_version`, adopting the AI calculation lineage and stamping the AI run id onto what was a manual
decision. `sadRegenerateLinePatch_` does protect a `planned_qty` that differs from `recommended_qty`, but that is
a heuristic: a manual quantity that happens to **equal** the previous recommendation reads as "not overridden" and
follows the new one. Precedence is therefore decided at the **identity level, before the write**.

### 8b. The three cases

| live state for one identity | outcome |
| --- | --- |
| nothing active, or only this plan's own AI lineage | `PROCEED` — normal generation |
| **one active manual draft** | `SUPPRESSED_BY_ACTIVE_MANUAL_DRAFT` — header, line, exact user quantity, route and note all preserved; no parallel AI draft; nothing overwritten. Reports the manual persisted identity, the current recommendation and the persisted user quantity, with `created:false`, `updated:false`, `blocks_run:false`. **The run continues for every other identity.** |
| **an active manual draft *and* an active AI draft** | `ACTIVE_SOURCE_IDENTITY_COLLISION` — pre-existing corruption. Detected **before** any write; no row is created; the exact rows are listed; reconciliation is required; **no survivor is guessed**, and it fails closed for that identity only. |

An **older AI draft** elsewhere in the same scope is a separate matter: after the current run fully verifies, the
manual draft is preserved, the older AI draft is expired, no new AI draft is created for the manual's identity,
and **both actions are reported**.

Manual precedence governs normal generation behaviour. It does **not** silently repair unknown historical
collisions.

A run whose every proposed identity was suppressed is `ALL_SUPPRESSED_BY_MANUAL` — a **successful** run that
correctly wrote nothing, and it still supersedes older AI drafts of the same scope.

**Forbidden:** an old and a new AI run both `draft` on one identity · an AI draft created beside an active manual
decision for one identity · a retry producing a second current run · an expired row hydrating as active · an
expired row entering the Submit workset.

## 9. Projection

A successful run returns `generation_run_id`, `execution_key`, `scope`, `created_headers`, `updated_headers`,
`created_lines`, `updated_lines`, `expired_headers`, `expired_lines`, `active_count`, `expired_count`,
`zero_result`, `verification`, `request_id`.

Site Inventory then refreshes the applied scope, shows only current active AI drafts, keeps manual routes,
prefers the persisted user quantity, and **never clears the Execution Plan because a run failed**.

## 10. Diagnostics

`TEMP_INVENTORY_AI_PLAN_FLOW_DIAGNOSE()` (69_) is **read-only** and reports registry readiness, countries /
marketplaces, method-registry readiness, available methods by route scope, active AI runs, active headers/lines,
stale draft runs, the rows a next run **would** expire, manual rows preserved, duplicate active identities, the
current generation authority, the exact blocking reason and the next action — with the footer
`DB_WRITES=0 · STATUS_TRANSITIONS=0 · PROPERTY_WRITES=0 · DRIVE_WRITES=0 · EMAILS=0 · DEMO_MUTATIONS=0`.
