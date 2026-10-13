# SITE PRIORITY — DRAG-TO-REORDER DESIGN PROPOSAL (S8-B3-R3-CP2M-R3, REV 3)

> **STATUS: PROPOSAL. NOTHING IS IMPLEMENTED.** No weight conversion, no drag handler, no batch save, no
> renumbering and no schema change exists in the code. Rev 3 records decisions; it does not build them.
>
> **DECIDED, AND NOT RE-ASKED HERE.**
>
> | # | Decision | Where it lands |
> |---|---|---|
> | D1 | the save protocol: re-read target **and neighbours** before saving; after saving show the **actual read-back** weight and ordering; never claim the preview held atomically | §4.A, §3.5 |
> | D2 | R52 CAS, audit **partial failure** and `OUTCOME_UNKNOWN` preserved — no auto-resend, no backfill, no rollback, no renumbering | §3.5, §5 |
> | D3 | **"drag to top" is `hi × 1.1`, with the `+1` minimum REMOVED** | §2.2 |
> | D4 | **non-negative weights are allowed, including the whole 0–1 range.** There is no floor refusal above 0 | §2.1 |
> | D5 | the neighbour-race residual (§4) is **ACCEPTED** | §4 |
>
> **STILL UNAPPROVED, AND THEREFORE NOT BUILT:** the midpoint insertion rule itself, the bottom rule, the
> precision/depletion rule, and the drag implementation. They are gathered in §8 so the boundary between
> "decided" and "proposed" is visible rather than implied.

---

## 0. WHAT REV 1 GOT WRONG, AND WHY IT MATTERED

Rev 1 was written after reading the allocator. It was not read closely enough. Re-reading
`supply-planning-allocations.js` line by line shows **`allocationPriority` does four different jobs, and
Rev 1 collapsed them into one.** Section 1 separates them. The consequences are not cosmetic: Rev 1's
central refusal rule, its "drag to top" formula, its precision argument and its count of workable cases
were all built on the collapsed version and all four change here.

Two further claims are removed outright because they are false:

| Rev 1 claim | Why it is wrong |
|---|---|
| *"One drag = one row = one CAS = one atomic cell write. There is no partial-failure state to design because there is no second write."* | **There IS a second write, and a third.** The R52 setter writes `allocation_priority`, `updated_by` and `updated_at` in the same commit. A failure part-way through that commit is exactly what `OUTCOME_UNKNOWN` exists to describe. A single ROW is not a single CELL. |
| *"a new backend action writing the set under one lock"* offered as the fix for multi-row | **A lock is not a transaction.** A lock serialises writers; it does not roll back a write that already landed when a later one in the same batch fails. All-or-nothing needs the write itself to be conditional and reversible, which is a separate property a lock does not supply. |

---

## 1. FOUR JOBS, NOT ONE: LEGAL VALUE, SHORTAGE MULTIPLIER, ORDER, FINAL QUANTITY

These are read from `assets/js/core/supply-planning-allocations.js` (the overseas shared-pool allocator)
and must be kept apart. **Rev 1's single sentence "priority multiplies the share" is true in one branch of
one mode and false everywhere else.**

### 1.A LEGAL VALUE — what may be stored (§45.A)
Three states: **MISSING**, **INVALID**, **SET**. `0` is a valid SET and the lowest valid weight; decimals
are valid. Identity and validation only — this layer says nothing about allocation.

### 1.B THE SHORTAGE MULTIPLIER — one branch, one mode
The allocator picks a mode per lane:

```
poolSupply < sumSurvival   ->  SHORTAGE_ALLOCATION
otherwise                  ->  NORMAL_ALLOCATION or PROTECTED_REALLOCATION
```

**Only** in `SHORTAGE_ALLOCATION` is priority a multiplier:

```
weight = min(survivalNeedQty, demandQty) * Math.max(allocationPriority, 1)
```

That `Math.max(..., 1)` clamp — the one Rev 1 built its floor rule on — **exists only here.**

### 1.C THE ORDER — raw priority, never clamped
In the non-shortage modes the distribution weight is **`demandWeight`**, which defaults to `demandQty`.
Priority is **not a multiplier at all** there. It appears only as the leading key of three comparators:

