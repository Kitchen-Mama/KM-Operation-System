# S4-R2 — Warm re-entry, listener lifecycle, route recovery

Measured on commit `26bb72d` (before) and on this round's tree (after), in one real browser over the
S3-R11 fixture world, at `serverMs = 400`. Every number below is read from
[`measurements.json`](measurements.json), produced by
[`_s4r2-reentry-runner.js`](../../../assets/tests/_s4r2-reentry-runner.js).

---

## 1 · The headline, and a correction to S4-R1

S4-R1 ranked "five pages re-bind their listeners on every mount and release none" as the one
straightforward repair on its debt list, with FC Summary at **+336 per re-entry** and a process that
went from 31 listeners to 2 049.

**Measured by target, that finding does not hold for three of the five pages.**

S4-R1 counted `addEventListener` minus `removeEventListener` across the whole process. That is a
*call ledger*, not a leak. A handler bound to a table row that `innerHTML` then discards is
unreachable the moment the row is replaced: it costs nothing, it can never fire again, and it is
collected. This round classifies every registration by its target and counts only what is still
reachable — `window`, `document`, or an element still connected to the document.

| page | S4-R1 (call ledger) | live drift / 10 re-entries, before | after |
|---|---|---|---|
| FC Summary | +336 per re-entry | **0** | 0 |
| Overseas Inventory | +74 per re-entry | **0** | 0 |
| Promotion Risk Tracker | +63 per re-entry | **0** | 0 |
| Factory Inventory | +60 per re-entry | **+10** | **0** |
| Forecast | +38 per re-entry | **+250** | **0** |
| SKU Details *(S4-R1 called this the healthy control)* | +1 per re-entry | **+40** | **0** |

The three pages with a real defect were **Forecast**, **Factory Inventory** and — the one S4-R1
held up as correct — **SKU Details**. FC Summary, which led the list, leaks nothing: it rebinds 380
listeners per mount onto rows it has just replaced, and every previous set died with the DOM it was
attached to.

That is worth stating plainly rather than quietly re-scoping: **the page that looked worst was fine,
and the page offered as the model of good behaviour was one of the three that leaked.**

### What actually drifted

| page | type | per mount | binding site |
|---|---|---|---|
| Forecast | `document` keydown | +1 | the Escape-to-close handler in `initForecastReviewPage` |
| Forecast | element click | +6 | date trigger, cancel, apply, backdrop, comparison, unit switch |
| Forecast | element input | +1 | the SKU filter box |
| Factory Inventory | element input | +1 | `#factory-sku-input` |
| SKU Details | element scroll | +4 | `syncSkuHeaderScroll`, one per section column |

All the same shape: bound at mount onto **static markup that outlives the route**, never released.
Forecast's `unmount` explicitly clears `_forecastInitialized` so the charts can be rebuilt, which
means the whole binding block runs again on every return trip. After ten trips one Escape keypress
ran eleven close handlers.

---

## 2 · The repair — listener ownership belongs to the lifecycle manager

`KM.lifecycle.listenerScope(pageName)` hands a page a scope; `switchTo` releases it **after** the
page's own `unmount` hook, so a hand-written `removeEventListener` still wins and the scope only
mops up what is left. A hook that *throws* still loses its listeners, because one broken teardown
must not reintroduce the drift.

It is not an event bus and is deliberately dull: it remembers `(target, type, handler, options)` and
calls `removeEventListener` with the same four. An `AbortController` would be shorter, but an
explicit ledger is what lets the regression suite *count* what is live.

Three pages bind through it. The call sites keep their exact shape — `_fcOwned(x).addEventListener(…)`
— because this is a lifetime fix, not a rewrite of what the pages listen to. Where the lifecycle
owner is absent (a sandbox loading one file alone) the helper binds directly, so behaviour is
unchanged wherever there is nothing to release it.

`LISTENER_DRIFT = 0` · `TIMER_DRIFT = 0` · `DUPLICATE_HANDLER_FIRE = 0`, on all six pages including
the control.

---

## 3 · SKU Regional — what production reported, and what the browser shows

§2 supplied: leave the page, come back, `skuDetails.workspace.get` may fail with
`HTTP_TRANSPORT_ERROR / Failed to fetch`, and Retry may fail repeatedly.

