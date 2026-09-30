# S6-R3B — IMPORT AVAILABLE SEMANTIC DECISION FREEZE

```
PRE_SHA = a6126e5 (clean descendant of the required 278f254)   branch = feature/product-strategy-board-p0
WORKTREE_CLEAN_AT_START = YES
MODE = CONTRACT / BUSINESS-SEMANTICS DECISION FREEZE
RUNTIME_IMPLEMENTED = NONE   PRODUCTION_ROWS_WRITTEN = 0   BEHAVIOR_CHANGED = NO
```

R3A froze the quantity model and stopped at one sentence it could not write. The operator has written it.
This round records the decision, derives everything that follows, and implements no runtime.

---

## The decision

```
D_S6_IMPORT_AVAILABLE_SEMANTIC = GROSS     STATUS = FROZEN     (§34's Option I)
SOURCE_AVAILABLE_SEMANTIC    = gross, source-reported, BEFORE KM reservation
CANONICAL_AVAILABLE_SEMANTIC = operational, AFTER KM reservation has moved units out of it
KM_RESERVATION_AUTHORITY = the S6-R4B reservation lifecycle   COUNT = 1
```

The two meanings coincide exactly while `R = 0` — which is every production row today — and that
coincidence is why the defect has never been visible. The moment the first reservation exists they diverge
by `R`.

GROSS is **not** `wh_physical_stock`. Physical stays outside Phase-1 arithmetic; the frozen formula names it
only to say it is untouched (`A1`–`A3`).

---

## The arithmetic, and the ordering that makes two rules agree

```
GUARD               refuse the row when S < R          <- FIRST
wh_available_stock := S - R
wh_reserved_stock  := R                                 (unchanged; import never writes it)
```

The task's §2 writes the stored value as `max(0, S - R)`; its §5 forbids silent clamping. **Both hold only
if the refusal runs before the subtraction.** Apply the floor first and §5 is violated by construction:
`max(0, 20 - 30)` is a silent clamp wearing a formula's clothes, and it erases ten reserved units by
arithmetic rather than by assignment.

`D3` drives both models side by side: the clamped one accepts the contradiction and writes `available 0`;
the frozen one refuses and leaves `70/30` standing.

```
CLAMP_REACHABLE_UNDER_GUARD = NO
IMPORT_AVAILABLE_CLAMP = NOT_REQUIRED — the GUARD is the frozen safety property, not the floor
```

---

## The three reserved cases

```
MISSING_RESERVED         -> PRESERVE canonical R   (no write)
BLANK_RESERVED           -> PRESERVE canonical R   (no write)
EXPLICIT_ZERO_RESERVED   -> PRESERVE canonical R   (no write)
IMPORT_WRITES_RESERVED = NO   (unconditionally — new rows and existing rows alike)
```

§4 asks whether the safest target is to stop accepting reserved as an import authority *once the canonical
row exists*. **It is safer still to stop accepting it at all**, and the new-row case is the argument: a
source reporting `reserved = 5` on a SKU KM has never reserved is reporting the source's own holdback, and
writing it would mint a KM reservation KM does not own, hiding five units with no lifecycle able to release
them (`C3`).

`C1` is the assertion that separates "prefer the canonical value" from "ignore entirely" — the two rules
agree on blank and on zero and disagree on a non-zero payload. Five different reserved payloads produce one
outcome.

---

## New row vs existing row

| CASE | R BEFORE | S | RESULT | §11 |
|---|---|---|---|---|
| NEW | none | 100 | `100 / 0` | A |
| EXISTING, unreserved | 0 | 100 | `100 / 0` | B |
| EXISTING, reserved | 30 | 100 | `70 / 30` | C · D · E · F |
| EXISTING, fully reserved | 100 | 100 | `0 / 100` | G |
| EXISTING, contradiction | 30 | 20 | **refused, no mutation** | H |

```
ONE_ARITHMETIC_TWO_CASES = YES — the new row is R = 0, not a different rule
```

That is the property that makes a re-import of a row which has *since* acquired a reservation behave
correctly without anyone remembering to update a second code path. `I` proves idempotency (three identical
imports, no drift) and `I1` names the reason: the import assigns `S - R` rather than adjusting the stored
value. `J`/`K` close the loop — reserve → import → release returns exactly to `100/0`, and
reserve → import → dispatch removes exactly the dispatched quantity and nothing else.

---

## Contradiction