| Comparator | Where | Leading key |
|---|---|---|
| `recvOrder` (§40.13) | receiver iteration order | `allocationPriority` DESC, then `demandWeight` DESC, then marketplace, then receiverKey |
| shortage leftover | `SHORTAGE_ALLOCATION` | `allocationPriority` DESC, then unmet survival DESC, … |
| normal leftover | `NORMAL` / `PROTECTED` | `allocationPriority` DESC, then marketplace, then receiverKey |

**Every one of these uses the RAW stored value.** Not clamped. So `0`, `0.5` and `1` are three *different*
positions in all three comparators, even though §1.B treats them as the same multiplier.

### 1.D THE FINAL QUANTITY — integer, capped, survival-first
`distributeByWeightCapped` allocates whole units, caps each receiver at `demandQty`, and in the
non-shortage modes satisfies survival need **first**, distributing only the remainder by weight. The
final number a site receives therefore depends on the pool size, its own demand cap, its survival need,
the mode, and the leftover order. **Priority is one input of five, and in the common (non-shortage) case
it does not scale anything — it only decides who receives the integer leftover.**

### 1.E AND THE FACTORY ORDER IS A DIFFERENT ORDER AGAIN (§35)
`requiredByDate ASC -> priority DESC -> company ASC -> …`. The date leads. Priority only breaks date ties.

> **Therefore the UI may never say "this site is served first."** It is not true in the factory order, it
> is not true in the normal overseas mode, and in the shortage mode it is true only after survival need,
> demand caps and pool size have had their say. The screen edits **a stored weight**, and the honest
> label is: *"a higher weight is served earlier when sites are compared, and receives a larger share only
> when supply is short."*

---

## 2. THE RULE

**One drag moves exactly one row. The dragged row takes a weight strictly between its new neighbours.**

| Position | Rev 2 said | **Rev 3** | State |
|---|---|---|---|
| At the top | `hi + max(1, hi × 0.1)` | **`hi × 1.1`** — the `+1` minimum is removed | **DECIDED (D3)** |
| Top, where `hi = 0` or there is no comparison basis | — | **`1.0`**, a named constant | **DECIDED (D3), §2.2** |
| Any weight in `0 … 1` | refused / warned | **allowed, no refusal** | **DECIDED (D4)** |
| Negative weight | — | **never produced, never accepted** | **DECIDED (D4)** |
| Between `hi` and `lo` | `(hi+lo)/2` | `(hi+lo)/2` | **proposed, §8** |
| At the bottom | `lo − max(1, lo × 0.1)` | *unchanged proposal* | **proposed, §8** |
| Minimum gap / rounding | `0.01` hard refusal | *unchanged proposal* | **proposed, §8** |

### 2.1 THERE IS NO FLOOR ABOVE ZERO — DECIDED (D4)

Rev 1 said: *"every weight at or below 1 produces an identical share"*, and refused any drag landing
there. **That is false**, for two independent reasons from §1:

1. The `Math.max(priority, 1)` clamp applies **only in `SHORTAGE_ALLOCATION`**. In the normal and
   protected modes the weight is `demandWeight`; the clamp is not involved at all.
2. Even inside shortage mode, the **leftover comparator reads the raw value**. A site at `1` is ordered
   ahead of a site at `0.5`, which is ordered ahead of a site at `0`. They are three distinct positions.

So what is actually true is narrower, and it is a *warning*, not a prohibition:

| Stored weight | Shortage multiplier | Position in all three comparators |
|---|---|---|
| 0 | 1 (clamped) | lowest |
| 0.5 | 1 (clamped) | above 0 |
| 1 | 1 | above 0.5 |
| 2 | 2 | above 1 |

> **Two sites both at or below 1 receive the same MULTIPLIER in a shortage, and are still ordered
> differently.** Owner has decided that this is acceptable and that the 0–1 range is usable. The UI
> therefore **does not refuse** a weight there; it states the consequence once, as information rather
> than as an obstacle: *"Below 1, a higher weight no longer increases this site's share when supply is
> short — it only decides which site is served first."*

**Weights are NON-NEGATIVE (D4).** `0` remains the lowest valid weight and `0 … 1` is a usable range.
A negative weight is never produced by any rule here and is never accepted from one: §45.A has no state
for it, and the three comparators would order it below a site that is explicitly switched off. The only
structural refusal left at the bottom is a drag below a site that is **already at 0**, because there is
no non-negative value strictly below zero.

