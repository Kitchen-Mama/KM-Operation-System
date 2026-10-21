# FC Historical Sales — SOURCE CONTRACT (read-only survey)

**Status: DRAFT — NOT A DESIGN, NOT AN APPROVAL TO BUILD.** S8-B3-R3-FCB1-R1, 2026-10-15.
Written for: the Owner, deciding whether a historical-sales read path is feasible before any budget
or query work is proposed.

This document answers only "what can this repository PROVE about the source". It was produced
without querying production BigQuery, without adding an API or a `.gs`, and without touching GCP or
the byte budget. **Everything below is sourced to a file in this repository or marked `UNKNOWN` /
`MISSING_OWNER_INPUT`. Nothing is inferred to fill a gap.**

Consumers of this contract: the Owner-approved interval-average rule (equal-weight monthly bases
restored from normal-day means, campaign/event selling days excluded once, provable month
completeness, confirmed zero counted, missing never filled with 0) and the "last year, same month"
Actual column. Neither is implemented.

---

## 0. The one-line answer

**Of the sources this repository identifies, the only one that could satisfy the rule is BigQuery
`Raw Daily Sales`, and the one thing still open is how a row in it maps to a SELLING ENTITY.**
That qualifier is load-bearing: this document surveyed the import configs and the page code in this
repository, which is not a survey of every system the business runs (§2). That is a mapping question with three ordinary
answers (§1.2), not a verdict that the source cannot do it — the repository lists the columns the
import *selects*, which is not the list of columns the table *has*. The DB-side identity model is
Owner-confirmed and is not re-opened here.

Everything else is detail underneath that sentence. **Evidence in this document carries an as-of
date**; where a later reading supersedes an earlier one, both are kept and the older is labelled a
snapshot (§3.3).

---

## 1. BQ raw fields, and how an account / store resolves to company + site

### 1.1 What the import actually selects — `06_amazon_import_config.gs` config 4

Source: `amazon-database-489810` · dataset `AmazonSales` · table `` `Raw Daily Sales` ``.
The field map is the complete list of columns this system has ever named:

| destination column | BQ source column |
|---|---|
| `snapshot_date` | `Date` |
| `country` | **`Marketplace`** |
| `channel` | `Channel` |
| `sku` | `SKU` |
| `currency` | `Currency` |
| `sales_units` | `Sales_Units` |
| `sales_amount` / `sales_amount_usd` | `Sales_Amount` / `Sales_Amount_` |
| `return_units`, `total_orders`, `session`, `page_view`, `unit_session_percentage`, `buy_box_percentage`, `browser_session`, `browser_page_views`, `app_session`, `app_page_view` | same-named BQ columns |
| `marketplace` | **NOT from BQ** — `fixedValues: { marketplace: 'Amazon' }` |

Natural key: `snapshot_date + country + marketplace + channel + sku`.

### 1.2 Company — `MISSING_OWNER_INPUT #1` (the blocking one)

**No column in that map carries a company, a seller id, a merchant token, a store or an account.**
`marketplace` is not read from the source at all; it is stamped `'Amazon'` unconditionally.

This is not an oversight in the mapping — it is the whole system's position:

- `assets/js/core/supply-planning-calculations.js:302` — company "is **NOT** a column of
  `amazon_daily_sales_snapshot` and is **NEVER** inferred from channel / country / marketplace /
  marketplaceSkuId."
- `42_api_v1_recommendation_workspace.gs:213` — the server proceeds on the recorded assumption
  "**company isolation holds by construction (amazon_daily_sales_snapshot is one-company-per-scope)**".

That assumption is **not verified by anything in this repository**. The FC Builder is exactly where
it would matter if it were false: its scope is `company|country|marketplace`, and KM and ResUS both
operate US/Amazon.

**WHAT THIS DOES AND DOES NOT SAY — a correction to the first draft.** The field map above is the list
of columns the **import selects**, not the list of columns the BigQuery table **has**. A source table
routinely carries more columns than a consumer reads. So the repository's silence is evidence about
the *repository*, and it is **not** evidence that `Raw Daily Sales` cannot separate selling entities.
The first draft let the second conclusion stand next to the first; it does not follow and it is
withdrawn.

**The Owner-confirmed DB facts are kept and are not re-opened.** `marketplaces` and `marketplace_skus`
carry `company` as a required column, and `company + country + marketplace` is what distinguishes
operational ownership. Nothing here asks for that to be re-proved, and nothing here asks for a Master
Data change first.

