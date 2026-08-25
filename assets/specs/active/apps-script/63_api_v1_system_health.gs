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
  // F1-7N-FB-3 §C/§G — the slim scope registry is now what Site Inventory's selectors depend on at mount, so a
  // partial sync that omits 64_ must be visible here rather than looking like a slow page.
  { action: 'inventoryScope.registry.get', handler: 'handleInventoryScopeRegistryGet_', used_by: 'Site Inventory scope selectors' },
  { action: 'system.shippingAllocationSchemaDiagnostic', handler: 'handleShippingAllocationSchemaDiagnostic_', used_by: 'Execution Plan schema diagnostic' },
  { action: 'system.requestOrderSendDiagnostic', handler: 'handleRequestOrderSendDiagnostic_', used_by: 'Send Request diagnostic' },
  { action: 'system.twoVerticalFlowsDiagnostic', handler: 'handleTwoVerticalFlowsDiagnostic_', used_by: 'Two-vertical flow diagnostic' },
  // Vertical B — Procurement. Send Request writes through these three, then the PO vertical continues.
  { action: 'upsertRequestOrderAllocationDraft', handler: 'handleUpsertRequestOrderAllocationDraft_', used_by: 'Send Request (allocation draft)' },
  { action: 'upsertRequestOrderAllocationDraftLines', handler: 'handleUpsertRequestOrderAllocationDraftLines_', used_by: 'Send Request (allocation lines)' },
  { action: 'submitRequestOrderAllocationDrafts', handler: 'handleSubmitRequestOrderAllocationDrafts_', used_by: 'Send Request (lifecycle advance)' },
  { action: 'createRequestOrderDraft', handler: 'handleCreateRequestOrderDraft_', used_by: 'Send Request (Request Order)' },
  { action: 'createPurchaseOrderFromRequest', handler: 'handleCreatePurchaseOrderFromRequest_', used_by: 'Request Order -> PO Draft' },
  { action: 'requestOrder.workspace.get', handler: 'handleRequestOrderWorkspaceGet_', used_by: 'Request Order Workspace' },
  // F1-7N-FB-2A §G — the Execution Plan write/read set. These are the actions the Site Inventory route save
  // depends on, and a partial sync of 16_ is indistinguishable from a transport fault without probing them.
  { action: 'upsertShippingAllocationDraft', handler: 'handleUpsertShippingAllocationDraft_', used_by: 'Execution Plan route save (header)' },
  { action: 'upsertShippingAllocationDraftLines', handler: 'handleUpsertShippingAllocationDraftLines_', used_by: 'Execution Plan route save (lines)' },
  { action: 'getShippingAllocationDraftWorkspace', handler: 'handleGetShippingAllocationDraftWorkspace_', used_by: 'Execution Plan persisted readback' },
  { action: 'cancelShippingAllocationDraft', handler: 'handleCancelShippingAllocationDraft_', used_by: 'Execution Plan draft cancel' },
  { action: 'system.shippingAllocationDraftDiagnostic', handler: 'handleShippingAllocationDraftDiagnostic_', used_by: 'Execution Plan save diagnostic' },
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
  'shipping_allocation_drafts', 'shipping_allocation_draft_lines',
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


