# SITE PRIORITY — DRAG-TO-REORDER DESIGN PROPOSAL (S8-B3-R3-CP2M)

**STATUS: PROPOSAL ONLY. NOT IMPLEMENTED. AWAITING OWNER APPROVAL.**
No weight conversion, batch save, auto-renumbering or new API has been built. Company grouping and the
responsive presentation are implemented separately and do not depend on this proposal.

---

## 0. THE PROBLEM IN ONE SENTENCE

`allocation_priority` is a **weight**, and a drag expresses an **order** — so the whole design is the question
*"what is the smallest, most honest weight change that produces the order the operator just drew?"*

The dishonest answers are easy and must be named so they are not drifted into later: renumbering the list
`1, 2, 3…` destroys weights the allocator uses as magnitudes; filling Missing with a number invents a decision
nobody made; and writing every visible row on every drag turns a one-row edit into a multi-row transaction the
backend cannot perform.

**This proposal moves exactly one row per drag.** Everything else follows from that choice.

---

## 1. SCOPE — COMPANY SEPARATION IS CORRECTNESS, NOT LAYOUT

`supply-planning-marketplace-supply-allocation.js` states the rule it enforces:

> *"Company isolation: every receiver + pool in one call MUST share the company (cross-company → BLOCKED)"*

So a priority is only ever compared against **other sites of the same company**. A list that mixed companies
would invite the operator to order two numbers that never meet, and a drag across that boundary would be a
gesture with no meaning.

**Therefore: the ordering scope is ONE company.** Within a company, sites of different countries and
marketplaces do compete (they are receivers of the same shared pool), so ordering across countries inside one
company is meaningful and is what the drag list offers.

**One honesty caveat, stated rather than hidden.** The set that actually competes in any given allocation run is
whichever sites have demand *in that run*, which varies. The page orders by stored weight — the right quantity,
compared in the right scope — but it is not a prediction of any particular run's outcome. The page says so.

**Country filter.** Filtering to one country narrows what is *displayed*. Dragging while filtered would let an
operator reorder against neighbours they cannot see, so **drag is disabled whenever a filter hides any row of
the company being ordered**, with a one-line explanation and a "show all for this company" action. Refusing is
better than computing a midpoint from a partial neighbourhood.

---

## 2. THE RULE, AND WORKED EXAMPLES

**Rule: the dragged row takes a weight strictly between its two new neighbours. No other row changes.**

- Dropped between `hi` and `lo` → `new = (hi + lo) / 2`
- Dropped at the TOP (above `hi`) → `new = hi + 10`
- Dropped at the BOTTOM (below `lo`) → `new = lo / 2` when `lo > 0`

Worked on one company, starting state (the "50–100 with duplicates, 0 and Missing" case):

| Site | Weight |
|---|---|
| Amazon US | 100 |
| Amazon GB | 80 |
| Amazon DE | 80 |
| Amazon JP | 50 |
| Amazon FR | 0 |
| Amazon CA | *Missing* |

| # | Drag | Computed | Result |
|---|---|---|---|
| **a** | JP between US (100) and GB (80) | (100+80)/2 = **90** | JP `50 → 90`. **US, GB, DE, FR, CA unchanged.** |
| **b** | JP to the very top | 100 + 10 = **110** | JP `50 → 110`. Nothing else moves. |
| **c** | FR between JP (50) and nothing below | — | FR is already last; no change proposed, no write. |
| **d** | JP below FR (0) | would need `< 0` | **REFUSED** — see §2.1 |
| **e** | GB between US (100) and DE (80) | (100+80)/2 = **90** | GB `80 → 90`. DE stays 80, so the tie is broken by raising ONE row. |
| **f** | GB between DE (80) and JP (50) | (80+50)/2 = **65** | GB `80 → 65`. |
| **g** | JP between GB (80) and DE (80) | no value strictly between | **REFUSED** — see §3 |
| **h** | CA (Missing) between GB (80) and JP (50) | **65** | CA `Missing → 65`, a normal first-time set. See §4. |
| **i** | repeated midpoints 80→70→75→72.5→71.25… | gap `< 0.01` | **REFUSED** — see §2.2 |

