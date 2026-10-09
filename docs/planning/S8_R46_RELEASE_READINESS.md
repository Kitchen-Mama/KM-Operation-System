# S8-R46 — CONTROLLED RELEASE READINESS

**Round:** S8-R46-READINESS · **Date:** 2026-10-09 · **Verified at:** `c88420e`
**Nothing was pushed, merged, synced, deployed, or written to Production in this round.**

---

## 1. RELEASE_READINESS_STATUS

# READY_FOR_USER_RELEASE

All gates pass. No blocked commit is present. One correction to the previous report's framing is in §3.

## 2. HEAD / BRANCH / WORKTREE

```
HEAD                                    c88420ecc946e0ee447786e60776aa773cd07679
BRANCH                                  feature/product-strategy-board-p0
WORKTREE                                wt-product-strategy-board-p0 — CLEAN
origin/main                             6b9735e7642eda2963295cf2db970052dfe808f6
origin/feature/product-strategy-board-p0  cc79baa
ahead of origin/main                    14      behind  0      ff-only VALID
ahead of its own remote branch          4
```

All four expected R46 refs verified present: `4065ba3`, `a8ce1ac`, `3419ca9`, `c88420e`.

**Worktrees:** the main checkout (`Operation System/Operation System`, at `6b9735e`), this one, and
`C:/km-lb` (`lane-b-impl-phase1`) — **never to be modified**, and untouched.

## 3. FOURTEEN_COMMIT_MANIFEST

**Correction to the previous report.** "14 commits unpushed" is true **of `main`**. It is not true of the
feature branch: `origin/feature/product-strategy-board-p0` already holds ten of them, so **only four are
unpushed anywhere**. That changes what the push command does and is stated here rather than carried
forward silently.

| # | Commit | Files | Surface | Classification |
|---|---|---|---|---|
| 1 | `1433295` | 2 | doc + tool | DOC/TEST ONLY — **already on remote branch** |
| 2 | `5210c42` | 1 | doc | DOC/TEST ONLY — already on remote branch |
| 3 | `f7694e6` | 2 | doc + test | DOC/TEST ONLY — already on remote branch |
| 4 | `a5c09c3` | 1 | doc | DOC/TEST ONLY — already on remote branch |
| 5 | `96d8283` | 3 | doc | DOC/TEST ONLY — already on remote branch |
| 6 | `2c7f64f` | 12 | **frontend** + gs + tests | **COORDINATED RELEASE** — frontend half; its `03_` edit is reverted by #7 |
| 7 | `0511b9b` | 3 | gs + test + doc | **WITHDRAWAL** — restores `03_` to `origin/main` byte-for-byte |
| 8 | `b181514` | 2 | doc + tool | DOC/TEST ONLY — already on remote branch |
| 9 | `3999f6e` | 1 | doc | DOC/TEST ONLY — already on remote branch |
| 10 | `cc79baa` | 1 | doc | DOC/TEST ONLY — already on remote branch (**= remote tip**) |
| 11 | `4065ba3` | 7 | **Apps Script** + tests + ledger | **REQUIRES PREREQUISITE DEPLOYMENT** — R46 paste + new version |
| 12 | `a8ce1ac` | 6 | **frontend** + tests | **COORDINATED RELEASE** — publish only after #11 is synced |
| 13 | `3419ca9` | 7 | tests + diagnostic pin | TEST/GOVERNANCE ONLY |
| 14 | `c88420e` | 1 | doc | DOC/TEST ONLY |

**Net Apps Script change vs `origin/main` = exactly two files:** `42_`, `63_`. Commits #6 and #7 add and
then withdraw the `03_` change, so it nets to zero.

## 4. BLOCKED_COMMITS_IF_ANY

**NONE.** Audited explicitly:

```
03_master_data_handlers.gs vs origin/main      IDENTICAL  (withheld default absent)
allocation_priority CREATE default present     NO
priority comparators inverted (Rank activated) NO  — still b−a descending, old semantics
apps-script files changed vs origin/main       42_, 63_  (and nothing else)
DB migration / production write in any commit  NONE
```

