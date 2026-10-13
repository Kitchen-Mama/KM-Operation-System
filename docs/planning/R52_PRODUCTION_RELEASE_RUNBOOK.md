# R52 PRODUCTION RELEASE RUNBOOK — `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R52`

**STATUS: PREPARED. NOT SYNCED. NOT DEPLOYED. NOT PUSHED.**
Production runs **R49**. R50, R51 and R52 are all cut and all unshipped; **they travel in ONE paste set.**

> **THIS SUPERSEDES `R51_PRODUCTION_RELEASE_RUNBOOK.md` OPERATIONALLY AND REPLACES NONE OF IT HISTORICALLY.**
> The R51 runbook is preserved unchanged as the record of what R51 was cut to do. It is still the reference for
> the mechanics this document does not restate: the Pages publishing-source question (§1), the Apps Script
> deployment prerequisites (§5), the `43_` sync-verification gate (§7), and the backend/frontend/git rollback
> procedures (§9A/9B/9C). **Every one of those still applies.** What changed is the file set, the acceptance
> numbers and the smoke checks, and those are stated here in full.

---

## 0. STOP CONDITIONS — read first

Stop and report rather than improvise if any of these is true.

| # | Condition |
|---|---|
| **S-1** | `system.health` reports `deployed_action_contract_version` **< 20** after the sync. The frontend cannot store a priority against such a deployment, and will refuse before dispatching. |
| **S-2** | `mixed_deployment` is `true`, or `stale_modules` / `absent_modules` is non-empty. |
| **S-3** | `missing_actions` is non-empty — in particular if it names `marketplace.allocationPriority.set` or `upsertMarketplace`. |
| **S-4** | The `marketplaces` sheet has no `allocation_priority` column or no `marketplace_id` column. The handler refuses with `SCHEMA_MISSING_COLUMN`; provision the column before retrying. |
| **S-5** | Any marketplace identity collides under canonical country (a `UK` row and a `GB` row for the same company + marketplace). Saves for that scope will refuse with `IDENTITY_COLLISION`. **Resolve in the sheet; do not merge from code.** |
| **S-6** | The Pages publishing source is still **UNCONFIRMED** (see R51 runbook §1) and a frontend publication is being attempted. |

---

## 1. RELEASE IDENTITY

```
SYS_DEPLOYMENT_RELEASE_                F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R52
SYS_BUILD_VERSION_            (63_)    F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R52
RTR_BUILD_VERSION_            (01_)    F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R52
MD_BUILD_VERSION_             (03_)    F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R52   ← NEW STAMP, first time this file has one
CONFIG_BUILD_VERSION_         (00_)    F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R51   ← carried
OAP_BUILD_VERSION_            (74_)    F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R51   ← carried
KM_BUNDLE_CONTENT_HASH_       (90_)    3de64364ba358468c39142aac212d663b41075f454dc6d86218fc066cdbc7e25  ← UNCHANGED
SYS_DEPLOYED_ACTION_CONTRACT_VERSION_  20   (was 19)
SYS_REQUIRED_ACTION_LIST_VERSION_      16   (was 14 — by TWO, see §6)
SYS_TRANSPORT_CONTRACT_VERSION_        1    (unchanged)
KM_EXPECTED_ACTION_CONTRACT_VERSION_   20   (client pin, held to EQUALITY)
Application cache token                r52-prioritywrite-20261012   (was r50-irpriority-20261010)
```

---

## 2. BACKEND SYNC MANIFEST — **SEVEN** files, `63_` **LAST**

Cumulative **R49 → R52**, recomputed from `git diff --name-only 7fa6c19f HEAD -- assets/specs/active/apps-script/`
plus this release's own file. Paste in this order.

