# FX1 — the FX Rate Book: contract, backend change list, GS cost, initial write scope

**Status: PREPARATION ONLY. Nothing here is routed, stored or written.** No production table was created,
no price batch was run, and no `.gs` file changed. This document is the thing the round asks to be
delivered *first* — the change list and its cost — so the work can be approved or refused before any of
it is built.

**It does not block the Inventory Replenishment release.** The page is absent from `index.html`, the two
actions do not exist, and the only files added are a contract module, fixtures, a suite and an unrouted
page — none of which is in the Apps Script load surface.

---

## 1. The gap this closes

`pricing.fxReconcile` (73_) already converts correctly and already refuses nearly everything that should
be refused: a non-positive rate, a rate with no source, a rate with no as-of date, a same-currency rate
that is not 1, a duplicated pair, a currency outside the frozen precision contract, and any run that
would overwrite a manual price. Its direction is frozen — `LOCAL = BASE × RATE` — and it never inverts.

What it does not have is **anywhere to keep a rate**. `PRICING_DATABASE_MAPPING` §10 recorded *"No
separate FX DB table for MVP"*, so the rates for every run arrive with the request and are re-typed by a
person each time. That means:

- no history: last month's rate is whatever somebody still has in a tab;
- no effective period: a rate cannot be scheduled, and a correction cannot be told from a new rate;
- no review: nobody can look at the set that is about to be applied before it is applied;
- and `Add Regional SKU` cannot generate `auto_*` at creation, because at creation there is no rate to
  read — which is exactly why 04_ marks those rows `pending_fx` and leaves every price blank.

FX1 builds the missing half and **changes no write path**: the book produces the `rates: [...]` array
that `pricing.fxReconcile` already accepts.

---

## 2. The contract (built and proven this round)

`assets/tests/_fx-rate-book-contract.js` — pure, no I/O, no clock, `now` always a parameter.
Proven by `assets/tests/fx-rate-book-contract-and-fixtures-fx1.test.js`.

| rule | behaviour |
|---|---|
| direction | `base → quote` only. The book holding `USD>CAD` does **not** answer `CAD>USD`; it returns `ONLY_INVERSE_EXISTS` and says why. A reciprocal is the one arithmetic error that produces a plausible wrong price rather than an obvious one. |
| positive coefficient | `0` and negatives are refused. Zero would convert every price to nothing. |
| same currency | fixed at exactly **1**, and resolved **without a stored entry**. `USD>USD` at 1.02 is refused — a 2% drift would silently reprice a whole domestic site. |
| source | required. A rate with no named source cannot be audited or reproduced. |
| as-of | required, `YYYY-MM-DD`. A rate with no as-of cannot be told from a stale one. |
| effective period | `effective_from` required; `effective_to` **empty means open-ended**, which is a state, not a gap. An inverted range is refused. |
| active status | exactly `active` or `inactive`. **A blank is not "active"** — the same rule PRICING-R2 §10 applies to ownership flags. An inactive rate is never resolved and is **retired, not deleted**, so the audit trail survives. |
| overlap | two **active** rates for one pair covering one day is a refused book, and resolution refuses too (`AMBIGUOUS`) rather than taking the first row. Position is not precedence. |
| version conflict | a save carries the version it read. A stale save is refused with the stored version and *nothing is changed*. Two operators maintaining one pair from two tabs is the ordinary case. |
| change record | every field that moved, **with its old value**, plus who and when (`changed_at` supplied by the caller, never read from a clock here). A log that keeps only the new value cannot answer the question it is kept for. |

### Where the rates live

**Script Properties, as a versioned JSON document — not a new production table.** This is the pattern
`automation-schedule` already uses (`KM_AUTOMATION_SCHEDULE_CONFIG`) and that 50_ uses for the
replenishment allocation rules. It is maintainable, it is not hard-coded into calculation code, and it
costs no sheet. A table can replace it later without changing the contract, because the contract takes a
plain array.

