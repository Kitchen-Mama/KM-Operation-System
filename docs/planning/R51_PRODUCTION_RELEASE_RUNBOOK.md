# R51 PRODUCTION RELEASE RUNBOOK — R49 → R51

> **Prepared by S8-B3-R3-PREDEPLOY, verified and corrected by S8-B3-R3-GATE1 (2026-10-11).**
> **NOTHING IN THIS DOCUMENT HAS BEEN EXECUTED.** No push, no merge, no Apps Script sync, no deployment
> version, no frontend publication, no production write, no Preview activation. Every numbered step is a
> **USER** action. The agent boundary is the local commit (`CLAUDE.md` RG-1).
>
> Governance: `DEPLOYMENT_RELEASE_GOVERNANCE.md` · Ledger: `DEPLOYMENT_RELEASE_LOG.md`
> Acceptance: S8-B3-R2-RECHECK — `READY_FOR_DEPLOYMENT_AUTHORIZATION`
>
> **Read §0 before anything else.** Two prerequisites gate the whole release and one of them is
> unrecoverable if skipped.

---

## 0. STOP CONDITIONS — read first

| | Condition | If unmet |
|---|---|---|
| **S-1** | **The live Apps Script deployment version number has been recorded** (§5, step 2). | **`ROLLBACK_TARGET_UNCONFIRMED` — DO NOT PUBLISH.** It cannot be recovered after a new version is created, and without it the backend rollback in §9 does not exist. |
| **S-2** | **The GitHub Pages publishing source has been confirmed** (§1). | **`PAGES_SOURCE_UNCONFIRMED` — do not push.** In this repository a push *is* the frontend publication, so the push at step H must be the deliberate publication of a backend that is already live. |
| **S-3** | `43_api_v1_gap_materialization.gs` verified present in the editor by the §7 marker check. | A partial sync that drops `43_` is **invisible to `system.health`**. Do not create the deployment version. |
| **S-4** | **Production priority exposure measured** (§6 step B). | R51 makes an unresolved `allocation_priority` fail closed **for the whole allocation group**, and the UI that sets it does not reach the browser until step H. Deploying without knowing the count means not knowing the blast radius. |

---

## 1. GITHUB PAGES PUBLISHING SOURCE — **PAGES_SOURCE_UNCONFIRMED**

**The publishing source could not be verified from here, and must be confirmed by the user before any push.**

### What was checked, read-only

| Probe | Result |
|---|---|
| `gh` CLI available for an API query | **NOT INSTALLED** — no read-only Pages API query is possible from this machine |
| `.github/` directory | **absent** |
| Any `*.yml` / `*.yaml` workflow anywhere in the repo | **none — zero files** |
| `git ls-remote --heads origin` (read-only) | exactly three branches: `main`, `feature/product-strategy-board-p0`, `feature/map-texture-3` |
| `gh-pages` branch | **does not exist** |
| `CNAME` / `.nojekyll` | **absent** |
| `docs/index.html` | **absent** — `docs/` holds planning, design, evidence, prototypes |
| `index.html` location | repository **root** |

### What that establishes, and what it does not

**Confirmed negative — no GitHub Actions workflow is involved.** The "GitHub Actions" Pages source requires
a workflow file in the repository, and there is none. This is a structural fact, not an inference.

**Excluded by structure:** a `gh-pages` source (the branch does not exist) and a `main /docs` source
(`docs/` has no `index.html`, so it would serve nothing).

**Working hypothesis — `main`, folder `/` (root).** Supported by the repo layout *and*, independently, by
operator-written procedure in the ledger:

- *"USER release sequence: (1) git push origin main; … (4) redeploy GitHub Pages from current main"*
- *"Frontend (GitHub Pages) live set: … (in main @226b027)"*
- *"redeploy GitHub Pages from main"*
- a recorded operator observation of the live site on GitHub Pages in an incognito window

**But none of that is the setting itself.** The Pages publishing source is a GitHub repository setting, not
a file in the repository, and the governance doc deliberately says only *"deploys from the configured
branch"* without naming it. Per the gate's own instruction not to infer the source from repository
structure alone, the classification stands at **PAGES_SOURCE_UNCONFIRMED**.

