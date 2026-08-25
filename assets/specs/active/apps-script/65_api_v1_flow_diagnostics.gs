// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 65_api_v1_flow_diagnostics.gs — F1-7N-FB-3 §E/§F/§K read-only flow readiness for the two verticals
// NOTE: All .gs files in this folder share ONE global scope. Copy them into the project TOGETHER.
// ------------------------------------------------------------
// WHY THIS EXISTS. Two live defects could not be named from the browser:
//   • the Execution Plan write answered `BUSINESS_COMMAND_ERROR` — the client's fallback label for a reason it
//     had no code for. FB-2A made the reason visible, but naming it still required a live read of the target
//     table, and FB-2A's payload-shaped diagnostic asked the user to reconstruct a route payload by hand.
//   • Send Request waited a long time and changed nothing, with no terminal feedback at all.
// These diagnostics answer both WITHOUT writing. They reimplement no business rule: they run the SAME gates the
// writers run, in the SAME order, and report the exact token the writer would raise.
//
// EVERY function here is STRICTLY READ-ONLY. None of them: creates or provisions a sheet, appends a column,
// writes a cell, takes a lock, touches the Drive API, sends mail, mutates a Script Property, alters Demo data,
// or invokes a business handler. They return no spreadsheet id, no Drive id, no token and no business row
// content — identities are echoed only when the caller supplied them.
//
// ZERO-CONFIGURATION is the point of the schema diagnostic: it needs no payload, no pasted id and no invented
// field name. The payload-shaped diagnostic (TEMP_SHIPPING_ALLOCATION_DRAFT_DIAGNOSE, 63_) stays separate for
// the cases where the question really is "would THIS route save?".
// ============================================================

var FLOWDIAG_BUILD_VERSION_ = 'F1-7N-FB-3B';

function flowStr_(v) { return String(v == null ? '' : v).trim(); }
function flowIsPlaceholder_(v) { var s = flowStr_(v); return s === '' || s.indexOf('PASTE_') === 0; }

// Open the configured production database. Returns null on failure; the caller reports DB_NOT_REACHABLE (a
// code, never a message that could carry the id).
function flowOpenDb_() {
  try { return SpreadsheetApp.openById(prodExpectedDbId_()); } catch (e) { return null; }
}

// Run the write path's FIRST gate for one table, read-only, and report the exact token it would raise.
// prodRequireSheet_ is VALIDATE-ONLY by contract (RULE S0-2/S0-5): it asserts the db target, requires the exact
// sheet, validates the header and THROWS a deterministic PRODUCTION_SAFETY token with ZERO mutation. Calling it
// is therefore the most faithful possible probe of "what will the writer do first?".
function flowSchemaGate_(ss, table, expectedHeaders) {
  var out = { table: table, present: false, gate: 'UNKNOWN', safety_token: '', column_count: 0,
    expected_column_count: (expectedHeaders || []).length, missing_headers: [], extra_headers: [],
    order_drift_at: -1, exact_order_match: null };
  var sheet = null;
  try { sheet = ss.getSheetByName(table); } catch (e) { sheet = null; }
  if (!sheet) { out.gate = 'BLOCKED'; out.safety_token = 'SCHEMA_NOT_PROVISIONED'; out.missing_headers = (expectedHeaders || []).slice(); out.exact_order_match = false; return out; }
  out.present = true;
  var actual = [];
  try {
    var lastCol = sheet.getLastColumn();
    out.column_count = lastCol;
    actual = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return flowStr_(h); }) : [];
  } catch (e2) {}
  while (actual.length && actual[actual.length - 1] === '') actual.pop();

  // the real gate
  try { prodRequireSheet_(ss, table, expectedHeaders || []); out.gate = 'PASS'; }
  catch (gateErr) {
    out.gate = 'BLOCKED';
    var m = flowStr_(gateErr && gateErr.message);
    var tok = m.match(/PRODUCTION_SAFETY:([A-Z_]+)/);
    out.safety_token = tok ? tok[1] : 'SCHEMA_REFUSED';
  }
  // names-only difference evidence (never a cell value)
  var have = {}, want = {};
  actual.forEach(function (h) { have[h] = 1; });
  (expectedHeaders || []).forEach(function (h) { want[h] = 1; });
  out.missing_headers = (expectedHeaders || []).filter(function (h) { return !have[h]; });
  out.extra_headers = actual.filter(function (h) { return h && !want[h]; });
  out.exact_order_match = true;
  for (var i = 0; i < (expectedHeaders || []).length; i++) {
    if (actual[i] !== expectedHeaders[i]) { out.exact_order_match = false; out.order_drift_at = i; break; }
  }
  if (out.exact_order_match && actual.length !== (expectedHeaders || []).length) out.exact_order_match = false;
  return out;
}

// Row count + a named column's presence. Never returns a cell value.
function flowTableFacts_(ss, table, keyColumn) {
  var out = { table: table, present: false, row_count: 0, key_column: keyColumn || '', key_column_present: null };
  var sh = null;
  try { sh = ss.getSheetByName(table); } catch (e) { sh = null; }
  if (!sh) return out;
  out.present = true;
  try { out.row_count = Math.max(0, sh.getLastRow() - 1); } catch (e2) {}
  if (keyColumn) {
    try {
      var lastCol = sh.getLastColumn();
      var hdr = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return flowStr_(h).toLowerCase(); }) : [];
      out.key_column_present = hdr.indexOf(String(keyColumn).toLowerCase()) !== -1;
    } catch (e3) { out.key_column_present = false; }
  }
  return out;
}

// Read one row's projected fields by primary key. Returns null when absent. Used ONLY for the state fields a
// readiness verdict needs (status / identity), never to echo a business row.
function flowFindRowFields_(ss, table, keyColumn, keyValue, fields) {
  try {
    var sh = ss.getSheetByName(table); if (!sh) return null;
    var d = sh.getDataRange().getValues(); if (d.length < 2) return null;
    var hdr = d[0].map(function (x) { return flowStr_(x).toLowerCase(); });
    var kc = hdr.indexOf(String(keyColumn).toLowerCase()); if (kc === -1) return null;
    for (var r = 1; r < d.length; r++) {
      if (flowStr_(d[r][kc]) !== flowStr_(keyValue)) continue;
      var o = {};
      for (var f = 0; f < fields.length; f++) {
        var at = hdr.indexOf(String(fields[f]).toLowerCase());
        o[fields[f]] = at === -1 ? null : flowStr_(d[r][at]);
      }
      return o;
    }
    return null;
  } catch (e) { return null; }
}

// Count rows whose named column equals a value (line counts / FK fan-out). Never echoes content.
function flowCountBy_(ss, table, column, value) {
  try {
    var sh = ss.getSheetByName(table); if (!sh) return 0;
    var d = sh.getDataRange().getValues(); if (d.length < 2) return 0;
    var hdr = d[0].map(function (x) { return flowStr_(x).toLowerCase(); });
    var c = hdr.indexOf(String(column).toLowerCase()); if (c === -1) return 0;
    var n = 0;
    for (var r = 1; r < d.length; r++) { if (flowStr_(d[r][c]) === flowStr_(value)) n++; }
    return n;
  } catch (e) { return 0; }
}

