# Amazon Snapshot Import — Mapping Reference Spec

> **Owner Boundary (reviewed 2026-07-28).**
> - **Document Role:** the single **Amazon import contract** — how four Amazon sources map into four snapshot tabs + import governance.
> - **Canonical Owner For:** the Amazon Raw → Snapshot mapping and import-governance rules.
> - **Not Owner For:** the canonical **Domain product identity** `marketplace_product_id` (owner `DATABASE_RELATIONSHIP_MAP.md` / `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`), formulas, recommendation runtime.
> - **Status:** Reviewed — Batch B Blockers Remain.
> - **Current Version:** Draft v1.9 (Round 4D-C: added the Platform-Observation-vs-KM-Planning-Admission boundary — import persists observations only, never grants planning admission; documentation only, NO config change). v1.8 (Batch A repair: raw-asin→domain clarification + staged-success note; no config change).
> - **Last Reviewed:** 2026-07-28.
> - **Depends On:** Database Relationship Map (domain identity), Runtime Architecture (cadence).
> - **Blocked By:** none specific to import (the recommendation pipeline it feeds has Batch B blockers — see `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11).
> **Raw vs Domain identity (Batch A 2026-07-28).** The `asin` column mapped in the config blocks below is a **RAW Amazon snapshot source field** on the `amazon_*_snapshot` tabs — retained because the source report supplies it. The **canonical Domain product identity is `marketplace_product_id`** (platform-neutral), owned by the **`marketplace_skus` / SKU Master Domain section of [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md)** and by **[`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`](./SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md) §5**. **`asin` is NOT a shared cross-marketplace Domain column.** The normalization boundary is **`raw asin → marketplace_product_id`**, performed downstream of import; this spec does not treat `asin` as the domain key.
>
> **Outcome-stage separation (Batch A 2026-07-28) — these are distinct results, never auto-equal:**
>
> | Stage | Meaning |
> |---|---|
> | **Import Job Completed** | Import process finished without execution error |
> | **Snapshot Persist Verified** | Expected snapshot rows were successfully written and verified |
> | **Analysis Ready** | Required normalized inputs are available and eligible for calculation |
> | **Recommendation Snapshot Written** | A non-commit recommendation result was persisted |
> | **Decision Committed** | A user action created a formal business commitment |
>
> Import Job Completed ≠ Snapshot Persist Verified ≠ Analysis Ready ≠ Recommendation Snapshot Written ≠ Decision Committed. **A successful Amazon import never implies replenishment/order Analysis ran, nor that a recommendation was produced, nor that anything was committed** (see `SYSTEM_RUNTIME_ARCHITECTURE.md` §7 "outcome boundary", `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md` §H).

**Status:** 🟡 Draft v1.9 — Mapping + import-governance reference spec (Daily Sales now uses a **gap-aware rolling 90-completed-day upsert** with missing/incomplete-date recovery + recent reconciliation + locking; supersedes the earlier "import yesterday only / 30-day retention / latest-per-group fallback"; NO DB migration, NO BigQuery schema change, NO API, NO frontend, NO routes)
**Last Updated:** 2026-07-24
**Maintained By:** Development Team
**Audience:** developers building the config-driven importer · OP / data stakeholders
**Cross-reference (context only, not edited here):** [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) (Inventory Layer notes a *future* `amazon_inventory_snapshot`).

> **Spec only.** This document records the **finalized mapping rules** for importing Amazon snapshot data into the Operation System DB Google Sheet, **plus the import-governance rules** around those imports. It introduces **no** code, Apps Script, DB schema/migration, API, or frontend change. It is the authoritative reference for the **next** task: refactoring Apps Script into a **config-driven importer**. The config blocks in §7 and the Appendix (§27) are the **source of truth** and are reproduced verbatim.

### Changelog

- **Draft v1.8 (2026-07-24)** — **Daily Sales canonical source window corrected to a rolling 90 completed days + honest runtime status.** The canonical Daily Sales contract is a **gap-aware rolling 90-completed-day upsert + prune** (`retentionDays: 90`, `lookbackDays: 90`, backfill ceiling 90); this is the source window feeding `SUPPLY_PLANNING_CALCULATION_RULES.md` §22.2 (90-day search → latest 30 eligible normal days). Fixed residual active 30-day references (§7.4 comparison table `backfill_days` ceiling, config notes) to 90; 30-day text now survives only in historical v1.6/v1.7 changelog and clearly-marked SUPERSEDED / Runtime-Gap notes. Constrained the generic "clear-and-rewrite" / "upsert is a future enhancement" statements to **Configs 1–3 only** — Config 4 `amazon_daily_sales_snapshot`'s canonical strategy is already `rolling_upsert`. Reworded the §7.4 runtime-mapping note so listed function names are components to **verify/update**, not proof of implementation. **Canonical requirement: gap-aware rolling 90-completed-day upsert; Runtime implementation/verification: PENDING.** Spec-only: NO Apps Script, DB, API, frontend, or route change in this task. *(Residual cleanup, same v1.8 — no version bump: made the §2 Import Architecture diagram, the §5 metadata/upsert note, and the §8 Import Flow Config-specific so Config 4 Daily Sales is never described as clear-and-rewrite and `rolling_upsert` is stated as the canonical contract with Runtime NOT IMPLEMENTED; corrected the §9 "Spec only" intro's Appendix cross-reference from §21 to §27.)* *(Round-3 residual cleanup, same v1.8: §5 metadata table `created_at`/`updated_at` rows made Config-lifecycle-aware (Configs 1–3 set both each write; Config 4 sets `created_at` on insert only + preserves on update, refreshes `updated_at`, no churn on unchanged rows); §7.4 comparison table Volume-control row reworded to the gap-aware read (not "default 1 day = yesterday", not unconditional 90-day re-read; `incrementalDefaultDays:1` = legacy, not consumed); §7.4 + §15 schedule reconciled to the canonical 12:00–13:00 trigger window with `scheduleTime:16:00` marked legacy-not-consumed; removed-fallback contract made consistent — `is_fallback_used`/`fallback_reason`/`fallback_group_count` marked legacy-compatibility (canonical gap-aware path performs NO fallback → FALSE/blank/0; missing dates = `source_unavailable`, retried), and §26 "Daily-sales fallback implementation" replaced with "Source-unavailable date visibility and alerting".)*
- **Draft v1.7 (2026-07-01)** — **Amazon Daily Sales → incremental rolling upsert + prune (Daily Sales ONLY).** Config 4 (§7.4, §4, Appendix) gains `writeMode: rolling_upsert`, `retentionDays: 30`, `incrementalDefaultDays: 1` (`lookbackDays: 30` kept as the backfill ceiling). Each daily run now reads **only new completed-day data (default 1 = yesterday)**, **UPSERTs** by natural key `snapshot_date + country + marketplace + channel + sku` (**no full-table rewrite**), then **prunes** destination rows older than 30 days. **BigQuery keeps full history (never pruned); the Google Sheet keeps a rolling 30 completed days.** POST `backfill_days: N` re-reads the last N completed days and upserts them. `import_sync_runs.quality_note` records `write_mode=rolling_upsert; rows_pruned=<n>`. **No new column, no BigQuery schema change.** Implemented in `06_amazon_import_config.gs` (config), `07_amazon_import_runner.gs` (rolling_upsert branch + `options.backfillDays`), `08_amazon_import_sources.gs` (incremental read window), `09_amazon_import_writer_logger.gs` (`amazonUpsertRollingSnapshot_` + `amazonRollingCutoffDate_`). **Configs 1–3 (Inventory / Health / Weekly) unchanged (full snapshot rewrite).**
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
        ↓   PRESERVE header row, then write per THAT config's canonical mode:
        ├─ Configs 1–3 (Inventory / Health / Weekly Sales): CLEAR + REWRITE data rows
        └─ Config 4 (Daily Sales): rolling_upsert by natural key + prune to the latest
                                    90 completed calendar days  (canonical write mode;
                                    this rolling-upsert Runtime is NOT IMPLEMENTED)
```

### Two source modes
- **Google Sheet sources (1–3):** read the `Combined Sheet` tab of the source spreadsheet identified by `sourceId`.
- **BigQuery source (4):** query the table `amazon-database-489810.AmazonSales.Raw Daily Sales` using a **rolling window** (see §4 and §7.4), fetching **only the needed fields and the recent rolling window** — not the full table.

The destination write behaviour preserves the header. **Configs 1–3 (Inventory / Health / Weekly Sales) clear-and-rewrite the data rows in MVP.** **Config 4 (`amazon_daily_sales_snapshot`) is the EXCEPTION — it uses a gap-aware `rolling_upsert` + prune (90-completed-day retention), NOT clear-and-rewrite** (§7.4 / §20). Do not describe Daily Sales as clear-and-rewrite.

---

## 3. Common Rules

These apply to **all four** sources unless a config note overrides them.

1. **Destination DB headers are authoritative.** The destination tab's header row defines the schema and the column the importer writes to.
2. **Map source headers into destination headers.** The importer matches by **header name** via `config.fieldMap` (`destination_header: "Source Header"`).
3. **Do not rely on source column order.** Source columns may be reordered; resolve every field by its header text.
4. **Preserve the destination header row.** Never rewrite or reorder the header row.
5. **Configs 1–3 snapshot tables clear and rewrite data rows in MVP.** Each sync clears existing data rows (below the header) and writes the fresh snapshot. **Config 4 `amazon_daily_sales_snapshot` is the EXCEPTION** — it uses a gap-aware `rolling_upsert` + prune to a rolling **90 completed days** (§7.4 / §20), never clear-and-rewrite. (For configs 1–3, upsert remains a future enhancement — §9.)
6. **`marketplace` is fixed as `Amazon`** for every row (via `fixedValues`).
7. **`site_sku` and `asin` may be left blank in MVP** where a config's `notes` says so (see per-source notes in §7). They are **not** invented or looked up yet.
8. **Source metadata is system-generated** by the importer per the config (§5).
9. **`source_row_hash` is generated** from the configured `rowHashFields` (§6).
10. **`sync_batch_id` is generated once per sync run** and stamped on every row of that run (§5).
11. **`synced_at` / `created_at` / `updated_at` are generated at sync time** (§5).
12. **Dates are normalized to `yyyy-MM-dd`** (§4).
13. **Weekly date ranges** (e.g. `2026-06-15~2026-06-21`) are parsed into `snapshot_week`, `snapshot_month`, `week_start_date`, `week_end_date` (§4, §7.3).
14. **BigQuery** fetches only the needed fields and **only the dates needing recovery** inside the rolling **90 completed-day** window (gap-aware: missing + incomplete + recent-3), excluding today (§4, §7.4).

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

### BigQuery gap-aware rolling upsert (config 4 — Amazon Daily Sales) — CANONICAL 2026-07-21

> **SUPERSEDED:** the earlier rule — *"the scheduled process imports only yesterday (`incrementalDefaultDays: 1`) with a 30-day retention and a latest-per-group fallback when the window is empty"* — is **superseded**. It did **not** recover dates missed when a trigger was disabled/failed or when BigQuery arrived late, leaving gaps (e.g. 2026-07-06, then 2026-07-17/18, with 07-07…07-16 missing). The canonical behavior is now a **gap-aware rolling 90-completed-day sync**.

- **Rolling retention = latest 90 COMPLETED calendar days** (`retentionDays: 90`), `Asia/Taipei`, **today excluded** (`excludeToday: true`): end = yesterday, start = yesterday − 89 (inclusive → exactly 90 dates). Boundary computed explicitly by `amazonRetentionWindow_` (10) — not an ambiguous `DATE_SUB(today, 90)`.
- **Every run is gap-aware** (`amazonReadDailyGapAware_`, 08): (1) compute the 90-day window; (2) inspect **BigQuery source** coverage per date (row + distinct-natural-key counts); (3) inspect **destination** coverage per date (row + distinct-key counts + duplicates); (4) identify **missing** dates (in source, not in destination) and **incomplete** dates (destination distinct-key count < source, or destination has duplicate keys); (5) fetch **only** the dates needing recovery (plus a small recent-reconciliation window); (6) **UPSERT by natural key** (`snapshot_date + country + marketplace + channel + sku`) — no full-table rewrite, no unconditional 90-day re-read; (7) **prune** rows with `snapshot_date < retention_start`; (8) log verification results.
- **Completeness ≠ existence:** a date is NOT skipped just because ≥1 destination row exists — it is compared by source vs destination **row count and distinct-natural-key count**, and destination duplicate keys mark it incomplete (repaired by the keyed upsert, which collapses duplicates last-wins).
- **Recent late-arrival reconciliation:** the most recent **`reconcileRecentDays: 3`** source-available dates are **always** re-fetched and reconciled by `source_row_hash` (changed rows → updated; identical → counted unchanged; no rewrite churn) — this absorbs late/revised Amazon data without rewriting the whole 90-day history.
- **Initial recovery / missed-trigger:** on the first run after this change, **all** available missing/incomplete dates inside the 90-day window are recovered automatically — **without** deleting valid existing data and **without** requiring a one-time manual `backfill_days` for ordinary in-window gaps.
- **No `1 → 90` shortcut:** the daily read is **not** "read 90 days every day". Only gap + recent-reconciliation dates are fetched. `incrementalDefaultDays: 1` is **legacy metadata, not used** by the gap-aware path.
- **Idempotent + failure-safe:** guarded by a `LockService` script lock (two triggers can't prune/upsert at once); a failed BigQuery read aborts **before** any prune/write (valid retained data is never destroyed); running twice the same day yields identical data and no duplicate keys.
- The retained 90 days feed the **Sales Trend 7-day display** and the **Normalized Avg Sales 30-day calculation** (`SUPPLY_PLANNING_CALCULATION_RULES.md` §22). **No new `amazon_daily_sales_snapshot` column and no BigQuery table schema change.** BigQuery keeps full history and is never pruned.
- **Daily sync schedule (RECONCILED 2026-07-20):** canonical Daily Report Pipeline runs in the 12:00–13:00 `Asia/Taipei` trigger window on `runAmazonSnapshotImports`. `scheduleTime: "16:00"` is **LEGACY metadata not consumed by Runtime** (only `scheduleTimezone` is read). The trigger is created **manually** in the Apps Script UI (no trigger-creation code in the project). **Do NOT add a second duplicate same-day Daily Sales import.**

#### Daily Sales source-unavailable rule (a date has no source rows)

> **SUPERSEDED:** the earlier *"latest-per-group fallback when the rolling window is empty"* is **removed** for the gap-aware path. Gap detection + recent reconciliation recover real missing/incomplete dates; a truly source-less date is reported, not back-filled with older data.

- A calendar date inside the window with **no rows in BigQuery** is recorded as **`source_unavailable`** — **never fabricated**, never marked imported, and **re-checked automatically** on later runs while it remains inside the window. If the source later provides it, ordinary gap recovery imports it.
- A missing **destination** date and a missing **source** date are different problems: only source-available dates are ever fetched.
- Fallback data must **preserve its real `snapshot_date`** and must **never** cause a missing calendar date to be considered complete. The old latest-per-group fallback is not invoked in the rolling path.

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
| `synced_at` | generated at sync time (each run that writes the row) |
| `created_at` | **Configs 1–3 (clear-and-rewrite):** set at each sync that writes the row. **Config 4 (rolling_upsert):** set on **insert only**; on **update** it is **preserved** (not regenerated); an **unchanged** row is not rewritten. See the Config-specific note below. |
| `updated_at` | **Configs 1–3:** set at each sync that writes the row. **Config 4:** set on insert; **refreshed on update**; an unchanged row causes **no** timestamp churn. |

> **Configs 1–3:** the active snapshot write mode remains **clear-and-rewrite**; `created_at` and `updated_at` are both set at the sync that writes the row. (For Configs 1–3, an upsert mode that preserves `created_at` and refreshes only `updated_at` is a future enhancement — §9.)
>
> **Config 4 Daily Sales:** `rolling_upsert` is already the **canonical write contract** (not a future extension) — on upsert, `created_at` must be preserved and only `updated_at` refreshed. The required 90-completed-day rolling-upsert Runtime remains **NOT IMPLEMENTED** (there is no executable importer for it yet — §7.4 / §20).

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

> **`inv_age_0_to_90_days` is imported and stored, but it is NOT part of the Long Term Storage Over 90+ display.** Over 90+ uses only `inv_age_91_to_180_days` (the consumer formula lives in [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md) §5). The `0–90` bucket stays in the schema/import for completeness and future use.

| Kind | Fields |
|------|--------|
| Direct source mappings (REQUIRED `fieldMap`) | `snapshot_date`←Date, `country`←Country, `sku`←SKU, `asin`←ASIN, `available_qty`←Available |
| Optional source mappings (`optionalFieldMap`, map-if-present else blank) | `inv_age_0_to_90_days`←inv-age-0-to-90-days, `inv_age_91_to_180_days`←inv-age-91-to-180-days, `inv_age_181_to_270_days`←inv-age-181-to-270-days, `inv_age_271_to_365_days`←inv-age-271-to-365-days, `inv_age_365_plus_days`←inv-age-365-plus-days, `inv_age_366_to_455_days`←inv-age-366-to-455-days, `inv_age_456_plus_days`←inv-age-456-plus-days. **`inv_age_61_to_90_days` is REMOVED** (superseded by the `0–90` bucket; must not be mapped). |
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
  // REQUIRED source headers (validated before any write) — core identity + Available only.
  fieldMap: {
    snapshot_date: "Date",
    country: "Country",
    sku: "SKU",
    asin: "ASIN",
    available_qty: "Available"
  },
  // OPTIONAL source headers — map only if present; missing => blank (never fails the import).
  // inv-age-61-to-90-days REMOVED (superseded by the 0–90 bucket).
  // inv-age-365-plus-days = backward-compatible top bucket (old reports);
  // inv-age-366-to-455-days / inv-age-456-plus-days = newer finer buckets (preferred when available).
  optionalFieldMap: {
    inv_age_0_to_90_days: "inv-age-0-to-90-days",
    inv_age_91_to_180_days: "inv-age-91-to-180-days",
    inv_age_181_to_270_days: "inv-age-181-to-270-days",
    inv_age_271_to_365_days: "inv-age-271-to-365-days",
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

### 7.4 `amazon_daily_sales_snapshot` (BigQuery, **gap-aware rolling upsert** + prune, excludes today)

**Write mode = `rolling_upsert` (Daily Sales ONLY).** The destination Google Sheet keeps a **rolling 90 completed days**; **BigQuery keeps full history and is never pruned**. Each run is **gap-aware**: it computes the 90-completed-day window, inspects **source and destination coverage per date**, fetches **only** missing/incomplete dates (plus a 3-day recent-reconciliation window), **UPSERTs** them by natural key (**no full-table rewrite, no unconditional 90-day re-read**), then **prunes** destination rows older than `retention_start`. Configs 1–3 are **unchanged** (full snapshot rewrite).

> **CANONICAL DATA-AVAILABILITY CONTRACT (2026-07-24).** Daily Sales `retentionDays` / `lookbackDays` / backfill ceiling = **latest 90 completed calendar days** (this is the source window that feeds `SUPPLY_PLANNING_CALCULATION_RULES.md` §22.2 — 90-day search → latest 30 eligible normal days). **BigQuery keeps full history but is NOT a Phase-1 prerequisite** — it is retained for future extension / long-term history; the 90-day Google-Sheet rolling window is the Phase-1 source.
>
> **RUNTIME MAPPING GAP (honest status).** This spec is the reference for the **importer refactor (next task)**. If the current Apps Script importer runtime still uses the earlier `retentionDays: 30` / `lookbackDays: 30` (v1.7), then: `Canonical Requirement: 90 completed days` · `Current Runtime: 30 days (verify 06_amazon_import_config.gs)` · **`Runtime Mapping Gap: PENDING IMPLEMENTATION`**. This round updated the **spec only** — no importer/Apps Script code was changed, and no claim is made that the 90-day window is live.

> **SUPERSEDED:** the previous behaviour — read **only yesterday** (`incrementalDefaultDays: 1`), 30-day retention, latest-per-group fallback — is superseded because it never recovered dates missed by a disabled/failed trigger or late BigQuery arrival. See the canonical gap-aware rule in "BigQuery gap-aware rolling upsert" above.

The 90 retained completed days serve: (a) the **Sales Trend 7-day display** (most recent 7 completed days) and (b) the **Normalized Avg Sales 30-day calculation** (event/promotion-day exclusion, `SUPPLY_PLANNING_CALCULATION_RULES.md` §22). **No new `amazon_daily_sales_snapshot` column and no BigQuery table schema change.**

**Plain language:** this source is **BigQuery**, not a Google Sheet. The importer queries `amazon-database-489810.AmazonSales.Raw Daily Sales`, fetching **only the mapped fields** and **only the dates that need recovery** inside the 90-day window (filtered on the `Date` field). Sales/traffic metrics are **direct source mappings** (`country` from `Marketplace`; BQ headers use underscores, e.g. `Sales_Units`, and `sales_amount_usd`←`Sales_Amount_`). `marketplace` is **fixed** (`Amazon`); metadata/hash/batch/timestamps are **importer-generated**. **Both `site_sku` and `asin` are blank in MVP.** `source_file_id` is the fully qualified BQ table reference and `source_sheet_name` is the BQ table name (or blank).

**Write mode — gap-aware rolling upsert + prune (authoritative):**

1. **Window:** `amazonRetentionWindow_(90)` → start = today−90, end = today−1 (`Asia/Taipei`, inclusive 90 completed days). Not `DATE_SUB(today, 90)` used ambiguously.
2. **Coverage inspection:** per-date **source** counts (`amazonQuerySourceDateCoverage_`, row + distinct-natural-key) and **destination** counts (`amazonReadDestDateCoverage_`, row + distinct-key + duplicates).
3. **Detect:** **missing** = source-has / destination-lacks; **incomplete** = destination distinct-key count < source, or destination has duplicate keys or a prior failed/incomplete log.
4. **Fetch only** the union of missing + incomplete + recent-3 (+ optional manual `backfill_days`, capped at `lookbackDays: 90`) that are source-available. **Upsert by natural key** `snapshot_date + country + marketplace + channel + sku` (update on hash change; unchanged when `source_row_hash` matches; append new; collapse destination duplicates last-wins). **No full-table clear.**
5. **Prune** destination rows where `snapshot_date < retention_start` (today−90). Header + all in-window rows preserved. **BigQuery is never pruned.**
6. **Source-unavailable** dates (in-window, no source rows) are recorded, never fabricated, re-checked on later runs.
7. **Idempotent + failure-safe:** `LockService` script lock serializes runs; a failed BigQuery read aborts before any prune/write.
8. `import_sync_runs` records the window, missing/incomplete/imported/source-unavailable/pruned date sets + `rows_inserted`/`rows_updated`/`rows_unchanged`/`duplicate_keys_detected` (new columns; also summarized in `quality_note`).
9. **Target runtime mapping — components to VERIFY or UPDATE in the later importer-refactor task** (not a claim of current implementation): `amazonReadDailyGapAware_` (08), `amazonUpsertRollingSnapshot_()` (09), the `rolling_upsert` branch in `runAmazonSnapshotImport_` (07), `amazonRetentionWindow_` / `amazonAddDaysStr_` (10). **The mere existence of these function names does NOT prove the canonical 90-day contract is implemented.** Current Runtime must be inspected and verified in the later runtime task (this round changed no Apps Script). In the canonical gap-aware path the legacy latest-per-group fallback is not used.

| Kind | Fields |
|------|--------|
| Direct source mappings | `snapshot_date`←Date, `country`←Marketplace, `channel`←Channel, `sku`←SKU, `currency`←Currency, `sales_units`←Sales_Units, `sales_amount`←Sales_Amount, `sales_amount_usd`←Sales_Amount_, `return_units`←Return_Units, `total_orders`←Total_Orders, `session`←Session, `page_view`←Page_View, `unit_session_percentage`←Unit_Session_Percentage, `buy_box_percentage`←Buy_Box_Percentage, `browser_session`←browser_session, `browser_page_views`←browser_page_views, `app_session`←app_session, `app_page_view`←app_page_view |
| Fixed values | `marketplace` = `Amazon` |
| Derived fields | — (none) |
| Query / write control (not destination fields) | `queryMode: rolling_window`, `dateField: Date`, **`writeMode: rolling_upsert`**, **`retentionDays: 90`** (rolling 90 completed days), **`reconcileRecentDays: 3`** (recent late-arrival reconciliation), `incrementalDefaultDays: 1` (legacy — NOT used by the gap-aware path), `lookbackDays: 90` (manual backfill ceiling), `excludeToday: true` (window ends yesterday), `scheduleTime: 16:00` (legacy metadata), `scheduleTimezone: Asia/Taipei` |
| Importer-generated | `source_system`, `source_report`, `source_file_id` (= `amazon-database-489810.AmazonSales.Raw Daily Sales`), `source_sheet_name` (`Raw Daily Sales` or blank), `source_row_hash`, `sync_batch_id`, `synced_at`, `created_at`, `updated_at` |
| Blank in MVP | `site_sku`, `asin` |

**Additional destination headers (importer-generated, v1.4) — fallback / data-window transparency:**

| Header | Type | Rule |
|--------|------|------|
| `data_window_start_date` | date `yyyy-MM-dd` | earliest source date actually included for this row's group |
| `data_window_end_date` | date `yyyy-MM-dd` | latest source date actually included for this row's group |
| `latest_source_date` | date `yyyy-MM-dd` | the most recent `snapshot_date` present for this row's group |
| `is_fallback_used` | boolean | **Legacy schema field (compatibility only).** The **canonical gap-aware path does NOT execute the latest-per-group fallback** (that behavior is SUPERSEDED, §4) — it writes **`FALSE` / blank**. A missing in-window date is recorded as `source_unavailable` and retried, never replaced by latest-available data. Older rows may retain historical `TRUE` values from the superseded path; those are **not** rewritten or re-fabricated. |
| `fallback_reason` | text | **Legacy schema field.** Stays **blank** on the canonical gap-aware path. Historical non-blank values from the superseded fallback are left as-is (not backfilled). |
| `data_age_days` | integer | days between `latest_source_date` and the sync date (0 = same-day; higher = staler) |

> `data_window_*` / `latest_source_date` / `data_age_days` are computed **per `country`/`marketplace`/`channel`/`sku` group**, so these per-row values may legitimately differ between groups (§4). They are **importer-generated destination headers**, **not** `fieldMap` entries — the config block below is unchanged. **The canonical gap-aware Runtime performs no fallback; `is_fallback_used`/`fallback_reason` remain legacy compatibility fields only.**

```js
{
  sourceType: "bigquery",
  sourceProjectId: "amazon-database-489810",
  sourceDataset: "AmazonSales",
  sourceTable: "Raw Daily Sales",

  queryMode: "rolling_window",
  dateField: "Date",
  writeMode: "rolling_upsert",     // gap-aware incremental upsert + prune (Daily Sales only)
  retentionDays: 90,               // CANONICAL v1.8: destination keeps the latest 90 COMPLETED days; older rows pruned
  reconcileRecentDays: 3,          // recent late-arrival reconciliation window
  incrementalDefaultDays: 1,       // legacy — NOT used by the gap-aware path
  lookbackDays: 90,                // backfill ceiling (POST backfill_days is capped at this)
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

  notes: "Gap-aware incremental rolling upsert: recover missing/incomplete completed-day data within the 90-day window (backfill_days widens up to 90), upsert by natural key (no full rewrite), then prune rows older than retentionDays (90). Google Sheet keeps a rolling 90 completed days; BigQuery keeps full history. Feeds the Sales Trend 7-day display and the Normalized Avg Sales calculation (latest 30 eligible normal days within the 90-day window). Handles timezone and Amazon reporting delay. site_sku and asin are intentionally left blank in MVP."
}
```

### Google Sheet vs BigQuery — key differences

| Aspect | Google Sheet sources (1–3) | BigQuery source (4) |
|--------|----------------------------|----------------------|
| Source identifier | `sourceId` (spreadsheet ID) + `sourceSheetName: "Combined Sheet"` | `sourceProjectId` / `sourceDataset` / `sourceTable` |
| Read mechanism | read all rows of the `Combined Sheet` tab | **query** with `queryMode: rolling_window`, filtered on `dateField` |
| Volume control | full sheet (snapshot already scoped) | **gap-aware:** every run inspects the latest **90 completed-day** source/destination coverage, then fetches **only** missing dates + incomplete dates + recent reconciliation dates (`reconcileRecentDays: 3`) + optional manual `backfill_days` (capped at `lookbackDays: 90`), excludes today; fetch only mapped fields. `incrementalDefaultDays: 1` is **legacy metadata — NOT consumed by the canonical gap-aware path** (neither a fixed daily "yesterday-only" read nor an unconditional 90-day re-read) |
| Write mode | full snapshot rewrite (clear + rewrite data rows) | **`rolling_upsert`**: upsert by natural key + prune to `retentionDays` (**90**, canonical §7.4/§20); header + non-batch rows preserved (no full rewrite) |
| Schedule | per importer schedule | Daily Report Pipeline trigger window **12:00–13:00 `Asia/Taipei`** — schedule owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A. `scheduleTime: "16:00"` is **LEGACY config metadata NOT consumed by Runtime** (only `scheduleTimezone` is read) — not the active schedule; no second same-day trigger |
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
Write Snapshot              (preserve header, then write per THAT config's canonical mode:)
   ├─ Configs 1–3:          clear and rewrite the data rows
   └─ Config 4 Daily Sales: rolling upsert by the canonical Daily Sales natural key, retain the
                            latest 90 completed calendar days (Avg. Sales/day then uses the latest
                            30 ELIGIBLE NORMAL sales days WITHIN that 90-day window — not 30 calendar
                            days, not the source window). Runtime status: NOT IMPLEMENTED.
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
- **Use case — Amazon Inventory Health age buckets (§7.2):** **all** inventory-age buckets are optional (`inv_age_0_to_90_days`, `inv_age_91_to_180_days`, `inv_age_181_to_270_days`, `inv_age_271_to_365_days`, `inv_age_365_plus_days`, `inv_age_366_to_455_days`, `inv_age_456_plus_days`). A source missing any of them still imports successfully (those fields blank → 0 on read); only the core headers (Date, Country, SKU, ASIN, Available) are required. **`inv_age_61_to_90_days` is removed and must not be mapped.**

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

- The **exact time is Runtime scheduling configuration** and can be adjusted later.
- The canonical **daily BigQuery** (config 4) sync runs in the Daily Report Pipeline **12:00–13:00 `Asia/Taipei`** trigger window — schedule owned by `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A. The config block's `scheduleTime: "16:00"` is **legacy metadata NOT consumed by Runtime** (only `scheduleTimezone` is read) — it is not the active schedule, and no second same-day trigger is created.
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
| `is_fallback_used` | boolean | **Legacy compatibility field.** The canonical gap-aware path performs **no** fallback (SUPERSEDED, §4) → **`FALSE`**. In-window dates with no source rows are logged as `source_unavailable` and retried. |
| `fallback_group_count` | integer | **Legacy compatibility field.** Canonical gap-aware path → **`0`** (no group fallback is performed). |
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

- Snapshot tabs (configs 1–3: Inventory / Health / Weekly Sales) are refreshed by **clear-and-rewrite of the data rows** (header preserved).
- **Exception — `amazon_daily_sales_snapshot` (config 4) uses a gap-aware incremental rolling upsert + prune** (`writeMode: rolling_upsert`, §7.4): each run **upserts** only missing/incomplete completed-day rows by natural key (no clear-and-rewrite) and **prunes** rows older than `retentionDays` (**90**, canonical). The tab therefore holds a **rolling 90 completed days** — a bounded window, still not a permanent archive. *(Canonical requirement = 90 completed days; if the current importer runtime still prunes at 30, that is a recorded Runtime Gap — §7.4 — not a canonical change.)*
- They represent the **latest operational snapshot** available to the system.
- They are **not** designed as the long-term historical archive in MVP.
- **Do not** describe the Google Sheet snapshot tabs as holding full permanent row-level history.
- Historical retention lives in **BigQuery** (the Daily Sales source table keeps full history and is **never pruned** by the importer); a dedicated history table may be added later.
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
- **Manual edits to snapshot rows may be replaced or reconciled by a subsequent system sync** according to that config's canonical write mode (§20) — clear-and-rewrite for Configs 1–3; gap-aware `rolling_upsert` + prune for Config 4 `amazon_daily_sales_snapshot`.
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
- **Upsert mode for Configs 1–3** instead of clear-and-rewrite (preserve `created_at`, refresh `updated_at`, key on `source_row_hash` or natural keys). *(Config 4 `amazon_daily_sales_snapshot` already uses canonical `rolling_upsert` — not a future enhancement.)*
- **Import logs table** (per-run summary).
- **Error reports** (rejected/invalid rows).
- **BigQuery partition optimization** (e.g. partition pruning on the date field).
- **API-based Amazon sync** (replace sheet/BQ staging with direct API pulls).
- **Source-unavailable date visibility and alerting** — surface, per group, the `source_unavailable` in-window dates and the actual data date range used, for runtime/UI observability (§4). *(This does NOT reintroduce a latest-available fallback — missing dates are retried, never substituted.)*
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
  // Core identity + Available are required; all age buckets are optional (reports vary).
  fieldMap: {
    snapshot_date: "Date",
    country: "Country",
    sku: "SKU",
    asin: "ASIN",
    available_qty: "Available"
  },
  // inv-age-61-to-90-days REMOVED (superseded by the 0–90 bucket). Any subset of buckets is allowed.
  optionalFieldMap: {
    inv_age_0_to_90_days: "inv-age-0-to-90-days",
    inv_age_91_to_180_days: "inv-age-91-to-180-days",
    inv_age_181_to_270_days: "inv-age-181-to-270-days",
    inv_age_271_to_365_days: "inv-age-271-to-365-days",
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
    "inv_age_91_to_180_days",
    "inv_age_181_to_270_days",
    "inv_age_271_to_365_days",
    "inv_age_365_plus_days",
    "inv_age_366_to_455_days",
    "inv_age_456_plus_days"
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
  writeMode: "rolling_upsert",     // gap-aware incremental upsert + prune (Daily Sales only)
  retentionDays: 90,               // CANONICAL v1.8: destination keeps the latest 90 COMPLETED days; older rows pruned
  reconcileRecentDays: 3,          // recent late-arrival reconciliation window
  incrementalDefaultDays: 1,       // legacy — NOT used by the gap-aware path
  lookbackDays: 90,                // backfill ceiling (POST backfill_days is capped at this)
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

  notes: "Gap-aware incremental rolling upsert: recover missing/incomplete completed-day data within the 90-day window (backfill_days widens up to 90), upsert by natural key (no full rewrite), then prune rows older than retentionDays (90). Google Sheet keeps a rolling 90 completed days; BigQuery keeps full history. Feeds the Sales Trend 7-day display and the Normalized Avg Sales calculation (latest 30 eligible normal days within the 90-day window). Handles timezone and Amazon reporting delay. site_sku and asin are intentionally left blank in MVP."
}
```

---

## Platform Observation vs KM Planning Admission (CANONICAL 2026-08-01 Round 4D-C — documentation only; NO config change; Runtime NOT implemented)

- Amazon import **persists observations only** (`amazon_inventory_snapshot`); import **never grants planning admission**.
- An **unlinked platform operation / bucket** (`fc_transfer_qty` / `fc_processing_qty` / inbound / receiving / current) remains **source-separated** and is **never merged** with 3PL / overseas incoming (`INVENTORY_TABLE_MAPPING_SPEC.md` §16).
- **External freshness does not equal KM approval.** Platform-internal movements may be **Ignored for Planning** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §12).
- Reliable linkage to a KM Shipment turns platform data into **execution evidence** (never a second independent Incoming bucket; count-once `SUPPLY_PLANNING_CALCULATION_RULES.md` §30/§38).
- Platform observations **cannot directly update KM stock** — only a validated, idempotent KM transaction may.
- No fuzzy matching (stable source identity only). **No config, importer, DB, API, or Runtime is changed in this round.**

---

**Draft v1.9 — Amazon Snapshot Import Mapping Reference Spec. Spec only. No code, Apps Script, DB/API, frontend, route, or migration changes are implied by this document. The config blocks above are the authoritative source of truth for the upcoming config-driven importer.**

**End of Document**