// ============================================================================================================
// F1-7N-FB-2A §F — READ-ONLY Execution Plan (shipping allocation draft) SAVE READINESS.
// ------------------------------------------------------------------------------------------------------------
// WHY. The production failure was a bare `BUSINESS_COMMAND_ERROR` on `upsertShippingAllocationDraft`. That is
// not a backend reason: it is the browser's fallback label for a handler error string it had no code for, and
// the UI then rendered the message — the only field carrying the real reason — nowhere at all. This diagnostic
// makes the system state the reason instead of anyone guessing it.
//
// HOW. It does NOT reimplement a single business rule. It runs the very gates the write runs, in the same
// order, against the same live tables:
//   1. prodRequireSheet_ / prodRequireColumns_ — the VALIDATE-ONLY schema gate that is the first thing
//      sadUpsertDraftHeaderCore_ touches (via procurementEnsureSheet_). It mutates nothing and throws a
//      deterministic PRODUCTION_SAFETY:<token>; that token is the highest-value answer this can return, because
//      it fires before any payload logic and proves a zero-write refusal.
//   2. sadHeaderRouteIsComplete_ — the real route-completeness predicate.
//   3. sadResolveActiveDraftK2OrK3_ — the real identity/idempotency authority (CREATE / REUSE / CONFLICT /
//      BLOCK), which is also what decides INSERT vs UPDATE and the deterministic primary key.
//   4. sadLegacyReconcileReason_ — the real guard for editing an existing row.
//   5. auditShippingAllocationSchemaReadOnly (41_) — the existing production header-drift evidence report.
// Every call above is a READ. Nothing here creates a sheet, appends a column, writes a cell, takes a lock,
// touches Drive, sends mail or alters Demo data. It NEVER calls procurementEnsureSheet_ on a missing tab path
// that could provision, never calls a handler, and never claims a write/read round trip occurred.
//
// It returns no spreadsheet id, Drive id, token or credential. Row content is never echoed: identities are
// reported as ids the caller already supplied or as deterministic hashes of the caller's own payload.
// ============================================================================================================

// Editor-run inputs. Leave a PASTE_ placeholder to skip that part of the evaluation.
//
// F1-7N-FB-3 §E — you NEVER need to invent a field name here. The objects below are PREFILLED with the exact
// canonical keys the writer accepts; you only replace VALUES. The editable value fields are exactly these, and
// nothing else in this file should be edited:
//   TEMP_SAD_DIAGNOSTIC_ALLOCATION_DRAFT_ID_  — an existing allocation_draft_id, or leave blank
//   TEMP_SAD_DIAGNOSTIC_HEADER_.company                                  (e.g. 'KM')
//   TEMP_SAD_DIAGNOSTIC_HEADER_.country                                  (e.g. 'US')
//   TEMP_SAD_DIAGNOSTIC_HEADER_.marketplace                              (e.g. 'Amazon')
//   TEMP_SAD_DIAGNOSTIC_HEADER_.recommended_source_warehouse_id          the From warehouse_id
//   TEMP_SAD_DIAGNOSTIC_HEADER_.recommended_destination_warehouse_id     the To warehouse_id, OR leave blank and set
//   TEMP_SAD_DIAGNOSTIC_HEADER_.destination_marketplace                  …this instead for an Amazon logical To
//   TEMP_SAD_DIAGNOSTIC_HEADER_.recommended_shipping_method              the Method
//   TEMP_SAD_DIAGNOSTIC_HEADER_.recommended_last_mile_delivery           optional
//   TEMP_SAD_DIAGNOSTIC_HEADER_.planning_cycle                           optional
//   TEMP_SAD_DIAGNOSTIC_LINE_.sku / .planned_qty / .required_by_date     one representative line
// Do NOT add, rename or remove keys — the key set IS the writer's contract.
//
// If you only need to know whether the TABLE/HEADER contract itself would refuse the write, run the
// ZERO-CONFIGURATION diagnostic instead: TEMP_SHIPPING_ALLOCATION_SCHEMA_DIAGNOSE (65_) needs no input at all.
var TEMP_SAD_DIAGNOSTIC_ALLOCATION_DRAFT_ID_ = 'PASTE_ALLOCATION_DRAFT_ID_HERE_OR_LEAVE_BLANK';
// The header payload to evaluate — exactly the shape buildDraftHeaderPayload sends. Fill in the scope + route
// you are trying to save; blanks are reported as missing rather than guessed.
var TEMP_SAD_DIAGNOSTIC_HEADER_ = {
  planning_cycle: '',
  source_page: 'inventory_replenishment',
  company: 'PASTE_COMPANY_OR_LEAVE_BLANK',
  country: 'PASTE_COUNTRY_OR_LEAVE_BLANK',
  marketplace: 'PASTE_MARKETPLACE_OR_LEAVE_BLANK',
  recommended_source_warehouse_id: '',
  recommended_destination_warehouse_id: '',
  destination_marketplace: '',
  recommended_shipping_method: '',
  recommended_last_mile_delivery: ''
};
// One representative line, to exercise the real line-completeness + date canonicalization predicates.
var TEMP_SAD_DIAGNOSTIC_LINE_ = { sku: '', planned_qty: 0, required_by_date: '' };

