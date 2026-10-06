# S8-R4D-D2 — ENABLE ADVANCED SHEETS SERVICE + RUN READ-ONLY B1 BENCHMARK
## Part 1 of 2 — the repository transition. The benchmark has not run.

```
MODE                        BENCHMARK ENABLEMENT + READ-ONLY PRODUCTION EXPERIMENT
B1 PRODUCT IMPLEMENTATION   NOT AUTHORIZED
R44 PRODUCT RELEASE         NOT AUTHORIZED
PRODUCT_RUNTIME_FILE_CHANGE_COUNT = 0
```

This round has two halves and they belong to different owners. The first half — the one in this document — is
a repository transition: the declared intent flips, the manifest gains one advanced service, and the gates
that watch both are re-aimed. The second half is a Google Cloud action the operator performs in a console no
test here can see, followed by a benchmark run against Production.

**The service is not live.** Nothing in this repository can make it live, and nothing here claims it is.

---

## 1. The transition is one state in two files

`appsscript.json` says what the deployment *can* do. `assets/tests/_advanced-services-state.js` says what the
repository *intends*. D1 built them as a matched pair precisely so that neither could move alone, and this is
the round that moves them.

```
PRE_ENABLE   3d71590   SHEETS_ENABLED: false   manifest: [ BigQuery v2 ]
POST_ENABLE  (this)    SHEETS_ENABLED: true    manifest: [ BigQuery v2, Sheets v4 ]
```

The manifest diff is five added lines and nothing removed:

```diff
         "userSymbol": "BigQuery",
         "version": "v2",
         "serviceId": "bigquery"
+      },
+      {
+        "userSymbol": "Sheets",
+        "version": "v4",
+        "serviceId": "sheets"
       }
```

```
SHEETS_SERVICE_DECLARATION_COUNT = 1     { userSymbol: Sheets, serviceId: sheets, version: v4 }
BIGQUERY_PRESERVED               = YES   v2 / bigquery, byte-identical
OAUTH_SCOPE_CHANGE_REQUIRED      = NO    the three scopes are unchanged
WEBAPP_SETTINGS_CHANGED          = NO    USER_DEPLOYING / ANYONE_ANONYMOUS
TIMEZONE_CHANGED                 = NO    Asia/Taipei
PRODUCT_RUNTIME_FILE_CHANGE_COUNT = 0
```

The timezone row is not boilerplate. `Asia/Taipei` is what makes a date cell local midnight, which is why all
41 date columns render `…T16:00:00.000Z`. Moving it would move every one of them, and the diff would be one
line — so U7 asserts it rather than trusting it.

### Why a half-transition is the failure worth a suite of its own

D1's guard answers *"is this tree consistent?"*. That is a question about one tree, and it passes on a tree
where the repository means two different things:

| state file | manifest | what deploys |
|---|---|---|
| `true` | no Sheets entry | a script that throws on `Sheets` — the flag promised a service that is not there |
| `false` | Sheets entry | the service appeared and nobody decided it should — the exact failure D1 exists to prevent |

Neither half is wrong *in isolation*, which is why only an assertion that reads **both halves at every point**
can see it. `assets/tests/advanced-sheets-service-enable-transition-s8-r4d-d2.test.js` walks every commit from
`3d71590` to HEAD **and the working tree**, and requires the two to agree at each. It is deliberately not blind
to the uncommitted tree: a half-transition is cheapest to catch before it is committed.

```
SERVICE_STATE_TRANSITION_SUITE = 24 passed · 0 failed · 13 mutants · 0 survived · vacuity clean
```

## 2. What the flip did not buy

Enabling a service for a benchmark is not adopting it. Section U asserts the negative space:

```
U1  no Product runtime .gs consumes Sheets.Spreadsheets      (77 files scanned)
U2  no Product runtime .gs calls batchGet
U3  the TEMP benchmark tool DOES — so U1 excludes something real rather than matching nothing
U4  60_ is still R43 · the release is still R43 · "R44" appears in no runtime file
U5  the scope set is identical to 3d71590
```

U3 matters more than it looks. An exclusion that matches nothing anywhere is indistinguishable from an
exclusion that works, and the way to tell them apart is to point the same pattern at a file that *should*
match.

## 3. Two gates were re-aimed, and one of them was wrong before this round

### B1 — the pin that named the folder, not the thing

D1's B1 asserted that nothing under `assets/specs/active/apps-script` had moved since `4a4a7f8`.
`appsscript.json` lives in that folder, so the authorised manifest transition would have failed it.

The repair is **not** to widen the pin. The expected set is now derived from the declared state:

```js
var EXPECTED_CHANGED = STATE.SHEETS_ENABLED ? [MANIFEST_REL] : [];
```

A manifest that moves while `SHEETS_ENABLED` is false still fails. A `.gs` that moves still fails in either
state, asserted separately as B1a so the manifest allowance cannot quietly cover a runtime edit. And B1b/B1c
bound the allowance to the service array itself — every key outside `dependencies` must be byte-identical to
`4a4a7f8`, and the pre-existing service list must survive in order.

