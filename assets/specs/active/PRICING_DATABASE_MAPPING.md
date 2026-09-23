# Pricing Database Mapping — Inventory Replenishment Add / Import SKU

**Last Updated:** 2026-06-08
**Maintained By:** Development Team
**Document Purpose:** Focused data-mapping spec for the Inventory Replenishment **Add SKU / Import SKU** flow — defining how a `marketplace_skus` row creates or updates `pricing_list`, `pricing_change_log`, and `fc_regular_forecast`.

**Status:** Specification / Planning for the Add / Import flow; the **write and audit half is IMPLEMENTED** as of PRICING-R2 (see §4A / §5).
**Source of Truth (architecture):** `SKU_MASTER_FLOW.md`

---

## 1. Purpose

This document defines the data mapping and record-creation rules for the Inventory Replenishment Add / Import flow. It specifies:

- How `marketplace_skus` rows are added or imported.
- How `pricing_list` rows are auto-generated from a `marketplace_skus` row.
- How `pricing_change_log` audits subsequent pricing changes.
- How an `fc_regular_forecast` base row is created.

It is intended to be the implementation reference for Inventory Replenishment import, so that build work can proceed with minimal ambiguity (and minimal credit usage). It does not contain code.

---

## 2. Source Tables

Input / source tables referenced by this flow:

| Table | Role in this flow |
|-------|-------------------|
| `sku_details` | Master SKU validation + source of `category`, `series`, and base pricing inputs. |
| `marketplace_skus` | The operational anchor created/updated by Add/Import; drives all downstream rows. |
| `pricing_list` | Auto-created pricing row (one per `marketplace_sku_id`); sole source of truth for prices. |
| `pricing_change_log` | Field-level audit of pricing changes. |
| `fc_regular_forecast` | FC Summary base row (one per year × company × country × marketplace × sku). |

---

## 3. marketplace_skus Required Columns

| Column | Notes |
|--------|-------|
| `marketplace_sku_id` | Primary identity. |
| `sku` | FK to `sku_details.sku`. |
| `company` | Operational ownership (see below). |
| `country` | |
| `marketplace` | |
| `site_sku` | |
| `asin` | |
| `currency` | Site currency / helper field only (see below). |
| `marketplace_sku_status` | active / phasing_out / inactive / discontinued. |
| `replenishment_model` | sales_driven / forecast_driven. |
| `launch_date` | |
| `created_at` | |
| `updated_at` | |

**Important:**
- `company` belongs in `marketplace_skus` because operational ownership may vary by country / marketplace (the same master SKU can be operated by different companies across sites).
- `marketplace_skus` must **not** be the pricing source of truth.
- `currency` may be kept **only** as a site currency / helper field for MVP. Pricing **values** (Regular / Minimum / MSRP) must live in `pricing_list`, never in `marketplace_skus`.

---

## 4. pricing_list Mapping Rules

Create **one** `pricing_list` row per `marketplace_sku_id`.

**Columns:**
```
pricing_id, marketplace_sku_id,
sku, country, marketplace, site_sku, asin,
currency,
base_currency, base_regular_price, base_minimum_price, base_msrp,
fx_rate, fx_rate_date,
auto_regular_price, auto_minimum_price, auto_msrp,
regular_price, minimum_price, msrp,
regular_price_is_manual, minimum_price_is_manual, msrp_is_manual,
price_source, price_status,
created_by, created_at, updated_by, updated_at, note
```

**Mapping rules:**

