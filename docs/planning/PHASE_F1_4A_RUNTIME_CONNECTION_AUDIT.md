# Phase F1-4A — Inventory Replenishment ↔ Recommendation Runtime Connection Audit

> **Status: AUDIT COMPLETE — CONNECTION HALTED (2026-08-05).** Read-only, no code connection landed. Per the round's own ordering ("produce the dependency graph first"), the audit below is the deliverable; it surfaces two hard blockers that make the connection un-landable **within this round's forbidden scope** (no formula/runtime/API/Apps Script/DB/schema change), plus a real runtime-output gap. Bounded options + a recommended authorized next slice are given. Evidence is code-verified (file:line).

---

## A. One-line result

Inventory Replenishment is **fully disconnected** from the supply-planning runtime, and it **cannot be connected in this round** because: (1) the runtime is **server-side only** (Apps Script bundle; **0** browser `<script>` tags in `index.html`) and **no recommendation read-API exists** — wiring it needs API/Apps Script work this round forbids; and (2) four of the target columns — **Projected/Future Inventory, Coverage, Days-of-Supply-as-runtime, business Reason/Status tokens** — are **produced by no runtime at all**, so emitting them is a formula/runtime **build** this round forbids. A partial client-side `calculateGap` wire would emit a **wrong** number (the Qualified-Incoming pipeline isn't loaded → `incoming = 0`).

---

## B. Runtime dependency graph (target flow → what actually exists)

```
Current Stock ─┐
Qualified Incoming ─┤
Forecast/Demand ─┤→ Projected Inventory → Coverage → DOS → Suggested Qty → Reason → Recommendation
Supply Ledger ─┘
```

| # | Target concept | Produced by runtime? | Exact field / producer | Notes |
|---|---|---|---|---|
| 1 | Current Stock | ✅ (input echo / ledger) | `runSupplyPlanningLine.destinationCurrentStock`; `buildSupplyLedger` `effectiveSupplyQty`; `projectCurrentStockSupplyLedger.ledger.totalEffectiveSupplyQty` | Caller-supplied scalar or aggregated from inventory rows |
| 2 | Qualified Incoming (timely) | ✅ | `evaluateQualifiedIncoming.qualifiedIncomingQuantity` → `runSupplyPlanningLine.timelyQualifiedIncoming` | Needs built B4-R4 `kmShipmentResults` (candidate→adapter chain) + `requiredByDate` |
| 3 | Late-risk / review / excluded incoming | ✅ | `runSupplyPlanningLine.incomingBreakdown.*` | Visible-only; contributes 0 to gap |
| 4 | **Projected / Future Inventory** | ❌ **GAP** | — | `calculateGap` returns only the **floored shortage**; `classifyProjectedBalance` *consumes* a caller-supplied `projectedBalance`, never computes it |
| 5 | **Coverage** | ❌ **GAP** | — | No coverage function; `coverage`/`coverage_status` are in `LIVE_ANALYSIS_FORBIDDEN` (plan-builder.js:36-37) — runtime refuses to carry them |
| 6 | **Days of Supply** | ❌ **GAP** | — | `days_of_supply` only in the forbidden-keys blocklist; primitives (`forecastDailyDemand`, `avgSalesPerDay`) exist but no DOS is computed |
| 7 | Suggested Qty | ✅ | Weekly FLOOR `calculateShippingAndResidual.recommendedShippingQty`; Monthly CEILING `calculateSuggestedOrderQty`; both surfaced as resolver line `recommendedQty` (source-facts.js:641-669 / 805-833) | The one genuinely-connectable recommendation output |
| 8 | **Reason (business: ORDER/TRANSFER/BORROW/NO_ACTION)** | ❌ **GAP** | — | Only **blocking/error** reason codes exist (`blockedReason`: `MISSING_CALCULATED_GAP`…; ledger conflict reasons; orchestrator `SOURCE_NOT_READY:*`). No business action tokens |
| 9 | **Status / Level / severity (per-SKU LOW/OK/CRITICAL)** | ❌ **GAP** | — | Only `ready`/`blockedReason`, orchestrator `status`, allocation `MODE_SEVERITY` (an allocation mode, not a SKU level) |

`calculateGap` (calculations.js:160-167) returns a **bare number**: `MAX(demand − stock − incoming − committed, 0)` — no coverage/DOS/suggested/reason keys.

**Runtime read entry point (read-only, no persistence):** `KM.recommendationSourceIntegration.resolveRecommendationFactsFromSource(sourceInput, opts)` → reader → `buildDemand/SupplyLedger` → `resolveDemandKeys` → `projectAllocationInputs` → `resolveWeekly/MonthlyRecommendationFacts` → `bridge`. Output `lines[i]` carry `recommendedQty`, `calculatedGap`/`netOrderNeed`, `blockedReason`. **Input is a rich DTO** — `{ scope, planningCycle, sheets:{ demand, supply, receivers|factoryDemands, planningFacts }, … }` — that the page does **not** build.

---

## C. Page side — current field sources (live cloud path, `_getCloudReplenishmentData` @3386)

Inputs are REAL `window.KM.DB.*` reads (stock/sales/forecast/events/3PL/factory). Recommendation outputs are STUBS:

| Column | Row field | Current source | Type |
|---|---|---|---|
| Current Stock | `currentInventory` | `IR.stockCard` ← `getAmazonInventorySnapshot` (3489) | REAL |
| Qualified Incoming / On the way | `onTheWay` | **`onTheWay: 0`** (3521) "pending mapping spec §9" | **STUB** |
| Avg daily sales | `avgDailySales` | `IR.avgSalesPerDay` ← weekly snapshot (3527) | REAL |
| Forecast 60d | `forecast60d` | `IR.forecast60d` ← fc + target rules (3462) | REAL |
| Days of Supply | `daysOfSupply` | `IR.daysOfSupply(currentStock, avg)` (3490) — **UI calc** (603-606) | UI CALC |
| Suggested Qty | `suggestedQty` | `IRMap.needBuckets()` → **all 0** (631-633) | **STUB** |
| Status | `status` | `suggestedQty>0?'Need Restock':'Sufficient'` → always 'Sufficient' (3540) | **STUB** |
| Alert/severity | `needsAlert` | **`false`** (3531); color = `IRMap.dosColorClass(dos)` (RT-computed) | STUB / RT color |
| Reason/Gap/Route | `_recSummaryRows` | persisted `getShippingAllocationDrafts` lines OR honest empty state / `'AI Pending'` (1554-1578) | PERSISTED-DRAFT / STUB |
| **Projected Inventory** | — | **no column, not computed** | ABSENT |
| **Coverage** | — | **no main column** (only `thirdPartyPlan.coverageRate` in 3PL alloc) | ABSENT |

Dead code: `getReplenishmentData` lines 989-1293 are **unreachable** (two early returns) — a legacy `Math.random()` mock + a richer UI formula set that never executes. Not a live dependency.

**Page references the runtime 0 times** (grep: `runSupplyPlanningLine`/`calculateGap`/`evaluateQualifiedIncoming`/`KMSF`/`KM.core`/`line-runtime` → none).

---

## D. The two blockers (why it can't land this round)

1. **No client-side runtime + no read-API.** `index.html` loads **0** `supply-planning-*.js`; the runtime lives only in `90_generated_supply_planning_bundle.gs` (server-side). `operation-system-db-api.js` exposes allocation-draft persistence + `getRecommendationDraftToken` but **no endpoint that returns computed recommendations**. Connecting therefore requires **either** a server-side read-API (`+ Apps Script` compute) **or** a client-side bring-up of ~10 UMD modules **plus** a client port of the source→DTO pipeline. The round **forbids** API / Apps Script / "recreate them", and F1-4 depends on **F1-7** (persistence), which is **D-1-gated** (Verification-Copy target; live incident OPEN).
2. **Four target outputs don't exist in any runtime.** Projected Inventory (#4), Coverage (#5), DOS-as-runtime (#6), and business Reason/Status (#8/#9) are produced by no module. Emitting them is a **formula/runtime build**, which the round **forbids** ("No Formula Rewrite / No New Runtime / No New Recommendation Logic").

A minimal `calculateGap` wire is **not** a safe partial: without the QI/incoming pipeline the page would pass `timelyQualifiedIncoming = 0`, so the gap (and any suggested qty derived from it) would be **wrong** — worse than the honest stub.

---

## E. Options

- **Option A — client-side runtime bring-up + source-DTO port.** Load the UMD runtime in `index.html` (dependency order) + port a client `source→DTO` builder from the page's scoped DB reads + call `resolveRecommendationFactsFromSource` + render `recommendedQty`. **Cost:** large ("recreate the source pipeline", which the round says to avoid); still yields **no** Coverage/DOS/Projected/Reason (runtime gaps); browser load-order + global-wiring risk.
- **Option B — server-side read-API seam (the correct long-term architecture).** A read-only API action runs the existing runtime server-side and returns recommendation lines; the page fetches + renders. **Cost:** needs **API + Apps Script** changes (forbidden this round) and interacts with **F1-7 / D-1**.
- **Option C — wire only the genuinely-produced Suggested Qty client-side.** Rejected: requires the QI/incoming pipeline (absent) → wrong number, or a full DTO build (= Option A).
- **Option D — build the missing Coverage/DOS/Projected/Reason runtime.** Rejected: forbidden formula/runtime build (this is F1-4B/F1-5 territory, not F1-4A).

---

## F. Recommendation (next authorized slice)

F1-4A as scoped — *connect all target columns from existing runtime* — is **not achievable**: the connectable output is essentially **Suggested Qty only**, and even that needs a pipeline the page lacks, while Coverage/DOS/Projected/Reason **do not exist** in the runtime. Recommended split, each separately authorized because each crosses a currently-forbidden boundary:

- **F1-4B (recommended first): a read-only recommendation API seam.** Authorize a server-side read endpoint that runs the existing runtime (no new formula) and returns `{ lines:[{ sku, recommendedQty, calculatedGap, blockedReason }] }`; the page replaces the `suggestedQty`/`onTheWay` stubs with these values. This is Option B — the canonical architecture — and needs an explicit API/Apps Script authorization (and coordination with F1-7/D-1).
- **F1-5 (separate): a Coverage / DOS / Projected-Inventory engine.** A new pure module consuming the ledger output (opening → +qualified incoming − forecast → closing; target-stock coverage; DOS) — the genuine formula build for the four missing outputs. This is explicitly a **formula round**, out of F1-4A's "connection only" scope.

Until then, the page's honest stubs (`onTheWay:0`, `suggestedQty:0`, `status:'Sufficient'`) are **preferable to a wrong runtime number** and must remain.

---

## G. Governance

No formula rewrite, no new runtime, no recommendation logic, no API/DB/schema/Apps Script change, no UI change, no bundle change. Read-only audit; docs-only checkpoint. No live DB accessed. No push, no deploy.
