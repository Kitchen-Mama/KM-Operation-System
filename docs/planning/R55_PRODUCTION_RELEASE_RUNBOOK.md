# R55 PRODUCTION RELEASE RUNBOOK — R54 → R55 (FX Rate Book)

**Written for: the Owner, who performs every step below by hand.** Prepared 2026-10-21. The agent that
wrote this ran nothing remote and changed no deployment setting.

| | |
|---|---|
| Release candidate | **`7376bee8`** — frozen. No FX / IR change rides with it. |
| Live baseline | **R54**, from Owner health **HEALTH-50215EC7**: `mixed_deployment=false`, Sheets v4 RESOLVED |
| Backend delta | four files: `01_` · `04_` · `63_` · **new** `75_`. `90_` is **not** rebuilt and **not** pasted |
| Frontend delta | seven files (§3) |
| GS load surface | **4,666,841 / 4,668,000** bytes, under by 1,159 |
| Regression | 690 / 690 clean at `73d64342`; docs-only `7376bee8` re-checked by the 8 suites that read it |

---

## 0. READ FIRST — the frontend is ALREADY published

Re-checked read-only on 2026-10-21:

```
git ls-remote origin refs/heads/main   ->  7376bee8   (pushed 10:52:34, fast-forward from 315b69da)
```

So the recommended order (backend first, then frontend) **has already been inverted**: GitHub Pages now
serves the R55 frontend. What the live site does depends on which backend answers it:

| backend answering | what operators see | harm |
|---|---|---|
| **R54** (contract 20) | the R55 frontend pins contract **21**, so `checkDeploymentContract` returns `DEPLOYMENT_CONTRACT_MISMATCH`. Weekly Shipping Plan actions are **disabled with that reason**; Site Priority saves are **refused before dispatch**; the FX Rate Book page cannot read (`fxRateBook.get` is unknown to the R54 router). Reads elsewhere are unaffected | **none written** — every gate fails closed |
| **R55** (contract 21) | normal | — |

**This makes the backend sync time-sensitive, not optional.** First action: one `system.health` call.
If it reports R55 with `mixed_deployment=false`, go straight to §5. If it reports R54, do §2 now — or,
if the sync cannot happen soon, run the **frontend rollback** in §6B.

---

## 1. PRE-SYNC CHECKLIST (no identifier is written into this repository)

- [ ] **P-1** The open Apps Script project is the production one, bound to the production Database.
- [ ] **P-2 — UNRECOVERABLE — record the CURRENT live deployment version number** (*Deploy → Manage
      deployments*), outside this repository. It is the backend rollback target. Cannot read it →
      **`ROLLBACK_TARGET_UNCONFIRMED` — stop.**
- [ ] **P-3** That prior version is still **selectable** in *Edit → Version*.
- [ ] **P-4** You will **edit the existing deployment → New version**. Creating a new deployment mints a
      different `/exec`, and the frontend keeps talking to the old one.
- [ ] **P-5** Do **not** change *Execute as*, *Who has access*, OAuth scopes or Script Properties. None
      is part of R55. (The one scope the Owner has since approved, `userinfo.email`, is a separate step
      with its own manifest sync — §5A — and is not taken during this section.)

## 2. BACKEND SYNC — four files, `63_` LAST

Copy from Git at **`7376bee8`**, `assets/specs/active/apps-script/`:

| order | file | Git blob | note |
|---|---|---|---|
| 1 | `75_api_v1_fx_rate_book.gs` | `3fb022f03296` | **new file** — create it in the editor with this exact name |
| 2 | `04_marketplace_forecast_import.gs` | `f5e7bde80220` | replaces R54 `87598331911f` |
| 3 | `01_router.gs` | `0e169fd383aa` | replaces R54 `5fb95e8754c0`; routes `fxRateBook.get` / `.save` |
| 4 | `63_api_v1_system_health.gs` | `933e16016a8a` | replaces R54 `36777a277731`; **last**, because it declares the release |

`63_` last is deliberate: a project with `63_` pasted and the others not would announce R55 while
holding R54 handlers. `mixed_deployment` would still catch it — all four files carry R55 build stamps
that the probe compares — but it should never be the thing that catches it.

Save, then *Manage deployments → Edit → Version: New version → Deploy*.

## 3. FRONTEND — seven files (already published at `7376bee8`)

`index.html` · `assets/js/app.js` · `assets/js/api/operation-system-db-api.js` ·
`assets/js/pages/fx-rate-book.js` · `assets/html/pages/fx-rate-book.html` ·
`assets/css/pages/fx-rate-book.css` (new) · `assets/js/pages/inventory-replenishment.js`

`inventory-replenishment.js` is not FX: CP2X-R4 to R4-R2 changed it after the R54 cut and were unpushed
until this push.