| Target column | Source / rule |
|---------------|---------------|
| `marketplace_sku_id` | ← `marketplace_skus.marketplace_sku_id` |
| `sku` | ← `marketplace_skus.sku` |
| `company` | *Not required in `pricing_list`* unless explicitly needed later. |
| `country` | ← `marketplace_skus.country` |
| `marketplace` | ← `marketplace_skus.marketplace` |
| `site_sku` | ← `marketplace_skus.site_sku` |
| `asin` | ← `marketplace_skus.asin` |
| `currency` | ← `marketplace_skus.currency` |
| `base_currency`, `base_regular_price`, `base_minimum_price`, `base_msrp` | From `sku_details` or user / import input. |
| `fx_rate`, `fx_rate_date` | Stored if FX conversion is used. |
| `auto_regular_price`, `auto_minimum_price`, `auto_msrp` | System-calculated = `base_*` × `fx_rate`. |
| `regular_price`, `minimum_price`, `msrp` | Final effective values. |
| `regular_price_is_manual`, `minimum_price_is_manual`, `msrp_is_manual` | **PRICING-R2 §4A.** Field-level ownership. `TRUE` = the operator owns it and FX must preserve it; `FALSE` = the system owns it and it must equal the current auto value; **BLANK = nobody has said**, which is not `FALSE`. |
| `price_source` | **LEGACY / DESCRIPTIVE ONLY since PRICING-R2.** `auto_fx` / `manual_override` / `import`. Kept in step by the writer, never consulted to decide who owns a field. |
| `price_status` | Default `draft` or `active` — **default to be confirmed** (system convention unclear). |
| `created_by`, `created_at`, `updated_by`, `updated_at`, `note` | Audit / freeform. |

---

## 4A. Field-Level Manual Price Authority (PRICING-R2)

**Owner:** `73_api_v1_pricing_write.gs` · **Action:** `pricing.update` · **UI:** SKU Regional Details.

### Why it is per FIELD

`price_source` is ONE value for a WHOLE ROW. A row whose Regular was negotiated by a person and whose MSRP
has never been anything but the converted base price has no honest value to put in it: pick
`manual_override` and FX can never refresh the MSRP; pick `auto_fx` and the next refresh silently destroys
the negotiated Regular. A row-level answer to a field-level question loses data either way. The three flags
are **independent** — `regular_price_is_manual = TRUE` with `msrp_is_manual = FALSE` is valid and expected.

### Three states, and the third one is the point

| Flag | Meaning | FX reconciliation may… |
|------|---------|------------------------|
| `TRUE` | the operator owns this field | **never** touch it |
| `FALSE` | the system owns it; it must equal the current auto value | refresh it |
| *blank* | **NOBODY HAS SAID** | **never** touch it |

Every `pricing_list` row alive today has blank flags, because the columns did not exist before PRICING-R2.
Reading blank as `FALSE` would declare, in one deployment and with no operator ever asked, that the entire
price book is system-owned and overwritable. That is the bulk classification PRICING-R2 §10 forbids, arriving
disguised as a default — so blank is `UNKNOWN`, and it is counted rather than guessed.

### The effective-price contract is UNCHANGED

`regular_price` / `minimum_price` / `msrp` remain the values every consumer reads — FC Summary, Pricing
Center, Product Strategy, the campaign snapshot. **No consumer reads `auto_*`, no consumer gains a fallback,
and no consumer was cut over.** The flags decide who MAINTAINS the final three fields; they never sit between
a reader and a price. The writer maintains the invariant:

```
if <field>_is_manual == FALSE:  <field> = auto_<field>
if <field>_is_manual == TRUE :  <field> is preserved
if <field>_is_manual is blank:  nothing is written
```

### Per-field modes accepted by `pricing.update` and by the template

| Mode | Effect |
|------|--------|
| `NO_CHANGE` | nothing. **A blank mode cell is NO_CHANGE** — blank never means delete and never means AUTO. |
| `MANUAL` | requires a finite, non-negative number. Sets the effective field and `*_is_manual = TRUE`. |
| `AUTO` | **ignores any supplied value.** Sets `*_is_manual = FALSE` and restores the effective field from `auto_*`. |

**Refused rather than guessed**, each refusal failing the ENTIRE batch before a cell is written: `MANUAL`
with a blank or `NA` price; `AUTO` when `auto_*` is blank or `NA` (a value that does not exist cannot be
restored, and writing 0 there would be a price); a manual price carrying more decimals than §11 allows its
currency; a currency disagreeing with the row's own; an unknown `marketplace_sku_id`; the same identity
twice in one file.

