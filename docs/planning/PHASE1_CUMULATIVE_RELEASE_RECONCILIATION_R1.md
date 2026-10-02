# PHASE-1 CUMULATIVE RELEASE RECONCILIATION R1

Read-only reconciliation. **Nothing was pushed, merged, deployed, copied into Apps Script, deleted from the
live project, or written to production data.** The one change this round makes to the repository is the
application cache-token rotation (§10), which every S7 round deferred to "the final cumulative release".

```
PRE_SHA                 b783076
CURRENT_BRANCH          feature/product-strategy-board-p0
ORIGIN_MAIN_SHA         1a0ca13      (last-known remote-tracking ref; no fetch performed)
ORIGIN_FEATURE_SHA      2b82288
LOCAL_AHEAD_COUNT       85           ahead of origin/main
LOCAL_BEHIND_COUNT      1            behind origin/main
WORKTREE_CLEAN_AT_START YES
```

---

## 1. The finding that changes the release

**The deployed backend is R14, not R24, and the release ledger's copy list is not the deployment set.**

`fc-target-rule-release-stamp-r2b-a2-r5-f3.test.js` anchors `BASE = e583057`, whose `63_` declares
`…-R24`, and its comment reads *"R25 was the last release cut against a SHIPPED tree."* Used as a deployment
list, that would ship three stale files.

The only **live** evidence in the repository says otherwise. `APPS_SCRIPT_RUNTIME_SLIM_R1_LOAD_SURFACE_AUDIT.md`
records a `system.health` probe against the running project:

```
Frontend 74aca0b · backend release F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R14
main = origin/main = feature = origin/feature = 74aca0b · both worktrees clean
build_id R14 · mixed_deployment false · absent/stale/missing_actions all []
```

`74aca0b` is the last tree where git and Apps Script were both current. It is an ancestor of `e583057` by
66 commits, and ten releases (R15–R24) were cut in between with **no deployment record**: the release log's
last entry is R13, and nothing after it records a sync.

So the ledger is not wrong — it audits **one release** and says so — but it answers a different question
than this round asks. Derived from the ledger's `BASE`, the copy set omits:

```
04_marketplace_forecast_import.gs
59_api_v1_sku_details_workspace.gs
72_api_v1_product_pricing_workspace.gs
```

**Resolution: copy the superset derived from R14, and verify the live build before touching anything.**
Copying a file whose bytes production already has is a no-op; omitting one is a half-sync. `GIT_GATE_0`
below makes the live `build_id` read the first action of the release, which settles it definitively.

```
LAST_KNOWN_DEPLOYED_BACKEND_RELEASE   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R14   (live probe, 74aca0b)
                                      R24 is CLAIMED by a ledger comment and is UNVERIFIED
CURRENT_HEAD_BACKEND_RELEASE          F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40
```

---

## 2. origin/main reconciliation

```
MAIN_ONLY_COMMIT_SET        1a0ca13  "1001_Logo_red_update_submit"  (assets/img/logo_only_red.png, +4938 B)
FEATURE_ONLY_COMMIT_COUNT   85
PATH_CONFLICT_COUNT         1   (the logo — touched by both sides)
SEMANTIC_CONFLICT_COUNT     0
MAIN_BRANDING_ASSET_HASH_MATCH  YES
```

Both sides carry blob `6f547ec4baf6d279ff0f64fbc747b1ad5b3c7e5b`, sha256
`187c6394e4089fd1150f630e1bcf8e50b0e7778392ad92a80634b3233e50cf13`. A read-only `git merge-tree` produces
tree `10284bb3e5ac966fcd56778adfa32139eee7959a` with **zero conflicts**. `origin/main` contains nothing
beyond the branding commit, so no classification STOP is triggered.

---

## 3. Production Apps Script runtime universe

```
FINAL_PRODUCTION_APPS_SCRIPT_RUNTIME_FILE_COUNT   77 .gs  (+ appsscript.json)
NON_RUNTIME_TEMP_IN_PRODUCTION_RUNTIME_UNIVERSE    0
GENERATED_RUNTIME_OWNER_SET                        90_generated_supply_planning_bundle.gs
```

