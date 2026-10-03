// ================================================================================================================
// TEMP_S8T_NAMESPACE_COLLISION_CENSUS.gs — S8-R2 §7
// EDITOR-RUN. READ-ONLY. NOT ROUTED. NOT DEPLOYED. NOT PART OF THE RUNTIME SET.
// ----------------------------------------------------------------------------------------------------------------
// DECLARED SCOPE — this is the whole of what this file does.
//
//   READ    58 registered Production tables → ONLY the bounded identifier columns required for collision
//           detection: each table's primary key, the caller-supplied identifier columns the guards read, the
//           actor (`*_by`) columns, and one lineage-type column.
//   WRITE   NONE
//   DELETE  NONE
//   SCHEMA  NONE
//   PRODUCTION BUSINESS DATA MUTATION   NONE
//
// FREE TEXT IS OUT OF SCOPE AND THAT IS THE POINT. An earlier draft also read `note`, `plan_name`,
// `rejected_reason`, `booking_no`, `invoice_no` and a dozen other free-text columns, because `note` was then a
// lineage carrier. Reading every comment box in the database to answer a question about identifiers is a far
// wider Production read than the question needs. `note` has since been removed from the guard input set
// (KMS8RUN.LINEAGE_FIELDS), every table that appeared to depend on it has a structured carrier instead, and so
// this census reads identifiers only.
//
// ----------------------------------------------------------------------------------------------------------------
// TWO TOKENS, BECAUSE THE HARNESS HAS TWO IDENTITIES AND ONLY ONE OF THEM STARTS WITH `S8T`.
//
//   1. THE RUN NAMESPACE   `S8T`            prefix match, on identifier columns.
//                                           A guard keyed on the prefix could mistake a real business value for
//                                           a test one.
//   2. THE ACTOR IDENTITY  `S8_FATIGUE_TEST` exact match, on actor columns.
//      and its type marker `s8_fatigue_test` exact match, on the lineage-type column.
//
// The second token exists because `S8_FATIGUE_TEST` DOES NOT BEGIN WITH `S8T` — it begins `S8_`. A census that
// tested only the prefix would have reported a clean namespace while an existing row carrying
// `created_by = S8_FATIGUE_TEST` sat there waiting to satisfy guard G2 for a row no test ever made. That is the
// exact failure mode this census exists to rule out, and testing one token would have missed it.
//
// ----------------------------------------------------------------------------------------------------------------
// WHY THIS RUNS IN THE APPS SCRIPT EDITOR AND NOT THROUGH THE BROWSER. The routed read path returns whole tables
// over a transport that truncates. A truncated census reporting zero collisions is WORSE than no census — it
// manufactures confidence from an incomplete read, and its answer is indistinguishable from the real one. So the
// counting happens inside Apps Script, next to the data, and only counts plus a few bounded examples leave.
//
// WHY IT IS BOUNDED. Each column is read with its own `getRange(2, col, lastRow-1, 1)`. There is no
// `getDataRange` in this file, so memory stays proportional to ONE column and never to a table.
//
// IT IS ALSO RESUMABLE. S8T_CENSUS_START_INDEX_ / S8T_CENSUS_MAX_TABLES_ take a long census in slices, and every
// slice reports where to resume. An incomplete census is visibly incomplete rather than silently partial — a
// census that stopped early and said "0" would be the exact failure this file exists to avoid.
//
// ZERO WRITE, STRUCTURALLY. No setValue, no setValues, no appendRow, no insertSheet, no deleteRow, no clear, no
// LockService, no PropertiesService write, no DriveApp, no UrlFetchApp. The only Google-service calls are
// SpreadsheetApp.openById / getSheetByName / getRange / getValues / getLastRow / getLastColumn / getSheets.
//
// HOW TO RUN
//   1. Paste this file into the Apps Script project bound to the Operation System Database.
//   2. Run  TEMP_S8T_NAMESPACE_COLLISION_CENSUS.
//   3. Copy the whole [S8T-CENSUS] log block back to the operator.
//   4. DELETE THIS FILE FROM THE PROJECT when the census is finished. It is a diagnostic, not a deployment unit;
//      the deployed runtime set is the 77 .gs files in assets/specs/active/apps-script, and this is not one.
// ================================================================================================================

var S8T_CENSUS_NAMESPACE_ = 'S8T';                  // token 1 — prefix, on identifier columns
var S8T_CENSUS_ACTOR_ = 'S8_FATIGUE_TEST';          // token 2 — exact, on actor columns
var S8T_CENSUS_LINEAGE_TYPE_VALUE_ = 's8_fatigue_test';   // token 2b — exact, on the lineage-type column

