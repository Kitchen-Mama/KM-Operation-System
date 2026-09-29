# S6-R3A — OVERSEAS INVENTORY OPERATIONAL QUANTITY MODEL AMENDMENT

```
PRE_SHA = 7b8bb81   branch = feature/product-strategy-board-p0   (descendant of the required 40634a9)
MODE = contract / business-semantics amendment only
PRODUCTION_ROWS_WRITTEN = 0   BEHAVIOR_CHANGED = NO   DB_MIGRATION_REQUIRED = NO
APPS_SCRIPT_SYNC_REQUIRED = NO   FRONTEND_DEPLOY_REQUIRED = NO
```

The operator froze Option A. This round writes that decision into the mainline contract as PART V,
supersedes the one R3 token it contradicts, and audits the importer the freeze puts on a collision
course with the runtime.

The freeze lands clean. The importer audit does not, and it does not for a reason worth reading: the
hazard is **larger than the one R4A named**, it has a **second owner nobody had looked at**, and closing
it needs one business fact this repository does not contain.

---

## §1 — The amendment, and what it did not touch

```
D_S6_OVERSEAS_OPERATIONAL_QUANTITY_MODEL = A          STATUS = FROZEN
SUPERSEDED_S6_R3_TOKEN_COUNT = 1
OVERSEAS_CURRENT_STOCK_FIELD = wh_available_stock     (was wh_physical_stock, PART IV §24)
```

PART IV §24 keeps its original line, annotated `[SUPERSEDED BY R3A — see PART V §30]`. History is not
rewritten, and `s6-r3-inventory-shipping-mapping-freeze.test.js` still passes **unchanged** — it pins
what R3 decided, which is still true about R3.

That creates a document in which one token name carries two values, so the new suite scopes every
amendment assertion to PART V. A whole-document regex would let the superseded line satisfy an
amendment check, and the round would look finished while having changed nothing. `M1` is the negative
control for exactly that.

**Exactly one token was superseded, and that is computed rather than promised.** The suite extracts every
`TOKEN = value` line from both Parts, intersects them, and asserts the contradicted set is the
single-element list `['OVERSEAS_CURRENT_STOCK_FIELD']`. `NEXT_TASK` is excluded by name — every Part
carries its own closing pointer and they differ by construction. Excluding it by name rather than by
loosening the comparison is deliberate: a loosened comparison would also hide a real second amendment.

The census that justifies the amendment is **re-measured, not cited**. Statements assigning
`wh_physical_stock` anywhere in `05_`, `12_`, `22_`, `31_`: zero, excluding the ledger's
`wh_before/after_physical_stock` columns, which legitimately carry the name and which `M5` proves the
filter must exclude. A token that outlives its evidence is how a frozen mistake survives.

---

## §2 — The arithmetic, executed

§31's lifecycle is not described in the contract and then hoped for in R4. It is written as a reference
implementation derived from §31 alone and executed:

```
100/0  --reserve 30-->  70/30      B1
70/30  --cancel  30--> 100/0       B2   the state is restored exactly
70/30  --dispatch 30-->  70/0      B3   available does NOT drop a second time
```

```
OVERSEAS_RESERVE_MODEL   = AVAILABLE_TO_RESERVED_TRANSFER
OVERSEAS_RELEASE_MODEL   = RESERVED_TO_AVAILABLE_TRANSFER
OVERSEAS_DISPATCH_MODEL  = RESERVED_DECREMENT_ONLY
OVERSEAS_PHYSICAL_PARTICIPATES_IN_PHASE1_ARITHMETIC = NO
```

The double-subtraction prohibition is asserted as the number it forbids, not as a warning. For a row at
`70/30`, the correct allocatable figure is **70**; `available − reserved` gives **40**. B7 computes both
and pins the difference, so the forbidden formula fails as an arithmetic mismatch rather than as a code
review opinion.

`wh_physical_stock` is carried through reserve and dispatch untouched at `''`, `0`, `500` and `12` —
including blank, because blank is what production actually holds and a model that only worked on a
number would hide the case that matters.

**Two drafts cannot both consume the same units** (B4): the second reserve is refused
`INSUFFICIENT_OVERSEAS_AVAILABLE` and writes nothing. **Damaged never leaks into available** (B6): a
fully-reserved row cannot dip into the damaged bucket for one more unit.

---

## §3 — Option A makes the two domains look alike. They are not.