### USER CONFIRMATION REQUIRED — one lookup

> **GitHub → the repository → Settings → Pages → "Build and deployment" → Source.**
> Record: (a) Source = *Deploy from a branch* or *GitHub Actions*; (b) if a branch, **which branch** and
> **which folder**. Do not paste the URL into any report.

### The six questions, answered

| Question | Answer |
|---|---|
| Is Pages enabled? | **UNCONFIRMED.** Historical evidence says yes; current state is not readable from here |
| Which branch and folder publish? | **UNCONFIRMED.** Hypothesis `main` + `/` (root); `gh-pages` and `/docs` excluded |
| Is publication triggered by push to `main`? | **UNCONFIRMED**, but it is what every ledger entry describes |
| Is a GitHub Actions workflow involved? | **NO — confirmed.** No workflow file exists |
| Can backend deployment occur before frontend publication? | **YES** — see §2 and §8 |
| Can R51 be pushed to a non-publishing branch first? | Technically yes, **but NOT USED** — the approved workflow forbids it; see below |

### No feature-branch push — superseded by decision (S8-B3-R3-CP2A)

An earlier draft of this runbook proposed pushing to `feature/product-strategy-board-p0` first, as a way to
get the release commit onto GitHub without publishing the frontend. **That is retracted.** The approved
workflow is the existing Kitchen Mama one — **Sandbox → Main → Production Verification** — with no additional
branches and **no push to the remote feature branch**.

The reasoning the retracted step rested on is not needed, because **no push is required before the backend
sync at all** (see §6): the Apps Script editor reads nothing from GitHub. The release commit reaches the
remote at step H, *after* the backend is live and verified, which is the same backend-first guarantee by a
simpler route and one fewer remote write.

---

## 2. GIT PREFLIGHT

Measured at `d18440231cc311ceb3781d4d15019a85ebb85a51`.

| Check | Measured | Verdict |
|---|---|---|
| HEAD | `d1844023…` | matches baseline |
| Worktree | empty porcelain | clean |
| local `main` · `origin/main` · `origin/HEAD` | all `7fa6c19f` | unmoved |
| Ahead / behind `origin/main` | 15 / 0 | fast-forward available |
| Ahead of `origin/feature/product-strategy-board-p0` (`14b1c507`) | 68 / 0 | fast-forward available |
| `.gs` deleted since R49 (DELETE set) | 0 | nothing to remove from the project |
| `appsscript.json` changed since R49 | no | no scope or service change |

**"15 unpushed" is true against `origin/main` only.** The branch's own upstream is 68 commits behind HEAD.
Both refs are strict ancestors, so **no merge commit and no force is required anywhere**. If a `--force`
ever appears necessary, the premise of this runbook has changed and the release stops.

```bash
cd "C:/Users/viczh/Desktop/KM/品牌資源/Vibe Coding/Operation System/wt-product-strategy-board-p0"
git status                                      # must be clean
git log -1 --oneline                            # must be d1844023
git rev-list --count origin/main..HEAD          # must print 15
git merge-base --is-ancestor origin/main HEAD && echo FF_SAFE
```

### The 15 commits

`5a091249` (cuts R50) · `7bbdea9d` · `bbe4c206` · `8255eb84` · `0172443e` · `5056a391` · `0667729e` ·
`ae609699` · `c2034a5a` · `970560f3` · `8c0bd487` (cuts R51) · `e6b93ff7` · `a19abb26` · `13729cce` ·
`d1844023` — plus whatever this gate adds. Two release cuts travel together: R50 was never synced, so R51
carries its bytes and **both ship as one paste set**.

---

## 3. RELEASE IDENTITY

Release **`F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R51`** · action contract **19** · required-action list version
**14** · transport contract **1** · bundle `KM_BUNDLE_CONTENT_HASH_` =
`3de64364ba358468c39142aac212d663b41075f454dc6d86218fc066cdbc7e25` · Preview flag **`false`**.

---

## 4. BACKEND SYNC MANIFEST — six files, `63_` LAST

`63_` goes last because it is the file that reports the release: an interrupted sync then still reports R49
and `system.health` tells the truth about a partial sync instead of certifying one.

