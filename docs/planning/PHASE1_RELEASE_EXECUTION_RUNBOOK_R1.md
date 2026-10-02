# PHASE-1 RELEASE EXECUTION RUNBOOK R1

`PRE_SHA 92f0ec3` · branch `feature/product-strategy-board-p0` · **nothing in this document has been executed.**

This is an operator procedure. Every command is run by the user. The round that produced it performed no push,
merge, deploy, Apps Script copy, Apps Script delete, deployment-version creation, frontend publication,
production write, and no controlled-write smoke.

```
PRE_SHA  = 92f0ec3                   POST_SHA = <this round>
WORKTREE_CLEAN_AT_START = YES        WORKTREE_CLEAN_AT_END = YES
S5_SEAL_HELD = YES   S6_FINAL_SEAL = YES   S7_FINAL_SEAL = YES
PHASE1_CUMULATIVE_RELEASE_RECONCILIATION_READY = YES    OPEN_RELEASE_BLOCKERS = none
origin/main = 1a0ca13   origin/feature = 2b82288   local feature = 92f0ec3   86 ahead / 1 behind
```

---

## 0. Five findings that change the procedure the reconciliation proposed

Everything below was re-derived from the tree at `92f0ec3`, not carried over from the previous round's prose.

### 0.1 The frontend is ALREADY PUBLISHED. The reconciliation's baseline was wrong.

The reconciliation treated `74aca0b` as the deployed baseline for **both** layers. That is correct for Apps
Script, which only ever changes when a human pastes into it. It is wrong for the frontend.

`origin/main` is `1a0ca13`, and `74aca0b` is its ancestor. GitHub Pages deploys from the configured branch
(`DEPLOYMENT_RELEASE_GOVERNANCE.md` §8) and this repository's release command is `git push origin main`. So
`origin/main` is what browsers are being served, and it already contains all but **19** of the files the
reconciliation listed as the frontend deploy set.

Measured proof — the token carried by the live `index.html`:

```
$ git show origin/main:index.html | grep -o '?v=[a-z0-9-]*' | sort | uniq -c | sort -rn | head -3
     51 ?v=s4r7-finalseal-20260927      <- THIS is what browsers hold
     31 ?v=donenotice-20260811
      1 ?v=whmoreopts-20260820
```

The live application token is **`s4r7-finalseal-20260927`**, not `s5r4-actionreason-20260928`. The latter was
minted on the unpushed feature branch and never served — so the reconciliation's conclusion ("rotate once, it
has never been served") was right, but about a different token and against a different baseline than it
measured.

**Consequence:** the frontend delta is 19 files, not 53. It is listed in §9.

### 0.2 Pushing `main` IS the frontend deploy. Spec §8 and §16 collide.

There is no `.github/` directory in this repository — no Actions workflow and no manual publish step. Pages
serves the branch. **The moment `origin/main` moves, the new frontend is live.**

The task spec asks for two things that then contradict each other:

- §8 — `origin/main == TESTED_RELEASE_SHA` **before** Production deployment.
- §16/§19 — publish the frontend only **after** the backend health gate passes.

Do both literally and you fast-forward `main`, Pages serves the new frontend immediately, and it talks to an
**R14 backend** for the whole manual Apps Script paste session — eight stages, by hand. Throughout that window
`pricing.update`, `pricing.fxReconcile`, `carrierLeadTime.upsert` and `carrierLeadTime.duplicateCensus` are
called by a frontend whose backend has never heard of them. That is the identical half-sync hazard the entire
reconciliation was written to prevent, displaced one layer upward.

**Resolution — GATE 3 splits in two.** Remote traceability and frontend publication are different acts and
deserve different gates:

```
GATE 3A   push the FEATURE branch.   origin/feature == MERGED_SHA.
          The remote traceability anchor. The backend is deployed from THIS pushed SHA.
          origin/main does NOT move. Pages keeps serving 1a0ca13. Nothing is published.

             ... backend copy -> delete -> deployment version -> BACKEND HEALTH GATE ...

GATE 3B   fast-forward MAIN to the same SHA.   origin/main == TESTED_RELEASE_SHA.
          THIS IS THE FRONTEND PUBLICATION, and it happens only after the health gate passes.
```

The spec's end state is preserved exactly — `origin/main == TESTED_RELEASE_SHA`, deployed from no local-only
and no unpushed SHA — while publication becomes something the operator does *after* the backend is coherent
rather than a side effect of a step taken before it. `REMOTE_TESTED_SHA_REQUIRED = YES` is satisfied from
GATE 3A onward, because `MERGED_SHA` is on `origin` from that moment and both branches carry the same commit.

### 0.3 The pricing refusal token is `HEADER_MISSING`, not `MISSING_REQUIRED_HEADER`.

Spec §4, and the reconciliation before it, both name `MISSING_REQUIRED_HEADER` as what `73_` returns when the
four columns are absent. Read in order, `73_` never reaches that line:

```js
// 73_api_v1_pricing_write.gs:585-588
priceSheet = prodRequireSheet_(ss, 'pricing_list', PRICING_LIST_HEADERS_);   // <- throws HEADER_MISSING here
prodRequireColumns_(priceSheet, PRICING_MANUAL_FLAG_COLUMNS_);               //    never reached
logSheet  = prodRequireSheet_(ss, 'pricing_change_log', PRICING_CHANGE_LOG_HEADERS_);
prodRequireColumns_(logSheet, ['change_type']);
```

`PRICING_LIST_HEADERS_` already lists the three flags (`73_:99`) and `PRICING_CHANGE_LOG_HEADERS_` already
lists `change_type` (`73_:167`). `prodRequireSheet_` validates the full expected header through
`classifySchemaMismatch`, and a missing expected header is `HEADER_MISSING -> invalid` — stated at
`16_shipping_allocation_handlers.gs:53`, implemented at `29_production_safety_adapter.gs:53-65`. The catch
block returns `e.safetyToken`, so the envelope an operator reads carries **`HEADER_MISSING`**.

An operator grepping smoke output for `MISSING_REQUIRED_HEADER`, finding nothing, would conclude the gate
passed. **Match on `HEADER_MISSING`.** The refusal is zero-mutation either way.

### 0.4 Missing pricing headers do NOT break the pricing READ. The blast radius is two actions.

`72_`, the read owner, requires exactly one column on `pricing_list`:

```js
// 72_api_v1_product_pricing_workspace.gs:209
{ name: 'pricing_list', gate: 'pricing', requiredCols: ['marketplace_sku_id'] },
```

and it resolves each band by reading the flag by name (`ppwPriceBands_`), so an absent flag column reads
`undefined` and the band resolves as not-overridden. The pricing workspace loads.

The measured blast radius of the four missing columns is therefore **`pricing.update` and
`pricing.fxReconcile`**, both of which fail closed having written nothing.

**This runbook implements §4's STOP as written** — a missing header halts the release before backend
deployment. The measurement is recorded so the operator knows what that stop buys: it is a policy choice to
refuse a release whose new write surface would be dark, not a technical necessity. Shipping the read surface
and provisioning the columns afterwards is a defensible alternative — but it is a decision to state before
GATE 0C, not one to discover during smoke.

### 0.5 A fifth live gate nobody has listed: `product_strategy_enabled`

The whole pricing surface — read and write — is gated on `productStrategyEnabled_()` before the spreadsheet is
opened (`72_:246-255`, *"THE FLAG, BEFORE THE DOOR"*). Its owner is `00_config.gs`, which is **unchanged since
`74aca0b` and therefore NOT in the copy set**. The repository value is `true` and was already `true` at the
deployed baseline — but the live project is a hand-paste, and the live value is whatever was last pasted.