Driven against the real page and the real transport, across the ten scenarios §4 lists:

| scenario | requests | rows | state |
|---|---|---|---|
| A cold open | 1 | 50 | `CURRENT` |
| B leave → immediate return | **0** | 50 | `CURRENT` |
| C leave → wait → return | **0** | 50 | `CURRENT` |
| D rapid A→B→A | **0** | 50 | `CURRENT` |
| E leave mid-flight → return | 1 | 50 | `CURRENT` |
| F refresh fails, no last-good | 2 | 0 | `FAILED_NO_MODEL` + error banner |
| G failure → Retry | 1 | 50 | `CURRENT` |
| H Retry ×2, all failing | 6 | 0 | `FAILED_NO_MODEL` |
| **F2 refresh fails WITH last-good** | 2 | **50** | **`REFRESH_FAILED_WITH_LAST_GOOD`** |
| K 3 failing retries, then recovery | 1 | 50 | `CURRENT` |
| I failure → leave → return | 0 | 50 | `CURRENT` |
| J old answer resolves after newer | 2 | **50** | `CURRENT` |

**SKU Regional already retained its model across route changes** — B, C and D cost zero requests
before this round as well as after. The warm-re-entry half of §1's pilot was already in place; what
was missing was everything about *failure*.

### 3.1 · The defect that was real

`_srdRenderError_` began by nulling the read-model. Every failure was therefore identical: the rows
vanished, the list said "SKU Regional read error", and the only way back was a request that had just
proven it could not be made. When the failure is a **refresh over rows already on screen**, that is
the page destroying good data because of a network problem.

There was no scenario in which rows survived a failed refresh, because there was no branch that
could keep them. Now there is: `LAST_GOOD_MODEL_SURVIVES_REFRESH_FAILURE = YES`, with an amber
non-destructive notice and Retry beside it, and `errorBannerCount = 0` — the page is not in an
error-only state. The no-last-good branch is untouched, including the no-Retry deployment-mismatch
case.

### 3.2 · Freshness, without a TTL

Four named states, because the page now behaves differently in each and a boolean could not tell the
last two apart:

`CURRENT` · `REFRESHING` · `REFRESH_FAILED_WITH_LAST_GOOD` · `FAILED_NO_MODEL`

No timestamp is invented and no TTL exists. The version already in the file is `_srdReadSeq`, and
that is what is reused. **Nothing here decides data has gone stale on its own** — only a read, a
write, or an explicit invalidation moves the state. Retained rows are never reported `CURRENT`.

### 3.3 · An older answer may not win — and why the first fix was not enough

Scenario J serves a *narrow* world slowly, then a full one, so the row count on screen names which
response committed. Before this round it rendered **4 rows**: the pre-invalidation answer.

Two distinct mechanisms produced that, and both had to be closed.

1. **The transport's scoped single-flight** shares an *open* request between callers with the same
   scope. That is right for two mounts asking the same question, and wrong after a write or an
   invalidation, because the request already in the air was dispatched *before* it. The seam for
   this already existed and is documented in `km-api-foundation`: a consumer supplying its own
   `AbortSignal` is never handed a shared request. A forced read passes one. It is never aborted —
   the signal is the ticket, not a cancellation.

2. **The page's own in-flight guard.** `loadAndInit` returned early whenever a read was running, so
   after an invalidation it dispatched *nothing* and let the discarded answer paint. The guard now
   has exactly one exception, and the regression suite pins that it is the only one.

The forced flag is consumed at **dispatch**, not at commit: that read *is* the post-invalidation
read, so a re-mount arriving while it runs may join it normally. Holding the flag until the answer
landed made every interrupted re-entry pay for a second request — measured, and corrected.

`STALE_RESPONSE_COMMIT_COUNT = 0`.

### 3.4 · Retry

With nothing on screen, unchanged: skeleton, one read. With a last-good model on screen, Retry must
mean **refresh**, not re-render — `loadAndInit` would have seen a model, called `render()` and
dispatched nothing, so the button would have looked like it worked and changed nothing. The forced
read is latched so a second click joins the first rather than starting a second.

`RETRY_REAL_NEW_REQUEST_COUNT = 1` · `RETRY_REUSES_REJECTED_STATE = NO` ·
`REPEATED_RETRY_POISON_COUNT = 0` · nothing retries itself.

