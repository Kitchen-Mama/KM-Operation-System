# S8-R4D-E4-B — R45 DATE NORMALIZATION BRIDGE REMOVAL
## Implemented, locally accepted, NOT deployed. Candidate A deliberately not built.

```
S8_R4D_E4_B_R45 = PASS          DEPLOYMENT_EXECUTED = NO    MAIN_FAST_FORWARD_AUTHORIZED = NO
PRE_HEAD  abbaa92               POST_HEAD  afa4fc1 (+ this doc)
DB_TOUCH = NONE · PRODUCTION_ROWS_WRITTEN 0 · ROWS_DELETED 0 · SCHEMA_CHANGES 0
FRONTEND_CHANGE = NONE · ACTION_CONTRACT_CHANGE = NONE · ROUTER_CHANGE = NONE
```

---

## 1. The defect, restated as a measurement

```
S8-R4D-E3D, one Production one-shot, R44 deployed:
  wall_ms            92,697
  serverDurationMs   83,465
    routerToHandlerMs         1
    batchMetadataMs         426
    batchValuesMs         3,110     <- the Sheets read R44 was cut for. It worked.
    normalizationMs      74,621     <- 89% of server time, inside 60_
```

R44 made the read ten times faster and then spent twenty-four times the saving converting serials to
Dates. `sirWsSerialToDate_` computes `wallMs − offset(tz)` — arithmetic — and reached it through
`Utilities.formatDate` + `Utilities.parseDate`: **76,694 bridge crossings over 38,347 declared cells**,
70% of them the seven date columns of `amazon_daily_sales_snapshot` over 3,814 rows.

**This was my defect.** The D2 benchmark measured transport and semantics and never ran the product's
normalization at scale; its zero diffs proved transport, and I applied that limit to correctness while
leaving cost unexamined.

## 2. What R45 does

```
OLD_CONVERSION_PATH   sirWsSerialToDate_      Utilities.formatDate(wall,'UTC') -> Utilities.parseDate(s,tz)
NEW_CONVERSION_PATH   sirWsSerialToDateGuarded_   new Date(wallMs - probedOffsetMs), per-cell fallback to OLD
TIMEZONE_GUARD_IMPLEMENTED = YES — probed, never assumed, never hard-coded
UTILITIES_CALL_COMPLEXITY_BEFORE  = O(date cells)      2 per cell, executed in the suite
UTILITIES_CALL_COMPLEXITY_AFTER   = O(distinct years)  14 per year, memoized per execution
```

`sirWsSerialToDate_` is left **byte-identical to R44**, asserted against `a940059`. It is both the
fallback and the differential oracle, so the suite compares old code to new code in one process rather
than to a reimplementation — the mistake the D2 benchmark made.

**The guard is not decoration.** `Asia/Taipei` is +8h today and was **+9h in July 1979**, because Taiwan
observed DST until 1980. A hard-coded +8 is wrong for real data and right for every test that only looks
at modern dates, so the suite converts a 1979 summer serial and the mutant that hard-codes the offset
fails on it. A year the probe cannot prove constant keeps the original path **cell by cell, not table by
table** — so one awkward year costs its own cells and nothing else.

The probe takes fourteen samples per distinct year — the 15th of each month plus the flanking December
and January, so a year's edges are covered by its own probe. **Stated limit:** that detects any offset
regime lasting a month or more. A shorter regime would be missed. None exists in tzdata for any era this
product reads, and Apps Script exposes no API that enumerates a zone's transitions, so sampling is the
only instrument available — which is why the bound is written down rather than implied.

## 3. Candidate A was not implemented

```
RECENT_WINDOW_SELECTION_CHANGED = NO
  sirWsRecentWindow_   byte-identical to the deployed a940059
  sirWorkspaceBuild_   byte-identical to the deployed a940059
  normalization still runs inside the read, BEFORE the trim — the ordering A would invert is untouched
```

It remains the only candidate that bounds the work as history grows, and it is a separate
decision-gated **R46** candidate because it changes a row-selection function.

## 4. Evidence

