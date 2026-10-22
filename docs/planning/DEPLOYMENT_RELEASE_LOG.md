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

## FC-SUMMARY-R2B-A2-R5-F5 — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R13` — THE MODAL DID NOT KNOW THE RULE EXISTED

```
BASE    2c18d71   release R12 plus the FC route-mount repair, both live
DATE    2026-09-19
SCOPE   The Target Rule WRITE path, both halves. Two .gs owners (14_, 63_), the FC Summary page,
        its modal markup and stylesheet, two diagnostic census pins, one new suite and five
        existing suites. No schema, no migration, no resolver, no DB write.

THE DEFECT
-------------------------------------------------------------------------------------------------------
  Two rules existed in production - SERIES/CO1100 (Jan 110, Feb 105, Dec 110) and SKU/CO1100-R (those
  plus October 150). Reopening Add Target Rule and selecting either identity showed twelve months of 100,
  and Apply-to-all showed 100. Saving from that form would have replaced stored values with defaults
  nobody typed.

  THE WRITE PATH WAS NEVER WRONG. It found the row by canonical business key and updated it, exactly as
  R12 designed it to. What was missing is that the FORM never asked whether that row existed: every
  selector in the modal is built from the FC REGULAR FORECAST universe, which is the right authority for
  what may be SELECTED and says nothing whatever about what has already been WRITTEN.

WHAT THE PAGE DOES NOW
-------------------------------------------------------------------------------------------------------
  Completing an identity classifies it against the canonical Target Rule array the page already holds -
  no request is issued to open or re-classify the modal:

    zero matches   NEW               the documented 100 defaults, no id, no version
    one match      EXISTING_UPDATE   the STORED months hydrate by column name; banner names the rule
    two or more    DUPLICATE_REFUSAL Save disabled, both conflicting ids shown, zero writes

  Apply-to-all shows the common value when all twelve agree and BLANK when they differ - it may never
  show 100 for a mixed rule, because that is the reading that invites an operator to flatten eleven real
  values. Clearing it no longer rewrites the months to 100 either: blank DESCRIBES the months, it does
  not instruct anything.

  An unchanged existing rule disables Save and dispatches nothing. A stored 0 hydrates as 0.

THE VERSION TOKEN, AND WHY IT IS NOT updated_at
-------------------------------------------------------------------------------------------------------
  fcWriteTimestamp_ formats yyyy-MM-dd HH:mm:ss - SECOND precision, no milliseconds, in the SCRIPT
  timezone - while the page reads the value back as an ISO-8601 UTC string. Two saves inside one second
  are indistinguishable, and the script lock makes same-second writes MORE likely rather than less: the
  loser resumes the instant the winner releases. A version check that can also fail for a timezone reason
  is worse than none, because it teaches operators to click past it.

  So expected_row_version is a FINGERPRINT OF THE ROW'S OWN VALUES, computed identically on both sides
  and compared under the existing script lock. It needs no clock, no timezone and no precision assumption.
  If another operator wrote IDENTICAL values the token matches and the write proceeds - correctly: the
  hazard is losing somebody's change, and a change that changed nothing cannot be lost.

  SERVER REFUSALS, all with zero writes:
    STALE_TARGET_RULE_VERSION        the row changed after it was loaded
    STALE_TARGET_RULE_VERSION        a NEW-mode body aimed at an identity that already exists -
                                     the defect itself, refused at the server even if the page is stale
    TARGET_RULE_VERSION_REQUIRED     an update carrying no version at all
    DUPLICATE_TARGET_RULE_IDENTITY   unchanged from R12
    TARGET_RULE_IDENTITY_MISMATCH    unchanged from R12

CONFIRMED-RECEIPT RECONCILIATION
-------------------------------------------------------------------------------------------------------
  The success envelope now carries the COMPLETE saved row, read back FROM THE SHEET after the write - not
  echoed from the request, which could only ever show what was asked for. The page merges that row into
  the canonical model by target_rule_id and renders immediately; the full workspace refresh continues
  behind it as reconciliation. A background failure keeps the confirmed row and downgrades only the VIEW.

  This is not an optimistic update: nothing appears until the server has confirmed the write.

  MEASURED, this round, read-only: the FC workspace read is 221.6 KB and ~9.7 s warm / ~25 s cold, of
  which 97% is handler time and 3% delivery. fcTargetRules is 1.2 KB of that payload - 1%. So a Target
  Rule no longer waits on 210 KB of regular forecast to become visible. Modal open and re-classification
  cost ZERO requests.

STAMP MOVEMENT
-------------------------------------------------------------------------------------------------------
  14_  FCW_BUILD_VERSION_        R12 -> R13     the write contract changed
  63_  SYS_DEPLOYMENT_RELEASE_   R12 -> R13     the release
  63_  SYS_BUILD_VERSION_        R12 -> R13     63_ changed (release + 14_'s expectation)

  DELIBERATELY UNMOVED: 13_ stays R12, 90_ keeps its content hash, 00_config R11, 01_router R9, 72_ R10.
  Reading a Target Rule is not writing one. A release that marched them would put unchanged files on the
  sync list and destroy the only signal that says which files a project is actually missing.

  An OLD 14_ beside the new page is the dangerous pairing and it is SILENT: the page sends
  expected_row_version and the old handler IGNORES it, accepting every stale write it was added to refuse
  while returning success. Only a declared build separates those two deployments.

DEPLOYMENT — BACKEND FIRST
-------------------------------------------------------------------------------------------------------
  APPS_SCRIPT_SYNC_REQUIRED   YES   14_fc_write_handlers.gs and 63_api_v1_system_health.gs, together,
                                    as ONE new deployment version, BEFORE the frontend. A new page
                                    against an old handler is the silent-acceptance case above.
  FRONTEND_DEPLOY_REQUIRED    YES   fc-summary.js, fc-summary.html, fc-overview.css, index.html
  BUNDLE_REBUILD_REQUIRED     NO    90_ is untouched
  DB / Sheets / Drive writes  0
  Rollback                    re-copy the previous 14_/63_ and revert the frontend commit. The stored
                              rows are untouched by this round, so a rollback loses no data.

CACHE TOKEN
-------------------------------------------------------------------------------------------------------
  fcroutemount-bootfcr2f1-20260919  ->  tgtrehydrate-r2ba2r5f5-20260919    38 refs / 0 stale / 0 misplaced

  A browser still holding the previous fc-summary.js opens the same modal with twelve default 100s and no
  version, which the new handler refuses outright - so a stale cache would present a form that cannot save
  at all. The whole application set rotates together.

VERIFICATION
-------------------------------------------------------------------------------------------------------
  fc-target-rule-rehydration-r2b-a2-r5-f5   76 passed  0 failed  12 mutants  0 survived   NEW
    - drives the REAL page functions against a DOM shim carrying the modal's own control ids, and the
      REAL write handler against a fake sheet
    - proves the two fingerprint implementations agree on the ACTUAL production rows
  release-stamp F3 57/0 (13) - canonical-scope 115/0 (13) - consumer-parity 132/0 (21)
  schema-repair 106/0 (10) - activation-manifest 512/0 (41) - positive-residual 5137/0 (227)
  production-readback 342/0 (17) - E4 stamp gate 135/0 (15)

  full sweep  497 suites - 16,442 assertions - 0 failed - 1,111 mutants - 0 survived - 0 probe errors
              canonical FAIL hash f809dca8...76b1 = SEALED - 4 pre-existing non-zero exits only

TWO SUITES WERE FOUND PASSING FOR THE WRONG REASON
-------------------------------------------------------------------------------------------------------
  · product-strategy-production-readback-p1-b3 §A2 diffed the WHOLE apps-script directory while its own
    paragraph says it is scoped to two shared files. R12 legitimately added a LockService and a
    single-range setValues to 14_, which fell inside that diff - and the check did not fail, because
    bare() strips block comments and an unclosed /* in the diff text ate the region containing them. It
    passed by being blind, for two releases. Now scoped to the files it names.
  · The R12 release suite asserted that every stamp-bearing owner carries the release. True of R12 by
    coincidence; false of R13, which moves two owners and leaves two alone. Rewritten to derive the
    release from 63_ and the owner set from git, and to assert the RELATIONSHIP instead.

KNOWN AND NOT FIXED
-------------------------------------------------------------------------------------------------------
  · POST-WRITE VISIBILITY of the FULL workspace is still ~9.7 s. This round removes the Target Rule's
    dependence on it; it does not make the read faster. Backlog: R2B-B1 (Regular FC range write) and
    R3 (scoped readback/reconciliation).
  · A route whose page script throws still mounts blank with no error surface (recorded in R2-F1).
  · TEMP migration helper retirement remains forbidden until this repair is deployed and a live write
    is verified against it.
```

## FC-SUMMARY-R2B-A2-R5-F5-F1 — THE MODAL HELD THE RIGHT ROWS IN THE WRONG SHAPE

```
BASE    3249749   release F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R13, live on both layers
DATE    2026-09-19
SCOPE   FRONTEND ONLY. fc-summary.js, one appended cache token, one new suite, three suites repaired.
        No .gs file. No schema. No action. No DB write. No Apps Script sync. Release R13 UNCHANGED.
```

### SYMPTOM

R13 went out backend-first and passed every gate it was given. Then both existing Target Rules —
`SERIES/CO1100` and `SKU/CO1100-R`, the two rows the whole round was built around — opened in the modal
as **New rule**, twelve months of 100, over values that were already stored. The repair shipped in
`3249749` did not work in production, while 76 assertions and twelve killed mutants said it did.

### IDENTITY WAS NOT THE PROBLEM, AND WAS CHECKED FIRST

```
production /exec   build_id R13 · mixed_deployment false · absent [] · stale [] · missing []
                   14_ R13 · 63_ R13 · 13_ R12 · 90_ 830563ef… · 00_ R11 · 01_ R9 · 72_ R10
                   25 required manifest rows present and matching
Pages              commit 3249749, token tgtrehydrate-r2ba2r5f5-20260919, 38 refs / 0 stale / 0 misplaced
the DB             scope_type "SERIES"/"SKU", scope_id "CO1100"/"CO1100-R", company "ResUS",
                   country "US", marketplace "Amazon" — no whitespace, no case drift, no aliases
the payload        fcTargetRules = 2 rows, still 2 after the adapter, still 2 at the classifier's door
```

Both gates PASSED and the data was correct. The deployment was converged; the client was wrong.

### ROOT CAUSE — THREE ROW SHAPES, AND CODE WRITTEN AGAINST THE WRONG ONE

A Target Rule exists in the page in three representations:

```
canonical    { target_rule_id, scope_type, scope_id, jan_pct … dec_pct }   sheet · server · receipt
  ↓ normalizeFcTargetRuleRecord                     operation-system-db-api.js:810
normalized   { ruleId, scopeType, scopeId, targetPercentage, raw }         the read model
  ↓ _getDbTargetRules                               fc-summary.js
display      { id, scope, year, …, percentages }                           the table
```

Every function F5 added reads **canonical** field names. `_trExistingRules_` handed them **display**
rows. On a display row `scope_type` and `scope_id` are `undefined`, so both production rules keyed to
the same blank-scope string and matched nothing:

```
key the modal builds          "2026|RESUS|US|AMAZON|SERIES|CO1100"
key from the row it IS given  "2026|RESUS|US|AMAZON||"        <- both rows, every scope type
key from the canonical row    "2026|RESUS|US|AMAZON|SERIES|CO1100"
```

Zero matches → NEW → `_trResetToNew_()` → twelve 100s.

Two further breaks followed from the same cause. `_trHydrateFrom_` reads `row[m + '_pct']`, absent on a
display row, so even a correct match would have hydrated twelve blanks. And `_trMergeReceipt_` matched
the canonical `target_rule_id` against normalized records keyed on `ruleId` — never equal, so every
confirmed save **appended**: two rows became three, the operator's change appeared not to have applied,
and a fourth shape (a canonical row with no `.raw`) rendered in the table with an empty id and twelve
100s. No such row exists in production only because no Save was pressed.

The R13 backend was not implicated and in fact held the line: a fingerprint computed from a display row
differs from the stored one, so a Save from that state would have been refused `STALE_TARGET_RULE_VERSION`
rather than overwriting. The stale-write gate defended against its own client.

### WHY 76 PASSING ASSERTIONS DID NOT SEE IT

The F5 suite stubbed the function that was broken:

```js
'function _trExistingRules_() { return __RULES__; }'      // line 195, canonical-shaped fixtures
```

Replacing the boundary under test with a working one leaves nothing that can fail for the reason the
product does. This is the same error as the `getEffectiveFcSafe` census in R2-F1 one round earlier:
verify the unit, assume the seam. Two rounds, two seams, one habit.

### THE FIX

`_trExistingRules_` returns the read model's own **canonical** rows (`.raw`), so `_trKeyOf_`,
`_trHydrateFrom_` and `_trFingerprint_` all read the shape they were written for. The key builder is
NOT taught to guess across shapes — one that can read three shapes can no longer say two rules differ.

It now answers three distinct states, and the difference between the last two is the data-safety point:

```
null                 Demo: matching not applicable (mock rows carry `percentages`, not jan_pct)
_TR_UNAVAILABLE_     the canonical rows could not be read — NOT zero rows
array (may be empty) the rows; empty is a real answer and NEW is correct
```

A row whose `.raw` is missing fails the whole read rather than being skipped, because a silently dropped
row is how an existing rule becomes a new one. `DATA_UNAVAILABLE` disables Save, carries its own typed
refusal, and blanks the months — it does not show the documented 100 defaults, because those are an
answer and this state has none.

`_trMergeReceipt_` normalizes the receipt through the existing authority — borrowed, not reimplemented,
since a second normalizer would be a second definition of what a Target Rule is — matches on the model's
own `ruleId`, replaces in place, appends only a genuinely new id, and refuses a blank one.

### THE TEST THAT COULD HAVE CAUGHT IT

`fc-target-rule-canonical-row-shape-seam-r2b-a2-r5-f5-f1.test.js` stubs nothing between the server
payload and the classifier. It runs the real `KM.DB.adaptFcSummaryWorkspace`, the real
`normalizeFcTargetRuleRecord`, the real `_fcGetTargetRules` / `_getDbTargetRules` / `_trExistingRules_`,
and the real classifier, hydration, gate and merge — over the two actual production rows.

The F5 suite's stub is gone, and three of its assertions that encoded the read model as canonical rows
were re-pointed at the normalized model rather than deleted: they were right about the behaviour and
wrong about the shape.

One mutant is worth naming. `M8` first refused to die, because the blank-id refusal is guarded twice —
once on the canonical id at entry, once on the normalized id after normalization — so mutating either
alone changes nothing. Rather than drop the mutant or pretend it bit, the mutation now removes both, and
a separate assertion records that each guard holds the line on its own.

### VERIFICATION

```
new suite      fc-target-rule-canonical-row-shape-seam-r2b-a2-r5-f5-f1   107/0  12 mutants  0 survived
de-stubbed     fc-target-rule-rehydration-r2b-a2-r5-f5                    78/0  12 mutants  0 survived
route mount    route-mount-registration-boot-fc-r2-f1                     26/0   8 mutants  0 survived
canonical scope fc-target-rule-canonical-scope-r2b-a2-r5                 115/0  13 mutants  0 survived
consumer parity fc-target-rule-consumer-parity-r2b-a2-r5-f2              132/0  21 mutants  0 survived
release stamp  fc-target-rule-release-stamp-r2b-a2-r5-f3                  57/0  13 mutants  0 survived
schema repair  fc-target-rules-schema-repair-r2b-a2                      106/0  10 mutants  0 survived

FULL SWEEP     498 suites - 16,442 assertions - 0 failed - 1,111 mutants - 0 survived - 0 probe errors
               canonical FAIL hash f809dca8...76b1 = SEALED, 13 lines, unchanged
               4 pre-existing non-zero exits, the same four as the baseline
               three-axis drift vs the 3249749 tree: 0, and one suite added

cache token    trseamrepair-r2ba2r5f5f1-20260919   38 refs / 0 stale / 0 misplaced
```

A FIFTH non-zero exit appeared on the first post-repair sweep and was fixed rather than accepted:
`demo-mode-retired-f1-small` D8 forbids any test file from naming the retired `KM.DemoData` runtime,
and both of my suites named it to drive the Demo contract. The repair is not a dynamically spelled
name that slips past the check — it drives `_fcUseDb()`, the page's own surviving live-or-demo switch
and the only thing `_trExistingRules_` consults.

### DEPLOYMENT

```
GS_FILES_CHANGED                NONE
APPS_SCRIPT_SYNC_REQUIRED       NO
APPS_SCRIPT_NEW_VERSION_REQUIRED NO
PRODUCTION_BACKEND_RELEASE      F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R13, UNCHANGED
DB_SCHEMA_CHANGE                NONE
DB_WRITES                       0
FRONTEND_DEPLOY_REQUIRED        YES
GIT_PUSH_REQUIRED               YES - USER-owned, after review
```

---

## S8-R4B-1 — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R41` — THE FACTORY GUARD READ STOPS TRAVELLING ON A WRITE VERB

```
BASE    ff8246e   S7-R4's last commit; R40 ends there
BRANCH  feature/product-strategy-board-p0   main = origin/main = 26e5f10
DATE    2026-10-04
SCOPE   TRANSPORT RECLASSIFICATION. factoryStockGuard.get moves from the POST write chain onto the
        canonical GET read table. No handler changed, no action was added or removed, no payload or
        response shape changed, no schema, no stored row. Two runtime files and one frontend file.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R41
PURPOSE                      Factory Guard read-transport correction
SUPERSEDES                   nothing. R40 is CUT and remains valid; R41 follows it.
STATUS                       PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carries it,
                             no Web App version exists, and Production is NOT R41.

WHY A NEW RELEASE AND NOT A RIDE-ALONG ON R40
-------------------------------------------------------------------------------------------------------
  The repair first stamped 01_router.gs with R40, which is coherent only if a stamp means "the newest id
  in the tree". It does not. R40 was already CUT, against a tree in which 01_ did NOT change - its owner
  set is 63_ alone, and the ledger deliberately carries 01_ at R39 there, with a written reason: that the
  router had not moved in fourteen releases and then moved exactly once. Stamping it R40 made one id name
  two different trees, and three independent gates said so:

    E4   (ai-plan)       63_ carries a stamp older than its own last change
    C2/C2.1/C3 (ledger)  01_ is not an owner of R40, so it may not expect R40
    H2   (deploy surf.)  R40 changed exactly one runtime file; the tree now shows two

  None of the three was wrong. A runtime change that arrives after a cut needs a new cut.

WHAT CHANGED
-------------------------------------------------------------------------------------------------------
  01_router.gs     rtrGetReadHandlers_ gains 'factoryStockGuard.get'. The POST branch is KEPT: every
                   GET-routed read in this router is reachable from BOTH tables, verified across five
                   sampled actions, so removing it would be the exception rather than the cleanup.
  63_api_v1_system_health.gs
                   the release, its own build stamp, and 01_'s expected stamp - the row it carries.

  Frontend (published separately, by the user):
  assets/js/api/operation-system-db-api.js
                   KM.DB.factoryStockGuardGet stops calling the write dispatcher _kmWeeklyCommand_ and
                   calls _kmGapRead_; 'factoryStockGuard.get' joins _KM_GET_READ_ACTIONS_. The request
                   stays FLAT - { action, shipping_plan_id, requestId } - because the handler reads
                   shipping_plan_id at the top level and a payload wrapper would bury it.

THE DEFECT THIS REPAIRS
-------------------------------------------------------------------------------------------------------
  A POST to /exec cannot survive the 302 to script.googleusercontent.com/macros/echo: the redirect drops
  the body. factoryStockGuard.get was the last approved READ in the system still travelling that way, so
  it inherited the write path's 90s bound, a write request id, and the "may have been committed" error
  vocabulary - for a read that cannot commit anything. Measured 2 failures in 9 cold-open attempts.

STAMP MOVEMENT - OLD -> NEW
-------------------------------------------------------------------------------------------------------
  63_  SYS_DEPLOYMENT_RELEASE_    R40    -> R41        the RELEASE
  63_  SYS_BUILD_VERSION_         R40    -> R41        63_ own module stamp (63_ changed)
  01_  RTR_BUILD_VERSION_         R39    -> R41        the routing table changed; R40 is skipped, not joined
  71_  FSG_BUILD_VERSION_         R5-R1  -> R5-R1      UNCHANGED. The handler did not change, only the
                                                       verb that reaches it. 71_ is NOT an R41 owner.
  90_  KM_BUNDLE_CONTENT_HASH_    unchanged            no assets/js/core module moved; no rebuild

RELEASE OWNERS
-------------------------------------------------------------------------------------------------------
  01_router.gs                   runtime owner    (re-enters ownership after ONE release carried at R39)
  63_api_v1_system_health.gs     manifest owner

ACTION CONTRACT
-------------------------------------------------------------------------------------------------------
  SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 18, UNCHANGED, and the browser's pin stays 18.
  The rule is "bump whenever a router ACTION is added or removed". factoryStockGuard.get already existed
  on the POST chain and still does. A ROUTE was added for an action that was already in the vocabulary.
  SYS_REQUIRED_ACTION_LIST_VERSION_ stays 14: no page gained a mount dependency.

DEPLOY ORDER - FROZEN, NOT YET EXECUTED
-------------------------------------------------------------------------------------------------------
  1  Apps Script backend sync: 01_router.gs, 63_api_v1_system_health.gs
  2  save all required backend files
  3  create ONE new deployment version on the existing Production Web App
  4  verify system.health reports R41 coherent (deployment_build == R41, mixed_deployment == false,
     stale_modules == [], absent_modules == [], missing_actions == [], contract version == 18)
  5  publish frontend/main
  6  targeted n=20 Factory Guard read regression (read-only, 7 approved tables)
  7  Weekly Shipping Plan UI read-only smoke

  THE ORDER IS LOAD-BEARING. The frontend must not send factoryStockGuard.get as a GET before the
  deployed router recognises it as one; a published frontend against an R40 backend answers the Weekly
  Shipping Plan guard indicator with POST_ONLY_ACTION_ON_GET on every read.

KNOWN LEDGER GAP, NOT INTRODUCED HERE
-------------------------------------------------------------------------------------------------------
  R39 and R40 were cut without an entry in this log. They are not backfilled here, because this round has
  no evidence about what those rounds intended beyond their stamps. Separately,
  PHASE1_CUMULATIVE_RELEASE_RECONCILIATION_R1.md pins CURRENT_HEAD_BACKEND_RELEASE = R40 and its
  BACKEND_HEALTH_GATE expects R40. That document is pinned at PRE_SHA b783076 and is a HISTORICAL
  artifact - at that commit HEAD really was R40 - so it is left as written. Anyone executing that runbook
  after R41 must re-derive gate 1 from 63_ rather than from the number printed there.
```

```
GS_FILES_CHANGED                 01_router.gs, 63_api_v1_system_health.gs
APPS_SCRIPT_SYNC_REQUIRED        YES - 01_router.gs, 63_api_v1_system_health.gs
APPS_SCRIPT_NEW_VERSION_REQUIRED YES
BUNDLE_REBUILD_REQUIRED          NO - no assets/js/core module changed
PRODUCTION_BACKEND_RELEASE       NOT R41. Production is unverified at R14 per the last live probe.
DB_SCHEMA_CHANGE                 NONE
DB_WRITES                        0
DB_DELETES                       0
FRONTEND_DEPLOY_REQUIRED         YES - assets/js/api/operation-system-db-api.js
APPS_SCRIPT_DEPLOYMENT_PERFORMED NO
FRONTEND_PUBLICATION_PERFORMED   NO
GIT_PUSH_REQUIRED                YES - USER-owned, after review
```

**STATUS: NOT DEPLOYED · NOT SYNCED.**

---

## S8-R4B-2D — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R42` — THE SITE INVENTORY EXPOSURE READ STOPS SERVING EVERY SITE

