# FX1-R1 (2026-10-19) — the FX backend written, run and MEASURED, with a budget request

FX1 delivered a costed proposal. FX1-R1 replaces the estimate with a measurement: the owner module was
written in full, it runs, and its behaviour is proven against the same rules 73_ already enforces.

Everything lives under `docs/planning/fx1-r1-staging/` — **outside** `assets/specs/active/apps-script/`,
with a `.proposed` suffix, so no build, audit or sync step can pick it up. The load surface is still
**78 files / 4,629,942 bytes**, unchanged by this round. Nothing was written to any Script Property, no
production config was created, and no price batch was run.

| file | what |
|---|---|
| `75_api_v1_fx_rate_book.gs.proposed` | the owner module, written as it would really ship |
| `fx-rate-book-initial-draft.json` | the DRAFT initialisation data, complete and valid |
| `verify-75-proposed.js` | 53 assertions; `node docs/planning/fx1-r1-staging/verify-75-proposed.js` |

---

## 1. What changed from FX1's design — and why it is cheaper and better

FX1 budgeted ~9,000 bytes to port the contract module into `assets/js/core/`, which is compiled verbatim
into the generated bundle and therefore **costs its full size in the load surface**. FX1-R1 does not do
that. The server is the authority; the page submits and renders the server's error list. That removes the
port entirely.

More importantly, **73_ already owns most of the rules**. `pricingBuildRateTable_` validates positive,
source, as-of, identity-is-1 and duplicate-pair, in the exact error vocabulary the page already renders.
The new module calls it rather than restating it, so the book cannot drift from the writer that consumes
it. `pricingDecimalsFor_` supplies the supported-currency list — the frozen precision contract *is* the
answer to "which pairs may be maintained". Only what 73_ genuinely lacks is new: effective periods,
active/inactive status, period overlap, the document version and the change record.

No price formula is restated. `LOCAL = BASE x RATE` stays in 73_. The book's only output is the
`rates: [...]` array 73_ already accepts.

---

## 2. Measured GS cost

| file | before | after | delta |
|---|---:|---:|---:|
| `75_api_v1_fx_rate_book.gs` (new) | 0 | 15,978 | **+15,978** |
| `04_marketplace_forecast_import.gs` | 54,355 | 55,618 | **+1,263** |
| `01_router.gs` | 75,128 | 75,953 | **+825** |
| `63_api_v1_system_health.gs` | 150,331 | 150,570 | **+239** |
| `90_generated_supply_planning_bundle.gs` | 1,250,656 | 1,250,656 | **0** |
| | | | **+18,305** |

Bytes, LF-normalised, measured by applying the real edits to copies of the real files — not counted by
hand. `90_` is **0** because no `assets/js/core/` module changes, so there is nothing to regenerate.

**Why the FX1 estimate was low (~14,600 vs 18,305).** It sized the handlers at ~4,500 — they are 15,978
written in house style with the rationale this repo expects — and its change-list item 6, the
`Add Regional SKU` wiring, carried no number at all. Dropping the ~9,000 core port is what keeps the
total from being ~27,000.

### Against the ceiling

```
ceiling                4,630,000
current surface        4,629,942      headroom 58
FX1-R1                   +18,305
would be               4,648,247      OVER by 18,247
```

**It cannot land, and no budget was taken.** `SIZE_BUDGET` is untouched at 4,630,000 and no IR bytes
were borrowed.

---

## 3. Recommended new ceiling: **4,653,000**

```
4,629,942   current surface
  +18,305   FX1-R1, measured
  = 4,648,247
   +4,753   working margin
  = 4,653,000
```

The margin is not padding. The last two rounds each measured an in-file explanation that did not fit —
CP2X-R2 §D at +338 and the R54 release cut at +174 — and both were moved out of the `.gs` file to stay
under the gate. **At 58 bytes the ceiling has stopped constraining code and started constraining the
ability to explain code.** 4,753 restores roughly ten rounds of ordinary rationale and release cuts.

**What the number would license, and nothing else:** the `75_` owner module, the two router actions and
their dispatch, the `63_` manifest row, module stamp and action-contract bump, and the `04_` creation
wiring. Not a sheet, not a schema change, not a price write.

Following the CP2V-R2 precedent recorded in `apps-script-load-surface-slim-r1.test.js` — *"THE RAISE WAS
SPENT, NOT BANKED"* — a grant is consumed by the change it names, and any overrun comes out of this
round's own prose rather than out of another module.

---

## 4. Proven behaviour — 53 assertions, 5/5 mutants caught

Run against the **real** 73_ helpers, extracted from the real file, with Apps Script stubbed.

- the DRAFT data passes the real validator, and each rate **recomputes** from the published legs;
- identity resolves to exactly 1 with no stored entry; `CAD>USD` against a `USD>CAD` book returns
  `FX_ONLY_INVERSE_EXISTS` — **never** a reciprocal;
- a date before `effective_from` resolves to nothing, not the nearest rate;
- two active rates covering one day are refused at save and `FX_AMBIGUOUS` at resolve — position is not
  precedence;
- the inherited 73_ rules still bite: zero rate, missing source, `USD>USD` at 1.02, unsupported currency;
- a **blank status is not "active"**;
- the version check is **inside the lock and re-reads**; a stale save is refused, hands back the stored
  version and writes nothing; a save with no `doc_version` is refused outright;
- an invalid book writes **zero** rates; a contended lock writes nothing; a corrupt property is **not**
  treated as an empty book and is not overwritten;
- the change record keeps the **old** value, who, and when; removals are recorded;
- the array handed to 73_ is accepted by `pricingBuildRateTable_` itself, and uncovered pairs are
  **named**, because 73_ would otherwise skip those rows as `MISSING_FX_RATE` and the operator has to
  know which ones in advance;
