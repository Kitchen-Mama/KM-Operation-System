# SITE PRIORITY — DRAG-TO-REORDER DESIGN PROPOSAL (S8-B3-R3-CP2M-R2, REV 2)

> **STATUS: PROPOSAL. NOTHING IS IMPLEMENTED.** No weight conversion, no drag handler, no batch save, no
> renumbering and no schema change exists in the code. This document is for review.
>
> **WHAT OWNER HAS CONFIRMED** (CP2M-R2 covering note) is the SAVE PROTOCOL, and only that:
> 1. the target **and its neighbours** are re-read and verified immediately before saving;
> 2. after saving, the UI shows the **actual read-back weight and ordering** and does not claim the
>    previewed position held atomically;
> 3. R52 CAS, audit partial failure and `OUTCOME_UNKNOWN` are preserved, with **no auto-resend, no
>    backfill, no rollback and no renumbering**.
>
> Those three are product direction. They are **not** approval of this document, of the midpoint rule, of
> any threshold in it, or of building the feature. Rev 2 still requires review.

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

| Position | Rev 1 said | **Rev 2 says** | Why |
|---|---|---|---|
| Between `hi` and `lo` | `(hi+lo)/2` | `(hi+lo)/2` | unchanged |
| At the top | `hi × 1.1`, min `hi + 1` | **`hi + max(1, hi × 0.1)`** | §2.2 — same intent, stated so the number matches the sentence |
| At the bottom | `lo / 2`, refused if `lo ≤ 1` | **`lo − max(1, lo × 0.1)`, floor `0`; refused only if `lo` is already `0`** | §2.1 |
| Minimum gap | `1.0` meaningful, `0.01` hard | **`0.01` hard refusal; `1.0` is a WARNING, not a refusal** | §2.1 |

### 2.1 THE FLOOR IS NOT 1 — Rev 1's biggest error

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
> differently.** The warning text is therefore: *"Below 1, a higher weight no longer increases this
> site's share when supply is short — it only decides which site is served first."*

**The only hard refusal at the bottom is `lo = 0`**, because `0` is the lowest valid weight and there is
nothing below it. Negative weights are not proposed and are not in §45.A.

### 2.2 THE TOP FORMULA, AND THE RATIO CLAIM THAT DID NOT MATCH IT

Rev 1 wrote **`hi × 1.1`, minimum `hi + 1`** and described it as *"about 10% above the current leader …
so it means the same thing everywhere."* **Those two statements contradict each other.**

| `hi` | `hi × 1.1` | `hi + 1` | Rule takes | Actual increase |
|---|---|---|---|---|
| 500 | 550 | 501 | 550 | **+10%** |
| 100 | 110 | 101 | 110 | **+10%** |
| 10 | 11 | 11 | 11 | **+10%** |
| 5 | 5.5 | **6** | **6** | **+20%** |
| 2 | 2.2 | **3** | **3** | **+50%** |
| 1 | 1.1 | **2** | **2** | **+100%** |
| 0 | 0 | **1** | **1** | — (from nothing) |

Below `hi = 10` the `+1` minimum takes over and the increase is **not** 10%. Rev 1's "+10% everywhere"
was wrong in exactly the small-magnitude range where Rev 1 criticised `+10` for being wrong.

**Rev 2 keeps the behaviour and fixes the sentence.** Written as `hi + max(1, hi × 0.1)`, which is the
same number, the rule reads honestly: *"ten percent above the leader, or one whole point, whichever is
larger."* The `+1` is there because a 10% step on a weight of 2 is 0.2, and a 0.2 gap is below the
meaningfulness warning in §2.1 — so the minimum is a **usability** floor, not a proportionality claim.

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

> **Rev 2 does not accept the 4.A residual on Owner's behalf.** Owner's confirmed direction requires the
> re-read and the read-back display; it does not state that the remaining window is acceptable. That is
> listed in §8.

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

## 7. THE WORKABLE-CASE COUNT, RECOUNTED

Rev 1 claimed *"of the six drags an operator is most likely to try, four work and two are refused"* — from
a table that listed **seven**, under a floor rule that §2.1 has now removed.

Recounted against §3 on the same fixture, **21 cases, with company separation enforced**:

| | Count | Cases |
|---|---|---|
| **Accept** | **9** | T1, T3, T9, T10, T14, T15, T17, T18, T20 |
| **Refuse, with an actionable reason** | **9** | T2, T6, T7, T8, T11, T13, T19, T21, T5 (not draggable) |
| **Behaviour statements, not drags** | **3** | T12, T16, T4 |
| Outcome-handling cases (§3.5) | 4 | T22–T25 |

**Every refusal is visible before the drop**, not after it: tied pairs carry a badge and a non-droppable
gap, a cross-company boundary is not a drop target, an INVALID row has no drag handle, and an exhausted
gap is drawn as full.

---

## 8. WHAT OWNER IS BEING ASKED NOW

Owner's three confirmed directions are **adopted** and are not re-asked: the pre-save re-read of target
and neighbours (§4.A), the post-save read-back display (§4.A), and R52 CAS / partial failure /
`OUTCOME_UNKNOWN` with no auto-resend, backfill, rollback or renumbering (§3.5, §5).

**Still requiring review, because Rev 1's answers to all four were wrong:**

1. **§2.1 — the floor.** Rev 1 refused everything at or below weight 1. Rev 2 refuses only `lo = 0` and
   **warns** below 1. Confirm the warning is the right strength.
2. **§2.2 — the top step.** `hi + max(1, hi × 0.1)`: ten percent, or one whole point, whichever is larger.
   The behaviour is Rev 1's; only the description is corrected. Confirm the business intent.
3. **§2.3 — depletion.** ~7 insertions between the same pair exhausts the gap and the next is refused.
   The alternative is respreading, which is multi-row (§5). Confirm refusal is preferred.
4. **§4 — the residual.** 4.A narrows the window to one round trip; only 4.B removes it, and 4.B is a
   backend contract change that is not proposed. **Accept the residual, or commission 4.B.**

**Not covered and not built:** multi-row writes, normalisation, respreading, auto-renumbering, Missing
backfill, clearing a priority, any new API or schema, any change to the allocation formula, and the drag
implementation itself.
