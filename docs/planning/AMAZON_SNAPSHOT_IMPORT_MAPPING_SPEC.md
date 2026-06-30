# Amazon Snapshot Import — Mapping Reference Spec

**Status:** 🟡 Draft v1.6 — Mapping + import-governance reference spec only (NO DB migration, NO BigQuery, NO API, NO frontend, NO routes)
**Last Updated:** 2026-06-29
**Maintained By:** Development Team
**Audience:** developers building the config-driven importer · OP / data stakeholders
**Cross-reference (context only, not edited here):** [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) (Inventory Layer notes a *future* `amazon_inventory_snapshot`).

> **Spec only.** This document records the **finalized mapping rules** for importing Amazon snapshot data into the Operation System DB Google Sheet, **plus the import-governance rules** around those imports. It introduces **no** code, Apps Script, DB schema/migration, API, or frontend change. It is the authoritative reference for the **next** task: refactoring Apps Script into a **config-driven importer**. The config blocks in §7 and the Appendix (§21) are the **source of truth** and are reproduced verbatim.

### Changelog

- **Draft v1.6 (2026-06-29)** — **Amazon Daily Sales window 7 → 30 completed days (excludes today).** Updated config 4 (§7.4) + the BigQuery rolling-window rule (§4) + Appendix verbatim config to `lookbackDays: 30`, `excludeToday: true`. The 30-day snapshot now serves **both** the Sales Trend 7-day display and the Normalized Avg Sales 30-day calculation (`SUPPLY_PLANNING_CALCULATION_RULES.md` §22). **No new `amazon_daily_sales_snapshot` column and no BigQuery table schema change** — window length only. Applies to `06_amazon_import_config.gs`.
- **Draft v1.5 (2026-06-29)** — **Optional source headers (`optionalFieldMap`) bug fix.** Added `optionalFieldMap` behavior (§9.1): header validation checks **only** `fieldMap`; optional headers map-if-present else blank and never raise `missing_required_header`. Reworked **Amazon Inventory Health** config (§7.2): age buckets that vary by report version (`inv_age_0_to_90_days`, `inv_age_365_plus_days`, `inv_age_366_to_455_days`, `inv_age_456_plus_days`) moved to `optionalFieldMap`; required `fieldMap` keeps Date/Country/SKU/ASIN/Available + the 61–90 / 91–180 / 181–270 / 271–365 buckets; `rowHashFields` extended to all required + optional buckets. Documented the destination-header naming reminder (`inv_age_456_plus_days`, underscored — not `inv-age-456-plus-days`). Applies to `06_amazon_import_config.gs` + `07_amazon_import_runner.gs` (importer code; spec is the reference).

- **Draft v1.4 (2026-06-26)** — **DB header requirements ahead of the Apps Script refactor.** Added importer-generated **destination headers**: `amazon_daily_sales_snapshot` gains `data_window_start_date`, `data_window_end_date`, `latest_source_date`, `is_fallback_used`, `fallback_reason`, `data_age_days` (§7.4); `amazon_inventory_snapshot` gains `total_days_of_supply_including_open_shipments_is_capped`, `days_of_supply_amazon_fulfillment_network_is_capped` (§7.1). Added 8 governance fields to `import_sync_runs` (§16): `latest_source_date`, `data_window_start_date`, `data_window_end_date`, `is_fallback_used`, `fallback_group_count`, `normalized_placeholder_count`, `data_age_days`, `quality_note`. Clarified **capping** (§10): `365+` writes numeric `365` **and** sets the companion `*_is_capped = TRUE`; exact values → `*_is_capped = FALSE`/blank; `/` and blank numeric → null; known placeholders create **no** `import_sync_issues`. **The four config blocks (§7, §27) are unchanged** (these new fields are importer-generated, not `fieldMap` entries).
- **Draft v1.3 (2026-06-26)** — **Daily-sales fallback + Amazon numeric normalization.** §4: added the **Daily Sales fallback rule** (when the rolling 4-day window returns no rows, fall back to latest-available data **evaluated per country/marketplace/channel/sku group** — no single global latest date; runtime/UI must expose the **actual data date range used**). §10: added **Amazon numeric normalization** (`365+` → `365` meaning "365 or more"; `/` → null/unavailable; empty numeric → null) and tightened the **`invalid_number` policy** (only truly unexpected non-numeric values are logged; known Amazon placeholders are normalized and optionally counted, not data-quality errors). Updated Future Work / Open items. **The four config blocks (§7, §27) are unchanged.**
- **Draft v1.2 (2026-06-26)** — **Enterprise data-governance refinements.** Added new sections: Data Freshness (§19), Snapshot Retention (§20), Data Quality Score (§21), Snapshot Dependency (§22), Versioning (§23), Snapshot Write Protection / Override Policy (§24). Updated in place: Marketplace Standard (§13) — added `marketplace_alias` default/auto-fill rules and the full future normalization flow; Data Ownership (§17) — clarified write owners. Trailing Non-Goals / Future Enhancements / Appendix renumbered to §25 / §26 / §27. **The four config blocks (§7, §27) are unchanged.**
- **Draft v1.1 (2026-06-26)** — Extended from a pure mapping reference into an **import-governance reference**. Added: Import Flow (§8), Header Validation Rules (§9), Missing / Invalid Value Rules incl. required natural keys (§10), Duplicate Row Rules (§11), Country Standard (§12), Marketplace Standard vs `marketplaces` DB (§13), Future Lookup Flow (§14), Import Schedule / Pipeline (§15), Import Log Tables — `import_sync_runs` + `import_sync_issues` with enums (§16), Data Ownership (§17), Scope Clarification (§18). Trailing Non-Goals / Future Enhancements / Appendix renumbered to §19 / §20 / §21. **The four config blocks (§7, §21) are unchanged.**
- **Draft v1 (2026-06-26)** — Initial mapping reference spec: four Amazon snapshot sources, common rules, date/weekly-range normalization, source metadata, row hash, verbatim config blocks.

---

## 1. Purpose & Scope

### Purpose
Define exactly how four Amazon snapshot data sources map into four destination tabs in the Operation System DB Google Sheet, so the importer can be **driven entirely by config** (no per-source hard-coding).

### In scope — four sources
| # | Destination tab | Source type | Source report |
|---|-----------------|-------------|---------------|
| 1 | `amazon_inventory_snapshot` | Google Sheet | Amazon Inventory |
| 2 | `amazon_inventory_health_snapshot` | Google Sheet | Amazon Inventory Health |
| 3 | `amazon_weekly_sales_snapshot` | Google Sheet | Amazon Weekly Sales |
| 4 | `amazon_daily_sales_snapshot` | **BigQuery** | Amazon Daily Sales |

All four destinations live in the same Operation System DB spreadsheet: `1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk`.

### Out of scope
See §25 (Non-Goals). This spec does **not** implement the importer, define replenishment-override/daily-status rules, or implement `site_sku` / `asin` lookups.

---

## 2. Import Architecture

A single **config-driven importer** reads one config block per source and performs the same generic steps. The config is the only thing that differs between sources.

```
Source (Google Sheet "Combined Sheet"  |  BigQuery "Raw Daily Sales")
        ↓   read source rows by HEADER NAME (never by column order)
Importer (generic, config-driven)
        ↓   map source header → destination header via config.fieldMap
        ↓   apply config.fixedValues          (e.g. marketplace = Amazon)
        ↓   apply config.derivedFields         (e.g. weekly range parsing)
        ↓   normalize dates → yyyy-MM-dd
        ↓   generate source metadata           (system fields, §5)
        ↓   generate source_row_hash           (from config.rowHashFields, §6)
        ↓   generate sync_batch_id + timestamps (per run, §5)
Destination tab in Operation System DB Sheet
        ↓   PRESERVE header row · CLEAR + REWRITE data rows (MVP)
```

### Two source modes
- **Google Sheet sources (1–3):** read the `Combined Sheet` tab of the source spreadsheet identified by `sourceId`.
- **BigQuery source (4):** query the table `amazon-database-489810.AmazonSales.Raw Daily Sales` using a **rolling window** (see §4 and §7.4), fetching **only the needed fields and the recent rolling window** — not the full table.

The destination write behaviour is identical for both modes (preserve header, clear-and-rewrite data rows in MVP).

---

## 3. Common Rules

