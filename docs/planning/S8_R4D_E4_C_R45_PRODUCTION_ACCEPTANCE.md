# S8-R4D-E4-C — R45 PRODUCTION ACCEPTANCE
## SEALED. The normalization bottleneck is closed. The request-shape defect is not.

```
S8_R4D_E4_C_R45_PRODUCTION = PASS          R45_PRODUCTION_SEAL = YES
PRE_HEALTH_PASS = YES · POST_HEALTH_PASS = YES · FINAL_HEALTH_PASS = YES
R45_UI_SMOKE = PASS
PRODUCTION_ROWS_WRITTEN 0 · ROWS_DELETED 0 · SCHEMA_CHANGES 0 · WRITE_ACTIONS_SENT 0
RUNTIME_MODIFIED IN THIS ROUND = NO — acceptance only, docs only
```

Deployed from `72798da`'s runtime bytes. Owner set `{ 60_, 63_ }`. `01_` stayed R41, action contract 18,
required-action list 14, transport contract 1, bundle hash `46ae3945…`, `appsscript.json` untouched.

---

## 1. The measurement

One Production one-shot, `R45-ACCEPT-1`, through the shipped URL builder — the same method and the same
diagnostic shape as the R44 baseline, which is what makes the comparison legitimate.

> **S8-R4D-E5 NOTE.** That sentence turned out to be more load-bearing than it looked. Both one-shots sent a
> **flat** body, so both read nineteen tables — which makes them a wrong-shaped request measured consistently.
> The R44→R45 comparison below is therefore **unaffected**: it compares like with like, and `normalizationMs`
> does not depend on table count (`dateCellsConverted` is 79,454 under both shapes, measured). What the
> identical shape does NOT license is reading these figures as the first layer's cost — see §6 and §7.

```
                      R44 (frozen)      R45        delta           change
normalizationMs            74,621       433       -74,188 ms      -99.42%
serverDurationMs           83,465    10,296       -73,169 ms      -87.66%
wall_ms                    92,697    19,111       -73,586 ms      -79.38%
batchMetadataMs               426       333           -93 ms      -21.83%
batchValuesMs               3,110     2,049        -1,061 ms      -34.12%

readerMode SHEETS_API · primaryReader SHEETS_API · finalReader SHEETS_API
fallbackUsed false · fallbackReason null · fallbackCount 0
rangeCount 13 · remoteCallCount 2 · dateMapVersion B1-DATE-MAP-R44-1 · serverBuild R45
```

`dateMapVersion` still reads `R44-1` and that is correct: **the map did not change, only the route to the
Date did.** A moved map version would have meant R45 changed what it converts.

## 2. The work was preserved — and my projection was wrong

```
DATE_CONVERSION_WORK_STILL_EXECUTED = YES        dateCellsConverted = 79,454
UTILITIES_COMPLEXITY_REDUCTION_LIVE = PROVEN     tzProbeCalls = 84 = 6 distinct years x 14 samples
R44-equivalent bridge calls for this workload    158,908  (2 per cell)
reduction factor                                   1,892x
```

84 is exactly the designed shape — one fourteen-sample probe per distinct year, memoized across all
thirteen tables in one execution. **The guard did not fail open.** Had every year failed its probe, the
count would have climbed toward 158,908 and R45 would have been a PASS on value and a FAIL on cost.

**My local projection of 38,347 cells was low by 2.07x.** Production converted 79,454. The over-read is
not the cause: `SIR_B1_DATE_MAP_` has thirteen entries and `sirWsApplyDateMap_` returns 0 for anything
else, so the six extra exposure tables were never normalized. The gap is my row census, taken several
rounds earlier, being stale. The arithmetic consistent with it is `amazon_daily_sales_snapshot` having
grown from 3,814 toward ~9,700 rows under its 90-day rolling retention — **recorded as arithmetic, not
asserted as fact.**

That cuts in the repair's favour: **R45 absorbed twice the workload I predicted and still finished in
433 ms.**