var S8T_CENSUS_START_INDEX_ = 0;              // resume point; the log tells you the next value to use
var S8T_CENSUS_MAX_TABLES_ = 60;              // tables per slice; lower it if the execution times out
var S8T_CENSUS_MAX_EXAMPLES_ = 5;             // bounded examples per finding — never a data dump

// The 58 registered physical tables (the KMS8CLASS registry). Listed explicitly rather than enumerated from the
// spreadsheet, so a tab someone added by hand surfaces as EXTRA_TAB_NOT_IN_REGISTRY instead of being scanned as
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

// IDENTIFIER COLUMNS — EXACTLY the fields guard G3 reads as DIRECT lineage carriers (KMS8RUN.LINEAGE_FIELDS).
// The suite asserts this list and that one are the same set. A carrier the census does not scan would be a
// carrier whose collision risk has never been measured, and a scanned column that no guard reads would be a
// Production read this scope does not authorize. Both directions matter, so both are checked.
var S8T_CENSUS_IDENTITY_HEADERS_ = [
  'source_ref_id', 'reference_id', 'external_shipment_id', 'submit_batch_id',
  'request_allocation_draft_id', 'allocation_draft_id', 'create_idempotency_key', 'idempotency_key',
  'import_batch_id', 'calculation_run_id'
];

// ACTOR COLUMNS — a deliberate SUPERSET of the four the resolver reads (created_by / generated_by / started_by /
// updated_by). `created_by` is client-asserted (00_config.gs:95), so the actor string could have been typed into
// any lifecycle column by a human or an integration, and the question "does this value already exist" is not
// answered by looking only where the guard happens to look today.
var S8T_CENSUS_ACTOR_HEADERS_ = [
  'created_by', 'updated_by', 'generated_by', 'started_by', 'completed_by', 'submitted_by', 'approved_by',
  'rejected_by', 'cancelled_by', 'shipped_by', 'issued_by', 'confirmed_by', 'closed_by', 'user_edited_by',
  'hidden_from_draft_by'
];

// LINEAGE-TYPE COLUMN — the one enum field a fatigue request order sets (§15: source_ref_type = s8_fatigue_test).
var S8T_CENSUS_LINEAGE_TYPE_HEADERS_ = ['source_ref_type'];

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