These apply to **all four** sources unless a config note overrides them.

1. **Destination DB headers are authoritative.** The destination tab's header row defines the schema and the column the importer writes to.
2. **Map source headers into destination headers.** The importer matches by **header name** via `config.fieldMap` (`destination_header: "Source Header"`).
3. **Do not rely on source column order.** Source columns may be reordered; resolve every field by its header text.
4. **Preserve the destination header row.** Never rewrite or reorder the header row.
5. **Snapshot tables clear and rewrite data rows in MVP.** Each sync clears existing data rows (below the header) and writes the fresh snapshot. (Upsert is a future enhancement — §9.)
6. **`marketplace` is fixed as `Amazon`** for every row (via `fixedValues`).
7. **`site_sku` and `asin` may be left blank in MVP** where a config's `notes` says so (see per-source notes in §7). They are **not** invented or looked up yet.
8. **Source metadata is system-generated** by the importer per the config (§5).
9. **`source_row_hash` is generated** from the configured `rowHashFields` (§6).
10. **`sync_batch_id` is generated once per sync run** and stamped on every row of that run (§5).
11. **`synced_at` / `created_at` / `updated_at` are generated at sync time** (§5).
12. **Dates are normalized to `yyyy-MM-dd`** (§4).
13. **Weekly date ranges** (e.g. `2026-06-15~2026-06-21`) are parsed into `snapshot_week`, `snapshot_month`, `week_start_date`, `week_end_date` (§4, §7.3).
14. **BigQuery** fetches only the needed fields and the recent rolling 30 completed-day window, excluding today (§4, §7.4).

---

## 4. Date Normalization Rules

### Single dates
- Every date value is normalized to **`yyyy-MM-dd`** (e.g. `2026-06-15`).
- Applies to `snapshot_date` (configs 1, 2, 4) and to the generated timestamp fields after formatting.
- Source values that arrive as Date objects, locale strings, or other date formats must be converted to the canonical `yyyy-MM-dd` string before writing.

### Weekly date ranges (config 3 — Amazon Weekly Sales)
The source `Week` column is formatted as a range: **`2026-06-15~2026-06-21`** (start `~` end). The importer parses it into four destination fields:

| Destination field | Derivation | Example |
|-------------------|-----------|---------|
| `snapshot_week` | the raw `Week` range value (direct from source `Week`) | `2026-06-15~2026-06-21` |
| `week_start_date` | left side of the range, normalized to `yyyy-MM-dd` (`deriveStartDateFromWeek`) | `2026-06-15` |
| `week_end_date` | right side of the range, normalized to `yyyy-MM-dd` (`deriveEndDateFromWeek`) | `2026-06-21` |
| `snapshot_month` | month derived from the week start (`deriveMonthFromWeek`) | `2026-06` |

> `snapshot_week` is the **mapped** raw range; `snapshot_month`, `week_start_date`, and `week_end_date` are **derived** (config 3 `derivedFields`).

### BigQuery rolling window (config 4 — Amazon Daily Sales)
- The query pulls a **rolling 30 completed-day window, excluding today** (`lookbackDays: 30`, `excludeToday: true` ⇒ window ends yesterday and covers the prior 30 completed days). Example: today **2026-06-29** (Asia/Taipei) → **2026-05-30 → 2026-06-28**.
- The window is **30 days** (not 7) so the same snapshot can feed both the **Sales Trend 7-day display** (latest 7 completed days) and the **Normalized Avg Sales 30-day calculation** (`SUPPLY_PLANNING_CALCULATION_RULES.md` §22). This is a **window-length change only** — no new `amazon_daily_sales_snapshot` column and no BigQuery table schema change.
- This handles **timezone differences and Amazon reporting delay**, so late-arriving rows for recent days are picked up on subsequent syncs.
- **Daily sync schedule target: 16:00 `Asia/Taipei`** (`scheduleTime: "16:00"`, `scheduleTimezone: "Asia/Taipei"`).
- The query must **only fetch the needed fields** (those in `fieldMap`) **and only the recent rolling window** (filter on `dateField: "Date"`) — never a full-table scan.

#### Daily Sales fallback rule (no rows in the rolling window)

The rolling 30 completed-day window is the **default**. It must not silently produce an empty snapshot when Amazon is late or a market simply had no recent reporting.

- **Default:** rolling 30 completed-day window, excluding today (above).
- **Fallback:** if the rolling window returns **no rows**, fall back to the **latest available data** instead of writing an empty snapshot.
- **Group-level evaluation:** the fallback is evaluated **per `country` / `marketplace` / `channel` / `sku` group** where applicable — **not** a single global latest date. Different groups may legitimately resolve to **different latest dates** (one market may be a day behind another); do **not** force every country/site onto one global latest date when group-level data differs.
- **Transparency:** the runtime / UI must **expose the actual data date range used** (per group where relevant), so a reader always knows whether they are looking at fresh rolling-window data or fallback latest-available data, and from which date(s).
- **No fabrication:** fallback returns **real rows that exist** for the latest available date(s) per group; it never invents a date or carries a stale row forward as if current.
- **Freshness interaction:** a snapshot served from fallback is still subject to the freshness model (§19) — it should read as `delayed`/`stale` rather than `fresh` if its latest date is older than the expected cadence.

---

## 5. Source Metadata Rules

The following fields are **generated by the importer** (not mapped from source columns) and written onto every destination row, according to the config:

| Generated field | How it is produced |
|-----------------|--------------------|
| `source_system` | from `config.sourceSystem` — `"Google Sheet Import"` (configs 1–3) or `"BigQuery Import"` (config 4) |
| `source_report` | from `config.sourceReport` — e.g. `"Amazon Inventory"`, `"Amazon Weekly Sales"`, `"Amazon Daily Sales"` |
| `source_file_id` | **Google Sheet sources:** the source spreadsheet ID (`config.sourceId`). **BigQuery source:** the fully qualified table reference `amazon-database-489810.AmazonSales.Raw Daily Sales` |
| `source_sheet_name` | **Google Sheet sources:** `"Combined Sheet"` (`config.sourceSheetName`). **BigQuery source:** may be set to `"Raw Daily Sales"` or left blank depending on importer implementation — **document that this is a BigQuery table, not a Google Sheet tab** |
| `source_row_hash` | generated from `config.rowHashFields` (§6) |
| `sync_batch_id` | generated **once per sync run**, stamped on every row written in that run |
| `synced_at` | generated at sync time |
| `created_at` | generated at sync time |
| `updated_at` | generated at sync time |

> In MVP (clear-and-rewrite), `created_at` and `updated_at` are both set at the sync that writes the row. When upsert is introduced (§9), `created_at` should be preserved and only `updated_at` refreshed.

### `source_file_id` quick reference
| Config | `source_file_id` | `source_sheet_name` |
|--------|------------------|---------------------|
| 1 `amazon_inventory_snapshot` | `1B2oO9pOwVkLHpPo8utR1De6d50CK8jgntwuVgK_uNPE` | `Combined Sheet` |
| 2 `amazon_inventory_health_snapshot` | `1ZQt9PPfm7k0bTepoQjBB7zDjzDUrzE0GJh3nhtOWto4` | `Combined Sheet` |
| 3 `amazon_weekly_sales_snapshot` | `1O5BBJiJsubq8Ei_cRQggY2_1ZfIXGvs8o1f_hiMHQqA` | `Combined Sheet` |
| 4 `amazon_daily_sales_snapshot` | `amazon-database-489810.AmazonSales.Raw Daily Sales` | `Raw Daily Sales` (BigQuery table — **not** a Sheet tab) or blank |

---

## 6. Row Hash Rules

- `source_row_hash` is a deterministic hash computed from the **ordered list of fields in `config.rowHashFields`** (using the already-mapped destination values, including the fixed `marketplace`).
- Its purpose is **change detection / de-duplication** — two source rows that produce identical hashed values are the same logical snapshot row.
- The hash is computed **after** mapping, fixed-value application, derived-field computation, and date normalization, so hashing is stable regardless of source column order or date formatting.
- `rowHashFields` deliberately **excludes** system metadata (`sync_batch_id`, `synced_at`, `created_at`, `updated_at`, `source_*`) so that re-syncing unchanged data yields the same hash.
- Each config's `rowHashFields` is authoritative for that source — reproduced verbatim in §7 and §27.

---

