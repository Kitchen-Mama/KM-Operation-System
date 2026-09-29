# S6-R4A — LIVE OVERSEAS INVENTORY STORAGE CONTRACT VERIFICATION

```
PRE_SHA = 68be926   branch = feature/product-strategy-board-p0
MODE = read-only schema/source verification
PRODUCTION_ROWS_WRITTEN = 0   BEHAVIOR_CHANGED = NO   DB_MIGRATION_REQUIRED = NO
```

Operator-supplied live evidence (2026-09-29) is treated as authoritative over every planning document,
per §0. Two of S6-R4's four blocking conditions are **resolved** by it. One is **confirmed and sharpened**.
One is **reclassified as benign**. The round ends BLOCKED, but for a different and far more specific
reason than it was blocked for before.

---

## §1 — The live header, against every code declaration

```
LIVE_HEADER_SET =
  overseas_inventory_id · snapshot_date · warehouse_id · sku · site_sku
  wh_physical_stock · wh_available_stock · wh_reserved_stock · wh_damaged_stock
  wh_on_the_way_qty · wh_on_the_way_eta · wh_on_the_way_bucket
  last_movement_at · updated_by · created_at · updated_at · note

CANONICAL_WH_FIELDS_PRESENT = YES        LEGACY_FIELDS_PRESENT = NO
```

| FIELD | LIVE | CODE READERS | CODE WRITERS | LEGACY ALIAS |
|---|---|---|---|---|
| `wh_physical_stock` | YES (blank) | `05_:356` · `db-api:791` · `overseas-outbound.js:77` | **NONE** | `physical_stock` (read-only; not in `WH_LEGACY_`) |
| `wh_available_stock` | YES (populated) | `05_` · `31_` · `43_:428` · `54_:98` · `db-api:792` · `source-projection:226` | `05_` importer · `05_` adjust · `31_` receipt | `available_stock` |
| `wh_reserved_stock` | YES (0) | `05_:357` · `db-api:793` | `05_` importer · `31_` receipt (literal `0`) | `reserved_stock` |
| `wh_damaged_stock` | YES (0) | `db-api:794` · `overseas-stock.js:451` | `05_` importer · `31_` receipt (literal `0`) | `damaged_stock` |
| `wh_before/after_reserved_stock` | movements table | ledger columns | `05_` adjust (unchanged pair) | — |
| `from_stock_type` / `to_stock_type` | movements table | — | `05_` (`''` → `available`) · `31_` (`''` → `available`) | — |

The `overseas_inventory_id` spelling in the live header confirms the F1-7M-B2 identity hotfix was right
about the live sheet, which is independent corroboration that this header is the current one.

**`updated_by` is live and no writer sets it.** Not a blocker; recorded so a later round does not
"discover" it.

---

## §2 — Physical stock: the writer census

```
PHYSICAL_FIELD = wh_physical_stock
PHYSICAL_FIELD_PRESENT = YES
WH_PHYSICAL_WRITER_COUNT = 0
WH_PHYSICAL_IMPORTER_WRITE_COUNT = 0
WH_PHYSICAL_RUNTIME_MUTATION_COUNT = 0
PHYSICAL_FIELD_READER_COUNT = 3   (two copy it, one projects it)
PHYSICAL_FIELD_MAINTAINED = NO
```

Zero is not an absence of evidence here — it is four independent, positively-established facts:

1. **The importer cannot write it.** `qtyFields` (`05_:120`) is exactly four names and `wh_physical_stock`
   is not among them. Both the update branch and the create branch iterate `qtyFields` and nothing else.
2. **The importer does not require it.** `whReq = qtyFields.concat(['wh_on_the_way_eta'])` (`05_:142`), so
   header validation never asks whether the column exists.
3. **A new row is born blank there.** The create branch builds `new Array(snapHeaders.length).fill('')` and
   fills only the keys it knows. `wh_physical_stock` keeps the `''`. **This is the mechanism that produced
   the blank live column** — it is not a data-entry omission, it is what the code does.
