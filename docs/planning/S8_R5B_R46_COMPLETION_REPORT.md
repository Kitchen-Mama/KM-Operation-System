# S8-R5B-R46 — AVG SALES CONTRACT + FRONTEND REPAINT — COMPLETION REPORT

**Round:** S8-R5-B / R46 · **Date:** 2026-10-08 · **Status:** IMPLEMENTED, NOT SYNCED, NOT DEPLOYED, NOT PUSHED

---

## 1. PRE_HEAD / POST_HEAD

```
PRE_HEAD    cc79baabab97cc133b9ae0f4ff040e3e3e46fc1d
POST_HEAD   3419ca99...  (3 commits)
BRANCH      feature/product-strategy-board-p0
ORIGIN/MAIN 6b9735e7642eda2963295cf2db970052dfe808f6   (unchanged — 13 commits behind HEAD)
```

## 2. WORKTREE_STATUS

`wt-product-strategy-board-p0`, clean at preflight and clean at report. 623 suites (622 + the new one).

## 3. FILES_CHANGED_BY_ATOMIC_COMMIT

| Commit | Surface | Files |
|---|---|---|
| **`4065ba3`** A — R46 backend | Apps Script + governance | `42_api_v1_recommendation_workspace.gs` · `63_api_v1_system_health.gs` · `_release-order.js` · `fc-target-rule-release-stamp…` · `s7-r4-production-deploy-surface…` · `DEPLOYMENT_RELEASE_LOG.md` · **new** `avg-sales-both-planning-models-r46.test.js` |
| **`a8ce1ac`** B — frontend repaint | browser | `inventory-replenishment.js` · `index.html` · `app.js` · `_release-order.js` · `sales-velocity-live-path…` · `site-switch-stale-scope-guard…` |
| **`3419ca9`** C — release fallout | tests + diagnostic pin | `action-registry-and-router-completeness…` · `advanced-sheets-service-enable-transition…` · `b1-date-normalization-bridge-removal…` · `inventory-eu-sales-basis…` · `product-strategy-visual-integration…` · `sales-horizon-reconciliation…` · `TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs` |

No DB. No production write. No Priority / Admin / 3PL / Event-capture / Request-Order / Option-C change.

---

## 4. R46_BACKEND_RELEASE_MANIFEST

```
RELEASE ID                       F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R46
OWNERS (stamped)                 63_api_v1_system_health.gs            (SYS_BUILD_VERSION_)
STAMPLESS OWNERS (copied)        42_api_v1_recommendation_workspace.gs — declares no build symbol
CARRIED                          60_ stays R45 · 01_ stays R41
PIN FOLLOWED                     R6R7_ACTIVATION_BUILD_ + TEMP_E3_CENSUS_BUILD_ → R46
ACTION_CONTRACT_VERSION          18 — unchanged        REQUIRED_ACTION_LIST_VERSION  14 — unchanged
BUNDLE_REBUILD_REQUIRED          NO — no assets/js/core module changed; KMCALC untouched
APPSSCRIPT_MANIFEST_CHANGE       NO       DB_SCHEMA / WRITES / DELETES   NONE / 0 / 0
STATUS                           PREPARED, NOT SYNCED, NOT DEPLOYED
```

## 5. FRONTEND_RELEASE_MANIFEST

```
FILES                            inventory-replenishment.js (guard + rename), index.html, app.js
CACHE TOKEN                      s8r2-renderintegrity-20261008 → r46-avgsales-20261008
                                 55 refs (index.html) + 8 refs (app.js); ROUND_TOKENS append-only
IR-CSS TOKEN                     irrestinglayout-20261008 — UNCHANGED, no stylesheet byte moved
AUDITS                           staleRouteAssetTokenRefs [] · misplacedReleaseTokens [] · misplacedIndexTokens []
ORDER                            publish ONLY AFTER R46 is synced (see §17)
```

---

## 6. H2E_FLOOR_BEFORE_AFTER

**Before** — one literal, and a new authorized file could not be expressed:
```js
eq(runtimeGsBetween(R42_POST_SHA, 'HEAD'), [60_, 63_], 'H2e …EXACTLY the two runtime files R43 owns…');
```