function sadDiagPlaceholder_(v) {
  var s = sysStr_(v);
  return s === '' || s.indexOf('PASTE_') === 0;
}
function sadDiagClean_(obj) {
  var out = {};
  for (var k in obj) { if (!Object.prototype.hasOwnProperty.call(obj, k)) continue; out[k] = sadDiagPlaceholder_(obj[k]) ? '' : sysStr_(obj[k]); }
  return out;
}
// Run the write path's FIRST gate, read-only, and report the exact token it would raise.
function sadDiagSchemaGate_(ss, table, headers) {
  var res = { table: table, present: false, gate: 'UNKNOWN', safety_token: '', missing_headers: [], header_count: 0 };
  var sheet = null;
  try { sheet = ss.getSheetByName(table); } catch (e) { sheet = null; }
  if (!sheet) { res.gate = 'BLOCKED'; res.safety_token = 'SCHEMA_NOT_PROVISIONED'; res.missing_headers = (headers || []).slice(); return res; }
  res.present = true;
  try { res.header_count = sheet.getLastColumn(); } catch (e2) {}
  // The exact validate-only gate the handler hits first. It throws; it never mutates.
  try {
    prodRequireSheet_(ss, table, headers || []);
    res.gate = 'PASS';
  } catch (gateErr) {
    res.gate = 'BLOCKED';
    var m = sysStr_(gateErr && gateErr.message);
    var tok = m.match(/PRODUCTION_SAFETY:([A-Z_]+)/);
    res.safety_token = tok ? tok[1] : 'SCHEMA_REFUSED';
  }
  // Which canonical headers the live tab does not have (names only — no row content).
  try {
    var lastCol = sheet.getLastColumn();
    var actual = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return sysStr_(h); }) : [];
    var have = {}; actual.forEach(function (h) { have[h] = 1; });
    res.missing_headers = (headers || []).filter(function (h) { return !have[h]; });
  } catch (e3) {}
  return res;
}
// FK readiness — does the id the payload carries exist in its master table? Presence only; no row echo.
function sadDiagIdExists_(ss, table, column, value) {
  if (!sysStr_(value)) return null;   // nothing supplied -> not applicable
  try {
    var sh = ss.getSheetByName(table); if (!sh) return false;
    var d = sh.getDataRange().getValues(); if (d.length < 2) return false;
    var h = d[0].map(function (x) { return sysStr_(x).toLowerCase(); });
    var c = h.indexOf(String(column).toLowerCase()); if (c === -1) return false;
    for (var r = 1; r < d.length; r++) { if (sysStr_(d[r][c]) === sysStr_(value)) return true; }
    return false;
  } catch (e) { return false; }
}

