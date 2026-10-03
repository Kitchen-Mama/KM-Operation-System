# S8-R3A — Read-Path Fatigue DB Touch Preflight

**Status:** PREFLIGHT ONLY — awaiting operator DB approval. No fatigue executed, nothing written, nothing deleted.
**Governed by:** [S8_STANDING_DB_AUTHORIZATION_GATE.md](S8_STANDING_DB_AUTHORIZATION_GATE.md).

```
S8_R3_PLANNED_SURFACE_COUNT = 11
S8_R3_READ_TABLE_COUNT      = 44
S8_R3_WRITE_TABLE_COUNT     = 0
S8_R3_DELETE_TABLE_COUNT    = 0
PRODUCTION_ROWS_WRITTEN     = 0      PRODUCTION_ROWS_DELETED = 0      PRODUCTION_FATIGUE_EXECUTED = NO
READ_ENDPOINT_WITH_WRITE_SIDE_EFFECT_COUNT = 1     ← §3. This is a STOP.
```

Every table list below is taken from the owning handler's **own declared `*_TABLES_` constant** in
`assets/specs/active/apps-script/`, not inferred from call sites and not recalled.

---

## §1 — Two findings that gate this round

### 1.1 — `gapJob.status.get` is a read endpoint that can mutate — **STOP**

It sits on the router's GET read table, and the R4A1 suite proves every action there performs zero write
primitives when executed. **That proof is conditional on the state the action is executed against**, and the
condition is not met in the test:

```
gapJobStatus_ (46_:611-640)
  if (gapJobStaleNonterminal_(state, now))            // a non-terminal job with no recent progress
     ├─ gapJobMarkStalled_      → gapJobWriteState_ → PropertiesService.setProperty   (persists STALLED)
     └─ gapJobRearmRecovery_    → env.clearContinuationTriggers()  → ScriptApp trigger DELETE
                                → env.scheduleContinuation()       → ScriptApp trigger CREATE
                                   └─ the continuation worker runs gapProcessScopeSlice_ (43_)
                                      └─ gapUpsertByKey_ WRITES inventory_replenishment_gap / order_planning_gap
```

So polling a gap job's status can, under one specific precondition, **re-arm a worker that writes the two
tables S8-R2 declared off-limits.** Read-path fatigue is repeated polling, which is exactly the shape that
meets that precondition.

The task says: *"If any read endpoint can mutate: STOP. Do not redefine it as read-only."* So it is not
redefined. Three options, operator's call:

| | Option | Consequence |
|---|---|---|
| **A** | **Exclude `gapJob.status.get` from S8-R3** *(recommended)* | the job-polling read path is untested; everything else proceeds |
| B | Include it, having first confirmed no gap job is in a stale non-terminal state, and re-confirming between cycles | narrow but real residual risk — a job can become stale *during* the run |
| C | Include it and accept gap writes | contradicts the S8-R2 §6 exclusion; not recommended |

### 1.2 — Two unregistered tables are read by shipped Phase-1 surfaces — **DECLARED under §7**

| Table | Read by | Required? | Consequence |
|---|---|---|---|
| `supplier_price_list` | `requestOrder.workspace.get` (`51_:36`, `requiredCols: ['sku']`), `leadTime.raw.get` (`55_`) | **REQUIRED** | the owner fails closed without it — Request Order and the lead-time read **cannot be exercised at all** while it is unauthorized |
| `amazon_inventory_health_snapshot` | `inventoryReplenishment.workspace.get` (`60_:63`, `optional: true`) | optional | the surface degrades rather than failing — Site Inventory can run without it, but the run would not be measuring the shipped read |

Both are among the operator's 43 observed extra tabs. Neither is a surprise. **READ approval is requested for
both; no write is requested for either.** If `supplier_price_list` READ is declined, surface 7 (Request Order)
drops out of S8-R3 entirely.

---

## §2 — Surface audit

Cold / warm request counts are **not yet measured** — measuring them is S8-R3's job, and inventing them here
would be the arbitrary acceptance numbers §8 forbids. What is stated is the shipped structure.

