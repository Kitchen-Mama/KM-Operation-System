# S4 — Runtime & perceived-performance baseline (canonical)

**This is the one owner of the S4 runtime contract.** Where another document describes route loading,
first-useful UI, deferred reads, retained models, Retry, expandable SKU detail, listener ownership or
caching policy, it describes history; this describes what the system does now. Sealed at S4-R7.

Per-round evidence lives beside each round and is not duplicated here:
`docs/evidence/s4-r1-performance-baseline/` … `docs/evidence/s4-r7-final-seal/`.

Numbers below are request counts, dispatch counts, DOM outcomes and listener counts by target class.
**Milliseconds are not part of this contract**: under the harness's virtual clock the clock freezes
while a task runs, which S4-R1 measured rather than assumed.

---

## 1. Route-owned code

`index.html` no longer carries every script. `KM_ROUTE_ASSETS_` in `assets/js/app.js` declares, per
route, the scripts and the partial that route owns; the router fetches a set on first entry to its
route, `async = false` so a set runs in its declared order.

- **Boot: 67 local scripts, ~3.87 MB** (S4-R1 baseline 6 035 912 B, so ~36% below it).
- The order is the contract: **shell first, code second, mount third, exactly once.** `switchTo` is
  delayed rather than skipped and runs on both outcomes, so a failed load leaves a visible shell with
  a truthful refusal rather than a half-navigated app.
- A refusal carries a real Retry; a Retry that succeeds **removes** the refusal.
- Duplicate script fetch, duplicate execution and half-mount are all 0.

Route-owned today: Site Inventory, the On-the-Way map family (8 files), Product Strategy.
**Still at boot and deliberately:** `operation-system-db-api.js` (shared infrastructure),
`fc-summary.js` and `request-order.js` (route-owned by ownership, but reached from other pages;
reachability is unmeasured, and UNKNOWN is not authorization).

## 2. First useful UI

Every page's initial read set is the data its first useful screen actually consumes.

- **No page issues 4 or more initial requests. No page pays 3 or more sequential rounds.**
- Two pages read three tables (Factory Inventory, SKU Handbook) and pay **two** rounds, because
  `KM_SCOPED_READ_CONCURRENCY_ = 2`. That bound is a bounded-pressure control, not a latency
  optimisation, and must not be widened for speed.
- Rounds are only meaningful at a non-zero server time. Any census that reports them must say so.

## 3. Deferred secondary reads

`assets/js/core/deferred-read.js` holds the four words a deferred dependency can say about itself —
`NOT_LOADED` · `LOADING` · `READY` · `FAILED` — plus single-flight, sticky FAILED, a one-read
`retry()` and an epoch that refuses a superseded answer.

**It is not a cache.** It stores no business rows and contains no clock. A deferred model is valid
until its *owner* says otherwise; time is not evidence that data changed.

Current consumers: Promotion Risk scope tables, Factory Inventory movements, Carrier lead times,
Order Planning's seven second-layer tables.

## 4. Retained models and error truth

- **FAILED must never render as EMPTY.** A refused read renders a message naming the failure; the
  page does not fall back to demo content, to a broad read, or to an empty state that looks like a
  result.
- A failed **refresh** does not destroy a last-good model the page had already painted.
- Distinct states get distinct presentation. Loading, failed, unavailable and proven-empty are four
  different things and must not share one class.
- A refusal that is rendered must be *styled*: a class with no CSS rule is a refusal nobody sees.

## 5. The Retry contract

Every page whose primary read can fail offers a Retry, and every Retry:

1. calls **that page's existing canonical read owner** — no page carries a second read implementation;
2. replaces the refusal with a loading acknowledgement *before* dispatching, which is both the
   feedback and the reason a second click cannot double-dispatch;
3. issues exactly one canonical read;
4. clears the refusal on success and stays retryable on repeat failure.

18 retry surfaces. `RETRY_NO_DISPATCH = 0`, `RETRY_STORM = 0`, `MISSING_RETRY_CONTROL = 0`.

## 6. Expandable SKU detail — the no-N+1 rule

For master → expandable-SKU operational workspaces, the second-level detail a user normally opens
**must already be in the current workspace model**. Expanding a SKU costs **zero** network requests
and does not block on the network.

- `PER_SKU_EXPAND_REQUEST_COUNT = 0` · `N_PLUS_ONE_EXPAND_PATTERN = FORBIDDEN`.
- Visually collapsed does **not** mean secondary. Classification follows user workflow, not DOM
  visibility.
- Genuinely separate deep features — movement history, audit, documents, long-range analytics, a
  rarely-used detail drawer — may still be deferred if proven separately.

**Scope preparation, not lazy loading.** Where second-level data is not in the primary read, it is
prepared for the *searched scope* when the rows reach the screen — one read per distinct site, never
one per SKU, never started by an expand. The first layer is never blocked by it, a failure leaves the
first layer intact and exposes one scoped Retry, and a preparation that has been invalidated stops
dispatching as well as stops committing. Order Planning is the worked example.

## 7. Listener and timer ownership

Drift is the **marginal** cost of one more visit — cycle 3 minus cycle 2 across mount/unmount cycles,
with listeners classified by target. A handler on a detached element is collectable and is not drift;
first-mount registrations are a fixed cost no amount of navigating repeats.

Every registration bound to an element that survives a re-render must be bound **once**, guarded on
the element itself (`el._xBound`). `_roRenderAll`-style functions run on filter changes as well as on
mount, so an unguarded binding grows with *use*, not with navigation.

All 21 routes: listener drift 0, timer drift 0, open requests 0.

## 8. Caching policy

Forbidden without an explicit operator decision: a global business cache, any TTL, a service worker,
speculative prefetch, cross-page stale model sharing, per-SKU N+1 detail loading.

What exists instead: an **open-request share** in the transport (evicted on either outcome, so nothing
is retained after settlement), and per-scope models owned by the page that read them and invalidated
by that page's own write/recalculation owners.

Scope preparation for an explicitly searched scope is **not** speculative prefetch: the data is the
operational detail of rows already on screen, for sites the operator named.

## 9. Standing runtime counts

```
USER_VISIBLE_ROUTE_COUNT        21
FALSE_EMPTY_PAGE_COUNT           0     PERMANENT_LOADING_PAGE_COUNT     0
STALE_RESPONSE_COMMIT_COUNT      0     LISTENER/TIMER_DRIFT_PAGE_COUNT  0
PER_SKU_EXPAND_REQUEST_VIOLATION 0     N_PLUS_ONE_EXPAND_VIOLATION      0
PAGES_WITH_4PLUS_INITIAL_REQ     0     PAGES_WITH_3PLUS_INITIAL_ROUNDS  0
ZERO_READ_WARM_REENTRY          13     WARM_REFETCH_ROUTES              8
```

The eight warm-refetch routes each re-read business state another page can write. None was removed:
freshness is `UNKNOWN` for all eight, and a read is not deleted to improve a number.

## 10. Monitored debt

- `fc-summary.js` (476 KB) and `request-order.js` (357 KB) remain at boot; their reachability from
  other pages has not been measured.
- Order Planning's scope preparation costs one read per site on screen. An All-level search over many
  sites therefore prepares many — bounded by the shared read concurrency, paid at Search, never at
  expand.
- Pre-existing: the A0 §G.9 operator-label ban is violated at `carrier-rate-card.js:840`, present
  since `fb55213`. Not a runtime defect and untouched by S4.
