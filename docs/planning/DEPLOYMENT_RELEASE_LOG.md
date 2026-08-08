# Deployment Release Log

> Append-only ledger of production/verification releases. Governed by `DEPLOYMENT_RELEASE_GOVERNANCE.md`.
> Do **not** enter fake production values. A commit that has not been pushed/deployed is recorded as **NOT DEPLOYED**.
> Git push and Apps Script deployment are separate explicit steps — record each when it actually happens.

---

## Entry — 2026-08-04 · RG-1 Manual Release Control (audit + guardrail)

```
Release ID:                  RG-2026-08-04-manual-release-control
Environment:                 (none — NOT DEPLOYED, NOT PUSHED)
Git branch:                  main
Git state:                   local ahead 41 / behind 0 vs last-known origin/main 0ea7838 (all local-only, unpushed)
Auto-push found:             NO (LOCAL_COMMIT_ONLY) — no hooks / no Actions / no clasp / no scripts / no VS Code task / no push alias
External candidates:         GitHub Desktop, VS Code "Sync" or user-level git.postCommitCommand, cloud folder sync (user-machine, not in repo)
Ownership frozen:            AUTOMATIC_REMOTE_WRITE=PROHIBITED · DEFAULT_BOUNDARY=LOCAL_COMMIT_ONLY · PUSH_OWNER=USER · APPS_SCRIPT_SYNC_OWNER=USER · DEPLOYMENT_OWNER=USER
Changed files:              CLAUDE.md (new — REMOTE WRITE PROHIBITION); DEPLOYMENT_RELEASE_GOVERNANCE.md §0; DEPLOYMENT_RELEASE_LOG.md   → all GIT_ONLY / DOCUMENTATION_ONLY
Apps Script files synced:    NONE
Deployment:                  NONE
Smoke-test result:           n/a — governance/instruction only; no business code changed
Notes:                       No remote command executed this round. User next action = review, then manually `git push origin main` if desired (see CLAUDE.md / §0).
```

**STATUS: NOT DEPLOYED · NOT PUSHED.**

---

## Reusable entry template

```
Release ID:
Environment:                 (verification-copy | production | frontend-pages)
Git branch:
Git commit:
Git commit subject:
Changed files:
Apps Script files synced:     (only APPS_SCRIPT_SYNC_REQUIRED files)
Bundle source changed:        (yes/no)
Bundle hash:                  (sha256, if bundle part of release)
Apps Script project:
Apps Script deployment version:
Frontend deployment:          (Pages commit/version, if applicable)
Database migration:           (none | migrationId)
Migration ID:
Backup reference:
Deployed by:
Deployment time:
Smoke-test scope:
Smoke-test result:
Known limitations:
Rollback version:
Rollback result:
Notes:
```

---

## Entry — 2026-08-04 · FC Special-Event persistence + sidebar + governance

```
Release ID:                  R-2026-08-04-fc-event-persistence
Environment:                 (none — NOT DEPLOYED)
Git branch:                  main
Git commit:                  <this round's checkpoint commit>
Git commit subject:          fix(fc): persist special events and refine release-safe navigation ui
Changed files:
  - assets/css/layout.css                                  GIT_ONLY + FRONTEND_GITHUB_PAGES_REQUIRED
  - assets/css/pages/fc-overview.css                       GIT_ONLY + FRONTEND_GITHUB_PAGES_REQUIRED
  - assets/js/pages/fc-summary.js                          GIT_ONLY + FRONTEND_GITHUB_PAGES_REQUIRED
  - assets/js/api/operation-system-db-api.js               GIT_ONLY + FRONTEND_GITHUB_PAGES_REQUIRED
  - assets/specs/active/apps-script/14_fc_write_handlers.gs   APPS_SCRIPT_SYNC_REQUIRED
  - assets/specs/active/apps-script/01_router.gs              APPS_SCRIPT_SYNC_REQUIRED
  - assets/tests/fc-special-event-persist.test.js          GIT_ONLY (test)
  - docs/planning/DEPLOYMENT_RELEASE_GOVERNANCE.md         DOCUMENTATION_ONLY
  - docs/planning/DEPLOYMENT_RELEASE_LOG.md                DOCUMENTATION_ONLY
  - docs/planning/API_MIGRATION_MASTER_PLAN.md             DOCUMENTATION_ONLY
Apps Script files synced:    NONE (not deployed)
Bundle source changed:       no  (no assets/js/core/*.js changed → 90_generated_*.gs NOT rebuilt/synced)
Bundle hash:                 n/a
Apps Script project:         (not synced)
Apps Script deployment version: (none)
Frontend deployment:         (not deployed to GitHub Pages)
Database migration:          none
Migration ID:                n/a
Backup reference:            n/a
Deployed by:                 n/a
Deployment time:             n/a
Smoke-test scope:            n/a (local Node tests only; see Completion Report)
Smoke-test result:           NOT DEPLOYED
Known limitations:           Special-Event edit requires event_fc_id + campaign_id on the row (legacy rows
                             without them fail closed, honest error). Batch handler + router are
                             APPS_SCRIPT_SYNC_REQUIRED and untested against a live deployment.
Rollback version:            n/a
Rollback result:             n/a
Notes:                       Deployment deferred to explicit user-controlled release. When released:
                             (1) push commit + verify remote hash; (2) sync ONLY 14_fc_write_handlers.gs
                             and 01_router.gs into Apps Script (verify no other .gs overwritten);
                             (3) confirm bound Spreadsheet identity; (4) create a deployment version;
                             (5) redeploy GitHub Pages for the frontend (fc-summary.js / css / api);
                             (6) smoke-test on the verification copy first.
```