// The lock CONTRACT, reported without acquiring anything. Probing a ScriptLock means TAKING it, which would
// serialize against a live business write — so this deliberately refuses to, and says so.
function flowLockContract_(owner) {
  return { lock: 'LockService.getScriptLock()', owner: owner, wait_ms: 30000,
    probe: 'NOT_PROBED_BY_DESIGN',
    note: 'Acquiring this lock to test it would itself block a concurrent business write, so readiness is reported from the contract, not by taking it.' };
}

function flowCounters_() {
  return { read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0 };
}
function flowActionRows_(wanted) {
  var router = (typeof sysRouterReadiness_ === 'function') ? sysRouterReadiness_() : { actions: [] };
  var rows = (router.actions || []).filter(function (a) { return wanted.indexOf(a.action) !== -1; });
  var missing = wanted.filter(function (w) {
    for (var i = 0; i < rows.length; i++) { if (rows[i].action === w && rows[i].available) return false; }
    return true;
  });
  return { rows: rows, missing: missing, all_available: missing.length === 0 };
}

// ============================================================================================================
// §E — ZERO-CONFIGURATION Execution Plan schema readiness.
// Answers "what exactly would the Execution Plan writer refuse, and why?" with NO payload and NO pasted id.
// ============================================================================================================
function handleShippingAllocationSchemaDiagnostic_(body) {
  var started = Date.now();
  var out = {
    success: true,
    request_id: flowStr_(body && (body.requestId || body.request_id)) || ('SADSCHEMA-' + Utilities.getUuid().substring(0, 8).toUpperCase()),
    build_version: FLOWDIAG_BUILD_VERSION_,
    zero_configuration: true,
    evaluator: 'production (prodRequireSheet_ + auditShippingAllocationSchemaReadOnly + sysRouterReadiness_)'
  };
  for (var k in flowCounters_()) { if (Object.prototype.hasOwnProperty.call(flowCounters_(), k)) out[k] = flowCounters_()[k]; }
  var blockers = [];

  // 1. action + handler availability, probed BY SYMBOL (never invoked)
  var acts = flowActionRows_(['upsertShippingAllocationDraft', 'upsertShippingAllocationDraftLines',
    'getShippingAllocationDraftWorkspace', 'submitAllocationDraftsToShippingPlans']);
  out.actions = acts.rows;
  out.actions_all_available = acts.all_available;
  if (!acts.all_available) blockers.push({ reason: 'ROUTER_ACTION_OR_HANDLER_MISSING', detail: 'not present in the DEPLOYED code (partial Apps Script sync): ' + acts.missing.join(',') });

  var ss = flowOpenDb_();
  if (!ss) {
    out.verdict = 'BLOCKED';
    out.blocking_reasons = [{ reason: 'DB_NOT_REACHABLE', detail: 'the configured production database could not be opened' }];
    out.exact_blocking_reason = 'DB_NOT_REACHABLE';
    out.server_ms = Date.now() - started;
    return jsonResponse_(out);
  }

  // 2. the write path's first gate, on BOTH tables, against the FROZEN header authorities
  var hdrH = (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_ !== 'undefined') ? SHIPPING_ALLOCATION_DRAFTS_HEADERS_ : [];
  var hdrL = (typeof SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ !== 'undefined') ? SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ : [];
  out.schema_gate = [flowSchemaGate_(ss, 'shipping_allocation_drafts', hdrH), flowSchemaGate_(ss, 'shipping_allocation_draft_lines', hdrL)];
  out.schema_mode = 'EXACT_LIVE_30_COL_AUTHORITY (C2-D1R; order-sensitive, no additive tolerance in normal runtime)';
  out.expected_headers_count = { shipping_allocation_drafts: hdrH.length, shipping_allocation_draft_lines: hdrL.length };
  for (var i = 0; i < out.schema_gate.length; i++) {
    var g = out.schema_gate[i];
    if (g.gate === 'PASS') continue;
    var detail = g.table + ': ';
    if (!g.present) detail += 'the tab does not exist in the configured database';
    else if (g.missing_headers.length) detail += 'missing header(s) ' + g.missing_headers.join(', ');
    else if (g.extra_headers.length) detail += 'unexpected header(s) ' + g.extra_headers.join(', ');
    else if (g.order_drift_at >= 0) detail += 'header order drifts at index ' + g.order_drift_at + ' (expected "' + (hdrH[g.order_drift_at] || hdrL[g.order_drift_at] || '') + '")';
    else detail += 'the header row does not match the canonical authority exactly';
    blockers.push({ reason: 'PRODUCTION_SAFETY:' + (g.safety_token || 'SCHEMA_REFUSED'), detail: detail });
  }

  // 3. the EXISTING production header-drift evidence report (41_), summarized — never row content
  if (typeof auditShippingAllocationSchemaReadOnly === 'function') {
    try {
      var audit = auditShippingAllocationSchemaReadOnly();
      out.schema_audit = ((audit && audit.tables) || []).map(function (t) {
        return { table: t.table, exists: t.exists, column_count: t.columnCount, exact_match: t.exactMatch,
          prefix_match: t.prefixMatch, first_mismatch_index: t.firstMismatchIndex,
          missing_headers: t.missingHeaders || [], extra_headers: t.extraHeaders || [],
          duplicate_headers: t.duplicateHeaders || [], reordered_headers: t.reorderedHeaders || [],
          populated_extra_columns: t.populatedExtraColumns || [], migration_classification: t.migrationClassification };
      });
      if (audit && audit.error) out.schema_audit_error = flowStr_(audit.error);
    } catch (e) { out.schema_audit_error = 'AUDIT_UNAVAILABLE'; }
  }

  // 4. primary-key column readiness + line-table readiness
  out.pk_readiness = flowTableFacts_(ss, 'shipping_allocation_drafts', 'allocation_draft_id');
  out.line_table_readiness = flowTableFacts_(ss, 'shipping_allocation_draft_lines', 'allocation_draft_line_id');
  if (out.pk_readiness.present && out.pk_readiness.key_column_present === false) blockers.push({ reason: 'PK_COLUMN_MISSING', detail: 'shipping_allocation_drafts has no allocation_draft_id column' });
  if (out.line_table_readiness.present && out.line_table_readiness.key_column_present === false) blockers.push({ reason: 'LINE_PK_COLUMN_MISSING', detail: 'shipping_allocation_draft_lines has no allocation_draft_line_id column' });

  // 5. FK master presence (the tables the route identity resolves against)
  out.fk_masters = [flowTableFacts_(ss, 'warehouses', 'warehouse_id'), flowTableFacts_(ss, 'marketplaces', 'marketplace_id')];
  for (var f = 0; f < out.fk_masters.length; f++) {
    if (!out.fk_masters[f].present) blockers.push({ reason: 'FK_MASTER_TABLE_ABSENT', detail: out.fk_masters[f].table + ' is not present' });
  }

  // 6. the cutover flags that decide whether the page reaches this writer at all
  out.cutover = { note: 'The Execution Plan write path is NOT workspace-flag gated — it is a direct command action. The flags below affect only which READ model the page renders from.' };
  try {
    if (typeof CLIENT_CAPABILITY_FLAGS_ !== 'undefined' && CLIENT_CAPABILITY_FLAGS_) out.cutover.client_capability_flags_present = true;
  } catch (e) { out.cutover.client_capability_flags_present = false; }

  out.lock = flowLockContract_('handleUpsertShippingAllocationDraft_ / handleUpsertShippingAllocationDraftLines_');
  out.expected_write_manifest = blockers.length
    ? [{ table: '(none)', operation: 'ZERO_WRITE', rows: 'every reason above is a pre-write refusal — no cell would be touched' }]
    : [{ table: 'shipping_allocation_drafts', operation: 'INSERT_OR_UPDATE', rows: 'one header row keyed by the deterministic allocation_draft_id' },
       { table: 'shipping_allocation_draft_lines', operation: 'UPSERT_BY_LINE_ID', rows: 'one row per COMPLETE Execution Plan line' }];
  out.blocking_reasons = blockers;
  out.verdict = blockers.length ? 'BLOCKED' : 'READY';
  out.exact_blocking_reason = blockers.length ? (blockers[0].reason + ' — ' + (blockers[0].detail || '')) : '';
  out.next_action = blockers.length
    ? (out.exact_blocking_reason.indexOf('PRODUCTION_SAFETY:') === 0
      ? 'The live tab or its header row does not match the frozen authority. This needs a schema decision — it is reported, never repaired automatically.'
      : 'Resolve the blocker above, then re-run this diagnostic.')
    : 'The writer would not be refused before its first write. If a save still fails, run TEMP_SHIPPING_ALLOCATION_DRAFT_DIAGNOSE with the specific route.';
  out.server_ms = Date.now() - started;
  return jsonResponse_(out);
}

