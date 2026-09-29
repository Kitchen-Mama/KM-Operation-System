# S6-R1 — shipping / inventory execution mainline contract audit

**Base** `5bb3fa0` · architecture audit only · `BEHAVIOR_CHANGED = NO` · `PRODUCTION_ROWS_WRITTEN = 0`

Owner of record: `docs/planning/S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md` **Part I, §1–§14**.
Machine-checkable half: `assets/tests/s6-r1-shipping-mainline-contract.test.js`.

---

## The gate

```
PRE_SHA = 5bb3fa0   HEAD = 5bb3fa0   branch = feature/product-strategy-board-p0
origin/main = origin/feature = 2b82288        WORKTREE_CLEAN_AT_START = YES
S3_FINAL_SEAL = YES (s4-r1 ARCHITECTURE_CENSUS)   S4_FINAL_SEAL = YES (s4-r7 FINAL_SEAL §)
S5_READY_FOR_INTEGRATION = YES (s5-r8 MAINLINE_SEAL + contract §3280)
S5 large fatigue / production write smoke: intentionally deferred to the post-S7 gate — unchanged.
```

S5 was not reopened. Nothing this round touched an ordering owner.

---

## What the round was asked to find, and what it found instead

§3 says *"Do NOT begin by proposing a new pipeline"* and §1 says *"Do NOT assume S6 is greenfield."* Both
warnings turned out to be aimed at the right hazard from the wrong direction: the risk was never that S6 would
be built from nothing. **It is that the canonical documents describe a system two releases behind the one that
is deployed**, so a round designing faithfully from them would build a second owner for machinery that already
exists and already runs.

Three statements, all in canonical documents, all false against live code:

| document | says | live code |
|---|---|---|
| `SUPPLY_CHAIN_SYSTEM_FLOW` §5.4 / §11 B-1 | reserve at **Ready to Ship**; Create Shipment Draft does not reserve; *"No reserve logic exists in code yet"* | reserve at **Shipment Draft creation**, `12_:660` → `21_` |
| `DATABASE_RELATIONSHIP_MAP` §6.0 / §6 | same, plus *"Implementation / Runtime / Deployment Not Started"* | implemented, and **live in production** |
| `DATABASE_RELATIONSHIP_MAP` §8 | `shipment_events` / `shipment_routes` *(spec only)* | written by `22_` at dispatch, advanced by `31_`, served by `57_` |

**Why "live in production" is a claim I can support.** `12_`, `21_` and `22_` all carry `F1-7N-FC-1A-R1`, and
none of them appears in the cumulative Apps Script set S5-R8 measured against the last deployed baseline
(`R13`, commit `3249749`). A file unchanged since the deployed tree is the deployed file. The limit is the same
one S5-R8 stated: the ledger records what was *entered*, so it cannot prove what was never logged — only the
operator knows what was actually pasted.

Each of the three now carries a dated superseding marker beside the original text. **The original text is not
deleted and B-1 is not withdrawn**: formally superseding a frozen decision is the operator's call, and that is
the first question in §Decisions below.

---

## The mainline, and the two ways it could have grown a second owner

```
INVENTORY_STATE     factory_stock (21_)  |  overseas_inventory_snapshot (05_)   — SEPARATE domains
AVAILABLE_TO_SHIP   KMFSG.availableToAllocate — pure, Node-executable; 71_ does the reading
ALLOCATION_DRAFT    16_ sadAtomicUpsertCore_      AI proposal: 61_, writing THROUGH 16_
WEEKLY_PLAN         11_ shippingPlanCommitFromLines_   — single shipping_plans mutation authority
SHIPMENT_DRAFT      12_ createShipmentFromApprovedPlan_ — the ONLY creator of a shipments row
DISPATCH            22_ handleConfirmShipmentAndDispatch_
STATUS / RECEIPT    12_ handleUpdateShipment_ (allowlisted)  ·  31_ receipt + route advance
ROUTE / ON-THE-WAY  22_ snapshots legs · 31_ advances · 57_ serves · global-logistics-map.js renders
PO SUPPLY SOURCE    32_ slaApplyExecution_ (FIFO)          S7 SEAM  34_ immutable final output

SECOND_SHIPPING_CALCULATION_PATH_COUNT = 0     SECOND_SHIPPING_WRITE_PATH_COUNT = 0
```