### FX storage precision (frozen; applied by PRICING-R3, never used to round an operator's number)

| Currency | Decimals |
|----------|----------|
| USD, CAD, EUR, GBP, AUD | 2 |
| JPY, KRW, TWD | 0 |

Mathematical precision only. **No .99 / .95 psychological pricing in FX conversion** — a price point is a
commercial decision made per marketplace by a person, and burying one in a conversion would make every
converted price a commercial claim nobody approved.

### 4B. FX reconciliation — `pricing.fxReconcile` (PRICING-R3)

The same owner (`73_`), a second action, and **no new column**: every field it reads and writes —
`base_currency`, `base_regular_price`, `base_minimum_price`, `base_msrp`, `currency`, `fx_rate`,
`fx_rate_date`, `auto_*` — has been part of the `pricing_list` header since `04_` first created a pricing
row. R3 adds nothing to the schema; it gives `auto_*` an owner.

**Direction, frozen:**

```
LOCAL = BASE × FX_RATE          FX_RATE means: 1 unit of base_currency = X units of local currency
```

USD → CAD at 1.35 means USD 1 = CAD 1.35. The reciprocal is the one arithmetic error that produces a
plausible number rather than an obvious one — $29.99 would become $22.21 and nothing about the result would
look wrong — so the direction is part of the rate's identity, and a `USD>CAD` rate never answers a `CAD>USD`
row.

**What a run may and may not touch:**

| Column | FX reconciliation | Why |
|--------|-------------------|-----|
| `auto_regular_price` / `auto_minimum_price` / `auto_msrp` | **always refreshed** | the SYSTEM REFERENCE value — what the base price converts to today. It carries no ownership claim, so it is refreshed even for a field a person owns: an operator comparing a negotiated price against a stale reference is comparing against nothing. |
| `regular_price` / `minimum_price` / `msrp` | **only where that field's own flag says `AUTO`** | `TRUE` is a person's price. **BLANK is nobody's statement**, and §4A forbids turning one into a statement. Both are left exactly as found. |
| `regular_price_is_manual` / `minimum_price_is_manual` / `msrp_is_manual` | **never written** | *AUTO_REFERENCE_REFRESH is not AUTHORITY_CLASSIFICATION.* Refreshing what the system thinks a price WOULD be says nothing about who owns what it IS, and a run that wrote `FALSE` into every blank flag would classify the entire price book in one call. |
| `fx_rate` / `fx_rate_date` | recorded on every **converted** row | "this row was reconciled on this date at this rate" is a different fact from "this row's price changed", and an auditor needs the first even when the second did not happen. |

**Rates are an INPUT, never a constant.** There is no FX provider in this repository and no FX rate table in
the database (§10). The rates for a run arrive with the request, each carrying `source` and `as_of`, and are
recorded on every row and every log line they touch. A rate compiled into a source file would be a business
fact frozen into a deployment — correct on the day it was written and wrong every day after.

**Rate-input template** — one row per pair the table actually needs. Same-currency pairs are never listed,
because an identity needs no rate, no provider and no network:

```
base_currency, quote_currency, rate, source, as_of
USD,           CAD,            ____, ______, YYYY-MM-DD
```

A refusal hands this list back, so the operator's next step is filling in a template rather than guessing
which currencies are live.

