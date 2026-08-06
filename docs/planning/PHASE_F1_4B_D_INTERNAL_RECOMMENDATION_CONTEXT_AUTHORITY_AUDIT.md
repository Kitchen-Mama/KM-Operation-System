# Phase F1-4B-D — Internal Recommendation Context Authority — Audit + HALT

> **Status: AUTHORITY AUDIT COMPLETE — IMPLEMENTATION HALTED (2026-08-06).** Per the round's "Phase 1 — Authority
> Audit First" gate, this is the deliverable. The three inputs the Recommendation Runtime requires
> (`destinationWarehouseId` / `calculationMonth` / `planningCycle`) have **no active, source-proven, non-guessed,
> non-clock authority** the interactive Inventory Replenishment page can read. Building the resolver would require a
> new config table/column or a forbidden guess/clock. That trips multiple F1-4B-D HALT conditions → **no page/API/
> schema change made; no resolver written.** A single, precise decision is escalated below. Evidence is code/spec-cited
> and corroborates the prior (retained) audit `PHASE_F1_5B_PLANNING_CONTEXT_AUTHORITY_HALT.md`.

---

## A. One-line result

`_irInternalContext` cannot be populated from a source-proven authority this round: **destination** has only a
**spec-only** future table (`replenishment_route_rules`, no runtime), **calculation month** has only the forbidden
browser clock, and **planning cycle** is a scheduler/caller run-parameter that nothing injects on the interactive
page. Each is fail-closed; none can be made READY without a guess, a clock, or new schema — all forbidden. HALT.

## B. §Phase-1 Authority matrix (source-proven, live-repo-verified)

| Context input | Active owner / candidate source (cite) | Live loader? | Classification |
|---|---|---|---|
| `destinationWarehouseId` | Automated source = `replenishment_route_rules` (CARRIER_AND_ROUTE_SPEC §5A.1 :508, §5A.4 :555). D-F1-5B-1 / SC-11.3 D-3 freeze it caller-owned, **never inferred**. `ship_from`/`destination` on shipments are "human-readable snapshots only — NEVER identity" (`DATABASE_RELATIONSHIP_MAP.md:599`). | **NO** — §5A.4:555 "**Spec only — no runtime engine exists**"; no `getReplenishmentRouteRules` / route loader in `operation-system-db-api.js` (grep: none); page refs are comments (`inventory-replenishment.js:1544,2924`). `warehouses.marketplace` is an optional Movement-Log filter field, not a unique canonical destination mapping. | **SOURCE_NOT_IMPLEMENTED** |
| `destinationWarehouseId` (FBA / platform-fulfilled) | none — no warehouse row models an Amazon/platform FC as a canonical `warehouse_id` (warehouses are 3PL / factory types). | NO | **PLATFORM_DESTINATION_UNRESOLVED** |
| `calculationMonth` | D-F1-5B-3 anchor = injected `YYYY-MM`, **never browser-current**. No server-generated planning-month, no `active_planning_context`, no scheduler-injected month on the page. | **NO** — no `getActivePlanningContext` / `active_planning_context` loader (grep: none). Only `new Date().getMonth()` (legacy display math, `inventory-replenishment.js:3433`) — **forbidden** as the anchor. | **SOURCE_MISSING** |
| `planningCycle` | SC-3.3 caller/scheduler run-parameter. `planning_cycle` exists on `request_allocation_draft` / site-confirmation headers (`operation-system-db-api.js:1703,1728,1810,2812,2901`) as a caller-**supplied** upsert key. | **N/A on this page** — it is written INTO those records by a caller/scheduler; nothing derives it from canonical data, and no scheduler injects it on the interactive Inventory Replenishment page. F1-5-B classed it "always caller/scheduler-supplied — not derived from source data". | **SOURCE_MISSING** (for the interactive page scope) |

**No live authority appeared** since `PHASE_F1_5B_PLANNING_CONTEXT_AUTHORITY_HALT.md` (the intervening commits `b7de10b`
App-Script source-ID/Submit and the F1-4B-B/C page work added no route-rules table or planning-context config loader —
verified by grep).

## C. HALT conditions tripped (F1-4B-D §HALT Conditions)

