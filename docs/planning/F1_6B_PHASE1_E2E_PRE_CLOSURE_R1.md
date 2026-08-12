# F1-6B-PHASE1-E2E-PRE-CLOSURE-R1 — Scheduled Recommendation Persistence + Shipment Document Last-Mile UI

**Outcome: IMPLEMENTED (both parts; no HALT).** Baseline HEAD `57cc754`. Closes the two known Phase-1 E2E blockers by
REUSE only — no second engine, no new business logic, no new DB schema.
- **Part A** — the weekly scheduler now persists ACTIONABLE Order Planning AI Plan drafts by driving the EXISTING 48_
  resumable draft job browserlessly (self-continuation via 46_'s trigger primitives). Owner:
  [`49_api_v1_weekly_recommendation_job.gs`](../../assets/specs/active/apps-script/49_api_v1_weekly_recommendation_job.gs);
  trigger entry in [`47_`](../../assets/specs/active/apps-script/47_api_v1_recommendation_generation.gs).
- **Part B** — a compact Generate / Download group for Shipping Detail + Packing List on the dispatched-shipment card,
  reusing the R3C adapters. Owner: [`shipping-history.js`](../../assets/js/pages/shipping-history.js).

## §A0 Audit — the proven divergence (no HALT: none of the four HALT conditions fire)
```
MANUAL AI Plan (ORDER_PLANNING):
  request-order page  → KM.DB.startRequestOrderDraftJob(scope) → 48_ reqDraftJobStart_
  CLIENT polls        → KM.DB.continueRequestOrderDraftJob(runId) → 48_ reqDraftJobContinue_   (§19 client-driven)
                      → 47_ recGenGenerateOneSkuCompact_ → 24_ rpoGenerateRecommendationDraftLockedResult_ (KMPW/KMPR)
                      → PERSISTED request_order_allocation_drafts / _lines  (the actionable draft)

SCHEDULED (old):
  45_ weekly trigger  → 47_ runWeeklyRecommendation → runRecommendationGeneration → KMREC.generateBatch
                      → a NON-PERSISTENT in-memory summary  ← STOPPED HERE (never entered the 48_ job)
```
- **Manual persistence authority uniquely identified** = 48_ job → 24_ locked persister (KMPW/KMPR) → `request_order_allocation_drafts` (MONTHLY_ORDER). ⇒ HALT#1 (RECOMMENDATION_DRAFT_PERSISTENCE_AUTHORITY_GAP) does NOT fire.
- **Backend-safe continuation exists but was unwired** (STEP A0 #15) = 46_ owns live-hardened one-off `.after()` continuation triggers + safe delete-by-handler; 48_'s CONTINUE was simply client-driven. ⇒ no new engine (HALT#2) and no new schema (HALT#3): the driver reuses 46_ triggers + 48_ job + Script Properties.
- **Convergence without changing frozen semantics** = the scheduler drives the SAME 48_ job with `mode:'SCHEDULED_REFRESH'` (existing vocabulary). ⇒ HALT#4 (MANUAL_SCHEDULED_RECOMMENDATION_AUTHORITY_CONFLICT) does NOT fire.
- **INVENTORY (WEEKLY_SHIPPING)** has NO resumable, backend-drivable persistence job (48_ is ORDER_PLANNING-only; the 42_ inventory workspace is READ-ONLY/browser-driven). Persisting it here would be a SECOND engine (prohibited) → INVENTORY stays the existing non-persistent summary, documented (not invented).

## Architecture (Part A)
```
45_ weekly trigger (runWeeklyRecommendation)  → 49_ weeklyRecoStart_  (enumerate ORDER_PLANNING scopes with READY gap
    rows → snapshot a queue in Script Properties → arm the FIRST continuation; NO scope driven in the request)
        └─ self-arming one-off trigger `continueWeeklyRecommendationJob` → 49_ weeklyRecoContinue_ (ONE 48_ step / fire)
              • START the scope's 48_ job  (mode SCHEDULED_REFRESH, actor weekly-recommendation-scheduler)   OR
              • advance it ONE CONTINUE slice (≤25 SKUs) → 24_ locked persister → PERSISTED drafts
              • when the scope's 48_ job is DONE → fold its counts → advance the queue → arm the next step
              • when the queue drains → DONE + clear the trigger
```
The 49_ orchestrator authors NO recommendation/gap/forecast/allocation/quantity math, writes NO draft row itself, and
creates NO second persister/table/engine. The script lock is held ONLY for the momentary state read/checkpoint —
NEVER across a 48_ call (48_ acquires the same lock per SKU). The recovery trigger is armed BEFORE each (lock-free)
48_ step, so a kill mid-step self-heals.

## §COMPLETION REPORT
1. **PRE HEAD** = `57cc754`. 2. **POST HEAD** = this commit.

### Part A
3. **Manual AI Plan entrypoint** = `_roRunAiPlanJob_(scope)` (request-order.js) → `KM.DB.startRequestOrderDraftJob` / `continueRequestOrderDraftJob` → 48_.
4. **Scheduled entrypoint** = 45_ weekly trigger → 47_ `runWeeklyRecommendation` → 49_ `weeklyRecoStart_` (+ the `continueWeeklyRecommendationJob` chain).
5. **Shared generation owner** = KMREC via 24_/23_ locked persister (the ONE generator both paths use); recommended_qty VERBATIM from `order_planning_gap`.
6. **Shared persistence owner** = 48_ `reqDraftJobStart_`/`reqDraftJobContinue_` → 24_ `rpoGenerateRecommendationDraftLockedResult_` → `request_order_allocation_drafts` (UNCHANGED).
7. **Exact old scheduled stopping point** = `runRecommendationGeneration` → `KMREC.generateBatch` → a non-persistent summary (never entered the 48_ job).
8. **Exact new scheduled chain** = 49_ enumerate scopes → self-arming continuation → drive the 48_ job per scope → persisted drafts (see Architecture).
9. **Resumable job owner** = 48_ (per-scope draft persistence). The 49_ run is the browserless multi-scope DRIVER over it.
10. **Continuation owner** = 49_; the one-off trigger handler `continueWeeklyRecommendationJob` (distinct from the recurring 45_ `runWeeklyRecommendation`).
11. **Continuation identity** = the weekly run's `runId` (`WREC-<ts>`) + the per-scope 48_ `runId` (deterministic per scope). ONE `KM_WEEKLY_RECO_RUN` Script Property = one active run.
12. **Continuation trigger cleanup** = clear-before-arm via `gapJobDeleteTriggersByHandler_` (46_'s safe re-read/delete-by-exact-handler) → at-most-ONE `continueWeeklyRecommendationJob` trigger; cleared on DONE/terminal; never touches another handler.
13. **planning_cycle authority** = `gapCalcResolveContext_('ORDER_PLANNING')` (43_) resolved inside 49_ and supplied to every 48_ START (deterministic RECO-YYYY-MM).
14. **Draft identity** = 24_/KMPR active-key `MONTHLY_ORDER::planning_cycle|company|country|marketplace|draft_purpose|sku` (UNCHANGED).
15. **Active-draft collision authority** = 24_/KMPR `resolveActive` (CREATE / REUSE / BLOCKED_CONFLICT) + 48_ single-active + lease (UNCHANGED, not weakened).
16. **Manual/scheduled convergence proof** = the integration test drives the REAL 48_ job from 49_ over a SHARED script lock → every SKU persists via the same 24_-locked authority; drafts are read back by the existing `requestOrderDraft.getActive`.
17. **Duplicate trigger proof** = a 2nd `weeklyRecoStart_` while a fresh run is non-terminal JOINS it (never a 2nd run); a stale run is reclaimed (test A9).
18. **Duplicate continuation proof** = a lease held by another worker (fresh) makes a concurrent `weeklyRecoContinue_` return `busy` and NOT advance (test A10); the lease + single-active 48_ prevent double-advance.
19. **Lost-response/retry proof** = 48_'s idempotent per-SKU REUSE (re-run finds the row by key) + the durable cursor; a trigger-arm throw fails CLOSED to terminal FAILED (test A16) — never a dangling run.
20. **User-edited draft protection** = `SCHEDULED_REFRESH` holds recommended_qty immutable within a draft_version and PRESERVES a user-edited order_qty (`preserveUserQty`); a regenerate over user edits still needs explicit confirmation (UNCHANGED).
21. **Generation provenance** = mode `SCHEDULED_REFRESH` → the EXISTING `generation_type: 'scheduled'` (bundle `MODE_TO_GENERATION_TYPE`); actor `weekly-recommendation-scheduler`. NO new status/value invented (STEP A5).
22. **Quantity authority** = unchanged — recommended_qty is VERBATIM `tN_suggested_qty` from `order_planning_gap` (49_ computes no quantity).
23. **Administration scheduler impact** = NONE to the mechanics — 45_ still owns the single WEEKLY trigger `runWeeklyRecommendation`, Script-Properties config, Asia/Taipei TZ, enable/disable, max-one-trigger reconcile. Only `runWeeklyRecommendation`'s BODY changed (starts the persistence run). Run Now / Last Run remain deferred (no new schema).

### Part B
24. **Chosen Shipment UI owner** = `shipping-history.js` `_shRenderDbCard(...)` overview action area (the smallest existing surface; no Export Center, no redesign).
25. **SHIPDETAIL UI path** = `Generate` → `shGenerateShipmentDoc(sid,'SHIPDETAIL',btn)` → `KM.DB.generateShipmentDocument({shipment_id, document_type:'SHIPDETAIL', generate_file:true})` → surfaces Download/Open.
26. **PL UI path** = same with `document_type:'PL'` (Packing List).
27. **Generate API** = the R3C `KM.DB.generateShipmentDocument` (action `shipmentDocument.generate`) — UNCHANGED.
28. **Download/open contract** = `KM.DB.openGeneratedDocument(res)` opens `download_url` (PDF preferred) in a new tab; the result is cached client-side for the Download/Open link.
29. **Readiness UX** = the group renders only for dispatched statuses (`SH_DOC_READY_STATUSES = in_transit/arrived/received/closed`, where the R2B snapshot exists). States: Generating… → Generated/Ready + Download/Open | a fail-closed reason (Template not configured / Not ready / …). Purely a UX gate — the backend is fail-closed regardless.
30. **Frontend business-logic proof** = the handler forwards only `{shipment_id, document_type, generate_file}`; it does NO placeholder mapping, totals, template selection/version, master lookup, PO aggregation, FIFO, or file/PDF build (guard-tested). Customs / CI / Booking are NOT exposed (Customs stays `LEGAL_IMPORTER_AUTHORITY_GAP` on the backend).

### IMPACT
31. **Files changed** = `49_api_v1_weekly_recommendation_job.gs` (NEW), `47_…recommendation_generation.gs` (`runWeeklyRecommendation` body), `shipping-history.js` (doc group + handlers), `weekly-recommendation-persistence-f1-6b-r1.test.js` (NEW), `shipment-document-ui-f1-6b-r1.test.js` (NEW), `weekly-recommendation-scheduler-f1-6a-r1.test.js` (updated to the F1-6B behavior), this doc.
32. **Tests added/changed** = 2 new (Part A 45 assertions, Part B 22 assertions) + F1-6A scheduler test updated (27).
33. **Focused results** = Part A 45/45 · Part B 22/22 · F1-6A 27/27.
34. **Scheduler regression** = automation-schedule-admin 53/53 (unchanged).
35. **Recommendation regression** = recommendation-generation-f1-4b-fm6 47/47 · request-order-draft-job (48_) 52/52 (unchanged).
36. **Shipment regression** = R3A renderer 37/37 · shipment allocation suites unchanged.
37. **Export regression** = R2B 70/70 · R3A 37/37 · R3B 63/63 · R3C 35/35 (unchanged) · R1 seam-audit 23/23.
38. **Production-safety** = 85/85 (unchanged).
39. **Full regression** = **211 files; only the 4 known baseline failures** (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`) — none new.
40. **Apps Script sync** = `49_api_v1_weekly_recommendation_job.gs` (NEW) + `47_api_v1_recommendation_generation.gs` (modified). Router UNCHANGED (no new POST action — the run is trigger-driven; Part B reuses the R3C `shipmentDocument.generate`).
41. **Frontend deploy** = `assets/js/pages/shipping-history.js`.
42. **Bundle rebuild** = NO (90_ unchanged).
43. **DB/schema impact** = NONE (weekly run state = Script Property `KM_WEEKLY_RECO_RUN`; drafts persist into the EXISTING `request_order_allocation_drafts` file columns).
44. **API impact** = NONE new (Part B reuses `shipmentDocument.generate`).
45. **Formula impact** = NONE.
46. **Forecast/Gap impact** = NONE (49_ reads already-materialized gap rows for scope enumeration only).
47. **RO/PO impact** = NONE (RO exactly-once / PO conversion untouched; the scheduler only produces the same actionable DRAFTS the user then sends).
48. **Shipment impact** = NONE (Part B is read-only generation; `confirmShipmentAndDispatch` untouched).
49. **Export runtime impact** = NONE (Part B reuses R2B/R3A/R3B/R3C).
50. **USER live verification** =
   - Ensure `49_` + `47_` are synced and the ScriptApp trigger authorization is granted (same scope 46_ already uses — run `verifyGapTriggerAuthorization()` once if unsure).
   - In Administration → Automation Schedule, enable Weekly Recommendation (Mon 14:00 Asia/Taipei by default) and Save & Apply → confirms exactly ONE `runWeeklyRecommendation` trigger.
   - After the OP daily gap job is DONE, the weekly fire (or manually run `runWeeklyRecommendation` in the editor) starts the run; the `continueWeeklyRecommendationJob` chain persists drafts. Open the Request Order page for an eligible scope → the drafts appear via `requestOrderDraft.getActive` (generation_type `scheduled`); a user edit to order_qty is preserved on the next weekly run.
   - Shipment Overview → a dispatched shipment card → Documents → Generate Shipping Detail / Packing List → Download/Open the filled Sheet/PDF; re-run → Ready (reused); an unconfigured template → "Template not configured".
51. **Remaining Phase-1 E2E blockers** = INVENTORY (WEEKLY_SHIPPING) scheduled persistence is intentionally NOT built (no resumable backend-drivable authority; would be a second engine) — it remains a summary; a future round could add a resumable inventory draft job if desired. `SCHEDULED_RECOMMENDATION_DRAFT_PERSISTENCE_GAP` is now CLOSED for ORDER_PLANNING. Last Run / Next Run admin surface + Run Now remain deferred (need new schema). No blocker remains for the ORDER_PLANNING Phase-1 E2E path.
52. **Commit hash** = chat.
53. **Recommended next slice** = (a) an optional read-only `weeklyRecommendation.jobStatus` + Last Run surface in Administration (needs a small schema/observability decision); (b) a resumable INVENTORY draft persistence job if scheduled inventory recommendations are wanted; then F1-PHASE1-E2E-FINAL.

## FINAL GATE — all ✓
Weekly schedule → actionable persisted AI Plan draft ✓ · same canonical recommendation runtime ✓ · same canonical
persistence authority (48_/24_) ✓ · no frontend required for scheduled completion ✓ · manual and scheduled converge ✓ ·
duplicate/retry safe ✓ · no duplicate active draft ✓ · user-edited draft protected ✓ · Administration scheduler
preserved ✓ · SHIPDETAIL Generate/Download visible ✓ · PL Generate/Download visible ✓ · R3C backend authority reused ✓ ·
no frontend rendering/business math ✓ · responsive / no overflow ✓ · Forecast/Gap semantics unchanged ✓ · RO/PO
unchanged ✓ · FIFO/Shipment execution unchanged ✓ · Final Output authorities unchanged ✓ · no second engine anywhere ✓ ·
focused tests green ✓ · no new full-regression failures ✓.

**STOP after F1-6B-PHASE1-E2E-PRE-CLOSURE-R1.** F1-PHASE1-E2E-FINAL NOT begun.