**After** — still an **equality**, now assembled from a named floor and a named delta:
```js
var AUTHORIZED_FLOOR = [60_, 63_];                  // R43/R44/R45 — immutable
var R46_DELTA        = [42_];                       // the ONLY approved addition
eq(CHANGED_SINCE_R42, AUTHORIZED_FLOOR.concat(R46_DELTA).sort(), 'H2e …');
AUTHORIZED_FLOOR.forEach(f => ok(CHANGED_SINCE_R42.indexOf(f) !== -1, 'H2e-floor …'));
ok(R46_DELTA.every(f => CHANGED_SINCE_R42.indexOf(f) !== -1), 'H2e-delta …');
```

It was **not** widened into membership. Membership would accept any fourth file riding along — exactly the
fault that caught the `allocation_priority` default in S8-R2. The floor is additionally asserted
**member-by-member**, so a future round cannot swap a floor member out for a new file and keep the count.

## 7. H2E_UNAUTHORIZED_DELTA_TEST

```js
var H2E_UNAUTHORIZED = CHANGED_SINCE_R42.concat(['…/01_router.gs']).sort();
ok(JSON.stringify(H2E_UNAUTHORIZED) !== JSON.stringify(AUTHORIZED_SINCE_R42), 'H2e-unauth …');
ok(JSON.stringify(AUTHORIZED_FLOOR.sort()) !== JSON.stringify(AUTHORIZED_SINCE_R42), 'H2e-unauth2 …');
```
→ **both pass.** A fourth Apps Script file is still rejected, and the R46 delta is proven to be a real
addition rather than a no-op cut. `s7-r4-production-deploy-surface`: **106 passed / 0 failed, 12 mutants,
0 survived.**

---

## 8. BACKEND_RESOLVER_RESULT

Root cause was **line 675**, not 699 — the resolver was never *called* for forecast-driven, so 699 had
nothing to publish.

```js
// before
if (planModel === 'sales_driven') { var sr = recoWsResolveSalesRate_(…); if (sr.ok) salesRate = …; else salesReason = …; }
mLine.horizonBasis = { demandMode: planModel, avgSalesPerDay: (planModel === 'sales_driven' ? salesRate : null), … };

// after
var sr = recoWsResolveSalesRate_(snaps, scope, sku, calc.calculationDate);     // every SKU, both modes
if (planModel === 'sales_driven') { if (sr.ok) salesRate = sr.avgSalesPerDay; else salesReason = …; }
mLine.horizonBasis = { demandMode: planModel, avgSalesPerDay: (sr.ok ? sr.avgSalesPerDay : null),
  source, warning, normalDayCount, excludedDates, horizonOpeningQty, qualifiedIncomingCount };
```

The WAREHOUSE branch (`:736`) is deliberately untouched — it emits no `horizonBasis`, and the frontend
reads `MARKETPLACE` lines only.

## 9. BACKEND_PERFORMANCE_DELTA

Measured, not assumed. `recoWsResolveSalesRate_` performs **no I/O** — it reads already-loaded `snaps.*`.
Its cost is four `recoWsToRowObjects_` materialisations per call:

```
one resolver call (4 table materialisations)           ~2.0 ms
120-SKU scope, ALL sales_driven   — today AND after      240 ms     (unchanged)
120-SKU scope, ALL forecast_driven — today                 0 ms
120-SKU scope, ALL forecast_driven — after               240 ms
```

**Bounded, not unbounded:** the worst case is unchanged. A forecast-only scope now pays what a sales-only
scope has always paid. No new network fetch is introduced.

**Flagged, not fixed:** the four table conversions are SKU-independent and are repeated per SKU. Hoisting
them out of the loop is a real optimisation — and a refactor of the resolver's internals, which §6 excludes
from this round. Recorded as a follow-up.

---

## 10-11. FORECAST_DRIVEN / SALES_DRIVEN_REPAINT_RESULT

The frontend defect was proven by executing the guard, before and after:

```
                                                      BEFORE   AFTER
sales_driven, rate 12.4                                 YES     YES
forecast_driven, rate null  (unresolved)                 NO      NO
forecast_driven, rate 12.4  (what R46 now delivers)      NO     YES   ← the defect
forecast_driven, rate 0     (confirmed zero)             NO     YES
result for ANOTHER scope                                 NO      NO   ← F1A guard intact
```

