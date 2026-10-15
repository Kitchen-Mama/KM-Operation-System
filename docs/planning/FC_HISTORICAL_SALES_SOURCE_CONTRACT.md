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

**The only source that could satisfy the rule is BigQuery `Raw Daily Sales`, and this repository
cannot show how a row in it resolves to a COMPANY.** Everything else in this document is detail
underneath that sentence. Two of the five questions below are answerable from the repository; three
are `MISSING_OWNER_INPUT`.

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

That assumption is **unverified by data and unverifiable from this repository**, and the FC Builder
is exactly where it would fail if it is false: its scope is `company|country|marketplace`, and KM and
ResUS both operate US/Amazon.

> **MISSING_OWNER_INPUT #1 — does `Raw Daily Sales` contain rows for more than one selling entity,
> and if so which column separates them?** Three shapes are possible and they are not
> distinguishable from here: (a) one BQ table per Amazon account, so the table name itself is the
> company; (b) one table with an unmapped seller/account column that the import simply does not
> select; (c) one table that genuinely cannot separate them. **(c) means the interval feature cannot
> be built correctly for any country where two companies share a marketplace, at any budget.**

### 1.3 `channel` is not the answer — evidence, not assumption

`channel` is the only dimension in the key whose meaning is otherwise unexplained. The 2026-08-03
real-data dry-run recorded in `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` analysed a production export
of 12,882 rows spanning 58 days, 9 countries and 96 SKUs, and reports **`channel=Amazon`** for all of
them — a single constant. **`channel` did not separate anything in the observed data**, and nothing
in the repository documents a second permitted value.

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

### 3.3 Duplicates are a live, measured condition — ANSWERED, and it is bad

The same 2026-08-03 dry-run: **12,882 rows → 6,500 unique keys; 6,382 duplicate groups; max 2 rows
per key**, over 2026-06-03 → 2026-07-30. All 6,382 groups carry an **identical `source_row_hash`**.
Measured downstream effect: the 7-day Sales Trend (which sums by date without dedup) was **doubled**
for affected SKUs.

**The spec records that this migration `remains unexecuted; no live rows changed`.** So unless the
Owner has run it since, **a naive SUM over the daily snapshot can still double a month's units.** Any
historical reader must dedup by natural key before summing, and must treat a duplicate key as an
`incomplete` signal rather than silently collapsing it.

> **MISSING_OWNER_INPUT #2 — has the duplicate cleanup been executed in production, and were the 243
> `CONFLICTING_FACTS` groups resolved?** Until answered, assume duplicates are present.

---

## 4. Authoritative evidence of month completeness

**A per-day `COUNT(*)` over the whole table is NOT sufficient, and this is not a style preference.**
A date can return a healthy row count while the specific SKU being averaged is absent from it, and a
date with few rows can be perfectly complete because few SKUs were listed. A count over the wrong
population answers a different question than the one the rule asks.

What the rule needs, per month, per `company+country+marketplace+sku`:

1. **every calendar date in the month is present** in the source for that scope+SKU — an enumeration,
   not a total;
2. **per date, destination distinct-natural-key count == source distinct-natural-key count** (§3.2's
   existing `incomplete` test), so a partially-written date is not read as a low-sales day;
3. **zero duplicate natural keys** for that scope+SKU within the month (§3.3);
4. **and the distinction between "this SKU reported 0" and "this SKU was not reported"** is carried
   per date, because only the first belongs in the denominator.

(1)–(3) are computable with the existing instruments **against the BigQuery source**. (4) depends on
`MISSING_OWNER_INPUT #3`.

> **MISSING_OWNER_INPUT #3 — does `Raw Daily Sales` emit an explicit zero row for a listed SKU with
> no sales that day, or does it omit the row entirely?** If it omits, then "confirmed zero" is **not
> derivable from the sales table alone** and needs a second authority for "was this SKU listed and
> active on this date" (a listing/ASIN-status history). This repository contains no such history.
> **If this is unanswerable, the rule's "已確認零銷量的正常日計入分母" cannot be honoured**, and the
> only safe behaviour is to treat an absent row as `MISSING` and refuse the month — which will refuse
> a great many months.

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

| # | question | status |
|---|---|---|
| 1.2 | BQ row → company | **MISSING_OWNER_INPUT #1** — blocking |
| 1.3 | does `channel` separate companies | **ANSWERED: no** (observed constant `Amazon`) |
| 1.4 | BQ row → site identity | **ANSWERED** (via `marketplaces` / `marketplace_skus`) |
| 2 | which platforms have a source | **ANSWERED: Amazon only** |
| 3.1 | zero vs missing in the row shape | **PARTLY** — depends on #3 |
| 3.3 | duplicates | **ANSWERED: present and measured**; cleanup status is **MISSING_OWNER_INPUT #2** |
| 4 | month completeness evidence | **ANSWERED for the method**; (4) depends on **MISSING_OWNER_INPUT #3** |
| 5 | exclusion identity mapping | **ANSWERED** (frozen, reused) |

**Not yet produced, and deliberately so:** the draft byte increment, the query shape, the scanned-byte
and execution ceilings, and the cache-invalidation design. Those are only meaningful once #1 is
answered — if `Raw Daily Sales` cannot separate companies, there is no query to size. **No other
module's size was used as a stand-in for a measurement of this one.**
