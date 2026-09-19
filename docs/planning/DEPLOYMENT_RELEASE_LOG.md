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

---

## Entry — 2026-08-10 · F1-4B-FM5-R4J-LIVE5 Gap-runtime production-deployment closure + live verification

```
Release ID:                  FM5-R4J-LIVE5-2026-08-10-gap-runtime-production-closure
Environment:                 (git tracking-ref CLOSED · Apps Script deployment + live verification USER-OWNED, PENDING)
Git branch:                  main
Git HEAD:                    226b027  (feat(execution): F1-4B-FM6-R2 KMREX ... persistence HALTED, schema proposed)
origin/main (local ref):     226b027   ·   0 ahead / 0 behind   ·   working tree clean (before this ledger commit)
Git release closure:         CLOSED at the local remote-tracking ref (origin/main == HEAD). No pending code commits.
                             NOTE: the AUTHORITATIVE remote + the Apps Script live version are USER-owned to confirm;
                             this ledger records the observed local git state, not a remote fetch.
LIVE4 root cause (carried):  WRONG_DEPLOYMENT (deployed backend predated R4J — editor runDailyInventoryGapMaterialization
                             ran ~865s monolithic, impossible under current enqueue-only source) · secondary check TRIGGER_AUTHORIZATION.
                             PROVEN NOT a source defect (job test 134/134 drains 0→1→…→10→DONE; single INV scope ≈86s ≪ 360s limit).

Complete Apps Script release set (HEAD versions — MUST be live TOGETHER; no mixed versions):
  - 01_router.gs                             @5708d15   standalone   routes job.start x2 / gapJob.status.get / job.cancel x2 → 46 handlers
  - 46_api_v1_gap_materialization_job.gs     @5708d15   standalone   durable job lifecycle: start/continue/status/cancel; STALLED+reclaim; Script-Property state; calls 43 slice processors
  - 43_api_v1_gap_materialization.gs         @421765d   standalone   canonical materialized-gap calc: gapProcessScopeSlice_ / gapProcessOrderPlanningScopeSlice_ + UPSERT/read (business logic owner)
  - 44_gap_materialization_scheduler.gs      @421765d   standalone   daily entry points → gapSchedStartJob_ → gapJobStart_ (ENQUEUE-ONLY; NOT the old 865s monolith) + installer
  - 47_api_v1_recommendation_generation.gs   @c2f1131   standalone   recommendation callable; GAP-DONE readiness gate reads 46 job state (depends on 46 live)
  - 90_generated_supply_planning_bundle.gs   @226b027   BUNDLE       37 modules · sha256 02d5a8976b7118a243907b6ce235d5ee9467ad5ce32c25594ed5dc29394098a5 · --check PASS · provides KMREC/KMREX/KMTPP/KMHP/KMMSA/KMALLOC/KMCALC/... used by 42/43/47
Must-be-live-together reason: 47→46 (gapJobReadState_/gapJobDefaultEnv_) · 46→43 (slice processors + pool facts) · 44→46 (gapJobStart_) · 01_router→46/47 · 42/43/47→bundle globals. A partial sync = the LIVE4 stale-mix failure.
Safest sync (drift-proof):   re-sync the ENTIRE assets/specs/active/apps-script/*.gs folder as ONE new deployment version (all .gs share one global scope; headers say "copy together and REDEPLOY"). Do NOT hand-pick a subset.
Bundle source changed:       no assets/js/core/*.js in THIS ledger commit; bundle last rebuilt @226b027 (KMREX added, 36→37 modules)
Continuation handlers (global, name-matched): continueInventoryGapMaterializationJob · continueOrderPlanningGapMaterializationJob
Daily scheduler handlers (global):            runDailyInventoryGapMaterialization · runDailyOrderPlanningGapMaterialization
Trigger isolation guarantee:  installer + job continuation touch ONLY their own handlers; NEVER runAmazonSnapshotImports
Frontend (GitHub Pages) live set: operation-system-db-api.js · gap-recalc-transport.js · inventory-replenishment.js/.html/.css · request-order.js/.html/.css · supply-recommendation.js · supply-execution-handoff.js · index.html  (in main @226b027)
Apps Script project:         bound production project (USER to confirm identity)
Apps Script deployment version: PENDING — USER: Save → New deployment version → verify /exec is production
Project timezone:            MUST be Asia/Taipei (atHour cadence + calc context)
Authorization:               PENDING — USER: run one editor function once to complete ScriptApp/trigger auth (e.g. installGapMaterializationTriggers_)
Database migration:          none
DB/schema impact:            NONE   ·   Formula impact: NONE   ·   Recommendation impact: NONE   (verification round)
Deployed by:                 (pending USER)
Deployment time:             (pending)
Smoke-test scope:            LIVE — Inventory + Order Planning "Recalculate All Sites": START → worker fires (lastWorkerStartedAt set) → scopesProcessed 0→N → DONE → gap.updated_at advances → UI returns to normal; scheduler enqueue-only (editor runDaily returns in seconds, not ~865s)
Smoke-test result:           PENDING (agent cannot execute live Apps Script; USER-owned)
Known limitations:           §3 mid-scope self-heal is the 10-min STALLED backstop (LIVE4), not instant (not the LIVE4 cause; deferred). FM6-R2 recommendation persistence HALTED (recommendation_decisions schema not frozen).
Rollback version:            git → prior release commit; Apps Script → the deployment version live BEFORE this sync (USER: record the current live version id BEFORE creating the new one)
Rollback result:             n/a (not yet deployed)
Notes:                       Git tracking ref shows origin/main == HEAD (no push pending). The OPEN item is the Apps Script
                             deployment + live verification. Do NOT declare FM5 gap-runtime production-closed until the live
                             smoke-test above passes. If 0/N persists post-deploy: read STATUS.lastWorkerStartedAt —
                             null ⇒ trigger not firing (auth/quota/project); non-null + scopesProcessed 0 ⇒ worker runtime (capture lastError). NO speculative code repair before that live proof.
```

**STATUS: GIT CLOSED (origin/main == HEAD) · APPS SCRIPT NOT DEPLOYED · LIVE VERIFICATION PENDING (USER-owned).**

---

## Entry — 2026-08-12 · F1-PHASE1-RELEASE-READINESS-R1 (cumulative Phase-1 deployment reconciliation)

```
Release ID:                  F1-PHASE1-RELEASE-READINESS-R1-2026-08-12-cumulative-phase1-reconciliation
Environment:                 (git tracking-ref CLOSED · Apps Script deployment + live verification USER-OWNED, PENDING)
Git branch:                  main
Git HEAD:                    c7ecc9b  (F1-6B-AUTOMATION-RECOMMENDATION-CLOSURE-R1 split Weekly Inventory / Monthly Order)
origin/main (local ref):     c7ecc9b   ·   0 ahead / 0 behind   ·   working tree clean   (reflog: USER pushes per round)
Verdict:                     B. READY_AFTER_USER_DEPLOYMENT_ACTIONS  (no schema/version/runtime drift; USER deploy+seed+trigger+OAuth pending)
Last DEPLOYED baseline:      226b027 (2026-08-10 FM5-R4J-LIVE5 ledger) — 23 of 49 .gs changed since; MANY new tables/handlers since.

Cumulative Apps Script sync set (drift-proof = re-sync ALL 49 .gs as ONE new deployment version; 23 changed since baseline):
  01_router · 05_overseas_inventory · 12_shipment · 13_procurement · 15_request_allocation · 16_shipping_allocation ·
  22_shipment_dispatch · 24_recommendation_orchestrator · 31_shipment_receipt_route · 32_shipment_line_allocation ·
  33_party_authority · 34_shipment_final_output · 35_shipment_document_renderer · 36_document_template ·
  37_shipment_document_file_renderer · 42_recommendation_workspace · 43_gap_materialization · 45_automation_schedule ·
  46_gap_materialization_job · 47_recommendation_generation · 48_request_order_draft_job · 49_weekly_recommendation_job ·
  90_generated_supply_planning_bundle
Deployment version:          NEW Web App version REQUIRED — 01_router.gs gained new doPost actions (final-output / document /
                             draft-job) + new named trigger targets (runWeeklyInventoryRecommendation ·
                             runMonthlyOrderRecommendation · continueWeeklyRecommendationJob). Router change ⇒ new /exec version.
Bundle:                      CURRENT — 90_generated_supply_planning_bundle.gs · 40 modules ·
                             sha256 aaf5b07f2292f9e876459f38d5c9533f1451357f1781e3e3622684f4c2918782 · build --check PASS. No rebuild.
Frontend (GitHub Pages) set: index.html · api/operation-system-db-api.js · pages/{automation-schedule, global-logistics-map,
                             inventory-replenishment, overseas-stock, request-order, request-order-draft, shipping-history,
                             sku-details}.js · core/supply-planning-*.js (compiled into 90_) · utils/{demo-shared-data,
                             gap-recalc-transport, scope-select-modal}.js · css/{components, pages/global-logistics-map,
                             pages/inventory-replenishment, pages/overseas-stock, pages/request-order}.css ·
                             html/pages/{global-logistics-map, inventory-replenishment, request-order}.html   (ONE redeploy from main)
Schema contract drift:       NONE — shipment_line_allocations=14 · company_legal_entities=22 · document_templates=30 ·
                             document_template_fields=23 · generated_documents=30 · SFO snapshot/line/line_pos present ·
                             request_allocation_draft_id / shipment_received_qty / shipping_plan_line_id present. (source contracts)
DB migration:                USER — provision (if absent live) the 3 SFO snapshot tables + 3 document-runtime tables +
                             company_legal_entities via the R2A-LIVE/R2B/R3B USER-run snippets. Runtime fails closed
                             (SCHEMA_NOT_PROVISIONED) if absent — never silent. Read-only verifier: releaseReadinessVerifySchema_.
Required seed data:          USER — company_legal_entities (KM/ResTW/ResUS active) · logistics_locations (destinations) ·
                             document_templates SHIPDETAIL+PL (real template_file_id, google_sheet, output_folder_id) ·
                             document_template_fields mappings · sku_details/warehouses/tax_referral_rates for the fixture.
Trigger readiness:           5 recurring canonical (runAmazonSnapshotImports · runDailyInventoryGapMaterialization ·
                             runDailyOrderPlanningGapMaterialization · runWeeklyInventoryRecommendation ·
                             runMonthlyOrderRecommendation), max one each, TZ Asia/Taipei; continuation triggers transient-only.
                             Legacy runWeeklyRecommendation NOT in 45_ registry (count 0) + auto-swept on Save & Apply; a lingering
                             LIVE one is USER-deleted. Read-only verifier: releaseReadinessListTriggers_. This audit deletes NOTHING.
OAuth scopes (first-run):    spreadsheets · script.scriptapp (trigger create/delete) · drive (template copy + generated Sheet +
                             folder read) · drive→PDF export (getAs application/pdf + createFile). USER grants once.
Authorization:               PENDING — USER runs one editor function each for ScriptApp + Drive/PDF to grant all scopes pre-E2E.
Residuals (none block core E2E): weekly-inventory persistence not canonical · Last-Run history UI absent · Customs
                             LEGAL_IMPORTER_AUTHORITY_GAP · CI/Booking families · post-dispatch reversal · 4 baseline test failures.
Tests:                       Full regression 212 files — ONLY the 4 known baseline failures (none new). Focused Phase-1 suites green.
DB/schema impact (this round): NONE · Formula impact: NONE · Runtime change: NONE (audit + docs only).
Changed files (this round):  docs/planning/F1_PHASE1_RELEASE_READINESS_R1.md (new) · DEPLOYMENT_RELEASE_LOG.md (this entry). DOCS ONLY.
Deployed by:                 (pending USER)
Next authorized slice:       F1-PHASE1-E2E-FINAL — ONLY after the USER deployment steps + read-only live checks in
                             F1_PHASE1_RELEASE_READINESS_R1.md §28/§29/§30 pass.
Notes:                       Git tracking ref shows origin/main == HEAD (USER pushes per round). OPEN items are ALL USER-owned:
                             full .gs sync + new deployment version, Pages redeploy, live table provisioning + seed data,
                             trigger attach + legacy sweep, OAuth grant. No agent-side production-readiness defect found.
```

**STATUS: GIT CLOSED (origin/main == HEAD) · READY_AFTER_USER_DEPLOYMENT_ACTIONS · APPS SCRIPT NOT DEPLOYED (USER-owned).**

---

## Entry — 2026-08-12 · F1-PHASE1-LIVE-ACCEPTANCE-R1 (live pre-flight — BLOCKED_BY_DEPLOYMENT)

```
Release ID:                  F1-PHASE1-LIVE-ACCEPTANCE-R1-2026-08-12-live-preflight
Git HEAD:                    92b54b0  (F1-PHASE1-E2E-FINAL-R1 acceptance audit)
origin/main (local ref):     92b54b0  ·  0 ahead / 0 behind  ·  working tree clean
Bundle:                      CURRENT — 40 modules · sha256 aaf5b07f2292f9e876459f38d5c9533f1451357f1781e3e3622684f4c2918782 · --check PASS
Verdict:                     C. PHASE1_LIVE_ACCEPTANCE_BLOCKED_BY_DEPLOYMENT
Reason:                      (1) The agent has NO production access — it cannot execute or observe the live Apps Script
                             project / DB / Drive / browser, so it cannot convert any gate to LIVE_VERIFIED. (2) The
                             live Apps Script is NOT confirmed synced to HEAD (this ledger's own latest status =
                             "APPS SCRIPT NOT DEPLOYED"; last deployed baseline 226b027, 24 .gs changed since). §0
                             forbids diagnosing business logic against stale/unconfirmed runtime.
Evidence this round:         Code side SOURCE_PROVEN (git aligned, bundle current, schema contracts match). Live side
                             NOT_VERIFIED for ALL business gates (no live access; deployment pending). No LIVE_VERIFIED
                             gate claimed. No business-flow failure reported (would be against stale runtime).
Unblock (USER, in order):    Execute F1_PHASE1_RELEASE_READINESS_R1.md §28 (provision live tables + seed → paste ALL 49
                             .gs → NEW Web App deployment version → TZ Asia/Taipei → grant OAuth → attach 5 triggers +
                             sweep legacy → redeploy Pages), then run the §33 / F1_PHASE1_E2E_FINAL_R1.md §33 live
                             checklist and report each stage's LIVE values back for a LIVE-VERIFIED follow-up round.
Code/DB/schema impact:       NONE (audit + ledger entry only). No .gs change, no bundle rebuild, no frontend change.
Next mainline:               USER live run per §33 on a HEAD-synced deployment → then a LIVE-VERIFIED acceptance round.
```

**STATUS: LIVE ACCEPTANCE BLOCKED_BY_DEPLOYMENT — agent has no production access + Apps Script not confirmed on HEAD; USER deployment (readiness §28) required before any LIVE_VERIFIED gate.**

---

## Entry — 2026-08-12 · F1-PHASE1-LIVE-DEPLOYMENT-CLOSURE-R1 (deployment readiness closure)

```
Release ID:                  F1-PHASE1-LIVE-DEPLOYMENT-CLOSURE-R1-2026-08-12-deploy-readiness
Git HEAD:                    33a4a54  (F1-PHASE1-LIVE-ACCEPTANCE-R1 ledger)   ·   origin/main 92b54b0 (HEAD 1 ahead — USER to push)
Working tree:                clean   ·   unpushed: 1 (33a4a54)
Verdict:                     B. READY_AFTER_REMAINING_USER_ACTIONS
Code side (agent-proven):    HEAD known · bundle CURRENT (40 modules · sha256 aaf5b07f2292f9e876459f38d5c9533f1451357f1781e3e3622684f4c2918782 · --check PASS) ·
                             schema contracts match (14/22/30/23/30 + SFO + required cols) · active .gs = 49 (sync ALL as ONE new version; drift-proof;
                             28_/41_ are READ-ONLY editor diagnostics, harmless; no temp/pasted-and-deleted file present) · last full regression 213 files / 4 baseline.
Web App deployment:          NEW version REQUIRED (router doPost actions + new trigger targets added since baseline). Source paste alone insufficient.
Remaining (USER, §14):       push 33a4a54 → back up DB → run releaseReadinessVerifySchema_ (all OK; provision missing via R2A-LIVE/R2B/R3B snippets) →
                             confirm master data (KM/ResTW/ResUS legal entities, SHIPDETAIL/PL templates+fields, warehouses/locations/SKU/factory-stock) →
                             sync all 49 .gs → Save → NEW Web App version (capture id) → TZ Asia/Taipei → grant OAuth →
                             Administration Save&Apply the 5 automations → releaseReadinessListTriggers_ (5 recurring ≤1, legacy 0) →
                             redeploy GitHub Pages from main → re-verify schema + Drive templates/folders.
Halt conditions:             none tripped in code; all §16 conditions are USER-verifiable via the two read-only verifiers before R2.
Code/DB/schema impact:       NONE (readiness doc + ledger entry only). No .gs / bundle / frontend / DB change.
Next slice:                  complete §14 + both verifiers PASS → flips to A. READY_FOR_PHASE1_LIVE_ACCEPTANCE → run F1-PHASE1-LIVE-ACCEPTANCE-R2.
```

**STATUS: READY_AFTER_REMAINING_USER_ACTIONS — code/repo side READY; production deployment + read-only verifiers are the USER-owned gate to authorize Live Acceptance R2.**

---

## Entry — 2026-09-10 · PRODUCT-STRATEGY-P1-B1-R1 (deployment CANDIDATE prepared — nothing synced, nothing deployed)

```
Release ID:                  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R7
                             (SYS_DEPLOYMENT_RELEASE_ in 63_api_v1_system_health.gs; next in the
                             existing chain after …R6-R7-R6, registered in assets/tests/_release-order.js)
Ledger entry ID:             P1-B1-R1-2026-09-10-product-pricing-workspace-release-candidate
Environment:                 (none — NOT DEPLOYED, NOT SYNCED, NOT PUSHED)
Git branch:                  feature/product-strategy-board-p0
Git state:                   follow-up commit on 9ee85d5 (P1-B1). 9ee85d5 is NOT amended, NOT squashed.
                             origin/feature/product-strategy-board-p0 = e98fded — both P1-B1 and this
                             round are local-only.
Why the release moves:       P1-B1 changed FOUR sync-visible backend files — 72_ (new), 01_router.gs,
                             00_config.gs, 63_ — while SYS_DEPLOYMENT_RELEASE_ still read …R6-R7-R6.
                             63_:35 requires the release to move in the same commit as any sync-visible
                             change. It moved a round late; this entry is that bookkeeping.

Changed files (17):
  runtime .gs   63_api_v1_system_health.gs      release + own stamp + action contract 12->13
                                                + manifest rows for 63_/00_/01_ + NEW REQUIRED row for 72_
                00_config.gs                    CONFIG_BUILD_VERSION_ -> R7 (P1-B1 edited it)
                01_router.gs                    RTR_BUILD_VERSION_    -> R7 (P1-B1 added the dispatch)
                72_api_v1_product_pricing_workspace.gs
                                                PPW_BUILD_VERSION_ -> R7 (into the orderable vocabulary)
                                                + the dynamic Category contract + filterOptions
  browser       assets/js/api/operation-system-db-api.js
                                                KM_EXPECTED_ACTION_CONTRACT_VERSION_ 12 -> 13
                assets/js/api/km-product-pricing-workspace.js
                                                filterOptions shape validation; no category VALUE
  diagnostics   TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs      S1_BUILD_ -> R7
                TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs          two pins -> R7
  tests         _release-order.js (+R7), 8 suites re-aimed at durable properties,
                1 NEW suite: api-product-pricing-category-contract-p1-b1-r1.test.js
  docs          PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md §33, project-current-state.md, this ledger

Apps Script files synced:    NONE
APPS_SCRIPT_SYNC_REQUIRED:   72_api_v1_product_pricing_workspace.gs (NEW FILE) ·
                             00_config.gs · 01_router.gs · 63_api_v1_system_health.gs
Bundle source changed:       no  (90_ untouched — no bundle rebuild required)
Apps Script deployment version: NOT CREATED
Frontend deployment:         NOT REDEPLOYED

ORDERING CONSTRAINT (read this before deploying anything):
                             KM_EXPECTED_ACTION_CONTRACT_VERSION_ is now 13, and the browser refuses any
                             deployment below its pin with DEPLOYMENT_CONTRACT_MISMATCH. So:
                               1. git push        (USER)
                               2. Apps Script sync of the four files above + NEW Web App version  (USER)
                               3. ONLY THEN redeploy Pages  (USER)
                             Redeploying Pages before step 2 makes the app refuse to boot against the
                             currently-deployed backend. The pin moved because ~11 suites hold it to
                             EQUALITY with SYS_DEPLOYED_ACTION_CONTRACT_VERSION_, not because any page
                             needs the new action — no page calls it.

Database migration:          none          Migration ID: n/a         Backup reference: n/a
Deployed by:                 nobody — no remote or deployment command was executed this round
Deployment time:             n/a

Feature state at this release:
  PRODUCT_STRATEGY_ENABLED_  false. A project carrying this release still answers FEATURE_DISABLED for
                             productPricing.workspace.get, BEFORE it opens a spreadsheet (0 opens,
                             0 table reads — measured, not asserted).
  Production UI              none. index.html loads neither the accessor nor a Product Strategy nav entry,
                             and no page references the action.
  Formal DB / API read       none performed this round.
  DB / Drive writes          0.

Smoke-test scope:            repository regression only — no live system was contacted.
Smoke-test result:           444 suites swept. New category suite 73 passed / 0 failed / 12 mutants
                             caught / 0 survived. P1-B1 suite 163/0/13. The five assertions this line
                             caused (E4, G1, G1a, G2.7, action-registry 8) all pass. Four suites remain
                             red and are PRE-EXISTING on the untouched main worktree: gap-job-done-notice
                             (3), order-planning-monthly-projection-consumer (1), replen-header-toggle
                             (7), supply-planning-route-inventory (2).
Known limitations:           This is a CANDIDATE. Nothing has been synced or deployed, so no live
                             behaviour has changed and none has been verified. The release id says what a
                             sync WOULD be.
Rollback version:            n/a — nothing was deployed to roll back from.
Notes:                       72_ is a REQUIRED manifest owner from this release, deliberately not
                             optional: the router already dispatches its action, so a deployment carrying
                             01_router.gs without 72_ routes a live action to an undefined handler and
                             MUST read as mixed/stale. The feature flag is a separate axis — a refusal
                             from a handler that is present is a different fact from a handler that is
                             absent, and only the first is recoverable by flipping a flag.
```

**STATUS: DEPLOYMENT CANDIDATE PREPARED · NOT PUSHED · APPS SCRIPT NOT SYNCED · NO DEPLOYMENT VERSION · PRODUCT STRATEGY NOT ENABLED.**

## Entry — 2026-09-11 · PRODUCT-STRATEGY-P1-B3 (read-only readback package prepared — nothing synced, nothing deployed)

```
Release ID:                  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R8
                             (SYS_DEPLOYMENT_RELEASE_ in 63_api_v1_system_health.gs; next in the chain
                             after …R6-R7-R7, appended to assets/tests/_release-order.js)
Ledger entry ID:             P1-B3-2026-09-11-product-strategy-production-readback-package
Environment:                 (none — NOT DEPLOYED, NOT SYNCED, NOT PUSHED)
Git branch:                  feature/product-strategy-board-p0
Git state:                   follow-up commit on 1898621 (P1-B2C). Nothing amended, squashed or rebased.
                             origin/feature/product-strategy-board-p0 = e98fded — every round since is
                             local-only.

WHY THE RELEASE MOVES, AND WHY R7 BEING UNSYNCED IS NOT A REASON TO REUSE IT
                             R7 was a CANDIDATE and no project ever carried it. This round changes 72_
                             again (the five-state source discriminator, the per-table schema
                             fingerprint, the read timestamp, and the corrected `analysable` rule) and
                             adds a fifth file. So R7's tree and this tree are DIFFERENT, and a release
                             id that names two different trees cannot answer the only question it
                             exists for. R7 is superseded as a candidate; nothing is superseded as a
                             deployment, because there was none.

Changed files (13):
  runtime .gs   72_api_v1_product_pricing_workspace.gs
                                                PPW_BUILD_VERSION_ -> R8; NEW: sourceState (the five
                                                states), ppwSourceState_, ppwIntegrityStops_,
                                                ppwSchemaFingerprint_, PPW_SCHEMA_CONTRACT_VERSION_ = 2,
                                                the `schema` block with read_at; `analysable` now
                                                requires a confirmed Regional Detail (CORRECTION — see
                                                Notes); ppwWorkspaceBuild_ takes readAt as a parameter
                63_api_v1_system_health.gs      release + own stamp -> R8; 72_'s manifest row -> R8.
                                                Action contract stays 13 — no ACTION was added.
  NEW census    assets/tools/apps-script-diagnostics/
                TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs
                                                the read-only production readback. One no-parameter
                                                entry point, in no router table, no web entry point.
                                                Filed with the other sixteen read-only censuses rather
                                                than in the runtime mirror: a one-off admin census owns
                                                no action, no table and no schema. Still synced.
  NEW browser   assets/js/api/km-product-pricing-adapter.js
                                                the ONE production adapter: the six §6 shape gaps.
                                                Loaded by NO page — deliberately.
  diagnostics   TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs      S1_BUILD_ -> R8
                TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs          two pins -> R8
  tests         _release-order.js (+R8)
                NEW product-strategy-production-readback-p1-b3.test.js  (328 / 0 / 17 mutants / 0)
                api-product-pricing-workspace-p1-b1.test.js        21d superseded (3 -> 1) + 21e/21e2/21e3
                api-product-pricing-category-contract-p1-b1-r1.test.js   fixture gains the regional rows
  docs          PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md §38, project-current-state.md, this ledger

Bundle source changed:       no  (90_ untouched — no bundle rebuild required; KMSAFE is already deployed)
Apps Script deployment version: NOT CREATED
Frontend deployment:         NOT REDEPLOYED — and NOT REQUIRED by this round (see below)

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED — FIVE FILES, IN THIS ORDER
-------------------------------------------------------------------------------------------------------
  1. 00_config.gs                                    (from P1-B1-R1, still unsynced)
  2. 72_api_v1_product_pricing_workspace.gs   NEW FILE
  3. 63_api_v1_system_health.gs
  4. 01_router.gs                                    (from P1-B1-R1, still unsynced)
  5. TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs  NEW FILE

  Repository paths (1-4 are the runtime mirror; 5 is filed with the other read-only censuses because a
  one-off admin census owns no action, no table and no schema):
      assets/specs/active/apps-script/00_config.gs
      assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs
      assets/specs/active/apps-script/63_api_v1_system_health.gs
      assets/specs/active/apps-script/01_router.gs
      assets/tools/apps-script-diagnostics/TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs

  WHY THAT ORDER. 01_router.gs is LAST because it is the file that makes the action reachable. Paste it
  before 72_ exists and the project routes a live action to an undefined handler for as long as the gap
  lasts. 00_config.gs is FIRST because it holds PRODUCT_STRATEGY_ENABLED_ = false, so the flag is in
  place before anything can be routed to. The readback is last-but-one to nothing: it depends on 72_ and
  00_config, and is reachable only from the editor.

  THE FOUR FROM P1-B1-R1 ARE STILL OUTSTANDING. This round does not replace that sync, it grows it.
  There is exactly ONE package to paste, not two.

-------------------------------------------------------------------------------------------------------
THE ONLY FUNCTION TO RUN AFTER SYNCING
-------------------------------------------------------------------------------------------------------
      RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()

  No parameters. Run it from the Apps Script editor and read the execution log. Expect:
      read_only true · writes 0 · writer_calls 0 · sheets_created 0 · rows_modified 0 ·
      feature_flag false · gate_proof.refusal_code FEATURE_DISABLED · gate_proof.db_opened false
  and one of these verdicts:
      READY                          — record the universe in the design freeze, proceed to P1-B4
      SOURCE_EMPTY                   — marketplace_skus has no rows; populate and rerun
      SOURCE_PARTIALLY_READABLE      — a named table is absent or unreadable; repair and rerun
      STOP_READBACK_INVARIANT_BROKEN — STOP. hard_stops names which invariant
      STOP_READBACK_FAILED           — STOP. error.token names the safety refusal

  It reports in chunks, each carrying its index, the chunk count and a fingerprint of the whole report,
  so a truncated log is detectable rather than silently short.

  DO NOT FLIP PRODUCT_STRATEGY_ENABLED_ TO RUN IT. The readback does not need the flag and does not
  touch it: it calls the real endpoint expecting a refusal, then reads the tables itself and hands them
  to the PURE builder, which has no gate because the gate lives in the handler. A readback that flipped
  the flag would measure a pipeline that is not the deployed one and would leave a bypass behind.

ORDERING CONSTRAINT (unchanged from P1-B1-R1, and it still applies):
                             KM_EXPECTED_ACTION_CONTRACT_VERSION_ is 12 and
                             SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ is 13. Neither moves this round.
                               1. git push                                              (USER)
                               2. Apps Script sync of the five files + NEW Web App version  (USER)
                               3. RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()          (USER)
                               4. Pages redeploy is NOT required by this round — no browser file that
                                  any page loads has changed. The new adapter is loaded by no page.

Database migration:          none          Migration ID: n/a         Backup reference: n/a
Deployed by:                 nobody — no remote or deployment command was executed this round
Deployment time:             n/a

Feature state at this release:
  PRODUCT_STRATEGY_ENABLED_  false. A project carrying this release still answers FEATURE_DISABLED for
                             productPricing.workspace.get before it opens a spreadsheet — and the
                             readback now PROVES that in the live project rather than asserting it.
  Production UI              none. No page loads the accessor, the adapter, or a nav entry.
  Formal DB / API read       none performed this round. The readback is prepared, not run.
  DB / Drive writes          0.

Smoke-test scope:            repository regression only — no live system was contacted. Swept twice:
                             in the working tree AND from a detached worktree checked out at the commit,
                             where core.autocrlf gives every .gs CRLF.
Smoke-test result:           450 suites swept, both ways, identical. NEW readback suite 332 passed /
                             0 failed / 17 mutants caught / 0 survived. P1-B1 167/0/13. Category
                             contract 73/0/12. P1-B2 242/0/17 · B2A 227/0/14 · B2B 142/0/16 ·
                             B2C 157/0/14. Four suites remain red and are PRE-EXISTING on the untouched
                             main worktree, with identical counts to the previous four rounds:
                             gap-job-done-notice (3), order-planning-monthly-projection-consumer (1),
                             replen-header-toggle (7), supply-planning-route-inventory (2).

                             THE CHECKOUT IS WHAT FOUND THE REAL PROBLEM. On a genuine CRLF checkout the
                             \n-written mutant anchors match nothing, so `swap` throws. Measured at the
                             PREVIOUS commit from its own detached worktree, P1-B1 already reported
                             163 passed / 3 FAILED — M5, M6 and M12 SURVIVED. Those three had been green
                             only in a working tree where an earlier patch happened to leave 72_ as LF,
                             and git diff cannot show why because autocrlf normalises the comparison.
                             Both suites now normalise line endings at the READ. A suite that is green
                             in your tree and red on a fresh checkout is indistinguishable from a passing
                             suite until somebody checks out the commit.
Known limitations:           This is a CANDIDATE and a PREPARED readback. Nothing has been synced, no
                             live table has been read, and the live universe is therefore still
                             unmeasured. Every number in §38 of the design freeze is from a synthetic
                             fixture and is labelled as such.
Rollback version:            n/a — nothing was deployed to roll back from.
Notes:                       A CORRECTION SHIPPED WITH THIS PACKAGE. 72_'s `analysable` flag did not
                             require a Regional Detail, while the rule — and the prototype's own chart
                             gate — say a site SKU without one is not on the price chart. One question
                             had two authorities and two answers; because the CLIENT's answer was the
                             right one, the chart always drew the correct products while
                             analysableSiteSkuCount counted more than the chart contained. The readback's
                             first site pass is what made it visible. The flag now requires a confirmed
                             regional match, and is false when the caller did not request the join at
                             all — "may be plotted" cannot be asserted without the evidence.
```