- a save touches exactly two Script Properties. The module contains no sheet write, no `pricing_list`
  reference, and never names a price column — so it **cannot** overwrite a manual price or an ownership
  flag.

Mutation-checked: removing the version check, inverting on missing-inverse, treating a blank status as
active, disabling overlap detection, and dropping the old value from the change record are each detected.

---

## 5. Storage, permissions, and the one thing that is NOT solved

**Storage** is Script Properties, the pattern `45_` already uses: `KM_FX_RATE_BOOK` holds
`{doc_version, rates[]}` and `KM_FX_RATE_BOOK_LOG` holds the last 200 change records. Bounded on
purpose — a property value is a ~9 KB store, not a journal. No new sheet, no schema migration, and the
contract takes a plain array so a table can replace it later without changing anything else.

**Permissions cost 0 bytes, and that is a finding rather than a saving.** `getActiveUser` appears in
**none** of the 78 deployed modules: there is no per-user role model in this API layer at all, and every
existing write is gated by who can reach the deployment. `fxBookAuthority_` returns `DEPLOYMENT_ACCESS`
and is the single integration point for a future real owner — it does **not** fabricate an identity
check. So "who may change an exchange rate" is today exactly "anyone who can open the app", the same
answer as for every other write in the system. Narrowing that is separate work, not an FX line item, and
it should not be assumed to be included in this cost.

---

## 6. Add Regional SKU — what the wiring does and does not change

`pricingNewRowPlan_` stays **pure**: it gains an optional `fxHint` argument that the caller resolves. The
book is read **once per import run**, not once per row — a per-row read would add a Script Properties
round-trip to every created SKU for a document that cannot change mid-run.

- an approved, active rate covering the creation date → `auto_*` computed, the row is complete at once;
- **no such rate → the row stays `pending_fx` with blank prices, exactly as today.**

A missing coefficient is never an instruction to write a zero. The three ownership flags stay `FALSE` at
creation. An unreadable book leaves every cross-currency row pending rather than guessing.

**Saving a rate reprices nothing.** Prices move only when 73_ reconciles, and `dry_run` is that action's
default — `dry_run: false` has to be written out in full. `regular_price` / `minimum_price` / `msrp` are
user overrides and an FX run is not a user; they are left exactly as found.

---

## 7. Routing and the release cost outside the load surface

Routing the Admin page is an `index.html` + `app.js` change: **0 GS bytes, but it spends a page cache
token**, and `r61-scopereuse-20261018` is now served and therefore spent. The FX page needs its **own new
token** in the round that routes it.

`SYS_DEPLOYED_ACTION_CONTRACT_VERSION_` moves 20 → 21 because two router actions are genuinely added.
`KM_EXPECTED_ACTION_CONTRACT_VERSION_` should **stay at 20**: raising the frontend's pinned minimum would
make every page refuse against a deployment that merely lags, for the sake of one admin page. The FX page
checks the deployed contract itself and refuses alone.

---

## 8. The DRAFT initialisation data

`fx-rate-book-initial-draft.json` — five rows, complete and **valid** (FX1's template deliberately failed
its own validation; this one deliberately passes it).

**Source:** ECB euro foreign exchange reference rates, `eurofxref-daily`, published for **2026-10-16**,
retrieved 2026-10-19. One official publisher covering all five quote currencies on one date, re-openable
later to see the same numbers.

**Every row is DERIVED, not quoted — and this needs the Owner's eye.** The ECB publishes with EUR as
base, so no `USD>X` figure appears in the source at all:

```
USD>X  =  (EUR>X) / (EUR>USD)          EUR>USD = 1.1253
```

| pair | derivation | rate |
|---|---|---:|
| `USD>AUD` | 1.6171 / 1.1253 | 1.437039 |
| `USD>CAD` | 1.5935 / 1.1253 | 1.416067 |
| `USD>EUR` | 1 / 1.1253 | 0.888652 |
| `USD>GBP` | 0.84385 / 1.1253 | 0.749889 |
| `USD>JPY` | 177.82 / 1.1253 | 158.020084 |

The book never inverts a **stored** rate — that rule is unchanged and enforced in code. This is a
different act: deriving an **input** from a published quote, once, by hand, with both legs and the
arithmetic recorded in the file so a reviewer can reproduce it. The verification suite recomputes all
five from the recorded legs.

If the Owner would rather every stored rate be directly quoted in base USD, **no single official
publisher provides all five**: the US Federal Reserve H.10 quotes JPY and CAD per USD but quotes EUR, GBP
and AUD as USD per unit, so three of the five would need the same treatment in the other direction.

Two further decisions belong to the Owner, not to this document:

1. **Which source.** An ECB daily reference rate is a *reference*, not a dealable rate. It is the right
   basis for a maintained price book and the wrong basis for settling a payment. The rate a payment
   processor actually settled at, and the rate a marketplace publishes, will both disagree with it.
2. **`effective_from`.** The draft uses 2026-10-19 with an open-ended `effective_to`. Rates older than the
   day they are entered are a deliberate choice about which past runs would be re-reconcilable.

Rate precision is 6 decimal places. That is the **rate's** precision and is unrelated to
`PRICING_FX_DECIMALS_`, which rounds the resulting **price** (JPY 0, the rest 2).

**Before entering anything:** this is the *expected* pair set, derived from the site universe.
`base_currency` is a **per-row** column, so the authoritative list comes from the database — run
`pricing.fxReconcile` with `dry_run: true` and no rates. It writes nothing and returns `required_pairs`.
Reconcile that against the five above first.