4. **The receipt poster writes no physical column in either namespace** (`31_:591`), so rows auto-created
   by a shipment receipt are blank there too.

The adjustment handler is the only thing that touches the name, and it *reads* it (`05_:356`) purely to
copy the unchanged value onto `wh_before_physical_stock` / `wh_after_physical_stock` on the ledger row —
the same value on both sides, by construction. A ledger that records "physical did not change" on every
row is exactly what a column nothing maintains produces.

```
OBSERVED_RELATIONSHIP = NOT_ESTABLISHED
RELATIONSHIP_CONSISTENT_ACROSS_SAMPLES = NOT_ENOUGH_DATA
```

No equation can be read out of the samples, and the operator has stated why: the live rows are an
**initial import of usable stock only**. `physical` is blank, `reserved` is 0 because no reservation
lifecycle has ever run, and `damaged` is 0 because the damaged lifecycle has not been populated. Three of
the four terms are absent for known reasons, so every candidate identity is unfalsifiable. None is frozen.

```
CURRENT_PRODUCTION_DATA_COVERAGE = INITIAL_AVAILABLE_STOCK_ONLY
DAMAGED_LIFECYCLE_POPULATED = NO      REFURBISH_LIFECYCLE_POPULATED = NO
RESERVATION_LIFECYCLE_ACTIVE = NO     PHYSICAL_LIFECYCLE_ACTIVE = NO (writer census, not sample shape)
```

Note the asymmetry deliberately: `PHYSICAL_LIFECYCLE_ACTIVE = NO` is proven by the **writer census**, a
statement about code that holds regardless of what any row contains. The other three are `NO` because of
data coverage alone, which is weaker evidence and must not be hardened into structure.

---

## §3 — `wh_available_stock` semantics

```
WH_AVAILABLE_STOCK_SEMANTIC = A — SOURCE-REPORTED NET AVAILABLE, preserved verbatim
```

`INVENTORY_TABLE_MAPPING_SPEC.md` §3.1 is explicit and already anticipated this case:

> `wh_available_stock` = `wh_physical_stock − wh_reserved_stock − wh_damaged_stock` **where the source
> reports a reconstructable value; the snapshot may also carry a source-reported `wh_available_stock` that
> is not reconstructable from the other columns — preserve the source value.**

Live production is the second branch. Every writer treats it that way: the importer stores the CSV cell
unmodified (ceiling-rounded), the adjustment handler sets it to an operator-entered absolute and never
recomputes it from the other buckets, and the receipt poster adds a delta to it. **Nothing in the codebase
derives available from physical.** `OVERSEAS_AVAILABLE_FORMULA = wh_available_stock (STORED,
source-reported)` in the R3 freeze was correct and is now confirmed by live evidence.

**The load-bearing consequence for R4:** the value is net of whatever the *external warehouse* holds back.
It is net of **zero KM internal reservations**, because KM has never made one. So an R4 reserve that
decrements it is not double-subtracting today — but only because the reserved bucket is empty, and only
as long as the authority boundary in §10 holds.

---

## §4 — `wh_reserved_stock` semantics

```
WH_RESERVED_STOCK_LIVE = YES
WH_RESERVED_WRITER_COUNT = 2      (05_ importer — from CSV; 31_ receipt — literal 0 on row creation)
WH_RESERVED_READER_COUNT = 2      (05_:357 ledger copy; db-api:793 normalizer)
WH_RESERVED_EXTERNAL_SYNC_OWNER = NONE
RESERVED_FIELD_MAINTAINED = NO — writable, never meaningfully written
```

The column is not unused-because-zero; it is zero because no lifecycle writes it. That distinction cuts in
the opposite direction from the usual caution: the field is **available to KM**, not occupied by an
external owner. No handler emits `reservation_acquire` / `reservation_release`; no `from_stock_type` other
than `''` and no `to_stock_type` other than `'available'` is ever written.