| # | Surface | Page | Primary read action | Owner | Tables |
|---|---|---|---|---|---|
| 1 | FC Summary | `fc-summary.js` | `fcSummary.workspace.get` | `58_` | 8 |
| 2 | SKU Details | `sku-details.js` | `skuDetails.workspace.get` | `59_` | 6 |
| 3 | SKU Regional Details | `sku-regional-details.js` | `skuDetails.workspace.get` | `59_` | 6 |
| 4 | Factory Inventory | `factory-stock.js` | `rawInventory.get` + `factoryStockGuard.get` | `54_`, `71_` | 4 + 1 |
| 5 | Overseas Inventory | `overseas-stock.js` | `overseasStock.workspace.get` | `70_` | 4 |
| 6 | Weekly Shipping Plan | `shipping-plan.js` | `weeklyShipping.workspace.get` + `factoryStockGuard.get` | `40_`, `71_` | 5 + 1 |
| 7 | Request Order | `request-order.js` | `requestOrder.workspace.get` | `51_` | 6 — **includes `supplier_price_list`** |
| 8 | Shipment Draft / Overview | `shipping-history.js` | `shipment.workspace.get` | `57_` | 11 |
| 9 | On-the-Way Map | `global-logistics-map.js` | `shipment.workspace.get` | `57_` | 11 |
| 10 | PO Overview | `purchase-order-overview.js` | `purchaseOrder.workspace.get` + `openPoRemaining.raw.get` | `50_`, `52_` | 5 + 2 |
| 11 | Site Inventory / Replenishment | `inventory-replenishment.js` | `inventoryReplenishment.workspace.get`, `recommendation.workspace.get`, `inventoryReplenishmentGap.get` | `60_`, `42_`, `43_` | 21 + 2 |

**Carrier Rate Card** is deliberately absent. Its page reaches `carrierLeadTime.upsert`, a write, and no
scoped read owner publishes its rate-card surface; folding it into a read-only round would require either a
write or an unexamined path. It moves to S8-R4.

### Cache behaviour and deferred reads

- **Three cache-token families**, all application-level and all frozen: `ROUND_TOKENS` (`assets/tests/_release-order.js`,
  append-only; newest is the current app token), `MAP_TOKEN_SERIES`, and the Site Inventory CSS series. The boot
  suite's H17 refuses a fourth. Cold vs warm here means *Apps Script project load + compile*, not a server cache.
- **Boot read ordering** is arbitrated by `assets/js/core/boot-read-arbiter.js` — a client timeout starts at
  dispatch, so a read racing the boot reads spends its own budget queueing. S8-R3 must measure with the arbiter
  in its shipped configuration, not bypass it.
- **Deferred reads exist** and are in scope: `factoryStockGuard.get` fires while a Draft is being edited, not at
  mount; `openPoRemaining.raw.get` is a secondary read on PO Overview. A request-count target that counts only
  mount-time requests would miss both.

### Write side effects across the read surface

```
read owners probed structurally (comments AND string literals stripped)   15
owners holding ANY write primitive                                         0
```

`40_ 42_ 50_ 51_ 52_ 53_ 54_ 55_ 57_ 58_ 59_ 60_ 64_ 70_ 72_` contain no `setValue(s)`, `appendRow`,
`insertSheet`, `deleteRow`, `clearContent*`, `LockService`, `setProperty`, `DriveApp` or `newTrigger`.

Two files that **do** hold write primitives were examined per handler rather than per file, because a file
with a writer in it is not the same as a read handler that writes:

- `71_api_v1_factory_stock_guard.gs` — the writes belong to the override-audit path. `handleFactoryStockGuardGet_`
  reads and returns `zero_write: true` (`71_:266-280`). **Clean.**
- `43_api_v1_gap_materialization.gs` — the writes belong to `*.recalculate.all`. The read handlers delegate to
  `gapReadScopeRows_`, which validates and reads (`43_:856-861`). **Clean.**

The third, `46_`, is finding §1.1.

---

## §3 — DB TOUCH PREFLIGHT

```
ACCESS for every table below            = READ
DIRECT_CELL_WRITE for every table below = NO
TEST_LINEAGE                            = n/a — a read-only round creates no rows and needs no lineage
RECOVERY / CLEANUP MODEL                = n/a — nothing to recover; no row is created, changed or removed
EXPECTED_REQUEST_PATTERN                = page mount + scoped re-read per cycle, Tier 1→2 (1 then 20 cycles),
                                          max 1 concurrent; no write, no job start, no recalculate
```

`EXPECTED_MAX_ROW_SCOPE` is the owner's own bound where one exists; otherwise the full tab, because these are
whole-table scoped reads and claiming a smaller bound would be a guess.

### PROTECTED_MASTER — 22 tables · READ only · approval: NO (read is already permitted by §1 of S8-R2)