| # | File | Round it last changed | Why it travels |
|---|---|---|---|
| 1 | `00_config.gs` | R51 | `OVERSEAS_ALLOCATION_PREVIEW_ENABLED_` — the staged-OFF Preview gate |
| 2 | `01_router.gs` | **R52** | R51's four Preview routes **+ R52's `marketplace.allocationPriority.set`** |
| 3 | `03_master_data_handlers.gs` | **R52** | **NEW to the manifest.** The bounded priority writer, the legacy priority refusal, the shared lock |
| 4 | `43_api_v1_gap_materialization.gs` | *(stampless)* | R50 carry — **no build symbol; verified by the §7 marker check in the R51 runbook** |
| 5 | `74_api_v1_overseas_allocation_preview_job.gs` | R51 | New file in R51 (plus its R2-FIX1 correction) |
| 6 | `90_generated_supply_planning_bundle.gs` | R51 hash | **NOT rebuilt by R52** — no `assets/js/core` file changed |
| 7 | `63_api_v1_system_health.gs` | **R52** | **LAST.** Contract 20, list 16, the manifest, the release identity |

**`63_` is pasted last, always.** It is the file that *describes* the deployment; pasting it first would make the
project claim to be R52 while still holding R49 code in the other six.

**`03_` is the one to watch.** It has never been in this manifest, so no previous sync ever had to include it, and
no previous probe could report it stale. From R52 the router dispatches a **live write** into it: a project that
takes the new `01_` and not the new `03_` routes `marketplace.allocationPriority.set` into an undefined handler.

---

## 3. BACKEND-FIRST SEQUENCE

Backend first is **safe and required**. The client's compatibility check is
`deployed_action_contract_version < KM_EXPECTED_ACTION_CONTRACT_VERSION_` — a **minimum**, not an equality. The
backend may lead the frontend; the frontend may never lead the backend.

| Step | Action | Owner |
|---|---|---|
| **A** | Review the local commit. **No push is required before the sync** (decision S8-B3-R3-CP2A). | USER |
| **B** | Paste files 1–6 into the Apps Script project, in the order above. | USER |
| **C** | Run the `43_` marker verification from **R51 runbook §7** before continuing. | USER |
| **D** | Paste `63_`. | USER |
| **E** | Create a **NEW deployment version**. Saving the editor is not deploying. | USER |
| **F** | Run the §6 acceptance checks below. | USER |
| **G** | Publish the frontend (§5). | USER |
| **H** | Run the §7 smoke checklist. | USER |

---

## 4. WHAT R52 CHANGES AT RUNTIME — the operator-visible list

1. **`upsertMarketplace` now REFUSES any request containing `allocation_priority`** — including `0`, `''` and
   `null`. The code is `PRIORITY_WRITE_NOT_SUPPORTED_HERE`, `zero_write: true`, nothing written.
   **Normal Add Marketplace — a payload with no `allocation_priority` key at all — is unchanged.**
2. **Both `marketplaces` writers now take the shared script lock** (`tryLock(30000)`). Add Marketplace gains one
   new refusal it never had: *"Could not acquire the script lock (another write is in progress)"*. This is the
   same behaviour ~20 other handlers across 11 files already have.
   **A bound that can be exceeded, said plainly:** `gapJobContinue_` holds this same lock for up to **240 s**, so
   a marketplace write that lands inside a Gap Materialization run **refuses rather than queues**. Retry.
3. **Site Priority saves through `marketplace.allocationPriority.set` and has no fallback.** Against a backend
   older than R52 it refuses **before dispatching** and says so; it will not reach for `upsertMarketplace`.
4. **Every priority save is a compare-and-set.** Two operators on stale pages can no longer overwrite each
   other silently — the second is refused and told to Refresh.
5. **CP2I-R1 — `updated_by` and `updated_at` are REQUIRED COLUMNS on the `marketplaces` sheet.** Owner decision.
   If either is absent the priority write is **refused** with `SCHEMA_MISSING_COLUMN`, `zero_write: true`,
   before the first setter — it is no longer silently skipped. **This is a pre-deployment check an operator must
   make, because it is a property of the SHEET and not of the deployment**: a sheet missing an audit column will
   refuse every priority save after R52 that it silently half-completed before. The refusal names the missing
   column(s) in `missing_columns`. This writer never provisions a column and never appends a header.