`PRODUCT_RUNTIME_FILE_CHANGE_COUNT` counts runtime. The manifest is benchmark infrastructure (§26). Those are
different claims and they are now written as different assertions.

### A3a — the guard that lived in the branch where it could not fail

D1 put *"no Product runtime file reaches for the service that is not enabled"* inside the **PRE_ENABLE**
branch. In that branch nothing is enabled, so nothing can use it: the check could not fail. The branch where
it earns its keep is `POST_ENABLE`, and that is the branch that dropped it.

It is now unconditional (A3b), reads every runtime `.gs` rather than only `60_`, and carries A3c — a floor on
the file count, so it cannot pass over an empty list.

### G5 — a third interval pinned at one end

`product-strategy-activation-p1-b8d.test.js` G5 ran:

```js
cp.execFileSync('git', ['diff', '--name-only', 'a3889c2', '--', '…/appsscript.json'])
```

No second ref. The right-hand side is the **working tree**, so a sentence about what the P1-B8D activation
round did to the manifest had silently become a sentence about every round since. It was true for exactly as
long as nothing else ever touched the manifest, and this is the round that proves otherwise.

This is the same defect the file's own G6 comment describes repairing — three paragraphs below G5, which had
been left pinned. It is the fourth instance found in this phase.

G5 now ends where activation ended (`a3889c2 → dc3f6fd`). The permanent half moved to **G5b**, and it is the
stronger claim: a file-level diff cannot tell an added *service* from an added *scope*, but a scope-set
comparison can. G5a counts `"oauthScopes"` keys because `JSON.parse` keeps only the last duplicate — a widened
set injected above the real one would otherwise parse away to nothing.

`K14` was mutating the manifest and then checking only that its own mutation had happened — true of any
mutation whatsoever, and still true if G5 were deleted outright. It now runs the real detector, and two
mutants were added beside it: **K14a** appends a scope to the real list rather than duplicating the key, and
**K14b** is the inverse — the advanced-service addition alone must leave G5b **green**, because a gate that
fired on any manifest edit would be useless to this round.

```
ACTIVATION_SUITE = 362 passed · 0 failed · 20 mutants caught · 0 survived
```

### Four more, found by the sweep — and they are a different shape

One added line in `appsscript.json` turned six gates red. Three more than the two above, and the sweep is what
found them, because **a git-reading gate cannot fail before the commit**: it compares SHAs, not the working
tree, so the pre-commit run of the affected set was green.

The new three are not open intervals. They are the wrong **filter**:

| gate | what it read | repair |
|---|---|---|
| `s7-r4` `runtimeGsBetween` | the **folder**, not the extension — while every sentence built on it says "runtime files" | filter `.gs`, and assert the non-`.gs` half separately as H2f so nothing is dropped |
| `action-registry…-fb-4e-r2` 8 | a register: every changed file must be **declared with a reason** | take the entry |
| `product-strategy-visual…-r6` G6 | the same register shape | take the entry |

For a register, declaring the entry is the repair and filtering by extension is not. These lists exist
because a file moving in that folder without a stated reason is how an unrelated edit reaches Production —
and a manifest is the one file that can silently un-deploy a feature, which makes it the worst possible place
to start carving out exceptions by file type.

```
GATES_RE_AIMED = 6   D1 B1 · D1 A3a · activation G5 · release-ledger I1 · deploy-surface H2e · 2 registers
INTERVALS_PINNED_AT_ONE_END_FOUND_THIS_PHASE = 6
```

## 4. What this repository cannot prove

```
ADVANCED_SHEETS_SERVICE_LIVE = UNKNOWN — operator-reported, not repository-provable
```

Enabling the Google Sheets API in the attached Cloud project and adding the Sheets v4 advanced service to the
Production Apps Script project are actions in Google's console. No file here records them. A green suite means
the repository's *intent* is consistent and bounded; it does not mean the service resolves at runtime. T5
states that inside the suite so a reader cannot mistake green for live.

That is what §8's availability probe is for, and it runs before any measurement.

## 5. Operator runbook — §6 STOP

Unchanged from `S8_R4D_D1_B1_BENCHMARK_HARNESS.md` §5, restated here because this is the round that runs it.
No project id is guessed anywhere in this repository; the only project id in the codebase is
`config.sourceProjectId`, a runtime config value for the **BigQuery data source**, which is *not* the GCP
project attached to the Apps Script project.

1. **Identify the linked Cloud project.** Apps Script editor → ⚙ **Project Settings** → *Google Cloud Platform
   (GCP) Project*. Note the project number/id shown.
2. **Verify it is the correct Production project** — the one this Web App already runs under, the same one
   BigQuery v2 works through today. If it shows a **default/auto-created** project: **STOP and report back.**
   Enabling an API there may require attaching a standard project first, which is materially larger than this
   round authorises.
3. **Enable the Google Sheets API.** Cloud Console → that project → APIs & Services → Library → *Google Sheets
   API* → **Enable**. While there, read APIs & Services → *Google Sheets API* → **Quotas** and record the
   limits. This repository cannot prove them and none are invented here.