### 3.5 · What was NOT reproduced

The production report's *repeated* Retry failure did not reproduce as a page defect. Three failing
retries in a row, then a working network, and one read fixes it (scenario K). What the harness can
reproduce is the behaviour *around* a refused request, not the Apps Script container condition that
refuses it. If Retry still fails repeatedly in production after this ships, the cause is on the
server side of the wire and this round has not touched it — but the operator will now be looking at
a page that still has its rows while it happens.

---

## 4 · §11 — ordering, because milliseconds are not

S4-R1 established that the virtual clock freezes during a task, so `*_MS` stays `NOT_OBSERVABLE` and
§11's fallback is what is recorded.

| | requests sent when the section became visible | settled | rows on screen |
|---|---|---|---|
| cold | 0 | 0 | 0 (skeleton) |
| warm | 0 | 0 | **50** |

`SHELL_BEFORE_NETWORK_SETTLE = YES` · `LAST_GOOD_MODEL_BEFORE_NETWORK_SETTLE = YES` ·
`WARM_REENTRY_BLOCKS_ON_NETWORK = NO`.

---

## 5 · §9 — two globals that had not existed for months

`data.js` exposed `getForecastReviewData`, `getForecastReviewDataLastYear` and
`getForecastReviewSummary`. All three read module-level arrays — `forecastReviewData` and
`forecastReviewDataLastYear` — that were deleted with the rest of the mock data. Every call threw
`ReferenceError`, inside a `.then()`, so it surfaced only as an unhandled rejection: **13 in one
census run.**

| | reachable | consequence |
|---|---|---|
| `updateSummaryStats` → `getForecastReviewSummary` | non-demo mode, every mount | the whole summary block below the call never ran |
| `updateAchievementSummary` → `getForecastReviewData` | **both modes**, every mount | category achievement and both top-5 lists never ran |

`PRODUCTION_REACHABLE = YES`. The second has been broken in every mode since the arrays were
removed.

**The owner now.** `fetchForecastSeries` is what supplies this page's data, and its series already
carries every field the summary needs — sales, units, sessions and the three last-year counterparts.
Summing them is the same arithmetic the retired methods did, over data that actually exists. With
Demo off the series is empty and the totals are zero, which is the honest reading; no figure is
invented to fill the gap, and the two fields the retired summary carried but nothing ever read
(buy-box share, page views) are simply not reproduced.

The achievement blocks need **per-SKU rows**, and unlike the summary there is no owner left that
supplies them — the series is aggregated by period. So they ask through one named seam, get none,
and the three renderers already say *"No data available"*. That is the truthful state, reached
without a `ReferenceError`, which is all that ever stood between this page and its own message.
Restoring them needs a per-SKU read that does not exist yet, and it is not invented here.

**No dummy global was created**, which §9 forbids by name. The three methods are retired.

`UNDEFINED_GLOBAL_READ_COUNT_POST = 0` · `UNHANDLED_REJECTION_COUNT_POST = 0` (was 13).

---

## 6 · One instrument fault, corrected mid-round

The first version of the re-entry wait exited as soon as *any* terminal-looking surface appeared,
including the empty box painted during a failure. The page then re-entered its load path and
repainted a skeleton, so readings taken afterwards showed a skeleton plus an open request — and were
read, briefly, as reproducing the production permanent-loading failure. They did not: they were
snapshots taken mid-flight because the harness stopped waiting too early.

Dense fixed-interval sampling of the identical path showed the page producing an error banner and no
skeleton. The wait now requires **no outstanding request for the page** plus the same terminal state
observed three times, and every figure in this document comes from that version. A page still
holding a skeleton is never "settled", which is what makes a genuine permanent-loading finding
possible at all.

---

## 7 · Scope held

- **Not** a global cache, a TTL, a service worker, speculative prefetch or cross-session persistence.
  The retained model is in memory, for the current mount, and nothing was written to `localStorage`.
- The retained-model pilot is **SKU Regional only**. The other eight warm-refetch routes are
  untouched, and the suite asserts it.
- `SKU_REGIONAL_PRICING_SPLIT = DECLINED` — pricing still rides the one read.
- No backend API shape, no `.gs` file, no DB migration.
- Every S4-R1 decision in §10 remains deferred.