**STATUS: NOT DEPLOYED.**

---

## Entry — 2026-08-08 · F1-4B-FM5-R4V Materialized Gap production-release VERIFICATION

```
Release ID:                  FM5-R4V-2026-08-08-materialized-gap-release-verification
Environment:                 (none — NOT DEPLOYED, NOT PUSHED; verification + release-set audit only)
Git branch:                  main
Git commit:                  04c8276 (HEAD)  ·  origin/main 060ff70  ·  local 3 ahead / 0 behind
Unpushed production delta:   6306a49 (R3 scheduler) · 8ede5fa (R3 lifecycle test) · 04c8276 (R4 calc-context)
Code defect found:           NO (full local suite 124 pass; 1 pre-existing UNRELATED UI fail replen-header-toggle A2)
Complete LIVE Apps Script sync set (HEAD versions — must be live TOGETHER, no mixed versions):
  - 90_generated_supply_planning_bundle.gs   35 modules · sha256 41d64956a28ad4a774bf5792cfec4436435d56fc54f2a3c56a66d8c0758a678f · --check PASS · owners KMDR/KMTPP/KMHP/KMCID/KMMSA/KMALLOC/KMQI/KMSF/KMCALC/KMPA/KMPS present   (@1b05619, pushed)
  - 01_router.gs                              registers recommendation.workspace.get · inventoryReplenishmentGap.get/.recalculate.all · orderPlanningGap.get/.recalculate.all   (@a00058b, pushed)
  - 42_api_v1_recommendation_workspace.gs     KMMSA opening-supply composition + R4 injected calc-context consumer   (@777c1ef, pushed)
  - 43_api_v1_gap_materialization.gs          R4 canonical calc-context owner + gap batch orchestration + UPSERT/read   (@04c8276, UNPUSHED)
  - 44_gap_materialization_scheduler.gs       R3/R4 scheduler entry points + installer   (@04c8276, UNPUSHED, NEW)
Complete frontend (GitHub Pages) set:         operation-system-db-api.js · inventory-replenishment.js/.html · request-order.js/.html/.css · km-api-foundation.js  — ALL already in origin/main (NO frontend file changed since origin/main; no new Pages deploy triggered by R3/R4)
Bundle source changed this delta:            no (no assets/js/core/*.js changed → 90_generated_*.gs NOT rebuilt; last bundle change @1b05619, pushed)
Gap tables (existing; NOT mutated):          inventory_replenishment_gap · order_planning_gap · business key company+country+marketplace+sku · latest-state UPSERT (insert/update, no history append)
Scheduler installer:                         installGapMaterializationTriggers_ manages ONLY runDailyInventoryGapMaterialization + runDailyOrderPlanningGapMaterialization; NEVER touches runAmazonSnapshotImports; requires project timezone Asia/Taipei
Trigger timing semantics:                    Apps Script time triggers are best-effort WINDOWS, not exact minutes (atHour+nearMinute ≈ ±15 min). Inventory targets 13:30, OP targets 03:30 Asia/Taipei
Calc context:                                deterministic Asia/Taipei (Inventory=Day D · OP 03:30=previous day); NO Script Property required or mutated for scheduled OR manual gap runs
WEEKLY_RECOMMENDATION_OWNER:                 SOURCE_MISSING (not built)
MATERIALIZED_GAP_CLEANUP_OWNER:              SOURCE_MISSING (deferred maintenance slice)
Apps Script files synced:                    NONE (not deployed)
Frontend deployment:                         NONE (not deployed)
Database migration:                          none
Deployed by:                                 n/a
Smoke-test result:                           NOT DEPLOYED (local Node tests only)
Notes:                                       USER release sequence: (1) git push origin main; (2) sync the 5 .gs files above into the bound Apps Script project (verify no other .gs overwritten; confirm bound Spreadsheet identity); (3) create an Apps Script deployment version; (4) redeploy GitHub Pages from current main; (5) manual dry-run runDailyInventoryGapMaterialization()/runDailyOrderPlanningGapMaterialization() from the editor; (6) then attach the two time triggers (or run installGapMaterializationTriggers_) with project TZ = Asia/Taipei.
```

**STATUS: NOT DEPLOYED · NOT PUSHED — release set identified, USER-owned sync/deploy pending.**