## 7. Snapshot Table Mapping Configs

For each source: a plain-language explanation, then a field-classification table, then the verbatim config. The configs are repeated as a single block in the Appendix (§27).

Each config classifies destination fields into four kinds:
- **Direct source mappings** — `fieldMap` entries (`destination: "Source Header"`).
- **Fixed values** — `fixedValues` (here always `marketplace = Amazon`).
- **Derived fields** — computed by the importer (config 3 weekly range parsing).
- **Importer-generated** — source metadata + hash + batch id + timestamps (§5).
- **Blank in MVP** — `site_sku` / `asin` where the config `notes` say so.

---

### 7.1 `amazon_inventory_snapshot` (Google Sheet)

**Plain language:** Reads the `Combined Sheet` tab of the Amazon Inventory source spreadsheet and writes one snapshot row per source row into `amazon_inventory_snapshot`. Every inventory quantity/age field is a **direct source mapping** resolved by header name. `marketplace` is the only **fixed value** (`Amazon`). All `source_*` metadata, `source_row_hash`, `sync_batch_id`, and the three timestamps are **importer-generated**. `site_sku` is **intentionally blank in MVP** (later filled by joining `country + marketplace + sku` to `marketplace_skus`); `asin` here **is** mapped from the source `ASIN` column.

| Kind | Fields |
|------|--------|
| Direct source mappings | `snapshot_date`←Date, `country`←Country, `sku`←SKU, `asin`←ASIN, `currency`←Currency code, `price`←Price, `sales_last_30_days`←Sales last 30 days, `units_sold_last_30_days`←Units Sold Last 30 Days, `total_units`←Total Units, `inbound_qty`←Inbound, `available_qty`←Available, `fc_transfer_qty`←FC transfer, `fc_processing_qty`←FC Processing, `customer_order_qty`←Customer Order, `unfulfillable_qty`←Unfulfillable, `working_qty`←Working, `shipped_qty`←Shipped, `receiving_qty`←Receiving, `total_days_of_supply_including_open_shipments`←Total Days of Supply (including units from open shipments), `days_of_supply_amazon_fulfillment_network`←Days of Supply at Amazon Fulfillment Network |
| Fixed values | `marketplace` = `Amazon` |
| Derived fields | — (none) |
| Importer-generated | `source_system`, `source_report`, `source_file_id`, `source_sheet_name`, `source_row_hash`, `sync_batch_id`, `synced_at`, `created_at`, `updated_at` |
| Blank in MVP | `site_sku` (filled later via `marketplace_skus` join) |

**Additional destination headers (importer-generated, v1.4) — Days-of-Supply capping flags:**

| Header | Type | Rule |
|--------|------|------|
| `total_days_of_supply_including_open_shipments_is_capped` | boolean | `TRUE` when the source `Total Days of Supply (including units from open shipments)` was `365+` (numeric field stores `365`); `FALSE`/blank for an exact value |
| `days_of_supply_amazon_fulfillment_network_is_capped` | boolean | `TRUE` when the source `Days of Supply at Amazon Fulfillment Network` was `365+` (numeric field stores `365`); `FALSE`/blank for an exact value |

> These are companion flags to the two Days-of-Supply numeric fields (§10 capping rule). They are **importer-generated destination headers**, **not** `fieldMap` entries — the config block below is unchanged.

```js
{
  sourceId: "1B2oO9pOwVkLHpPo8utR1De6d50CK8jgntwuVgK_uNPE",
  sourceSheetName: "Combined Sheet",
  destinationSpreadsheetId: "1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk",
  destinationSheetName: "amazon_inventory_snapshot",
  sourceSystem: "Google Sheet Import",
  sourceReport: "Amazon Inventory",
  fixedValues: {
    marketplace: "Amazon"
  },
  fieldMap: {
    snapshot_date: "Date",
    country: "Country",
    sku: "SKU",
    asin: "ASIN",
    currency: "Currency code",
    price: "Price",
    sales_last_30_days: "Sales last 30 days",
    units_sold_last_30_days: "Units Sold Last 30 Days",
    total_units: "Total Units",
    inbound_qty: "Inbound",
    available_qty: "Available",
    fc_transfer_qty: "FC transfer",
    fc_processing_qty: "FC Processing",
    customer_order_qty: "Customer Order",
    unfulfillable_qty: "Unfulfillable",
    working_qty: "Working",
    shipped_qty: "Shipped",
    receiving_qty: "Receiving",
    total_days_of_supply_including_open_shipments: "Total Days of Supply (including units from open shipments)",
    days_of_supply_amazon_fulfillment_network: "Days of Supply at Amazon Fulfillment Network"
  },
  rowHashFields: [
    "snapshot_date",
    "country",
    "marketplace",
    "sku",
    "asin",
    "currency",
    "price",
    "sales_last_30_days",
    "units_sold_last_30_days",
    "total_units",
    "inbound_qty",
    "available_qty",
    "fc_transfer_qty",
    "fc_processing_qty",
    "customer_order_qty",
    "unfulfillable_qty",
    "working_qty",
    "shipped_qty",
    "receiving_qty",
    "total_days_of_supply_including_open_shipments",
    "days_of_supply_amazon_fulfillment_network"
  ],
  notes: "site_sku is intentionally left blank in MVP and will be filled later by joining country + marketplace + sku to marketplace_skus."
}
```

---

### 7.2 `amazon_inventory_health_snapshot` (Google Sheet)

**Plain language:** Reads the `Combined Sheet` tab of the Amazon Inventory Health source spreadsheet into `amazon_inventory_health_snapshot`. The inventory-age buckets are **direct source mappings** (note the source headers use hyphens, e.g. `inv-age-0-to-90-days`, mapped to underscored destination headers). `marketplace` is **fixed** (`Amazon`); metadata/hash/batch/timestamps are **importer-generated**. `site_sku` is **blank in MVP**; `asin` **is** mapped from source `ASIN`.

> **Optional age buckets (report-version compatibility).** Amazon Inventory Health reports differ by marketplace / report version: some sources carry `inv-age-365-plus-days`, others carry the finer `inv-age-366-to-455-days` / `inv-age-456-plus-days`, and a source may not have all of them at once. The age buckets that vary are therefore in **`optionalFieldMap`**, not `fieldMap`. A missing optional header maps the destination field to **blank** and must **not** raise `missing_required_header` or stop the source. Only `fieldMap` headers are required/validated. See §9.1.

| Kind | Fields |
|------|--------|
| Direct source mappings (REQUIRED `fieldMap`) | `snapshot_date`←Date, `country`←Country, `sku`←SKU, `asin`←ASIN, `available_qty`←Available, `inv_age_61_to_90_days`←inv-age-61-to-90-days, `inv_age_91_to_180_days`←inv-age-91-to-180-days, `inv_age_181_to_270_days`←inv-age-181-to-270-days, `inv_age_271_to_365_days`←inv-age-271-to-365-days |
| Optional source mappings (`optionalFieldMap`, map-if-present else blank) | `inv_age_0_to_90_days`←inv-age-0-to-90-days, `inv_age_365_plus_days`←inv-age-365-plus-days, `inv_age_366_to_455_days`←inv-age-366-to-455-days, `inv_age_456_plus_days`←inv-age-456-plus-days |
| Fixed values | `marketplace` = `Amazon` |
| Derived fields | — (none) |
| Importer-generated | `source_system`, `source_report`, `source_file_id`, `source_sheet_name`, `source_row_hash`, `sync_batch_id`, `synced_at`, `created_at`, `updated_at` |
| Blank in MVP | `site_sku` (filled later via `marketplace_skus` join) |

