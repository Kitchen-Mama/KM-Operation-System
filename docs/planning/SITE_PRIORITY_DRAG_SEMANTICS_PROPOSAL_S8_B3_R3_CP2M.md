# SITE PRIORITY — DRAG-TO-REORDER DESIGN PROPOSAL (S8-B3-R3-CP2M-R1, REV 1)

**STATUS: PROPOSAL ONLY. NOT IMPLEMENTED. AWAITING OWNER APPROVAL.**
No weight conversion, batch save, auto-renumbering, API or schema change has been built. Company grouping and
the responsive layout shipped separately and do not depend on this document.

> **REV 1 — three things in Rev 0 were wrong or unproven, and they change the design.** Reading the allocator
> rather than describing it produced: (1) the screen's order is NOT the factory order, (2) every weight below
> **1** is clamped to 1 and therefore weight-identical, which makes halving-toward-zero meaningless, and (3) a
> flat `+10` means something completely different at weight 5 than at weight 500. Each is corrected below and
> each raises a question only the Owner can settle.

---

## 1. THREE DIFFERENT ORDERS, AND THE SCREEN IS ONLY ONE OF THEM

The one claim a drag UI must never make is "drag this to the top and it will be served first". Whether that is
true depends on which allocator is asked, and they do not agree.

### 1.A The OVERSEAS shared pool — priority leads, and is also a multiplier
`supply-planning-allocations.js` §40.13 orders receivers:

```
priority DESC → demandWeight DESC → marketplace ASC → receiverKey ASC
```

and §24.7 computes the weighted share as

```
weight = min(survivalNeedQty, demandQty) × Math.max(allocationPriority, 1)
```

So here priority does two jobs at once: it **sorts**, and it **scales the share**. Dragging a site above
another genuinely promotes it in this pool — and also changes how much it gets, which a pure reordering UI
would not lead anyone to expect.

### 1.B The FACTORY / demand order — the date leads, priority only breaks ties
§35 orders demand:

```
requiredByDate ASC → priority DESC → company ASC → marketplace ASC → destination ASC → demandKey ASC
```

**`requiredByDate` dominates.** A site dragged to the top of the screen is still served after any site with an
earlier required date, no matter how high its weight. Priority decides only among demands sharing a date.

### 1.C The SCREEN order — a view of the stored weight, and nothing more
The page sorts by company, then by the stored weight. That is the right quantity in the right scope (the
allocator blocks cross-company receiver sets), but it is **not a prediction of either allocator's output**: the
competing set in any run is whichever sites have demand that run, and in the factory path the date outranks it.

**Design consequence, and it is a UI obligation rather than a note:** the drag surface must say which order it
is editing. The proposal is a single line above the list — *"Order here sets the overseas shared-pool priority
weight. Factory demand is ordered by required date first."* — and **no language anywhere that promises a site
will be 'served first'.**

---

## 2. THE RULE, CORRECTED

**One drag moves exactly one row. The dragged row takes a weight strictly between its new neighbours.**

| Position | Rev 0 said | **Rev 1 says** | Why it changed |
|---|---|---|---|
| Between `hi` and `lo` | `(hi+lo)/2` | `(hi+lo)/2` | unchanged |
| At the top | `hi + 10` | **`hi × 1.1`, minimum `hi + 1`** | §2.2 |
| At the bottom | `lo / 2` | **`(lo + 1)/2`, and REFUSED if `lo ≤ 1`** | §2.1 |
| Minimum gap | `0.01` | **`1.0` for a weight-meaningful move; `0.01` only preserves sort order** | §2.1 |

### 2.1 THE FLOOR IS 1, NOT 0 — the correction that matters most
`Math.max(allocationPriority, 1)` clamps the multiplier. Therefore:

| Stored weight | Multiplier used by §24.7 |
|---|---|
| 0 | **1** |
| 0.5 | **1** |
| 0.9 | **1** |
| 1 | **1** |
| 2 | 2 |

**Every weight at or below 1 produces an identical share.** Rev 0's halving rule walked straight into this:
dragging below a site at 2 gave 1, then 0.5, then 0.25 — three visibly different positions that the allocator
cannot tell apart. The sort key still separates them, so the *order* changes while the *share* does not.

