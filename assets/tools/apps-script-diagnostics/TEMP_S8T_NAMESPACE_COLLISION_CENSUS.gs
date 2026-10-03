// ================================================================================================================
// TEMP_S8T_NAMESPACE_COLLISION_CENSUS.gs — S8-R2 §7
// EDITOR-RUN. READ-ONLY. NOT ROUTED. NOT DEPLOYED. NOT PART OF THE RUNTIME SET.
// ----------------------------------------------------------------------------------------------------------------
// THE QUESTION: does any EXISTING Production value already begin with the S8 fatigue namespace `S8T`?
//
// If one does, the namespace is invalid and no fatigue round may write a row, because a guard keyed on the
// prefix would then be able to mistake a real business value for a test one.
//
// WHY THIS RUNS IN THE APPS SCRIPT EDITOR AND NOT THROUGH THE BROWSER. The routed read path returns whole tables
// over a transport that truncates. A truncated census reporting zero collisions is WORSE than no census — it
// manufactures confidence from an incomplete read, and the answer it produces is indistinguishable from the real
// one. So the counting happens inside Apps Script, next to the data, and only counts plus a handful of bounded
// examples ever leave the function.
//
// WHY IT IS BOUNDED RATHER THAN A FULL SCAN. Reading 58 whole tables will not finish inside one execution. This
// reads, per table, ONLY the columns that a caller can legally write (CALLER_WRITABLE_HEADERS_) plus the first
// column (conventionally the primary key, which proves the server-minted ids are clean too). Each column is read
// with its own bounded getRange, never getDataRange, so memory stays proportional to one column.
//
// IT IS ALSO RESUMABLE. S8T_CENSUS_START_INDEX_ / S8T_CENSUS_MAX_TABLES_ let a long census be taken in slices.
// Every slice reports the index to resume from, so an incomplete census is visibly incomplete rather than
// silently partial — a census that stopped early and said "0" would be the exact failure this file exists to
// avoid.
//
// ZERO WRITE, STRUCTURALLY. This file contains no setValue, no setValues, no appendRow, no insertSheet, no
// deleteRow, no clear, no LockService, no PropertiesService write and no DriveApp call. Its only Google-service
// calls are SpreadsheetApp.openById / getSheetByName / getRange / getValues / getLastRow / getLastColumn.
//
// HOW TO RUN
//   1. Paste this file into the Apps Script project bound to the Operation System Database.
//   2. Run  TEMP_S8T_NAMESPACE_COLLISION_CENSUS.
//   3. Copy the whole [S8T-CENSUS] log block back to the operator.
//   4. DELETE THIS FILE FROM THE PROJECT when the census is finished. It is a diagnostic, not a deployment unit,
//      and the deployed runtime set is the 77 .gs files in assets/specs/active/apps-script — not this one.
// ================================================================================================================

var S8T_CENSUS_NAMESPACE_ = 'S8T';            // the prefix under test (S8-R1 §1)
var S8T_CENSUS_START_INDEX_ = 0;              // resume point; the log tells you the next value to use
var S8T_CENSUS_MAX_TABLES_ = 60;              // tables per slice; lower it if the execution times out
var S8T_CENSUS_MAX_EXAMPLES_ = 5;             // bounded examples per finding — never a data dump

// The 58 registered physical tables (KMS8CLASS registry). Listed explicitly rather than enumerated from the
// spreadsheet, so a tab someone added by hand shows up as EXTRA_TAB_NOT_IN_REGISTRY instead of being scanned as
// though the registry already knew about it.
var S8T_CENSUS_TABLES_ = [
  'amazon_daily_sales_snapshot', 'amazon_inventory_snapshot', 'amazon_weekly_sales_snapshot',
  'campaign_sku_lines', 'campaigns', 'carrier_lead_times', 'carrier_rate_cards', 'carriers',
  'company_legal_entities', 'document_template_fields', 'document_templates',
  'factory_stock', 'factory_stock_movements', 'factory_stock_override_audit',
  'fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'generated_documents',
  'import_sync_issues', 'import_sync_runs', 'inventory_replenishment_gap', 'logistics_locations',
  'marketplace_skus', 'marketplaces', 'order_planning_gap',
  'overseas_inventory_movements', 'overseas_inventory_snapshot',
  'pricing_change_log', 'pricing_list', 'purchase_order_lines', 'purchase_orders',
  'recommendation_calculation_runs', 'replenishment_demand_allocation_rules',
  'request_order_allocation_draft_lines', 'request_order_allocation_drafts',
  'request_order_line_sources', 'request_order_lines', 'request_order_site_confirmations', 'request_orders',
  'shipment_events', 'shipment_final_output_line_pos', 'shipment_final_output_lines',
  'shipment_final_output_snapshots', 'shipment_line_allocations', 'shipment_lines',
  'shipment_route_template_nodes', 'shipment_route_templates', 'shipment_routes', 'shipments',
  'shipping_allocation_draft_lines', 'shipping_allocation_drafts', 'shipping_plan_lines', 'shipping_plans',
  'sku_details', 'sku_regional_details', 'tax_rate_components', 'tax_referral_rates', 'warehouses'
];

