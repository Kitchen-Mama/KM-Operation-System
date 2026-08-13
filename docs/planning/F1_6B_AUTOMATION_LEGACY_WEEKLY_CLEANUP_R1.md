# F1-6B-AUTOMATION-LEGACY-WEEKLY-CLEANUP-R1 — Remove the retired `runWeeklyRecommendation` shim

**Outcome: IMPLEMENTED (bounded cleanup; no HALT).** Baseline HEAD `33a4a54`. The legacy self-retiring compatibility
shim `runWeeklyRecommendation()` is **fully removed** from the active Apps Script runtime (47_), while the canonical
trigger-sweep authority (45_) and the config-migration (45_) are **preserved unchanged**. No recommendation/gap/
scheduling/persistence behavior touched. Owner: [`47_`](../../assets/specs/active/apps-script/47_api_v1_recommendation_generation.gs).

## §0 Audit — every `runWeeklyRecommendation` reference, classified
| Location | Ref | Class | Action |
|---|---|---|---|
| `47_`:149 | `function runWeeklyRecommendation()` (self-retiring shim) | **B legacy shim** | **REMOVED** |
| `45_`:45 | `AUTOMATION_RETIRED_HANDLERS_ = ['runWeeklyRecommendation']` | **C trigger sweep (string)** | KEEP |
| `45_`:185/220/321 + `automationSweepRetiredTriggers_` / `automationHandlerDeletable_` | retired-handler delete on Save & Apply | **C** | KEEP |
| `45_` `automationReadConfig_` | legacy `weeklyRecommendation` config → `weeklyInventoryRecommendation` | **D config migration** | KEEP |
| `49_`:17/55/384 | comments + the DISTINCT `continueWeeklyRecommendationJob` constant | **E docs/comment** | KEEP |
| tests (admin, split) | string-based sweep assertions | **E test** | KEEP (still valid) |
| `weekly-recommendation-scheduler-f1-6a-r1.test.js` | extracted+executed the shim | **E test** | **UPDATED** (now asserts absence) |

**§0 verifications:** 1. `AUTOMATION_JOBS_` has no `weeklyRecommendation` (✓, allowlist length 5). 2–5. `weeklyInventoryRecommendation`/`monthlyOrderRecommendation` + `runWeeklyInventoryRecommendation`/`runMonthlyOrderRecommendation` are canonical (✓). **6. No active runtime caller requires `runWeeklyRecommendation`** — it was only an external trigger target; no source `call` exists; it is not in the registry (✓ → safe to remove). **7. Migration intact** — the `weeklyRecommendation`→`weeklyInventoryRecommendation` migration is a **config-key** operation in 45_ `automationReadConfig_`, independent of the removed function (✓). **8. Live-trigger cleanup intact** — `automationSweepRetiredTriggers_` + `AUTOMATION_RETIRED_HANDLERS_` + `automationHandlerDeletable_` delete a live `runWeeklyRecommendation` trigger by **handler name string** on every Save & Apply, independent of the function (✓). No `LEGACY_WEEKLY_RUNTIME_DEPENDENCY_GAP` → no HALT.

## What changed
- **`47_`** — deleted `function runWeeklyRecommendation()` (the shim + its self-delete call). Replaced with a comment documenting the full removal and pointing to the 45_ sweep + migration owners. `runWeeklyInventoryRecommendation` / `runMonthlyOrderRecommendation` are untouched and unrenamed.
- **Tests** — updated the f1-6a migration test to assert the shim is **absent** (and that the 45_ sweep remains); added `automation-legacy-weekly-cleanup-f1-6b-r1.test.js` (26 assertions, §6 A–L).