// ============================================================================================================
// §F — Send Request (Request Order) readiness.
// The canonical meaning of Send Request, source-proven from request-order.js + 13_/15_: it (a) advances the
// per-SKU allocation draft to site_confirmed, (b) creates ONE Request Order per series under a deterministic
// execution key, then (c) advances the covered allocation drafts to submitted. It is NOT a PO issue and NOT an
// approval decision — the approval/convert step lives on the Request Order Draft page afterwards.
// ============================================================================================================
var RO_SEND_TABLES_ = [
  { table: 'request_order_allocation_drafts', key: 'request_allocation_draft_id', headers: 'REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_' },
  { table: 'request_order_allocation_draft_lines', key: 'request_allocation_draft_line_id', headers: 'REQUEST_ORDER_ALLOCATION_DRAFT_LINES_HEADERS_' },
  { table: 'request_orders', key: 'request_order_id', headers: 'REQUEST_ORDERS_HEADERS_' },
  { table: 'request_order_lines', key: 'request_order_line_id', headers: 'REQUEST_ORDER_LINES_HEADERS_' },
  { table: 'request_order_line_sources', key: '', headers: 'REQUEST_ORDER_LINE_SOURCES_HEADERS_' }
];
function flowHeaderAuthority_(name) {
  try { return eval('(typeof ' + name + " !== 'undefined') ? " + name + ' : []'); } catch (e) { return []; }
}

function handleRequestOrderSendDiagnostic_(body) {
  var started = Date.now();
  var draftId = flowStr_(body && (body.request_allocation_draft_id || body.draft_id));
  if (flowIsPlaceholder_(draftId)) draftId = '';
  var out = {
    success: true,
    request_id: flowStr_(body && (body.requestId || body.request_id)) || ('ROSEND-' + Utilities.getUuid().substring(0, 8).toUpperCase()),
    build_version: FLOWDIAG_BUILD_VERSION_,
    canonical_meaning: 'Send Request (F1-7N-FB-3B) = ONE server orchestration over the PERSISTED allocation drafts for the current planning cycle, scoped ONLY by tier (ALL/T1/T2/T3): verify the asserted quantities against the DB, freeze the workset, create ONE Request Order per Series under a deterministic execution key, prove the output, then advance the covered drafts. Country / Marketplace / Category / Risk / Show mode / SKU search / pagination are DISPLAY_ONLY and never reduce it. It is NOT an approval decision and NOT a PO issue.',
    evaluator: 'production (prodRequireSheet_ + the frozen 13_/15_ header authorities + sysRouterReadiness_)',
    supplied_draft_id: draftId || null
  };
  var c = flowCounters_(); for (var k in c) { if (Object.prototype.hasOwnProperty.call(c, k)) out[k] = c[k]; }
  var blockers = [];

  // F1-7N-FB-3B — the orchestration actions are now part of the Send path, so a partial sync of 66_ is a Send
  // blocker and must be reported as one. The three legacy per-SKU write actions stay in the list: they remain the
  // CANONICAL writers the orchestration delegates to, so their absence still blocks a Send.
  var acts = flowActionRows_(['upsertRequestOrderAllocationDraft', 'upsertRequestOrderAllocationDraftLines',
    'createRequestOrderDraft', 'submitRequestOrderAllocationDrafts',
    'requestOrder.send.orchestrate', 'requestOrder.sendWorkset.get']);
  out.actions = acts.rows;
  out.actions_all_available = acts.all_available;
  if (!acts.all_available) blockers.push({ reason: 'ROUTER_ACTION_OR_HANDLER_MISSING', detail: 'not present in the DEPLOYED code (partial Apps Script sync): ' + acts.missing.join(',') });

  var ss = flowOpenDb_();
  if (!ss) {
    out.verdict = 'BLOCKED';
    out.blocking_reasons = [{ reason: 'DB_NOT_REACHABLE', detail: 'the configured production database could not be opened' }];
    out.exact_blocking_reason = 'DB_NOT_REACHABLE';
    out.server_ms = Date.now() - started;
    return jsonResponse_(out);
  }

  // schema/header readiness for EVERY table the flow writes, against each frozen authority
  out.schema_gate = [];
  for (var i = 0; i < RO_SEND_TABLES_.length; i++) {
    var spec = RO_SEND_TABLES_[i];
    var g = flowSchemaGate_(ss, spec.table, flowHeaderAuthority_(spec.headers));
    out.schema_gate.push(g);
    if (g.gate !== 'PASS') {
      var detail = spec.table + ': ' + (!g.present ? 'the tab does not exist'
        : (g.missing_headers.length ? ('missing header(s) ' + g.missing_headers.join(', '))
          : (g.order_drift_at >= 0 ? ('header order drifts at index ' + g.order_drift_at) : 'header row does not match the canonical authority')));
      blockers.push({ reason: 'PRODUCTION_SAFETY:' + (g.safety_token || 'SCHEMA_REFUSED'), detail: detail });
    }
  }

  // state readiness for the supplied draft (target state, and whether it is already terminal)
  out.state = { source_status: null, target_status: 'site_confirmed -> (Request Order created) -> submitted',
    allowed_source_statuses: ['draft', 'site_confirmed', 'partially_submitted'], terminal_statuses: ['submitted', 'cancelled'] };
  if (draftId) {
    var row = flowFindRowFields_(ss, 'request_order_allocation_drafts', 'request_allocation_draft_id', draftId,
      ['status', 'company', 'country', 'marketplace', 'sku', 'planning_cycle', 'draft_version', 'generation_type']);
    if (!row) {
      blockers.push({ reason: 'ALLOCATION_DRAFT_NOT_FOUND', detail: 'the supplied request_allocation_draft_id does not exist' });
    } else {
      out.state.source_status = row.status || '';
      out.state.scope_complete = !!(flowStr_(row.company) && flowStr_(row.country) && flowStr_(row.marketplace) && flowStr_(row.sku));
      out.state.generation_type = row.generation_type || '';
      out.state.draft_version = row.draft_version || '';
      var st = flowStr_(row.status).toLowerCase();
      if (st === 'submitted' || st === 'cancelled') blockers.push({ reason: 'IMMUTABLE_TERMINAL_STATUS', detail: 'the draft is already ' + st + ' — Send Request will not re-execute it' });
      if (!out.state.scope_complete) blockers.push({ reason: 'SCOPE_INCOMPLETE', detail: 'company / country / marketplace / sku must all be present on the draft' });
      out.line_readiness = { line_count: flowCountBy_(ss, 'request_order_allocation_draft_lines', 'request_allocation_draft_id', draftId) };
      if (out.line_readiness.line_count === 0) blockers.push({ reason: 'NO_ALLOCATION_DRAFT_LINES', detail: 'a Send needs at least one line with a positive order_qty' });
    }
  } else {
    out.state.note = 'No draft id supplied — schema, action and FK readiness are reported unscoped. Supply one to also evaluate state, lines and idempotency.';
  }

  // FK masters the flow resolves against
  out.fk_masters = [flowTableFacts_(ss, 'marketplaces', 'marketplace_id'), flowTableFacts_(ss, 'sku_details', 'sku'),
    flowTableFacts_(ss, 'marketplace_skus', 'sku')];
  for (var f = 0; f < out.fk_masters.length; f++) {
    if (!out.fk_masters[f].present) blockers.push({ reason: 'FK_MASTER_TABLE_ABSENT', detail: out.fk_masters[f].table + ' is not present' });
  }

  out.idempotency = {
    allocation_draft: 'addressed by a DETERMINISTIC id (canonical AI draft id, else the deterministic manual id) so a retry find-or-updates the SAME row',
    request_order: 'source_ref_type=request_order_allocation_batch + a deterministic execution key over the covered allocation-draft-id SET; a retry REUSES the existing Request Order (reused:true) instead of creating a second one',
    duplicate_guard: 'roFindByExecutionKey_ under the canonical ScriptLock; >1 match fails closed with REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT'
  };
  out.lock = flowLockContract_('handleCreateRequestOrderDraft_ (and the 15_ allocation-draft writers)');
  out.expected_write_manifest = blockers.length
    ? [{ table: '(none)', operation: 'ZERO_WRITE', rows: 'every reason above is a pre-write refusal' }]
    : [{ table: 'request_order_allocation_drafts', operation: 'UPDATE', rows: 'status -> site_confirmed for each covered SKU draft (INSERT for a manual draft that does not exist yet)' },
       { table: 'request_order_allocation_draft_lines', operation: 'UPSERT', rows: 'the manual per-tier lines of each manual draft' },
       { table: 'request_orders', operation: 'INSERT_OR_REUSE', rows: 'exactly one per series, keyed by the execution key' },
       { table: 'request_order_lines', operation: 'INSERT', rows: 'one per SKU x tier line of that series' },
       { table: 'request_order_line_sources', operation: 'INSERT', rows: 'one per line carrying country/marketplace + request_allocation_draft_id lineage' },
       { table: 'request_order_allocation_drafts', operation: 'UPDATE', rows: 'status -> submitted, only AFTER the Request Order is proven to exist' }];
  out.downstream_visibility = [
    { page: 'Request Order Draft', shows: 'the new Request Order, awaiting Approve / Convert to PO' },
    { page: 'Purchase Order Workspace', shows: 'nothing yet — a PO exists only after createPurchaseOrderFromRequest' },
    { page: 'PO Overview (In Production)', shows: 'nothing yet — that group needs an ISSUED PO (Send PO)' }
  ];
  out.blocking_reasons = blockers;
  out.verdict = blockers.length ? 'BLOCKED' : 'READY';
  out.exact_blocking_reason = blockers.length ? (blockers[0].reason + ' — ' + (blockers[0].detail || '')) : '';
  out.server_ms = Date.now() - started;
  return jsonResponse_(out);
}