```
FACTORY_OVERSEAS_STORAGE_MERGED = NO   FACTORY_OVERSEAS_RESERVATION_OWNER_MERGED = NO
```

This is the new pressure the amendment creates, and it is worth naming before someone acts on it. For a
pool holding 100 units with 30 reserved, **both domains now answer 70** — and they get there by opposite
routes. Factory *subtracts* its reserved term from a derived current stock. Overseas has *already moved*
the units out of the stored available bucket. C2 executes both and asserts the agreement, precisely
because a coincidence like that is what tempts a later round to merge two owners.

The guard holds: an overseas row fed through `normalizeBalances` is still **unreadable** on
`fac_current_stock` — never a silent zero (C3) — and KMFSG's factory filter has not been loosened (C4).

---

## §4 — The import field authority matrix

| FIELD | IMPORT_AUTHORITY | RUNTIME_AUTHORITY | BLANK_IMPORT_SEMANTIC | NONBLANK_IMPORT_SEMANTIC | CONFLICT_POLICY |
|---|---|---|---|---|---|
| `wh_available_stock` | YES (primary) | YES (reserve/release/receipt/adjust) | today **0** · target NO_WRITE | absolute set, CEILING | **GATED — §6** |
| `wh_reserved_stock` | today YES · **target NO** | YES (reserve/release/dispatch) | today **0** · target NO_WRITE | today overwrite · target IGNORED | RUNTIME_WINS_ALWAYS |
| `wh_damaged_stock` | YES (sole) | NO | today **0** · target NO_WRITE | absolute set, CEILING | IMPORT_WINS (no contender) |
| `wh_physical_stock` | NO (not in `qtyFields`) | NO (zero writers) | never written | never written | NOT_APPLICABLE |
| `wh_on_the_way_qty` | YES (sole) | NO | today **0** · target NO_WRITE | absolute set, CEILING | IMPORT_WINS (no contender) |

```
IMPORT_PROTECTION_OWNER_COUNT = 2      (R4A assumed 1)
```

### The finding R4A did not have: the client destroys the distinction first

R4A named the server hazard — `qtyFields.forEach(… setValue(qtyVals[f]))` with `qtyVals[f] = 0` for a
blank cell. Reading the client half changes the shape of the fix.

`assets/js/pages/overseas-stock.js` reads a **missing column** as the empty string (`ci === -1 ? '' : …`),
turns the empty string into `0` by the same rule as a blank cell, and then puts **every** quantity on the
request unconditionally:

```js
if (v === '') { qtyObj[f] = 0; continue; }
…
OVERSEAS_QTY_FIELDS.forEach(function(f) { obj[f] = qtyObj[f]; });
```

So by the time a row reaches the server, *"the operator omitted `reserved_stock`"* and *"the operator
wrote 0"* are **the same request**. A server-only fix cannot recover a distinction the client has already
destroyed. That is why `IMPORT_PROTECTION_OWNER_COUNT = 2`, and why the import protection slice names a
frontend file.

### The template is the delivery mechanism

The shipped import template emits a `reserved_stock` column commented **"Number >= 0. Blank = 0."** with
an example row carrying `reserved_stock: 0`. The tree currently hands the operator a file that instructs
them to zero the reservation bucket. Dropping the column is not merely safe, it is semantically right:
under Option A that column means *KM's* reservations, and a 3PL has no way to report those.

---

## §5 — The hazard, driven against the shipped importer

Everything above is a contract. Section E of the suite is a demonstration: the real
`handleImportOverseasInventorySnapshotBatch_` lifted into a sandbox with a fake spreadsheet shaped like
the live header, given a routine stock refresh, with a reservation standing.

```
E1  CONTROL   100/0  + refresh(120)  ->  120/0      as intended
E2  HAZARD     70/30 + refresh(100)  ->  100/0      THE RESERVATION IS ERASED
E2a           success: true · summary { updated: 1 } · no error · no ledger row · no warning
E3            the request never MENTIONED reserved — absent is read as zero and written
E4            a damaged count of 40 is erased by the same rule
E5            wh_physical_stock is NOT written even when the payload supplies it
E6            a row created by import is born with available set and physical BLANK
```

E2a matters as much as E2. The receipt is not merely silent about the erasure — it is **reassuring**. The
operator is told the row was *updated*, which it was.