The `allocation_priority = 100` default remains **WITHHELD** and double-gated: it needs its own cut *and*
the Rank allocator. Nothing in these 14 commits activates it.

## 5. R45_R46_APPS_SCRIPT_PASTE_SET

**Three files. R45 was never synced, and that is why `60_` is in the set.**

| Order | File | Owner | Why it is in the set |
|---|---|---|---|
| 1 | `42_api_v1_recommendation_workspace.gs` | **R46** (stampless) | the Avg Sales correction; declares no build symbol |
| 2 | `63_api_v1_system_health.gs` | **R46** (`SYS_BUILD_VERSION_`) | carries the release identity — where a release is cut |
| 3 | `60_api_v1_inventory_replenishment_workspace.gs` | **R45** (carried) | R45's date-normalization fix, **committed and pushed on 2026-10-07 (`6d36500`) but never pasted** |

**`60_` must continue to report `SIR_BUILD_VERSION_ = …R45`.** That is correct, not stale: it did not change
in R46, and marching it would claim a round it had no part in.

**No additional Apps Script file is required.** `appsscript.json` is unchanged — no advanced service, no
OAuth scope, no Web App setting, no timezone. No bundle rebuild (`90_` untouched; no `assets/js/core`
module changed, so KMCALC is byte-identical).

**Not in the paste set, deliberately:** `TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs`. Its pins were moved to
R46 (required by the R45 ledger — a diagnostic expecting an older build refuses a healthy deployment), but
it is a tooling-directory diagnostic pasted only when the operator runs that census, not every release.
The `tmp/…_LIVE_PASTE.gs` copy is pinned at R2 and is an archived artifact that gate J3a confirms "cannot
reach production" — its stale pin is expected and bound by nothing.

**Destination:** the EXISTING Production Apps Script project. Do not create a second Web App.

## 6. SHA256_SOURCE_MANIFEST

```
42_api_v1_recommendation_workspace.gs            235cabf09f659819a23ed6137a86701225bacb8a16da4db550d917470d1460bb    86,573 bytes
63_api_v1_system_health.gs                       91c9d1bf5a5958e584a67931eeee6dae67060bcf268f109979d90801208d07fa   141,423 bytes
60_api_v1_inventory_replenishment_workspace.gs   697589edd732d09ff17d9312a222da27a2deaf96f488c4b13175a6d28cffa0ab    80,247 bytes
```

Verify each file's hash after pasting, before creating the version. A hash mismatch means the paste
truncated — which is the one failure mode a visual check reliably misses.

## 7. H2E_GATE_RESULT

```
s7-r4-production-deploy-surface              106 passed / 0 failed   mutants 12, survived 0
  H2e           authorized set = FLOOR {60_, 63_} + DELTA {42_}, compared by EQUALITY
  H2e-floor     each floor member asserted present individually
  H2e-delta     the R46 delta asserted present
  H2e-unauth    a FOURTH Apps Script file is still REJECTED
  H2e-unauth2   the delta is a real addition, not a no-op cut
fc-target-rule-release-stamp                 107 passed, 0 failed, 19 mutants, 0 survived, vacuity clean
controlled-no-action-activation-manifest     512 passed, 0 failed, 41 mutants, 0 survived   (pins → R46)
atomic-release-cache-identity                 75 passed, 0 failed
advanced-sheets-service-enable-transition     50 passed, 0 failed, 18 mutants, 0 survived, vacuity clean
b1-date-normalization-bridge-removal          61 passed, 0 failed   (R45 lineage preserved; G1/G4 exact)
action-registry-and-router-completeness      208 passed, 0 failed
product-strategy-visual-integration          116 passed, 0 failed, 14 mutants, 0 survived
avg-sales-both-planning-models-r46            49 passed, 0 failed    6 mutants caught
```

## 8. REGRESSION_EXIT_CODE_BASELINE