`system.health` reports it as `product_strategy_enabled` (`63_:1017`). If it answers `false`, every pricing
action returns `FEATURE_DISABLED` before touching a sheet, GATE 0C becomes moot, and deploying `72_`/`73_`
changes nothing an operator can see. **Capture it at GATE 0A.**

### 0.6 The last production-accepted release is R15, not R14 — and it does not matter

The reconciliation reported R14 as the only live evidence. The release ledger's own comment chain in
`fc-target-rule-release-stamp-r2b-a2-r5-f3.test.js` carries one entry further:

```
R15 base 74aca0b   "the commit the R14 release was accepted at in production
                    (58_ and 63_ synced, 131/131 backend gate, Pages converged on the same sha)"

R16 base a91cb8e   "the commit the R15 release was accepted at in production
                    (14_, 20_ and 63_ synced by the user, live health reported R15 uniform)"

R18 base 2836d2a   "NOTE THE WORDING CHANGE ... this suite has NO evidence that R17 was accepted
                    in production, and does not assert it."
```

So **R15 at `a91cb8e` is the last release with positive production-acceptance evidence**, and the evidence
chain stops cleanly there — the ledger says so itself, in the round that stopped claiming it. The
reconciliation understated the baseline by one release.

**It changes nothing.** Derived from either candidate baseline, the Apps Script diff is the same 25 paths:

```bash
AS=assets/specs/active/apps-script/
git diff --name-only 74aca0b HEAD -- $AS | wc -l     # 25
git diff --name-only a91cb8e HEAD -- $AS | wc -l     # 25
comm -23 <(git diff --name-only 74aca0b HEAD -- $AS | sort) \
         <(git diff --name-only a91cb8e HEAD -- $AS | sort)    # EMPTY -- the sets are identical
```

R15 synced `14_`, `20_` and `63_`, all three of which this release changes again, so none of them drops out.
The 18-file copy set and the 7-file delete candidate set are therefore **invariant across R14 and R15**, and
GATE 0A's answer is load-bearing only if the live build turns out to be R16 or later.

---

# GATE 0A RESULT — EXECUTED 2026-10-03 AGAINST LIVE PRODUCTION

`system.health` was read from the live `/exec` deployment. **Production is at R25**, not R14 and not R15.
Both the reconciliation’s finding and §0.6’s refinement of it were stale.

```
LIVE_BUILD_ID                   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R25
LIVE_RELEASE_ID                 F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R25
LIVE_ACTION_CONTRACT_VERSION    17            (HEAD declares 18 — this release moves it)
LIVE_GENERATED_BUNDLE_HASH      830563effc604ba55a70424d8f7b95c627ae0bc4ce84aa981833fb75ac2ed64f
LIVE_MIXED_DEPLOYMENT           false
LIVE_MISSING_REQUIRED_MODULES   []            LIVE_STALE_REQUIRED_MODULES   []
LIVE_ABSENT_OPTIONAL_MODULES    ["TEMP_migrate_shipping_allocation_ai_lifecycle.gs"]
LIVE_PRODUCT_STRATEGY_ENABLED   true          <- the pricing surface is LIVE. §3 is NOT moot.
required_action_list_version    14   required_action_count 46   missing_actions []
verdict                         "UNIFORM — every probed owner file declares the build its manifest expects"
```

## The live tree identified by content, not by its release id

A release id is a label and `51575e8` records that **R25 once named two different trees**. So the baseline
was settled on content instead:

```
live 90_ KM_BUNDLE_CONTENT_HASH_   830563ef...  ==  7a29415’s 90_        ==  7a29415’s 63_ expectation
live 63_ / 01_ / 73_ stamps        R25          ==  7a29415
live 58_ R14 · 14_ R18 · 20_ R20 · 04_ R24 · 72_ R24 · 59_ R21   all == 7a29415

PRODUCTION == 7a29415   "fix(pricing): a write that committed, reported as Nothing was written"
git merge-base --is-ancestor 7a29415 HEAD  ->  YES
```

Because `7a29415` is an ancestor of HEAD, every live runtime byte is one this release also carries.
**GATE_0A_PASS_CONDITION is satisfied on content, not merely on a release id**, and no live bytes are
unaccounted for. STOP conditions (a) (b) (c) (d) are all clear.

## What this changes

```
TRUE DELTA  git diff 7a29415 HEAD -- assets/specs/active/apps-script/   =  15 modified + 7 deleted

PROVEN NO-OPS against live (byte-identical, already deployed at R24/R21):
    04_marketplace_forecast_import.gs      live R24 == HEAD R24
    59_api_v1_sku_details_workspace.gs     live R21 == HEAD R21
    72_api_v1_product_pricing_workspace.gs live R24 == HEAD R24
```

These are the exact three §1’s continuation clause named in advance. The approved 18-file set therefore
remains **valid and safe** — it is a superset whose three extra members are provably byte-identical. Copying
15 or 18 are both correct; 15 is the minimum, and every unnecessary paste is one more chance to paste wrong.

> **⚠ `73_api_v1_pricing_write.gs` ALREADY EXISTS IN PRODUCTION** at R25. §11 step 1 says to create it as a
> new script file — that instruction was written against the R14 baseline and is now **wrong**. Creating it
> again would put two copies of the one pricing write owner into the project. **OVERWRITE it, as with every
> other file in the set.** No file in the corrected set is an addition; all 15 are overwrites.

`04_`, `59_` and `72_` are no longer “omitted by the ledger list” defects: the ledger’s `BASE = e583057`
tracked the R25 line all along, so on this point the ledger was right and the reconciliation was wrong.

## Still outstanding at CHECKPOINT A

```
A2  live TEMP membership   6 of 7 UNRESOLVED. system.health reports only the lifecycle migration
                           (absent_optional_modules); the other six carry no manifest row, so the
                           health endpoint cannot speak to them. The project FILE LIST must be read.
A3  pricing headers        UNRESOLVED and REQUIRED — product_strategy_enabled is true, so §3 is live.
                           Reading row 1 of a Spreadsheet needs authenticated access to the bound DB.

LIVE_PRECHECK_PASS = NO   (incomplete, not failed — A1 passed outright)
```

---

# PART A — PREFLIGHT

## 1. GATE 0A — LIVE BUILD IDENTITY

Read the canonical health endpoint on the **current** Production deployment, before touching Git or runtime.
Infer none of it from the repository.

```
action = system.health      (routed on BOTH verbs; GET is sufficient and writes nothing)
```

Record, using the exact field names `63_` emits:

```
LIVE_BUILD_ID                   = ______    ( build_id )
LIVE_RELEASE_ID                 = ______    ( deployment_release — equal to build_id by construction )
LIVE_ACTION_CONTRACT_VERSION    = ______    ( deployed_action_contract_version )
LIVE_GENERATED_BUNDLE_HASH      = ______    ( modules[] row for 90_, symbol KM_BUNDLE_CONTENT_HASH_ )
LIVE_MIXED_DEPLOYMENT           = ______    ( mixed_deployment )
LIVE_MISSING_MODULES            = ______    ( absent_modules )
LIVE_STALE_MODULES              = ______    ( stale_modules )
LIVE_ABSENT_OPTIONAL_MODULES    = ______    ( absent_optional_modules )
LIVE_PRODUCT_STRATEGY_ENABLED   = ______    ( product_strategy_enabled )           <- §0.5
LIVE_ROUTER_BUILD               = ______    ( router_build )
LIVE_SYSTEM_HEALTH_MODULE_BUILD = ______    ( system_health_module_build )
LIVE_WORKSPACE_MODULE_BUILD     = ______    ( workspace_module_build )
```

### GATE_0A_PASS_CONDITION