Proposed key: `KM_FX_RATE_BOOK`. Value: `{ "version": 1, "rates": [ …entries… ] }`.

---

## 3. Backend / DB change list — **NOT BUILT, awaiting approval**

| # | change | file | kind |
|---|---|---|---|
| 1 | `fx.rateBook.get` — read the property, return `{ rates, required_pairs, as_of_today }`. `required_pairs` is obtained by the existing dry-run path, so the page never derives it in the browser. | new owner, or 73_ | read action |
| 2 | `fx.rateBook.save` — validate the whole book, enforce version conflict, write the property, append the change record. | same owner | write action |
| 3 | router dispatch for both, + `SYS_ACTION_CONTRACT_` bump (an action **is** added, so this one genuinely moves) | `01_router.gs`, `63_` | routing |
| 4 | manifest row + module stamp for the new owner; release cut | `63_` | release identity |
| 5 | port the contract module into the shipped tree so page, server and suite share one definition | `assets/js/core/` **(load-surface!)** or a non-bundled util | placement decision |
| 6 | `Add Regional SKU`: consult the book at creation (§5 below) | `04_marketplace_forecast_import.gs` | behaviour |

**No new sheet, no new table, no schema migration, and no price write.** `pricing_list` and
`pricing_change_log` are untouched; the only writer of them stays 73_.

---

## 4. GS cost — **this change CANNOT LAND at the current ceiling**

| | bytes |
|---|---|
| ceiling (approved, CP2V-R2) | 4,630,000 |
| current surface at `ab361ffb` | **4,629,942** |
| **headroom** | **58** |

Measured estimate for items 1–4 above, by character count against comparable existing handlers:

| item | estimate |
|---|---|
| contract module ported into the bundle (item 5, `assets/js/core/`) | ~9,000 |
| two handlers (validate, version check, property read/write, change record) | ~4,500 |
| router dispatch + action-contract bump + the POST action list string | ~700 |
| 63_ manifest row, stamp, release | ~400 |
| **total** | **≈ 14,600 bytes against 58 available** |

**It does not fit, and it is not close** — it is roughly 250× the available headroom. Even the smallest
viable slice (the two handlers alone, with the contract left unported and duplicated in the page, which
would itself be a defect) is ~5,200 bytes.

**No budget was taken and none is assumed.** The IR gate was approved "scoped and spent" for the
recommendation read transport; FX must not consume it, and this round does not. **FX1 therefore stops
here by design**: the contract, the fixtures, the suite and the page are built and proven, and the
backend is a costed proposal.

Three ways forward, for the Owner to choose between — this document recommends none of them:

1. **Raise the gate** for an FX-scoped amount, the way CP2V-R2 raised it for IR.
2. **Find the bytes** by retiring something from the load surface. The two `TEMP_*` diagnostics files
   under `assets/tools/apps-script-diagnostics/` are already outside it, so that well is dry; the
   candidates would be inside `assets/specs/active/apps-script/`.
3. **Keep FX off Apps Script entirely** — maintain the book in the sheet by hand and keep handing
   `pricing.fxReconcile` its rates per run, which is today's behaviour plus a reviewed list.

---

## 5. `Add Regional SKU` → `auto_*`, and what must not change

04_ today: `base_currency == local` → rate 1, `auto_*` and the effective price initialised, row complete.
`base_currency != local` → **no rate exists at creation**, so `fx_rate`, `auto_*` and the effective price
are left blank and the row is marked `pending_fx`. *"A blank auto is a visible gap; a wrong auto is not."*

With a book, the second branch can consult it at creation:

- **an approved, active rate covering the creation date** → compute `auto_*` from the base the row
  already carries, exactly as the identity branch does, and the row is complete immediately;
- **no such rate** → **still `pending_fx`**, still blank. This does not change. A missing coefficient is
  not an instruction to write a zero, and `blank is never zero` holds at every point.