6. **CP2I-R1 — malformed input TYPES are refused rather than coerced.** An array, object, boolean, Date or
   function sent as `allocation_priority`, as `expected_allocation_priority`, or as the compare-and-set state is
   `INVALID_PRIORITY` / `CAS_REQUIRED`, never a number read out of `String(value)` — `String([5])` is `'5'`, and
   that is how an array used to be stored as a confident weight of 5. Numbers, numeric strings, decimals and an
   explicit `0` are unchanged and still commit; MISSING stays distinct from INVALID and from a valid zero.
7. **CP2I-R1 — the client dispatches a fixed action.** `KM.DB.setMarketplaceAllocationPriority` builds its
   request body from the declared contract fields only and pins the action, so a caller-supplied `action` can no
   longer redirect the wrapper and no undeclared field reaches the wire.

---

## 5. FRONTEND PUBLICATION PACKAGE

**The cache token rotates this time.** R51 deliberately did not rotate (its only browser edit was the contract
pin). R52 changes behaviour in three served files, so a returning browser holding any of them on the old token
would run a save path that no longer matches the deployment.

`r50-irpriority-20261010` → **`r52-prioritywrite-20261012`**, appended to `ROUND_TOKENS` **only**.
The `MAP_`, `IR_CSS_` and `METHOD_REGISTRY_` series are untouched — crossing those families is what F-PD1 broke
28 suites proving.

| File | Change |
|---|---|
| `index.html` | 56 token references rotated |
| `assets/js/app.js` | 11 token references rotated |
| `assets/js/api/operation-system-db-api.js` | the bounded writer, the pre-write deployment gate, contract pin 20 |
| `assets/js/pages/site-priority.js` | calls the bounded writer, sends the CAS, identity-safe read-back |
| `assets/css/pages/site-priority.css` | the fourth status state (`warn`) |

Publish **all five**. A partial publication that serves a new `site-priority.js` against an old
`operation-system-db-api.js` has no bounded writer to call and will refuse every save.

### 5.0 CP2M-R3 — THE TOKEN IS ROTATED, AND §5.1's CONDITION IS RESOLVED

Owner has confirmed the R52 frontend **is published** and this fix candidate is **not**. §5.1 below asked which
branch applied; the answer is the second one, so the application token has been rotated:

`r52-prioritywrite-20261012` → **`r53-cp2mr3-coldstart-shell-20261013`**, appended to `ROUND_TOKENS` (123 → 124).
54 references in `index.html` and 13 in `assets/js/app.js`. The `MAP_`, `IR_CSS_` and `METHOD_REGISTRY_` series
are untouched.

**`KM.RELEASE` is NOT bumped, and that is deliberate.** namespace.js's own comment says to bump it with the
asset tokens; three suites pin it to `r6a1-request-send-20260822`, and the decision register records it as the
frozen build id that per-round stamps must not be marched to. The comment is the outlier, not the suites.

**The publication set grows by two files** — both already in the package, now reachable by route rather than at
boot: `assets/js/pages/carrier-rate-card.js` and `assets/js/pages/overseas-stock.js`. `index.html`,
`assets/js/app.js` and `assets/css/layout.css` all change.

### 5.1 CP2M-R2 — `site-priority.css` CHANGED AGAIN, AND THE TOKEN QUESTION IS CONDITIONAL

CP2M-R2 made three corrections to `assets/css/pages/site-priority.css` (the table wrapper scrolls instead of
clipping; the narrow filter select releases its 180px `min-width`; the card cell wraps). The file is already in
the package above, so the publication SET is unchanged — but the cache token is not automatically settled:

> **A token may only be reused while nothing carrying it has been published.**

