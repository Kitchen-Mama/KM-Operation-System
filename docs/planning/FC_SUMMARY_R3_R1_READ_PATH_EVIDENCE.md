# FC-SUMMARY-R3-R1 — FC Summary read path: measurement, root cause, and the read contract

Phase A evidence. Measured 2026-09-20 against production release
`F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R13`, repository at `07c23fd`, read-only, `DB_WRITES = 0`.

This document exists because the incident report reasons from payload size — 210.5 KB of Regular
Forecast, 95% of the bytes — and the round forbids inferring the slow table from size alone. The
measurement does not support that reading, and the design in §3 differs from the one the round
proposed as a result.

---

## 1. What was measured, and with what

Three instruments, all read-only:

| instrument | what it answers |
|---|---|
| timed production reads of `system.health`, `getTable`, `fcSummary.workspace.get` | where the wall time goes |
| the real `handleFcSummaryWorkspaceGet_` + real `fcsWorkspaceDefaultIo_` against a counting Spreadsheet | how many Sheets service calls one logical request makes |
| the real `_fcSummaryEnsureDbAndRender` / `_fcWorkspaceRefresh_` / `_fcRefreshViewNow_` / `_fcAfterWrite` against a counting `KM.api.getWorkspace` | how many logical requests each operator action issues |

The second and third fake only the thing that cannot exist outside its runtime — the spreadsheet, and
the network. Every function that *decides* to read is the committed source.

---

## 2. The measurement

### 2.1 Wall time is dominated by per-request platform cost, not by payload

Four interleaved samples of each probe, medians:

| probe | payload | wall | first hop | delivery hop |
|---|---:|---:|---:|---:|
| **A** no `action` at all — the router refuses, the spreadsheet is never opened | 0.2 KB | **6,289 ms** | 5,589 | 616 |
| **B** `getTable=fc_target_rules` — 2 rows | 1.2 KB | 6,813 ms | 6,341 | 416 |
| **C** `getTable=fc_regular_forecast` — 496 rows | 197.0 KB | 7,982 ms | 7,620 | 405 |

Differencing them:

```
PLATFORM   (A)        6,289 ms    paid by every request before any data exists
OPEN DB    (B - A)      524 ms    opening the spreadsheet and one trivial sheet
496 ROWS   (C - B)    1,169 ms    what the largest table actually costs
```

**The fixed per-request cost is 79% of the largest single-table read, and it is five times the cost of
the 496 rows.** A request that reads nothing and returns 0.2 KB still takes over six seconds.

The observed spread on probe A alone was 3,803 ms to 15,233 ms — a 4× range on a request that does no
work. The 60-second timeout the operator hit is this tail, not a large payload.

### 2.2 The workspace read, decomposed