**Cache tokens, checked against what was live before the push (`315b69da`):** every changed asset moved
`r61-scopereuse-20261018` → `r62-revisitrestore-20261019`, a token no published commit used before, so
no browser holds a stale copy under the new URL. `fx-rate-book.html` carries no token and needs none:
partials are fetched with `cache: 'no-store'`. Operators should still **hard-reload once** after §2.

## 4. EXPECTED HEALTH — computed from the candidate source

Evaluated by loading `63_` at `7376bee8`, not read from prose:

| field | R55 (expected after §2) | R54 (expected after a backend rollback) |
|---|---|---|
| `deployment_release` / `build_id` | `…-R55` | `…-R54` |
| `deployed_action_contract_version` | **21** | 20 |
| `required_action_list_version` | **18** | 16 |
| required actions | **50** (adds `fxRateBook.get`, `fxRateBook.save`) | 48 |
| `transport_contract_version` | 1 | 1 |
| `mixed_deployment` | **false** | false |
| `stale_modules` / `absent_modules` / `missing_actions` | `[]` | `[]` |

## 5. POST-SYNC — read-only, in this order

1. `system.health` — every R55 value in §4. Any mismatch → re-paste the file named in `stale_modules`;
   still mismatched → §6A.
2. Hard-reload the site. No page may show `DEPLOYMENT_CONTRACT_MISMATCH`.
3. **One `fxRateBook.get`** (open *Administration → FX Rate Book* once; it writes nothing). Record
   `may_edit` and `authority_reason`:

   | `authority_reason` | meaning | who acts |
   |---|---|---|
   | absent, `may_edit: true` | caller identified and on the allowlist | — |
   | `FX_AUTHORITY_NOT_CONFIGURED` | `KM_FX_RATE_BOOK_EDITORS` unset | Owner decision |
   | `FX_AUTHORITY_WILDCARD_REFUSED` | it is `*` | Owner replaces it with real addresses |
   | `FX_AUTHORITY_UNVERIFIABLE` | the caller's email could not be read — **two causes, one code** (below) | see the note |
   | `FX_NOT_AUTHORIZED` | identified, not listed | Owner adds the address |

   **Expected today: `FX_AUTHORITY_UNVERIFIABLE` or `FX_AUTHORITY_NOT_CONFIGURED`.** Either is correct
   fail-closed behaviour and **neither is a release failure**.

   **`FX_AUTHORITY_UNVERIFIABLE` is not one fact (FX-AUTH-R1).** `75_` reads the caller with
   `Session.getActiveUser().getEmail()` inside a `try`, and a throw and an empty answer both become `''`:

   | what happened | who acts |
   |---|---|
   | **a permission exception** — the manifest's explicit `oauthScopes` lack `userinfo.email`, so the call throws | the scope sync in §5A |
   | **an empty email** — the call succeeds and returns `''` | the Owner, after recording it — **cause not determined** (see §5A step 6); not attributed to the access mode by default |

   **The response cannot tell them apart, and neither can the execution log**: `75_` catches the
   exception and logs nothing. The editor diagnostic in §5A (`TEMP_CheckFxIdentity`) shows whether the
   call throws for the person running it — but it runs in the EDITOR, so it says nothing certain about
   what the Web App sees. Do not explain the code as "execute-as-owner" by default. The Owner's
   measurement on 2026-10-21 (allowlist present) was the **first** case:
   `docs/evidence/fx-auth-r1/owner-measurement.json`.