Derived at HEAD from `assets/tests/_production-deploy-surface.js`, not carried forward: 77 declared, 77
live, 0 undeclared, 0 missing, 0 non-runtime by name.

---

## 4. FINAL_APPS_SCRIPT_COPY_SET — 18 files

Derived from `git diff 74aca0b HEAD -- assets/specs/active/apps-script/`.

| # | file | current release | why copy | order | half-sync hazard |
|---|---|---|---|---|---|
| 1 | `05_overseas_inventory_handlers.gs` | R35 | S6 overseas reserve/release/consume + GROSS import | 1 | `12_`/`22_` resolve `ovs*Tx_` from it; copied later ⇒ ReferenceError at dispatch |
| 2 | `04_marketplace_forecast_import.gs` | B1-PERF | FC regular batch writer hardening | 2 | a stale copy writes un-validated batches |
| 3 | `11_shipping_plan_handlers.gs` | R34 | S6 plan status owner | 2 | plan/shipment status divergence |
| 4 | `12_shipment_handlers.gs` | R34 | S6 shipment creation + reservation | 3 | needs `05_` |
| 5 | `21_factory_inventory_handlers.gs` | R35 | factory stock + adjustment truth | 2 | adjustment readback lies |
| 6 | `22_shipment_dispatch_handlers.gs` | R37 | DECLARED_SOURCE_ONLY dispatch | 3 | needs `05_`; old copy may fall back cross-warehouse |
| 7 | `14_fc_write_handlers.gs` | R13 | FC target-rule / write consistency | 2 | FC writes refuse or mis-scope |
| 8 | `20_campaign_write_handlers.gs` | R32 | campaign + campaign_sku_line writer | 2 | event→line referential integrity |
| 9 | `47_api_v1_recommendation_generation.gs` | carried | recommendation generation | 2 | — |
| 10 | `58_api_v1_fc_summary_workspace.gs` | R14+ | FC summary slices (bootstrap/regular/events/rules) | 2 | **must precede the FC frontend** |
| 11 | `59_api_v1_sku_details_workspace.gs` | R15–R24 | SKU details workspace | 2 | **omitted by the ledger list** |
| 12 | `72_api_v1_product_pricing_workspace.gs` | R15–R24 | pricing read workspace | 4 | **omitted by the ledger list**; pairs with `73_` |
| 13 | `73_api_v1_pricing_write.gs` | R21 | **NEW FILE** — pricing write owner | 4 | router routes `pricing.update`; without it the action is a ReferenceError |
| 14 | `17_carrier_handlers.gs` | stampless | S7 carrier lead-time write owner | 5 | **must travel with `01_`** |
| 15 | `57_api_v1_shipment_workspace.gs` | stampless | carriers master on the shipment read | 5 | **must precede the carrier-name frontend** |
| 16 | `01_router.gs` | R39 | dispatches `carrierLeadTime.*`, `pricing.*` | 6 | routes to `17_`/`73_`; either missing ⇒ ReferenceError |
| 17 | `90_generated_supply_planning_bundle.gs` | hash `46ae3945…` | generated shared core | 7 | **pairs with `63_`** |
| 18 | `63_api_v1_system_health.gs` | R40 | the manifest + release identity | 8 (LAST) | a stale manifest mis-reports every other file |

```
BACKEND_OWNER_ADJUDICATION_COUNT   18 adjudicated + 7 delete candidates = 25
UNNECESSARY_COPY_FILE_COUNT        0 proven unnecessary.  If the live build proves to be R24, three
                                   (04_, 59_, 72_) are byte-identical no-ops rather than errors.
MISSING_COPY_FILE_COUNT            0   (the set is the full diff from the deployed baseline)
```

### Generated bundle