```
A LIMIT ON THE COMPARISON, stated rather than glossed: R44 never reported dateCellsConverted — the
counter is NEW in R45 — so no per-cell rate can be MEASURED for R44 and no per-cell comparison exists.
If the workload was the same a day apart, R44's implied cost was 0.4696 ms per bridge call. The absolute
comparison above is the honest one.
```

## 3. Semantics

```
LOCAL DIFFERENTIAL PROOF — old code vs new code in ONE node process, sirWsSerialToDate_ left
byte-identical so it serves as the oracle. NOT a live old-vs-new diff.
  DATE_VALUE_DIFF_COUNT 0   over 16 value shapes incl. 46222 · 46222.5 · 46812 · 45000.25, serial 0,
                            a NEGATIVE serial, both 1979 Taipei eras, two leap days, a year boundary
  DATE_TYPE_DIFF_COUNT 0 · DATE_MAP_DIFF_COUNT 0 · NON_DATE_TRAP_DIFF_COUNT 0
  EVENT_MONTH_11_PRESERVED YES
  7 mutants, 0 survived — incl. a hard-coded +8, which the 1979 serial catches

LIVE CONFIRMATION — what Production can actually attest:
  counts structurally sane · fc_target_rules legitimately empty · no missing-table or schema error
  Site Inventory rendered · dateMapVersion unmoved · fallbackUsed false
```

**A live old-vs-new semantic diff is not available and cannot be reconstructed: R44 is overwritten.** The
differential proof is local, and this document labels it so rather than letting it borrow Production's
authority.

## 4. Verdicts

```
R45_NORMALIZATION_ACCEPTANCE   = PASS
R45_PERFORMANCE_REPAIR         = PASS
R45_ADVANCED_SHEETS_STRATEGY   = VALIDATED
R45_NORMALIZATION_RELEASE_ACCEPTANCE = PASS
SITE_INVENTORY_FULL_PERFORMANCE_SEAL = NO   — the over-read is unrepaired, see §6
```

The two are deliberately separate. R45 made a wrong-shaped request fast; it did not make it right-shaped,
and it is not credited with doing so.

> **CORRECTION (S8-R4D-E5).** There was no over-read to repair. The request the PAGE sends was always
> right-shaped; only the probe's was not. `SITE_INVENTORY_FULL_PERFORMANCE_SEAL` is now **YES on request
> shape** — 13 tables, 0 exposure tables, measured — and the remaining open question is cost inside the
> thirteen, not scope. The sentence above stands as written because it was the correct refusal to make on the
> evidence then available: a fast wrong-shaped request would still have been wrong-shaped.

## 5. Final health — every gate

```
build_id / deployment_release / workspace_module / system_health_module   ALL R45
router_build R41 · deployed_action_contract_version 18 · required_action_list_version 14
mixed_deployment false · missing_actions [] · absent_modules [] · stale_modules []
advanced_services_ok true · advanced_sheets_runtime_mode RESOLVED
runtime_authority UNIFORM at all four schema generations · environment_mode production
read_only true · db_writes 0 · drive_writes 0 · status_transitions 0 · emails 0 · demo_mutations 0
absent_optional_modules [TEMP_migrate_shipping_allocation_ai_lifecycle.gs]  — optional, long retired
```

Two things worth naming because they are evidence rather than decoration:

- **The deployed `63_` is byte-for-byte this repository's file.** The live manifest row for `60_` carries
  the exact R45 sentence written in this round — *"R45 repairs what the R44 acceptance itself caught…"*
  A re-typed or partially-pasted file could not reproduce it.
- **No TEMP diagnostic is in the project.** The G1 probe was run and deleted before the version was cut,
  as required. Note that `system.health` **cannot** attest this — the manifest probes only files it
  lists, and the G1 tool is not one. It was verified by eye in the editor, which is the only instrument
  that can answer it.

`server_ms` fell from 14,365 (pre-deploy) to 7,461. Not a gate and not claimed as one — `system.health`
runs its own schema probe and is not the first-layer read.

