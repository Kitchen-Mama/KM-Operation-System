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
