// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 63_api_v1_system_health.gs — F1-7N-FB-2 §D/§K read-only production health + flow readiness
// NOTE: All .gs files in this folder share ONE global scope. Copy them into the project TOGETHER.
// ------------------------------------------------------------
// WHY THIS EXISTS. The production failure this closes was undiagnosable from the browser: a POST to the Web App
// returned "HTTP 404, text/html", and there was no way to tell whether the deployment was unreachable, the
// deployed code was a partial sync missing a router action, the DB headers had drifted, or the transport simply
// flaked. Note what the router already guarantees: BOTH doGet and doPost return jsonResponse_ on every path,
// including the unknown-action and top-level-catch paths — so a 404 text/html body can NEVER be produced by this
// script. It comes from upstream of the router (deployment not resolving, an access/redirect page, or the
// POST -> googleusercontent echo hop). `system.health` is the probe that tells those apart.
//
// STRICTLY READ-ONLY and deliberately NON-SENSITIVE. It returns operational facts only: no spreadsheet id, no
// Drive id, no token, no credential, no user identity, no row data, no header names beyond a present/ok flag.
// It performs no write, takes no lock, and touches no Drive API.
// ============================================================

var SYS_API_CONTRACT_VERSION_ = '1';
// Bumped by hand when a sync-visible change lands. It is a build marker, not a secret: it lets the browser prove
// which deployed code answered, which is exactly what a partial Apps Script sync makes ambiguous.
var SYS_BUILD_VERSION_ = 'F1-7N-FB-2';

// The router actions the affected pages depend on. A partial Apps Script sync is the one failure mode that
// looks like a transport fault from the browser, so availability is reported per action by probing the handler
// symbol in the shared global scope — never by calling it.
var SYS_REQUIRED_ACTIONS_ = [
  { action: 'weeklyShipping.workspace.get', handler: 'handleWeeklyShippingWorkspaceGet_', used_by: 'Weekly Shipping Plan' },
  { action: 'shipment.workspace.get', handler: 'handleShipmentWorkspaceGet_', used_by: 'Shipment Draft / Overview / Map' },
  { action: 'purchaseOrder.workspace.get', handler: 'handlePurchaseOrderWorkspaceGet_', used_by: 'Purchase Order Workspace' },
  { action: 'inventoryReplenishment.workspace.get', handler: 'handleInventoryReplenishmentWorkspaceGet_', used_by: 'Site Inventory' },
  { action: 'submitAllocationDraftsToShippingPlans', handler: 'handleSubmitAllocationDraftsToShippingPlans_', used_by: 'Site Inventory Submit Plan' },
  { action: 'confirmShipmentAndDispatch', handler: 'handleConfirmShipmentAndDispatch_', used_by: 'Confirm Shipment' },
  { action: 'updatePurchaseOrderStatus', handler: 'handleUpdatePurchaseOrderStatus_', used_by: 'Send PO' },
  { action: 'document.list', handler: 'handleEntityDocumentList_', used_by: 'Document Panels' },
  { action: 'document.retry', handler: 'handleDocumentRetry_', used_by: 'Document retry' },
  { action: 'document.diagnostic.purchaseOrder', handler: 'handlePoDocumentDiagnostic_', used_by: 'PO diagnostic' },
  { action: 'document.diagnostic.shipment', handler: 'handleShipmentDocumentDiagnostic_', used_by: 'Shipment diagnostic' },
  { action: 'finalizeShipmentFinalOutput', handler: 'handleFinalizeShipmentFinalOutput_', used_by: 'Shipment snapshot' }
];

// The tables the Submit-to-Map vertical slice reads or writes. Reported as present/row-count only.
var SYS_SLICE_TABLES_ = [
  'shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines', 'shipment_line_allocations',
  'shipment_routes', 'shipment_events', 'shipment_final_output_snapshots', 'shipment_final_output_lines',
  'shipment_final_output_line_pos', 'generated_documents', 'document_templates', 'document_template_fields',
  'warehouses', 'logistics_locations'
];