```
LOCAL PERFORMANCE (Production census shape, executed)
  date cells converted        38,347
  OLD bridge calls             76,694   executed, not quoted — 2 per cell
  NEW bridge calls, 1 request      14
  reduction                   5,478x
  projection at the MEASURED 0.973 ms/call: 74,621 ms of bridge cost -> ~14 ms
  (the pure-JS arithmetic and the two scan passes are NOT in that projection; they will appear in the
   measured R45 number, which is why no latency target is asserted here)

SEMANTIC GATES (new suite, 60 assertions, 7 mutants, 0 survived)
  DATE_VALUE_DIFF_COUNT      0   over 16 value shapes incl. 46222 · 46222.5 · 46812 · 45000.25,
                                 serial 0, serial 1, a NEGATIVE serial, both 1979 eras, two leap days,
                                 a year boundary at 23:59:59 and the other side of it
  DATE_TYPE_DIFF_COUNT       0   every converted cell is still a Date instance
  DATE_MAP_DIFF_COUNT        0   the 46-column literal is byte-identical to a940059; version unmoved
  NON_DATE_TRAP_DIFF_COUNT   0   all three traps intact
  EVENT_MONTH_11_PRESERVED   YES still the number 11, not 1900-01-10
  type gate                  8 non-number shapes pass through byte-identical, converted count 0
```

Mutants given the fault each gate claims to catch: a hard-coded +8, a one-sample probe, an epoch
constant off by a day, a dropped `Math.round`, a sign flip on the offset, a memo that forgets which
timezone it probed, and a removed type gate. All caught.

## 5. What the full sweep found, which the targeted suites could not

```
SWEEP   615 suites · 0 timeouts · tree clean after
CANONICAL SET — measured at abbaa92 in a fresh worktree, not assumed:
  6 suites / 20 FAIL lines, byte-identical before and after R45
    gap-job-done-notice (3) · order-planning-monthly-projection-consumer (1)
    positive-residual-and-submit-readiness-census (6) · replen-header-toggle (7)
    s2-r4b-shipping-history-and-fc-warm-race (1) · supply-planning-route-inventory (2)
NEW FROM R45 — 2 suites / 9 FAIL lines, both repaired:
  1  the activation census pinned the build it expects (R6R7_ACTIVATION_BUILD_, TEMP_E3_CENSUS_BUILD_)
     and the pin did not follow the release. A diagnostic expecting an older build REFUSES a healthy
     deployment. The mutant written for exactly that case (N13) SURVIVED, because the tree already had
     the defect the mutant introduces.
  2  the release ledger had no R45 entry. K1a pins the unlogged backlog at exactly R14..R40 so a
     twenty-eighth fails loudly rather than joining a gap nobody counts. R45 would have been it.
NEW FAILURES REMAINING = 0
```

Three suites were flagged by the sweep runner's own matcher and are **not** failures: it matched the
words SURVIVED/VACUOUS inside section titles that say a check is *not* vacuous. Re-judged from the saved
logs on assertion lines and each suite's own verdict.

Eight gates in four pre-existing suites were re-aimed and **none loosened**: equality pins on R44 became
floors (`stampAtOrAfter`), which is exactly what the R44 round did to R43's pins one round earlier; one
mutation anchor moved with the code it mutates rather than going silently vacuous; and the D2 owner-set
detector now reads the release id from `63_` instead of freezing it, so the sentence it owns survives
every future release.

## 6. Release

```
R45_RELEASE_OWNER_SET   60_api_v1_inventory_replenishment_workspace.gs   SIR_BUILD_VERSION_  -> R45
                        63_api_v1_system_health.gs                       SYS_BUILD_VERSION_  -> R45
                                                                         SYS_DEPLOYMENT_RELEASE_ -> R45
PIN FOLLOWED            TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs (diagnostic, not a runtime owner)
ROUTER_VERSION          R41 — unchanged
ACTION_CONTRACT_VERSION 18 — unchanged · required-action list 14 · transport contract 1
FRONTEND_CHANGE_REQUIRED NO — zero browser-served bytes
BUNDLE_REBUILD_REQUIRED  NO · APPSSCRIPT_MANIFEST_CHANGE NO
DEPLOYMENT_REQUIRED     YES — copy 60_ and 63_, then a NEW VERSION on the EXISTING Web App
NEW DIAGNOSTICS         dateCellsConverted · tzProbeCalls, beside normalizationMs
```

## 7. Carried forward, NOT repaired here

```
DIAGNOSTIC_REQUEST_BODY_LOSS -> S8-R4D-E5, its own round. Reproduced through the shipped URL builder:
  recentWindow=false · only=null · tablesRead=19 · redirected=true · script.googleusercontent.com
  If km_body has never arrived, the `only` optimization has never been effective in Production.
  NOT folded in, so a PASS on normalizationMs and a FAIL on the request contract never share a verdict.
  *** CLOSED by S8-R4D-E5: there was no body loss. "Through the shipped URL builder" was true of the URL
  *** and false of the BODY — the probe sent a flat { recentWindow, only } instead of the DTO envelope that
  *** 60_ reads at body.payload, so 19 tables was the correct answer to it.
  *** PRIOR_19_TABLE_SAMPLE_CLASSIFICATION = INVALID_FOR_CANONICAL_FIRST_LAYER_MEASUREMENT
  *** Live canonical request: tablesRead 13, recentWindowApplied true, 0 exposure tables.
  *** The decision to keep it OUT of this round's verdict was right, and is what kept R45 clean.
showSection is not defined   -> separate frontend round, low priority
Candidate A / hot-cold split -> R46, decision-gated
AMAZON_INVENTORY_BLANK_DATE  -> S8-R4D-G1, blocked on a source measurement
```
## 8. The Production acceptance one-shot — PREPARED, NOT EXECUTED