### 2.2 THE TOP FORMULA IS PURE `hi × 1.1` — DECIDED (D3)

Rev 1 wrote `hi × 1.1` but described it as "+10% everywhere" while a `+1` minimum silently took over
below `hi = 10` (+20% at 5, +100% at 1). Rev 2 kept the behaviour and fixed the sentence. **Owner has
now removed the `+1` instead**, so the rule and the sentence agree without a special case:

| `hi` | `hi × 1.1` | increase |
|---|---|---|
| 500 | 550 | +10% |
| 100 | 110 | +10% |
| 10 | 11 | +10% |
| 5 | 5.5 | +10% |
| 2 | 2.2 | +10% |
| 1 | 1.1 | +10% |
| 0.5 | 0.55 | +10% |
| **0** | **0** | **— multiplication cannot escape zero** |

**"Ten percent above the leader" is now true at every magnitude**, and the 0–1 range it reaches is
usable by D4.

#### 2.2.1 `hi = 0`, and "no comparison basis" — the two cases a multiplier cannot answer

`0 × 1.1 = 0`, which is not strictly above `0`. Multiplication has no way out of zero, so the value must
be **named rather than derived**. The same is true when there is no `hi` at all: the list is empty, the
dragged row is the only one, or every other row is MISSING or INVALID and so has no position.

> **`TOP_FROM_ZERO = 1.0`** — a named constant, used for both cases.

**Why 1.0 and not 0.1 or 10.** It is the smallest weight that is distinguishable in **both** of the
roles §1 separates: it is strictly above `0` in all three comparators, and it is the exact point at
which `Math.max(priority, 1)` stops clamping, so it is also the smallest weight that is not identical
to its neighbours as a shortage multiplier. Anything smaller is distinguishable only in ordering;
anything larger asserts a magnitude the operator did not express by dragging to the top of a list that
had nothing in it.

#### 2.2.2 Where `hi × 1.1` meets the rounding rule — flagged, NOT decided

Rev 2's §2.3 rounds a computed weight to 2 decimal places before the bracket check. Pure `hi × 1.1`
collapses back onto `hi` under that rounding for **`hi ≤ 0.04`** (`0.04 × 1.1 = 0.044 → 0.04`). D4 makes
that range reachable, so the interaction is real rather than theoretical.

It is **listed in §8 and not resolved here**, because the rounding rule itself is unapproved and
choosing a fix now would be deciding the unapproved rule by implication. The three candidates, for the
Owner's eventual review: raise the stored precision for small weights; apply `TOP_FROM_ZERO` whenever
`hi × 1.1` fails to round strictly above `hi`; or refuse the drag and say the gap is exhausted.

### 2.3 THE PRECISION REASON, CORRECTED

Rev 1 justified the `0.01` floor as the point where *"floating point stops being trustworthy."*
**That is not true.** IEEE-754 doubles carry ~15–16 significant decimal digits; `0.01` is nowhere near
any limit, and midpoints of realistic weights are exact to far more precision than anyone needs.

The real constraints are two, and neither is about the arithmetic:

1. **Repeated midpointing halves the gap each time.** Starting from a gap of 1, successive insertions at
   the same place give 0.5, 0.25, 0.125, … After ~7 insertions between the same pair the gap is under
   0.01. This is a **depletion** limit, not a precision limit, and it is why a hard floor exists at all.
2. **The value round-trips through a spreadsheet cell as text.** A weight of `80.00000000000001` is a
   correct double and a terrible cell. Rev 2 therefore **rounds the computed weight to 2 decimal places
   before writing**, and the refusal fires when that rounded value is not strictly between the
   neighbours. Rounding happens *before* the check, so the value checked is the value stored.

> **Consequence, stated plainly:** about **7 consecutive insertions between the same two adjacent sites**
> will exhaust the gap, and the 8th is refused with *"there is no room between these two sites; change
> one of their weights first."* No automatic respreading — that would be a multi-row write (§6).

---

## 3. THE COMPLETE RULE SET, WITH TEST CASES

The five cases Owner asked to be completed first. The fixture is the one the viewport capture uses.