**Refused rather than guessed** — the whole run, before a cell is written: no rates at all (it never re-uses
a previous run's); a rate with no `source`; a rate with no `as_of`; a non-numeric rate; a rate ≤ 0; a
same-currency pair at anything but 1; one pair supplied twice; a missing `run_date`. A refused rate table
indexes **nothing**, so a partial table can never be applied.

**Skipped rather than converted** — per row, each with a reason: unknown or missing `currency`; missing
`base_currency`; a currency outside the frozen precision table below; a pair whose rate was not supplied; a
duplicated `marketplace_sku_id` — **both** rows, because converting the first would hide the duplicate.
There is no half-converted row.

**A missing base price writes nothing for that field.** Converting a blank produces `null` and never `0`;
what the writer then does with that `null` is leave the field alone. Blanking an `auto_*` would, for a field
whose flag says `AUTO`, delete the live price that field is currently serving — and an empty cell is not an
instruction to delete a price.

**Dry run is the default.** Anything other than an explicit `dry_run: false` plans the whole table and
writes nothing. This is the one action that can touch every row, so the failure mode of a forgotten
parameter must be "counted nothing", never "repriced everything".

**Cost.** One whole-sheet read, then one range write per COLUMN. The number of spreadsheet calls scales with
the column count — a constant — not with the number of SKUs: 500 rows cost the same as 1. Writing a whole
column means writing back rows the run did not change, so before anything is sent, every cell of the three
effective columns is re-checked **against the flag as it stands in the sheet** rather than against the plan
that produced it. One mismatch refuses the entire run.

### Provisioning

Under RULE S0-2 the writer VALIDATES and fails closed; it never creates a sheet and never appends a column.
The three flag columns are an **operator migration**. Until they exist, `pricing.update` and
`pricing.fxReconcile` both refuse with `MISSING_REQUIRED_HEADER` having written nothing.

Provisioning alone is **not enough**, and that was measured on the live sheet rather than assumed:
`prodRequireSheet_` compares the first `expected.length` positions **in order**, so a sheet holding every
required column can still refuse every write with `HEADER_ORDER_MISMATCH`. Both pricing tables are in that
state today. The repair is `TEMP_PRICING_R2_SCHEMA_RECONCILE.gs`, which fixes the order and provisions in
one reviewed operation, for both tables, with a PRE snapshot pair and a rollback.

---

## 5. pricing_change_log Rules

- `pricing_change_log` is only required when an **existing** `pricing_list` value changes.
- Initial auto-created `pricing_list` rows do **not** need per-field log entries, unless a future audit policy requires it.
- **Manual edits** to pricing must create log rows.

**Columns:**
```
log_id, pricing_id, field_name,
old_value, new_value,
change_type,
changed_by, changed_at, change_reason
```

### Live shape (measured 2026-09-23, not specified)

The production sheet carries **15 columns**: the 9 canonical ones plus six contextual extensions, and its
primary key is spelled `pricing_log_id`. It holds **0 rows** — nothing has ever been written to it, because
`prodRequireSheet_` has refused the sheet on every attempt.

| Live column | Status |
|---|---|
| `pricing_log_id` | **renamed to `log_id`** by the R2 order reconciliation — see below |
| `sku`, `country`, `marketplace`, `old_currency`, `new_currency`, `source` | **extensions**, preserved to the RIGHT of the canonical 9 |
| the other 8 | canonical, reordered into canonical positions |

`pricing_log_id` → `log_id` is a **declared** rename, audited before it was written down: the live name
appears nowhere in this repository — no writer, no reader, no test, no spec — while every consumer of this
table's key reads `log_id` **by name** (`02_core_sheet_db.gs` filters on `r.log_id`, the browser normalizer
reads `r.log_id`, and `73_` **mints** `log_id`). With 0 rows there is no value whose meaning could be
re-assigned. The six extensions are read by nothing and are kept anyway: a column nobody reads is still a
column somebody made.

`change_type` (PRICING-R2) is one of:

| Value | Written when |
|-------|--------------|
| `MANUAL_SET` | a person set the field and took ownership of it |
| `RETURN_TO_AUTO` | a person handed the field back to the system and it was restored from `auto_*` |
| `AUTO_FX_REFRESH` | an FX reconciliation refreshed a system-owned field (PRICING-R3) |