```js
{
  sourceId: "1ZQt9PPfm7k0bTepoQjBB7zDjzDUrzE0GJh3nhtOWto4",
  sourceSheetName: "Combined Sheet",
  destinationSpreadsheetId: "1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk",
  destinationSheetName: "amazon_inventory_health_snapshot",
  sourceSystem: "Google Sheet Import",
  sourceReport: "Amazon Inventory Health",
  fixedValues: {
    marketplace: "Amazon"
  },
  // REQUIRED source headers (validated before any write).
  fieldMap: {
    snapshot_date: "Date",
    country: "Country",
    sku: "SKU",
    asin: "ASIN",
    available_qty: "Available",
    inv_age_61_to_90_days: "inv-age-61-to-90-days",
    inv_age_91_to_180_days: "inv-age-91-to-180-days",
    inv_age_181_to_270_days: "inv-age-181-to-270-days",
    inv_age_271_to_365_days: "inv-age-271-to-365-days"
  },
  // OPTIONAL source headers — map only if present; missing => blank (never fails the import).
  // inv-age-365-plus-days = backward-compatible top bucket (old reports);
  // inv-age-366-to-455-days / inv-age-456-plus-days = newer finer buckets (preferred when available).
  optionalFieldMap: {
    inv_age_0_to_90_days: "inv-age-0-to-90-days",
    inv_age_365_plus_days: "inv-age-365-plus-days",
    inv_age_366_to_455_days: "inv-age-366-to-455-days",
    inv_age_456_plus_days: "inv-age-456-plus-days"
  },
  rowHashFields: [
    "snapshot_date",
    "country",
    "marketplace",
    "sku",
    "asin",
    "available_qty",
    "inv_age_0_to_90_days",
    "inv_age_61_to_90_days",
    "inv_age_91_to_180_days",
    "inv_age_181_to_270_days",
    "inv_age_271_to_365_days",
    "inv_age_365_plus_days",
    "inv_age_366_to_455_days",
    "inv_age_456_plus_days"
  ],
  notes: "site_sku is intentionally left blank in MVP and will be filled later by joining country + marketplace + sku to marketplace_skus. Age buckets that vary by Amazon report version are in optionalFieldMap; a missing optional header maps to blank and does not fail the import."
}
```

> **Destination header naming (required):** the destination tab headers must use the **underscored** names, e.g. `inv_age_456_plus_days` — **not** the hyphenated source form `inv-age-456-plus-days`. The writer maps values by **destination header**, so a hyphenated destination header will silently not receive the value (DB schema is not changed automatically — fix the header in the tab).

---

### 7.3 `amazon_weekly_sales_snapshot` (Google Sheet, weekly range parsing)

**Plain language:** Reads the `Combined Sheet` tab of the Amazon Weekly Sales source into `amazon_weekly_sales_snapshot`. Sales/traffic metrics are **direct source mappings** (note `country` is mapped from the source `Marketplace` column). This source is special because the `Week` column is a **range** (`2026-06-15~2026-06-21`): `snapshot_week` holds the raw range, while `snapshot_month`, `week_start_date`, and `week_end_date` are **derived** by the importer (`derivedFields`). `marketplace` is **fixed** (`Amazon`); metadata/hash/batch/timestamps are **importer-generated**. **Both `site_sku` and `asin` are blank in MVP** (this source has no ASIN column).

| Kind | Fields |
|------|--------|
| Direct source mappings | `snapshot_week`←Week, `country`←Marketplace, `channel`←Channel, `sku`←SKU, `currency`←Currency, `sales_units_7d`←Sales Units, `sales_amount_7d`←Sales Amount, `sales_amount_usd_7d`←Sales Amount$, `return_units_7d`←Return Units, `total_orders_7d`←Total Orders, `session_7d`←Session, `page_view_7d`←Page View, `unit_session_percentage_7d`←Unit Session Percentage |
| Fixed values | `marketplace` = `Amazon` |
| Derived fields | `snapshot_month` (`deriveMonthFromWeek`), `week_start_date` (`deriveStartDateFromWeek`), `week_end_date` (`deriveEndDateFromWeek`) — all from `Week` |
| Importer-generated | `source_system`, `source_report`, `source_file_id`, `source_sheet_name`, `source_row_hash`, `sync_batch_id`, `synced_at`, `created_at`, `updated_at` |
| Blank in MVP | `site_sku`, `asin` |

```js
{
  sourceId: "1O5BBJiJsubq8Ei_cRQggY2_1ZfIXGvs8o1f_hiMHQqA",
  sourceSheetName: "Combined Sheet",
  destinationSpreadsheetId: "1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk",
  destinationSheetName: "amazon_weekly_sales_snapshot",
  sourceSystem: "Google Sheet Import",
  sourceReport: "Amazon Weekly Sales",
  fixedValues: {
    marketplace: "Amazon"
  },
  derivedFields: {
    snapshot_month: "deriveMonthFromWeek",
    week_start_date: "deriveStartDateFromWeek",
    week_end_date: "deriveEndDateFromWeek"
  },
  fieldMap: {
    snapshot_week: "Week",
    country: "Marketplace",
    channel: "Channel",
    sku: "SKU",
    currency: "Currency",
    sales_units_7d: "Sales Units",
    sales_amount_7d: "Sales Amount",
    sales_amount_usd_7d: "Sales Amount$",
    return_units_7d: "Return Units",
    total_orders_7d: "Total Orders",
    session_7d: "Session",
    page_view_7d: "Page View",
    unit_session_percentage_7d: "Unit Session Percentage"
  },
  rowHashFields: [
    "snapshot_week",
    "country",
    "marketplace",
    "channel",
    "sku",
    "currency",
    "sales_units_7d",
    "sales_amount_7d",
    "sales_amount_usd_7d",
    "return_units_7d",
    "total_orders_7d",
    "session_7d",
    "page_view_7d",
    "unit_session_percentage_7d"
  ],
  notes: "site_sku and asin are intentionally left blank in MVP. snapshot_month, week_start_date, and week_end_date are derived from Week formatted like 2026-06-15~2026-06-21."
}
```

---

### 7.4 `amazon_daily_sales_snapshot` (BigQuery, rolling 30 completed-day window, excludes today)

**Daily Sales snapshot window: 30 complete days, exclude today.** This single snapshot serves **two** purposes: (a) the **Sales Trend 7-day display** (the most recent 7 completed days) and (b) the **Normalized Avg Sales 30-day calculation** (event/promotion-day exclusion, `SUPPLY_PLANNING_CALCULATION_RULES.md` §22). Widening 7 → 30 days only increases available snapshot days — **no new `amazon_daily_sales_snapshot` column and no BigQuery table schema change.**

**Plain language:** Unlike configs 1–3, this source is **BigQuery**, not a Google Sheet. The importer queries `amazon-database-489810.AmazonSales.Raw Daily Sales`, fetching **only the mapped fields** and **only the rolling 30 completed-day window excluding today** (window ends yesterday) filtered on the `Date` field — to absorb timezone and Amazon reporting delay. The daily sync runs at **16:00 `Asia/Taipei`**. Sales/traffic metrics are **direct source mappings** (`country` from `Marketplace`; note BQ source headers use underscores, e.g. `Sales_Units`, and `sales_amount_usd`←`Sales_Amount_`). `marketplace` is **fixed** (`Amazon`); metadata/hash/batch/timestamps are **importer-generated**. **Both `site_sku` and `asin` are blank in MVP.** For metadata, `source_file_id` is the fully qualified BQ table reference and `source_sheet_name` is the BQ table name (or blank) — **not** a Google Sheet tab.

| Kind | Fields |
|------|--------|
| Direct source mappings | `snapshot_date`←Date, `country`←Marketplace, `channel`←Channel, `sku`←SKU, `currency`←Currency, `sales_units`←Sales_Units, `sales_amount`←Sales_Amount, `sales_amount_usd`←Sales_Amount_, `return_units`←Return_Units, `total_orders`←Total_Orders, `session`←Session, `page_view`←Page_View, `unit_session_percentage`←Unit_Session_Percentage, `buy_box_percentage`←Buy_Box_Percentage, `browser_session`←browser_session, `browser_page_views`←browser_page_views, `app_session`←app_session, `app_page_view`←app_page_view |
| Fixed values | `marketplace` = `Amazon` |
| Derived fields | — (none) |
| Query control (not destination fields) | `queryMode: rolling_window`, `dateField: Date`, `lookbackDays: 30`, `excludeToday: true` (⇒ 30 completed days, ends yesterday), `scheduleTime: 16:00`, `scheduleTimezone: Asia/Taipei` |
| Importer-generated | `source_system`, `source_report`, `source_file_id` (= `amazon-database-489810.AmazonSales.Raw Daily Sales`), `source_sheet_name` (`Raw Daily Sales` or blank), `source_row_hash`, `sync_batch_id`, `synced_at`, `created_at`, `updated_at` |
| Blank in MVP | `site_sku`, `asin` |

**Additional destination headers (importer-generated, v1.4) — fallback / data-window transparency:**

