# S8-R4D-T1 — FIRST-SEARCH TRANSPORT STABILITY · HANDOFF

```
MODE  READ-ONLY ROOT-CAUSE TRIAGE FIRST. No timeout value, retry policy, API contract or backend behaviour
      changes without root-cause evidence.
STATUS  QUEUED — prepared by the S8-R4D-F1B-R3 closeout, not started.
```

## §T0 — WHY THIS IS NEXT, AND WHY IT OUTRANKS THE REMAINING LAYOUT WORK

A Search that times out leaves `_irSearch.applied` null, because `_irApplySearch_` is reached only on success.
A page with `applied` null cannot render the stale notice at all (`_irMarkSearchStale_` returns first), so it
cannot show the layout defect either. That is the proven reason the F1B-R2 A/B/C capture produced three
identical, empty checkpoints. **The transport failure is upstream of the ability to observe the UI.**

## §T1 — WHAT IS ALREADY ESTABLISHED (do not re-derive)

```
read bound       60 000 ms at the transport (km-transport.js:329); the scoped DB read layer declares 45 000 ms
write bound      90 000 ms, never auto-replayed
ONE budget       _deadlineAt = start + budget; every attempt is bounded by _remainingMs(). A retry spends the
                 REMAINDER of the caller's budget, never a second one (S3-R8 §7)
recovery floor   below 2% of the budget, recovery is SKIPPED and the named failure is kept — deliberately, so
                 REDIRECT_TARGET_NOT_FOUND is not converted into an anonymous REQUEST_TIMEOUT
REQUEST_TIMEOUT  NEVER auto-retried (km-transport.js:297)
302 -> echo      Apps Script answers every /exec with a 302 to script.googleusercontent.com/macros/echo (:78)
404 on the echo  classified by THREE facts together — httpStatus 404 AND redirected AND the echo host — as
                 CODES.REDIRECT_TARGET_NOT_FOUND (:268). Auto-retryable, READS ONLY, bounded to exactly one
                 extra attempt (maxRetries = 1 for reads, 0 for writes, :746), retried from the STABLE /exec
single-flight    reads with no abort signal share on canonicalScope({v, p: payload}) (km-api-foundation.js
                 :871-876 -> km-transport.js:633). Preload and Search build byte-identical first-layer
                 payloads, so a Search during an open preload coalesces rather than dispatching
canonical first  13 tables · serverDurationMs 6 197 · 7 299 rows   (the frozen E5 Production measurement)
layer cost
NOT E5           a 6.2 s read cannot exhaust a 45-60 s bound. Unless server execution has regressed — which is
                 measurable, see §T3 — this is a SEPARATE defect and the E5 record must not be cited for it
```

**The console 404s are therefore expected traffic with a name, already handled.** Seeing them is not by itself
the defect. `HTTP_404_CAUSAL_LINK = NOT_PROVEN`.

## §T2 — THE QUESTION TO ANSWER

> Did a server execution for the timed-out `request_id` run, and did it finish inside the bound?

```
YES, finished in time   -> the loss is on the RESPONSE hop (redirect / echo target); the 404 is causal
YES, ran past the bound -> server execution regression; measure against the 6 197 ms baseline
NO execution at all     -> dispatch, queueing or deployment; the 404 is incidental
```

Everything else in the investigation hangs off that fork. Do not propose a timeout change before it is
answered: raising a bound that is not the binding constraint hides the defect and costs every caller the
difference.

## §T3 — EVIDENCE THE OPERATOR MUST COLLECT

On a page where the timeout reproduces, DevTools **Network** open, **Preserve log** on:

1. Network, filter `script.google`. Per row: **Name, Status, Type, Size, Time**, and whether a 302 is followed
   by a 200 or a 404. **Export the HAR** — it carries the timings and the full redirect chain, which is the
   part the console throws away.
2. In the console, immediately after the failure (these names are VERIFIED to exist in the shipped page;
   if one is absent, report that rather than substituting another):
   ```js
   window.KM.transport.metrics()      // requests, coalesced, retries, shareSkipped
   window._irReadStageReport_()       // server_execution_ms, server_tables_read, rows, read_dispatches,
                                      // request_count, retry_count, coalesced_count
   window._irSearchState_()           // status, applied, stale, seq, inFlight, error
   window._irBootstrapDiagnostic_()   // mode, preloaded, committed, scope_valid, restore_reason
   ```
3. The **full error object** the page surfaced: `code`, `details.timeout_ms`, `details.budget_exhausted`,
   `details.attempt`, `request_id`.
4. Apps Script → **Executions**, the rows covering that minute: status, duration, and whether an execution ran
   at all for that request.