Measured with **both** signals, because neither alone is sufficient.

```
TOTAL SUITES EXECUTED                 623     (622 + the new R46 suite)
EXIT-CODE ZERO                        607
EXIT-CODE NONZERO                      16
^FAIL-LINE SUITES                       6     = BASELINE_FAILURE_SET exactly, byte-identical
NEW FAILURES                            0
```

**Decomposition of the 16 nonzero:**

```
 5  known FAIL-line failures that also exit nonzero
11  SILENT — exit 1, print no FAIL line
```

**And the inverse blind spot:** `s2-r4b-shipping-history-and-fc-warm-race` prints a `FAIL` line and
**exits 0**. So the two detectors each miss something the other catches. **Union of not-clean suites = 17.**

**The eleven silent suites — preserved as future repair, NOT fixed in this round:**

```
co1100r-live-hydration-closure-f1-7n-fb-4g-a0      expanded-planning-atomic-reveal-f1-7n-fb-4g-a1
execution-plan-explicit-intent-f1-7n-fc-1b-e1      gap-materialized-read-f1-4b-fm5r1
inventory-horizon-ui-f1-4b-fm4br                   inventory-outlook-containment-f1-4b-fm6
recommendation-production-cutover-f1-4b-fm2b       recommendation-session-cache-f1-4b-fm3a
replen-recommendation-cutover-f1-4b-b              sales-velocity-authority-f1-4b-fm5r4jlive9
live-readback-and-display-closure-f1-7n-fb-4e-r4b  ← not dead: 78 passed / 3 FAILED, prints no ^FAIL
```

Ten are `ReferenceError`s from F1A-era harnesses that inject free variables by name and were never told
about `_irResultMatchesAppliedScope_` / `_irAppliedScopeKey_`. All pre-existing at `0511b9b`.

**Baseline attribution:** none of the 17 is attributable to R46. The 6 FAIL-line suites are the frozen
`BASELINE_FAILURE_SET` with byte-identical FAIL lines; the 11 silent ones were already in that state before
this round began. **No silent nonzero exit is described here as passing.**

## 9. FRONTEND_RELEASE_MANIFEST

```
FILES PENDING PUBLICATION (vs origin/main)
  index.html
  assets/js/app.js
  assets/js/pages/inventory-replenishment.js
  assets/html/pages/inventory-replenishment.html

CACHE TOKEN   s8r2-renderintegrity-20261008 → r46-avgsales-20261008
              index.html  55 refs      app.js  8 refs      old token remaining: 0
              staleRouteAssetTokenRefs []   misplacedReleaseTokens []   misplacedIndexTokens []
IR-CSS TOKEN  irrestinglayout-20261008 — UNCHANGED (no stylesheet byte moved)
```

**Five behaviours ship in one frontend publication:**

| Behaviour | Commit | Needs R46 backend? |
|---|---|---|
| Render integrity — `data-leaf-span` structural again | `2c7f64f` | no |
| Stale Notice removal | `2c7f64f` | no |
| Marketplace registry refresh after CREATE | `2c7f64f` | no |
| Avg Sales canonical display (opens at `--`, both modes) | `2c7f64f` | **yes** — shows `--` until R46 is live |
| Forecast-/Sales-Driven async repaint + stale guard | `a8ce1ac` | **yes** |

**No separate release or additional acceptance is required for the first three** — they are independent of
R46 and have been locally verified since S8-R2. They are bundled here only because they share the token.

## 10. EXACT_GIT_PUSH_COMMANDS

Branch upstream is `origin/feature/product-strategy-board-p0`; `origin/main` is an ancestor of HEAD, so a
fast-forward is valid and no merge commit is needed.

