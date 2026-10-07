# S8-R4D-E3A — LIVE REQUEST SHAPE + SITE INVENTORY TIMEOUT ATTRIBUTION
## Read-only audit. Findings accepted and frozen by the operator. Nothing implemented.

```
R44 BACKEND          deployed from a940059 · health UNIFORM · advanced_services_ok = true
R44 ACCEPTANCE       BLOCKED — awaiting canonical Production B1 samples + final health
PRODUCTION_ROWS_WRITTEN = 0 · ROWS_DELETED = 0 · SCHEMA_CHANGES = 0 · WRITE_ACTIONS_SENT = 0
```

---

## 1. The deployment-topology hypothesis is closed

```
LIVE_FRONTEND_SHA = 4a4a7f8 (GitHub Pages, from main)      LIVE_BACKEND_RUNTIME_SHA = a940059
git diff --stat 4a4a7f8 a940059 -- assets/js assets/css assets/html index.html   →   EMPTY

SITE_INVENTORY_RELEVANT_FRONTEND_DIFF_COUNT = 0
REQUEST_CONTRACT_DIFF = NO · LIFECYCLE_DIFF = NO · TIMEOUT_INSTRUMENTATION_DIFF = NO
LIVE_FRONTEND_VERSION_MISMATCH_CAUSAL = NO
```

Not one frontend byte differs between the two SHAs. Everything that changed is backend `.gs` (2), tests (12),
tools (3) and docs (6). **The Pages frontend can exercise the R44 request path, because R44 never touched it** —
the same fact that made `FRONTEND_RUNTIME_CHANGED = NO` correct at the E2 cut. `main` does not need
fast-forwarding to test this.

---

## 2. The shipped GET read contract

From [km-transport.js:699-710](../../assets/js/api/km-transport.js) and
[01_router.gs:170-208](../../assets/specs/active/apps-script/01_router.gs):

```
OUTER QUERY   action=<action>  (+ km_via=get · km_tc=<contract> · km_rid=<id>)
BODY PARAM    km_body
ENCODING      encodeURIComponent(JSON.stringify(body)) — ONE encode; Apps Script decodes into e.parameter
BODY SHAPE    flat, no envelope: { action?, recentWindow?, only?[], siteScope?{}, include?{}, requestId? }
READ BY       60_ handler, from the PARSED BODY (the read table forwards _rtrGet.body, not the query merge)
```

A read is a GET on purpose: a POST crossing the Apps Script 302 loses its body by specification, so the body
travels where the redirect cannot remove it.

---

## 3. Why the hand-built URL was invalid — proven, not inferred

The operator's manual GET returned `requestEcho.recentWindow = false`, `only = null`, no refusal, and all 21
tables. The shipped parser was extracted and executed against every candidate shape:

```
1 decoded km_body (normal)        -> ok  recentWindow=true  only=13 tables
2 still percent-encoded           -> REFUSED  READ_BODY_MALFORMED
3 km_body absent                  -> ok  recentWindow=undefined  only=null      <- the observed signature
4 shipped shape (+km_via/tc/rid)  -> ok  recentWindow=true  only=13 tables
5 action mismatch                 -> REFUSED  READ_BODY_ACTION_MISMATCH
```

```
MANUAL_B1_REQUEST_ROOT_CAUSE = F — km_body never reached e.parameter
MANUAL_B1_SAMPLE_VALID = NO        MANUAL URL B1 PROBE = RETIRED
```

Only case 3 produces all four observed facts at once. **Double-encoding is disproven** — it refuses, and no
refusal was seen. **Wrong parameter name is disproven** — `km_body` is what the shipped client sends. The
parser, the merge and the read-table dispatch all handle correct input correctly.

*Which hop dropped it is not proven and is not worth proving.* It is consistent with the already-measured
`/exec → googleusercontent` redirect family, but the real lesson is narrower: **a hand-built transport is not
the shipped transport, and a probe that is not byte-equivalent to the shipped request cannot accept it.**

```
CANONICAL B1 PROBE = SHIPPED CLIENT ONLY
  window.KM.api.getWorkspace('inventoryReplenishment',
    { recentWindow: true, only: IR_FIRST_LAYER_TABLES_.slice() })      run on the Site Inventory page
```

One finding survives the invalid sample and is worth keeping: it reported `primaryReader = SHEETS_API` with
`fallbackUsed = false`, so **the advanced-service read path executed live in Production**. An empty body still
partitions into B1 and non-B1 specs, so the thirteen went through `batchGet` regardless.

```
R44_SHEETS_API_PRIMARY_READER_LIVE = YES
```

---

## 4. Every call site sends the same payload