| Site | Stored | State |
|---|---|---|
| KitchenMama / Amazon US | 100 | SET |
| KitchenMama / Amazon GB | 80 | SET |
| KitchenMama / Amazon DE | 80 | SET (duplicate) |
| KitchenMama / Rakuten JP | 0 | SET (lowest valid) |
| KitchenMama / Walmart CA | — | **MISSING** |
| ResourceUS / Amazon US | 50 | SET |
| ResourceUS / eBay US | `7abc` | **INVALID** |

Companies are separate scopes (§3.6). A ResourceUS row can never be dropped among KitchenMama rows.

### 3.1 MIDDLE INSERTION

| # | Drag | Computed | Verdict |
|---|---|---|---|
| T1 | JP between US 100 and GB 80 | `(100+80)/2 = 90.00` | **ACCEPT** |
| T2 | JP between GB 80 and DE 80 | no value strictly between | **REFUSE — equal neighbours** |
| T3 | CA (Missing) between US 100 and GB 80 | `90.00` | **ACCEPT as first set** (§3.5) |
| T4 | DE between JP 0 and nothing below | handled by §3.2 | — |
| T5 | eBay (INVALID) anywhere | position undefined | **NOT DRAGGABLE** |
| T6 | ResourceUS US 50 between KM 100 and KM 80 | cross-company | **REFUSE — different company** |
| **T26** | **drag to top where the leader is `hi = 0`** (JP) | `0 × 1.1 = 0`, not above — so `TOP_FROM_ZERO` | **ACCEPT at `1.00`** (§2.2.1) |
| **T27** | **drag to top of an EMPTY ordered list** (every other row Missing/Invalid) | no `hi` exists | **ACCEPT at `1.00`** (§2.2.1) |
| **T28** | **drag to top where `hi = 0.5`** | `0.5 × 1.1 = 0.55` | **ACCEPT** — the 0–1 range is usable (D4) |
| **T29** | **drag to top where `hi = 0.04`** | `0.044` rounds to `0.04` — not above `hi` | **UNRESOLVED** — §2.2.2, listed in §8 |

### 3.2 BOTTOM

| # | Drag | Computed | Verdict |
|---|---|---|---|
| T7 | DE 80 below JP 0 | `0 − max(1, 0) = −1` → clamped to `0`; not strictly below `0` | **REFUSE — JP is already at the lowest weight** |
| T8 | GB 80 below ResourceUS 50 *(same company only)* | n/a — different company | **REFUSE** |
| T9 | Bottom drag where `lo = 20` | `20 − max(1, 2) = 18.00` | **ACCEPT** |
| T10 | Bottom drag where `lo = 0.5` | `0.5 − max(1, 0.05)` → below 0 → clamp `0` | **ACCEPT at 0, with the §2.1 warning** |
| T11 | Bottom drag where `lo = 0` | nothing below 0 | **REFUSE** |

### 3.3 DUPLICATE WEIGHTS

| # | Case | Behaviour |
|---|---|---|
| T12 | GB 80 and DE 80 displayed | both carry a **tie badge**; the gap between them is **not a drop target** |
| T13 | Drop *between* the tied pair | **REFUSE — equal neighbours.** Stated before the drop, by the non-droppable zone |
| T14 | Drag GB above US | `100 + max(1,10) = 110.00`. **ACCEPT** — and this also breaks the tie, by raising GB only |
| T15 | Drag a third row between US 100 and the tied pair | `(100+80)/2 = 90.00`. **ACCEPT** — the tie is untouched |
| T16 | Does a tie reorder the allocator? | **No.** Equal priority falls through to `demandWeight`, then marketplace, then receiverKey (§1.C) — the screen's row order is **not** the tiebreak |

### 3.4 PRECISION / DEPLETION

| # | Case | Behaviour |
|---|---|---|
| T17 | Insert between 80 and 81 | `80.50` | **ACCEPT** |
| T18 | Insert again between 80 and 80.5 | `80.25` | **ACCEPT**, with the §2.1 sub-1-gap warning |
| T19 | …repeated until the gap < 0.01 | **REFUSE — no room between these two sites** |
| T20 | Computed `80.333333…` | rounded to `80.33` **before** the bracket check and before the write | the value checked is the value stored |
| T21 | Rounding would equal a neighbour | **REFUSE** — caught by the post-rounding check, never written |