**The first way it could grow one is already half-built.** `61_` constructs a full `KMPR`/`KMPL`
`WEEKLY_SHIPPING` persistence dependency object — lock, optimistic token, staged apply, keyed delta write — on
every generation, hands it to `weeklyAiPlanGenerateK2_`, and the generator **never touches it**. The live write
goes through `16_`'s atomic endpoint, which `61_` itself declares as its only write handler. Measured:
`deps.` appears zero times in the generator body.

That is not a defect today and it is precisely the shape that made S5-R5 name the wrong write owner: a real,
complete, plausible writer that nothing calls. It is pinned as `DORMANT_WRITE_CONSTRUCTOR_COUNT = 1` with a
mutant that fails the moment anything starts using it. Deleting it is a runtime change, so it is proposed for
slice R7 rather than done here.

**The second way is the one FC-1A already closed and this round re-pins.** A `factory_stock` balance cell
written outside `21_`. `21_`'s own comment used to claim *"No second stock-mutation implementation lives in any
other file"* while `22_` carried its own inline `setValue` + movement append — a comment describing the
ownership somebody wished for, which is worse than no comment because it is why a second implementation could
live there unnoticed for rounds. The suite asserts it as an **equality over every non-generated handler file**,
which is the check that would have caught it.

---

## Available-to-Ship, exercised rather than described

§5 says not to invent `available = current − reserved` unless live code says so. Live code says more than
that, and the suite runs it:

```
1000 on hand, 800 reserved, one active allocation draft for 50, one approved plan for 30

  factory_available_stock = 1000 - 800          = 200
  available_to_allocate   = 200 - (50 + 30)     = 120
  pool key                = WH:<warehouse_id>||<sku>      — never narrowed by company
  fingerprint             over every number the decision depended on, per pool, in sorted key order
```

Three properties that each read as an arbitrary choice until you see what they prevent:

- **No company filter.** Company/country/marketplace are the *destination*. A factory supplies all of them, so
  exposure must be summed across every company before anything is compared — the opposite of the scope filter
  every other read applies.
- **No shipment term.** A shipment's claim already lives in `fac_reserved_stock`. Adding one would be the same
  carton twice, which is also why a plan stamped `transferred_shipment_id` stops counting.
- **Negative headroom is reported, not clamped.** A confirmed overage, or stock adjusted down after the fact,
  is a real state; clamping to zero would hide how large the breach already is. Measured: `-15` stays `-15`.

---

## Reservation, and the risks it closes

```
RESERVE   Shipment Draft creation (Execution Commit)   12_:660  -> factoryStockAcquireReservationTx_
RELEASE   cancelShipmentDraft                          12_:883
          + a source_warehouse_id edit moves it: validate at the new warehouse, then release+acquire, one lock
CONSUME   dispatch — deduction and release in ONE movement row  22_:258
IDENTITY  related_entity_type='shipment' + related_entity_id=<shipment_id>, keyed origin warehouse_id + sku
LIFECYCLE derived: Sum(acquire) - Sum(release) per owner per pool. Never stored a third time.
```

Double-use is closed at six places, each pinned: the reservation itself; draft and plan exposure in the
availability arithmetic; owner-scoped release; `min(held, take)` plus an `after_reserved >= 0` precondition;
atomic release on cancellation with the plan handoff cleared; and a **refusal** — not an idempotent success —
when a cancelled shipment is dispatched. The refusal matters: answering `already_confirmed` for a cancelled
shipment would tell the operator it shipped.

**One risk is open and is not new.** An overseas-origin shipment reserves nothing: `wh_reserved_stock` is only
imported or written as a literal zero on a new row, and the Overseas Outbound Lock lifecycle is specified and
unimplemented. Carried as `D-S6-1`, raised as a decision rather than repaired, because reservation timing is
business policy and §20 says not to invent it.

---

## The two mainlines stay apart