| TABLE | PURPOSE | SURFACE(S) | WRITE SIDE EFFECT |
|---|---|---|---|
| `sku_details` | SKU master join (category, series, carton dims) | 2,3,5,6,7,10,11 | NO |
| `sku_regional_details` | regional / compliance master | 2,3 | NO |
| `marketplace_skus` | site identity (sku+country+marketplace) | 1,2,3,11 | NO |
| `marketplaces` | company / marketplace vocabulary | 1,11 | NO |
| `pricing_list` | price snapshot shown on SKU surfaces | 1,2 | NO |
| `fc_regular_forecast` | forecast basis | 1,11 | NO |
| `fc_special_events` | event selling windows | 1,11 | NO |
| `fc_target_rules` | target % rules | 1,11 | NO |
| `campaigns` | contamination-day authority | 1 | NO |
| `campaign_sku_lines` | campaign → marketplace_sku identity | 1 | NO |
| `warehouses` | warehouse master + factory flags | 4,5,6,7,8,9,10,11 | NO |
| `logistics_locations` | route node reference | 8,9 | NO |
| `carriers` | carrier master | 6,8,9 | NO |
| `carrier_rate_cards` | rate reference | 8,9,11 | NO |
| `carrier_lead_times` | lane lead time | 11 | NO |
| `shipment_route_templates` | route template resolution | 8,9 | NO |
| `shipment_route_template_nodes` | route template nodes | 8,9 | NO |
| `tax_referral_rates` | duty / VAT / referral reference | 2,3 | NO |
| `tax_rate_components` | tax component reference | 2,3 | NO |
| `amazon_inventory_snapshot` | site stock | 4,11 | NO |
| `amazon_daily_sales_snapshot` | §22 run-rate basis | 11 | NO |
| `amazon_weekly_sales_snapshot` | run-rate fallback rung | 11 | NO |

### TEST_OWNED_TRANSACTION — 16 tables · READ only · approval: NO

| TABLE | PURPOSE | SURFACE(S) | WRITE SIDE EFFECT |
|---|---|---|---|
| `request_orders` / `request_order_lines` / `request_order_line_sources` | Request Order read-back | 7 | NO |
| `purchase_orders` / `purchase_order_lines` | PO workspace + remaining overview | 10,11 | NO |
| `shipping_plans` / `shipping_plan_lines` | Weekly Plan decision truth | 6,11 | NO |
| `shipments` / `shipment_lines` | shipment execution snapshot, on-the-way | 8,9,11 | NO |
| `shipment_events` / `shipment_routes` | route + event timeline | 8,9 | NO |
| `shipping_allocation_drafts` / `_lines` | execution-plan draft | 11 | NO |
| `generated_documents` | document registry read-back | 8,9,10 | NO |
| `overseas_inventory_movements` | overseas ledger view | 5 | NO |
| `factory_stock_override_audit` | guard audit read | 4,6 | NO |

### REBUILDABLE_OPERATIONAL_STATE — 2 tables · **READ only, no mutation this round**

| TABLE | PURPOSE | SURFACE(S) | WRITE SIDE EFFECT | APPROVAL |
|---|---|---|---|---|
| `factory_stock` | factory balance | 4,6,11 | NO | **NO** — R3 reads only; the §2 mutation authorization is not exercised |
| `overseas_inventory_snapshot` | overseas balance | 5,11 | NO | **NO** — same |

### READ_ONLY_DERIVED — 2 tables · READ only · **approval: YES**

| TABLE | PURPOSE | SURFACE(S) | WRITE SIDE EFFECT | APPROVAL |
|---|---|---|---|---|
| `inventory_replenishment_gap` | materialized gap read (`inventoryReplenishmentGap.get`) | 11 | **NO for the read handler** — but see §1.1 for `gapJob.status.get` | **YES** |
| `order_planning_gap` | materialized gap read (`orderPlanningGap.get`) | 11 | same | **YES** |

Reading them is safe — `gapReadScopeRows_` validates and reads. Approval is asked anyway because they are the
tables the §6 exclusion is about, and the gate says READ does not inherit from anything.

### UNAUTHORIZED_UNKNOWN — 2 tables · READ only · **approval: YES** (§7 declaration)

| TABLE | PURPOSE | SURFACE(S) | REQUIRED? | APPROVAL |
|---|---|---|---|---|
| `supplier_price_list` | supplier lead time + price on the Request Order read | 7 | **YES — owner fails closed** | **YES** |
| `amazon_inventory_health_snapshot` | inventory health input to Site Inventory | 11 | no (optional) | **YES** |

```
OPERATOR_APPROVAL_REQUIRED_TABLES = inventory_replenishment_gap · order_planning_gap ·
                                    supplier_price_list · amazon_inventory_health_snapshot      (4)
```