4. Stop there. The write steps of the post-publish acceptance (release log, FX1-R4 §"steps 4 onward
   write") are **not** part of this release check.

**What may be claimed afterwards:** *R55 deployed; FX Rate Book readable.* **What may not:** *FX enabled
in production.* That claim needs a real save by an identified editor, which needs an Owner decision on
identity first. No rate is initialised and no price is written by anything in this runbook.

## 5A. FX-AUTH-R1 — THE `userinfo.email` SCOPE (separate, Owner-run, after §5)

Prepared locally only. **Production is unchanged until the Owner does this.** It moves **one file**:
`assets/specs/active/apps-script/appsscript.json`, whose only change is one added line in
`oauthScopes`. No `.gs` file, no bundle, no Script Property, no `executeAs`, no `access` and no OAuth
client setting moves. Authorisation is obtained by running ONE reviewed, read-only diagnostic from the
editor — not by opening the Web App, and never by running a business function or a trigger.

**The diagnostic** is `docs/planning/fx-auth-r1/TEMP_CheckFxIdentity.gs.txt`. It reads
`Session.getActiveUser()` and the ONE property `KM_FX_RATE_BOOK_EDITORS`, and logs only: the address
Apps Script reports (or the error), whether the editor list is set, and whether that address is on it.
It writes nothing, prints no other property and not the list itself, touches no spreadsheet, trigger,
request or token, and does not read `getEffectiveUser`. It is a `.gs.txt` outside the Apps Script folder
so no sync or bundle can carry it.

1. *Project Settings →* "Show appsscript.json in editor" if it is hidden. Replace the manifest with the
   Git version. Before saving, compare: `oauthScopes` must hold **exactly these four approved scopes**,
   no more and no fewer —
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/script.scriptapp`
   - `https://www.googleapis.com/auth/bigquery`
   - `https://www.googleapis.com/auth/userinfo.email`
   — and the Sheets v4 and BigQuery v2 services, `Asia/Taipei`, `executeAs: USER_DEPLOYING` and
   `access: ANYONE_ANONYMOUS` must all be as they were. Save.
2. Add a NEW editor file named `TEMP_CheckFxIdentity`. If a file or function of that name already
   exists in the project, **read it in full and compare it line by line with the Git text**; use it only
   if it is identical, otherwise replace its whole content with the Git text. Paste nothing else.
3. In the editor's function menu choose **`TEMP_CheckFxIdentity` and nothing else**, then Run. Do not
   run any other function to get the prompt — several of them write or schedule.
4. **The consent screen is not the manifest check — step 1 is.** Google may show only what this account
   has not yet granted, so the screen need not list all four, and an earlier permission missing from it
   does not mean the manifest was pasted wrongly. **Stop** (cancel, do not continue, report) if any of
   these happens:
   - a permission outside the four approved scopes appears;
   - continuing would mean declining a permission the project needs (any of the four);
   - the diagnostic ends in an error, or logs an `active_error`.
5. Read the execution log line. **Only if all three hold** —
   - there is no `active_error`,
   - `active_email` is your own address,
   - `caller_on_editor_list: true` —
   go on to step 6. Otherwise **stop here and report**. Do not delete-and-version, and do not change
   anything to make it pass. An `active_error` is recorded **verbatim**, including one that names
   `userinfo.email`: its cause is **not confirmed**, so it is not concluded that the manifest was unsaved
   or that anything else is to blame. Do not change the deployment identity, the access mode or the
   allowlist mechanism, at this step or any other. While stopped, create no version: the diagnostic
   file is still in the project, and the rollback below removes it.
6. The diagnostic succeeded. **Delete the `TEMP_CheckFxIdentity` file**, save, and confirm it is gone
   from the file list. Then *Manage deployments → Edit → New version* (the same `/exec`), and one
   `fxRateBook.get` (open *Administration → FX Rate Book*; it writes nothing). Record `may_edit` /
   `authority_reason`:
   - `may_edit: true` → the Web App identified you and you are on the allowlist.
   - still `FX_AUTHORITY_UNVERIFIABLE` → **record it and leave the cause UNDETERMINED.** The editor
     identifying you does not mean the Web App can; the access mode is one candidate, not a finding.
     Report it; do not change the deployment. And never as a workaround: no `*`, no email sent from
     the browser, no `getEffectiveUser` (that is the deployer, not the caller). All three stay refused.
7. Stop. No FX save, no rate initialised, no price recalculated by this step.

**Rollback:** first delete the `TEMP_CheckFxIdentity` file if it is still in the project, then paste the
previous manifest (the three scopes), save, new version. Nothing else to undo.

## 6. ROLLBACK — backend and frontend are separate

### 6A. Backend → R54

*Manage deployments → Edit → Version →* the number recorded at **P-2** *→ Deploy*. The `/exec` URL does
not change. Verify with the R54 column of §4. **Consequence:** an R54 backend under the published R55
frontend is exactly the fail-closed state of §0, so roll the frontend back too (6B). No database
compensation is needed — R55 adds no table, and the rate book is a single Script Property that nothing in
this runbook creates.

### 6B. Frontend → `315b69da`

A forward revert, never a force-push:

```bash
cd "C:/Users/viczh/Desktop/KM/品牌資源/Vibe Coding/Operation System/Operation System"
git fetch origin
git log --oneline -1 origin/main          # expect 7376bee8
git revert --no-commit 315b69da..7376bee8
git commit -m "revert(frontend): return the published site to 315b69da"
git push origin main                      # USER
```

The reverted assets go back to the `r61` token, which differs from the `r62` just published, so browsers
refetch. A frontend at `315b69da` pins contract 20 and is satisfied by **either** backend, which is why it
can be rolled back alone.

That range also returns the four `.gs` files **in Git** to R54. That is right when the backend is R54
(not yet synced, or rolled back by 6A). If the backend stays on R55, revert only the seven frontend paths
of §3 instead, so Git keeps describing the deployed backend.

---

**NOT EXECUTED BY THE AGENT.** No push, no sync, no deployment, no Access / identity / OAuth / Property
change, no rate initialised, no price written.