> **MISSING_OWNER_INPUT #1, narrowed to the one thing that is actually open — how does a RAW SALES
> ROW map to a selling entity?** Not "is the DB correct" and not "please re-prove the identity model":
> only the join from a `Raw Daily Sales` row to one of the companies the DB already defines. Any one
> of these answers it, and the first two need nothing changed anywhere:
>
> 1. a column already in the BQ table that the import does not select (a seller / merchant / account id);
> 2. a per-account table or dataset, so the source location itself carries the entity;
> 3. an external mapping the Owner holds (for example account id → company) that can be joined at read time.
>
> Only if **none** of the three exists does the question become a data-model problem rather than a
> mapping one. **Unknown is recorded as unknown; it is not reported as impossible.**

### 1.3 `channel` is not the answer — evidence, not assumption

`channel` is the only dimension in the key whose meaning is otherwise unexplained. The **2026-08-03**
real-data dry-run recorded in `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` analysed a production export of
12,882 rows spanning 58 days, 9 countries and 96 SKUs and reports **`channel=Amazon`** for all of them
— a single constant. **`channel` did not separate anything in that observation**, and nothing in the
repository documents a second permitted value.

**That is a 2026-08-03 observation and it is cited as one** (see §3.3 on why the age matters). It is
strong evidence that `channel` is not the company discriminator and it is **not** a proof about the
BigQuery table's full schema, which no export of the *destination* sheet can show.

### 1.4 Site identity — ANSWERED

`country` + `marketplace` reach the snapshot; the rest of the canonical identity is resolved
upstream from tables this repository owns:

- `marketplaces` → `marketplace_id`, `company`, `country`, `marketplace`
- `marketplace_skus` → `marketplace_sku_id`, `marketplace_id`, `company`, `sku`, `country`, `marketplace`

`marketplace_skus` is the Runtime Canonical Identity resolver, and **D-S8-B3-57 (CP2R-R1) already
made it refuse** when one complete `company+country+marketplace+sku` scope resolves to more than one
`marketplace_sku_id`. A historical reader must reuse that resolver rather than re-deriving identity.

**Known gap, unchanged and not repaired here:** the `marketplace_skus` lookup compares `country` as a
raw string, while the sales path canonicalises it via `KMCID` (the UK≡GB class) and expands EU to
IT+DE+ES+FR. Those two are not the same comparison.

---

## 2. Which platforms actually have a source — ANSWERED, WITHIN THIS REPOSITORY

`06_amazon_import_config.gs` defines **four** import configs and **all four are Amazon**:
`amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_weekly_sales_snapshot`,
`amazon_daily_sales_snapshot`. Both sales configs carry `fixedValues: { marketplace: 'Amazon' }`.

| platform | daily sales source identified in this repository | verdict |
|---|---|---|
| **Amazon** | BQ `Raw Daily Sales` → `amazon_daily_sales_snapshot` | the only one found |
| Walmart, Shopify, Target | none found | **NO SOURCE IDENTIFIED HERE** |
| any other marketplace in `marketplaces` | none found | **NO SOURCE IDENTIFIED HERE** |

**"Unsupported" was too strong, and the narrower claim is the one the evidence carries.** What was
searched is this repository: the four import configs in `06_amazon_import_config.gs`, the readers in
`08_amazon_import_sources.gs`, and the marketplace options in `fc-summary.js`. A feed that exists
somewhere else in the business — a separate sheet, a manual upload, a system this repository has
never been told about — would not appear in any of them. **The absence of a source here is proof
that this code cannot read one, not proof that none exists.**

It changes nothing about the behaviour, and that is the point: either way there is no source *this
code can read*, so either way the only correct output is a named refusal. The reason to state it
precisely is that the two claims have different repairs — "unsupported" invites building a feed
that may already exist, while "not identified here" invites asking first.

> **Walmart / Shopify / Target appear in `fc-summary.js` `_fcMarketplaceOptions()` as a hard-coded
> fallback option list when the registry is empty.** A selectable marketplace with no sales source is
> the most dangerous case in this document: it must produce a NAMED refusal, never an average over
> zero rows. **An unsupported platform is `UNKNOWN`, and `UNKNOWN` is not 0.**

---

## 3. Confirmed zero vs missing vs incompletely imported, per SKU/day