**The three ownership flags stay `FALSE` at creation** — at that moment it is a fact (the system made the
row and no person has touched a price), not a classification, and PRICING-R2 §4A still forbids inferring
ownership for rows that already exist. So the row still repairs itself on the next reconciliation, and
no migration or backfill is introduced.

---

## 6. Existing price updates — reconciliation is unchanged

Nothing in FX1 changes what a reconciliation may touch:

- `auto_regular_price` / `auto_minimum_price` / `auto_msrp` — the system reference, always refreshable.
- `regular_price` / `minimum_price` / `msrp` — **never.** These are user overrides and an FX run is not
  a user. `TRUE`, `FALSE` and blank are all left exactly as found.
- **A stored rate does not reprice anything.** Saving a rate in the book writes no price. Prices move
  only when a reconciliation runs, and `dry_run` is its default — `dry_run: false` must be written out in
  full to write anything. The page says so on its face.
- The preview is the existing one: a dry run reports the census and `required_pairs` and writes nothing.
  The page shows coverage against that list **before** a run, because 73_ skips an unpriced pair as
  `MISSING_FX_RATE` and the operator has to know which rows those are in advance.

---

## 7. The currency pairs actually needed

From the ten-site universe recorded in `DEPLOYMENT_RELEASE_LOG.md` (the P1-B6 production readback):

> KM/US/Shopify 101 · KM/US/Target 19 · KM/US/Walmart 64 · ResTW/AU/Amazon 35 · ResTW/CA/Amazon 51 ·
> ResTW/EU/Amazon 39 · ResTW/JP/Amazon 26 · ResTW/UK/Amazon 42 · ResUS/US/Amazon 100 · ResUS/US/Walmart 18

Six countries. With `base_currency = USD` — what every pricing fixture in this repository carries — that
is **five non-identity pairs**:

| pair | site | stored decimals |
|---|---|---|
| `USD>AUD` | ResTW/AU/Amazon | 2 |
| `USD>CAD` | ResTW/CA/Amazon | 2 |
| `USD>EUR` | ResTW/EU/Amazon | 2 |
| `USD>GBP` | ResTW/UK/Amazon | 2 |
| `USD>JPY` | ResTW/JP/Amazon | **0** |

The five US sites are `USD>USD` and need **no stored rate**.

**Every one of these is already inside 73_'s frozen precision contract**, so no currency gap blocks FX1.
CHF, VND, MXN and RMB appear in test fixtures only and are *not* in that contract — a `pricing_list` row
in one of them would be skipped as `UNSUPPORTED_CURRENCY`, and the book refuses such a rate at entry
rather than letting someone maintain one that can never be applied.

**This is the expected set, not the measured one.** `base_currency` is a **per-row** column, so the
authoritative answer comes from the database: run `pricing.fxReconcile` with `dry_run: true` and no
rates — it writes nothing and returns `required_pairs`. Reconcile that against the table above before
entering anything.

### The initial data

`assets/tests/_fx-rate-book-fixtures.js` carries `INITIAL_BOOK_TEMPLATE`: one row per required pair, with
the structure, the direction, the status and the version filled, and **`rate` and `as_of` deliberately
empty**. The suite asserts that this template *fails validation* for exactly those fields.

That is intentional. A rate is a business fact with a date on it, and writing a plausible number into a
file would put a figure nobody checked where it would be right on the day it was typed and wrong every
day after — the failure 73_ names when it says *"a rate hard-coded into a source file would be a business
fact frozen into a deployment."* The template cannot be shipped by accident because it cannot pass its
own validation until a person supplies the number and the date they read it on.

**`source` is `TBD-OFFICIAL-SOURCE` — the Owner's decision, not a recommendation.** Whatever is chosen
must be re-openable on the as-of date to see the same number. A central bank daily reference, the rate
the payment processor actually settled at, and the rate the marketplace itself publishes will all
disagree, and which one is correct is a commercial question, not a technical one.