```
LIVE_BUILD_ID is R14 or R15 (for which the copy set is provably identical — §0.6), OR any release at
or below R40 whose runtime bytes are a SUBSET of this release —
every file the live deployment carries is one this release also carries, at an equal or older stamp.
The 18-file copy set then remains a safe SUPERSET: copying a file Production already holds is a no-op;
omitting one is a half-sync.
```

### GATE_0A_STOP_CONDITION

```
STOP, and do not proceed to GATE 1, if ANY of:

 (a) LIVE_BUILD_ID is NEWER than R40, or is a release id this repository has no record of.
     Unknown runtime bytes are live, and a superset copy would silently overwrite them.

 (b) LIVE_MIXED_DEPLOYMENT = true BEFORE this release begins.
     Production is already half-synced. Reconcile that as its own bounded task first; a new release laid
     over an existing partial sync cannot be attributed if it fails.

 (c) LIVE_STALE_MODULES or LIVE_MISSING_MODULES names a file that is NOT in the 18-file copy set.
     This release carries no repair for it, so deploying would leave a known fault live while changing
     the release id that would otherwise explain it.

 (d) LIVE_GENERATED_BUNDLE_HASH is neither the expected 46ae3945... nor a hash this repository can
     reproduce from a known commit. An unidentifiable bundle is unidentifiable code.
```

If the live build is **newer than R14 but at or below R40** — for instance if the ledger's R24 claim turns out
to be true — do **not** abort. Three files (`04_`, `59_`, `72_`) simply become byte-identical no-ops instead of
corrections. Record which, and continue.

---

## 2. GATE 0B — LIVE TEMP FILE MEMBERSHIP

### The derivation, not the memory

A delete candidate is a file that **was in the production runtime directory at the live baseline and is not
there now**. Re-derive it; do not retype it:

```bash
git diff --name-status 74aca0b HEAD -- assets/specs/active/apps-script/ | grep '^D'
```

At `92f0ec3` this returns exactly seven, and the same diff filtered to `AM` returns the other eighteen.
18 + 7 = 25 adjudicated paths, which is the entire diff — nothing in the range is unclassified.

### DO NOT DELETE A TEMP FILE MERELY BECAUSE IT EXISTS IN THE REPOSITORY

The repository currently holds **39** `TEMP_*.gs` files under `assets/tools/`:

```
assets/tools/apps-script-migrations/     4
assets/tools/apps-script-diagnostics/   34
assets/tools/apps-script-seeds/          1
```

**Thirty-two of them are candidates for nothing.** They were repository tooling before S7-R4 and this release
never claimed anything about their live membership. Only the seven below were relocated *out of the production
deploy surface* by S7-R4, and only those seven may be considered here.

### The table the operator fills

| # | file | LIVE_PRESENT? | if PRESENT | if ABSENT |
|---|---|---|---|---|
| 1 | `TEMP_demo_shipping_shipment_map_seed_v2.gs` | ☐ | DELETE — it writes **and clears** six business tables | no action |
| 2 | `TEMP_migrate_request_order_draft_v2.gs` | ☐ | DELETE — one-time migration, already run | no action |
| 3 | `TEMP_migrate_shipping_allocation_ai_lifecycle.gs` | ☐ | DELETE — one-time migration (carries an `optional: true` manifest row) | no action |
| 4 | `TEMP_document_diagnostics.gs` | ☐ | DELETE — read-only diagnostic | no action |
| 5 | `TEMP_draft_migration_diagnostic.gs` | ☐ | DELETE — read-only diagnostic | no action |
| 6 | `TEMP_order_planning_draft_readback_diagnose.gs` | ☐ | DELETE — read-only diagnostic | no action |
| 7 | `TEMP_request_order_send_diagnostics.gs` | ☐ | DELETE — read-only diagnostic | no action |

```
UNEXPLAINED_DELETE_COUNT_ALLOWED = 0
VERIFIED_DELETE_SET  ⊆  { the seven above }       <- if the inspection finds an eighth, STOP
LIVE_PROJECT_MEMBERSHIP_VERIFICATION_REQUIRED = YES
```

**An expectation, not permission to skip.** APPS-SCRIPT-RUNTIME-SLIM-R1's live `typeof` probe found all seven
absent, with 31 corroborating symbol probes, and the live manifest independently reported the lifecycle
migration under `absent_optional_modules`. But a probe can only ask about names it already knows, and a file
pasted in by hand would never have appeared in it. **Open the project file list and read it.**

Cross-check: if `LIVE_ABSENT_OPTIONAL_MODULES` from GATE 0A does **not** contain
`TEMP_migrate_shipping_allocation_ai_lifecycle.gs`, that file is present. Treat the two observations as checks
on each other; if they disagree, the file list wins and the disagreement is itself a finding to record.

---

## 3. GATE 0C — LIVE PRICING HEADER VERIFICATION  (REQUIRED PRE-DEPLOY GATE)

The repository cannot prove what row 1 of the live sheets contains. Read it.

```
PRICING_HEADER_PREFLIGHT_REQUIRED = YES
PRICING_HEADER_MISSING_BEHAVIOR   = STOP
```

Open the bound Production spreadsheet and read **row 1** of each sheet:

```
TABLE = pricing_list
  ☐ regular_price_is_manual
  ☐ minimum_price_is_manual
  ☐ msrp_is_manual

TABLE = pricing_change_log
  ☐ change_type

PRICING_REQUIRED_HEADER_SET =
    pricing_list.regular_price_is_manual
    pricing_list.minimum_price_is_manual
    pricing_list.msrp_is_manual
    pricing_change_log.change_type
```

### CASE A — all four exist

```
LIVE_PRICING_HEADER_GATE  = PASS
DB_SCHEMA_CHANGE_REQUIRED = NO
-> continue to GATE 1
```

### CASE B — one or more missing

```
STOP THE RELEASE EXECUTION RUNBOOK.
DB_SCHEMA_CHANGE_REQUIRED = YES

- Open a separate, bounded schema-amendment / authorization task.
- Do NOT silently add the headers. 29_ is validate-only by design: prodRequireColumns_ "NEVER appends a
  column", and prodMigrateCreateSheet_ demands an explicit migration-authorization DTO and is reachable
  from no router action. Adding a column by hand in the sheet UI is a Production schema write, and it is
  the user's decision taken knowingly — not a step buried inside a deploy checklist.
- Do NOT deploy 73_ as if the write surface were production-ready.
```

This supersedes the reconciliation's treatment of the four columns as a generic
`POST_DEPLOY_MANUAL_DATA_ACTION`. See §0.3 for the token to match on and §0.4 for what is, and is not, broken.

**Record `LIVE_PRODUCT_STRATEGY_ENABLED` beside this result.** If it is `false`, both cases are academic until
the flag is turned on, and turning it on is a separate authorized change to `00_config.gs` — a file this
release does not otherwise touch.
---

# PART B — GIT INTEGRATION

## 4. GATE 1 — FETCH AND MAIN RECONCILIATION

**Strategy: merge, not rebase.** The feature branch carries 86 audited local commits, and every SHA cited in
this phase's reports — `74aca0b`, `e583057`, `b783076`, `92f0ec3` — is reachable from it. A rebase replays all
86 and makes every one of those citations unreachable, destroying the audit trail the reconciliation exists to
provide. The only commit on `main` and not on the feature branch is `1a0ca13`, a single added PNG.

Proposed commands. **Do not execute them in this round.**

