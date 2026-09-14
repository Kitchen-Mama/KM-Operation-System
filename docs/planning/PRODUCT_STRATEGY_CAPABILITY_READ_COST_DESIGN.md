# PATH B — THE CAPABILITY READ COSTS A SCHEMA CENSUS IT NEVER LOOKS AT

**P1-B8D-R10B evidence · P1-B8D-R10C design · 2026-09-14 · DESIGN ONLY — NOTHING HERE IS IMPLEMENTED**

No `.gs` file was changed by the round that wrote this document, no Apps Script deployment was
created, and no server behaviour was altered. This is a proposal to be accepted, amended or refused.

---

## 1 · The evidence this design is built on

Measured at R10B against `7bd5af2` on real GitHub Pages, real Chrome, the real shared transport, 60
serial reads, 20 per action, plus a user-performed Apps Script execution-log correlation.

| | `system.health` | `siteUniverse.get` | `workspace.get` |
|---|---|---|---|
| `server_ms` p50 | **6 271 ms** | 1 484 ms | 5 631 ms |
| `server_ms` p95 / max | 9 685 / 9 685 | 2 233 / 2 233 | 7 502 / 7 502 |
| browser elapsed p50 | 10 881 ms | 6 440 ms | 10 246 ms |
| non-handler remainder p50 | 4 763 ms | 4 712 ms | 4 746 ms |
| spreadsheet opens | 1 | 1 | 1 |
| sheet round trips (static) | **~52** | ~9 | ~49 |
| full-table reads | **0** | 1 | 6 |
| rows returned to the caller | **0** | site list | listing rows |

Execution correlation, window 13:37:07–13:49:15: **61 expected `/exec` visits, 61 observed `doGet`
executions, difference 0.** All 61 Completed; 0 Failed; 0 Timed out; Apps Script UI duration
3.478 s – 13.91 s.

**The single fact this design exists for:** the cheapest question the page asks — *may I offer this
feature?* — is answered more slowly than the read that returns six full tables of listing data. It
reads no rows at all. Its cost is `SYS_SLICE_TABLES_`: a 17-table schema census of the **shipping**
slice, which has nothing to do with Product Strategy, executed on every capability read.

Two boundaries that must not be conflated, and are kept apart everywhere below:

* `server_ms` is what the handler measured on its own clock.
* Apps Script UI duration (max 13.91 s) is the platform's own boundary and includes work outside it.
* The browser's `/exec` elapsed is Google ingress/queue **plus** execution **plus** the redirect
  response. The ~4.7 s remainder is real, is constant across all three actions, and **this design
  does not claim to know what it is made of.** It is PATH C/D territory and is out of scope here.

---

## 2 · B1 — capability endpoint decoupling

### The question

Should Product Strategy learn one boolean from a full, expensive `system.health`?

### What already exists — and this is the whole answer

`handleGetClientCapabilities_` (`03_master_data_handlers.gs:21`) is a **pure configuration read**.
Measured statically across the whole corpus: **0 SpreadsheetApp, 0 DriveApp, 0 PropertiesService,
0 CacheService, 0 LockService, 0 sheet round trips.** It returns four flags:

```
capabilitiesVersion, requestOrderDraftV2FlatCutover,
requestOrderSiteConfirmRequired, inventoryAiPlanDbGenerationEnabled
```

It is **already deployed**, **already routed on both verbs**, **already on the shared transport's
read allowlist** (`km-transport.js:546`), and **already read once at application bootstrap** by
`KM.DB.applyClientCapabilities`. Three of its four fields are exactly the kind of thing
`product_strategy_enabled` is: a deployment feature flag resolved from `00_config.gs`.

### The options, compared

| Option | New action? | New flag? | Capability authority | Cost of the capability read |
|---|---|---|---|---|
| **B1-a — carry the flag on the existing `getClientCapabilities`** ✅ **RECOMMENDED** | no | **no** | unchanged: `productStrategyEnabled_()` stays the one resolver | **0 sheet round trips** |
| B1-b — a `cheap` mode argument on `system.health` | no | no | unchanged | 1 open + 0–3 round trips, but a health answer that is not a health answer |
| B1-c — a new `productStrategy.capability.get` action | **yes** | no | unchanged | 0 round trips, and a fourth door to keep in step |
| B1-d — leave it as it is | no | no | unchanged | ~52 round trips per read |

**B1-a is recommended** and the reasons are in the measurements, not in taste:

1. It adds **no action**. §2 of the migration plan and every S-series rule forbid a new door where an
   existing one answers the question.
2. It adds **no fourth flag**. `PRODUCT_STRATEGY_ENABLED_` in `00_config.gs` remains the single
   authority; `productStrategyEnabled_()` remains the single resolver. The payload carries the same
   answer to one more consumer — which is precisely what the other three flags already do.