// ============================================================================================================
// §K — the COMPOSED two-vertical verdict. It calls the two diagnostics above (plus the FB-2/FB-2A ones) and
// reports TWO INDEPENDENT verdicts: a failure in one vertical must never hide the other's result.
// ============================================================================================================
function flowSafeJson_(fn) {
  try { return JSON.parse(fn().getContent()); }
  catch (e) { return { success: false, verdict: 'DIAGNOSTIC_UNAVAILABLE', blocking_reasons: [{ reason: 'DIAGNOSTIC_EVALUATION_FAILED', detail: 'this diagnostic could not be evaluated' }] }; }
}

function handleTwoVerticalFlowsDiagnostic_(body) {
  var started = Date.now();
  body = body || {};
  var out = {
    success: true,
    request_id: flowStr_(body.requestId || body.request_id) || ('TWOFLOW-' + Utilities.getUuid().substring(0, 8).toUpperCase()),
    build_version: FLOWDIAG_BUILD_VERSION_,
    composition: 'This entrypoint COMPOSES the existing production evaluators (system.health, the Execution Plan schema diagnostic, the shipment document diagnostic and the Send Request diagnostic). It reimplements none of them.'
  };
  var c = flowCounters_(); for (var k in c) { if (Object.prototype.hasOwnProperty.call(c, k)) out[k] = c[k]; }

  // shared: deployment + action coverage
  out.health = flowSafeJson_(function () { return handleSystemHealth_({}); });
  out.deployment_ready = out.health.ok === true;
  out.missing_actions = out.health.missing_actions || [];

  // ---- Vertical A — Shipping ----
  var shipSteps = [], shipBlockers = [];
  var sadSchema = flowSafeJson_(function () { return handleShippingAllocationSchemaDiagnostic_({}); });
  out.shipping = { execution_plan_schema: sadSchema };
  shipSteps.push({ step: 'execution_plan_save', action_available: sadSchema.actions_all_available === true,
    schema_ready: sadSchema.verdict === 'READY', blocker: sadSchema.exact_blocking_reason || '' });
  if (sadSchema.verdict !== 'READY') shipBlockers.push(sadSchema.exact_blocking_reason || 'EXECUTION_PLAN_SCHEMA_BLOCKED');

  var shipmentId = flowStr_(body.shipment_id);
  if (flowIsPlaceholder_(shipmentId)) shipmentId = '';
  if (shipmentId && typeof handleShipmentDocumentDiagnostic_ === 'function') {
    out.shipping.shipment_documents = flowSafeJson_(function () { return handleShipmentDocumentDiagnostic_({ shipment_id: shipmentId }); });
    shipSteps.push({ step: 'shipment_document_readiness', action_available: true,
      schema_ready: out.shipping.shipment_documents.success !== false,
      blocker: (out.shipping.shipment_documents.blocking_reasons || []).map(function (b) { return b.reason || b; }).join(',') });
  } else {
    shipSteps.push({ step: 'shipment_document_readiness', action_available: typeof handleShipmentDocumentDiagnostic_ === 'function',
      schema_ready: null, blocker: 'LIVE_PROOF_REQUIRED — supply a shipment_id to evaluate document readiness' });
  }
  var submitFlow = flowSafeJson_(function () { return handleSubmitFlowDiagnostic_({}); });
  out.shipping.submit_flow = submitFlow;
  shipSteps.push({ step: 'submit_plan', action_available: submitFlow.router_ready === true,
    schema_ready: submitFlow.schema && submitFlow.schema.all_present === true,
    blocker: (submitFlow.blocking_reasons || []).map(function (b) { return b.reason; }).join(',') });
  out.shipping.steps = shipSteps;
  out.shipping_vertical_verdict = shipBlockers.length ? 'BLOCKED' : (out.deployment_ready ? 'READY_PENDING_LIVE_PROOF' : 'BLOCKED');
  out.shipping_blocking_reasons = shipBlockers;

  // ---- Vertical B — Procurement (evaluated INDEPENDENTLY: A's verdict cannot hide B's) ----
  var procBlockers = [], procSteps = [];
  var roDraftId = flowStr_(body.request_allocation_draft_id);
  if (flowIsPlaceholder_(roDraftId)) roDraftId = '';
  var roSend = flowSafeJson_(function () { return handleRequestOrderSendDiagnostic_({ request_allocation_draft_id: roDraftId }); });
  out.procurement = { send_request: roSend };
  procSteps.push({ step: 'send_request', action_available: roSend.actions_all_available === true,
    schema_ready: (roSend.schema_gate || []).every(function (g) { return g.gate === 'PASS'; }),
    source_state: (roSend.state && roSend.state.source_status) || null,
    blocker: roSend.exact_blocking_reason || '' });
  if (roSend.verdict !== 'READY') procBlockers.push(roSend.exact_blocking_reason || 'SEND_REQUEST_BLOCKED');

  var poId = flowStr_(body.purchase_order_id);
  if (flowIsPlaceholder_(poId)) poId = '';
  if (poId && typeof handlePoDocumentDiagnostic_ === 'function') {
    out.procurement.po_documents = flowSafeJson_(function () { return handlePoDocumentDiagnostic_({ purchase_order_id: poId }); });
    procSteps.push({ step: 'po_document_readiness', action_available: true,
      schema_ready: out.procurement.po_documents.success !== false,
      blocker: (out.procurement.po_documents.blocking_reasons || []).map(function (b) { return b.reason || b; }).join(',') });
  } else {
    procSteps.push({ step: 'po_document_readiness', action_available: typeof handlePoDocumentDiagnostic_ === 'function',
      schema_ready: null, blocker: 'LIVE_PROOF_REQUIRED — supply a purchase_order_id to evaluate PO document readiness' });
  }
  out.procurement.steps = procSteps;
  out.procurement_vertical_verdict = procBlockers.length ? 'BLOCKED' : (out.deployment_ready ? 'READY_PENDING_LIVE_PROOF' : 'BLOCKED');
  out.procurement_blocking_reasons = procBlockers;

  out.server_ms = Date.now() - started;
  return jsonResponse_(out);
}