```bash
cd "C:/Users/viczh/Desktop/KM/品牌資源/Vibe Coding/Operation System/wt-product-strategy-board-p0"

# 1 — confirm where you are
git rev-parse --abbrev-ref HEAD            # expect: feature/product-strategy-board-p0
git status --porcelain                     # expect: EMPTY. If not, STOP.
git log -1 --format='%H %s'                # expect: 92f0ec3... or a clean descendant

# 2 — refresh remote state (read-only; this writes nothing to origin)
git fetch origin

# 3 — confirm the graph is what this runbook assumes
git rev-parse --short origin/main                               # expect 1a0ca13
git rev-parse --short origin/feature/product-strategy-board-p0  # expect 2b82288
git rev-list --left-right --count origin/main...HEAD            # expect "1<TAB>86"
#    If origin/main has moved past 1a0ca13, STOP and re-run the reconciliation's §2 against the new tip.

# 4 — prove the branding asset is identical before merging (see §5)
git rev-parse origin/main:assets/img/logo_only_red.png
git rev-parse HEAD:assets/img/logo_only_red.png
#    The two blob ids MUST be equal. If they differ, STOP.

# 5 — the merge itself
git merge --no-ff origin/main -m "merge: reconcile origin/main branding commit into the Phase-1 release tree"

# 6 — capture the tested SHA
git rev-parse HEAD
```

Forbidden in this gate: `git reset --hard`, `git push --force`, `git push --force-with-lease`,
`git rebase`, `git checkout -- .`, and any `git stash` without `push -u -m "<tag>"`.

```
MERGE_CONFLICT_STOP_RULE =
  If git reports ANY conflict, STOP. Do not choose a side. Expected semantic conflicts = 0 and the
  expected path overlap is exactly one file, assets/img/logo_only_red.png, whose bytes are identical on
  both sides. A conflict therefore means the graph is not what this runbook measured, which invalidates
  the measurement rather than the merge. Abort with `git merge --abort` and open a bounded review.
```

## 5. BRANDING MERGE EXPECTATION

```
MAIN_ONLY_COMMIT_SET            { 1a0ca13 }  — "1001_Logo_red_update_submit", 1 file, +0/-0 lines, Bin 0 -> 4938
PATH_OVERLAP                    assets/img/logo_only_red.png
SEMANTIC_CONFLICT_COUNT         0
```

Verified at `92f0ec3`: the blob is `6f547ec4...`, sha256 `187c6394...`, byte-identical on both sides, and
`git merge-tree` produced tree `10284bb3...` with zero conflicts. Step 4 above re-proves it at execution time
rather than trusting this paragraph.

The same file is the favicon target (`index.html:21`), so it is both a branding asset and a cache-token
participant. It carries the new application token after rotation.

## 6. GATE 2 — POST-MERGE TESTED SHA

```
MERGED_SHA = ______        <- captured from step 6 above
```

Run the full verification set **on the merged tree**, serially. There is no `package.json` and no test runner
in this repository; the sweep is a serial loop over the 601 suites, and it must be serial because several
suites mutate source files in place and restore them:

```bash
# serial sweep — DO NOT parallelise, DO NOT interrupt once started
for f in assets/tests/*.test.js; do
  node "$f" > "/tmp/sweep/$(basename "$f").out" 2>&1
  echo "$? $(basename "$f")"
done
```

> **Never kill the sweep mid-run.** It rewrites and restores real source files; a killed run leaves a mutant
> in the tree, and editing files during a run silently reverts the edit.

The set this gate must cover, all of which are inside that loop:

```
bundle reproducibility · release ledger · system-health manifest consistency
action registry + router completeness · boot topology · asset / cache audits
S5 final suites · S6 final suites · S7 final suites
FC cumulative repair suites · Factory Inventory repair suites
production deploy-surface census · full sequential sweep
```

### GATE 2 pass condition

```
SUITES PASSED                   596 / 601
CANONICAL_FAILURE_SET           gap-job-done-notice-f1-small-r1
                                order-planning-monthly-projection-consumer-f1-4b-fm3d
                                positive-residual-and-submit-readiness-census-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r5-r1
                                replen-header-toggle
                                supply-planning-route-inventory
CANONICAL_FAILURE_SET_CHANGED = NO        <- required. THE SUITE SET ABOVE IS THE GATE.
WORKTREE_DIRTY                = NO        <- required; `git status --porcelain` empty after the sweep
SUITES THAT LEFT THE TREE DIRTY = 0       <- required
```

### The FAIL-line count and digest are properties of the SCRIPT, not only of the tree

Do not gate on them without reproducing the instrument. Measured at `368d49f`, with a sweep that captures
FAIL lines from **every** suite regardless of exit code:

```
CANONICAL FAIL LINES  20      CANONICAL_DIGEST  e53d5afe46a511a1838181903f92058e9582575b3edf7cbf5616bd6b0438dda9
```

The reconciliation round recorded 19 lines and digest `596eeb64...`. The difference is one line, and it is
fully accounted for:

```
s2-r4b-shipping-history-and-fc-warm-race :: FAIL A3
    "no shipping_history / shipment_history table is declared in any spec or handler"
    -> the suite EXITS 0. It has never been in the failing-suite set, and it is S7 carried debt #1,
       recorded three times in S7_SUPPORTING_EXECUTION_MAINLINE_CONTRACT.md and again in §23 below.
```

A sweep that keys only on exit codes cannot see it — which is the standing warning in this repository: a
suite whose promise never settles exits 0 while a FAIL line is on the screen. Capturing it is the stricter
and more honest measurement, so the count went **up by one without anything in the tree changing**.

**Therefore:** gate on the five-suite set and on a clean tree. Treat the line count and digest as
comparable only against a run of the *same* sweep script, and record which script produced them.

If `CANONICAL_FAILURE_SET_CHANGED = YES`, or the tree is dirty, **STOP**. A suite that left the tree dirty
left a mutant behind; restore with `git checkout -- <path>` only after identifying which suite did it.

```
TESTED_RELEASE_SHA_RULE =
  TESTED_RELEASE_SHA := MERGED_SHA, and only once GATE 2 has passed on that exact SHA.
  It is the ONLY SHA eligible for remote push, backend deployment and frontend publication.
  If any file changes afterwards — including a bundle rebuild — the SHA is void and GATE 2 re-runs.
```

## 7. GATE 3A — REMOTE TRACEABILITY  (push the FEATURE branch only)

```bash
git push origin feature/product-strategy-board-p0
git rev-parse origin/feature/product-strategy-board-p0     # MUST equal TESTED_RELEASE_SHA
```

```
REMOTE_TRACEABILITY_RULE =
  Production is never deployed from a local-only SHA, an unpushed SHA, or any SHA other than the one the
  sweep passed on. After GATE 3A the tested bytes exist on origin and are immutable, which is the property
  §8 requires. origin/main deliberately does NOT move here — see §0.2. Moving it now would publish the
  frontend against an R14 backend.
```

**`main` is NOT touched in this gate.** It moves at GATE 3B (§14), after the backend health gate.

---

# PART C — BACKEND DEPLOYMENT

## 8. PRE-RELEASE BACKUP AND ROLLBACK ARTIFACT

```
BACKEND_ROLLBACK_ARTIFACT_REQUIRED = YES
```

Governance §3 step 15 is explicit: *"On failure: restore the prior Apps Script deployment version; do not
manually modify live DB; open a separate hotfix."* Git alone is not an Apps Script rollback, because the live
project is a hand-maintained copy that no git operation reaches.

Capture **before** changing anything in the Apps Script editor:

```
PRE_RELEASE_APPS_SCRIPT_DEPLOYMENT_VERSION = ______   ( Deploy -> Manage deployments -> the active version number )
PRE_RELEASE_BUILD_ID                       = ______   ( = LIVE_BUILD_ID from GATE 0A )
PRE_RELEASE_MAIN_SHA                       = 1a0ca13  ( the currently published frontend )
PRE_RELEASE_FRONTEND_SHA                   = 1a0ca13  ( same; Pages serves origin/main )
PRE_RELEASE_PROJECT_FILE_LIST              = ______   ( the full .gs file list, for the GATE 0B cross-check )
```

**Source-level backup.** Deployment-version rollback restores what `/exec` *serves*; it does not restore the
editor's source. Before overwriting, copy the live contents of the 18 target files out of the editor into a
dated local folder outside the repository. Without it, a mid-release abort leaves the editor holding a
half-pasted tree with no way back to the bytes that were there.

```
APPS_SCRIPT_SOURCE_BACKUP_LOCATION = ______    ( outside the repo; never inside C:/km-lb )
```

## 9. FINAL_APPS_SCRIPT_COPY_SET — 18 files

Re-derived at `92f0ec3`, not copied from the prompt:

```bash
git diff --name-status 74aca0b HEAD -- assets/specs/active/apps-script/ | grep -E '^[AM]'
```

```
FINAL_APPS_SCRIPT_COPY_COUNT = 18          ( 17 modified + 1 added )
```

If the count is not 18, **STOP** and explain the difference before copying anything.

| stage | file | release | why it is in the set |
|---|---|---|---|
| 1 | `05_overseas_inventory_handlers.gs` | R35 | overseas reserve / release / dispatch-consume + GROSS import |
| 2 | `04_marketplace_forecast_import.gs` | B1-PERF | FC regular batch writer hardening |
| 2 | `11_shipping_plan_handlers.gs` | R34 | shipping-plan status owner |
| 2 | `14_fc_write_handlers.gs` | R13 | FC target-rule / write consistency |
| 2 | `20_campaign_write_handlers.gs` | R32 | campaign + campaign_sku_line writer |
| 2 | `21_factory_inventory_handlers.gs` | R35 | factory stock + adjustment truth |
| 2 | `47_api_v1_recommendation_generation.gs` | carried | recommendation generation |
| 2 | `58_api_v1_fc_summary_workspace.gs` | R14+ | FC summary slices |
| 2 | `59_api_v1_sku_details_workspace.gs` | R15–R24 | SKU details workspace — **omitted by the ledger list** |
| 3 | `12_shipment_handlers.gs` | R34 | shipment creation + reservation acquire |
| 3 | `22_shipment_dispatch_handlers.gs` | R37 | DECLARED_SOURCE_ONLY dispatch |
| 4 | `72_api_v1_product_pricing_workspace.gs` | R15–R24 | pricing read workspace — **omitted by the ledger list** |
| 4 | `73_api_v1_pricing_write.gs` | R21 | **NEW FILE** — the one pricing write owner |
| 5 | `17_carrier_handlers.gs` | stampless | carrier lead-time write owner |
| 5 | `57_api_v1_shipment_workspace.gs` | stampless | carriers master on the shipment read |
| 6 | `01_router.gs` | R39 | dispatches `carrierLeadTime.*` and `pricing.*` |
| 7 | `90_generated_supply_planning_bundle.gs` | hash `46ae3945…` | generated shared core, 60 modules |
| 8 | `63_api_v1_system_health.gs` | R40 | the manifest and the release identity |

```
BACKEND_COPY_STAGE_COUNT = 8

BACKEND_COPY_STAGES =
  STAGE 1   05_
  STAGE 2   04_  11_  14_  20_  21_  47_  58_  59_
  STAGE 3   12_  22_
  STAGE 4   72_  73_
  STAGE 5   17_  57_
  STAGE 6   01_
  STAGE 7   90_
  STAGE 8   63_                                   <- LAST
```

**No file outside this set may be copied.** In particular `00_config.gs` is unchanged since the deployed
baseline and is NOT in the set; pasting it would be an unreviewed change to two live feature flags (§0.5).

## 10. HALF-SYNC DEPENDENCY RULES — the DAG, not alphabetical order

```
  05_ ──► 12_           overseas reservation functions (ovs*Tx_) resolve from 05_
  05_ ──► 22_           dispatch consume resolves from 05_
  17_ ◄──► 01_          carrierLeadTime.upsert / .duplicateCensus — handler and route, one version
  73_ ◄──► 01_          pricing.update / pricing.fxReconcile — handler and route, one version
  72_ ──► 73_           the pricing read owner before the writer that shares its field shapes
  90_ ◄──► 63_          the bundle is identified by the content hash 63_ declares
  57_ ──► (frontend)    carriers master before the carrier-name consumers
  58_ ──► (frontend)    FC slices before the FC projection consumers
  63_ ──►  LAST         the manifest reports on every other file

BACKEND_DEPLOY_ORDER_CONSTRAINT_COUNT = 9        conflicts = 0
```

**FC chain specifically.** `14_` (FC write consistency) and `20_` (campaign + campaign_sku_line writer) are
both stage 2 and both precede `58_`'s consumers; `58_` publishes the slices the FC Summary page reads; `63_`
declares the expected stamp for all three. An old `20_` beside this release refuses the new-SKU save, which is
why the three travel together and why `63_` is last — it is the only file that can report the other two are
wrong.

**Router asymmetry worth knowing.** `pricing.write.status` is in the GET read-table (`01_:115`), while
`pricing.update` and `pricing.fxReconcile` are POST-only (`01_:1082`, `01_:1091`). A project that has `73_`
but an old `01_` has the FILE and not the ROUTE — the exact partial sync a release id exists to make visible.

## 11. BACKEND COPY METHOD

The current workflow is **manual copy/paste in the Apps Script editor**. Do not substitute `clasp`, any API
client, or any automation: `APPS_SCRIPT_SYNC_OWNER = USER` and `clasp push` / `clasp deploy` are prohibited by
`CLAUDE.md` RG-1.

For each file, in stage order:

1. Open the target file in the Apps Script editor. **Every file in the corrected set is an OVERWRITE,
   including `73_api_v1_pricing_write.gs`, which GATE 0A proved is already live at R25.** Do not create
   a second copy of it.
2. Select all in the editor, delete, and paste the full contents of the repository file at
   `TESTED_RELEASE_SHA`.
3. Save. Confirm the editor reports no parse error.
4. Tick the file off the stage list before starting the next.

### SOURCE EDITOR STATE vs DEPLOYED VERSION STATE — why staged copying is safe

These are two different things, and the distinction is what makes an eight-stage manual paste acceptable:

```
SOURCE EDITOR STATE     what the project's files contain right now. Changing it is immediate but PRIVATE.
DEPLOYED VERSION STATE  the immutable snapshot the stable /exec URL serves. It changes ONLY when a new
                        deployment version is created.
```

While the stages are being pasted, `/exec` keeps serving the **previous** deployment version. Users see the
old backend, consistently, for the whole session. The partially-copied tree is never reachable. Only §13 —
creating one new deployment version after every stage is saved and every verified delete is done — exposes the
new code, and it exposes all of it at once.

This is why the stage order matters for *correctness of the final state* rather than for safety during the
paste: it guarantees that at the moment the version is cut, no file in the project refers to a symbol that
another file has not yet received.

## 12. DELETE SET EXECUTION

```
VERIFIED_DELETE_SET = ______    <- operator-filled, from the GATE 0B table
REQUIRED:  VERIFIED_DELETE_SET  ⊆  FINAL_DELETE_CANDIDATE_SET   (the seven)
           UNEXPLAINED_DELETE_COUNT_ALLOWED = 0
```

Delete **only** the candidates marked PRESENT at GATE 0B. If GATE 0B found all seven absent — which is the
evidence-based expectation — then `VERIFIED_DELETE_SET` is empty and **no deletion is performed at all**. That
is a pass, not a skipped step.