```bash
cd "C:/Users/viczh/Desktop/KM/品牌資源/Vibe Coding/Operation System/wt-product-strategy-board-p0"
git status
git log origin/main..HEAD --oneline
git diff origin/main HEAD --stat

# A1 — publish the 4 new commits on the feature branch
git push origin feature/product-strategy-board-p0

# A2 — fast-forward main (run from the MAIN checkout, per CLAUDE.md)
cd "C:/Users/viczh/Desktop/KM/品牌資源/Vibe Coding/Operation System/Operation System"
git fetch origin
git merge --ff-only origin/feature/product-strategy-board-p0
git push origin main
```

If A2's `--ff-only` refuses, **stop** — it means `main` moved and the lineage needs re-checking, not a
merge commit.

## 11. EXACT_APPS_SCRIPT_SYNC_ORDER

Open the **EXISTING** Production Apps Script project. Paste whole-file contents, in this order:

```
1.  42_api_v1_recommendation_workspace.gs            sha256 235cabf0…60bb   86,573 B
2.  63_api_v1_system_health.gs                       sha256 91c9d1bf…07fa  141,423 B
3.  60_api_v1_inventory_replenishment_workspace.gs   sha256 697589ed…a0ab   80,247 B   ← R45, never synced
```

Then **Deploy → Manage deployments → EXISTING Web App → Edit → New version → Deploy.**
Do not create a second Web App. Do not use `clasp`.

**Editor-applied:** none. `appsscript.json` is unchanged — verify, do not paste.

## 12. DEPLOYMENT_VERIFICATION_STEPS

Call `system.health` and confirm:

```
deployment_release                      F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R46
module_sync.verdict                     UNIFORM
63_  SYS_BUILD_VERSION_                 …R46
60_  SIR_BUILD_VERSION_                 …R45      ← CORRECT, it is CARRIED, not stale
01_  RTR_BUILD_VERSION_                 …R41      ← unchanged
action contract version                 18        required-action list  14
runtime_authority.advanced_services.sheets   true  (R44 dependency, must remain)
```

**Only after all five are confirmed, publish the frontend.** Backend-first means nothing regresses: the
page shows what it shows today until the frontend lands.

## 13. PRODUCTION_SMOKE_CHECKLIST

Read-only. **No production write acceptance is authorized.**

| # | Check | Pass condition |
|---|---|---|
| 1 | R46 deployment release | `deployment_release = …R46` |
| 2 | Module sync uniformity | `module_sync.verdict = UNIFORM` |
| 3 | R45 `60_` carried | `SIR_BUILD_VERSION_ = …R45`, and sync reports no mismatch |
| 4 | Forecast-Driven Avg Sales | resolves from `--` to a number after the async read lands |
| 5 | Sales-Driven Avg Sales | unchanged from before the release |
| 6 | Campaign / Event exclusion | `horizonBasis.source` names the §22 rung; `excludedDates` lists activity dates |
| 7 | Valid zero vs unavailable | a confirmed-zero SKU shows `0.0`, an unresolved one shows `--` — never `0` for unknown |
| 8 | No stale async repaint | switch site mid-flight; the previous site's rate never paints |
| 9 | No Planning Demand change | `horizons[].demandQty` byte-identical to pre-R46 for **both** modes |
| 10 | No Suggested Qty change | `suggestedOrderQty` byte-identical for the same scope |
| 11 | FC Summary stable | loads and renders; no new console error |
| 12 | No new runtime errors | browser console clean apart from the known `showSection is not defined` |

Checks 9 and 10 are the ones that matter most — they are what "planning demand is untouched" means in
Production rather than in a test.

## 14. ROLLBACK_COMMANDS

**Backend** — re-paste the three files as of `origin/main` before this release, then a new version:

```bash
cd "C:/Users/viczh/Desktop/KM/品牌資源/Vibe Coding/Operation System/wt-product-strategy-board-p0"
git show 6b9735e:assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs > /tmp/rb_42.gs
git show 6b9735e:assets/specs/active/apps-script/63_api_v1_system_health.gs            > /tmp/rb_63.gs
# paste both, create a new version; 60_ needs no rollback (R45 content is unchanged by R46)
```

**Frontend** — republish the previous token:

