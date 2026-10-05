# S8-R4D-C2 — B3 PRODUCTION PERFORMANCE ACCEPTANCE
## R43 deployed · the round-trip hypothesis, measured

```
S8_R4D_C2_B3_PRODUCTION_ACCEPTANCE = PASS
B3_SEMANTIC_ACCEPTANCE             = PASS
B3_PRODUCTION_PERFORMANCE_EFFECT   = CLEAR
ROUND_TRIP_HYPOTHESIS              = PARTIALLY_SUPPORTED
```

**R43 is faster, and the reason the verdict is "partially" rather than "supported" is the effect SIZE, not its
existence.** Cutting range reads 30 → 13 (−57%) bought −16.3% of median server time, not −57%. Calls carry
real, removable cost; server time is not proportional to them.

---

## 1. Deployment gate

```
PRE_LIVE_RELEASE   R42        POST_LIVE_RELEASE   R43
build_id = deployment_release = workspace_module = system_health = R43
router_build = R41 (carried, unchanged)     contract 18     list_version 14
mixed_deployment false · missing_actions [] · db_reachable true · schema_ready true
deployment_uniformity_verdict  UNIFORM
R43_OWNER_SET = [60_api_v1_inventory_replenishment_workspace.gs, 63_api_v1_system_health.gs]
UNEXPECTED_R43_OWNER_COUNT = 0
```

31 modules probed. The single stamp anomaly — `TEMP_migrate_shipping_allocation_ai_lifecycle.gs` absent, a
known optional migration tool — is **identical before and after** the deployment and was not introduced by it.

## 2. The numbers

```
                       n    min      median   mean     max
R42 today (pre-deploy) 3    19,035   24,216   28,037   40,860
R42 R4C baseline       4    18,328   20,550   20,499   22,569
R42 combined           7    18,328   20,944   23,730   40,860
R43                    5    13,606   17,529   16,680   19,267

R43  13,606 · 15,305 · 17,529 · 17,694 · 19,267        (1 contaminated sample excluded, see §5)
```

```
SERVER_TIME_DELTA   vs R4C baseline    median −3,021 ms (−14.7%)   mean −3,819 ms (−18.6%)
                    vs R42 today       median −6,687 ms (−27.6%)   mean −11,357 ms (−40.5%)
                    vs R42 combined    median −3,415 ms (−16.3%)   mean −7,050 ms (−29.7%)
```

**Taking a fresh same-day baseline is what makes this trustworthy.** Today's Production is much noisier than
during R4C — the same R42 build ranged 19,035–40,860 ms, where R4C saw 18,328–22,569. Had I compared R43
only against the R4C figure I would have measured the platform's mood as much as the change.

### The separation, not just the averages

```
R43's WORST clean sample (19,267) is 1,677 ms BELOW the R42 combined median (20,944)
Only 1 of 5 R43 samples reaches the R42 minimum at all
```

Exact Mann–Whitney U, two-tailed, computed by enumerating the null distribution rather than read off a table:

```
R43 vs R42 (R4C baseline, n=5 vs 4)   U=1   p = 0.0317
R43 vs R42 (today,        n=5 vs 3)   U=1   p = 0.0714
R43 vs R42 (combined,     n=5 vs 7)   U=2   p = 0.0101
```

The today-only comparison is not significant **because n=3 cannot be**, not because the effect is absent — its
direction and magnitude match the others. Pooled, p = 0.0101.

### The mechanism is visible in the per-table timings

```
fc_target_rules    R42  1,958–2,065 ms  (0 rows)   ->   R43  1,038 ms, and usually below the top-5 floor
```

An **empty sheet**, whose range reads went 2 → 1, roughly halved. That is the round-trip model making a
quantitative prediction that came true on the one table where nothing else can explain the cost.

`openMs` also fell (755/415/933 → 218/380/218/329/199), which this change did **not** touch — a reminder that
some of the delta is warm-platform luck, and the reason the verdict leans on the rank test rather than on any
single pair.

## 3. Why "partially supported", and what it means for B1

If server time scaled with range-read count, −57% of calls would buy ≈ −57% of time. It bought **−16.3%**.

```
17 range reads removed  ->  ~3,415 ms median saved  ->  ~200 ms per removed round trip
```

The removed reads were **header-only** (one row). The 13 that remain are **full-sheet** reads whose cost is
mostly the data itself, which no batching removes. So:

* **Weak form — calls carry real, removable overhead: SUPPORTED.** ~200 ms each, measured.
* **Strong form — time is proportional to call count: NOT SUPPORTED.**

**The consequence for B1 is the part worth pausing on.** `batchGet` would take the remaining 13 full-sheet
reads to 1. At the measured ~200 ms per round trip that is **12 × ~200 ms ≈ 2.4 s of a ~17.5 s read (~14%)** —
real, but an order of magnitude smaller than the "30 → 1 = −97% of round trips" framing in R4D-B suggested,
because the bytes still have to travel. And it costs a manifest change, a Cloud project API enablement, the
`getSheets()` pre-step for optional tables, and the loss of per-table timing.

```
B1_BENCHMARK_JUSTIFIED  = YES   (§11's rule: the reduction is clear and repeatable)
B1_ADVANCED_SHEETS_NEXT = YES, as a BENCHMARK AUTHORIZATION PREFLIGHT only
```

Justified — but the preflight must carry the ~2.4 s estimate so the permission decision is made against the
measured prize rather than the structural one.

## 4. Output equality — the change is invisible from the data