function sysStr_(v) { return String(v == null ? '' : v).trim(); }
// Probe a handler symbol WITHOUT invoking it. A missing symbol is the signature of a partial file sync.
function sysHandlerPresent_(name) {
  try { return typeof this[name] === 'function'; } catch (e) { /* fall through */ }
  try { return eval('typeof ' + name) === 'function'; } catch (e2) { return false; }
}
function sysRouterReadiness_() {
  var rows = [], missing = [];
  for (var i = 0; i < SYS_REQUIRED_ACTIONS_.length; i++) {
    var a = SYS_REQUIRED_ACTIONS_[i];
    var present = sysHandlerPresent_(a.handler);
    rows.push({ action: a.action, available: present, used_by: a.used_by });
    if (!present) missing.push(a.action);
  }
  return { entrypoints: { doGet: sysHandlerPresent_('doGet'), doPost: sysHandlerPresent_('doPost') },
    actions: rows, missing_actions: missing, all_available: missing.length === 0 };
}
// Header/row readiness WITHOUT leaking the schema: a present flag, a header count and a row count only.
function sysSchemaReadiness_(ss) {
  var out = [], missing = 0;
  for (var i = 0; i < SYS_SLICE_TABLES_.length; i++) {
    var name = SYS_SLICE_TABLES_[i], sheet = null;
    try { sheet = ss.getSheetByName(name); } catch (e) { sheet = null; }
    if (!sheet) { out.push({ table: name, present: false, header_count: 0, row_count: 0 }); missing++; continue; }
    var lastRow = 0, lastCol = 0;
    try { lastRow = sheet.getLastRow(); lastCol = sheet.getLastColumn(); } catch (e2) {}
    out.push({ table: name, present: true, header_count: lastCol, row_count: Math.max(0, lastRow - 1) });
  }
  return { tables: out, missing_table_count: missing, all_present: missing === 0 };
}

// ---- the canonical health action ------------------------------------------------------------------------
// Returns ONLY operational facts. Deliberately absent: spreadsheet id, Drive ids, tokens, user identity, any
// business row. A caller that receives this JSON has proven the deployment is reachable AND that the deployed
// code contains the actions it is about to use.
function handleSystemHealth_(body) {
  var requestId = sysStr_(body && (body.requestId || body.request_id)) || ('HEALTH-' + Utilities.getUuid().substring(0, 8).toUpperCase());
  var started = Date.now();
  var router = sysRouterReadiness_();
  var schema = { tables: [], missing_table_count: null, all_present: null, error: '' };
  var dbReachable = false;
  try {
    var ss = SpreadsheetApp.openById(prodExpectedDbId_());
    dbReachable = true;
    schema = sysSchemaReadiness_(ss);
  } catch (e) {
    // Never echo the id or the raw message shape that could contain it.
    schema.error = 'DB_NOT_REACHABLE';
  }
  var ok = router.all_available && dbReachable && schema.all_present === true;
  return jsonResponse_({
    success: true,
    ok: ok,
    api_contract_version: SYS_API_CONTRACT_VERSION_,
    build_version: SYS_BUILD_VERSION_,
    environment_mode: 'production',
    router_ready: router.all_available,
    entrypoints: router.entrypoints,
    required_actions: router.actions,
    missing_actions: router.missing_actions,
    db_reachable: dbReachable,
    schema_ready: schema.all_present,
    schema: { missing_table_count: schema.missing_table_count, tables: schema.tables, error: schema.error },
    server_timestamp: (typeof shipmentTimestamp_ === 'function') ? shipmentTimestamp_() : new Date().toISOString(),
    server_ms: Date.now() - started,
    request_id: requestId,
    read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0
  });
}