| | median |
|---|---:|
| wall | 10,444 ms |
| first hop (handler + platform) | 9,499 ms |
| delivery hop (the `googleusercontent` echo) | 481 ms — **4.6%** |
| `meta.serverDurationMs` (the handler's own clock) | 4,734 ms — **45%** |
| unaccounted inside the first hop | ≈ 4,800 ms — platform start, before the handler's clock begins |
| payload | 221.6 KB |

Serialized bytes inside that one payload:

| dataset | rows | bytes | share |
|---|---:|---:|---:|
| `fcRegularForecast` | 496 | 210.5 KB | 95.2% |
| `marketplaces` | 15 | 6.4 KB | 2.9% |
| `fcSpecialEvents` | 4 | 2.9 KB | 1.3% |
| `fcTargetRules` | 2 | 1.2 KB | 0.5% |

The byte distribution in the incident report is correct. Its causal reading is not: those 210.5 KB
cost about 1.2 s of a 10.4 s request.

### 2.3 Requests from one client *do* overlap

Three rounds, two trivial requests each:

```
sequential two-request total (median)   10,047 ms
parallel   two-request total (median)    4,537 ms
gap between the two parallel finishes    1,566 ms
```

Two requests fired together cost roughly one platform floor plus ~1.5 s of queueing. This is the
single fact that keeps a staged contract viable: **slices must be issued in parallel, never
sequentially.** A bootstrap followed by a slice would cost two floors and be slower than today.

### 2.4 One logical request makes 30 Sheets service calls

Counted by running the real handler and real IO against a counting spreadsheet:

| sheet | service calls | of which transfer cells |
|---|---:|---:|
| `fc_regular_forecast` | 7 | **3** |
| `marketplaces` | 7 | **3** |
| `fc_special_events` | 5 | 2 |
| `fc_target_rules` | 5 | 2 |
| — (`openById`, `getId` ×5) | 6 | 0 |
| **total** | **30** | **10** |

10,621 cells transferred. **Six of the ten cell-transferring reads are header rows that the
subsequent `getDataRange()` already contains.** The duplication is structural, not accidental:

- `prodRequireSheet_` reads the header to validate it (`getLastRow`, `getLastColumn`,
  `getRange(1,1,1,lastCol)`),
- `prodRequireColumns_` reads the *same* header again whenever `requiredCols` is non-empty — which is
  true for `fc_regular_forecast` and `marketplaces`, and is why those two are read three times,
- `fcsWsRowsToObjects_` then calls `getDataRange().getValues()`, whose row 0 is that header.

`prodAssertDbTarget_` also re-asserts the spreadsheet id once per table, so `getId()` is called five
times for one spreadsheet.

### 2.5 Logical requests per operator action

Counted by execution at the `KM.api.getWorkspace` boundary:

| action | logical requests | verdict |
|---|---:|---|
| cold mount, nothing in memory | 1 | correct |
| **route re-entry with a valid model still in memory** | **1** | **defect** |
| three Retry clicks in one tick | 1 | already single-flight |
| **post-write reconcile after one saved row** | **1 full workspace** | **defect** |
| late response after routing away | 0 DOM writes | correct |
| failed cold read | model nulled, refusal rendered | correct — not loaded-empty |
| refresh failure over a good model | prior rows kept | correct |

`unmount()` does not clear `_fcReadModel`, so the model *survives* the route change — and
`_fcSummaryEnsureDbAndRender` re-fetches it anyway. This is the operator's third complaint
("second and third route entries remain slow") and it costs a full 10 s request for data the page
is already holding.

Four of the behaviours the round listed as suspected defects — three Retry clicks issuing three
reads, failure becoming empty, a stale model erased on refresh failure, an unmounted response
mutating the DOM — **are already correct**. They become regression gates, not repairs.

---

## 3. Root cause

`ROOT_CAUSE_CLASSIFICATION = I (combination), dominated by A`, in this order:

1. **(A) Per-request platform cost — ~6.3 s median, 4–15 s observed.** The deployed project is 83
   `.gs` files and 4.97 MB of source, all of it loaded and compiled on every execution. This is
   ~60–80% of every request and no payload change touches it.
2. **(F/G) Requests that should not exist.** Route re-entry re-fetches a model already in memory;
   a one-row write triggers a full four-table re-read. Each costs a whole platform floor.
3. **(C) Repeated sheet reads inside one request** — 30 service calls where 14 would do, 6 redundant
   header transfers. This is real handler time inside the 4.7 s the handler owns.
4. **(H) Monolithic payload** — genuine, but worth only ~1.2 s and ~210 KB.
5. **(E) Delivery redirect** — measured at 4.6%. Not a cause.
6. **(B/D) Spreadsheet reads and serialization** — subsumed in 3 and 4.

### 3.1 A finding outside this round's scope, stated because it is the largest lever

Two files in the deployed project are one-shot or demo tooling:

```
TEMP_migrate_request_order_draft_v2.gs        423,324 B
TEMP_demo_shipping_shipment_map_seed_v2.gs    303,295 B
                                              726,619 B  = 14.6% of the project
```

If the 6.3 s floor is dominated by project load and compile — which the size makes likely but which
this round has **not** measured — retiring those two files is a deployment-only change with no code
risk, and its effect is directly measurable by re-running the floor probe afterwards. It is named
here as a proposal, not performed: it is a production deletion and the user owns it. The same
retirement pattern was just completed for `TEMP_migrate_fc_target_rules_header_r2ba2.gs` in R2B-A2-R6.

---

## 4. The read contract

The round's preferred shape is a small bootstrap, then a lazy active-tab slice. The measurement
changes two things about it and keeps the rest.

**Kept.** Bootstrap must be authoritative and must not carry 496 Regular Forecast rows. Inactive tabs
must not be fetched on mount. Post-write must not re-read the workspace. Every refusal must stay a
refusal.

**Changed, on evidence.**

1. **Slices are issued in parallel on a cold mount, not lazily one after another.** Sequential
   staging costs two platform floors (≈13 s) and is slower than the single request it replaces
   (§2.3). The active tab's slice is fired *with* the bootstrap, not after it.
2. **No server-side year/scope narrowing of the row sets.** `58_` is deliberately non-cascading: the
   Year dropdown and every filter universe are built client-side from the *complete* dataset, so
   server-side narrowing would shrink those universes and change what the operator can select. The
   round's own stopping condition — "pagination would change existing calculations" — applies.
   Instead the **facets are computed server-side and returned in the bootstrap**, which preserves the
   universes exactly while removing the need to ship the rows that derive them.

### 4.1 Slices

Served by the existing `fcSummary.workspace.get` through its existing `payload.include`, so no new
routed action and no `01_router.gs` change.

```
BOOTSTRAP    include: { slice: 'bootstrap' }
             fc_target_rules      (2 rows — tiny, and required before the modal may assert NEW)
             fc_special_events    (4 rows — tiny)
             marketplaces         (15 rows — reference)
             facets               distinct years / countries / marketplaces / categories / series / SKUs,
                                  derived server-side from fc_regular_forecast, NOT the rows
             counts, observed_at, slice, request_id, capped
             target <= 25 KB, no fc_regular_forecast rows

REGULAR      include: { slice: 'regular' }        fc_regular_forecast rows
EVENTS       include: { slice: 'events' }         fc_special_events rows
RULES        include: { slice: 'rules' }          fc_target_rules rows only — the post-write and
                                                  "Load latest" path
FULL         include omitted                      today's four-table payload, unchanged, so every
                                                  existing caller and every existing test keeps working
```

`FULL` staying the default is deliberate: it makes the backend change additive and independently
deployable, which the backend-first order requires.

### 4.2 Post-write

A confirmed receipt already merges into `_fcReadModel` through the canonical normalizer
(`_trMergeReceipt_`). Reconciliation therefore needs **no request at all** for the saved entity; where
a scoped confirmation is wanted it is the `rules` slice, never `FULL`.

### 4.3 Route re-entry

The in-memory model is reused and rendered immediately, labelled with its `observed_at`. A background
refresh may follow; it may never blank the rows, and it must label the difference between current and
stale truthfully. This is a cache, so it carries the three things a cache must have: a version key
(`observed_at` per slice), invalidation on every related write, and a stale label.

---

## 5. Measured limits — targets that cannot be met on this platform

Reported as the round requires, rather than met by raising a timeout.

| target | measured reality |
|---|---|
| warm bootstrap median ≤ 3 s | **not achievable.** The floor for a request that reads nothing is 6.3 s median. |
| warm active first slice median ≤ 3 s | **not achievable**, same floor. |
| warm p95 per slice ≤ 6 s | **not achievable**; probe A alone reached 15.2 s. |
| cold first usable FC view ≤ 15 s | plausible — parallel slices land in ≈ 5–8 s when the platform behaves. |
| route shell ≤ 500 ms | achievable; the shell does not wait on a request. |
| cached route return ≤ 250 ms | achievable, and is the largest single improvement available. |
| bootstrap ≤ 25 KB | achievable (~10 KB measured for the three small tables plus facets). |
| first active-tab payload ≤ 50 KB | **not achievable without server-side narrowing**, which §4 rules out on behaviour grounds. The Regular slice is ~197 KB and costs ~1.2 s. |
| 20 bounded reads, 0 unrecovered timeout | see the acceptance run. |

The honest summary: **staging the read buys roughly 2–3 s on a cold mount. Removing requests buys
10 s each, twice.** The second is where this round's value is.

---

## 6. Target Rule modal — what is and is not proven

The round's correction is respected: the third screenshot does **not** prove a production defect, and
no claim here rests on it. `TARGET_RULE_MODAL_PRODUCTION_DEFECT_PROVEN = NO`.

A real state-machine test against the committed chain (`_fcGetTargetRules` → `_trExistingRules_` →
`_trKeyOf_` → `_trClassify_`) does, however, prove a latent fail-open:

| read state | `_trExistingRules_` returns | the classifier reads it as |
|---|---|---|
| successful read, one canonical rule | array of 1 | rows available for matching |
| successful read, genuinely zero rules | **array of 0** | proven-absent → NEW + twelve 100s |
| **read failed, `_fcReadModel` null** | **array of 0** | proven-absent → NEW + twelve 100s |
| **nothing read yet** | **array of 0** | proven-absent → NEW + twelve 100s |
| rows present but not canonical | `_TR_UNAVAILABLE_` | unavailable → fail-closed, blank months |

REFUSED, INITIAL_LOADING and a proven-empty database are **indistinguishable at the classifier**. The
cause is one line: when `_fcReadModel` is null, `_fcGetTargetRules()` falls through to the broad cache,
and the broad cache answers `[]` rather than refusing. `_TR_UNAVAILABLE_` already exists and already
fails closed — it is simply never reached on this path.

This satisfies the correction's clause 4, so `TARGET_RULE_MODAL_RUNTIME_CHANGE = NECESSARY`, scoped to
that fall-through and the enablement that depends on it. Classification, hydration, the canonical key,
the receipt merge, dirty tracking and Save gating are not otherwise touched.

---

## 7. Apps Script owners and stamp impact

| file | in the health manifest? | changes in Phase B |
|---|---|---|
| `58_api_v1_fc_summary_workspace.gs` | **no row today** | yes — slices, single-read-per-sheet, `observed_at` |
| `29_production_safety_adapter.gs` | no row | no — shared by every read owner; changing it is a blast radius this round does not need |
| `63_api_v1_system_health.gs` | self-referential row | only if `58_` is added to the manifest |
| `01_router.gs` | row, R9 | **no** — the action name does not change |
| `90_generated_supply_planning_bundle.gs` | row, content hash | **no** — no bundle rebuild |

`58_` has no manifest row, which means a partial sync of it is currently invisible to
`system.health`. Adding one would make Phase B's deployment provable, at the cost of rotating `63_`
to R14. Recommended, and called out rather than done quietly.

The redundant header read lives in `prodRequireColumns_` (shared), not in `58_`. Phase B therefore
removes the duplication **inside `58_`'s own IO** — by reading each sheet once and validating from the
bytes it already has — rather than by editing a helper every read owner depends on.