## §9 Completion report
1. PRE HEAD `33a4a54`. 2. POST HEAD this commit. 3. References found = see §0 table. 4. Classification = §0. 5. Shim safe to remove = **YES** (§0 #6/#7/#8 proven). 6. Files changed = `47_` + f1-6a test (updated) + new cleanup test + this doc. 7. Function removed = `runWeeklyRecommendation()`. 8. Legacy trigger cleanup owner = 45_ `automationSweepRetiredTriggers_` (via `AUTOMATION_RETIRED_HANDLERS_` + `automationHandlerDeletable_`, invoked by every `handleAutomationScheduleUpdate_`). 9. Config migration remains (45_ `automationReadConfig_`) — still needed to reinterpret an old stored `weeklyRecommendation` block as Weekly Inventory; it can NEVER surface a schedulable `weeklyRecommendation` job or create the legacy handler. 10. Final active registry = `amazonImport`, `inventoryGap`, `orderPlanningGap`, `weeklyInventoryRecommendation`, `monthlyOrderRecommendation` (5). 11. Final active trigger handlers = `runAmazonSnapshotImports`, `runDailyInventoryGapMaterialization`, `runDailyOrderPlanningGapMaterialization`, `runWeeklyInventoryRecommendation`, `runMonthlyOrderRecommendation` (+ transient `continue…Job`). 12. Legacy handler NOT creatable = `automationHandlerAllowed_('runWeeklyRecommendation')` false + `createTrigger` returns null (TEST_VERIFIED F). 13. Weekly = INVENTORY only (handler scan; test H). 14. Monthly = ORDER_PLANNING only (test I). 15. Monthly default day 10 (registry; test J). 16. Prerequisite gates unchanged — Weekly gap-DONE-gated INVENTORY runtime, Monthly BLOCKED when OP gap not ready (test K). 17. Focused tests = cleanup 26/26 · f1-6a 12/12 · admin 57/57 · split 33/33 · persistence 45/45 · UI grouping 33/33. 18. Full regression = **214 files, only the 4 known baseline failures** (none new). 19. Apps Script sync = **YES** (`47_`). 20. New Web App version = **not required by this change alone** (no `01_router` action changed; the removed function is a trigger target, not a routed action) — but fold it into the pending cumulative deployment (`F1_PHASE1_LIVE_DEPLOYMENT_CLOSURE_R1.md`) which already mandates a new version. 21. Frontend deploy = NO. 22. Bundle rebuild = NO (`47_` is a handler file, not a bundle source; bundle unchanged `aaf5b07`, --check PASS). 23. DB/schema impact = NONE. 24. USER live steps = below. 25. Commit = chat.

## §8 USER live cleanup steps
1. Sync `47_api_v1_recommendation_generation.gs` into the bound Apps Script project (or re-sync all 49 `.gs` per the pending deployment closure) → **Save**.
2. (If deploying alongside the pending cumulative sync: create a new Web App deployment version. This change alone needs no new /exec version — no router action changed.)
3. Administration → Automation Schedule → **Save & Apply** the canonical automation cards → the reconciler sweeps any live `runWeeklyRecommendation` trigger.
4. Apps Script → Triggers → verify **`runWeeklyRecommendation` trigger count = 0** (canonical five remain, ≤1 each).
5. Apps Script editor → function selector → verify **`runWeeklyRecommendation` is no longer listed**. (Agent does not claim live verification.)

## FINAL GATE — all ✓
`runWeeklyRecommendation` runtime function absent ✓ · legacy trigger cannot be created (`automationHandlerAllowed_`=false) ✓ ·
existing legacy trigger can be swept (`automationSweepRetiredTriggers_`) ✓ · `weeklyInventoryRecommendation` canonical ✓ ·
`monthlyOrderRecommendation` canonical ✓ · Weekly Inventory Gap prerequisite preserved ✓ · Monthly Order Gap prerequisite
preserved ✓ · Monthly day 10 preserved ✓ · no second engine/scheduler/persister ✓ · no unrelated behavior changed ✓.

**STOP after F1-6B-AUTOMATION-LEGACY-WEEKLY-CLEANUP-R1.**
