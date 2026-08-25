// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// TEMP_document_diagnostics.gs — F1-7N-FB-1B-G1 §B callable READ-ONLY document diagnostics
// NOTE: All .gs files in this folder share ONE global scope. Copy them into the project TOGETHER.
// ------------------------------------------------------------
// TWO top-level functions you can select and Run from the Apps Script editor, because a router action alone is
// not a runnable instruction. Paste the id into the matching constant below, pick the function, press Run, then
// read the Execution log.
//
//   TEMP_DOCUMENT_DIAGNOSE_PURCHASE_ORDER   -> "can this Draft PO be sent, and what exactly would be produced?"
//   TEMP_DOCUMENT_DIAGNOSE_SHIPMENT         -> "can this Shipment be confirmed, which documents apply, which
//                                               of them actually block, and what is merely deferred?"
//
// STRICTLY READ-ONLY, and it is structural rather than a promise: both functions delegate to the SAME production
// evaluators the router actions use (handlePoDocumentDiagnostic_ / handleShipmentDocumentDiagnostic_ in 39_), so
// there is exactly ONE diagnostic implementation and no second, drifting copy. Those evaluators:
//   · write NO DB row, property, flag or status;
//   · create NO Drive folder, NO file and NO PDF (Drive is touched only through non-mutating probes that open a
//     configured identity and read its name/type);
//   · send NO email;
//   · never invoke Send PO or Confirm Shipment;
//   · never touch Demo data;
//   · report every folder path as a PREVIEW, never as something that was created.
//
// Each run emits ONE compact primary Logger line, kept well inside the Apps Script log-truncation ceiling by
// summarising verdicts and counts rather than dumping the full payload. A few short secondary lines follow for
// the per-document detail; nothing is echoed that could leak a credential.
//
// ------------------------------------------------------------------------------------------------------------
// RETENTION / CLEANUP RULE (F1-7N-FB-1B-G2 §D)
// ------------------------------------------------------------------------------------------------------------
// This file exists ONLY to make the controlled live test runnable from the Apps Script editor. It is a thin
// logging shell over the production evaluators and holds no logic of its own, so deleting it can never change
// how documents are generated, listed, fetched or retried: the production paths are the router actions
// document.list / document.get / document.retry / document.diagnostic.* plus the Send PO and Confirm Shipment
// sagas, and NOTHING in production calls anything defined in this file (a test asserts that in both directions).
//
// It MAY be removed from BOTH the deployed Apps Script project AND active repository source once ALL SIX of the
// following have been completed and verified:
//   1. both diagnostics have run successfully against controlled REAL records;
//   2. one controlled Purchase Order has generated its document and moved from Draft into the In Production UI
//      group (order_status = issued);
//   3. one controlled Shipment has passed readiness, become `shipped`, and generated its required documents;
//   4. generated_documents and BOTH UI Document Panels (Shipment Draft / Overview, Purchase Order Workspace)
//      have been verified against those records;
//   5. retry / idempotency has been verified — a repeat produces no duplicate folder, file, PDF or registry row;
//   6. no unresolved CONFIGURATION_REQUIRED item affects either of the two BLOCKING Shipment documents
//      (SHIPMENT_DETAIL, PACKING_LIST_EXPORT). A CONFIGURATION_REQUIRED item on a non-blocking document
//      (Commercial Invoice, destination forms, carrier booking) does not hold up removal.
// Until all six hold, keep the file: it is the only editor-runnable way to answer "why was this blocked?".
// ============================================================

// ---- PASTE THE ID YOU WANT TO DIAGNOSE HERE -----------------------------------------------------------
// Use the INTERNAL PRIMARY KEY, not a display number:
//   purchase_orders.purchase_order_id   (NOT po_no / km_po_no)
//   shipments.shipment_id               (NOT shipment_no / external_shipment_id)
var TEMP_DOCUMENT_DIAGNOSTIC_PURCHASE_ORDER_ID_ = 'PASTE_PURCHASE_ORDER_ID_HERE';
var TEMP_DOCUMENT_DIAGNOSTIC_SHIPMENT_ID_ = 'PASTE_SHIPMENT_ID_HERE';