```
BASE    8856aeb   S8-R4B-1A's release commit; R41 ends there
BRANCH  feature/product-strategy-board-p0   main = origin/main = 8856aeb
DATE    2026-10-04
SCOPE   READ PROJECTION. The Inventory Replenishment workspace read gains an optional siteScope on its
        EXPOSURE-only request contract. No action added or removed, no route moved, no handler for any
        write touched, no schema, no stored row, zero DB writes. One runtime file plus the manifest.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R42
PURPOSE                      Site Inventory exposure Site-scope correctness
SUPERSEDES                   nothing. R41 is CUT and remains valid; R42 follows it.
STATUS                       PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carries it,
                             no Web App version exists, and Production is NOT R42.

WHY A NEW RELEASE AND NOT A RIDE-ALONG ON R41
-------------------------------------------------------------------------------------------------------
  The same rule R41 was itself cut for. R41 is already CUT, against a tree in which 60_ had not changed -
  its owner set is 01_ + 63_ - so absorbing a 60_ change into it would make one id name two trees. 01_
  LEAVES ownership here and keeps the R41 it earned one release ago: R42 moves no route.

WHY IT IS A BACKEND ROUND AT ALL, HAVING BEEN RULED A FRONTEND ONE
-------------------------------------------------------------------------------------------------------
  S8-R4B-2A concluded BACKEND_RELEASE_REQUIRED = NO, and that was TRUE of what it was asked. Lazy-once
  needed only the `only` contract, which had shipped. The OPERATOR then required that the second layer
  return only the ACTIVE site's exposure truth, and S8-R4B-2C proved what the shipped request actually
  was: a per-Site CACHE KEY in front of an all-Site QUERY. The handler reads payload.only, payload.include
  and payload.recentWindow and nothing else; sirWsRowsToObjects_ is getDataRange().getValues(); and the
  frontend DTO builder whitelists three fields. The finding did not become wrong - its premise was
  replaced - and no arrangement of frontend bytes can scope a query the server has no parameter for.

WHAT CHANGED
-------------------------------------------------------------------------------------------------------
  60_api_v1_inventory_replenishment_workspace.gs
                   SIR_EXPOSURE_TABLES_ / SIR_SITE_SCOPE_FIELDS_; sirWsSiteScope_ (normalise + refuse),
                   sirWsScopeApplicable_ (exposure family only), sirWsSiteScopeClosure_ (the lineage
                   reachability closure); the projection inside sirWorkspaceBuild_; the orchestrator's
                   pre-open refusal; meta.siteScopeRequested / meta.siteScopeApplied.
  63_api_v1_system_health.gs
                   the release, its own build stamp, and 60_'s expected stamp - the row it carries.

  Frontend (published separately, by the user):
  assets/js/api/km-api-foundation.js        buildInventoryReplenishmentRequestDTO whitelists siteScope.
  assets/js/pages/inventory-replenishment.js
                   _irExposureSite_ resolves the triple from the FIRST-layer marketplaces master; the
                   exposure request carries it; a site the master cannot name issues NO request.

THE CLOSURE, AND WHY IT IS NOT SIX ROW FILTERS
-------------------------------------------------------------------------------------------------------
  Filtering all six tables on company/country/marketplace is wrong in two ways that both LOSE QUANTITY
  SILENTLY, which is the failure mode this page has already paid for once:

    1  shipments.marketplace is MULTI on a merged shipment BY CONSTRUCTION. Its lines reach their real
       sites through frozen shipping_plan_line lineage - the machinery exists for nothing else - so a
       header filter deletes exactly the shipments it was built to attribute.
    2  shipping_plan_lines.marketplace is the LINE's real marketplace. The shipped client deliberately
       attributes a line to its PARENT PLAN's triple instead. Scoping on the line's own column would be a
       SECOND business interpretation of shipment ownership.

  So the server reproduces the shipped rule rather than reinventing it:
    P  = shipping_plans      whose own triple is this site AND is a SPECIFIC receiver
    PL = shipping_plan_lines whose shipping_plan_id is in P
    SL = shipment_lines      lineage in PL, OR lineage BLANK and the parent header is this site
    S  = shipments           named by SL (this is what retains a MULTI header), plus in-scope headers
    D  = shipping_allocation_drafts / DL = their lines, by the client's own draft scope rule
  A PRESENT-but-unresolvable lineage FAILS CLOSED and never falls back to the header.

SCOPE IDENTITY - THE TRIPLE, NOT THE ID
-------------------------------------------------------------------------------------------------------
  None of the six exposure tables stores marketplace_id. Scoping on it would force this handler to open
  the marketplaces master to translate it - a SEVENTH sheet read, at the 0.8-1.3 s per-sheet floor R4B-2
  measured - to learn a triple the browser already holds. The browser's CACHE KEY keeps marketplace_id.
  A map key and a request identity are allowed to differ, and conflating them buys that read for nothing.

FAIL CLOSED
-------------------------------------------------------------------------------------------------------
  An incomplete or malformed siteScope is REFUSED by name - INVENTORY_REPLENISHMENT_SITE_SCOPE_INCOMPLETE
  - before the spreadsheet is opened, costing zero sheet reads. It is NEVER widened to all-Site. The
  frontend DTO FORWARDS a blank field rather than dropping it, because dropping it would turn a caller's
  bug into an all-Site read indistinguishable from a correct one. The refusal exists in BOTH the
  orchestrator and the pure builder: no single mutation removes it.

WHAT THIS IS NOT
-------------------------------------------------------------------------------------------------------
  IT IS NOT A LATENCY FIX AND MUST NOT BE APPROVED AS ONE. readTable reads every row before a predicate
  can run, and the closure needs four of the six tables in memory anyway. The six sheets hold 58 rows in
  total across every site. ROW_SCOPE_CAN_AVOID_WHOLE_SHEET_READ = NO, EXPECTED_LATENCY_BENEFIT = LOW.
  The purposes are a correct Site data boundary, a smaller scoped payload, and a per-Site cache whose
  contents are finally true. R4C measures the payload and the time.

STAMP MOVEMENT - OLD -> NEW
-------------------------------------------------------------------------------------------------------
  63_  SYS_DEPLOYMENT_RELEASE_    R41     -> R42       the RELEASE
  63_  SYS_BUILD_VERSION_         R41     -> R42       63_ own module stamp (63_ changed)
  60_  SIR_BUILD_VERSION_         R6-R5   -> R42       the request contract changed
  01_  RTR_BUILD_VERSION_         R41     -> R41       UNCHANGED. No action added or removed, no route
                                                       moved. 01_ is NOT an R42 owner.
  90_  KM_BUNDLE_CONTENT_HASH_    unchanged            no assets/js/core module moved; no rebuild

RELEASE OWNERS
-------------------------------------------------------------------------------------------------------
  60_api_v1_inventory_replenishment_workspace.gs   runtime owner  (first ownership since R6-R5)
  63_api_v1_system_health.gs                       manifest owner

ACTION CONTRACT
-------------------------------------------------------------------------------------------------------
  SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 18, UNCHANGED, and the browser's pin stays 18.
  The rule is "bump whenever a router ACTION is added or removed". None was. siteScope is an OPTIONAL
  field on the payload of inventoryReplenishment.workspace.get, which already exists and is unchanged.
  Bumping for an optional payload field would make the number mean something it has never meant.
  SYS_REQUIRED_ACTION_LIST_VERSION_ stays 14: no page gained a mount dependency.

DEPLOY ORDER - FROZEN, NOT YET EXECUTED
-------------------------------------------------------------------------------------------------------
  0  rotate the application + IR CSS cache-token families on the FINAL runtime bytes  (S8-R4C-P1)
  1  Apps Script backend sync: 60_api_v1_inventory_replenishment_workspace.gs,
     63_api_v1_system_health.gs
  2  save all required backend files
  3  create ONE new deployment version on the existing Production Web App
  4  verify system.health reports R42 coherent (deployment_build == R42, mixed_deployment == false,
     stale_modules == [], absent_modules == [], missing_actions == [], contract version == 18,
     workspace_module_build == R42)
  5  publish frontend/main
  6  Production R4C acceptance: Site A / Site B first exposure = 1 request each, return = 0, unvisited
     Site C = 0 rows leaked, per-site payload bytes recorded separately

  THE ORDER IS LOAD-BEARING IN ONE DIRECTION ONLY, AND IT IS NOT THE OBVIOUS ONE. A published frontend
  against a pre-R42 backend sends siteScope to a handler that IGNORES it and returns every site - which
  is exactly today's behaviour, and the CLIENT-SIDE scope filtering is deliberately retained as the
  second boundary, so the screen stays correct. The backend goes first anyway, because "correct but
  silently unscoped" is the state this release exists to end, and nothing should be able to report it as
  finished while it persists.

KNOWN LEDGER GAP, NOT INTRODUCED HERE
-------------------------------------------------------------------------------------------------------
  R14..R40 remain unlogged, frozen as a census by K1a. They are not backfilled here: this round has no
  evidence about what those rounds intended beyond their stamps, and inventing the record is worse than
  admitting the gap.
```

```
GS_FILES_CHANGED                 60_api_v1_inventory_replenishment_workspace.gs,
                                 63_api_v1_system_health.gs
APPS_SCRIPT_SYNC_REQUIRED        YES - 60_api_v1_inventory_replenishment_workspace.gs,
                                 63_api_v1_system_health.gs
APPS_SCRIPT_NEW_VERSION_REQUIRED YES
BUNDLE_REBUILD_REQUIRED          NO - no assets/js/core module changed
PRODUCTION_BACKEND_RELEASE       NOT R42. Production is R41-unsynced; the live probe last read R14.
DB_SCHEMA_CHANGE                 NONE
DB_WRITES                        0
DB_DELETES                       0
DB_READS                         6 - shipments, shipment_lines, shipping_plans, shipping_plan_lines,
                                 shipping_allocation_drafts, shipping_allocation_draft_lines
FRONTEND_DEPLOY_REQUIRED         YES - assets/js/api/km-api-foundation.js,
                                 assets/js/pages/inventory-replenishment.js
CACHE_TOKEN_ROTATION_REQUIRED    YES - DEFERRED to S8-R4C-P1, on the FINAL bytes
APPS_SCRIPT_DEPLOYMENT_PERFORMED NO
FRONTEND_PUBLICATION_PERFORMED   NO
GIT_PUSH_REQUIRED                YES - USER-owned, after review
```

**STATUS: NOT DEPLOYED · NOT SYNCED.**

---

## S8-R4D-E2 — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R44` — THE FIRST-LAYER READ LEAVES SpreadsheetApp

```
BASE    998cf9a   S8-R4D-E's preflight publication; R43 is CUT, DEPLOYED and ACCEPTED
BRANCH  feature/product-strategy-board-p0
DATE    2026-10-06
SCOPE   READ TRANSPORT ONLY. The thirteen first-layer tables move from thirteen SpreadsheetApp
        full-sheet reads to one Sheets.Spreadsheets.get plus one Values.batchGet. No action added or
        removed, no route moved, no request field, no response field, no business rule, no schema,
        no stored row, zero DB writes. Two runtime files.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R44
PURPOSE                      Site Inventory first-layer read transport (B1)
SUPERSEDES                   nothing. R43 is CUT, DEPLOYED and ACCEPTED; R44 follows it.
OWNERS                       60_api_v1_inventory_replenishment_workspace.gs  (SIR_BUILD_VERSION_)
                             63_api_v1_system_health.gs                      (SYS_BUILD_VERSION_)
CARRIED                      01_router.gs stays at R41. No action, no route and no request field moved,
                             and SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ stays 18.
EDITOR-APPLIED               appsscript.json already carries Sheets v4 from the S8-R4D-D2 benchmark
                             transition. It is applied through the Apps Script editor's Services UI,
                             NEVER pasted, and is not in the copy list.

STATUS AT CUT                PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carries R44,
                             no Web App version exists for it, and Production is NOT R44.
```

### The measurement this release exists for

```
Production, 5 alternating pairs, S8-R4D-D2, read-only benchmark:
  13 x SpreadsheetApp getDataRange().getValues()   22,006 ms median   (1,693 ms per table)
  1 x Spreadsheets.get + 1 x Values.batchGet        2,265 ms median
  saving 19,830 ms / 90.1% · B1 won 5 of 5 · sign test p = 0.031 · zero semantic diffs
```

**The 90.1% is a transport-layer figure and is not an end-to-end forecast.** The benchmark's CONTROL arm
(22,006 ms, editor, thirteen reads only) is 4,477 ms SLOWER than R43's whole Web App handler (17,529 ms,
reads plus view model plus envelope). Different execution paths, different days — both real, not
comparable. The page-level number is unknown until it is measured the way R43's was, against a same-day
baseline through the Web App. That is S8-R4D-E3, and it is the acceptance this release must still pass.

### What is new in kind, not only in speed

R44 is the **first release whose primary read depends on an advanced service**. Every earlier release could
be deployed partially and would run slowly or answer wrongly; a project missing Sheets v4 cannot serve this
read at all. Two consequences are built in rather than documented:

- `system.health.runtime_authority.advanced_services` attests the service **by execution** (`typeof Sheets`),
  not by reading a manifest that may not be the one deployed. A project that lost the service reports
  `MIXED_OR_PARTIAL_SYNC` instead of failing at the first user read. It costs zero API calls.
- A **bounded transient fallback** to the R43 reader covers 429, 5xx and an unresolved namespace — once per
  logical read, never for a 403 or a schema fault, and always reported in `meta.fallbackUsed`. An
  unreported fallback is indistinguishable from the feature working.

### The part the benchmark could not prove

Under `UNFORMATTED_VALUE` + `SERIAL_NUMBER` a date and a number are the same wire value. The benchmark
scored zero date diffs because it asked the OLD reader which columns were Dates — an oracle the product does
not have. R44 therefore carries an **explicit declared date map** (`SIR_B1_DATE_MAP_`, 46 columns across the
thirteen) and a drift detector outside the read path. Three live columns show why no heuristic was
acceptable: `fc_special_events.event_month` is the number 11 in a column named `_month`,
`amazon_weekly_sales_snapshot.snapshot_week` is a string range, and three `overseas_inventory_snapshot`
date columns are 100% blank.

### Apps Script sync set

```
COPY (paste into the Production Apps Script project, in this order):
  60_api_v1_inventory_replenishment_workspace.gs
  63_api_v1_system_health.gs

EDITOR-APPLIED (already present from S8-R4D-D2 — verify, do not paste):
  appsscript.json   Sheets v4, identifier `Sheets`, alongside BigQuery v2

DELETE (confirm absent — S8-R4D-D2 TEMP diagnostics):
  TEMP_S8_R4D_D2_SHEETS_AVAILABILITY_PROBE.gs
  TEMP_S8_R4D_B1_ADVANCED_SHEETS_BENCHMARK.gs

THEN create a NEW VERSION on the EXISTING Production Web App. Do not create a second Web App.
VERIFY system.health: deployment_build = R44, mixed_deployment = false,
       runtime_authority.advanced_services.advanced_sheets_runtime_mode = RESOLVED
```
## S8-R4D-C — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R43` — THE FIRST-LAYER READ STOPS FETCHING EACH HEADER TWICE

```
BASE    f6b4164   S8-R4C-P1's publication commit; R42 is CUT, DEPLOYED and ACCEPTED there
BRANCH  feature/product-strategy-board-p0   main = origin/main = f6b4164
DATE    2026-10-05
SCOPE   READ-PATH COST ONLY. 60_'s own io.readTable stops fetching each table's header row separately.
        No action added or removed, no route moved, no request field, no response field, no business
        rule, no schema, no stored row, zero DB writes. One runtime file plus the manifest.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R43
PURPOSE                      Site Inventory first-layer service-call reduction (B3)
SUPERSEDES                   nothing. R42 is CUT and DEPLOYED and remains valid; R43 follows it.
STATUS AT CUT                PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carried it,
                             no Web App version existed, and Production was NOT R43.
                             (Superseded by the STATUS line at the foot of this entry, which records
                             the operator deployment and the live probe that confirmed it. This line
                             is kept as what was true AT THE CUT, not rewritten to match today.)

PRODUCTION TODAY             R42, verified live by system.health during the S8-R4C acceptance
                             (deployment_build = R42, mixed_deployment = false). The R42 entry above
                             still reads NOT DEPLOYED because entries record INTENT at cut time and are
                             not rewritten; only a live probe states what Production runs.

WHAT CHANGED, AND WHY IT IS NOT VISIBLE FROM THE BROWSER
-------------------------------------------------------------------------------------------------------
  io.readTable asked prodRequireSheet_ to validate the header, which reads row 1. For the four tables
  carrying requiredCols it then asked prodRequireColumns_, which reads row 1 again. Only then did
  sirWsRowsToObjects_ call getDataRange().getValues() - whose row 0 IS that header, already fetched,
  twice. Thirteen tables cost THIRTY range reads.

    13 prodRequireSheet_ header reads + 4 prodRequireColumns_ header reads + 13 full-sheet reads = 30
    ->  13 full-sheet reads

  The header now comes from the one full-sheet read and is handed to the SAME validators.
  classifySchemaMismatch has always taken a header ARRAY and never touched a Sheet; the requiredCols
  check is the identical set comparison. What is removed is the fetching, not the checking.

WHY A NEW RELEASE AND NOT A RIDE-ALONG ON R42
-------------------------------------------------------------------------------------------------------
  R42 is not merely cut - it is DEPLOYED and ACCEPTED in Production. Folding R43's bytes into it would
  leave the live system reporting one id for two different trees, and the whole purpose of R43 is to let
  the acceptance that follows say which of them it measured. 01_ did not change and keeps R41.

WHAT IS DELIBERATELY NOT IN THIS RELEASE
-------------------------------------------------------------------------------------------------------
  The R4D-A daily-sales column projection (A+C) is NOT applied: B3 must measure the causal effect of
  reducing service-call count ALONE, and a payload change in the same release would make the result
  unattributable. Advanced Sheets Service / batchGet (B1) is NOT enabled - no manifest change, no OAuth
  scope change. If the call count falls 30 -> 13 and server time does NOT move, the round-trip
  hypothesis is weakened and B1 must not proceed on the strength of it.

STAMPS
-------------------------------------------------------------------------------------------------------
  63_  SYS_DEPLOYMENT_RELEASE_    R42     -> R43       the RELEASE
  63_  SYS_BUILD_VERSION_         R42     -> R43       63_ own module stamp (63_ changed)
  60_  SIR_BUILD_VERSION_         R42     -> R43       the read path changed
  01_  RTR_BUILD_VERSION_         R41        R41       UNCHANGED - no action, no route, no request field
                                                       moved. 01_ is NOT an R43 owner.

RELEASE_OWNER_SET                60_api_v1_inventory_replenishment_workspace.gs,
                                 63_api_v1_system_health.gs
ACTION_CONTRACT_VERSION          18 - unchanged. No action added or removed.
REQUIRED_ACTION_LIST_VERSION     14 - unchanged. No page gained a mount dependency.
APPS_SCRIPT_SYNC_REQUIRED        YES - 60_api_v1_inventory_replenishment_workspace.gs,
                                 63_api_v1_system_health.gs
APPS_SCRIPT_NEW_VERSION_REQUIRED YES
APPSSCRIPT_MANIFEST_CHANGE       NO - no advanced service, no OAuth scope change
BUNDLE_REBUILD_REQUIRED          NO - no assets/js/core module changed
DB_SCHEMA_CHANGE                 NONE
DB_WRITES                        0
DB_DELETES                       0
DB_READS                         13 - the unchanged first-layer set
FRONTEND_DEPLOY_REQUIRED         NO - no browser-served byte changed
CACHE_TOKEN_ROTATION_REQUIRED    NO - no frontend file changed
APPS_SCRIPT_DEPLOYMENT_PERFORMED YES - S8-R4D-C2, operator-owned: 60_ and 63_ saved, NEW VERSION
                                 on the EXISTING Production Web App
FRONTEND_PUBLICATION_PERFORMED   NO
GIT_PUSH_REQUIRED                YES - USER-owned, after review
```

**STATUS: DEPLOYED AND ACCEPTED.** Live `system.health` reports build_id = deployment_release = R43, workspace_module = R43, system_health = R43, router = R41, mixed_deployment = false. Accepted by S8-R4D-C2: median server time 17,529 ms against an R42 combined median of 20,944 ms (-16.3%, exact Mann-Whitney p = 0.0101), PRODUCTION_SEMANTIC_DIFF_COUNT = 0. Frontend unchanged, so no publication and no token rotation. `main` remains at f6b4164.

---

## S8-R4D-E4-B — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R45` — THE DATE CONVERSION STOPS CROSSING THE BRIDGE

```
BASE    abbaa92   S8-R4D-G0; R44 is CUT and DEPLOYED, and its acceptance FAILED on performance
BRANCH  feature/product-strategy-board-p0
DATE    2026-10-07
SCOPE   DATE NORMALIZATION COST ONLY. The declared date columns stop being converted with two
        Utilities.* calls per cell. No action added or removed, no route moved, no request field, no
        response field, no business rule, no schema, no stored row, zero DB writes. Row SELECTION is
        untouched. Two runtime files, plus one diagnostic whose build pin tracks the release.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R45
PURPOSE                      Site Inventory first-layer date normalization cost (the R44 acceptance defect)
SUPERSEDES                   nothing. R44 is CUT and DEPLOYED but NOT ACCEPTED; R45 repairs it and must
                             keep its own identity, so the Production evidence that failed and the
                             Production evidence that passes are never the same release id.
OWNERS                       60_api_v1_inventory_replenishment_workspace.gs  (SIR_BUILD_VERSION_)
                             63_api_v1_system_health.gs                      (SYS_BUILD_VERSION_)
CARRIED                      01_router.gs stays at R41. No action, no route and no request field moved;
                             SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ stays 18, required-action list 14,
                             transport contract 1.
PIN FOLLOWED                 TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs - R6R7_ACTIVATION_BUILD_ and
                             TEMP_E3_CENSUS_BUILD_ move with the release. A diagnostic that expects an
                             older build refuses a healthy deployment, which is why it is not optional.
EDITOR-APPLIED               none. appsscript.json is unchanged - no advanced service, no OAuth scope.

STATUS AT CUT                PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carries R45,
                             no Web App version exists for it, and Production is NOT R45.
```

### The measurement this release exists for

```
S8-R4D-E3D, ONE Production one-shot through the shipped URL builder, R44 deployed:
  wall_ms             92,697
  serverDurationMs    83,465
    routerToHandlerMs          1
    batchMetadataMs          426
    batchValuesMs          3,110     <- the Sheets read R44 was cut for. It worked.
    normalizationMs       74,621     <- 89% of server time, inside 60_
```

> **S8-R4D-E5 CLASSIFICATION (2026-10-07).** This sample — and the matching R45 acceptance one-shot — was
> taken with a **flat** `{ recentWindow, only }` body through `KM.transport.readUrl`, which serialises the
> body it is handed and builds no envelope. `60_` reads `body.payload`, so both probes read **19 tables**
> instead of 13.
>
> ```
> PRIOR_19_TABLE_SAMPLE_CLASSIFICATION = INVALID_FOR_CANONICAL_FIRST_LAYER_MEASUREMENT
> KM_BODY_FINDING_STATUS               = CLOSED — DIAGNOSTIC INSTRUMENT FAULT (no runtime defect)
> ```
>
> **The R44 -> R45 comparison is NOT invalidated**: both one-shots used the same shape, and
> `normalizationMs` does not depend on table count — `dateCellsConverted` is 79,454 under both. What these
> figures may not be read as is the first layer's cost. The true first-layer baseline is **6,197 ms server,
> 13 tables, 7,299 rows** — see `S8_R4D_E5_KM_BODY_REDIRECT_CONTRACT_PREFLIGHT.md`.

R44 made the read ten times faster and then spent twenty-four times the saving converting serials to
Dates. `sirWsSerialToDate_` computes `wallMs - offset(tz)` — arithmetic — and reached it through
`Utilities.formatDate` + `Utilities.parseDate`: **76,694 bridge crossings over 38,347 declared cells**,
70% of them the seven date columns of `amazon_daily_sales_snapshot` over 3,814 rows.

### What changed, and what deliberately did not

The conversion is unchanged in output. The **route** to it is not: the spreadsheet zone's offset is probed
once per DISTINCT YEAR present in the data (fourteen samples, flanking months included so a year covers its
own edges) and the arithmetic runs in pure JS only where the probe proves the offset constant. A year the
probe cannot prove keeps the original path — **cell by cell, not table by table**.

The guard is not decoration. Asia/Taipei is +8h today and was **+9h in July 1979**, because Taiwan observed
DST until 1980, so a hard-coded +8 would be wrong for real data and right for every test that only looks at
modern dates. The suite converts a 1979 summer serial and fails on that constant.

`sirWsSerialToDate_` is left **byte-identical** to R44. It is both the fallback and the differential oracle,
so old code is compared against new code in one process rather than against a reimplementation.

**Candidate A — moving normalization after the recent-window trim — was NOT implemented.** It was costed in
the E4 preflight and is the only candidate that bounds the work as history grows, but it changes a row
SELECTION function, so it is a separate decision-gated R46 candidate. `sirWsRecentWindow_` and
`sirWorkspaceBuild_` are asserted byte-identical to the deployed a940059.

```
LOCAL EVIDENCE   38,347 date cells · 76,694 old bridge calls (executed) · 14 new · 5,478x fewer
                 DATE_VALUE_DIFF_COUNT 0 · DATE_TYPE_DIFF_COUNT 0 · DATE_MAP_DIFF_COUNT 0
                 NON_DATE_TRAP_DIFF_COUNT 0 · event_month still the number 11
NEW DIAGNOSTICS  dateCellsConverted + tzProbeCalls, beside normalizationMs. R44's ratio is exactly two
                 calls per cell; a ratio climbing back toward 2 is the guard failing open.
```