```
GENERATED_BUNDLE_REPRODUCIBLE        YES   ("bundle up to date" from the canonical builder)
GENERATED_BUNDLE_CURRENT_HASH        46ae3945061fefe45748f5fc7e8adf7624e20057da44b9ba9746be5a6eea5695
SYSTEM_HEALTH_DECLARED_BUNDLE_HASH   46ae3945061fefe45748f5fc7e8adf7624e20057da44b9ba9746be5a6eea5695
HASH_MATCH                           YES
BUNDLE_HEALTH_PAIR_DEPLOY_TOGETHER   YES
```

### BACKEND_DEPLOY_ORDER (DAG, 9 constraints)

```
  05_ ──► 12_          overseas reservation functions resolve from 05_
  05_ ──► 22_          dispatch consume resolves from 05_
  17_ ◄──► 01_         carrierLeadTime.upsert: handler and route, one version
  73_ ◄──► 01_         pricing.update: handler and route, one version
  72_ ──► 73_          pricing read owner before the writer that shares its shapes
  90_ ◄──► 63_         bundle identified by content hash declared in 63_
  57_ ──► (frontend)   carriers master before the carrier-name consumers
  58_ ──► (frontend)   FC slices before the FC projection consumers
  63_ ──► LAST         the manifest reports on everything else

STAGE 1   05_
STAGE 2   04_ 11_ 14_ 20_ 21_ 47_ 58_ 59_
STAGE 3   12_ 22_
STAGE 4   72_ 73_
STAGE 5   17_ 57_
STAGE 6   01_
STAGE 7   90_
STAGE 8   63_                     ← then ONE deployment version for the whole set
BACKEND_DEPLOY_ORDER_CONSTRAINT_COUNT = 9     conflicts = 0
```

All eight stages are saved before a single Apps Script **deployment version** is created, so the live `/exec`
never serves a partially-copied project.

---

## 5. FINAL_APPS_SCRIPT_DELETE_SET_CANDIDATE — 7, verify before acting

```
TEMP_demo_shipping_shipment_map_seed_v2.gs        writes AND clears six business tables
TEMP_migrate_request_order_draft_v2.gs            one-time migration
TEMP_migrate_shipping_allocation_ai_lifecycle.gs  one-time migration (optional manifest row)
TEMP_document_diagnostics.gs                      read-only diagnostic
TEMP_draft_migration_diagnostic.gs                read-only diagnostic
TEMP_order_planning_draft_readback_diagnose.gs    read-only diagnostic
TEMP_request_order_send_diagnostics.gs            read-only diagnostic
```

| file | expected current live state | action if present | action if absent |
|---|---|---|---|
| each of the seven | **ABSENT** — SLIM-R1's live probe found all seven absent, with 31 corroborating symbol probes, and the live manifest independently reported the lifecycle migration in `absent_optional_modules` | delete it during the controlled release, and record that it was present | no action, record ABSENT |

```
LIVE_PROJECT_MEMBERSHIP_VERIFICATION_REQUIRED   YES
UNEXPLAINED_DELETE_COUNT_ALLOWED                0      no other file may be deleted
```

The expectation is a prediction from evidence, not a licence to skip the check: the probe can only ask about
names it knows, and a file pasted in by hand would never have appeared in it.

---

## 6. Frontend

```
FINAL_FRONTEND_DEPLOY_SET    41 JS + 6 CSS   (full list: git diff --name-only 74aca0b HEAD -- assets/js assets/css)
FINAL_HTML_DEPLOY_SET        index.html · carrier-rate-card.html · factory-stock.html ·
                             fc-summary.html · sku-regional-details.html
FINAL_STATIC_ASSET_DEPLOY_SET  assets/img/logo_only_red.png
```

GitHub Pages publishes the pushed tree, so the "set" is what the push carries; it is enumerated here because
the cache token and the deploy order depend on it, not because files are copied individually.

```
CURRENT_APPLICATION_TOKEN              s5r4-actionreason-20260928
NEXT_APPLICATION_TOKEN                 p1-cumulative-20261002
APPLICATION_TOKEN_ROTATION_REQUIRED    YES — performed in this round
APPLICATION_TOKEN_REFERENCE_COUNT_PRE  62   (54 index.html + 8 app.js route assets)
APPLICATION_TOKEN_REFERENCE_COUNT_POST 62
STALE_APPLICATION_TOKEN_REFERENCE_COUNT_POST  0
```