| # | Source (repo) | Destination | Expected stamp | Verification |
|---|---|---|---|---|
| 1 | `assets/specs/active/apps-script/00_config.gs` | `00_config.gs` | `CONFIG_BUILD_VERSION_` = …R51 | read stamp; `OVERSEAS_ALLOCATION_PREVIEW_ENABLED_` must be **`false`** |
| 2 | `…/01_router.gs` | `01_router.gs` | `RTR_BUILD_VERSION_` = …R51 | read stamp; four `overseasAllocationPreview.*` dispatches present |
| 3 | `…/43_api_v1_gap_materialization.gs` | `43_api_v1_gap_materialization.gs` | **STAMPLESS** — `GAP_MATERIALIZATION_HANDLER_VERSION_` = `fm5-r4ui-r5c`, no manifest row | **§7 marker check — `system.health` CANNOT verify this file** |
| 4 | `…/74_api_v1_overseas_allocation_preview_job.gs` | **NEW FILE — create it** | `OAP_BUILD_VERSION_` = …R51 | has a manifest row → health reports it absent if missed |
| 5 | `…/90_generated_supply_planning_bundle.gs` | `90_generated_supply_planning_bundle.gs` | **hash, not stamp** — `3de64364…cbdc7e25` | compare all 64 hex chars. **Never hand-edit** |
| 6 | `…/63_api_v1_system_health.gs` | `63_api_v1_system_health.gs` | `SYS_BUILD_VERSION_` = `SYS_DEPLOYMENT_RELEASE_` = …R51 | the `system.health` probe itself (§10) |

**Copy only these six.** Governance §4 forbids copying every `.gs` on every release. `61_` stays at R47,
`66_` at R49, `60_` at R45 — already in the project, must not be re-pasted.

**DELETE set: EMPTY.** No `.gs` left the runtime folder between R49 and R51. Still confirm the seven S7-R4
relocated tools are absent from the project and record the result (expected: nothing to delete).

**Triggers: nothing to install or change.** Gap Materialization triggers point at `44_`, which is unchanged.
The Preview arms triggers only when its flag is true, and it ships `false`.

---

## 5. APPS SCRIPT DEPLOYMENT PREREQUISITES — operator checklist

