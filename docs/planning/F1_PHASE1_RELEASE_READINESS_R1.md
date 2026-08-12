# F1-PHASE1-RELEASE-READINESS-R1 — Production Deployment / Schema / Trigger / Runtime Alignment Audit

**Audit-only. No new business behavior.** Reconciles repo HEAD against the production environment and produces ONE
authoritative release-readiness checklist. **Verdict: `B. READY_AFTER_USER_DEPLOYMENT_ACTIONS`** — the repository is
internally consistent, the bundle is current, schema contracts match, and the full test suite is green (only the 4
known baseline failures). The only gating items are USER-owned deployment/config actions (Apps Script sync + new
deployment version, GitHub Pages redeploy, seed template/entity data, attach triggers, grant OAuth) plus read-only
live checks. No schema/version/runtime drift found.

---

## §1 Git / commit audit
| Fact | Value |
|---|---|
| PRE/POST HEAD | `c7ecc9b` (this is an audit round; POST = the docs-only ledger commit) |
| origin/main (local ref) | `c7ecc9b` — **== HEAD** (reflog shows the USER pushes after each round; normal manual-release flow) |
| Working tree | **clean** |
| Unpushed commits | **0** (git layer aligned) |
| Linear / compatible | yes — the session's commits are a linear, superseding chain (F1-6A → F1-6B-PRE-CLOSURE → F1-6B-CLOSURE); each later commit's deployment instructions SUPERSEDE the earlier per-round ones |

**Superseded intra-session instructions (do NOT re-run):** the per-round "sync `47_`", "sync `36_`+`37_`", "sync
`45_`+`47_`" notes are all subsumed by the ONE cumulative set below. Git push is already done (origin/main == HEAD).

## §2–§3 Apps Script cumulative sync set + deployment version
Last recorded **deployed** Apps Script baseline (release log) = `226b027` (2026-08-10). `.gs` files changed
`226b027..HEAD` (**23** of 49):

```
01_router.gs  05_overseas_inventory_handlers.gs  12_shipment_handlers.gs  13_procurement_handlers.gs
15_request_allocation_handlers.gs  16_shipping_allocation_handlers.gs  22_shipment_dispatch_handlers.gs
24_recommendation_orchestrator.gs  31_shipment_receipt_route_handlers.gs  32_shipment_line_allocation_handlers.gs
33_party_authority_handlers.gs  34_shipment_final_output_handlers.gs  35_shipment_document_renderer.gs
36_document_template_handlers.gs  37_shipment_document_file_renderer.gs  42_api_v1_recommendation_workspace.gs
43_api_v1_gap_materialization.gs  45_api_v1_automation_schedule.gs  46_api_v1_gap_materialization_job.gs
47_api_v1_recommendation_generation.gs  48_api_v1_request_order_draft_job.gs  49_api_v1_weekly_recommendation_job.gs
90_generated_supply_planning_bundle.gs
```