- **If the R52 frontend package has NOT yet been published** — `r52-prioritywrite-20261012` may carry the new
  bytes unchanged. Nothing is holding the old copy, so nothing can be stranded on it.
- **If it HAS been published** (any browser has already been served
  `site-priority.css?v=r52-prioritywrite-20261012`) — **a new token is REQUIRED**, appended to `ROUND_TOKENS`
  and rotated across the application set. Reusing it would leave every one of those browsers on the copy with
  the clipped Edit column, permanently.

**This agent did not rotate the token**, for two stated reasons: the round's own condition for cutting a final
candidate ("once stable") is not met while the cold-start finding in §5.2 is open, and the publication state
above is a fact only the Owner holds. **Determining which branch applies is a release gate (§10).**

### 5.2 CP2M-R2 — A COLD-START FINDING THAT IS NOT FIXED AND IS NOT A BLOCKER

The bounded performance observation measured the boot payload at **67 scripts / 3.82 MB**, of which **2.31 MB
(60%) is page code for pages that are not Home**. It is a pre-existing property of every release to date, it is
NOT a regression introduced by R52, and nothing in this runbook depends on it. It is recorded here so the next
release has the number, not to gate this one. See
`docs/planning/NAVIGATION_PERFORMANCE_OBSERVATION_S8_B3_R3_CP2M_R2.md`.

---

## 6. ACCEPTANCE — run immediately after step E

| # | Check | Expected |
|---|---|---|
| **A-1** | `system.health` → `build_id` | `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R52` |
| **A-2** | `deployed_action_contract_version` | **20** |
| **A-3** | `required_action_list_version` | **16** |
| **A-4** | `transport_contract_version` | 1 |
| **A-5** | `mixed_deployment` | `false` |
| **A-6** | `stale_modules` / `absent_modules` | empty |
| **A-7** | `missing_actions` | empty — and specifically **not** naming `marketplace.allocationPriority.set` or `upsertMarketplace` |
| **A-8** | module stamp `MD_BUILD_VERSION_` | `…-R52` — **the check no previous release could make** |
| **A-9** | module stamp `RTR_BUILD_VERSION_` | `…-R52` |
| **A-10** | module stamp `CONFIG_BUILD_VERSION_` | `…-R51` (carried — **must not read R52**) |
| **A-11** | module stamp `OAP_BUILD_VERSION_` | `…-R51` (carried) |
| **A-12** | `KM_BUNDLE_CONTENT_HASH_` | `3de64364…` — **unchanged; a different value means 90_ was rebuilt when it should not have been** |

**Why the list version moved by TWO (14 → 16).** `SYS_REQUIRED_ACTIONS_` gained two rows. One is the new action.
The other is `upsertMarketplace`, which has been **routed since before that registry existed** and was never
listed — so `sysProbeRequested_`, which resolves a caller-named action *only* through that table, reported it
`known_to_this_build: false` for deployments that served it correctly. The release-stamp gate asserts this
number moves exactly as far as the registry grows, specifically so it cannot be a number somebody typed.

---

## 7. PRODUCTION SMOKE CHECKLIST — all READ-ONLY except S-4

| # | Check | Expected |
|---|---|---|
| **S-1** | Open Site Priority. | Rows render; Missing renders as **MISSING**, not `0` |
| **S-2** | Press Refresh. | A genuine re-read; the banner clears |
| **S-3** | Open an editor, enter a negative / non-numeric value. | Refused in the browser, nothing sent |
| **S-4** | **THE ONE WRITE.** Save a priority equal to the value already stored, on one scope. | *"Saved and VERIFIED by re-reading the reference"*, green |
| **S-5** | In a SECOND tab opened before S-4, save a different value for the same scope. | **Refused** — *"the stored priority is not the value this save was prepared against… Refresh"*, nothing written |
| **S-6** | Refresh the second tab, repeat. | Succeeds |
| **S-7** | Inspect the row in the sheet. | `allocation_priority`, `updated_by`, `updated_at` changed. **`status`, `currency`, `marketplace_display_name`, `marketplace_alias`, `fulfillment_model`, `note` byte-identical.** |
| **S-8** | Add Marketplace — create a new marketplace with no priority. | Succeeds; the new row's `allocation_priority` is **blank**, not `0` |
| **S-9** | Add Marketplace — edit an existing marketplace's currency. | Succeeds; its `allocation_priority` is **untouched** |