**Why one token.** The deployed site is `74aca0b`; every token minted above it — `s5r4-actionreason-20260928`
included — has never been served. "Already current in the repo" is not "already cached in a browser". Measured
before rotating: **0** application assets changed since the baseline were on any older token, so the 62
references carrying the current token are exactly the co-deployed set and they move together. The map and
Site-Inventory-CSS families are untouched: their owning files did not change, and rotating a family whose
bytes are identical invalidates a cache for nothing.

```
FAVICON_READY_FOR_RELEASE      YES
FAVICON_REFERENCE_COUNT        1    <link rel="icon" href="assets/img/logo_only_red.png?v=p1-cumulative-20261002">
FAVICON_ASSET_HASH             187c6394e4089fd1150f630e1bcf8e50b0e7778392ad92a80634b3233e50cf13
ASSET_MANIFEST_INCLUDES_FAVICON  YES
```

The path is project-relative, so it is GitHub Pages project-path safe. The favicon reference carries the
application token, so the rotation also resolves the stale asset-manifest cache recorded by UI-BRAND-FAVICON-R1.

### FINAL_RELEASE_STAGE_ORDER

```
0  verify live build_id + TEMP membership        (read-only)
1  git integration + push                        (GIT_GATE_1..3)
2  Apps Script copy, stages 1-8, ONE version     (backend)
3  BACKEND_HEALTH_GATE                           → READY_FOR_FRONTEND
4  Apps Script delete of any present TEMP file, second version
5  frontend publication (push already carries the rotated token)
6  read-only production smoke
7  controlled-write smoke, only on explicit operator authorization
```

---

## 7. Subsystem reconciliation

```
FC_CUMULATIVE_RELEASE_COMPLETE  YES
  backend   04_ 14_ 20_ 58_ 63_
  frontend  pages/fc-summary.js pages/forecast.js pages/campaign-risk.js
            api/operation-system-db-api.js core/supply-planning-forecast-share.js
            html/pages/fc-summary.html css/pages/fc-overview.css
  covers    false-empty fix · cold-path repair · scoped pricing projection · canonical marketplace-id save
            boundary · authoritative Special Event graph readback · event→campaign_sku_line referential
            integrity · write-success vs refresh-failure semantics
  The EU BFCM incident is NOT reopened: the operator confirmed campaign_sku_lines were already present and
  no production data reconciliation is required.

FACTORY_ADJUSTMENT_RELEASE_COMPLETE  YES
  frontend  pages/factory-stock.js · html/pages/factory-stock.html
  backend   21_factory_inventory_handlers.gs
  (the backend set is NOT empty: 21_ changed at R35 for the adjustment/readback owner)

S6_RELEASE_COMPLETE  YES
  backend   05_ 11_ 12_ 21_ 22_
  frontend  pages/overseas-stock.js pages/shipping-plan.js pages/shipping-history.js
            pages/inventory-replenishment.js api/operation-system-db-api.js
  D_S6_DISPATCH_SOURCE_AUTHORITY = DECLARED_SOURCE_ONLY — reconfirmed, no any-warehouse fallback

S7_RELEASE_COMPLETE  YES
  backend   01_ 17_ 57_ 63_
  frontend  api/operation-system-db-api.js app.js pages/carrier-rate-card.js
            pages/global-logistics-map.js pages/purchase-order-overview.js
            pages/shipping-history.js pages/shipping-plan.js
  html      assets/html/pages/carrier-rate-card.html
```

---

## 8. DB / schema / manual actions

```
FINAL_DB_MIGRATION_SET    empty    no insertSheet, no new table across 74aca0b..HEAD
FINAL_SCHEMA_CHANGE_SET   empty    PRICING_LIST_HEADERS_ and PRICING_CHANGE_LOG_HEADERS_ are new CONSTANTS
                                   declaring tables that already existed at the deployed baseline
                                   (03_ listed both; 72_ read them 17 times)
FINAL_BACKFILL_SET        empty
```