`change_reason` stays free text. Free text cannot be counted, filtered or relied on by a later round;
`change_type` can. **This log is audit history, never runtime authority** — nothing infers ownership by
scanning it, and the three flags on the row remain the only thing that decides who owns a field.
**An FX reconciliation (PRICING-R3)** writes one `AUTO_FX_REFRESH` row per field whose value actually moved
— the `auto_*` that changed, and the effective field if it followed — and **nothing for a cell that did not
change**. A run that moves no price writes no audit at all. Its `change_reason` carries the provenance
needed to reconstruct the run without joining anything else:

```
FX <run_date> <BASE>><QUOTE> @<rate> src=<source> as_of=<as_of>
```

---

## 6. fc_regular_forecast Base Row Rules

Create **one** base row per: `year` × `company` × `country` × `marketplace` × `sku`.

**Columns:**
```
forecast_id, year, company, country, marketplace, sku,
category, series,
jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec,
total_fc, fc_share, forecast_status, source,
created_at, updated_at
```

**Mapping:**

| Target column | Source / rule |
|---------------|---------------|
| `company` | ← `marketplace_skus.company` |
| `country` | ← `marketplace_skus.country` |
| `marketplace` | ← `marketplace_skus.marketplace` |
| `sku` | ← `marketplace_skus.sku` |
| `category` | ← `sku_details.category` |
| `series` | ← `sku_details.series` |
| `jan`–`dec` | ← 0 |
| `total_fc` | ← 0 |
| `fc_share` | ← blank or 0 |
| `forecast_status` | `draft` or `active` — **default to be confirmed**. |
| `source` | ← `system_auto` |
| `year` | ← current planning year, or user / import selected year. |

---

## 7. Add SKU Flow

When the user adds one SKU from Inventory Replenishment:

1. Validate `sku` exists in `sku_details`.
2. Validate the `company` + `country` + `marketplace` + `sku` combination is not duplicated.
3. Create `marketplace_skus` row.
4. Auto-create `pricing_list` row.
5. Auto-create `fc_regular_forecast` base row.
6. Do **not** create a Factory Stock row.
7. Do **not** create a Request Order placeholder row.

---

## 8. Import SKU Flow

When the user imports a `marketplace_skus` template:

1. Validate required columns.
2. Validate each `sku` exists in `sku_details`.
3. Upsert `marketplace_skus` by `marketplace_sku_id` if present, otherwise by `company` + `country` + `marketplace` + `sku`.
4. For **new** `marketplace_skus` rows:
   - Create `pricing_list` if missing.
   - Create `fc_regular_forecast` base row if missing.
5. For **existing** `marketplace_skus` rows:
   - Update allowed marketplace fields.
   - Do **not** overwrite manual pricing unless explicitly requested.
   - Do **not** overwrite existing forecast values.
6. Return a row-level success / error report.

---

## 9. Duplicate / Upsert Rules

Uniqueness keys:

| Table | Unique key |
|-------|-----------|
| `marketplace_skus` | `company` + `country` + `marketplace` + `sku` |
| `pricing_list` | `marketplace_sku_id` |
| `fc_regular_forecast` | `year` + `company` + `country` + `marketplace` + `sku` |

---

## 10. Non-Goals

This spec explicitly does **not** cover, and the flow must **not** do, the following:

- No Factory Stock creation from Inventory Replenishment.
- No Request Order placeholder rows.
- No pricing values stored in `marketplace_skus`.
- No separate FX DB table for MVP.
- No promotion pricing in `pricing_list`.
- No code implementation in this spec.

---

## 11. Open Decisions

| # | Decision |
|---|----------|
| 1 | `price_status` default: `draft` or `active`. |
| 2 | `forecast_status` default: `draft` or `active`. |
| 3 | Whether `marketplace_skus.currency` remains as a helper field or moves fully to `pricing_list` later. |
| 4 | ~~Whether FX rate is manually provided or fetched by system / API.~~ **Answered by PRICING-R3: manually provided, per run, with `source` and `as_of` recorded on every row and log line it touches.** A fetched rate remains possible later; what R3 fixes is that a rate must carry its provenance, wherever it came from. |

---

**End of Document**