### 3.1 What the row shape can and cannot say — PARTLY ANSWERED

A row with `sales_units: 0` is a **confirmed zero**: the natural key exists for that date, so the
source reported that SKU on that day and it sold nothing. `normalizeAmazonDailySalesSnapshotRecord`
does `parseFloat(r.sales_units) || 0`, which flattens blank/null/unparseable into 0 — **a historical
reader must not use that normalizer**; it must read `raw` and keep the three states apart, the same
way `fc-summary.js` already routes around the pricing normalizer for the same reason.

**The absence of a row is ambiguous and the row shape alone cannot resolve it.** It means at least:
no sale AND the source omits zero-rows · the SKU was not listed that day · the import did not fetch
that date · the date was fetched but partially written.

### 3.2 The mechanism that CAN resolve it already exists

`08_amazon_import_sources.gs` `amazonReadDailyGapAware_` compares, **per date**, the BigQuery source's
row count *and distinct-natural-key count* against the destination's, and classifies a date as
`missing` (in source, absent in destination) or `incomplete` (destination distinct-key count < source,
or destination has duplicate keys). `amazonQuerySourceDateCoverage_` is the per-date source prober;
`amazonReadDestDateCoverage_` is the destination side. `import_sync_runs` / `import_sync_issues`
record each run.

**This is the right instrument and it is already written.** A historical reader should reuse it
rather than invent a second completeness test.

**What the per-date comparison proves is COVERAGE, and no more than that.** It compares *counts* of
distinct natural keys on the two sides. So it can prove a date landed **short**, which is exactly the
failure that silently depresses an average — and it does **not** prove:

- **that the two sides hold the same keys.** Equal counts over a different key set pass the check;
  one key dropped and one key added is invisible to a count.
- **that the sales values agree.** No value is compared at any point. A date whose keys all landed and
  whose units are all wrong is `complete` by this instrument.
- **that the specific SKU being averaged is present.** That is Q3 below, over a different population.

The first draft wrote this as though a passing date were a verified date. It is a date that is **not
short**, which is a useful thing to know and a smaller thing than it sounds.

### 3.3 Duplicates — the August figures are a HISTORICAL SNAPSHOT, and a later read supersedes them

**The first draft reported the August numbers as the current condition. They are a dated observation,
and a more recent one exists.** An evidence file with no as-of date attached is the same mistake this
project has made before with publication state: a fact about one moment, carried forward as if it
were a standing property.

**2026-08-03 — HISTORICAL SNAPSHOT (A2-DATA).** An export analysed 12,882 rows → 6,500 unique keys;
**6,382 duplicate groups**, max 2 rows per key, over 2026-06-03 → 2026-07-30; all carrying an
identical `source_row_hash`. Measured downstream effect at the time: the 7-day Sales Trend (which sums
by date without dedup) was doubled for affected SKUs. Root cause was a Date-vs-string key comparison
that made `rolling_upsert` append instead of update (HOTFIX A).

**2026-08-03 — follow-up on the record (A3-PREP).** With the authorised tolerant-derived-field
refinement the same export reclassified to **0 CONFLICTING, 6,382 AUTO_ELIGIBLE, 0 BLOCKED**,
projected output 6,500. That dry-run is marked **PROVISIONAL** in the spec — it ran against the
earlier export, not a fresh post-deployment one — and execution readiness was **BLOCKED** on five
user-side Google-UI steps. HOTFIX A source was committed and recorded as **not yet deployed**.

**Latest Owner attachment — read-only result (supersedes the above for the destination sheet):**

| | |
|---|---|
| rows | **10,342** |
| valid unique keys | **9,989** |
| duplicate groups | **0** |
| conflicting groups | **0** |
| invalid date keys | **353** |
| — of which `snapshot_date` is **blank** | **353 — all of them** (Owner-stated, 2026-10-16) |

9,989 + 353 = 10,342 exactly: **every row is either a valid, unique key or an invalid date key, and
there are no duplicates among the valid ones.** The duplicate condition the August snapshot described
is **not present in this attachment**.

**The blank/unparseable split is ANSWERED for this attachment, and the earlier `UNKNOWN` is
withdrawn.** This contract and D-S8-B3-71 previously said it was unknown how many of the 353 were
blank versus present-but-unreadable, because that split decides how many of them the CP2S blank-date
skip (D-S8-B3-66) actually recovers. The Owner has stated it: **all 353 are blank.** In this
attachment the two categories are not a split at all — the wider category and the narrower one hold
the same rows, and the skip covers every one of them.