**PRE_DEPLOY_MANUAL_DATA_ACTIONS — NONE.** Nothing must be done to the database before the code ships.

**POST_DEPLOY_MANUAL_DATA_ACTIONS — ONE, and it is not hidden in a deploy step.**

`73_api_v1_pricing_write.gs` requires four operator-provisioned columns before `pricing.update` can write:

```
pricing_list        regular_price_is_manual · minimum_price_is_manual · msrp_is_manual
pricing_change_log  change_type
```

It **fails closed** — *"until they exist this refuses with MISSING_REQUIRED_HEADER and zero mutation"* — and
under RULE S0-2 it never creates a sheet and never appends a column. So this does not block the release: the
pricing write surface is simply dark until an operator provisions the columns using the retained
`assets/tools/apps-script-diagnostics/TEMP_PRICING_R2_*` tools. **Whether these columns already exist in
production is unknown from the repository and must be read before anyone reports the pricing feature live.**

---

## 9. BACKEND_HEALTH_GATE → READY_FOR_FRONTEND

Run `system.health` after the backend copy and before frontend publication. All seven must hold:

```
1  deployment_build       == F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40
2  mixed_deployment       == false
3  absent_modules         == []            (absent_optional_modules may list the lifecycle migration)
4  stale_modules          == []
5  missing_actions        == []
6  KM_BUNDLE_CONTENT_HASH_ == 46ae3945061fefe45748f5fc7e8adf7624e20057da44b9ba9746be5a6eea5695
7  action-contract version == 18, and the browser's KM_EXPECTED_ACTION_CONTRACT_VERSION_ == 18

READY_FOR_FRONTEND = YES only if all seven hold. Any failure ⇒ STOP and do not publish the frontend.
```

---

## 10. Git integration

```
RECOMMENDED_GIT_INTEGRATION_STRATEGY
  merge origin/main INTO the feature branch, then fast-forward main to the merge commit
REMOTE_TESTED_SHA_REQUIRED = YES
```

Rebasing would replay 85 commits and rewrite every SHA this phase's reports cite — the release ledger, the
seals and every round report address commits by hash, and a rebase makes that audit trail unreachable. The
merge is a single commit over an identical blob; `git merge-tree` already proved it conflict-free.

**Proposed runbook — the operator runs these; this round ran none of them.**

```bash
cd "C:/Users/viczh/Desktop/KM/品牌資源/Vibe Coding/Operation System/Operation System"

# GIT_GATE_0 — read the live project FIRST (Apps Script editor / system.health)
#   record build_id, and which of the seven TEMP files are present

# GIT_GATE_1 — reconcile origin/main
git fetch origin
git status                                   # must be clean
git log --oneline origin/main -3             # confirm 1a0ca13 is still the tip
git checkout feature/product-strategy-board-p0
git merge origin/main                        # expect: already-identical logo, no conflict

# GIT_GATE_2 — full sweep AFTER integration, on the merged tree
#   the canonical digest must be 596eeb6448f3911ff876a3f7c21606e747a4892f43df9fa7c4186830ed9069ba

# GIT_GATE_3 — publish
git push origin feature/product-strategy-board-p0
git checkout main
git merge --ff-only feature/product-strategy-board-p0
git push origin main
git rev-parse HEAD                           # THIS is the tested SHA

# GIT_GATE_4 — production deploy only after origin/main == the swept SHA
git fetch origin && git rev-parse origin/main   # must equal the SHA above
```

No production deploy from an unpushed or untraceable local SHA.

---

## 11. Production smoke

**READ-ONLY (no authorization required)**

