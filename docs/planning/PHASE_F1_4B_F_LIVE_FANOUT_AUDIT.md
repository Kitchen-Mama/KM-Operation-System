# Phase F1-4B-F — Live Recommendation Workspace Warehouse Fanout — Audit + Conflict HALT

> **Status: AUDIT COMPLETE — IMPLEMENTATION HALTED BEFORE CODE CHANGES (2026-08-06).** Per §0 ("First report the
> exact current call chain… If any active canonical specification contradicts the approved Phase-1 rules below, HALT
> before code changes and report the exact conflict"). The **WAREHOUSE** fanout is buildable, but the approved
> **MARKETPLACE**-destination rule (§1.1 / §4 / §7) contradicts the frozen recommendation runtime, which is
> **warehouse-destination-only**. One precise decision is escalated. Evidence is code-cited. No code changed.

---

## A. Current call chain (F1-4B-A, unchanged)

```
doPost → 01_router → handleRecommendationWorkspaceGet_(body, io)
  → validateRecommendationWorkspaceRequest_        (mandatory scope + ONE destinationWarehouseId + calcMonth + planningCycle)
  → io.openTarget()                                 (exact Spreadsheet-ID gate)
  → KMPS.readCanonicalSnapshots(ss)                 (11 targeted canonical tables; never getOperationDb)
  → per in-scope SKU:
       KMPA.assembleProductionRecommendationFacts(read, skuReq)   (requires destinationWarehouseId → KMPCX)
       KMPS.buildProductionRecommendationSource(ss, productionRequest)   (ledger → allocator → resolver)
  → recommendationWorkspaceBuild_ → { success, data:{lines[]}, meta, errors }
```

## B. §0 required confirmations (source-verified)

| # | Question | Answer (cite) |
|---|---|---|
| 1 | Does `recommendation.workspace.get` accept only ONE `destinationWarehouseId`? | **YES.** `validateRecommendationWorkspaceRequest_` reads a single mandatory `payload.destinationWarehouseId` (`42_…gs:60,63`); the whole handler computes for that one destination — no fanout. |
| 2 | Are demand-allocation rules available inside the Apps Script handler? | **NO.** The handler reads only the 11 canonical snapshots via `KMPS.readCanonicalSnapshots` (`:217`); `replenishment_demand_allocation_rules` is not among them and there is no server reader for it. (The F1-4B-E reader is browser-only `window.KM.DB.getReplenishmentDemandAllocationRules`.) |
| 3 | Is `supply-planning-demand-allocation.js` bundled? | **NO.** It is not in `build-apps-script-bundle.js` MODULE_ORDER (F1-4B-E0R); the deployed `90_generated_supply_planning_bundle.gs` does not contain it. |
| 4 | Does Inventory Replenishment have a valid non-UI `calculationMonth`/`planningCycle` authority? | **NO.** F1-4B-D concluded `SOURCE_MISSING` (only the forbidden browser clock; planningCycle is a scheduler run-param nothing injects). No `RECOMMENDATION_CALCULATION_MONTH` config exists yet. |
| 5 | Do MARKETPLACE and WAREHOUSE destinations require different runtime paths? | **YES — and only WAREHOUSE has an existing path (the conflict).** See §C. |

## C. The blocking conflict (§0 HALT) — MARKETPLACE destination has no existing runtime

The approved rules say (§1.1) a platform-fulfilled/Amazon destination is `destinationType = MARKETPLACE`, `warehouseId = null`
(**do not fabricate an Amazon warehouse_id**), and (§4) *"For MARKETPLACE destination → existing KMPA/KMPCX/KMAF/KMPS
path → one marketplace-level recommendation result"*, and (§7) *"Amazon: show one Recommendation Summary for the
marketplace destination."*

But the existing frozen runtime is **warehouse-destination-only** and **requires** a canonical `warehouse_id`:

- `supply-planning-production-assembly.js:86` — `if (!nonEmpty(request.destinationWarehouseId)) issues.push(issue('MISSING_DESTINATION_WAREHOUSE', …'destinationWarehouseId is mandatory Phase-1 (no automatic destination inference)'))`.
- `supply-planning-planning-context.js:66` — `validateDestination` → `MISSING_DESTINATION_WAREHOUSE` when no destination; the id must exist + be active + same-company in the canonical `warehouses` table (`:69-74`).
- The handler feeds `destinationWarehouseId` straight into `KMPA` → `KMPCX` (`42_…gs:229-230`).

⇒ A MARKETPLACE destination (`warehouseId = null`) is **rejected by the existing runtime** (`MISSING_DESTINATION_WAREHOUSE`);
there is **no marketplace-level (warehouse-less) code path** that scopes FBA current-stock / qualified-incoming / gap.
Producing a marketplace-level recommendation would require **either** authoring a new marketplace-level runtime path
(a "second recommendation engine" / new formula — **forbidden** by §4 and by the frozen-owner do-not-modify list)
**or** fabricating an Amazon `warehouse_id` (**forbidden** by §1.1). This is the exact §0 contradiction → **HALT**.

The **WAREHOUSE** path has no such conflict: `resolveScopeWarehouseDemandFacts` (F1-4B-E) already fans marketplace
demand into per-warehouse WAREHOUSE destinations, each of which the existing KMPCX/KMAF/KMPS consumes unchanged
(proven in `supply-planning-demand-allocation-integration-f1-4b-e.test.js`).

## D. The decision to adjudicate (before any code change)

**How should a MARKETPLACE / platform-fulfilled destination be handled, given the existing runtime is
warehouse-destination-only?**

- **A (recommended) — WAREHOUSE-only live fanout now; MARKETPLACE returns an honest structured state.** Implement the
  full server wiring for **WAREHOUSE** destinations (bundle `supply-planning-demand-allocation.js`; a server-side
  Spreadsheet-ID-gated targeted reader for `replenishment_demand_allocation_rules`; `RECOMMENDATION_CALCULATION_MONTH`
  governed config §1.2; `planningCycle = RECO-{YYYY-MM}` §1.3; per-warehouse fanout through the **unchanged** runtime;
  additive response identity §6; scope-only page request §5; flags default-false). A MARKETPLACE-destination scope
  returns a **structured, honest** `MARKETPLACE_RECOMMENDATION_NOT_AVAILABLE_PHASE1` (no fabricated warehouse, no fake
  zero) until a marketplace-level runtime is defined. *This delivers the whole demand-allocation value now and keeps
  everything truthful — but it deviates from §4's "MARKETPLACE → existing path → result", so it needs your explicit OK.*
- **B — Authorize a new marketplace-level runtime path.** Define how a platform-fulfilled (FBA) marketplace scopes its
  current-stock (`amazon_inventory_snapshot`) + qualified-incoming (`shipments` to the marketplace) + gap **without** a
  `warehouse_id`. This is a **new runtime/formula** — it contradicts §4's "no second engine" and the frozen-owner
  constraints, so it is a separate, larger, formula-authorizing round, not this one.
- **C — Keep everything dormant** (no wiring) until B is decided. *Lowest value; the warehouse fanout stays unshipped.*

**Recommendation: A.** It ships the buildable, high-value WAREHOUSE fanout through the unchanged runtime and represents
MARKETPLACE honestly, deferring the (formula-level) marketplace-runtime question to its own authorized round.

## E. Scope note (even under A)

Option A is still a large, authorized server change (bundle rebuild via the build tool only — never hand-edit the
generated `.gs`; new server reader; handler fanout + request-contract change so the page sends scope-only; additive
response identity; the F1-4B-A focused test updated for the new request contract). It is buildable and within this
round's authorizations (§1.2/§1.3/§3/§4/§5/§6/§8) **once the MARKETPLACE disposition (A vs B) is fixed** — because §4
currently requires a MARKETPLACE result the runtime cannot produce.

## F. Governance

Audit-only. **No** page-runtime / Apps-Script handler / router / bundle / core-module / API-contract / Workspace-DTO /
DB / schema change; no new formula; no live DB access. Docs-only checkpoint. Full suite unchanged (91 files / 0
failing — no code touched); Golden Matrix 39/1/0; Scenario #34 Pending. No push, no deploy.
