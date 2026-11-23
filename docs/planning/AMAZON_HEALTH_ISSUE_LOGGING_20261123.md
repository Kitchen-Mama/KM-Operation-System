# Amazon Health Issue Logging - 2026-11-23

## Scope

Owner requested excluding `amazon_inventory_health_snapshot` details from
`import_sync_issues` because this report dominates the log with incomplete-data issues.

`amazonLogIssues_` omits only entries whose `destination_table` is exactly
`amazon_inventory_health_snapshot`, including its warning/error/critical entries.
Mixed batches retain the other reports, in order. The caller's issues are not mutated.
An excluded-only batch does not open the log spreadsheet; fallback Logger output also
omits excluded details. Logging remains best-effort.

Validation, numeric normalization, row skipping, deduplication, snapshot writes,
run status/error summaries and API issue counts are unchanged. Failed Health imports
still appear as failed in `import_sync_runs`. This is not a data-quality repair and
does not declare incomplete data valid. Other Amazon report issues are unchanged.

## Exact Manual Sync

- `APPS_SCRIPT_SYNC_REQUIRED`: `09_amazon_import_writer_logger.gs` only, from
  `assets/specs/active/apps-script/`.
- Save in the intended Amazon-import Apps Script project. If scheduled imports
  execute in a separate project, update the same file there as well.
- Saved source is used by editor/time-trigger runs; update the existing Web App's
  deployment version as well if imports are invoked through the API.
- No router, health stamp, public policy, config, manifest, frontend, schema or
  generated bundle changes. `BUNDLE_REBUILD_REQUIRED`: NO.
- `GIT_ONLY`: `assets/tests/amazon-health-issue-logging.test.cjs`.
- `DOCUMENTATION_ONLY`: this report and the release-log entry.
- Rollback: restore this single file from the parent commit, save and update the
  existing Web App deployment where applicable. Future Health details resume;
  suppressed historical details are not backfilled.

## Verification

Synthetic hosts execute the actual 06/07/09/10 sources; external reads/writes are
stubbed and no live import is run.

- `node --test assets/tests/amazon-health-issue-logging.test.cjs`: 11 tests.
- `node assets/tests/amazon-daily-sales-date-key.test.js`: 28 assertions.
- `node assets/tests/amazon-daily-sales-dedup.test.js`: 29 assertions.
- `node assets/tests/amazon-eu-shared-inventory-and-blank-date-s8-r4d-g0.test.js`: 28 assertions.
- `node assets/tests/inventory-blank-date-key-safety-probe-s8-r4d-g1.test.js`: 37 assertions.

Owner acceptance after manual deployment: the next normal Health import appends
one run record but no Health detail rows to `import_sync_issues`; other reports
continue writing issues normally. Inspect failed runs in `import_sync_runs`.

Existing log rows are untouched. No cleanup, live DB/Drive write, Apps Script
deployment, GitHub push or order-mainline implementation was performed.
