# S8-R5-B — AVG SALES BACKEND CONTRACT CORRECTION — PREFLIGHT (NOT IMPLEMENTED)

**Round:** S8-R5-B · **Date:** 2026-10-08 · **Status:** **STOPPED AT PREFLIGHT — TWO BLOCKERS**
**Boundary:** no file edited. No runtime, no Apps Script, no DB, no sync, no deployment, no push.

> **Why this round stopped rather than shipped.** The task's own gates require it. §5: *"If frontend
> changes are required, stop and report the necessary release scope before editing."* §8: *"If backend
> correction requires broader changes than the identified contract boundary, stop and report."* §12:
> *"Implement only the approved atomic backend correction **if preflight confirms scope and safety**."*
> Preflight did not confirm safety. Both blockers are proven by execution below, not by reading.

---

## 1. PRE_HEAD / POST_HEAD

```
PRE_HEAD    3999f6ecf3e6d6c1aef843de691ecbc4aa304fc7
POST_HEAD   (this document only — no runtime or Apps Script file touched)
BRANCH      feature/product-strategy-board-p0
ORIGIN/MAIN 6b9735e7642eda2963295cf2db970052dfe808f6
AHEAD       9 commits — confirmed as the task states
```

## 2. WORKTREE_STATUS

`wt-product-strategy-board-p0`, clean at preflight and clean at report. 622 suites.

## 3. FILES_CHANGED

**None.** This document is the only artifact. The prepared patch in §5 is **not applied**.

---

## 4. ROOT_CAUSE

**The defect is at line 675, not 699.** Line 699 is where it becomes visible; 675 is where it is created.

```js
// 42_api_v1_recommendation_workspace.gs:675  — the gate
var planModel = recoWsResolvePlanningModel_(snaps, scope, sku);
var salesRate = null, salesReason = null;
if (planModel === 'sales_driven') { var sr = recoWsResolveSalesRate_(...); if (sr.ok) salesRate = sr.avgSalesPerDay; ... }
                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// the canonical §22 resolver is never CALLED for forecast_driven — so there is nothing to publish at 699

// 42_:699 — the symptom
mLine.horizonBasis = { demandMode: planModel, avgSalesPerDay: (planModel === 'sales_driven' ? salesRate : null), ... };
```

