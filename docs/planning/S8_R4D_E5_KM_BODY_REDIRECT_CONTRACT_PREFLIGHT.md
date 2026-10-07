# S8-R4D-E5 — KM_BODY REQUEST CONTRACT: ROOT-CAUSE PREFLIGHT

## The root cause is in the DIAGNOSTIC, not in the transport. The probe sent a body shape the handler does not read.

```
S8_R4D_E5_PREFLIGHT       = PASS
ROOT_CAUSE_STAGE          = STAGE 0 — probe request construction, before any network hop
ROOT_CAUSE_CLASS          = OTHER (invalid diagnostic sample). NOT encoding, redirect, router-parse,
                            body-reconstruction, client-recovery or compatibility-fallback.
ROOT_CAUSE_CONFIDENCE     = PROVEN for the observed sample, by execution of the shipped functions
ARCHITECTURE_DECISION_REQUIRED = NO
RUNTIME_MODIFIED = NO · PRODUCTION_WRITE = NO · DEPLOYED = NO · SCHEMA_CHANGES = 0
```

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
KM_BODY_SURVIVES_REDIRECT                   NOT DISPROVEN, and no longer suspected. The one observation that
                                            pointed here is fully explained upstream of the network.
KM_BODY_PRESENT_AT_DOGGET                   Consistent with arrival: the body PARSED. An absent km_body yields
                                            body={} and could not have carried the action/requestId it did.
KM_BODY_PRESENT_AFTER_ROUTER_PARSE          YES — rtrParseGetBody_ returns it intact for both shapes.

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
WHAT IS PROVEN      the observed Production output is produced, deterministically, by the probe's body shape
WHAT IS NOT PROVEN  that the PAGE's own read returns 13. It is correct by construction and by execution of
                    every shipped function in the chain — but it has never been MEASURED live.
```

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
           table_names contains NONE of: shipments, shipment_lines, shipping_plans, shipping_plan_lines,
           shipping_allocation_drafts, shipping_allocation_draft_lines
           -> the contract has always worked; §0's finding was an instrument fault; E5 closes as NO DEFECT
           -> the remaining Site Inventory cost is the REAL 13-table cost, and the auto-load decision reopens

FAIL       tablesRead 19 / recentWindowRequested false
           -> a genuine runtime defect exists that this preflight did NOT find, and the audit reopens at the
              network hops with the probe artifact removed as a confound. Do not repair before it is named.
```

Run it **once**, on a page that has finished loading. Do not retry on timeout — report the timeout instead.

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

```
NEXT_STEP_PROPOSAL
  1  operator runs §8 once and pastes the JSON        <- the only blocked step
  2  PASS  -> close E5 as NO_RUNTIME_DEFECT, re-measure the true first-layer cost, reopen the auto-load
             decision, and re-open R4D-F / E5-performance against a number that is real
  3  FAIL  -> reopen the hop audit with the probe artifact eliminated; server-side instrumentation of
             e.parameter KEY NAMES at router entry becomes justified, and it is a runtime change needing
             its own authorization
STOP — no runtime change, no deployment, no push.
```