E5 and E6 execute what R4A proved by reading: the column has no importer, and the live blank column is
what this code produces rather than a data-entry omission.

**E2 and E3 must FAIL when R4's import protection lands.** That is not fragility, it is the point — the
round that closes the hazard owes this file its replacement assertions. Each label says which way it is
meant to fail.

`M4` is the negative control that keeps E honest: a probe reading the **response** instead of the sheet
would report `success: true` and call the importer safe — the exact defect class this round is about.

---

## §6 — The invariant is frozen. The arithmetic is gated.

```
ACTIVE_RESERVATION_SURVIVES_IMPORT = YES (REQUIRED)
IMPORT_MAY_ZERO_ACTIVE_RESERVATION = NO
IMPORT_MAY_MAKE_RESERVED_UNITS_ALLOCATABLE_TWICE = NO
```

**Preserving `wh_reserved_stock` is necessary and not sufficient**, and this is the round's second
finding. Apply a reserved-only fix to the reference model — reserved protected, available taking the
source figure verbatim — and `70/30` plus a refresh reporting 100 becomes:

```
100 / 30  =  130 units held against a source figure of 100        E7
```

Which is the same forbidden state as `100/0`, reached by a different route. The reserved units become
allocatable again **through the available column**. The spec's §5 example forbids the outcome, not the
mechanism, so protecting one column is not the fix.

That makes the meaning of an imported `available` load-bearing, and it is not decidable here:

```
IMPORT_AMBIGUITY_COUNT = 1   UNRESOLVED_IMPORT_DECISION_COUNT = 1
GATE = IMPORT_AVAILABLE_SEMANTIC   STATUS = OPEN
```

| OPTION | STORED AVAILABLE | 70/30 + refresh(100) | COST |
|---|---|---|---|
| **I — GROSS** *(recommended)* | `X − R`; refuse the row if `X < R` | `70 / 30` | one named, ledgered subtraction |
| II — NET | `X` verbatim | `100 / 30` — **forbidden** | the operator must subtract units the 3PL portal never shows them |
| III — REFUSE | not written while `R > 0` | `70 / 30`, row reported skipped | routine refreshes stop updating exactly the rows under shipment |

**Option I is recommended**, on two established facts rather than on convenience. A KM reservation moves
no physical units (`OVERSEAS_RESERVE_CONSUMES_PHYSICAL_STOCK = NO`, PART IV §25), and there is no
outbound sync by which a source could learn of one (R4A §10 — no WMS feed, no scheduled job, no external
sync owner in either direction). A source figure therefore necessarily counts the units KM is holding.

**It is not frozen here**, because that argument assumes the imported file is a faithful source export
rather than one the operator has already netted by hand. That is an operational fact about how the file
is produced. No amount of code reading settles it, and getting it wrong is silent in both directions —
Option I double-subtracts a hand-netted file; Option II over-reports a source export.

```
GATE_BLAST_RADIUS = rows with wh_reserved_stock > 0   (production count today: 0)
```

The gate is one sentence wide. It blocks R4B only because R4 must land as one change and the importer is
inside it — not because a design round is missing.

---

## §7 — Movement ledger: nothing is invented

```
NEW_MOVEMENT_TYPES_REQUIRED = 0   MOVEMENT_SCHEMA_EXTENSION_REQUIRED = NO
```

| EVENT | movement_type | movement_scope | from → to | BALANCE PAIRS |
|---|---|---|---|---|
| reserve | `reservation_acquire` | `reserved_stock` | `available` → `reserved` | available + reserved |
| release | `reservation_release` | `reserved_stock` | `reserved` → `available` | available + reserved |
| dispatch | `shipment_out` | `reserved_stock` | `reserved` → `none` | reserved |
| import | `inventory_import` | `available_stock` | `''` → `available` | available + reserved |

All four types are parsed **out of the contract's own declared seven-type vocabulary** and checked for
membership (F1a) rather than listed by hand — `M7` is the control that catches an invented fifth name.
The three direction values are likewise checked as members of the declared allowed set
`available | reserved | damaged | on_the_way | none` (F2b).

Every column the mapping needs is already on `05_`'s canonical `OVS_MOV_HEADERS`, including all three
before/after balance pairs (F3a). `wh_before/after_physical_stock` are carried unchanged on every row,
as the adjustment handler already does — a ledger truthfully recording that a bucket with no lifecycle
did not move.

