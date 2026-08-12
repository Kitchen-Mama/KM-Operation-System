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