---

## §5 — Legacy fallback

```
LEGACY_FALLBACK_STILL_REQUIRED = NO      (live header is canonical — the removal condition is now met)
LEGACY_FALLBACK_CAN_BE_REMOVED = YES     (NOT removed in this round)
```

| CANONICAL | LEGACY | READ FALLBACK OWNER | WRITE FALLBACK OWNER |
|---|---|---|---|
| `wh_available_stock` | `available_stock` | `05_` · `31_` · `54_` · `db-api` | `05_` (`snPref`) · `31_` (dual-key emit) |
| `wh_reserved_stock` | `reserved_stock` | `05_` · `db-api` | `05_` · `31_` |
| `wh_damaged_stock` | `damaged_stock` | `db-api` | `05_` · `31_` |
| `wh_on_the_way_qty` / `_eta` | `on_the_way_qty` / `_eta` | `05_` · `db-api` | `05_` |
| `wh_physical_stock` | `physical_stock` | `05_` · `db-api` | **none** |

`WH_LEGACY_`'s own comment says it is removed "once live `overseas_inventory_snapshot` headers are renamed
+ **verified**". This document is that verification. Removal is nonetheless deliberately **not** done here:
it is a behaviour change to shipped write handlers, this round is read-only, and the fallback is currently
harmless (`snPref` prefers canonical and the canonical header is present, so the legacy arm is dead code on
the live sheet). It is now a cleanup with a known trigger rather than an open question — and it belongs in
the round that next touches these handlers, not in a round of its own.

**The dual-namespace emit at `31_:591` is reclassified from blocking to benign.** `shipmentAppendByHeader_`
maps by live header, so the extra `available_stock` / `reserved_stock` / `damaged_stock` / `on_the_way_qty`
keys match no live column and are dropped. It was a hedge written when nobody knew the live spelling; the
spelling is now known, and the hedge is inert. Remove it with the fallback, not before.

---

## §6 — The `43_` question, answered

```
43_OVERSEAS_READ_COMPATIBLE_WITH_LIVE_HEADER = YES
CURRENT_PRODUCTION_DEFECT = NO
```

`43_:428` reads `r.wh_available_stock` with no legacy fallback and fails closed on a missing value
(`missing ≠ 0`). Against the live canonical header that read resolves, so gap materialisation does see
overseas stock. Had the live sheet been legacy-spelled, `43_` would have silently dropped **every**
overseas row from every gap computation while `54_` — reading the same column with a fallback — saw them
all, and nothing would have reported the disagreement. The disagreement was real; the live header decides
it in `43_`'s favour. Recorded because this was blocking condition 3, and it is now closed.

---

## §7 — Movement representability

```
RESERVATION_MOVEMENT_REPRESENTABLE = YES
CONSUME_MOVEMENT_REPRESENTABLE = YES for an available/reserved consume; NO for a physical consume
RECEIPT_MOVEMENT_REPRESENTABLE = YES — already implemented and live (31_)
```

The live movements header carries every column the lifecycle needs: `movement_type`, `movement_scope`,
`from_stock_type`, `to_stock_type`, `wh_quantity{,_before,_after}`, all three before/after balance pairs,
and `reference_type` + `reference_id` for related-entity identity. `reference_id` already carries a
compound shipment identity in `31_` (`shipReceiptMovementRef_(lineId, cumReceived)`) as the exactly-once
authority — the same mechanism a reserve/release pair would use.

What is **not** representable is a consume that decrements a bucket nothing maintains. The ledger has the
`wh_before/after_physical_stock` columns; it does not have a physical balance to put in them.

---

## §8 — Storage outcome

```
LIVE_STORAGE_OUTCOME = B
```