### 3.5 MISSING — FIRST SET

Missing rows sit in a separate **"No priority set"** group, outside the ordered list. **Nothing is ever
auto-assigned** — not to make room, not to complete a sequence, not as a side effect. Dragging one in is
an explicit first set, dispatched as the R52 write with
`expected_allocation_priority_state: 'MISSING'`.

| # | Outcome | What the row shows | What the operator may do |
|---|---|---|---|
| T22 | `CONFIRMED_COMMITTED` | the read-back weight, in its read-back position | nothing |
| T23 | `CONFIRMED_REJECTED` (zero-write **proven**) | returns to **Missing**, with the server's reason | correct and retry — safe, nothing was written |
| T24 | `CONFIRMED_NOT_STARTED` (zero-write proven) | returns to **Missing** | retry |
| T25 | **`OUTCOME_UNKNOWN`** | **holds the dragged position, WARN, labelled unconfirmed** | **Refresh. Never retry.** |

**T25 is the case that must not be simplified.** The list may not snap back to Missing — that asserts a
zero write nobody proved — and may not show the weight as settled. It holds the proposed position,
visibly unconfirmed, until a fresh read settles it. **A matching value after a refresh still does not
prove this request committed**, and the WARN text says so. **No automatic resend, no rollback.**

**And the audit columns are part of this.** The R52 setter writes `allocation_priority`, `updated_by` and
`updated_at` together. T25 covers a commit that failed *between* those columns as well as one that never
started — which is precisely why the row cannot be redrawn from the request's own intent.

---

## 4. THE NEIGHBOUR RACE — TWO DIFFERENT THINGS, KEPT APART

The R52 compare-and-set proves **the dragged row** has not changed since it was read. It proves nothing
about the **neighbours** whose weights produced the midpoint.

Losing sequence:
1. Operator reads US=100, GB=80; drags JP between them → `90.00`.
2. Someone else sets GB=95.
3. Operator saves. JP's CAS passes (JP is unchanged). JP becomes 90 — now **below** GB, not above it.

No row was lost and no update was lost. What is wrong is the **placement**: the result does not match the
preview. Two mitigations exist and they are **not** the same thing.

### 4.A WHAT THE FRONT END CAN DO TODAY — a re-read, and it is advisory
Immediately before dispatching, the page re-reads the target **and both neighbours** and checks they
still bracket the rounded value. If not, it refuses: *"the sites around this one changed — refresh and
try again."*

**Its exact limit:** a read is not a latch. A neighbour can change between this check and the write. The
window is narrowed from "however long the operator deliberated" to "one network round trip" — a real
improvement and **not** a guarantee. This is Owner's confirmed direction (1), and Rev 2 adopts it.

**Paired with it, Owner's confirmed direction (2):** after the write settles, the UI shows the **actual
read-back weight and ordering**, not the previewed position. When they differ the row says so. The
preview is a proposal; the read-back is the fact.

### 4.B WHAT WOULD ACTUALLY CLOSE IT — a conditional update inside the server's lock
The race survives in 4.A because the check and the write are two separate round trips. Closing it
requires the comparison to happen **where the write happens**: the request carries the expected
neighbour weights, and the server — inside the lock it already takes — re-reads those neighbours, and
commits only if they still match, refusing atomically otherwise.

That is a **backend contract change**: a new field on the request, a new refusal code, and a new server
branch. **It is not proposed here and is not costed here.** It is named so the two options are not
confused with each other: 4.A narrows the window, 4.B removes it.

> **THE RESIDUAL IS ACCEPTED (D5).** Owner has accepted the one-round-trip window that 4.A leaves open.
> So 4.A is the design, 4.B is not commissioned, and the acceptance is recorded here rather than being
> re-raised each round. What the residual costs is unchanged and stays on screen: the PLACEMENT may not
> match the preview, the read-back (D1) is what the operator is shown, and no row is lost in any case.

---

## 5. WHAT A SINGLE-ROW DRAG CAN AND CANNOT FAIL AT

Replacing Rev 1's false claim that there is no partial-failure state.