**This is a fact about this attachment and is not promoted into a standing property.** It is a
read-only export of the destination sheet at one moment. It does not state what the live sheet holds
now, it states nothing about BigQuery `Raw Daily Sales`, and it is not a reason to relax anything:
**CP2S still fails closed on a `snapshot_date` that is present and unreadable**, because a value
somebody wrote is not a value to skip, and the next export may well contain one.

**This is an attachment, not a BigQuery reading, and it is not treated as one.** It describes the
destination sheet as exported. It says nothing about `Raw Daily Sales`, and §4 keeps source and
destination completeness as separate questions for exactly this reason.

**No historical cleanup is requested.** It is also worth recording *why* the two observations can both
be true without anyone having run one: the affected range was **2026-06-03 → 2026-07-30**, and the
rolling retention window keeps the latest **90 completed days**, which as of 2026-10-15 begins around
**2026-07-17**. Most of the affected range has therefore aged out of the sheet on its own. That is one
plausible account among several (the fix may also have been deployed, or a cleanup run) and it is
**offered as an observation, not asserted as the explanation**.

**What a historical reader must still do**, unchanged by the good news: dedup by natural key before
summing, and treat a duplicate key as an `incomplete` signal rather than silently collapsing it.
A reader that is only correct while the data happens to be clean is not correct.

---

## 4. Authoritative evidence of month completeness

**A per-day `COUNT(*)` over the whole table is NOT sufficient, and this is not a style preference.**
A date can return a healthy row count while the specific SKU being averaged is absent from it, and a
date with few rows can be perfectly complete because few SKUs were listed. A count over the wrong
population answers a different question than the one the rule asks.

### 4.1 Three questions, not one — a correction to the first draft

The first draft ran these together under "month completeness". They have different authorities,
different evidence and different failure modes, and the per-date key-count comparison answers only
one and a half of them.

| | question | authority | what answers it |
|---|---|---|---|
| **Q1** | is the **raw source** complete for this month? | BigQuery `Raw Daily Sales` | a source-side completion signal — see §4.2. The destination can never answer this. |
| **Q2** | did the **import** land **as many distinct keys** as the source had? | source vs destination | `amazonReadDailyGapAware_`: per date, destination distinct-key **count** vs source. Already built. A **coverage** check — it catches a short date, and compares no key identities and no values (§3.2). |
| **Q3** | is **this SKU** missing data on this date? | the scope+SKU row set | an enumeration over `company+country+marketplace+sku`, not a table-wide total. |

**Why Q2 is not Q1.** A perfect import of an incomplete extract is complete by Q2 and wrong by Q1. The
gap-aware comparison proves the destination matches the source; it is silent on whether the source had
everything, because both sides are reading the same upstream.

**Why Q3 is not Q2 either.** A date can pass Q2 with a healthy key count while the specific SKU being
averaged is absent from it, and a date with few keys can be perfectly complete because few SKUs were
listed. **A count over the wrong population answers a different question than the one the rule asks.**

### 4.2 Confirmed zero vs missing — and the proof is not required to be a physical row

What the rule needs, per month, per `company+country+marketplace+sku`:

1. **every calendar date in the month is accounted for** for that scope+SKU — an enumeration, not a
   total (Q3);
2. **per date, destination distinct-natural-key count == source distinct-natural-key count** (Q2);
3. **zero duplicate natural keys** for that scope+SKU within the month (§3.3);
4. **"this SKU reported 0" told apart from "this SKU was not reported"**, because only the first
   belongs in the denominator.

**(4) does NOT require the source to emit a physical zero row, and the first draft was wrong to imply
it must.** "Every date must carry a row for every SKU" is **one** sufficient proof, not the only one.
A source that deliberately omits zero rows can still support (4), and this is the better design in
most reporting systems. **Three** ingredients make it provable, and all three are required:

- **a trustworthy source-completion signal** for the date — the source states that the date is
  finalised and fully extracted (a load-complete marker, a per-date manifest, a reconciliation total),
  rather than the reader inferring it from row presence; **and**
- **a stated omit-zero rule** — the source documents that a listed, active SKU with no sales on a
  complete date is **omitted** rather than zero-filled; **and**