**STATUS: READ-ONLY READBACK PACKAGE PREPARED · NOT PUSHED · APPS SCRIPT NOT SYNCED · NO DEPLOYMENT VERSION · PRODUCT STRATEGY NOT ENABLED · NO LIVE READ PERFORMED.**


=======================================================================================================
## Entry — 2026-09-11 · PRODUCT-STRATEGY-P1-B5 (live evidence accepted · integration package built · nothing synced, nothing deployed)
=======================================================================================================

Ledger entry ID:             P1-B5-2026-09-11-live-universe-acceptance-and-integration-package
Branch:                      feature/product-strategy-board-p0
PRE HEAD:                    1d90618b5d356542df407b91bbf5efc59d65d426
POST HEAD:                   (this commit)
origin/feature/...-p0:       1d90618b5d356542df407b91bbf5efc59d65d426 — UNCHANGED, NOT PUSHED
main:                        c139943 — untouched

-------------------------------------------------------------------------------------------------------
THE P1-B3 PACKAGE WAS SYNCED AND THE READBACK WAS RUN — BY THE USER, NOT BY THIS AGENT
-------------------------------------------------------------------------------------------------------
  The P1-B3 entry above says "APPS SCRIPT NOT SYNCED · NO LIVE READ PERFORMED". That was true when it
  was written and it is NOT amended here: a ledger that edits its past to match the present cannot be
  used to reconstruct what was known when a decision was made.

  What has since happened, recorded as evidence rather than as an action of this round:

      RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()   executed 2026-09-11
      chunks 9/9 · report fingerprint FP0d88b7eb · report length 57493
      build / handler / deployment release  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R8
      read_only true · writes 0 · writer_calls 0 · sheets_created 0 · rows_modified 0
      feature_flag false · gate refusal FEATURE_DISABLED · gate db_opened false
      VERDICT: READY

  Apps Script version number and deployment ID were not supplied to this agent and are therefore NOT
  recorded — an identifier nobody handed over is left blank rather than inferred from a release pin.

  SOURCE TABLES (fingerprints are the run's, not re-measured here):
      sku_details           192 rows · 42 cols · DF770684
      marketplace_skus      495 rows · 15 cols · 2AF82658
      sku_regional_details  495 rows · 16 cols · 12CB99B7
      pricing_list          495 rows · 29 cols · 9B0471B0
      campaigns               1 row  · 27 cols · 100DF154
      campaign_sku_lines      2 rows · 27 cols · E9260A0C

  UNIVERSE: 10 sites · 13 categories · 43 series · all marketplace_skus active · 0 duplicate master
  SKU · 0 duplicate marketplace identity · 0 duplicate regional canonical identity · 0 duplicate
  pricing identity · 0 orphan regional/pricing identity · 0 cross-currency site · 6 missing
  regular_price · 16 missing minimum_price · 9 missing msrp · 61 site SKUs with no Regional Detail in
  ONE site · alias candidates 0 · alias table changed false.

  EVIDENCE GAP: PROOF_NOT_PROVABLE(P1) only. P2-P7 PASS. P1 is NOT_PROVABLE because there is no
  USD-priced population outside the US to test against. It is NOT rewritten to PASS and is NOT a
  blocker — a proof with an empty population is not a proof that passed, and the day a USD price
  appears on a non-US site is exactly the day the guarantee would have mattered.

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED:   NONE
-------------------------------------------------------------------------------------------------------
  No file under assets/specs/active/apps-script/ or assets/tools/apps-script-diagnostics/ changed in
  this round. The server side is exactly what the readback ran against.

-------------------------------------------------------------------------------------------------------
FRONTEND_DEPLOY_REQUIRED:    NO
-------------------------------------------------------------------------------------------------------
  Nothing a REGISTERED page loads has changed. index.html and assets/js/app.js are untouched, so the
  new page is unreachable and the promoted modules are loaded by no production page.

  One dependency to carry, and it is already satisfied: the prototype's index.html now loads the
  promoted modules by their production paths, so those files must travel with it. They are in this
  same commit, so any future deploy of this branch takes them together.

-------------------------------------------------------------------------------------------------------
WHAT THIS ROUND CHANGED
-------------------------------------------------------------------------------------------------------
  PROMOTED (git records all five as pure renames — one copy of every rule, shared by the prototype
  and the production page):
      docs/prototypes/product-strategy-board/data-contract.js
          -> assets/js/product-strategy/psb-data-contract.js
      docs/prototypes/product-strategy-board/selectors.js
          -> assets/js/product-strategy/psb-selectors.js
      docs/prototypes/product-strategy-board/chart-layout.js
          -> assets/js/product-strategy/psb-chart-layout.js
      docs/prototypes/product-strategy-board/prototype.js
          -> assets/js/product-strategy/psb-board-ui.js
      docs/prototypes/product-strategy-board/prototype.css
          -> assets/css/product-strategy-board.css

  NEW:
      assets/js/product-strategy/km-product-strategy-live-adapter.js   the OPERATION_DB adapter,
                                   enabled — the implementation of a seam PSB_CONTRACT reserved at P0
      assets/js/pages/product-strategy-board.js                        the page controller (unregistered)
      assets/html/pages/product-strategy-board.html                    the partial (unmounted)
      assets/tests/product-strategy-integration-p1-b5.test.js          151/0/12 mutants/0 survived

  NOT CHANGED, AND CHECKED:
      PRODUCT_STRATEGY_ENABLED_ = false · INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false
      index.html (no menu item, no mount, no script tag) · assets/js/app.js (no section map entry)
      no DB write · no Sheet row or schema · no Drive · no network · no live endpoint call
      no Apps Script source · no deployment · S1-S5 untouched · main untouched · km-lb untouched

-------------------------------------------------------------------------------------------------------
THE GAP THIS ROUND FOUND, AND DID NOT CLOSE
-------------------------------------------------------------------------------------------------------
  THE SITE LADDER HAS NO LIVE SOURCE. The board derives Company -> Country -> Marketplace from the
  rows its adapter hands over, because the preview fixture hands over the canonical universe.
  productPricing.workspace.get is site-scoped by construction and its filterOptions carries categories
  and series FOR THE SITE ALREADY CHOSEN. No existing read owner publishes marketplace_skus membership
  across sites.

  It fails closed as SITE_UNIVERSE_NOT_AVAILABLE and the scope is an INPUT. NO ENDPOINT WAS INVENTED:
  a second read authority for marketplace_skus is the one thing the adapter contract forbids, and a
  new server action would need a sync and a deployment this round is not authorised to perform.

  NEXT ROUND OWNS: a bounded read owner for the site universe, then the Operation System shell merge.

-------------------------------------------------------------------------------------------------------
ORDERING CONSTRAINT FOR THE NEXT RELEASE
-------------------------------------------------------------------------------------------------------
      1. git push                                      (USER — nothing here is pushed)
      2. Apps Script sync                              NOT REQUIRED by this round
      3. Pages redeploy                                NOT REQUIRED by this round
      4. Navigation entry + app.js section map         DEFERRED — §4 forbids enabling it, and it must
                                                       not be enabled before the site-universe owner
                                                       exists, or the board opens with no way to
                                                       choose a site.

**STATUS: LIVE EVIDENCE RECORDED · INTEGRATION PACKAGE BUILT · NOT PUSHED · NO APPS SCRIPT CHANGE · NO DEPLOYMENT · PRODUCT STRATEGY NOT ENABLED · NAVIGATION NOT ENABLED.**


=======================================================================================================
## Entry — 2026-09-11 · PRODUCT-STRATEGY-P1-B6 (site universe read owner — nothing synced, nothing deployed)
=======================================================================================================

Ledger entry ID:             P1-B6-2026-09-11-site-universe-read-owner
Branch:                      feature/product-strategy-board-p0
PRE HEAD:                    112425959212252b073fc8acad46775d19e9db1c
POST HEAD:                   (this commit)
origin/feature/...-p0:       112425959212252b073fc8acad46775d19e9db1c — UNCHANGED, NOT PUSHED
main:                        c139943 — untouched

DEPLOYMENT RELEASE:          F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R8  ->  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9
ACTION CONTRACT:             SYS_DEPLOYED_ACTION_CONTRACT_VERSION_  13 -> 14
CLIENT PIN:                  KM_EXPECTED_ACTION_CONTRACT_VERSION_   13 -> 14
Apps Script version:         NOT CREATED
Apps Script deployment:      NOT CREATED
Frontend deployment:         NOT REDEPLOYED

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED — SEVEN FILES, IN THIS ORDER
-------------------------------------------------------------------------------------------------------
  The FOUR runtime files from P1-B3 that are already live are re-synced because three of them changed
  and one (00_config.gs) did not — it is listed so the package is ONE paste, not two.

  1. assets/specs/active/apps-script/00_config.gs                        UNCHANGED this round
  2. assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs   CHANGED (new owner + handler)
  3. assets/specs/active/apps-script/63_api_v1_system_health.gs               CHANGED (contract 14, manifest, stamps)
  4. assets/specs/active/apps-script/01_router.gs                             CHANGED (GET table + doPost branch)
  5. assets/tools/apps-script-diagnostics/TEMP_P1_SITE_UNIVERSE_READBACK.gs   NEW
  6. assets/tools/apps-script-diagnostics/TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs  UNCHANGED
  7. assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs  build pin only
     assets/tools/apps-script-diagnostics/TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs  build pin only

  WHY THAT ORDER, unchanged in principle from P1-B3: 01_router.gs is LAST because it is the file that
  makes the action reachable — paste it before 72_ holds the handler and the project routes a live
  action to an undefined function for as long as the gap lasts. 00_config.gs stays FIRST because it
  holds the flag, which must be in place before anything can be routed to it.

  THE TWO CENSUS FILES carry a BUILD PIN ONLY. Their logic is untouched; the pin moves because those
  files state in as many words that a lagging pin refuses a correctly synced project.
  P1B3_READBACK_BUILD_ deliberately does NOT move: a module stamp declares the round its own file
  belongs to, and that readback did not change.

-------------------------------------------------------------------------------------------------------
FRONTEND_DEPLOY_REQUIRED:    NO — AND THE ORDER IS NOW BINDING
-------------------------------------------------------------------------------------------------------
  Nothing a REGISTERED page loads has changed in behaviour: index.html and assets/js/app.js are
  untouched and the Product Strategy page is unreachable.

  BUT operation-system-db-api.js is loaded by EVERY page and its pin moved to 14. A browser carrying
  this build refuses any deployment below 14 with DEPLOYMENT_CONTRACT_MISMATCH. THEREFORE:

      APPS SCRIPT MUST BE SYNCED AND DEPLOYED **BEFORE** THE FRONTEND IS REDEPLOYED.

  A frontend deploy first would break every page in the application, not only this feature.

-------------------------------------------------------------------------------------------------------
THE ONLY FUNCTION TO RUN AFTER SYNCING
-------------------------------------------------------------------------------------------------------
      RUN_P1_SITE_UNIVERSE_READBACK()

  No parameters. Run from the editor. Expect:
      read_only true · writes 0 · writer_calls 0 · sheets_created 0 · rows_modified 0
      gate_proof.refusal_code FEATURE_DISABLED · gate_proof.db_opened false · tables_read 0
  and verdict P1_B6_SITE_UNIVERSE_READY with ten sites, or STOP_SITE_UNIVERSE_DATA_INTEGRITY naming
  the identity finding. DO NOT FLIP PRODUCT_STRATEGY_ENABLED_ TO RUN IT — the refusal IS the proof.

-------------------------------------------------------------------------------------------------------
ORDERING CONSTRAINT
-------------------------------------------------------------------------------------------------------
      1. git push                                              (USER)
      2. Apps Script sync of the package + NEW Web App version (USER)
      3. RUN_P1_SITE_UNIVERSE_READBACK()                       (USER)
      4. Frontend redeploy — ONLY after step 2, never before   (USER, and not required by this round)
      5. Navigation entry — DEFERRED, and it must not be enabled before step 2, or the board opens
         with a site menu it cannot fill.

**STATUS: SITE UNIVERSE OWNER BUILT · NOT PUSHED · APPS SCRIPT NOT SYNCED · NO DEPLOYMENT VERSION · PRODUCT STRATEGY NOT ENABLED · NAVIGATION NOT ENABLED · NO LIVE READ PERFORMED.**


---

## Entry — 2026-09-11 · PRODUCT-STRATEGY-P1-B7 · shell integration + live evidence freeze

```
Release ID:                  PSB-2026-09-11-p1-b7-shell-integration
Environment:                 (none — NOT DEPLOYED, NOT PUSHED)
Git branch:                  feature/product-strategy-board-p0
PRE  HEAD:                   5633025bc76a93f32c9558c58b005667710b2335   (== origin at PRE)
Apps Script sync:            NOT PERFORMED THIS ROUND
Web App deployment:          NOT CREATED THIS ROUND
Frontend deployment:         NOT PERFORMED THIS ROUND
Feature flag:                PRODUCT_STRATEGY_ENABLED_ = false          (unchanged)
                             INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false (unchanged)
Navigation:                  NOT ENABLED — staged with enabled:false in app.js
Build/release pin:           F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9           (unchanged — no server change)
Action contract:             14 (unchanged — no router action added this round)
```

### Live evidence accepted (P1-B6 readback, run by the USER)

```
executed_at 2026-09-11T13:31:30.059Z · fingerprint D53C96CE · length 7272 · chunks 2/2
endpoint build F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9 · action productPricing.siteUniverse.get · contract 1
read_only true · writes 0 · writer_calls 0 · sheets_created 0 · rows_modified 0
gate FEATURE_DISABLED · db_opened false · tables_read 0
source_state READY · site_count 10 · marketplace_skus 495 rows · table fingerprint 2AF82658 · 15 cols
capped false · cap 2000 · is_whole_universe true · findings [] · refusals []
evidence gap SOURCE_MODIFIED_AT_NOT_MEASURABLE_IN_THIS_DEPLOYMENT_SCOPE
verdict P1_B6_SITE_UNIVERSE_READY
```

Ten sites: KM/US/Shopify 101 · KM/US/Target 19 · KM/US/Walmart 64 · ResTW/AU/Amazon 35 ·
ResTW/CA/Amazon 51 · ResTW/EU/Amazon 39 · ResTW/JP/Amazon 26 · ResTW/UK/Amazon 42 ·
ResUS/US/Amazon 100 · ResUS/US/Walmart 18.

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED  —  **NO NEW FILES THIS ROUND**
-------------------------------------------------------------------------------------------------------
  No Apps Script source changed in P1-B7. The R9 package recorded in the P1-B6 entry is unchanged and
  is already synced by the USER (the readback above answered from build R9, which is the proof).

  STILL OUTSTANDING FROM P1-B6, IF NOT ALREADY DONE:
      create the immutable Web App VERSION for build R9.
  The readback proves the SOURCE is R9. It does NOT prove a deployment version serving R9 exists, and
  it does not prove 01_router.gs routes the action — the readback calls the handler directly. The one
  cheap proof of both is system.health reporting deployed_action_contract_version 14 with
  mixed_deployment false.

-------------------------------------------------------------------------------------------------------
FRONTEND_DEPLOY_REQUIRED  —  **YES**, and only AFTER the Apps Script version exists
-------------------------------------------------------------------------------------------------------
  Changed and required together (they are one page):
      index.html                                          (stylesheet, 9 scripts, 1 mount point)
      assets/js/app.js                                    (staged-section registry + guard)
      assets/css/product-strategy-board.css               (scoped to .psb-page)
      assets/html/pages/product-strategy-board.html       (in-page rail, crumbs, scenario strip)
      assets/js/api/km-product-pricing-workspace.js       (unchanged content, newly LOADED)
      assets/js/api/km-product-pricing-adapter.js         (unchanged content, newly LOADED)
      assets/js/product-strategy/psb-data-contract.js     (unchanged content, newly LOADED)
      assets/js/product-strategy/km-product-strategy-site-universe.js   (newly LOADED)
      assets/js/product-strategy/km-product-strategy-live-adapter.js    (loadCanonical + provenance)
      assets/js/product-strategy/psb-selectors.js         (unchanged content, newly LOADED)
      assets/js/product-strategy/psb-chart-layout.js      (unchanged content, newly LOADED)
      assets/js/product-strategy/psb-board-ui.js          (chrome tolerance, body classes, auto-boot)
      assets/js/pages/product-strategy-board.js           (lifecycle + partial)

  NAVIGATION STAYS DISABLED and the capability stays false in this deployment. What ships is an
  installed, unreachable page.

-------------------------------------------------------------------------------------------------------
DEPLOYMENT ORDER — PROVED, NOT ASSERTED
-------------------------------------------------------------------------------------------------------
      browser 13 / server 13   DEPLOYMENT_CONTRACT_OK
      browser 13 / server 14   DEPLOYMENT_CONTRACT_OK        <- backend-first is SAFE
      browser 14 / server 13   DEPLOYMENT_CONTRACT_MISMATCH  <- frontend-first breaks EVERY page
      browser 14 / server 14   DEPLOYMENT_CONTRACT_OK

  The gate is `deployed < expected`, a MINIMUM and not an equality. Therefore:

      1. git push                                                     (USER)
      2. Apps Script: confirm R9 source, then create a NEW Web App VERSION   (USER)
      3. Verify system.health: action contract 14, mixed_deployment false    (USER)
      4. Frontend redeploy — ONLY after step 2                         (USER)
      5. P1-B8 acceptance matrix items 3/4/5 (page regressions) — no activation needed
      6. Navigation entry — DEFERRED, and only after steps 2-5

  ROLLBACK.  Frontend: redeploy the commit before this one (5633025) — every file above is additive to
  the shell, so the previous build simply does not load the page. Apps Script: re-publish the previous
  deployment version; a browser at pin 14 then reports DEPLOYMENT_CONTRACT_MISMATCH by name, which is
  why the frontend must be rolled back FIRST in that direction — the reverse of the deploy order.
  `productPricing.siteUniverse.get` is deliberately absent from the required-action probe list, so a
  rollback reports one contract version rather than a list of missing actions.

**STATUS: PAGE INSTALLED AND UNREACHABLE · NOT PUSHED · NO NEW APPS SCRIPT SOURCE · NO DEPLOYMENT VERSION CREATED · FRONTEND NOT DEPLOYED · PRODUCT STRATEGY NOT ENABLED · NAVIGATION NOT ENABLED.**


---

## Entry — 2026-09-12 · PRODUCT-STRATEGY-P1-B7E · R10 envelope action contract correction

```
Release ID:                  PSB-2026-09-12-p1-b7e-envelope-action
Environment:                 (none — NOT DEPLOYED, NOT PUSHED)
Git branch:                  feature/product-strategy-board-p0
PRE  HEAD:                   42fb04c25b7679c2c6d879d2d0bceb8e0a5bff6e   (== origin at PRE)
Apps Script sync:            REQUIRED — see package below. NOT PERFORMED by the agent.
Web App deployment:          NOT CREATED
Frontend deployment:         NOT PERFORMED
Feature flag:                PRODUCT_STRATEGY_ENABLED_ = false          (unchanged)
Navigation:                  NOT ENABLED (staged, enabled:false)
Build/release pin:           F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10          (was R9)
Action contract:             14  (UNCHANGED — no action added, renamed or removed)
Required action list:        12, 44 actions  (UNCHANGED)
Router:                      01_router.gs UNCHANGED, stamp stays R9
```

### Deployed evidence accepted (P1-B7D — read from the production /exec, by HTTP)

```
transport   GET -> 302 -> script.googleusercontent.com/macros/echo -> 200
            system.health 17,934 bytes · productPricing.siteUniverse.get 1,061 bytes
build/deployment/router/health   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9
contract 14 · required list 12 · 44 actions · transport contract 1 · environment production
router_ready true · doGet/doPost true · missing_actions [] · mixed_deployment false
23 non-optional owners all matches_expected · verdict UNIFORM
read_only true · db_writes 0 · drive_writes 0 · status_transitions 0 · emails 0 · demo_mutations 0
siteUniverse.get ROUTED · FEATURE_DISABLED · dbOpened false · tablesRead 0
UNKNOWN_ACTION 0 · handler undefined 0
```

**NOT the same evidence as the P1-B6 editor readback**, which called the handler directly and could
prove neither the route nor the envelope the browser receives.

### The defect this release corrects

The deployed R9 answered `productPricing.siteUniverse.get` with `meta.action =
productPricing.workspace.get`. The shipped accessor rejects that (`RESPONSE_ACTION_MISMATCH` →
`SOURCE_NOT_CONNECTED`), so the site menu could never have loaded on any path. Captured, de-identified
and frozen at `assets/tests/_p1b7d-exec-capture.js`; a suite asserts the capture still reproduces it.

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED  —  **TWO FILES, IN THIS ORDER**
-------------------------------------------------------------------------------------------------------
      1. 72_api_v1_product_pricing_workspace.gs    ppwEnvelope_(action, …) + 8 call sites + R10 stamp
      2. 63_api_v1_system_health.gs                release R10, own stamp R10, manifest rows for
                                                   63_ and 72_ -> R10

  Then create a NEW Web App VERSION.

  DIAGNOSTIC PINS — these are NOT runtime and are only needed if that diagnostic is going to be run:
      TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs        two build pins -> R10
      TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs    one build pin  -> R10

  DO NOT re-paste 00_config.gs (unchanged, R7), 01_router.gs (unchanged, R9) or either readback.
  Re-pasting an unchanged file is not harmful and is not free: it is another chance to paste the wrong
  one, and the manifest is what proves a sync, not the number of files touched.

  ORDER: 72_ before 63_, because 63_'s manifest declares what 72_ must report. Between the two saves
  the project is momentarily inconsistent — which is invisible to users, because a deployment serves
  an IMMUTABLE VERSION and the version is created after both saves. That is the whole safety property
  of this step: SYNCING IS NOT DEPLOYING.

-------------------------------------------------------------------------------------------------------
FRONTEND_DEPLOY_REQUIRED  —  **NO**
-------------------------------------------------------------------------------------------------------
  No client file changed behaviourally this round. The stylesheet lost five leaking rules inside media
  queries — a fix to an unshipped page's sheet — and the P1-B7 frontend package has not been deployed
  yet in any case. When it is deployed, the ordering rule from P1-B7 still holds and is still satisfied:
  Apps Script first (the deployment already serves contract 14), frontend second.

-------------------------------------------------------------------------------------------------------
ROLLBACK
-------------------------------------------------------------------------------------------------------
  Apps Script: re-publish the previous Web App version (R9). Nothing in the browser pins R10 — the
  action contract is still 14 — so a rollback to R9 breaks no page. It restores the envelope defect,
  which only affects a feature that is switched off.
  Repo: the commit before this one.

-------------------------------------------------------------------------------------------------------
VERIFICATION AFTER THE NEXT SYNC  (five items)
-------------------------------------------------------------------------------------------------------
      1. editor: the action contract is still 14 and the two module stamps read R10
      2. RUN_P1_SITE_UNIVERSE_READBACK() — a new readback on R10
      3. /exec: productPricing.siteUniverse.get returns a structured FEATURE_DISABLED whose
         meta.action is productPricing.siteUniverse.get
      4. that body, through the production accessor, must yield FEATURE_DISABLED — NOT
         SOURCE_NOT_CONNECTED
      5. /exec system.health: build R10, contract 14, mixed_deployment false

**STATUS: ENVELOPE CORRECTED · R10 PREPARED · NOT PUSHED · APPS SCRIPT NOT SYNCED · NO DEPLOYMENT VERSION · FRONTEND NOT DEPLOYED · PRODUCT STRATEGY NOT ENABLED · NAVIGATION NOT ENABLED.**


=======================================================================================================
P1-B7F  -  R10 VERIFIED DEPLOYED  (2026-09-12)                       NO SYNC - NO DEPLOY - NO NEW BUILD
=======================================================================================================
  This round changed NO Apps Script file, minted NO release identity and requires NO sync. It measured
  the deployment the user created and recorded the result.

-------------------------------------------------------------------------------------------------------
THE FIVE POST-SYNC ITEMS P1-B7E LISTED  -  ALL FIVE CLOSED
-------------------------------------------------------------------------------------------------------
      1. contract still 14, both module stamps read R10            PASS  (by /exec, not by editor)
      2. RUN_P1_SITE_UNIVERSE_READBACK() on R10                    PASS  fp CA0BB90F len 7273 chunks 2/2
                                                                         verdict P1_B6_SITE_UNIVERSE_READY
      3. /exec siteUniverse.get -> structured FEATURE_DISABLED
         whose meta.action is productPricing.siteUniverse.get      PASS  schema.action agrees
      4. that body through the production accessor -> FEATURE_DISABLED,
         NOT SOURCE_NOT_CONNECTED                                  PASS  and the frozen R9 body, through
                                                                         the SAME accessor, still gives
                                                                         SOURCE_NOT_CONNECTED
      5. /exec system.health: R10, contract 14, mixed false        PASS  UNIFORM, all counters 0

  Item 4 is the one that matters, and only as a PAIR. One accessor, two wire bodies, two outcomes:
  what changed is the deployment, not the test. Both captures are immutable evidence and neither is
  ever edited into agreement with current code.

-------------------------------------------------------------------------------------------------------
DEPLOYED MANIFEST, AS REPORTED BY THE DEPLOYMENT ITSELF
-------------------------------------------------------------------------------------------------------
      63_api_v1_system_health.gs                expected R10   declared R10
      72_api_v1_product_pricing_workspace.gs    expected R10   declared R10
      01_router.gs                              expected  R9   declared  R9
      00_config.gs                              expected  R7   declared  R7
      mixed_deployment false - UNIFORM across 24 probed owner files, 0 absent, 0 stale

  The router row is the interesting one: a release moved everything around it and it stayed at R9,
  because the fix was inside the envelope builder and no action was added, renamed or removed.

-------------------------------------------------------------------------------------------------------
SITE UNIVERSE  -  ZERO DRIFT, PROVED BY RECONSTRUCTION
-------------------------------------------------------------------------------------------------------
  R10 readback  len 7273  fp CA0BB90F.  Roll back the endpoint build stamp and the read timestamp -
  the only two fields a redeploy legitimately changes - and it is len 7272 fp D53C96CE: P1-B6 exactly.
  The entire difference is one character, "R9" becoming "R10". 10 sites, 495 rows, table fingerprint
  2AF82658, read_only true, writes/writer_calls/sheets_created/rows_modified all 0, flag false and not
  written by the readback, SOURCE_MODIFIED_AT still an open evidence gap.

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED  -  **NO**        FRONTEND_DEPLOY_REQUIRED  -  **NO**
-------------------------------------------------------------------------------------------------------
  No .gs changed. No client JS or CSS changed. The P1-B7 frontend package remains undeployed and its
  ordering rule is still satisfied in advance: Apps Script first (R10 serves contract 14), frontend
  second, whenever the user chooses to deploy it.

-------------------------------------------------------------------------------------------------------
P1-B8 ACTIVATION  -  NO-GO
-------------------------------------------------------------------------------------------------------
  STOP_P1_B8_ACTIVATION_REQUIRES_SERVER_IDENTITY_BOUNDARY

  webapp.access ANYONE_ANONYMOUS, webapp.executeAs USER_DEPLOYING; no runtime .gs calls
  Session.getActiveUser; no token, secret or session check in front of any handler. The feature flag is
  one global boolean and answers a different question from "may this caller". This is the standing
  posture of the whole application - see design freeze 44.5 for what activation would actually change,
  and 44.7 for the minimum safe path, whose first two steps are USER decisions.

**STATUS: R10 DEPLOYED AND VERIFIED - ENVELOPE CORRECT ON THE WIRE - FRONTEND NOT DEPLOYED - PRODUCT STRATEGY NOT ENABLED - NAVIGATION NOT ENABLED - P1-B8 ACTIVATION BLOCKED ON A SERVER IDENTITY BOUNDARY.**


## Entry — 2026-09-12 · PRODUCT-STRATEGY-P1-B8C-R1A · GLOBAL 60-row cap correction (SUPERSEDES R1's BOUND)

-------------------------------------------------------------------------------------------------------
WHAT CHANGED, AND IT IS THE SAME ONE FILE
-------------------------------------------------------------------------------------------------------
      assets/tools/apps-script-diagnostics/TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs

  `P1B8C_ROW_SAMPLE_MAX_ = 60` was a cap PER SITE. On the production universe of ten sites that is a
  six-hundred-row export wearing a sixty-row budget's name, and the authorisation was minimum
  disclosure. A BOUND THAT MULTIPLIES BY A NUMBER NOBODY BOUNDED IS NOT A BOUND.

  It is now one GLOBAL budget for the whole report, spent once by `p1b8cSelectGlobalSample_` over the
  pooled universe of every site. Not a per-site cap that adds up; not a truncation applied afterwards,
  which would discard whichever states the last sites happened to hold.

      row_sample_cap 60 · row_sample_cap_scope GLOBAL_REPORT · per_site_cap null
      selection_algorithm_version P1B8C-R1A-GLOBAL-BUDGET-1

  MEASURED ON TEN SITES OF 105 ROWS: universe 1050, sampled 60, omitted 990, capped true, every one of
  the ten sites represented, largest single site share 10 of 60, all sixty rows distinct.

-------------------------------------------------------------------------------------------------------
EVERYTHING R1 PROVED IS UNCHANGED AND STILL PROVED
-------------------------------------------------------------------------------------------------------
  Allowlist reducer · fail-closed redaction scan over the finished report · URL/email/token/file-id
  refusal · image as two booleans and never an address · `error.safety_token` · the shipped
  `ppwWorkspaceBuild_` · zero writer reachability by call closure · no router row, no action, no flag
  read, no production runtime change. No file under assets/specs/active/apps-script/ changed; index.html,
  assets/js, assets/css and assets/html are untouched.

-------------------------------------------------------------------------------------------------------
TESTS
-------------------------------------------------------------------------------------------------------
  product-strategy-row-shape-sample-p1-b8c-r1   419 / 0 · 27 mutants · 0 survived
  Full sweep 462 suites, 458 green; the four pre-existing red unchanged at 3/1/7/2. New failures 0.

  TWO MUTANTS SURVIVED FIRST AND BOTH WERE RIGHT TO. One showed the reordered-source test cannot see
  the selector's own sort, because the shipped builder already sorts by marketplace_sku_id; the other
  showed site representation is not load-bearing on ten EQUAL sites. Both assertions were re-pointed at
  universes and seams where the rule they claim is the thing actually holding.

APPS_SCRIPT_SYNC_REQUIRED = YES_DIAGNOSTIC_ONLY (the same one file, now at R1A)
APPS_SCRIPT_NEW_VERSION_REQUIRED = NO · WEB_APP_DEPLOYMENT_REQUIRED = NO · FRONTEND_DEPLOY_REQUIRED = NO

**STATUS: R1 IS SUPERSEDED BY R1A. SYNC AND RUN ONLY AFTER BOTH ARE PUSHED. NOT SYNCED - NO VERSION - NO DEPLOYMENT - NOT PUSHED.**

-------------------------------------------------------------------------------------------------------

## Entry — 2026-09-12 · PRODUCT-STRATEGY-P1-B8C-R1 · minimal live row-shape readback (DIAGNOSTIC SYNC ONLY)

> **SUPERSEDED BY P1-B8C-R1A (entry above).** Its bound was sixty rows PER SITE. Do not sync or run the
> R1 version of the diagnostic; the file to paste is the R1A one.

-------------------------------------------------------------------------------------------------------
WHAT CHANGED, AND IT IS ONE FILE
-------------------------------------------------------------------------------------------------------
      assets/tools/apps-script-diagnostics/TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs

  One new editor-only entry point, `RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE()`, added to the existing
  diagnostic. No action, no router row, no parameter, no HTTP path, no flag read, no writer, no second
  builder. The census entry point and its contract are unchanged.

  No file under assets/specs/active/apps-script/ changed. 00_config.gs, 01_router.gs,
  72_api_v1_product_pricing_workspace.gs and appsscript.json are byte-identical to the previous commit.

-------------------------------------------------------------------------------------------------------
WHY A SECOND ENTRY POINT EXISTS
-------------------------------------------------------------------------------------------------------
  P1-B8C stopped with STOP_EXISTING_READBACK_INSUFFICIENT. The census reaches the shipped builder and
  then discards every row, because P1-B3's contract is "counts, never values" — which is RIGHT for the
  question P1-B3 asked and is the wrong shape for "what exactly would be drawn". A renderer cannot draw
  a price axis from a count. The USER authorised the augmentation on 2026-09-12, unchanged in scope
  from the proposal in P1_B8C_LIVE_READBACK_AND_ACTIVATION_MANIFEST.md §1.3.

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED  -  **YES_DIAGNOSTIC_ONLY**
-------------------------------------------------------------------------------------------------------
  Paste ONE file into the Apps Script editor, replacing its whole contents — **the R1A version, which
  is what the repository holds after the correction commit**:

      TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs

  Sync nothing else. Then:

      1. Save.
      2. Do NOT create a version.               APPS_SCRIPT_NEW_VERSION_REQUIRED = NO
      3. Do NOT update the deployment.          WEB_APP_DEPLOYMENT_REQUIRED      = NO
      4. Run RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE() once, from the editor.
      5. Return every chunk. Each carries chunk_index, chunk_count, full_report_fingerprint and
         full_report_length, so a partial paste is detectable rather than silently short.

  A diagnostic is not on the serving path. It is a function in the project that only an editor can
  call, so saving it changes nothing about what the deployed /exec answers — which is why this row is
  YES_DIAGNOSTIC_ONLY rather than a release.

-------------------------------------------------------------------------------------------------------
FRONTEND_DEPLOY_REQUIRED  -  **NO**
-------------------------------------------------------------------------------------------------------
  No client JS, CSS, HTML or index.html changed. The P1-B7/P1-B8B frontend package remains undeployed.

-------------------------------------------------------------------------------------------------------
ZERO WRITE, AND WHICH ZEROES ARE MEASURED
-------------------------------------------------------------------------------------------------------
  db_writes 0 · drive_writes 0 · sheets_created 0 · writer_calls 0 · rows_modified 0 · flag_read false
  flag_modified false · deployment_created false · version_created false · http_endpoint_called false

  MEASURED: rows_modified, from the lastRow/lastColumn delta observed across the run. The suite proves
  it is a measurement by making a table GROW under the read and asserting the run stops
  (STOP_SOURCE_SHAPE_CHANGED_DURING_READ) — without that, `rows_modified: 0` is a constant.

  DECLARED, and proved in the repository by transitive CALL CLOSURE rather than by comment: nothing the
  sample can reach calls productStrategyEnabled_, handleProductPricingWorkspaceGet_, getOperationDb,
  either migration writer, or any Sheets writer, LockService, PropertiesService, CacheService, DriveApp,
  UrlFetchApp or trigger API. The census still DOES reach the handler and the flag, which is what makes
  that a real scope rather than a claim about a program with no handler in it.

-------------------------------------------------------------------------------------------------------
WHAT THE OUTPUT MAY AND MAY NOT CARRY
-------------------------------------------------------------------------------------------------------
  MAY  identity, marketplace_sku_id, master_sku, site_sku, product_name, category, series,
       variant_group, company, country, marketplace, currency, marketplace_sku_status, lifecycle,
       regular_price, minimum_price, msrp, campaign promo_price/window/status, analysable,
       source_status, missing_reasons, finding codes and their prose, and the response envelope the
       accessor validates.

  MAY NOT  spreadsheet id, sheet id, script id, deployment id, endpoint or any absolute URL, product
       URL, image URL, marketplace_product_id, regional_detail_id, campaign/campaign-line ids, email,
       token, authorization, cost, margin, customer or supplier fields.

  The image is reported as `product_image_present` + `product_image_is_absolute_url` — two booleans
  that, with `missing_reasons`, let a reader derive which of imageStateOf's three states the renderer
  would choose, without the URL and without the diagnostic re-implementing a client function.

  ENFORCEMENT IS FAIL-CLOSED AND RUNS ON THE FINISHED REPORT. A forbidden key or a secret value shape
  discards the WHOLE report — not trims it — with verdict STOP_P1_B8C_SAMPLE_REDACTION_FAILED, and the
  refusal carries the path and the rule and never the value.

-------------------------------------------------------------------------------------------------------
TESTS
-------------------------------------------------------------------------------------------------------
  assets/tests/product-strategy-row-shape-sample-p1-b8c-r1.test.js   327 / 0 · 17 mutants · 0 survived
  product-strategy-production-readback-p1-b3   336 / 0      product-strategy-replay-acceptance-p1-b8c   396 / 0
  Full sweep 462 suites, 458 green; the four pre-existing red unchanged at 3/1/7/2. New failures 0.

-------------------------------------------------------------------------------------------------------
P1-B8D ACTIVATION  -  STILL NO-GO, AND THIS ROUND DID NOT MOVE IT
-------------------------------------------------------------------------------------------------------
  PRODUCT_STRATEGY_ENABLED_ is still false, the staged section is still enabled:false, index.html still
  has no menu item, and the two productPricing actions are still the only two and both are reads. This
  round makes the live capture obtainable; it does not make the feature reachable.

**STATUS: DIAGNOSTIC PREPARED - NOT SYNCED - NO VERSION - NO DEPLOYMENT - NOT PUSHED - AWAITING THE USER'S EDITOR RUN.**


## Entry — 2026-09-12 · PRODUCT-STRATEGY-P1-B8C-R2 · live replay + render acceptance (NOTHING SYNCED, NOTHING DEPLOYED)

-------------------------------------------------------------------------------------------------------
THE INPUT: A REAL RUN AGAINST PRODUCTION, RETURNED BY THE USER
-------------------------------------------------------------------------------------------------------
      RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE()   executed 2026-09-12 18:39, Apps Script editor
      35 / 35 chunks · fingerprint FPe02df215 · length 240,126 · verdict SAMPLE_TAKEN
      universe 495 rows over 10 sites · sampled 60 · omitted 435 · capped true
      read_only true · writes 0 · writer_calls 0 · rows_modified 0 · db_writes 0 · drive_writes 0
      flag_read false · flag_modified false · deployment_created false · version_created false
      redaction.passed true · violations [] · evidence_gaps []

  REASSEMBLY IS BYTE-EXACT. The export converted every LF to CRLF (7,621, no bare LF) and merged two
  slices' own trailing newlines with its separator. Restoring one newline at each of chunks 26 and 32
  gives 240,126 characters and FPe02df215; restoring SPACES gives FP8d4dca95, which is how the
  hypothesis was decided rather than assumed. No header was edited.

-------------------------------------------------------------------------------------------------------
WHAT CHANGED IN THE REPOSITORY
-------------------------------------------------------------------------------------------------------
      assets/tests/_p1b8c-r2-live-derived.js        NEW   the 60 rows, reduced and rehydrated
      assets/tests/_p1b8c-r2-chunk-manifest.js      NEW   metadata only; no row value
      assets/tests/product-strategy-live-replay-acceptance-p1-b8c-r2.test.js   NEW   272 / 0 / 21 / 0
      assets/tests/_p1b8c-visual-runner.js          the capture is a parameter; the runner is not forked
      assets/tests/product-strategy-row-shape-sample-p1-b8c-r1.test.js   I4 re-pointed, not relaxed
      .gitignore                                    keeps the raw editor log out of version control
      docs/evidence/p1-b8c-r2-live-acceptance/      22 PNG + 1 PDF + measurements.json (2.4 MB)

  NO PRODUCTION FILE CHANGED. `git diff --name-only -- assets/specs/active/apps-script index.html
  assets/js assets/css assets/html` is EMPTY. No live runtime incompatibility was found, so §9's
  repair path was not entered.

  THE RAW LOG IS NOT COMMITTED. 240,126 characters of production prices and product names stayed
  outside the repository, which is what §4 requires.

-------------------------------------------------------------------------------------------------------
WHAT THE LIVE REPLAY PROVED
-------------------------------------------------------------------------------------------------------
  All ten live sites render OK through the shipped chain from KM.api.transport.post upward. All six
  views render on every site — sixty renders — with no NaN, no undefined, no [object Object]. Eleven
  requests, all reads; a write-shaped call throws. An envelope with the wrong meta.action is still
  refused as SOURCE_NOT_CONNECTED, on live data as on fixture data.

  THE LIVE FINDING: production holds no drawable product photograph. imageStateOf reaches
  VERIFIED_DB_MAPPING for zero of the sixty rows, because sku_details.image_url is not an absolute
  URL in production. A data finding, recorded, not repaired in the renderer.

  WHAT PRODUCTION CANNOT SHOW: every one of the 495 rows is Active, so the excluded-by-status path is
  DETERMINISTIC GAP COVERAGE from the P1-B8C fixture and is reported in its own column.

-------------------------------------------------------------------------------------------------------
BROWSER ACCEPTANCE, ON LIVE DATA
-------------------------------------------------------------------------------------------------------
  Seven exact viewports + full page, Chrome headless, production shell and production partial:
  page horizontal overflow 0 at all seven including 390x844 · Y axis fully visible 7/7 · X lane 7/7 ·
  six tab labels visible at every viewport · zero console errors · board width non-zero everywhere ·
  sidebar still 240px at 390x844 (the standing shell blocker, measured not argued) · staged section
  enabled:false in every shot.

-------------------------------------------------------------------------------------------------------
TESTS
-------------------------------------------------------------------------------------------------------
  product-strategy-live-replay-acceptance-p1-b8c-r2   272 / 0 · 21 mutants · 0 survived   (new)
  product-strategy-row-shape-sample-p1-b8c-r1         425 / 0 · 27 mutants · 0 survived
  product-strategy-replay-acceptance-p1-b8c           396 / 0 ·  9 mutants · 0 survived
  product-strategy-production-readback-p1-b3          336 / 0 · 17 mutants · 0 survived
  full sweep   PRE 462 suites / 4 red (3,1,7,2)   POST 463 suites / 4 red (3,1,7,2)   new failures 0

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED  -  **NO**            APPS_SCRIPT_NEW_VERSION_REQUIRED  -  **NO**
WEB_APP_DEPLOYMENT_REQUIRED  -  **NO**          FRONTEND_DEPLOY_REQUIRED  -  **NO**
-------------------------------------------------------------------------------------------------------
  No .gs changed and no client file changed. The diagnostic synced for R1A is unchanged and must not
  be re-synced. The P1-B7/P1-B8B frontend package remains undeployed.

**STATUS: LIVE REPLAY ACCEPTED - NOT SYNCED - NO VERSION - NO DEPLOYMENT - NOT PUSHED - PRODUCT STRATEGY STILL DISABLED - P1-B8D NOT STARTED.**

=======================================================================================================
P1-B8C-R3   SHARED IMAGE RESOLUTION - LOCAL COMMIT - NOT PUSHED - NOT DEPLOYED
=======================================================================================================
  SCOPE: make Product Strategy share SKU Details' canonical image resolution, so one
  `sku_details.image_url` gets one answer. No DB, no Apps Script, no feature flag, no navigation,
  no deployment, no Login/RBAC, no S2.

-------------------------------------------------------------------------------------------------------
THE DEFECT, AND THE ONE NOBODY REPORTED
-------------------------------------------------------------------------------------------------------
  REPORTED: SKU Details renders `assets/img/products/CO1100-R.jpg`; Product Strategy answers
  UNVERIFIED_SOURCE_REFERENCE for the same row. Each page owned its own rule - SKU Details passed
  everything through, the board demanded an absolute http(s) url - and the relative path is THE SHAPE
  PRODUCTION HOLDS (seven operator-asserted verified_mappings; P1-B8C-R2 measured VERIFIED_DB_MAPPING
  for ZERO of sixty live rows).

  FOUND ON THE WAY: SKU Details validated NOTHING. javascript:, a Windows path, a UNC path, a bare
  Drive id and a data: url all reached <img src> verbatim. PASSING A VALUE THROUGH IS NOT ACCEPTING IT.

  ALSO FOUND: psb-board-ui.js has TWO <img> elements and NEITHER had an onerror fallback, so a 404
  left an empty frame under a caption claiming a photograph.

-------------------------------------------------------------------------------------------------------
THE FIX
-------------------------------------------------------------------------------------------------------
  assets/js/utils/km-image-reference-policy.js  (NEW) - one authority, asked by both pages. An
  EXTRACTION: the mixed-content upgrade moved across unchanged, every caller kept its name, and
  nothing in it composes a path from a sku (P0-R3-R1 stays retracted). Fails CLOSED when absent.

  ALLOWLIST SHIPS EMPTY, DELIBERATELY. Nothing in the repo names an approved image host, so one
  invented here would be a guess enforced as policy. The page's OWN origin is approved without being
  listed. OPERATOR DECISION OUTSTANDING: an external-domain image_url now falls back until its host
  is declared - all 67 production data points available (60 live rows + 7 asserted mappings) are
  relative paths, so the MEASURED impact is zero.

-------------------------------------------------------------------------------------------------------
EVIDENCE
-------------------------------------------------------------------------------------------------------
  docs/evidence/p1-b8c-r3-image-acceptance/assets/  - the render proof, seven viewports + six views
  docs/evidence/p1-b8c-r3-image-acceptance/live/    - the live-sixty regression run
  MEASURED BY naturalWidth, not by counting elements: htmlImagesBroken 0 at every viewport, chart
  photograph markers > 0 WHILE fallback plates were still drawn, every chart href an operator-asserted
  path, page horizontal overflow 0 including 390x844, zero console errors, flag still false.
  The live sixty still resolve to refused/absent - BECAUSE R2's diagnostic removed the addresses,
  which is recorded as the reason rather than reported as a regression.

-------------------------------------------------------------------------------------------------------
TESTS
-------------------------------------------------------------------------------------------------------
  product-strategy-image-resolution-p1-b8c-r3         334 / 0 · 20 mutants · 0 survived   (new)
  product-strategy-production-readback-p1-b3          339 / 0 · 17 mutants · 0 survived   (re-pointed)
  product-strategy-replay-acceptance-p1-b8c           396 / 0 ·  9 mutants · 0 survived
  product-strategy-live-replay-acceptance-p1-b8c-r2   272 / 0 · 21 mutants · 0 survived
  product-strategy-row-shape-sample-p1-b8c-r1         425 / 0 · 27 mutants · 0 survived   (re-pointed)
  read-stability-images-and-invariants-f1-7n-fb-4e-r3 109 / 0                             (re-pointed)
  read-path-measurement-f1-7n-fb-4e-r3                 56 / 0                             (re-pointed)
  sku-lifecycle-override-cleanup-f1-s1                 19 / 0                             (re-pointed)
  full sweep   PRE 463 suites / 4 red (3,1,7,2)   POST 464 suites / 4 red (3,1,7,2)   new failures 0

  RE-POINTED, NOT RELAXED: the touched assertions encoded the rule R3 replaced (a bare filename is
  unverified) or built a browser sandbox without the new script. Fixture hosts are DECLARED through
  the operator allowlist, which exercises the mechanism instead of weakening the rule.

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED  -  **NO**            APPS_SCRIPT_NEW_VERSION_REQUIRED  -  **NO**
WEB_APP_DEPLOYMENT_REQUIRED  -  **NO**          FRONTEND_DEPLOY_REQUIRED  -  **NO** (until the user
                                                deploys the standing P1-B7/P1-B8B frontend package)
-------------------------------------------------------------------------------------------------------
  No .gs changed. index.html gained EXACTLY ONE line - the policy script tag - and lost none. No
  stylesheet, no page partial, no feature flag, no navigation, no Login/RBAC file changed.
  NOTE: km-image-reference-policy.js and the two client files that now ask it are FRONTEND assets.
  They ship with the next frontend deployment, which remains USER-owned and unscheduled.

**STATUS: IMAGE RESOLUTION SHARED - NOT SYNCED - NO VERSION - NO DEPLOYMENT - NOT PUSHED - PRODUCT STRATEGY STILL DISABLED - P1-B8D NOT STARTED.**

=======================================================================================================
P1-B8C-R3-R1   IMAGE REFERENCE UNIVERSE CENSUS - COMPATIBILITY GATE - LOCAL COMMIT - NOT PUSHED
=======================================================================================================
  SCOPE: before DEPLOYING R3, establish what production's sku_details.image_url universe actually
  contains, so the shared policy's empty allowlist cannot silently break a working image. This is not
  a revert of R3 and does not enable Product Strategy. No DB, no shipped Apps Script, no feature flag,
  no navigation, no deployment, no Login/RBAC, no S2. NO CLIENT RUNTIME FILE CHANGED.

-------------------------------------------------------------------------------------------------------
WHY THE GATE
-------------------------------------------------------------------------------------------------------
  R3 said "all 67 production data points are relative paths". Sixty of those were P1-B8C-R2's sample of
  SIXTY OF 495 PRICING rows, and R2's diagnostic had REMOVED every image address before the log left the
  editor. sku_details is a different table at a different grain. Sixty of one is not a census of another.

-------------------------------------------------------------------------------------------------------
WHAT THE REPOSITORY PROVED (1,032 files, 311 candidate references)
-------------------------------------------------------------------------------------------------------
  filename-only  img1..img20.jpg   archived pre-database data.js, not loaded by production   ACCEPTED
  repo-relative  assets/img/products/*.jpg x7   operator-asserted from live rows             ACCEPTED
  external image host   eoimages.gsfc.nasa.gov  ONLY in tools/geo/ + PROVENANCE.md      NOT A RUNTIME SOURCE

  NO SHIPPED FILE references an external image host. No asset base and no CDN base exists; the
  `baseUrl` machinery that does exist is the API transport's /exec endpoint.

  FOURTH CONSUMER FOUND: campaign-risk.js:438 renders the same sku_details image column with NO
  resolver and NO validation. R3's parity claim does not cover it. RECORDED, NOT REPAIRED - this
  round measures. It has its own onerror, so only validation is missing.

-------------------------------------------------------------------------------------------------------
THE GATE, REDUCED
-------------------------------------------------------------------------------------------------------
  Of every class R3 removes, only UNAPPROVED_HOST could ever have been a working picture; every other
  removal is a value no browser could fetch. One question remains: does production hold an absolute
  image URL? And compatibility is asserted as THE ADDRESS IS BYTE-IDENTICAL, not as "it still shows" -
  a policy that displayed a different address would pass the weaker form and break every picture.
  old rejected / new displayed = 0.

-------------------------------------------------------------------------------------------------------
THE DIAGNOSTIC
-------------------------------------------------------------------------------------------------------
  RUN_P1_IMAGE_REFERENCE_UNIVERSE_CENSUS()   editor-only, no parameters, read-only.
  One column of one table. No cap, no sampling. Counts by shape + hostnames only; no path, filename,
  SKU, row id or URL. An authority containing '@' stops the WHOLE report. Buckets must sum to the whole.
  Absolute rows scored SEPARATELY as old_displayed_new_depends_on_allowlist.
  Proven EQUIVALENT to km-image-reference-policy.js over a 35-value corpus reaching every branch of both.

-------------------------------------------------------------------------------------------------------
TESTS
-------------------------------------------------------------------------------------------------------
  product-strategy-image-universe-census-p1-b8c-r3-r1  159 / 0 · 15 mutants · 0 survived   (new)
  product-strategy-image-resolution-p1-b8c-r3          336 / 0 · 20 mutants · 0 survived   (re-pointed)
  product-strategy-production-readback-p1-b3           340 / 0 · 17 mutants · 0 survived   (re-pointed)
  product-strategy-row-shape-sample-p1-b8c-r1          425 / 0 · 27 mutants · 0 survived   (re-pointed)
  full sweep   PRE 464 suites / 4 red (3,1,7,2)   POST 465 suites / 4 red (3,1,7,2)   new failures 0

  THE TWO ENTRY-POINT GUARDS FAILED THE MOMENT THE CENSUS APPEARED, which is the mechanism working:
  they ENUMERATE rather than count, so the only way past is to declare what was added.

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED  -  **YES_DIAGNOSTIC_ONLY**   NEW_VERSION_REQUIRED  -  **NO**
WEB_APP_DEPLOYMENT_REQUIRED  -  **NO**                  FRONTEND_DEPLOY_REQUIRED  -  **NO**
-------------------------------------------------------------------------------------------------------
  Sync ONLY assets/tools/apps-script-diagnostics/TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs into
  the Apps Script editor and run RUN_P1_IMAGE_REFERENCE_UNIVERSE_CENSUS() from the editor. No shipped
  .gs changed, so no version and no deployment. The R3 frontend package remains undeployed and
  USER-owned; the census answers whether its allowlist needs an entry before it ships.

**STATUS: GATE BUILT - CENSUS NOT YET RUN - NOT SYNCED - NO VERSION - NO DEPLOYMENT - NOT PUSHED - PRODUCT STRATEGY STILL DISABLED - P1-B8D NOT STARTED.**

=======================================================================================================
P1-B8C-R3-R2   IMAGE CONSUMER PARITY - IMAGE GATE CLOSED - LOCAL COMMIT - NOT PUSHED
=======================================================================================================
  SCOPE: close the image compatibility gate on the USER's full production census, and bring the one
  remaining consumer into the shared resolver. No Apps Script runtime, no new diagnostic, no DB read,
  no version, no deployment, no flag, no navigation, no CSP, no CDN, no external host, no Login/RBAC,
  no S2, no P1-B8D.

-------------------------------------------------------------------------------------------------------
THE PRODUCTION CENSUS (USER Editor readback, frozen as test data)
-------------------------------------------------------------------------------------------------------
  P1_IMAGE_REFERENCE_UNIVERSE_CENSUS / P1-B8C-R3-R1 / 1 chunk / FPa6684fce / 2425 chars / CENSUS_TAKEN
  total 192 · blank 14 · present 178 · relative_asset 178 · EVERY OTHER SHAPE 0 · external hosts NONE
  old_displayed 178 -> new_displayed 178 · new_rejected 0 · depends_on_allowlist 0
  old_rejected_new_displayed 0 · both_fallback 14 · allowlist_decision_required FALSE
  writes 0 · rows_modified 0 · safety.passed true · refusals []

  => THE SHARED POLICY IS 100% COMPATIBLE WITH THE PRODUCTION UNIVERSE.
  => APPROVED_EXTERNAL_HOSTS STAYS EMPTY - now because 192 rows say so, not because nobody looked.

-------------------------------------------------------------------------------------------------------
WHAT CHANGED
-------------------------------------------------------------------------------------------------------
  campaign-risk.js   the fourth consumer joins the shared resolver. It had been putting r.image into
                     <img src> with no judgement at all. Fails CLOSED (no `: r.image` fallback), keeps
                     its original onerror and placeholder, composes no path from a sku, holds no rule
                     of its own. No layout class touched.
  sku-handbook.js    a REFUSED reference used to fall through to <img src="">, and an empty src
                     resolves to the PAGE's own URL - a broken image drawn where the placeholder
                     belongs. ABSENT and REFUSED now render apart and are counted apart.
  index.html         the co-deployed cache token rotated across the whole set, plus the three
                     image-coupled files. 23 refs, one token, no stale refs.
  _release-order.js  the new round token appended. NEW rather than reused: fe7b07c is on origin, so
                     the previous token's bytes have been published.

-------------------------------------------------------------------------------------------------------
FOUR-PAGE PARITY + BROWSER
-------------------------------------------------------------------------------------------------------
  SKU Details · SKU Handbook · Product Strategy · Campaign Risk, one corpus, each page's own shipped
  expression: repo-relative path displays byte-identical on all four; blank falls back on all four;
  THIRTEEN refusal shapes refused on all four. Parity asserted as a LOOP, both directions.
  Real browser: 7 <img> per page, 7 loaded (naturalWidth > 0), 0 BROKEN, 10 placeholders, 0 errors,
  and the four pages produced IDENTICAL src lists.
  Product Strategy live capture: 7 viewports, page overflow 0, X/Y axes complete, six tabs, 0 errors.
  The asset capture's 390x844 lane is wider than the chart and scrolls INSIDE the chart's own
  overflow-x:auto box (page overflow still 0) - pre-existing, already in the committed R3-R1 evidence,
  and asserted as a fact rather than averaged away.

-------------------------------------------------------------------------------------------------------
TESTS
-------------------------------------------------------------------------------------------------------
  product-strategy-image-consumer-parity-p1-b8c-r3-r2   185 / 0 · 16 mutants · 0 survived   (new)
  product-strategy-image-universe-census-p1-b8c-r3-r1   160 / 0 · 15 mutants · 0 survived   (re-pointed)
  product-strategy-image-resolution-p1-b8c-r3           336 / 0 · 20 mutants · 0 survived   (re-pointed)
  read-stability-images-and-invariants-f1-7n-fb-4e-r3   109 / 0
  single-row-mutation-isolation-...-r6-r6-r2            136 / 0 · 12 mutants · 0 survived
  full sweep   PRE 465 suites / 4 red (3,1,7,2)   POST 466 suites / 4 red (3,1,7,2)   new failures 0

  TWO TOKEN-COHERENCE GUARDS CAUGHT THE ROTATION AND WERE RIGHT TO. They are a deployment rule, not an
  incidental assertion, and the rule was followed rather than the guards re-pointed.
  R3-R1's G13 SURVIVED because the gap it modelled had been closed; it now guards the closure.

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED  -  **NO**            APPS_SCRIPT_NEW_VERSION_REQUIRED  -  **NO**
WEB_APP_DEPLOYMENT_REQUIRED  -  **NO**         FRONTEND_DEPLOY_REQUIRED  -  **YES** (with P1-B8D)
-------------------------------------------------------------------------------------------------------
  No .gs changed. The census function stays in the Apps Script project until the P1 cleanup; it does
  not need re-syncing or re-running. The frontend assets ship WITH P1-B8D's, in one deployment.

**STATUS: IMAGE GATE CLOSED - NOT SYNCED - NO VERSION - NO DEPLOYMENT - NOT PUSHED - PRODUCT STRATEGY STILL DISABLED - P1-B8D IS THE ONLY NEXT STEP.**

=======================================================================================================
P1-B8D  -  CONTROLLED ACTIVATION PACKAGE                                          (local commit only)
=======================================================================================================
RELEASE  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11     supersedes the never-synced R10 candidate
STATUS   PREPARED - NOT SYNCED - NO VERSION - NO DEPLOYMENT - NOT PUSHED

-------------------------------------------------------------------------------------------------------
WHAT ACTIVATION IS
-------------------------------------------------------------------------------------------------------
  Two booleans, and there is no third:

    PRODUCT_STRATEGY_ENABLED_                        false -> true   00_config.gs
    KM_STAGED_SECTIONS_['product-strategy'].enabled  false -> true   assets/js/app.js

  No query parameter, no localStorage key, no DOM class, no TEMP function, no route that skips a gate.
  The suite asserts the ABSENCE of each of those, which is a stronger claim than the two values.

  THE MENU IS BUILT FROM THE REGISTRY, NOT WRITTEN INTO index.html. The activation note in app.js said
  to "add the sidebar item to index.html"; that would have created a SECOND definition of the six
  labels psb-views.js owns, a second definition of the placement `insertBefore` owns, and a menu that
  `enabled: false` could no longer switch off. `mountStagedMenus` is the one caller of the builder and
  refuses any section whose `enabled` is not exactly true. index.html still contains NO Product
  Strategy markup - the four P1-B8B assertions that say so were written when the feature was OFF and
  are still true with it ON, which is what makes the navigation rollback one boolean.

-------------------------------------------------------------------------------------------------------
APPS_SCRIPT_SYNC_REQUIRED  -  **YES, TWO FILES, IN THIS ORDER**
-------------------------------------------------------------------------------------------------------
  1. 00_config.gs                  PRODUCT_STRATEGY_ENABLED_ = true
                                   CONFIG_BUILD_VERSION_     -> R11
  2. 63_api_v1_system_health.gs    SYS_DEPLOYMENT_RELEASE_    -> R11
                                   SYS_BUILD_VERSION_         -> R11
                                   manifest rows for 00_config.gs and 63_ -> R11

  Config first: 63_ declares what it EXPECTS 00_config to carry, so pasting 63_ first leaves a window
  in which the deployment reports a mismatch against a file that has not arrived yet.

  AND NOTHING ELSE. 72_ did not change - no action, no response shape, no gate position - so PPW_BUILD
  stays R10 and 72_ must NOT be re-pasted; re-pasting an unchanged file is how an unrelated edit
  reaches production by accident. 01_router.gs did not change either, and the ACTION CONTRACT VERSION
  is deliberately not bumped: a flag is not a contract, and bumping it would tell every deployed client
  to re-check a vocabulary that is byte-identical to the one it holds.
  appsscript.json unchanged. No OAuth scope added.

APPS_SCRIPT_NEW_VERSION_REQUIRED  -  **YES**
WEB_APP_DEPLOYMENT_REQUIRED  -  **YES** (update the EXISTING deployment; never create a second, never
                                         delete the current one)
FRONTEND_DEPLOY_REQUIRED  -  **YES** (index.html + the 34 assets on the activation token)

-------------------------------------------------------------------------------------------------------
THE RELEASE ID HAS DOWNSTREAM CONSUMERS, AND THIS ROUND FOUND THEM
-------------------------------------------------------------------------------------------------------
  Three diagnostic pins TRACK SYS_DEPLOYMENT_RELEASE_ so that a census run against a correctly synced
  deployment is never refused for its build. Moving the release for Product Strategy moved all three:

    TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs       R6R7_ACTIVATION_BUILD_  -> R11
    TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs       TEMP_E3_CENSUS_BUILD_   -> R11
    TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs   S1_BUILD_               -> R11

  Left at R10 they would have STOPped on the first healthy R11 deployment and reported a build mismatch
  that was the ledger working as designed. Two suites caught it within minutes - the system working -
  and the cost is that "activate Product Strategy" is permanently also "re-pin the AI Plan censuses".
  These are editor-run diagnostics under assets/tools/, NOT part of the deployed project, so they are
  not on the sync list above; they matter the next time the USER runs either census.

-------------------------------------------------------------------------------------------------------
FRONTEND CO-DEPLOY - ONE TOKEN, AND A STALE-CACHE DEFECT CLOSED
-------------------------------------------------------------------------------------------------------
  activation-p1b8d-20260912, carried by 34 references. staleAppTokenRefs = []. misplaced = [].

  TWO SETS BECAME ONE, AND THAT IS A DEFECT BEING CLOSED RATHER THAN A TIDY-UP. The eleven Product
  Strategy references carried `productstrategy-p1b8b-20260912`, a token set at fb31e2c and PUBLISHED -
  and THREE files under it changed bytes afterwards without it moving: km-product-pricing-adapter.js
  and psb-board-ui.js at P1-B8C-R3, psb-data-contract.js with them. The stale-reference guard could not
  see it, because it only reports a reference left behind on a token it KNOWS and that token was never
  in ROUND_TOKENS. A returning browser therefore held the pre-R3 psb-board-ui.js - the copy with no
  <img> onerror fallback - and would have carried it straight through activation. Folding the set in
  fixes the three stale copies and puts those eleven references under the guard permanently.

-------------------------------------------------------------------------------------------------------
DRAFT PRICE DISCLOSURE
-------------------------------------------------------------------------------------------------------
  PRICING_DATABASE_MAPPING section 4 records pricing_list.price_status's default as "draft or active -
  to be confirmed". Activation is when that stops being a footnote: the board is about to show numbers
  whose status nobody has decided, to people who will read them as the price the company charges.

  So the status is CARRIED and never translated. The adapter promotes 72_'s price_status_raw onto the
  row verbatim - no casing, no trimming, no bucketing, and no default when the column is absent. The
  contract declares it once (PSB_CONTRACT.PRICE_STATUS: mapped false, filtered false, vocabulary not
  pinned, no final value exists). The board shows the DISTRIBUTION of the raw strings on the context
  row above all six views, with the full sentence in Advanced details - both read from that one
  declaration, so the short form and the long form cannot drift.

  THREE OUTCOMES ARE KEPT APART, and the browser run is what forced that. The first version mapped a
  missing key to null, so the chip announced "no price status on the row" about rows whose source had
  never carried the column - a claim about the data made by the adapter's own gap. `undefined` (this
  source does not carry it), `null` (the row carries it and it is empty) and a value are three facts.

-------------------------------------------------------------------------------------------------------
ROLLBACK  -  REHEARSED, NOT DESCRIBED
-------------------------------------------------------------------------------------------------------
  FASTEST STOP (server, no frontend deploy needed):
    1. 00_config.gs: PRODUCT_STRATEGY_ENABLED_ = false
    2. Save
    3. Create a NEW Apps Script version   (an edited file that is not deployed changes nothing)
    4. Update the EXISTING Web App deployment
    5. Verify: system.health `product_strategy_enabled` false; a productPricing read answers
       FEATURE_DISABLED with dbOpened false and tablesRead 0
    6. LATER, and optional: app.js `enabled: false` + a frontend deploy removes the menu entirely

  Section F of the activation suite EXECUTES steps 1 and 5: it rebuilds the sandbox from the real
  00_config.gs with the constant set back to false, calls both handlers through the real resolver, and
  measures that the spreadsheet was opened ZERO times. The gate sits before io.openTarget() in both
  handlers, which is what makes this a stop rather than a slower read.

  NEVER: delete a deployment, create a second one, roll back the whole Operation System, use git reset
  or rewrite history, or make the rollback depend on a database mutation. The feature has never written
  anything, so there is nothing to compensate - and a rollback that had to write would be a second way
  to fail.

-------------------------------------------------------------------------------------------------------
SECURITY POSTURE - STATED, NOT SOFTENED
-------------------------------------------------------------------------------------------------------
  While PRODUCT_STRATEGY_ENABLED_ was false it was doing duty as a lock, and the identity baseline said
  so in as many words. Switching it on does not weaken a lock; it RETIRES A STAND-IN. What now protects
  the two Product Strategy reads is what protects the other actions behind this ANYONE_ANONYMOUS Web
  App: nothing about the caller. That is one feature worse than yesterday, it is recorded in
  identity-boundary-baseline-sec-a0 rather than smoothed over, and it is one of the facts that argues
  for Login/RBAC in P2-A. The two actions are reads; no write path was created, because there is none
  to create.

-------------------------------------------------------------------------------------------------------
TESTS
-------------------------------------------------------------------------------------------------------
  product-strategy-activation-p1-b8d                    347 / 0 - 18 mutants - 0 survived   (new)

  Re-pointed because activation changed what is true, not because they were wrong:
    api-product-pricing-workspace-p1-b1 - product-strategy-production-readback-p1-b3
    product-strategy-row-shape-sample-p1-b8c-r1 - product-strategy-scope-correction-p1-b8a
    product-strategy-integration-p1-b5 - product-strategy-shell-integration-p1-b7
    product-strategy-information-architecture-p1-b8b - product-strategy-replay-acceptance-p1-b8c
    product-strategy-live-replay-acceptance-p1-b8c-r2 - identity-boundary-baseline-sec-a0
    deployment-r10-activation-boundary-p1-b7f - api-product-pricing-envelope-action-p1-b7e
    controlled-no-action-activation-manifest-...-r6-r7-r3
    positive-residual-and-submit-readiness-census-...-r5-r1
    the three image suites (round-scoped ranges given both ends, again)

  "PRODUCT_STRATEGY_ENABLED_ is false" was asserted in NINE suites. It was true in all nine and
  load-bearing in none: each was reaching for something else and used the value because it was cheap.
  Nine copies of one fact is nine edits the day it changes. Each is now repaired toward what its own
  section is about - the gate's POSITION, the round's own diff, the one-switch rule - and the VALUE has
  exactly one owner.

  THE SHARED HARNESS GAINED TWO THINGS IT HAD ALWAYS LACKED. `insertBefore` (every insertion it had
  ever modelled was an append, so "above Pricing Center" was unaskable) and a `preventDefault` that
  RECORDS (a no-op cannot tell "the handler consumed this" from "the handler ignored it", which is
  exactly the half of keyboard activation that keeps Space from scrolling the page).

-------------------------------------------------------------------------------------------------------
BROWSER ACCEPTANCE  (real Chrome, real sidebar, production menu mount)
-------------------------------------------------------------------------------------------------------
  7 viewports - 6 views - 7 states - scenario - print PDF - full-page 1920.
  All seven viewports: page overflow 0 - Product Strategy immediately above Pricing Center - six
  sub-tabs in order - Y axis complete - 0 console errors.
  Six views: each aria-selected itself and only itself, every tab label visible, overflow 0.
  Seven states: each states its own case, #view stays EMPTY behind every refusal, no two alike.
  Images: every <img> loaded, 0 broken, 0 IMAGE FAILED TO LOAD notices.
  390x844 X lane: NOT fully visible - recorded, not passed. It scrolls inside the chart's own
  overflow-x box (scrollW 264 over clientW 76), page overflow still 0, byte-identical to the committed
  R3-R1 and R3-R2 evidence. The fixed 240px sidebar beneath it is the global shell blocker, deferred.

  THE RUNNER'S SECOND TEST-ONLY ACT IS RETIRED. It used to CALL buildStagedMenu, because production
  never did. In `activated` mode it calls `mountStagedMenus` - the production function - and STOPs if
  that mounts nothing, rather than reaching for the builder underneath. It also swaps its own
  approximated sidebar for index.html's, because a hand-written sidebar is a second model of the
  document and the placement anchor would have resolved against the model rather than the page.

-------------------------------------------------------------------------------------------------------
DEFERRED, AND NAMED
-------------------------------------------------------------------------------------------------------
  Login / RBAC and the ANYONE_ANONYMOUS posture      -> P2-A
  Global responsive / the fixed 240px sidebar        -> Phase 1 closing QA
  CSP, CDN, external image hosts, asset base         -> Phase 2
  Sub-tab URL routing (the shell has no router)      -> unscheduled
  P1 FINAL CLEANUP: remove the TEMP diagnostics, remove any raw editor log still present, classify
  evidence as retained or removed, run the branch-to-main merge checklist, and pick S2 back up.

**STATUS: ACTIVATION PACKAGE READY - NOT SYNCED - NO VERSION - NO DEPLOYMENT - NOT PUSHED.**


=======================================================================================================
P1-B8D-R3  -  MAIN MERGED INTO THE FEATURE BRANCH, AND THE TWO PINS THAT HAD COPIED A RELEASE
=======================================================================================================
Date:                        2026-09-13
Merge:                       origin/main (c139943) into feature/product-strategy-board-p0 (968f9f8)
                             --no-ff, normal forward merge commit. No squash, no rebase, no cherry-pick.
Release identity:            UNCHANGED - F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11. No .gs owner file moved.
APPS_SCRIPT_SYNC_REQUIRED:   NO       DB / Sheets / Drive writes: 0       New deployment: NO
FRONTEND_GITHUB_PAGES:       unchanged by this round (the 34-asset set is byte-identical)

WHAT GIT COULD NOT SEE
-------------------------------------------------------------------------------------------------------
  Two files were edited on both sides since the merge base and both auto-merged cleanly, because the
  changes fell in different hunks:
    assets/tools/apps-script-diagnostics/TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs
    assets/tests/positive-residual-and-submit-readiness-census-...-r6-r7-r5-r1.test.js

  The feature branch moved S1_BUILD_ to R11 because SYS_DEPLOYMENT_RELEASE_ moved; main grew the S1-R5A
  freeze block and its suite in the same file. Both landed. But TWO assertions in main's suite SPELLED
  the previous release as a literal - AD7d and AD12k - and a literal is a claim about a world, not about
  a rule. Merging a later release made them assert that the deployment had not moved, which is something
  that suite was never asked to know. Textually clean, semantically red: 2 failures, no conflict marker.

WHAT WAS REPAIRED, AND WHAT WAS DELIBERATELY NOT
-------------------------------------------------------------------------------------------------------
  AD7d / AD12k are CURRENT-STATE evidence - they drive the census as it is now - so they are asked
  against the owner rather than against a copy:
    S1_PIN_          one named reading of S1_BUILD_ from the file under test (three other assertions
                     in the same suite already read it this way; these two had copied the value)
    AD7d             the census reports its own pin
    AD7d1            and that pin equals the release 63_ declares - a SECOND file, a second owner, so
                     the value is still checked rather than allowed to be anything
    AD12k0 / AD12k   the freeze recorded the file's pin, and the readback reports it unmoved

  NOT repaired, because it is not broken: S1_MANIFEST_P_BEFORE_ still carries "build":"...-R7-R6". That
  is a FROZEN baseline from a live run on that release. It is historical evidence and marching it to R11
  would be editing a measurement to agree with today.

  NOT repaired, because it was never failing: single-scope-allowlist-cutover-...-r7-r6 and
  override-audit-...-r5-r1 read every file at THIS ROUND'S OWN COMMIT through atRound(), and F0 asserts
  the range has both ends. They are round-scoped and they survive their own release moving - which is
  the shape the two repaired assertions now have.

MUTANTS
-------------------------------------------------------------------------------------------------------
  N221  the manifest reports the deployment build instead of its own pin. Driven in a world whose
        deployment has DRIFTED from the pin, because against a correctly synced project the two answers
        are identical and the mutant is invisible - the first version of this probe survived for exactly
        that reason and reported nothing.
  N222  the readback stops reporting the build, so "unmoved" has nothing left to compare.
  N223  the pin lags the release, so the census would refuse a correctly synced project. Anchored on the
        pin AS DECLARED, never on a spelled release: an anchor that names a value expires the next time
        that value moves, which is the defect this whole entry is about.

TESTS
-------------------------------------------------------------------------------------------------------
  PRE  (968f9f8, pre-merge)   467 suites, 4 red - the four known baselines - 0 survived, 0 PROBE ERROR
  POST (merged + repaired)    467 suites, 4 red - the same four - 0 survived, 0 PROBE ERROR
  positive-residual census    5136 passed / 0 failed / 226 mutants caught / 0 survived
  No suite skipped, no assertion relaxed, no test deleted.

**STATUS: LOCAL MERGE COMMIT - NOT PUSHED - NO APPS SCRIPT SYNC - NO DEPLOYMENT.**


=======================================================================================================
P1-B8D-R4  -  THE CAPABILITY MIRROR HAD NO PRODUCER, AND THE LIVE PAGE REFUSED ITSELF
=======================================================================================================
Date:                        2026-09-13
Trigger:                     LIVE ACCEPTANCE FAILURE. With R11 deployed and product_strategy_enabled
                             true on the wire, all six Product Strategy sub-tabs rendered:
                               "Product Strategy is not enabled yet."
                               "The capability is off, so no request was sent."   FEATURE_DISABLED
Release identity:            UNCHANGED - F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11. No .gs file changed.
APPS_SCRIPT_SYNC_REQUIRED:   NO        New deployment: NO       DB / Sheets / Drive writes: 0
FRONTEND_GITHUB_PAGES:       REQUIRED - two shipped modules changed; the co-deployed set rotated onto
                             capabilityderive-p1b8dr4-20260913 (34 refs, 0 stale, 0 misplaced).

ROOT CAUSE - A THIRD AUTHORITY WITH NO INPUT
-------------------------------------------------------------------------------------------------------
  km-product-pricing-workspace.js keeps a capability mirror, `_enabled`, default false, raised only by
  setCapability(caps). Its own header says "only a server capability payload can raise it".

  setCapability had ZERO callers in assets/js and in index.html. The boot bootstrap
  (app.js -> KM.DB.applyClientCapabilities -> getClientCapabilities -> KM.api) carries three
  backend-owned flags - requestOrderDraftV2FlatCutover, requestOrderSiteConfirmRequired,
  inventoryAiPlanDbGenerationEnabled - and has never heard of this accessor. 03_'s
  handleGetClientCapabilities_ does not publish product_strategy_enabled at all.

  So in a browser the mirror was false from load to unload. P1-B8D moved the two authorities it had
  named and could not move this one, because nothing in the corpus could see it.

WHY EVERY SUITE PASSED, INCLUDING THE BROWSER ACCEPTANCE
-------------------------------------------------------------------------------------------------------
  _p1b8c-replay.js install() called setCapability({product_strategy_enabled:true}) in the same call
  that swapped the transport. Every replay-driven suite - and the seven-viewport activated runner -
  therefore ran with the one input production never receives. Its header even stated the defect as a
  virtue: "production default is false and no file in this repository changes that".

  And shell-integration E2/E2a asserted that neither the shell nor the page controller mentions
  setCapability. Correct while the feature was installed-not-activated; after activation it stood over
  a page that refused itself and reported the arrangement as right.

THE REPAIR - DERIVED, NOT DECLARED. STILL TWO AUTHORITIES.
-------------------------------------------------------------------------------------------------------
  ACTIVATION AUTHORITIES (unchanged in number, and this is the point):
    1. SERVER      00_config.gs  PRODUCT_STRATEGY_ENABLED_          - access authority, last gate
    2. NAVIGATION  app.js        KM_STAGED_SECTIONS_[...].enabled   - menu visibility authority

  The client capability is NOT a third authority and must never become one. It is a DERIVED CACHE of
  authority 1: the accessor reads `system.health` - already deployed, already read-only, already on the
  transport's session-stable metadata allowlist - and takes 63_'s flat product_strategy_enabled. No new
  server field, no new action, no fourth flag, no Apps Script change.

  FAIL CLOSED ON EVERY UNKNOWN: no transport, a refused read, a non-JSON answer, a missing field, or a
  value that is not literally true all leave the mirror false. 72_ still refuses on the server flag
  before io.openTarget(), so lowering the mirror is a saving and raising it is never a permission.

ROLLBACK - UNCHANGED, AND STILL SERVER-FIRST
-------------------------------------------------------------------------------------------------------
  PRODUCT_STRATEGY_ENABLED_ = false -> save -> new version -> update the existing deployment. The next
  page life derives false from system.health and sends zero pricing reads; a page already open reaches
  a handler that refuses before opening a spreadsheet. No frontend deploy is required to roll back.

TESTS
-------------------------------------------------------------------------------------------------------
  NEW  product-strategy-live-activation-p1-b8d-r4  63 passed / 0 failed / 9 mutants / 0 survived
       Reproduces the live screen through the production entry with the capability payload PARSED from
       03_, and calls setCapability nowhere - a reproduction that supplies the missing input is not one.
  RE-POINTED (each because the repair changed what is true, none relaxed):
       _p1b8c-replay.js            serves the health read; no longer raises the mirror
       _p1b8c-visual-runner.js     capabilityOff is a SERVER answer, not a poke at the client
       shell-integration b7 E2/E2a "never mention" -> "never DECLARE"; the page may ASK
       replay-acceptance b8c       counted all requests, meant PRICING requests; L3 re-anchored
       live-replay b8c-r2          same; I4a names the read vocabulary instead of matching /\.get$/
       integration b5 N11          rule unchanged; its SYNCHRONOUS assumption did not survive
       activation b8d J3 / H1 / K12  three round-scoped assertions whose far end was "now"
  Browser: 7 viewports, overflow 0, Product Strategy above Pricing Center, six sub-tabs, Y axis
       complete, six view screenshots with six distinct hashes - through the PRODUCTION derive.

KNOWN, MEASURED, NOT FIXED THIS ROUND
-------------------------------------------------------------------------------------------------------
  THE REFUSAL BOX HAS NO STYLING. product-strategy-board.css scopes all 482 of its rule blocks under
  .psb-page and defines no rule for .psb-state, .psb-state__headline, .psb-state__detail or
  .psb-state-host. Every refusal - including the one the operator photographed - renders as unstyled
  paragraphs. It is legible and correct, and it is a real gap: measured here, left for a small round of
  its own rather than folded into a capability fix.

**STATUS: LOCAL COMMIT - NOT PUSHED - FRONTEND REDEPLOY REQUIRED - NO APPS SCRIPT SYNC.**


=======================================================================================================
P1-B8D-R5  -  THE UNIVERSE ARRIVED AND NOTHING COULD USE IT
=======================================================================================================
Date:                        2026-09-13
Trigger:                     LIVE ACCEPTANCE FAILURE, second round. R4's capability derive shipped and
                             worked - the page stopped saying FEATURE_DISABLED. It then said this on
                             all six sub-tabs, permanently:
                               "Choose a site to analyse."
                               "This board reads one site at a time - a company, a country and a
                                marketplace - because prices from two sites on one axis would compare
                                products that do not compete."
                             With NO CONTROL OF ANY KIND on the page. Zero <select> elements.
Release identity:            UNCHANGED - F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11. No .gs file changed.
APPS_SCRIPT_SYNC_REQUIRED:   NO        New deployment: NO       DB / Sheets / Drive writes: 0
FRONTEND_GITHUB_PAGES:       REQUIRED - three shipped modules changed; the co-deployed set rotated onto
                             sitechooser-p1b8dr5-20260913 (34 refs, 0 stale).

ROOT CAUSE - A STATE WITH NO EXIT
-------------------------------------------------------------------------------------------------------
  `productPricing.siteUniverse.get` WAS sent, WAS answered, and WAS adapted: 10 READY sites across
  three companies. `SU.narrow(universe, {})` computed the option list for every tier. The controller
  then rendered AWAITING_SITE_SELECTION into `#psb-state-host` and stopped.

  That state is left only by `C.select(scope)`. The ONLY production caller of `C.select` is the
  initial `C.select({})` inside `loadUniverseResolved`, four lines above. Nothing a person can click
  reaches it. Measured through the production entry: universe requests 1, workspace requests 0,
  `#scope` children 0, `<select>` count 0, `btnPresent` listeners 0.

WHY THE SELECTOR LOOKED PRESENT, AND WAS NOT
-------------------------------------------------------------------------------------------------------
  The partial has a `#scope` host and `psb-board-ui.js` has a Company -> Country -> Marketplace
  ladder. They are not this ladder. `renderScope()` is reachable only from `render()`, only from
  `boot()`, only from `board.mount({adapter})` - AFTER a workspace read has succeeded - and it
  derives its three tiers from the LOADED ROWS of the one site in hand, so each holds exactly one
  value and renders as read-only context.

  THE CONTROL THAT LETS YOU CHOOSE A SITE ONLY EXISTED ONCE YOU HAD CHOSEN ONE.

WHY EVERY SUITE PASSED, AGAIN
-------------------------------------------------------------------------------------------------------
  Every suite hands the controller a scope: `PAGE.mount({ scope: {company, country, marketplace} })`.
  The visual runner did the same one layer out - `c.select({...})` - so the seven-viewport browser
  acceptance photographed a fully rendered board over a page that could not be operated.
  Production's only caller is `P.onMount`, which passes `{ route: wanted }` and NO SCOPE.

  This is R4's sentence about a different input: a harness that supplies the one thing production
  never supplies cannot fail for the one reason production fails.

THE REPAIR
-------------------------------------------------------------------------------------------------------
  A PAGE-OWNED CHOOSER, FED BY THE UNIVERSE AND BY NOTHING ELSE. `P.renderSiteChooser` draws the
  three tiers into `#psb-site-host` - a new host the board never touches, so it survives the mount it
  causes and a different site can still be chosen afterwards. Options come from `narrowed.options`,
  which comes from the universe response. There is no default site, no remembered site, no site in a
  query string, and the first option is an empty placeholder that stays selected until a person acts.

  INITIAL SITE POLICY: NONE, DELIBERATELY. §4 allowed a deterministic first-READY-site only if other
  read-only workspaces in this system do that. They do not: the shell's own shared scope selector
  (`assets/js/utils/scope-select-modal.js`) renders "Select country..." and refuses to confirm an
  unchosen scope in as many words - "never auto-confirm All/unselected". A tier the universe has
  already resolved to one value still resolves itself, which is the existing `narrow()` rule and the
  same "one option is a fact, not a choice" the board applies to rows.

  TWO SMALLER FINDINGS OF THE SAME FAMILY, both repaired:
   1. SUB-TABS 2..6 WERE NO-OPS. `showProductStrategyView` records `KM.pendingRoute` and calls
      `showSection` -> `lifecycle.switchTo`, which returns immediately when the section is already
      current (correctly - it must not double-mount). `pendingRoute` is consumed only by `onMount`,
      so the first sidebar child worked and the other five set a variable nobody read. The route is
      now applied directly when a board is already mounted; `currentRoute() !== null` is what keeps
      that from pretending when none is.
   2. `setCapability({})` HALF-RESET. It lowered `_enabled` and left `_capabilityHeard` true, so the
      next `refreshCapability()` answered from a cache that had been explicitly discarded. Invisible
      in a browser (one page life asks once); in a test process it means the second scenario is
      answered by the first one's server.

CORRECTION TO THE P1-B8D-R4 REPORT
-------------------------------------------------------------------------------------------------------
  R4 reported its POST sweep as 468 suites / 4 known-red / 0 survived / 0 PROBE ERROR. That was
  measured in a working tree whose files happened to be LF. On a FRESH CHECKOUT of eb39077 -
  `core.autocrlf=true` writes CRLF - `product-strategy-live-activation-p1-b8d-r4.test.js` is RED:
  four multi-line mutant anchors match zero times, scored as 4 PROBE ERRORs and 4 SURVIVED. The code
  they target had not changed by a byte. `_psb-harness.js` has carried a note about this exact trap
  since P1-B2; the R4 suite shipped without it. Fixed here by normalizing line endings on read, and
  verified by forcing that file to CRLF and re-running: 63 passed / 0 failed / 9 mutants / 0 survived.
  THE PRE SWEEP FOR THIS ROUND IS THEREFORE 5 RED, NOT 4, and this round returns it to 4.

MEASURED, NOT FIXED
-------------------------------------------------------------------------------------------------------
  · THE CHOOSER HAS NO STYLING. `#psb-site-host` and `.psb-site*` have no CSS rules, exactly like the
    `.psb-state*` classes recorded in R4. The controls are real `<select>`s and are fully operable
    with browser-default styling; they are not laid out. §9 says to judge CSS only once real content
    appears, so both belong to the same small UI correction - which must not rewrite the stylesheet.
  · TWO CONSOLE ERRORS IN THE ACCEPTANCE PAGE, pre-existing and unrelated: `renderHomepage` and
    `initSkuUnifiedScroll` are defined in `pages/home.js` and `pages/sku-details.js`, which are not
    among the 18 scripts the generated acceptance page loads. `app.js` catches and logs both. Not
    reachable from the board and not caused by this round.

**STATUS: LOCAL COMMIT - NOT PUSHED - FRONTEND REDEPLOY REQUIRED - NO APPS SCRIPT SYNC.**


=======================================================================================================
P1-B8D-R6  -  THE PAGE HAD NO STYLING TO BE INCONSISTENT WITH
=======================================================================================================
Date:                        2026-09-13
Trigger:                     R5 shipped and the USER confirmed on live Pages that the chooser works,
                             the workspace loads and the six views render. Seen beside the rest of the
                             Operation System, the page did not look like it.
Release identity:            UNCHANGED - F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11. No .gs file changed.
APPS_SCRIPT_SYNC_REQUIRED:   NO      New deployment: NO    DB / Sheets / Drive writes: 0   flag change: 0
FRONTEND_GITHUB_PAGES:       REQUIRED - the page stylesheet, the page controller and the partial all
                             changed; the co-deployed set rotated onto
                             visualintegration-p1b8dr6-20260913 (34 refs, 0 stale).

WHAT WAS ACTUALLY WRONG
-------------------------------------------------------------------------------------------------------
  FOURTEEN CLASSES THE PAGE RENDERS ON EVERY VISIT HAD NOT ONE RULE - not in this page's stylesheet,
  not in base / components / layout:

    .psb-header  .psb-header__title  .psb-header__actions  .psb-sub
    .psb-site-host  .psb-site  .psb-site__field  .psb-site__label  .psb-site__select  .psb-site__value
    .psb-state-host  .psb-state  .psb-state__headline  .psb-state__detail

  So the browser's defaults decided the page: "CountryUS" with the label welded to a native select,
  a refusal set as two bare paragraphs, and header buttons floating on the global
  `button { margin: 4px }`. The page was not styled inconsistently - it was not styled.

WHAT WAS REUSED RATHER THAN INVENTED
-------------------------------------------------------------------------------------------------------
  Product Strategy element      Operation System owner                            Reused directly?
  ----------------------------  ------------------------------------------------  ----------------
  page header band              .cr-page-header contract (Promotion Risk Tracker)  pattern (cr-* is
                                                                                   page-scoped)
  page title                    base.css h2 / .page-title                          YES, already
  subtitle                      --font-size-body + --text-secondary                tokens
  header actions                .cr-page-actions contract                          pattern
  Presentation / Print buttons  components.css .btn + --btn-* tokens               YES, already
  label + select pair           .km-filter-bar .filter-group + --filter-* tokens   YES - ADOPTED
                                (base.css: "SINGLE SOURCE OF TRUTH for every
                                 filter control ... never hardcode these per page")
  filter-bar label spec         --filter-label-size / --filter-label-color         YES via the above
  standalone card frame         .km-category-card (white / 8px / shadow / 16 20)   values reused
  six page tabs                 .km-tab-rail + .km-tab-rail__tab                   YES, already
  tab count badge               .km-tab-rail__count                                YES, already
  breakpoints                   --km-bp-* tiers (responsive-foundation.css)        tablet tier reused
  loading / empty / error box   NO SHARED COMPONENT EXISTS - every page owns its   built scoped, from
                                own .xx-empty-state                                 the same tokens

  The chooser's markup now carries `km-filter-bar` and `filter-group`, so the LABEL SPEC AND THE
  CONTROL SPEC ARE THE SHARED ONES instead of a copy that drifts. `psb-site__*` is left owning only
  what is genuinely local: the card the row sits in, and the read-only tier.

TWO STRUCTURAL CORRECTIONS, NOT REPAINTS
-------------------------------------------------------------------------------------------------------
  1. THE CONTROLS NOW COME BEFORE THE SENTENCE ABOUT THEM. `#psb-state-host` sat ABOVE the chooser,
     so the page read "Choose a site to analyse." and only then showed the thing to choose with.
  2. ONE SITE IS STATED ONCE LOUDLY. The board's command bar echoes Company / Country / Marketplace
     as read-only context, and since R5 the chooser above is the CONTROL for those three. One site
     was stated three times, with the least authoritative statement in the largest type. The
     renderer and the fields are untouched (§5.4) - only the weight changed, so the eye lands on
     Category and Series, which that bar actually owns.

A DELIBERATE DIVERGENCE, RECORDED RATHER THAN SILENTLY KEPT
-------------------------------------------------------------------------------------------------------
  `.km-tab-rail__tab.is-active` fills the chip solid blue. This page turns the fill off and marks the
  selected view with weight + an underline + the icon colour. That override PREDATES this round and
  carries its own argument in the stylesheet: the shared rail's original job is a FILTER, where
  several chips may be set and the set ones must read as a group; these six are a VIEW SELECTOR
  where exactly one is ever on, and a solid fill on one of six makes the rail read as a filter that
  happens to have one value chosen.

  It is a one-property modifier on the shared component, not a second component: the metrics,
  scrolling, hover, focus-visible, keyboard behaviour and count badge all still come from
  `.km-tab-rail`, and this page declares no rail rule of its own (suite §C proves it). Kept this
  round and flagged for the S-series brand pass to overrule if the system wants one active look.

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · 390px: the shell's fixed 240px sidebar leaves a ~118px content column, so every control stacks
    and the board is unusable at phone width. This is a SHELL layout fact, explicitly out of scope
    (§6), and it is why the mobile mutant measures "does the control fit its card" rather than
    "do the controls stack" - at 390 they stack whatever the rule says.
  · Two console errors in the acceptance page (`renderHomepage`, `initSkuUnifiedScroll`) are
    pre-existing and unrelated: both are defined in page modules the generated acceptance page does
    not load, and app.js catches and logs them. Unchanged by this round: 2 before, 2 after.

**STATUS: LOCAL COMMIT - NOT PUSHED - FRONTEND REDEPLOY REQUIRED - NO APPS SCRIPT SYNC.**


=======================================================================================================
P1-B8D-R7  -  THE PAGE KEPT A BOARD IT HAD STOPPED BELIEVING IN
=======================================================================================================
Date:                        2026-09-13
Trigger:                     USER testing on live Pages. Seven reports, of which the load-bearing one
                             was "I choose a site and it jumps back and asks me to choose again".
Release identity:            UNCHANGED - F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11. No .gs file changed.
APPS_SCRIPT_SYNC_REQUIRED:   NO      New deployment: NO    DB / Sheets / Drive writes: 0   flag change: 0
FRONTEND_GITHUB_PAGES:       REQUIRED - the partial, the page controller, the renderer and the page
                             stylesheet all changed; the co-deployed set rotated onto
                             finalusability-p1b8dr7-20260913 (34 refs, 0 stale).

THE REPORT, AND WHAT REPRODUCING IT FOUND
-------------------------------------------------------------------------------------------------------
  The report was reproduced before anything was changed, through the production lifecycle in a real
  browser, with no site pre-selected - and it was not what it describes. Four separate facts:

  1. THE CONTROLS NEVER LOST A VALUE. Across seven sequences the canonical scope and the three
     controls agreed at every single step. The controller was never wrong.

  2. THE CONTROL ITSELF WAS DESTROYED ON EVERY PICK. `paintChooser()` runs on every narrowing and
     `renderSiteChooser` emptied its host and built three fresh <select>s. Measured: focus on the
     control immediately before the change, `body` immediately after it, every time. To anyone using
     a keyboard that is indistinguishable from the choice being thrown away.

  3. THE PREVIOUS SITE'S WHOLE BOARD STAYED ON SCREEN. Load KM/US/Shopify, change Company to ResTW:
     the controller is instantly right, writes "choose a site" into the state host - and the entire
     KM board is still underneath it, INCLUDING the command bar's own read-only
     Company/Country/Marketplace row still reading KM . US . Shopify. The page asked for a site while
     showing a site, and the label nearest the numbers named the one just left.

  4. A WITHDRAWN QUESTION WAS STILL ANSWERED. With a read outstanding, changing Company makes the
     scope incomplete and starts no new read, so the request token never moved - the outstanding
     answer was still "current" and it landed and mounted a board for a marketplace no longer chosen.

  (3) and (4) are the same defect as the duplicated filter bars, which is why they were one round.

THE REPAIRS
-------------------------------------------------------------------------------------------------------
  THE CHOOSER RECONCILES. A tier is rebuilt only when what it OFFERS changes - a different option
  list, or a change between a dropdown and read-only context. When only the VALUE changed the
  <select> keeps its identity, its listener and its focus. When a control must go, the focus is
  PLACED on the next tier that can be acted on rather than dropped.

  THE BOARD COMES DOWN WITH ITS SITE. `show()` is the one place every non-board answer is written,
  so the teardown lives there: a state that renders a notice can never again leave a chart behind
  it. `C.clearBoard()` empties #nav, #crumbs, #banner, #scope and #view. THE SELECTION IS NOT
  TOUCHED - the chooser keeps every value a person has confirmed.

  A WITHDRAWN SCOPE INVALIDATES ITS READ. `requestedScope` records which site the outstanding read
  is for; a narrowing that is not that same complete site advances the token, so the answer is
  dropped on arrival.

  ONE FILTER PANEL. The board is told at mount that the page owns the site (`siteOwnedByPage`), so
  it renders no site tiers at all; the stylesheet flattens both renderers' wrappers with
  `display: contents` so the seven controls sit on one row in one card, in the order
  Company - Country - Marketplace - Category - Series - More filters - Meeting scenario.

  THE DERIVED FILTERS ARE RE-DERIVED. Found by the same trace: choose `Cutting Board` on
  KM/US/Shopify, switch to ResTW/JP/Amazon, and the category menu offered three options with NONE
  selected. The page controller's comment claimed a re-mount cleared them; `boot()` swapped the
  adapter and rendered and every derived choice came through. `narrowAfterSiteChange()` has always
  done exactly this work and simply had no caller on this path. `boot()` now calls it.

  THE BOARD BINDS ITS BUTTONS ONCE. `boot()` runs again on every site change and these four ids live
  in the partial, so each collected a new listener per mount. After two site switches one click on
  Presentation toggled it twice and the button appeared dead.

THE OTHER SIX REPORTS, EACH AS A MEASUREMENT
-------------------------------------------------------------------------------------------------------
  GREY HEADER          `.psb-page { background: var(--ground) }` put #f5f6f9 over the whole section
                       while `.main-content` behind it is #ffffff. This was the only page in the
                       Operation System sitting on grey, and the title band is where that grey has
                       nothing on top of it. `.psb-page.module-section` is transparent now; the
                       prototype, which is the sheet's other host, keeps its own ground.
  CHART `?`            Four visible on Category Analysis. Suppressed by a mount argument
                       (`inlineHelpIcons: false`), so every paragraph of help text stays in the file
                       and nothing renders an empty placeholder.
  X AXIS PRICE         Removed by `axisPriceRow: false`. The price is unchanged in the hover panel,
                       the focus panel and the aria-label; the variant count stays, because "3
                       colours" identifies the column rather than restating what the chart drew.
                       The row is still emitted, so the lane geometry and the Y axis are untouched.
  BASELINES            Measured at 1440 before: site selects top=325.3, board context values 436.9,
                       Category 513.5, Series 517.5, Meeting scenario 36px tall where everything
                       else was 38, label gaps of 8, 7 and 3 in one row. After: every control 38px
                       on one row top, one 6px label gap.
  DRAWER CLOSE         IT EXISTED AND DID NOT READ AS ONE. `components.css button { min-width: 60px }`
                       outranks its own `width: 30px`, so a 30px square rendered 60x30. `min-width`
                       was the declaration that was missing. Closing now returns the focus to
                       `#meetingToggle`, and the drawer is hidden in presentation and fullscreen.
  LONG EXPLANATION     Moved behind one `i` button in the page header. The state keeps one sentence
                       that says what to do. Not a `?`, because six question marks came off the
                       screen in the same round.

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  . 390px: the shell's fixed 240px sidebar still leaves a ~118px content column. Shell-level, out of
    scope, already recorded as Phase 2 B2-2.
  . Two console errors in the acceptance page (`renderHomepage`, `initSkuUnifiedScroll`) are
    pre-existing and unrelated - page modules the generated page does not load, caught by app.js.
  . Escape does NOT close the price-adjustment drawer, and that is the existing contract with its
    reason written in the source: it is a workspace, not a popover, and Escape inside a form a
    person is filling in should not throw the form away. Recorded rather than changed.
  . A scenario override is keyed by SKU and survives a site change if the same SKU is listed on both
    sites. Out of scope this round; recorded as Phase 2 B2-4.

**STATUS: LOCAL COMMIT - NOT PUSHED - FRONTEND REDEPLOY REQUIRED - NO APPS SCRIPT SYNC.**

---

## Entry — 2026-09-13 · PRODUCT-STRATEGY-P1-B8D-R8 (the renderer went on drawing a page nobody was on)

```
Release ID:                  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11   (UNCHANGED — no .gs file changed)
Ledger entry ID:             P1-B8D-R8-2026-09-13-lifecycle-and-simulation-scope
Environment:                 (none — NOT DEPLOYED, NOT PUSHED)
Git branch:                  feature/product-strategy-board-p0
Git state:                   forward commit on d7a6061 (P1-B8D-R7, pushed by the USER; origin/feature,
                             origin/main and local main were all at d7a6061 at the start of this round).
                             Nothing amended, reset, rebased or merged.

APPS_SCRIPT_SYNC_REQUIRED:   NO    (0 .gs files changed; action contract unchanged; flag unchanged)
FRONTEND_DEPLOY_REQUIRED:    YES   (4 shipped browser files + index.html)
DB / Sheets / Drive writes:  0
Co-deployed cache token:     finalusability-p1b8dr7-20260913  ->  lifecycle-p1b8dr8-20260913
                             34 refs in index.html, 0 stale; appended to _release-order.js (71 tokens).

SIX REPORTS, THREE OF THEM ONE DEFECT
-------------------------------------------------------------------------------------------------------
  THE RENDERER HAD NO UNMOUNT, AND THE PAGE HAD BEEN EMPTYING ITS OUTPUT INSTEAD.

  Measured through the shell's own lifecycle, before anything was changed: load a site, call
  `onUnmount()` — which empties #nav, #crumbs, #banner, #scope and #view — and look at #view two
  hundred milliseconds later. THREE RUNS IN SIX it held three children again. Nobody put them back.
  `psb-board-ui` keeps a ResizeObserver on #view; the section going `display: none` IS a size change;
  the observer answers it one animation frame later with `renderData()`, which repaints the chart and
  the print banner out of a STATE nothing had cleared. `renderData()` deliberately leaves the nav and
  the filters alone so that a resize cannot cost a reader their place — so the half that came back was
  the BOARD and the half that stayed empty was the CHOOSER.

  That is the split brain the USER reported (§7) word for word, and it is a RACE, which is why it
  reads as "sometimes" and why every suite in this project was green. The same live renderer is why a
  board can reappear during a load (§5): a board that can repaint itself on any frame can repaint
  itself while the next site's read is outstanding, and on a real screen the teardown supplies its own
  trigger — removing two thousand pixels of chart removes the scrollbar and every column gets wider.
  The acceptance harness runs with `--hide-scrollbars`, which is exactly why this was invisible to
  every run before this one.

  Clearing somebody else's output is not the same as telling them to stop. `PSB_BOARD.unmount()` now
  exists beside `mount()`: the flag goes false, the observer is disconnected, nothing paints while the
  board is down, and `observeContainer()` replaces its own observer rather than adding one per site
  change (`boot()` runs on every site change; each run had been leaving another live observer behind).

  THE CLOSE BUTTON WAS BEHIND THE APPLICATION'S HEADER (§6). R7 reported it present and correct, and
  every property R7 measured WAS correct: one button, 30x30, right corner, right glyph, right
  accessible name. `elementFromPoint` at its own centre returned `top-header`. `.top-header` is
  `position: fixed; top: 0; z-index: 2000` and fills `--header-height`; the drawer was `top: 0;
  z-index: 60`, so its whole head row was painted underneath the shell's header bar — invisible, and
  un-clickable at those coordinates. A synthetic `.click()` in a test bypasses hit-testing, which is
  how it passed. The drawer now starts at `top: var(--header-height, 56px)`, making this the fifth
  consumer of the one token base.css declares rather than a fifth opinion about the header's height.
  Nothing global moved: raising the drawer ABOVE the header would have put a page's panel over the
  application's own navigation.

THE OTHER THREE
-------------------------------------------------------------------------------------------------------
  §3 THE SENTENCE UNDER CATEGORY   `#catEmpty` — "This site sells nothing that passed membership and
                       the status gate…" — is 72px of paragraph hanging off a 38px control, and it
                       renders only on a site whose listings carry no category. NONE of the ten
                       captured sites is such a site, so the state the report is about could not be
                       reached, photographed or asserted; the replay now empties one field on each row
                       of a real site's real envelope, which reproduces it exactly (rows, prices and
                       chart unchanged). Suppressed by `inlineFilterNotes: false`, and NOT deleted:
                       the counts are still computed and `BOARD.notices()` reports the genuinely-empty
                       case to the host, which writes it into the state host where every other answer
                       is written. A site that HAS categories writes nothing at all — no empty box, no
                       held height.
  §4 THE CHART TOOLBAR  View (Auto Fit · Comfortable · Fullscreen), Detail (Clean · Detail), Layers,
                       Reset view and the density note: 9 controls, 87px tall, 7 of them in the tab
                       order. Removed by `chartToolbar: false` — the row is never built, so there is
                       no empty `.chartctl` holding the space and nothing invisible left in the tab
                       order. Production keeps Auto Fit, which is `STATE.chartMode`'s default and the
                       one setting that measures the card and chooses the size itself.
                       `toggleFullscreen`, `applyViewMode`, the zoom handlers and `chartControls()`
                       itself are all retained, and the prototype still renders every one of them.
  §8 THE SIMULATION'S SCOPE   `clearScenarioOnSiteChange: true`. When the canonical site identity
                       (company + country + marketplace) changes, every unpersisted override goes —
                       overrides, undo stack, series, input, notice, refusal, and the drawer closes.
                       A view, a category, a series and a leave-and-return of the SAME site all keep
                       it. CORRECTION TO THE R7 LEDGER ENTRY: overrides are keyed by
                       `scenarioSiteKey(site)` + series + field, NOT by SKU. R7's note that one
                       "survives a site change if the same SKU is listed on both sites" was wrong —
                       site A's overrides were never APPLIED to site B. What was true, and what this
                       round fixes, is that they stayed in memory, stayed in the "Active overrides: N"
                       count, and came back the moment somebody returned to site A.

§7 — WHICH STRATEGY, AND WHY
-------------------------------------------------------------------------------------------------------
  PRESERVE-CONSISTENTLY. Everything restored was read during THIS page life and cannot have changed
  without a reload that would destroy it anyway: the universe, the capability and the workspace are
  each resolved once and never refreshed while the page is open. `onUnmount` parks the controller only
  when it is worth restoring — universe OK, scope complete, board mounted, adapter held — and drops it
  otherwise, so a restore is all or nothing and can never produce the half-page it replaced.
  `onMount` consumes the parked controller, repaints the chooser from canonical state and re-mounts
  the SAME adapter. Measured: 0 extra workspace reads, 0 extra universe reads, the same view, the same
  category and the same scenario. Because `boot()` re-derives through `narrowAfterSiteChange()`, the
  filters cannot come back naming something the board does not have.

ONE MORE, FOUND ON THE WAY
-------------------------------------------------------------------------------------------------------
  `body.presenting` and `body.is-fullscreen` are the only UNSCOPED rules in this stylesheet
  (`background: #10131a`, `overflow: hidden`), and nothing took them off on unmount. Leaving Product
  Strategy in presentation mode restyled whatever the operator navigated to next. `unmount()` now
  strips all three body state classes; a restored visit re-derives them from the site it is showing.

CHANGED FILES (14)
-------------------------------------------------------------------------------------------------------
  shipped       assets/js/product-strategy/psb-board-ui.js   unmount/notices/siteKey, MOUNTED, one
                                                             observer, three new mount arguments,
                                                             clearScenarioState, focus into the drawer
                assets/js/pages/product-strategy-board.js    mountBoard, showBoardNotices, C.restore,
                                                             the parked controller, teardown via the
                                                             renderer, adapter retained
                assets/css/product-strategy-board.css        section 12: the drawer header offset
                index.html                                   34 token refs
  harness       assets/tests/_p1b8c-interactions.js          6 new sequences + the R8 measurements
                assets/tests/_p1b8c-replay.js                noCategories, startFailing
                assets/tests/_p1b8c-visual-runner.js         the r8 measurement block, noCategories
                assets/tests/_release-order.js               token appended
  suites        assets/tests/product-strategy-lifecycle-p1-b8d-r8.test.js  NEW — 176/0, 18 mutants, 0 survived
                assets/tests/product-strategy-board-p1-b2c.test.js         F4 re-anchored + F4a
                assets/tests/product-strategy-site-selection-p1-b8d-r5.test.js  G7-G9 inverted, I8 re-anchored
  docs          docs/planning/S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md  NEW (the §9 census)
                docs/planning/DEPLOYMENT_RELEASE_LOG.md
                docs/planning/P1_B8C_LIVE_READBACK_AND_ACTIVATION_MANIFEST.md
                docs/planning/PHASE_2_BACKLOG.md

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · 390px: the shell's fixed 240px sidebar still leaves a ~118px content column. Shell-level, out of
    scope, Phase 2 B2-2. The drawer's close control IS correct at 390 (box x=346, 30x30, hit-tested).
  · Two console errors in the generated acceptance page (`renderHomepage`, `initSkuUnifiedScroll`) are
    pre-existing and unrelated — page modules the generated page does not load, caught by app.js.
    2 before, 2 after.
  · Escape still does not close the price-adjustment drawer. Existing contract with its reason written
    in the source; §6 does not require it. Phase 2 B2-5.
```

**STATUS: LOCAL COMMIT — NOT PUSHED — FRONTEND REDEPLOY REQUIRED — NO APPS SCRIPT SYNC.**

---

## P1-B8D-R9 — A SUCCESS PAINTED AS A FAULT, A ROW REMOVED TOO WIDELY, AND A 404 NOBODY COULD SEE

**2026-09-13 · local commit on `feature/product-strategy-board-p0` · NOT PUSHED**

```
PRE  HEAD   d3f779671d4561030df5716fb447329f777732df   (R8, live-accepted by the USER)
CACHE TOKEN lifecycle-p1b8dr8-20260913  ->  imagetoolbar-p1b8dr9-20260913   (35 refs, 0 stale)

WHAT CAME BACK FROM THE USER'S LIVE ACCEPTANCE OF R8
-------------------------------------------------------------------------------------------------------
  PASSED   A->B site switch · teardown before the next read · leave-and-return · scenario site scope
           · the drawer close control · the Category sentence · six distinct views

  Sec 3    "the banner after applying a Meeting scenario is an orange warning box"
           IT LITERALLY WAS. base.css declares --km-ui-warning: #e6a620, and every surface marking a
           simulation sat in that family: the banner #fff4ed/#f0c9b4/#7a3a1c, the chip Tailwind
           orange-50/300/800, the panel frame and the chart strokes #b8860b. This page ALSO uses
           amber for --watch, the finding class that means look at this. One hue, two opposite
           meanings: a thing that went wrong, and a thing the reader deliberately did.
           FIXED by adopting --km-ui-utility (#8e76a8) -- the Operation System's own brand purple,
           declared in base.css and, before this, referenced by nothing. Not a sixth invented violet.
           The text colour is NOT the token (#8e76a8 on white is 3.9:1, fine for a rule and not for a
           sentence); --scn-ink carries the same hue to 10.1:1. Colour is never the only carrier: a
           SCENARIO tag word, the dashed panel frame and the dashed chart stroke all survive
           greyscale. And the sentence now says the OTHER way a simulation ends -- R8 made a site
           change clear it and the notice still promised only a reload.

  Sec 4    "only remove Fullscreen. Restore the other toolbar controls."
           R8 READ THE PREVIOUS INSTRUCTION TOO WIDELY and removed nine. Reversed: Auto Fit,
           Comfortable, Clean, Detail, Layers, Size and Reset view are back; Fullscreen is not, and
           is NOT BUILT rather than hidden. Nothing was rewritten to bring them back -- R8 suppressed
           the row at one `return null` and R9 restores it at the same line, so there is one builder
           and no production-only variant.
           WHY FULLSCREEN STAYS OUT: it is not a way of drawing the chart, it is a way of replacing
           the PAGE -- a fixed overlay over the whole window with the application's own header
           underneath it. R8 found what happens when this page paints over the shell's chrome.
           NO SUITE HAD EVER PRESSED ONE OF THOSE CONTROLS. R8 removed nine and every assertion
           stayed green, because they all counted elements. R9's section B clicks each one and
           measures what moved.

  Sec 5    "multiple product image GET 404 in devtools"
           THE POLICY COULD ANSWER ONE QUESTION about a relative reference -- does it NAME a file, or
           is it an opaque Drive id. `assets/img/products/CO9999-X.jpg` names one perfectly. Whether
           it is IN THE REPOSITORY was left to the browser, which answers by making the request.
           AND THE CHART MARKER HAD NO FALLBACK, because it is an SVG <image> and the onerror added
           in P1-B8C-R3 was written for <img>. A 404 left a plate still classed image-marker with
           nothing in it: an empty frame promising a photograph.
           FIXED with a GENERATED directory listing (km-repo-asset-manifest.js, 145 files under
           assets/img) that the shared policy consults, plus an error handler on the marker. One
           policy, four consumers, so all four are fixed at once.

THE DEFAULTS POINT IN OPPOSITE DIRECTIONS, DELIBERATELY
-------------------------------------------------------------------------------------------------------
  A MISSING POLICY fails CLOSED -- it is what stops `javascript:` reaching src.
  A MISSING MANIFEST fails OPEN -- it only ever REMOVES images, so a page that loaded one and not the
  other would otherwise lose every photograph in the application.

WHAT THE LIVE DATA SAID ABOUT THE 404s, AND IT IS NOT WHAT THE REPORT GUESSED
-------------------------------------------------------------------------------------------------------
  The report suggested the 404s were discontinued SKUs. THE LIVE DATA DOES NOT SUPPORT THAT: all 60
  rows of the 2026-09-12 production sample are `Active`, and the capture records that all 495 rows in
  the universe are. Four are `Phasing Out` by LIFECYCLE, but they are Active listings and belong on
  the board. INACTIVE_SKU_SHOULD_BE_EXCLUDED is an empty category on this evidence, and no SKU was
  excluded. Of 51 distinct live SKUs, 45 have a repo file named for them and 6 do not -- all six
  Active, classified ACTIVE_SKU_MISSING_IMAGE. Details:
  docs/planning/IMAGE_REFERENCE_REMEDIATION_REPORT.md. The DB fix is S2; a P1 round may not write.

BROWSER ACCEPTANCE (production lifecycle, activated, live-derived capture)
-------------------------------------------------------------------------------------------------------
  seven viewports   horizontalOverflow 0 everywhere INCLUDING 390 with the row restored
                    toolbar 4 groups / 6 controls / 6 tabbable · fullscreen 0 by id AND by name
                    chart 1 · `?` 0 · X-axis price 0 · tooltip carries the price
                    at 390 the row scrolls inside its own box (24px) rather than widening the page
  images            image resource failures 0 · other resource failures 0 · broken <img> 0
                    failed chart markers 0 · manifest 145 files, loaded on the page
  javascript        uncaught exceptions 0 · console.error 2 (renderHomepage, initSkuUnifiedScroll --
                    pre-existing shell defects, 2 before and 2 after, NOT image failures)
  six views         6 distinct SHA-256
  thirteen states   photographed, including scenario-active
  drawer            all 7 viewports: count 1, flex/visible/opacity 1, 30x30 at y=68, inside the
                    drawer header, elementFromPoint hits the button itself, in the tab order
  print             print-scenario-active.pdf, 937,865 bytes, the scenario statement in black on white

TESTS
-------------------------------------------------------------------------------------------------------
  NEW   product-strategy-corrections-p1-b8d-r9.test.js   151 passed / 0 failed / 17 mutants / 0
        survived, three consecutive stable runs
  27 Product Strategy + product-pricing suites all exit 0, 0 survived
  UPDATED because the contract deliberately changed:
    lifecycle-p1-b8d-r8  section E inverted (the row is back, one button is not); K2/K3 re-aimed
    site-selection-p1-b8d-r5  G8/G9 back to what they said before R8; G7 unchanged -- it was always
                              the assertion that was about the defect
    image-resolution-p1-b8c-r3  J17 re-anchored: its anchor was the TAIL of the runner's WANTED
                              regex, so appending one alternative broke a mutant about something else
    activation-p1-b8d  H5/H6: the manifest joins the co-deployed set, 34 -> 35 refs

FILES
-------------------------------------------------------------------------------------------------------
  shipped       assets/js/product-strategy/psb-board-ui.js   SHOW_CHART_FULLSCREEN, the marker error
                                                             path, the banner tag and wording
                assets/js/pages/product-strategy-board.js    chartToolbar dropped, chartFullscreen: false
                assets/css/product-strategy-board.css        the simulation semantic (4 tokens)
                assets/js/utils/km-image-reference-policy.js the manifest gate, 2 new reasons
                assets/js/utils/km-repo-asset-manifest.js    NEW -- generated
                index.html                                   35 token refs, manifest before the policy
  tooling       tools/assets/build-repo-asset-manifest.js    NEW -- the generator
  harness       assets/tests/_p1b8c-interactions.js          chartShape, scenarioLook, r9step,
                                                             toolbar-functions, scenario-appearance
                assets/tests/_p1b8c-replay.js                forceBadImage
                assets/tests/_p1b8c-visual-runner.js         the r9 block, the resource/JS error split
                                                             in the page HEAD, manifest in WANTED
                assets/tests/_release-order.js               token appended
  docs          docs/planning/IMAGE_REFERENCE_REMEDIATION_REPORT.md   NEW
                docs/planning/P1_TO_S2_HANDOFF.md                     NEW
                docs/planning/S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md
                docs/planning/API_MIGRATION_MASTER_PLAN.md
                docs/planning/PHASE_2_BACKLOG.md
                docs/planning/DEPLOYMENT_RELEASE_LOG.md

A MISTAKE THIS ROUND MADE AND CORRECTED, WORTH RECORDING
-------------------------------------------------------------------------------------------------------
  The resource-error listener was first written into assets/tests/_p1b8c-acceptance.html. That file
  is an ARTIFACT: buildPage() regenerates it on every measurement, so the edit survived exactly until
  the next run and then reported zero for ever. Both counts passed VACUOUSLY. It lives in the page
  BUILDER now. The page builder is the page.

DEPLOYMENT
-------------------------------------------------------------------------------------------------------
  APPS_SCRIPT_SYNC_REQUIRED   NO      .gs files changed: 0
  FRONTEND_DEPLOY_REQUIRED    YES     six shipped files move together on one token
  DB / Sheets / Drive writes  0       action contract unchanged · feature flag unchanged
  Release identity            unchanged  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11
  Rollback                    unchanged: PRODUCT_STRATEGY_ENABLED_ = false, save, new version, update
                              the existing deployment. Rollback needs no frontend deploy.

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · 390px: the shell's fixed 240px sidebar still leaves a ~118px content column. Shell-level, Phase 2
    B2-2. The restored toolbar handles it correctly -- it scrolls inside its own box and the page
    does not widen -- and the drawer's close control is correct at 390 (x=346, 30x30, hit-tested).
  · Two console.error lines (renderHomepage, initSkuUnifiedScroll) are pre-existing and unrelated.
    2 before, 2 after. They are NOT image failures and are now counted on a separate axis.
  · Escape still does not close the price-adjustment drawer. Phase 2 B2-5.
  · The live-derived capture's image addresses are REDACTED, so the acceptance run draws fallback
    markers rather than photographs. A rendered photograph is proven by the R3 asset capture and its
    suite instead, over the seven operator-asserted mappings. Recorded as an evidence boundary.
```

**STATUS: LOCAL COMMIT — NOT PUSHED — FRONTEND REDEPLOY REQUIRED — NO APPS SCRIPT SYNC.**

## P1-B8D-R10 — THE ONE READ PATH THAT NEVER JOINED THE TRANSPORT

**2026-09-13 · local commit on `feature/product-strategy-board-p0` · NOT PUSHED**

```
PRE  HEAD   070c16bc3a14f83c4b89146ee32022217d807aee   (R9, pushed by the USER)
CACHE TOKEN imagetoolbar-p1b8dr9-20260913  ->  readroute-p1b8dr10-20260913   (35 refs, 0 stale)

WHAT THE OPERATOR SAW, LIVE, ON GITHUB PAGES IN AN INCOGNITO WINDOW
-------------------------------------------------------------------------------------------------------
  1  RESPONSE_NOT_READABLE   "API 預期 JSON，卻收到 web page", over a console 404 on
                             script.googleusercontent.com/macros/echo…
  2  SOURCE_NOT_CONNECTED    "No server answered" — with the chooser already holding ResUS / US / Amazon

  Two errors, one defect, seen at two moments. NOT a Google Login problem; Google Login is not
  implemented and this round does not implement it.

THE ROOT CAUSE, MEASURED RATHER THAN INFERRED
-------------------------------------------------------------------------------------------------------
  Real Chrome, with window.fetch wrapped BEFORE any application file was allowed to load:

      accessor getSiteUniverse  ->  POST  km_via=post   … 404, redirected   <- the report, reproduced
      accessor workspace.get    ->  POST  km_via=post
      KM.transport.request      ->  GET   km_via=get                        <- every other page

  Product Strategy was the LAST workspace read in the application still going out through
  km-api-foundation's PRIVATE post shim — the one that file's own comment calls "a fallback and not
  the path". An Apps Script /exec answers every request with a 302 (24 of 24 measured), and per the
  Fetch specification a 302 after a POST is re-issued as a GET WITH THE BODY DROPPED. The shared
  transport has dispatched reads as GET with the body in km_body since F1-7N-FB-4E-R4A1 for exactly
  that reason.

  Being on the wrong door cost this page FOUR capabilities it never had: the endpoint classifier, the
  HTML fingerprint, redirect-target classification, and the bounded recovery.

WHAT THE EVIDENCE ELIMINATED — closed by measurement, not by argument
-------------------------------------------------------------------------------------------------------
  redirect reuse   the /exec 302 carries no-cache, no-store, max-age=0, must-revalidate; 24 of 24 live
                   attempts received a DISTINCT 354-character user_content_key; 0 shared across the
                   three read actions
  URL length       real reads are 164–290 characters against a 6000 ceiling
  the deployment   R11 · UNIFORM · router_ready true · missing_actions 0 · product_strategy_enabled
                   true · read_only true · every write counter 0
  the server       never at fault. ~162 live requests produced 1 observed 404 (~0.6%).

THE FIX — NO RETRY WAS WRITTEN THIS ROUND
-------------------------------------------------------------------------------------------------------
  The bound already existed one layer down: reads get at most ONE recovery, writes get zero, the
  recovery is rebuilt from the stable /exec with a NEW request id, and cache: 'no-store' throughout.
  The work was to JOIN that boundary rather than to add a second policy beside it — a page-level retry
  would have been a second thing to keep correct and the first thing to disagree with the first.

  ONE REGRESSION WAS INTRODUCED AND FIXED DURING THE ROUND. The first version passed the inner PAYLOAD
  as km_body instead of the whole envelope. readQuery serialises what it is handed verbatim and the
  router reads body.payload.scope out of it, so the request arrived, returned 200, and was refused
  SCOPE_INCOMPLETE — a scope that WAS supplied, reported as missing. The DTO is built by
  buildRequestEnvelope and passed whole, exactly as the foundation does.

THE ERROR VOCABULARY (§5)
-------------------------------------------------------------------------------------------------------
  HTTP_NOT_FOUND    a 404 from the endpoint or from a redirect target — the address answered and holds
                    nothing to read. It is NEVER "no server answered".
  ACTION_MISMATCH   an envelope whose action or request id is not the one that was sent. A routing
                    fault, not a missing network — and the one failure that could otherwise have put
                    another request's numbers on a price axis.

  Three hardcoded SOURCE_NOT_CONNECTED refusals were replaced by classified ones, and THREE WHITELISTS
  that silently degrade were completed. Both UX maps resolve an unknown state as
  `UX[state] || UX.SOURCE_NOT_CONNECTED` — so a state added to the accessor and forgotten in a map does
  not throw, does not warn, and renders as the exact sentence this round exists to stop. The three
  files carry one cache token for that reason.

  U.STATES was also completed. It called itself "the states THIS module reports" and omitted four it
  had reported since P1-B8B. Nothing broke because NOTHING READ IT — a declaration with no consumer,
  which is how it drifted unnoticed. It has one now: the R10 suite walks all four maps together.

LIVE MEASUREMENT (§8) — real Chrome, the shipped path, against the live deployment
-------------------------------------------------------------------------------------------------------
  BEFORE   wt-r10before @ 070c16b — the private POST shim      40 reads / 20 controller sequences
           siteUniverse.get   19/20 clean    1x SOURCE_NOT_CONNECTED, detail SERVER_REPORTED_FAILURE
           workspace.get      20/20 clean
           transport          retries 0   recoveries 0
           THE DEFECT REPRODUCED LIVE, AND NAMED WRONGLY. A server did answer. It answered 404.

  AFTER    sample 1                                            40 reads / 20 controller sequences
           siteUniverse.get   19/20 clean    1x HTTP_NOT_FOUND, "a server answered 404 — the address
                                             was reached and holds nothing to read"
           workspace.get      20/20 clean
           transport          retries 4   recoveries 4
           FOUR transient redirect-target 404s. THREE were absorbed and the operator saw nothing at
           all; the fourth failed twice and surfaced under its correct name.

  AFTER    sample 2                                            40 reads / 20 controller sequences
           siteUniverse.get   20/20 clean
           workspace.get      20/20 clean
           transport          retries 1   recoveries 1
           One transient 404, absorbed. Nothing was shown to the operator.

  §8 IS NOT DECLARED PASSED, AND THAT IS DELIBERATE.
  -------------------------------------------------------------------------------------------------
  §8 accepts 20/20 and sample 1 is 19/20, so the correct report is that the bar was met in one of two
  samples and not in the other. What the two samples show TOGETHER is the fact that matters: the live
  echo target 404s at a rate that VARIES BY WINDOW — 5 occurrences in 80 reads here (~6%), against
  1 in ~162 (~0.6%) measured earlier in this same round. At a ~10% per-attempt rate, one bounded
  retry still leaves roughly 1% of reads failing twice. Sample 1 is that 1%.

  THE RESIDUE IS NOT A CLIENT DEFECT, AND IT WAS NOT PAPERED OVER. §6 caps auto-retry at ONE and caps
  a single user action at TWO physical requests. Raising the bound to manufacture a 20/20 would have
  broken the rule that asked for the measurement, and would have hidden a live infrastructure fault
  behind a client loop. What the client now guarantees is what a client can guarantee: a transient
  redirect-target 404 is retried exactly once from the stable /exec, most are absorbed invisibly, and
  any that survives is reported as the 404 it is rather than as "No server answered".

  WHAT IS LEFT IS A DEPLOYMENT DECISION AND BELONGS TO THE USER. §11 forbids an agent from changing
  the deployment, and §7 confirms the deployment is otherwise healthy (R11, UNIFORM, router_ready,
  0 missing actions, read_only, every write counter 0 — re-verified at the close of this round).


TESTS
-------------------------------------------------------------------------------------------------------
  NEW   product-strategy-transport-stability-p1-b8d-r10.test.js
        152 passed / 0 failed / 17 mutants / 0 survived / 0 PROBE ERROR

        §A the route · §B the forbidden sentences, by name · §C the retry bound against the REAL
        transport over an injected network · §D the production-like fault matrix in a browser ·
        §E the recovery does not flicker · §F a superseded read does not land · §G R8/R9 keeps

  THREE MUTANTS FAILED TO KILL BEFORE THEY WERE WRITTEN CORRECTLY, and each taught something:
    · removing AUTH_OR_ACCESS_HTML from NEVER_AUTO_RETRY_CODES changed nothing — isAutoRetryable is
      an ALLOWLIST ending in `return false`, so the blocklist is a second lock on a shut door.
      An auth refusal is guarded TWICE, independently; the mutant now removes both.
    · aiming a fault at attempt numbers 2–3 hit site B's first read rather than site A's recovery,
      because the two sites' reads INTERLEAVE. Faults are aimed by request content now.
    · asserting `details.recovery_from` failed because that field is written onto the first attempt's
      result and then discarded. Backlog B2-9; the property is proven harder by reading the URLs.

  UPDATED because the contract deliberately changed:
    live-replay-acceptance-p1-b8c-r2   D5a  SOURCE_NOT_CONNECTED -> ACTION_MISMATCH
    envelope-action-p1-b7e             G10/G11 the same; G10a already asserted the DETAIL was
                                       RESPONSE_ACTION_MISMATCH, so the file had been recording the
                                       contradiction in adjacent lines
    replay-acceptance-p1-b8c           D12  the same
    deployment-r10-activation-boundary-p1-b7f  E7/E9 the same — found by the sweep rather than by
                                       searching, which is why the sweep runs before the commit
    lifecycle-p1-b8d-r8                A6 -> a ceiling plus A6a exact-when-settled (the dispatch moved
                                       one microtask later and the teardown did not); B10 3 -> 4,
                                       because the refused read now costs its ONE bounded recovery

SWEEP
-------------------------------------------------------------------------------------------------------
  PRE  (wt-r10before @ 070c16b)   473 suites   4 flagged, all pre-existing and identical to R9's
                                  recorded baseline: gap-job-done-notice-f1-small-r1 (3),
                                  order-planning-monthly-projection-consumer-f1-4b-fm3d (1),
                                  replen-header-toggle (7), supply-planning-route-inventory (2)
  POST (the committed tree)       474 suites   same 4, same counts, nothing added

  CORRECTED AT R10A. This block first said 474 for BOTH, because the PRE number was written from
  expectation before the PRE sweep had run. It is 473: the R10 suite does not exist at 070c16b, so
  the tree that predates it has exactly one suite fewer. The failing assertions are verbatim
  identical in both directions; only the total differs, and it differs by the file this round added.

  TWO SUITES WERE FLAGGED MID-ROUND AND BOTH WERE REAL:

    deployment-r10-activation-boundary-p1-b7f  E7/E9 were the FOURTH place in this repository
      asserting SOURCE_NOT_CONNECTED for a mismatched envelope. E8, one line below, had always
      asserted the DETAIL was RESPONSE_ACTION_MISMATCH. The contradiction sat in adjacent lines and
      passed every round until a state existed that could tell them apart. 102/0/7/0.

    product-strategy-transport-stability-p1-b8d-r10  was flagged for a PROBE ERROR it did not have:
      the section heading QUOTED the phrase the sweep detector greps for. A heading that names the
      thing it forbids trips the detector that looks for it. Reworded; the suite was always 152/0.

FILES
-------------------------------------------------------------------------------------------------------
  shipped       assets/js/api/km-product-pricing-workspace.js        the read route, the classifier,
                                                                     3 hardcoded refusals replaced
                assets/js/product-strategy/km-product-strategy-site-universe.js   2 states, 2 wordings,
                                                                     U.STATES completed
                assets/js/product-strategy/km-product-strategy-live-adapter.js    2 states, 2 wordings
                index.html                                           35 token refs, 0 stale
  harness       assets/tests/_p1b8c-replay.js       a fake NETWORK under a REAL transport; six named
                                                    faults; netFaultOnce / From / Until / When / SlowMs
                assets/tests/_p1b8c-interactions.js transport-fault, transport-recovery,
                                                    fault-site-switch, faultStep
                assets/tests/_p1b8c-visual-runner.js  the fault options
                assets/tests/_release-order.js      token appended
  docs          docs/planning/S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md
                docs/planning/API_MIGRATION_MASTER_PLAN.md
                docs/planning/P1_B8C_LIVE_READBACK_AND_ACTIVATION_MANIFEST.md
                docs/planning/PHASE_2_BACKLOG.md
                docs/planning/DEPLOYMENT_RELEASE_LOG.md

A DOCUMENT THAT DESCRIBED THE FAILING PAGE AS CORRECT
-------------------------------------------------------------------------------------------------------
  S_SERIES_FRONTEND_API_MIGRATION_INVENTORY §2 recorded this accessor's transport as `KM.transport.post`
  on four separate rows. THERE IS NO SUCH FUNCTION — KM.transport exposes request(); the post shim is a
  private member of km-api-foundation. One wrong namespace is why a census whose entire purpose is to
  say which page is on which transport described the one failing page as already migrated. Corrected
  there; only the accessor's CODE changed.

MISTAKES THIS ROUND MADE AND CORRECTED, WORTH RECORDING
-------------------------------------------------------------------------------------------------------
  · TWO DISCRIMINATORS LIED BEFORE THE RIGHT ONE WAS FOUND. KM.transport.metrics() cannot tell the two
    paths apart (beginExternal -> recordExternal feeds the same counters), and `received_method` is
    echoed by system.health but NOT by the workspace actions. Only wrapping window.fetch before any
    application script loads answered the question.
  · A PROBE READ THE OUTER success FLAG and reported a live 404 as universeOk: true. universeRefused()
    returns success: true with the refusal nested in data.refusals.
  · BROWSER PROBES WERE RUN CONCURRENTLY WITH A SUITE SWEEP. Both write the same generated acceptance
    page, so one overwrote the other and the R9 suite reported 5 spurious PROBE ERRORs and a survived
    mutant. Re-run serially it is 154/0/17/0. Probes get their own page file now.
  · A STRANDED MUTANT survived a killed sweep in product-strategy-board.js (the R7 help-button
    click -> mouseenter). It was found by checking the file against 070c16b rather than by trusting
    git status, and it was the entire cause of 5 failures in the R7 suite.
  · TWICE, "NO RESULT FROM CHROME" WAS A BROKEN PROBE WEARING THE COSTUME OF A FAILED MEASUREMENT:
    once a virtual-time budget exhausted by 120 diagnostic requests that belonged to §3, once a bare
    reference to a NODE variable from inside the page.

DEPLOYMENT
-------------------------------------------------------------------------------------------------------
  APPS_SCRIPT_SYNC_REQUIRED   NO      .gs files changed: 0
  FRONTEND_DEPLOY_REQUIRED    YES     four shipped files move together on one token
  DB / Sheets / Drive writes  0       action contract unchanged · feature flag unchanged
  Release identity            unchanged  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11
  Rollback                    unchanged: PRODUCT_STRATEGY_ENABLED_ = false, save, new version, update
                              the existing deployment. Rollback needs no frontend deploy.

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · B2-9 recovery_from is written onto a discarded object. No production effect; the recovery is
    observable through metrics().recoveries and provable from the wire. Belongs to a transport round.
  · The accessor retains api.transport.post as a FALLBACK for a page that loads without the transport.
    It is unreachable while km-transport.js is in index.html, and the R10 suite asserts the shared
    transport is tried first.
  · Everything R9 listed under KNOWN AND NOT FIXED is unchanged.
```

**STATUS: LOCAL COMMIT — NOT PUSHED — FRONTEND REDEPLOY REQUIRED — NO APPS SCRIPT SYNC.**

## P1-B8D-R10A — THE THIRD READ, AND THE LAST SENTENCE THAT WAS NOT TRUE

**2026-09-14 · local commit on `feature/product-strategy-board-p0` · NOT PUSHED**

```
PRE  HEAD   a5bdfc2e984e077bfc5a35b5f88f0d577b032e36   (R10, NOT pushed, NOT deployed)
CACHE TOKEN readroute-p1b8dr10-20260913  ->  capabilityroute-p1b8dr10a-20260914   (35 refs, 0 stale)

WHY THIS ROUND EXISTS
-------------------------------------------------------------------------------------------------------
  R10 set out to put this page's reads on ONE transport and finished with TWO OF THREE. `system.health`
  -- the capability read, the one that decides whether the page offers itself at all -- was still
  calling km-api-foundation's private POST shim, and R10's own documents were written as though it had
  moved too. The gap was found by reading the committed code against the claim, not by a failing test,
  because NO TEST ASSERTED THE CLAIM.

  IT WAS THE WORST OF THE THREE TO LEAVE BEHIND, because it FAILS CLOSED. The transient echo 404 R10
  measured at 4 in 40 live reads in one window made the whole page answer FEATURE_DISABLED: not "the
  server could not be reached", but "the feature is switched off" -- a statement about a product
  decision, derived from a request that never got an answer, with no retry and no classification.

WHAT CHANGED
-------------------------------------------------------------------------------------------------------
  1  system.health now goes through KM.transport.request, via the SAME `readOnce` helper the other two
     reads use -- so the envelope, the GET semantics, the classification and the single bounded
     recovery are identical BY CONSTRUCTION rather than by resemblance.

  2  A capability read that could not be COMPLETED is no longer rendered as a feature that is OFF. The
     accessor records the classified reason (capabilityFailure()); the controller shows it. FEATURE_
     DISABLED now means exactly one thing: a server answered, and what it said was false.

  3  A transport failure is CLOSED BUT NOT LATCHED. `_capabilityHeard` -- the gate that decides whether
     the page ever asks again -- is set only when a server actually answered. Recording a failure there
     would disable the feature for the life of the page over one unreadable hop that has since
     recovered.

  4  A superseded capability answer writes nothing. The read now has a bounded recovery under it, so it
     can be outstanding across a site change; a generation counter keeps a late answer from deciding
     the page's capability from a question nobody is waiting for.

  5  THE POST FALLBACK IN readOnce IS REMOVED. R10 kept it on the reasoning that a degraded read beats
     no read. That does not survive knowing what the degraded path IS: the exact 302-dropped-body path
     whose failure this work exists to fix. Falling back to it would reintroduce the defect precisely
     when something else is already wrong, and do it silently. A missing shared transport is now a
     NAMED refusal. The shim itself is untouched -- other legacy consumers still use the foundation;
     this round removes CALLERS, not APIs.

WHAT IT DELIBERATELY DID NOT DO
-------------------------------------------------------------------------------------------------------
  No new transport, no new retry, no raised ceiling, no .gs file, no action, no write, no capability
  flag, no Google Login, no S2 runtime.

  AND NO OFFLINE PRE-DISPATCH SHORT-CIRCUIT. R10's report noted that navigator.onLine=false still costs
  attempted dispatches. No transport specification in this repository requires a short-circuit, and
  R10A §4 forbids inventing one in a page round, so the shared transport was not touched. What is
  asserted instead is the honest decomposition, and the four numbers are never conflated:

      external ATTEMPTS        up to 2, inside the existing bounded contract
      reached a server         0
      retries                  within the shared bound
      state shown              BROWSER_OFFLINE -- never FEATURE_DISABLED, never SOURCE_NOT_CONNECTED

TESTS
-------------------------------------------------------------------------------------------------------
  NEW   product-strategy-capability-route-p1-b8d-r10a.test.js
        99 passed / 0 failed / 9 mutants / 0 survived / 0 broken probes

        §A the caller census that would have caught the original gap -- ZERO callers of the private
           POST shim, measured on DECOMMENTED source so the paragraphs explaining the history cannot
           satisfy or break it
        §B what "false" means, and what it must not be allowed to mean
        §C the capability read sits under the SAME bound as the other two
        §D the browser matrix: recovery, answered-false, sign-in page, generic HTML, genuinely offline
        §E the state machine DRIVEN rather than inspected -- not-latched, asks-again, clears-on-answer,
           literal-true-only, superseded-writes-nothing

  SIX SUITES WERE UPDATED, AND EVERY ONE FOR THE SAME REASON: they drove `KM.api.transport.post`, a
  door production no longer has. Moving each to `KM.transport.request` makes them exercise the
  boundary production dispatches through, which is a better test than the one it replaces:
    api-product-pricing-envelope-action-p1-b7e      103/0/8/0
    deployment-r10-activation-boundary-p1-b7f       102/0/7/0
    product-strategy-information-architecture-p1-b8b 238/0/18/0
    product-strategy-live-activation-p1-b8d-r4       63/0/9/0   (+ F3b restated, G4/G6 re-aimed)
    product-strategy-site-selection-p1-b8d-r5       100/0/11/0
    product-strategy-replay-acceptance-p1-b8c       398/0/9/0

  AND THREE HARNESS DEFECTS THE FALLBACK HAD BEEN HIDING:
    · `_p1b8c-replay.js` never installed a shared transport under Node, because km-transport.js
      publishes its factory only onto a BROWSER window. Every Node suite had been falling through to
      the POST fallback. It requires the real factory now, so ONE arrangement holds everywhere:
      production's transport over the harness's network, in Chrome and in Node alike.
    · Two replay sandboxes did not load km-transport.js at all, while calling themselves the
      production page. They were modelling a page that cannot exist.
    · Suites expressed transport failures by THROWING a typed apiCode, which the shared transport
      never reads -- it derives its code from the WIRE. Those scenarios now send the network condition
      that genuinely produces each code, so production's classifier stays the only classifier.

  KEPT: R7 184/0/21/0 · R8 180/0/18/0 · R9 154/0/17/0 · R10 156/0/17/0

SWEEP
-------------------------------------------------------------------------------------------------------
  PRE  (fresh worktree @ a5bdfc2)      474 suites   4 flagged
  POST (fresh worktree @ the commit)   475 suites   4 flagged

  The suite-count delta of 1 is this round's new file. The four flagged suites and EVERY failing
  assertion inside them are verbatim identical in both directions (17 lines compared, diff empty):
    gap-job-done-notice-f1-small-r1 (3) · order-planning-monthly-projection-consumer-f1-4b-fm3d (1)
    replen-header-toggle (7) · supply-planning-route-inventory (2)
  0 new failures · 0 survived mutants · 0 broken probes.

  TWO NEW FAILURES APPEARED MID-ROUND AND BOTH WERE MINE. Recorded because each was caused by the
  fix for the one before it, which is the shape of mistake that hides:

    product-strategy-visual-integration-p1-b8d-r6  reported "no measurements came back from the
      browser". A timeout scenario is served by NEVER ANSWERING, which is what a timeout is -- but
      production's read budget is 60s, so the page was still correctly waiting when the measurement
      window closed. A suite reporting nothing about a page that was working.

    product-strategy-lifecycle-p1-b8d-r8  A16 "B answers and B mounts" then failed, because the
      250ms budget chosen to fix R6 was SHORTER than the 700ms delay the deferred-teardown trace
      deliberately puts on site B. A slow answer that was meant to arrive was cut off instead.

  The value is bounded from both sides and only one side had been considered: it must exceed every
  deliberate delay (max 700ms today) and fit inside the page's 8000ms virtual-time budget. 2000ms
  clears both, and both constraints are now written where the value is set.

FILES
-------------------------------------------------------------------------------------------------------
  shipped       assets/js/api/km-product-pricing-workspace.js   system.health through readOnce; the
                                                                classified capability reason; the POST
                                                                fallback removed; transportOf gated on
                                                                what it uses
                assets/js/pages/product-strategy-board.js       the capability gate shows the reason
                index.html                                      35 token refs, 0 stale
  harness       assets/tests/_p1b8c-replay.js                   a real transport under Node; typed
                                                                failures sent as network conditions;
                                                                a foundation stub that builds the real
                                                                envelope
                assets/tests/_p1b8c-visual-runner.js            a genuinely offline browser
                assets/tests/_release-order.js                  token appended
                six suites moved to the shared transport (listed above)
  docs          docs/planning/S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md
                docs/planning/API_MIGRATION_MASTER_PLAN.md
                docs/planning/P1_B8C_LIVE_READBACK_AND_ACTIVATION_MANIFEST.md
                docs/planning/DEPLOYMENT_RELEASE_LOG.md

MISTAKES THIS ROUND MADE AND CORRECTED
-------------------------------------------------------------------------------------------------------
  · THE FIRST GATE CHANGE BROKE EVERY ACCEPTANCE RUN. `transportOf()` was re-pointed at
    `buildRequestEnvelope`, which the replay's foundation stub does not carry -- so every run reported
    FEATURE_DISABLED at zero requests. The stub was not wrong to omit it: `readOnce` treats the builder
    as OPTIONAL. Gating on a member this file can work without would have refused a usable foundation.
  · A MUTANT SCORED ITSELF. G4's probe read the value refreshCapability RESOLVES, but the fail-closed
    branch both lowers the mirror and returns false -- so a mutant that raised the mirror still
    resolved false and looked caught. It reads the mirror now, which is what every later caller reads.
  · THREE R4 MUTANTS MEASURED NOTHING, for the second time in that file's history. They were handed a
    socket offering only `post`, so the accessor refused before sending and the mutants "survived"
    against a code path they never reached.

DEPLOYMENT
-------------------------------------------------------------------------------------------------------
  APPS_SCRIPT_SYNC_REQUIRED   NO      .gs files changed: 0
  FRONTEND_DEPLOY_REQUIRED    YES     two shipped files move together on one token
  DB / Sheets / Drive writes  0       action contract unchanged; feature flag unchanged
  Release identity            unchanged  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11
  a5bdfc2                     A PARTIAL MIGRATION. Not to be deployed on its own.
  Rollback                    unchanged: PRODUCT_STRATEGY_ENABLED_ = false, save, new version, update
                              the existing deployment. Rollback needs no frontend deploy.

LIVE RELIABILITY
-------------------------------------------------------------------------------------------------------
  NOT RUN ON DEPLOYED BYTES. The R10 live measurement (39/40, then 40/40) was taken against the
  pre-R10A state and does not speak for this round. Nothing here may be recorded as a passed soak.

  RECOMMENDED POST-DEPLOYMENT GATE, as a proposal and not a result: after the frontend deploy, on real
  GitHub Pages, 200 x siteUniverse.get + 200 x workspace.get + 200 x system.health, spread over at
  least three windows >=2h apart. Record final success rate, metrics().recoveries, the per-attempt
  redirect-404 rate, and the state name of every surfaced refusal. Suggested pass: 600/600 final
  success with per-attempt redirect-404 <=1%. Recoveries > 0 with a clean final total is the bounded
  recovery doing its job; a surfaced HTTP_NOT_FOUND that survives its one retry is a deployment-side
  residue and is the USER's to act on.

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · B2-9 recovery_from is written onto a discarded object. Unchanged; belongs to a transport round.
  · navigator.onLine=false still costs up to two attempted dispatches. Deliberate -- see above.
  · Everything R9 and R10 listed under KNOWN AND NOT FIXED is unchanged.
```

**STATUS: LOCAL COMMIT — NOT PUSHED — FRONTEND REDEPLOY REQUIRED — NO APPS SCRIPT SYNC.**

## P1-B8D-R10C — THE STATE BEFORE THE DATA

**2026-09-14 · local commit on `feature/product-strategy-board-p0` · NOT PUSHED**

```
PRE  HEAD   7bd5af20c5dc2e993db7b3ae109a34b0916c3856
CACHE TOKEN capabilityroute-p1b8dr10a-20260914  ->  nullcanonical-p1b8dr10c-20260914  (35 refs, 0 stale)

WHAT R10B PROVED, AND WHAT IT DID NOT
-------------------------------------------------------------------------------------------------------
  R10B changed no code. It attributed the live latency and, on the way, caught a crash that had
  nothing to do with the transport.

  ATTRIBUTION, from 60 serial reads on the deployed bytes plus a USER-performed execution-log check:
    execution correlation   61 expected /exec visits, 61 observed doGet executions, difference 0
                            all Completed; 0 Failed; 0 Timed out; UI duration 3.478s - 13.91s
    server_ms               p50 5 102ms   p95 7 658ms   max 9 685ms
    browser elapsed         p50 9 767ms   p95 14 429ms  max 30 717ms
    the remainder           p50 4 742ms, and CONSTANT across actions whose handler cost differs
                            fourfold (4 763 / 4 712 / 4 746). It contains Google ingress, queueing,
                            the redirect response and the transfer, AND THIS EVIDENCE CANNOT SPLIT IT.

  A HANDLER TIMEOUT IS DISPROVED, not merely unobserved: every one of the 61 executions completed.
  `system.health` is nonetheless the most expensive of the three reads (server_ms p50 6 271ms) and
  returns no rows at all; its cost is a 17-table schema census of the SHIPPING slice. Design proposal
  for that is docs/planning/PRODUCT_STRATEGY_CAPABILITY_READ_COST_DESIGN.md -- DESIGN ONLY, 0 .gs
  changed, nothing implemented, nothing deployed.

  WHAT REMAINS UNEXPLAINED, AND IS RECORDED AS SUCH: three surfaced SOURCE_TIMED_OUT events across the
  R10A and R10B windows. One echo -> stable -> echo redirect bounce was captured at 58.7s against a 60s
  client budget and is the strongest candidate, but none of the three failures has a matching
  per-attempt server correlation. It is not called solved.

THE DEFECT THIS ROUND FIXES
-------------------------------------------------------------------------------------------------------
  Uncaught TypeError: Cannot read properties of null (reading 'rows')
    at buildModel      psb-board-ui.js:207      rows: CANON.rows
    at categoryValues  psb-board-ui.js:232      var m = MODEL || buildModel();
    at firstCategory   psb-board-ui.js:241
    at selectView      psb-board-ui.js:2461     else if (!STATE.category) { STATE.category = firstCategory(); }

  `CANON` starts null and is assigned in ONE place, `reload()`, which runs inside `boot()`. Production
  ships no preview fixture, so the board does not auto-mount: the scripts load, THE VIEW RAIL IS LIVE,
  and CANON stays null until the page controller mounts with data. When the data refuses -- a timeout,
  an offline browser, a capability that could not be read -- the mount never happens and the rail is
  live over a board with no data. One click on any view other than the one showing dereferenced null.

  FIVE throws were measured on the deployed bytes, one per view; the sixth was clean only because
  `overview` was already the current route and `selectView` returns before the branch. THE DIFFERENTIAL
  THAT SETTLES IT: in a second run where the board HAD loaded, the same six clicks threw nothing.

THE FIX, AND THE SENTENCE IT REFUSES TO SAY
-------------------------------------------------------------------------------------------------------
  Two guards in the functions that OWN the data, and one caller taught to accept the answer:

    categoryValues()      if (!CANON) return null;
    categoryOptionRows()  if (!CANON) return null;
    firstCategory()       return (v && v.length) ? v[0] : null;

  IT RETURNS null AND NOT []. `[]` was the cheaper edit and it is a false statement -- it says the site
  was read and found to have no categories. The file already legislates against the neighbouring
  conflation one paragraph up its own source: "An empty menu and a menu of three demonstration values
  are different answers and must look different." An empty menu and NO MENU YET are different answers
  too. `notices()` already calls the genuine case NO_CATEGORIES_ON_SITE -- "an answer about the site,
  not a failure to load", in its own words -- and that answer is left exactly as it was.

  IT KEYS ON THE DATA, NOT ON `MOUNTED`. `boot()` raises the flag one line before it loads, so a load
  that throws leaves the board flagged mounted with no canonical data. A guard asking `!MOUNTED` would
  pass every ordinary mount and crash on exactly the page this round exists for. Z11 is that mutant.

  WHY TWO FUNCTIONS ARE THE WHOLE FIX, asserted rather than assumed. Every other reader of the category
  helpers -- viewCategory, viewFindings, renderScope -- is a RENDERING function, and all rendering
  passes render(), which begins `if (!MOUNTED) return;` and then calls reload() before anything draws.
  None can run with CANON null. `selectView` was the exception because it derives STATE BEFORE it
  calls render(), outside the only guard there was. Z6 and Z11 hold that argument up; Z12 proves the
  fix is not aimed at the one view that happened to crash.

  NOT DONE: no empty fixture, no swallowed TypeError, no `CANON || {rows:[]}`, no optional-chaining
  default, no change to transport, retry bound, timeout or capability semantics.

TESTS
-------------------------------------------------------------------------------------------------------
  NEW   product-strategy-null-canonical-state-p1-b8d-r10c.test.js      92 / 0 / 12 mutants / 0 survived

    RED BEFORE, GREEN AFTER, with the SAME final suite:
      against committed 7bd5af2 (fresh worktree)   37 passed  19 failed   5 caught  7 probe-faulted
      against the fix                              92 passed   0 failed  12 caught  0 survived
    The Node run reproduced the live stack at the SAME line numbers -- buildModel:207, categoryValues:232.

    §A the state production actually starts in (deferred boot, CANON null)
    §B the R10B defect: six routes, each and in sequence
    §C NOT_LOADED / LOADED_EMPTY / LOADED_WITH_DATA are three different answers
    §D the caller census that makes "two guards are enough" a measurement
    §E lifecycle: unmounted, refused-then-recovered, six refused clicks then a clean mount
    §F NINE REAL-CHROME SCENARIOS through the repository's own visual runner -- production index,
       production partial, production lifecycle, real transport, bounded fake network beneath it:
       capability refused, every read fails, only the capability fails, a read still outstanding under
       the clicks, slow + offline, genuinely offline, a site with no listings, a site with no
       categories, and NOTHING WRONG AT ALL as the control. Every one: 0 null-canonical TypeErrors,
       0 uncaught errors of any kind.

  KEPT: R6 107/0/14/0 · R7 184/0/21/0 · R8 180/0/18/0 · R9 154/0/17/0 · R10 156/0/17/0
        R10A 99/0/9/0 · b7f 102/0/7/0 · b8b 238/0/18/0 · b8c 398/0/9/0 · b8c-r2 274/0/21/0
        activation 349/0/18/0 · b2 253/0/17/0 · b3 342/0/17/0 · b5 160/0/12/0 · b7 171/0/12/0
        b8a 88/0/16/0 · r5 100/0/11/0 · image r3 336/0/20/0 · r3-r1 160/0/15/0 · r3-r2 187/0/16/0

SWEEP
-------------------------------------------------------------------------------------------------------
  PRE  (fresh worktree @ 7bd5af2)   475 suites   4 flagged
  POST (working tree, the same content this commit carries)   476 suites   4 flagged

  The suite-count delta of 1 is this round's new file. The four flagged suites and EVERY failing
  assertion inside them are verbatim identical in both directions (17 lines compared, diff empty):
    gap-job-done-notice-f1-small-r1 (3) · order-planning-monthly-projection-consumer-f1-4b-fm3d (1)
    replen-header-toggle (7) · supply-planning-route-inventory (2)
  0 new failures · 0 survived mutants · 0 broken probes.

  THE POST NUMBER ABOVE IS THE WORKING TREE, AND IT SAYS SO. The authoritative sweep runs in a fresh
  detached worktree at the commit itself and is reported with the round; a number written here before
  that run would be a prediction wearing a measurement's clothes, which is the exact habit R10A had to
  disclose one round ago.

FILES
-------------------------------------------------------------------------------------------------------
  shipped       assets/js/product-strategy/psb-board-ui.js    two guards and one tolerant caller
                index.html                                    35 token refs, 0 stale
  harness       assets/tests/_psb-harness.js                  bootPage learns the state production
                                                              starts in (defer) and a read-only
                                                              internals view for one section
                assets/tests/_p1b8c-interactions.js           the six-view sequence, clicked through
                                                              the production rail
                assets/tests/_release-order.js                token appended
  docs          docs/planning/PRODUCT_STRATEGY_CAPABILITY_READ_COST_DESIGN.md   NEW, design only
                docs/planning/P1_B8C_LIVE_READBACK_AND_ACTIVATION_MANIFEST.md
                docs/planning/API_MIGRATION_MASTER_PLAN.md
                docs/planning/DEPLOYMENT_RELEASE_LOG.md

MISTAKES THIS ROUND MADE AND CORRECTED
-------------------------------------------------------------------------------------------------------
  THREE OF THE FOUR WERE IN THE INSTRUMENT, AND ONE OF THEM INVALIDATED A WHOLE RUN BEFORE IT WAS SEEN.

  · A BROWSER MATRIX BUILT ON A CDP RIG ENABLED Fetch INTERCEPTION ON `*` AT BOTH STAGES. An Apps
    Script read is a 302 from the stable host to the echo host, and continuing a REDIRECT response
    through the Fetch domain breaks the chain, so EVERY request failed -- including the scenarios that
    were meant to inject nothing. The give-away was the control case failing exactly like the fault
    cases: when `6-successful-board` reports SOURCE_NOT_CONNECTED, the fault is in the instrument.
    The rig was abandoned for the repository's own visual runner, which already fakes the network
    BENEATH the real transport and is the thing three other rounds are accepted on.
  · Z6 WAS A NO-OP MUTANT. It inserted `if (MOUNTED === undefined) return;` -- a condition that is
    never true -- and reported SURVIVED against a guard it had not removed.
  · Z11 WAS AIMED AT A CONDITION THAT CANNOT OCCUR IN THE PROBE. It tried to CREATE the
    `MOUNTED = true` before `reload()` ordering; with the board deferred neither line runs. The
    ordering is already in boot(); what the fix must guarantee is that it does not matter. Re-aimed at
    the property that does: the guard keys on the DATA, not on the FLAG.
  · F4/F5 USED THE RUNNER'S `hang`, WHICH MARKS THE PAGE READY AFTER 400ms so a loading state can be
    photographed -- mutually exclusive with running a script. The trace came back empty and the suite
    reported "the six views were not exercised" about a page that was never asked to. Re-aimed at the
    real condition: a read still OUTSTANDING while the rail is clicked.

DEPLOYMENT
-------------------------------------------------------------------------------------------------------
  APPS_SCRIPT_SYNC_REQUIRED   NO      .gs files changed: 0
  FRONTEND_DEPLOY_REQUIRED    YES     one shipped module + index.html
  DB / Sheets / Drive writes  0       action contract unchanged; feature flag unchanged
  Release identity            unchanged  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11
  Rollback                    unchanged: PRODUCT_STRATEGY_ENABLED_ = false, save, new version, update
                              the existing deployment. Rollback needs no frontend deploy.

LIVE RELIABILITY
-------------------------------------------------------------------------------------------------------
  NOT RE-RUN ON R10C DEPLOYED BYTES. The R10B measurement speaks for 7bd5af2 and for nothing after it.
  The R10A smoke gate remains FAIL on its own stated threshold (60/60 with 0 surfaced errors; measured
  98/100 with two SOURCE_TIMED_OUT). Nothing in this round changes that verdict and nothing here may
  be recorded as a passed soak.

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · The ~4.7s non-handler cost per request. Unattributed; PATH C/D.
  · Three surfaced SOURCE_TIMED_OUT events without per-attempt server correlation.
  · `system.health` pays a 17-table shipping-slice census on every call. PATH B, design only.
  · `boot()` raises MOUNTED one line before it loads, so a throwing load leaves the flag up. The R10C
    guards make it harmless for the category machinery; the ordering itself is untouched and belongs
    to a round with its own evidence.
  · Everything R9, R10 and R10A listed under KNOWN AND NOT FIXED is unchanged.
```

**STATUS: LOCAL COMMIT — NOT PUSHED — FRONTEND REDEPLOY REQUIRED — NO APPS SCRIPT SYNC.**

---

## P1-B8D-R10E — THE ONE READ A PERSON CAN ASK FOR

```
PRE   5c50baa18ec56decaead34561eb8d9a670c59f2f
BRANCH  feature/product-strategy-board-p0  (DRAFT worktree)

WHY THIS ROUND EXISTS
-------------------------------------------------------------------------------------------------------
  R10D's corrected reliability gate measured the DEPLOYED bytes and failed, twice over:

      LIVE_RELIABILITY_STAGE_1   56/60      four site-universe reads produced refusal envelopes
      COLD_BOOT_DIAGNOSTIC       19/20      one fresh-session boot settled the capability to FAILED

  AND THE FAILURE WAS NOT THE SERVER REFUSING. Across 85 live logical reads, every one of the twelve
  404s landed on the /exec REDIRECT TARGET and not one landed on the stable endpoint. Two reads that
  hit one recovered on the very next attempt with a 200 and a JSON body — the answer existed and one
  hop could not be read. A third shape was worse: one read bounced between the two hosts five times
  with five 302s and NO response at all, until the production 60s budget aborted it.

  THE COST OF ONE IN TWENTY IS A WHOLE PAGE LIFE. The bootstrap runs once; the mirror settles to a
  classified failure; `refreshCapability()` dispatches nothing by design; route-away and return
  re-read nothing. Each of those is correct on its own, and together they mean the board stays
  unusable until somebody thinks to reload a page that never told them to.

WHAT CHANGED
-------------------------------------------------------------------------------------------------------
  ONE MORE READ, ONLY WHEN A PERSON ASKS FOR IT. No timer, no second automatic bootstrap, no raised
  retry ceiling, no longer timeout, no new action, no new socket, no new Apps Script file.

  shipped   assets/js/api/operation-system-db-api.js
              `KM.DB.retryClientCapabilities()` — a single-flighted re-entry into the bootstrap that
              already existed. It reuses `_kmApplyClientCapabilities_` rather than re-implementing
              it, which is what makes it safe: that function already carries a monotonic sequence, a
              deployment-identity check and two supersede guards, so a retry cannot undo a good
              answer that arrived while it was in the air, and its success reaches EVERY capability
              consumer through the one apply chain. It never rejects — the caller re-reads the
              mirror, exactly as boot does.

              THE SEQUENCE GUARD IS NOT A SINGLE-FLIGHT, and the distinction is the round. `_kmCapSeq_`
              decides which answer WINS; it does not stop a second being ISSUED. Five clicks would be
              five executions billed to the deployment that is already failing. The in-flight promise
              makes five clicks one read, and it is a PROMISE latch rather than a time window because
              the measured failures took 45 to 60 seconds — a debounce would re-issue inside one.

            assets/js/pages/product-strategy-board.js
              Three refusals gained a control, and only the codes that can honestly change got one.
              The split is not invented here: the accessor already writes down what each classified
              failure means as a NEXT ACTION, and `P.RETRYABLE_CODES` is that judgement made
              renderable. NOT_AUTHORIZED, FEATURE_DISABLED and SOURCE_EMPTY deliberately get nothing.

            assets/css/product-strategy-board.css
              The control, its disabled state and its focus ring.

  index.html  cache token rotated across the co-deployed set.

WHAT IT REFUSES TO DO
-------------------------------------------------------------------------------------------------------
  · No automatic retry of any kind. A controller left alone issues nothing; asserted as a number.
  · FEATURE_DISABLED gets no "try again", because that would dress a PRODUCT DECISION as a
    connection problem — the confusion R10A and R10D spent two rounds pulling apart.
  · SOURCE_EMPTY gets no button either. A site list that was READ and is empty is a measurement.
  · NOT_AUTHORIZED gets none: "retrying is pointless — this needs a person with access".
  · No second generation. The workspace retry goes through `loadWorkspace` and inherits the token
    guard that already drops an answer for a site nobody is looking at any more.

TESTS
-------------------------------------------------------------------------------------------------------
  NEW   product-strategy-recovery-p1-b8d-r10e        134/0, 12 mutants, 0 survived
        Behaviour and REQUEST COUNTS, never a source census standing in for one. Twelve mutants
        include removing the single-flight, adding a timer, pointing the retry back at
        `system.health`, raising the bounded recovery, extending the timeout, offering a button under
        FEATURE_DISABLED and removing the unmounted-controller guard.

  KEPT GREEN  R10D 205/0/32/0 · activation 351/0/18/0 · shell integration 180/0/12/0 ·
              R10A 94/0/9/0 · R10C 92/0/12/0 · R8 182/0/18/0 · R9 154/0/17/0 · R10 156/0/17/0 ·
              R6 107/0/14/0 · R5 100/0/11/0 · R4 64/0/9/0 · B8C 398/0/9/0 · B8C-R2 274/0/21/0 ·
              B8B 238/0/18/0 · B5 160/0/12/0 · cache identity 74/0 · transport 364/0 · registry 199/0

  FOUR EARLIER MUTANTS WERE BROKEN AND REPAIRED BY MOVING THIS ROUND'S CODE, NOT THEIRS. The retry
  descriptor first arrived as a fifth argument to `renderState`, which changed two call sites that
  R8, R9, R4 and B8C aim mutants at to prove the board is torn down before a refusal is drawn. Every
  one of them reported PROBE ERROR rather than passing quietly — which is the probes working. The
  descriptor now travels on the `ux` object and both call sites are byte-identical again, so four
  live guards were kept rather than retired. One assertion in R4 also matched the letters "tab"
  inside the word "table" in a new comment; the comment was reworded. No other round's assertion was
  edited.

SWEEP — MEASURED
-------------------------------------------------------------------------------------------------------
  PRE commit              5c50baa18ec56decaead34561eb8d9a670c59f2f
  implementation commit   af16a8ab862160ab09cf004da485d0c265e3839f

  Both sweeps ran in a fresh detached worktree, because the working tree is not the commit and the
  CRLF-fragile suites pass falsely there.

                                    PRE @ 5c50baa        POST @ af16a8a
  suites                            477                  478
  suite delta                       —                    +1   (the new R10E recovery suite)
  flagged suites                    4                    4    (the same four, pre-existing)
  new failures                      —                    0
  survived mutants                  0                    0
  PROBE ERROR                       0                    0

  baseline assertion diff           IDENTICAL — 0 differences
  R10E recovery suite               134 passed / 0 failed / 12 mutants / 0 survived

  THE FOUR FLAGGED SUITES ARE THE SAME FOUR BEFORE AND AFTER. They are not new, not caused by this
  round, and not silenced by it; they are carried forward exactly as R10D carried them.

CACHE TOKEN
-------------------------------------------------------------------------------------------------------
  userretry-p1b8dr10e-20260915      refs 35      stale 0      misplaced 0      — MEASURED on the
                                    committed bytes, never pre-declared and then made to match.

  A CORRECTION WORTH RECORDING. The first attempt rotated only the three assets this round ships,
  on the reading that the series is a per-module stamp. The repo's own gate rejected it: 32 entries
  came back as "left behind". `staleAppTokenRefs` flags ANY entry carrying a known application token
  that is neither the current one nor the original baseline — the co-deployed set rotates TOGETHER,
  and the per-module stamp discipline belongs to the Apps Script build constants, not to index.html.

DEPLOYMENT
-------------------------------------------------------------------------------------------------------
  APPS_SCRIPT_SYNC_REQUIRED   NO      0 .gs files changed; no server contract touched
  FRONTEND_DEPLOY_REQUIRED    YES     3 shipped modules + index.html
  BUNDLE_REBUILD_REQUIRED     NO
  DB / Sheets / Drive writes  0       every path this round adds is a GET through the existing
                                      transport; the three actions were re-proven read-only on
                                      decommented source before a line was written
  ORDER                       FRONTEND ONLY. There is no server-first constraint this round because
                              there is no server change. The deployed Apps Script already publishes
                              `product_strategy_enabled`; R10E only adds a way to ask again.
  Rollback                    restore the four shipped files to 5c50baa. No server rollback exists or
                              is needed. The behaviour reverts to today's: still fail closed, still
                              classified, just without a button.

LIVE RELIABILITY — THE LOCAL RESULT DOES NOT TOUCH THE LIVE RESULT
-------------------------------------------------------------------------------------------------------
  LIVE_RELIABILITY_STAGE_1  = FAIL      56/60 official reads, measured on the DEPLOYED bytes of 5c50baa
  COLD_BOOT_DIAGNOSTIC      = FAIL      19/20 fresh-session boots, same deployed bytes

  THESE TWO STAY FAIL. They were measured against deployed bytes, and a local suite passing is not a
  measurement of a deployment. Nothing in this round is permitted to turn either into a PASS.

  R10E improves recoverability, not underlying redirect reliability.
  R10E deployed-byte reliability and recovery gates have not yet run.

  The three gates that will judge the bytes of this round are kept separate on purpose, because
  merging them is how a recovery gets mistaken for a fix:

    RAW_TRANSPORT_RELIABILITY   NOT RUN ON R10E BYTES   the result BEFORE any human retry — the
                                                        transport measured as it actually behaves
    RECOVERY_CONTRACT_GATE      NOT RUN ON R10E BYTES   controlled refusal injection: the control
                                                        appears, one click is one logical read, five
                                                        clicks are still one, refusal and loaded-empty
                                                        stay apart, focus and keyboard hold, writes 0.
                                                        A BEHAVIOUR CONTRACT — it is not live reliability
                                                        and may not be reported as any.
    COLD_BOOT_RECOVERY_GATE     NOT RUN ON R10E BYTES   fresh sessions; a natural first-boot failure is
                                                        KEPT as a raw failure and a successful retry is
                                                        recorded SEPARATELY. Recovery never erases the
                                                        raw boot result.

  Long soak is not considered until all three report cleanly and without being mixed.

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · ROOT_CAUSE = NOT_ESTABLISHED. The failure layer is SUPPORTED as the redirect / result-retrieval
    chain and the client side is cleared, but the Apps Script Executions evidence that would settle
    whether the handler completed is still outstanding.
  · Two comment blocks in index.html and app.js still describe Product Strategy as not activated.
    Stale prose, no runtime effect, deliberately left for a separate round.
  · Everything R10D listed under KNOWN AND NOT FIXED is unchanged.
```

## P1-B8D-R10D — THE CAPABILITY STOPS BEING A REQUEST OF ITS OWN

```
PRE   dc3f6fd2260ee91bb844e9b81427619b7ad55218
BRANCH  feature/product-strategy-board-p0  (DRAFT worktree; MAIN carries no product change)

WHAT CHANGED
-------------------------------------------------------------------------------------------------------
  R10A put this page's capability read on the shared transport and left it aimed at `system.health` —
  an action that scans about seventeen shipping sheets to report a deployment's condition, in order to
  deliver ONE boolean out of 00_config.gs. R10D removes the read. The flag rides
  `getClientCapabilities`, the configuration bootstrap the application already performs exactly once
  per page life through the shared single-flight latch.

  ONE ADDED SERVER FIELD, ONE ADDED CONSUMER OF AN ANSWER ALREADY READ, ONE FEWER REQUEST. No new
  action. No new flag, constant or property authority. No retry, no timeout, no router or envelope
  change. `system.health` is untouched and still serves its other callers; it simply has no Product
  Strategy caller.

  AND FOUR MEANINGS COME APART THAT USED TO BE ONE. `_enabled === false` was carrying "the server said
  no", "the server said nothing", "nobody has asked yet" and "the ask failed". R10A separated the
  failures out; moving the read to boot time makes the other two REACHABLE for the first time — a
  mount can land inside the bootstrap window, and a deployment predating the field answers perfectly
  well without mentioning it.

    server literal true        -> the board loads
    server literal false       -> FEATURE_DISABLED, and this is the ONLY input that produces it
    field missing/not boolean  -> CAPABILITY_NOT_REPORTED   fails closed; invents no decision
    bootstrap not yet settled  -> LOADING_CAPABILITY        waits on the read already in flight
    bootstrap failed           -> the R10A transport classification

  PRODUCT_STRATEGY_ENABLED_ REMAINS THE SINGLE AUTHORITY. Assigned in exactly one place, read through
  productStrategyEnabled_(), which is `PRODUCT_STRATEGY_ENABLED_ === true`.

FILES
-------------------------------------------------------------------------------------------------------
  .gs           assets/specs/active/apps-script/03_master_data_handlers.gs
                  ONE added field on handleGetClientCapabilities_:
                    product_strategy_enabled: (typeof productStrategyEnabled_ === 'function')
                      ? (productStrategyEnabled_() === true) : false
                  GUARDED rather than reading the variable directly: these files share one global
                  scope, so an unguarded reference in a project carrying 03_ without 00_ would raise a
                  ReferenceError and take the WHOLE capability response down — including the three
                  flags that have nothing to do with Product Strategy. The guarded form is what the
                  other three fields already use and what 63_ uses for this same flag.
                  capabilitiesVersion DELIBERATELY NOT BUMPED. Nothing gates on it, and
                  TEMP_migrate_request_order_draft_v2.gs DECLARES the current value as this action's
                  release signature; moving it would desynchronise that declaration to no runtime
                  effect. Recorded below as an open item rather than fixed in passing.

  shipped       assets/js/api/operation-system-db-api.js    the bootstrap gains a second consumer of
                                                            the same answer, placed AFTER the two
                                                            supersede guards, so a stale or late
                                                            response never reaches the mirror
                assets/js/api/km-product-pricing-workspace.js  the capability read is gone; the mirror
                                                            gains the five states and one refusal helper
                assets/js/pages/product-strategy-board.js   waits on the capability read app.js has
                                                            ALREADY declared to the boot arbiter
                index.html                                  35 token refs rotated

  harness       assets/tests/_p1b8c-visual-runner.js   loads the shipped operation-system-db-api.js and
                                                       core/boot-read-arbiter.js, and moves the MOUNT to
                                                       DOMContentLoaded — where production's mounts are
                assets/tests/_p1b8c-replay.js          answers getClientCapabilities from ONE payload
                                                       builder; installs the same fake fetch on the
                                                       global so shipped db-api bytes reach it; the Node
                                                       seam applies the scenario's own answer through
                                                       the production setter
                assets/tests/_release-order.js         token appended

  docs          API_MIGRATION_MASTER_PLAN.md · P1_B8C_LIVE_READBACK_AND_ACTIVATION_MANIFEST.md
                PRODUCT_STRATEGY_CAPABILITY_READ_COST_DESIGN.md
                S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md · DEPLOYMENT_RELEASE_LOG.md

THE HARNESS CHANGE, AND WHY IT WAS NOT OPTIONAL
-------------------------------------------------------------------------------------------------------
  THE ACCEPTANCE PAGE HAD BEEN REPORTING A PRODUCTION BOOT IT NEVER PERFORMED. `app.js` was loaded, so
  its DOMContentLoaded ran — but the one line this round is about is guarded on `KM.DB` existing, and
  `KM.DB` lives in `operation-system-db-api.js`, which the page's script filter excluded. The guard
  failed silently and the bootstrap never ran. A suite could then only raise the capability by calling
  the setter itself, which is exactly the second activation path R4 removed for hiding a live defect
  for a whole round.

  Loading the shipped file immediately raised the reason it had never been loaded: `_kmGapRead_`
  dispatches through the GLOBAL `fetch`, against an endpoint constant with no setter, so an untouched
  global would have sent a real request to a real deployment from every scenario. The same `fakeFetch`
  the transport is built with is therefore installed on the global — ONE fake server, ONE request log,
  so "exactly one capability request" is measurable rather than asserted. It is installed from the
  page's inline boot script, which runs DURING PARSING, while `app.js`'s bootstrap runs on
  DOMContentLoaded, which cannot fire until parsing has finished; and neither of the shipped file's
  two top-level blocks issues a request at load time.

  UNDER NODE THERE IS NO BOOTSTRAP TO RUN, and this is stated rather than blurred. No DOM, no app.js,
  no browser db api. One seam in the shared harness hands the accessor the SCENARIO'S OWN server
  answer — from the same payload builder the fake server answers with — through the production setter.
  No `true` is written on that path; `capability:false`, a `1`, a `"true"` and an omitted field all
  still fail closed, and a scenario that declares no answer injects nothing. Those Node suites DO NOT
  verify the production bootstrap chain and are not recorded as doing so; the chain is verified in the
  R10D browser matrix, on shipped bytes, where the setter is never called directly.

TESTS
-------------------------------------------------------------------------------------------------------
  NEW   product-strategy-capability-bootstrap-p1-b8d-r10d.test.js
        205 passed / 0 failed / 32 mutants / 0 survived / 0 broken probes

        §A the census: system.health named ZERO times in executable text, no capability ACTION to
           dispatch, no health fallback, two declared actions and one transport call site
        §B the server: one added field from one authority, no spreadsheet/lock/cache/write, the three
           pre-existing fields intact, the envelope unchanged, system.health still routed on both verbs
        §C the production caller chain in shipped bytes, and the supersede guards proven POSITIONALLY
           to run before the mirror is written
        §D the five states driven: true / false / missing / null / "true" / 1 / six named faults /
           no-payload-no-reason, and the refusal code each produces
        §N the Node seam's own controls: no server answer yields no value, the scenario's literal
           travels unnormalised, and the harness writes no hard-coded true anywhere
        §E the browser matrix on the REAL boot: one bootstrap per page life, zero system.health,
           two business reads, and every one of eleven runs GET-only

  RED-BEFORE, on committed PRE bytes in a fresh detached worktree, using the FINAL suite and the final
  harness, with production files untouched at dc3f6fd:
        126 passed / 67 failed / 16 mutants caught / 16 survived
  The suite ran to completion — the browser half executed — so every RED is a missing R10D behaviour
  and none is a path, fixture, harness or parser fault. The 16 survivors are mutants whose target code
  does not exist at PRE, which is the correct score for an anchor that matches nothing.

  SUITES UPDATED, EVERY ONE FOR THE SAME REASON: they asserted a capability read this round removed.
  Each assertion was SUPERSEDED AND REWRITTEN WITH ITS REASON ATTACHED, never deleted.
        product-strategy-capability-route-p1-b8d-r10a        94/0/9/0
        product-strategy-transport-stability-p1-b8d-r10     156/0/17/0
        product-strategy-lifecycle-p1-b8d-r8               182/0/18/0
        product-strategy-corrections-p1-b8d-r9             154/0/17/0
        product-strategy-visual-integration-p1-b8d-r6      107/0/14/0
        product-strategy-site-selection-p1-b8d-r5          100/0/11/0
        product-strategy-live-activation-p1-b8d-r4          64/0/9/0
        product-strategy-replay-acceptance-p1-b8c          398/0/9/0
        product-strategy-live-replay-acceptance-p1-b8c-r2  274/0/21/0
        action-registry-and-router-completeness-f1-7n-fb-4e-r2   199/0

  R4 IS THE ONE WORTH READING. Its §A did not assert a rule — it RECORDED THE DEFECT R4 FOUND: the
  deployed capability payload did not carry `product_strategy_enabled`, so applying the whole real
  payload left the mirror false, so a live browser refused a feature switched on at both authorities.
  R10D fixes that at the source, so those assertions INVERT, and their inversion is the proof.

  KEPT GREEN, UNCHANGED: R7 184/0/21/0 · R10C 92/0/12/0 · B8C-R3 336/0/20/0 · b7f 102/0/7/0 ·
  SEC-A0 54/0/11/0 · api-product-pricing B1 170/0/13/0 · B6 165/0/12/0 · B7E 103/0/8/0 ·
  three-flag authority R6E1 85/0.

SWEEP
-------------------------------------------------------------------------------------------------------
  PRE  (fresh detached worktree @ dc3f6fd, pristine)   476 suites   4 flagged   0 survived   0 PROBE ERROR

  The four flagged suites are the recorded baseline and nothing else failed:
    gap-job-done-notice-f1-small-r1 (3) · order-planning-monthly-projection-consumer-f1-4b-fm3d (1)
    replen-header-toggle (7) · supply-planning-route-inventory (2)
  THIRTEEN failing assertions across four suites. Earlier rounds recorded this as "17 lines compared",
  which counts the four suite-name lines alongside the thirteen assertions; both numbers describe the
  same baseline and the assertion count is thirteen.

  POST  (fresh detached worktree @ 2635c56, sequential, all suites)
                                                      477 suites   4 flagged   0 survived   0 PROBE ERROR

  MEASURED, not projected, and measured on the commit bytes rather than on a working tree. The suite
  count rose by one because this round ADDS one suite; the flagged set is the same four, and the
  thirteen failing assertions inside them are VERBATIM IDENTICAL to PRE — extracted by running those
  four suites with one identical command at each end and diffing the two captures:

        diff  baseline @ dc3f6fd   baseline @ 2635c56    →  0 differences

  NEW FAILURES: 0.  The three that appeared at 2636d8d — activation G6 and shell-integration E2b/E4 —
  were assertions superseded at 2635c56 for the reason recorded under TESTS, not failures tolerated:

        product-strategy-activation-p1-b8d              348/1  →  351/0/18/0
        product-strategy-shell-integration-p1-b7        169/2  →  180/0/12/0
        product-strategy-capability-bootstrap-p1-b8d-r10d      205/0/32/0   (green at both)

  FINAL RECONCILED POST  (fresh detached worktree @ e1a2827, sequential, all suites)
                                                      477 suites   4 flagged   0 survived   0 PROBE ERROR

  RE-MEASURED ON THE RECONCILED BYTES, not carried over from 2635c56. The merge and the ledger edit
  above it touch two files, neither of which any suite loads, so the expectation was that nothing
  moves — but an expectation is not a measurement, and the sweep was run rather than assumed. It was
  run in a worktree of its own (km-r10d-post-reconciled), never reusing the one that measured
  2635c56, so a stale generated page could not answer for the new commit.

        exit != 0             the same four baseline suites, and no others
        new failures          0
        baseline assertions   diff against dc3f6fd  →  0 differences
                              diff against 2635c56  →  0 differences
        activation            351/0/18/0
        shell integration     180/0/12/0
        capability bootstrap  205/0/32/0

  Three independent sweeps now agree on the same baseline, word for word: dc3f6fd, 2635c56, e1a2827.

  ONE COMMIT SITS ABOVE THE SWEPT ONE — the ledger commit recording these figures, which cannot be
  inside the commit it describes. It changes this file and nothing else, and every product and test
  byte in it is blob-identical to e1a2827. No suite was re-run for it beyond the documentation and
  cache-identity gates.

RECONCILIATION
-------------------------------------------------------------------------------------------------------
  MAIN moved while this round was under test, by an operation outside it. The commit is accepted and
  its content was verified before it was taken: it changes ONE file and adds FIVE lines.

    2636d8d   PRODUCTION IMPLEMENTATION.    the added .gs field, the three shipped modules, index.html,
                                            the new R10D suite, the docs, the cache token
    2635c56   LEGACY GATE ALIGNMENT.        two test files only. Three assertions superseded and
                                            rewritten with the reason attached; no production byte
    147fc86   MAIN TRACKED WORKSPACE.       Oeration.code-workspace, +5 lines, authored outside this
                                            round. 0 runtime, 0 tests, 0 docs, 0 .gs
    merge     TOPOLOGY RECONCILIATION ONLY. --no-ff merge of origin/main into this branch, so that
                                            147fc86 becomes an ancestor and MAIN can take this branch
                                            by fast-forward. It carries nothing else: the merge diff
                                            against 2635c56 is exactly those five workspace lines.

  Oeration.code-workspace IS NOW TRACKED MULTI-ROOT WORKSPACE CONFIG. It was previously treated as
  user-owned IDE configuration to be kept out of every commit; from 147fc86 it is a tracked file with
  a committed value. Two roots, `name` + `path` only, no tasks/launch/settings/extensions block, no
  absolute path, no third root, nothing sensitive. It is IDE configuration still: it is not shipped,
  not read by any runtime, and NOT PART OF ANY DEPLOYMENT. THE APPS SCRIPT SYNC LIST IS UNAFFECTED —
  the R10D .gs increment is still exactly one file, 03_master_data_handlers.gs.

  P1 IS NOT CLOSED. S2 RUNTIME HAS NOT STARTED. LIVE RELIABILITY HAS NOT RUN ON R10D DEPLOYED BYTES,
  because those bytes are not deployed. Reconciling the topology changes none of those three.

CACHE TOKEN
-------------------------------------------------------------------------------------------------------
  capbootstrap-p1b8dr10d-20260914      35 refs      0 stale      0 misplaced

DEPLOYMENT
-------------------------------------------------------------------------------------------------------
  APPS_SCRIPT_SYNC_REQUIRED   YES     .gs files changed: 1  (03_master_data_handlers.gs)
  FRONTEND_DEPLOY_REQUIRED    YES     three shipped modules + index.html
  BUNDLE_REBUILD_REQUIRED     NO      90_generated_supply_planning_bundle.gs untouched
  DB / Sheets / Drive writes  0       the added field opens no spreadsheet and takes no lock
  ORDER                       SERVER-FIRST, and this is not a preference.
                              A frontend that reaches a browser before the Apps Script version carrying
                              `product_strategy_enabled` FAILS CLOSED: no over-permission, but the board
                              reports CAPABILITY_NOT_REPORTED and is unusable. Deploy the server
                              contract first, verify the field read-only, then the frontend.
  Rollback                    unchanged: PRODUCT_STRATEGY_ENABLED_ = false, save, new version, update
                              the existing deployment. Needs no frontend deploy. The added field then
                              publishes `false` and the board says FEATURE_DISABLED — the true sentence.

LIVE RELIABILITY
-------------------------------------------------------------------------------------------------------
  NOT RUN ON R10D DEPLOYED BYTES, and cannot be: the bytes are not deployed. The R10B measurement
  speaks for 7bd5af2 and for nothing after it. Nothing here may be recorded as a passed soak.

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · `system.health` still pays its 17-table shipping-slice census for the callers that remain. PATH B2,
    design only, deliberately untouched by this round.
  · The ~4.7s non-handler cost per request. Unattributed; PATH C/D.
  · `capabilitiesVersion` does not track the field set it describes. No runtime effect; see FILES.
  · Two assertions in this project's suites were found to measure CUMULATIVE DRIFT from a fixed commit
    while reading as "this round changed nothing" — R6's G6 and the router-completeness ownership list.
    Both were restated to name what is known rather than to tolerate it silently; the pattern will
    recur for the next round that touches a .gs.
  · Everything R9, R10, R10A and R10C listed under KNOWN AND NOT FIXED is unchanged.
```

## P1-B8D-R10E-CLOSE — P1 IS CLOSED WITH THE RISK NAMED, NOT WITH THE RISK GONE

```
HEAD    82772eb7eb389dc689b60ac11f2eeb19f712d374   the deployed authority; this round changes no byte of it
BASE    1b4053781b2b7f7b37e74a7bec1dd5674fb6cb59
BRANCH  feature/product-strategy-board-p0 = main = origin/main = 82772eb
DATE    2026-09-17
SCOPE   DOCUMENTATION ONLY. No runtime file, no test, no cache token, no .gs, no schema, no action, no
        transport/timeout/retry policy. Nothing pushed, deployed or synced by this round.

WHAT THIS ENTRY IS
-------------------------------------------------------------------------------------------------------
  A DECISION, RECORDED WHERE THE GATES WERE RECORDED, so the closure and the gates cannot drift apart.
  It measures nothing new. Every number below was produced by a round already in this ledger or in its
  evidence, against the bytes named above; none was re-derived here, and none was improved here.

  The R10E entry left three gates open against "R10E bytes". Two have since been answered on the bytes
  that are actually deployed, and they are answered in opposite directions:

    the APPLICATION contract       PASS   proven statically and behaviourally on the served bytes
    the DELIVERY layer beneath it  FAIL   unchanged, external, and not reachable from client code

  P1 closes on the first of those, with the second written down rather than waited out.

THE CLOSURE
-------------------------------------------------------------------------------------------------------
  P1_APPLICATION_CONTRACT                     PASS
  P1_DEPLOYED_BYTES_IDENTITY                  PASS   3/3 full SHA-256, first poll, re-verified after
                                                     all live work
  P1_CAPABILITY_RECOVERY_CONTRACT             PASS
  P1_ACTION_INTEGRITY                         PASS
  P1_UNMOUNTED_DOM_OWNERSHIP                  PASS
  P1_UNMOUNTED_DISPATCH_OWNERSHIP             PASS
  P1_ROUTE_RETURN_FRESH_CONTROLLER            PASS
  P1_PERMANENT_LOADING_COUNT                  0 / 20
  P1_CONTROLLED_WRITES                        0
  P1_CONTROLLED_NON_GET                       0

  RAW_TRANSPORT_RELIABILITY                   FAIL
  COLD_BOOT_RAW_INITIAL_SUCCESS               17 / 20
  COLD_BOOT_FINAL_USABLE                      19 / 20
  COLD_BOOT_RECOVERY_GATE                     FAIL   against the 20 / 20 acceptance threshold
  LONG_SOAK_GATE                              NOT RUN
  SERVER_HANDLER_TIMEOUT_SUPPORTED            NO
  DELIVERY_LAYER_FAILURE_REMAINS_SUPPORTED    YES
  EXACT_REQUEST_EXECUTION_CORRELATION         NO

  P1_CLOSED                                   YES_WITH_DOCUMENTED_RESIDUAL_RISK
  S2_RUNTIME_ALLOWED                          YES_WITH_GATES

  NOTHING ABOVE IS PROMOTED BY BEING LISTED BESIDE SOMETHING THAT PASSED. The controlled-injection
  results are contract results; they were never reliability, and the FAIL rows stay FAIL.

RESIDUAL RISK — THE EXACT SENTENCE
-------------------------------------------------------------------------------------------------------
  Product Strategy Board application behaviour, failure classification, bounded recovery, route
  lifecycle and unmounted ownership are sealed on deployed bytes. A residual failure remains in the
  external Apps Script /exec to script.googleusercontent.com delivery path: a handler may complete
  while the browser does not receive the response. In the authoritative 20-session cold sample, 17/20
  were initially usable and 19/20 were finally usable; two user retry clicks occurred, and one session
  remained unusable after bounded recovery was exhausted. This 20-session sample is acceptance
  evidence, not a statistically valid long-term failure-rate estimate.

  IT IS NOT "ONE IN TWENTY NEEDS A MANUAL RETRY." One session stayed unusable AFTER the retry. The
  short form drops the only case that matters.

WHAT P1 PROVES
-------------------------------------------------------------------------------------------------------
  · Product Strategy Board capability bootstrap and settlement
  · productPricing.siteUniverse.get -> productPricing.workspace.get orchestration
  · the exact transient fallback allowlist
  · no capability/universe request overlap
  · bounded single-flight retry
  · action-integrity fail-closed behaviour
  · local versus server FEATURE_DISABLED provenance
  · route-away / route-return ownership
  · zero new universe/workspace dispatch by a dead controller
  · truthful error and refusal presentation

WHAT P1 DOES NOT PROVE
-------------------------------------------------------------------------------------------------------
  · system-wide transport reliability
  · that every application page is loading-stable
  · either complete factory/shipment/order trunk
  · write-path correctness
  · login / RBAC correctness
  · long-duration soak stability
  · Control Tower readiness

  ONE PAGE WAS SEALED, NOT A SYSTEM. This result may not be generalised to the whole KM OS.

S2 ENTRY GATES
-------------------------------------------------------------------------------------------------------
  Owned in full by docs/planning/P1_TO_S2_HANDOFF.md §9. In short: preserve the P1 read and lifecycle
  contracts; focused regression at each S2 batch boundary; transport reliability stays an OBSERVED
  EXTERNAL RISK, and no timeout, retry or proxy may be added without its own measured design decision.

  REQUEST_ORDER_SITE_CONFIRM_SERVER_GATE_GAP                        OPEN
  MUST_BE_FIXED_BEFORE_RELEVANT_WRITE_FLOW_PRODUCTION_ACCEPTANCE    YES
  LONG_SOAK_REQUIRED_BEFORE_FINAL_SYSTEM_ACCEPTANCE                 YES   deferred, NOT waived

DEPLOYMENT
-------------------------------------------------------------------------------------------------------
  APPS_SCRIPT_SYNC_REQUIRED   NO      no .gs changed by this round
  FRONTEND_DEPLOY_REQUIRED    NO      no shipped file changed by this round
  BUNDLE_REBUILD_REQUIRED     NO
  DB / Sheets / Drive writes  0
  Rollback                    unchanged and still one switch: PRODUCT_STRATEGY_ENABLED_ = false, save,
                              new version, update the existing deployment. Needs no frontend deploy.
                              Closing P1 does not remove that switch or make it harder to reach.

CACHE TOKEN
-------------------------------------------------------------------------------------------------------
  dispatchownership-p1b8dr10ef5-20260917      35 refs      0 stale      0 misplaced      (unchanged)

LIVE RELIABILITY
-------------------------------------------------------------------------------------------------------
  NOT RE-RUN. Raw-60, the 20-session cold boot and the long soak were all explicitly out of scope for
  this round and for the round that sealed the live contract. The rows above are carried forward from
  the measurements that produced them, and are not re-stated as anything better.

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · The delivery-layer failure itself. ROOT CAUSE remains outside this repository: the Executions
    evidence shows handlers completing — visible maximum about 30.246 s, none over 45 s or 60 s — while
    the browser receives nothing, and EXACT_REQUEST_EXECUTION_CORRELATION = NO, so no single execution
    row can be tied to a single failed browser read.
  · REQUEST_ORDER_SITE_CONFIRM_SERVER_GATE_GAP. The Site Confirm gate is enforced frontend-side only;
    no server-side write gate exists. Untouched by every P1-B8D-R10E round, and still mandatory before
    any relevant Request Order write-flow production acceptance.
  · One live scenario — HTTP_NOT_FOUND settling after a route-away — is recorded NOT_STAGEABLE: no
    injection primitive delivers a 404 after the route-away. Covered offline on these same bytes and
    structurally in the static seal. RECORDED, NEVER CLAIMED AS A PASS.
  · Everything R10E and R10D list under KNOWN AND NOT FIXED is unchanged.
```

## FC-SUMMARY-R2B-A2-R5-F3 — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R12` — THE TARGET RULE CONSUMER UNIFICATION

```
BASE    cd3fd8f   the F2 implementation: one resolver, five consumers unified
BRANCH  feature/product-strategy-board-p0   main = origin/main = fa23471
DATE    2026-09-19
SCOPE   RELEASE IDENTITY ONLY. This round adds no behaviour. It mints the release that names the
        change F2 already made, rotates the stamps that change required, registers two owners that
        never had a manifest row, and repairs the suites that had pinned the previous release as a
        literal. No handler, no action, no schema, no frontend file, no cache token.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R12
SUPERSEDES                   R11 (the P1-B8D activation release) — AS A CANDIDATE, NOT AS A DEPLOYMENT.
                             R11 was CUT. R12 does not withdraw it; it follows it.
STATUS                       PREPARED, NOT SYNCED. No Apps Script project carries it, no Web App
                             version exists, and the ledger records that it has not happened.

WHY A NEW RELEASE AND NOT A RIDE-ALONG
-------------------------------------------------------------------------------------------------------
  13_procurement_handlers.gs is a DEPLOYED MANIFEST OWNER and F2 changed it: procurementTargetRuleResolver_
  was deleted and the file now delegates to the shared KMPD.resolveTargetRule. Leaving it on F1-7N-FC-1A-R1
  would have been the exact defect the manifest exists to detect, and the standing E4 stamp-rotation check
  said so — correctly — for the whole of F2.

  Rotating it cascades, which is why F2 stopped and asked rather than doing it quietly:

    13_ stamp moves  ->  63_ carries 13_ manifest row  ->  63_ is now an edited owner
                     ->  SYS_BUILD_VERSION_ must move  ->  the release must move  ->  20 suites read it

  A release id names a TREE. R11 names the activation tree; this one carries a different resolver in four
  files. An id that names two different trees cannot answer the one question it exists for.

WHAT MAKES THIS RELEASE DANGEROUS TO HALF-SYNC
-------------------------------------------------------------------------------------------------------
  Every file below answers every action it answered before, both before and after the change. Nothing is
  added to the vocabulary and no response changes shape. A project that receives three of the four files
  returns SUCCESS from every endpoint and a DIFFERENT FORECAST NUMBER. The module manifest is the only
  instrument that can see it — which is why two of these files are being registered in it for the first
  time, rather than merely re-copied.

STAMP MOVEMENT — OLD -> NEW
-------------------------------------------------------------------------------------------------------
  63_  SYS_DEPLOYMENT_RELEASE_    R11                  -> R12        the RELEASE
  63_  SYS_BUILD_VERSION_         R11                  -> R12        63_ own module stamp (63_ changed)
  13_  PROC_BUILD_VERSION_        F1-7N-FC-1A-R1       -> R12        NINE rounds stale; the file changed
  14_  FCW_BUILD_VERSION_         (none — no stamp)    -> R12        NEW SYMBOL, new manifest row
  90_  KM_BUNDLE_CONTENT_HASH_    (none — no stamp)    -> 830563ef…  NEW SYMBOL, emitted by the builder

  DELIBERATELY NOT MOVED — and this is the load-bearing half:
  00_  CONFIG_BUILD_VERSION_      R11    unchanged     00_config.gs did not change in R12
  01_  RTR_BUILD_VERSION_         R9     unchanged     no action added, none withdrawn
  72_  PPW_BUILD_VERSION_         R10    unchanged     72_ did not change

  A stamp marched to the release to look current destroys the only signal that distinguishes a synced file
  from an unsynced one. Three suites had to be repaired precisely because they had written down the R11
  COINCIDENCE — release, 63_ stamp and 00_config stamp all equal — as though it were the rule.

WHY 90_ HAS A CONTENT HASH AND NOT A BUILD STAMP
-------------------------------------------------------------------------------------------------------
  90_generated_supply_planning_bundle.gs is BUILT, not written. A hand-typed stamp on it is wrong twice:
  someone must remember to edit it in assets/tools/build-apps-script-bundle.js every round, and it can be
  typed to look current without the bytes moving — the single failure the manifest exists to prevent.

  KM_BUNDLE_CONTENT_HASH_ is emitted by the builder and derived from the 60 module contents. It cannot be
  advanced without a real change, and it cannot fail to advance when one happens. It is single-quoted on
  purpose: every manifest reader in this repository matches `var NAME = '...'`, and a double-quoted value
  would make all of them find nothing and PASS VACUOUSLY.

  Its absence is NOT loud, which is why it needs a row at all: 13_ guards on `typeof KMPD.resolveTargetRule`
  and returns null when it is missing, and a null target is a SKIPPED MONTH, not an error.

DEPLOYMENT
-------------------------------------------------------------------------------------------------------
  APPS_SCRIPT_SYNC_REQUIRED   YES   all four together, in this order, as ONE deployment version:
                                      1. 13_procurement_handlers.gs
                                      2. 14_fc_write_handlers.gs
                                      3. 90_generated_supply_planning_bundle.gs
                                      4. 63_api_v1_system_health.gs
  FRONTEND_DEPLOY_REQUIRED    YES   but NOT FIRST, and not in this commit. The F2 commit (cd3fd8f) owns
                                    the browser set; the Apps Script sync must land and be verified
                                    through system.health BEFORE the modal reaches an operator.
  BUNDLE_REBUILD_REQUIRED     YES   done, through the approved builder; --check reports up to date
  DB / Sheets / Drive writes  0
  Rollback                    re-copy the four previous files and publish a new version. No schema
                              changed, no column was added or moved, and no row was written, so a
                              rollback is a file copy and nothing else.

CACHE TOKEN
-------------------------------------------------------------------------------------------------------
  trcontract-r2ba2r5f2-20260919      38 refs      0 stale      0 misplaced      (UNCHANGED)

  NOT rotated by this round, and that is a decision rather than an omission: no browser-shipped file is in
  this commit. Rotating a co-deployment token for a backend-only change would force every client to
  re-download an identical set of assets and would make the token stop meaning what it means.

VERIFICATION
-------------------------------------------------------------------------------------------------------
  fc-target-rule-release-stamp-r2b-a2-r5-f3   53 passed   0 failed   12 mutants   0 survived   NEW
  ai-plan-advice-boundary (E4 stamp gate)     135 passed  0 failed   15 mutants   0 survived   REPAIRED
  product-strategy-activation-p1-b8d          353 passed  0 failed   18 mutants   0 survived
  api-product-pricing-envelope-action-p1-b7e  104 passed  0 failed    8 mutants   0 survived
  deployment-r10-activation-boundary-p1-b7f   103 passed  0 failed    7 mutants   0 survived
  action-registry-and-router-completeness     199 passed  0 failed
  allocation-code-first-schema-compat-b3      213 passed  0 failed   14 caught    0 missed

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · THE §0 DATA-DRIFT GATE WAS NOT PERFORMED. The canonical read of fc_target_rules (zero data rows, no
    legacy blank/All identity) could not be executed from this environment: outbound network calls are
    blocked here, so the endpoint configured in assets/js/api/operation-system-db-api.js is unreachable.
    The zero-row claim remains OPERATOR EVIDENCE and it genuinely gates the live write, because retiring
    `All` and blank-as-wildcard changes which existing rows match.
  · TEMP_migrate_fc_target_rules_header_r2ba2.gs retirement remains FORBIDDEN. It becomes eligible only
    after the live write, the named-column readback and consumer parity against the written row.
  · Everything the R10E-CLOSE entry lists under KNOWN AND NOT FIXED is unchanged. This round measured no
    transport reliability and improves none of it.
```

## INCIDENT-BOOT-FC-R2-F1 — FC SUMMARY MOUNTED TO A WHITE PAGE, AND THE NETWORK TAB LOOKED PERFECT

```
BASE    3f90cd4   release F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R12, already live on both layers
DATE    2026-09-19
SCOPE   FRONTEND ONLY. One line of fc-summary.js, one appended cache token, one new test suite.
        No .gs file. No schema. No action. No DB write. No Apps Script sync.

SYMPTOM
-------------------------------------------------------------------------------------------------------
  Sidebar rendered, FC Summary went active, and the entire main content area stayed white: no title, no
  Loading, no Retry, no error surface, no table shell. Not a loaded-empty model - nothing mounted at all.

IDENTITY WAS NOT THE PROBLEM, AND WAS CHECKED FIRST
-------------------------------------------------------------------------------------------------------
  production /exec   build_id R12 - mixed_deployment false - absent [] - stale []
                     13_, 14_, 63_ at R12; 90_ at content hash 830563ef...
                     00_config still R11, 01_router R9, 72_ R10 (correctly unmoved)
  Pages              all seven shipped files HTTP 200 and byte-identical to their 3f90cd4 git blobs
                     token 38 refs / 0 stale / 0 misplaced; resolver once, deferred, before consumers
                     Home Phase 0 still five blocking scripts

  Both gates PASSED. The deployment was converged; the code was wrong.

ROOT CAUSE — ONE LINE, AND A CENSUS THAT ASKED THE WRONG QUESTION
-------------------------------------------------------------------------------------------------------
  cd3fd8f deleted a dead four-function chain from fc-summary.js. The census that authorised the deletion
  proved getEffectiveFcSafe had zero CALL SITES - it searched for `getEffectiveFcSafe(`. It did not see:

      window.fcDebug = { ..., getEffectiveFc: getEffectiveFcSafe, ... };

  which NAMES the function without calling it. A bare identifier in an object literal is evaluated like
  any other expression, so the line threw ReferenceError at load.

  WHY A WHITE PAGE AND NOT AN ERROR. A classic <script> that throws at top level is ABORTED THERE:
  everything above the throw exists, everything below never comes into being, the browser logs one
  console error and loads the next script as if nothing happened. The throw was at line 1759 of 5065.
  KM.lifecycle.register('fc-summary-section', ...) is at line 5044. The section was therefore never
  registered, switchTo found no controller, and the route went active with no mount to run. The absence
  of any error surface follows from the same fact: the failure happened during script load, long before
  there was a mounted route to report it on.

  Proven by execution, not inferred: the committed bytes were loaded in index.html order into one global
  and the throw, its line, and the empty registration list were observed directly.

THE FIX
-------------------------------------------------------------------------------------------------------
  The dangling key is REMOVED rather than repointed - getEffectiveFcSafe was the head of the dead chain,
  so there is nothing correct left to point it at. fc-summary.js now evaluates to completion and
  registers fc-summary-section.

  NOT DONE, DELIBERATELY: the blank-route-on-evaluation-failure gap is real and is NOT closed by this
  commit. A route whose page script dies still goes active with no error surface. That is a change to the
  shared navigation/lifecycle contract, the incident round conditioned it on a readiness race, and no race
  exists here - the defect is FC-owned and so is the correction. Recorded as the next round.

CACHE TOKEN — ROTATED, AND THE ROTATION IS THE POINT
-------------------------------------------------------------------------------------------------------
  OLD  trcontract-r2ba2r5f2-20260919
  NEW  fcroutemount-bootfcr2f1-20260919      38 refs / 0 stale / 0 misplaced

  Every client that opened FC Summary during the incident holds a cached fc-summary.js that can never
  register its route. Shipping the repair under the SAME token would leave exactly those users broken -
  the one population the fix exists for. The whole application set rotates together, because a token that
  moves for one member and not the others can still ship a half-updated page.

DEPLOYMENT
-------------------------------------------------------------------------------------------------------
  APPS_SCRIPT_SYNC_REQUIRED   NO    no .gs file changed; the backend is correct and stays at R12
  FRONTEND_DEPLOY_REQUIRED    YES   index.html + assets/js/pages/fc-summary.js
  BUNDLE_REBUILD_REQUIRED     NO
  DB / Sheets / Drive writes  0
  Rollback                    revert this commit. It restores the blank route, so rolling back is only
                              correct if the repair itself is shown to cause a worse fault.

VERIFICATION
-------------------------------------------------------------------------------------------------------
  route-mount-registration-boot-fc-r2-f1   26 passed  0 failed  8 mutants  0 survived   NEW
    - loads the real script graph in index.html order into one global, as a browser does
    - every shipped script evaluates to completion
    - every section app.js can switchTo is registered BY EXECUTION, which also covers the page that
      registers through a variable and would defeat any search for a string literal
    - M1 reconstructs this incident byte-for-byte and requires it to be caught

  full sweep  496 suites - 16,441 assertions - 0 failed - 1,111 mutants - 0 survived - 0 probe errors
              canonical FAIL hash f809dca8...76b1 = SEALED - 4 pre-existing non-zero exits only

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · A page script that throws still produces a white route with no error surface. Named above; next round.
  · The controlled Target Rule write (R2B-A2-R5-RELEASE section 9) never happened and is still pending.
  · TEMP migration helper retirement remains forbidden until that write and its readback pass.
```
