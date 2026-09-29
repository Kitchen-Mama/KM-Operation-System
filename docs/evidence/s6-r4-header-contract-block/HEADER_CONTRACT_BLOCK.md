# S6-R4 — STOPPED AT THE §0 HEADER GATE

**Base** `d17fb71` · **no runtime implemented** · `PRODUCTION_ROWS_WRITTEN = 0` · `BEHAVIOR_CHANGED = NO`

```
R4_BLOCKED_BY_HEADER_CONTRACT = YES
LIVE_WRITE_OWNER_EXPECTS_WH_HEADERS = UNPROVEN
```

Suite: `assets/tests/s6-r4-overseas-header-contract-gate.test.js` — 27 passed / 0 failed. Every assertion in it
is a **blocking condition**; a failure there means one has been resolved, not that something regressed.

§0 is explicit: *"If repository/runtime ownership cannot prove that current production uses the canonical
`wh_*` contract safely: STOP. Do NOT implement reservation writes through an ambiguous header mapping."* It
cannot be proven. This round therefore implements no overseas availability owner, no reservation writer, no
source enablement, and changes no runtime file.

S6-R3 flagged this as the pre-R4 verification item. It turned out to be worse than a spelling question.

---

## Gate

```
S3_FINAL_SEAL = YES   S4_FINAL_SEAL = YES   S5_READY_FOR_INTEGRATION = YES
S6_DECISION_FREEZE_COMPLETE = YES (contract §607)   S6_MAPPING_FREEZE_COMPLETE = YES (contract §821)

PRE_SHA = d17fb71   HEAD = d17fb71   branch = feature/product-strategy-board-p0
origin/main = 2b82288   origin/feature = 2b82288   WORKTREE_CLEAN_AT_START = YES
S5_DEPLOYMENT = HOLD   S6_DEPLOYMENT = HOLD
```

---

## The four blocking findings

### 1 — the legacy fallback is still present, and its own removal condition is unmet

`05_` declares `WH_LEGACY_`, mapping five canonical columns to their pre-migration names, and resolves
canonical-then-legacy at every balance reader. Its comment states the condition for removing it:

> *"removed once live `overseas_inventory_snapshot` headers are renamed **+ verified**"*

No evidence round in this repository records that verification. `DATABASE_RELATIONSHIP_MAP.md` §244 does
assert the canonical set — but a planning document asserting a column list is not an observation of a live
sheet, and **S6-R1's central finding was that these documents ran two releases behind the code.** Treating
§244 as proof here would repeat exactly the failure this series exists to catch.

### 2 — the receipt poster writes BOTH namespaces at once

`31_`, auto-creating a snapshot row on receipt:

```js
warehouse_id: destWhId, sku: sku,
wh_available_stock: after, wh_reserved_stock: 0, wh_damaged_stock: 0, wh_on_the_way_qty: 0,
available_stock:    after, reserved_stock:    0, damaged_stock:    0, on_the_way_qty:    0,
```

It emits both spellings and lets the header mapper drop whichever the sheet lacks. **A writer that emits both
spellings is a writer that does not know which one is real.** The hedge is itself the evidence.

### 3 — two live readers disagree, and one fails closed silently

```
43_ (gap materialisation)   gapNum_(r.wh_available_stock)                        NO fallback
54_ (raw inventory owner)   rivPick_(r, 'wh_available_stock', 'available_stock')  WITH fallback
client normalizer           _invPick(r, 'wh_available_stock', 'available_stock')  WITH fallback
```

They cannot both be right about one sheet. And the disagreement is not symmetric: if the live sheet is still
legacy, `43_` reads `null`, applies its `missing ≠ 0; negative fail-closed` rule, and **silently drops every
overseas row from gap materialisation** — no error, no warning, a number that is quietly smaller than it
should be.

### 4 — `wh_physical_stock` has no writer, and §7 requires decrementing it

This is the finding that actually blocks the round.

```
WRITERS ANYWHERE IN SHIPPED CODE      0
in the importer's writable qtyFields  NO
in the importer's required headers    NO   (whReq = qtyFields + wh_on_the_way_eta)
has a legacy alias in WH_LEGACY_      NO
written by 31_ on row creation        NO   (neither namespace)
READERS                               2 — 05_ copies it unchanged onto the movement before/after pair;
                                          the client normalizer defaults it to 0
```

So the column is **unwritten**, **not required to exist**, and where it is read at all, an absent column is
indistinguishable from zero stock.

§7 requires dispatch to perform `wh_physical_stock ↓ shipment_qty`. Against a column nothing has ever
populated, that mutation has three possible outcomes and all three are wrong:

- the column is absent → the write is silently skipped and consume records nothing;
- the column is blank/zero → the decrement drives it negative, so either every overseas dispatch is refused
  by a negative guard, or a meaningless negative balance is persisted;
- the column holds stale hand-entered values → consume corrupts a number no owner maintains.

**Decrementing an unmaintained column is the precise shape of mutation this whole series refuses elsewhere.**

---

## Why the block is total rather than partial

It would be tempting to ship the reachable five-sixths. The mapping does support them:

