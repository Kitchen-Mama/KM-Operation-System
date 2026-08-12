# F1-PHASE1-LIVE-DEPLOYMENT-CLOSURE-R1 — Production Deployment Alignment + Readiness

**USER-assisted deployment/readiness closure. No business feature, no formula, no lifecycle change; no runtime code
changed this round.** This is the SINGLE authoritative deployment procedure (supersedes all per-round deploy notes).

## §19 FINAL VERDICT → **B. READY_AFTER_REMAINING_USER_ACTIONS**
The **repo/code side is fully ready** (HEAD known, bundle current, schema contracts match, active `.gs` set determined,
tree clean). The remaining items are **USER-owned deployment actions** that the agent cannot execute or observe
(Apps Script sync + new /exec version, live schema/master/template/Drive existence, the 5 triggers, TZ, OAuth,
Pages). None is a discovered defect/mismatch (so not C–H) — they are pending actions, itemized in §14. After the USER
runs the §14 checklist and the two read-only verifiers PASS, readiness flips to **A. READY_FOR_PHASE1_LIVE_ACCEPTANCE**
and F1-PHASE1-LIVE-ACCEPTANCE-R2 may run.

## §0 Repo state
| Item | Value | Evidence |
|---|---|---|
| HEAD | `33a4a54` (F1-PHASE1-LIVE-ACCEPTANCE-R1 ledger) | SOURCE_PROVEN |
| origin/main | `92b54b0` — **HEAD is 1 commit ahead** (USER pushes per round; push `33a4a54`) | SOURCE_PROVEN |
| Working tree | clean | SOURCE_PROVEN |
| Unpushed | **1** (`33a4a54`) | SOURCE_PROVEN |
| Readiness commit | `610ccb2` · E2E commit `92b54b0` · UI grouping `fce6878` (all in HEAD) | SOURCE_PROVEN |

## §1 Final Apps Script source set
- **Active `.gs` count = 49** (`assets/specs/active/apps-script/*.gs`).
- **Sync ALL 49 together as ONE new deployment version** (drift-proof; they share one global scope — the proven LIVE4 stale-mix failure comes from hand-picking a subset). Confirm the bound Spreadsheet identity; verify no unrelated `.gs` remains.
- **No temp/pasted-and-deleted file exists** in the set (the old `99_r4e5c_live_audit_temp.gs` was already removed at `cc75060`). Two committed **READ-ONLY editor diagnostics** — `28_recommendation_verification_diagnostics.gs` and `41_shipping_allocation_schema_audit.gs` — have **no router route** and write nothing; they are harmless to include in the whole-folder sync (they add no deployed Web-App behavior). Nothing to exclude.

## §2 Web App deployment — **NEW version REQUIRED**
`01_router.gs` gained new `doPost` actions across F1-5x/6x (final-output / document / draft-job) and new named trigger
targets were added (`runWeeklyInventoryRecommendation`, `runMonthlyOrderRecommendation`, `continueWeeklyRecommendationJob`).
Router/API change ⇒ a source paste alone is **not** sufficient. Exact order: **update source → Save → Deploy → Manage
deployments → Edit the active Web App deployment → New Version → Deploy → capture the version id + /exec URL.** Record
the current live version id first (rollback).

## §3 Bundle
CURRENT — **40 modules · sha256 `aaf5b07f2292f9e876459f38d5c9533f1451357f1781e3e3622684f4c2918782` · `--check` PASS.**
No rebuild (`node assets/tools/build-apps-script-bundle.js --check`).