```
PRODUCTION_SEMANTIC_DIFF_COUNT = 0

tables                13 -> 13           rowsReturned     7,031 -> 7,031
per-table row diffs   NONE across all 13 tables
daily sales fields    36 -> 36           recentWindow     {before 9777, after 3817, dropped 5960, keep 14} identical
R42_PAYLOAD_BYTES     6,172,486–6,172,496       R43_PAYLOAD_BYTES  6,172,481–6,172,510
```

Payload is materially identical, as it must be: B3 applied **no projection**. So the server improvement
**cannot** be attributed to a smaller response — there isn't one.

```
MAINLINE_NON_REGRESSION_PASS = YES
```

Established by construction rather than by assertion: `f6b4164..41ad256` changes exactly two backend files.
60_'s non-comment diff is confined to `io.readTable` and the row-conversion helpers; 63_'s is two stamps and
two manifest rows. **No write owner changed at all** — not 11_, 12_, 13_, 15_, 16_, 22_, 43_, 46_, 47_, 66_ or
73_. Submit, request-order handoff, purchase-order flow, weekly shipping plan, shipment draft/dispatch, gap
calculation/materialization and business decision source are untouched.

## 5. Transport — recorded, not repaired

```
TRANSPORT_CONTAMINATED_SAMPLE_COUNT = 1        TRANSPORT_VISIBLE_FAILURE_COUNT = 1
Sample 4: HTTP 404, non-JSON body, 53,010 ms wall — EXPIRED_USERCONTENT_REDIRECT
```

Excluded from every timing statistic. It is the same separate reliability defect R4D-A identified, it occurred
during a **50 s-spaced** run rather than a burst, and it is not this round's to fix. `km-transport` untouched.

**§16's optional burst observation was not run.** A bounce already occurred naturally in the spaced run, so a
deliberate burst would add Production load to re-evidence a fact already in hand — and §15 forbids using burst
data for the performance judgment anyway.

```
R43_B3_SOURCE_CONTRACT_LIVE = YES
```

Established as: the live build id is R43, **and** R43's source carries the single-read `readTable`, proved by
the counting harness in `first-layer-redundant-header-read-s8-r4d-c`. Apps Script exposes no runtime
service-call count to a client, so **no runtime call count is claimed from Production** — only the deployment
identity and the source contract behind it.

## 6. Safety

```
PRODUCTION_ROWS_WRITTEN = 0   ROWS_DELETED = 0   SCHEMA_CHANGES = 0   WRITE_ACTIONS_SENT = 0
PROPERTY / DRIVE / TRIGGER / DIRECT_CELL_WRITE_COUNT = 0
GAP_JOB_STATUS_REQUEST_SENT_COUNT = 0   GAP_JOB_START_COUNT = 0   GAP_WRITE_COUNT = 0
server self-report (post-acceptance): read_only true · db_writes 0 · drive_writes 0 ·
                                      status_transitions 0 · emails 0 · demo_mutations 0
POST_ACCEPTANCE_BACKEND_HEALTH_PASS = YES — R43 coherent, owner set unchanged, no stamp mismatch
```

Requests issued this round: 3 health GETs, 3 R42 baseline GETs, 6 R43 sample GETs. All reads, all on the
canonical `inventoryReplenishment.workspace.get` / `system.health` actions.

## 7. What to do next — and a correction to R4D-A's wall-gap reading

```
DAILY_SALES_PROJECTION_STILL_WORTHWHILE = YES for server time · NO on the evidence for wall time
```

The wall-minus-server gap, now at **n=4 across a 1.5× payload range**:

```
6.17 MB   wall 23,498   server 17,529   gap 5,969      (R43 today)
6.17 MB   wall 31,226   server 24,216   gap 7,010      (R42 today)
6.17 MB   wall 26,252   server 19,443   gap 6,809      (R4C in-browser)
3.99 MB   wall 11,797   server  5,507   gap 6,290      (R4D-A 2-table probe)
```

The gap sits at ~6–7 s whether the payload is 3.99 MB or 6.17 MB. R4D-A called this an indication at n=2;
at n=4 it is well supported. **So A+C's ~3.4 MB saving should not be sold as a wall-time fix** — the operator
waits on a cost that is largely fixed. A+C's remaining case is its own ~8% server saving, one file, one
caller, no permission change.

Two candidates now stand side by side, and neither is large:

| | measured/estimated server saving | permission cost | risk |
|---|---|---|---|
| **A+C** daily-sales column projection | ~8% (R4D-A) | none | low — one file, one caller |
| **B1** batchGet | ~14% (~2.4 s, extrapolated at ~200 ms/round trip) | manifest + Cloud API | medium — optional-sheet pre-step, per-table timing lost |

```
NEXT_TASK_PROPOSAL = S8-R4D-D — ADVANCED SHEETS SERVICE B1 READ-ONLY BENCHMARK AUTHORIZATION PREFLIGHT
```

It must open with the measured ~200 ms/round-trip figure and the ~2.4 s estimate, then handle Advanced Sheets
Service enablement, Cloud project API enablement, the manifest change, the optional-sheet pre-step, output
equality and rollback. **Advanced Sheets Service was not enabled and `appsscript.json` was not touched.**

## 8. Open blockers

* `EXPIRED_USERCONTENT_REDIRECT` remains an unrepaired transport defect — 1 occurrence in 6 spaced reads today,
  independent of browser or harness.
* Production timing variance is wide enough (19.0–40.9 s on one build) that any future round of this kind needs
  a same-day baseline; a cross-day comparison would be unsound.
* `main` is still at `f6b4164` while Production backend runs R43. The source/main synchronisation decision is
  deliberately deferred and is the operator's.
