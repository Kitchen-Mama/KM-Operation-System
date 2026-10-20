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

---

# FX1-R2 (2026-10-19) — the four things the first draft left open

FX1-R1 wrote the backend and measured it. FX1-R2 closes the gaps the Owner named, **re-measures**, and
still lands nothing: the proposal remains staged under `docs/planning/fx1-r1-staging/` with a `.proposed`
suffix, outside `assets/specs/active/apps-script/`. The load surface is **78 files / 4,629,942 bytes**,
unchanged. No Script Property was written, no book was initialised, nothing was repriced, and no
Production read permission was needed or requested.

Each gap below is a **counter-example in the verifier**, not a claim in prose.

## 1. The stored document was TRUSTED once it parsed

`JSON.parse` succeeding says only that the value is JSON. The first draft then read `doc_version` and
`rates` straight off it. Ten ways a value can be well-formed JSON and still not be a rate book are now
refused: an array, a string, no shape marker, `shape: 0`, a **string** `doc_version`, a fractional one, a
negative one, `rates` as an object, `rates` absent, `rates` as a string.

**Strict on TYPE, not merely on value.** `Number("2")` is `2`, so a coercing check accepts a book whose
version is a string — and then the next save compares `2 !== "2"` and refuses every legitimate write. The
stored type is part of the contract. *(This was a real laxness in the R1 draft, found by its own new
counter-example.)*

**A book written by a NEWER build is refused, not downgraded** (`FX_BOOK_SHAPE_FUTURE`). This code cannot
know which fields it would silently drop on the next save, and dropping them is how a rollback destroys
data. A save against such a book fails and **does not overwrite it**.

An **absent** property is still a legitimate empty book at version 0, and says `absent: true` so "never
written" can be told from "emptied on purpose".

## 2. A book could outgrow what a Script Property can hold

A property value is capped at 9 KB. The first draft discovered that at write time — *after* the change
record had been built — as a platform exception.

`fxBookCommit_` now measures the document **before** attempting the write, and refuses with
`FX_BOOK_TOO_LARGE` carrying the measurement and the limit.

**UTF-8 BYTES, NOT CHARACTERS.** A JavaScript string's `.length` counts UTF-16 units; the platform counts
bytes. A source named `Banco de España — referencia` or a note in Chinese costs two to three bytes per
character, so a book measuring 8,000 "characters" can be well over the cap. The verifier pins the unit
directly: ASCII 1, Latin-1 accent 2, em dash 3, CJK 3 per character, and an emoji **4** — one four-byte
code point, not two three-byte ones. A book of 12,000 bytes of valid CJK notes is refused; **the same
shape in ASCII fits**.

*(This is the same bug class that made FX1-R1's own first cost measurement wrong — `String.length` against
a file containing `—` and `§`. It is worth fixing in the code for the same reason it was worth fixing in
the measurement.)*

**The log sheds its oldest records before the rates are refused.** History is valuable; the rates are what
the system runs on. Trimming is counted and reported (`log_trimmed`), never silent. If the **rates alone**
do not fit, nothing is written — not a truncated book, and not a book with its history discarded for a
save that was going to fail anyway.

## 3. The book and its change log were TWO properties

A save was two writes. If the book landed and the log did not, the history silently lost a change that
*had* been applied; if the log landed and the book did not, the history claimed a change that never
happened. **There is no transaction across two Script Properties, and a lock does not provide one** — a
lock serialises writers, it does not make two writes one.

The log now travels **inside the same document**: `{ shape, doc_version, rates, log }`. The commit is a
single `setProperty` — it either happened or it did not. Proven three ways:

- a save adds exactly **one** property, and the log is inside it at the same `doc_version`;
- a property write that **throws** leaves the stored book byte-identical, with no orphan record;
- a write that silently **does not take** is caught by the readback and reported as
  `FX_COMMIT_NOT_CONFIRMED` rather than as success. Reporting success for a lost save is how an operator
  ends up with a wrong price.

## 4. The write authority returned "allowed" unconditionally

The first draft returned `{ ok: true }` always and called it the deployment model. That is a true
description of every *other* write in this project — and it is not good enough for the one action that can
reprice an entire catalogue on the next reconciliation.

**It now fails closed.** The allowlist lives in `KM_FX_RATE_BOOK_EDITORS`:

| situation | result |
|---|---|
| no allowlist configured | `FX_AUTHORITY_NOT_CONFIGURED` — refused |
| allowlist set, caller **unidentifiable** | `FX_AUTHORITY_UNVERIFIABLE` — refused |
| allowlist set, caller not on it | `FX_NOT_AUTHORIZED` — refused |
| allowlist set, caller on it (case-insensitive) | allowed, `model: ALLOWLIST` |
| allowlist is exactly `*` | allowed, `model: OPEN_BY_CONFIGURATION` |

The unidentifiable case matters and is stated honestly: **a Web App that executes *as the owner* cannot
see who called it**, and `Session.getActiveUser()` returns `''` there. Treating that as authorised would
make the allowlist decorative. The single documented escape is an explicit `*` — the Owner recording, in
the configuration itself, that this deployment is open. **A decision written down is a different thing
from a default nobody chose.**

The change record attributes the **identified** caller. **READ is never gated on write authority**: seeing
the rates that price the catalogue is not the same permission as changing them, and the page is told
`may_edit: false` with the reason *before* anyone starts editing.

## Re-measured GS cost

| file | before | after | delta |
|---|---:|---:|---:|
| `75_api_v1_fx_rate_book.gs` (new) | 0 | **24,979** | **+24,979** |
| `04_marketplace_forecast_import.gs` | 54,355 | 55,618 | +1,263 |
| `01_router.gs` | 75,128 | 75,953 | +825 |
| `63_api_v1_system_health.gs` | 150,331 | 150,570 | +239 |
| `90_generated_supply_planning_bundle.gs` | 1,250,656 | 1,250,656 | 0 |
| | | | **+27,306** |

Bytes, LF-normalised, measured by applying the real edits to copies of the real files.

```
ceiling                4,630,000
current surface        4,629,942      headroom 58
FX1-R2                   +27,306
would be               4,657,248    OVER by 27,248
```

**It still cannot land, and no budget was taken.** `SIZE_BUDGET` is untouched at 4,630,000 and no IR bytes
were borrowed.

### Recommended new ceiling: **4,662,000**

```
4,629,942   current surface
  +27,306   FX1-R2, measured
  = 4,657,248
   +4,752   working margin
  = 4,662,000
```

The margin is not padding. CP2X-R2 §D at +338 and the R54 release cut at +174 were each measured, each
did not fit, and each was moved out of the `.gs` file to stay under the gate. **At 58 bytes the ceiling has
stopped constraining code and started constraining the ability to explain code.**

**What the number would license, and nothing else:** the `75_` owner module, the two router actions and
their dispatch, the `63_` manifest row, module stamp and action-contract bump, and the `04_` creation
wiring. Not a sheet, not a schema change, not a price write. Per the CP2V-R2 precedent recorded in
`apps-script-load-surface-slim-r1.test.js` — *"THE RAISE WAS SPENT, NOT BANKED"* — a grant is consumed by
the change it names, and any overrun comes out of this round's own prose.

**Awaiting an FX-specific budget decision. Nothing lands until it is granted.**

---

## FX1-R3 — the integration is BUILT, VERIFIED, and 1,070 bytes OVER the approved ceiling

**Measured, not estimated.** `node docs/planning/fx1-r1-staging/measure-fx1-r3-integration.js` applies the
whole integration to the working tree, counts every `.gs` under `assets/specs/active/apps-script/` the way
`gs-load-surface-audit.js` does (UTF-8 bytes, LF, which is how git stores them), writes the applied diff to
`fx1-r3-integration.patch`, and **restores the tree**. It leaves nothing behind and can be re-run by anyone.

| file | bytes |
|---|---:|
| `75_api_v1_fx_rate_book.gs` (new) | **+29,661** |
| `63_api_v1_system_health.gs` (2 required actions, manifest row, 2 version bumps) | +1,588 |
| `04_marketplace_forecast_import.gs` (consult the book at SKU creation) | +981 |
| `01_router.gs` (1 GET, 1 POST, the POST vocabulary) | +898 |
| **TOTAL** | **+33,128** |

```
before   78 files   4,629,942 bytes
after    79 files   4,663,070 bytes
ceiling              4,662,000 bytes   (Owner-approved, FX1-R3)
VERDICT  OVER by 1,070 bytes
```