// ---- §K read-only Submit-to-Map flow readiness -----------------------------------------------------------
// Answers "would Submit Plan actually persist, and can the resulting plan reach the map?" WITHOUT writing a
// single cell. It validates the payload shape and the persisted allocation drafts the canonical Submit owner
// re-reads; it never inserts, never transitions and never touches Drive.
function handleSubmitFlowDiagnostic_(body) {
  var requestId = sysStr_(body && (body.requestId || body.request_id)) || ('FLOW-' + Utilities.getUuid().substring(0, 8).toUpperCase());
  var draftIds = (body && body.allocation_draft_ids) || [];
  if (!Array.isArray(draftIds)) draftIds = [draftIds];
  draftIds = draftIds.map(sysStr_).filter(function (x) { return !!x; });
  var out = {
    success: true, request_id: requestId,
    read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0,
    api_contract_version: SYS_API_CONTRACT_VERSION_, build_version: SYS_BUILD_VERSION_
  };
  var router = sysRouterReadiness_();
  out.router_ready = router.all_available;
  out.missing_actions = router.missing_actions;
  var ss;
  try { ss = SpreadsheetApp.openById(prodExpectedDbId_()); }
  catch (e) { out.verdict = 'BLOCKED'; out.blocking_reasons = [{ reason: 'DB_NOT_REACHABLE' }]; return jsonResponse_(out); }
  out.schema = sysSchemaReadiness_(ss);

  // the canonical Submit owner re-reads persisted allocation drafts; report what it WOULD find
  var drafts = [];
  try {
    var sh = ss.getSheetByName('shipping_allocation_drafts');
    if (sh) {
      var d = sh.getDataRange().getValues();
      if (d.length > 1) {
        var h = d[0].map(function (x) { return sysStr_(x).toLowerCase(); });
        var cId = h.indexOf('allocation_draft_id'), cStatus = h.indexOf('status');
        for (var r = 1; r < d.length; r++) {
          var id = cId === -1 ? '' : sysStr_(d[r][cId]);
          if (!id) continue;
          if (draftIds.length && draftIds.indexOf(id) === -1) continue;
          drafts.push({ allocation_draft_id: id, status: cStatus === -1 ? '' : sysStr_(d[r][cStatus]) });
        }
      }
    }
  } catch (e2) { /* absent table -> reported below as zero drafts */ }
  out.requested_draft_ids = draftIds;
  out.matched_drafts = drafts.length;
  out.drafts = drafts.slice(0, 20);

  // the exact rows a successful Submit is expected to create - a manifest, not a write
  out.expected_write_manifest = [
    { table: 'shipping_plans', operation: 'INSERT', rows: 'one per (country, marketplace, shipping_method) group' },
    { table: 'shipping_plan_lines', operation: 'INSERT', rows: 'one per submitted SKU line, each referencing its persisted shipping_plan_id' }
  ];
  out.expected_visibility_after_submit = [
    { page: 'Weekly Shipping Plan', shows: 'the new plan in the Draft group, read through weeklyShipping.workspace.get' },
    { page: 'Shipment Draft', shows: 'nothing yet — a shipment exists only after the plan is approved and transferred' },
    { page: 'On-the-Way Map', shows: 'nothing yet — the map needs a shipment with routes/events, created by Confirm Shipment' }
  ];
  var blockers = [];
  if (!router.all_available) blockers.push({ reason: 'ROUTER_ACTION_MISSING', detail: router.missing_actions.join(',') });
  if (!out.schema.all_present) blockers.push({ reason: 'SCHEMA_TABLE_MISSING', detail: String(out.schema.missing_table_count) + ' table(s) absent' });
  if (draftIds.length && !drafts.length) blockers.push({ reason: 'ALLOCATION_DRAFT_NOT_FOUND', detail: 'none of the supplied allocation_draft_id values exist' });
  if (!draftIds.length && !drafts.length) blockers.push({ reason: 'NO_PERSISTED_ALLOCATION_DRAFT', detail: 'Submit re-reads persisted drafts; adjust the Execution Plan first so one is saved.' });
  out.blocking_reasons = blockers;
  out.verdict = blockers.length ? 'BLOCKED' : 'READY';
  return jsonResponse_(out);
}