### 2.1 The bottom edge, and why 0 is a wall
`0` is a **valid lowest weight** that still takes a §24.7 share; negative is INVALID and the R52 writer refuses
it. So there is no valid weight below 0. A drag below a row holding 0 is **refused** with: *"0 is the lowest
valid priority. To place a site below this one, raise the others first."* The alternative — quietly renumbering
the column to make room — is exactly the auto-renumbering this design forbids.

When the lowest weight is above 0 (say 50), dropping below it gives `50 / 2 = 25`, which stays strictly positive
and never reaches 0 by halving. A drag can therefore always be placed at the bottom *except* against a stored 0.

### 2.2 Precision exhaustion is refused, not papered over
Repeated midpoint insertion between the same pair shrinks the gap geometrically. When the available gap falls
below **0.01**, the drag is **refused** with *"these two sites are too close together to insert between. Set an
explicit priority instead."* The alternative is a silent respread of neighbouring weights — a multi-row write
this design does not do, and a change to numbers the operator did not touch.

---

## 3. EQUAL WEIGHTS — THE "LOOKS REORDERED, ISN'T" TRAP

This is the failure mode the decision explicitly names, and it is the reason §2 rule (g) exists.

If GB and DE both hold **80** and the operator drags JP between them, there is **no number strictly between 80
and 80**. A naive midpoint yields 80 — the list would redraw in the new order, the save would report success,
and the stored data would be unchanged. The operator would believe they had changed a priority they had not.

**Therefore: a drop between two equal weights is REFUSED before any preview is offered**, with text that names
the real situation: *"Amazon GB and Amazon DE both have priority 80, so there is no position between them.
Give one of them a different priority first."*

**Equal weights are also marked in the list itself** — a tie badge on every row sharing a weight with another —
so the operator can see *before* dragging why a gap is not droppable. A refusal the operator could have
predicted is better than one that surprises them.

Dragging a tied row *itself* is allowed (example **e**): moving GB above DE gives GB a new, higher weight and
breaks the tie by changing **one** row, which is a real change with a real effect.

---

## 4. MISSING IS NEVER BACKFILLED

Missing rows have **no weight**, so they are not in the ordered sequence. They render in a separate
**"No priority set"** group below the ordered list, in their own area.

- The system **never** assigns a weight to a Missing row on its own — not to make room, not to complete a
  sequence, not as a side effect of another row's drag.
- An operator **may** drag a Missing row into the ordered list. That is not backfilling; it is an explicit
  per-row instruction, and it is written as a normal R52 compare-and-set with
  `expected_allocation_priority_state: 'MISSING'`. If the cell has since acquired a value, the CAS refuses and
  the operator refreshes — the same protection every other save gets.
- There is **no** supported drag that returns a weighted row to Missing. R52 has no way to clear a priority, and
  inventing one here would be a product decision, not a UI one.

INVALID rows (a cell holding `7abc`) are likewise outside the ordered list, shown in their own group with their
raw stored text, and are **not draggable** — their position is undefined, and an allocator refusal is the
correct consequence until someone fixes the cell.

---

## 5. PREVIEW FIRST — A DROP WRITES NOTHING

Dragging mutates **local state only**. The page then shows an explicit, reviewable change:

```
Pending change — 1 site
  Amazon JP     50  →  90
  Nothing else changes.
                              [ Save ]  [ Cancel ]
```

- The drop itself issues **no request**.
- The preview names the **old and new weight** and states plainly that no other row changes.
- Cancel restores the pre-drag order with no network activity at all.
- Only **Save** dispatches, and it dispatches the existing single-row action.

---

## 6. THE R52 WRITE CONTRACT IS REUSED UNCHANGED

Save calls `marketplace.allocationPriority.set` exactly as the Edit button does today:

- **canonical identity** and `expected_marketplace_id` — the drag targets one already-identified row
- **mandatory CAS** — `expected_allocation_priority_state` is `SET` (with the pre-drag weight) or `MISSING`
- **fail-closed** — no fallback to `upsertMarketplace`, no retry, no resend
- **`OUTCOME_UNKNOWN`** — handled exactly as now: the row is shown in the WARN state, the value is **not**
  called verified, and the resolution is a fresh read, never a resend