`_irRecoHasSalesDrivenBasis_` → `_irRecoHasCanonicalBasis_`: the old name asserted the thing that was
wrong. One re-render, not one per line.

## 12. STALE_RESPONSE_GUARD

`_irResultMatchesAppliedScope_` is still evaluated **first**, before any basis is inspected, so a result
belonging to another site still never repaints — asserted in two suites
(`site-switch-stale-scope-guard-s8-r4d-f1a` B5, and a dedicated scope-mismatch case in the LIVE9V suite).
Epoch guards, filter scope and marketplace scope are untouched. `!= null` (never `> 0`) preserves the
confirmed-zero-vs-unavailable distinction.

## 13. PLANNING_INPUT_PARITY

Asserted seven ways (§F of the new suite), all passing:

- `salesRate` / `salesReason` still assigned **only** under `sales_driven`
- `recoWsBuildHorizons_(…, planModel, salesRate)` call site **byte-identical**
- KMHP still receives `avgSalesPerDay: (mode === 'sales_driven' ? … : null)`
- the `sales_driven && salesRate === null` fail-closed horizon guard intact
- `horizonsBlockedReason` cannot report `SALES_BASIS_UNAVAILABLE` for a forecast SKU
- no Target Rule token anywhere in the changed region
- mutant X3 proves a `salesRate` leak into the forecast path is caught

## 14. NORMALIZATION_DIAGNOSTICS

All five fields already existed on the resolver's return (`42_:322`). **Nothing invented, nothing mapped,
no second normalization engine.** An unresolved basis leaves every field `null` — never a fabricated 0,
never an unlabelled weekly substitution.

---

## 15. TARGETED_TEST_RESULTS

```
avg-sales-both-planning-models-r46 (NEW)      49 passed, 0 failed   6 mutants caught
  fixture A: 28 normal @10 + Campaign @100 + Event @200 → 10 exactly, normalDayCount 28
             without the activity records the same sales give 19.33 → the exclusion is load-bearing
  valid zero 0/30 days · missing observations 28 not 30 · low sample warns · fallback weekly_7d÷7 = 100 labelled
  cross-company and cross-marketplace isolation both hold
sales-velocity-live-path (RESURRECTED)        15 passed, 0 failed
site-switch-stale-scope-guard-s8-r4d-f1a      ALL PASS
s7-r4-production-deploy-surface              106 passed / 0 failed, 12 mutants, 0 survived
fc-target-rule-release-stamp                 107 passed, 0 failed, 19 mutants, 0 survived, vacuity clean
controlled-no-action-activation-manifest     512 passed, 0 failed, 41 mutants, 0 survived
action-registry-and-router-completeness      208 passed, 0 failed
product-strategy-visual-integration          116 passed, 0 failed, 14 mutants, 0 survived
advanced-sheets-service-enable-transition     50 passed, 0 failed, 18 mutants, 0 survived, vacuity clean
b1-date-normalization-bridge-removal          61 passed, 0 failed
inventory-eu-sales-basis                      24 passed, 0 failed
sales-horizon-reconciliation                  22 passed, 0 failed
atomic-release-cache-identity                 75 passed, 0 failed
```

## 16. REGRESSION_BASELINE_DIFF