| Header | Type | Rule |
|--------|------|------|
| `data_window_start_date` | date `yyyy-MM-dd` | earliest source date actually included for this row's group |
| `data_window_end_date` | date `yyyy-MM-dd` | latest source date actually included for this row's group |
| `latest_source_date` | date `yyyy-MM-dd` | the most recent `snapshot_date` present for this row's group |
| `is_fallback_used` | boolean | `TRUE` when the rolling 30-day window was empty and the importer fell back to latest-available data for this group (§4); else `FALSE` |
| `fallback_reason` | text | short reason when `is_fallback_used = TRUE` (e.g. `rolling_window_empty`); blank otherwise |
| `data_age_days` | integer | days between `latest_source_date` and the sync date (0 = same-day; higher = staler) |

> The fallback is evaluated **per `country`/`marketplace`/`channel`/`sku` group**, so these per-row values may legitimately differ between groups (§4). They are **importer-generated destination headers**, **not** `fieldMap` entries — the config block below is unchanged.

```js
{
  sourceType: "bigquery",
  sourceProjectId: "amazon-database-489810",
  sourceDataset: "AmazonSales",
  sourceTable: "Raw Daily Sales",

  queryMode: "rolling_window",
  dateField: "Date",
  lookbackDays: 30,
  excludeToday: true,
  scheduleTime: "16:00",
  scheduleTimezone: "Asia/Taipei",

  destinationSpreadsheetId: "1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk",
  destinationSheetName: "amazon_daily_sales_snapshot",

  sourceSystem: "BigQuery Import",
  sourceReport: "Amazon Daily Sales",

  fixedValues: {
    marketplace: "Amazon"
  },

  fieldMap: {
    snapshot_date: "Date",
    country: "Marketplace",
    channel: "Channel",
    sku: "SKU",
    currency: "Currency",
    sales_units: "Sales_Units",
    sales_amount: "Sales_Amount",
    sales_amount_usd: "Sales_Amount_",
    return_units: "Return_Units",
    total_orders: "Total_Orders",
    session: "Session",
    page_view: "Page_View",
    unit_session_percentage: "Unit_Session_Percentage",
    buy_box_percentage: "Buy_Box_Percentage",
    browser_session: "browser_session",
    browser_page_views: "browser_page_views",
    app_session: "app_session",
    app_page_view: "app_page_view"
  },

  rowHashFields: [
    "snapshot_date",
    "country",
    "marketplace",
    "channel",
    "sku",
    "currency",
    "sales_units",
    "sales_amount",
    "sales_amount_usd",
    "return_units",
    "total_orders",
    "session",
    "page_view",
    "unit_session_percentage",
    "buy_box_percentage",
    "browser_session",
    "browser_page_views",
    "app_session",
    "app_page_view"
  ],

  notes: "Pull a rolling 30 completed-day window excluding today (window ends yesterday). Feeds the Sales Trend 7-day display and the Normalized Avg Sales 30-day calculation. This handles timezone and Amazon reporting delay. site_sku and asin are intentionally left blank in MVP."
}
```

### Google Sheet vs BigQuery — key differences

| Aspect | Google Sheet sources (1–3) | BigQuery source (4) |
|--------|----------------------------|----------------------|
| Source identifier | `sourceId` (spreadsheet ID) + `sourceSheetName: "Combined Sheet"` | `sourceProjectId` / `sourceDataset` / `sourceTable` |
| Read mechanism | read all rows of the `Combined Sheet` tab | **query** with `queryMode: rolling_window`, filtered on `dateField` |
| Volume control | full sheet (snapshot already scoped) | **rolling 30 completed-day window only** (excludes today); fetch only mapped fields |
| Schedule | per importer schedule | **16:00 `Asia/Taipei`**, daily |
| `source_system` | `Google Sheet Import` | `BigQuery Import` |
| `source_file_id` | spreadsheet ID | `amazon-database-489810.AmazonSales.Raw Daily Sales` |
| `source_sheet_name` | `Combined Sheet` | `Raw Daily Sales` or blank (**not** a Sheet tab) |
| Header style | spaces (e.g. `Sales Units`, `Sales Amount$`) | underscores (e.g. `Sales_Units`, `Sales_Amount_`) |

---

## 8. Import Flow

The governance-oriented end-to-end flow each source runs through (complements the generic architecture in §2):

```
Google Sheet / BigQuery
   ↓
Read Source                 (by header name, never column order)
   ↓
Header Validation           (required source headers present? — §9)
   ↓
Mapping                     (source header → destination header via fieldMap)
   ↓
Normalize Data              (dates → yyyy-MM-dd; missing/invalid handling — §4, §10)
   ↓
Apply Fixed Values          (marketplace = Amazon)
   ↓
Generate Metadata           (source_* + sync_batch_id + timestamps — §5)
   ↓
Generate Row Hash           (from rowHashFields — §6)
   ↓
Write Snapshot              (preserve header; clear + rewrite data rows in MVP)
   ↓
Record import_sync_runs / import_sync_issues   (run summary + per-issue log — §16)
```

Every run produces **exactly one** `import_sync_runs` record and **zero or more** `import_sync_issues` records.

---

## 9. Header Validation Rules

The importer must validate that all **required source headers** (every `fieldMap` source header for that config) are present **before** importing any rows.

**If a required source header is missing:**
- **Stop** that source's import (do not continue to mapping).
- Create an `import_sync_runs` record with `status = failed`.
- Create an `import_sync_issues` record with `issue_type = missing_required_header` (`issue_level = error` or `critical`, `action_taken = stopped_import`, `field_name` = the missing header).
- **Do not write partial data** to the destination snapshot tab (the existing snapshot is left intact; no clear-and-rewrite is performed for a failed validation).

Header validation is per-source and independent: one source failing validation does not block the others.

### 9.1 Optional source headers (`optionalFieldMap`)

A config may declare an **`optionalFieldMap`** in addition to `fieldMap`. It maps optional source headers to destination fields for columns that **vary by source / report version**.

- **Header validation checks `fieldMap` only.** `optionalFieldMap` headers are **never** treated as required and **never** raise `missing_required_header`.
- **During row mapping:** `fieldMap` fields are mapped normally; each `optionalFieldMap` field is mapped **only if its source header exists**, otherwise the destination field is set to **blank** (`""`).
- **`rowHashFields`** may include optional destination fields; blank optional values hash safely (treated as empty string), so the row hash stays stable whether or not the optional column is present.
- **Use case — Amazon Inventory Health age buckets (§7.2):** `inv_age_0_to_90_days`, `inv_age_365_plus_days`, `inv_age_366_to_455_days`, `inv_age_456_plus_days` are optional. A source missing `inv-age-366-to-455-days` / `inv-age-456-plus-days` / `inv-age-365-plus-days` still imports successfully (those fields blank); required headers (Date, Country, SKU, ASIN, Available, and the 61–90 / 91–180 / 181–270 / 271–365 buckets) must still be present or the source fails as before.

---

## 10. Missing / Invalid Value Rules

Applied per cell **after** header validation and mapping:

| Situation | Rule |
|-----------|------|
| Empty **numeric** field | → `null` |
| Empty **text** field | → `""` (empty string) |
| Empty **optional date** | → `null` |
| **Invalid required date** | → **skip row** + create issue (`invalid_date`, `error`, `action_taken = skipped_row`) |
| **Known Amazon numeric placeholder** (see normalization below) | → **normalize** (`365+`→`365`, `/`→null) · **no `invalid_number` warning** · optionally counted, not a data-quality error |
| **Truly unexpected non-numeric value** | → `null` + **warning** (`invalid_number`, `warning`, `action_taken = converted_to_null`) — **unless** it is a key field, in which case treat as a missing required key (skip row + error) |
| **Missing required key field** | → **skip row** + **error** (`missing_required_value`, `error`, `action_taken = skipped_row`) |

### Amazon numeric normalization

Amazon reports use special tokens inside otherwise-numeric columns (e.g. Days-of-Supply, inventory-age). These are **expected** and must be normalized **before** any `invalid_number` evaluation — they are **not** data-quality errors:

| Source value | Normalized to | Meaning |
|--------------|---------------|---------|
| `365+` (and similar `N+`) | numeric **`365`** (the `N`) | "365 or more" — the `+` denotes an open-ended upper bound; the numeric value carried is `365` |
| `/` | **null / unavailable** | Amazon "not applicable / no value" placeholder |
| empty / blank | **null** | empty numeric → null |
| thousands separators / trailing `%` (e.g. `1,234`, `12%`) | the underlying number (kept) | formatting only, not an error |

- Normalization happens **first**; only after that does a value count as a number or as "unexpected non-numeric".
- **Capping flags preserve the "or more" meaning.** When a value is `365+`, the importer writes numeric **`365`** to the numeric field **and** sets the **companion `*_is_capped` boolean = TRUE** (see §7.1). For an **exact / normal** numeric value, the companion `*_is_capped` is **FALSE** (or left blank). This keeps the numeric column clean for math while retaining the open-bound distinction in a dedicated flag — so the `365+` semantics are **no longer lost** (superseding the earlier "future enhancement" note).
- `/` and empty/blank numeric values normalize to **null** and do **not** create `import_sync_issues`.

### `invalid_number` issue policy

- `invalid_number` is logged **only for genuinely unexpected non-numeric values** (something that is neither a number nor a known Amazon placeholder).
- **Known Amazon placeholders** (`365+`, `/`, blank, formatted numbers) are **normalized and optionally counted** (e.g. a per-run placeholder tally) — they must **not** generate high-volume `invalid_number` warnings or be treated as quality errors.
- This keeps the Data Quality Score (§21) meaningful: expected Amazon tokens do not depress it; only real anomalies do.

### Required natural keys (per destination table)

A row is skipped (with a `missing_required_value` error) if any of its key fields is missing/blank:

| Destination table | Required natural key |
|-------------------|----------------------|
| `amazon_inventory_snapshot` | `snapshot_date` + `country` + `marketplace` + `sku` |
| `amazon_inventory_health_snapshot` | `snapshot_date` + `country` + `marketplace` + `sku` |
| `amazon_weekly_sales_snapshot` | `snapshot_week` + `country` + `marketplace` + `channel` + `sku` |
| `amazon_daily_sales_snapshot` | `snapshot_date` + `country` + `marketplace` + `channel` + `sku` |

> `marketplace` is always present (fixed = `Amazon`), so in practice the key check focuses on the source-derived parts.

---

## 11. Duplicate Row Rules

If the **same natural key** (per §10) appears more than once within a single import:
- **Keep the first** row encountered.
- **Skip** the later duplicate row(s).
- Create an `import_sync_issues` record with `issue_type = duplicate_row` (`issue_level = warning`, `action_taken = kept_first_row`, `source_key` = the duplicated key).
- Increment `rows_duplicate` in the `import_sync_runs` record.

---

## 12. Country Standard

`country` should use a **standardized country / region code**.

**MVP:**
- **Allow import even if `country` is unknown / non-standard** (do not block the row).
- Record an `import_sync_issues` **warning** with `issue_type = unknown_country` (`action_taken = logged_only`).

**Future:**
- Validate `country` against a `countries` master table / global ISO country-code list.
- Support a full global country-code reference.

---

## 13. Marketplace Standard

Distinguish the **Marketplace Standard** (an import-time rule) from the **`marketplaces` DB** (business master data):

| | **Marketplace Standard** | **`marketplaces` DB** |
|---|--------------------------|------------------------|
| What it is | An **import-time normalization rule** | **Authoritative business master data** |
| Purpose | Normalize source values such as `Amazon`, `amazon`, `AMZ`, `Amazon.com` into a canonical value | System of record for company / country / marketplace / currency / status |
| When applied | During import | Maintained as master data |

### `marketplace_alias` (normalization helper)

The `marketplaces` DB includes a **`marketplace_alias`** column used for import-time source-name matching:
- `marketplace_alias` **defaults to the same value as `marketplace`**.
- **On add marketplace:** if `marketplace_alias` is blank, the system auto-fills `marketplace_alias = marketplace`.
- **On edit marketplace:** a manually-edited `marketplace_alias` is **not** overwritten; auto-fill happens **only when it is empty**.
- It is a **single-alias** column — there is **no** separate `marketplace_aliases` table (multi-alias is a future option). See `DATABASE_RELATIONSHIP_MAP.md`.

**MVP:**
- For the four Amazon snapshot imports, `marketplace` is still **fixed as `Amazon`** (via `fixedValues`), so no normalization is needed yet. Alias matching is documented here for **future multi-marketplace imports**.

**Future import normalization flow:**
```
source marketplace value
   ↓
normalize text                 (trim / case-fold, e.g. "amazon", "AMZ", "Amazon.com")
   ↓
match marketplace_alias
   ↓ (no match)
fallback match marketplace_display_name
   ↓ (no match)
fallback match marketplace
   ↓
resolve marketplace_id + canonical marketplace
   ↓ (no match anywhere)
log import_sync_issues  issue_type = unknown_marketplace
```
- Validate the imported `marketplace` against the `marketplaces` DB and resolve to the canonical `marketplace_id`.
- Support `Shopify`, `TikTok`, `Walmart`, `Costco`, `B2B`, and other channels (with normalization + the `unknown_marketplace` issue type for unmatched values).

---

## 14. Future Lookup Flow

How `site_sku` / `asin` will be enriched later (not implemented in MVP):

```
snapshot row
   ↓
country + marketplace + sku
   ↓
marketplace_skus
   ↓
site_sku / asin lookup
   ↓
enrich snapshot or view
```

**MVP:** `site_sku` and `asin` lookup is **not implemented**. A field is only populated if it is **already directly mapped** from the source (e.g. `asin` in configs 1 and 2). Where a config note says blank-in-MVP, the field stays blank.

---

## 15. Import Schedule / Pipeline

Target operational pipeline:

```
Source refresh completed
   ↓
Import job runs
   ↓
import_sync_runs created
   ↓
import_sync_issues created (if needed)
   ↓
Snapshot tabs refreshed
   ↓
(future) calculation job may update inventory_replenishment_daily_status
   ↓
Dashboard / replenishment page reads the refreshed snapshot
```

- The **exact time is configurable** and can be adjusted later.
- The **daily BigQuery** rule remains the **16:00 `Asia/Taipei`** target for now (config 4).
- The downstream calculation job and dashboard read are shown for context only — they are **out of scope** for this spec (§18, §25).

---

## 16. Import Log Tables

Two governance tables back the flow above. This spec documents their **fields and enums** for the importer task; it does **not** create or migrate them.

### `import_sync_runs` — one record per import run

```
sync_run_id
sync_batch_id
import_job_name
source_type
source_system
source_report
destination_table
schedule_type
scheduled_at
started_at
finished_at
status
rows_read
rows_written
rows_skipped
rows_error
rows_duplicate
triggered_by
error_summary
created_at
note
latest_source_date
data_window_start_date
data_window_end_date
is_fallback_used
fallback_group_count
normalized_placeholder_count
data_age_days
quality_note
```

**`status` enum:** `success` · `partial_success` · `failed` · `cancelled`

**Run-level governance fields (v1.4):**

| Field | Type | Meaning |
|-------|------|---------|
| `latest_source_date` | date `yyyy-MM-dd` | most recent source date written this run (across groups; the max) |
| `data_window_start_date` | date `yyyy-MM-dd` | earliest source date written this run |
| `data_window_end_date` | date `yyyy-MM-dd` | latest source date written this run |
| `is_fallback_used` | boolean | `TRUE` if **any** group used the latest-available fallback (§4) |
| `fallback_group_count` | integer | how many `country`/`marketplace`/`channel`/`sku` groups used fallback |
| `normalized_placeholder_count` | integer | count of normalized Amazon placeholders (`365+`, `/`, blank) — visibility without inflating `invalid_number` |
| `data_age_days` | integer | days between `latest_source_date` and the sync date |
| `quality_note` | text | human-readable quality summary (e.g. quality score + placeholder/fallback notes) |

> These complement the existing run counters; they make freshness, fallback usage, and placeholder volume **auditable per run** without creating `import_sync_issues` for expected Amazon tokens.

### `import_sync_issues` — zero or more records per run (one per issue)

```
issue_id
sync_run_id
sync_batch_id
destination_table
source_file_id
source_sheet_name
source_row_number
source_key
issue_type
issue_level
field_name
source_value
expected_rule
action_taken
error_message
created_at
resolved_status
resolved_by
resolved_at
note
```