- **three columns only** — `allocation_priority`, `updated_by`, `updated_at`

**No new API. No schema change. No change to the weight scale.** If the Owner later wants normalisation or a
respread, that is a different feature and §7 explains why it needs a different backend.

---

## 7. MULTI-ROW: WHY THIS DESIGN AVOIDS IT, AND WHAT IT WOULD COST

**The single-row rule is not a simplification — it is what makes the design implementable on the existing
backend.** One drag = one row = one CAS = one atomic cell write. There is no partial-failure state to design,
because there is no second write.

**The existing single-row CAS API is NOT a multi-row transaction, and must not be treated as one.** If a future
feature writes N rows, it issues N independent requests; a failure at row 3 of 5 leaves rows 1–2 committed and
4–5 untouched, and R52's `OUTCOME_UNKNOWN` means even "row 3 failed" may not be true. There is no rollback: the
compensating writes would themselves be un-atomic, and the CAS values for them would already be stale.

So, explicitly: **if the Owner ever approves an operation that must change several weights at once** (normalise,
respread, "make room"), it requires
1. a new backend action that writes the set under one lock with one all-or-nothing outcome, **or**
2. an accepted, documented partial-failure model with a reconciliation procedure.

**Neither is proposed here, and neither should be assumed to exist.**

**Concurrency, stated honestly.** The CAS proves the *dragged* row has not changed since it was read. It proves
nothing about the **neighbours** whose weights produced the midpoint. If someone else moves a neighbour between
the operator's read and their save:

- Save re-checks that the neighbours still bracket the computed value and refuses with *"the sites around this
  one changed — refresh and try again"* if they do not.
- That check is a **read, and therefore advisory**: a neighbour can still change between the check and the
  write. The worst outcome is that the saved weight lands in a different relative position than previewed.
  **It is not data loss, not a lost update of another row, and not a silent overwrite** — the dragged row's own
  CAS still holds — and it is visible on the next refresh.
- This residual is a direct consequence of there being no multi-row transaction, and it is recorded rather
  than engineered around.

---

## 8. WHAT IS NOT TOUCHED

- **Allocation formula** — §24.7 `priority_factor = MAX(priority, 1)` is unchanged.
- **Quantity conservation** — untouched; this writes one weight, not a quantity.
- **Production data** — no migration, no backfill, no bulk edit, no cleanup.
- **Weight scale** — no normalisation to 1..N, no rescaling, no cap. Existing weights keep their magnitudes.
- **Schema** — no new column.
- **§45.A states** — MISSING / INVALID / SET stay three distinct things.
- **The allocator's refusal of an unresolved priority** — unchanged, and relied on.

---

## 9. ACCESSIBILITY — THE KEYBOARD PATH IS THE SAME OPERATION

Drag is a pointer convenience, never the only route. Every row exposes an equivalent that produces the identical
single-row change, the identical preview and the identical save:

- **Keyboard**: focus a row handle, `Space` to lift, `↑`/`↓` to move, `Space` to drop, `Esc` to cancel. Each
  move announces *"Amazon JP, position 2 of 6, proposed priority 90"* via the existing live region.
- **Touch**: long-press to lift, drag, release — plus **Move up / Move down** buttons, because a long-press drag
  inside a scrolling list is unreliable on a phone and must not be the only way.
- A refusal (§2.1, §2.2, §3) is announced identically on all three paths.

---

## 10. WHAT OWNER IS APPROVING, IF APPROVED

1. **Midpoint insertion, one row per drag**, with `+10` at the top and halving at the bottom.
2. **Refusals** for: equal neighbours (§3), below a stored 0 (§2.1), gap under 0.01 (§2.2), and dragging while
   filtered (§1).
3. **Missing** shown separately, never auto-filled, draggable into the list as an explicit first set (§4).
4. **Preview-then-save**, no write on drop (§5).
5. **Reuse of the R52 single-row contract** with no new API, schema or scale change (§6).
6. **Acceptance of the documented neighbour-race residual** (§7), which cannot be removed without a multi-row
   transaction that does not exist.

**Not approved by this document, and not built:** multi-row writes, normalisation, respreading, auto-renumbering,
Missing backfill, clearing a priority, and any change to the allocation formula.