Full canonical sweep run twice (worktree isolated, no concurrent task — §7's precondition).

```
SUITES                623   (622 + 1 new)
^FAIL-LINE SUITES       6   = BASELINE_FAILURE_SET exactly, FAIL lines BYTE-IDENTICAL per suite
NEW FAILURES            0
```

**The baseline itself was understated, and this round corrected the measurement.** The sweep detector greps
`^FAIL`; a suite that throws before printing exits 1 while emitting no `FAIL` line, so it counts as neither
a pass nor a failure. This sweep captured **exit codes as well**:

```
uncounted-failure suites   BEFORE this round  12
                           AFTER              11     (one repaired)
```

Eleven of the twelve are `ReferenceError`s from F1A-era harnesses that inject free variables by name and
were never told about `_irResultMatchesAppliedScope_` / `_irAppliedScopeKey_`. All pre-existing at
`0511b9b`. One — `sales-velocity-live-path` — was repaired because this round renamed its subject; leaving
it dead would have hidden this change behind someone else's breakage. The remaining ten are **reported, not
touched**: that is its own round.

```
co1100r-live-hydration-closure-f1-7n-fb-4g-a0   expanded-planning-atomic-reveal-f1-7n-fb-4g-a1
execution-plan-explicit-intent-f1-7n-fc-1b-e1   gap-materialized-read-f1-4b-fm5r1
inventory-horizon-ui-f1-4b-fm4br                inventory-outlook-containment-f1-4b-fm6
recommendation-production-cutover-f1-4b-fm2b    recommendation-session-cache-f1-4b-fm3a
replen-recommendation-cutover-f1-4b-b           sales-velocity-authority-f1-4b-fm5r4jlive9
live-readback-and-display-closure-f1-7n-fb-4e-r4b   (78 passed / 3 failed, prints no ^FAIL line)
```

**Seven suites the cut disturbed — all repaired, none by rewriting an expectation to make a failure go away:**

| Suite | Why it fired | Repair |
|---|---|---|
| `controlled-no-action-activation-manifest` | **my omission** — R45's ledger says the activation pins move with the release | pins → R46 |
| `b1-date-normalization-bridge-removal` | asserted at HEAD that the release **is** R45 | G2/G3/G4a → floors; **G1/G4 kept exact** (they are about 60_, carried at R45) |
| `inventory-eu-sales-basis` | asserted the **defect** as the contract | restated: planning basis sales-only, resolver not, warehouse path unchanged |
| `sales-horizon-reconciliation` | matched the old `horizonBasis` literal | restated + asserts the new quality fields |
| `product-strategy-visual-integration` | declared changed-file register | `42_` declared with a reason |
| `action-registry-and-router-completeness` | owned-file register | `42_` declared with a reason |
| `advanced-sheets-service-enable-transition` | **VACUOUS**, not failed — detector hardcoded `[60_, 63_]` | compares **mentions vs declarations**; no owner list, round-independent |

## 17. R45_R46_RELEASE_DEPENDENCIES

**R45 is cut but was never synced**, and that drives the whole paste plan.

```
ORDER OF OPERATIONS
  1. git push                        (user)
  2. paste 42_, 63_  AND R45's still-pending 60_   → ONE paste set, three files
  3. new Web App version on the EXISTING Web App
  4. verify system.health: deployment_release = R46, module_sync.verdict = UNIFORM
     60_ reporting SIR_BUILD_VERSION_ = R45 is CORRECT, not stale — it is carried
  5. ONLY THEN publish the frontend (token r46-avgsales-20261008)
```

**Why that order.** Backend-first leaves the page exactly as it is today (`--`) until the frontend lands —
nothing regresses. Frontend-first would have the page ask for a field the deployed backend still withholds,
which is also harmless but gains nothing. There is no window in which anything is worse than today.

R45 and R46 keep **separate identities** although they travel together: folding them would re-label R45's
60_ work as R46 and leave an acceptance unable to say which tree it measured.

## 18. GIT_PUSH_READINESS

**READY, NOT PERFORMED.** 13 commits ahead of `origin/main`; `origin` unchanged; worktree clean.

```
cd "C:/Users/viczh/Desktop/KM/品牌資源/Vibe Coding/Operation System/wt-product-strategy-board-p0"
git log origin/main..HEAD --oneline
git diff origin/main HEAD --stat
git push origin feature/product-strategy-board-p0        # USER runs this
```

## 19. APPS_SCRIPT_SYNC_READINESS

**PREPARED, NOT SYNCED, NOT DEPLOYED.** Paste set and verification in §17. No `clasp`, no auto-deploy.

## 20. PRODUCTION_SMOKE_PLAN

On a scope holding at least one **Forecast-Driven** SKU with sales history:

1. `horizonBasis.avgSalesPerDay` is a number and `horizonBasis.source` names the §22 rung.
2. The Avg Sales/day cell resolves from `--` to that number after the async workspace read lands.
3. A **Sales-Driven** SKU in the same scope is unchanged.
4. `horizons[].demandQty` for **both** modes is byte-identical to the pre-R46 values — planning did not move.
5. Switching site mid-flight does not paint the previous site's rate.

## 21. ROLLBACK_PLAN

Backend: revert `42_` to the R45 tree, re-sync; the field returns to `null` and the page returns to `--`.
Frontend: revert the one-line guard, rotate the token back. **No DB state, snapshot or draft is touched by
either half**, so rollback is a pure code revert with no data repair.

---

## 22. CARRY_FORWARD_REGISTER

**DONE** = implemented *and* accepted with evidence · **LANDED-UNRELEASED** = implemented, locally verified,
not synced/deployed · **WITHHELD** = implemented then withdrawn · **OPEN** = not implemented.

| # | Item | Status | Evidence / blocker |
|---|---|---|---|
| 1 | Render integrity — `data-leaf-span` | **LANDED-UNRELEASED** | `2c7f64f` |
| 2 | Stale Notice removal | **LANDED-UNRELEASED** | `2c7f64f` |
| 3 | Marketplace registry refresh after CREATE | **LANDED-UNRELEASED** | `2c7f64f` |
| 4 | **Avg Sales frontend/backend parity** | **LANDED-UNRELEASED** (both halves) | `4065ba3` + `a8ce1ac`; 49 + 15 assertions; **not synced, not published** |
| 5 | Marketplace CREATE default priority | **WITHHELD** | `0511b9b`; needs own cut **and** rank activation |
| 6 | Priority census and activation | **OPEN** | census is a production read; R5-E |
| 7 | Administration ordering interface | **OPEN** | greenfield; no Administration page exists; D-16 unowned |
| 8 | 90-day engine adoption in IR | **OPEN** | KMHP exists; IR still 18-day aggregate; R5-F |
| 9 | 45-day Monday capture | **OPEN** | shipped offset 30d, no snap; generated `90_`; D-15 |
| 10 | Campaign/Event SSOT dedup | **OPEN** | D-13 |
| 11 | Capture vs consumption date separation | **OPEN** | D-14; blocks R5-F |
| 12 | AI Support parity | **OPEN — follows automatically** | already on KMHP; **its `42_` half lands with R46** |
| 13 | Daily Rank allocation | **OPEN** | R5-G; must ship with R5-E |
| 14 | Fractional demand accumulation | **OPEN — contract settled** | KMHP already behaves this way |
| 15 | Coverage Days | **OPEN** | no coverage output in KMTPP |
| 16 | Hybrid fulfillment resolver parity | **OPEN** | 1 of 3 conformant; D-10, D-11 |
| 17 | Option C stock display | **OPEN** | per-row column model; R5-H |
| 18 | Request Order company isolation | **OPEN** | R5-C |
| 19 | First Search transport timeout | **OPEN** | `1433295` |
| 20 | Second-layer lazy-loading performance | **OPEN** | not investigated |
| 21 | FC Summary stability | **OPEN** | not investigated |
| 22 | Regression and deployment acceptance | **ACTIVE** | baseline holding; **R45 + R46 both pending sync** |
| 23 | `showSection is not defined` | **OPEN** | carried |
| 24 | `DIAGNOSTIC_REQUEST_BODY_LOSS` | **OPEN** | carried |
| 25 | COLD_BOOT_LATENCY / ASSET_503 debt | **OPEN** | carried |
| **26** | **Ten suites dead on ReferenceError** | **NEW — OPEN** | F1A harness dependency; uncounted by the `^FAIL` detector |
| **27** | **Sweep detector counts only `^FAIL`** | **NEW — OPEN** | exit codes now captured by the driver; the detector itself is unchanged |
| **28** | **Resolver repeats 4 table materialisations per SKU** | **NEW — OPEN** | ~240 ms / 120-SKU scope; hoist is a separate refactor |

**Nothing promoted to DONE.** Item 4 is implemented and verified but unsynced and unpublished, which is
LANDED-UNRELEASED, not DONE.

## 23. NEXT_ATOMIC_TASK

**Operator action first:** push, then sync R46 + R45's pending `60_` as one paste set, then publish the
frontend, then run §20.

**Then, and it is a genuine choice:**

- **R5-C — Request Order company isolation.** Zero dependencies, display-only blast radius, closes a
  cross-company correctness defect. The smallest safe next step.
- **Item 26 — the ten dead suites.** Not a feature, but every round from here is measured against a
  baseline that has been silently wrong, and this round is the one that found out.

R5-A / R5-F remain gated on D-13 / D-14 / D-15; R5-D on D-16; R5-G on R5-E.

---

### STOP GATE HONOURED

No push. No main merge. No Apps Script sync or deployment. No production DB change. No rank activation.
No unrelated runtime modification.