### Apps Script sync set

```
COPY (paste into the Production Apps Script project, in this order):
  60_api_v1_inventory_replenishment_workspace.gs
  63_api_v1_system_health.gs

EDITOR-APPLIED (verify, do not paste):
  appsscript.json   UNCHANGED - Sheets v4 beside BigQuery v2, already present since S8-R4D-D2

DELETE (confirm absent):
  nothing new. The S8-R4D-D2 TEMP probes should already be gone.

THEN create a NEW VERSION on the EXISTING Production Web App. Do not create a second Web App.
VERIFY system.health: deployment_release = R45, module_sync.verdict = UNIFORM,
       runtime_authority.advanced_services.sheets = true
```

### Acceptance that must still happen

```
RELEASE_OWNER_SET                60_api_v1_inventory_replenishment_workspace.gs,
                                 63_api_v1_system_health.gs
ACTION_CONTRACT_VERSION          18 - unchanged. No action added or removed.
REQUIRED_ACTION_LIST_VERSION     14 - unchanged.
APPS_SCRIPT_SYNC_REQUIRED        YES - 60_, 63_
APPS_SCRIPT_NEW_VERSION_REQUIRED YES
APPSSCRIPT_MANIFEST_CHANGE       NO
BUNDLE_REBUILD_REQUIRED          NO - no assets/js/core module changed
DB_SCHEMA_CHANGE                 NONE
DB_WRITES                        0
DB_DELETES                       0
DB_READS                         13 - the unchanged first-layer set
FRONTEND_DEPLOY_REQUIRED         NO - no browser-served byte changed
CACHE_TOKEN_ROTATION_REQUIRED    NO
APPS_SCRIPT_DEPLOYMENT_PERFORMED NO
FRONTEND_PUBLICATION_PERFORMED   NO
GIT_PUSH_REQUIRED                YES - USER-owned, after review
```

**STATUS: PREPARED, NOT SYNCED, NOT DEPLOYED.** The acceptance is one Production one-shot by the same
method as E3D, reported against the frozen R44 baseline above. The criterion is `normalizationMs`
materially reduced with semantic diff counts at zero — **no latency target is asserted**, because none was
measured. Carried forward separately and NOT repaired here: `DIAGNOSTIC_REQUEST_BODY_LOSS`
(S8-R4D-E5) and the Production console error `showSection is not defined`.

---

## S8-R5-B — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R46` — AVG SALES STOPS BEING GATED ON THE PLANNING MODEL

```
BASE    cc79baa   S8-R5-B preflight; R45 is CUT but NEVER SYNCED
BRANCH  feature/product-strategy-board-p0
DATE    2026-10-08
SCOPE   AVG SALES DISPLAY ONLY. The canonical §22 resolver was CALLED only under sales_driven, so a
        Forecast-Driven SKU had no historical rate to publish. It now runs for every SKU and its result
        serves DISPLAY. No action added or removed, no route moved, no request field, no business rule,
        no schema, no stored row, zero DB writes. PLANNING DEMAND IS BYTE-IDENTICAL IN BOTH MODES.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R46
PURPOSE                      Forecast-Driven Avg Sales shows `--` in Production; the rate exists and is
                             never requested.
SUPERSEDES                   nothing. R45 is CUT but NEVER SYNCED. A pending release cannot be folded into
                             a later one either: 60_'s R45 bytes are still in the operator's paste queue, so
                             folding would re-label R45's work as R46 and leave an acceptance unable to say
                             which tree it measured. R45 and R46 travel to Production as ONE paste set and
                             keep SEPARATE identities.
OWNERS                       63_api_v1_system_health.gs                      (SYS_BUILD_VERSION_)
STAMPLESS OWNERS             42_api_v1_recommendation_workspace.gs  — declares no build symbol, so it is
                             COPIED and stamped by nobody. Putting it in the stamped owner set would
                             satisfy the copy ledger and break the stamp ledger.
CARRIED                      60_api_v1_inventory_replenishment_workspace.gs stays at R45 — it did not change
                             in R46. 01_router.gs stays at R41. SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ stays
                             18, required-action list 14, transport contract 1.
BUNDLE                       90_ NOT rebuilt. No assets/js/core module changed; KMCALC, the frozen owner
                             that computes the rate, is untouched.
EDITOR-APPLIED               none. appsscript.json is unchanged — no advanced service, no OAuth scope.

STATUS AT CUT                PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carries R46,
                             no Web App version exists for it, and Production is NOT R46.
```

### What changed

`42_api_v1_recommendation_workspace.gs` — the gate was on the line that CALLS the resolver, not on the
field that publishes it:

```
BEFORE  if (planModel === 'sales_driven') { var sr = recoWsResolveSalesRate_(...); ... }
        mLine.horizonBasis = { ..., avgSalesPerDay: (planModel === 'sales_driven' ? salesRate : null), ... }

AFTER   var sr = recoWsResolveSalesRate_(...);                      // every SKU, both modes
        if (planModel === 'sales_driven') { ...salesRate/salesReason unchanged... }
        mLine.horizonBasis = { ..., avgSalesPerDay: (sr.ok ? sr.avgSalesPerDay : null),
                               source, warning, normalDayCount, excludedDates, ... }
```

`salesRate` (the planning basis) and `salesReason` (the fail-closed horizon reason) are still assigned ONLY
under `sales_driven`, so `recoWsBuildHorizons_` receives byte-identical inputs and a Forecast-Driven horizon
failure can never be mislabelled `SALES_BASIS_UNAVAILABLE`. The four diagnostic fields were already on the
resolver's own return — nothing was invented, and no second normalization engine exists.

### What this release does NOT fix on its own

The frontend repaint is gated on the same Planning Model (`_irRecoHasSalesDrivenBasis_`), so R46 alone
delivers a correct rate that the page never paints. The frontend half is a SEPARATE release surface and is
prepared as its own commit. **Publish the frontend only after R46 is synced** — in that order nothing is
ever worse than today; in the other order the page asks for a field the deployed backend still withholds.

### Apps Script sync set

```
PASTE (in this order, into the EXISTING Production Apps Script project):
  42_api_v1_recommendation_workspace.gs
  63_api_v1_system_health.gs

PLUS R45's still-pending file, which has never been synced:
  60_api_v1_inventory_replenishment_workspace.gs

EDITOR-APPLIED (verify, do not paste):
  appsscript.json   UNCHANGED

THEN create a NEW VERSION on the EXISTING Production Web App. Do not create a second Web App.
VERIFY system.health: deployment_release = R46, module_sync.verdict = UNIFORM,
       and 60_ reporting SIR_BUILD_VERSION_ = R45 is CORRECT, not stale — it is carried.
```

### Acceptance that must still happen

```
RELEASE_OWNER_SET                63_api_v1_system_health.gs
STAMPLESS_OWNER_SET              42_api_v1_recommendation_workspace.gs
ACTION_CONTRACT_VERSION          18 — unchanged. No action added or removed.
REQUIRED_ACTION_LIST_VERSION     14 — unchanged.
APPS_SCRIPT_SYNC_REQUIRED        YES — 42_, 63_, and R45's pending 60_
APPS_SCRIPT_NEW_VERSION_REQUIRED YES
APPSSCRIPT_MANIFEST_CHANGE       NO
BUNDLE_REBUILD_REQUIRED          NO
DB_SCHEMA_CHANGE                 NONE
DB_WRITES                        0
DB_DELETES                       0
FRONTEND_DEPLOY_REQUIRED         YES — but as a SEPARATE release, published AFTER this one is synced
CACHE_TOKEN_ROTATION_REQUIRED    NO for this release; YES for the frontend half
APPS_SCRIPT_DEPLOYMENT_PERFORMED YES — 42_, 63_ and R45’s pending 60_ synced; new version published
FRONTEND_PUBLICATION_PERFORMED   YES — after the UTF-8 ledger repair (3fae8a6) unblocked Pages
GIT_PUSH_REQUIRED                YES — USER-owned, after review
```

**STATUS: SYNCED AND PUBLISHED · IDENTITY ACCEPTED · FUNCTIONAL ACCEPTANCE OPEN.**

Live Production `system.health` (GET, read-only, `read_only: true`, `db_writes: 0`) reports
`deployment_release` = `build_id` = R46, `deployment_uniformity_verdict` = UNIFORM, `mixed_deployment`
= false, 63_ = R46, 01_ router = R41, `router_ready` = `db_reachable` = `schema_ready` = true,
`missing_actions` = []. **60_ `SIR_BUILD_VERSION_` reads R45 with `matches_expected` = true, and that
is correct, not a gap:** a module stamp records the round the file last changed, never the release, and
60_ did not change in R46. It also settles R45’s pending 60_ sync, which this probe is the first
evidence for.

Frontend published and verified by direct fetch: `index.html` and `app.js` HTTP 200 carrying the R46
cache token, `inventory-replenishment.js` HTTP 200 with `_irRecoHasCanonicalBasis_` PRESENT and the
superseded `_irRecoHasSalesDrivenBasis_` ABSENT — so the repaint fix is the code actually being served,
not merely the code committed. Publication had been blocked since 6b9735e by invalid UTF-8 in THIS file,
introduced by a latin1 write in 4065ba3 and repaired in 3fae8a6; Pages recovered on the next build.

Smoke (user-observed): Site Inventory loads, site switching works, FC Summary loads, no JavaScript
exceptions observed.

**WHAT IS NOT ACCEPTED.** The release identity is proven; the BEHAVIOUR this release exists for is not.
Still OPEN, and deliberately not recorded as PASS: Forecast-Driven normalized Avg. Sales UI behaviour,
Sales-Driven normalized Avg. Sales UI behaviour, and planning demand / suggested-quantity parity. The
original acceptance condition stands unmet — one Production read of a scope holding at least one
Forecast-Driven SKU with sales history, where `horizonBasis.avgSalesPerDay` is a number and
`horizonBasis.source` names the §22 rung, while `horizons[].demandQty` for both modes is unchanged
against the pre-R46 values. Unconnected Marketplace acceptance is DEFERRED_S8_FINAL. The 90-day shared
3PL allocator and Administration Priority are NOT activated.

`missing_actions` = [] is **self-referential** (`missing_actions_is_self_referential: true`) and is NOT
an independent complete action census: a deployment predating an action cannot report it missing.

---

## S8-R49-I / S8-R49-J — `…-R47` and `…-R48` — UNSHIPPED INTERMEDIATE BUILDS, ABSORBED INTO R49

```
RELEASE IDS                  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R47
                             F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R48
STATUS                       NOT DEPLOYED. NOT CUT AS RELEASES. NO Apps Script version exists for either,
                             and neither was ever synced. They are written down here because the shared
                             owner-stamp ledger carries them and a token in that ledger with no entry here
                             is indistinguishable from a release somebody cut and forgot to record.

WHAT THEY ACTUALLY ARE       MODULE-STAMP ROTATIONS, minted by rounds that were explicitly NOT authorized
                             to move SYS_DEPLOYMENT_RELEASE_.
                             R47 — S8-R49-I rotated 61_api_v1_weekly_ai_plan.gs when weeklyAiPlanMktKey_
                                   replaced marketplace-name-only priority lookup with the canonical
                                   company + country + marketplace identity.
                             R48 — S8-R49-J rotated 63_api_v1_system_health.gs when the deployment manifest
                                   was corrected to the bundle hash S8-R49-F had actually built.

WHY THEY ARE NOT REMOVED     `stampAtOrAfter` compares INDEXES in `assets/tests/_release-order.js`. Deleting
                             or renumbering either token would silently reorder every floor written against
                             that list, so both stay exactly where they were appended. Append-only is not a
                             convenience here; it is what makes "at or after round X" answerable at all.

ABSORBED BY                  R49. 61_ ships under R49 while still DECLARING R47, and that is correct rather
                             than stale: a module stamp records the round its file last changed, never the
                             release that carries it. An acceptance finding R47 on 61_ after R49 is looking
                             at a correctly synced file.
```

---

## S8-R49-L — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R49` — MARKETPLACE PRIORITY IDENTITY + THE §14 SEND REFUSAL

```
BASE    88ec21e   S8-R49-J; R46 is CUT, SYNCED and DEPLOYED, its acceptance still OPEN
BRANCH  feature/product-strategy-board-p0
DATE    2026-10-10
SCOPE   Two runtime defects and the bookkeeping that carries them. A marketplace's allocation_priority was
        resolved by marketplace NAME alone, so a site could be handed another company's priority order-
        dependently; and a Request Order line with no usable units_per_carton could be Sent. No action
        added or removed, no route moved, no schema, no stored row, zero DB writes.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R49
PURPOSE                      Ship the S8-R49-D/F/H/I repairs as one coherent paste set, and reconcile a
                             release identity that had drifted two tokens behind its own module stamps.
SUPERSEDES                   nothing. ABSORBS R47 and R48, which were module-stamp rotations and were never
                             deployed — see the entry above.
WHY R49 AND NOT R48          The cut was prepared as R48. R48 was already 63_'s own module stamp at HEAD,
                             set by S8-R49-J, and a release token must be MINTED BY ITS CUT: the E4 gate
                             requires a changed owner's last commit to be the commit that INTRODUCED its
                             stamp, while the release contract requires SYS_BUILD_VERSION_ to EQUAL the
                             release. No commit can introduce R48 twice, so declaring it would have left E4
                             failing against an otherwise correct tree. Measured, not assumed: with the
                             release at R48, E4 reported `63_api_v1_system_health.gs (edited in this working
                             tree, stamp still …R48)`; with the stamp rotated, E4 passed.
OWNERS                       63_api_v1_system_health.gs                      (SYS_BUILD_VERSION_)
                             66_api_v1_request_order_send.gs                 (ROS_BUILD_VERSION_)
                             66_ carries TWO stamps and only ONE moves: Send ORCHESTRATION changed, the send
                             DIAGNOSTIC did not, so ROSEND_DIAG_BUILD_VERSION_ stays at F1-7N-FB-4G-A2-R4.
CARRIED                      61_api_v1_weekly_ai_plan.gs stays at R47 — it changed in R49-I, not here.
                             01_router.gs stays at R41. SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ stays 18,
                             required-action list 14, transport contract 1.
BUNDLE                       90_generated_supply_planning_bundle.gs IS part of this release, rebuilt in
                             S8-R49-F. Content hash fafc1d8e0273cb170601b6481d56d07f35d2ab51660adaf41637e9
                             06f4258c41, reproducible from the core modules via `--check`. Never hand-edited.
EDITOR-APPLIED               none. appsscript.json is unchanged — no advanced service, no OAuth scope.
FRONTEND                     SEPARATE RELEASE, prepared not published. Application-family cache token
                             r49-prioritysendguard-20261010 is minted and every application reference in
                             index.html and app.js carries it. The map, Site-Inventory-CSS and method-
                             registry families are deliberately untouched — no byte of theirs moved.

STATUS AT CUT                PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carries R49, no Web
                             App version exists for it, and Production is NOT R49 — Production is R46.
```

### Apps Script sync set — four files, ONE paste set, 63_ last

```
61_api_v1_weekly_ai_plan.gs            declares WAP_BUILD_VERSION_ …R47  (carried, correct)
90_generated_supply_planning_bundle.gs identified by content hash, not by a stamp
66_api_v1_request_order_send.gs        declares ROS_BUILD_VERSION_ …R49
63_api_v1_system_health.gs             declares the release and every expectation above — paste it LAST
```

### Acceptance that must still happen

Nothing in this entry is evidence of a deployment. After the user syncs and publishes a version, a live
`system.health` probe must report `build_id` = `deployment_release` = R49, `mixed_deployment` = false,
`stale_modules` = [], `deployment_uniformity_verdict` = UNIFORM, and 61_ reporting R47 with
`matches_expected` = true. **R46 Production Functional Acceptance remains OPEN against R46 and is not
closed, superseded or re-dated by this release.**

---

## S8-B3-R1A — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R51` — THE OVERSEAS ALLOCATION PREVIEW, SHIPPED INACTIVE

```
BASE    970560f3  S8-B3-D4; R50 is CUT but NOT SYNCED and NOT DEPLOYED. Production is R49.
BRANCH  feature/product-strategy-board-p0
DATE    2026-10-10
SCOPE   A NEW READ-ONLY async surface (the Overseas Allocation Preview job: one new module, four router
        actions, one staged-OFF flag) plus the deferred §45.B.2 producer corrections that D-S8-C2-1 held
        back for the next independently justified backend release. No DB schema, no new table, no Apply,
        no business write, no frontend activation. Transport contract stays 1.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R51
PURPOSE                      Land the Preview BACKEND while it is still inert, so activation is a later and
                             separately decided flag flip rather than a deployment that both adds and turns on
                             a feature. And close §45.B.2: both core producers now refuse an allocation
                             priority that is PRESENT but unusable, at the emission point.
SUPERSEDES                   nothing. R50 is cut and unshipped; R51 follows it and both travel together in the
                             same paste set. Production is R49.
OWNERS                       74_api_v1_overseas_allocation_preview_job.gs   (OAP_BUILD_VERSION_)  — NEW FILE
                             01_router.gs                                   (RTR_BUILD_VERSION_)
                             00_config.gs                                   (CONFIG_BUILD_VERSION_)
                             63_api_v1_system_health.gs                     (SYS_BUILD_VERSION_)
STAMPLESS OWNERS             43_api_v1_gap_materialization.gs — unchanged in R51; it is carried from R50, which
                             is also unshipped, so it still travels in this paste set and is stamped by nobody.
CARRIED                      66_ stays at R49. 61_ stays at R47. 60_ stays at R45. 01_router.gs LEAVES carried
                             and becomes an OWNER — R51 adds four routes for real.
ACTION CONTRACT              18 -> 19. FOUR new routes, ONE bump: the rule is one bump per release that changes
                             the action set, never one per action. SYS_REQUIRED_ACTIONS_ and the required-action
                             list version DO NOT MOVE — that list is the actions PAGES depend on, and no page
                             calls the Preview (there is no Preview page). Same restraint as
                             productPricing.workspace.get and pricing.fxReconcile before it.
BUNDLE                       90_ REBUILT — two assets/js/core producers changed (§45.B.2). 60 modules;
                             KM_BUNDLE_CONTENT_HASH_ = 3de64364ba358468c39142aac212d663b41075f454dc6d86218fc066cdbc7e25
                             (was a113e56e45985f1b974869616a6f70d2a3723a9270a39d3f25ba567a0f7cf2c1).
                             Generated by the canonical builder, never hand-edited; --check reproduces it.
EDITOR-APPLIED               none. appsscript.json is unchanged — no advanced service, no OAuth scope. The
                             Preview creates time-based triggers, and script.scriptapp was already granted.
FRONTEND                     NOT CHANGED, and no cache token was rotated. The two producers this release
                             corrects are server-side only — no page loads them, they reach the browser through
                             nothing and reach Apps Script only through 90_. The ONLY browser file touched is
                             operation-system-db-api.js, whose action-contract pin moves 18 -> 19 to stay EQUAL
                             to the deployment. Rotating a cache token here would assert a frontend change that
                             did not happen.

STATUS AT CUT                PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carries R51, no Web App
                             version exists for it, and Production is NOT R51 — Production is R49.

CORRECTION (S8-B3-R2-FIX1, 2026-10-11, WITHIN R51 — no new identity)
                             The S8-B3-R2 acceptance audit BLOCKED this cut on two findings in 74_, both now
                             fixed: a SUPERSEDED worker could delete a NEWER run's result chunks (it now
                             deletes only its own generation, and deletes nothing at all when it has no
                             generation to name), and the CALCULATION CONTEXT was outside the input
                             fingerprint (it is now part of it, resolved through the existing owner).
                             74_ is the ONLY runtime file this correction touches. 90_ is NOT rebuilt — 74_ is
                             not a bundled module — so KM_BUNDLE_CONTENT_HASH_ is unchanged, and so are the
                             action contract (19), the client pin (19), the manifest and every cache token.
                             A corrected file inside an UNSHIPPED cut is still that cut: nothing was synced
                             from R51, so there is no deployed R51 for this to diverge from.
```

### Why the Preview ships turned off

A deployment that both ADDS a feature and TURNS IT ON has two ways to fail and one symptom. R51 lands the
backend inert: `OVERSEAS_ALLOCATION_PREVIEW_ENABLED_` is `false`, and the four handlers check it BEFORE the
default env is built — so a disabled Preview opens no spreadsheet, writes no Script-Property job state and arms
no trigger. The stray-trigger case is covered too: the continuation handler returns immediately when the flag is
false, so a trigger left behind by a future enablement cannot do work after a rollback.

That ordering is what makes "staged off" mean INERT rather than merely hidden, and it is the same ordering
`PRODUCT_STRATEGY_ENABLED_` uses. It also leaves one honest ambiguity, which the action contract resolves: a
disabled Preview and an UNSYNCED deployment both refuse, and only `deployed_action_contract_version` tells them
apart. That is why the contract bump matters more than usual in a release that activates nothing.

### Why four actions and not one

The synchronous `overseasAllocation.preview.get` proposed in D-S8-B3-6 was retired by D-S8-B3-14. It could not
work: S8-B3-D2 measured that the demand basis requires one live Order Planning workspace calculation PER
MARKETPLACE, and production had already been redesigned to one scope per execution after a multi-scope execution
was KILLED. A preview that cannot finish inside the 45 s client read timeout is not a synchronous read.

So the Preview follows the proven async shape: START is a quick write that returns immediately, STATUS carries
progress and never the payload, RESULT is its own read, and CANCEL exists because a stuck run should not have to
wait out the 10-minute stale window.

### The lock discipline this release introduces

`LockService.getScriptLock()` is per-SCRIPT, so the Preview and Gap Materialization share one lock, and
`gapJobContinue_` holds it across its ENTIRE slice loop — up to 240 s — while its own bounded wait is 8 × 1000 ms.
The asymmetry decides the design: Preview losing that race is tolerable and retryable; a Gap job losing it is a
regression of a shipped production job. So the new entrant is never the long holder. The Preview takes the lock
only for short state transitions, never across a sheet read, a workspaceGet, a KMMSA allocation or result
serialization, and its Preview-vs-Preview exclusion comes from the optimistic runId guard instead. 46_ is not
edited by this release.

---

## S8-B1-R50 — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R50` — MISSING PRIORITY STOPS BECOMING ZERO

```
BASE    7fa6c19   S8-R49-M2; R49 is CUT, SYNCED and DEPLOYED, and its functional acceptance is OPEN
BRANCH  feature/product-strategy-board-p0
DATE    2026-10-10
SCOPE   Two USER-APPROVED decisions, D-S8-A1 and D-S8-B1. Country identity in the two core producers now
        resolves through the canonical KMCID owner; KMMSA refuses an unresolved receiver priority instead
        of defaulting it to 0. No formula, no action, no route, no schema, no stored row, zero DB writes.
        The action contract stays 18 and the transport contract stays 1.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R50
PURPOSE                      An allocation priority nobody had set was being fabricated as 0 — and 0 is a
                             VALID lowest priority that still takes a share under §24.7, so an unranked
                             receiver competed for the pool and §45.A.5's refusal was unreachable.
SUPERSEDES                   nothing. R49 is CUT, SYNCED and DEPLOYED; its bytes are in the live project and
                             MUST NOT absorb this work. R50 follows it.
OWNERS                       63_api_v1_system_health.gs                      (SYS_BUILD_VERSION_)
STAMPLESS OWNERS             43_api_v1_gap_materialization.gs — declares no build symbol and has no manifest
                             row, so it is COPIED and stamped by nobody. Putting it in the stamped owner set
                             would satisfy the copy ledger and break the stamp ledger.
CARRIED                      66_api_v1_request_order_send.gs stays at R49 — it did not change in R50, and it
                             returns to CARRIED after one release as an owner. 61_ stays at R47. 60_ stays at
                             R45. 01_router.gs stays at R41. SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ stays 18,
                             required-action list 14, transport contract 1.
BUNDLE                       90_ REBUILT — five assets/js/core modules changed. 60 modules;
                             KM_BUNDLE_CONTENT_HASH_ = a113e56e45985f1b974869616a6f70d2a3723a9270a39d3f25ba567a0f7cf2c1
                             (was fafc1d8e0273cb170601b6481d56d07f35d2ab51660adaf41637e906f4258c41).
                             Generated by the canonical builder, never hand-edited; --check reproduces it.
EDITOR-APPLIED               none. appsscript.json is unchanged — no advanced service, no OAuth scope.
FRONTEND                     NOT CHANGED. No browser file moved, so no cache token was rotated and there is
                             no Pages publication in this release.

STATUS AT CUT                PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carries R50, no Web
                             App version exists for it, and Production is NOT R50 — Production is R49.
```