**Rev 1 therefore refuses a drag that would place a weight at or below 1**, with: *"Priorities of 1 or less all
receive the same share. To place a site below this one, raise the others first."* This is the same refusal as
the stored-0 case in Rev 0, generalised to where the real boundary actually is.

> **OWNER DECISION 1 — is 1.0 the floor, or is sort-only placement acceptable below it?** A site at 0.5 ranks
> below one at 1 in §40.13 ordering while receiving the same weighted share. That is defensible (ordering still
> decides leftover distribution) but it is a product judgement, not a UI one. **Rev 1 assumes the strict floor.**

### 2.2 `+10` IS NOT SCALE-FREE
Priority is a multiplier, so a constant increment means different things at different magnitudes:

| Existing top weight | Rev 0 `+10` | Share change |
|---|---|---|
| 500 | 510 | +2% |
| 100 | 110 | +10% |
| 5 | 15 | **+200%** |

A rule that triples a site's share on one dataset and moves it 2% on another is not a rule anyone can predict.
**Rev 1 uses `hi × 1.1` with a `hi + 1` minimum** — proportional, so "drag to top" means the same thing
everywhere: about 10% above the current leader.

> **OWNER DECISION 2 — is +10% the right promotion?** It is a business choice about how much a top-drag should
> be worth. Any constant is defensible; what is not defensible is a constant that silently varies in meaning.

### 2.3 The `0.01` floor, restated honestly
Two weights 0.01 apart differ in share by about 0.01%. They sort differently and allocate almost identically.
So `0.01` is a **sort-order** floor, not a meaningful-weight floor. Rev 1 keeps it as the hard refusal
threshold (below it, floating point stops being trustworthy) but **warns at any gap below 1.0**: *"these two
sites will receive nearly the same share; the order only decides ties."*

---

## 3. DUPLICATE WEIGHTS — WORKED ON THE REAL CASE

The live shape this must survive, from the fixture used in the viewport capture:

| Site | Weight |
|---|---|
| Amazon US | 100 |
| Amazon GB | 80 |
| Amazon DE | **80** |
| Rakuten JP | 0 |
| Walmart CA | *Missing* |
| eBay US (ResourceUS) | `7abc` → INVALID |

| Drag | Result |
|---|---|
| JP between US (100) and GB (80) | **90.** Works. One row changes. |
| JP between GB (80) and DE (80) | **REFUSED** — no value strictly between 80 and 80 |
| GB above US | **110** (`100 × 1.1`). Works, and breaks the GB/DE tie by raising GB only. |
| DE below JP (0) | **REFUSED** — would land at or below 1 (§2.1) |
| JP to the very bottom | **REFUSED** — JP is already at 0; there is nothing below |
| CA (Missing) between US and GB | **90**, as an explicit first set (§5) |
| eBay (INVALID) anywhere | **not draggable** — its position is undefined until the cell is fixed |

**So of the six drags an operator is most likely to try on this data, four work and two are refused with a
reason they can act on.** The two refusals are both consequences of the data (a tie, and a floor), not of the
design — and both are visible *before* the drag: tied rows carry a tie badge, and the region below weight 1 is
drawn as a non-droppable zone.

---

## 4. NEIGHBOUR RACE, AND WHY IT CANNOT BE ENGINEERED AWAY HERE

The compare-and-set proves the **dragged row** has not changed since it was read. It proves nothing about the
**neighbours** whose weights produced the midpoint.

Sequence that loses:
1. Operator reads US=100, GB=80. Drags JP between them → computes 90.
2. Someone else sets GB=95.
3. Operator saves. JP's own CAS passes (JP is unchanged). JP becomes 90 — now **below** GB, not above it.

**Mitigation, and its exact limit.** Before dispatching, the page re-reads and checks the neighbours still
bracket the computed value; if not it refuses with *"the sites around this one changed — refresh and try
again."* That check is a **read, so it is advisory**: a neighbour can still change between the check and the
write. **It is not data loss and not a lost update** — JP's CAS still held, no other row was touched, and the
next refresh shows the truth. It is a *placement* that no longer matches the preview.