```
§3 overseas availability owner      REACHABLE — wh_available_stock is maintained by import, adjust, receipt
§5 reservation acquire              REACHABLE — available ↓ / reserved ↑ are both in the writable set
§6 reservation release              REACHABLE — the same bucket transfer, reversed
§4 source enablement                REACHABLE
§7 dispatch consume                 NOT REACHABLE — requires wh_physical_stock
```

**§8 forbids it, and §8 is right.** S6-R3 proved that enabling the overseas source without complete
reservation protection opens a real double-allocation hole at the plan→shipment handoff: `planExposure`
releases on transfer, and for overseas there is no physical term to catch the units. Shipping source
enablement plus reserve and release, with consume missing, produces a *different* defect of the same family —
units reserved forever, never consumed, availability permanently understated, and a reservation ledger that
drifts from physical reality with no reconciliation possible because physical is not maintained.

```
SOURCE_UNBLOCK_WITHOUT_RESERVATION_ALLOWED = NO
```

---

## What the operator must verify — the cheapest sufficient check

One read of the live sheet settles all four findings at once. **No write, no migration, no backfill.**

> Open the production `overseas_inventory_snapshot` sheet and report **row 1 verbatim** — the complete header
> row, in order, exactly as spelled.

That single answer resolves:

| finding | what the header row settles |
|---|---|
| 1 | whether the rename happened, so whether the fallbacks are dead code |
| 2 | which of 31_'s two emitted namespaces actually lands |
| 3 | which of 43_ / 54_ is correct, and whether gap materialisation is silently dropping overseas rows today |
| 4 | whether a physical column exists **at all** |

If a physical column **is** present, one follow-up is needed before R4 can specify consume, because presence
is not maintenance:

> For a handful of rows with non-zero `wh_available_stock`, report `wh_physical_stock`,
> `wh_available_stock`, `wh_reserved_stock` and `wh_damaged_stock` together.

That shows whether `available = physical − reserved − damaged` actually holds in live data, which is the
reconstructability question `INVENTORY_TABLE_MAPPING_SPEC.md` §3.1 deliberately leaves open and which
determines the consume arithmetic.

### The three outcomes, and what each authorises

```
A. canonical wh_* headers present, physical maintained and reconstructable
   -> R4 proceeds exactly as specified. Consume decrements physical and reserved.

B. canonical wh_* headers present, physical column ABSENT or unmaintained
   -> R4 proceeds with a MAPPING AMENDMENT that must be operator-frozen first:
      the overseas domain maintains available + reserved only, consume decrements RESERVED and
      leaves physical alone, and `wh_before/after_physical_stock` on the ledger records the
      unmaintained value unchanged, exactly as 05_'s adjust handler already does.
      This is a business-model decision about what the overseas domain stores, not a code choice,
      and S6-R3's §13 explicitly did not freeze it.

C. legacy unprefixed headers still live
   -> R4 stays blocked and a header migration becomes its own round, ahead of any reservation work.
      It would also mean 43_ is dropping overseas rows from gap materialisation in production today,
      which is a live defect worth its own investigation regardless of S6.
```

I am deliberately **not** picking between B's variants. §0 forbids implementing through an ambiguous mapping,
and choosing what the overseas domain physically stores is the operator's call, not a convenience I should
resolve by writing code that happens to run.

---

## What this round did NOT do

```
overseas availability owner implemented        NO
overseas reservation acquire / release / consume NO
overseas source enablement                     NO
UI / read-model change                         NO
runtime files changed                          NONE
schema change / migration                      NO
production rows read or written                0
```

The frozen S6-R3 mapping is untouched and is re-asserted by the gate suite: the
`OVERSEAS_RESERVED_IS_SUBTRACTED_FROM_AVAILABLE = NO` guard, the `R4_MUST_LAND_AS_ONE_CHANGE = YES`
atomicity rule, and the `DOUBLE_ALLOCATION_PATH_IF_SOURCE_UNBLOCKED_ALONE = 1` finding all still stand.

---

## Release

```
BACKEND_RELEASE          = F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R30   (unchanged — no .gs file changed)
APPS_SCRIPT_SYNC_REQUIRED = NO  (for THIS round; the R30 set from FC-ID-R2 is still pending operator sync)
FRONTEND_DEPLOY_REQUIRED  = NO  (for THIS round; fc-summary.js from FC-ID-R2 is still pending)
APPLICATION_TOKEN        = s5r4-actionreason-20260928   TOKEN_ROTATION_REQUIRED = unchanged, at deploy
S5_DEPLOYMENT = HOLD   S6_DEPLOYMENT = HOLD
```

## Tests

```
FOCUSED   s6-r4-overseas-header-contract-gate   27 passed / 0 failed
          (no mutation section: every assertion IS a blocking condition, and a mutant of a block is a
           different block. The one load-bearing detector — "no writer of wh_physical_stock" — was
           vacuity-checked in four directions: it catches an emitted object property and an
           index-resolved setValue, and rejects a pure read and a comment.)
DEPENDENT s6-r1 · s6-r2 · s6-r2a · s6-r3 — all exit 0, unchanged
FULL_SWEEP <filled after sweep>
```