// Read ONE column, bounded, and test it against ONE token.
//   mode 'PREFIX' — the value STARTS WITH the token (anchored at position 0, case-insensitive). A value that
//                   merely CONTAINS the token elsewhere is not a prefix collision, and reporting it as one would
//                   invalidate a namespace that is in fact clean.
//   mode 'EXACT'  — the value EQUALS the token (case-insensitive).
function s8tCensusScanColumn_(sheet, colIndex, lastRow, header, token, mode) {
  var out = { header: header, token: token, mode: mode, hits: 0, examples: [] };
  if (lastRow < 2) return out;
  var values = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();
  var t = String(token).toLowerCase();
  for (var r = 0; r < values.length; r++) {
    var v = s8tCensusStr_(values[r][0]);
    if (!v) continue;
    var lv = v.toLowerCase();
    var hit = (mode === 'EXACT') ? (lv === t) : (lv.indexOf(t) === 0);
    if (!hit) continue;
    out.hits++;
    // The value is reported verbatim ONLY when it is a collision, and collisions are expected to be zero.
    if (out.examples.length < S8T_CENSUS_MAX_EXAMPLES_) out.examples.push({ sheet_row: r + 2, value: v });
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

  // Column 1 is scanned unconditionally against the namespace prefix. It is conventionally the primary key, and
  // scanning it is what turns "no generator can emit S8T" from an argument into a measurement.
  var targets = [{ idx: 1, header: headers[0] || '(col 1)', token: S8T_CENSUS_NAMESPACE_, mode: 'PREFIX' }];

  for (var c = 1; c < headers.length; c++) {
    var h = headers[c];
    if (!h) continue;
    if (S8T_CENSUS_IDENTITY_HEADERS_.indexOf(h) !== -1) {
      targets.push({ idx: c + 1, header: h, token: S8T_CENSUS_NAMESPACE_, mode: 'PREFIX' });
    } else if (S8T_CENSUS_ACTOR_HEADERS_.indexOf(h) !== -1) {
      targets.push({ idx: c + 1, header: h, token: S8T_CENSUS_ACTOR_, mode: 'EXACT' });
    } else if (S8T_CENSUS_LINEAGE_TYPE_HEADERS_.indexOf(h) !== -1) {
      targets.push({ idx: c + 1, header: h, token: S8T_CENSUS_LINEAGE_TYPE_VALUE_, mode: 'EXACT' });
    }
  }

  var findings = [], total = 0, byToken = { namespace: 0, actor: 0, lineage_type: 0 };
  for (var t = 0; t < targets.length; t++) {
    var tg = targets[t];
    var res = s8tCensusScanColumn_(sh, tg.idx, lastRow, tg.header, tg.token, tg.mode);
    total += res.hits;
    if (res.hits > 0) {
      findings.push(res);
      if (tg.token === S8T_CENSUS_NAMESPACE_) byToken.namespace += res.hits;
      else if (tg.token === S8T_CENSUS_ACTOR_) byToken.actor += res.hits;
      else byToken.lineage_type += res.hits;
    }
  }
  return { table: name, present: true, data_rows: Math.max(0, lastRow - 1),
    columns_scanned: targets.length, hits: total, by_token: byToken, findings: findings };
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
  var byToken = { namespace: 0, actor: 0, lineage_type: 0 };
  var collisions = [];

  for (var i = from; i < to; i++) {
    var r = s8tCensusScanTable_(ss, S8T_CENSUS_TABLES_[i]);
    if (!r.present) { absent.push(r.table); continue; }
    scanned.push(r.table);
    totalCols += r.columns_scanned;
    totalRows += (r.data_rows || 0);
    totalHits += r.hits;
    if (r.by_token) {
      byToken.namespace += r.by_token.namespace;
      byToken.actor += r.by_token.actor;
      byToken.lineage_type += r.by_token.lineage_type;
    }
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
    contract: 'S8-R2 §7 — READ bounded identifier columns only; WRITE none; DELETE none; SCHEMA none',
    tokens: {
      namespace_prefix: S8T_CENSUS_NAMESPACE_,
      actor_exact: S8T_CENSUS_ACTOR_,
      lineage_type_exact: S8T_CENSUS_LINEAGE_TYPE_VALUE_
    },
    column_scope: {
      primary_key: 'column 1 of every table',
      identity_headers: S8T_CENSUS_IDENTITY_HEADERS_.length,
      actor_headers: S8T_CENSUS_ACTOR_HEADERS_.length,
      lineage_type_headers: S8T_CENSUS_LINEAGE_TYPE_HEADERS_.length,
      free_text_headers: 0,
      statement: 'No free-text column is read. Identifiers, actors and one lineage-type enum only.'
    },
    spreadsheet_id_tail: (function () { try { return '…' + ss.getId().slice(-6); } catch (e) { return '(unknown)'; } })(),
    slice: { from_index: from, to_index: to, total_tables: S8T_CENSUS_TABLES_.length },
    CENSUS_COMPLETE: complete,
    resume_with_S8T_CENSUS_START_INDEX_: (to >= S8T_CENSUS_TABLES_.length) ? null : to,
    tables_scanned: scanned.length,
    tables_absent: absent,
    columns_scanned: totalCols,
    data_rows_covered: totalRows,
    LIVE_S8T_COLLISION_COUNT: totalHits,
    collisions_by_token: byToken,
    collisions: collisions,
    extra_tabs_not_in_registry: extraTabs,
    zero_write_proof: {
      db_writes: 0, rows_deleted: 0, rows_modified: 0, schema_changes: 0,
      drive_writes: 0, property_writes: 0, locks_taken: 0,
      statement: 'THIS CENSUS PERFORMED NO WRITE, NO DELETION AND NO SCHEMA CHANGE. It read bounded identifier '
        + 'columns and returned counts.'
    },
    verdict: totalHits === 0
      ? (complete
        ? 'NAMESPACE CLEAN — across every registered table, no identifier value begins with S8T, no actor column '
          + 'equals S8_FATIGUE_TEST, and no lineage-type column equals s8_fatigue_test. The namespace is valid.'
        : 'NO COLLISION IN THIS SLICE — the census is INCOMPLETE. It is not evidence that the namespace is clean '
          + 'until every slice has run and CENSUS_COMPLETE is true.')
      : 'STOP — ' + totalHits + ' existing value(s) collide (' + byToken.namespace + ' namespace, '
        + byToken.actor + ' actor, ' + byToken.lineage_type + ' lineage-type). The identity is INVALID and must '
        + 'be changed before any fatigue round writes a row. No write may proceed.',
    elapsed_ms: new Date().getTime() - started.getTime()
  };

  Logger.log('[S8T-CENSUS] ' + JSON.stringify(report, null, 2));
  return report;
}
