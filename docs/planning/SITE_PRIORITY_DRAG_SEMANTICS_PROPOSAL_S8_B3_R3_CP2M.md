# SITE PRIORITY — DRAG-TO-REORDER (S8-B3-R3-CP2M-R4, REV 4 — **IMPLEMENTED**)

> **STATUS: BUILT IN THE SANDBOX, NOT RELEASED.** Rev 1–3 were proposals. Rev 4 is the first revision
> whose rules exist as code: `assets/js/pages/site-priority.js` (route-loaded, not at boot), its partial
> and its stylesheet. Still absent, and still not proposed: any multi-row write, any renumbering, any
> schema change, any new API, and any change to the allocation formula.
>
> **CORRECTION (S8-B3-R3-CP2M-R4-R1).** Rev 4 described D9 as *"reversing"* an Owner decision. **It was not
> a reversal, because there was no decision to reverse.** Rev 3 printed `TOP_FROM_ZERO = 1.0` in its own
> DECIDED table under D3, and Owner has since confirmed that **auto-filling 1.0 was never approved**. The
> entry was the proposal claiming an approval it did not have. Rev 4's refusal is therefore the CORRECTION
> OF A MIS-RECORDED DECISION, not a change of direction — and the difference matters, because a register
> that shows an Owner reversing themselves is a false record of how this was decided.
>
> **WHAT REV 4 SETTLED.**
>
> | # | Decision | Where |
> |---|---|---|
> | D1 | save protocol: re-read target **and neighbours** before saving; afterwards show the **actual read-back** weight **and position**; never claim the preview held atomically | §4.A, §3.5 |
> | D2 | R52 CAS, audit **partial failure** and `OUTCOME_UNKNOWN` preserved — no auto-resend, no backfill, no rollback, no renumbering | §3.5, §5 |
> | D3 | "drag to top" is `hi × 1.1`, the `+1` minimum REMOVED | §2.2 |
> | D4 | non-negative weights allowed, including the whole 0–1 range | §2.1 |
> | D5 | the neighbour-race residual is **ACCEPTED** | §4 |
> | **D6** | **display order is weight DESC within a company, ties broken by canonical identity** — a total order, so the list cannot reshuffle when an unrelated row is inserted | §2.0 |
> | **D7** | **midpoint insertion is APPROVED** (Rev 3's U1), computed as `lo + (hi−lo)/2` — overflow-safe, because the naive form overflows on two large legal weights | §2.4 |
> | **D8** | **the bottom rule is pure `lo × 0.9`** (Rev 3's U2), REPLACING `lo − max(1, lo × 0.1)`. Rev 3's bottom still carried the `max(1, …)` term D3 had removed from the top; both ends now use one factor | §3.2 |
> | **D9** | **`hi = 0` and "no comparison basis" are REFUSED, and the operator is asked to set a value explicitly.** A weight that cannot be derived from a comparison is not invented. Rev 3's `TOP_FROM_ZERO = 1.0` was **never approved** and is withdrawn as mis-recorded, not reversed | §2.2.1 |
> | **D10** | **no 2dp rounding and no 0.01 minimum gap** (Rev 3's U3 is **NOT adopted**). The computed double is what is stored | §2.3 |
> | **D11** | a save is refused when the value is **non-finite**, **indistinguishable** from a neighbour, between **equal** neighbours, **cross-company**, or when a **filter hides** a neighbour | §2.5 |
>
> **AND D10 DISSOLVED U4 RATHER THAN RESOLVING IT.** Rev 3's one unresolved case — `hi × 1.1` rounding back
> onto `hi` for `hi ≤ 0.04` — existed *only because of the rounding rule that created it*. Unrounded,
> `0.04 × 1.1` is `0.044000000000000004`, strictly above `0.04`, and the case simply accepts. None of U4's
> three candidate fixes was chosen. §8 records what remains genuinely out of scope.

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

| Position | Rev 3 said | **Rev 4 — BUILT** | State |
|---|---|---|---|
| At the top | `hi × 1.1` | `hi × 1.1` | **D3, implemented** |
| Top, where `hi = 0`, or no comparison basis | `1.0`, a named constant *(never approved)* | **REFUSED — set a value explicitly** | **D9; Rev 3's entry withdrawn as mis-recorded** |
| Any weight in `0 … 1` | allowed | allowed | **D4, implemented** |
| Negative weight | never produced or accepted | never produced or accepted | **D4, implemented** |
| Between `hi` and `lo` | `(hi+lo)/2`, *unapproved* | **`lo + (hi−lo)/2`** — overflow-safe | **D7, implemented** |
| At the bottom | `lo − max(1, lo × 0.1)`, *unapproved* | **`lo × 0.9`** | **D8, implemented** |
| Bottom, where `lo = 0` | — | **REFUSED — nothing is below zero** | **D8, implemented** |
| Minimum gap / rounding | `0.01` + 2dp, *unapproved* | **none — the computed double is stored** | **D10, implemented** |

### 2.0 THE DISPLAY ORDER — D6

Within a company: **weight descending**, ties broken by **canonical identity** (country, then marketplace).
MISSING and INVALID rows have no position at all and are drawn below, under their own *"No priority set"*
heading.

**Why identity and not "whatever order the read returned".** `Array.prototype.sort` is only guaranteed
stable from ES2019, and stability would anchor two equal weights to the sheet's row order — which moves the
moment anyone inserts a row above them. Two sites at `80` would swap on screen for a reason that has nothing
to do with either of them. Canonical identity is a **total** order, so the comparator never returns 0 for two
different rows and the list is reproducible.

> **This is a DISPLAY decision and is not the allocator's.** §1.C records that equal priority falls through
> to `demandWeight`, then marketplace, then receiverKey inside the allocator. The screen's tiebreak is not
> that tiebreak, and the page may not imply it is.

### 2.4 THE MIDPOINT IS COMPUTED AS `lo + (hi − lo) / 2` — D7

Not `(hi + lo) / 2`, and the difference is not stylistic. The obvious form builds a **sum** that is
unrepresentable while the **answer** is perfectly representable: for two large legal weights `hi + lo`
overflows to `Infinity` and the midpoint becomes `Infinity / 2 = Infinity`. `lo + (hi − lo) / 2` never forms
a quantity larger than `hi`, so it cannot overflow for any non-negative pair. Verified against
`Number.MAX_VALUE`, where the naive form returns `Infinity` and the shipped one lands strictly between.

### 2.5 THE REFUSALS — D11

Every one is a numeric or structural fact, not a policy, and every one is **visible before the drop**:

| Code | When |
|---|---|
| `NO_BASIS` | no other site in the company has a weight |
| `TOP_FROM_ZERO` | the leader is `0`; multiplication cannot escape zero (D9) |
| `BOTTOM_AT_ZERO` | the last place is `0`; nothing is below it |
| `EQUAL_NEIGHBOURS` | the two neighbours hold the same weight |
| `INDISTINGUISHABLE` | the computed value rounds onto a neighbour — adjacent doubles, or a denormal |
| `NOT_FINITE` | `hi × 1.1` overflowed |
| `NO_CHANGE` | dropped where it already was |
| *(no handle)* | the row is INVALID, is the only weighted site in its company, or its company has rows hidden by a filter |

**`INDISTINGUISHABLE` is what replaces Rev 3's `0.01` depletion floor.** The floor was a guess at where
usefulness ends; this is the point at which the number system actually runs out, and it needs no constant.

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

> **A WEIGHT OF 0 DOES NOT SWITCH A SITE OFF**, and nothing in this page or its proposal may say or imply
> that it does. `0` is the lowest VALID weight: the site still participates, still receives a share, and in
> a shortage receives **exactly the same multiplier as a site at 1**, because `Math.max(priority, 1)` clamps
> both to 1. What `0` does is rank it last among its company. The thing that genuinely stops an allocation
> is a **MISSING** priority, which the allocator refuses rather than treating as 0 — a different state, and
> the distinction §45.A exists for.
>
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

#### 2.2.1 `hi = 0`, and "no comparison basis" — REFUSED, NOT DEFAULTED (D9, reverses Rev 3)

`0 × 1.1 = 0`, which is not strictly above `0`. Multiplication has no way out of zero. The same holds when
there is no `hi` at all: the list is empty, the dragged row is the only one, or every other row is MISSING
or INVALID and so has no position.

**Rev 3 answered this with a named constant, `TOP_FROM_ZERO = 1.0`, and listed it among its DECIDED items.
IT WAS NEVER APPROVED.** Owner has confirmed that auto-filling 1.0 was not a decision they made, so it is
withdrawn as a mis-record rather than reversed. A weight that cannot be derived from a comparison is
**required explicitly** and is never filled in:

> *"The highest site in this company is at 0, and multiplying 0 cannot produce a weight above it. Set this
> site a priority explicitly with Edit — it will not be filled in automatically."*

**Why refusing is the better answer.** Rev 3's argument for `1.0` was that it is the smallest weight
distinguishable in both of the roles §1 separates. That argument is sound and still does not reach the
conclusion: it establishes which value a system would pick, not that the system should pick one. Dragging a
row to the top of a list expresses **a position**, and where no arithmetic can turn that position into a
weight, the only honest thing the screen can do is say so. The constant is **gone from the code**, not
merely defaulted differently — `TOP_FROM_ZERO` survives as the name of the refusal.

#### 2.2.2 Rev 3's U4 — DISSOLVED BY D10, NOT RESOLVED

Rev 2/Rev 3 rounded a computed weight to 2 decimal places before the bracket check, under which pure
`hi × 1.1` collapsed back onto `hi` for **`hi ≤ 0.04`** (`0.04 × 1.1 = 0.044 → 0.04`). D4 had made that
range reachable, so the interaction was real.

**D10 does not adopt the rounding, so the case stops existing.** Unrounded, `0.04 × 1.1` is
`0.044000000000000004`, which is strictly above `0.04`, and the drag accepts. None of the three candidate
fixes Rev 3 listed was chosen — the rule that created the problem was simply not adopted.

> The test suite asserts the exact double, and also asserts that rounding it to 2dp **would** have collapsed
> it. The reproduction of the old defect is kept beside its absence, so "it works now" cannot be mistaken for
> the rounding having been got right.

**What genuinely limits precision is the number system, and it is checked rather than guessed.** Every
computed weight — top, bottom and midpoint alike — is re-compared against the neighbours it came from, and
refused as `INDISTINGUISHABLE` if it did not land strictly between them. That catches adjacent doubles, and
it catches the trap at the very bottom of the range: **`Number.MIN_VALUE × 1.1 === Number.MIN_VALUE`**, so
even "multiply by 1.1" cannot be trusted to have increased anything.

### 2.3 PRECISION — NO ROUNDING IS IMPOSED (D10)

Rev 1 justified a `0.01` floor as the point where *"floating point stops being trustworthy."* That was never
true: IEEE-754 doubles carry ~15–16 significant decimal digits, and midpoints of realistic weights are exact
to far more precision than anyone needs. Rev 2 and Rev 3 replaced the bad reason with two better ones and
kept the rule. **Rev 4 keeps the reasoning and drops the rule**, because neither constraint is the page's to
impose:

1. **Repeated midpointing halves the gap.** From a gap of 1, successive insertions at the same place give
   0.5, 0.25, 0.125, … This is real, and it is **depletion, not imprecision**. But the point at which it
   actually becomes impossible is not `0.01` — it is the point at which no double lies strictly between the
   two neighbours, and that point is **detected** (`INDISTINGUISHABLE`) rather than predicted by a constant.
   A gap of `0.001` is perfectly usable, and a floor at `0.01` would have refused it for no reason.
2. **The value round-trips through a spreadsheet cell as text.** `80.00000000000001` is a correct double and
   an ugly cell. That is a presentation concern, and it is **not worth the cost of rounding**: rounding a
   computed weight changes the value that is stored, and a value that is changed after it was checked can
   land outside the position it was checked for. That is exactly how Rev 3's U4 came to exist.

> **So no weight is rounded, and there is no minimum gap.** A midpoint is stored as computed, and a drag is
> refused only when the arithmetic genuinely cannot produce a value that holds the position — which the code
> establishes by re-comparing the result against the neighbours it was derived from, never by trusting the
> formula.

---

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
| T1 | JP between US 100 and GB 80 | `(100+80)/2 = 90` | **ACCEPT** |
| T2 | JP between GB 80 and DE 80 | no value strictly between | **REFUSE — `EQUAL_NEIGHBOURS`** |
| T3 | CA (Missing) between US 100 and GB 80 | `90` | **ACCEPT as first set** (§3.5) |
| T4 | DE below the last row | handled by §3.2 | — |
| T5 | eBay (INVALID) anywhere | position undefined | **NOT DRAGGABLE — no handle** |
| T6 | ResourceUS US 50 between KM 100 and KM 80 | cross-company | **NOT A DROP TARGET** |
| **T26** | drag to top where the leader is `hi = 0` | `0 × 1.1 = 0`, not above | **REFUSE — `TOP_FROM_ZERO`** (D9; Rev 3 accepted at 1.00) |
| **T27** | drag to top of an EMPTY ordered list | no `hi` exists | **REFUSE — `NO_BASIS`** (D9; Rev 3 accepted at 1.00) |
| **T28** | drag to top where `hi = 0.5` | `0.55` | **ACCEPT** — the 0–1 range is usable (D4) |
| **T29** | drag to top where `hi = 0.04` | `0.044000000000000004` | **ACCEPT** — U4 dissolved by D10 |
| **T30** | drag to top where `hi = Number.MAX_VALUE` | `hi × 1.1` overflows | **REFUSE — `NOT_FINITE`** |
| **T31** | drag to top where `hi = Number.MIN_VALUE` | `MIN_VALUE × 1.1 === MIN_VALUE` | **REFUSE — `INDISTINGUISHABLE`** |
| **T32** | insert between two ADJACENT doubles | midpoint rounds onto `lo` | **REFUSE — `INDISTINGUISHABLE`** |
| **T33** | insert between two very large weights | naive `(hi+lo)/2` is `Infinity`; `lo+(hi−lo)/2` is not | **ACCEPT** (D7) |
| **T34** | drop a row where it already was | nothing to store | **NO_CHANGE — Save not offered** |
| **T35** | any drag while a filter hides a sibling of that company | neighbours unknowable | **NOT DRAGGABLE — the band says why** |
| **T36** | drag the only weighted site in a company | nothing to compare against | **NOT DRAGGABLE — no handle** |

### 3.2 BOTTOM

| # | Drag | Computed | Verdict |
|---|---|---|---|
| T7 | DE 80 below JP 0 | `lo = 0` | **REFUSE — `BOTTOM_AT_ZERO`** |
| T8 | GB 80 below ResourceUS 50 | different company | **NOT A DROP TARGET** |
| T9 | bottom where `lo = 20` | `20 × 0.9 = 18` | **ACCEPT** |
| T10 | bottom where `lo = 0.5` | `0.45` | **ACCEPT** — Rev 3 clamped this to 0; D8 does not |
| T11 | bottom where `lo = 0` | nothing below 0 | **REFUSE — `BOTTOM_AT_ZERO`** |
| **T37** | bottom where `lo = Number.MIN_VALUE` | `MIN_VALUE × 0.9 === MIN_VALUE` | **REFUSE — `INDISTINGUISHABLE`** |

### 3.3 DUPLICATE WEIGHTS

| # | Case | Behaviour |
|---|---|---|
| T12 | GB 80 and DE 80 displayed | both keep their weight; the ORDER between them is canonical identity (D6), not arrival order |
| T13 | Drop *between* the tied pair | **REFUSE — `EQUAL_NEIGHBOURS`**, shown on the move bar before Save is ever offered |
| T14 | Drag GB above US | `100 × 1.1 = 110.00000000000001`. **ACCEPT** — and this breaks the tie, by raising GB only |
| T15 | Drag a third row between US 100 and the tied pair | `90`. **ACCEPT** — the tie is untouched |
| T16 | Does a tie reorder the allocator? | **No.** Equal priority falls through to `demandWeight`, then marketplace, then receiverKey (§1.C) — the screen's row order is **not** the tiebreak |

### 3.4 PRECISION / DEPLETION

| # | Case | Behaviour |
|---|---|---|
| T17 | insert between 80 and 81 | `80.5` | **ACCEPT** |
| T18 | insert again between 80 and 80.5 | `80.25` | **ACCEPT** |
| T19 | repeated until no double lies between | **REFUSE — `INDISTINGUISHABLE`**, at the real limit rather than at `0.01` |
| T20 | computed `80.33333333333333` | **stored exactly as computed** — no rounding (D10) |
| T21 | a value that would equal a neighbour | **REFUSE** — caught by the strict re-check, never written |

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

Accessibility, as built: the handle is a real `<button>`, so it is in the tab order and announced as
operable. **Space** or **Enter** lifts, **↑ / ↓** move, **Home / End** jump to the ends, **Space** drops and
**Esc** cancels; focus is restored to the handle after every re-render, because each slot change rebuilds the
row. Touch and mouse go through **Pointer Events** — not HTML5 drag-and-drop, which never fires for touch —
so one handler serves mouse, pen and finger, and the handle carries `touch-action: none` without which the
browser claims the gesture as a scroll and touch silently does nothing. All three inputs call the same
lift / move / drop functions, so they produce the identical draft, preview, refusals and save.

---

## 7. THE CASE COUNT, RECOUNTED FOR REV 4

Rev 1 claimed *"of the six drags an operator is most likely to try, four work and two are refused"* — from a
table that listed **seven**, under a floor rule §2.1 has since removed. Rev 2 recounted 21, Rev 3 recounted
25. Rev 4 moves it again, and in a direction worth noticing: **the refusals grew faster than the accepts**,
because building the rule turned three decisions (D9, D7, D10) into seven boundary cases the proposals had
not separated.

Recounted against §3 on the same fixture, **30 drag cases**:

| | Count | Cases |
|---|---|---|
| **Accept** | **12** | T1, T3, T9, T10, T14, T15, T17, T18, T20, T28, T29, T33 |
| **Refuse, with an actionable reason** | **17** | T2, T5, T6, T7, T8, T11, T13, T19, T21, T26, T27, T30, T31, T32, T35, T36, T37 |
| **Nothing to save** | **1** | T34 (dropped where it already was) |
| Behaviour statements, not drags | 3 | T4, T12, T16 |
| Outcome-handling cases (§3.5) | 4 | T22–T25 |

**Two cases changed verdict between Rev 3 and Rev 4, and both moved from ACCEPT to REFUSE**: T26 and T27,
the `hi = 0` and no-basis cases Rev 3 would have filled in with `1.0` (D9). **One moved the other way**: T29,
which Rev 3 could not answer at all and which D10 made ordinary.

**Every refusal is visible before the drop.** A row that cannot move has no handle and says why in its place;
a cross-company boundary is not a drop target; a slot with no legal weight draws the row where it was dropped
with **no number at all** and withdraws Save. Nothing is refused only after the operator has committed to it.

---

## 8. WHAT REMAINS OUT OF SCOPE

U1, U2 and U3 were approved in Rev 4 as D7, D8 and D10. **U4 was not resolved — it was dissolved**, because
D10 did not adopt the rounding rule that created it (§2.2.2).

What is still not built, and still not proposed:

| | Why |
|---|---|
| **Multi-row writes**, normalisation, respreading, auto-renumbering | §5: a multi-row write has no all-or-nothing story on this backend. A lock serialises; it does not roll back |
| **Missing backfill** | nothing is ever auto-assigned — §3.5 |
| **Clearing a priority back to MISSING** | there is no supported API for it; the page states the limitation where an operator meets it |
| **Repairing an INVALID row by dragging it** | placing it would mean choosing what its unreadable value was meant to be |
| **§4.B — closing the neighbour race inside the server's lock** | a backend contract change; D5 accepted the residual instead |

### 8.1 ONE THING FOUND WHILE BUILDING, AND NOT FIXED HERE

**An unparseable priority cell never reaches this page as INVALID.** The shipped reader
(`operation-system-db-api.js`) normalises `allocation_priority` with `Number()` and stores `null` when the
result is not finite — deliberately, so a malformed cell does not become a confident wrong number. The
consequence is that `'7abc'` arrives as `null` and the page draws it as **Missing**, offering a first set,
while only a **negative** value (which that normaliser preserves on purpose) presents as INVALID.

This is pre-existing and applies to the Edit path exactly as it does to the drag; it is **not** introduced by
Rev 4. It is recorded here because it was found by capturing the real page rather than by reading the code:
the first browser capture drew a drag handle on a row the test suite believed had none. **Changing it would
mean changing the reader's contract, which this round is not authorised to touch.**

---

## 9. WHAT WAS BUILT, AND WHERE IT IS CHECKED

| | |
|---|---|
| The rule, as arithmetic | `proposeWeight(upper, lower)` and `midpoint(lo, hi)` in `assets/js/pages/site-priority.js` — pure functions of their arguments, exported so the boundary cases are tested as numbers |
| The order | `displayOrder` (D6), in the same file |
| The gesture | Pointer Events for mouse, pen and touch; a `<button>` handle with Space / Enter / ↑ / ↓ / Home / End / Esc |
| The draft | a drop produces a preview and a move bar; **Cancel is a zero write**; Save dispatches at most one row |
| The save | `preflightMove` re-reads the target and both neighbours (invalidating the shared key first, so it cannot be answered from the snapshot the preview came from), then the **existing** R52 writer with its compare-and-set — there is exactly one dispatch site in the file, shared with the Edit path |
| The report | the read-back **weight and position**, from a fresh read (D1) |

**Checked by:**

- `assets/tests/site-priority-drag-s8-b3-r3-cp2m-r4.test.js` — the rule, the order, the draft, the preflight,
  the four write outcomes, repeated Save, a late answer, and the source invariants (one writer, one payload,
  no renumbering, no multi-row loop). Mutation-probed: 21 mutations of the shipped rules, all killed.
- `assets/tests/site-priority-viewport-acceptance-s8-b3-r3-cp2m-r2.test.js` §J — the **gesture**, driven as
  real PointerEvents and KeyboardEvents in a real browser at 360 / 390 / 768 / 1280 / 1920, asserting that
  mouse, touch and keyboard land the same row in the same slot at the same weight, that `touch-action`
  **computes** to `none`, and that **no gesture dispatched a write**.
- `assets/tests/site-priority-page-s8-b2-r1.test.js` — unchanged, and still passing: the save contract this
  round reused rather than replaced.

**What the node suite cannot prove, and does not claim:** a headless DOM has no layout, so
`getBoundingClientRect` returns zeros and no pointer path can be driven there. The node suite drives
lift / move / drop through the same functions the handlers call; the browser capture drives the handlers.
Neither stands in for the other.