3. The page already pays for this request. `getClientCapabilities` is fetched at bootstrap on every
   page load, measured at R10B, on the same transport. Product Strategy would be reading an answer
   that has **already arrived** rather than issuing a second, expensive question.
4. It does not change what `system.health` is. Health stays the full, honest deployment probe for the
   people and the tooling that want exactly that.

**B1-b is not recommended.** A `cheap` mode makes `ok` mean two different things depending on an
argument, and the field most likely to be misread is the one a caller did not ask to be computed. If
B1-a is refused, B1-b is the fallback, and then `ok` must be **absent** in cheap mode rather than
optimistic — never `true` for a census that was not run.

**B1-c is not recommended** while B1-a is available: a new action is a new row in the S-series
inventory, a new entry in the transport allowlist, a new required-action assertion in `system.health`
itself, and a new thing that can be half-deployed.

### What B1-a does NOT solve

The page would still need `system.health` for deployment diagnostics, and `system.health` would still
cost ~52 round trips **for whoever calls it**. That is B2.

---

## 3 · B2 — the schema census inside `system.health`

### What it does today

```
handleSystemHealth_
  SpreadsheetApp.openById(prodExpectedDbId_())          1 open
  sysSchemaReadiness_(ss)                               for each of 17 SYS_SLICE_TABLES_:
                                                          getSheetByName + getLastRow + getLastColumn
  sysRouterReadiness_ / sysModuleBuildStamps_           in-memory
```

No cache anywhere. No lock. Read-only: **0 write tokens in the reachable set** — confirmed.

### Four candidate reductions, each independently adoptable

| | Change | Round trips saved | Correctness risk |
|---|---|---|---|
| **B2-1** | The 17-table census becomes **caller-scoped**, using the `probe_actions` / `probe_symbols` seam `sysProbeRequested_` already has. A caller that asks for nothing gets no census. | up to 51 | The default answer changes shape. `all_present` must become **`null`/absent** when no census ran, never `true`. |
| **B2-2** | `CacheService` the census under a key of `deployment_release` + the schema's own fingerprint, TTL bounded (≤ 300 s). | up to 51 on a hit | A stale cache must never be able to say "healthy". See §4. |
| **B2-3** | Drop `getLastColumn()` where only presence is needed; `getSheetByName` alone answers "is the table there". | up to 17 | `header_count` disappears from the answer — a contract change for whoever reads it. |
| **B2-4** | In the ppw reads: the header row is fetched **twice per table** (`prodRequireSheet_` then `prodRequireColumns_`), and `assertExpectedSpreadsheetId` runs **per table** rather than per request. | ~2 per table: ~12 on `workspace.get`, ~2 on `siteUniverse.get` | Touches the shared production-safety adapter, which every write path also uses. **Highest blast radius of the four; do it alone or not at all.** |

**Recommended order: B2-1, then B2-2. B2-3 only if a reader of `header_count` can be shown not to
exist. B2-4 is a separate round with its own evidence** — it is in the safety layer, and the reads are
not the only consumer.

### Does health need to scan 17 tables at all?

Those tables are the **shipping** slice. They were added so a partial Apps Script sync would be
visible. That purpose is real, and B2-1 keeps it: the sync check becomes something a caller asks for
— the deployment tooling asks and pays; a page asking "is this feature on" does not.

---

## 4 · B3 — correctness and observability

Non-negotiable for any of the above:

* **Response contract unchanged for existing fields.** No field changes type or meaning. A field that
  was not computed is **absent or null**, never a default.
* **Capability authority does not split.** `PRODUCT_STRATEGY_ENABLED_` stays the one flag,
  `productStrategyEnabled_()` the one resolver. B1-a adds a consumer, not an authority.
* **A stale cache may never claim health.** Any cached census carries the `deployment_release` it was
  computed under; a mismatch is a miss, not a hit. A cache hit must be **visible in the response**
  (`schema_cached: true` plus the age), because a health answer that cannot say how old it is cannot
  be used to clear a deployment.
* **Invalidation on the events that can make it wrong:** a new deployment version, a change to
  `SYS_SLICE_TABLES_`, and TTL expiry. A schema change made directly in the spreadsheet is NOT one of
  those events, which is exactly why the TTL must be short and why B2-1 (ask for it) is preferred over
  B2-2 (remember it).
* **Zero writes.** All three reads are read-only today and must stay so; the R10C suite and the
  deployment-boundary suite both already assert this.
* **Correlation stays possible.** `server_ms`, the action echo and `request_id` must survive any
  change — they are what made R10B's attribution possible at all.
* **Rollback** is unchanged and independent: `PRODUCT_STRATEGY_ENABLED_ = false`, save, new version,
  update the deployment. No frontend deploy needed to roll back.