```bash
git revert --no-commit a8ce1ac && git revert --no-commit 2c7f64f   # or redeploy the prior published tree
```

**Git** — these are local commits on a feature branch; if nothing has been pushed, rollback is
`git reset --hard cc79baa`. After pushing, prefer `git revert` over history rewriting.

**No DB state, snapshot, or draft is touched by either half**, so rollback is a pure code revert with no
data repair. This is the property that makes the release low-risk.

## 15. CARRY_FORWARD_REGISTER

**DONE** requires runtime or acceptance evidence. **Nothing is DONE in this round** — nothing was deployed.

| # | Item | Status |
|---|---|---|
| 1 | Render integrity — `data-leaf-span` | **RELEASED** — R46 published and served |
| 2 | Stale Notice removal | **RELEASED** — R46 published and served |
| 3 | Marketplace registry refresh | **RELEASED** — R46 published and served |
| 4 | Avg Sales front/back parity | **RELEASED — FUNCTIONAL ACCEPTANCE OPEN.** Both halves are deployed and served (`_irRecoHasCanonicalBasis_` present in Production), but neither planning model has been behaviourally verified. NOT DONE. |
| 5 | Marketplace CREATE default priority | WITHHELD — own cut + Rank allocator |
| 6 | Priority census and activation | OPEN — production read; R5-E |
| 7 | Administration ordering interface | OPEN — greenfield; D-16 unowned |
| 8 | 90-day engine adoption in IR | OPEN — KMHP exists; R5-F |
| 9 | 45-day Monday capture | OPEN — shipped offset 30d; generated `90_`; D-15 |
| 10 | Campaign/Event SSOT dedup | OPEN — D-13 |
| 11 | Capture vs consumption separation | OPEN — D-14; blocks R5-F |
| 12 | AI Support parity | OPEN — its `42_` half ships with R46 |
| 13 | Daily Rank allocation | OPEN — R5-G, must ship with R5-E |
| 14 | Fractional demand accumulation | OPEN — contract settled |
| 15 | Coverage Days | OPEN — no coverage output in KMTPP |
| 16 | Hybrid fulfillment resolver parity | OPEN — 1 of 3 conformant |
| 17 | Option C Site Inventory | OPEN — per-row column model; R5-H |
| 18 | Request Order company isolation | OPEN — R5-C |
| 19 | First Search transport timeout | OPEN |
| 20 | Lazy-loading performance | OPEN |
| 21 | FC Summary stability | OPEN |
| 22 | Regression / deployment acceptance | **ACTIVE** — R45 + R46 both SYNCED (60_ reports R45 with `matches_expected` = true). Deployment identity ACCEPTED; functional acceptance OPEN |
| 23 | `showSection is not defined` | OPEN |
| 24 | `DIAGNOSTIC_REQUEST_BODY_LOSS` | OPEN |
| 25 | COLD_BOOT_LATENCY / ASSET_503 debt | OPEN |
| **26** | **Ten silently dead suites** (F1A harness dependency) | **OPEN — explicit future repair, untouched this round** |
| **27** | **Exit-code-aware regression harness** | **OPEN** — driver captures exit codes; the detector is still FAIL-line-based |
| **28** | **Vacuous-test detection** | **OPEN** — M12 was vacuous, not failing; only two suites self-report vacuity |
| **29** | **Full baseline attribution** | **OPEN** — true not-clean count is 17, not 6 |
| **30** | **Resolver repeats 4 table materialisations per SKU** | **OPEN** — ~240 ms / 120-SKU scope; hoist is a separate refactor |
| **31** | **UTF-8 / encoding integrity of tracked documents** | **OPEN — R47 scope.** A latin1 write in `4065ba3` put invalid UTF-8 in the release ledger and silently broke GitHub Pages for two builds. No gate existed to catch it |

## 16. NEXT_ATOMIC_TASK