// ============================================================================================================
// EDITOR-RUNNABLE WRAPPERS
// ============================================================================================================

// ZERO-CONFIGURATION. Run this FIRST when an Execution Plan save fails: it needs no input at all.
function TEMP_SHIPPING_ALLOCATION_SCHEMA_DIAGNOSE() {
  var d = {};
  try { d = JSON.parse(handleShippingAllocationSchemaDiagnostic_({}).getContent()); }
  catch (e) { Logger.log('[SAD-SCHEMA] UNPARSEABLE'); return; }
  Logger.log('[SAD-SCHEMA] verdict=' + d.verdict + ' | exact_blocking_reason=' + (d.exact_blocking_reason || '(none)'));
  Logger.log('[SAD-SCHEMA] zero_configuration=' + d.zero_configuration + ' evaluator=' + d.evaluator);
  Logger.log('[SAD-SCHEMA] actions_all_available=' + d.actions_all_available);
  (d.actions || []).forEach(function (a) { Logger.log('[SAD-SCHEMA][action] ' + a.action + ' available=' + a.available); });
  (d.schema_gate || []).forEach(function (g) {
    Logger.log('[SAD-SCHEMA][gate] ' + g.table + ' present=' + g.present + ' gate=' + g.gate +
      ' token=' + (g.safety_token || '-') + ' actual_cols=' + g.column_count + ' expected_cols=' + g.expected_column_count +
      ' exact_order=' + g.exact_order_match + ' order_drift_at=' + g.order_drift_at +
      ' missing=[' + (g.missing_headers || []).join(',') + '] extra=[' + (g.extra_headers || []).join(',') + ']');
  });
  Logger.log('[SAD-SCHEMA] schema_mode=' + d.schema_mode);
  (d.schema_audit || []).forEach(function (t) {
    Logger.log('[SAD-SCHEMA][drift] ' + t.table + ' exists=' + t.exists + ' cols=' + t.column_count +
      ' exact=' + t.exact_match + ' prefix=' + t.prefix_match + ' first_mismatch=' + t.first_mismatch_index +
      ' missing=[' + (t.missing_headers || []).join(',') + '] extra=[' + (t.extra_headers || []).join(',') +
      '] duplicate=[' + (t.duplicate_headers || []).join(',') + '] reordered=[' + (t.reordered_headers || []).join(',') +
      '] populated_extra=[' + (t.populated_extra_columns || []).join(',') + '] classification=' + t.migration_classification);
  });
  if (d.schema_audit_error) Logger.log('[SAD-SCHEMA][drift] error=' + d.schema_audit_error);
  Logger.log('[SAD-SCHEMA] pk=' + JSON.stringify(d.pk_readiness) + ' lines=' + JSON.stringify(d.line_table_readiness));
  (d.fk_masters || []).forEach(function (m) { Logger.log('[SAD-SCHEMA][fk] ' + m.table + ' present=' + m.present + ' key_col=' + m.key_column_present + ' rows=' + m.row_count); });
  Logger.log('[SAD-SCHEMA] lock=' + JSON.stringify(d.lock));
  (d.expected_write_manifest || []).forEach(function (m) { Logger.log('[SAD-SCHEMA][would-write] ' + m.table + ' ' + m.operation + ' — ' + m.rows); });
  (d.blocking_reasons || []).forEach(function (b) { Logger.log('[SAD-SCHEMA][blocker] ' + b.reason + ' — ' + (b.detail || '')); });
  Logger.log('[SAD-SCHEMA] next_action=' + d.next_action);
  Logger.log('[SAD-SCHEMA] request_id=' + d.request_id + ' server_ms=' + d.server_ms);
  Logger.log('READ_ONLY = ' + d.read_only);
  Logger.log('DB_WRITES = ' + d.db_writes);
  Logger.log('DRIVE_WRITES = ' + d.drive_writes);
  Logger.log('STATUS_TRANSITIONS = ' + d.status_transitions);
  Logger.log('EMAILS = ' + d.emails);
  Logger.log('DEMO_MUTATIONS = ' + d.demo_mutations);
}

// ONE documented input: the internal request_allocation_draft_id. Leave the placeholder to get the unscoped
// schema/action/FK verdict. You never need to invent a field name.
var TEMP_RO_SEND_DIAGNOSTIC_ALLOCATION_DRAFT_ID_ = 'PASTE_REQUEST_ALLOCATION_DRAFT_ID_HERE_OR_LEAVE_BLANK';

