// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 06_amazon_import_config.gs — IMPORT_CONFIGS + AMAZON_TEXT_FIELDS_
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

// ============================================================
// Amazon Snapshot Importer (config-driven) — Phase 1 + Phase 3A
// Implements docs/planning/AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md (v1.4)
//   - reads source BY HEADER NAME (never column order)
//   - validates required source headers before writing
//   - preserves destination header row; clears + rewrites data rows only
//   - writes only columns present in destination headers
//   - records import_sync_runs (1 per source) + import_sync_issues
//   - Amazon Daily Sales is read from BigQuery with an INCREMENTAL rolling upsert (default 1 new
//     completed day, excludes today) + prune to retentionDays; other snapshots keep full rewrite
// Phase 3A additions:
//   - Amazon numeric placeholder normalization ("N+"→N + companion *_is_capped=TRUE,
//     "/"→null, blank→null, "1,234"/"12%"→number) BEFORE invalid_number; only truly
//     unexpected values raise invalid_number. normalized_placeholder_count tracked per run.
//   - Daily Sales BigQuery fallback: if the rolling 30-day window is empty, fall back to
//     latest-available data PER country/marketplace/channel/sku group (own 30-day window).
//   - Daily rows carry data_window_start_date/data_window_end_date/latest_source_date/
//     is_fallback_used/fallback_reason/data_age_days; import_sync_runs carries the matching
//     run-level governance fields + quality_note (all written only if the header exists).
// Requires: Advanced Google Service "BigQuery API" enabled in the Apps Script
//           project AND the BigQuery API enabled in the Google Cloud project.
// Entry points:
//   runAmazonSnapshotImports()                — time-trigger / manual (run all)
//   POST { action: 'runAmazonSnapshotImports' [, destination_table] }
// ============================================================


// Destination fields that are text/date (everything else mapped is a numeric candidate,
// used only to decide invalid_number handling — never to change typing of source data).
var AMAZON_TEXT_FIELDS_ = {
  sku: 1, country: 1, marketplace: 1, channel: 1, currency: 1, asin: 1, site_sku: 1,
  snapshot_date: 1, snapshot_week: 1, snapshot_month: 1, week_start_date: 1, week_end_date: 1
};