**`issue_type` enum:** `missing_required_header` · `invalid_date` · `invalid_number` · `missing_required_value` · `duplicate_row` · `unknown_country` · `unknown_marketplace` · `source_read_error` · `destination_write_error` · `mapping_error`

**`issue_level` enum:** `info` · `warning` · `error` · `critical`

**`action_taken` enum:** `skipped_row` · `kept_first_row` · `converted_to_null` · `converted_to_blank` · `stopped_import` · `logged_only`

> `sync_batch_id` links a run to the rows it wrote (the same `sync_batch_id` stamped on snapshot rows, §5) and to its issues.

---

## 17. Data Ownership

Conceptual ownership only (see clarification below):

| Table | Data Owner | Write Owner | Technical Owner |
|-------|-----------|-------------|-----------------|
| `amazon_inventory_snapshot` | OP / Supply Chain | Importer only | Dev / System |
| `amazon_inventory_health_snapshot` | OP / Supply Chain | Importer only | Dev / System |
| `amazon_weekly_sales_snapshot` | Sales / OP | Importer only | Dev / System |
| `amazon_daily_sales_snapshot` | Sales / OP | Importer only | Dev / System |
| `inventory_replenishment_overrides` | OP / Planner | Authorized users | Dev / System |
| `inventory_replenishment_daily_status` | OP / System | System calculation only | Dev / System |
| `import_sync_runs` | Dev / System | Importer / System | Dev / System |
| `import_sync_issues` | Dev / System | Importer / System | Dev / System |

**Write-owner clarification:**
- **Snapshot tables** (`amazon_*_snapshot`): **Write Owner = Importer only** (system-managed, import-only — see §24).
- **`inventory_replenishment_overrides`**: **Write Owner = Authorized users**.
- **`inventory_replenishment_daily_status`**: **Write Owner = System calculation only**.

> **Clarification:** Formal role access will be handled later in a **Role & Permission Spec**. This document defines ownership **conceptually only** — it does not implement or enforce permissions.

---

## 18. Scope Clarification

- This spec covers **import governance for snapshot imports**.
- Detailed rules for `inventory_replenishment_overrides` and `inventory_replenishment_daily_status` will be defined in **future replenishment / status specs**.
- This spec only states that **their errors / issues can be logged through the same import / system issue governance pattern** (`import_sync_runs` / `import_sync_issues`) **if needed** — it does not define those rules here.

---

## 19. Data Freshness

Freshness tells dashboards and the replenishment page whether snapshot data is **safe to use**. It is **derived from `import_sync_runs`**, never manually entered.

**Concept fields (derived):**

| Field | Meaning |
|-------|---------|
| `expected_refresh_frequency` | how often the source is expected to refresh (e.g. daily, weekly) |
| `expected_max_delay` | the tolerated lag before data is considered late |
| `last_successful_sync_at` | timestamp of the most recent successful run (from `import_sync_runs`) |
| `last_successful_snapshot_date` | the latest snapshot date actually present after that run |
| `freshness_status` | derived freshness state (enum below) |

**`freshness_status` enum:** `fresh` · `delayed` · `stale` · `failed` · `unknown`

**Explanation:**
- Freshness lets dashboards / replenishment pages know whether the data is **safe to use**.
- If a required snapshot is `stale` or `failed`, downstream calculations may show **warnings** or be **blocked** (see §22).
- Freshness is **derived from `import_sync_runs`** (last successful run + expected cadence vs now), not a manually maintained field.

---

## 20. Snapshot Retention

**Current MVP behavior: "latest snapshot retained in the DB sheet, refreshed on each sync."**

- Snapshot tabs are refreshed by **clear-and-rewrite of the data rows** (header preserved).
- They represent the **latest operational snapshot** available to the system.
- They are **not** designed as the long-term historical archive in MVP.
- **Do not** describe the Google Sheet snapshot tabs as holding full permanent row-level history.
- Historical retention may later move to **BigQuery or a dedicated history table** (future).
- The daily / weekly / inventory / health **source systems may still preserve their own history externally** — that history lives upstream, not in these snapshot tabs.

---

## 21. Data Quality Score

A per-run quality score supports future dashboards. It is **recorded in or derivable from `import_sync_runs`**.

**Formula:**
```
quality_score = ((rows_written - rows_error - rows_duplicate) / rows_read) * 100
```
- If `rows_read = 0`: `quality_score = 0`, and `status` should be `failed` or `warning` depending on source context (e.g. an empty source on a day with no expected data may be a warning, not a hard failure).

**Quality bands:**

| Band | Score | Meaning |
|------|-------|---------|
| 🟢 healthy | `>= 99%` | clean import |
| 🟡 warning | `95% – 98.99%` | minor issues, review |
| 🔴 risk | `< 95%` | significant issues, investigate |

**Explanation:**
- This supports **future dashboards** (run health at a glance).
- The score **does not block import by itself** — only **critical errors** (e.g. missing required header, §9) stop an import.

---

## 22. Snapshot Dependency

Downstream features depend on snapshot freshness. **Inventory Replenishment** and the **Site Health Dashboard** may depend on:
- `amazon_inventory_snapshot`
- `amazon_inventory_health_snapshot`
- `amazon_weekly_sales_snapshot`
- `amazon_daily_sales_snapshot`