Canonical `wh_*` headers are present and the two operational buckets are real and KM-writable, but
`wh_physical_stock` is present and **unmaintained**, proven by a zero writer census rather than by a blank
sample. S6-R4 §7 requires dispatch to perform `wh_physical_stock ↓ shipment_qty`. Decrementing a column no
code has ever populated would either write a negative balance or invent an opening value — and inventing
an opening balance for the physical bucket is a lifecycle decision belonging to the operator, not to a
convenience that makes §7 implementable.

```
S6_R4_HEADER_GATE_RESOLVED = NO
RUNTIME_IMPLEMENTATION_AUTHORIZED = NO
BLOCKING_CONDITION_COUNT = 4 -> 1
```

Conditions 1 (unverified headers) and 3 (reader disagreement) are **resolved** by the live header.
Condition 2 (dual-namespace emit) is **reclassified benign**. Condition 4 stands, restated: not
*"the header contract is ambiguous"* but *"the physical bucket has no lifecycle"*.

---

## §9 — Schema decision gate

```
NEW_TABLE_REQUIRED = NO
SCHEMA_EXTENSION_REQUIRED = NO
DB_MIGRATION_REQUIRED = NO
NEW_COLUMNS_REQUIRED = NONE
TABLES_AFFECTED = NONE
```

Every column all three candidate models need already exists on the live sheet. **This is a semantics
decision, not a schema decision.** Nothing here asks the operator to approve a column.

---

## §10 — External sync ownership, and the hazard that decides the recommendation

```
WH_AVAILABLE_WRITE_OWNERS = 3
  · 05_ handleImportOverseasInventorySnapshotBatch_   (operator CSV import — FULL OVERWRITE of 4 qty fields)
  · 05_ handleAdjustOverseasInventory_                (operator absolute set, ledgered)
  · 31_ shipment receipt overseas posting             (+= received delta, ledgered, exactly-once)
WH_AVAILABLE_EXTERNAL_SYNC_OWNER = NONE — no WMS/3PL feed, no scheduled importer
WH_AVAILABLE_EXTERNAL_SYNC_CAN_OVERWRITE_KM_MUTATION = NO (automatic) / YES (operator re-import)
```

There is **no automated overseas stock sync**. The scheduled-automation registry (`45_:52–70`) declares
five jobs — Amazon import, two gap materialisations, two recommendations — and none of them touch
`overseas_inventory_snapshot`. So the Option-A fear "an external feed will silently overwrite a KM
reservation" is **not** the live risk.

The live risk is sharper, and it is in our own importer:

> **The importer overwrites `wh_reserved_stock` unconditionally, and a blank CSV cell means zero.**
> `qtyFields.forEach(... setValue(qtyVals[f]))` runs on the update branch, and `qtyVals[f] = 0` for any
> blank cell (`05_:230`). An operator re-importing a stock refresh carrying only `available` would
> **silently reset every KM reservation to zero** — no error, no ledger row, no warning.

This is not hypothetical: the CSV shape documented in `OVERSEAS_STOCK_SPEC.md` (Import) is exactly a
four-quantity file, and the initial production import is the operator doing precisely this. Today the
damage is nil because reserved is already 0 everywhere. **The moment R4 writes the first reservation, the
next stock re-import destroys it** — and the exposure ledger would still insist the units are held.

**This hazard applies to Option A and Option C identically, and it is a prerequisite for either.** It is
also independently fixable and cheap: the importer must stop treating an absent CSV column as an
instruction to zero a KM-owned bucket. That is a real change to a shipped write handler, so it is named
here and deferred to the implementing round rather than smuggled into a read-only verification.

---

## §11 — Phase-1 model decision board

### OPTION A — available + reserved as the operational model

