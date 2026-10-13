# Site Priority Management — UI / UX Specification

> **AUTHORITY.** This document owns the Site Priority PAGE: its identity model, its states, and the boundary
> between what it may and may not do. It owns **no** business rule. `allocation_priority` semantics are owned by
> `SUPPLY_PLANNING_CALCULATION_RULES.md` §45 (and §20/§24/§40 for how the value is consumed); the storage column
> is owned by `DATABASE_RELATIONSHIP_MAP.md`; the writer is owned by `03_master_data_handlers.gs`. Where this
> document and any of those disagree, they win.
>
> **Status:** IMPLEMENTED (S8-B2-R1). Local only — not deployed.

---

## 1. Why the page exists

`marketplaces.allocation_priority` had no editing surface. The column existed, `upsertMarketplace` could already
write it, fifteen core modules and five server files read it — and the only way to SET one was to type into the
spreadsheet.

§45.C.4 sequenced this UI **last** on purpose: it could not display a blank priority honestly while the layers
underneath substituted 0 for one. R50 (D-S8-A1 / D-S8-B1) removed those substitutions, so the page can now show
**Missing** as missing.

---

## 2. Identity

A row is identified by **company + canonical country + marketplace**.

- Country resolves through **KMCID** (`UK ≡ GB`; case and whitespace fold; `EU` is an independent region and is
  never expanded into its members; no other alias exists and none is invented).
- **Company and marketplace are NOT folded.** `03_`'s upsert compares them trim-only and case-sensitively, so
  folding here would merge rows the database keeps apart.
- A marketplace **name alone is not an identity**. Production carries "Amazon" eight times across three companies
  and six countries with different priorities, and "Walmart" twice.

The page displays the **stored** country spelling, with the canonical code shown beside it only when the two
differ. The operator edits the row the database holds; hiding its real spelling would remove the one signal that
distinguishes a `UK` row from a `GB` row.

---

## 3. Priority states

| Stored value | State | Rendered |
|---|---|---|
| absent, `null`, blank, whitespace | **MISSING** | `—` with a *Missing* badge — **never 0** |
| `0` | **SET** | `0` with a *Set* badge — a valid lowest priority |
| finite number > 0 | **SET** | the number |
| negative, non-numeric, non-finite | **INVALID** | the *Invalid* badge, surfaced not repaired |

Input validation is stricter than display, because a value being typed now has no reason to be invalid: a blank,
a negative, a non-numeric, a non-finite and a number with trailing characters are all **refused with a reason**,
never coerced.

---

## 4. The limitation: a priority cannot be cleared

`handleUpsertMarketplace_` resolves an absent or empty `allocation_priority` to `''` and then writes the column
only `if (allocationPriority !== '')`. **A blank is a no-op, not a clear** — the stored value survives.

There is therefore **no supported way to un-set a priority through the existing API**. The page offers no clear
control, because a control that silently does nothing is worse than an absent one. Inventing one would require
either a sentinel value (which every reader would then have to learn) or a second writer; both were refused.

The refusal message says this where an operator meets it. **If clearing is ever required it needs an authorized
change to `03_master_data_handlers.gs`** and is out of scope here.

---

## 5. The write contract

A save sends the **stored row, verbatim**, plus the new priority. This is not defensive padding — each field is
required by a measured behaviour of the handler:

| Field | Why it must be echoed |
|---|---|
| `company`, `country`, `marketplace` | the **match key**, compared raw and case-sensitively. Sending a canonical `GB` for a row stored `UK` would not match and the handler would **INSERT a second row**. |
| `currency` | **required**; the handler refuses the call without it |
| `status` | written **unconditionally**, and defaults to `'active'` when absent — omitting it would silently reactivate a disabled marketplace |
| `marketplace_display_name` | written unconditionally, defaults to the marketplace name — omitting it would blank a custom name |
| `fulfillment_model` | written only when non-empty, so it is passed through when present |

**Read-after-write.** A resolved write is not evidence of persistence. After every save the data is re-read and
the stored value is compared against what was sent. A mismatch is reported as an **error**, not a success.

**Failure is never shown as success.** The writer throws on a non-ok response and on `success:false`, and both
paths render the error state with the underlying reason.

---

## 6. Lifecycle

- Registered through `KM.lifecycle.register('site-priority-section', { mount, unmount })`.
- The partial is injected by `KM.partialLoader` into `#site-priority-mount` on mount.
- **Listeners are delegated and bound once**, guarded by a `data-sp-bound` flag on the section. Re-mounting is
  ordinary navigation here, so a listener attached per mount would fire N times after N visits — which, for a
  writer, means N saves from one click.
- `unmount` discards edit state. A half-typed priority restored on return is indistinguishable from a saved one.
- The page is a **route asset**, not a boot script: its two files load only when the route is entered.

---

## 7. What the page must never do

- Add a second writer, a new API action, or any transport of its own.
- Change `03_master_data_handlers.gs`, `01_router.gs`, the action registry or the DB schema.
- Perform allocation arithmetic. It edits one stored value.
- Turn Missing into 0 in either direction, or invent a default priority.
- Combine same-named marketplaces across companies or countries.

---

## 7A. Reordering by dragging (S8-B3-R3-CP2M-R4)

Sites are listed **highest weight first, within their own company**; equal weights are ordered by canonical
identity, so the list does not reshuffle when an unrelated row is inserted. MISSING and INVALID rows have no
position and sit below, under **"No priority set"**.

A drag computes **one weight** and saves it through the **existing** R52 single-row compare-and-set. It
writes no neighbour, renumbers nothing and adds no API.

| Position | Weight |
|---|---|
| top | `hi x 1.1` |
| bottom | `lo x 0.9` |
| between | `lo + (hi - lo) / 2` |

**Refused, and the refusal is visible before the drop:** the leader is `0` or there is no comparison basis
(set a value explicitly - nothing is filled in automatically); the last place is `0`; the two neighbours hold
equal weights; no double lies strictly between them; the value overflows. A row has **no handle** when it is
INVALID, when it is the only weighted site in its company, or when a filter hides a sibling of that company -
because the rows that look adjacent would not be.

**No weight is rounded and there is no minimum gap.** The computed double is what is stored, and every
computed value is re-compared against the neighbours it came from rather than trusted.

**A drop only PROPOSES.** Cancel writes nothing. Save re-reads the target and both neighbours first - really
re-reads, invalidating this page's own cache key, since a check answered from the snapshot the preview came
from checks nothing - and then reports the **read-back weight and position**. `OUTCOME_UNKNOWN` holds the
dragged position visibly unconfirmed and withdraws Save; it is never described as saved, and nothing is
automatically re-sent.

Mouse, touch and keyboard are one implementation (Pointer Events plus Space / Enter / arrows / Home / End /
Esc on a real `<button>` handle).

Full rationale, decisions and test cases: `SITE_PRIORITY_DRAG_SEMANTICS_PROPOSAL_S8_B3_R3_CP2M.md` (Rev 4),
decision register D-S8-B3-30 to D-S8-B3-36.

---

## 8. Known gap, recorded rather than worked around

`assets/js/pages/inventory-replenishment.js` still carries `(reg && reg.allocationPriority) || 0`. It was
examined for correction in this round and **deliberately left alone**: the object it builds is passed to
`_allocateShared`, where the value is a **weight** in the §24.7 shortage split
(`Math.max(minNeed,0) * Math.max(allocationPriority,1)`) and a **tie-break** in the largest-remainder ordering.
It is not display-only, so editing it would change allocation numbers. Closing it is an allocation-behaviour
change and needs its own authorized round.