```
A  FC Summary      regular load · special-event load · builder cold then warm · marketplace_id present
B  Factory Inventory  page load · factory selector → SKU selector
C  Weekly Shipping Plan  carrier NAME beside id · recommendation read model
D  Shipment        draft + overview load · carrier name · document panel lists existing documents
E  Overseas Inventory  load · import PREVIEW only
F  Carrier Rate Card    page load · Lead Time panel shows "load on demand" and reads NOTHING at mount
G  PO Overview     document panel rediscovers an existing document after page re-entry
H  favicon         new tab shows the red logo after the token rotation
```

**CONTROLLED WRITE (explicit operator authorization at that moment, one at a time, each with readback)**

```
A1  one Special Event save            → graph readback correct, marketplace_id present
B1  one factory adjustment            → truthful success + readback, Done closes and does not re-submit
F1  one carrier lead-time upsert      → duplicate-lane guard refuses a colliding lane
D1  one document Retry on a FAILED doc → correct entity addressed, exactly one request
```

### PRODUCTION_RELEASE_STOP_CONDITIONS

```
system-health mismatch · action-contract mismatch · bundle hash mismatch · missing runtime owner ·
unknown router action · frontend calling an unavailable backend slice or action · blank canonical id
where now forbidden · false write failure or false write success · cross-warehouse inventory mutation ·
reservation invariant violation · document Retry addressing the wrong entity · any new canonical failure ·
an unexpected TEMP file present in the deployed project
```

Any one ⇒ stop, do not continue the smoke, roll back per §12.

---

## 12. Rollback

```
ROLLBACK_READY = YES
```

| failure | rollback |
|---|---|
| backend copy issue | restore the **previous Apps Script deployment version** (the R14/R24 version recorded at GATE 0) — Apps Script version history, not git |
| partial sync | the whole copy set is saved before ONE version is created, so the live `/exec` never serves a partial project; if it happens, revert to the prior version |
| frontend issue | `git revert` the merge on `main` and re-push; Pages republishes the known-good tree `74aca0b` |
| cache token issue | the previous token's assets are still addressable; republish the prior commit |
| TEMP delete mistake | every deleted file is retained in `assets/tools/`; re-paste from the repository at the reviewed commit |
| frontend against old backend | the browser pins `KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 18` and refuses a deployment that predates it, rather than sending writes nothing will route |

**Required before any controlled write smoke:** a spreadsheet backup (File → Make a copy), recorded by name
and timestamp. Known-good frontend SHA = `74aca0b`. Known-good Apps Script version = whatever GATE 0 records.

---

## 13. S8 entry

```
S8_ENTRY_ALLOWED = NO   (reconciliation is complete; deployment has not happened)
```

S8 may begin only after: cumulative release reconciled ✓ · git integration complete ✗ · backend coherent
deploy ✗ · frontend coherent deploy ✗ · cache token rotated ✓ · targeted production smoke passes ✗ · no
release blocker remains ✓.

```
S8_MANDATORY_ACCEPTANCE_PROOF_SET — AVG SALES
  90-day lookback window
  take up to the latest 30 eligible NORMAL sales days
  EXCLUDE actual Campaign / Special Event sales dates
  denominator = the actual eligible-day count, never a fixed 30
  verify the Campaign / Promotion Risk / Event source really reaches the calculation
plus: systematic E2E acceptance · fatigue framework · performance / stability / safety consolidation
plus the nine carried S8 debts recorded in S7_SUPPORTING_EXECUTION_MAINLINE_CONTRACT.md Sec69
```

### Roadmap carried, not implemented

**FC Summary UI:** Edit Event Date · move secondary Regular / Special Event toolbar actions into More
Options · preserve efficient row editing.
**Post-S11:** Monthly FC Achievement % · FC vs Actual Sales, dimensioned by month / SKU / site / company.
**S9:** Google Login · user mapping · ADMIN / COO / OPERATIONS / FACTORY_USER · permission, admin and import
visibility.
**S10:** Factory Order Number automation · Tcode requirement / order / matching / inventory · 1 pcs = 1 Tcode
when required · explicit opt-out.
**S11:** Product Strategy completion · Competitor Analysis · Control Tower / cross-site sales monitoring.