```
SOURCE_OF_TRUTH        wh_available_stock (KM-maintained after the initial import)
RESERVE_EFFECT         available -= qty ; reserved += qty     (one atomic bucket transfer + ledger row)
RELEASE_EFFECT         reserved -= qty ; available += qty
DISPATCH_EFFECT        reserved -= qty                        (units leave; physical untouched)
EXTERNAL_SYNC_EFFECT   none automated; operator re-import overwrites BOTH buckets — see §10
DOUBLE_SUBTRACTION_RISK  NONE — reserved units are already out of available, which is exactly why
                         OVERSEAS_RESERVED_IS_SUBTRACTED_FROM_AVAILABLE = NO was frozen in R3
SYNC_OVERWRITE_RISK      HIGH until the importer hazard in §10 is fixed; NONE after
BACKFILL_REQUIRED        NO
PROS   every column already live and KM-writable · matches the already-frozen R3 availability formula ·
       matches what overseas-outbound.js has projected in the UI since it was written ·
       symmetric with the factory reserve/release the tree already runs · no invented value anywhere
CONS   KM becomes owner of a quantity that began as a source figure; if a WMS feed is added later its
       authority boundary must be defined then (it is undefined today because there is no feed)
```

### OPTION B — activate physical as canonical

```
SOURCE_OF_TRUTH        wh_physical_stock (does not exist as a value today)
RESERVE_EFFECT         reserved += qty ; available derived
DISPATCH_EFFECT        physical -= qty ; reserved -= qty
BACKFILL_REQUIRED      YES — and no rule can produce it. physical = available is a guess that is wrong
                       for exactly the rows damaged/reserved stock will later occupy, which is every
                       row the operator has said is not yet populated.
DOUBLE_SUBTRACTION_RISK  MODERATE — two derived terms instead of one stored one
SYNC_OVERWRITE_RISK      same importer hazard, on more columns
PROS   a complete inventory identity; the ledger's physical before/after pair stops being decorative
CONS   requires a backfill rule live evidence CANNOT supply · a materially larger lifecycle decision
       than S6 · blocks R4 behind data entry
```

### OPTION C — source stock + separate internal reservation

```
SOURCE_OF_TRUTH        wh_available_stock stays external/source-reported and is NEVER decremented
RESERVE_EFFECT         reserved += qty only
DISPATCH_EFFECT        reserved -= qty AND available -= qty (the units must leave somewhere)
OVERSEAS_AVAILABLE_FORMULA would become wh_available_stock - wh_reserved_stock
DOUBLE_SUBTRACTION_RISK  HIGH — and it CONTRADICTS the frozen
                         OVERSEAS_RESERVED_IS_SUBTRACTED_FROM_AVAILABLE = NO
SYNC_OVERWRITE_RISK      same importer hazard
PROS   keeps a clean external/internal authority line for a future WMS feed
CONS   requires reopening a frozen R3 token · dispatch must still decrement available, so the "never
       mutate the source figure" promise holds only until the first shipment · pushes the
       double-subtraction question into every consumer instead of settling it in the writer
```

### RECOMMENDATION — **Option A**, and it is not close

Not because it is easiest, but because it is the only one the existing write semantics already describe.
The adjustment handler's own header comment states the rule R4 needs, and states it as settled:

> *"available_stock is the source-reported authority bucket (may be non-reconstructable). **We do NOT
> recompute physical from available.**"*

Option A is that sentence continued. Option B contradicts it by requiring a physical value nothing can
supply. Option C contradicts the frozen R3 availability token and buys a boundary against a sync that does
not exist, at the cost of a double-subtraction risk that does.

Option A is also what the UI has been telling the operator for as long as the page has existed:
`overseas-outbound.js` projects Lock as `available −qty / reserved +qty`. Its Ship Confirm projection reads
`snap.physicalStock` for the "current_stock" row — against the live blank column, that renders as
`0 → −shipped`. **That panel is already displaying a decrement of a bucket that does not exist**, which is
the same defect as §7, visible in production as a nonsense number. Adopting Option A makes the panel
honest; B or C leave it wrong in a new way.

**This recommendation is not self-authorising.** The operator freezes the choice.

---

## §12 — What an R3A amendment must change