## §4 Live DB schema — read-only verifier (paste into the bound editor; writes nothing)
Runtime uses `prodRequireSheet_` (validate-only; throws `SCHEMA_NOT_PROVISIONED` if absent — never creates). Source
contracts match exactly (14/22/30/23/30 + SFO tables + `request_allocation_draft_id`/`shipment_received_qty`/
`shipping_plan_line_id`). LIVE existence is USER-verified with `releaseReadinessVerifySchema_` (from
`F1_PHASE1_RELEASE_READINESS_R1.md` §6):
```javascript
function releaseReadinessVerifySchema_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var need = {
    request_order_line_sources: ['request_allocation_draft_id'],
    shipment_lines: ['shipment_received_qty','shipping_plan_line_id','shipment_qty'],
    shipment_line_allocations: ['purchase_order_line_id','allocated_qty','allocation_status','sku'],
    company_legal_entities: ['company_legal_entity_id','company','legal_name','is_active'],
    shipment_final_output_snapshots: ['snapshot_id'], shipment_final_output_lines: [], shipment_final_output_line_pos: [],
    document_templates: ['template_id','template_file_id','template_file_type','output_folder_id'],
    document_template_fields: ['template_id'], generated_documents: ['document_id','file_id','file_url'],
    request_order_allocation_drafts: [], request_order_allocation_draft_lines: [], request_orders: [], request_order_lines: [],
    purchase_orders: [], purchase_order_lines: ['shipped_qty','remaining_qty','completed_qty'],
    shipments: [], shipment_routes: [], shipment_events: [], shipping_plans: [], shipping_plan_lines: [],
    factory_stock: [], overseas_inventory_snapshot: [], warehouses: [], logistics_locations: [],
    sku_details: ['units_per_carton','gs1_code','gs1_type'], marketplace_skus: [], tax_referral_rates: ['hscode','declared_value','declared_currency']
  };
  var out = [];
  Object.keys(need).forEach(function (t) {
    var sh = ss.getSheetByName(t);
    if (!sh) { out.push('MISSING_TABLE: ' + t); return; }
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var miss = need[t].filter(function (c) { return hdr.indexOf(c) === -1; });
    out.push(miss.length ? 'MISSING_COLUMN ' + t + ': ' + miss.join(',') : 'OK ' + t + ' (' + hdr.length + ' cols)');
  });
  Logger.log(out.join('\n')); return out;
}
```
Expected: every line `OK`. Any `MISSING_TABLE`/`MISSING_COLUMN` → provision via the R2A-LIVE/R2B/R3B USER-run snippets (never recreate an existing sheet).

## §5 Required master data (read-only; USER_ACTION_REQUIRED if absent)
`company_legal_entities`: exactly one active row for KM, ResTW, ResUS · a usable factory warehouse + destination
warehouse + `logistics_location` + SKU + marketplace SKU + factory-stock row for the flagship scope · **SHIPDETAIL** and
**PL** `document_templates` active with real `template_file_id`, `template_file_type='google_sheet'`, `output_folder_id`,
and `document_template_fields` mappings. Do not fabricate values.

## §6 Automation triggers — read-only verifier
`releaseReadinessListTriggers_` (from readiness §9). Expected: exactly one each of `runAmazonSnapshotImports`,
`runDailyInventoryGapMaterialization`, `runDailyOrderPlanningGapMaterialization`, `runWeeklyInventoryRecommendation`,
`runMonthlyOrderRecommendation`; **zero `runWeeklyRecommendation`** (legacy); continuation handlers
(`continue…GapMaterializationJob`, `continueWeeklyRecommendationJob`) present ONLY while a job is actually RUNNING; no
duplicates. The check deletes nothing.

## §7 Trigger reconciliation (USER)
If the set is wrong, do **not** hand-create triggers — open **Administration → Automation Schedule** and **Save & Apply**
each canonical automation (the reconciler owns trigger creation and sweeps the legacy `runWeeklyRecommendation`). The
page must show three groups: **SOURCE DATA** [Amazon/Site Data Import] · **INVENTORY PLANNING** [Inventory Gap → Weekly
Inventory Recommendation] · **ORDER PLANNING** [Order Planning Gap → Monthly Order Recommendation]. Re-run the verifier after.

## §8 Timezone
Apps Script **project timezone = Asia/Taipei** (so `atHour`/`onMonthDay` match); Automation Schedule reports Asia/Taipei.
Never browser timezone.

## §9 OAuth (grant before Live Acceptance)
`spreadsheets` · `script.scriptapp` (trigger create/delete) · `drive` (template copy + generated Sheet + folder read) ·
`drive`→PDF export (`getAs('application/pdf')` + `createFile`). Grant safely by running `releaseReadinessListTriggers_()`
once (ScriptApp) and authorizing the prompts; the Drive/PDF scope is surfaced by the first document generation in R2
(do not run a business transaction here just to trigger OAuth).

## §10 Frontend (GitHub Pages)
Redeploy **current `main`** as ONE cumulative Pages release (covers all Phase-1 frontend changes incl. the UI grouping:
`automation-schedule.js/.html/.css`). Do not give piecemeal per-round deploy steps. Capture the served commit SHA if the
app exposes one; else use the Pages deployment record as evidence.

## §11 Document / Drive readiness (read-only)
Confirm each configured `template_file_id` opens in Drive and each `output_folder_id` is writable by the Apps Script
runtime identity. Do not generate a business document in this round.