If a file outside the seven looks like it should go, **STOP**. It is out of scope for this release and belongs
to its own bounded task.

Deletion happens **after** all copy stages are saved and **before** the new deployment version is created, so
that the version cut contains neither a half-copied tree nor a file this release intends to retire.

## 13. GENERATED BUNDLE AND THE DEPLOYMENT VERSION

### Bundle verification — before copying `90_`

```
GENERATED_BUNDLE_CHECK_COMMAND =
    node assets/tools/build-apps-script-bundle.js
    git status --porcelain                        # MUST be empty

GENERATED_BUNDLE_EXPECTED_HASH =
    46ae3945061fefe45748f5fc7e8adf7624e20057da44b9ba9746be5a6eea5695
```

The generator is deterministic and LF-normalised, so running it against `TESTED_RELEASE_SHA` must rewrite
`90_` byte-for-byte identically and leave the tree clean. It prints `bundle_sha256=` and `modules=60`.

Three values must agree:

```
  the generator's bundle_sha256
  the hash 63_ declares for 90_ (63_:712, symbol KM_BUNDLE_CONTENT_HASH_)
  46ae3945061fefe45748f5fc7e8adf7624e20057da44b9ba9746be5a6eea5695
```

If any differs, **STOP**. **Never hand-edit `90_`** — it is generated from `assets/js/core/`, and an edit
there is lost on the next build while the hash check reports a tree nobody can reproduce.

> Note: two of the files that changed since `origin/main` —
> `assets/js/core/supply-planning-request-draft-v2-persistence.js` and
> `assets/js/core/supply-planning-snapshot-freshness.js` — are **bundle inputs, not browser assets**. No
> `<script>` tag loads them. They reach Production through `90_`, and that is the only way they reach it.

### Create ONE new deployment version

Only after: every copy stage saved · every verified delete done · bundle hash triple-matched.

Use the existing project procedure — **update the existing deployment** so the stable `/exec` URL is
preserved. Do not create a new Production URL; the frontend pins the current one, and a new URL would be a
frontend change this release does not carry.

```
NEW_APPS_SCRIPT_VERSION_ID = ______
DEPLOYMENT_URL             = ______    ( MUST equal the existing stable /exec URL )
DEPLOYED_BUILD_ID          = ______    ( read back from system.health; expect ...-R40 )
```

## 14. BACKEND HEALTH GATE

Call `system.health` against the new deployment **before publishing the frontend**.

```
BACKEND_HEALTH_REQUIRED_FIELDS =
  build_id                            == F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40
  deployment_release                  == F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40
  system_health_module_build          == F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40
  mixed_deployment                    == false
  absent_modules                      == []            (empty)
  stale_modules                       == []            (empty)
  absent_optional_modules             == contains TEMP_migrate_shipping_allocation_ai_lifecycle.gs
  modules[90_].KM_BUNDLE_CONTENT_HASH_== 46ae3945061fefe45748f5fc7e8adf7624e20057da44b9ba9746be5a6eea5695
  deployed_action_contract_version    == 18
  contract_version                    == (unchanged from GATE 0A)
  router_build                        == F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R39
  runtime_authority.uniform           == true
  verdict                             starts with "UNIFORM"
  product_strategy_enabled            == (recorded; see §0.5)
```

**`workspace_module_build` is NOT expected to read R40.** Its owner is
`60_api_v1_inventory_replenishment_workspace.gs`, which declares `SIR_BUILD_VERSION_ = ...-R6-R5` and is
unchanged since the deployed baseline, so it is not in the copy set. A per-module stamp records the round in
which that file last changed; only `build_id` is the release. A stamp older than the release is the normal
case, and marching it forward would be a lie about what this release contains. The field that decides a
partial sync is `mixed_deployment`, which compares each file against the stamp its OWN manifest row expects.

`absent_optional_modules` is expected to be **non-empty**: the lifecycle migration carries an `optional: true`
manifest row precisely so its absence is legitimate rather than a fault. An empty list here means that file is
present in the project, which contradicts GATE 0B.

```
READY_FOR_FRONTEND_RULE =
  READY_FOR_FRONTEND = YES only if every field above matches. Any mismatch -> STOP, do not publish the
  frontend, and go to §20. A frontend published against a backend that failed this gate converts a
  recoverable backend fault into a user-visible outage.
```
---

# PART D — FRONTEND PUBLICATION

## 15. FINAL FRONTEND DEPLOY SET

Re-derived against the **actually published** baseline `origin/main` (§0.1), not against `74aca0b`:

```bash
git diff --name-status 1a0ca13 TESTED_RELEASE_SHA -- index.html assets/js assets/css assets/html assets/img
```

**How Pages publishes matters here.** GitHub Pages serves the whole branch; the operator does not copy files
the way they do for Apps Script. The sets below are therefore not a copy list — they are the exhaustive list
of *what changes for a browser*, which is what drives the cache-token question and the smoke checklist.

```
FINAL_FRONTEND_DEPLOY_SET            (JS — 15 files, all modified)
  assets/js/api/operation-system-db-api.js
  assets/js/app.js
  assets/js/core/supply-planning-request-draft-v2-persistence.js    <- bundle input, NOT browser-loaded
  assets/js/core/supply-planning-snapshot-freshness.js              <- bundle input, NOT browser-loaded
  assets/js/core/supply-recommendation.js
  assets/js/pages/carrier-rate-card.js
  assets/js/pages/factory-stock.js
  assets/js/pages/fc-summary.js
  assets/js/pages/global-logistics-map.js
  assets/js/pages/overseas-stock.js
  assets/js/pages/purchase-order-overview.js
  assets/js/pages/request-order.js
  assets/js/pages/shipping-history.js
  assets/js/pages/shipping-plan.js
  assets/js/utils/km-repo-asset-manifest.js

  BROWSER-VISIBLE JS COUNT = 13     ( 15 minus the 2 bundle inputs, which ship inside 90_ )

FINAL_HTML_DEPLOY_SET                (3)
  index.html
  assets/html/pages/carrier-rate-card.html
  assets/html/pages/factory-stock.html

FINAL_STATIC_ASSET_DEPLOY_SET        (1 CSS + 0 new images)
  assets/css/pages/request-order.css
  assets/img/logo_only_red.png        — already published at 1a0ca13; unchanged by this release,
                                        but it is the favicon target and carries the new token

TOTAL CHANGED PATHS SINCE PUBLISHED BASELINE = 19
```

Nothing else in the tree is a deployable web asset: the only other files that changed since `74aca0b` outside
Apps Script, docs, tests and tools are two `.md` specifications, which Pages serves to nobody.

## 16. APPLICATION TOKEN ROTATION

```
APPLICATION_TOKEN_PRE   = s4r7-finalseal-20260927      <- what browsers actually hold today (§0.1)
APPLICATION_TOKEN_POST  = p1-cumulative-20261002
STALE_TOKEN_ALLOWED     = NO
```

The rotation is already committed on the tested tree; this gate **verifies** it rather than performing it.

```bash
grep -c 'p1-cumulative-20261002' index.html            # expect 54
grep -c 'p1-cumulative-20261002' assets/js/app.js      # expect  8
                                                       # total 62 references
grep -rn 's5r4-actionreason-20260928' --include=*.html --include=*.js . | grep -v '/assets/tests/'
                                                       # expect NO OUTPUT
```

```
STALE_APPLICATION_TOKEN_REFERENCE_COUNT = 0        <- required
```

### Coverage check — every changed asset must move with a token

Verified at `92f0ec3`. Of the 19 changed paths:

| asset | versioning route | status |
|---|---|---|
| 12 JS + 1 CSS referenced from `index.html` | `?v=p1-cumulative-20261002` | ✅ rotated |
| `global-logistics-map.js` | loaded by `app.js:148` under `?v=map-carriername-r11-20261001` | ✅ map family already rotated for this change |
| `carrier-rate-card.html`, `factory-stock.html` | fetched by `partial-loader.js:133` with `cache: 'no-store'` | ✅ never cached — no token needed |
| 2 core bundle inputs | ship inside `90_`, not fetched by a browser | ✅ not a frontend asset |
| `logo_only_red.png` (favicon) | `index.html:21`, `?v=p1-cumulative-20261002` | ✅ rotated |

**Do not rotate** the map token family or the Site-Inventory stylesheet family beyond what is already
committed. The map family moved because `global-logistics-map.js` changed; the stylesheet family's owning
files did not change, and rotating a family whose bytes are identical invalidates a cache for nothing.

## 17. GATE 3B — PUBLISH THE FRONTEND

**This is the publication step.** It runs only after `READY_FOR_FRONTEND = YES` (§14).

```bash
git checkout main
git merge --ff-only TESTED_RELEASE_SHA        # fast-forward; no new commit, no divergence
git push origin main
git rev-parse origin/main                     # MUST equal TESTED_RELEASE_SHA
git checkout feature/product-strategy-board-p0
```

`--ff-only` is deliberate: `main` is strictly behind the tested SHA once the merge at GATE 1 absorbed
`1a0ca13`, so a fast-forward is possible and a merge commit is not needed. If `--ff-only` is refused, `main`
has moved since GATE 1 — **STOP** and re-run from §4.

```
ORIGIN_MAIN_SHA_AFTER = TESTED_RELEASE_SHA        <- the spec's §8 end state, now satisfied
```

Then wait for Pages and verify **before** smoking:

```
- Pages redeploys asynchronously. Watch the repository's Pages deployment status until it reports the
  new commit. Do NOT start smoke while it is building.
- Verify the served tree is the tested one: open the site and confirm index.html references
  ?v=p1-cumulative-20261002. If it still shows ?v=s4r7-finalseal-20260927, Pages has not finished.
- A browser cache refresh may be needed for index.html itself, which is NOT token-versioned.
  Hard-reload once before concluding anything.

DO NOT DIAGNOSE A LAGGING PAGES DEPLOYMENT AS A RUNTIME DEFECT.
```

---

# PART E — PRODUCTION SMOKE

## 18. READ-ONLY PRODUCTION SMOKE

The first smoke after a coherent deployment. **No write authorization required; perform no write.**

```
READ_ONLY_SMOKE_CHECKLIST
  1   system.health                     build_id R40 · mixed_deployment false · verdict UNIFORM
  2   favicon                           tab icon renders; request is 200, not 404
  3   FC Summary — Regular              cold load, then warm reload
  4   FC Summary — Special Event        cold load, then warm reload
  5   SKU Details                       loads (known cold-timeout debt — record, do not fix)
  6   SKU Regional Details              loads (known cold-timeout debt — record, do not fix)
  7   Factory Inventory                 loads; stock figures present
  8   Overseas Inventory                loads; available/reserved present
  9   Weekly Shipping Plan              loads; carrier names resolve (S7 — needs 57_)
 10   Shipment Draft                    opens; source warehouse shown
 11   Shipment Overview                 loads
 12   On-the-Way                        loads; map leg labels render (map token family)
 13   PO Overview                       loads; document panel present
 14   Document rediscovery              an existing document is found again on both PO and Shipment
 15   Carrier Rate Card                 loads; lanes listed
 16   Show Lead Times deferred action   the panel opens and reads (READ ONLY — no upsert)
 17   Product Pricing workspace         loads, OR returns FEATURE_DISABLED consistently with §0.5

For each, capture:
  request duration · timeout (y/n) · false empty (y/n) · error banner text · unexpected 404 ·
  permanent loading state · incorrect carrier label · incorrect source-domain display
```

Check 17 is added by this runbook: it is the release's headline new read surface, and `product_strategy_enabled`
decides whether it answers at all.

## 19. READ-ONLY SMOKE STOP CONDITIONS

Stop and **do not proceed to controlled-write smoke** if any of these appear:

```
READ_ONLY_SMOKE_STOP_CONDITIONS
  · system.health field mismatch against §14
  · mixed_deployment = true
  · generated bundle hash mismatch
  · deployed_action_contract_version != 18
  · 404 or method mismatch (POST→GET) attributable to this deployment
  · blank canonical marketplace id where it is forbidden to be blank
  · a page depending on a backend action or slice that is missing
  · repeated timeout on a critical surface
  · false empty — a failed read rendered as "no data"
  · route or source-domain display drift
  · document rediscovery regression
  · carrier lead-time read failure attributable to the deployment
  · HEADER_MISSING from any pricing action   (<- §0.3: this is the token, not MISSING_REQUIRED_HEADER)

CLASSIFY BEFORE FIXING. Do not patch Production ad hoc. Each finding is either
  (a) a deployment fault        -> §20 rollback decision
  (b) pre-existing known debt   -> record, carry to S8, do not block
  (c) a Pages lag               -> §17, wait and re-verify
```

## 20. CONTROLLED-WRITE SMOKE — AUTHORIZATION GATE

```
CONTROLLED_WRITE_SMOKE_REQUIRES_OPERATOR_AUTHORIZATION = YES
```

**This runbook authorizes no Production write.** After read-only smoke passes, STOP and ask the operator to
authorize each write individually, naming the specific target.

```
CONTROLLED_WRITE_SMOKE_CANDIDATES
  A   one FC Special Event create/edit on a safe test event
  B   one Factory Inventory adjustment on one explicit factory + SKU
  C   one bounded Shipping reservation / cancel / dispatch cycle, IF a safe real transaction exists
  D   one Carrier Lead-Time edit, IF a safe existing row can be edited and restored
```

### Per-write safety contract — define ALL of these BEFORE executing any of them

```
  target row / entity          (exact id, not a description)
  expected before state        (read and recorded first)
  expected after state
  movement / write side effects
  rollback / reversal procedure
  authoritative readback       (re-read from the DB, not the UI's optimistic state)
  stop condition
```

Never use a bulk write for smoke. Never replay automatically: an unknown UI outcome is `ACK_UNKNOWN` and must
be held out of the write scope, not retried.

### A — FC controlled smoke

```
verify: Special Event save succeeds
        marketplace_id is canonical and non-blank
        campaign / campaign_sku_lines / fc_special_events graph is coherent
        authoritative post-write graph readback succeeds
        write success and refresh failure are DISTINGUISHED from one another
        no false success · no false failure · no automatic write replay
```

### B — Factory Inventory controlled smoke

```
choose one explicit factory + SKU · record the before value · perform ONE bounded adjustment
verify: DB readback matches · exactly one movement entry · Done closes the flow
        no second submit · no 404 / GET-leg false failure
If the UI outcome is unknown: DO NOT replay. Read the DB and classify first.
```

### C — Shipping controlled smoke

```
use a specifically selected safe test shipment
verify: declared source only (S6-R8A) · factory vs overseas source classification · reservation acquired
        release on cancel where reachable · dispatch consume semantics · no cross-warehouse deduction
        no double subtraction · movement truth
Do NOT invent Production quantities for testing.
If no safe real transaction exists: DEFER to the S8 test-data framework. That is a pass, not a gap.
```

### D — Lead Time controlled smoke

```
Do NOT add arbitrary duplicate lane data — a routable lane needs rows in BOTH carrier_rate_cards and
carrier_lead_times, and a stray row changes what the planner considers routable.
If a safe existing row can be edited and restored:
    record old values -> edit -> read back -> restore -> read back
Otherwise: DEFER. A read-only Lead Time panel is sufficient for this release.
```