### Why a cut, and not an edit to R49

R49 was synced and published before this work existed; a live `system.health` probe reported
`build_id` = `deployment_release` = R49, UNIFORM, `stale_modules` = []. Folding R50's bytes into R49 would
relabel work the deployed project does not contain, and no acceptance could then say which tree it measured.

Three independent gates caught the attempt, which is why the cut exists rather than a hash edit:

- the manifest's expected bundle hash no longer matched the generated bundle (D1/E3/E5, E9, G57, H3/H5/H6);
- `43_api_v1_gap_materialization.gs` appeared in the Apps Script copy list without being a declared owner (I1);
- the deployment-uniformity probe reported a mixed tree.

None of them was wrong. A runtime change that lands after a cut needs its OWN cut.

### What changed

- **`supply-planning-source-projection.js`** and **`supply-planning-production-assembly.js`** resolve the
  COUNTRY component of the canonical marketplace identity through `KMCID.canonicalCountryCode`, applied to
  both operands. UK ≡ GB; case and whitespace fold; EU stays an independent region and is never expanded;
  no alias is invented; stored and displayed values are never rewritten. A canonical identity COLLISION is
  reported (`CANONICAL_MARKETPLACE_IDENTITY_CONFLICT`) and answers MISSING rather than letting read order pick
  a winner. Company and marketplace deliberately do NOT case-fold — `03_master_data_handlers.gs` upserts
  trim-only and case-sensitive, and folding them would merge rows the canonical owner keeps apart.
- **KMMSA** refuses a missing, null, blank, negative, non-numeric or non-finite priority with
  `blocked('RECEIVER_PRIORITY_UNRESOLVED')` before any allocation, naming company/country/marketplace/sku.
  An explicit numeric 0 remains VALID and keeps its share.
- **`43_`** no longer substitutes 0 at the point of use, and a blocked group NAMES its receivers so they are
  not read downstream as zero-covered.
- **Weekly Harvest Adapter** carries an unresolved priority through as null; **Weekly Input Assembler** fails
  the lane closed with `UNRESOLVED_ALLOCATION_PRIORITY` rather than coercing it.

### What this release deliberately does NOT change

D-FM5-R2A-1 (monthly protection mapping), D-FM5-R2A-2 (waterfall), D-FM5-R2A-3 (company isolation), the
receiver-count and independent-pool freeze, the 18-day survival rule, factory FC-ratio allocation, and every
§20/§24/§35/§40 formula. §45.B.2 (both producers passing an invalid value through verbatim) and the Inventory
Replenishment page's `|| 0` display fallback are OPEN and were out of scope.

### Apps Script sync set — three files, ONE paste set, 63_ last

```
90_generated_supply_planning_bundle.gs identified by content hash, not by a stamp — a113e56e…
43_api_v1_gap_materialization.gs       declares no build symbol (stampless owner)
63_api_v1_system_health.gs             declares the release and every expectation above — paste it LAST
```

61_, 66_ and 60_ are CARRIED: they are already in the project from R49 and earlier and do not need re-pasting
unless the operator is reconciling a project of unknown state.

### Acceptance that must still happen

Nothing in this entry is evidence of a deployment. After the user syncs and publishes a version, a live
`system.health` probe must report `build_id` = `deployment_release` = R50, `mixed_deployment` = false,
`stale_modules` = [], `deployment_uniformity_verdict` = UNIFORM, 66_ reporting R49 with `matches_expected`
= true, and 61_ reporting R47 with `matches_expected` = true. **R49 and R46 Production Functional Acceptance
both remain OPEN and are not closed, superseded or re-dated by this release.**

---

## S8-R49 — DEPLOYED-STATUS CONFIRMATION (append-only, 2026-10-10)

The R49 entry above records `STATUS AT CUT: PREPARED, NOT SYNCED, NOT DEPLOYED`, which was true when it was
written and is **deliberately left unedited** — a cut block records INTENT at cut time. This note records what
happened AFTERWARDS, the way R43 and R46 recorded theirs.

**STATUS: SYNCED AND PUBLISHED · IDENTITY ACCEPTED · FUNCTIONAL ACCEPTANCE OPEN.**

Live `system.health` (GET, read-only, `read_only: true`, `db_writes: 0`, `drive_writes: 0`) reports:

```
build_id = deployment_release = F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R49
system_health_module_build      R49      mixed_deployment            false
workspace_module_build          R45      deployment_uniformity       UNIFORM
router_build                    R41      stale_modules               []
deployed_action_contract_version 18      absent_modules              []
transport_contract_version        1      advanced_services_ok        true
required_action_list_version     14      router/db/schema ready      true
66_ ROS_BUILD_VERSION_          R49  matches_expected = true
66_ ROSEND_DIAG_BUILD_VERSION_  F1-7N-FB-4G-A2-R4  matches_expected = true   (correctly NOT marched)
61_ WAP_BUILD_VERSION_          R47  matches_expected = true   (carried, correct)
90_ KM_BUNDLE_CONTENT_HASH_     fafc1d8e…  matches_expected = true   (the bundle arrived intact)
```

Frontend published and verified by direct fetch from the Pages site: `index.html` 200 carrying 55 references to
`r49-prioritysendguard-20261010` and 0 to the previous token, `app.js` 200 with its 8 route-asset references,
`operation-system-db-api.js` 200 carrying the R49 `ABSENT IS NOT ZERO` normalization, and `request-order.js` 200
carrying `_roConflictText_`. The served `index.html` is byte-identical to the committed file after LF
normalization (`e7c029c4…` both sides), so the deployed bytes are the committed bytes and not merely a build
that happened to carry the right token.

**WHAT IS NOT ACCEPTED.** The release IDENTITY is proven; the BEHAVIOUR is not. Still OPEN and deliberately not
recorded as PASS: Company/Country/Marketplace priority isolation, Priority 0 vs Missing, and the §14 Missing-UPC
Send guard. The first two could not be exercised against Production because **all 16 marketplace rows carry a
SET priority** — there is no 0 and no missing row to observe. The third could not be exercised because the
`requestOrder.sendWorkset.get` read (zero-write, two tables, no writer) returned **0 persisted drafts** for
planning cycle 2026-10, so the guard had no data to fire on. An empty set is not a pass. Local fixtures carry
the proof instead (`SEND_GUARD_MEASURED: missing_upc_send_blocked=true`).

**R46 Production Functional Acceptance remains OPEN against R46** and is not closed or re-dated by this note.

---

## S8-B3-R3-CP2I — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R52` — THE PRIORITY WRITE BECOMES A BOUNDED ACTION

```
BASE    aaf47499  S8-B3-R3-CP2E. R50 and R51 are CUT but NOT SYNCED and NOT DEPLOYED. Production is R49.
BRANCH  feature/product-strategy-board-p0
DATE    2026-10-12
SCOPE   ONE new router action that writes ONE column, plus the refusal that closes the old door. No DB
        schema, no new table, no formula change, no eligibility change, no allocation change. Transport
        contract stays 1. The generated bundle is NOT rebuilt.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R52
PURPOSE                      Make marketplaces.allocation_priority writable ONLY through an action that
                             cannot do anything else. Until now Site Priority saved through
                             upsertMarketplace, which resolved its target by RAW case-sensitive
                             company+country+marketplace, APPENDED A NEW ROW on no match, wrote five
                             unrelated columns unconditionally, skipped the priority silently when the
                             column was absent, and had no compare-and-set. Each of those is now either
                             impossible or a named refusal.
SUPERSEDES                   nothing. R50 and R51 are cut and unshipped; R52 follows them and all three
                             travel in the SAME paste set. Production is R49.
OWNERS                       03_master_data_handlers.gs                     (MD_BUILD_VERSION_)  — NEW STAMP
                             01_router.gs                                   (RTR_BUILD_VERSION_)
                             63_api_v1_system_health.gs                     (SYS_BUILD_VERSION_)
STAMPLESS OWNERS             43_api_v1_gap_materialization.gs — unchanged in R52; carried from R50, which is
                             also unshipped, so it still travels in this paste set and is stamped by nobody.
CARRIED                      00_ stays R51. 74_ stays R51. 66_ stays R49. 61_ stays R47. 60_ stays R45.
                             90_ is NOT rebuilt and its content hash is UNCHANGED.
ACTION CONTRACT              19 -> 20. ONE new route, ONE bump. It matters more than usual: the new action is
                             the ONLY way a priority can be written from R52, because upsertMarketplace now
                             REFUSES the field outright. A v19 deployment cannot store a priority at all, and
                             the frontend must be able to learn that without attempting a write to find out.
REQUIRED ACTION LIST         14 -> 16, BY TWO, because two entries arrive. The release-stamp gate asserts
                             this number moves exactly as far as the registry grows - specifically so it
                             cannot be a number somebody typed - and nothing pins its absolute value, so a
                             step of two distinguishes list versions exactly as well as a step of one.
                             SYS_REQUIRED_ACTIONS_ gains TWO entries. The second is a REPAIR:
                             upsertMarketplace has been routed since before this registry existed and was
                             never listed, so sysProbeRequested_ — which resolves a caller-named action ONLY
                             through that table — would report known_to_this_build false for an action the
                             deployment serves correctly. That is the F1-7N-FB-4E-R2 fault exactly.
MODULE MANIFEST              03_master_data_handlers.gs ENTERS SYS_MODULE_BUILD_STAMPS_ for the first time. It
                             has owned a master-table write for its whole existence with no row here, so a
                             stale copy was invisible to mixed_deployment. From R52 the router dispatches a
                             NEW action into it, so a pre-R52 03_ beside an R52 01_ routes a live write into
                             an undefined handler.
BUNDLE                       90_ NOT REBUILT. No assets/js/core file changed; the two browser files this
                             release touches live in assets/js/api and assets/js/pages, neither of which is a
                             bundled module. KM_BUNDLE_CONTENT_HASH_ stays
                             3de64364ba358468c39142aac212d663b41075f454dc6d86218fc066cdbc7e25.
EDITOR-APPLIED               none. appsscript.json unchanged — no advanced service, no OAuth scope.
FRONTEND                     CHANGED, AND THE CACHE TOKEN ROTATES — unlike R51, which deliberately did not.
                             R51's only browser edit was the action-contract pin, and rotating for that would
                             have asserted a frontend change that had not happened. R52 changes behaviour in
                             three served files: operation-system-db-api.js gains the bounded writer and the
                             pre-write deployment gate, site-priority.js stops echoing the old payload and now
                             sends a compare-and-set, and site-priority.css gains a fourth status state.
                             Application token r50-irpriority-20261010 -> r52-prioritywrite-20261012, appended
                             to ROUND_TOKENS only. The MAP, IR_CSS and METHOD_REGISTRY series are untouched.

LOCKING                      BOTH marketplaces writers now take the shared script lock at tryLock(30000).
                             A lock taken by the new handler alone would have serialised it against itself and
                             nothing else, because handleUpsertMarketplace_ was the sheet's ONLY writer and
                             took no lock at all. This gives Add Marketplace ONE new refusal —
                             LOCK_UNAVAILABLE, zero-write — which is a new instance of a behaviour ~20 other
                             handlers across 11 files already have, not a new class of one.
                             A BOUND THAT CAN BE EXCEEDED, SAID PLAINLY: gapJobContinue_ holds this same lock
                             for up to 240000 ms, so a marketplace write landing inside a Gap Materialization
                             run refuses rather than queues.

STATUS AT CUT                PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carries R52, no Web App
                             version exists for it, and Production is NOT R52 — Production is R49.
```

### What the four write outcomes mean, and why they are not new words

The client wrapper returns `CONFIRMED_COMMITTED`, `CONFIRMED_REJECTED`, `CONFIRMED_NOT_STARTED` and
`OUTCOME_UNKNOWN`. These are the states S3-R10 established for `pricing.update`, reused rather than renamed,
because two halves of one system must not hold two vocabularies for "nothing was written".

The rule that makes them worth having: **`success: false` is not by itself evidence that nothing changed.**
`01_router.gs`'s `doPost` catch returns `{ success:false, error }` with NO `zero_write` field for any exception
thrown anywhere inside a handler — including one thrown after a `setValue` has already run. So only an explicit
`zero_write === true` from the handler counts as proof, and everything else that is not a known unknown-action
response is `OUTCOME_UNKNOWN`. Treating a bare `success:false` as a refusal is how a partially-applied write
gets reported to an operator as "nothing happened".

### The partial write is not hidden

Apps Script has no multi-cell transaction, so the three `setValue` calls cannot be made atomic. The priority is
written FIRST, deliberately: the two possible outcomes are then "the priority landed and the audit stamp may be
stale" or "nothing landed" — never "the audit says someone changed it and the value did not move". Unrelated
columns are never rewritten to simulate atomicity, because that would reintroduce exactly the collateral-write
problem this release removes.

A matching value read back after an `OUTCOME_UNKNOWN` is shown in a distinct WARN state and is explicitly NOT
labelled a verified save: the read cannot attribute the stored value to that request rather than to a
concurrent one, and it cannot say whether the audit fields completed.

### What this release still cannot do

Clearing a priority back to MISSING. There was no supported path before and there is none now; inventing one
means a sentinel value every reader would have to learn, which is a product decision and not something to add
inside a safety fix. The page states the limitation where an operator meets it.

**STATUS: NOT DEPLOYED · NOT PUSHED · NOT SYNCED.**

---

### CP2I-R1 — three bounded corrections to R52, made BEFORE it shipped

R52 was cut, committed and never synced: no Apps Script project carries it, no Web App version exists for it and
Production is R49. These corrections therefore amend an **unshipped** release rather than rewriting a published
one. **The release identity does not move** — this is still
`F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R52`, the `03_` module stamp still names R52, and no action is added or removed,
so the deployed-action contract stays at **20** and the required-action list stays at **16**. The sync manifest
is unchanged: the same seven files, `63_` last.

All three defects are of one family — **a guard that accepted a coercion in place of the thing it was guarding**
— and all three were reproduced against the shipped CP2I harness before any fix was written.

```
1  STRICT INPUT TYPES          mpClassifyPriority_ opened with String(v).trim(), and String([5]) is '5'. An
                               ARRAY was therefore classified SET 5 and WRITTEN to the sheet. ['SET'] satisfied
                               the compare-and-set state; [50] satisfied the staleness comparison. Every gate
                               was present; every gate was reading a coercion. Now only typeof number|string is
                               admitted, the CAS state must be an actual string, and the client type-checks
                               BEFORE it normalises so it cannot launder one on the server's behalf.
                               An empty array is INVALID, not MISSING: String([]) is '', which made it
                               indistinguishable from a blank cell, and the caller did send something.
                               UNCHANGED, asserted in both directions: numbers, numeric strings, padded
                               strings, decimals and an explicit 0 still commit.

2  COMPLETE AUDIT SCHEMA       updated_by and updated_at were resolved AT the write block and SKIPPED when
                               absent. That is the same silent skip this action exists to remove from the
                               priority column: a save reporting success while storing less than it claimed,
                               here changing a shared planning weight with no record of who or when. Owner has
                               made both mandatory. They are now resolved WITH the rest of the schema — before
                               the identity gates, far before the first setter — so SCHEMA_MISSING_COLUMN is
                               provably zero-write rather than merely ordered before a write. The refusal names
                               the missing columns. No provisioning, no header append, no auto-repair.
                               OPERATOR-VISIBLE: a marketplaces sheet missing an audit column will now REFUSE
                               every priority save it previously half-completed in silence. See runbook §4.5.

3  PINNED DEDICATED ACTION     The client body was Object.assign({ action: FIXED }, payload) — the caller came
                               LAST, so a payload carrying its own `action` replaced the fixed one and pointed
                               this wrapper's CAS guard, its site-priority preflight and its priority-shaped
                               body at a different action. The DTO is now BUILT from the declared contract
                               fields and the action is pinned; undeclared fields never reach the wire, a
                               caller cannot plant a zero_write, and the expected CAS value is sent only in the
                               SET state that defines it. Preflight, bounded transport and no-resend preserved.
```

**Also strengthened, not relaxed: the stress harness itself.** The malformed-type alphabet made most runs refuse
at the first gate, and the mid-write fault — drawn independently of the payload — was landing almost entirely on
runs that had already refused: **1** injected mid-write failure in 240 runs, counted but not exercised. The fault
is now paired with an input that can reach the setters, and the run count raised to 720: **82** genuine
`WRITE_OUTCOME_UNKNOWN` runs. Two invariants were added — a committed write recorded **all three** required
columns, and a non-number/non-string value can **never** produce a commit or reach a setter.

**DEPLOYMENT BYTES.** Re-measured, budget NOT raised, gate NOT weakened, `26_`/`27_`/`28_` retained per Owner.
This round's `03_` growth is **+2,462 bytes** against **2,831** of headroom, leaving **+369**. The gate passes
honestly. **This is now a release-blocking structural fact and is escalated to the Owner**: two consecutive
rounds have had to condense their own comment prose to fit, and the next backend round of any size cannot.

**STATUS: NOT DEPLOYED · NOT PUSHED · NOT SYNCED.**

---

## S8-B3-R3-CP2R — DEPLOYMENT-BYTES UPDATE AND ONE PENDING `.gs` (append-only, 2026-10-15)

**NOT a release cut.** No release ID is claimed here. This records two facts the entry above left stale.

**THE BUDGET ESCALATION, WITH THIS ROUND'S NUMBER.** The previous entry escalated the headroom as a
release-blocking structural fact and predicted that *the next backend round of any size cannot fit*. CP2R is
that round. Measured on the same committed/LF instrument (`gs-load-surface-audit`, `rev: HEAD`):

```
BUDGET                       4,600,000      (apps-script-load-surface-slim-r1, SIZE_BUDGET)
BEFORE CP2R  (b97d6398)      4,599,631      headroom  369
CP2R  42_ only                  +297        two identity/publication repairs, comments kept tight
AFTER  CP2R                  4,599,928      headroom   72
```

The gate passes honestly and nothing was done to make it pass: **no budget raised, no module retired, no
other file compressed to buy room.** The escalation therefore stands and is now sharper — 72 bytes is not a
round of any size, it is not a sentence.

**AND IT HAS A NAMED CONSEQUENCE ALREADY.** The CP2Q gap-timeout diagnostic, narrowed as far as it goes
(the two gap read actions only, `43_` alone, no router / transport / request-id change), measures
**1,423 bytes**. Against 72 it is short by **1,351**. CP2Q is therefore blocked on a budget decision, not on
design, and remains an unimplemented proposal.

**PENDING SYNC.** `APPS_SCRIPT_SYNC_REQUIRED: assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs`
— the marketplace-SKU identity repair (`company` added to the `marketplace_skus` match) and the publication
of `horizonBasis` outside the horizon branch. **The frontend half of this round does nothing for Avg Sales
until this file is synced**: the page can only display a rate the server actually sends. `BUNDLE_REBUILD_REQUIRED: NO`
(no `assets/js/core/*` changed). Which release ID this travels under, and whether it joins or starts a cut,
is an OWNER decision and is not taken here.

**STATUS: NOT DEPLOYED · NOT PUSHED · NOT SYNCED.**

---

## S8-B3-R3-CP2R-R1 — THE CORRECTNESS FIX RETURNED BYTES (append-only, 2026-10-15)

**NOT a release cut.** The entry above recorded 72 bytes of headroom and restated the escalation. R1 had to
add a marketplace-SKU ambiguity refusal to the same file, which looked like the round that would not fit.

```
BUDGET                       4,600,000
AFTER  CP2R   (b1061f31)     4,599,928      headroom   72
CP2R-R1  42_ only                  +41
AFTER  CP2R-R1               4,599,969      headroom   31
```

**It very nearly went the other way, and the honest record is worth more than the tidy one.** Deleting the
`compute([], [])` retry and the paragraph defending it returned **−497 bytes** — a defensive fallback nobody
should rely on costs bytes twice, once for the code and once for the prose. The full regression then showed
that collapsing the two catch arms had made every owner throw report a contamination error, including an
unparseable date, so the throw had to be discriminated. That correction costs ~538 bytes and turns the
saving into **+41**.

**The escalation is therefore SHARPER, not relieved.** 31 bytes is the tightest this budget has been. The
CP2Q gap-timeout diagnostic, narrowed to the two gap read actions in `43_` alone, measures **1,423 bytes**
and is short by **1,392**. It remains an unimplemented proposal.

**PENDING SYNC (unchanged file set):**
`APPS_SCRIPT_SYNC_REQUIRED: assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs`
`BUNDLE_REBUILD_REQUIRED: NO`. Until it is synced the page cannot display a quality error the server does
not send, and the Avg Sales column keeps its CP2R behaviour.

**STATUS: NOT DEPLOYED · NOT PUSHED · NOT SYNCED.**

---

## Owner-reported release — main `37d9db8c` (recorded 2026-10-16, CP2T-R2)

**The Owner reports that main `37d9db8c` is PUSHED, that `42_api_v1_recommendation_workspace.gs` is SYNCED
and that the Apps Script deployment was UPDATED.** That supersedes the `NOT DEPLOYED` status of the CP2R-R1
entry above, which recorded the intent of that round and was never revised as later rounds landed locally.

| | |
|---|---|
| published main | `37d9db8c` (confirmed this round by `git ls-remote`) |
| `42_` handler version at that commit | **`fm5-r4ui-r5c`** (read out of the file at that revision) |
| `index.html` application token at that commit | `r58-derivedbaseperiod-20261015` |
| Apps Script deployment version number | **UNKNOWN — not provided** |

**The deployment VERSION NUMBER is UNKNOWN and is recorded as UNKNOWN.** It was not supplied and this ledger
does not infer one. What IS established is the handler that ships at the published commit.

**So the live Avg Sales column runs r5c.** Neither `fm5-r4ui-r5d` (CP2T-R1 — campaign and event date cells)
nor `fm5-r4ui-r5e` (CP2T-R2 — the weekly fallback source) has ever run in Production; both exist only in
local commits. The live column therefore still carries both defects those rounds repaired.

**This entry also retires the phrase "not published since".** Earlier reports in this branch asserted what
had or had not shipped after the previous ledger entry. Publication is a property of the REMOTE and is
re-checked per round; only checked statements are kept here, and an unsupplied version number is UNKNOWN
rather than absent.

**PENDING SYNC (local commits ahead of the published main):**
`APPS_SCRIPT_SYNC_REQUIRED: assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs`
`BUNDLE_REBUILD_REQUIRED: NO`

**STATUS: LOCAL ONLY — NOT PUSHED — NOT SYNCED (this round).**

---

## Published main advanced to `1778efc3` (checked 2026-10-16, CP2U-R1)

`git ls-remote origin main` returns **`1778efc3`**. The two commits that were local-only in the entry above
are therefore **published**, and `b382644d` — which introduced `r59-cacheshape-20261017` — **is now an
ancestor of `origin/main`**, so that token has been served and may never be reused.

| | |
|---|---|
| published main | **`1778efc3`** (`git ls-remote`) |
| `42_` handler version at that commit | **`fm5-r4ui-r5e`** |
| `43_` gap-materialization handler at that commit | **`fm5-r4ui-r5c`** — a SEPARATE series, not a later r5 of the same one |
| `index.html` application token at that commit | **`r59-cacheshape-20261017`** — now spent |
| Apps Script deployment version number | **UNKNOWN — not provided** |
| Apps Script sync state for `42_` at r5e | **UNKNOWN** — push and sync are separate manual steps and no sync was reported for this commit |

**THE GIT PUBLICATION IS CONFIRMED; THE APPS SCRIPT SYNC IS NOT.** A push moves `origin`; it does not copy a
`.gs` into the Apps Script project. No sync was reported for `1778efc3`, so whether the live Avg Sales column
runs `r5e` is **UNKNOWN**, and this ledger does not infer it from the push. If the project still holds `r5c`,
the live column keeps both the campaign-date defect CP2T-R1 repaired and the fabricated weekly zero CP2T-R2
repaired — and the page accept list admits only `r5e`, so until the sync happens **no response is cached at
all**. That is safe and slow, not wrong.

**CP2U-R1 (this round) is PAGE-ONLY.** No `.gs` changed, so there is **nothing to sync for it** and the GS
load surface is unchanged at **4,609,902 bytes**. What it does change is `index.html`, `assets/js/app.js` and
`assets/js/pages/inventory-replenishment.js`, so the co-deployed application set rotates to
**`r60-readstate-20261016`** — required, because `app.js` pinned the changed page file to the r59 token that
has now shipped.

**PENDING SYNC, carried forward unchanged:**
`APPS_SCRIPT_SYNC_REQUIRED: assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs` (to r5e)
`BUNDLE_REBUILD_REQUIRED: NO`