function handleShippingAllocationDraftDiagnostic_(body) {
  var requestId = sysStr_(body && (body.requestId || body.request_id)) || ('SADDIAG-' + Utilities.getUuid().substring(0, 8).toUpperCase());
  var header = sadDiagClean_((body && body.header) || {});
  var line = (body && body.line) ? body.line : null;
  var draftId = sysStr_(body && (body.allocation_draft_id || body.allocationDraftId));
  var out = {
    success: true, request_id: requestId,
    read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0,
    api_contract_version: SYS_API_CONTRACT_VERSION_, build_version: SYS_BUILD_VERSION_,
    evaluator: 'production (prodRequireSheet_ + sadHeaderRouteIsComplete_ + sadResolveActiveDraftK2OrK3_ + sadLegacyReconcileReason_)'
  };
  var blockers = [];

  // 1. action + handler availability (probed by symbol, never invoked)
  var router = sysRouterReadiness_();
  var wanted = ['upsertShippingAllocationDraft', 'upsertShippingAllocationDraftLines', 'getShippingAllocationDraftWorkspace', 'submitAllocationDraftsToShippingPlans'];
  out.actions = router.actions.filter(function (a) { return wanted.indexOf(a.action) !== -1; });
  out.actions_all_available = out.actions.length === wanted.length && out.actions.every(function (a) { return a.available; });
  if (!out.actions_all_available) blockers.push({ reason: 'ROUTER_ACTION_OR_HANDLER_MISSING', detail: 'a required allocation-draft action is not present in the DEPLOYED code (partial Apps Script sync)' });

  var ss;
  try { ss = SpreadsheetApp.openById(prodExpectedDbId_()); }
  catch (e) {
    out.verdict = 'BLOCKED';
    out.blocking_reasons = [{ reason: 'DB_NOT_REACHABLE', detail: 'the configured production database could not be opened' }];
    return jsonResponse_(out);
  }

  // 2. the write path's first gate, run read-only on BOTH tables
  out.schema_gate = [
    sadDiagSchemaGate_(ss, 'shipping_allocation_drafts', (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_ !== 'undefined') ? SHIPPING_ALLOCATION_DRAFTS_HEADERS_ : []),
    sadDiagSchemaGate_(ss, 'shipping_allocation_draft_lines', (typeof SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ !== 'undefined') ? SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ : [])
  ];
  out.schema_mode = 'EXACT_LIVE_30_COL_AUTHORITY (C2-D1R; order-sensitive, no additive tolerance in normal runtime)';
  for (var i = 0; i < out.schema_gate.length; i++) {
    var g = out.schema_gate[i];
    if (g.gate !== 'PASS') blockers.push({ reason: 'PRODUCTION_SAFETY:' + (g.safety_token || 'SCHEMA_REFUSED'), detail: g.table + (g.missing_headers.length ? (' — missing header(s): ' + g.missing_headers.join(', ')) : ' — header row does not match the canonical authority in the expected order') });
  }

  // 3. the existing production header-drift evidence report (41_), summarized — never the row content
  if (typeof auditShippingAllocationSchemaReadOnly === 'function') {
    try {
      var audit = auditShippingAllocationSchemaReadOnly();
      out.schema_audit = ((audit && audit.tables) || []).map(function (t) {
        return { table: t.table, exists: t.exists, column_count: t.columnCount, exact_match: t.exactMatch,
          first_mismatch_index: t.firstMismatchIndex, missing_headers: t.missingHeaders || [],
          extra_headers: t.extraHeaders || [], reordered_headers: t.reorderedHeaders || [],
          migration_classification: t.migrationClassification };
      });
      if (audit && audit.error) out.schema_audit_error = sysStr_(audit.error);
    } catch (auditErr) { out.schema_audit_error = 'AUDIT_UNAVAILABLE'; }
  }

  // 4. payload field contract — report what is present/absent; never invent a value
  var routeFields = ['company', 'country', 'marketplace', 'recommended_source_warehouse_id',
    'recommended_destination_warehouse_id', 'destination_marketplace', 'recommended_shipping_method'];
  var present = {}, absent = [];
  routeFields.forEach(function (f) { var v = sysStr_(header[f]); present[f] = v !== ''; if (v === '') absent.push(f); });
  out.payload_field_contract = { supplied: present, absent: absent,
    note: 'destination_marketplace is an ACCEPTED payload field but is NOT a stored column — it makes an Amazon logical destination a valid To.' };

  // 5. route completeness — the REAL predicate
  var routeComplete = (typeof sadHeaderRouteIsComplete_ === 'function') ? sadHeaderRouteIsComplete_(header) : null;
  out.route_complete = routeComplete;
  out.source_destination_readiness = {
    source_warehouse_id: sysStr_(header.recommended_source_warehouse_id) || null,
    source_exists_in_warehouses: sadDiagIdExists_(ss, 'warehouses', 'warehouse_id', header.recommended_source_warehouse_id),
    destination_warehouse_id: sysStr_(header.recommended_destination_warehouse_id) || null,
    destination_exists_in_warehouses: sadDiagIdExists_(ss, 'warehouses', 'warehouse_id', header.recommended_destination_warehouse_id),
    destination_is_logical_marketplace: sysStr_(header.destination_marketplace) !== '',
    shipping_method: sysStr_(header.recommended_shipping_method) || null
  };
  if (routeComplete === false) blockers.push({ reason: 'PLAN_HEADER_INCOMPLETE', detail: 'a Draft route requires From + To + Method (an Amazon logical destination counts as To); a partial route is refused with zero rows written' });
  if (out.source_destination_readiness.source_exists_in_warehouses === false) blockers.push({ reason: 'FK_SOURCE_WAREHOUSE_NOT_FOUND', detail: 'the supplied source warehouse_id is not present in warehouses' });
  if (out.source_destination_readiness.destination_exists_in_warehouses === false) blockers.push({ reason: 'FK_DESTINATION_WAREHOUSE_NOT_FOUND', detail: 'the supplied destination warehouse_id is not present in warehouses' });

  // 6. identity / idempotency / INSERT-vs-UPDATE — the REAL resolution authority
  out.pk_readiness = { deterministic: false, expected_allocation_draft_id: null, basis: null };
  out.idempotency = { keyed_by: 'the deterministic K2 shipment-group hash of the header route dims (sadK2DeterministicHeaderId_), so a retry UPDATES the same row instead of inserting a duplicate', resolution: null };
  var dsh = null;
  try { dsh = ss.getSheetByName('shipping_allocation_drafts'); } catch (e4) { dsh = null; }
  if (dsh && typeof sadResolveActiveDraftK2OrK3_ === 'function') {
    try {
      if (draftId && !sadDiagPlaceholder_(draftId)) {
        // explicit id path — the same guard the handler applies before editing an existing row
        var found = (typeof procurementFindRow_ === 'function') ? procurementFindRow_(dsh, 'allocation_draft_id', draftId) : null;
        out.pk_readiness = { deterministic: true, expected_allocation_draft_id: draftId, basis: 'explicit allocation_draft_id supplied by the caller' };
        out.expected_classification = found ? 'UPDATE' : 'INSERT';
        out.idempotency.resolution = found ? 'EXISTING_ROW' : 'ID_NOT_FOUND';
        if (found && typeof sadLegacyReconcileReason_ === 'function') {
          var legR = sadLegacyReconcileReason_(dsh, found, false);
          out.reconcile_guard = legR || 'PASS';
          if (legR) blockers.push({ reason: legR, detail: (typeof sadReconcileMessage_ === 'function') ? sadReconcileMessage_(legR) : 'requires an explicit user migration' });
        }
      } else {
        var res = sadResolveActiveDraftK2OrK3_(dsh, header, { allowLegacyReconcile: false });
        out.idempotency.resolution = res.status + (res.k2 ? ' (K2 shipment group)' : ' (K3 scope)');
        if (res.status === 'CREATE' || res.status === 'REUSE') {
          out.pk_readiness = { deterministic: true, expected_allocation_draft_id: sysStr_(res.id) || null,
            basis: res.k2 ? 'deterministic K2 shipment-group hash of the header route dims' : 'existing active draft for this scope' };
          out.expected_classification = (res.status === 'CREATE') ? 'INSERT' : 'UPDATE';
        } else if (res.status === 'CONFLICT') {
          out.expected_classification = 'BLOCKED';
          blockers.push({ reason: 'BLOCKED_CONFLICT', detail: 'more than one active Draft for this ' + (res.k2 ? 'shipment group (K2)' : 'scope (K3)') + '; resolve manually (zero rows written)' });
        } else {
          out.expected_classification = 'BLOCKED';
          blockers.push({ reason: sysStr_(res.reason) || 'BLOCK', detail: 'the real draft-resolution authority refuses this payload with zero rows written' });
        }
      }
    } catch (resErr) {
      out.idempotency.resolution = 'EVALUATION_FAILED';
      blockers.push({ reason: 'DRAFT_RESOLUTION_EVALUATION_FAILED', detail: 'the resolver could not be evaluated against the live table' });
    }
  }

  // 7. line quantity / date validity — the REAL predicates
  if (line && (sysStr_(line.sku) || Number(line.planned_qty) > 0)) {
    var lineOk = (typeof sadLineIsComplete_ === 'function') ? sadLineIsComplete_(line) : null;
    var canonDate = (typeof sadCanonDate_ === 'function' && sysStr_(line.required_by_date)) ? sadCanonDate_(line.required_by_date) : '';
    out.line_readiness = { sku_present: sysStr_(line.sku) !== '', planned_qty: Number(line.planned_qty) || 0,
      complete: lineOk, required_by_date_canonical: canonDate || null,
      // sadCanonDate_ echoes an unparseable value back unchanged, so validity is the canonical SHAPE, not
      // merely a non-empty return.
      date_valid: sysStr_(line.required_by_date) === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(canonDate) };
    if (lineOk === false) blockers.push({ reason: 'PLAN_LINE_INCOMPLETE', detail: 'a persistable line needs a SKU and a quantity greater than zero' });
    if (out.line_readiness.date_valid === false) blockers.push({ reason: 'LINE_DATE_NOT_CANONICAL', detail: 'required_by_date is not canonicalizable to YYYY-MM-DD' });
  }

  // 8. the exact rows a successful save WOULD write — a manifest, not a write
  out.expected_write_manifest = (blockers.length)
    ? [{ table: '(none)', operation: 'ZERO_WRITE', rows: 'every reason above is a pre-write refusal — no cell would be touched' }]
    : [
      { table: 'shipping_allocation_drafts', operation: out.expected_classification || 'INSERT_OR_UPDATE', rows: 'exactly one header row, keyed by the deterministic allocation_draft_id above' },
      { table: 'shipping_allocation_draft_lines', operation: 'UPSERT_BY_LINE_ID', rows: 'one row per COMPLETE Execution Plan line; recommendation-snapshot columns are preserved when the payload omits them' }
    ];
  out.blocking_reasons = blockers;
  out.verdict = blockers.length ? 'BLOCKED' : 'READY';
  out.exact_blocking_reason = blockers.length ? (blockers[0].reason + ' — ' + (blockers[0].detail || '')) : '';
  return jsonResponse_(out);
}