```
CONDITION  S < R      BEHAVIOR  row REFUSED, nothing written      SCOPE  ROW-level
CODE       IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE
NEGATIVE_AVAILABLE_WRITTEN = NO   RESERVED_SILENTLY_REDUCED = NO
AVAILABLE_SILENTLY_CLAMPED = NO   PHYSICAL_INVENTED_TO_BALANCE = NO
EXISTING_TOKEN_REUSED = NO (surveyed)   NEW_TOKENS_ADDED = 1
BUSINESS_DECISION_BEYOND_GROSS_REQUIRED = NO
```

Row-level and not batch-level, deliberately: the existing batch gate covers a scope error that makes the
whole file wrong, whereas a contradiction on one SKU says nothing about the others. Failing the batch would
stop a routine refresh updating dozens of correct rows because one SKU is under shipment — which is §34's
Option III cost arriving through the back door.

---

## Template

```
IMPORT_TEMPLATE_DECISION = A — REMOVE `reserved_stock` from the shipped template
IMPORT_TEMPLATE_BLANK_COMMENT = "Blank = leave unchanged"
TEMPLATE_REMOVAL_IS_SUFFICIENT = NO
```

Option B — keep the column, ignore it — was rejected because a column that is shipped, filled in, uploaded
and silently discarded teaches the operator they control a number they do not.

Removal is **necessary and not sufficient**, the same shape of finding as §34's. The client resolves columns
by header name, not by template, so an operator-built or previously-downloaded file may still carry
`reserved_stock`. The template removal stops the system *teaching* the hazard; §43's server rule stops it
*being* one.

---

## Schema

```
NEW_TABLE_REQUIRED = NO   SCHEMA_EXTENSION_REQUIRED = NO   DB_MIGRATION_REQUIRED = NO
NEW_COLUMNS_REQUIRED = NONE   BACKFILL_REQUIRED = NO   DB_CHANGE_DECISION_REQUIRED = NO
```

`S` is an input and is not stored; `R` is stored and is not written by the import; the subtraction happens
between a payload value and a cell the handler already reads. `BACKFILL = NO` is reasoned rather than
assumed (`E1`): with `R = 0` on every production row, `S - R === S`, so no historical row is mis-stated. The
decision has no retroactive effect — only a forward one.

---

## What this round did NOT do

Sections F and G drive the shipped code and record that it still does the thing the contract now forbids:

```
F1  the shipped importer turns 70/30 into 100/0                    MUST BREAK IN R4B
F2  the §45 contradiction is not detected at all — 20 overwrites a 30-unit reservation   MUST BREAK IN R4B
F5  the UPDATE branch writes all four quantity fields unconditionally                    MUST BREAK IN R4B
F6  IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE does not exist in the handler yet
G2  the client turns an ABSENT column and a blank cell into the same 0                   MUST BREAK IN R4B
G3  the template still says "Blank = 0." for reserved_stock                              MUST BREAK IN R4B
```

`H4`/`H5` assert the converse — neither owner carries any R3B implementation. A contract round whose tests
pass against unchanged runtime is either testing nothing or lying about what shipped.

### One consequence for R4B's ordering

Freezing `IMPORT_WRITES_RESERVED = NO` neutralises the **client's** blank-and-absent collapse *for reserved*
— the server will ignore that field whatever the payload carries. It does nothing for the other three:

```
wh_reserved_stock   NEUTRALISED by the server-side ignore
wh_available_stock  UNCHANGED — a file missing the column still zeroes available
wh_damaged_stock    UNCHANGED
wh_on_the_way_qty   UNCHANGED
```

So the client fix stays inside the one atomic change. What changed is that the server rule now protects the
one bucket that has a lifecycle, and the client rule protects the three that do not.

---

## Position

```
S6_IMPORT_SEMANTIC_FREEZE = YES        UNRESOLVED_IMPORT_DECISION_COUNT = 0
OPEN_S6_BLOCKERS = NONE                S6_R4_RUNTIME_IMPLEMENTATION_AUTHORIZED = YES
S5_DEPLOYMENT = HOLD   S6_DEPLOYMENT = HOLD
NEXT_TASK = S6-R4B — overseas availability + reserve/release/consume + shipping-source enablement
```

R4B inherits §38's eight owners unchanged, plus three obligations from this round: the §41 guard evaluated
before the subtraction, the new token registered where the repository registers canonical codes, and the
template column removed with its blank comment rewritten.