**STATUS: LOCAL ONLY — NOT PUSHED — NOT SYNCED (CP2U-R1).**

---

## Owner evidence: the SERVER is running r5e (recorded 2026-10-17, CP2U-R2)

**The Owner has provided evidence that the live `42_` handler is `fm5-r4ui-r5e`.** The previous entry
recorded the Apps Script sync state for `1778efc3` as UNKNOWN because a push is not a sync and none had been
reported. That is now answered.

| | |
|---|---|
| live `42_` handler | **`fm5-r4ui-r5e`** — Owner-supplied server evidence |
| Apps Script deployment VERSION NUMBER | **still UNKNOWN — not supplied** |

**AN UNKNOWN VERSION NUMBER IS NOT AN UNCONFIRMED HANDLER, and the two were being conflated.** The version
number is a label on a deployment; the handler marker is what the running code reports about itself. The
handler is CONFIRMED at `r5e`. The version number remains UNKNOWN and is recorded as UNKNOWN, as this ledger
records every value it was not given.

**What follows from r5e being live:** the campaign-date repair (CP2T-R1) and the fabricated-weekly-zero
repair (CP2T-R2) **are both running in Production**. The page accept list admits `r5e`, so responses are
cached normally again — the "safe but slow, nothing cached" state the previous entry described is over.

## EU — corrected: displayed successfully; first-load duration NOT established

Earlier rounds left EU as an open display question. **The Owner reports that EU now displays successfully.**
This ledger records that, and records just as plainly what it does **not** establish:

- **The first-load duration is UNCONFIRMED.** No measurement of a cold EU load was taken, by this round or
  any other. "It displays" and "it displays quickly" are different claims and only the first is supported.
- **The root cause was never diagnosed.** The asymmetry CP2U found in the member-row filter — `country` is
  canonicalised through KMCID while `marketplace` is compared as a raw string — is **unchanged in the
  code**. EU displaying correctly today does not show that asymmetry is harmless; it shows that this site's
  rows currently match on both.

**STATUS: LOCAL ONLY — NOT PUSHED — NOT SYNCED (CP2U-R2). No `.gs` changed this round, so there is
nothing to sync for it.**


## S8-B3-R3-CP2V — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R53` — THE RECOMMENDATION READ STOPS CROSSING THE BRIDGE TWENTY-ONE TIMES

```
BASE    1e2f8dae  S8-B3-R3-CP2U-R3-R3. R50, R51 and R52 are CUT but NOT SYNCED and NOT DEPLOYED.
        Production is R49.
BRANCH  feature/product-strategy-board-p0
DATE    2026-10-18
SCOPE   ONE read transport, inside one handler. No DB schema, no new table, no new action, no formula,
        no eligibility change, no allocation change, no timeout, no schedule, no cache policy. The
        request and the business response of recommendation.workspace.get are byte-identical.
        Action contract stays 20. Transport contract stays 1. The generated bundle IS rebuilt.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R53
PURPOSE                      recommendation.workspace.get opened twenty-one sheets per request and called
                             getDataRange().getValues() on each, ONCE PER SITE, so US + CA + EU paid it
                             three times. An Apps Script sheet read is priced by the COUNT of sheets, not
                             by rows. R53 reads the twelve tables whose date columns 60_ has already
                             PROVEN (SIR_B1_DATE_MAP_) with two Sheets v4 calls, and leaves the other nine
                             on the existing per-sheet reader. Measured here: 21 sheet reads -> 2 remote
                             calls + 8 per-sheet reads in production (9 where 50_ is absent).
SUPERSEDES                   nothing. R50, R51 and R52 are cut and unshipped; R53 follows them and all
                             four travel in the SAME paste set. Production is R49.
OWNERS                       42_api_v1_recommendation_workspace.gs        (RECO_WS_BUILD_VERSION_) — NEW STAMP
                             63_api_v1_system_health.gs                   (SYS_BUILD_VERSION_)
CARRIED                      01_ stays R52. 03_ stays R52. 00_ stays R51. 74_ stays R51. 66_ stays R49.
                             61_ stays R47. 60_ stays R45 — it is READ FROM, not changed: R53 reuses its
                             date map and its helpers rather than copying either.
ACTION CONTRACT              UNCHANGED at 20. No route, no action, no request field and no response field
                             of the business payload moved. `meta.canonicalRead` is ADDITIVE diagnostic.
HANDLER VERSION              UNCHANGED at fm5-r4ui-r5e, deliberately. That symbol names the ANSWER
                             CONTRACT, and the browser's session cache keys on it: bumping it would
                             discard every cached answer to announce a change no answer can show. The
                             file's own identity moves instead, in RECO_WS_BUILD_VERSION_.
MODULE MANIFEST              42_api_v1_recommendation_workspace.gs ENTERS SYS_MODULE_BUILD_STAMPS_ for the
                             first time. It has owned the recommendation read for its whole existence
                             with no row here. From R53 a stale copy is no longer merely old code: beside
                             an R53 bundle it returns the SAME numbers while spending twenty-one sheet
                             reads, which a contract comparison cannot see at all.
ADVANCED SERVICE             42_ becomes the SECOND Product runtime file to call Sheets v4 — the first
                             since 60_ at R44 — and that is why this is its own cut rather than a rider
                             on R52: the R4D-D2 suite refuses a consumer that arrives without a round.
                             IT IS NOT A HARD DEPENDENCY. Unlike 60_, whose PRIMARY read needs the
                             service, 42_ checks every prerequisite (service, 60_'s helpers, bundle
                             `only` capability, spreadsheet timezone) and routes back to the
                             twenty-one-sheet read when any is missing. Worst case is today's speed.
BUNDLE                       REBUILT. assets/js/core/supply-planning-production-source.js gains
                             `config.only` (opt-in, subtractive, refuses an unknown key).
                             KM_BUNDLE_CONTENT_HASH_
                             3de64364ba358468c39142aac212d663b41075f454dc6d86218fc066cdbc7e25
                             -> 0e40bada359bccd27da12117a792ae167fe84db732bb0e2dd56b7e29315acaa8.
EDITOR-APPLIED               none. appsscript.json UNCHANGED — Sheets v4 was enabled at R44 and no OAuth
                             scope moves. Verified against the file in this commit, not assumed.
FRONTEND                     UNCHANGED, AND THE CACHE TOKEN DOES NOT ROTATE. No file under assets/js/
                             pages, assets/js/api, index.html or app.js is touched by this release. R51
                             set the precedent in the other direction: rotating a token for a release
                             that changed no served byte asserts a frontend change that did not happen,
                             and every browser would re-download an identical bundle. The accept-list
                             `_IR_RECO_CACHE_HANDLERS` is correspondingly untouched, because the handler
                             version it gates did not move.
GS LOAD SURFACE              4,609,902 -> 4,629,739 bytes (+19,837) against the ceiling of 4,630,000
                             approved for this round. 261 bytes remain. Measured on LF-normalised
                             working-tree bytes, the same quantity `git show <rev>:<file>` yields under
                             core.autocrlf=true, and the method reproduces 4,609,902 exactly at BASE.

APPS_SCRIPT_SYNC_REQUIRED    42_api_v1_recommendation_workspace.gs
                             63_api_v1_system_health.gs
                             90_generated_supply_planning_bundle.gs   (BUNDLE_REBUILD_REQUIRED)

STATUS AT CUT                PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carries R53, no
                             Web App version exists for it, and Production is NOT R53 — Production is R49.
```

### Why the batch is a split and not a sweep

Under `UNFORMATTED_VALUE` + `SERIAL_NUMBER` a date and a number are the same value on the wire. `getValues()`
could tell them apart because the Sheet told it; `batchGet` cannot. 60_ answered that at R44 with
`SIR_B1_DATE_MAP_` — a DECLARED, never-inferred, per-column map, validated against the live reader over 41
columns and five pairs, and watched by a drift detector.

R53 batches **only** the canonical tables already in that proven map, and asks for membership at runtime
through `sirWsIsB1Table_` rather than copying the list. The other nine stay on the per-sheet reader and are
therefore unchanged by construction. **42_ declares no date columns of its own**: promoting a table into the
batch means adding it to 60_'s map, under 60_'s drift detector, after a live census — never a second list in
a second file that nobody validated.

### One table is no longer read at all, and that is not a saving taken on faith

`replenishment_demand_allocation_rules` was read from the Sheet and then overwritten, unconditionally, by
`warehouseAllocationSnapshot_()` — the Script-Property blob 50_ owns — before anything read it. The Sheet tab
is retired. R53 skips that read, guarded on the SAME condition as the override, so a runtime without 50_
still reads it. `meta.tablesRead` therefore reports 20 rather than 21 in production: that number counts what
was read, so 21 would have been the inaccurate answer.

### What a failed batch costs, stated as a cost

A fallback pays for the failed batch **and then** the full twenty-one-sheet read, so a request that falls back
is **slower than it would have been without this release**. That is the right trade for a transient fault and
the wrong one for a standing condition, which is why `RECO_WS_CANON_MAX_FALLBACK_` is 1: a second attempt in
the same execution is refused by name (`CANONICAL_BATCH_FALLBACK_EXHAUSTED`) rather than buying the same loss
twice. `meta.canonicalRead.fallback.batchMsWasted` reports the loss instead of hiding it. Only the transient
classes fall back at all; a permission or schema fault fails closed, because a deployment error that quietly
becomes a permanent slow path is the one outcome a performance change must never buy.

## S8-B3-R3-CP2V-R3 — CORRECTION INSIDE THE UNSHIPPED `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R53` CUT

```
BASE    4addbb04   R53 is CUT, NOT SYNCED, NOT DEPLOYED, so this correction lands INSIDE it rather than
                   as a new release. That is the narrow exemption the stamp gate already names: a file
                   edited after an UNSHIPPED cut keeps its stamp and is REPORTED, not marched forward.
                   Nothing here is a new capability - R53's own claims are being made true.
SCOPE   42_api_v1_recommendation_workspace.gs ONLY. No bundle rebuild (no assets/js/core file changed),
        no 63_ change, no manifest change, no stamp move, no action, no formula, no frontend byte.

WHAT WAS WRONG IN THE CUT, AND IS NOW FIXED

  1. A MALFORMED CALL-1 REPLY WAS READ AS "TWELVE TABLES DO NOT EXIST".
     `present` was built from the metadata reply and anything absent from it became
     SOURCE_NOT_AVAILABLE. A reply that was null, had no `sheets`, had a non-array `sheets`, an empty
     `sheets`, or an entry without a usable title therefore condemned every batched table as missing
     while the handler answered from the remaining nine. Measured against the cut: 12 tables reported
     SOURCE_NOT_AVAILABLE, no refusal, no error. Now validated before use and refused by name as
     CANONICAL_BATCH_MALFORMED_METADATA. A WELL-FORMED catalogue that genuinely omits one optional
     sheet still reports exactly that sheet - the refusal is about an unreadable reply, not an absent
     table, and a test pins the difference so "refuse on anything unexpected" cannot pass for it.

  2. A SHEET WITH USED ROWS BUT NOTHING IN THEM WAS REPORTED MISSING.
     batchGet omits trailing empty rows, so a sheet whose only used row is blank - empty cells, or
     formulas returning the empty string - returns no `values`, exactly like a sheet with no used rows.
     The cut collapsed the two into MISSING_SNAPSHOT. getDataRange() distinguishes them: the first is a
     PRESENT table with blank headers and no data rows that raises NO issue, and MISSING_SNAPSHOT is a
     source fault a consumer may fail closed on. Such ranges are now resolved through the UNCHANGED
     per-sheet reader, which already draws that line, so the two cannot drift.
     BOUNDED: it runs ONLY for ranges that came back empty. A healthy read still costs two remote calls
     and nine per-sheet reads, asserted directly; one blank-but-used table costs exactly ONE more.

  3. PER_SHEET DID NOT SAY WHY. `canonicalRead.notBatchedReason` now names the missing prerequisite -
     ADVANCED_SHEETS_SERVICE_UNAVAILABLE, DATE_MAP_HELPERS_ABSENT, BUNDLE_SUBSET_READ_UNSUPPORTED,
     SPREADSHEET_TIMEZONE_UNAVAILABLE, NO_PROVEN_DATE_MAP_TABLES, KMPS_READER_ABSENT - or
     PRE_READ_INJECTED when the Gap batch supplied the read. Three different repairs that looked
     identical from outside now look different.

  4. `computeMs` CLAIMED MORE THAN IT KNEW and is renamed `afterReadMs`. It is serverDurationMs minus
     the canonical read, so every other I/O the handler performs lands in it - Script Property lookups,
     openTarget, the allocation config blob - and calling it "compute" invites a reader to blame the
     calculation for what may be another read.

WHAT WAS MISSING FROM THE CUT'S EVIDENCE, AND IS NOW COVERED

  5. THE EU ROLL-UP HAD NO SUCCESS CASE. R53 pinned the EU REFUSAL (SALES_BASIS_UNAVAILABLE when no
     member rows exist) and a single European market, and neither exercises AGGREGATION - the one thing
     an EU scope does that no other scope does. KMCID.sourceCountriesForScope('EU','Amazon') is
     IT+DE+ES+FR; with each member contributing 10 units/day the region's rate is their SUM, 40. That
     is now asserted on the baseline, proved non-vacuous against a single member giving 10, compared
     across both transports, and guarded against a US row leaking into the region.

GS LOAD SURFACE   4,629,739 -> 4,629,837 (+98), ceiling 4,630,000, 163 bytes spare. The repairs cost
                  ~4,750 bytes and were paid for entirely out of THIS ROUND'S OWN PROSE plus one real
                  simplification: the empty-range resolution and the nine-table read are now ONE
                  delegated call instead of two. No module retired, no unrelated file compressed.

STATUS            UNCHANGED: R53 is PREPARED, NOT SYNCED, NOT DEPLOYED.
```

### The acceptance protocol, corrected

The R53 entry's acceptance guidance was wrong in two ways and is replaced by this.

**Only a SUCCESSFUL SERVER RESPONSE may be used to accept the read path.** A refusal, a blocked line or a
cached answer says nothing about which transport ran. Read `meta.canonicalRead` on a response whose
`success` is true and whose `canonicalRead.mode` is present.

**A hard reload does NOT clear the session cache.** The recommendation cache lives in `sessionStorage`
under `km_ir_reco_cache_horizonBasis.v2`, keyed per site. `sessionStorage` survives a reload — including a
hard one — and is cleared by closing the tab, by opening a new tab, or by clearing site data. An acceptance
run that only reloads is very likely measuring a cache hit.

**A cached answer that carries no `canonicalRead` does NOT mean an old deployment.** It means the answer
predates this release, which is exactly what a cache is for. The previous entry's claim — "block absent → a
pre-R53 42_ is deployed" — is WITHDRAWN: it is true only of a response that came from the SERVER on this
request. `_irRecoAnswerSource_()` reports `source: 'SERVER' | 'SESSION_CACHE' | 'NONE'`, and only `SERVER`
licenses any conclusion about the deployment.

So the order is: confirm `source === 'SERVER'` **first**, then read `canonicalRead`.

| reading (on a SERVER response) | what it means |
|---|---|
| `mode: BATCH`, `remoteCalls: 2` | R53 running as intended |
| `mode: PER_SHEET` + `notBatchedReason` | running, not faster; the reason names the repair |
| `mode: FALLBACK` + `fallback.reason` | this request was **slower** than before R53; `batchMsWasted` is the loss |
| `mode: INJECTED` | the Gap batch supplied the read; this handler chose no transport |
| block absent **on a SERVER response** | a pre-R53 42_ is deployed |
| block absent on a `SESSION_CACHE` response | **nothing** — re-run after clearing session storage |

`readMs` is the bytes; `normalizeMs` is inside it; `afterReadMs` is everything else the handler did, which
is **not** the same as calculation time.

### R53 minimal deployment dependency set

Derived from `git diff` rather than restated: this round's files from `1e2f8dae..HEAD`, the span from the
last SHIPPED base `e583057`.

**Changed by R53 itself — three files:**

```
42_api_v1_recommendation_workspace.gs      RECO_WS_BUILD_VERSION_ = …-R53
63_api_v1_system_health.gs                 SYS_BUILD_VERSION_     = …-R53
90_generated_supply_planning_bundle.gs     KM_BUNDLE_CONTENT_HASH_ = 0e40bada…  (BUNDLE_REBUILD_REQUIRED)
```

**CARRIED — changed in an earlier cut that is also unshipped, so they must be verified on site.** Each is
listed with the stamp a correctly synced copy declares. This list is NOT an instruction to sync anything
new: it is the set whose deployed copy must be CHECKED, because R53 cannot be assumed complete beside a
stale one.

```
01_router.gs                               …-R52      03_master_data_handlers.gs        …-R52
00_config.gs                               …-R51      74_api_v1_overseas_allocation…    …-R51
66_api_v1_request_order_send.gs            …-R49      61_api_v1_weekly_ai_plan.gs       …-R47
60_api_v1_inventory_replenishment…         …-R45      22_shipment_dispatch_handlers.gs  …-R37
05_overseas_inventory_handlers.gs          …-R35      21_factory_inventory_handlers.gs  …-R35
11_shipping_plan_handlers.gs               …-R34      12_shipment_handlers.gs           …-R34
14_fc_write_handlers.gs · 17_carrier_handlers.gs · 20_campaign_write_handlers.gs
43_api_v1_gap_materialization.gs · 47_api_v1_recommendation_generation.gs
57_api_v1_shipment_workspace.gs · 58_api_v1_fc_summary_workspace.gs · 73_api_v1_pricing_write.gs
```

`appsscript.json` is in the span (Sheets v4 was enabled at R44) but is NOT changed by R53. It is
editor-applied, not pasted.

**PRODUCTION STATE: UNKNOWN.** No probe was run this round and no evidence of the deployed state exists in
this repository. The R52 entry records "Production is R49", but that is an intent recorded at R52's cut, not
a measurement of today. Only a live `system.health` probe can answer it, and until one is run the correct
entry is UNKNOWN for: which release Production carries, which of the carried files are already synced, and
whether the Sheets v4 advanced service is enabled on the deployed project.

**No manifest expectation was lowered and nothing outside R53 was synced.** If the paste set has to grow
beyond the three files plus verification of the carried list, that is a separate decision and is reported
before it is taken.

### CP2W addendum — measuring the four segments WITHOUT changing a byte

R53 is not deployed, so none of this has been run; it is the protocol to run once it is. It needs **no
code change**, which matters: instrumenting the page would be a frontend source change and would owe a
published-token rotation under the standing policy, for a measurement that DevTools already affords.

**Step 0 — get a SERVER answer, not a cached one.** `sessionStorage` survives a reload, including a
hard one. Close the tab (or clear site data), reopen, then run `_irRecoAnswerSource_()` and require
`source === 'SERVER'`. A cached answer carries no `canonicalRead` and proves nothing about the
deployment.

**Step 1 — the two server segments.** In DevTools → Network, open the `recommendation.workspace.get`
response and read `meta.canonicalRead`: `readMs` (the bytes, with `normalizeMs` inside it) and
`afterReadMs`. `afterReadMs` is `serverDurationMs` minus the canonical read, so it contains every
other I/O the handler performs — Script Property lookups, `openTarget`, the allocation config blob —
and is **not** calculation time. Record `mode` and, if it is not `BATCH`, `notBatchedReason`.

**Step 2 — frontend landing.** The same Network row's total time minus `meta.serverDurationMs` is the
network + parse leg. The page cannot do this subtraction itself: the recommendation read keeps only
`requestId` and `dataVersion` from the envelope, so `serverDurationMs` is discarded on this request
(D-S8-B3-128).

**Step 3 — Search → Avg painted.** Record a Performance profile across the click. There is no User
Timing mark to anchor it — `KM.perf.markInteraction` has no call sites — so this segment is read off
the flame chart between the interaction and the paint that fills the Avg cells, and it is an
**approximation**, which is how it must be reported.

**Only then is the largest cost known.** Until these four numbers exist, any repair is chosen by
which segment happened to be measurable.

### CP2X addendum — a FRONTEND-only round, and the token it had to spend

**No `.gs` file changed.** The Apps Script load surface is unchanged at **4,629,837 / 4,630,000**, the
R53 sync list is unchanged, and this round adds nothing to it. What changed is the published site.

**APPLICATION TOKEN ROTATED — `r60-readstate-20261016` → `r61-scopereuse-20261018`.** The check, not the
note: `origin/main` is `eb48e4c3` and `d097bb13` (which introduced r60) IS an ancestor of it, so r60 has
been served. `index.html` (54 entries) and `app.js` (13) move together. The CSS token does not move.

**Why it is load-bearing this time.** The page is requested as
`assets/js/pages/inventory-replenishment.js?v=<token>`. A browser holding r60 keeps the page whose session
cache loses `calculationDate` on every restore and cannot say why a lookup missed. Publishing the new
bytes under the old token would ship nothing while appearing to ship everything.

**Files the USER publishes (GitHub Pages path, after review):** `index.html`, `assets/js/app.js`,
`assets/js/pages/inventory-replenishment.js`. Nothing is pasted into Apps Script for this round.

**Acceptance, once published.** Hard reload is not enough — `sessionStorage` survives it. Close the tab or
clear site data, reopen, then:

1. `_irRecoAnswerSource_()` must report `source: 'SERVER'` before anything else is read.
2. `revision` on that answer carries all five fields, `calculationDate` among them, and
   `revisionComplete: true`. Navigate away and back: the restored answer reports `SESSION_CACHE` and
   **the same `calculationDate`** — that round trip is the defect this round fixed.
3. `_irRecoReadDiag_()` names the cache decision. On the first visit after publishing expect
   `MISS / REVISION_ABSENT_LEGACY` once per site — pre-contract records being retired — then `HIT`.
   `NOT_STORED / HANDLER_NOT_ACCEPTED` means the deployed 42_ is not `fm5-r4ui-r5e` and caching is OFF
   entirely; that is a deployment finding, not a page fault.
4. `_irRecoReadDiag_().timing` gives `searchToDispatchMs`, `responseMs`, `domUpdateMs`. **`responseMs` is
   server AND network** and must never be quoted as server time; the server split stays on
   `meta.canonicalRead`.

**Still outstanding and NOT answered here:** the four-way cost split needs the Owner deployment
measurement referenced as "313", which was not supplied. No optimisation was chosen (D-S8-B3-132).

---

## S8-B3-R3-CP2X-R2 — the token is NOT rotated this round, and the reason is the rule

`r61-scopereuse-20261018` stays. The D-S8-B3-63 rule is that **a token is spent when its bytes have been
SERVED**, and it is checked against the remote rather than read off the ledger:

```
git ls-remote origin main            -> eb48e4c35fad...
git merge-base --is-ancestor 7b945222 origin/main   -> NOT an ancestor
```

`7b945222` is the commit that introduced r61. It has never reached `origin`, so no browser has ever been
served a `?v=r61-scopereuse-20261018` asset, so the token is unspent and this round's page change ships
under it. Rotating now would burn a token for nothing and would move `bootScriptBytes` for nothing.

**If the three files are published without CP2X-R2**, r61 becomes spent at that moment and the next page
change needs r62. The check above is cheap and must be re-run at publish time rather than inferred from
this note.

`bootScriptBytes` is unchanged (3,813,599): no token moved, and `assets/js/pages/inventory-replenishment.js`
is router-loaded and is not a boot script.

**GS load surface unchanged at 4,629,837 / 4,630,000 (headroom 163)** — §A/§B/§C touch no `.gs` file.

---

## S8-B3-R3-CP2X-R3 — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R54` — A RELEASE IDENTITY, AND NOTHING ELSE