One builder, [inventory-replenishment.js:10356](../../assets/js/pages/inventory-replenishment.js):
`{ recentWindow: true, only: IR_FIRST_LAYER_TABLES_.slice() }`. `opts.carrier` adds no sheets — it marks a
follow-up catalogue load on a separate path.

| PATH | OWNER | recentWindow | only | siteScope | loading state | bound |
|---|---|---|---|---|---|---|
| mount, no remembered scope | — | — | — | — | pre-search sentence | **0 requests** |
| remembered scope, no valid cache | `COALESCED_BOOTSTRAP` | true | 13 | absent | **LOADING painted** | 60 s |
| remembered scope, valid cache | `RESTORED_MOUNT_REVALIDATION` | true | 13 | absent | none — quiet | 60 s |
| operator Search | `SEARCH_CLICK` | true | 13 | absent | gate-owned | 60 s |
| Retry Search | `SEARCH_CLICK` | true | 13 | absent | gate-owned | 60 s |
| post-write reconcile | write readback | true | 13 | absent | REFRESHING | 60 s |

`siteScope` is absent by design on every first-layer read: it is exposure-only, and `sirWsScopeApplicable_`
refuses it on any other request rather than ignoring it — because ignoring a scope **is** widening it.

```
LIVE_PAGE_*_REQUEST_SHAPE = identical on all paths. Outcome C (frontend not using B1) is DISPROVEN.
```

---

## 5. Timeout attribution — deliberately unresolved

```
CLASSIFICATION            = COLD_START_OR_TRANSIENT_TIMEOUT   (the page's own shipped classifier)
ATTRIBUTION_CONFIDENCE    = LOW
R44_B1_BACKEND_TIMEOUT_PROVEN    = NO
R44_B1_BACKEND_TIMEOUT_DISPROVEN = NOT_YET
```

`server_evidence = false` · `server_execution_ms = null` · `request_reached_server = UNRESOLVED` ·
`phases = [DISPATCH]` · `retry_count = 0`. **There is no evidence the read ever reached the handler**, so the
timed-out action's *name* is the only thing tying it to B1 — which is not attribution. Two signals point away
from read cost: `getClientCapabilities`, a trivial read, took **4,151 ms**, and `page_boot_elapsed_ms` was
**99,856 ms** against a client total of 73,127 ms.

Prior art, neither of which clears R44 and both of which predate it: the R4C acceptance recorded
`REQUEST_TIMEOUT` at the full 60 s on this page under R42 and called the first-layer cost *"a separate problem
that pre-dates this round"*; and `S8_R4B_ROOT_CAUSE_PREFLIGHT` measured the `/exec → echo` bounce turning one
logical read into 2–3 server executions, with *"false timeout: **YES, proven** — the bound expires against a
chain"*, at 4.8% of reads, cold-path only.

**A pre-existing intermittent fault and a new regression look identical in a single sample.** That is why the
canonical probe, not a second opinion, is what closes this.

```
SITE_INVENTORY_SMOKE = INTERMITTENT_REQUEST_TIMEOUT — recorded as a failure, never converted by a later retry
```

The UI behaved correctly: it failed closed and said *"this is a read failure, not an empty result — nothing
about your data changed."* A timeout rendered as an empty dataset would have been far worse.

---

## 6. DEFERRED — Site Inventory loading-state UX contract

Operator-frozen preference. **Not implemented in E3A/E3. Scheduled for a later bounded UI repair.**

```
EXPLICIT SEARCH              -> show "Searching..."
REMEMBERED-SCOPE BOOTSTRAP   -> MUST NOT visually impersonate an operator-initiated Search.
                                Use a distinct restore/loading presentation.
VALID CACHE                  -> render immediately, revalidate quietly        (already correct today)
```

Current behaviour and why it is not a bug: `COALESCED_BOOTSTRAP` deliberately sets `_irSearch.status =
'LOADING'` and paints the gate immediately (R6-R5 §4, *"PAINT THE WAITING STATE NOW"*) so a user navigating in
does not see the pre-search sentence while a read is already being prepared for them. The `RESTORED` path is
already correctly quiet. **Only the cache-miss bootstrap paints, and it currently renders identically to a
Search the operator did not press.** That is the whole of the defect.

```
SEARCHING_BEFORE_SEARCH_ROOT_CAUSE = A — intended automatic bootstrap; the loading paint is deliberate
PRODUCT_DECISION_REQUIRED = YES (taken: the three presentations above)      IMPLEMENTATION = DEFERRED
```

---

```
STILL OPEN  canonical B1 samples via the shipped client · final post-acceptance health · R44 seal
NEXT        S8-R4D-E3 §8-§13, on operator evidence.  R4D-F not begun.
```
