# S4-R7 — Order Planning L2 scope preparation, Retry closure, S4 final seal

**Base** `049bdbd` · measurements in `measurements.json` · the standing contract is
`docs/planning/S4_RUNTIME_PERFORMANCE_BASELINE.md`

Request counts, dispatch counts, DOM outcomes and listener counts by target class are authoritative.
Milliseconds are not.

---

## Order Planning: the second level is prepared for the searched scope

**Before.** Expanding a row started two things: the seven-table second-layer read
(`refreshCacheTables`) and a materialized gap read for that row's site. Neither was N+1 per SKU — the
tables were once per page, the gap once per site — but both made the first expand wait on the network,
which is what the operator rule forbids.

**After.** When Search puts rows on screen, the page prepares the second level for the sites those
rows name: the seven tables once, and one `orderPlanningGap.get` per distinct
company|country|marketplace. An expand consumes that and sends nothing.

```
sites prepared on Search            12      gap reads per site                1
seven-table reads                    7      max requests per L2 table         1
second Search, same sites            0      tables re-read                    0
two preparations in one task        12      (one per site, not two)
first expand                         0      second expand   0      third expand   0
expand after a recovered failure     0
```

`L2_PREFETCH_OWNER = _opPrefetchL2ForCurrentScopes_` ·
`L2_SCOPE_KEY = _roScopeKey3_ (company|country|marketplace)`

**The scope vocabulary is the page's own.** `_roScopesFromLoadedData_` has enumerated the concrete
sites in the searched rows since R6B1, and `_roScopeKey3_` has spelled their key for just as long —
the persisted-draft hydrator uses both. Inventing a second notion of "scope" would have given this
page two answers to the question of what it is looking at.

**One site had two keys for a while, and that is worth recording.** The store wrote `_roScopeKey3_`;
the consumer read a `JSON.stringify` spelling it had always used. The lookup never hit, so every first
expand still paid for a site that was already in memory — with twenty-three requests having just
prepared it. The measurement said `1st = 1` and the cause was a key, not a missing read.

**Bounded, not fanned out.** An All-level search can name a dozen sites. The preparation runs at the
shared `KM_SCOPED_READ_CONCURRENCY_` width, read from its owner rather than copied, because unbounded
client fan-out is the peak-pressure problem that bound exists to hold down.

**No clock.** The store has no `setTimeout`, no `Date.now`, no TTL. It is valid until an authority that
could have changed those rows says otherwise, and there are two, both pre-existing:
`refreshOrderPlanningGapAfterRecalc_` (the gap recalculation job finishing) and `_roReloadAndRerender`
(a second-layer FC / Target write).

### The first layer never waits

`FIRST_LAYER_BLOCKED_BY_L2_PREFETCH = NO`, measured at the only moment that can answer it: 50 rows on
screen **with requests still open**. The expand handler no longer loads at all — it reads the state
and, only while a preparation is already running, attaches to it. Attaching costs no request; the
deferred-read helper returns the flight that exists.

### Failure isolation

```
site reads refused                  12      rows still on screen             50
requests left open                   0      scoped Retry reads               12  (one per site)
rows after Retry                    50      expand after Retry                0
```

A refused site read leaves the first layer alone and reports itself in the panel. The Retry is
scope-level; there is no per-SKU retry request anywhere.

### Superseded preparations

`STALE_L2_SCOPE_COMMIT_COUNT = 0`, measured with three reads genuinely in flight at the moment of
invalidation.

Guarding the **commit** alone was not enough and the first measurement said so: with a bounded width,
most of a scope list is still undispatched when an invalidation arrives, so the superseded run went on
to read and store ten further sites. The worker now checks the epoch before each dispatch and stops.

## The six missing Retry controls

`MISSING_RETRY_CONTROL_COUNT_PRE = 6` → `POST = 0`. Each calls the page's own canonical read owner;
no page grew a second read implementation.

| Page | Error owner | Canonical entry |
|---|---|---|
| Order Planning | `_opFirstLayerError_` | `_opLoadFirstLayerComposer_()` |
| Shipment Draft / Overview | `_shRenderError_` | `_shLoadAndRender()` |
| Request Order Draft | `_roRenderError_` | `loadAndRender()` |
| Purchase Order Workspace | `_poRenderError_` | `loadAndRender()` |
| Purchase Order Overview | `_polRenderError_` | `loadAndRender()` |
| SKU Details | `_skRenderError_` | `_skLoadAndRender()` |

Each replaces the refusal with "Retrying…" *before* dispatching. That is the loading feedback §9 asks
for and also why a second click cannot double-dispatch: the button it would need is gone. If the read
fails again the page's own error owner rebuilds the box, button and all — so a repeat failure stays
retryable with no busy flag to leak.

SKU Details excludes a `DEPLOYMENT_MISMATCH` from the Retry deliberately: a new Apps Script version has
to be published first, so a Retry there would be a button whose one honest outcome is the same error.

`RETRY_SURFACE_COUNT = 18` · `RETRY_NO_DISPATCH = 0` · `RETRY_DUPLICATE_DISPATCH = 0` ·
`RETRY_STORM = 0` — every one recovers.

## Inventory Replenishment (§7 — verified, not assumed, and not touched)

```
IR_EXPAND_CONTRACT_PASS = YES     rows 120     expand 0 / 0 / 0
detail present in the click's own task = YES
```

## What did not change

Order Planning still mounts on its three pre-existing reads — `getTable:marketplaces`,
`aiPlanFirstLayer.get`, `requestOrderDraft.getActive` — and the preparation does **not** run before
Search. The probe now records three where S4-R6's probe recorded two; the third is a read S4-R6's own
*census* already recorded on this page, and the probe simply used to sample before it was dispatched.
Nothing was added to the mount.

Boot is unchanged at 67 scripts; no code-splitting happened here. Warm re-entry is unchanged at 13
zero-read / 8 refetch, and none of the eight was touched.

## Mutation

Seven planted defects, all killed. Two needed correcting first, and both corrections are the same
lesson twice:

**H7 could not fail.** The obvious mutant — call the page's reader twice — produces **one** request,
because the shared transport collapses two identical simultaneous workspace reads. The mutant was
inert, which reads as coverage while proving nothing. This is the third round in which a defence here
turned out to be doubled. The realistic defect is a Retry that does *more* than the canonical read — a
second read with a different include, which the transport cannot collapse because it is a different
question. Verified by hand before being planted.

**S4-R6's K4 was retired rather than left standing.** It broke the in-flight promise in
`_roEnsureL2Tables` to prove that repair mattered. This round moved the load out of the expand handler
entirely, so the line K4 broke is now unreachable fallback: the mutant stopped being a mutant and was
recorded as SURVIVED, which reads as a missing defence rather than a defence that moved. The claim —
one second-layer load however many callers ask for it — is asserted here instead, against the
mechanism that now carries it, with a probe that starts two preparations in the same task.

Two suite rules also had to be corrected before they were measuring anything: one sliced a fixed 2200
characters from the start of a function and read past its end into a neighbour, and one grepped raw
source for `refreshCacheTables` and found it in the **comment** explaining that the handler used to do
exactly that. S4-R5 nearly lost a round to that same comment-versus-code mistake.

## S4 final seal

All eleven conditions met and each read from a measurement rather than asserted:

21 routes audited · six Retry controls closed · individual SKU expand costs zero · no N+1 ·
no listener or timer leak · no request storm · no false empty · no permanent loading ·
no stale response commit · no Retry that fails to dispatch · first layer never blocked.

`S4_FINAL_SEAL = YES`