**RECOMMENDED (drift-proof, per the release log's own established guidance):** re-sync the **ENTIRE**
`assets/specs/active/apps-script/*.gs` folder (all **49** `.gs`) as ONE new deployment version. All `.gs` share one
global scope; a partial hand-picked subset is the proven LIVE4 stale-mix failure mode. Confirm the bound Spreadsheet
identity before overwriting; verify no unrelated `.gs` is left behind.

**§3 Deployment procedure = source paste (all `.gs`) + a NEW Web App deployment version.** Reason: `01_router.gs`
changed (new `doPost` actions across the F1-5x/6x rounds — `finalizeShipmentFinalOutput`, `getShipmentFinalOutput`,
`renderShipmentDocument`, `documentTemplate.*`, `shipmentDocument.*`, the request-order draft job actions), and new
named trigger targets were added (`runWeeklyInventoryRecommendation`, `runMonthlyOrderRecommendation`,
`continueWeeklyRecommendationJob`, `continueInventory/OrderPlanningGapMaterializationJob`). Router changes require a
new `/exec` deployment version, not a paste alone; trigger targets must be present in the deployed source before their
triggers can fire. Record the current live version id BEFORE creating the new one (rollback).

## §4 Bundle integrity
| | |
|---|---|
| Tool | `assets/tools/build-apps-script-bundle.js` |
| `--check` | **PASS** — `bundle up to date` |
| Modules | **40** |
| sha256 | `aaf5b07f2292f9e876459f38d5c9533f1451357f1781e3e3622684f4c2918782` |
| Committed 90_ matches current source | **YES** (a rebuild reproduces the identical source hash; the committed `90_generated_supply_planning_bundle.gs` is authoritative — no stale bundle, no rebuild needed) |

## §5 Frontend cumulative deploy set (GitHub Pages, from `main`)
Changed `226b027..HEAD` (redeploy Pages from current `main`; a single redeploy covers all — no per-file action):
```
index.html
assets/js/api/operation-system-db-api.js
assets/js/pages/  automation-schedule.js  global-logistics-map.js  inventory-replenishment.js
                  overseas-stock.js  request-order.js  request-order-draft.js  shipping-history.js  sku-details.js
assets/js/core/   supply-planning-*  (allocation-runtime, factory-cohort, persistence, persistence-repository,
                  plan-bridge, plan-builder, production-source, production-writer, shipment-line-source,
                  source-facts, source-projection, supply-candidates)
assets/js/utils/  demo-shared-data.js  gap-recalc-transport.js  scope-select-modal.js
assets/css/       components.css  pages/global-logistics-map.css  pages/inventory-replenishment.css
                  pages/overseas-stock.css  pages/request-order.css
assets/html/pages/  global-logistics-map.html  inventory-replenishment.html  request-order.html
```
The `assets/js/core/*` changes are already compiled into the committed `90_` bundle (§4); the Pages deploy ships the
browser copies. No superseded frontend versions remain (linear history; latest `main` is authoritative).

## §6 / §7 DB schema readiness + contract-drift
**No SCHEMA_CONTRACT_DRIFT.** Runtime header constants (source-of-truth) match the expected live contracts exactly:

| Table | Runtime header const | Cols | Expected | Status |
|---|---|---|---|---|
| shipment_line_allocations | `SHIPMENT_LINE_ALLOCATIONS_HEADERS_` | 14 | 14 | ✓ |
| company_legal_entities | `COMPANY_LEGAL_ENTITIES_HEADERS_` | 22 | 22 | ✓ |
| document_templates | `DOCUMENT_TEMPLATES_HEADERS_` | 30 | 30 | ✓ |
| document_template_fields | `DOCUMENT_TEMPLATE_FIELDS_HEADERS_` | 23 | 23 | ✓ |
| generated_documents | `GENERATED_DOCUMENTS_HEADERS_` | 30 | 30 | ✓ |
| shipment_final_output_snapshots | `SFO_SNAPSHOT_HEADERS_` | 67 | R2B-frozen | ✓ present |
| shipment_final_output_lines | `SFO_LINE_HEADERS_` | 30 | R2B-frozen | ✓ present |
| shipment_final_output_line_pos | `SFO_LINE_PO_HEADERS_` | 10 | R2B-frozen | ✓ present |
| request_order_line_sources.request_allocation_draft_id | — | — | required | ✓ present |
| shipment_lines.shipment_received_qty / shipping_plan_line_id | — | — | required | ✓ present |

**LIVE existence is USER-verified (read-only).** The runtime uses the production-safety adapter
`prodRequireSheet_` (validate-only; throws `SCHEMA_NOT_PROVISIONED` if a sheet/header is absent — it NEVER creates),
so a missing live table fails closed, never silently. Paste-once read-only verifier (run in the bound Apps Script
editor; **reads only, writes nothing**):

```javascript
function releaseReadinessVerifySchema_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var need = {
    request_order_line_sources: ['request_allocation_draft_id'],
    shipment_lines: ['shipment_received_qty','shipping_plan_line_id','shipment_qty','snapshot_current_stock'],
    shipment_line_allocations: ['purchase_order_line_id','allocated_qty','allocation_status','sku'],
    company_legal_entities: ['company_legal_entity_id','company','legal_name','is_active'],
    shipment_final_output_snapshots: ['snapshot_id'], shipment_final_output_lines: [], shipment_final_output_line_pos: [],
    document_templates: ['template_id','template_file_id','template_file_type','output_folder_id'],
    document_template_fields: ['template_id'], generated_documents: ['document_id','file_id','file_url'],
    shipments: [], shipment_routes: [], shipment_events: [], shipping_plans: [], shipping_plan_lines: [],
    purchase_orders: [], purchase_order_lines: ['shipped_qty','remaining_qty','completed_qty'],
    request_orders: [], request_order_lines: [], order_planning_gap: [],
    sku_details: ['units_per_carton','gs1_code','gs1_type'], marketplace_skus: [], warehouses: [],
    logistics_locations: [], tax_referral_rates: ['hscode','declared_value','declared_currency']
  };
  var out = [];
  Object.keys(need).forEach(function (t) {
    var sh = ss.getSheetByName(t);
    if (!sh) { out.push('MISSING SHEET: ' + t); return; }
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var miss = need[t].filter(function (c) { return hdr.indexOf(c) === -1; });
    out.push((miss.length ? 'MISSING COLS ' + t + ': ' + miss.join(',') : 'OK ' + t + ' (' + hdr.length + ' cols)'));
  });
  Logger.log(out.join('\n')); return out;
}
```

## §8 Required master / seed data (USER action items — do NOT fabricate real values)
| Data | Requirement | Owner |
|---|---|---|
| `company_legal_entities` | KM, ResTW, ResUS — exactly ONE `is_active=TRUE` row each (legal_name/address/tax id) | USER (R2A-LIVE migration snippet already provided) |
| `logistics_locations` | the destination warehouse(s) used by the E2E test shipment (identity = `warehouse_id`) | USER |
| `document_templates` | active `SHIPDETAIL` + `PL` rows: real `template_file_id`, `template_file_type='google_sheet'`, `output_folder_id` (convention `TPL-{DOC}-{SCOPE}-V{n}`) | USER |
| `document_template_fields` | required `{{TOKEN}}` mappings for SHIPDETAIL + PL (scalars + line/allocation collections) | USER |
| `warehouses` | factory + destination identities used by the fixture | USER (likely already seeded) |
| `sku_details` | `units_per_carton`, `gs1_code`/`gs1_type`, product facts for the test SKUs | USER (likely already seeded) |
| `tax_referral_rates` | destination/origin HS + declared value/currency mapping where snapshot generation reads it | USER (likely already seeded) |

The three SFO snapshot tables + the three document-runtime tables + `company_legal_entities` are the NEWEST tables
(F1-5C-EXPORT R2A/R2B/R3B) — most likely to be un-provisioned live. Provision them (USER-run migration snippets from
the R2A-LIVE / R2B / R3B docs) BEFORE the E2E, else `finalizeShipmentFinalOutput` / `shipmentDocument.generate` fail
closed with `SCHEMA_NOT_PROVISIONED`.

## §9 / §10 Automation trigger readiness + dependency chain
Canonical production trigger set (each **max one**, project TZ **Asia/Taipei**):

```
runAmazonSnapshotImports              (Source Import — DAILY ~12:30)
runDailyInventoryGapMaterialization   (Inventory Gap — DAILY 13:30)
runDailyOrderPlanningGapMaterialization (Order Planning Gap — DAILY 03:30 D+1)
runWeeklyInventoryRecommendation      (Weekly Inventory Rec — WEEKLY, opt-in)
runMonthlyOrderRecommendation         (Monthly Order Rec — MONTHLY day 10, opt-in)
+ transient one-off continuation triggers ONLY while a job is RUNNING:
    continueInventoryGapMaterializationJob · continueOrderPlanningGapMaterializationJob · continueWeeklyRecommendationJob
```

Dependency chain (frozen, fail-closed prerequisites — verified present in source):
```
Source Import → Inventory Gap Materialization → Weekly Inventory Recommendation   (INVENTORY gap DONE gate)
Source Import → Order Planning Gap Materialization → Monthly Order Recommendation → 49_→48_→24_ persisted RO draft
                                                                                     (ORDER_PLANNING gap DONE gate)
```
**No stale-gap fallback / no hidden recompute** — the gate consumes only the materialized gap authority; a
not-DONE/partial/RUNNING/mismatched gap → truthful BLOCKED (`GAP_JOB_NOT_DONE` / `ORDER_PLANNING_GAP_NOT_READY` /
`GAP_GENERATION_CHANGED`). **The retired `runWeeklyRecommendation` is NOT in the 45_ registry** (grep count = 0) and
is auto-swept on any Save & Apply. Paste-once read-only trigger verifier:

```javascript
function releaseReadinessListTriggers_() {
  var canon = { runAmazonSnapshotImports:1, runDailyInventoryGapMaterialization:1, runDailyOrderPlanningGapMaterialization:1,
                runWeeklyInventoryRecommendation:1, runMonthlyOrderRecommendation:1,
                continueInventoryGapMaterializationJob:1, continueOrderPlanningGapMaterializationJob:1, continueWeeklyRecommendationJob:1 };
  var count = {}, out = [];
  ScriptApp.getProjectTriggers().forEach(function (t) { var h = t.getHandlerFunction(); count[h] = (count[h]||0)+1; });
  Object.keys(count).forEach(function (h) {
    var flag = (h === 'runWeeklyRecommendation') ? '  ← LEGACY: delete (retired)' :
               (!canon[h] ? '  ← UNKNOWN handler' : (count[h] > 1 ? '  ← DUPLICATE (expect 1)' : ''));
    out.push(count[h] + '× ' + h + flag);
  });
  Logger.log(out.join('\n')); return out;   // read-only; deletes nothing
}
```
Expected result: at most one each of the 5 recurring handlers; continuation handlers present ONLY during an active
job; **zero** `runWeeklyRecommendation`. (Deletion of a lingering legacy trigger is USER-authorized — this audit does
not delete.)

## §11 Document / Drive readiness (USER live checks)
- R2B snapshot tables + document-runtime tables live (see §6 verifier). · SHIPDETAIL/PL templates seeded (§8). ·
`template_file_id` + `output_folder_id` resolve (open them in Drive). · `generated_documents` writable. · Generate/
Download UI → canonical `shipmentDocument.generate` (verified in source: `operation-system-db-api.js` +
`shipping-history.js`). Do NOT generate a production file in this audit.

## §12 Authorization / OAuth scopes (granted on first run)
Introduced by current Phase-1 code — the bound editor must authorize once:
`spreadsheets` (read/write DB) · `script.scriptapp` (create/delete time triggers — gap jobs + the recommendation
scheduler + continuation triggers) · `drive` (copy template + write generated Sheet, read folder) ·
`drive`→PDF export (`getAs('application/pdf')` + `createFile`). Run one editor function once (e.g.
`releaseReadinessListTriggers_` for ScriptApp, then a single `shipmentDocument.generate` dry-run for Drive/PDF) to
surface + grant every scope before E2E, so no mid-E2E scope prompt invalidates a run.

## §13 Known historical data (backward-compat — do NOT backfill/guess/cancel/delete)
Legacy Request Orders with old execution identity + historical `submitted` allocations with blank lineage are treated
backward-compatibly by the runtime (exactly-once keys tolerate blanks; the prior live audit found no active
collision). **E2E must use NEW records only.**

## §14 Known residuals — classification
| # | Residual | Blocks core Phase-1 E2E? | Why |
|---|---|---|---|
| 1 | Weekly INVENTORY actionable-draft persistence not canonical | **NO** | Inventory has no resumable backend persister (would be a 2nd engine); the E2E core path is Order Planning → RO → PO → Shipment → Final Output. Weekly Inventory runs the gated canonical runtime. |
| 2 | Automation Last-Run / persistent blocked-history UI absent | **NO** | The safety gate returns truthful BLOCKED at runtime; only the persistent-history *UI* is deferred (needs schema). |
| 3 | Customs `LEGAL_IMPORTER_AUTHORITY_GAP` | **NO** | SD/PL never consult customs; Customs/CI are out of the core E2E scope. |
| 4 | CI/Booking/Customs broader document families | **NO** | Not in the frozen core scope (SD + PL only). |
| 5 | Post-dispatch shipment reversal policy deferred | **NO** | E2E is a forward happy-path; reversal is a separate policy round. |
| 6 | 4 known regression baseline failures | **NO** | Pre-existing, unrelated to the E2E path (gap-done-notice UI, OP monthly projection consumer, replen header toggle, supply-planning route inventory); count unchanged. |

None block the core Phase-1 E2E (Order Planning → persisted RO draft → RO exactly-once → PO exactly-once → Shipment
FIFO → Confirm & Dispatch → Incoming/Receipt → Final Output snapshot → SD/PL file → download).

## §15 Release readiness gate → **`B. READY_AFTER_USER_DEPLOYMENT_ACTIONS`**
Not `C` (no schema drift — contracts match). Not `D` (no code-level missing data — the runtime fails closed on
missing seed; seeding is a USER config action, not a defect). Not `E` (no version mismatch — bundle current, git
aligned). `A` is blocked only by USER-owned deployment/config that this agent cannot execute.

## §16 Tests
Focused (all green): scheduler split 33/33 · split-migration 12/12 · admin 57/57 · scheduled persistence 45/45 ·
recommendation-generation 47/47 · request-order draft job 52/52 · final-output R2B 70/70 · renderer R3A 37/37 · document
runtime R3B 63/63 · file renderer R3C 35/35 · document UI 22/22 · production-safety 85/85 · seam-audit R1 23/23.
**Full regression: 212 files — only the 4 known baseline failures (none new).**

## §17 Completion report (indexed)
1. PRE HEAD `c7ecc9b`. 2. POST HEAD = this docs-only ledger commit. 3. origin/main `c7ecc9b` (==HEAD). 4. working tree
clean. 5. unpushed 0. 6. unpushed summary: none (git aligned; per-round pushes done). 7. Apps Script sync = the 23
changed `.gs` (§2) — **RECOMMEND full-folder (49) re-sync as ONE version**. 8. New deployment version **YES** (router +
new trigger targets). 9. Bundle current: 40 modules, sha256 `aaf5b07…`, `--check` PASS. 10. Frontend = one Pages
redeploy of the §5 set. 11. Schema readiness = §6 table (contracts ✓; live existence USER-verified). 12. Drift = NONE.
13. Seed data = §8. 14. company_legal_entities = 22-col contract ✓; seed KM/ResTW/ResUS (USER). 15. logistics_locations
= identity `warehouse_id`; seed destinations (USER). 16. document_templates = 30-col ✓; seed SHIPDETAIL/PL (USER). 17.
document_template_fields = 23-col ✓; seed mappings (USER). 18. Drive/output folder = USER resolve. 19. Triggers = §9
canonical set + verifier. 20. Legacy trigger = none in source (registry count 0); a lingering live one is USER-deleted.
21. Continuation triggers = transient-only, cleared on terminal. 22. Dependency chain = §10. 23. OAuth = §12. 24.
Historical data = §13 (backward-compatible; E2E uses new records). 25. Residuals = §14 (none block core E2E). 26.
Focused = §16 green. 27. Full regression = 212 files / 4 baseline. 28. USER deploy steps = below. 29. USER read-only
checks = below. 30. E2E authorization criteria = below. 31. Verdict = **B**. 32. Files changed = this doc + the release
log entry (docs only; no runtime change). 33. Commit hash = chat. 34. Next slice = **F1-PHASE1-E2E-FINAL** (after the
USER deployment actions + read-only checks pass).

### §28 USER production deployment steps (IN ORDER)
1. (git already done — origin/main == HEAD; nothing to push.)
2. Provision any un-provisioned live tables (USER-run migration snippets from R2A-LIVE / R2B / R3B docs): the 3 SFO
   snapshot tables, the 3 document-runtime tables, `company_legal_entities`. Do NOT recreate existing sheets.
3. In the bound Apps Script project: paste the **entire** `assets/specs/active/apps-script/*.gs` folder (all 49; verify
   bound Spreadsheet identity; confirm no unrelated `.gs` remains). Record the current live deployment version id first.
4. Save → **create a NEW Web App deployment version** → verify `/exec` is the production URL.
5. Set/confirm the Apps Script **project timezone = Asia/Taipei**.
6. Grant OAuth: run `releaseReadinessListTriggers_()` once (ScriptApp scope) + one `shipmentDocument.generate` dry-run
   (Drive/PDF scope) — approve all prompts.
7. Seed the §8 master/template data.
8. Attach the 5 recurring triggers (or `installGapMaterializationTriggers_` for the 3 gap/import ones; enable the two
   Recommendation automations via Administration → Automation Schedule → Save & Apply, which also sweeps any legacy
   `runWeeklyRecommendation` trigger). Delete any leftover legacy trigger surfaced by the verifier.
9. Redeploy **GitHub Pages** from current `main` (ships the §5 frontend set).

### §29 USER read-only live checks (IN ORDER)
1. `releaseReadinessVerifySchema_()` → every line `OK …` (no MISSING). 2. `releaseReadinessListTriggers_()` → 5
recurring handlers ≤1 each, zero `runWeeklyRecommendation`, no UNKNOWN/DUPLICATE. 3. Open the SHIPDETAIL + PL
`template_file_id` + `output_folder_id` in Drive (resolve). 4. Administration → Automation Schedule shows Weekly
Inventory (Weekly) + Monthly Order (Monthly, Day 10) as independent ENABLED cards, each Trigger: Active.

### §30 Criteria to authorize F1-PHASE1-E2E-FINAL
All of §29 pass **AND** step 3 (full `.gs` sync + new deployment version) **AND** step 7 (seed data) complete **AND**
a single non-destructive dry-run of `runMonthlyOrderRecommendation()` from the editor returns `OK` (or a truthful
`BLOCKED` only because the OP gap is not yet DONE — then run the gap job first). No live schema `MISSING`; no legacy
trigger; templates resolve.

## §18 FINAL GATE — known exactly
Code to deploy = all 49 `.gs` (23 changed) + new version ✓ · Frontend = §5 Pages redeploy ✓ · Bundle = committed 90_
(40 modules, `aaf5b07`, current) ✓ · Schema = §6 (contracts match; live USER-verified) ✓ · Master/template data = §8 ✓ ·
Triggers = §9 canonical set ✓ · OAuth = §12 ✓ · Residuals = §14 (none block core E2E) ✓. **No unresolved production
version ambiguity.** Verdict **`B. READY_AFTER_USER_DEPLOYMENT_ACTIONS`** → next authorized slice **F1-PHASE1-E2E-FINAL**
once the USER actions + read-only checks pass.

**STOP after F1-PHASE1-RELEASE-READINESS-R1.** E2E NOT begun; no new business feature added.