- ✅ Destination has no unique canonical `warehouse_id` (route-rules spec-only).
- ✅ Destination could only be produced by guessing from a candidate list (forbidden).
- ✅ Platform/FBA destination has no warehouse identity.
- ✅ Calculation Month could only come from the browser clock.
- ✅ Planning Cycle has no active source nor a frozen derivation for this page.
- ✅ A real authority would require a new table/column or config record (schema — forbidden this round).

Any ONE is sufficient; all six hold. Per §HALT: no page-runtime change, no API change, no schema, audit doc only.

## D. The single precise decision to adjudicate (not a docs-only loop)

**Where does the authoritative, non-UI, non-guessed `(destinationWarehouseId, calculationMonth, planningCycle)` for an
interactive Inventory-Replenishment scope come from?** One bounded store resolves all three. Options:

### D-1 · Destination
- **A (recommended path).** Authorize a minimal canonical **`replenishment_route_rules`** master (columns per
  CARRIER_AND_ROUTE_SPEC §5A.1: `company,country,marketplace,shipping_method → ship_from,destination_warehouse_id`) +
  an injectable read adapter. The resolver returns `SOURCE_PROVEN_SINGLE` only on a unique active same-company row;
  0 rows → fail-closed, >1 → `SOURCE_PROVEN_CONFLICT`. **Cost: new table (needs a schema round).**
- **B.** A tiny **`active_recommendation_context`** admin/scheduler config keyed by `company+country+marketplace` →
  `destination_warehouse_id` (not user-facing). **Cost: new config record (schema/config round).**
- **C.** Keep destination caller-owned + page dormant (flags-off / NOT_READY) until A lands. **Cost: none; endpoint
  stays dormant.**

### D-2 · Calculation Month
- **A (recommended).** Same `active_recommendation_context` config carries `calculation_month` (`YYYY-MM`), set by an
  admin/scheduler. **Cost: config field.**
- **B.** Declare an existing canonical month the anchor (e.g. an FC-planning active month) **only if** an active spec
  names it the recommendation anchor — none does today, so this is really A. **Cost: a spec decision + a readable field.**
- **C.** Scheduler-injected only via `_irSetInternalRecommendationContext` (page dormant interactively). **Cost: none.**

### D-3 · Planning Cycle
- **A (recommended).** Same config carries an explicit `planning_cycle` run identifier. **Cost: config field.**
- **B.** Freeze a derivation (e.g. `planningCycle = calculationMonth`) — **forbidden to assume**; needs an explicit
  active-spec rule. **Cost: a frozen-rule decision.**
- **C.** Scheduler-injected only (page dormant interactively). **Cost: none.**

**Recommendation.** Adopt **one bounded `active_recommendation_context` configuration record** (Option A across D-1/2/3)
— `company+country+marketplace → {destination_warehouse_id, calculation_month, planning_cycle}` — maintained by an
admin/scheduler (never the general user), read by a pure injectable resolver. This is the smallest non-UI, non-guess,
non-clock authority that makes the context READY. **It requires the user to authorize a minimal config store (a
schema/config round), which F1-4B-D forbids** — hence this decision must be made before an implementing round. Until
then, **Option C stands** (page dormant behind default-false flags; the Recommendation Summary keeps its honest
"unavailable / not configured" legacy state — no guess, no fake).

## E. Exact next slice (separately authorized)

**F1-4B-E — Active Recommendation Context config + resolver.** After the user picks the store (D-1/2/3 = A), a schema/
config round provisions `active_recommendation_context`, then a pure injectable `resolveInventoryRecommendationContext`
reads it (single/active/same-company destination or fail-closed; explicit `YYYY-MM`; explicit cycle) and feeds
`_irSetInternalRecommendationContext`. Only then can the page reach READY and issue the one flag-gated
`recommendation.workspace.get` per scope. No formula/runtime/API-contract change is needed for that slice either.

## F. Governance

Audit-only. **No** page-runtime / resolver / API / router / Apps-Script / bundle / DB / schema / header change; no new
formula; no `inventory-compat.js` change; no live DB access. The `_irInternalContext` + non-UI seam from F1-4B-C are
unchanged and remain the correct integration point once an authority exists. Docs-only checkpoint. Full suite unchanged
(89 files / 0 failing — no code touched); Golden Matrix 39/1/0; Scenario #34 Pending (honest). No push, no deploy.