The dispatch row carries its own reserved drop; a second `reservation_release` row beside it would be
the double count that §8 records a round having already proved.

---

## §8 — Receiving needs no change

```
DELIVERED_INCREASES_OVERSEAS_AVAILABLE = NO   OVERSEAS_RECEIPT_OWNER_COUNT = 1
SECOND_RECEIPT_OWNER_CREATED = NO
```

`31_` posts its delta to `wh_available_stock` and holds no column index for reserved at all, so it
cannot touch an existing reservation (F4a). Its only reserved write is the literal `0` on a row it is
**creating** — a row that cannot yet hold a reservation (F4b). Received units land in the available
bucket, which is where the amended model wants them.

---

## §9 — Schema gate

```
NEW_TABLE_REQUIRED = NO        SCHEMA_EXTENSION_REQUIRED = NO
DB_MIGRATION_REQUIRED = NO     NEW_COLUMNS_REQUIRED = NONE
TABLES_AFFECTED = NONE         BACKFILL_REQUIRED = NO
```

Computed, not asserted: every field Option A names is checked for membership in the operator-verified
live header (G1). A later round that needs a new column cannot pass this gate by declaring that it
does not.

---

## §10 — R4 implementation plan

```
R4_MUST_LAND_AS_ONE_CHANGE = YES   R4_IMPLEMENTATION_OWNER_COUNT = 8
R4_DEPLOYABLE_INTERMEDIATE_STATES = 0
```

| # | OWNER | FILE |
|---|---|---|
| A | overseas availability owner | new `assets/js/core/` guard + its composition point, **above** KMFSG |
| B | reservation acquire | `05_overseas_inventory_handlers.gs` |
| C | reservation release | `05_overseas_inventory_handlers.gs` |
| D | dispatch consume | `22_shipment_dispatch_handlers.gs` |
| E | source enablement | `12_shipment_handlers.gs` |
| F | import protection — server | `05_overseas_inventory_handlers.gs` |
| F | import protection — **client** | `assets/js/pages/overseas-stock.js` |
| G | movement truthfulness | `05_` / `22_` |
| H | failure atomicity | `05_` (the existing compensation pattern) |
| — | documentation | `assets/specs/active/pages/OVERSEAS_STOCK_SPEC.md` |

The split prohibition has two halves now, not one. PART IV §25 already proved that unblocking the source
alone opens a double-allocation hole at the plan-to-shipment handoff, where `planExposure` releases and
overseas has no term to take over. **Landing the reservation lifecycle without the import protection is
the mirror image of the same defect** — the first routine stock refresh after the first reservation
destroys the hold, and the exposure ledger goes on insisting the units are held.

The source is still **blocked**, measured rather than assumed: `12_`'s sufficiency precheck still reads
factory stock for any source warehouse and still refuses `INSUFFICIENT_FACTORY_STOCK` (G3/G3a), and no
overseas reservation writer exists anywhere (G3b). R3A froze a contract; it did not implement one.

---

## §11 — What this round changed

Documentation and tests only. No `.gs` file, no runtime `.js` file, no generated bundle.

```
REQUEST_ORDER_BEHAVIOR_CHANGED = NO   PO_BEHAVIOR_CHANGED = NO
S5_RECOMMENDATION_BEHAVIOR_CHANGED = NO   SHIPPING_TO_ORDERING_AUTO_ORCHESTRATION = NO
KMFSG_INPUT_CONTRACT_CHANGED = NO
SECOND_AVAILABILITY_CALCULATION_PATH_CREATED = NO
SECOND_EXPOSURE_CALCULATION_PATH_CREATED = NO
S3/S4 seals intact · S5_READY_FOR_INTEGRATION = YES · S5_DEPLOYMENT = HOLD · S6_DEPLOYMENT = HOLD
```

---

## §12 — Position

```
S6_OVERSEAS_QUANTITY_MODEL_FREEZE = YES
S6_R4_RUNTIME_IMPLEMENTATION_AUTHORIZED = NO
UNRESOLVED_IMPORT_DECISION_COUNT = 1
NEXT_TASK = S6-R3B — IMPORT_AVAILABLE_SEMANTIC decision gate (§6), then S6-R4B
```

The quantity model is frozen, the schema gate is clean, the movement vocabulary needs no addition and
receiving needs no change. R4B is held on one open business decision, and the round declined to close it
by guessing because guessing wrong is silent in both directions.