```
BASE    781b9f54  S8-B3-R3-CP2X-R2. R50, R51, R52 and R53 are CUT but NOT SYNCED and NOT DEPLOYED.
        Production is R49 according to this ledger; see VERIFIED / NOT VERIFIED below.
BRANCH  feature/product-strategy-board-p0
DATE    2026-10-19
SCOPE   NO behaviour changes in this round. One module stamp, one release, two manifest rows, one
        ledger append. The runtime change this cut exists to carry landed in CP2X-R2 and is already
        proven output-equivalent. No DB schema, no table, no action, no formula, no eligibility, no
        allocation, no timeout, no schedule, no cache policy. Action contract stays 20. Transport
        contract stays 1. The generated bundle is NOT rebuilt.

RELEASE ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R54
PURPOSE                      CP2X-R2 changed 42_api_v1_recommendation_workspace.gs AFTER the R53 cut:
                             the three per-SKU helpers now take `read` and share the per-request row
                             cache, taking one request of 24 SKUs from 264 row-object conversions to 7
                             with byte-identical output. A runtime change landing after a cut needs its
                             own cut. Without R54 the deployed tree could not be told apart from R53 by
                             anything a client can read.
SUPERSEDES                   nothing. R50, R51, R52 and R53 are cut and unshipped; R54 follows them and
                             all five travel in the SAME paste set. R53 being unsynced is NOT a reason
                             to reuse its id — the same rule R53 records about R52, and R49 about the
                             R47/R48 pair it absorbed.
OWNERS                       42_api_v1_recommendation_workspace.gs        (RECO_WS_BUILD_VERSION_)
                             63_api_v1_system_health.gs                   (SYS_BUILD_VERSION_)
CARRIED                      01_ stays R52. 03_ stays R52. 00_ stays R51. 74_ stays R51. 66_ stays R49.
                             61_ stays R47. 60_ stays R45. 43_ is unchanged since R50. None of them
                             moved this round and marching any of them to R54 would erase the one fact
                             a per-module stamp carries.
ACTION CONTRACT              UNCHANGED at 20. No route, no action, no request field, no response field.
HANDLER VERSION              UNCHANGED at fm5-r4ui-r5e, and this one is load-bearing. That symbol names
                             the ANSWER CONTRACT and the browser session cache keys on it
                             (_IR_RECO_CACHE_HANDLERS). CP2X-R2 §D is proven output-equivalent — same
                             planning model, same sales rate, same contamination facts, for every SKU —
                             so bumping it would discard every cached answer in every open session to
                             announce a result that is byte-identical. The FILE's identity moves
                             instead, in RECO_WS_BUILD_VERSION_. That is exactly the split R53
                             introduced this symbol pair for.
MODULE MANIFEST              Two rows move and no row is added or removed: 42_'s expected stamp and
                             63_'s own. 90_'s expected content hash is UNTOUCHED.
GENERATED BUNDLE             NOT REBUILT. No file under assets/js/core/ changed since R49 was cut
                             (`git diff --name-only d2989491 HEAD -- 'assets/js/core/**'` is empty), so
                             there is nothing for a rebuild to pick up and KM_BUNDLE_CONTENT_HASH_ still
                             matches the bundle on disk. NOT REBUILT IS NOT THE SAME AS NOT COPIED —
                             see the sync set.
GS LOAD SURFACE              4,629,942 / 4,630,000 — UNCHANGED, delta exactly 0 bytes. 'R53' and 'R54'
                             are the same length, so all five stamp edits are byte-neutral.
                             THE CEILING COST THIS ROUND ITS IN-FILE LOG ENTRY, and that is reported
                             rather than absorbed. 63_ maintains a running per-round comment explaining
                             why each stamp moved, and 42_ carries the same for its own. Two such lines
                             measured +174 bytes, which does NOT fit in the 58 bytes of headroom
                             (4,630,116 against a 4,630,000 ceiling). No budget was granted to make them
                             fit. The reasoning is recorded in assets/tests/_release-order.js — which is
                             test-enforced and carries no load surface — in this entry, and in
                             D-S8-B3-151. A reader of 63_ will not find it beside the symbol.
                             THIS IS NOW A STANDING CONSTRAINT, NOT A ONE-OFF: CP2X-R2 §D already had to
                             move its commentary out for the same reason. At 58 bytes the ceiling is
                             binding on DOCUMENTATION, and the next .gs change of any size is blocked
                             before it starts. Raising it is the Owner's call and is NOT assumed here.

VERIFIED                     • R54 is appended to OWNER_STAMPS in assets/tests/_release-order.js, at the
                               end, as the append-only index order requires.
                             • 42_ and 63_ both declare R54, both manifest rows expect R54, and both
                               files' last change and stamp rotation are the SAME commit, which is what
                               the E4 stamp gate requires.
                             • RECO_WS_HANDLER_VERSION_ is still fm5-r4ui-r5e.
                             • KM_BUNDLE_CONTENT_HASH_ is unchanged and still matches the bundle.
NOT VERIFIED                 WHAT PRODUCTION ACTUALLY RUNS. This ledger says R49 and the repo agrees that
                             nothing since has been recorded as deployed, but a ledger records INTENT.
                             Only a live `system.health` says what the Apps Script project carries, and
                             none was taken this round. Every sync set below is therefore stated as a
                             function of the deployed release, with the command to recompute it once the
                             Owner reports one. If Production is NOT R49, the eight-file set below is
                             wrong in a direction this round cannot see.

STATUS AT CUT                PREPARED, NOT SYNCED, NOT DEPLOYED. No Apps Script project carries R54, no
                             Web App version exists for it, and Production is NOT R54.
```

### THREE BUILD PINS FOLLOW THE RELEASE, AND THEY ARE NOT IN `63_`

A release cut is not finished when `63_` and the module stamps move. Three diagnostics pins also declare
the release and are asserted equal to `SYS_DEPLOYMENT_RELEASE_`, and the first cut attempt missed all
three:

| pin | file | asserted by |
|---|---|---|
| `TEMP_E3_CENSUS_BUILD_` | `assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs` | BP3a |
| `R6R7_ACTIVATION_BUILD_` | same file | BP3, P7c |
| `S1_BUILD_` | `assets/tools/apps-script-diagnostics/TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs` | M4a |

All three are OUTSIDE the 78-file load surface, so moving them costs **0 bytes**. The failure is loud and
specific — *"a pin that lags a release refuses a healthy deployment"* — and it is the right failure: a
census that expects R53 while the deployment reports R54 would refuse a healthy deployment and call it a
mismatch.

**`S1_BUILD_` was nearly left behind for a plausible wrong reason.** Its own suite carries a comment
warning against copying the release literal, which reads like an instruction not to move it. That comment
is about the SUITE — which derives the value from the census file instead of hard-coding it — not about
the census. `M4a` ties the census's reported `deployment_build` to `S1_BUILD_`, so the pin does follow the
release. Reading the comment and stopping there would have shipped a cut that fails.

**Found the hard way.** The first sweep of this cut aborted at 188/685 with a dirty worktree, because
files for a parallel workstream were created while it was running — the sweep rewrites and restores real
source files, so it refuses to continue against a tree that moved under it, and it was right to. The
three pin failures were in that partial run, and they were on **stderr**: stdout showed only the
40 "caught" mutant lines. Without `--evidence` persisting stderr the result would have been a bare
`NOT_CLEAN` with `MUTANTS_SURVIVED: 1` and no statement of which pin or which file.

### The sync set, and why it is eight files rather than three

The CP2V precheck asked whether syncing `42_`, `63_` and `90_` would be enough. **It is not**, and the
reason is that the question has two different answers depending on which one is being asked:

| question | answer |
|---|---|
| which `.gs` files did THIS ROUND change? | `42_`, `63_` |
| which `.gs` files does the deployed project need to become R54? | **eight** |

Production is R49 (per this ledger). R50, R51, R52 and R53 were all cut and never synced, so their
bytes are not in the project either. The paste set is everything that changed between the R49 cut and
R54:

```
git diff --name-only d2989491 HEAD -- 'assets/specs/active/apps-script/*.gs'
```

```
00_config.gs
01_router.gs
03_master_data_handlers.gs
42_api_v1_recommendation_workspace.gs
43_api_v1_gap_materialization.gs
63_api_v1_system_health.gs
74_api_v1_overseas_allocation_preview_job.gs
90_generated_supply_planning_bundle.gs
```

**`90_` is in the set although this round does not rebuild it.** Those two facts are independent: no core
module changed since R49, so there is nothing to regenerate — but the R51 rebuild has never been pasted
into the project, so the file still has to be COPIED. A sync that skips it leaves an R49 bundle under an
R54 manifest, and `KM_BUNDLE_CONTENT_HASH_` is exactly the gate that will refuse that.

**Recompute before pasting.** If the Owner's `system.health` reports a deployed release other than R49,
substitute that release's cut commit for `d2989491` and re-run the command above. Do not paste this list
on the strength of this entry.

### Acceptance after publishing — performance and cache

Run in this order. Steps 1–3 need no page; 4–6 are on the Inventory Replenishment screen.

1. **`system.health`** — `identity.build_id` and `deployment_release` must BOTH read
   `…-R6-R7-R54`, and `mixed_deployment` must be false. A `build_id` of R54 beside a module row still
   expecting R53 means the paste was partial; the manifest names the file.
2. **Module manifest** — in the same response, `42_api_v1_recommendation_workspace.gs` must report
   `RECO_WS_BUILD_VERSION_ = …R54`, and the `90_` row's content hash must match. A mismatch here is the
   un-copied bundle described above, not a code fault.
3. **Handler version** — `recommendationWorkspaceHandlerVersion` must still be **`fm5-r4ui-r5e`**. If it
   reads anything else, something bumped the answer contract and every browser session cache has been
   discarded for no behavioural reason. That is a defect, not a success.
4. **One real Search, one site, DevTools Network open.** On the `recommendation.workspace.get` response,
   `meta.canonicalRead.mode` must be `BATCH` with `remoteCalls: 2`. `FALLBACK` means this request was
   SLOWER than before R53 and `fallback.reason` says why. Record `meta.serverDurationMs` and
   `canonicalRead.afterReadMs` — R54's whole content is a reduction in the second of those, and this is
   the first deployment in which it can be observed at all.
5. **Cache reuse, counted rather than assumed.** In the console, `_irRecoReadDiag_()` after a SERVER
   answer must report `cache.outcome: 'STORED'`. Switch site, switch back, and read it again: it must
   report `'HIT'` with no new Network entry. `_irMatReadDiag_()` must show `readerCalls` greater than
   `networkReads`. If `cache.outcome` is `MISS / HANDLER_NOT_ACCEPTED`, step 3 was violated.
6. **Recalculation invalidates what it rewrote (CP2X-R2 §A2).** Note the Suggested Qty on site A, switch
   to site B and back — zero gap requests. Now run Recalculate, and visit the OTHER site: that visit MUST
   cost a real `inventoryReplenishmentGap.get`. A zero there means the page is serving rows the job
   replaced, which is the defect this round's predecessor closed.

**What none of this measures:** first load from cold on a real spreadsheet. The 3–5 second goal is not
claimed by any step above, and a SESSION_CACHE hit must never be reported as one.

---

## S8-B3-R3-CP2X-R4 — the token IS rotated this round, because the previous one was served

**APPLICATION TOKEN ROTATED — `r61-scopereuse-20261018` → `r62-revisitrestore-20261019`.**

The CP2X-R2 entry above left a standing instruction: *"If the three files are published without CP2X-R2,
r61 becomes spent at that moment and the next page change needs r62. The check above is cheap and must be
re-run at publish time rather than inferred from this note."* That is what happened, and the check was
re-run rather than inferred:

```
git ls-remote origin main                           -> 315b69da06a1...
git merge-base --is-ancestor 315b69da origin/main   -> IS an ancestor
```

`315b69da` is published, so `index.html` carrying `?v=r61-scopereuse-20261018` has been **served**. Under
D-S8-B3-63 the token is **spent** and can never be reused.

**THE WHOLE CO-DEPLOYED SET MOVED**, as the rule requires: **54 entries in `index.html` and 13 in
`assets/js/app.js`**, not the one file that changed. A half-rotated set leaves a browser holding some new
files and some old. Verified: zero occurrences of `r61-scopereuse` remain in either file.

**THE CSS TOKEN DOES NOT MOVE.** No stylesheet changed this round.

**Why a browser on r61 must not keep it.** `inventory-replenishment.js` no longer discards a completed
recommendation result when the page unmounts, restores the Marketplace options before the id so a
returning page is whole rather than half-restored, refuses a Search whose country and marketplace_id
disagree, and ends a superseded revalidation's own state. A browser left on r61 keeps the page that shows
a restored table with **Avg Sales and Days of Supply blanked** — the defect this round exists to remove.
Publishing without rotating would ship nothing.

**`bootScriptBytes` MOVED: 3,813,599 → 3,813,651, +52 bytes.** I first wrote here that it was unchanged
"because the token string is the same length". That was wrong, and the boot-byte census caught it:
`r62-revisitrestore-20261019` is **four characters longer** than `r61-scopereuse-20261018`, and app.js
carries the token **13 times** — 4 × 13 = 52. The figure is corrected rather than quietly restated,
because a byte census whose expected value is copied from the previous round is not a census.

`assets/js/pages/inventory-replenishment.js` is router-loaded and is not a boot script, so this round's
page change contributes nothing to that total; the whole +52 is the token.

### GS: ZERO

This round is **pure frontend**. The Apps Script load surface is **78 files / 4,629,942 bytes**, byte-for-byte
unchanged, headroom 58. No `.gs` file was touched, no formula, no calculation date, no schedule, no timeout,
and nothing was written to production.

### Sync set

**`APPS_SCRIPT_SYNC_REQUIRED`: none** — no `.gs` changed.

**GitHub Pages:** `index.html`, `assets/js/app.js`, `assets/js/pages/inventory-replenishment.js`.

### Post-publish acceptance (read-only; no Recalculate, no AI Support)

1. Hard-reload and confirm the page assets are requested as `?v=r62-revisitrestore-20261019`. A browser
   still fetching r61 has a cached `index.html` and is not running this round.
2. Search a site. Note Avg Sales, Days of Supply and Suggested Qty for one SKU.
3. Navigate to another page and back. **All three must still be the same numbers**, with no "Searching…",
   and **no new network request** for `recommendation.workspace.get` or `inventoryReplenishmentGap.get`.
   Blank Avg/DoS here is the defect returning.
4. Change only the Country, do not pick a Marketplace, leave and return. The page must come back on the
   **last searched** country *and* its marketplace — not the half-applied draft, and never a marketplace
   nobody chose.
5. With the restored selectors untouched, press Search. It must return the same site's result.
6. Set a Country and a Marketplace that belong to different countries. Search must **refuse**: no request,
   no change to the applied scope, no mixed-site table. `_irBootstrapDiagnostic_().last_refusal` names it.
7. `_irBootstrapDiagnostic_()` after a return: `mode: RESTORED`, `revalidating: false`, and either
   `revalidated: true` or `revalidate_superseded` naming why it stood down. A `revalidating: true` that
   never clears is the stale-flag defect returning.

---

## S8-B3-R3-CP2X-R4-R1 — the token is **NOT** rotated this round, because r62 has never been served

`r62-revisitrestore-20261019` was minted by CP2X-R4 and **has not been published**. Verified the way
D-S8-B3-63 requires — by asking the remote, not by reading this ledger:

```
git ls-remote origin main      -> 315b69da06a112e2046947821bb9506df1af425a
git merge-base --is-ancestor 5454da83 origin/main   -> exit 1   (NOT an ancestor)
```

So r62's bytes have never left this machine. A token is spent when its bytes have been **served**;
minting a second one for a change that will be published under the first would spend a token to buy
nothing and would make the ledger describe a release nobody received. **r62 stands**, and it now covers
CP2X-R4 **and** CP2X-R4-R1: `index.html` 54 references, `assets/js/app.js` 13, zero r61 remaining.

Because the token string is unchanged, `bootScriptBytes` is unchanged by the token — the page source
itself grew, and the boot census records the measured figure rather than an assumption. (CP2X-R4 asserted
"unchanged" here without measuring and was wrong by +52; it is measured every round now.)

### What changed

Pure front end. **GS increment 0** — the load surface is **78 files / 4,629,942 bytes**, byte-identical to
CP2X-R4. No `.gs` file, no formula, no calculation date, no schedule, no timeout and no production data
was touched.

- `assets/js/pages/inventory-replenishment.js` — the three boundaries CP2X-R4 left open:
  **§A** three-state scope validation (`VALID` / `UNVERIFIED` / `INVALID`), with `MARKETPLACE_INACTIVE`
  and `MARKETPLACE_NOT_IN_REGISTRY` named separately and an UNVERIFIED selection resolved by finishing
  the load through the existing registry loader before anything is applied;
  **§B** `_irRecoEnsureForRestoredScope_`, so a recommendation read abandoned in flight recovers on return
  (one re-read at most, **zero** when a settled result or a cached envelope is in hand) instead of leaving
  Avg Sales and Days of Supply dashed until a second Search;
  **§C** per-attempt bootstrap records bound to a mount generation, so a dead mount's callback can neither
  write into the live round nor repaint a page that has been left.
- `assets/tests/_cp2s-r2-inplace-dom-runner.js` — a seventh, retirable fixture site, a `status` field the
  registry payload never carried, `/__site-status`, `/__delay-ws`, `/__ws-extra`, `/__fail-next`, a
  server-side `respondedAt`, and thirteen new `--revisit` phases.
- `assets/tests/ir-scope-validation-and-restore-recovery-browser-s8-b3-r3-cp2x-r4-r1.test.js` — new, 109
  assertions, reading the current capture **and** a counter-example capture of the previous candidate.
- Two assertions corrected because they could not have fired: `ir-revisit-restore…cp2x-r4` **H3** read a
  camelCase diagnostic key that is never emitted; `presentation-state…f1b` **X1**'s mutation anchor moved
  with the record it mutates. `two-vertical-flow-closure` **C7**'s registry-loader count moved 6 → 7 and
  the seventh is named, because the number moved by a named caller being added rather than by another
  route to the registry appearing.

### Sync set

**`APPS_SCRIPT_SYNC_REQUIRED`: none** — no `.gs` changed.

**GitHub Pages:** `assets/js/pages/inventory-replenishment.js`. `index.html` and `assets/js/app.js` are
unchanged by this round and are already in CP2X-R4's set.

### Post-publish acceptance (read-only; no Recalculate, no AI Support)

These are **in addition to** CP2X-R4's seven steps above, which still apply.

8. Search a site, then change the Country only — leaving a Marketplace that belongs to the previous one —
   and press Search. It must **refuse by name**: no request, no movement of the applied scope, no
   mixed-site table. `_irBootstrapDiagnostic_().last_refusal.code` is
   `MARKETPLACE_COUNTRY_MISMATCH`.
9. Press Search on a freshly opened page **before the selectors finish populating**. It must not apply
   anything on the spot: it loads the scope list, re-checks the pair that was clicked, and then either
   searches it or refuses it. A result that appears for a pair nobody could have checked is the fail-open
   returning.
10. Search a site you have not opened this session and navigate away **while Avg Sales still shows `…`**.
    On return the two cells must fill in by themselves — `_irBootstrapDiagnostic_().reco_recovery` reads
    `REREAD_ISSUED` — with **no Search pressed**. `--` here is the defect returning.
11. Do the same for a site you have already loaded. `reco_recovery` must read `ALREADY_SETTLED` and there
    must be **no** `recommendation.workspace.get` at all. A re-read here would be a new cost, not a fix.
12. Navigate away and back twice in quick succession. `_irBootstrapDiagnostic_()` must describe the
    **current** mount: `record_mount_generation === mount_generation`. `stray_callbacks` may be non-zero —
    that is a dead attempt correctly standing down — but a record whose generation is behind the current
    one, still reporting `revalidated: true`, is the contamination returning.

None of these steps measures a real spreadsheet cold start: the evidence behind them runs against a local
stub, so request counts and cell values are demonstrable and durations are not.

### What the clean sweep found, and what it was

The sweep came back **688 / 686 clean / 2 not clean** on the first pass, read from `not_clean_suites`
in the JSON rather than from the console tail. Both were mine and both were real:

- `ir-reveal-callback-scope-s8-b3-r3-cp2r` **E1** — the page source changed, so the twelve-run timing
  batch no longer described the file on disk and the suite said so. Re-taken, both arms, one build,
  alternating inside each pair, on a quiet machine: **−96.8 / −100.6 ms, 6 of 6 and 6 of 6**, no
  outlier at all, shipped source restored and hash-verified. Recorded as the eleventh batch of that
  design in `docs/evidence/cp2r-reveal-scope/README.md`.
- `inventory-alloc-draft-panel-lifecycle` **C2** — the assertion sliced a **fixed 600 characters** after
  the unmount marker to find `_removeLegacyBodyAllocPanel()`. Three comment lines added at the top of
  the hook pushed that call past 600, so the guard failed for a reason unrelated to the behaviour it
  protects. A larger number would only move the day it happens again; the window is now bounded by the
  hook's own closing brace, so it grows with the hook and still cannot reach code outside it.
  Mutation-proved after the change: removing the call from the unmount still fails C2.

---

## S8-B3-R3-CP2X-R4-R2 — the token is **NOT** rotated this round either, and for the same reason

`git ls-remote origin main` → `315b69da06a112e2046947821bb9506df1af425a`.
`git merge-base --is-ancestor 5454da83 origin/main` → **exit 1 (NOT an ancestor)**.

r62’s bytes have still never left this machine. A token is spent when its bytes have been **served**
(D-S8-B3-63), and minting a second token for a change that will be published under r62 would spend one
without buying anything. **r62 stands**, and now covers CP2X-R4-R1 and CP2X-R4-R2 together.

**GS delta: 0.** No `.gs` file changed. The Apps Script load surface is unchanged at **78 files /
4,629,942 bytes**, measured with `gs-load-surface-audit.js` over the committed blobs.

`APPS_SCRIPT_SYNC_REQUIRED`: **none**.
`GITHUB_PAGES_FILES`: `assets/js/pages/inventory-replenishment.js` (only). `index.html` and
`assets/js/app.js` did not change this round and are already in the CP2X-R4 list.

### What shipped

One behaviour change, in the continuation after an UNVERIFIED scope wait. R1 loaded the authority,
re-checked the pair that had been **clicked**, and then continued by calling `searchReplenishment()` —
whose first act is to read the selectors. The verified snapshot was therefore discarded at the one
instant it mattered. Measured on the R1 candidate: Search pressed for JP/Rakuten, the marketplace moved
to JP/Yahoo during the wait and never searched, **Yahoo applied, 37.0 on screen**. And with the page
left during the wait, a scope was applied to an **unmounted** `ops-section`, with a repaint.

The read half of Search is now `_irRunVerifiedSearch_(pending)` — handed a pair, never reading the
selectors — and the wait is a record bound to the clicked pair, the Search sequence and the mount
generation. `unmount` ends a pending verification, because a record left standing would make the next
Search do nothing at all, silently.

### Post-publish acceptance (read-only; no Recalculate, no AI Support)

These are **in addition to** CP2X-R4’s seven steps and CP2X-R4-R1’s steps 8–12, which all still apply.

13. Press Search while the selectors are still populating, then — before anything appears — change the
    Marketplace to a different site and **do not press Search again**. The table must keep showing the
    site it last searched. A table that moves to the site you merely selected is the §1 defect
    returning. `_irBootstrapDiagnostic_().verify_outcome` reads `SELECTION_CHANGED` and
    `last_refusal.code` reads `SCOPE_SELECTION_CHANGED`.
14. Do the same but change **nothing**. The Search must complete on the pair you clicked, and
    `verify_outcome` must read `CONTINUED` with `verify_scope` naming that pair. A refusal here would
    mean the fix had been bought by refusing after every wait.
15. Press Search the same way and **navigate away** before anything appears. Nothing may be applied or
    drawn while you are off the page; `verify_outcome` reads `CANCELLED_UNMOUNTED`. Come back and press
    Search normally — it must work. A button that does nothing, with no message, is a verification latch
    that was never released.
16. Press Search with a Marketplace that belongs to a different Country while the page is still
    starting. The list loads, the Marketplace select is rebuilt and legitimately empties, and the
    refusal must still be `MARKETPLACE_COUNTRY_MISMATCH` — **not** `SCOPE_SELECTION_CHANGED`. The page
    emptying its own select is not you changing your mind, and a cancellation here would replace a named
    refusal with a shrug.

As before, none of these steps measures a real spreadsheet cold start: the evidence behind them runs
against a local stub, so request counts, repaint counts and cell values are demonstrable and durations
are not.

### What the clean sweep found, and what it was

First pass: **689 / 685 clean / 4 not clean**, read from `not_clean_suites` in the JSON rather than from
the console tail. All four were the same thing and all four were mine: `ir-expand-four-point-latency`,
`ir-inplace-update-acceptance`, `ir-read-state-transitions-browser` and `ir-scope-reuse-browser` each pin
`inventory-replenishment.js` in the capture they read, and the page changed — `A2` said so by name and by
hash (`324eb2ca5d26be60` → `c0ffbce98e0e9327`). All four captures were re-taken against the shipped
source and all four suites pass. This is the ledger’s own rule working: a capture is evidence about a
build, and it stops being evidence the moment that build moves.

Four assertions were also found that could not have failed, and are recorded as D-S8-B3-169:
`s3-r2` **J4/J5** extracted the wrong function and matched against the **empty string** — J5 asks whether
a guard is absent, and it is absent from nothing, so it reported its mutant caught while examining
nothing; the capture’s `sources` list never pinned the **runner**, so "both captures came through the
same harness" was `undefined === undefined` in two suites; and the R1 suite’s `G6` pinned a
**session-wide** stray-callback total that is timing-dependent — measured at 0 in one capture and 2 in
the next against the same page source.

### Timing

