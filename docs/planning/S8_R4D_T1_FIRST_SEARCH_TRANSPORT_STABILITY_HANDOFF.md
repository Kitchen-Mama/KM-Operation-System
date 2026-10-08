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