## 6. Where the cost went, and it is not where it was

```
WALL_MINUS_SERVER_MS = 8,815   (R44: 9,232 — down only 417 ms / 4.5%)
  now 46.1% of wall. NOT called pure network: redirect, serialization and browser parse are combined.

SERVER_NORMALIZATION_BOTTLENECK = CLOSED

Inside the 10,296 ms of server time:
  openMs 296 + batchMetadata 333 + batchValues 2,049 + normalization 433  =  3,111 ms
  RESIDUAL, unattributed by any counter                                   =  7,185 ms  (69.8%)
```

**The largest single server cost is now something no counter measures** — view-model build plus JSON
serialization of a 12.18 MB payload. That is a bound, not an identification, and it is not named more
precisely than the evidence allows.

```
NEXT_DOMINANT_COST_LAYER = REQUEST_SHAPE -> OVERREAD -> PAYLOAD, in that causal order
```

One chain, not three candidates: `km_body` is lost → `only` never applies → 19 tables instead of 13 →
12.18 MB → 7,185 ms of build/serialize and 8,815 ms of transport. **E5 is now a performance round as well
as a correctness round.**

> **CORRECTION (S8-R4D-E5).** The first link of that chain is false: `km_body` was never lost. The chain's
> real first link is **the probe sent a flat body**, and every figure in this section is therefore a
> measurement of the *wrong request shape* — `INVALID_FOR_CANONICAL_FIRST_LAYER_MEASUREMENT`. The canonical
> first layer costs **6,197 ms of server time** for 13 tables and 7,299 rows, with the residual at 2,901 ms,
> not 7,185 ms. The six exposure tables are now priced at **4,099 ms of server time** — which is the first
> measurement of what the S8-R4C lazy split actually buys, and the only thing in this section that survives
> intact. See the E5 preflight §0b.

## 7. The km_body finding is CLOSED — DIAGNOSTIC INSTRUMENT FAULT

> **CORRECTION (S8-R4D-E5, 2026-10-07). This section's finding is WITHDRAWN. The observation below is real
> and is kept; the conclusion drawn from it was not.** The one-shot that produced it called
> `KM.transport.readUrl(action, { recentWindow, only }, rid)` — a **flat body**. `readUrl` serialises the body
> it is handed and builds no envelope; the shipped page body is the workspace DTO envelope and `60_:1082` reads
> `body.payload`. A flat body therefore arrives as `{}`, excludes no table, and nineteen sheets is the correct
> answer to the request that was actually sent. Nothing was lost at any hop.
>
> ```
> PRIOR_19_TABLE_SAMPLE_CLASSIFICATION = INVALID_FOR_CANONICAL_FIRST_LAYER_MEASUREMENT
> KM_BODY_FINDING_STATUS               = CLOSED — DIAGNOSTIC INSTRUMENT FAULT
> KM_BODY_RUNTIME_DEFECT = NO · REDIRECT_CONTRACT_DEFECT = NO · ROUTER_PARSE_DEFECT = NO
> ```
>
> The canonical request through `window.KM.api.getWorkspace` returns **tablesRead 13**, `recentWindowApplied
> true`, `onlyRequested_count 13` and no exposure table — see
> [S8_R4D_E5_KM_BODY_REDIRECT_CONTRACT_PREFLIGHT.md §0](./S8_R4D_E5_KM_BODY_REDIRECT_CONTRACT_PREFLIGHT.md).
> **R45's normalization acceptance is unaffected** — it was a measurement of `normalizationMs`, which is
> shape-independent: `dateCellsConverted` is 79,454 under both shapes.

```
The SAME successful R45 response reported:
  recentWindowRequested false · recentWindowApplied false · onlyRequested null
  requestEcho { recentWindow: false, only_count: null, siteScope: null }
  tablesRead 19 · bytes 12,770,434 · redirected true · final_host script.googleusercontent.com
```