Run **only after** the operator has synced `60_` + `63_` into the Apps Script project and created a
deployment version. Run **once**. Site Inventory page, DevTools console.

### 0 — confirm which release answered, before measuring it

```js
await window.KM.api.call('system.health', {})
```
```
EXPECT  deployment_release          = F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R45
        module_sync.verdict         = UNIFORM
        runtime_authority.advanced_services.sheets = true
STOP IF the release still reads R44 — the measurement would be of the thing being repaired.
```

### 1 — the one-shot, through the SHIPPED URL builder

No hand-built URL, no `AbortController`. The 60 s client bound is what R44 died against, so the
diagnostic must be allowed to finish even if the repair did not work.

```js
(async () => {
  const action = 'inventoryReplenishment.workspace.get';
  const body   = { recentWindow: true, only: IR_FIRST_LAYER_TABLES_.slice() };
  const rid    = 'R45-ACCEPT-1';
  const url    = KM.transport.readUrl(action, body, rid);
  const t0     = performance.now();
  const res    = await fetch(url, { method: 'GET', cache: 'no-store', redirect: 'follow' });
  const wall   = Math.round(performance.now() - t0);
  const json   = await res.json();
  const d      = (json && json.data && json.data.diagnostics) || json.diagnostics || {};
  console.log(JSON.stringify({
    wall_ms: wall, http: res.status, redirected: res.redirected,
    final_host: new URL(res.url).host,
    serverDurationMs: d.serverDurationMs, routerToHandlerMs: d.routerToHandlerMs,
    batchMetadataMs: d.batchMetadataMs, batchValuesMs: d.batchValuesMs,
    normalizationMs: d.normalizationMs,
    dateCellsConverted: d.dateCellsConverted, tzProbeCalls: d.tzProbeCalls,
    readerMode: d.readerMode, primaryReader: d.primaryReader, fallbackUsed: d.fallbackUsed,
    rangeCount: d.rangeCount, remoteCallCount: d.remoteCallCount,
    dateMapVersion: d.dateMapVersion, serverBuild: d.serverBuild,
    tablesRead: Object.keys((json.data && json.data.tables) || {}).length,
    requestEcho: d.requestEcho
  }, null, 2));
})();
```

### 2 — the comparison, against the FROZEN R44 baseline

```
                      R44 MEASURED      R45 EXPECTED
batchMetadataMs              426        unchanged (same two remote calls)
batchValuesMs              3,110        unchanged
normalizationMs           74,621        MATERIALLY REDUCED — this is the whole claim
serverDurationMs          83,465        reduced by whatever normalizationMs gives back
wall_ms                   92,697        reduced by the same amount
dateCellsConverted         (absent)     ~38,347 at today's volume — the work is still being done
tzProbeCalls               (absent)     a small multiple of 14 — one probe budget per distinct year
```

**No latency target is asserted.** The acceptance criterion is: `normalizationMs` materially reduced,
`dateCellsConverted` still in the tens of thousands (the conversion did not quietly stop happening), and
`tzProbeCalls` far below `2 × dateCellsConverted` (the guard did not fail open into the per-cell path).

A `tzProbeCalls` anywhere near `2 × dateCellsConverted` means every year failed its probe and R45 bought
nothing — a PASS on value and a FAIL on cost, and the two must be reported separately.

### 3 — then the smoke, unchanged from E3 §12

Five pages. Site Inventory is the one that mattered: it must complete a bounded Search without
`REQUEST_TIMEOUT`. A first failure is recorded as a failure and is not converted by a later retry.

### 4 — what this one-shot does NOT answer

`requestEcho.recentWindow` and `only` are printed above because they are free, **not** because R45
repairs them. If they still read `false` / `null` with `redirected: true`, that is the separate
`DIAGNOSTIC_REQUEST_BODY_LOSS` finding and belongs to S8-R4D-E5 — it must not be allowed to contaminate
the R45 verdict in either direction.