// THE COLUMNS A CALLER CAN LEGALLY WRITE. A server-minted id cannot collide — no generator concatenates a caller
// string ahead of its prefix — so the only way an `S8T` value can already exist is that a human or an integration
// put it in one of these. Derived from the nine caller-supplied id sites (S8-R1 §2) plus every actor and
// free-text column in the header contracts.
var S8T_CENSUS_CALLER_WRITABLE_HEADERS_ = [
  // caller-supplied identity
  'allocation_draft_id', 'request_allocation_draft_id', 'create_idempotency_key', 'idempotency_key',
  'submit_batch_id', 'import_batch_id', 'external_shipment_id', 'reference_id', 'reference_type',
  'related_entity_id', 'related_entity_type', 'source_ref_id', 'source_ref_type', 'source', 'source_module',
  'source_event_id', 'campaign_id', 'campaign_sku_line_id', 'marketplace_sku_id', 'calculation_run_id',
  'draft_id', 'business_scope_key', 'planning_cycle', 'batch_id', 'sync_batch_id', 'issue_id',
  // actor columns — `created_by` is client-asserted (00_config.gs:95), so every *_by is caller-controlled
  'created_by', 'updated_by', 'generated_by', 'started_by', 'completed_by', 'submitted_by', 'approved_by',
  'rejected_by', 'cancelled_by', 'shipped_by', 'issued_by', 'confirmed_by', 'closed_by', 'user_edited_by',
  'hidden_from_draft_by',
  // free text
  'note', 'plan_name', 'error_summary', 'rejected_reason', 'rejected_comment', 'closure_reason', 'raw_status',
  'file_name', 'km_po_no', 'booking_no', 'container_no', 'bl_no', 'invoice_no', 'tracking_number',
  'master_tracking_number'
];

function s8tCensusStr_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

function s8tCensusDb_() {
  // Prefer the project's own frozen target so the census can never read a different spreadsheet than the
  // runtime writes. Falls back to the bound spreadsheet only if the constant is unavailable.
  try { if (typeof prodExpectedDbId_ === 'function') return SpreadsheetApp.openById(prodExpectedDbId_()); } catch (e) {}
  try {
    if (typeof PRODUCTION_DB_SPREADSHEET_ID_ === 'string' && PRODUCTION_DB_SPREADSHEET_ID_) {
      return SpreadsheetApp.openById(PRODUCTION_DB_SPREADSHEET_ID_);
    }
  } catch (e2) {}
  return SpreadsheetApp.getActiveSpreadsheet();
}

// Read ONE column, bounded. Returns { hits: n, examples: [{row, value}] } for values starting with the namespace.
// Comparison is case-insensitive and anchored at position 0: a value that merely CONTAINS the token elsewhere is
// not a prefix collision, and reporting it as one would invalidate a namespace that is in fact clean.
function s8tCensusScanColumn_(sheet, colIndex, lastRow, header) {
  var out = { header: header, hits: 0, examples: [] };
  if (lastRow < 2) return out;
  var values = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();
  var ns = S8T_CENSUS_NAMESPACE_.toLowerCase();
  for (var r = 0; r < values.length; r++) {
    var v = s8tCensusStr_(values[r][0]);
    if (!v) continue;
    if (v.toLowerCase().indexOf(ns) !== 0) continue;
    out.hits++;
    if (out.examples.length < S8T_CENSUS_MAX_EXAMPLES_) {
      // The value is reported verbatim ONLY when it is a collision, and collisions are expected to be zero.
      out.examples.push({ sheet_row: r + 2, value: v });
    }
  }
  return out;
}