var TEMP_DOC_DIAG_PLACEHOLDERS_ = { PASTE_PURCHASE_ORDER_ID_HERE: 1, PASTE_SHIPMENT_ID_HERE: 1 };
var TEMP_DOC_DIAG_LOG_CAP_ = 7000;   // keep every line comfortably inside the log truncation ceiling

function tempDocDiagStr_(v) { return String(v == null ? '' : v).trim(); }
// Reject a blank or still-placeholder id loudly, so a run can never silently diagnose "nothing".
function tempDocDiagCheckId_(raw, constantName, example) {
  var id = tempDocDiagStr_(raw);
  if (!id || TEMP_DOC_DIAG_PLACEHOLDERS_[id]) {
    Logger.log('[DOC-DIAG] BLOCKED — ' + constantName + ' is still the placeholder. Paste a real internal id (e.g. ' + example + ') and Run again. Nothing was read or written.');
    return null;
  }
  return id;
}
function tempDocDiagLog_(line) {
  var s = tempDocDiagStr_(line);
  Logger.log(s.length > TEMP_DOC_DIAG_LOG_CAP_ ? (s.substring(0, TEMP_DOC_DIAG_LOG_CAP_) + ' …[truncated]') : s);
}
// The production handlers return a ContentService response; unwrap it without re-implementing anything.
function tempDocDiagUnwrap_(resp) {
  try { return JSON.parse(resp.getContent()); } catch (e) { return { success: false, error: 'DIAGNOSTIC_RESPONSE_UNPARSEABLE' }; }
}
function tempDocDiagCount_(list, pred) {
  var n = 0; (list || []).forEach(function (x) { if (pred(x)) n++; }); return n;
}

// =========================================================================================================
// PURCHASE ORDER — is this Draft PO sendable, and what exactly would Send PO produce?
// =========================================================================================================
function TEMP_DOCUMENT_DIAGNOSE_PURCHASE_ORDER() {
  var poId = tempDocDiagCheckId_(TEMP_DOCUMENT_DIAGNOSTIC_PURCHASE_ORDER_ID_, 'TEMP_DOCUMENT_DIAGNOSTIC_PURCHASE_ORDER_ID_', 'PO-2026-0001');
  if (!poId) return;
  var d = tempDocDiagUnwrap_(handlePoDocumentDiagnostic_({ purchase_order_id: poId }));
  if (!d.success) {
    tempDocDiagLog_('[DOC-DIAG][PO] FAILED id=' + poId + ' error=' + tempDocDiagStr_(d.error) + ' | 0 writes, 0 folders, 0 files.');
    return;
  }
  var fc = d.field_completeness || {};
  var fp = d.folder_preview || {};
  var tpl = d.template || {};
  var blockers = (d.blocking_reasons || []).map(function (b) { return tempDocDiagStr_(b.reason); });
  // ---- ONE compact primary line ----
  tempDocDiagLog_(
    '[DOC-DIAG][PO] ' + tempDocDiagStr_(d.purchase_order_id) + ' (' + tempDocDiagStr_(d.po_no) + ')' +
    ' | db_status=' + tempDocDiagStr_(d.db_status) + ' ui_group=' + tempDocDiagStr_(d.ui_group) +
    ' | eligible_for_send_po=' + (d.eligible_for_send_po === true) +
    ' | lines=' + tempDocDiagStr_(d.line_count) +
    ' | template=' + (tpl.template_key ? (tempDocDiagStr_(tpl.template_key) + ' v' + tempDocDiagStr_(tpl.template_version)) : ('NONE(' + tempDocDiagStr_(d.template_error) + ')')) +
    ' | system_payload=' + tempDocDiagStr_(d.system_payload_verdict) +
    ' fields=' + (fc.complete === true ? 'COMPLETE' : ((fc.required_missing || []).length + ' MISSING')) +
    ' mapped=' + tempDocDiagStr_(fc.mapped_placeholders) +
    ' checksum=' + tempDocDiagStr_(d.payload_checksum) +
    ' | drive=' + tempDocDiagStr_(d.drive_readiness_verdict) +
    ' | folder_preview=' + tempDocDiagStr_(fp.path) + ' (root=' + tempDocDiagStr_(fp.root_folder_id) + ', date_source=' + tempDocDiagStr_(fp.date_source) + ')' +
    ' | file=' + tempDocDiagStr_(d.expected_file_name) +
    ' | existing_documents=' + (d.existing_documents || []).length +
    ' | SEND_PO_VERDICT=' + tempDocDiagStr_(d.send_po_verdict) +
    (blockers.length ? (' | blocked_by=' + blockers.join(',')) : '') +
    ' | READ-ONLY: writes=' + tempDocDiagStr_(d.writes_performed) + ' folders_created=' + tempDocDiagStr_(d.folders_created) + ' files_created=' + tempDocDiagStr_(d.files_created) + ' emails=0'
  );
  // ---- short secondary detail ----
  (d.required_document_manifest || []).forEach(function (m) {
    tempDocDiagLog_('[DOC-DIAG][PO][doc] ' + tempDocDiagStr_(m.class_key) + ' state=' + tempDocDiagStr_(m.state) +
      ' blocks_transition=' + (m.blocks_transition === true) + ' renderer=' + (m.renderer_available === true) +
      ' field_contract_complete=' + tempDocDiagStr_(m.required_field_contract_complete) +
      ' next=' + tempDocDiagStr_(m.next_action));
  });
  (fc.required_missing || []).slice(0, 12).forEach(function (m) {
    tempDocDiagLog_('[DOC-DIAG][PO][missing] ' + tempDocDiagStr_(m.placeholder) + ' <- ' + tempDocDiagStr_(m.data_source_path || m.data_source_field));
  });
  (d.existing_documents || []).slice(0, 8).forEach(function (x) {
    tempDocDiagLog_('[DOC-DIAG][PO][existing] ' + tempDocDiagStr_(x.generated_document_id) + ' ' + tempDocDiagStr_(x.document_label) + ' status=' + tempDocDiagStr_(x.status) + ' retryable=' + (x.retryable === true));
  });
  tempDocDiagLog_('[DOC-DIAG][PO][note] ' + tempDocDiagStr_(d.note));
}

