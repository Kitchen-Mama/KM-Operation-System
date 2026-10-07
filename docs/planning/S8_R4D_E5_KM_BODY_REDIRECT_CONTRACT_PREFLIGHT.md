# S8-R4D-E5 — KM_BODY REQUEST CONTRACT: ROOT CAUSE, AND THE LIVE DISCRIMINATOR THAT CLOSED IT

## The root cause was in the DIAGNOSTIC, not in the transport. Production has answered, and it answers 13.

```
S8_R4D_E5                 = CLOSED
S8_R4D_E5_LIVE_DISCRIMINATOR = PASS
KM_BODY_RUNTIME_DEFECT    = NO     REDIRECT_CONTRACT_DEFECT = NO     ROUTER_PARSE_DEFECT = NO
RUNTIME_REPAIR_REQUIRED   = NO
ROOT_CAUSE_STAGE          = STAGE 0 — prior diagnostic probe construction, before any network hop
ROOT_CAUSE_CLASS          = INVALID DIAGNOSTIC BODY SHAPE
                            NOT encoding, redirect, router-parse, body-reconstruction, client-recovery
                            or compatibility-fallback.
ROOT_CAUSE_CONFIDENCE     = PROVEN — predicted from source, then confirmed live
ARCHITECTURE_DECISION_REQUIRED = NO
RUNTIME_MODIFIED = NO · PRODUCTION_WRITE = NO · DEPLOYED = NO · SCHEMA_CHANGES = 0
```

---

## 0. The live discriminator — the canonical request, through the shipped client

Run on the sealed R45 deployment through `window.KM.api.getWorkspace('inventoryReplenishment',
{ recentWindow: true, only: <13> })` — the only caller that builds the DTO envelope.

```
tablesRead             13        <- the preflight predicted 13; the prior probes reported 19
recentWindowRequested  true      recentWindowApplied  true
requestEcho            { recentWindow: true, only_count: 13 }
onlyRequested_count    13
data_keys              exactly the thirteen first-layer tables. NO exposure tables present.
rowsReturned           7,299
serverDurationMs       6,197     wall_ms 6,194
batchMetadataMs 799 · batchValuesMs 2,033 · normalizationMs 464
dateCellsConverted 79,454 · tzProbeCalls 84 · rangeCount 13 · remoteCallCount 2
readerMode / primaryReader / finalReader  SHEETS_API · fallbackUsed false · fallbackCount 0
```

**The `only` contract has always worked.** Every stage the preflight traced from source behaves live exactly
as traced. Q2 from the handoff — *"has the optimization ever been effective in Production?"* — is answered
YES, and the three rounds that doubted it were doubting their own instrument.

### The one number not to freeze

```
wall_ms 6,194  <  serverDurationMs 6,197
```