function TEMP_REQUEST_ORDER_SEND_DIAGNOSE() {
  var id = flowIsPlaceholder_(TEMP_RO_SEND_DIAGNOSTIC_ALLOCATION_DRAFT_ID_) ? '' : flowStr_(TEMP_RO_SEND_DIAGNOSTIC_ALLOCATION_DRAFT_ID_);
  var d = {};
  try { d = JSON.parse(handleRequestOrderSendDiagnostic_({ request_allocation_draft_id: id }).getContent()); }
  catch (e) { Logger.log('[RO-SEND] UNPARSEABLE'); return; }
  Logger.log('[RO-SEND] verdict=' + d.verdict + ' | exact_blocking_reason=' + (d.exact_blocking_reason || '(none)'));
  Logger.log('[RO-SEND] canonical_meaning=' + d.canonical_meaning);
  Logger.log('[RO-SEND] supplied_draft_id=' + d.supplied_draft_id + ' actions_all_available=' + d.actions_all_available);
  (d.actions || []).forEach(function (a) { Logger.log('[RO-SEND][action] ' + a.action + ' available=' + a.available); });
  (d.schema_gate || []).forEach(function (g) {
    Logger.log('[RO-SEND][gate] ' + g.table + ' present=' + g.present + ' gate=' + g.gate + ' token=' + (g.safety_token || '-') +
      ' actual_cols=' + g.column_count + ' expected_cols=' + g.expected_column_count + ' exact_order=' + g.exact_order_match +
      ' missing=[' + (g.missing_headers || []).join(',') + '] extra=[' + (g.extra_headers || []).join(',') + ']');
  });
  Logger.log('[RO-SEND] state=' + JSON.stringify(d.state));
  if (d.line_readiness) Logger.log('[RO-SEND] line_readiness=' + JSON.stringify(d.line_readiness));
  (d.fk_masters || []).forEach(function (m) { Logger.log('[RO-SEND][fk] ' + m.table + ' present=' + m.present + ' key_col=' + m.key_column_present + ' rows=' + m.row_count); });
  Logger.log('[RO-SEND] idempotency=' + JSON.stringify(d.idempotency));
  Logger.log('[RO-SEND] lock=' + JSON.stringify(d.lock));
  (d.expected_write_manifest || []).forEach(function (m) { Logger.log('[RO-SEND][would-write] ' + m.table + ' ' + m.operation + ' — ' + m.rows); });
  (d.downstream_visibility || []).forEach(function (v) { Logger.log('[RO-SEND][visibility] ' + v.page + ' — ' + v.shows); });
  (d.blocking_reasons || []).forEach(function (b) { Logger.log('[RO-SEND][blocker] ' + b.reason + ' — ' + (b.detail || '')); });
  Logger.log('[RO-SEND] request_id=' + d.request_id + ' server_ms=' + d.server_ms);
  Logger.log('READ_ONLY = ' + d.read_only);
  Logger.log('DB_WRITES = ' + d.db_writes);
  Logger.log('DRIVE_WRITES = ' + d.drive_writes);
  Logger.log('STATUS_TRANSITIONS = ' + d.status_transitions);
  Logger.log('EMAILS = ' + d.emails);
  Logger.log('DEMO_MUTATIONS = ' + d.demo_mutations);
}

// Optional placeholders. Any that stay as PASTE_ are simply reported as LIVE_PROOF_REQUIRED for that step.
var TEMP_TWOFLOW_SHIPMENT_ID_ = 'PASTE_SHIPMENT_ID_HERE_OR_LEAVE_BLANK';
var TEMP_TWOFLOW_PURCHASE_ORDER_ID_ = 'PASTE_PURCHASE_ORDER_ID_HERE_OR_LEAVE_BLANK';
var TEMP_TWOFLOW_REQUEST_ALLOCATION_DRAFT_ID_ = 'PASTE_REQUEST_ALLOCATION_DRAFT_ID_HERE_OR_LEAVE_BLANK';

function TEMP_TWO_VERTICAL_FLOWS_DIAGNOSE() {
  var d = {};
  try {
    d = JSON.parse(handleTwoVerticalFlowsDiagnostic_({
      shipment_id: TEMP_TWOFLOW_SHIPMENT_ID_,
      purchase_order_id: TEMP_TWOFLOW_PURCHASE_ORDER_ID_,
      request_allocation_draft_id: TEMP_TWOFLOW_REQUEST_ALLOCATION_DRAFT_ID_
    }).getContent());
  } catch (e) { Logger.log('[TWO-FLOW] UNPARSEABLE'); return; }

  Logger.log('[TWO-FLOW] deployment_ready=' + d.deployment_ready + ' missing_actions=[' + (d.missing_actions || []).join(',') + ']');
  Logger.log('[TWO-FLOW] composition=' + d.composition);
  Logger.log('[TWO-FLOW] ===== SHIPPING VERTICAL =====');
  Logger.log('[TWO-FLOW] shipping_vertical_verdict=' + d.shipping_vertical_verdict);
  ((d.shipping && d.shipping.steps) || []).forEach(function (s) {
    Logger.log('[TWO-FLOW][shipping] step=' + s.step + ' action_available=' + s.action_available +
      ' schema_ready=' + s.schema_ready + ' blocker=' + (s.blocker || '(none)'));
  });
  (d.shipping_blocking_reasons || []).forEach(function (b) { Logger.log('[TWO-FLOW][shipping][blocker] ' + b); });
  Logger.log('[TWO-FLOW] ===== PROCUREMENT VERTICAL =====');
  Logger.log('[TWO-FLOW] procurement_vertical_verdict=' + d.procurement_vertical_verdict);
  ((d.procurement && d.procurement.steps) || []).forEach(function (s) {
    Logger.log('[TWO-FLOW][procurement] step=' + s.step + ' action_available=' + s.action_available +
      ' schema_ready=' + s.schema_ready + ' source_state=' + (s.source_state || '-') + ' blocker=' + (s.blocker || '(none)'));
  });
  (d.procurement_blocking_reasons || []).forEach(function (b) { Logger.log('[TWO-FLOW][procurement][blocker] ' + b); });
  Logger.log('[TWO-FLOW] request_id=' + d.request_id + ' server_ms=' + d.server_ms);
  Logger.log('READ_ONLY = ' + d.read_only);
  Logger.log('DB_WRITES = ' + d.db_writes);
  Logger.log('DRIVE_WRITES = ' + d.drive_writes);
  Logger.log('STATUS_TRANSITIONS = ' + d.status_transitions);
  Logger.log('EMAILS = ' + d.emails);
  Logger.log('DEMO_MUTATIONS = ' + d.demo_mutations);
}

// ============================================================================================================
// F1-7N-FB-3A §F — INTERRUPTED SEND REQUEST RECONCILIATION (strictly read-only).
// ------------------------------------------------------------------------------------------------------------
// The user stopped a Send Request mid-run. That is NOT a zero-write: the client saga writes 2-3 rows PER SKU
// sequentially, so stopping it leaves an unknown prefix committed. Navigating away or closing the tab proves
// nothing about what the server already did — this diagnostic is the only honest way to find out, and it MUST
// be run before any retry is authorized.
//
// It reads the canonical lifecycle and reports, per execution key and per deterministic identity: which
// allocation drafts advanced, which Request Orders exist, whether their lines are complete, which identities
// are duplicated, which states are internally inconsistent, the exact safe resume point, and whether a retry
// is safe at all. It writes nothing and takes no lock.
//
// SAFETY MODEL. The canonical Send is idempotent by construction (deterministic draft ids -> find-or-update;
// Request Orders keyed by an execution key that is REUSED rather than duplicated), so the expected finding is
// "partial but safely resumable". The states that are NOT safely resumable are enumerated explicitly rather
// than assumed away.
var ROREC_ACTIVE_STATUSES_ = { draft: 1, site_confirmed: 1, partially_submitted: 1 };

