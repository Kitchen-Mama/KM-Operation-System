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

**Until those columns exist the lifecycle FAILS CLOSED** with
`AI_PLAN_LIFECYCLE_SCHEMA_EXTENSION_REQUIRED`: a new run still writes its own rows, and **nothing is expired**.
Expiring a row whose lineage cannot be recorded — or hiding the lineage in `note` — is forbidden.

## 6. The staged flow (never expire-then-compute)

**Forbidden:** expire the old rows, then compute, then fail — leaving no active plan.

| stage | does | writes |
| --- | --- | --- |
| **1 Compute / Validate** | mint the immutable `generation_run_id` / `execution_key`; compute the full recommendation; validate scope, SKU, route, quantity, warehouse, method | **none** |
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

## 8. Active uniqueness

Two **active** AI drafts may never claim the same business identity. Identity is the **existing canonical K2
route group key** (`sadK2GroupKey_`) — no second hash is defined anywhere.

**Allowed:** one SKU with several routes → several canonical headers · different routes inside one run · a manual
route coexisting with an AI route on different identities.
**Forbidden:** an old and a new AI run both `draft` on one identity · a retry producing a second current run · an
expired row hydrating as active · an expired row entering the Submit workset.

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