A client wall cannot be shorter than the server interval it contains — there is at minimum a redirect hop and
a multi-megabyte parse inside it. Exactly one mechanism in this stack produces that reading: **in-flight
coalescing.** `_workspaceInvoke` keys business reads on `canonicalScope({ v: apiVersion, p: dto.payload })`
([km-api-foundation.js:868](../../assets/js/api/km-api-foundation.js#L868)) and hands them to
`scopedSingleFlight` ([km-transport.js:633](../../assets/js/api/km-transport.js#L633)). The probe's payload is
**byte-identical** to the page's own first-layer payload, so if a page read was in flight the probe attached to
it and measured only the remainder.

```
TRUE_FIRST_LAYER_SERVER_MS = 6,197   TRUSTED — the handler's own measurement, one authority
TRUE_FIRST_LAYER_WALL_MS   = 6,194   RECORDED, NOT TRUSTED as an end-to-end wall
```

This does not weaken the verdict — it strengthens it. If the read **was** coalesced, the physical request was
**the page's own**, which proves the page's first-layer read returns thirteen tables more directly than the
probe could. Either reading closes E5. One field settles which: `env.meta.coalesced`, beside
`physicalRequestId` and `requestIdCorrelation`. Worth capturing on the next page load; not worth a round.

## 0b. What the six exposure tables actually cost — measured for the first time

Same deployment, same release, two different request shapes. **Not a before/after of one request** — the
operator's instruction on this point is correct and is why the table is labelled by shape.

```
                        19-TABLE (INVALID SHAPE)   13-TABLE (CANONICAL)      delta
serverDurationMs                   10,296                  6,197          -4,099  -39.8%
  batchMetadataMs                     333                    799            +466
  batchValuesMs                     2,049                  2,033             -16
  normalizationMs                     433                    464             +31
  rangeCount                           13                     13               0
  remoteCallCount                       2                      2               0
  dateCellsConverted               79,454                 79,454               0
  tzProbeCalls                         84                     84               0
wall_ms                            19,111                  6,194         -12,917
```

Five counters are **identical**, and that is the point: the batch reader only ever handled the thirteen B1
tables: the six exposure tables went to the per-sheet reader and were never normalized. So the entire
**4,099 ms** server delta is six per-sheet reads plus building and serialising their rows — ~683 ms per sheet.

```
LAZY_EXPOSURE_SPLIT_VALUE = 4,099 ms of server time, MEASURED. S8-R4C argued it; this is the first number.
DATE_MAP_TOUCHES_ONLY_B1  = MEASURED, not inferred — dateCellsConverted is identical under both shapes,
                            which the R45 acceptance could only assert from source.
```

Two cautions against over-reading a single sample:

- **`batchMetadataMs` moved 333 -> 799 for provably identical work** (13 ranges, 2 remote calls). That is
  ±470 ms of run-to-run variance on a 6.2 s total — about 7.5%. No sub-second difference here carries meaning.
- **The unattributed residual is still the largest server block.** `6,197 - (799 + 2,033 + 464) = 2,901 ms`
  (46.8%), and `openMs` was not reported in this sample, so the true residual is 2,901 minus openMs. It is
  view-model build plus serialisation. It fell with the payload, which is consistent with that reading and does
  not confirm it.

---

## 1. What the one-shot actually sent

The R45 acceptance one-shot — and the R44 (S8-R4D-E3D) one before it — built the request like this:

```js
const body = { recentWindow: true, only: IR_FIRST_LAYER_TABLES_.slice() };
const url  = KM.transport.readUrl(action, body, rid);
```

`readUrl` is the shipped **URL** builder. It is not the **body** builder, and it does not pretend to be:
[km-transport.js:699](../../assets/js/api/km-transport.js#L699) serialises the object it is handed, verbatim —
no envelope, not even the action.

The shipped page body is the workspace **DTO envelope**, assembled by
[`buildInventoryReplenishmentRequestDTO`](../../assets/js/api/km-api-foundation.js#L1303) and handed to the
transport whole:

```
SHIPPED   km_body = {"apiVersion":"1","action":"…","requestId":"…",
                     "payload":{"include":{…},"recentWindow":true,"only":[13]},"context":{…}}
ONE-SHOT  km_body = {"recentWindow":true,"only":[13]}                      <- no `payload`
```

[60_:1082](../../assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs#L1082) reads
`var payload = (body && body.payload) || {};`. Against the one-shot's body that resolves to `{}` — so
`recentWindow` is undefined, `only` is null, no table is excluded, and nineteen sheets are read.

**That is not a fault. It is the server answering the request it was given, correctly, and saying so.**

```
I built that probe. The claim "built with the SHIPPED builder" was true of the URL and false of the body,
and the distinction is the whole defect. Two rounds of evidence rest on it.
```

## 2. Proven by execution, not by reading

[`assets/tests/km-body-request-contract-s8-r4d-e5.test.js`](../../assets/tests/km-body-request-contract-s8-r4d-e5.test.js)
— **56 assertions, ALL PASS**. Every stage is the actual shipped function, source-sliced out of its file and
executed. Nothing is restated locally; a restatement would prove this file's opinion of the contract, which is
the error that produced the finding in the first place.

```
STAGE                      FUNCTION (shipped, executed)              SHIPPED BODY      ONE-SHOT BODY
request DTO                buildInventoryReplenishmentRequestDTO      payload.only 13   n/a (bypassed)
km_body serialisation      readQuery                                  envelope present  envelope ABSENT
URL -> e.parameter         decode                                     km_body present   km_body present
router parse               rtrParseGetBody_                           payload.only 13   payload undefined
handler extraction         body.payload                               13 names          {}
table selection            sirWsOnlySet_ + the two gate lines         13 tables         19 tables
echo                       requestEcho / meta                         true / 13         false / null
```

The bottom-right column reproduces the live Production observation **exactly** — `recentWindowRequested false`,
`onlyRequested null`, `tablesRead 19` — with nothing lost at any hop.

## 3. The questions the task asked, answered

```
KM_BODY_BUILT_CORRECTLY                     SHIPPED PAGE: YES    ONE-SHOT PROBE: NO
KM_BODY_PRESENT_AT_FIRST_NETWORK_DISPATCH   YES — both. The one-shot refused to dispatch without `km_body=`.
KM_BODY_SURVIVES_REDIRECT                   YES — settled live by §0: a 13-table answer is only reachable
                                            if the envelope crossed every hop intact.
KM_BODY_PRESENT_AT_DOGGET                   YES — same evidence.
KM_BODY_PRESENT_AFTER_ROUTER_PARSE          YES — rtrParseGetBody_ returns it intact for both shapes, and
                                            the live echo confirms it for the shipped shape.

RECENT_WINDOW_EXPECTED  true
RECENT_WINDOW_OBSERVED  built true -> envelope true -> wire true -> parse true -> handler true   (shipped)
                        built true -> FLAT body    -> wire true -> parse true -> handler ABSENT  (one-shot)

ONLY_EXPECTED_COUNT     13
ONLY_OBSERVED           13 at every stage (shipped) · 13 on the wire, null at the handler (one-shot)
```

**The value does not change at any hop. It is read from a place the one-shot never wrote it to.**

### Neither size cap is near tripping

```
decoded km_body   495 B      RTR_GET_BODY_MAX_  4000 B   (e.parameter is already decoded)
read URL        ~891 chars   READ_URL_MAX       6000 chars
encoding        ONE encodeURIComponent — a double encode REFUSES READ_BODY_MALFORMED, never observed
```

### The recovery path cannot drop it either

Every attempt — first or bounded recovery — rebuilds the whole URL from `urlFor()`
([km-transport.js:848](../../assets/js/api/km-transport.js#L848)), so a recovery carries the full envelope under
its own `km_rid`. No path rebuilds the action alone.

### The GET transport is the live path, not the POST shim

`_sharedTransport()` returns `window.KM.transport` when present, and the one-shot's own successful call to
`KM.transport.readUrl` proves it is present in Production. `deps.workspaceInvoke` is supplied nowhere in the
tree. So the POST fallback — the one that would genuinely lose its body at the 302 — is not taken.

## 4. WHY_TABLES_READ_19, from control flow

`SIR_WORKSPACE_TABLES_` holds **21** entries; exactly **2** are gated on `include.carrierPlanning`, which the
first layer never sets. Two gates, in order:

```js
if (onlySet && !onlySet[spec.name]) continue;         // the `only` subset
if (spec.include && !include[spec.include]) continue; // the include gate
```

```
only = null   ->  gate 1 inert  ->  21 - 2 carrier  =  19   =  13 first-layer + 6 lazy exposure
only = <13>   ->  gate 1 binds  ->  13, and ZERO of the six exposure tables       [test D6/D7/D8]
```

Both halves of the task's §5 are proven deterministically, including the second half it asked for explicitly.

## 5. The limit of the evidence — stated, not glossed

A **flat** body and a **lost** body are observationally identical at the response: same nineteen tables, same
echo. Test F1/F2 asserts that identity rather than leaving it implicit.

That is precisely why the S8-R4D-E3A candidate matrix could not name the cause. Its five rows were *decoded /
double-encoded / absent / shipped-shape / action-mismatch* — and **"flat body present" was never one of them**,
because E3A recorded the shipped shape as flat. Every row was tested honestly; the row that was true was
missing. The matrix then eliminated its way to the only remaining answer, "km_body never reached
`e.parameter`", and that conclusion has been carried forward for three rounds.

```
WHAT WAS PROVEN AT PREFLIGHT  the observed output is produced, deterministically, by the probe's body shape
WHAT WAS STILL OPEN           that the PAGE's own read returns 13 — correct by construction, never measured
NOW CLOSED BY §0              Production returns 13, with the thirteen table names and no exposure table
```

The preflight deliberately stopped short of claiming the live system was clean. It predicted 13 and named the
one call that could falsify it. That prediction held, which is the only reason this record gets to say PROVEN
rather than ARGUED.

Why it has never been measured: under R44 the page read **timed out at 60 s** on every attempt (the operator's
`window.KM.api.getWorkspace` console run returned `wall_ms 60005`, `echo null`), so no echo ever came back.
Under R45 the page renders, but no telemetry was taken from it.

```
Q2 FROM THE HANDOFF — "has the only/recentWindow optimization EVER been effective in Production?"
   STILL OPEN, and now answerable by one read-only call rather than by instrumentation.
```

## 6. Scalability contract

```
SCALABILITY_CONTRACT_PRESERVED = YES — by the existing mechanism, with no change required
```

Proven on the selection function itself (test H1/H2): three hypothetical new lazy tables added to the registry
change the scoped first-layer selection by **nothing**, because gate 1 is an allow-list keyed on the thirteen.
The same three tables are absorbed whole by an unscoped request — which is why the scoping has to be real
rather than nominal.

```
EXPECTED_FIRST_LAYER_TABLE_COUNT_POST = 13        EXPECTED_EXPOSURE_TABLE_COUNT_POST = 0
```

None of the forbidden solutions is engaged: no timeout change, no accepted over-read, no exposure table
returned to the first layer, no scoping removed, no retry loop, no client-side discard of server-read rows.

## 7. Recommended minimal repair

```
RUNTIME REPAIR REQUIRED = NONE. No defect has been located in 60_, 01_, km-transport.js or km-api-foundation.js.
```

```
1  THE PROBE          Any Production probe of this contract goes through window.KM.api.getWorkspace(...),
                      which is the only caller that builds the envelope. S8-R4D-E3A already named this as
                      CANONICAL B1 PROBE = SHIPPED CLIENT ONLY. I did not follow it, twice.
2  THE RECORD         S8-R4D-E3A §2's "BODY SHAPE flat, no envelope" is wrong and is corrected in place.
                      A wrong frozen contract statement is what misled two subsequent rounds.
3  THE MEASUREMENT    ONE read-only Production call (§8) converts "correct by construction" into "correct,
                      measured" and settles Q2. No TEMP diagnostic, no runtime change, no deployment.
```

**Deliberately NOT proposed in this round.** `readQuery` accepts any object and will serialise a body no
handler can read — which is how this happened. A guard is arguable, but it would change the transport's public
contract on the strength of one operator-authored probe, and the cheaper fix is that probes stop hand-building
bodies. Raised for the record, not implemented.

## 8. The measurement — READ-ONLY, one call

Site Inventory page, DevTools console, under the sealed R45 deployment. This is the shipped client path end to
end: the DTO builder, the envelope, the transport, the router, the handler.

```js
(async () => {
  const T13 = ['marketplaces','marketplace_skus','sku_details','warehouses',
    'amazon_inventory_snapshot','amazon_inventory_health_snapshot',
    'amazon_daily_sales_snapshot','amazon_weekly_sales_snapshot',
    'fc_regular_forecast','fc_target_rules','fc_special_events',
    'overseas_inventory_snapshot','factory_stock'];
  const t0  = performance.now();
  const env = await window.KM.api.getWorkspace('inventoryReplenishment',
                { recentWindow: true, only: T13.slice() });
  const wall = Math.round(performance.now() - t0);
  const m = (env && env.meta) || {};
  console.log(JSON.stringify({
    wall_ms: wall, success: env && env.success,
    tablesRead: m.tablesRead, rowsReturned: m.rowsReturned,
    recentWindowRequested: m.recentWindowRequested,
    recentWindowApplied: m.recentWindowApplied,
    onlyRequested_count: Array.isArray(m.onlyRequested) ? m.onlyRequested.length : m.onlyRequested,
    serverDurationMs: m.serverDurationMs, openMs: m.openMs,
    batchMetadataMs: m.batchMetadataMs, batchValuesMs: m.batchValuesMs,
    normalizationMs: m.normalizationMs, dateCellsConverted: m.dateCellsConverted,
    readerMode: m.readerMode, fallbackUsed: m.fallbackUsed, serverBuild: m.serverBuild,
    data_chars: JSON.stringify(env && env.data || {}).length,
    table_names: Object.keys((env && env.data && env.data.tables) || {}).sort()
  }, null, 2));
})();
```

Every field above is reachable: `buildMeta` pre-sets only `apiVersion / source / mode / workspace / action /
cached`, and `normalizeWorkspaceEnvelope` copies every other server meta key through
([km-api-foundation.js:1446](../../assets/js/api/km-api-foundation.js#L1446)). `data_chars` is a **client-side
measure of the parsed payload**, not the wire byte count — labelled, not conflated with the one-shot's 12.18 MB.

```
PASS       tablesRead 13 · recentWindowRequested true · recentWindowApplied true · onlyRequested_count 13
           table_names contains NONE of the six exposure tables
FAIL       tablesRead 19 / recentWindowRequested false
           -> a genuine runtime defect this preflight did NOT find; reopen the hop audit with the probe
              artifact removed as a confound, and do not repair before the hop is named.
```

```
*** EXECUTED. RESULT = PASS. See §0. The FAIL branch was never taken and is kept as the record of what
*** would have falsified the preflight — a prediction with no falsifier is not a prediction.
```

## 9. Carried, unchanged

```
AUTO_LOAD_SOURCE = PERSISTED_STATE · AUTO_LOAD_INTENTIONAL = YES · decision still deferred.
  The reason to defer is now SHARPER, not weaker: if the measurement returns 13, the 19,111 ms / 12.18 MB
  figure the decision would have been taken against was never the first layer's cost at all.

NOT TOUCHED IN THIS ROUND, as instructed:
  A  G1 Amazon inventory blank-date      B  R4D-F On-the-Way      C  showSection UI debt
  D  remembered-scope auto-load UX       E  Candidate A recent-window reordering
```

---

---

## 10. TRUE FIRST-LAYER BASELINE — frozen

The first valid Production first-layer sample. Every earlier Site Inventory number was taken either from a
read that timed out or from a request of the wrong shape.

```
TRUE_FIRST_LAYER_SERVER_MS            6,197        <- authoritative
TRUE_FIRST_LAYER_WALL_MS              6,194        <- recorded, NOT trusted end-to-end (see §0)
TRUE_FIRST_LAYER_TABLE_COUNT             13
TRUE_FIRST_LAYER_EXPOSURE_TABLE_COUNT     0
TRUE_FIRST_LAYER_ROWS_RETURNED        7,299
BATCH_METADATA_MS  799   BATCH_VALUES_MS  2,033   NORMALIZATION_MS  464
DATE_CELLS_CONVERTED  79,454   TZ_PROBE_CALLS  84
PRIMARY_READER  SHEETS_API   FALLBACK_USED  false   RANGE_COUNT 13   REMOTE_CALL_COUNT 2
RELEASE  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R45
SAMPLE_COUNT  1 — single sample, and batchMetadataMs alone varies ±470 ms between samples.
```

## 11. Scalability contract — frozen

```
FIRST_LAYER_BOUNDARY                     = EXACT_13_TABLES
LAZY_EXPOSURE_TABLES_READ_IN_FIRST_LAYER = NO          (measured: data_keys carried none of the six)
SCALABILITY_CONTRACT_PRESERVED           = YES
```

Guaranteed by the allow-list gate `if (onlySet && !onlySet[spec.name]) continue;`, proven on the selection
function itself in test H1: three hypothetical new lazy tables change the scoped selection by nothing. Shipment,
allocation and carrier growth cannot reach the first layer.

**One boundary this does NOT cover, named so it is not mistaken for covered.** The contract bounds the first
layer in *table count*, not in *rows*. `amazon_daily_sales_snapshot` grows under its 90-day rolling retention,
and 79,454 date cells are converted on every first-layer read. Growth inside the thirteen is a real cost path
and this freeze does not close it.

## 12. AUTO-LOAD DECISION GATE — operator decision required

Now evaluable against a real number for the first time. **Nothing is changed here.**

```
MECHANISM   localStorage['km_site_inventory_last_scope_v1'] { country, marketplaceId, at }, TTL 30 days.
            Fires ONLY for a scope that was previously applied successfully. A first-ever visitor takes
            REGISTRY_ONLY: 1 registry request, ZERO workspace reads. US/Amazon is not a default.
            A hard reload discards the in-memory model deliberately, so it always takes COALESCED.
TRUE COST   ~6.2 s server · 13 tables · 7,299 rows · no exposure over-read
```

| | **A — KEEP AUTO-LOAD** | **B — RESTORE SCOPE, REQUIRE SEARCH** |
|---|---|---|
| returning-user convenience | data present, no click | one click every entry |
| startup cost | ~6.2 s server per page entry | ~0 — registry only |
| unnecessary request rate | one wasted read per entry where the scope was wrong or the user passed through — **rate unmeasured** | zero by construction |
| perceived latency | 6.2 s under a painted LOADING state, overlapping the user orienting | instant paint; the same 6.2 s moves behind a click the user initiated |
| stability risk | LOW — 6.2 s of a 60 s budget (10%). The old objection was 60 s timeouts under R44; that is gone | LOW, but needs an empty-ready state that reads as deliberate. Existing UI debt (`.psb-state` has no CSS, `showSection is not defined`) is a real prerequisite A does not have |
| data growth | every entry pays the growth inside the thirteen (§11) | growth is paid only when asked for |

```
AUTO_LOAD_RECOMMENDATION = A — KEEP, conditionally
```

**Why A.** B does not make the data arrive sooner for the user who wants it — it moves the same 6.2 s behind a
click. B only wins when the load was unwanted, and A's historical objection (timeouts) is measurably gone.
A also has no UI prerequisite, while B needs a pre-search empty state that this codebase does not yet style.

**What would flip it, stated plainly: a rate nobody has measured.** How often does opening Site Inventory end
in using the restored scope rather than changing it? If usually the former, A is right; if usually the latter,
B is right and the argument is not close. That question does not need telemetry — the operator can answer it
from their own use, and it is the cheapest decisive input available.

**The condition on A.** It rests on ~6.2 s, and `wall_ms` is the number §0 declines to trust. If the confirmed
end-to-end wall is materially above ~10 s, A should be re-opened, because the auto-load is then a visible stall
on every entry rather than a short wait.

```
AUTO_LOAD_DECISION_REQUIRED = YES — operator. No UX change made or proposed for implementation here.
```

---

```
S8_R4D_E5 = CLOSED
NEXT_TASK_PROPOSAL
  S8-R4D-F — ON-THE-WAY FIRST-LAYER AGGREGATE
  frozen scope: company + marketplace/site + sku + on_the_way_qty. Full shipment detail STAYS LAZY —
  and §0b now prices that split at 4,099 ms of server time, so the aggregate must not re-import it.
  BLOCKED ON: the operator resolving §12, or explicitly deferring it.
QUEUED, SEPARATE, NOT IMPLEMENTED
  G1 Amazon inventory blank-date architecture decision · showSection UI debt
STOP — no runtime change, no deployment, no push.
```