Removing this residual requires reading and writing the neighbourhood atomically, which needs a multi-row
transaction that does not exist (§6). **Rev 1 does not accept this risk on the Owner's behalf; it is listed in
§8 as something to approve or reject.**

---

## 5. MISSING — FIRST SET, AND WHAT HAPPENS WHEN IT FAILS

Missing rows have no weight and are not in the ordered list; they sit in a separate **"No priority set"** group.
Nothing is ever auto-assigned — not to make room, not to complete a sequence, not as a side effect.

Dragging a Missing row into the list is an **explicit first set**, dispatched as the normal R52 write with
`expected_allocation_priority_state: 'MISSING'`.

**Failure recovery, by outcome — and the four states keep their R52 meanings exactly:**

| Outcome | What the row shows | What the operator may do |
|---|---|---|
| `CONFIRMED_COMMITTED` | the new weight, in place | nothing |
| `CONFIRMED_REJECTED` (zero-write proven) | returns to **Missing**, with the server's reason | correct and retry — safe, because nothing was written |
| `CONFIRMED_NOT_STARTED` | returns to **Missing** | retry |
| **`OUTCOME_UNKNOWN`** | **stays where the drag put it, in the WARN state, labelled unconfirmed** | **Refresh. Never retry.** |

**The `OUTCOME_UNKNOWN` row is the one that must not be simplified.** The list may not silently snap back to
Missing — that would assert a zero write nobody proved — and it may not show the new weight as settled either.
It holds the proposed position, visibly unconfirmed, until a fresh read settles it. **A matching value after a
refresh still does not prove this request committed**, and the WARN text says so, exactly as the single-row
editor does today. **There is no automatic resend and no rollback.**

---

## 6. MULTI-ROW IS STILL NOT PROPOSED, AND THE REASON IS UNCHANGED

One drag = one row = one CAS = one atomic cell write. There is no partial-failure state to design because
there is no second write.

**The single-row CAS API is not a multi-row transaction.** N rows means N independent requests; a failure at
row 3 of 5 leaves 1–2 committed and 4–5 untouched, and `OUTCOME_UNKNOWN` means even "row 3 failed" may be
false. There is no rollback: the compensating writes are themselves un-atomic and their CAS values are already
stale. If normalisation, respreading or "make room" is ever wanted, it needs **a new backend action writing the
set under one lock with one all-or-nothing outcome**, or an accepted and documented partial-failure model.
**Neither exists and neither is proposed.**

---

## 7. UNCHANGED, AND RELIED UPON

Allocation formula (§24.7) · demand ordering (§35) · overseas receiver ordering (§40.13) · quantity
conservation · the weight scale (no normalisation, no rescale, no cap) · the schema · §45.A's three states ·
the allocator's refusal of an unresolved priority · Production data.

Accessibility is unchanged from Rev 0: keyboard (`Space` lift, `↑`/`↓`, `Space` drop, `Esc` cancel) and touch
(long-press plus explicit **Move up / Move down** buttons) produce the identical single-row change, the
identical preview and the identical save, and announce refusals identically.

---

## 8. WHAT OWNER IS BEING ASKED

**Approve or reject, individually:**

1. **Midpoint insertion, one row per drag** — the core rule.
2. **DECISION 1 — the floor is weight 1.0**, because at or below it every share is identical (§2.1).
3. **DECISION 2 — "drag to top" means `hi × 1.1`**, not `+10`, so its meaning does not vary with scale (§2.2).
4. **Refusals**: equal neighbours, below the floor, gap under 0.01, and dragging while a filter hides rows.
5. **Missing** never auto-filled; draggable in as an explicit first set, with the failure table in §5.
6. **The neighbour-race residual** (§4) — this needs an explicit accept, not an assumption.
7. **The UI must state which order it edits** (§1), and must never promise "served first".

**Not covered and not built:** multi-row writes, normalisation, respreading, auto-renumbering, Missing
backfill, clearing a priority, any new API or schema, and any change to the allocation formula.