var IMPORT_CONFIGS = [
  // 1 — amazon_inventory_snapshot (Google Sheet)
  {
    sourceType: 'sheet',
    sourceId: '1B2oO9pOwVkLHpPo8utR1De6d50CK8jgntwuVgK_uNPE',
    sourceSheetName: 'Combined Sheet',
    destinationSpreadsheetId: '1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk',
    destinationSheetName: 'amazon_inventory_snapshot',
    sourceSystem: 'Google Sheet Import',
    sourceReport: 'Amazon Inventory',
    fixedValues: { marketplace: 'Amazon' },
    fieldMap: {
      snapshot_date: 'Date',
      country: 'Country',
      sku: 'SKU',
      asin: 'ASIN',
      currency: 'Currency code',
      price: 'Price',
      sales_last_30_days: 'Sales last 30 days',
      units_sold_last_30_days: 'Units Sold Last 30 Days',
      total_units: 'Total Units',
      inbound_qty: 'Inbound',
      available_qty: 'Available',
      fc_transfer_qty: 'FC transfer',
      fc_processing_qty: 'FC Processing',
      customer_order_qty: 'Customer Order',
      unfulfillable_qty: 'Unfulfillable',
      working_qty: 'Working',
      shipped_qty: 'Shipped',
      receiving_qty: 'Receiving',
      total_days_of_supply_including_open_shipments: 'Total Days of Supply (including units from open shipments)',
      days_of_supply_amazon_fulfillment_network: 'Days of Supply at Amazon Fulfillment Network'
    },
    naturalKey: ['snapshot_date', 'country', 'marketplace', 'sku'],
    dateFields: ['snapshot_date'],
    rowHashFields: ['snapshot_date', 'country', 'marketplace', 'sku', 'asin', 'currency', 'price',
      'sales_last_30_days', 'units_sold_last_30_days', 'total_units', 'inbound_qty', 'available_qty',
      'fc_transfer_qty', 'fc_processing_qty', 'customer_order_qty', 'unfulfillable_qty', 'working_qty',
      'shipped_qty', 'receiving_qty', 'total_days_of_supply_including_open_shipments',
      'days_of_supply_amazon_fulfillment_network'],
    // Days-of-Supply numeric field -> companion *_is_capped boolean (set TRUE when source was "N+").
    cappedFields: {
      total_days_of_supply_including_open_shipments: 'total_days_of_supply_including_open_shipments_is_capped',
      days_of_supply_amazon_fulfillment_network: 'days_of_supply_amazon_fulfillment_network_is_capped'
    }
  },
  // 2 — amazon_inventory_health_snapshot (Google Sheet)
  {
    sourceType: 'sheet',
    sourceId: '1ZQt9PPfm7k0bTepoQjBB7zDjzDUrzE0GJh3nhtOWto4',
    sourceSheetName: 'Combined Sheet',
    destinationSpreadsheetId: '1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk',
    destinationSheetName: 'amazon_inventory_health_snapshot',
    sourceSystem: 'Google Sheet Import',
    sourceReport: 'Amazon Inventory Health',
    fixedValues: { marketplace: 'Amazon' },
    // REQUIRED source headers (must exist or the source fails header validation).
    // Only core identity + Available are required; all age buckets are OPTIONAL (reports vary).
    fieldMap: {
      snapshot_date: 'Date',
      country: 'Country',
      sku: 'SKU',
      asin: 'ASIN',
      available_qty: 'Available'
    },
    // OPTIONAL source headers — Amazon Inventory Health reports vary by marketplace/report version.
    // A missing optional header maps to blank (→ 0 on read) and does NOT fail the import.
    // inv-age-61-to-90-days has been REMOVED (the 0–90 bucket supersedes the 61–90 split).
    // inv-age-365-plus-days is the backward-compatible top bucket for older reports;
    // inv-age-366-to-455-days / inv-age-456-plus-days are the newer finer buckets. Any subset is allowed.
    optionalFieldMap: {
      inv_age_0_to_90_days: 'inv-age-0-to-90-days',
      inv_age_91_to_180_days: 'inv-age-91-to-180-days',
      inv_age_181_to_270_days: 'inv-age-181-to-270-days',
      inv_age_271_to_365_days: 'inv-age-271-to-365-days',
      inv_age_365_plus_days: 'inv-age-365-plus-days',
      inv_age_366_to_455_days: 'inv-age-366-to-455-days',
      inv_age_456_plus_days: 'inv-age-456-plus-days'
    },
    naturalKey: ['snapshot_date', 'country', 'marketplace', 'sku'],
    dateFields: ['snapshot_date'],
    // rowHashFields include all required + optional destination fields; blank optional values hash safely.
    rowHashFields: ['snapshot_date', 'country', 'marketplace', 'sku', 'asin', 'available_qty',
      'inv_age_0_to_90_days', 'inv_age_91_to_180_days',
      'inv_age_181_to_270_days', 'inv_age_271_to_365_days', 'inv_age_365_plus_days',
      'inv_age_366_to_455_days', 'inv_age_456_plus_days']
  },
  // 3 — amazon_weekly_sales_snapshot (Google Sheet, weekly range parsing)
  {
    sourceType: 'sheet',
    sourceId: '1O5BBJiJsubq8Ei_cRQggY2_1ZfIXGvs8o1f_hiMHQqA',
    sourceSheetName: 'Combined Sheet',
    destinationSpreadsheetId: '1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk',
    destinationSheetName: 'amazon_weekly_sales_snapshot',
    sourceSystem: 'Google Sheet Import',
    sourceReport: 'Amazon Weekly Sales',
    fixedValues: { marketplace: 'Amazon' },
    derivedFields: { snapshot_month: 'deriveMonthFromWeek', week_start_date: 'deriveStartDateFromWeek', week_end_date: 'deriveEndDateFromWeek' },
    weekField: 'snapshot_week',
    fieldMap: {
      snapshot_week: 'Week',
      country: 'Marketplace',
      channel: 'Channel',
      sku: 'SKU',
      currency: 'Currency',
      sales_units_7d: 'Sales Units',
      sales_amount_7d: 'Sales Amount',
      sales_amount_usd_7d: 'Sales Amount$',
      return_units_7d: 'Return Units',
      total_orders_7d: 'Total Orders',
      session_7d: 'Session',
      page_view_7d: 'Page View',
      unit_session_percentage_7d: 'Unit Session Percentage'
    },
    naturalKey: ['snapshot_week', 'country', 'marketplace', 'channel', 'sku'],
    dateFields: [],
    rowHashFields: ['snapshot_week', 'country', 'marketplace', 'channel', 'sku', 'currency',
      'sales_units_7d', 'sales_amount_7d', 'sales_amount_usd_7d', 'return_units_7d', 'total_orders_7d',
      'session_7d', 'page_view_7d', 'unit_session_percentage_7d']
  },
  // 4 — amazon_daily_sales_snapshot (BigQuery, INCREMENTAL rolling upsert, EXCLUDES today)
  //   Write mode = rolling_upsert (see 07/08/09): each daily run reads ONLY new completed-day data
  //   (default = yesterday / 1 completed day), UPSERTs by natural key (no full-table rewrite), then
  //   PRUNES destination rows older than retentionDays. The Google Sheet keeps a rolling 30 completed
  //   days; BigQuery keeps full history (never pruned). Backfill: POST body.backfill_days = N reads
  //   the last N completed days and upserts them (still no full rewrite). No new columns, no BQ schema
  //   change. The 30-day window feeds BOTH the Sales Trend 7-day display AND the Normalized Avg
  //   Sales/Day 30-day calculation (event/promotion-day exclusion).
  {
    sourceType: 'bigquery',
    sourceProjectId: 'amazon-database-489810',
    sourceDataset: 'AmazonSales',
    sourceTable: 'Raw Daily Sales',
    queryMode: 'rolling_window',
    dateField: 'Date',
    // GAP-AWARE incremental rolling upsert (daily sales only). Other configs keep full snapshot rewrite.
    // Canonical behavior (2026-07-21): retain a rolling window of the latest 90 COMPLETED calendar days
    // (Asia/Taipei; today excluded; end = yesterday; start = yesterday − 89, inclusive = exactly 90 days).
    // Each run detects missing / incomplete dates in that window and fetches ONLY those (plus a small
    // recent-reconciliation window), never an unconditional full 90-day rewrite. See 08_/09_ for the flow.
    writeMode: 'rolling_upsert',
    retentionDays: 90,             // rolling retention = latest 90 completed calendar days; older rows pruned
    reconcileRecentDays: 3,        // always reconcile the most recent N source-available dates (late/revised data)
    incrementalDefaultDays: 1,     // legacy — NOT used by the gap-aware path; kept for back-compat only
    lookbackDays: 90,              // backfill ceiling = retention window (manual backfill_days is capped here)
    excludeToday: true,            // window ends yesterday (avoid partial same-day Amazon data)
    scheduleTime: '16:00',
    scheduleTimezone: 'Asia/Taipei',
    destinationSpreadsheetId: '1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk',
    destinationSheetName: 'amazon_daily_sales_snapshot',
    sourceSystem: 'BigQuery Import',
    sourceReport: 'Amazon Daily Sales',
    fixedValues: { marketplace: 'Amazon' },
    fieldMap: {
      snapshot_date: 'Date',
      country: 'Marketplace',
      channel: 'Channel',
      sku: 'SKU',
      currency: 'Currency',
      sales_units: 'Sales_Units',
      sales_amount: 'Sales_Amount',
      sales_amount_usd: 'Sales_Amount_',
      return_units: 'Return_Units',
      total_orders: 'Total_Orders',
      session: 'Session',
      page_view: 'Page_View',
      unit_session_percentage: 'Unit_Session_Percentage',
      buy_box_percentage: 'Buy_Box_Percentage',
      browser_session: 'browser_session',
      browser_page_views: 'browser_page_views',
      app_session: 'app_session',
      app_page_view: 'app_page_view'
    },
    naturalKey: ['snapshot_date', 'country', 'marketplace', 'channel', 'sku'],
    dateFields: ['snapshot_date'],
    rowHashFields: ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'currency',
      'sales_units', 'sales_amount', 'sales_amount_usd', 'return_units', 'total_orders', 'session',
      'page_view', 'unit_session_percentage', 'buy_box_percentage', 'browser_session',
      'browser_page_views', 'app_session', 'app_page_view']
  }
];