**No restricted identifier is printed in this document or in any report.** Script ID, deployment ID,
`/exec` URL, bound Spreadsheet ID and project name are confirmed by the operator against their own record
and are never transcribed into the repository (`CLAUDE.md`; ledger "MAY NOT carry … script id, deployment
id, endpoint or any absolute URL").

Tick every box **before** opening the editor for a paste.

- [ ] **P-1 Correct project.** The open Apps Script project is the production one — name matches your own
      record. Not a copy, not a verification copy.
- [ ] **P-2 Correct bound Spreadsheet.** The project is bound to the production Operation System Database.
      Confirm from the project side, not from a bookmark.
- [ ] **P-3 An existing production deployment exists.** *Deploy → Manage deployments* shows an **active Web
      App** deployment.
- [ ] **P-4 — UNRECOVERABLE — record the CURRENT live version number.** Read it in *Manage deployments*
      and write it down **outside this repository** (operator notes, password manager, ticket). This is the
      rollback target of §9. **If it cannot be read: `ROLLBACK_TARGET_UNCONFIRMED` → STOP, do not publish.**
- [ ] **P-5 Deployment URL matches the frontend.** The active Web App `/exec` is the endpoint the browser
      is configured against. Compare; do not paste it anywhere.
- [ ] **P-6 Update, do not create.** You will use *Edit (pencil) → Version: New version → Deploy* on the
      **existing** deployment. Creating a **new deployment** mints a different `/exec` and the frontend
      keeps talking to the old one.
- [ ] **P-7 Never "Deploy latest automatically."** (Governance §3.)
- [ ] **P-8 The previous version remains SELECTABLE for rollback.** In *Manage deployments → Edit →
      Version*, confirm the recorded prior version still appears in the version list and can be chosen.
      A recorded number that cannot be selected is not a rollback target.

---

## 6. BACKEND-FIRST SEQUENCE

**The approved sequence. No new branch, and no push until H.**

```
A. Record the rollback version               the LIVE version number, offline     (§5 P-4)
B. Verify production priority exposure       read-only count of unresolved rows   (below)
C. Synchronise six Apps Script files         63_ LAST                             (§4)
D. Verify all six, including 43_ markers     BEFORE the version is published      (§4, §7)
E. Publish a new version                     update the EXISTING deployment       (§5 P-6)
F. Verify R51 health + R49 frontend          §10 A–D
G. Sandbox → Main fast-forward               local ff-only merge, no push yet
H. Push main                                 THIS PUBLISHES THE FRONTEND          (§1)
I. Production smoke                          §10 E–K
```

### Step B — production priority exposure

R51 carries R50's D-S8-B1 correction: an unresolved `allocation_priority` is no longer fabricated as `0`.
KMMSA refuses it with `RECEIVER_PRIORITY_UNRESOLVED`, and the refusal is **all-or-nothing by design** —
*"the refusal happens here, before KMALLOC is called, so there is no partial allocation reported as
success."* **One unranked marketplace blocks the entire company + country + SKU allocation group**, not just
its own row.

That is the intended fix. The operational catch is ordering: **the UI that sets a priority is the Site
Priority page, which does not reach the browser until step H.** At R49 no live page writes
`allocation_priority` — the existing "Add Marketplace" form writes seven fields and not that one. So between
E and H, an unranked marketplace means blocked coverage with no browser-side remedy.

**Before step C, from a signed-in browser, count the active `marketplaces` rows whose `allocation_priority`
is missing, blank, negative, non-numeric or non-finite.** Zero means the window is harmless. Non-zero tells
you the blast radius, and the mitigation is to keep E→H short — publishing the frontend is what hands you
the fix. Checked and reassuring: the live form cannot *erase* a priority, because
`03_master_data_handlers.gs:628` writes the column only when the value is non-blank, so omitted means
preserved on update. A marketplace **created** during the window will have none, though.

### Is a push technically required before the sync? — **NO.**

Checked, not assumed. The sync is a copy-paste of local file contents into the editor; nothing in that path
reads GitHub. `clasp` is not configured, there is no Action, and the editor pulls from no remote. **Steps C
and E are technically independent of any push.**

The procedural concern — an Apps Script project carrying bytes that exist in no pushed commit is a deployment
nobody can reproduce — is real but **bounded and deliberate here**: the window lasts from E to H, the commit
hash is already fixed at `4d27f24d`, and that pairing is recorded in the ledger before the sync begins. A
deployment whose commit is written down is reproducible whether or not the commit has reached the remote yet.

### Why backend-first is safe

- The client check at `assets/js/api/operation-system-db-api.js:4939` is
  `identity.deployed_action_contract_version < KM_EXPECTED_ACTION_CONTRACT_VERSION_` — a **minimum**, not an
  equality. An R49 browser expecting **18** is satisfied by a backend reporting **19**.
- `SYS_REQUIRED_ACTIONS_` and `SYS_REQUIRED_ACTION_LIST_VERSION_` (14) **do not move** in R51 — no page
  depends on the Preview, because there is no Preview page.
- `SYS_TRANSPORT_CONTRACT_VERSION_` stays **1**.

**So the backend may land and sit in production with the R49 frontend live, indefinitely and safely.**
The reverse is false: an R51 frontend against an R49 backend reports `DEPLOYMENT_CONTRACT_MISMATCH`.
**Never publish the frontend before the backend.**

> **If §1 reveals that Pages serves something other than `main`**, step H must target that ref instead —
> and `git merge --ff-only` at step G still applies. Confirm before pushing, not after.

---

## 7. `43_` SYNC VERIFICATION GATE — the file no probe can check

`43_api_v1_gap_materialization.gs` declares **no build symbol** and has **no row in
`SYS_MODULE_BUILD_STAMPS_`**, so `system.health` cannot report it missing, stale or absent. **Do not claim
`system.health` verifies this file.** It is the one file in the paste set whose correct delivery must be
established by hand.

It is not stamped **deliberately**: adding a stamp would satisfy the copy ledger and break the stamp ledger,
and this gate does not modify the `43_` runtime merely to make it checkable.

### What changed in `43_` since the live release

One commit — `5a091249`, the R50 cut — carrying the **D-S8-B1 missing-priority fail-closed correction**:

- `allocationPriority` stopped substituting `0` for an unresolved priority and now carries `null`, so
  KMMSA refuses it with `RECEIVER_PRIORITY_UNRESOLVED` instead of letting an unranked receiver compete for
  the pool at a priority nobody set;
- a new `gapBlockedIssue_()` makes a blocked group **name its receivers**, so the affected rows are
  reported rather than silently omitted from the coverage map.

### The operator check — run in the Apps Script editor AFTER pasting `43_`, BEFORE step D

| # | Search the pasted `43_` for | Expect at R51 | At R49 (not yet synced) | Meaning |
|---|---|---|---|---|
| **V-1** | `gapBlockedIssue_` | **3 occurrences** | **0** | the R50 correction is present |
| **V-2** | `priorityByMkt[pkey] : null)` | **1 occurrence** | **0** | the fail-closed `null` is in place |
| **V-3** | `priorityByMkt[pkey] : 0)` | **0 occurrences** | **1** | the defect is gone |
| **V-4** | `receiverKeys` | **1 occurrence** | **0** | blocked groups name their receivers |
| **V-5** | total line count | **890** | — | a coarse completeness check against truncated paste |

**V-1 returning 0 means the R49 file is still in the project and the sync did not take.** Stop; do not
create the deployment version.

**Record the five results** in the release ledger entry as positive evidence before publishing. A tick with
no recorded number is not evidence.

---

## 8. FRONTEND PUBLICATION PACKAGE — seven files

The **cumulative backlog since R49**, accumulated across R50, S8-B2, S8-C1 and R51. This is a *different
claim* from "R51 itself rotated no token", which is also true — R51's only browser change is the contract
pin in `operation-system-db-api.js`.

| # | File | Change since R49 | Token at R49 → now | Status |
|---|---|---|---|---|
| 1 | `index.html` | M | the entry document carries no token | — |
| 2 | `assets/js/app.js` | M | `r49-prioritysendguard-20261010` → `r50-irpriority-20261010` | rotated |
| 3 | `assets/js/api/operation-system-db-api.js` | M | same rotation | rotated |
| 4 | `assets/js/pages/inventory-replenishment.js` | M | same (token lives in `app.js`) | rotated |
| 5 | `assets/js/pages/site-priority.js` | **A** | new | — |
| 6 | `assets/css/pages/site-priority.css` | **A** | new | — |
| 7 | `assets/css/pages/inventory-replenishment.css` | M | `irrestinglayout-20261008` → `irtpunresolved-20261011` | **F-PD1 — CORRECTED by S8-B3-R3-GATE1** |

### F-PD1 — CLOSED

**Root cause.** `0172443e` (S8-C1) added the four `.replen-tp-unresolved*` rules to
`inventory-replenishment.css` **and, in the same commit, rotated every other browser token** to
`r50-irpriority-20261010` — but left this one `index.html` line at `irrestinglayout-20261008`, the value set
back in `230525a2`. An omission inside a rotation the same commit performed everywhere else.

**Effect if published uncorrected.** A browser holding the live site's stylesheet would not refetch, and the
S8-C1 fail-closed priority diagnostic would render unstyled for every returning operator.

**Fix.** One token, in `index.html` only, rotated to **`irtpunresolved-20261011`** — a NEW member of the
stylesheet's **own** token family. **No stylesheet content was modified and no other token was rotated.**

**Why not simply give it the application token.** This stylesheet is deliberately **not** in the application
series: `assets/css/pages/inventory-replenishment.css` has its own append-only ledger
(`IR_CSS_TOKEN_SERIES` in `assets/tests/_release-order.js`) and **three suites assert the two families are
never crossed**, one of them by checking the token's shape. Putting the application token on the stylesheet
would have spent a rotation the file does not own and broken that split. The rotation is therefore one new
entry appended to the IR family ledger, with its reason recorded beside the six entries before it — the same
discipline every prior stylesheet rotation followed.

**Guarded.** `assets/tests/frontend-cache-token-publication-s8-b3-r3-gate1.test.js` — see §11.

### The five changed `assets/js/core/*` files are NOT in this package

`supply-planning-marketplace-supply-allocation.js`, `-production-assembly.js`, `-source-projection.js`,
`-weekly-harvest-adapter.js`, `-weekly-input-assembler.js` changed since R49 and reach Apps Script through
`90_` and the browser through **nothing** — **zero** references in `index.html` or `app.js`, verified. This
is a per-file fact, not a directory rule: `core/namespace.js` and `core/lifecycle.js` *are* browser-loaded.

---

## 9. ROLLBACK — backend and frontend are SEPARATE procedures

They are separate because they fail separately, and because the contract check is a **minimum**: the
frontend can be rolled back alone, and the backend can be rolled back alone *provided the frontend is also
rolled back*. The asymmetry is the whole point of this section.

### 9A. BACKEND rollback

**Last known-good: R49, Git `7fa6c19f`, CUT · SYNCED · DEPLOYED.**

**Required artifact: the version number from §5 P-4.** Without it this procedure does not exist.

1. *Deploy → Manage deployments → (production Web App) → Edit → Version →* select the **recorded prior
   version** *→ Deploy.*
2. The `/exec` URL does not change. Browsers need no action.
3. Verify by `system.health`: `build_id` = `deployment_release` = …**R49** ·
   `deployed_action_contract_version` = **18** · `mixed_deployment` = `false` · `stale_modules` = `[]`.

**Expected consequence, not a second fault:** a contract-**18** backend under a **published R51** frontend
refuses by name with `DEPLOYMENT_CONTRACT_MISMATCH`, because the frontend pins 19. If step F has run, **roll
the frontend back too (9B)**. If it has not, the live R49 frontend pins 18 and is satisfied — nothing else
to do.

**What backend rollback does NOT require:** no database compensation (R51 adds no table, no schema change,
no migration, and the disabled Preview wrote nothing — not even a Script Property, because the flag is
checked before the env is built); no trigger removal (the Preview arms triggers only when enabled, and its
continuation handler returns immediately when the flag is false); nothing for `90_` (the prior version
carries the prior bundle).

**Triggers backend rollback:** `mixed_deployment: true` or non-empty `stale_modules` that a re-paste does
not clear · `deployed_action_contract_version` ≠ 19 after publication · any §10 check that passed on R49 now
failing · an unexpected business write (§10 K) · Gap Materialization failing a scheduled run (the `43_`
carry is the only shipped-behaviour change in the backend set).

### 9B. FRONTEND rollback

**Last known-good: the published R49 commit `7fa6c19f`.**

Publication is a Git push to the Pages branch, so rollback is a **forward revert on that branch** — never a
force-push to a shared branch.

```bash
# USER. <pages-branch> is whatever §1 confirms.
git fetch origin
git log --oneline -3 origin/<pages-branch>      # confirm what is live now
git revert --no-commit <first>..<last>
git commit -m "revert(frontend): return the published site to 7fa6c19f"
git push origin HEAD:<pages-branch>
```

**Verify:** the site loads, no page reports `DEPLOYMENT_CONTRACT_MISMATCH`, and `operation-system-db-api.js`
once again pins **18** — satisfied by an R49 *or* an R51 backend, which is why the frontend may be rolled
back **independently**. Site Priority is absent from navigation again (it did not exist at R49).

**Cache behaviour:** rollback restores the R49 tokens, which differ from the R50 tokens just published, so
browsers refetch correctly — **including `inventory-replenishment.css`, now that F-PD1 is corrected.** Before
the correction this one file would have kept whichever copy the browser held, in both directions.

**Triggers frontend rollback:** `DEPLOYMENT_CONTRACT_MISMATCH` that a backend fix does not clear ·
Inventory Replenishment or Site Priority failing to mount · a backend rollback to R49 while the R51 frontend
is live.

### 9C. GIT rollback

**Before any push there is nothing to roll back** — `origin/main` is `7fa6c19f` and the entire release is
local. After a push, use `git revert`; **do not rewrite remote history.** Prefer rolling back the
*deployment version* over the Git ref: the deployed version, not the branch tip, is what production runs.

---

## 10. PRODUCTION SMOKE CHECKLIST — every check READ-ONLY

A–D after step E of §6 (backend live, frontend not yet published). E–K after step F.

| # | Check | Surface | Pass criteria |
|---|---|---|---|
| **A** | System health | `system.health` | `build_id` = `deployment_release` = …**R51** · `mixed_deployment` `false` · `stale_modules` `[]` · `uniform` `true` |
| **B** | Action contract | `system.health` | `deployed_action_contract_version` **19** · `required_action_list_version` **14** · `transport_contract_version` **1** · `missing_actions` `[]` |
| **C** | R49 frontend still compatible | the still-unpublished live site | no `DEPLOYMENT_CONTRACT_MISMATCH` — R49 pins 18, backend reports 19, check is `<` |
| **D** | Preview disabled gate | `overseasAllocationPreview.job.status` | `success:false`, `errors[0].code` = **`FEATURE_DISABLED`**. **Not** an unknown-action refusal — that would mean `01_`/`74_` did not sync. This single probe separates *synced and off* from *not synced* |
| **E** | FC Summary | `fcSummary.workspace.get` | returns; counts match the pre-release reading |
| **F** | Inventory Replenishment | `inventoryReplenishment.workspace.get` + `inventoryScope.registry.get` | page mounts, scope selectors populate; the unresolved-priority box appears only where a priority is genuinely unset — **and is styled** (F-PD1) |
| **G** | Site Priority | no dedicated action — reads `KM.DB.getMarketplaces()` from `window._opDbCache`, populated by the app-boot **`getOperationDb`** read | page mounts and lists marketplaces with MISSING / SET / INVALID state. **Do not click Save** — `upsertMarketplace` is a write |
| **H** | Gap Materialization | `orderPlanningGap.get` · `inventoryReplenishmentGap.get` · `gapJob.status.get` | reads return stored gaps. **Never** `*.job.start` or `*.recalculate.all` — those write |
| **I** | Request Order / PO | `requestOrder.workspace.get` · `purchaseOrder.workspace.get` · `requestOrder.sendWorkset.get` | all three return; counts match. **Do not Send** |
| **J** | Shipment Overview | `shipment.workspace.get` | returns and renders overview and map |
| **K** | No unexpected business writes | row counts + latest `updated_at` on `shipping_plans`, `shipping_plan_lines`, `shipments`, `shipment_lines`, `shipment_routes`, `shipment_events`, `marketplaces` | **identical before and after the whole pass.** Record both readings; a delta means a listed read is writing and the release stops |
| **K2** | Preview left no trace | Script Properties | **no** `OAP_PREVIEW_JOB` and **no** `OAP_PREVIEW_RESULT:*` key exists |

Nothing in this list calls a `*.start`, `*.save`, `upsert*`, `submit*`, `create*`, `confirm*` or `receive*`
action. If a check cannot be completed read-only, **skip it and record the skip** rather than promoting it
to a write.

---

## 11. GUARDS THAT NOW ENFORCE THIS RUNBOOK

`assets/tests/frontend-cache-token-publication-s8-b3-r3-gate1.test.js` — **21 assertions**.

The rule it enforces: **a browser asset whose content changed since the live release may not be published
under the token the live site already serves.** It is anchored to the deployed baseline commit rather than
to "the token moved whenever the file moved", because the stricter phrasing fires on history that was
published long ago and is already correct in every cache. The strict census is still printed, named and
non-failing, so drift is visible before it becomes a defect.

It complements, and does not replace, `cache-token-rotation-s8-r4c-p1.test.js`, which owns the **family**
rule — which token series each asset belongs to and that the families are never crossed. The two gates ask
different questions: that suite asks *did the right family rotate*, this one asks *did a changed file reach
the browser at all*. F-PD1 slipped between them because the file's content changed while its family did not
rotate, and no gate was asking that.

The baseline commit is pinned **with self-checks**: it must exist, be an ancestor of HEAD, declare R49, and
the ledger must still record Production as R49 — so a stale pin fails loudly instead of silently measuring
against the wrong tree. **Re-anchor the pin when R51 ships.**

Non-vacuity is proven, not asserted: the suite de-patches the correction in memory and confirms the gate
reports exactly one stale publication and names the right file — and that a changed asset *with* a rotated
token is still classified safe, so green means something.

---

## 12. TECHNICAL DEBT — recorded, not fixed here

| # | Item | Severity |
|---|---|---|
| **TD-1** | **`workspaceIo` context-failure laundering.** The `workspaceIo` factory in `oapDefaultEnv_` (`74_:589`) hard-codes `ok:true` while copying possibly-undefined context fields. **Pre-existing** (present at `8c0bd487`, unchanged by FIX1), reachable only through a broken clock. Measured effect: the fingerprint **degrades** but the harvested month still differentiates, so a month rollover is still caught | Low — not a deployment blocker |
| **TD-2** | Preview remains disabled | by design |
| **TD-3** | B4 Apply not implemented — no Apply action exists in `74_` or `01_router.gs` | by design |
| **TD-4** | Frontend publication backlog — seven files across three rounds; §8 clears it | Medium |
| **TD-5** | **`43_` is stampless with no manifest row**, so `system.health` cannot detect its omission. §7 is the compensating control | Medium |
| **TD-6** | **Two tokens remain "set before the file last changed"** — `operation-system-db-api.js` (rotated against the live release, so safe) and `pages/overseas-ops-preview.js` (unchanged since the live release, so safe). Both are reported by the §11 census and neither is a live risk | Low |
| **TD-7** | Module numbered `74_` rather than `47_` (collision with `47_api_v1_recommendation_generation.gs`) | cosmetic |
| **TD-8** | The E4 unshipped-cut exemption exists at all — narrow, self-cancelling, proven against six negative cases | Low |

---

## 13. REMAINING UNKNOWN FACTS

| # | Unknown | Why | Blocks |
|---|---|---|---|
| **U-1** | Script ID · deployment ID · project name · bound Spreadsheet ID · `/exec` URL | Forbidden in agent instructions and in ledger output; never supplied | §4, §5 — **user supplies at the console** |
| **U-2** | **The currently live deployment version number** | Never recorded for any release; readable only in the editor | §5 P-4 and all of §9A. **Capture before deploying — `ROLLBACK_TARGET_UNCONFIRMED` otherwise** |
| **U-3** | **GitHub Pages publishing source** | A GitHub repository setting, not a file; `gh` unavailable here | §1, §6, §8, §9B — **`PAGES_SOURCE_UNCONFIRMED`** |
| **U-4** | Whether the seven S7-R4 relocated tools are present in the live project | A prior probe found all seven absent; that is a past reading | Nothing — confirm and record |
| **U-5** | R49's own deployment version number | Not recorded when R49 shipped | §9A, if U-2 is also missed |
| **U-6** | **Production priority exposure** — how many active marketplaces carry an unresolved `allocation_priority` | **`PRODUCTION_PRIORITY_EXPOSURE_UNVERIFIED`.** The configured `/exec` answers an unauthenticated caller with Google's "page not found"; the deployment is not readable without a signed-in session, and no credential is held or sought | §6 step B / **S-4** — measure from a signed-in browser before step C |

---

## 14. USER AUTHORIZATION CHECKPOINTS

Six checkpoints, in the approved Sandbox → Main → Production Verification workflow. **None is implied by any
other, and none has been given.** Each is a separate decision with its own precondition. **No additional
branch is created and the remote feature branch is never pushed.**

| | Checkpoint | Covers | Precondition |
|---|---|---|---|
| **CP-0** | **Confirm the Pages source** | the §1 lookup | — |
| **CP-1** | **Record the rollback version and measure priority exposure** | steps A and B | §5 P-1…P-8 |
| **CP-2** | **Apps Script source sync** | the six files of §4, `63_` last | U-1 · **S-1 recorded** · **S-4 measured** |
| **CP-3** | **Deployment version publication** | *Edit → New version* on the **existing** deployment | CP-2 complete · **§7 markers V-1…V-5 recorded** |
| **CP-4** | **Sandbox → Main fast-forward, then push `main`** — publishes the frontend | `git merge --ff-only` in the MAIN worktree, then `git push origin main` | CP-0 · backend healthy (§10 A–D) |
| **CP-5** | **Preview activation** | flipping `OVERSEAS_ALLOCATION_PREVIEW_ENABLED_` to `true` | **A later, separate decision. Not part of this release.** It exposes four actions and no page |

---

**Nothing in this runbook has been executed.** `origin` unchanged at `7fa6c19f`; Production remains R49.