```
SHIPMENT_NEED_AUTO_CREATES_REQUEST_ORDER = NO     REQUEST_ORDER_AUTO_CREATES_SHIPMENT = NO
SHIPMENT_NEED_AUTO_CREATES_PO            = NO     PO_AUTO_CREATES_SHIPMENT            = NO
S5_RECOMMENDATION_AUTO_SHIPMENT          = NO     WEEKLY_PLAN_AUTO_CREATES_PO / RO    = NO
S5_RECOMMENDATION_IS_SHIPPING_QTY_AUTHORITY = NO  ORDERING_SHIPPING_ORCHESTRATION_IMPLEMENTED = NO
```

Asserted in both directions and per file: no shipping owner creates a Request Order or a PO, no ordering owner
creates a shipment, no shipping owner reads `totalRecommendedQty` or calls the recommendation engine, and no
ordering owner reads `carrier_lead_times`.

The single seam is `shipment_line_allocations` (32_), and its direction is the safe one: a shipment that
**already exists** consumes PO supply by FIFO. A supply-source axis, never a demand trigger.

---

## Second-layer read cost

```
FIRST_SKU_EXPAND_REQUEST_COUNT  = 0     SECOND_SKU_EXPAND_REQUEST_COUNT = 0     N_PLUS_ONE_RISK = none
```

Expanding a Shipment card and expanding an Inventory Replenishment row both issue nothing: the detail arrived
with the scoped workspace read. The probe follows the delegation rather than stopping at the public toggle —
`toggleShipmentCard` is a one-line wrapper, and a wrapper contains no request verb no matter what it calls.
The carrier catalogue the second layer needs is **adopted** from the read the page already completed.

---

## The two carried UI observations, re-measured

§17 named two. Both look repaired, and both are reported as *not reproducible in current code* rather than
closed, because neither was re-measured against a live page this round:

- **Factory Inventory / `getTable(warehouses)` timeout.** The page now issues a bounded three-table scoped read
  (`factory_stock`, `sku_details`, `warehouses`) with a monotonic request identity and a fail-closed rejection
  that does not re-enter the loop. No `getTable(warehouses)` call remains on the path.
- **Site Inventory "Searching…" before a site is selected.** `PRE_SEARCH` is its own state and owns that case;
  "No data" is never shown before a successful search, and R6-R5 §4 additionally split `Preparing…` from
  `Searching…` so the page stops claiming work it has not dispatched.

```
CARRIED_UI_RUNTIME_DEBT = 2, both NOT REPRODUCIBLE IN CURRENT CODE, neither re-measured live
```

---

## Data safety — the honest answer

§18 asks every S6 table to be classified before any later write test. **This round cannot classify them from
the repository**, and saying otherwise would be the failure §18 exists to prevent.

What the repo does support:

```
PRODUCTION_DATA_TABLES  factory_stock · factory_stock_movements · overseas_inventory_snapshot ·
                        overseas_inventory_movements · warehouses · carriers · carrier_rate_cards ·
                        carrier_lead_times · shipment_route_templates · shipment_route_template_nodes ·
                        logistics_locations
                        — the reservation is live, so factory_stock/_movements hold real balances and a real
                          reservation ledger; the carrier/route/location tables are user-maintained masters
MIXED_DATA_TABLES       shipping_plans · shipping_plan_lines · shipments · shipment_lines ·
                        shipment_routes · shipment_events
                        — a controlled visual-demo seed (TEMP_demo_shipping_shipment_map_seed_v2.gs) targets
                          exactly these six with `DEMO-20260824-` ids tagged "DEMO ONLY — DO NOT PROCESS".
                          Whether it was ever COMMITted is NOT determinable from the repo.
UNKNOWN                 shipping_allocation_drafts · shipping_allocation_draft_lines ·
                        shipment_line_allocations · factory_stock_allocation_plans ·
                        factory_stock_override_audit
```

**A `DEMO-` prefix does not make a mixed production table safe**, for the same reason S5-R7A §13 refused to let
a `TEST_` prefix do it: the prefix scopes the rows somebody intended to write, not the rows that are there.