---

## 5 · Expected effect, stated as a prediction to be measured

| | today (measured) | after B1-a (predicted) |
|---|---|---|
| Product Strategy capability read | `system.health`, `server_ms` p50 6 271 ms, ~52 round trips | a field on a bootstrap read the page already makes: **0 additional round trips, 0 additional requests** |
| first paint of the board | capability + universe serially | universe only |

**This is a prediction, not a result.** It is falsifiable in one way: after the change, the same
20-read probe must show the Product Strategy page issuing **no `system.health` request at all**, and
the board's time-to-first-refusal-or-data dropping by roughly the capability read's current total.

---

## 6 · What would have to change, and what it costs to ship

| | B1-a | B2-1 | B2-2 |
|---|---|---|---|
| `.gs` files | `03_master_data_handlers.gs` (one field) | `63_api_v1_system_health.gs` | `63_api_v1_system_health.gs` |
| frontend | `km-product-pricing-workspace.js` reads the flag from the bootstrap answer; `product-strategy-board.js` unchanged | none | none |
| `APPS_SCRIPT_SYNC_REQUIRED` | **YES** | YES | YES |
| deployment version | **YES** | YES | YES |
| `FRONTEND_DEPLOY_REQUIRED` | **YES** — coupled with the server change | no | no |
| coupled cache token | **YES** | no | no |

**B1-a is a coupled two-sided change and its transition must be designed, not assumed.** Between the
server sync and the frontend deploy, the server carries the new field and the old frontend still reads
`system.health` — which keeps working, because nothing is removed. The order is therefore: **server
first, frontend second, and `system.health` keeps answering `product_strategy_enabled` for at least
one full round after.** Removing it from health is a later, separate decision.

### Tests and mutants this would need

* the flag appears in `getClientCapabilities` and equals `productStrategyEnabled_()` — one resolver, asserted
* the accessor prefers the bootstrap answer and still accepts health's field during the transition
* a bootstrap answer that is missing the field is NOT "disabled" — it is "not heard", the exact
  R10A distinction, and the same fail-closed-but-not-latched rule applies
* mutants: the flag hard-coded true; the flag read from a second source; a cached census reported as
  fresh; `all_present` true when no census ran; the transition fallback removed too early

### Live acceptance gate (proposal, not a result)

After the server sync and the frontend deploy, on real Pages: 20 board loads; assert **0**
`system.health` requests from the Product Strategy page, capability still correct against a deliberate
`PRODUCT_STRATEGY_ENABLED_ = false` toggle and back, and the R10B timing probe re-run to compare
`server_ms` and the non-handler remainder against §1.

---

## 7 · Status

**Superseded in part by P1-B8D-R10D, 2026-09-14. B1 is implemented and committed locally; B2 is
unchanged and remains design only.**

```
B1  capability endpoint decoupling
    IMPLEMENTED         YES — P1-B8D-R10D (local commit; see DEPLOYMENT_RELEASE_LOG.md)
    .gs CHANGED         1 — 03_master_data_handlers.gs, ONE added field
    DEPLOYED            NO — server-first sync is the USER's, and has not happened
    LIVE GATE           NOT RUN on R10D deployed bytes

B2  the schema census inside system.health
    IMPLEMENTED         NO — design only, and deliberately so
    .gs CHANGED         0
    RUNTIME CODE        none written
    APPROVED            PENDING USER DECISION

P1 CLOSED               NO
S2 RUNTIME ALLOWED      NO
```

### What R10D took from this document, and what it left

Option **B1-a** is what shipped, in the shape §2 proposed and with nothing added to it: one field on
`handleGetClientCapabilities_`, resolved from `productStrategyEnabled_()` — which is
`PRODUCT_STRATEGY_ENABLED_ === true` — with no new action, no new flag, no new constant and no new
property authority. The browser's capability now arrives on the bootstrap the application already
performs once per page life, and Product Strategy dispatches nothing of its own for it.

§3's reductions were **not** touched. No `SYS_SLICE_TABLES_` change, no caller-scoped census, no
`CacheService`, no stale-cache policy, no `prodRequireSheet_` / `prodRequireColumns_` /
`ppwRowsToObjects_` refactor, no header-read elimination, no per-request spreadsheet-identity change.
`system.health` answers exactly what it answered before, to exactly the callers it had before, at
exactly the cost it had before. What changed is that Product Strategy is no longer one of them.

### The prediction in §5 is still a prediction

§5 states an expected effect. R10D removes one `system.health` read per Product Strategy page life,
which is the mechanism §5 names — but the measured p50 in §1 was taken on live GitHub Pages against a
live deployment, and **no such measurement has been taken on R10D's bytes**, because they are not
deployed. Nothing in §5 may be read as a result until the live reliability gate runs.
