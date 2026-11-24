# Production Amazon Imports: Inventory Recovery and Per-Site Sales Windows

Baseline: `af65c092` plus the Owner-supplied Production `07_` source-revision wrapper.

## Confirmed Cause

Read-only Production inspection found inventory runs on November 23 and November 24 failing with `missing_required_header` for these two fields:

- `Total Days of Supply (including units from open shipments)`
- `Days of Supply at Amazon Fulfillment Network`

The configured source Combined Sheet currently has 18 populated headers and no longer contains those two optional report metrics. The source contains November 23 data, while the destination retained its November 1 snapshot after failed validation. This is not a missing time trigger.

## Changes

- Inventory: move only the two Days of Supply metrics to `optionalFieldMap`. Missing values stay blank, not zero or invented. Existing capped-value support remains. Date, country, SKU and all core stock headers remain required.
- Daily Sales: `windowMode=site_latest`, site identity = `country + marketplace`. Query each site's latest available BQ date strictly before today in `Asia/Taipei`. Keep its inclusive `[latest - 89 days, latest]` calendar window. SKU/channel still distinguish natural keys; they do not get separate latest-date anchors.
- Example, not a claim about live BQ dates: US ending November 23 keeps August 26-November 23; JP ending November 20 keeps August 23-November 20. Source gaps are reported, never filled with zero sales or dates relabeled as current.
- Missing/incomplete dates, recent 3-source-date reconciliation and manual `backfill_days` are per site. Query only the requested site/date pairs after coverage inspection. Source BQ history is read-only and never pruned.
- Destination prune uses the same site's bounds, not a global yesterday cutoff. Sites absent from completed source coverage are preserved and identified in the run note. If there is no completed source coverage at all, fail and preserve the snapshot rather than clearing it.
- Refresh existing per-row window/date-age metadata even on retained rows not refetched. Existing `quality_note` records compact per-site windows/counts. Run-level start/end are an envelope across sites, not a promise that every site shares those dates.
- Grow destination data-row capacity before clearing/writing when recovery requires more rows. No sheet creation, header rewrite or new columns. If capacity expansion fails, existing data is untouched.
- A mismatched old reader/writer fails closed. An unfinished BigQuery job cannot masquerade as an empty successful result. Scheduler still runs later configured sources after a normal per-source failure, logs summaries, then reports `AMAZON_IMPORT_FAILED`; API also reports failed children instead of unconditional success.
- Preserve the Owner's Production `kmSrcRevMark_` / `kmSrcRevBump_` wrapper and the existing Inventory Health detail-log exclusion. No auth, router, OAuth, source/destination ID, stock movement, receipt or Sandbox changes.

## Database Columns

**No DB columns need to be added or moved.** Verified existing Daily Sales governance fields are `AE:AJ`: `data_window_start_date`, `data_window_end_date`, `latest_source_date`, `is_fallback_used`, `fallback_reason`, `data_age_days`. Per-site run summaries use existing `import_sync_runs.quality_note` (`AB`). Inventory's existing optional metric columns remain in place.

## Install in Production

Git push does not install Apps Script or repair cloud snapshot rows by itself.

1. Use `output/amazon-inventory-site-window-20261124/release-1/Production/apps-script/`. Update **only these five files** in the existing Production Apps Script project: `06_amazon_import_config.gs`, `07_amazon_import_runner.gs`, `08_amazon_import_sources.gs`, `09_amazon_import_writer_logger.gs`, `10_amazon_import_helpers.gs`.
2. Install `08_`, `09_`, `10_`, then `07_`; install `06_` last to activate the new config. Do this when no import is executing. Keep `00_`, `01_`, `02_`, `84_` and all other modules unchanged.
3. Save all files. The existing timer still calls `runAmazonSnapshotImports`; do not create a duplicate trigger or change its schedule. Time triggers use saved project code; redeploy the existing Web App as a new version only if the API entry point also needs the change.
4. To recover immediately, run `runAmazonSnapshotImports` once from the editor after installation. This is a real report import and may backfill missing sales dates. Do not start concurrent copies; wait for the first run to finish.
5. Confirm inventory status is success, `rows_written > 0`, and snapshot dates come from the source report. Confirm Daily Sales `site_windows` in execution output and `quality_note` match each site's own latest completed date, not one shared date. Confirm older/unknown sites are reported honestly rather than treated as fresh.

## Verification

- `node --test assets/tests/amazon-site-latest-import.cjs assets/tests/amazon-health-issue-logging.test.cjs`
- `node assets/tests/amazon-daily-sales-date-key.test.js`
- `node assets/tests/amazon-daily-sales-dedup.test.js`

Tests execute the real 06-10 code against isolated Sheets/BQ boundaries. Production reads used only metadata, headers, date/country columns and relevant import-run logs. No live import, BQ query, snapshot write or trigger change was performed by Codex. Live BQ SQL execution and the first real import remain operator acceptance steps.

## Rollback

Restore this package's `rollback/apps-script/` files together. The `07_` rollback comes from the exact source supplied by the Owner, not the older Git mirror. No database schema rollback is required. Code rollback does not restore data already pruned by a completed new-policy import; use normal spreadsheet version history/backup for data recovery. Do not clear import logs to hide a failed run.