```
REAL_RECORDS_PRESENT              UNVERIFIED — requires a live read-only census (operator-run)
SAFE_TEST_NAMESPACE_AVAILABLE     partially — the demo seed's classifier is the closest thing that exists
DETERMINISTIC_ROLLBACK_AVAILABLE  NO for the shipment mainline: there is no shipment delete anywhere, and
                                  cancellation leaves a `cancelled` row, which is a different state, not the
                                  prior one — the same structural blocker S5-R7A found on the ordering side
NO WRITE TEST WAS PERFORMED.      PRODUCTION_SMOKE_READY = NO.
```

---

## Decisions for the operator (6)

Only items **not** already frozen by live code or an existing canonical spec.

**1 · Formally supersede B-1's reserve trigger.**
*Existing behaviour:* reservation is acquired at Shipment Draft creation and has been live in production since
FC-1A. Two canonical documents still say Ready to Ship.
*A:* supersede B-1, make Shipment Draft creation canonical (matches live code).
*B:* keep B-1 and treat the live code as a defect to be moved back to Ready to Ship.
*Business effect:* A surfaces a stock collision when the claim is made; B surfaces it at Confirm Shipment,
after documents are prepared. *System effect:* B is a behaviour change to deployed, working code.
**Recommendation: A.** The trigger moved for a measured reason and the earlier one is the one that let two
sites plan the same physical units.

**2 · Overseas-origin reservation (`D-S6-1`).**
*Existing behaviour:* an overseas-origin shipment reserves nothing; `wh_reserved_stock` has no writer.
*A:* implement the Overseas Outbound Lock in a later S6 slice. *B:* leave it and state the exposure openly —
overseas availability does not reflect committed outbound. *C:* refuse an overseas-origin Shipment Draft until
A lands. **Recommendation: B now, A in Phase 2.** C would break a working flow to close a gap that has been
open since before S5.

**3 · The two extra movement types, and the seventh that is on neither axis (`D-S6-10`).**
FC-1A recorded the closed five becoming seven and asked for acknowledgement; it has not been recorded as
accepted. Separately, `shipment_receipt` is declared in the factory vocabulary but written only onto the
overseas ledger. *A:* accept seven and drop `shipment_receipt` from the factory list. *B:* accept seven as-is.
**Recommendation: A**, in R3, as a doc+constant change with no write.

**4 · PO over-receipt: clamp or refuse (`D-S6-6`).**
*Existing behaviour:* receiving 900 against 500 ordered receives 500 and stops — a clamp, frozen since FC-1A.
*A:* keep the clamp. *B:* refuse the over-receipt and make the operator correct the number.
**Recommendation: A.** No phantom stock is created either way, and a clamp does not block a warehouse.

**5 · `factory_stock_allocation_plans`: `warehouse_id` vs `source_factory_warehouse_id`.**
Two columns with competing claims to "the source factory". The DB map names `warehouse_id` as current and
defers the other to a future migration. *A:* deprecate `source_factory_warehouse_id` (read-fallback only).
*B:* migrate onto it and retire `warehouse_id`. **Recommendation: A**, recorded in R3, no migration.

**6 · Scope of the S6 production write validation.**
Rollback is structurally non-deterministic on the shipment mainline (no delete; cancellation is a different
state). *A:* fold S6's write smoke into the same post-S7 gate as S5's. *B:* build a disposable scope first.
**Recommendation: A.** It is the same blocker, and two half-gates are worse than one.

---

## Results

```
new suite   s6-r1-shipping-mainline-contract      99 passed / 0 failed   8/8 mutants caught
FILES_CHANGED    1 new test
SPECS_CHANGED    1 new (S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md)
                 2 annotated (SUPPLY_CHAIN_SYSTEM_FLOW.md · DATABASE_RELATIONSHIP_MAP.md) — markers only,
                 no canonical statement deleted, no decision withdrawn
BEHAVIOR_CHANGED NO      DB_MIGRATION_REQUIRED NO
APPS_SCRIPT_SYNC_REQUIRED NO — no .gs byte changed
FRONTEND_DEPLOY_REQUIRED  NO — no frontend byte changed
MUTATION_RESULT  8/8 (the round adds a suite, so N/A would have been the weaker answer)
```

```
S6_CONTRACT_AUDIT_COMPLETE = YES
BLOCKING_DEBT = none
NEXT_TASK = S6-R2 — operator shipping decision freeze
```