A historical performance metric was scoped to a planning-mode branch. Nothing is wrong with the
normalization engine: `recoWsResolveSalesRate_` already returns **all five** required fields
(`42_:322`) — `avgSalesPerDay`, `source`, `warning`, `normalDayCount`, `excludedDates`. **No diagnostic
needs to be invented or mapped** (§4's fallback clause does not apply).

The same gate exists in the WAREHOUSE branch at `:736`. The warehouse branch emits **no** `horizonBasis`
at all (`horizonBasis` appears exactly once in `42_`, at :699), and the frontend reads only
`destinationType === 'MARKETPLACE'` lines — so the warehouse branch is out of scope for the display fix.

---

## 5. BACKEND_CONTRACT_BEFORE_AFTER — the prepared patch (NOT APPLIED)

```diff
   var planModel = recoWsResolvePlanningModel_(snaps, scope, sku);
   var salesRate = null, salesReason = null;
-  if (planModel === 'sales_driven') { var sr = recoWsResolveSalesRate_(snaps, scope, sku, calc.calculationDate); if (sr.ok) salesRate = sr.avgSalesPerDay; else salesReason = (sr.reason || 'SALES_BASIS_UNAVAILABLE') + (sr.detail ? ': ' + sr.detail : ''); }
+  // S8-R5-B — Avg Sales is a HISTORICAL metric, independent of planning mode. Resolve the canonical §22
+  // basis for EVERY SKU so Forecast-Driven can display it. PLANNING is untouched: salesRate (the demand
+  // basis) and salesReason (the fail-closed horizon reason) are still assigned ONLY under sales_driven,
+  // so recoWsBuildHorizons_ and the horizonsBlockedReason path receive byte-identical inputs.
+  var sr = recoWsResolveSalesRate_(snaps, scope, sku, calc.calculationDate);
+  if (planModel === 'sales_driven') { if (sr.ok) salesRate = sr.avgSalesPerDay; else salesReason = (sr.reason || 'SALES_BASIS_UNAVAILABLE') + (sr.detail ? ': ' + sr.detail : ''); }
@@
-    mLine.horizonBasis = { demandMode: planModel, avgSalesPerDay: (planModel === 'sales_driven' ? salesRate : null),
-      horizonOpeningQty: horizonOpening, qualifiedIncomingCount: (mIncoming || []).length };
+    // avgSalesPerDay is now the canonical §22 HISTORICAL rate for BOTH modes. `demandMode` remains the
+    // discriminator for what drove the horizon: sales_driven → this rate IS the planning basis;
+    // forecast_driven → planning ran on regular FC + Target%, and this value is historical only.
+    mLine.horizonBasis = { demandMode: planModel, avgSalesPerDay: (sr.ok ? sr.avgSalesPerDay : null),
+      source: (sr.ok ? sr.source : null), warning: (sr.ok ? sr.warning : null),
+      normalDayCount: (sr.ok ? sr.normalDayCount : null), excludedDates: (sr.ok ? sr.excludedDates : null),
+      horizonOpeningQty: horizonOpening, qualifiedIncomingCount: (mIncoming || []).length };
```

**Why this shape.** `salesRate` currently carries two jobs — planning basis and display value. The patch
splits them: `sr` (the full resolver result) serves display; `salesRate` keeps serving planning and is
still only populated under `sales_driven`. `salesReason` likewise stays sales-only, so a Forecast-Driven
SKU whose horizon fails for an unrelated reason can never be mislabelled `SALES_BASIS_UNAVAILABLE`.

**Cost note:** `recoWsResolveSalesRate_` now runs for every SKU rather than only sales-driven ones. It
reads already-loaded snapshots (no extra fetch), but it is not free. Unmeasured — flagged, not assumed.

---

## 6-7. FORECAST_DRIVEN / SALES_DRIVEN_AVG_SALES_RESULT

**NOT PRODUCED — the patch is not applied.** Expected under §6 fixture A (28 normal days @ 10, one
Campaign day @ 100, one Special Event day @ 200): **both modes = 10**, because both would consume the
identical frozen `KMCALC.normalizedAvgSalesPerDay` call with identical inputs. The §22 engine was verified
correct by 44 assertions in `avg-sales-event-exclusion-audit-s8-r1.test.js` (S8 audit round) — the
exclusion logic is not in question; only its reachability was.

## 8. NORMALIZATION_DIAGNOSTICS

All five fields exist at source (`42_:322`) and need no mapping:

| Field | Origin | Fabrication risk |
|---|---|---|
| `avgSalesPerDay` | `KMCALC.normalizedAvgSalesPerDay` | none |
| `source` | same owner | none |
| `warning` | same owner (`low_sample_warning`, `insufficient_normal_days`) | none |
| `normalDayCount` | same owner | none |
| `excludedDates` | same owner | none |

**No second normalization algorithm is created.** `42_` marshals inputs only (`:191` states this
explicitly); the patch does not change that.

---

## 9. FRONTEND_COMPATIBILITY — **BLOCKER 1, PROVEN BY EXECUTION**

The frontend passthrough landed in S8-R2 and is correct: `_irRecoReadLine` (:13637-13656) carries all five
fields, and `_irCanonicalSalesBasis_` (:13715) returns the MARKETPLACE line's `horizonBasis`.

**But the repaint that delivers it is gated on the planning mode.** `_irRecoHasSalesDrivenBasis_`
(:14217) requires `demandMode === 'sales_driven'`, and `_irRecoRefreshVelocityCells_` (:14224) is the
**only** post-async re-render of the main table — `_irRecoRerenderSummaries` and
`_irRecoUpdateSuggestedCells` do not touch the velocity cells, as the comment at :14211 states.

Extracted both functions from source and executed them:

```
Does the main table repaint when the canonical rate arrives?
  sales_driven,    rate 12.4   (today)                 repaint fires: YES
  forecast_driven, rate null   (today, BEFORE fix)     repaint fires: NO
  forecast_driven, rate 12.4   (AFTER backend fix)     repaint fires: NO
```

**Consequence: the backend correction alone does not fix the defect.** S8-R2 made the pre-canonical
display `--` (correctly — never an unnormalized weekly fallback). A Forecast-Driven scope would receive a
valid canonical rate from the corrected API and **still show `--` indefinitely**, because the table is
never re-rendered. The API would be right and the screen would be wrong.

**Required frontend change (one line, not applied):**

```diff
-    for (var i = 0; i < ls.length; i++) { var b = ls[i] && ls[i].horizonBasis; if (b && b.demandMode === 'sales_driven' && b.avgSalesPerDay != null) return true; }
+    for (var i = 0; i < ls.length; i++) { var b = ls[i] && ls[i].horizonBasis; if (b && b.avgSalesPerDay != null) return true; }
```

with `_irRecoHasSalesDrivenBasis_` renamed to `_irRecoHasCanonicalBasis_` so the name stops asserting
something the function no longer checks. This is a **frontend release surface**, which §8 forbids mixing
with the backend correction — so R5-B becomes **two releases**, not one.

## 10. API_BACKWARD_COMPATIBILITY

Shape-compatible: no field added to or removed from the response envelope; `horizonBasis` gains four
fields that the frontend already reads and tolerates as `null`. The only semantic change is that
`avgSalesPerDay` carries a number where it previously always carried `null` for forecast-driven lines.

Audited every consumer of that field for a null-as-mode-proxy dependency:

| Consumer | Guard | Affected? |
|---|---|---|
| `_irCanonicalSalesBasis_` (:13724) | `destinationType === 'MARKETPLACE' && horizonBasis` | no — mode-agnostic by design |
| `_irRecoReadLine` (:13639) | `_irNumOrNull` | no |
| `_irRecoHasSalesDrivenBasis_` (:14221) | `demandMode === 'sales_driven' && avgSalesPerDay != null` | **checks mode FIRST — does not misfire, but also never fires** → Blocker 1 |

No consumer breaks by gaining a value. One consumer fails to act on it.

---

## 11. TEST_RESULTS

**No test was run against a changed file, because no file was changed.** The §6 A–N matrix is specified
and ready; it cannot produce evidence until the two blockers are resolved. Marking any of A–N as passing
now would be fabricated acceptance evidence.

Pre-existing evidence that remains valid and is **not** re-claimed as R5-B's:

- `avg-sales-event-exclusion-audit-s8-r1.test.js` — 46 assertions, §22 exclusion engine verified correct.
- `render-integrity-and-avg-sales-display-s8-r2.test.js` — 55 assertions, frontend passthrough verified.

## 12. REGRESSION_BASELINE_DIFF

**No diff. No code changed.** Baseline remains 622 suites / 6 failing (`BASELINE_FAILURE_SET`,
byte-identical FAIL lines, last confirmed at `0511b9b`).

Per §9: a full mutation-heavy sweep was **not** run. It rewrites real source files during mutation, and
Part J of R5 forbids running one concurrently with other active work. **Safe alternative used instead:**
targeted execution of the two gates that fired in S8-R2 plus the three directory-census suites, all of
which passed at `b181514`; and direct extraction-and-execution of the two functions under audit, which
proves behaviour without mutating anything.

---

## 13. APPS_SCRIPT_SYNC_REQUIREMENTS — **BLOCKER 2, PROVEN**

**`42_` cannot join the current release.** This is the same trap that forced the withdrawal of the
`allocation_priority` default in S8-R2, and it is enforced by an executable gate:

```js
// assets/tests/s7-r4-production-deploy-surface.test.js:346-349
eq(runtimeGsBetween(R42_POST_SHA, 'HEAD'),
  ['assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs',
   'assets/specs/active/apps-script/63_api_v1_system_health.gs'],
  'H2e SINCE R42 ended, EXACTLY the two runtime files R43 owns have changed');
```

`runtimeGsBetween` is `git diff --name-only` filtered to `assets/specs/active/apps-script/*.gs` (:313-321).
It is an **equality on a set**. Editing `42_` adds a third element → **H2e fails by construction**.

The current prepared release is **R45**, `RELEASE_OWNER_SET = {60_, 63_}`, status **PREPARED, NOT SYNCED,
NOT DEPLOYED**. R5-B therefore needs its **own cut**:

```
RELEASE                       R46 (new)
RELEASE_OWNER_SET             42_api_v1_recommendation_workspace.gs
APPS_SCRIPT_SYNC_REQUIRED     YES — 42_
APPS_SCRIPT_NEW_VERSION_REQD  YES
BUNDLE_REBUILD_REQUIRED       NO — no assets/js/core module changes; KMCALC untouched
DB_SCHEMA_CHANGE / WRITES     NONE / 0
H2e DISPOSITION               must become a FLOOR (stampAtOrAfter), as the R44→R45 comment at :350-355
                              already did for the same reason. That is a release-governance edit, NOT a
                              test rewrite to make a failure go away — and it is the user's call.
```

## 14. RELEASE_OWNER_AND_VERSION

`PUSH_OWNER = USER` · `APPS_SCRIPT_SYNC_OWNER = USER` · `DEPLOYMENT_OWNER = USER`. R46 must be cut, `42_`
stamped, and a new version created on the existing Production Web App. R45 is still pending sync, so the
operator would be carrying two undeployed cuts — a sequencing decision that belongs to the operator.

## 15. CACHE_IMPACT

Backend half: **none** — no browser-served byte changes, no cache token rotation.
Frontend half (Blocker 1): rotates the application token (55 refs in `index.html` + 8 in `app.js`).
IR-CSS unchanged — no stylesheet byte moves.

## 16. PRODUCTION_SMOKE_PLAN

After the operator syncs R46 and publishes the frontend half: open Inventory Replenishment on a scope with
at least one **Forecast-Driven** SKU with sales history; confirm Avg Sales/day resolves from `--` to a
number after the async workspace read lands; confirm the cell's title shows `source` and any `warning`;
confirm a **Sales-Driven** SKU in the same scope is unchanged; confirm D18/D30/D45/D90 gap values are
byte-identical before and after for both modes (planning demand must not move).

## 17. ROLLBACK_PLAN

Backend: revert `42_` to the R45 tree and re-sync; the field returns to `null` for forecast-driven and the
frontend returns to `--`. No DB state, no snapshot, no draft is touched by this change, so rollback is a
pure code revert with no data repair. Frontend: revert the one-line guard and rotate the token back.

---

## 18. REMAINING_BLOCKERS

1. **Release cut** — `42_` needs R46; H2e must be converted from equality to floor by the same precedent
   already applied at R44→R45. **Operator decision.**
2. **Frontend repaint guard** — one line in `inventory-replenishment.js`; §8 forbids bundling it with the
   backend release, so R5-B is two releases. **Operator decision on sequencing.**
3. **Unmeasured cost** — `recoWsResolveSalesRate_` would run for every SKU instead of only sales-driven
   ones. No extra fetch, but unquantified.

## 19. NEXT_ATOMIC_TASK

**R5-B-1 — cut R46 and apply the backend patch**, once the operator authorises the H2e floor conversion.
Then **R5-B-2 — the frontend repaint guard** as its own frontend release. Neither is blocked by any other
S8 decision gate (D-13 … D-16 do not touch this path).

---

## 20. MANDATORY CARRY-FORWARD REGISTER

Status vocabulary: **DONE** = implemented *and* accepted with evidence · **LANDED-UNRELEASED** = implemented
and locally verified, not synced/deployed · **WITHHELD** = implemented then deliberately withdrawn ·
**OPEN** = not implemented.

| # | Item | Status | Evidence / blocker |
|---|---|---|---|
| 1 | Render integrity — `data-leaf-span` structural repair | **LANDED-UNRELEASED** | `2c7f64f`; 55 assertions; not deployed |
| 2 | Stale Notice removal (Gate 1 = A1) | **LANDED-UNRELEASED** | `2c7f64f`; 12 guards individually asserted |
| 3 | Marketplace registry refresh after CREATE | **LANDED-UNRELEASED** | `2c7f64f` |
| 4 | Avg Sales frontend/backend parity | **OPEN — frontend half landed** | frontend `2c7f64f`; backend blocked (§13), repaint blocked (§9) |
| 5 | Marketplace CREATE default priority = 100 | **WITHHELD** | `0511b9b`; needs its own cut; **also gated on rank activation** |
| 6 | Priority census and activation | **OPEN** | census not run (production read); R5-E |
| 7 | Administration ordering interface | **OPEN** | greenfield — no Administration page exists; D-16 authorization unowned |
| 8 | 90-day engine adoption in IR | **OPEN** | engine exists (KMHP); IR still 18-day aggregate; R5-F |
| 9 | 45-day Monday activity capture | **OPEN** | shipped offset is 30d, no Monday snap; lives in generated `90_`; D-15 |
| 10 | Campaign/Event SSOT deduplication | **OPEN** | D-13 — recommend one term keyed on `campaign_sku_line_id` |
| 11 | Event capture vs consumption date separation | **OPEN** | D-14 — KMHP consumes on `prepDate`; A6 forbids it; blocks R5-F |
| 12 | AI Support parity | **OPEN — follows automatically** | already on KMHP; inherits only §13 and the priority direction |
| 13 | Daily Rank allocation | **OPEN** | R5-G; must ship with R5-E or semantics coexist |
| 14 | Fractional demand accumulation | **OPEN — contract settled** | cumulative carry + one boundary; already how KMHP behaves |
| 15 | Coverage Days | **OPEN** | no coverage output exists in KMTPP; formula proposed in R5 §14 |
| 16 | Hybrid fulfillment resolver parity | **OPEN** | 1 of 3 conformant (`42_`); D-10, D-11 |
| 17 | Option C stock display | **OPEN** | blocked on per-row column model; R5-H |
| 18 | Request Order company isolation | **OPEN** | defect confirmed, display-only blast radius; R5-C |
| 19 | First Search transport timeout | **OPEN** | T1 triage `1433295`; coalesced Search inherits a stranger's deadline |
| 20 | Second-layer lazy-loading performance | **OPEN** | carried; not investigated this round |
| 21 | FC Summary stability | **OPEN** | carried; not investigated this round |
| 22 | Regression and deployment safety | **ACTIVE** | baseline 622/6 holding; R45 prepared-not-synced; R46 now also needed |
| 23 | `showSection is not defined` (Production console) | **OPEN** | carried from S8-R4D |
| 24 | `DIAGNOSTIC_REQUEST_BODY_LOSS` (S8-R4D-E5) | **OPEN** | carried |
| 25 | INITIAL_COLD_BOOT_LATENCY_DEBT · ASSET_503_DELIVERY_DEBT | **OPEN** | carried |

**No item was promoted to DONE in this round.** Nothing was implemented, so nothing earned it.

---

### STOP GATE

No production writes. No Apps Script sync or deployment. No git push. No rank activation. No unrelated
runtime modification. **Awaiting release authorization on Blockers 1 and 2 before R5-B is implemented.**