```
CONTESTED FROZEN TOKEN:  OVERSEAS_CURRENT_STOCK_FIELD  (Part IV §24)
  frozen value  = wh_physical_stock
  live evidence = present, zero writers, blank — cannot be a current-stock authority
```

This is the **only** token in the R3 freeze that live evidence contradicts. It is left in place here
because amending it is the operator-gated decision, not a verification finding. Everything else in Part IV
survives the live header intact, and four tokens are positively confirmed by it:

```
OVERSEAS_AVAILABLE_STOCK_FIELD = wh_available_stock              CONFIRMED by live header + writer census
OVERSEAS_AVAILABLE_FORMULA = wh_available_stock (STORED, ...)    CONFIRMED — no code derives it
OVERSEAS_RESERVED_IS_SUBTRACTED_FROM_AVAILABLE = NO              CONFIRMED — Option A depends on it
OVERSEAS_RESERVE_CONSUMES_PHYSICAL_STOCK = NO                    CONFIRMED — already the right answer
```

Under Option A the amendment is small: `OVERSEAS_CURRENT_STOCK_FIELD = wh_available_stock`, plus an
explicit `PHYSICAL_STOCK_DECREMENT_ON_DISPATCH = NO` and a stated future-lifecycle status for
`wh_physical_stock` and `wh_damaged_stock`. Under B or C it is a larger rewrite of §24–§25.

---

## §13 — Target R4 contract, conditionally frozen

Valid **only** if the operator freezes Option A. Recorded so R4 resumes from a written contract rather
than from a rediscovery.

```
OVERSEAS_CURRENT_STOCK_SOURCE   = wh_available_stock      (physical has no lifecycle; see §2)
OVERSEAS_AVAILABLE_STOCK_SOURCE = wh_available_stock - draftExposure - planExposure
OVERSEAS_RESERVED_STOCK_SOURCE  = wh_reserved_stock       (KM-owned; no external writer)
OVERSEAS_DAMAGED_STOCK_SOURCE   = wh_damaged_stock        (future lifecycle bucket; R4 never writes it)

RESERVE_WRITES   snapshot: wh_available_stock -= qty, wh_reserved_stock += qty
                 movement: movement_type=reservation_acquire, movement_scope=reserved_stock,
                           from_stock_type=available, to_stock_type=reserved,
                           wh_before/after_available_stock + wh_before/after_reserved_stock both real,
                           reference_type=shipment_draft, reference_id = the exactly-once key
RELEASE_WRITES   the exact inverse; from_stock_type=reserved, to_stock_type=available
DISPATCH_WRITES  snapshot: wh_reserved_stock -= qty only
                 movement: movement_type=shipment_out, from_stock_type=reserved, to_stock_type=none
                 wh_before/after_physical_stock: carried unchanged, as 05_ already does

OVERSEAS_AVAILABLE_FORMULA = wh_available_stock - active_allocation_draft_exposure
                                                - active_shipping_plan_exposure
PHYSICAL_STOCK_DECREMENT_ON_DISPATCH = NO
```

**Prerequisite, not optional:** the §10 importer hazard must be closed in the same change that writes the
first reservation. A reserve lifecycle whose holds a routine CSV re-import silently zeroes is worse than no
reserve lifecycle, because the exposure ledger would keep insisting the units are held.

---

## §14 — Safety

```
PRODUCTION_ROWS_WRITTEN = 0        BEHAVIOR_CHANGED = NO
APPS_SCRIPT_SYNC_REQUIRED = NO     FRONTEND_DEPLOY_REQUIRED = NO
NEW_TABLE_REQUIRED = NO            NEW_COLUMNS_REQUIRED = NONE
SCHEMA_EXTENSION_REQUIRED = NO     DB_MIGRATION_REQUIRED = NO
S6_R4_HEADER_GATE_RESOLVED = NO    RUNTIME_IMPLEMENTATION_AUTHORIZED = NO
NEXT_TASK = S6-R3A — Overseas Inventory operational quantity model amendment (operator freezes A/B/C)
```