4. **Add the advanced service.** Apps Script editor → **Services** `+` → *Google Sheets API* → version **v4**,
   identifier **`Sheets`** → Add. Confirm the editor's manifest shows exactly one `sheets` entry alongside
   `bigquery`.
5. **Preserve everything else.** Do not touch *Execute as*, *Who has access*, or the OAuth scopes. B1 needs no
   new scope — `.../auth/spreadsheets` is already granted.
6. **Watch for an authorization prompt.** None is expected, because the scope set does not change.
7. **STOP if a new OAuth scope or an unexpected consent screen appears.** Report
   `UNEXPECTED_AUTHORIZATION_PROMPT = YES` and stop the round. That would mean the change is larger than
   analysed, and it must come back for re-analysis rather than be clicked through.

Then report back:

```
GOOGLE_SHEETS_API_ENABLED        = YES / NO
ADVANCED_SHEETS_SERVICE_V4_ENABLED = YES / NO
UNEXPECTED_AUTHORIZATION_PROMPT  = YES / NO
```

Do **not** paste the TEMP tool or run the benchmark yet. §8's availability probe comes first, and if it
returns `NO` the round stops there.

## 6. The benchmark freeze

`amazon_inventory_snapshot` is one of the thirteen benchmark tables. CONTROL and B1 must observe the **same
physical Production dataset**, so for the duration of this round:

```
DO NOT run the amazon_inventory_snapshot import
DO NOT modify amazon_inventory_snapshot source data
DO NOT modify 06_ / 07_ / 08_ / 09_ / 10_ importer files
DO NOT repair blank snapshot_date behaviour
DO NOT manually fill missing source Date values
```

The blank-`snapshot_date` observation is carried as a **separate post-D2 ingestion defect investigation**. It
is not a benchmark finding and must not be repaired inside a measurement window — a dataset that changes
between the two arms makes a semantic diff unattributable, which is exactly the evidence this round exists to
produce.

## 7. Rollback

The transition is reversible by deletion alone, and V1 computes that rather than asserting it: strip the
Sheets entry from the current manifest and the result is byte-identical to `3d71590`'s. There is no second
edit to undo.

```
NO_GO_CLEANUP
  1. delete the TEMP tool from the Apps Script project          (§22 — unconditional, GO or NO-GO)
  2. remove the Sheets advanced service from the Apps Script project   — OPERATOR APPROVAL REQUIRED
  3. disable the Google Sheets API                               — OPERATOR APPROVAL REQUIRED, no other
                                                                   Product dependency uses it
  4. revert the manifest entry AND flip SHEETS_ENABLED back to false — in ONE commit, because they are
                                                                   one state
  NO PRODUCT ROLLBACK. 60_ never changed. That is the point of this shape.
```

## 8. Evidence

```
TARGETED_TESTS   13 suites · 0 failures · 0 survived · 0 vacuous
                 b1-advanced-sheets-benchmark-harness-s8-r4d-d1      59 passed · 14 mutants
                 advanced-sheets-service-enable-transition-s8-r4d-d2 24 passed · 13 mutants
                 product-strategy-activation-p1-b8d                 362 passed · 20 mutants
                 fc-target-rule-release-stamp-r2b-a2-r5-f3          107 passed · 18 mutants
                 s7-r4-production-deploy-surface                     97 passed · 12 mutants
                 action-registry-and-router-completeness-fb-4e-r2   202 passed
                 product-strategy-visual-integration-p1-b8d-r6      116 passed · 14 mutants
                 + appsscript-manifest-oauth-scopes · s7-r1 · first-layer-redundant-header-read
                 + site-inventory-lazy-once-exposure · deployment-r10 · identity-boundary-baseline

FULL_SWEEP       612 suites · 607 OK · 0 timeouts · 19 FAIL lines · tree clean after
CANONICAL_FIVE   gap-job-done-notice (3) · order-planning-monthly-projection-consumer (1)
                 positive-residual-and-submit-readiness-census (6) · replen-header-toggle (7)
                 supply-planning-route-inventory (2)
CANONICAL_FAILURE_SET_CHANGED = NO   byte-identical to the R4C baseline, suite for suite and line for line
```

The first D2 sweep ran before the register repairs and showed **seven** failing suites; the two extra were
the registers above. The re-run after the repairs is the one recorded here.

## 9. State

```
PRE_HEAD   = 3d71590
POST_HEAD  = d6f2fb5
BENCHMARK_EXECUTED = NO
ADVANCED_SHEETS_SERVICE_LIVE = UNKNOWN — operator-reported
PRODUCT_RUNTIME_FILE_CHANGE_COUNT = 0
R44_RELEASE_CUT = NO
PRODUCTION_ROWS_WRITTEN = 0 · PRODUCTION_ROWS_DELETED = 0 · SCHEMA_CHANGES = 0
OPERATOR_ACTION_REQUIRED = §5 runbook above
NEXT = §7 operator completion input, then the §8 availability probe
```