5. **Cold vs warm.** Run the same Search twice: once on a freshly loaded tab (cold) and once with the model
   already in memory (warm — which under F1B issues ZERO requests). If only cold fails, the defect is in the
   boot/dispatch path rather than in the read itself.

## §T4 — SOURCE AUDIT TO RUN IN PARALLEL (read-only, no browser needed)

* the first-layer request lifecycle end to end: `_irWorkspaceRefresh_` → boot arbiter (`_ba.critical`, deps
  `['scopeRegistry']`) → `KM.api.getWorkspace` → `_workspaceInvoke` → `scopedSingleFlight` → transport;
* whether the **preload** and a **Search** can both be in flight such that one's failure settles the other —
  the coalesced promise is shared, so a shared rejection reaches both callers;
* the boot arbiter's PREPARING phase: how long a read can sit queued behind `scopeRegistry` before dispatch,
  and whether that queueing is inside or outside the timeout budget (the budget starts at `t.start`, so time
  spent waiting for the arbiter may be spent from it — **this is the single most promising source lead**);
* `_irReadDispatches` (the page's own ledger, max 20 entries) — owner, seq, payload fingerprint, outcome;
* whether `REDIRECT_TARGET_NOT_FOUND` recovery is being SKIPPED by the 2% floor, which would show as a named
  failure arriving at the page while the console shows a 404.

## §T5 — BOUNDARIES

```
Do NOT change        timeout values · retry policy · API contract · backend · DB · Apps Script
Do NOT weaken        the fail-closed behaviour, request scoping, or the single-budget rule
Do NOT reintroduce   a second budget for recovery (S3-R8 §7 removed it deliberately)
Do NOT treat         the googleusercontent 404 as the defect until the §T2 fork is answered
Keep separate        the layout work (F1B-R3 is complete and awaiting Production acceptance)
```

## §T6 — EXIT

Return the §T2 fork answered with evidence, a classification, and — only then — a proposed repair with its
blast radius. If the evidence cannot be collected, say exactly which item of §T3 is missing and stop.

---

# S8-R4D-T1 — ROUND 1 FINDINGS (read-only source triage)

```
ROOT_CAUSE_STATUS = NOT_ESTABLISHED
RUNTIME_MODIFIED = NO · BROWSER_SERVED_CHANGES = 0 · BACKEND/API/DB = 0 · DEPLOYED = NO
No timeout value, retry policy or API contract was touched. The R3 layout repair was not modified.
```

No new Production evidence was supplied this round, so no timing is reported as measured. What follows is
what the SOURCE proves, including one correction to this very handoff.

## §T1.1 — CORRECTION: the boot-arbiter lead is REFUTED for these reads

§T4 of this handoff named the arbiter queue as "the single most promising source lead", on the reasoning that
the budget starts at dispatch so time spent queued behind `scopeRegistry` is spent from it. **That is wrong
for the reads in question, and the reason is one line:**

```
inventory-replenishment.js:10427   function _irReadIsCritical_(opts) { return !(opts && opts.quiet); }
```

All three first-layer readers pass `quiet: true`:

```
:9734  owner: 'COALESCED_BOOTSTRAP'            quiet: true   -> NOT critical -> NOT arbitrated
:10698 owner: 'SEARCH_CLICK'                   quiet: true   -> NOT critical -> NOT arbitrated
:9660  owner: 'RESTORED_MOUNT_REVALIDATION'    quiet: true   -> NOT critical -> NOT arbitrated
:10639 owner: 'POST_WRITE_READBACK'            (no quiet)    -> arbitrated
```

Only the post-write readback goes through `_ba.critical`. **The preload and the Search never queue behind the
boot arbiter at all**, so arbiter wait cannot be consuming their budget. The lead is closed rather than
carried forward, so the next round does not spend time on it.

### A consequence: the "Preparing…" message is unreachable for a Search

`_irRenderSearchGate_` distinguishes PREPARING from READING by asking the arbiter:

```
:phaseFor(_irCriticalReadKey_({ carrier: true })) === PHASE.PREPARING
boot-read-arbiter.js:252-256   an unregistered key returns SETTLED or IDLE — never PREPARING
```

Because the Search read is never registered as critical, that branch cannot fire. **The page therefore always
says "Searching…", including while it is in fact waiting on something else.** This is not the cause of the
timeout; it is a reason the failure is opaque to the operator, and it removes the one signal that was built
to distinguish the two halves of the wait. Recorded as diagnostic debt.

## §T1.2 — M1: A COALESCED SEARCH INHERITS A BUDGET IT DID NOT START

This is the round's substantive finding and it is proven end to end in source.

```
km-api-foundation.js:874-876   the shared unit is withBoundedDowngradeRetry — which CONTAINS the transport call
km-transport.js:636            if (_scopedInflight[k]) { _metrics.coalesced += 1; return _scopedInflight[k]; }
                               -> the second caller receives the existing promise and NEVER invokes fn
km-transport.js:721            var t = { start: _now(), ... }        <- inside request(), i.e. inside fn
km-transport.js:766            var _deadlineAt = t.start + _budgetMs
```

So when a Search coalesces onto an in-flight preload:

* the Search's own budget **never starts**;
* it is attached to a deadline anchored at the PRELOAD's dispatch;
* if the preload has already been open for N ms, the Search can fail with `REQUEST_TIMEOUT` after
  `budget − N` ms of its own waiting — including almost immediately;
* and `REQUEST_TIMEOUT` is **never auto-retried** (`km-transport.js:297`), so there is no second chance.

The coalescing itself is correct and must not be removed — it is what stops two identical 13-table reads, and
removing it would reintroduce the duplicate-read cost that reached the bound in the first place. What is
surprising is the **budget accounting**: a caller that consented to a 60 s wait may be handed a nearly
expired one, and nothing in the error says so. `details.timeout_ms` reports the BUDGET, not the time this
caller actually waited.

**This is a contributing mechanism with the exact shape of the report — "intermittent first-Search timeout".
It is NOT proven to be the production cause**, because it only bites when the preload is already slow: at the
frozen healthy cost (13 tables, 6 197 ms server) the preload settles long before an operator has chosen a
scope and clicked. It amplifies an underlying slowness rather than creating one.

It is also not an F1B regression. The preload existed before F1B; what F1B changed is that the operator must
now press Search, which is what makes the inheritance observable as a Search failure.

## §T1.3 — WHAT IS INSIDE THE BUDGET, STRUCTURALLY

Since the arbiter is not involved, everything from `t.start` onward is inside one budget:

```
INSIDE   endpoint resolution · fetch dispatch · browser connection queueing · DNS/TLS ·
         Apps Script server-side queueing · doGet execution · the 302 and the echo fetch ·
         body read · parse · validate · AND any retry, which spends only what is LEFT (S3-R8 §7)
OUTSIDE  the boot arbiter wait — not applicable here, these reads are unarbitrated
NEVER
STARTED  the coalesced caller's own budget (M1)
```

**The budget cannot by itself distinguish client queueing from backend execution** — both are inside it. That
is precisely why the pairing of browser resource timings with the Apps Script Executions list is the required
evidence, and why no single client-side number can answer the fork.

## §T1.4 — DELIVERABLES

```
ROOT_CAUSE_STATUS       NOT_ESTABLISHED. Two source-proven mechanisms found (M1 budget inheritance;
                        the dead PREPARING signal). Neither is correlated to a production failure.

CLIENT_QUEUE_TIME       NOT MEASURED. No production capture was supplied this round. Structurally it is
                        inside the budget and is not separable from backend queueing by any client number.

SERVER_EXECUTION_TIME   NOT MEASURED for any failing request. The only measured figure remains the frozen
                        healthy E5 Production baseline: 13 tables, serverDurationMs 6 197, 7 299 rows.
                        `_irReadStageReport_().server_execution_ms` is null when no read completed, which is
                        exactly the first-attempt-timeout case — a null means the server never told us, not
                        that the server was slow.

REDIRECT_RESULT         A 404 on script.googleusercontent.com was observed in the operator's console in an
                        earlier round. It is a NAMED, already-handled condition — classified by three facts
                        together (404 AND redirected AND the echo host) as REDIRECT_TARGET_NOT_FOUND
                        (km-transport.js:268). NOT correlated to the timed-out request.
                        HTTP_404_CAUSAL_LINK = NOT_PROVEN.

RETRY_RESULT            NOT MEASURED. Policy, from source: reads retry at most once (maxRetries 1; writes 0),
                        REDIRECT_TARGET_NOT_FOUND is retryable, REQUEST_TIMEOUT is not, and a recovery is
                        SKIPPED when under 2% of the budget remains so a named failure is not converted into
                        an anonymous timeout. `metrics().retries` reports the real count.

TIMEOUT_BUDGET_         Structural, source-proven (§T1.3). Numeric breakdown NOT AVAILABLE without the
BREAKDOWN               capture — and it will not be invented.

E5_RELATIONSHIP         SEPARATE DEFECT. E5's 19-table read came from a diagnostic probe's flat body reaching
                        60_ as {}; the shipped page sends the DTO envelope and Production answers 13 tables in
                        6 197 ms, which cannot exhaust a 45–60 s bound. E5 must not be cited as the
                        explanation. R45 (the date-normalisation reduction) likewise describes the SUCCESS
                        path cost and does not explain a timeout; if the capture shows server execution far
                        above 6 197 ms, R45's measurement is the right baseline to compare against — but that
                        is a comparison to make with evidence, not before it.

RECOMMENDED_MINIMAL_FIX NONE AUTHORIZED — the root cause is not established. The candidate SHAPE for M1, for
                        the decision gate only: make the inherited budget visible rather than changing it —
                        a coalesced caller's failure would report `coalesced: true` and the inherited
                        deadline alongside `timeout_ms`. That is additive reporting, changes no policy and no
                        value. Giving each caller its own deadline over a shared request is the larger
                        alternative and is NOT recommended without evidence: it would either abort a request
                        other callers are still waiting on, or require per-caller timers over one promise.

REQUIRED_FILES          If a repair is later authorized: assets/js/api/km-transport.js (scopedSingleFlight /
                        the failure shape), assets/js/api/km-api-foundation.js (the invoke wrapper), and
                        assets/js/pages/inventory-replenishment.js (the dead PREPARING branch). Frontend only.
                        No backend, API contract or DB file is implicated by anything found this round.

REGRESSION_RISK         HIGH for anything touching single-flight. It is what stops two identical 13-table
                        reads per Search, and the duplicate is what reached the bound as METHOD_CATALOGUE_ERROR
                        in an earlier round. Suites that would have to be re-proven:
                        scoped-single-flight-request-correlation-f1-7n-fb-4e-r4a,
                        shared-transport-timeout-classification-...-r3,
                        cold-boot-immediate-navigation-read-reliability-...-r6-r5.
                        LOW for the additive reporting shape above.

DECISION_GATE_REQUIRED  YES. Nothing may be implemented until the §T2 fork is answered with evidence.
```

## §T1.5 — THE SMALLEST SAFE OPERATOR PROBE

`assets/tools/s8-r4d-t1-first-search-transport-probe.js` — one console paste, **no HAR required**.

Zero-write, verified mechanically: no DOM write, no listener, no storage, no network, no page function that
changes state. Not browser-served (nothing references `assets/tools`), so no cache token applies.

It correlates, in one blob: the page's own search/bootstrap/stage state; `KM.transport.metrics()` including
**`coalesced`** and `retries`; and `performance.getEntriesByType('resource')` for every `script.google.com`
and `script.googleusercontent.com` hop with its `startTime`, `duration` and the **gaps between hops**.

Stated limitation: those hosts are cross-origin without Timing-Allow-Origin, so per-phase fields read 0.
`startTime` and `duration` are available and are what the probe relies on; it does not pretend to the rest.

### Procedure

```
1. Reproduce the slow or failed first Search. DO NOT RELOAD — a reload clears both the resource timeline
   and the page's ledger.
2. Paste the probe. copy(__T1__.json) and send the blob.
3. Run it once more after a HEALTHY Search, as a baseline to compare against.
4. Separately: Apps Script -> Executions, the rows covering that minute — status and duration.
```

### What each outcome settles

```
coalesced > 0 beside the failure      M1 fired: the Search inherited the preload's deadline. Compare the
                                      Search click time against the first EXEC hop's startTime.
an EXEC hop with a long duration      the time went to dispatch+queue+execution; the Executions list then
                                      splits queueing from execution.
EXEC short, then a long GAP, then     the loss is on the response hop — the 404 becomes causal.
an ECHO hop
no EXEC hop at all                    the request never left the browser: a dispatch or connection-limit
                                      problem, and the 404 is incidental.
no execution in Apps Script for that   it never reached the backend. Same conclusion, confirmed from the
minute                                 other side.
```

## §T1.6 — NEXT STEP

Nothing is implemented. The next atomic task is prepared only once the capture answers the fork:

* **EXEC slow / Executions slow** → `S8-R4D-T2A — FIRST-LAYER SERVER COST`, compared against the frozen
  6 197 ms baseline and R45's measurement.
* **response hop lost / 404 correlated** → `S8-R4D-T2B — REDIRECT TARGET DELIVERY`, within the existing
  retry policy.
* **never dispatched** → `S8-R4D-T2C — BOOT DISPATCH CONTENTION`.
* **coalesced > 0 and the Search's own wait was short** → `S8-R4D-T2D — COALESCED BUDGET REPORTING`, the
  additive shape in §T1.4, which is the only one of the four that this round has already evidenced.
