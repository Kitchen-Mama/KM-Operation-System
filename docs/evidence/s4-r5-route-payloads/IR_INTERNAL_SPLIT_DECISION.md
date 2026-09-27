# S4-R5 §11 — Inventory Replenishment internal split: DECISION REQUIRED

```
DECISION_REQUIRED = YES
IMPLEMENTED       = NO   (§11 forbids choosing this autonomously; §3 is an audit)
```

Site Inventory now loads on route entry rather than at boot. The question §11 asks is whether it
should *also* be split internally, so that parts of it load only when used.

---

## §3 — why the file is 941 KB

490 top-level functions. Bytes attributed by the function's own source length, so the total is the
file rather than a sample of it. Classification is by name against a first-match rule list, which is
approximate by construction and labelled as such.

| responsibility | KB | % |
|---|---|---|
| UNCLASSIFIED | 244 | 25.9 |
| EXECUTION_PLAN | 162 | 17.3 |
| ALLOCATION_DRAFT | 124 | 13.1 |
| TABLE_RENDER | 81 | 8.6 |
| SUBMIT_WRITE | 75 | 7.9 |
| AI_PLAN | 62 | 6.6 |
| SCOPE_BOOTSTRAP | 46 | 4.9 |
| FILTERS | 46 | 4.9 |
| HELPERS | 41 | 4.4 |
| FORECAST_GAP | 23 | 2.4 |
| IMPORT | 16 | 1.7 |
| MODALS_DRAWERS | 14 | 1.4 |
| EXPANDED_ROW | 8 | 0.8 |

Largest single functions: `applyFulfillmentLock` 37 KB · `_hydrateAllocationDraftFromDb` 24 KB ·
`_saveAllocationDraftFromDom` 23 KB · `submitReplenishmentPlans` 20 KB ·
`_irRunInventoryAiPlanGeneration_` 20 KB · `_getCloudReplenishmentData` 19 KB.

**There is no single dominant block.** The file is large because it does a great many things, not
because one feature is oversized. The largest coherent candidate is 17% of it.

---

## §1A decides most of this before cost does

The operator rule is authoritative: for a master-row → expandable-SKU-detail workspace, the data and
behaviour of a SKU's **normal second-level expanded row** must not be deferred, and classification
follows **user workflow, not DOM visibility**.

Applying it:

| block | KB | first use | §1A verdict |
|---|---|---|---|
| EXECUTION_PLAN | 162 | expanding a SKU and planning its route | **second-level operational detail — NOT a candidate** |
| ALLOCATION_DRAFT | 124 | expanding a SKU and allocating demand | **second-level operational detail — NOT a candidate** |
| TABLE_RENDER / FILTERS / SCOPE_BOOTSTRAP / HELPERS | 214 | first screen | critical |
| SUBMIT_WRITE | 75 | reached from the expanded row | second-level — not a candidate |
| FORECAST_GAP | 23 | first screen figures | critical |
| EXPANDED_ROW | 8 | expanding a SKU | critical (and trivially small) |
| **AI_PLAN** | **62** | clicking *Generate AI Plan* | candidate — a separate deep feature |
| **IMPORT** | **16** | opening the import modal | candidate — a separate deep feature |

`PER_SKU_EXPAND_REQUEST_COUNT = 0` and `N_PLUS_ONE_EXPAND_REQUEST_PATTERN` remain as they are: this
round changed no read on this page, and the expanded row is served from the workspace model the
mount already holds.

**So the whole eligible set is 78 KB of 941 KB — 8%.**

---

## The decision

```
PAGE     = Inventory Replenishment / 貨物庫存表
FEATURE  = AI Plan generation (62 KB) + Inventory Import (16 KB) = 78 KB
FIRST_USE = an explicit button click, on a route whose code has already been fetched
```

**OPTION_A — keep eager (recommended).** The 78 KB arrives with the other 863 KB, in one request the
operator has already paid for by opening the page.

**OPTION_B — load on first use.** Two more fetchable units, each with its own failure surface, its
own loading state, and its own retry path, inside a workflow where the user has just clicked a button
and expects it to do something.

| | A | B |
|---|---|---|
| boot benefit | **none — the page is already off boot** | none |
| route benefit | — | 78 KB off a 941 KB route fetch, ≈ 8% |
| failure surface added | none | two new ways for a click to end in a refusal |
| maintenance cost | none | two more entries to keep in the route table, in token families, and in the sweep |
| UX risk | none | a *Generate AI Plan* click that must first download code, on the page where the operator is mid-decision |

`RECOMMENDED_DIRECTION` — **A, keep eager.**

The reasoning is the same one S4-R1 used to reject a marginal split and it holds better here: the
saving does not repay the second failure surface. 78 KB is 8% of a payload that is now fetched once
per session, on demand, and the two features are precisely the ones where an operator has already
committed to an action. This round removed 1.58 MB from every boot; shaving 78 KB off one on-demand
fetch is not the same kind of win, and it buys it with two new places the page can refuse.

**If the operator wants it anyway**, the honest framing is: it is safe to build — both features are
genuinely separable, neither is second-level expanded-row data under §1A, and the route-owned loading
contract already exists. It is simply not worth what it costs. That call is the operator's.

---

## Not a candidate, and worth saying why

`applyFulfillmentLock` at 37 KB is the largest single function in the file and looks like an obvious
target. It is not: fulfillment locking governs what the **first screen** may show and edit, so it is
critical by §2 and by §1A both. Size is not a classification.