## §13 Version match required for Live Acceptance
`repo HEAD == deployed frontend == Apps Script /exec version == expected schema contracts`. If any one cannot be proven,
do not authorize Live Acceptance.

## §14 USER DEPLOYMENT CHECKLIST (ONE ordered list)
1. Push current HEAD (`git push origin main` — currently `33a4a54`, 1 unpushed).
2. Confirm `origin/main == HEAD`.
3. Back up the Operation System DB (copy the Spreadsheet).
4. Run `releaseReadinessVerifySchema_()` → all `OK` (provision any MISSING via the documented snippets).
5. Confirm master data (§5): company legal entities (KM/ResTW/ResUS), SHIPDETAIL/PL templates + fields, warehouses/locations/SKU/factory-stock.
6. Sync the final Apps Script source — **all 49 `.gs`** — into the bound project (record the current live version id first).
7. Save the Apps Script project.
8. Deploy → Manage deployments → Edit the Web App deployment → **New Version** → Deploy; capture the version id + /exec URL.
9. Confirm Apps Script project timezone = **Asia/Taipei**.
10. Grant OAuth scopes (§9).
11. Open Administration → Automation Schedule (verify the three groups render).
12. **Save & Apply** the five canonical automations (creates/reconciles triggers; sweeps legacy `runWeeklyRecommendation`).
13. Run `releaseReadinessListTriggers_()` → 5 recurring ≤1 each, zero legacy, no orphan continuation.
14. Redeploy GitHub Pages from current `main`.
15. Re-run `releaseReadinessVerifySchema_()` (post-sync sanity) → all `OK`.
16. Open each SHIPDETAIL/PL `template_file_id` + `output_folder_id` in Drive (resolve/writable).
17. Confirm all readiness gates PASS → then F1-PHASE1-LIVE-ACCEPTANCE-R2 is authorized.

## §18 Completion report
1. PRE HEAD `33a4a54`. 2. POST HEAD = this docs-only commit. 3. origin/main `92b54b0` (HEAD 1 ahead). 4. tree clean. 5. unpushed 1.
6. Active `.gs` = **49**. 7. Sync = **all 49 as ONE new version** (drift-proof; 28_/41_ are read-only editor diagnostics, harmless; no temp files). 8. New Web App version = **YES** (router + new trigger targets). 9. Bundle modules = 40. 10. Bundle hash = `aaf5b07…`. 11. Bundle check = **PASS**.
12. Schema verifier = **contracts match (SOURCE); LIVE = USER-run `releaseReadinessVerifySchema_`**. 13–15. missing tables/columns/drift = NONE in source; live pending USER run.
16–21. company_legal_entities / warehouse-location / SKU-master / SHIPDETAIL / PL / Drive = **USER-verified (read-only)**; itemized in §5/§11.
22–26. Live trigger set / duplicates / legacy count / continuation state / TZ = **USER-run `releaseReadinessListTriggers_` + Save & Apply** (canonical set defined; legacy expected 0; TZ Asia/Taipei).
27–30. OAuth / frontend / Apps Script deploy / version id = **USER-owned (pending)**.
31. Actions completed by agent = repo verification (HEAD/bundle/schema-contracts/`.gs` set), authoritative checklist + verifiers. 32. Actions still required = the §14 checklist (all USER-owned).
33. Readiness blockers = none discovered in code; deployment is pending USER execution. 34. Tests/checks = bundle `--check` PASS; last full regression at HEAD code = **213 files, 4 known baseline failures** (no code changed since). 35. Files changed = this doc + ledger entry (docs only). 36. DB/schema impact = NONE. 37. Commit = chat. 38. Verdict = **B. READY_AFTER_REMAINING_USER_ACTIONS**. 39. Next slice = execute §14 → run the two verifiers → **F1-PHASE1-LIVE-ACCEPTANCE-R2**.

## FINAL GATE
current HEAD known ✓ · bundle current ✓ · schema contracts match (source) ✓ · active `.gs` set determined (49, no temp) ✓ ·
cumulative sync + new-version procedure defined ✓ — **code side READY**. Apps Script aligned / new /exec version /
frontend aligned / live schema / master data / templates / Drive / 5 triggers / legacy absent / Asia/Taipei / OAuth =
**USER-owned, pending §14**. Authorize R2 only after §14 completes and both verifiers PASS.

**STOP after F1-PHASE1-LIVE-DEPLOYMENT-CLOSURE-R1.** No business Live Acceptance run in this round.