function s8tCensusScanTable_(ss, name) {
  var sh = null;
  try { sh = ss.getSheetByName(name); } catch (e) { sh = null; }
  if (!sh) return { table: name, present: false, hits: 0, columns_scanned: 0, findings: [] };

  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastCol < 1) return { table: name, present: true, empty: true, hits: 0, columns_scanned: 0, findings: [] };

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return s8tCensusStr_(h).toLowerCase();
  });

  // Column 1 is scanned unconditionally. It is conventionally the primary key, and scanning it is what turns
  // "no generator can emit S8T" from an argument into a measurement.
  var targets = [{ idx: 1, header: headers[0] || '(col 1)' }];
  for (var c = 0; c < headers.length; c++) {
    if (c === 0) continue;
    if (S8T_CENSUS_CALLER_WRITABLE_HEADERS_.indexOf(headers[c]) !== -1) targets.push({ idx: c + 1, header: headers[c] });
  }

  var findings = [], total = 0;
  for (var t = 0; t < targets.length; t++) {
    var res = s8tCensusScanColumn_(sh, targets[t].idx, lastRow, targets[t].header);
    total += res.hits;
    if (res.hits > 0) findings.push(res);
  }
  return { table: name, present: true, data_rows: Math.max(0, lastRow - 1),
    columns_scanned: targets.length, hits: total, findings: findings };
}

// ================================================================================================================
// THE ENTRY POINT. Run this.
// ================================================================================================================
function TEMP_S8T_NAMESPACE_COLLISION_CENSUS() {
  var started = new Date();
  var ss = s8tCensusDb_();

  var from = Math.max(0, S8T_CENSUS_START_INDEX_ | 0);
  var to = Math.min(S8T_CENSUS_TABLES_.length, from + Math.max(1, S8T_CENSUS_MAX_TABLES_ | 0));

  var scanned = [], absent = [], totalHits = 0, totalCols = 0, totalRows = 0;
  var collisions = [];

  for (var i = from; i < to; i++) {
    var r = s8tCensusScanTable_(ss, S8T_CENSUS_TABLES_[i]);
    if (!r.present) { absent.push(r.table); continue; }
    scanned.push(r.table);
    totalCols += r.columns_scanned;
    totalRows += (r.data_rows || 0);
    totalHits += r.hits;
    if (r.hits > 0) collisions.push(r);
  }

  // Tabs physically present that the registry has never classified. Not a collision, but a §4
  // UNAUTHORIZED_UNKNOWN finding: a future round must classify them before anything writes near them.
  var extraTabs = [];
  try {
    var known = {}; S8T_CENSUS_TABLES_.forEach(function (n) { known[n] = 1; });
    ss.getSheets().forEach(function (sh) {
      var n = s8tCensusStr_(sh.getName());
      if (n && !known[n]) extraTabs.push(n);
    });
  } catch (eT) { extraTabs = ['<could not enumerate tabs: ' + (eT && eT.message) + '>']; }

  var complete = (to >= S8T_CENSUS_TABLES_.length) && (from === 0);
  var report = {
    tool: 'TEMP_S8T_NAMESPACE_COLLISION_CENSUS',
    contract: 'S8-R2 §7 — bounded, read-only, counts + bounded examples only',
    namespace: S8T_CENSUS_NAMESPACE_,
    spreadsheet_id_tail: (function () { try { return '…' + ss.getId().slice(-6); } catch (e) { return '(unknown)'; } })(),
    slice: { from_index: from, to_index: to, total_tables: S8T_CENSUS_TABLES_.length },
    CENSUS_COMPLETE: complete,
    resume_with_S8T_CENSUS_START_INDEX_: (to >= S8T_CENSUS_TABLES_.length) ? null : to,
    tables_scanned: scanned.length,
    tables_absent: absent,
    columns_scanned: totalCols,
    data_rows_covered: totalRows,
    LIVE_S8T_COLLISION_COUNT: totalHits,
    collisions: collisions,
    extra_tabs_not_in_registry: extraTabs,
    zero_write_proof: {
      db_writes: 0, rows_deleted: 0, rows_modified: 0, drive_writes: 0, property_writes: 0, locks_taken: 0,
      statement: 'THIS CENSUS PERFORMED NO WRITE AND NO DELETION. It read bounded columns and returned counts.'
    },
    verdict: totalHits === 0
      ? (complete
        ? 'NAMESPACE CLEAN — no existing value begins with S8T across every registered table. The namespace is valid.'
        : 'NO COLLISION IN THIS SLICE — the census is INCOMPLETE. It is not evidence that the namespace is clean '
          + 'until every slice has run and CENSUS_COMPLETE is true.')
      : 'STOP — ' + totalHits + ' existing value(s) already begin with S8T. The namespace is INVALID and must be '
        + 'changed before any fatigue round writes a row. No write may proceed.',
    elapsed_ms: new Date().getTime() - started.getTime()
  };

  Logger.log('[S8T-CENSUS] ' + JSON.stringify(report, null, 2));
  return report;
}