S-4 is the only write. It is chosen to be value-preserving so that a failure costs nothing.

---

## 8. ROLLBACK

**Backend, frontend and git are three separate procedures — see R51 runbook §9A / §9B / §9C.** They are unchanged
by R52 except for the two facts below.

- **Backend rollback target is Version Candidate 307** (R49), unchanged. **Still UNVERIFIED** — the version list
  has not been read. Verify before relying on it.
- **A backend rollback to R49 while the R52 frontend is still published leaves Site Priority unable to save.**
  That is the designed behaviour, not a fault: the page refuses before dispatching rather than falling back to
  the unguarded writer. **Roll the frontend back too**, or accept a read-only Site Priority until the backend
  returns.
- **The reverse is safe.** An R49 frontend against an R52 backend cannot write a priority either — the backend
  refuses it — but nothing else breaks.

---

## 9. WHAT THIS RELEASE DOES NOT DO

- **It cannot clear a priority back to MISSING.** There was no supported path before and there is none now.
  Adding one means a sentinel value every reader would have to learn — a product decision, not a safety fix.
- **It does not prove a write landed after a lost answer.** A read-back that shows the intended value cannot
  attribute it to that request rather than a concurrent one, and cannot say whether the audit columns finished.
  That case is shown in a distinct WARN state and is **not** called a verified save. Closing it needs a write
  receipt store (`write_id` + a status lookup, as `pricing.update` has). **Not proposed for R52.**
- **It does not protect against edits made outside this Apps Script project.** The script lock serialises
  executions of *this project only*. A human editing the sheet in the browser, another Apps Script project, a
  Sheets API client or an add-on is neither prevented nor reliably detected. **No guarantee of detecting every
  external edit** — a read-back landing between two external writes can agree by coincidence.
- **It changes no weight, no allocation formula and no eligibility rule.** `priority_factor = MAX(priority, 1)`
  (§24.7) is untouched, as is §45.A's treatment of Missing as UNRESOLVED.

---

## 10. REMAINING GATES

| Gate | State |
|---|---|
| Pages publishing source | **UNVERIFIED** — owner reports unmodified, no view access (R51 runbook §1) |
| **CP2M-R2 cache token branch (§5.1)** | **RESOLVED (§5.0)** — Owner confirmed R52 is published, so a new token was required and has been rotated. |
| **CP2M-R3 responsive shell** | Below 1024px the sidebar becomes a drawer. Desktop is unchanged. Verify on a real phone that the menu opens, Escape and the backdrop close it, and choosing a page closes it. |
| **CP2M-R3 cold-start split** | Carrier Rate Card and Overseas Stock load their code on first open. Verify both pages still open, render and re-open. |
| Rollback Version Candidate 307 | **UNVERIFIED** |
| Seven-file backend sync | PENDING |
| New Apps Script deployment version | PENDING |
| Frontend publication (5 files) | PENDING |
| Sandbox → Main | PENDING |
| `git push origin main` | PENDING — **USER-owned** |
| Production smoke (§7) | PENDING |
| Overseas Allocation Preview flag | **OFF** — out of scope, not activated by this release |

---

## 11. AUTHORIZATION

`DEPLOYMENT_OWNER = USER` · `APPS_SCRIPT_SYNC_OWNER = USER` · `PUSH_OWNER = USER`.

No step in this runbook is performed by an agent. The commit is local and `origin` is unchanged.