// =========================================================================================================
// SHIPMENT — can this Shipment be confirmed, which documents apply, which BLOCK, which are deferred?
// =========================================================================================================
function TEMP_DOCUMENT_DIAGNOSE_SHIPMENT() {
  var shipmentId = tempDocDiagCheckId_(TEMP_DOCUMENT_DIAGNOSTIC_SHIPMENT_ID_, 'TEMP_DOCUMENT_DIAGNOSTIC_SHIPMENT_ID_', 'SHIP-2026-0001');
  if (!shipmentId) return;
  var d = tempDocDiagUnwrap_(handleShipmentDocumentDiagnostic_({ shipment_id: shipmentId }));
  if (!d.success) {
    tempDocDiagLog_('[DOC-DIAG][SHIP] FAILED id=' + shipmentId + ' error=' + tempDocDiagStr_(d.error) + ' | 0 writes, 0 folders, 0 files.');
    return;
  }
  var gate = d.transition_gate_manifest || {};
  var em = d.executable_manifest || [];
  var blockers = (d.blocking_reasons || []).map(function (b) { return tempDocDiagStr_(b.reason) + (b.class_key ? ('@' + tempDocDiagStr_(b.class_key)) : ''); });
  // ---- ONE compact primary line ----
  tempDocDiagLog_(
    '[DOC-DIAG][SHIP] ' + tempDocDiagStr_(d.shipment_id) + ' (' + (tempDocDiagStr_(d.external_shipment_id) || 'NO_EXTERNAL_ID') + ')' +
    ' | status=' + tempDocDiagStr_(d.db_status) + ' eligible_for_confirm=' + (d.eligible_for_confirm === true) +
    ' | dest=' + tempDocDiagStr_(d.destination_country) + '->' + (tempDocDiagStr_(d.destination_bucket) || 'UNSUPPORTED') +
    ' | system_readiness=' + tempDocDiagStr_(d.system_readiness_verdict) +
    ' drive_readiness=' + tempDocDiagStr_(d.drive_readiness_verdict) +
    ' | applicable=' + (d.applicable_manifest || []).length +
    ' required_executable=' + tempDocDiagCount_(em, function (x) { return x.state === 'REQUIRED_AND_EXECUTABLE'; }) +
    ' optional_executable=' + tempDocDiagCount_(em, function (x) { return x.state === 'OPTIONAL_AND_EXECUTABLE'; }) +
    ' config_required=' + tempDocDiagCount_(em, function (x) { return x.state === 'CONFIGURATION_REQUIRED'; }) +
    ' runtime_deferred=' + tempDocDiagCount_(em, function (x) { return x.state === 'RUNTIME_DEFERRED'; }) +
    ' | gate_policy=[' + (gate.policy_gate_classes || []).join(',') + ']' +
    ' currently_blocking=[' + (gate.currently_blocking || []).join(',') + ']' +
    ' | snapshot eligible=' + (d.snapshot_eligible === true) + ' present=' + (d.snapshot_present === true) +
    ' | shipped_at=' + (tempDocDiagStr_(d.persisted_shipped_at) || 'BLANK') +
    ' folder=' + (tempDocDiagStr_(d.final_folder_preview) || 'PREVIEW_PENDING_SHIPPED_AT') +
    ' | existing_documents=' + (d.existing_documents || []).length + ' missing_or_failed=' + (d.missing_or_failed_outputs || []).length +
    ' retry=' + tempDocDiagStr_(d.safe_retry_verdict) +
    ' | CONFIRM_VERDICT=' + tempDocDiagStr_(d.confirm_shipment_verdict) +
    (blockers.length ? (' | blocked_by=' + blockers.join(',')) : '') +
    ' | READ-ONLY: writes=' + tempDocDiagStr_(d.writes_performed) + ' folders_created=' + tempDocDiagStr_(d.folders_created) + ' files_created=' + tempDocDiagStr_(d.files_created) + ' emails=0'
  );
  // ---- short secondary detail: one line per applicable document ----
  em.forEach(function (m) {
    tempDocDiagLog_('[DOC-DIAG][SHIP][doc] ' + tempDocDiagStr_(m.class_key) + ' (' + tempDocDiagStr_(m.template_key) + ')' +
      ' state=' + tempDocDiagStr_(m.state) +
      ' requirement=' + tempDocDiagStr_(m.requirement) +
      ' BLOCKS=' + (m.blocks_transition === true) +
      ' renderer=' + (m.renderer_available === true) +
      ' field_contract=' + tempDocDiagStr_(m.required_field_contract_complete) +
      (m.missing_fields && m.missing_fields.length ? (' missing=' + m.missing_fields.slice(0, 6).map(function (x) { return tempDocDiagStr_(x.placeholder); }).join('/')) : '') +
      (m.missing_authorities && m.missing_authorities.length ? (' missing_authorities=' + m.missing_authorities.join('/')) : '') +
      ' retryable=' + (m.retryable === true) +
      ' | next=' + tempDocDiagStr_(m.next_action));
  });
  // ---- the five Commercial Invoice authorities, as actually configured ----
  (d.commercial_invoice_field_authority || []).forEach(function (a) {
    tempDocDiagLog_('[DOC-DIAG][SHIP][ci-field] ' + tempDocDiagStr_(a.placeholder) +
      ' state=' + tempDocDiagStr_(a.state) +
      ' required_by_active_template=' + (a.required_by_active_template === true) +
      ' resolved=' + (a.resolved === true) +
      ' blocks_document=' + (a.blocks_document === true) +
      ' (' + tempDocDiagStr_(a.class_key) + ')');
  });
  (d.configuration_issues || []).slice(0, 8).forEach(function (c) {
    tempDocDiagLog_('[DOC-DIAG][SHIP][config] ' + tempDocDiagStr_(c.reason) + (c.class_key ? ('@' + tempDocDiagStr_(c.class_key)) : '') + ' fix=' + tempDocDiagStr_(c.correction));
  });
  (d.existing_documents || []).slice(0, 8).forEach(function (x) {
    tempDocDiagLog_('[DOC-DIAG][SHIP][existing] ' + tempDocDiagStr_(x.generated_document_id) + ' ' + tempDocDiagStr_(x.document_label) + ' status=' + tempDocDiagStr_(x.status) + ' retryable=' + (x.retryable === true));
  });
  tempDocDiagLog_('[DOC-DIAG][SHIP][note] ' + tempDocDiagStr_(d.note));
}