**Dependency behavior (based on the dependency's `freshness_status`, §19):**

| Dependency freshness | Downstream behavior |
|----------------------|---------------------|
| `fresh` | safe to use |
| `delayed` | show a **warning** |
| `stale` / `failed` | downstream calculation may be **blocked** or **clearly marked unreliable** |

> **Clarification:** these dependency rules are **conceptual now** and will be implemented in future **calculation / dashboard specs**. This spec only states the intent.

---

## 23. Versioning

Version markers make imports auditable and make Amazon/BigQuery header changes traceable. **No implementation is required in this task.**

| Version field | Tracks |
|---------------|--------|
| `importer_version` | the importer **code** version |
| `config_version` | the **mapping config** version (the §7 / §27 blocks) |
| `source_schema_version` | the **source report / header** version (Amazon report or BQ table headers) |
| `destination_schema_version` | the **destination DB header** version |

**Explanation:**
- When **Amazon or BigQuery changes headers**, bump `source_schema_version` and `config_version` (the `fieldMap` must be updated to match).
- When a destination tab's headers change, bump `destination_schema_version`.
- These can later be stamped onto `import_sync_runs` for full auditability.

---

## 24. Snapshot Write Protection / Override Policy

**Snapshot tables are system-managed, import-only tables. Users should not manually edit snapshot records.**

Any correction, missing-SKU adjustment, exclusion, manual override, or exception must be handled through:
- `inventory_replenishment_overrides`,
- a future formal **override / correction workflow**, or
- a **correction at the upstream source**.

**Why:**
- Snapshot data must remain a **clean reflection of source imports**.
- **Manual edits to snapshot rows would be overwritten by the next sync** (clear-and-rewrite, §20).
- Manual business decisions must be **traceable through override records**, not hidden inside snapshot tables.
- This keeps **recalculation re-runnable and consistent** (the same source + same overrides → the same result).

---

## 25. Non-Goals

This spec does **not**:
- Implement Apps Script (the config-driven importer is the **next** task).
- Connect or change the frontend.
- Create DB migrations.
- Define `inventory_replenishment_overrides` rules.
- Define `inventory_replenishment_daily_status` rules.
- Implement `site_sku` / `asin` lookup.
- Modify runtime files, DB/API, routes, or existing planning files.
- Invent additional schema beyond the four config blocks above.

---

## 26. Future Enhancements

- **`site_sku` lookup** from `marketplace_skus` (join on `country + marketplace + sku`).
- **`asin` lookup** from `marketplace_skus` or `sku_details` (for sources lacking an ASIN column).
- **Upsert mode** instead of clear-and-rewrite (preserve `created_at`, refresh `updated_at`, key on `source_row_hash` or natural keys).
- **Import logs table** (per-run summary).
- **Error reports** (rejected/invalid rows).
- **BigQuery partition optimization** (e.g. partition pruning on the date field).
- **API-based Amazon sync** (replace sheet/BQ staging with direct API pulls).
- **Daily-sales fallback implementation** — per-group (country/marketplace/channel/sku) latest-available query + surfacing the actual data date range used to runtime/UI (§4).
- **Open-bound preservation** — optionally retain the `365+` "or more" semantics in a companion flag/text field instead of only the numeric `365`.
- **Placeholder tally** — per-run count of normalized Amazon placeholders (`365+`, `/`, blanks) recorded on `import_sync_runs` (e.g. in `note`) for visibility without inflating `invalid_number`.

---

## 27. Appendix: Final Config Blocks

The authoritative config blocks, reproduced together for the importer task. (Identical to §7.)

### Config 1 — `amazon_inventory_snapshot`
```js
{
  sourceId: "1B2oO9pOwVkLHpPo8utR1De6d50CK8jgntwuVgK_uNPE",
  sourceSheetName: "Combined Sheet",
  destinationSpreadsheetId: "1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk",
  destinationSheetName: "amazon_inventory_snapshot",
  sourceSystem: "Google Sheet Import",
  sourceReport: "Amazon Inventory",
  fixedValues: {
    marketplace: "Amazon"
  },
  fieldMap: {
    snapshot_date: "Date",
    country: "Country",
    sku: "SKU",
    asin: "ASIN",
    currency: "Currency code",
    price: "Price",
    sales_last_30_days: "Sales last 30 days",
    units_sold_last_30_days: "Units Sold Last 30 Days",
    total_units: "Total Units",
    inbound_qty: "Inbound",
    available_qty: "Available",
    fc_transfer_qty: "FC transfer",
    fc_processing_qty: "FC Processing",
    customer_order_qty: "Customer Order",
    unfulfillable_qty: "Unfulfillable",
    working_qty: "Working",
    shipped_qty: "Shipped",
    receiving_qty: "Receiving",
    total_days_of_supply_including_open_shipments: "Total Days of Supply (including units from open shipments)",
    days_of_supply_amazon_fulfillment_network: "Days of Supply at Amazon Fulfillment Network"
  },
  rowHashFields: [
    "snapshot_date",
    "country",
    "marketplace",
    "sku",
    "asin",
    "currency",
    "price",
    "sales_last_30_days",
    "units_sold_last_30_days",
    "total_units",
    "inbound_qty",
    "available_qty",
    "fc_transfer_qty",
    "fc_processing_qty",
    "customer_order_qty",
    "unfulfillable_qty",
    "working_qty",
    "shipped_qty",
    "receiving_qty",
    "total_days_of_supply_including_open_shipments",
    "days_of_supply_amazon_fulfillment_network"
  ],
  notes: "site_sku is intentionally left blank in MVP and will be filled later by joining country + marketplace + sku to marketplace_skus."
}
```

### Config 2 — `amazon_inventory_health_snapshot`
```js
{
  sourceId: "1ZQt9PPfm7k0bTepoQjBB7zDjzDUrzE0GJh3nhtOWto4",
  sourceSheetName: "Combined Sheet",
  destinationSpreadsheetId: "1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk",
  destinationSheetName: "amazon_inventory_health_snapshot",
  sourceSystem: "Google Sheet Import",
  sourceReport: "Amazon Inventory Health",
  fixedValues: {
    marketplace: "Amazon"
  },
  fieldMap: {
    snapshot_date: "Date",
    country: "Country",
    sku: "SKU",
    asin: "ASIN",
    available_qty: "Available",
    inv_age_0_to_90_days: "inv-age-0-to-90-days",
    inv_age_61_to_90_days: "inv-age-61-to-90-days",
    inv_age_91_to_180_days: "inv-age-91-to-180-days",
    inv_age_181_to_270_days: "inv-age-181-to-270-days",
    inv_age_271_to_365_days: "inv-age-271-to-365-days",
    inv_age_365_plus_days: "inv-age-365-plus-days"
  },
  rowHashFields: [
    "snapshot_date",
    "country",
    "marketplace",
    "sku",
    "asin",
    "available_qty",
    "inv_age_0_to_90_days",
    "inv_age_61_to_90_days",
    "inv_age_91_to_180_days",
    "inv_age_181_to_270_days",
    "inv_age_271_to_365_days",
    "inv_age_365_plus_days"
  ],
  notes: "site_sku is intentionally left blank in MVP and will be filled later by joining country + marketplace + sku to marketplace_skus."
}
```

### Config 3 — `amazon_weekly_sales_snapshot`
```js
{
  sourceId: "1O5BBJiJsubq8Ei_cRQggY2_1ZfIXGvs8o1f_hiMHQqA",
  sourceSheetName: "Combined Sheet",
  destinationSpreadsheetId: "1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk",
  destinationSheetName: "amazon_weekly_sales_snapshot",
  sourceSystem: "Google Sheet Import",
  sourceReport: "Amazon Weekly Sales",
  fixedValues: {
    marketplace: "Amazon"
  },
  derivedFields: {
    snapshot_month: "deriveMonthFromWeek",
    week_start_date: "deriveStartDateFromWeek",
    week_end_date: "deriveEndDateFromWeek"
  },
  fieldMap: {
    snapshot_week: "Week",
    country: "Marketplace",
    channel: "Channel",
    sku: "SKU",
    currency: "Currency",
    sales_units_7d: "Sales Units",
    sales_amount_7d: "Sales Amount",
    sales_amount_usd_7d: "Sales Amount$",
    return_units_7d: "Return Units",
    total_orders_7d: "Total Orders",
    session_7d: "Session",
    page_view_7d: "Page View",
    unit_session_percentage_7d: "Unit Session Percentage"
  },
  rowHashFields: [
    "snapshot_week",
    "country",
    "marketplace",
    "channel",
    "sku",
    "currency",
    "sales_units_7d",
    "sales_amount_7d",
    "sales_amount_usd_7d",
    "return_units_7d",
    "total_orders_7d",
    "session_7d",
    "page_view_7d",
    "unit_session_percentage_7d"
  ],
  notes: "site_sku and asin are intentionally left blank in MVP. snapshot_month, week_start_date, and week_end_date are derived from Week formatted like 2026-06-15~2026-06-21."
}
```

### Config 4 — `amazon_daily_sales_snapshot` (BigQuery)
```js
{
  sourceType: "bigquery",
  sourceProjectId: "amazon-database-489810",
  sourceDataset: "AmazonSales",
  sourceTable: "Raw Daily Sales",

  queryMode: "rolling_window",
  dateField: "Date",
  lookbackDays: 30,
  excludeToday: true,
  scheduleTime: "16:00",
  scheduleTimezone: "Asia/Taipei",

  destinationSpreadsheetId: "1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk",
  destinationSheetName: "amazon_daily_sales_snapshot",

  sourceSystem: "BigQuery Import",
  sourceReport: "Amazon Daily Sales",

  fixedValues: {
    marketplace: "Amazon"
  },

  fieldMap: {
    snapshot_date: "Date",
    country: "Marketplace",
    channel: "Channel",
    sku: "SKU",
    currency: "Currency",
    sales_units: "Sales_Units",
    sales_amount: "Sales_Amount",
    sales_amount_usd: "Sales_Amount_",
    return_units: "Return_Units",
    total_orders: "Total_Orders",
    session: "Session",
    page_view: "Page_View",
    unit_session_percentage: "Unit_Session_Percentage",
    buy_box_percentage: "Buy_Box_Percentage",
    browser_session: "browser_session",
    browser_page_views: "browser_page_views",
    app_session: "app_session",
    app_page_view: "app_page_view"
  },

  rowHashFields: [
    "snapshot_date",
    "country",
    "marketplace",
    "channel",
    "sku",
    "currency",
    "sales_units",
    "sales_amount",
    "sales_amount_usd",
    "return_units",
    "total_orders",
    "session",
    "page_view",
    "unit_session_percentage",
    "buy_box_percentage",
    "browser_session",
    "browser_page_views",
    "app_session",
    "app_page_view"
  ],

  notes: "Pull a rolling 30 completed-day window excluding today (window ends yesterday). Feeds the Sales Trend 7-day display and the Normalized Avg Sales 30-day calculation. This handles timezone and Amazon reporting delay. site_sku and asin are intentionally left blank in MVP."
}
```

---

**Draft v1 — Amazon Snapshot Import Mapping Reference Spec. Spec only. No code, Apps Script, DB/API, frontend, route, or migration changes are implied by this document. The config blocks above are the authoritative source of truth for the upcoming config-driven importer.**

**End of Document**