Everything else is READ on a table whose read is already permitted. **No INSERT, UPDATE or DELETE is requested
on any table.**

---

## §4 — Performance plan (measurements only)

Existing repository baselines are used where they exist. Where none exists, the field says **MEASURE** rather
than carrying an invented number.

### Baselines the repository already pins

| Constant / measurement | Value | Source |
|---|---|---|
| `KM_READ_TIMEOUT_MS_` | 45 000 ms | `operation-system-db-api.js:4180` |
| `KM_WRITE_TIMEOUT_MS_` | 90 000 ms | `:4181` (`66_` pins `ROS_CLIENT_WRITE_TIMEOUT_MS_` equal; 2 suites assert it) |
| `weeklyAiPlan.generate` | 180 000 ms | `KM_ACTION_WRITE_TIMEOUT_MS_` |
| lock acquisition | 30 000 ms `tryLock` | every lock site |
| `GAP_MAX_SKUS_` | 5 000 | `43_:` scoped read page bound |
| `RTR_GET_BODY_MAX_` | 4 000 bytes | `01_router.gs` — a GET body over this fails closed |
| `GAP_JOB_WORKER_BUDGET_MS_` | 240 000 ms | `46_:67` |
| **FC Summary workspace read** | **~9.7 s warm / ~25 s cold, 221.6 KB** | `DEPLOYMENT_RELEASE_LOG.md:3872` (measured, read-only) |
| FC Summary floor | 6.3 s, dominated by project load/compile | `FC_SUMMARY_R3_R1_READ_PATH_EVIDENCE.md:166` |
| FC Summary handler time | 4.7 s, incl. 30 service calls where 14 would do | same, §3 |
| delivery redirect cost | 4.6% — measured, **not** a cause | same |

### Per-surface plan

| Field | Rule |
|---|---|
| `COLD_LOAD_TARGET` | FC Summary: regression gate at the measured **25 s**, improvement target below it. All others: **MEASURE** in R3, then freeze. |
| `WARM_LOAD_TARGET` | FC Summary: **9.7 s**. All others: **MEASURE**. |
| `REQUEST_COUNT_TARGET` | **MEASURE** mount + settle separately, because deferred reads (`factoryStockGuard.get`, `openPoRemaining.raw.get`) land after mount and a mount-only count would miss them. |
| `TIMEOUT_THRESHOLD` | 45 000 ms — the shipped read bound. A surface approaching it is **blocking timeout debt**, not performance debt. |
| `FALSE_EMPTY_CHECK` | a rendered-empty surface must be distinguishable from a refused or unavailable one. `SOURCE_NOT_AVAILABLE` / `MISSING_SNAPSHOT` must surface, never render as zero. |
| `PERMANENT_LOADING_CHECK` | every read reaches a terminal state — rendered, empty-with-reason, or failed-with-reason. No spinner survives the timeout. |
| `RETRY_CHECK` | a read may retry; `WRITE_AUTOREPLAY_ADDED = NO` must stay true, and no retry may be issued on any write path. |
| `N_PLUS_ONE_CHECK` | FC Summary is the known case: **30 service calls where 14 would do, 6 redundant header transfers**. Re-measure and look for the same shape elsewhere. |
| `REQUEST_LEAK_CHECK` | request count must not grow across repeated cycles (T2 = 20). Growth is a leak, and it is §24-D carried debt. |

### Three buckets, kept separate

| Bucket | Meaning | Example already known |
|---|---|---|
| **functional correctness** | wrong or missing data | false-empty; a dropped optional source rendering as zero |
| **performance debt** | correct but slow | FC Summary's 30-vs-14 service calls; the 726 KB of one-shot tooling in the deployed project (14.6%) that the floor probe suggests dominates cold load |
| **blocking timeout** | exceeds 45 s and fails | §24-C SKU Details / Regional prior timeout debt |

The 726 KB retirement is named because it is the largest measured lever on cold load, and it is a **production
deletion the operator owns** — not an S8-R3 action.

---

## §5 — What this round did not do

```
FATIGUE EXECUTED              NO        PRODUCTION ROWS WRITTEN   0
BROWSER FATIGUE               NO        PRODUCTION ROWS DELETED   0
SCHEMA CHANGE                 NO        DEPLOY                    NO
MAIN PUSH                     NO        REGISTRY EXTENDED         NO
```

```
NEXT_STEP = WAIT_FOR_OPERATOR_DB_APPROVAL
```

S8-R3B does not begin until the four approval-required tables are answered and §1.1 is decided.

---

*Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>*