**R45 must not be credited with closing this.** A fast wrong-shaped request is still wrong-shaped.

One sub-question has closed, and it narrows E5 rather than resolving it. An earlier round recorded that a
theory which cannot account for `tablesRead = 19` is not the theory. It is now accounted for:
**19 = 13 first-layer + 6 lazy exposure** — precisely what the handler reads when no `only` survives. The
observation is now fully consistent with body loss, and the remaining question is *where*.

## 8. The hard-refresh auto-load — audited, classified, NOT changed

The operator observed Site Inventory loading US / Amazon automatically after a hard refresh, before any
Search was pressed. Traced from source:

```
mount (_irMountAfterLoad, inventory-replenishment.js:14359)
  -> _irBootstrapScope_()                                    :9613   "THE MOUNT ENTRY POINT"
  -> _irRestoreScope_()                                      :9583
       localStorage['km_site_inventory_last_scope_v1'] { country, marketplaceId, at }, TTL 30 days
  -> _irRestorableResult_() -> NO_COMPLETED_RESULT
       (a hard reload loses the in-memory model deliberately — :9005, "no localStorage, no sessionStorage")
  -> COALESCED branch                                        :9657
       registryRequests 1 · workspaceRequests 1 · status = LOADING
       _irWorkspaceRefresh_({ owner: 'COALESCED_BOOTSTRAP' }) -> the FIRST-LAYER read (:10356)
```

```
AUTO_LOAD_AFTER_HARD_REFRESH                 = YES
AUTO_LOAD_SOURCE                             = PERSISTED_STATE   (not a default selection)
AUTO_LOAD_INTENTIONAL_BY_CURRENT_CONTRACT    = YES
AUTO_LOAD_NETWORK_REQUEST_COUNT              = 2  (1 registry + 1 workspace, source-derived)
AUTO_LOAD_USES_FIRST_LAYER_WORKSPACE_REQUEST = YES
AUTO_LOAD_PERFORMANCE_IMPACT                 = YES, and large
AUTO_LOAD_PRODUCT_DECISION                   = DEFER_UNTIL_AFTER_E5  (operator)
```

**US / Amazon is not a default.** No hard-coded site exists on this path; `_irRememberScope_` stores only
a scope that was successfully applied, with both country and marketplaceId. On a first-ever visit the
branch is `REGISTRY_ONLY`: one registry request, **zero** workspace reads, and the page waits.

**It is intentional, and the source records the change.** The mount comment at `:14352` still carries the
*old* contract — *"It issues ZERO inventoryReplenishment workspace reads"* — and the line below it records
`F1-7N-FB-4E-R3 §B` deliberately replacing that. S8-R4D-E3A §6 already classified the same mechanism as
`SEARCHING_BEFORE_SEARCH_ROOT_CAUSE = A — intended automatic bootstrap`, where what was deferred was its
*presentation*, not its existence.

**Not an R45 behaviour.** The mechanism predates R45 by several rounds and R45 changed zero frontend bytes
(`git diff a940059 HEAD -- assets/js assets/css assets/html index.html` is empty). It behaved identically
under R44 — slower, and sometimes timing out.

The decision is deferred for a reason worth keeping: the 19,111 ms / 12.18 MB figure is inflated by the
open E5 defect. Deciding now would be deciding against a number E5 is expected to change.

---

```
STATUS           R45 SEALED IN PRODUCTION
STILL OPEN       DIAGNOSTIC_REQUEST_BODY_LOSS -> S8-R4D-E5 (next)
QUEUED, UNTOUCHED
  A  AUTO_LOAD_PRODUCT_DECISION — re-evaluate only after E5's real first-layer cost is measured
  B  R4D-F ON-THE-WAY — first-layer aggregate only; full shipment detail stays lazy
  C  G1 AMAZON INVENTORY BLANK-DATE — separate data-correctness decision, never mixed into E5
  D  showSection UI debt — separate unless it is proven to interfere with the Site Inventory lifecycle
```