| Scope | Atomic? | Partial failure possible? |
|---|---|---|
| One cell | yes | no |
| **One row — the R52 setter** | **not guaranteed** | **yes**: `allocation_priority`, `updated_by`, `updated_at` are three writes in one commit; a failure between them is `OUTCOME_UNKNOWN` with `zero_write:false` |
| N rows, N requests | no | yes: a failure at row 3 of 5 leaves 1–2 committed, 4–5 untouched, and `OUTCOME_UNKNOWN` means even *"row 3 failed"* may be false |
| N rows under one server lock | **still no** | **a lock serialises; it does not roll back.** All-or-nothing needs a conditional, reversible write — a property a lock does not supply |

**Therefore multi-row is not proposed.** Normalisation, respreading, "make room" and auto-renumbering are
all multi-row operations and all inherit the bottom two rows of this table. They would need either a
genuinely transactional backend write, or an accepted and documented partial-failure model. **Neither
exists; neither is proposed.**

---

## 6. UNCHANGED, AND RELIED UPON

Allocation formula and mode selection (§24.7) · demand ordering (§35) · overseas receiver ordering
(§40.13) · quantity conservation · Production data · the weight scale (no normalisation, no rescale, no
cap) · the schema · §45.A's three states · the allocator's refusal of an unresolved priority.

Accessibility is unchanged: keyboard (`Space` lift, `↑`/`↓`, `Space` drop, `Esc` cancel) and touch
(long-press plus explicit **Move up / Move down** buttons) produce the identical single-row change, the
identical preview, the identical save and the identical refusals.

---

## 7. THE CASE COUNT, RECOUNTED FOR REV 3

Rev 1 claimed *"of the six drags an operator is most likely to try, four work and two are refused"* — from
a table that listed **seven**, under a floor rule §2.1 has since removed. Rev 2 recounted 21. D3 and D4
add four more cases at the top of the range, so the count moves again — which is the point of recording
it rather than asserting it.

Recounted against §3 on the same fixture, **25 drag cases, with company separation enforced**:

| | Count | Cases |
|---|---|---|
| **Accept** | **12** | T1, T3, T9, T10, T14, T15, T17, T18, T20, **T26, T27, T28** |
| **Refuse, with an actionable reason** | **9** | T2, T5 (not draggable), T6, T7, T8, T11, T13, T19, T21 |
| **Behaviour statements, not drags** | **3** | T4, T12, T16 |
| **UNRESOLVED pending §8** | **1** | **T29** (`hi ≤ 0.04` under the rounding rule) |
| Outcome-handling cases (§3.5) | 4 | T22–T25 |

**Every refusal is visible before the drop**, not after it: tied pairs carry a badge and a non-droppable
gap, a cross-company boundary is not a drop target, an INVALID row has no drag handle, and an exhausted
gap is drawn as full. **T29 is the one case with no answer yet**, and it is drawn as unavailable rather
than guessed at.

---

## 8. WHAT IS STILL UNAPPROVED

**Nothing in D1–D5 is re-asked.** The save protocol, the CAS and partial-failure handling, the pure
`hi × 1.1` top rule, the non-negative range and the accepted neighbour residual are settled and are
recorded at the top of this document.

**These four are listed because they are NOT decided, and no code may assume them:**

| # | Rule | Status |
|---|---|---|
| U1 | **Midpoint insertion**, `(hi+lo)/2`, one row per drag | proposed, §2, §3.1 |
| U2 | **The bottom rule**, `lo − max(1, lo × 0.1)` floored at 0 | proposed, §3.2 — note it still carries a `max(1, …)` term of the kind D3 removed from the top rule, and Owner has not said whether the same simplification applies here |
| U3 | **Rounding to 2dp and the `0.01` depletion refusal** (~7 midpoints exhaust a gap of 1) | proposed, §2.3, §3.4 |
| U4 | **T29** — `hi × 1.1` rounding back onto `hi` for `hi ≤ 0.04`, which D4 made reachable | **unresolved**, §2.2.2 — three candidate fixes listed there, none chosen |

U2, U3 and U4 are entangled: the bottom rule and the rounding rule together decide what happens at the
small end of the range D4 opened, and choosing any one of them in isolation decides the others by
implication. **Rev 3 therefore proposes none of them**, and the drag feature is not built.

**Not covered and not built:** multi-row writes, normalisation, respreading, auto-renumbering, Missing
backfill, clearing a priority, any new API or schema, any change to the allocation formula, and the drag
implementation itself.