**Immediate — operator, in this order:** §10 push → §11 paste (three files) → new version → §12 verify →
publish frontend → §13 smoke. Then report Production evidence so items 1–4 can move to DONE.

**Then, by my recommendation, item 26/27 before any new feature work.** Every round from here is measured
against a baseline that has been reporting 6 when the truth is 17. R5-C (Request Order company isolation)
is the smallest feature-bearing alternative and remains unblocked.

---

### STOP GATE HONOURED (historical — superseded by §17)

No Git push. No merge. No Apps Script sync. No deployment. No Production DB write.
**Awaiting user execution and Production evidence.** — The user has since executed the release and
returned that evidence; it is recorded in §17.

---

## 17. RELEASE CLOSURE — PRODUCTION EVIDENCE RECEIVED (S8-R46 CLOSURE R1)

### 17.1 Blockers now CLOSED

| Blocker | Status | Evidence |
|---|---|---|
| GitHub Pages publication | **CLOSED** | Recovered after the UTF-8 ledger repair `3fae8a6`. `index.html`, `app.js`, `inventory-replenishment.js` all HTTP 200 |
| Frontend serves R46 | **CLOSED** | R46 cache token present in `index.html` and `app.js` |
| Repaint fix actually served | **CLOSED** | `_irRecoHasCanonicalBasis_` PRESENT, superseded `_irRecoHasSalesDrivenBasis_` ABSENT — the served code, not merely the committed code |
| Apps Script sync (42_, 63_) | **CLOSED** | live `system.health`: 63_ = R46, release = R46 |
| R45 pending 60_ sync | **CLOSED** | 60_ `SIR_BUILD_VERSION_` = R45 with `matches_expected` = true |
| Deployment identity / uniformity | **CLOSED** | `deployment_uniformity_verdict` = UNIFORM, `mixed_deployment` = false, 01_ router = R41 |
| Backend reachability | **CLOSED** | `router_ready` = `db_reachable` = `schema_ready` = true, `missing_actions` = [], served by doGet/GET, `read_only` = true, `db_writes` = 0 |

**One caveat recorded against that last row.** `missing_actions = []` is **self-referential** (`missing_actions_is_self_referential: true`): a deployment that predates an action cannot report it
missing. It is **not** an independent complete action census and is not treated as one here.

### 17.2 Production smoke (user-observed)

Site Inventory loads · site switching works · FC Summary loads · no JavaScript exceptions observed.

This is a **reachability and stability** smoke. It exercises no Avg Sales arithmetic, so it closes no
functional acceptance item below.

### 17.3 Acceptance still OPEN — none of this is PASS

| Item | Status |
|---|---|
| Forecast-Driven normalized Avg. Sales UI behaviour | **OPEN** — not independently verified |
| Sales-Driven normalized Avg. Sales UI behaviour | **OPEN** — not independently verified |
| Planning demand / suggested-quantity parity | **OPEN — NOT VERIFIED** |
| Unconnected Marketplace acceptance | **DEFERRED_S8_FINAL** |
| 90-day shared 3PL allocator | **NOT ACTIVATED** |
| Administration Priority | **NOT ACTIVATED** |

**R46 Production Acceptance therefore remains OPEN.** The release identity is proven; the behaviour the
release exists for is not. The original acceptance condition is unchanged and still unmet: one Production
read of a scope holding at least one Forecast-Driven SKU with sales history, where
`horizonBasis.avgSalesPerDay` is a number and `horizonBasis.source` names the §22 rung, while
`horizons[].demandQty` for both modes is unchanged against pre-R46 values.

### 17.4 Regression baseline — UNCHANGED

The 17-suite not-clean baseline in §8 stands exactly as recorded, with its categories intact: **6** FAIL-line
suites (the frozen `BASELINE_FAILURE_SET`), **11** silent nonzero exits, union **17**, and the inverse case
(`s2-r4b-shipping-history-and-fc-warm-race`, FAIL line with exit 0). Nothing in this closure round touched a
test, a stamp or a cache token, so no number in §8 moves.