- **evidence that THIS scope+SKU was within that day's reporting coverage** — that the report for
  that date was supposed to cover this `company+country+marketplace+sku` at all.

**The third was missing from the previous draft, and without it the other two do not reach the
conclusion.** "The date is complete" plus "zeros are omitted" licenses *"nothing absent from this date
sold"* — it does not license *"this SKU sold nothing"*, because a SKU that was delisted, not yet
launched, outside the report's scope, or belonging to another entity is **absent for a reason that
has nothing to do with sales**. Reading those absences as zeros puts days in the denominator that were
never in the numerator's universe, and the average is pulled toward zero by arithmetic rather than by
trade. This is the same population error as Q3 in §4.1, arriving one step later.

**Note what the third ingredient does NOT ask for.** It does not require a per-date listing snapshot,
and it does not prescribe the instrument — a listing/ASIN-status history, a per-date report-scope
manifest, or a stated rule such as "the daily report covers every SKU active in the account on that
date" would each satisfy it. The requirement is that the coverage be **stated by an authority**
rather than inferred by the reader from the rows it happens to see, which is the circularity this
section exists to break.

With all three, an absent row on a complete date is a **confirmed zero** by construction, and the
denominator is sound. **With any one missing, an absent row is `MISSING` and the month is
refused.**

**The default while nothing is proven is MISSING, and never 0.** That default is not softened by this
correction; what changes is that a workable alternative proof is now named instead of being excluded
by a rule this document had no standing to impose.

> **MISSING_OWNER_INPUT #3, restated — for `Raw Daily Sales`: (a) is there a per-date completion /
> finalisation signal; (b) is there a documented rule for whether a listed SKU with zero sales is
> emitted as a 0 row or omitted; and (c) what states which SKUs a given date's report was supposed to
> cover?** "Zero rows are always emitted" answers all three at once. Otherwise **(a) + (b) + (c)** are
> needed together. If that does not hold, an absent row stays `MISSING` and the affected months are
> refused — which will refuse a great many of them, and that is the correct outcome rather than a
> tuneable one.

**Retention is a separate, already-answered limit.** The Google Sheet `amazon_daily_sales_snapshot`
keeps a rolling **90 completed days** and prunes older rows (`retentionDays: 90`,
`amazonUpsertRollingSnapshot_`). **BigQuery keeps full history and is never pruned.** So the Sheet can
support an interval inside the last ~90 days and can never support last year's same month.
*(Noted, not acted on: the prose comment above config 4 still says "a rolling 30 completed days", and
`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` Draft v1.7 still says 30. `retentionDays: 90` is the code and
the code is the authority. The documents are stale.)*

---

## 5. Mapping campaign/event exclusion onto the same identity — ANSWERED

The frozen owner `KMCALC.normalizedAvgSalesPerDay` already defines this, and the interval rule must
reuse the matching, not re-implement it:

- **Campaign days** — a `campaign_sku_lines` row matches **only** by
  `marketplace_sku_id === scope.marketplaceSkuId`. **Never by Master SKU alone.** A line on the same
  Master SKU that carries no `marketplace_sku_id` is unresolved identity and the owner **throws**.
  Cancelled / inactive campaigns exclude nothing.
- **Event days** — `fc_special_events` matches on exact Master `sku`, then: when the event carries a
  `marketplace_id`, **only** an exact `marketplace_id` match is in scope and a mismatch may **never**
  fall back to the composite; the `company+country+marketplace` composite is the fallback **only**
  when the event has no `marketplace_id`.
- **Overlap** — the contaminated date set is a deduplicated set, so a date that is both a campaign
  day and an event day is excluded **once**.
- **Preparation windows are not excluded** — only actual selling days.

**And the failure mode is already decided (D-S8-B3-56, CP2R-R1): identity conflict or unreadable
exclusion source FAILS CLOSED with a named error.** It must never recompute without the filter —
that publishes a rate inflated by exactly the campaign days the rule exists to remove. The interval
mode inherits this unchanged.

**One difference the interval mode must NOT inherit:** the frozen owner's *ladder* (latest ≤30 normal
days in a 90-day window, `weekly_7d ÷ 7` below 3 normal days). The Owner's rule explicitly excludes
both. Only the **exclusion-date machinery** is reused; the aggregation is new.

---

## 6. Status summary

