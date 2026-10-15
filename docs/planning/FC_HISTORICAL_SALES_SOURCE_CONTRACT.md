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

**The only source that could satisfy the rule is BigQuery `Raw Daily Sales`, and the one thing still
open is how a row in it maps to a SELLING ENTITY.** That is a mapping question with three ordinary
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

## 2. Which platforms actually have a source — ANSWERED

`06_amazon_import_config.gs` defines **four** import configs and **all four are Amazon**:
`amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_weekly_sales_snapshot`,
`amazon_daily_sales_snapshot`. Both sales configs carry `fixedValues: { marketplace: 'Amazon' }`.

| platform | daily sales source | verdict |
|---|---|---|
| **Amazon** | BQ `Raw Daily Sales` → `amazon_daily_sales_snapshot` | the only supported platform |
| Walmart, Shopify, Target | none | **UNSUPPORTED** |
| any other marketplace in `marketplaces` | none | **UNSUPPORTED** |

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

9,989 + 353 = 10,342 exactly: **every row is either a valid, unique key or an invalid date key, and
there are no duplicates among the valid ones.** The duplicate condition the August snapshot described
is **not present in this attachment**.

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
| **Q2** | did the **import** land everything the source had? | source vs destination | `amazonReadDailyGapAware_`: per date, destination distinct-key count vs source. This is the part that is already built. |
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
most reporting systems. Two ingredients make it provable:

- **a trustworthy source-completion signal** for the date — the source states that the date is
  finalised and fully extracted (a load-complete marker, a per-date manifest, a reconciliation total),
  rather than the reader inferring it from row presence; **and**
- **a stated omit-zero rule** — the source documents that a listed, active SKU with no sales on a
  complete date is **omitted** rather than zero-filled.

With both, an absent row on a complete date is a **confirmed zero** by construction, and the
denominator is sound. With either missing, an absent row is **MISSING** and the month is refused.

**The default while nothing is proven is MISSING, and never 0.** That default is not softened by this
correction; what changes is that a workable alternative proof is now named instead of being excluded
by a rule this document had no standing to impose.

> **MISSING_OWNER_INPUT #3, restated — for `Raw Daily Sales`, (a) is there a per-date completion /
> finalisation signal, and (b) is there a documented rule for whether a listed SKU with zero sales is
> emitted as a 0 row or omitted?** Either "zero rows are emitted" or "(a) + (b) both exist" is enough.
> If neither holds, an absent row stays `MISSING` and the affected months are refused — which will
> refuse a great many of them, and that is the correct outcome rather than a tuneable one.

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
| 1.2 | raw sales row → selling entity | **MISSING_OWNER_INPUT #1** — the one open mapping | — |
| 1.2 | the DB identity model (`company` on `marketplaces` / `marketplace_skus`) | **OWNER-CONFIRMED, not re-opened** | standing |
| 1.3 | does `channel` separate companies | **ANSWERED: no** (observed constant `Amazon`) | 2026-08-03 |
| 1.4 | snapshot row → site identity | **ANSWERED** (via `marketplaces` / `marketplace_skus`) | standing |
| 2 | which platforms have a source | **ANSWERED: Amazon only** | standing |
| 3.1 | zero vs missing in the row shape | **PARTLY** — depends on #3 | — |
| 3.3 | duplicates (destination sheet) | **ANSWERED: 0 duplicate groups, 0 conflicting**; the 6,382-group figure is a superseded **2026-08-03 snapshot** | latest Owner attachment |
| 3.3 | duplicates (BigQuery source) | **UNKNOWN** — no reading of `Raw Daily Sales` exists | — |
| **Q1** | is the **raw source** complete for a month | **MISSING_OWNER_INPUT #3** (completion signal) | — |
| **Q2** | did the **import** land what the source had | **ANSWERED: instrument exists** (`amazonReadDailyGapAware_`) | standing |
| **Q3** | is **this SKU** missing on this date | **method ANSWERED**; the zero-vs-absent half depends on #3 | — |
| 5 | exclusion identity mapping | **ANSWERED** (frozen, reused) | standing |

**`MISSING_OWNER_INPUT #2 is withdrawn.** It asked whether the duplicate cleanup had run. The latest
attachment shows **0 duplicate groups and 0 conflicting groups** in the destination sheet, so the
question no longer gates anything, and **no historical cleanup is requested**. The August figures stay
on the record as a dated snapshot rather than being deleted.

**Not yet produced, and deliberately so:** the draft byte increment, the query shape, the scanned-byte
and execution ceilings, and the cache-invalidation design. Those become meaningful once the entity
mapping in §1.2 is known, because the mapping decides the query's shape and therefore its cost. **No
other module's size was used as a stand-in for a measurement of this one.**