function handleRequestOrderSendReconcile_(body) {
  var started = Date.now();
  body = body || {};
  var cycle = flowStr_(body.planning_cycle);
  if (flowIsPlaceholder_(cycle)) cycle = '';
  var execKey = flowStr_(body.execution_key);
  if (flowIsPlaceholder_(execKey)) execKey = '';
  var out = {
    success: true,
    request_id: flowStr_(body.requestId || body.request_id) || ('ROREC-' + Utilities.getUuid().substring(0, 8).toUpperCase()),
    build_version: FLOWDIAG_BUILD_VERSION_,
    scope: { planning_cycle: cycle || null, execution_key: execKey || null },
    evaluator: 'production (the canonical 13_/15_ tables and their frozen header authorities)',
    note: 'A stopped or navigated-away Send is NEVER treated as a zero-write. Everything below is read from the DB.'
  };
  var c = flowCounters_(); for (var k in c) { if (Object.prototype.hasOwnProperty.call(c, k)) out[k] = c[k]; }

  var ss = flowOpenDb_();
  if (!ss) {
    out.verdict = 'BLOCKED'; out.retry_safe = false;
    out.blocking_reasons = [{ reason: 'DB_NOT_REACHABLE' }];
    out.server_ms = Date.now() - started;
    return jsonResponse_(out);
  }

  // ---- 1. allocation drafts, by status, within the cycle scope --------------------------------------------
  var byStatus = {}, drafts = [], dupDraftIds = {}, seenDraftId = {};
  try {
    var dsh = ss.getSheetByName('request_order_allocation_drafts');
    if (dsh) {
      var dd = dsh.getDataRange().getValues();
      if (dd.length > 1) {
        var dh = dd[0].map(function (x) { return flowStr_(x).toLowerCase(); });
        var cId = dh.indexOf('request_allocation_draft_id'), cSt = dh.indexOf('status'), cCy = dh.indexOf('planning_cycle');
        var cSku = dh.indexOf('sku'), cSer = dh.indexOf('series_snapshot'), cGen = dh.indexOf('generation_type');
        for (var r = 1; r < dd.length; r++) {
          var id = cId === -1 ? '' : flowStr_(dd[r][cId]);
          if (!id) continue;
          var rowCycle = cCy === -1 ? '' : flowStr_(dd[r][cCy]);
          if (cycle && rowCycle !== cycle) continue;
          if (seenDraftId[id]) { dupDraftIds[id] = (dupDraftIds[id] || 1) + 1; } else { seenDraftId[id] = 1; }
          var st = (cSt === -1 ? '' : flowStr_(dd[r][cSt])).toLowerCase();
          byStatus[st] = (byStatus[st] || 0) + 1;
          drafts.push({ id: id, status: st, sku: cSku === -1 ? '' : flowStr_(dd[r][cSku]),
            series: cSer === -1 ? '' : flowStr_(dd[r][cSer]), generation_type: cGen === -1 ? '' : flowStr_(dd[r][cGen]),
            planning_cycle: rowCycle });
        }
      }
    }
  } catch (e) { /* absent table -> reported as zero below */ }
  out.allocation_drafts = {
    matched: drafts.length,
    by_status: byStatus,
    site_confirmed: byStatus.site_confirmed || 0,
    submitted: byStatus.submitted || 0,
    still_draft: byStatus.draft || 0,
    partially_submitted: byStatus.partially_submitted || 0,
    cancelled: byStatus.cancelled || 0,
    duplicate_primary_keys: Object.keys(dupDraftIds)
  };
  // line counts for the drafts that advanced (a draft with no lines cannot produce an order line)
  var advanced = drafts.filter(function (d) { return d.status === 'site_confirmed' || d.status === 'submitted'; });
  var draftsWithNoLines = [];
  for (var i = 0; i < advanced.length && i < 400; i++) {
    if (flowCountBy_(ss, 'request_order_allocation_draft_lines', 'request_allocation_draft_id', advanced[i].id) === 0) {
      draftsWithNoLines.push(advanced[i].id);
    }
  }
  out.allocation_drafts.advanced_with_no_lines = draftsWithNoLines;
  out.allocation_drafts.line_scan_capped = advanced.length > 400;

  // ---- 2. Request Orders created by this allocation-batch execution path ----------------------------------
  var orders = [], dupKeys = {}, seenKey = {};
  try {
    var osh = ss.getSheetByName('request_orders');
    if (osh) {
      var od = osh.getDataRange().getValues();
      if (od.length > 1) {
        var oh = od[0].map(function (x) { return flowStr_(x).toLowerCase(); });
        var oId = oh.indexOf('request_order_id'), oNo = oh.indexOf('request_order_no');
        var oSrcT = oh.indexOf('source_ref_type'), oSrcI = oh.indexOf('source_ref_id');
        var oCy = oh.indexOf('planning_cycle'), oSer = oh.indexOf('series'), oSt = oh.indexOf('order_status');
        var wantType = (typeof RO_EXEC_SOURCE_REF_TYPE_ !== 'undefined') ? RO_EXEC_SOURCE_REF_TYPE_ : 'request_order_allocation_batch';
        for (var r2 = 1; r2 < od.length; r2++) {
          if (oSrcT !== -1 && flowStr_(od[r2][oSrcT]) !== wantType) continue;
          var rowCy = oCy === -1 ? '' : flowStr_(od[r2][oCy]);
          if (cycle && rowCy !== cycle) continue;
          var key = oSrcI === -1 ? '' : flowStr_(od[r2][oSrcI]);
          if (execKey && key !== execKey) continue;
          if (key) { if (seenKey[key]) { dupKeys[key] = (dupKeys[key] || 1) + 1; } else { seenKey[key] = 1; } }
          var roId = oId === -1 ? '' : flowStr_(od[r2][oId]);
          orders.push({ request_order_id: roId, request_order_no: oNo === -1 ? '' : flowStr_(od[r2][oNo]),
            execution_key: key, series: oSer === -1 ? '' : flowStr_(od[r2][oSer]),
            order_status: oSt === -1 ? '' : flowStr_(od[r2][oSt]),
            line_count: roId ? flowCountBy_(ss, 'request_order_lines', 'request_order_id', roId) : 0,
            source_row_count: roId ? flowCountBy_(ss, 'request_order_line_sources', 'request_order_id', roId) : 0 });
        }
      }
    }
  } catch (e2) { /* absent table -> zero */ }
  out.request_orders = {
    matched: orders.length,
    duplicate_execution_keys: Object.keys(dupKeys),
    distinct_execution_keys: Object.keys(seenKey).length,
    headers_with_zero_lines: orders.filter(function (o) { return o.line_count === 0; }).map(function (o) { return o.request_order_no || o.request_order_id; }),
    rows: orders.slice(0, 40)
  };
  out.request_order_lines_total = orders.reduce(function (s, o) { return s + o.line_count; }, 0);
  out.request_order_line_sources_total = orders.reduce(function (s, o) { return s + o.source_row_count; }, 0);

  // ---- 3. partial / inconsistent state detection ----------------------------------------------------------
  var partial = [];
  if (out.allocation_drafts.site_confirmed > 0 && out.request_orders.matched === 0) {
    partial.push({ state: 'DRAFTS_CONFIRMED_WITHOUT_REQUEST_ORDER',
      detail: out.allocation_drafts.site_confirmed + ' draft(s) reached site_confirmed but no Request Order exists for this scope. ' +
        'This is the EXPECTED shape of a Send stopped between its allocation phase and its order phase.' });
  }
  if (out.request_orders.matched > 0 && out.allocation_drafts.submitted === 0) {
    partial.push({ state: 'REQUEST_ORDER_WITHOUT_SUBMITTED_DRAFTS',
      detail: 'Request Order(s) exist but no allocation draft reached submitted — the Send stopped before its final lifecycle advance.' });
  }
  if (out.request_orders.headers_with_zero_lines.length) {
    partial.push({ state: 'REQUEST_ORDER_HEADER_WITHOUT_LINES',
      detail: 'header(s) with zero lines: ' + out.request_orders.headers_with_zero_lines.join(',') });
  }
  if (draftsWithNoLines.length) {
    partial.push({ state: 'ADVANCED_DRAFT_WITHOUT_LINES', detail: draftsWithNoLines.slice(0, 20).join(',') });
  }
  if (out.allocation_drafts.duplicate_primary_keys.length) {
    partial.push({ state: 'DUPLICATE_ALLOCATION_DRAFT_PRIMARY_KEY', detail: out.allocation_drafts.duplicate_primary_keys.slice(0, 20).join(',') });
  }
  if (out.request_orders.duplicate_execution_keys.length) {
    partial.push({ state: 'DUPLICATE_REQUEST_ORDER_EXECUTION_KEY', detail: out.request_orders.duplicate_execution_keys.slice(0, 20).join(',') });
  }
  out.partial_states = partial;

  // ---- 4. safe resume point + retry verdict ---------------------------------------------------------------
  // A duplicated identity, or a header with no lines, is the ONLY class of finding that makes a retry unsafe:
  // everything else CONVERGES, because the draft ids are deterministic (find-or-update) and the Request Order
  // is keyed by the execution key (reuse, never a second row).
  var unsafe = out.allocation_drafts.duplicate_primary_keys.length > 0 ||
    out.request_orders.duplicate_execution_keys.length > 0 ||
    out.request_orders.headers_with_zero_lines.length > 0;
  out.retry_safe = !unsafe;
  out.user_action_required = unsafe;
  if (unsafe) {
    out.safe_resume_point = 'NONE — resolve the duplicate/incomplete identities above first. Do NOT retry.';
    out.next_action = 'A duplicated primary key / execution key, or a header with no lines, cannot be resolved by a retry. ' +
      'Reconcile those exact rows before any further Send.';
  } else if (out.allocation_drafts.site_confirmed > 0 && out.request_orders.matched === 0) {
    out.safe_resume_point = 'RE_RUN_SEND_FOR_THE_SAME_SCOPE';
    out.next_action = 'Re-running Send for the same scope is safe: the confirmed drafts are addressed by their deterministic ids ' +
      '(find-or-update, no new rows) and the Request Order will be created once under its execution key.';
  } else if (out.request_orders.matched > 0 && out.allocation_drafts.submitted === 0) {
    out.safe_resume_point = 'RE_RUN_SEND_FOR_THE_SAME_SCOPE';
    out.next_action = 'Re-running Send for the same scope is safe: the existing Request Order is REUSED by execution key ' +
      '(reused:true) and only the final lifecycle advance completes.';
  } else if (out.request_orders.matched > 0) {
    out.safe_resume_point = 'ALREADY_COMPLETE';
    out.next_action = 'The lifecycle looks complete for this scope. Verify the Request Order on the Request Order Draft page before sending again.';
  } else {
    out.safe_resume_point = 'NOTHING_WAS_WRITTEN_FOR_THIS_SCOPE';
    out.next_action = 'No allocation draft advanced and no Request Order exists for this scope — the interrupted attempt left nothing behind.';
  }
  out.verdict = unsafe ? 'BLOCKED' : (partial.length ? 'PARTIAL_SAFELY_RESUMABLE' : 'CONSISTENT');
  out.server_ms = Date.now() - started;
  return jsonResponse_(out);
}