### Pricing write surface

Governed entirely by GATE 0C (§3). If all four headers exist, the pricing write surface is deployable and
`pricing.update` may be included as a fifth controlled-write candidate **only** under separate explicit
authorization. If any header was missing, the release stopped before backend deployment and this question does
not arise. Missing required headers must never be discovered after the new runtime is live.

---

# PART F — ROLLBACK, RECORD, S8

## 21. ROLLBACK

```
ROLLBACK_TRIGGER_SET
  · backend health cannot reach a coherent R40 after a re-copy attempt
  · critical frontend pages fail because of release incompatibility
  · canonical writes become untrustworthy (success reported, readback disagrees)
  · cross-domain inventory mutation appears (a factory source deducting overseas, or the reverse)
  · deployed_action_contract_version mismatch persists after re-copying 01_ and 63_
  · generated bundle hash mismatch persists after a clean regeneration
  · large-scale 404 / POST→GET mismatch attributable to the deployment
```

```
ROLLBACK_SEQUENCE   (four distinct layers — do them in this order)

  1  FRONTEND
     git checkout main && git reset --hard 1a0ca13 && git push origin main
     ^ this is a force-moving push and requires EXPLICIT separate authorization. Prefer instead:
     git revert the merge commit on main and push the revert — it preserves history and needs no force.
     Pages redeploys the previous tree. Verify index.html returns to ?v=s4r7-finalseal-20260927.

  2  APPS SCRIPT DEPLOYMENT VERSION
     Deploy -> Manage deployments -> set the active deployment back to
     PRE_RELEASE_APPS_SCRIPT_DEPLOYMENT_VERSION.
     This restores what /exec SERVES immediately. It is the fastest and safest single action, and on its
     own it ends a user-visible outage.

  3  LIVE SOURCE-EDITOR CLEANUP
     Step 2 does NOT restore the editor's source. Restore the 18 files from
     APPS_SCRIPT_SOURCE_BACKUP_LOCATION, and delete 73_ (it did not exist before this release).
     Re-create any TEMP file deleted at §12 ONLY if it was genuinely present before — otherwise leave it
     absent, which was already the correct state.

  4  DATA REVERSAL — only for writes authorized under §20
     Reverse each authorized smoke write using the reversal procedure defined for it BEFORE it ran.
     Do NOT bulk-revert. Do NOT manually modify live DB beyond the specific rows named in §20.
     Governance §3.15: on failure, restore the prior deployment version and open a SEPARATE hotfix —
     a failed release is not a licence to hand-edit Production data.
```

Layers 1 and 2 are independent: a backend-only fault needs only layer 2, and rolling the frontend back for it
would be an unnecessary second change during an incident.

## 22. COMPLETION RECORD

To be filled during execution and recorded in `docs/planning/DEPLOYMENT_RELEASE_LOG.md`:

```
TESTED_RELEASE_SHA                   = ______
ORIGIN_MAIN_SHA_AFTER                = ______      ( must equal TESTED_RELEASE_SHA )
ORIGIN_FEATURE_SHA_AFTER             = ______      ( must equal TESTED_RELEASE_SHA )

LIVE_BUILD_ID_PRE                    = ______      ( expected ...-R14 )
LIVE_BUILD_ID_POST                   = ______      ( expected ...-R40 )

PRE_RELEASE_APPS_SCRIPT_VERSION      = ______
POST_RELEASE_APPS_SCRIPT_VERSION     = ______

FINAL_COPY_SET_ACTUALLY_COPIED       = ______      ( expected 18 )
FINAL_DELETE_SET_ACTUALLY_DELETED    = ______      ( expected 0 — all seven predicted absent )

PRICING_HEADER_PREFLIGHT             = PASS / STOP
LIVE_PRODUCT_STRATEGY_ENABLED        = ______
BACKEND_HEALTH_PASS                  = YES / NO

FRONTEND_SHA_LIVE                    = ______
APPLICATION_TOKEN_LIVE               = p1-cumulative-20261002

READ_ONLY_SMOKE_PASS                 = YES / NO
CONTROLLED_WRITE_SMOKE_AUTHORIZED    = YES / NO / PARTIAL
CONTROLLED_WRITE_SMOKE_RESULT        = PASS / DEFERRED_TO_S8_SAFE_TEST_FRAMEWORK / FAIL
ROLLBACK_USED                        = YES / NO
```

Governance §6 requires all of: git commit · frontend deployed commit · Apps Script deployment version ·
bundle hash · DB migration status. Record both versions, because this release spans both layers.

## 23. S8 ENTRY

```
S8_ENTRY_RULE =
  S8_ENTRY_ALLOWED = YES only when ALL hold:
    · git integration complete            (origin/main == origin/feature == TESTED_RELEASE_SHA)
    · the remote tested SHA equals the deployed SHA
    · backend health gate passes          (§14, every field)
    · the frontend is coherent            (Pages serving TESTED_RELEASE_SHA)
    · the application token is rotated    (live index.html on p1-cumulative-20261002, 0 stale)
    · read-only production smoke passes   (§18, with §19 clear)
    · no release blocker remains

  CONTROLLED_WRITE_SMOKE may be PASS, or explicitly DEFERRED_TO_S8_SAFE_TEST_FRAMEWORK where Production
  offers no safe bounded transaction. S8 does not require reckless Production writes.

AS OF THIS ROUND:  S8_ENTRY_ALLOWED = NO     — nothing has been deployed.
```

```
S8_FIRST_TASK =
  S8-R1 — FATIGUE TEST DATA NAMESPACE + LINEAGE + SAFE CLEANUP CONTRACT

  Designs the safe automated test-data framework BEFORE any high-volume Production fatigue write begins.
  It is first precisely because §20C and §20D may defer their writes to it.
```

```
S8_MANDATORY_ACCEPTANCE_PROOF_SET =
  AVG SALES:
    · 90-day lookback
    · up to the latest 30 ELIGIBLE NORMAL sales days
    · actual Campaign / Special Event sales dates EXCLUDED
    · denominator = the actual eligible-day count, never a fixed 30
    · PROVE the Campaign / Promotion-Risk / Event source reaches the calculation

  Carried, not implemented here:
    · FC Summary future — Edit Event Date; More Options toolbar cleanup
    · POST-S11 — Monthly FC Achievement %
```

### The nine S7 debts carried into S8

```
 1  s2-r4b Shipping History / FC harness prints FAIL A3 while exiting 0
 2  CURRENT_PRE_SCHEDULE has no explicit maximum snapshot age
 3  Factory available / receipt remaining client-side read-contract consolidation
 4  SKU Details workspace cold timeout
 5  SKU Regional Details workspace cold timeout / performance
 6  carrier-rate-card legacy .catch(_crcInit) fail-silent residue
 7  KM.loadState incomplete adoption across backend-reading pages
 8  boot payload / loading architecture, after R2B1 removed the brittle byte-floor gate
 9  production performance validation after a coherent deployment
```

---

## 24. RUNBOOK STATUS

```
RELEASE_EXECUTION_RUNBOOK_READY = YES
OPEN_RUNBOOK_BLOCKERS           = none

NEXT_TASK = PHASE-1 RELEASE EXECUTION R1        (NOT executed in this round)
```

Three preflight gates must be answered with live observations before execution can begin, and none of them can
be answered from the repository: `LIVE_BUILD_ID` (§1), live TEMP membership (§2), and the four pricing headers
(§3). Each has a defined STOP. The runbook is complete; the facts it waits on are the operator's to read.