| # | question | status | as of |
|---|---|---|---|
| 1.2 | raw sales row → selling entity | **MISSING_OWNER_INPUT #1** — **DEFERRED TO PHASE 2 BY THE OWNER** (not resolved; §9) | 2026-10-21 |
| 1.2 | the DB identity model (`company` on `marketplaces` / `marketplace_skus`) | **OWNER-CONFIRMED, not re-opened** | standing |
| 1.3 | does `channel` separate companies | **ANSWERED: no** (observed constant `Amazon`) | 2026-08-03 |
| 1.4 | snapshot row → site identity | **ANSWERED** (via `marketplaces` / `marketplace_skus`) | standing |
| 2 | which platforms have a source | **ANSWERED: Amazon only, among the sources identified in this repository** — not a survey of the business | standing |
| 3.1 | zero vs missing in the row shape | **PARTLY** — depends on #3 | — |
| 3.3 | duplicates (destination sheet) | **ANSWERED: 0 duplicate groups, 0 conflicting**; the 6,382-group figure is a superseded **2026-08-03 snapshot** | latest Owner attachment |
| 3.3 | duplicates (BigQuery source) | **UNKNOWN** — no reading of `Raw Daily Sales` exists | — |
| 3.3 | of the attachment's 353 invalid date keys, how many are blank | **ANSWERED: all 353** (Owner-stated). Scoped to that attachment; the present-but-unreadable path still fails closed | 2026-10-16 |
| **Q1** | is the **raw source** complete for a month | **MISSING_OWNER_INPUT #3**, now three parts: completion signal **+** omit-zero rule **+** report-coverage evidence — **DEFERRED TO PHASE 2 BY THE OWNER** (not resolved; §9) | 2026-10-21 |
| display | how 0, null, a missing row and an unconnected source are shown | **CONFIRMED (Owner):** an explicit 0 shows 0; everything else stays a named missing state | 2026-10-21 |
| **Q2** | did the **import** land as many distinct keys as the source had | **ANSWERED: instrument exists** (`amazonReadDailyGapAware_`) — a **coverage** check only: no key identities, no values | standing |
| **Q3** | is **this SKU** missing on this date | **method ANSWERED**; the zero-vs-absent half depends on #3, which now has **three** parts (§4.2) | — |
| 5 | exclusion identity mapping | **ANSWERED** (frozen, reused) | standing |

**`MISSING_OWNER_INPUT #2 is withdrawn.** It asked whether the duplicate cleanup had run. The latest
attachment shows **0 duplicate groups and 0 conflicting groups** in the destination sheet, so the
question no longer gates anything, and **no historical cleanup is requested**. The August figures stay
on the record as a dated snapshot rather than being deleted.

### The Apps Script size budget, as it now stands

| | bytes | status |
|---|---|---|
| first gate | 4,600,000 | **historical** — on the record, no longer a question awaiting a decision |
| second gate | 4,610,000 | **historical** — Owner-approved (S8-B3-R3-CP2S-R1), D-S8-B3-74 |
| **current gate** | **4,630,000** | **Owner-approved** (S8-B3-R3-CP2V-R2), D-S8-B3-124 |
| measured at `d6651700` | 4,604,127 | headroom **5,873** against the gate of that day |
| measured at R53 | 4,629,739 | headroom **261** |

**The approval is scoped, and this document is outside it.** The +10,000 covers exactly three IR
items — the blank-date skip, the WAREHOUSE historical-average chain, and the diagnostic-field
propagation those two need. It is **not** a budget for an FC historical read path, and the 5,873 bytes
of headroom are not a licence to start spending one. The guards were not relaxed to make room: the
gate still fails if headroom is negative **or** above 200,000, the three never-retired modules are
still pinned by name, and a new assertion fails if the raise is ever anything other than exactly
10,000 — so the number cannot drift upward without another decision.

**Not yet produced, and deliberately so:** the draft byte increment for the FC path, the query shape,
the scanned-byte and execution ceilings, and the cache-invalidation design. Those become meaningful
once the entity mapping in §1.2 is known, because the mapping decides the query's shape and therefore its cost. **No
other module's size was used as a stand-in for a measurement of this one.**

---

## 7. Prepared while the contract is still open (CP2W)

**Status re-checked, not re-litigated: `MISSING_OWNER_INPUT #1` and `#3` are both still open**, so no
BigQuery and no historical API is reached by anything below. What exists now is the shape the answer
will be poured into:

| artifact | what it is |
|---|---|
| `assets/tests/_fc-historical-source-port.js` | the **interface** — request, row shape, per-month attestation, refusal names, and §4.2 encoded as `absentDateVerdict` |
| `assets/tests/_fc-historical-fixtures.js` | one **fixture per pending mode**, plus the five OPEN questions carried as data |
| `assets/tests/fc-historical-basis-port-and-fixtures-s8-b3-r3-cp2w.test.js` | 63 assertions, 6 mutants — the executable spec |

Three properties were deliberate. The port's **row shape is the one
`supply-planning-calculations.js` already requires**, so no translation layer stands between the
source and the identity rules. The **exclusion set is executed, not copied** — the suite obtains it
by calling the frozen owner. And the **`EMITS_ZERO` branch is refused rather than assumed**, because
§4.2 does not say what an absent row means for the denominator under that rule; that is part of #3.

**Not claimed:** nothing is implemented, nothing is connected, and no byte was added to the Apps
Script load surface. The budget position in §6 is unchanged, and D-S8-B3-62's conclusion stands — the
interval mode still needs a server-side owner that the current gate has no room for.

---

## 8. Re-confirmed during FX1-R4-R1 (2026-10-21) — read-only, nothing connected

**Status re-checked, not re-litigated.** `MISSING_OWNER_INPUT #1` (raw sales row → selling entity) and
`#3` (completion signal + omit-zero rule + report coverage) are **both still open**. No file named in §7
changed since CP2W except through unrelated IR performance rounds, no BigQuery was queried and **no
historical API was added**.

**The budget table in §6 is now historical, and the position it describes is tighter, not looser.**

| | bytes | status |
|---|---|---|
| current gate | **4,668,000** | Owner-approved (FX1-R4), spent on the four FX files |
| measured at R55 | **4,666,841** | headroom **1,159** |

That +38,000 is scoped to the FX Rate Book exactly as the +10,000 before it was scoped to IR. It is not
a budget for an FC historical read path, and 1,159 bytes could not hold one. D-S8-B3-62's conclusion
stands: the interval mode needs a server-side owner, and placing one needs its own size decision.

---

## 9. The Owner's phase split (FC1-R1, 2026-10-21)

**Phase 1 connects no historical source.** No history API, no BigQuery query, no GS budget request for a
history read, no empty production table and no back-filled empty rows. What phase 1 delivers is in
`FC_HISTORY_ACHIEVEMENT_PHASE1_CONTRACT.md`: the month views, the two history-based builder methods in a
named not-computable state, and the row contract phase 2 must satisfy.

| item | status after the split |
|---|---|
| `MISSING_OWNER_INPUT #1` — raw sales row → selling entity | **DEFERRED TO PHASE 2 BY THE OWNER.** Not resolved, and not to be reported as resolved. |
| `MISSING_OWNER_INPUT #3` — completion signal + omit-zero rule + coverage | **DEFERRED TO PHASE 2 BY THE OWNER.** Not resolved, and not to be reported as resolved. |
| display of 0 / null / missing / unconnected | **CONFIRMED (Owner).** An explicit 0 shows 0. null, a missing row and an unconnected source stay missing, by name. |
| designated source for monthly Actual and achievement | **`fc_achievement_monthly`** (Owner). Its grain is the FC upsert key plus a month. |

**The phase-2 entry check, kept short so it can actually be run.** Read-only, by someone with access to
the BigQuery project. Nothing below is authorised by this document:

1. **#1:** list the columns of `Raw Daily Sales` (the table schema, not the import's field map) and say
   whether any of them is a seller, merchant, account or store id. If none, say whether each account
   writes to its own table or dataset.
2. **#3(a):** name the field or job that marks a report date as final, if one exists.
3. **#3(b):** for one SKU that is known to have sold nothing on one date, does that date have a row with
   units 0, or no row?
4. **#3(c):** for that same date, what states which SKUs the report was supposed to cover?

Answer 3 = "a 0 row" settles #3(b) and, with 2 and 4, makes a month provable. Answer 3 = "no row" means a
missing day stays MISSING and the month is refused, exactly as §4.2 already says.

**The GS position does not move.** The +38,000 approved for FX is spent on FX; 1,159 bytes remain. A
history read path needs its own size decision in phase 2 and borrows nothing from this one.