function TEMP_SHIPPING_ALLOCATION_DRAFT_DIAGNOSE() {
  var hdr = sadDiagClean_(TEMP_SAD_DIAGNOSTIC_HEADER_);
  var did = sadDiagPlaceholder_(TEMP_SAD_DIAGNOSTIC_ALLOCATION_DRAFT_ID_) ? '' : sysStr_(TEMP_SAD_DIAGNOSTIC_ALLOCATION_DRAFT_ID_);
  var d = {};
  try {
    d = JSON.parse(handleShippingAllocationDraftDiagnostic_({
      header: hdr, line: TEMP_SAD_DIAGNOSTIC_LINE_, allocation_draft_id: did
    }).getContent());
  } catch (e) { Logger.log('[SAD-DIAG] UNPARSEABLE'); return; }

  Logger.log('[SAD-DIAG] verdict=' + d.verdict + ' | exact_blocking_reason=' + (d.exact_blocking_reason || '(none)'));
  Logger.log('[SAD-DIAG] evaluator=' + d.evaluator);
  Logger.log('[SAD-DIAG] actions_all_available=' + d.actions_all_available);
  (d.actions || []).forEach(function (a) { Logger.log('[SAD-DIAG][action] ' + a.action + ' available=' + a.available); });
  (d.schema_gate || []).forEach(function (g) {
    Logger.log('[SAD-DIAG][schema-gate] ' + g.table + ' present=' + g.present + ' gate=' + g.gate +
      ' token=' + (g.safety_token || '-') + ' header_count=' + g.header_count +
      ' missing=[' + (g.missing_headers || []).join(',') + ']');
  });
  Logger.log('[SAD-DIAG] schema_mode=' + d.schema_mode);
  (d.schema_audit || []).forEach(function (t) {
    Logger.log('[SAD-DIAG][header-drift] ' + t.table + ' exists=' + t.exists + ' cols=' + t.column_count +
      ' exact=' + t.exact_match + ' first_mismatch_index=' + t.first_mismatch_index +
      ' missing=[' + (t.missing_headers || []).join(',') + '] extra=[' + (t.extra_headers || []).join(',') +
      '] reordered=[' + (t.reordered_headers || []).join(',') + '] classification=' + t.migration_classification);
  });
  if (d.schema_audit_error) Logger.log('[SAD-DIAG][header-drift] error=' + d.schema_audit_error);
  Logger.log('[SAD-DIAG] payload absent_fields=[' + ((d.payload_field_contract && d.payload_field_contract.absent) || []).join(',') + ']');
  Logger.log('[SAD-DIAG] route_complete=' + d.route_complete);
  var sd = d.source_destination_readiness || {};
  Logger.log('[SAD-DIAG] from=' + sd.source_warehouse_id + ' fk_ok=' + sd.source_exists_in_warehouses +
    ' | to=' + sd.destination_warehouse_id + ' fk_ok=' + sd.destination_exists_in_warehouses +
    ' logical_marketplace_to=' + sd.destination_is_logical_marketplace + ' | method=' + sd.shipping_method);
  var pk = d.pk_readiness || {};
  Logger.log('[SAD-DIAG] pk_deterministic=' + pk.deterministic + ' expected_id=' + pk.expected_allocation_draft_id + ' basis=' + pk.basis);
  Logger.log('[SAD-DIAG] idempotency=' + ((d.idempotency && d.idempotency.resolution) || '-') + ' expected_classification=' + d.expected_classification);
  if (d.reconcile_guard) Logger.log('[SAD-DIAG] reconcile_guard=' + d.reconcile_guard);
  if (d.line_readiness) Logger.log('[SAD-DIAG] line complete=' + d.line_readiness.complete + ' qty=' + d.line_readiness.planned_qty +
    ' date_canonical=' + d.line_readiness.required_by_date_canonical + ' date_valid=' + d.line_readiness.date_valid);
  (d.expected_write_manifest || []).forEach(function (m) { Logger.log('[SAD-DIAG][would-write] ' + m.table + ' ' + m.operation + ' — ' + m.rows); });
  (d.blocking_reasons || []).forEach(function (b) { Logger.log('[SAD-DIAG][blocker] ' + b.reason + ' — ' + (b.detail || '')); });
  Logger.log('[SAD-DIAG] request_id=' + d.request_id);
  Logger.log('READ_ONLY = ' + d.read_only);
  Logger.log('DB_WRITES = ' + d.db_writes);
  Logger.log('DRIVE_WRITES = ' + d.drive_writes);
  Logger.log('STATUS_TRANSITIONS = ' + d.status_transitions);
  Logger.log('EMAILS = ' + d.emails);
  Logger.log('DEMO_MUTATIONS = ' + d.demo_mutations);
}