**So the integration was NOT committed.** The working tree is back at 78 files / 4,629,942 bytes, the
`SIZE_BUDGET` gate is untouched at 4,630,000, and the wiring is preserved as a reviewable patch rather
than as a half-landed feature. Nothing was deleted to make room and the ceiling was not moved: the
instruction for this case was to stop and report, and 1,070 bytes is a decision, not a rounding error.

### Where the 1,070 bytes could come from, stated so the choice is the Owner's

`75_` is 29,661 bytes, of which **13,333 (45%) are comment lines** and 16,297 are code. The deficit is
**8% of its own commentary**. That is the cheapest available source and it touches nothing else — but it
is also the part of this repository that explains why each guard exists, and five of this round's ten
mutants are guards whose reason lives only in those comments. Trimming them to fit a byte budget is a
real cost, not a free one, which is why it is being put as a question rather than done quietly.

Three other shapes, for comparison:

1. **Raise the ceiling to 4,664,000.** ~930 bytes of working headroom, same as the margin FX1-R2 was
   budgeted with. The surface has grown ~33 KB in this round alone and the next FX round will want room.
2. **Defer the `04_` creation wiring (−981 bytes, plus ~350 of the `75_` reader it calls).** It lands at
   4,661,739 — under, with 261 bytes spare. The cost: a SKU created cross-currency still goes
   `pending_fx` even when a rate IS stored, which is the behaviour that exists today, so nothing
   regresses; the rate book would simply not yet reach creation. This is the smallest honest subset.
3. **Trim `75_`'s commentary by ~1,100 bytes.** Fits, and the reasoning that would go is recoverable from
   the decision register and this file — but only if someone thinks to look there.

Recommendation: **option 2 for this round** (it is under the approved ceiling with the approved scope
reduced by one named item), with option 1 as the next budget conversation. Option 3 is available and is
not recommended.

### What IS delivered, and it costs ZERO GS bytes

Everything below lives under `docs/planning/fx1-r1-staging/` and `assets/specs/active/apps-script/` is
byte-identical to `HEAD`:

- `75_api_v1_fx_rate_book.gs.proposed` — the R3-hardened module.
- `verify-75-proposed.js` — **221 passed, 0 failed**, offline, against the real `73_` helpers.
- `mutants-75-proposed.js` — **10 applied, 10 caught, 0 missed**, and it proves the staged file is
  unmodified when it finishes. FX1-R2 ran its mutants by hand and left nothing behind, so "5 of 5" was
  not re-runnable by anybody, including this round.
- `measure-fx1-r3-integration.js` — the measurement above.
- `fx1-r3-integration.patch` — the wiring, reviewable without running anything.

### The three gaps FX1-R3 closed, each a counter-example that failed first

1. **The request's `doc_version` was coerced with `Number()`.** `null`, `''` and `[]` all map to `0`, and
   `0` is the version of an absent book — so a save that claimed no version at all passed the
   compare-and-swap and wrote the first rate book. Measured on the R2 proposal: each of `null`, `''`,
   `[]` and `"0"` stored a complete five-pair book at `doc_version: 1`. Now strictly typed, and a numeric
   string is refused even when its value matches, because the type is the contract.
2. **The audit operator and timestamp came from the request body.** `payload.changed_by || auth.user` and
   `payload.changed_at`, so the one record of who changed a rate said whatever the browser said — while
   the caller had already been identified two lines earlier. Both now come from the server: the verified
   caller, and `new Date().toISOString()`.
3. **An explicit `*` in the allowlist authorised anybody.** R2 defended it as a decision written down.
   The flaw is that the deployment mode which cannot identify a caller is exactly the mode in which
   someone reaches for `*`, so the escape and the hole it was meant to make visible were the same hole.
   It is now refused **by its own name** (`FX_AUTHORITY_WILDCARD_REFUSED`) so an Owner who set one learns
   why, and `fxBookAuthority_` takes **only the io** — the request is not a parameter, so no field of it
   can reach the decision.

### What is NOT built, and why

The **Administration page** is front-end only and would cost **0 GS bytes**, so it does not affect the
verdict above. It is not built, because it is a page for two actions that cannot be deployed, and because
each of the three options above changes what it would be built against. It is the first thing to do once
the size question is settled.

**No production write of any kind was made.** No Script Property was written, no rate was initialised, no
price batch was run. Every assertion above comes from offline fixtures with an injected `io`; a sandbox is
not database isolation, and nothing here relied on it being one.