The cp2r twelve-run batch was re-taken because the page changed: **−103.4 / −102.8 ms, 6 of 6 and 6 of
6**, both arms on one build, alternating inside each pair, shipped source restored and hash-verified
(`c0ffbce98e0e9327`). One outlier, **in the unscoped arm** — the direction that flatters the conclusion —
kept and stated, and it does not carry its pair: the per-run figure is the median of five, which the
outlier cannot move. Twelfth batch of that design; the magnitude is still not the finding.

---

## S8-B3-R3-FX1-R4 — RELEASE `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55` — THE FX RATE BOOK, AND THE CREATION PATH THAT READS IT

**STATUS: CUT, NOT DEPLOYED. NOT PUSHED. NOT SYNCED.** This entry records intent. Nothing in it has
been applied to any Apps Script project, no Script Property has been written, no rate has been
initialised and no price batch has been run. **NOT DEPLOYED.**

### Why R55 exists rather than R54 absorbing it

R54 is **cut**. A runtime change landing after a cut needs its own cut — the same rule R54 records
about R53 and R53 about R52. And this one is the strictest version of the case: `75_` is a **new file**
that two routed actions dispatch into, so a project that copied `01_router.gs` and missed `75_` answers
both FX calls with a reference error and reports a healthy deployment while doing it.

### What moves

| file | what changed | stamp |
|---|---|---|
| `75_api_v1_fx_rate_book.gs` | **NEW.** The stored coefficients, their change history, the capacity guard, the version compare-and-swap and the fail-closed write authority. | R55 |
| `01_router.gs` | `fxRateBook.get` joins the GET read table; `fxRateBook.save` is POST-only. | R52 → R55 |
| `04_marketplace_forecast_import.gs` | The creation contract: a cross-currency row is priced from the book, read **once per import**. | R24 → R55 |
| `63_api_v1_system_health.gs` | Release id, own build, the three stamps above, the manifest row for `75_`, and the two contract versions. | R54 → R55 |

`SYS_DEPLOYED_ACTION_CONTRACT_VERSION_` **20 → 21** (one bump per release that changes the action set).
`SYS_REQUIRED_ACTION_LIST_VERSION_` **16 → 18** (two bumps, because the registry gained two ROWS — these
are different numbers with different rules, and the staged patch moved the second by one until the
release-stamp gate said so).
`SYS_TRANSPORT_CONTRACT_VERSION_` unchanged at 1. `90_` is **not rebuilt**: nothing under
`assets/js/core/` changed, so its content-hash row is untouched.

### `04_` returns to ownership after thirty-one releases, and why that is not churn

`04_` has carried R24 since PRICING-R4E and has been held out of ownership deliberately ever since,
because a stamp names the round a file last **changed** in. R55 moves it because the file really
changed: a cross-currency SKU is now priced from the stored book instead of being born blank.

The shape of that change is the part worth recording. FX1-R3 gave `04_` a reader that took the io and
read the Script Property itself; called from inside the per-row planner that is a Property read **per
row**, and a save landing mid-import would have priced part of a batch at one `doc_version` and the
rest at another, with nothing in the result saying where the line fell. The import now takes **one**
snapshot before the row loop, every row resolves from it, `pricingNewRowPlan_` stays pure, and the
batch reports the version it was priced at.

### GS load surface

```
before   78 files   4,629,942 bytes
after    79 files   4,666,351 bytes
ceiling              4,668,000 bytes   (Owner-approved, FX1-R4)
VERDICT  UNDER by 1,649 bytes
```

| file | bytes |
|---|---:|
| `75_api_v1_fx_rate_book.gs` (new) | +31,253 |
| `04_marketplace_forecast_import.gs` | +2,516 |
| `63_api_v1_system_health.gs` | +1,742 |
| `01_router.gs` | +898 |
| **TOTAL** | **+36,409** |

Measured, not estimated: `node docs/planning/fx1-r1-staging/measure-fx1-r4-integration.js` applies the
whole integration **including the R55 cut**, counts the same bytes `gs-load-surface-audit.js` counts,
and restores the tree. `SIZE_BUDGET` in `apps-script-load-surface-slim-r1.test.js` moves 4,630,000 →
4,668,000 to match the Owner-approved ceiling, and the raise is spent on the four named files above.

FX1-R3 measured this same feature at **4,663,070** against a **4,662,000** ceiling, reported the
1,070-byte overrun and stopped rather than trimming `75_`’s commentary to fit — five of that round’s
ten mutants guard lines whose reason lives only in those comments.

### APPS_SCRIPT_SYNC_REQUIRED

**Four files.** `01_router.gs`, `04_marketplace_forecast_import.gs`, `63_api_v1_system_health.gs`, and
`75_api_v1_fx_rate_book.gs` (new).

Measured rather than reasoned about:

```
git diff --name-status ab361ffb HEAD -- assets/specs/active/apps-script/
M  01_router.gs      M  04_marketplace_forecast_import.gs
M  63_api_v1_system_health.gs      A  75_api_v1_fx_rate_book.gs
```

#### What this paragraph said before, and why it was wrong twice (FX1-R4-R1 §1)

> The paste set is everything between the **R49 cut** … and R55, because R50–R54 were cut and never
> synced. Twenty-five files, listed by `fc-target-rule-release-stamp-r2b-a2-r5-f3.test.js` §I1 …

**The baseline was stale.** The Owner's `system.health` (**HEALTH-50215EC7**) reports Production at
**R54**. R50–R54 are deployed. The ledger's "Production is R49" was an intent recorded at R52's cut and
never a live observation — a thing this ledger itself warns about further up, and then used as a fact.

**And the span belonged to a different question.** §I1's copy list is derived from `BASE = e583057`,
the **R25** tree. It is the DECLARATION gate: every Apps Script file whose stamp and manifest row have
been governed since R25, asked so that nothing rides along unannounced. It is not, and has never been,
a statement about what Production is missing. Twenty-five is a correct answer to a question nobody was
asking here.

**`90_generated_supply_planning_bundle.gs` leaves the set.** It last changed before R54, so a complete
R54 already holds it. Not rebuilt and not copied are still independent — that part of the old paragraph
was right — but there is nothing to copy this round.

#### The one thing still unverified, and the read-only check for it

"Production is R54" is a reading of `SYS_DEPLOYMENT_RELEASE_`, which lives in `63_`. A project where
somebody pasted `63_` and stopped would report R54 while holding older copies of everything else, and
that is exactly the partial sync the four-file set would then be too small for.

**The same health call answers it.** `SYS_MODULE_BUILD_STAMPS_` returns a per-file expected build and
the probe compares each against what that file actually declares; `mixed_deployment` is the summary.

- `mixed_deployment: false` → R54 is complete and the four files above are the whole paste set.
- `mixed_deployment: true` → the set is whatever the stamps report as behind, **plus** these four, and
  this section is re-derived rather than trusted.

Reading it costs one `system.health` call and writes nothing.

### GITHUB_PAGES_FILES

`index.html`, `assets/js/app.js`, `assets/js/api/operation-system-db-api.js`,
`assets/js/pages/fx-rate-book.js`, `assets/html/pages/fx-rate-book.html`,
`assets/css/pages/fx-rate-book.css` (new).

### Post-publish acceptance — steps 1-3 read, **steps 4 onward write**

This heading read *"read-only until step 5"* and that was wrong: **step 4 is a write.** It asks for a
save in one tab and then a save in another, and the FIRST of those two saves succeeds — it has to, or
the second one has nothing to conflict with. So the operator following this list in order had already
changed the stored book one step before the list told them they were about to.

The correction matters more than a renumbering because of what step 4 is for: it is the step where
somebody deliberately provokes a refusal, which is the moment they are least likely to be counting
writes.

1. Open **Administration → FX Rate Book**. It must render the stored book and issue exactly one
   `fxRateBook.get`. Opening the page must write nothing.
2. If the backend cannot identify you, the page shows a named read-only band carrying the refusal code
   and every input is disabled. A disabled Save with no explanation is the defect this band exists to
   prevent; a Save that works for an unidentified caller is the §8 failure.
3. Check the version line reads `read at version <n>` and the capacity line reports bytes used of the
   limit. A book near the limit must say so **before** a save is refused.
4. **(Writes — the first one succeeds.)** Open the page in two tabs, save in one, then save in the
   other. The first save IS a write and advances `doc_version`. The second must be refused as
   `FX_VERSION_CONFLICT` **by that code**, must keep your typing on screen, and must not overwrite the
   first. A refusal naming any other version code is the page misreading its own request, which is the
   defect FX1-R4-R1 §2 closed.
5. **(Write.)** Save one coefficient. No price may move: `pricing_list` is unchanged, and rows already
   `pending_fx` stay `pending_fx` until a reconciliation is run.
5a. **(Write — the round trip.)** Without reloading, keep editing after that save: change a second
   field, add a pair, save again. The editor must stay live, the currency lists must still be
   populated, the capacity meter must MOVE, and the version line must advance once per save. A page
   that goes read-only after a successful save is FX1-R4-R1 §3 and means the shipped build is older
   than this ledger.
5b. Check the change log. Every row must carry a time, an operator, a pair, a kind (`ADDED` / `EDITED` /
   `REMOVED`) and what moved; an EDIT must show the old value and the new one. Blank cells are
   FX1-R4-R1 §4.
6. Import a cross-currency SKU. It must be created priced from the book, with `auto_*` populated and
   the override columns **blank**. A row created with `auto_* = 0` is the zero-price failure §7 forbids.
7. Import a cross-currency SKU for a pair the book does **not** hold. It must be created `pending_fx`
   with `fx_rate` and `auto_*` blank — not zero, and not a guessed rate.
8. Check the batch response carries `fx.doc_version`. Two imports run either side of a save must report
   different versions, and every row inside **one** import must have been priced at one of them.

None of these steps is covered by live evidence: everything behind them ran against offline fixtures
with an injected io. A sandbox is not database isolation and nothing here relied on it being one.

### R55 — the measured surface, corrected after the post-commit sweep

The R55 section above records **4,666,351 bytes**, which was the honest number at the moment the cut
was measured. The post-commit sweep then found two defects in it — `fxRateBook.get` had no POST route,
and `04_`’s `priceNote` had lost a continuation line so the file did not parse — and fixing both added
bytes. The surface as committed is:

```
files    79
bytes    4,666,841
ceiling  4,668,000   (Owner-approved, FX1-R4)
VERDICT  UNDER by 1,159 bytes
```

`node docs/planning/fx1-r1-staging/measure-fx1-r4-surface.js` reports this against the ceiling and is
read-only and re-runnable; `gs-load-surface-audit.js` agrees to the byte. The commit message of
`fix(fx1-r4)` quotes **4,666,584**, which was written before that run printed and is wrong by 257
bytes; the number above is the one to use, and it is the one the budget gate measures.

**STILL NOT DEPLOYED. NOT PUSHED. NOT SYNCED.**

### R55 — the clean full regression, and the one suite it does not include

```
total 689   clean 688   not_clean 1
not_clean_suites: [ map-canvas-acceptance-s8-b3-r3-cp2m-r2 ]
registered 689   executed 689   integrity INTACT   complete true
dirty_before []   dirty_after []   aborted null
```

Everything else is clean, including every mutation suite. The one exception is recorded as
**D-S8-B3-175** and is an evidence gap, not a defect: the map canvas capture pins `index.html`, this
round changed it, and the globe does not render on this machine — reproduced with the pre-FX
`index.html` and `app.js` restored, so the cause predates these commits. The assertion was not
widened.

> **FX1-R4-R1 CORRECTION.** The globe renders. That paragraph measured `_cp2m-r2-map-runner.js`, which
> hard-codes `--use-gl=swiftshader` and loses the context ~1.3 s in — which the map suite's own header
> has said since CP2O-R2, naming `_cp2o-r2-map-capture.js` as the re-capture tool instead. The capture
> was taken here, first try, both scenes, and the suite is **75 passed, 0 failed**. See D-S8-B3-175,
> now CLOSED.

Four passes were needed to get here, and each one found something the pass before it could not see.
The first found the read route the Administration page could not have used and a `04_` that did not
parse. The second found eighteen registers that a new runtime file and a new routed page move. The
third found three more and a mutant whose REPLACEMENT, not merely its anchor, was wrong for the new
code — it would have reported itself surviving while testing a defect it is not named for.

**STILL NOT DEPLOYED. NOT PUSHED. NOT SYNCED.**

---

## FX1-R4-R1 — the Administration page's round trip, and the identity condition for using it

**No release cut. No `.gs` byte changed.** The GS load surface is unmoved at **4,666,841 / 4,668,000**,
and `SYS_DEPLOYMENT_RELEASE_` is still R55. Everything below is browser code, tests and this ledger.
That is not a small-change convenience — it is the measurement: four defects that made the FX Rate Book
page unusable were all on the page's side of a backend that was already right.

### What was wrong

FX1-R4 shipped the page with 234 assertions on `75_`, 49 on the `04_` wiring and 17 mutants. Every one
of them passed. The page could not save a non-empty rate book.

| # | defect | register |
|---|---|---|
| 1 | the page never sent the per-row `version` `75_` requires, so every save of a non-empty book was refused once per row | D-S8-B3-176 |
| 2 | and that refusal, `FX_VERSION_INVALID`, matched a `/VERSION/i` test and was announced as *"somebody else saved this book"* | D-S8-B3-177 |
| 3 | a successful SAVE was adopted as though it were a GET, so success cleared the currencies, blanked the capacity meter and revoked `may_edit` | D-S8-B3-178 |
| 4 | the change log rendered `changed_at` / `changed_by` / `old_rate` / `new_rate`, none of which `75_` emits | D-S8-B3-179 |
| 5 | the transport collapsed the server's `errors[]` to the first one, so a book with four bad rows reported one | D-S8-B3-180 |

**Why none of it was caught.** An EMPTY book saves perfectly — `rates: []` has no entries to validate.
Both ends were verified against themselves; the SEAM between them was not tested at all. Defects 3 and
4 are not merely untested but UNREACHABLE while defect 1 stands: a save that is always refused never
produces a success envelope to misread and never writes a change record to render.

### The evidence