// Optional scoping. Leave both as placeholders to reconcile every allocation-batch Request Order.
var TEMP_ROREC_PLANNING_CYCLE_ = 'PASTE_PLANNING_CYCLE_HERE_OR_LEAVE_BLANK';
var TEMP_ROREC_EXECUTION_KEY_ = 'PASTE_EXECUTION_KEY_HERE_OR_LEAVE_BLANK';

function TEMP_REQUEST_ORDER_SEND_RECONCILE() {
  var d = {};
  try {
    d = JSON.parse(handleRequestOrderSendReconcile_({
      planning_cycle: TEMP_ROREC_PLANNING_CYCLE_, execution_key: TEMP_ROREC_EXECUTION_KEY_
    }).getContent());
  } catch (e) { Logger.log('[RO-RECONCILE] UNPARSEABLE'); return; }
  Logger.log('[RO-RECONCILE] verdict=' + d.verdict + ' retry_safe=' + d.retry_safe + ' user_action_required=' + d.user_action_required);
  Logger.log('[RO-RECONCILE] scope=' + JSON.stringify(d.scope));
  Logger.log('[RO-RECONCILE] note=' + d.note);
  var a = d.allocation_drafts || {};
  Logger.log('[RO-RECONCILE][drafts] matched=' + a.matched + ' draft=' + a.still_draft + ' site_confirmed=' + a.site_confirmed +
    ' submitted=' + a.submitted + ' partially_submitted=' + a.partially_submitted + ' cancelled=' + a.cancelled);
  Logger.log('[RO-RECONCILE][drafts] duplicate_pks=[' + (a.duplicate_primary_keys || []).join(',') + ']' +
    ' advanced_with_no_lines=[' + (a.advanced_with_no_lines || []).join(',') + '] line_scan_capped=' + a.line_scan_capped);
  var o = d.request_orders || {};
  Logger.log('[RO-RECONCILE][orders] matched=' + o.matched + ' distinct_execution_keys=' + o.distinct_execution_keys +
    ' duplicate_execution_keys=[' + (o.duplicate_execution_keys || []).join(',') + ']' +
    ' headers_with_zero_lines=[' + (o.headers_with_zero_lines || []).join(',') + ']');
  Logger.log('[RO-RECONCILE][orders] lines_total=' + d.request_order_lines_total + ' line_sources_total=' + d.request_order_line_sources_total);
  (o.rows || []).forEach(function (r) {
    Logger.log('[RO-RECONCILE][order] no=' + r.request_order_no + ' series=' + r.series + ' status=' + r.order_status +
      ' lines=' + r.line_count + ' sources=' + r.source_row_count + ' exec_key=' + r.execution_key);
  });
  (d.partial_states || []).forEach(function (p) { Logger.log('[RO-RECONCILE][partial] ' + p.state + ' — ' + p.detail); });
  Logger.log('[RO-RECONCILE] safe_resume_point=' + d.safe_resume_point);
  Logger.log('[RO-RECONCILE] next_action=' + d.next_action);
  Logger.log('[RO-RECONCILE] request_id=' + d.request_id + ' server_ms=' + d.server_ms);
  Logger.log('READ_ONLY = ' + d.read_only);
  Logger.log('DB_WRITES = ' + d.db_writes);
  Logger.log('DRIVE_WRITES = ' + d.drive_writes);
  Logger.log('STATUS_TRANSITIONS = ' + d.status_transitions);
  Logger.log('EMAILS = ' + d.emails);
  Logger.log('DEMO_MUTATIONS = ' + d.demo_mutations);
}