// ---- editor-runnable wrapper (§K) -----------------------------------------------------------------------
// Paste an allocation_draft_id to scope the flow check, or leave the placeholder to report unscoped readiness.
var TEMP_FLOW_DIAGNOSTIC_ALLOCATION_DRAFT_ID_ = 'PASTE_ALLOCATION_DRAFT_ID_HERE_OR_LEAVE_BLANK';

function TEMP_SYSTEM_HEALTH_CHECK() {
  var h = {};
  try { h = JSON.parse(handleSystemHealth_({}).getContent()); } catch (e) { Logger.log('[SYS-HEALTH] UNPARSEABLE'); return; }
  Logger.log('[SYS-HEALTH] ok=' + h.ok +
    ' contract=' + h.api_contract_version + ' build=' + h.build_version + ' env=' + h.environment_mode +
    ' | router_ready=' + h.router_ready + ' doGet=' + (h.entrypoints && h.entrypoints.doGet) + ' doPost=' + (h.entrypoints && h.entrypoints.doPost) +
    ' missing_actions=[' + (h.missing_actions || []).join(',') + ']' +
    ' | db_reachable=' + h.db_reachable + ' schema_ready=' + h.schema_ready +
    ' missing_tables=' + (h.schema && h.schema.missing_table_count) +
    ' | server_ms=' + h.server_ms + ' request_id=' + h.request_id +
    ' | READ_ONLY=' + h.read_only + ' DB_WRITES=' + h.db_writes + ' DRIVE_WRITES=' + h.drive_writes +
    ' STATUS_TRANSITIONS=' + h.status_transitions + ' EMAILS=' + h.emails + ' DEMO_MUTATIONS=' + h.demo_mutations);
  ((h.schema && h.schema.tables) || []).forEach(function (t) {
    if (!t.present) Logger.log('[SYS-HEALTH][table] MISSING ' + t.table);
  });
}

function TEMP_SUBMIT_FLOW_DIAGNOSE() {
  var raw = sysStr_(TEMP_FLOW_DIAGNOSTIC_ALLOCATION_DRAFT_ID_);
  var ids = (!raw || raw.indexOf('PASTE_') === 0) ? [] : [raw];
  var d = {};
  try { d = JSON.parse(handleSubmitFlowDiagnostic_({ allocation_draft_ids: ids }).getContent()); }
  catch (e) { Logger.log('[SUBMIT-FLOW] UNPARSEABLE'); return; }
  Logger.log('[SUBMIT-FLOW] verdict=' + d.verdict +
    ' | router_ready=' + d.router_ready + ' missing_actions=[' + (d.missing_actions || []).join(',') + ']' +
    ' | schema_ready=' + (d.schema && d.schema.all_present) + ' missing_tables=' + (d.schema && d.schema.missing_table_count) +
    ' | requested_drafts=[' + (d.requested_draft_ids || []).join(',') + '] matched=' + d.matched_drafts +
    ' | blocked_by=[' + (d.blocking_reasons || []).map(function (b) { return b.reason; }).join(',') + ']' +
    ' | request_id=' + d.request_id +
    ' | READ_ONLY=' + d.read_only + ' DB_WRITES=' + d.db_writes + ' DRIVE_WRITES=' + d.drive_writes +
    ' STATUS_TRANSITIONS=' + d.status_transitions + ' EMAILS=' + d.emails + ' DEMO_MUTATIONS=' + d.demo_mutations);
  (d.expected_write_manifest || []).forEach(function (m) {
    Logger.log('[SUBMIT-FLOW][would-write] ' + m.table + ' ' + m.operation + ' — ' + m.rows);
  });
  (d.expected_visibility_after_submit || []).forEach(function (v) {
    Logger.log('[SUBMIT-FLOW][visibility] ' + v.page + ' — ' + v.shows);
  });
  (d.blocking_reasons || []).forEach(function (b) { Logger.log('[SUBMIT-FLOW][blocker] ' + b.reason + ' — ' + (b.detail || '')); });
}