`assets/tests/_fx1-r4r1-roundtrip-runner.js` drives the SHIPPED page in headless Chrome, through the
SHIPPED adapter, into the SHIPPED `75_` running over an in-memory Property store. Four captures under
`docs/evidence/fx1-r4r1-roundtrip/`, all from one harness (its own SHA is in each capture, so "the same
experiment" is checkable rather than assumed):

| capture | page state | what it shows |
|---|---|---|
| `before.json` | as FX1-R4 shipped | 3 saves, **0 accepted**; every row on the wire carrying `<<missing>>` for `version`; the page blaming a colleague |
| `masked.json` | row-version repair ONLY | saves succeed — and success empties the currency list, blanks the meter, disables the editor, and renders the log as `["","","USD>JPY@…","—","—"]` |
| `after.json` | as it now stands | save → keep editing → save → reload → remove → save, `doc_version` 3→4→5→6, meter 412→577→1102→1105 B, log covering `EDITED`/`ADDED`/`REMOVED` |
| `unidentified.json` | as it now stands | an unidentifiable caller: read-only, named, **zero save requests reached the server**, stored book unmoved |

The counter-examples are real code, not synthetic mutants: `before` is the page as it shipped and
`masked` is that page with one repair applied. A mutation harness would have had to invent those two
states; they are the states the file was actually in.

### The cross-layer half: a coefficient saved on the page prices a SKU

`verify-04-wiring.js` executes the row PLANNER. The new suite executes the WHOLE handler —
`handleImportMarketplaceSkusBatch_`, out of the shipped `04_`, against an in-memory spreadsheet whose
headers are lifted from the handler's own `requiredHeaders` so the fixture cannot drift from the schema.

The book it runs against is `after.json`'s `finalStoredRaw` — the exact bytes the Administration page
committed, parsed and handed to `04_`'s Property reader unmodified. The operator added `USD>EUR 0.92`
by pressing *Add a pair*; the import writes a `pricing_list` row with `fx_rate 0.92`,
`auto_regular_price 92` (100 x 0.92 at EUR precision), `price_status draft`, and `rate book v7` in the
note. That is the whole chain, executed, in one process.

Beside it, the rules that must hold while it happens — all executed, none asserted from source:

- a pair the book does not hold → `price_status pending_fx`, `fx_rate` and every `auto_*` **blank**,
  never zero, with `base_*` still recorded so a reconciliation has something to work from;
- a corrupt book → the import still succeeds, `fx.readable: false`, `fx.doc_version: null`, rows
  pending — a configuration fault, reported as one, which does not stop a SKU existing;
- the Property replaced **mid-batch** → both rows still priced at `0.92` and the batch still reports
  v7, not the 99 that was written underneath it;
- an existing `pricing_list` row → **no price column written at all**, and a manual `49.99` still
  exactly `49.99`. Saving a coefficient changes what the NEXT creation reads. It reprices nothing.

`assets/tests/fx-rate-book-roundtrip-and-wiring-fx1-r4-r1.test.js` — **111 assertions, 0 failed.**

### §6 — the identity condition, confirmed without changing anything

**No deployment setting was touched, and none should be on the strength of this section.**

`system.health` cannot answer this question and is not expected to: it reports "no user identity" by
design (`63_`, line 15), so HEALTH-50215EC7 carrying no trusted-operator evidence is the contract
working, not a gap in the report.

**The minimal read-only confirmation is one `fxRateBook.get`** — the call the page already makes when
it opens, which writes nothing. Its `may_edit` and `authority_reason` are a complete decision table:

| `authority_reason` | what is true | what it would take |
|---|---|---|
| *(absent, `may_edit: true`)* | the caller is identified and on the allowlist | nothing |
| `FX_AUTHORITY_NOT_CONFIGURED` | `KM_FX_RATE_BOOK_EDITORS` is unset | the Owner sets the addresses |
| `FX_AUTHORITY_WILDCARD_REFUSED` | it is set to `*` | the Owner replaces `*` with real addresses |
| `FX_AUTHORITY_UNVERIFIABLE` | **the deployment cannot see who is calling** | an Owner decision about the deployment's access mode |
| `FX_NOT_AUTHORIZED` | identified, and not on the list | the Owner adds that address |

The fourth row is the one that matters, and it is the one this round can confirm but must not act on.
A Web App executing as its owner returns `''` from `Session.getActiveUser()`, so membership cannot be
checked and `75_` refuses — which is correct and is what `unidentified.json` measures end to end: the
band names the code, every control is disabled, and **no save request is issued at all**.

Three things were available and were not done, because each defeats the control rather than satisfying
it: setting `*` (refused by name since FX1-R3, and the entry explains why), having the browser send an
email (a claim is not an identity), and reading the deployment owner instead of the caller (that
authorises the deployment, not the person).

Until the Owner decides, the correct state is the current one: **the FX Rate Book is readable by
everyone who can open the app and writable by nobody.** A rate book nobody can edit prices nothing
wrongly; it only stays empty, and an empty book is `pending_fx`, which is a visible, recoverable state.

### What is NOT covered

Every capture above ran against an in-memory store with an injected `io`. A sandbox is not a database,
and request counts, byte counts and refusal codes are evidence while **durations are not**. Nothing
here has been run against a deployment.

**NOT PUSHED. NOT SYNCED. NOT DEPLOYED. No Script Property was created, no rate was initialised and no
price was written.**

### FX1-R4-R1 — recovery after an unclean reboot (RECOVERY-0)

The machine rebooted uncleanly at **09:15 on 2026-10-21** (System events 41 / 6008) with the
fourteenth cp2r batch part-way through. Found at restart: HEAD `680b87f6`, one modified file,
`inventory-replenishment.js`, differing from HEAD by exactly the two `onReveal` identifiers of the cp2r
**unscoped arm** (`_irRecoRevealPaint_` / `_irExecRevealPaint_`). Attributed by three independent
sources, not by resemblance: the cp2r README's arm table, the driver that writes exactly those two
anchors, and the interrupted session's own last status line naming the driver's PID.

The driver and its child were confirmed gone; no process held the repository; no sweep lock existed.
The diff was saved, then reverse-applied **as a patch of those two lines only** — no checkout, no
reset — and the file's blob was verified equal to HEAD's (`22418e4a`). Every partial capture from the
interrupted attempt was discarded. Nothing from it was promoted.

### FX1-R4-R1 — the fourteenth cp2r batch

Required because `operation-system-db-api.js` changed (D-S8-B3-180) and §E1 pins it. Taken from
scratch on one build: **−90.6 / −84.1 ms, 6 of 6 and 6 of 6**, no fatals, one outlier kept (in the
SCOPED arm, against the conclusion). Recorded in `docs/evidence/cp2r-reveal-scope/README.md`,
including that the machine was **not** quiet. cp2r **45 passed, 0 failed**.

### FX1-R4-R1 — the clean full regression, at the frozen HEAD

```
HEAD      73d64342
total 690   clean 690   not_clean 0
not_clean_suites: []
registered 690   executed 690   integrity INTACT   complete true
dirty_before []   dirty_after []   aborted null   stderr 0 bytes
```

`node assets/tools/run-regression-sweep.js`, 10:04 → 10:25, no edit and no other node workload
against the tree while it ran. This is the first clean sweep of FX1-R4-R1: the two earlier passes
were stopped by real findings (the secret scanner, `680b87f6`; and a suite killed at its timeout,
whose mutant the sweep refused to run past), and neither is counted as evidence.

GS load surface re-measured, unchanged: **79 files, 4,666,841 / 4,668,000, UNDER by 1,159.**

### The exact sync set, measured against what is actually published

`origin/main` is `315b69da`. Everything after it is committed and unpushed, so the push carries more
than this round:

```
git diff --name-status 315b69da HEAD -- assets/specs/active/apps-script/
M 01_router.gs   M 04_marketplace_forecast_import.gs   M 63_api_v1_system_health.gs   A 75_api_v1_fx_rate_book.gs

git diff --name-status 315b69da HEAD -- index.html assets/js assets/html assets/css
A assets/css/pages/fx-rate-book.css        M assets/html/pages/fx-rate-book.html
M assets/js/api/operation-system-db-api.js M assets/js/app.js
M assets/js/pages/fx-rate-book.js          M assets/js/pages/inventory-replenishment.js
M index.html
```

**APPS_SCRIPT_SYNC_REQUIRED stays the four files**, valid while `mixed_deployment` is `false` (it is,
per HEALTH-50215EC7). `90_` is not rebuilt and not copied. **GITHUB_PAGES_FILES is the seven above.**
`inventory-replenishment.js` is not an FX file and IR is frozen this round: it rides because CP2X-R4,
-R4-R1 and -R4-R2 changed it after the R54 cut and those rounds are not pushed either. The FX section's
list above is that round's own files and is correct for that question; the seven are the answer to
"what does the push publish".

**NOT PUSHED. NOT SYNCED. NOT DEPLOYED. No Script Property was created, no rate was initialised and no
price was written.**

---

## FC1-R1 phase 1 — FC history and achievement: the interface, with no source

**Not part of R55.** The R55 candidate stays `7376bee8` (already on `origin/main`); everything below is
later, separate commits for their own acceptance. **No `.gs` byte changed**: GS load surface
4,666,841 / 4,668,000, `SYS_DEPLOYMENT_RELEASE_` unchanged, no Apps Script sync is required.

| commit | what |
|---|---|
| `b816192c` | `R55_PRODUCTION_RELEASE_RUNBOOK.md` (docs only) |
| `7ea0a07a` | the phase-1 feature, contract and suite; app token r62 → r63 |
| `331acdb6` | thirteen browser captures the token and page change invalidated, re-taken |

What ships, per `FC_HISTORY_ACHIEVEMENT_PHASE1_CONTRACT.md`: a Months view switch on the Regular table
(Forecast unchanged; Actual and Achievement % render a named missing state), and two history-based
builder methods that refuse Preview and Save with `FC_HISTORY_METHOD_NOT_AVAILABLE`. Contract #1 and #3
are **deferred to phase 2 by the Owner, not resolved**; the 0-vs-missing display rule is confirmed.

### Clean full regression at the frozen HEAD

```
HEAD      331acdb6
total 691   clean 691   not_clean 0
registered 691   executed 691   integrity INTACT   complete true   stderr 0 bytes
```

The pass before it (at `7ea0a07a`) was 678/691; all thirteen were capture pins and were re-taken, not
re-pinned (`331acdb6` records how, including one mount attempt that failed on a relative profile path
and was discarded).

### GITHUB_PAGES_FILES when this is pushed

`index.html` and `assets/js/app.js` (token r63), `assets/js/pages/fc-summary.js`,
`assets/html/pages/fc-summary.html`. **The token is the reason the whole co-deployed set re-downloads**:
every asset URL in `index.html` moves to r63 although only `fc-summary.*` changed content.

**APPS_SCRIPT_SYNC_REQUIRED: none.**

**NOT PUSHED. NOT SYNCED. NOT DEPLOYED.**

---

## FC1-R2 — the builder refuses a base that is not there, and runs only methods it knows

**Owner-approved, frontend only.** No `.gs` byte changed (4,666,841 / 4,668,000), no Apps Script sync,
no history source, no BigQuery, no production data. Not part of R55 (`7376bee8`).

| commit | what |
|---|---|
| `5b69b189` | the fix, test-first (35 of 51 red against `0f8294a5`, controls green), D-S8-B3-182 closed |
| `4de48727` | four captures the fix invalidated, re-taken — one of which had been recording the defect |

What changed is in D-S8-B3-182 (register) and `FC_HISTORY_ACHIEVEMENT_PHASE1_CONTRACT.md` §5: the base
is read from the stored cell; blank, missing, invalid and a blank Base Month refuse the whole preview by
SKU, period and reason; an explicit 0 is a base; a capped or unloaded Regular source refuses all three
methods; methods are a closed list; Save re-checks for itself.

### Clean full regression at the frozen HEAD

```
HEAD      4de48727
total 692   clean 692   not_clean 0
registered 692   executed 692   integrity INTACT   complete true   stderr 0 bytes
```

The pass before it aborted at 376/692 because `product-strategy-capability-bootstrap-p1-b8d-r10d`
exited mid-mutation and left one line in the adapter; that line alone was restored and verified, the
suite passed alone and passes here, and it is recorded as intermittent.

### GITHUB_PAGES_FILES when this is pushed

Cumulative since `origin/main` (`7376bee8`): `index.html`, `assets/js/app.js` (token r63),
`assets/js/pages/fc-summary.js`, `assets/html/pages/fc-summary.html`,
`assets/js/api/operation-system-db-api.js`. r63 is reused — `git ls-remote` still reports
`7376bee8`, so no browser has fetched it; re-check before publishing.

**APPS_SCRIPT_SYNC_REQUIRED: none. NOT PUSHED. NOT SYNCED. NOT DEPLOYED.**

---

## DC1-R1 — main-line data coherence and Gap: the audit, and a source write the page now hears

**Frontend only.** No `.gs` byte changed (4,666,841 / 4,668,000), no Apps Script sync, no Script Property,
schema, schedule or persisted cache touched, no production recalculation, Save, Submit or write. Premises
from the Owner's latest response: Production R55, contract 21, list 18, required actions 50,
`mixed_deployment=false`. Not part of R55 (`7376bee8`); FC1-R2 (`1ad5c322`) stays as it was.

| commit | what |
|---|---|
| `006bfd74` | the fix, test-first (52 red against the pre-fix sources with all 8 controls green; 78/78 after; 5 mutants) |
| `fc615a20` | six captures the fix invalidated, re-taken |
| `4828cc20` | `DC1_R1_MAINLINE_DATA_COHERENCE_AND_GAP_AUDIT.md`, register D-S8-B3-185..188, the PSB exit's raw record |
| `f09e63af` | the Taipei-day helper rewritten without `Math.floor` - the first full regression showed the read block is scanned for formulas (fm2b F2) |
| `c87f9707` | every page-pinned capture re-taken against the final source (four in-place modes, c9 frames, cp2r batch seventeen, boot census) |

What changed is D-S8-B3-185 and the audit §3: a per-tab source-write epoch in `operation-system-db-api.js`
(every write-capable KM.DB function declared and wrapped in one place; bumped at dispatch and settle whatever
the outcome), and Site Inventory's recommendation answer, read model and exposure map stamped at issue and
re-read when a write, a new Asia/Taipei day, a missing stamp or a missing signal says they may be stale — the
exposure never over an unsaved manual route. The Avg Sales tooltip now names its calculation date (D-S8-B3-186).

### Clean full regression at the frozen HEAD

```
HEAD      c87f9707
total 693   clean 693   not_clean 0
registered 693   executed 693   integrity INTACT   complete true   stderr 0 bytes
```

The first full regression, at `4828cc20`, executed 693/693 with the worktree INTACT and named three
suites not clean: two captures pinned to the page that the earlier affected-suite run had not reached
(c9 frames, the boot census) and fm2b F2, the formula scan of the read block. All three were repaired
or re-taken (`f09e63af`, `c87f9707`) and the second pass above is clean. Both passes' raw output is in
`docs/evidence/dc1-r1-source-write-epoch/` (`sweep-1-at-4828cc20.*`, `sweep-2-at-c87f9707.*`).
The PSB bootstrap suite ran clean in both (205/0, 32 mutants); D-S8-B3-188 stays OPEN all the same.

### Still open, by name
- D-S8-B3-186 — the Avg Sales anchor policy (`RECOMMENDATION_CALCULATION_DATE` is manual; observed 2026-08-19).
- D-S8-B3-187 — cross-tab / other-user / scheduled-import writes need a server source revision (~3,400 B vs
  1,159 B headroom; plan only).
- D-S8-B3-188 — the PSB bootstrap suite's early exit (FC1-R2). OPEN; not closed by this round's clean run.

### FX phase 1 — the Owner's manual steps (nothing here is done by the agent)
Scope as confirmed: one editor, `vic.zhou@shopkitchenmama.com`; no Google Login or role work; the Owner
enters the Administration rate-book coefficients, not `pricing_list` rows.
1. Apps Script editor → Project Settings → Script Properties → add `KM_FX_RATE_BOOK_EDITORS` =
   `vic.zhou@shopkitchenmama.com` (comma-separated if ever more; case-insensitive; `*` is refused by name).
   Change nothing else — not the deployment's access, not "Execute as", not OAuth scopes.
2. Signed in as that address, open the FX Rate Book page (one `fxRateBook.get`, read-only) and read
   `may_edit` / `authority_reason`:
   - `true` / `null` → the caller is identified and allowed. FX may then be considered for a first write.
   - `FX_NOT_AUTHORIZED` → the caller IS identified, but as a different address; check the signed-in account.
   - `FX_AUTHORITY_UNVERIFIABLE` → this deployment cannot see who calls it. STOP and report; the minimal
     fix is an Owner decision about the deployment and is not taken here.
   Until that GET is read, `FX_AUTHORITY_NOT_CONFIGURED` says only that the list is empty — it says nothing
   about identifiability, because 75_ checks configuration before identity.
3. Initialising the rate book (the coefficients) and any repair of existing `pricing_list` rows are two
   separate acts; neither is batch-repricing, and existing manual prices are not touched.

### GITHUB_PAGES_FILES when this is pushed
Cumulative since `origin/main` (`7376bee8`): `index.html`, `assets/js/app.js` (token r63),
`assets/js/pages/fc-summary.js`, `assets/html/pages/fc-summary.html`,
`assets/js/api/operation-system-db-api.js`, `assets/js/pages/inventory-replenishment.js`. r63 is reused —
`git ls-remote` still reports `7376bee8`; re-check before publishing.

**APPS_SCRIPT_SYNC_REQUIRED: none. NOT PUSHED. NOT SYNCED. NOT DEPLOYED.**

## FX-AUTH-R1 — the measured missing scope: `userinfo.email`, added locally and nowhere else

**What was measured (Owner, Production, read-only, 2026-10-21).** After `KM_FX_RATE_BOOK_EDITORS` was set
by hand: `allowlist_present = true`, and `Session.getActiveUser()` **threw** because the manifest's explicit
`oauthScopes` do not include `https://www.googleapis.com/auth/userinfo.email`. `75_` catches that throw as
`''`, so the page answered `FX_AUTHORITY_UNVERIFIABLE` — the code this ledger's FX1-R4-R1 §6 and the
"FX phase 1" steps above explained only as "the deployment cannot see who calls it". That reading was
incomplete: the code covers **two** causes, a permission exception and a genuinely empty email, and the
measured one was the first. Kept as `docs/evidence/fx-auth-r1/owner-measurement.json`, as reported, with
what was not measured named.

**The change (Owner-approved, local only).** `assets/specs/active/apps-script/appsscript.json` gains one
line: `userinfo.email` after the existing three scopes. Byte-checked against `26b35b6c`: the three scopes,
BigQuery v2, Sheets v4, `Asia/Taipei`, V8, STACKDRIVER, `executeAs: USER_DEPLOYING` and
`access: ANYONE_ANONYMOUS` are identical. **No `.gs` file, no generated bundle, no API, no frontend file
moved.** The FX allowlist, the `*` refusal, the fail-closed path and the io-only authority are unchanged;
no browser-sent email is trusted, and `getEffectiveUser` is read nowhere.

**The guards were adjusted, not loosened.** Seven suites pinned "exactly three scopes" or "the scope set at
an older commit". Each now compares against *that set plus exactly the approved additions*, recorded once in
`assets/tests/_oauth-scope-approvals.js` with round and reason. Checked on the real file: removing
`userinfo.email` fails all eight scope suites, and so does adding `auth/drive` beside it. The new suite
`fx-auth-userinfo-email-scope-fx-auth-r1.test.js` (31 assertions, 21 mutants, 0 survived) pins the exact
list as a literal, checks the raw manifest is the old bytes plus one line, runs `75_` in a sandbox (a throw
and an empty email both refuse; `*`, a request-body email and the deployer never authorise), and holds the
runbook to both causes.

**Runbook.** `R55_PRODUCTION_RELEASE_RUNBOOK.md` §5 now names both causes of `FX_AUTHORITY_UNVERIFIABLE`,
says that neither the response nor the execution log can tell them apart (`75_` logs nothing), and adds
§5A — the Owner-run manifest sync for this one scope, with re-consent, one read-only `fxRateBook.get`, and
a rollback. Step 2 of "FX phase 1" above should be read with that correction: `UNVERIFIABLE` is not by
itself "execute-as-owner".

**Not claimed.** That the Owner will be identified once the scope is granted. It is expected; it is proved
only by the Owner's next `fxRateBook.get` after §5A. If that still answers `UNVERIFIABLE` with no exception,
the cause is the access/identity mode — an Owner decision this round does not take.

**APPS_SCRIPT_SYNC_REQUIRED (Owner-run, per runbook §5A, after the push):** `appsscript.json` only.
`BUNDLE_REBUILD_REQUIRED`: no. GITHUB_PAGES_FILES: unchanged by this round.
**NOT PUSHED. NOT SYNCED. NOT DEPLOYED. No FX save, no rate initialised, no price recalculated, no
Script Property written.**

### FX-AUTH-R1 — correction: the Owner steps, the diagnostic, and K5 as it really stands

Docs and tests only. The manifest is still the old bytes plus `userinfo.email`. No `.gs`, no bundle, no
`executeAs`/`access` and no authority decision moved (guarded: nothing under the Apps Script folder
differs from `0170d40c`).

- **§5A rewritten.** Three things in the first version were wrong, and all in the same direction: each
  let a step look finished before it had proved anything.
  - Consent was to be triggered by opening `/exec`. It now comes from ONE reviewed, read-only editor
    diagnostic, `docs/planning/fx-auth-r1/TEMP_CheckFxIdentity.gs.txt`. That diagnostic reads the caller
    and the single property `KM_FX_RATE_BOOK_EDITORS`, writes nothing, and logs one line. That line does
    not contain the editor list or any other property. If a copy of that name already exists in the
    cloud project, the Owner compares it line by line and uses it only if it is identical. The diagnostic
    is deleted before the version is created, and it lives outside the Apps Script folder so no sync
    can carry it.
  - The consent screen was assumed to name only the new permission. The Owner now checks it against all
    four scopes and stops only if anything else appears, or if one of the four is missing.
  - A Web `FX_AUTHORITY_UNVERIFIABLE` after the editor identified the Owner was read as "the access
    mode". It is now recorded with its cause **undetermined**. The editor identifying the Owner does not
    show that the Web App can.
- **Guards.** `fx-auth-userinfo-email-scope-fx-auth-r1.test.js` §G runs the diagnostic in a sandbox.
  - Every write, every other property and every other Google service is a trap.
  - Four cases are run: a throw, the Owner listed, the Owner not listed, the list absent.
  - It holds the §5A steps and their order.
  - 13 new mutants, M22–M34, all caught: 36 assertions and 34 mutants in total.
- **K5 is OPEN, cause unresolved** (`docs/evidence/fx-auth-r1/K5-PROBE-ERROR.md`). The sweep's PROBE ERROR
  and the single passing rerun are both kept. The `c0f0f6fa` commit message's "transient Windows I/O
  fault" was a guess and is withdrawn. No assertion was loosened and no retry was added.

**NOT PUSHED. NOT SYNCED. Cloud manifest not applied. No FX save, no rate, no price.**

## PSB-DEMO-R2 — two boundaries from the review: competitor currency, and a drag that is not released

Frontend only: `assets/js/product-strategy/psb-board-ui.js`. No price, formula, API, GS or Schema moved;
single-point drag, original-vs-simulated, Undo/Reset, reload-clears and zero writes are unchanged.

**1. Competitor currency.** One site and one category can draw a panel per currency. R1 filed
competitors under site + category + price context.
- Measured in Chrome before the fix:
  - a USD competitor appeared in the EUR panel, at the same number, read as EUR;
  - that moved the EUR axis from 6500 down to 2500;
  - one click opened the form in both panels;
  - the two panels shared every demo control id.
- Now:
  - the key is site + category + **currency** + price context;
  - a panel reads only entries recorded in its own currency, and nothing is converted;
  - every demo control id carries its panel's currency (`compAdd-USD`), with the role in `data-demo-ctl`;
  - the form, the simulation editor, Undo and Reset all act on their own panel.

**2. Drag lifecycle.** A press-and-move followed by leaving the page, a context switch or a chart
rebuild left the drag behind. Its document keydown listener (one more after each interruption) went on
swallowing the next Escape.
- Now one idempotent `demoCancelDrag()` releases the drag's own pointer capture and removes its own
  listener, readout and offset.
  - It commits nothing and does not redraw.
  - It is called from `paintView`, `unmount`, `demoClearAll`, the price-view and activity handlers, and
    `pointerdown`.
- A release commits only its own handle's drag, into the context it started in.

**Evidence** (`docs/evidence/psb-demo-r2/`):
- `demo-r2.json`: the R2 runner in Chrome on the shipped source.
- `mutant-PREFIX.json`: the same runner against the pre-round UI read from `c0f0f6fa`. It is the
  counter-example and must fail.
- `mutant-M1..M6.json`: six one-change mutants, each of which must be caught.
- PSB-DEMO-R1's `demo.json` is re-taken with its runner moved to the panel-suffixed ids.

**PRE-EXISTING, NOT FIXED HERE (named so it is not mistaken for this round):**
- `boot()` registers two document keydown listeners (popover close, fullscreen exit) on every mount and
  never removes them. Each leave/return adds two. They are guarded by state, so they do nothing visible.
- The chart controls (`chartControls`, `mode-*`, `view-*`, `layers*`, `zoom-*`, `chartLegend`,
  `meetingToggle`) repeat their ids in every panel. They act on global state by design, and many suites
  address them by id.

Both are outside the two boundaries this round was asked to fix.

**NOT PUSHED. NOT SYNCED. NOT DEPLOYED.**

### FX-AUTH-R1 — final correction of §5A (docs and tests only; PSB product code frozen)

- **The manifest is checked in the manifest.** Step 1 now requires `oauthScopes` to hold exactly the four
  approved scopes, no more and no fewer.
- **The consent screen is not a list to count.** Google may show only what the account has not yet
  granted, so a missing earlier permission is not read as a wrong manifest. The run stops for exactly
  three things:
  - an extra permission;
  - having to decline a required one;
  - a diagnostic error.
- **A `userinfo.email` error is kept verbatim, with its cause unconfirmed.** It is not concluded that the
  manifest was unsaved.
- **Delete-and-version happens only after the diagnostic succeeds:** no `active_error`, your own address,
  and `caller_on_editor_list: true`. Otherwise stop and report, and create no version while the
  diagnostic file is still in the project. The rollback removes the diagnostic before it versions.
  Deployment identity, access mode and the allowlist mechanism are not to be changed at any step.
- **Guards.** The gates that pinned the corrected-away wording were replaced. There are 10 new mutants,
  M35–M44, and M23/M24/M26 were re-anchored. `fx-auth-userinfo-email-scope-fx-auth-r1.test.js`: 36
  assertions, 44 mutants, 0 survived.
- **Register.** D-S8-B3-189 (K5, OPEN), D-S8-B3-190 (boot Escape listeners) and D-S8-B3-191 (repeated
  chart-control ids) are entered as follow-up fatigue tests, outside the Demo scope.

No Demo re-take and no full sweep this round (docs and tests only, as instructed). **NOT PUSHED. NOT
SYNCED. Cloud manifest not applied. No FX save, no rate, no price.**

## FX-AUTH-R2 — the identity channel, and a phase-1 Owner path through 75_'s own save (plan + offline only)

**Production evidence received.** `fxRateBook.get` was answered by the R55 handler: `may_edit: false`,
`FX_AUTHORITY_UNVERIFIABLE`, `doc_version 0`, 0 rates. **Not yet received:** the Owner's
`TEMP_CheckFxIdentity` log line, and the active deployment version and its time. Nothing below assumes
either one.

**The channel, read from source.**
- Every FX call leaves through `_kmGapRead_`, with no `credentials` option, so a fetch from Pages to
  `script.google.com` carries no Google cookie.
- The deployment is `ANYONE_ANONYMOUS` / `USER_DEPLOYING`.
- Inference, not measured: the Web request is anonymous, so a Web `UNVERIFIABLE` is expected even after
  a successful Editor diagnostic. Editor-authorised and Web-identifiable are different questions.
- Not done, as instructed: `credentials: 'include'` (expected to break every credentialed cross-origin
  read; not tried), any access or executeAs change, `*`, a page-sent email, `getEffectiveUser`, and a
  browser-held key.

**Phase 1 (proposal).** `docs/planning/fx-auth-r2/TEMP_FxRateBookEditorSave.gs.txt` is an Editor-only,
Owner-only wrapper that dry-runs by default. It commits only through `handleFxRateBookSave_`, so it gets
75_'s allowlist, lock, CAS, validation, server-side audit, single commit and readback. The confirm string
is bound to the stored version and a digest of the exact payload. It makes no direct `setProperty` and
reprices nothing. Offline (real 73_/75_, in-memory store): `fx-auth-r2-editor-save-path.test.js` passes
13 assertions with 10 mutants caught. No runtime file changed since `8da211de`.

**Owner approvals, each separate:**
- A: add the temporary file;
- B: the exact rates payload, from the dry run;
- C: one commit.

After the commit, delete the file and do one read-only `get`. Plan:
`docs/planning/fx-auth-r2/FX_AUTH_R2_CHANNEL_AUDIT_AND_PHASE1.md`.

**NOT PUSHED. NOT DEPLOYED. No save, no initialisation, no repricing, no allowlist change.**

### FX-AUTH-R2-R1 — the Editor tool lists what is approved, and binds it with SHA-256 (tool and tests only)

- **The dry run now lists the whole payload.** Every entry is shown with its pair, rate, source,
  `as_of`, effective period, status and version. Every ADDED / EDITED / REMOVED change is shown with its
  full old and new entry.
- **The confirm string is SHA-256 of what is sent.** It is `Utilities.computeDigest(SHA_256, UTF-8)` of
  the payload object `{ doc_version, rates }`. That object is frozen once and is the same object passed
  to `handleFxRateBookSave_`. The confirm string has the form `SAVE doc_version N -> N+1 sha256 <64 hex>`.
- **The hand-written 32-bit hash is gone.** It collided:
  - A: USD>CAD `1.37` / `manual-d1xinu-1vbz5wk`
  - B: USD>CAD `1.38` / `manual-n3giwf-54gd4r`
  - Both are 2026-10-22, open-ended, active, version 1.
  - Both gave `411273e5`, reproduced here.
  - They are kept as an offline counter-example only, **not proposed rates**.
- **Results now:**
  - A and B have different confirm strings;
  - A's confirm is refused for B;
  - the version is bound into the digest.
- **Unchanged:**
  - it dry-runs by default, with zero writes and no lock;
  - a commit goes only through 75_'s full save path.
- **Tests:** `fx-auth-r2-editor-save-path.test.js` passes 16 assertions with 16 mutants caught (M11–M16
  new). No runtime file changed since `8da211de`, and no full sweep was run.

**NOT PUSHED. NOT DEPLOYED. No save, no initialisation, no repricing.**

### FX-INIT-R1 — the Editor diagnostic received; a draft initialisation payload (docs and tests only)

- **Evidence received from the Owner.** The Editor diagnostic reports:
  - `active_email=vic.zhou@shopkitchenmama.com`
  - `active_error=null`
  - `editors_property_present=true`
  - `caller_on_editor_list=true`

  Phase 1 is viable (FX-AUTH-R2 §3, row 1). The active deployment version and its time are still not
  received.
- **The tool is frozen at `b6ef4008`.** It is unchanged, and it ships with empty rates and an empty
  confirm string.
- **The draft is in `docs/planning/fx-init-r1/`.**
  - Pairs: USD>AUD, CAD, EUR, GBP and JPY.
  - Source: ECB eurofxref-daily for 2026-10-21, the latest published day. The raw file is saved in
    `docs/evidence/fx-init-r1/`.
  - Every row is derived as `(EUR>X)/(EUR>USD)`, half-up to 6 places.
  - Each row: `effective_from` 2026-10-22, open-ended, active, version 1.
  - Fed H.10 was used as a cross-check only.
  - The predicted dry-run confirm string is `... sha256 7308aad6…`.
- **Tests:** `fx-init-r1-draft.test.js` passes 26 assertions with 13 mutants caught. FX-AUTH-R2,
  FX-AUTH-R1, the FX contract and the FX roundtrip pass. No full sweep was run, and no runtime file
  changed.

**NOT PUSHED. NOT DEPLOYED. No save, no Property initialised, no repricing.**

### FX-INIT-R1 CLOSE-OUT — the five rates are saved and read back on the Web (evidence and docs only)

**Owner acceptance passed.**
- One Editor commit through `handleFxRateBookSave_`, handler `…-R55`, `doc_version 0 -> 1`.
- The confirm string equals the draft's predicted SHA-256 (`7308aad6…`).
- The production Web `fxRateBook.get` returns `doc_version 1` and five rates identical to the draft, with
  `may_edit: false` / `FX_AUTHORITY_UNVERIFIABLE`. That is phase 1 as designed.
- Both Owner returns are saved verbatim in `docs/evidence/fx-init-r1/`. They were checked field by field:
  12 of 12 match.

**No repricing, and no reconcile.**

**Not claimed done:**
- removing the temporary files from the production project, which waits for the Owner's confirmation;
- the deployment version and its time, still not received.

**PSB / IR / FC read-only acceptance:** the record is
`docs/planning/R55_POST_RELEASE_READONLY_ACCEPTANCE_PSB_IR_FC.md`. Every row is PENDING Owner evidence.

**No runtime file changed, and no full sweep was run. NOT PUSHED. NOT DEPLOYED.**

### R55 POST-RELEASE READ-ONLY ACCEPTANCE — PSB / IR / FC, on the published site in a real Chrome

**How it was run.** A real Chrome on `kitchen-mama.github.io/KM-Operation-System/`, against the
production `/exec`, with production data only. Every Apps Script request was paused in the browser and
classified by its ACTION, using the router's own read contract (the `doGet` branches plus
`rtrGetReadHandlers_`). Anything else would have been blocked before it left.

**Result: 24 requests, all contract reads, 0 blocked, 0 written.** Nothing was saved, submitted,
recalculated, imported or repriced, and FX was not re-initialised.

**Health:** R55, contract 21, list 18, 50 actions, uniform. The Owner's raw health text was not
received; the agent's own read is saved instead.

**Per item:**
- **PSB:** P1, P2, P4, P5, P6, P7 and P8 PASS. **P3 FAIL:** a deal label is clipped at the chart edge,
  so `44.79` shows as `44.7`. The values are right in the DOM, the tooltip and the table.
- **IR:** I1–I3 PASS. The return is served from the session cache, identical to the first load, with no
  SUPERSEDED.
- **FC:** F1–F4 PASS. History cells all show `—`, the forecast is kept, Preview and Cancel make no
  request, and a missing base is refused by name.

**Findings F-1 to F-4** (not fixed):
- F-1: PSB campaign dates print as raw Date strings;
- F-2: the label clip behind the P3 failure;
- F-3: the IR Gap date prints as UTC ISO;
- F-4: a data finding, a stored `total_fc` one higher than the month sum.

**Record:** `docs/planning/R55_POST_RELEASE_READONLY_ACCEPTANCE_PSB_IR_FC.md`. **Evidence:**
`docs/evidence/r55-readonly-acceptance/run-1/`.

**No runtime file changed, and no full sweep was run. NOT PUSHED. NOT DEPLOYED.**
