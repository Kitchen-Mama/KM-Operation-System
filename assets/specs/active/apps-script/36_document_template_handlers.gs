/**
 * 36_document_template_handlers.gs
 * Kitchen Mama Operation System — F1-5C-EXPORT-R3B document_templates / document_template_fields /
 * generated_documents runtime foundation. Closes the three R3A HALT gaps.
 *
 * SOURCE MIRROR / requires Apps Script sync. Canonical chain:
 *   shipment_final_output_snapshot -> renderShipmentDocument (R3A, 35_) -> canonical render MODEL
 *   -> document_templates (resolve ONE active template) -> document_template_fields (placeholder mapping)
 *   -> generated_documents (persisted lifecycle record). Actual file/PDF generation is deferred to R3C.
 *
 * Schemas are the FROZEN DOCUMENT_GENERATION_SYSTEM_SPEC (§C/§E/§D) — exact names/order. No convenience columns.
 * The renderer (35_) stays the ONLY factual presentation owner; the R2B snapshot stays the ONLY factual data owner.
 * The mapper reads ONLY the render model (which is snapshot-only) — it NEVER queries live master/PO/shipment tables,
 * runs FIFO, or recomputes a business fact. Table creation is USER-owned migration (twins never invoked here).
 *
 * Spec-silence resolutions (documented, minimal, non-contradicting — see docs/planning/F1_5C_EXPORT_R3B_*.md):
 *   - Template resolution tie-break: the spec names the inputs (document_type + scope + status active + effective
 *     window) but no tie-break; so resolution is EXACT-match and FAILS CLOSED on >1 (DOCUMENT_TEMPLATE_AMBIGUOUS) —
 *     never latest/first.
 *   - generated_documents has no snapshot_id column (frozen). Snapshot lineage = related_entity_id (shipment_id) →
 *     the deterministic R2B snapshot SFO-<shipment_id> (one active snapshot per shipment). No off-spec column added.
 *   - Idempotency: spec is append-only; R3B adds the minimal safe rule — reuse the active generated_documents row for
 *     (related_entity_id, document_type, template_id, template_version) unless regenerate:true (which appends and
 *     links via regenerated_from_document_id). Retry/two-tab/lost-response converge; deliberate regeneration versions.
 *   - Language: a scope filter only (unscoped template matches any). Multi-language selection deferred (documented).
 */

// FROZEN schemas (DOCUMENT_GENERATION_SYSTEM_SPEC §C/§E/§D) — exact column names & order.
var DOCUMENT_TEMPLATES_HEADERS_ = [
  'template_id', 'template_key', 'template_name', 'document_type', 'related_entity_type', 'document_category', 'document_usage',
  'series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language',
  'template_file_type', 'template_file_id', 'template_drive_url', 'output_folder_id', 'file_name_rule',
  'template_version', 'status', 'is_active', 'effective_from', 'effective_to', 'remark',
  'created_by', 'created_at', 'updated_by', 'updated_at'
];
var DOCUMENT_TEMPLATE_FIELDS_HEADERS_ = [
  'field_id', 'template_id', 'template_key', 'document_type', 'placeholder', 'field_label', 'field_type', 'data_scope',
  'data_source_table', 'data_source_field', 'data_source_path', 'collection_key', 'sort_order', 'required',
  'default_value', 'format_rule', 'transform_rule', 'fallback_rule', 'example_value', 'is_active', 'note', 'created_at', 'updated_at'
];
var GENERATED_DOCUMENTS_HEADERS_ = [
  'document_id', 'template_id', 'template_key', 'template_version', 'related_entity_type', 'related_entity_id', 'document_type',
  'series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language',
  'file_name', 'file_id', 'file_url', 'pdf_file_id', 'pdf_file_url', 'output_folder_id',
  'generated_by', 'generated_at', 'status', 'email_status', 'email_sent_at', 'regenerated_from_document_id', 'note', 'created_at', 'updated_at'
];

// R3A document_type -> frozen document_templates.document_type enum. F1-7N-FB-1B adds CI (Commercial Invoice),
// whose render model now exists in 35_. carrier_booking_form stays out until its render model is built.
var DOC_TYPE_ENUM_ = { SHIPDETAIL: 'shipment_detail', PL: 'packing_list', CI: 'commercial_invoice' };
// scope dimensions the spec defines on document_templates (NB: no `company` scope column).
var DT_SCOPE_DIMS_ = ['series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language'];

// __DOCTPL_PURE_START__
// Pure resolver + placeholder mapper (eval'd verbatim by the test harness). No sheet / clock / router / master.
function dtStr_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function dtLc_(v) { return dtStr_(v).toLowerCase(); }
function dtUc_(v) { return dtStr_(v).toUpperCase(); }
function dtNum_(v) { if (v === null || v === undefined || v === '') return 0; var n = Number(String(v).replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; }
function dtBool_(v) { if (v === true) return true; var s = dtLc_(v); return s === 'true' || s === 'yes' || s === 'y' || s === '1'; }
function dtInWindow_(row, asOf) {
  var q = dtStr_(asOf); if (!q) return true;
  var from = dtStr_(row.effective_from), to = dtStr_(row.effective_to);
  if (from && from > q) return false;
  if (to && to < q) return false;
  return true;
}
// active = status active + is_active truthy + effective window (frozen §C line 108).
function dtTemplateActive_(row, asOf) { return dtLc_(row.status) === 'active' && dtBool_(row.is_active) && dtInWindow_(row, asOf); }
// scope match: blank template dimension = unscoped (matches any); non-blank must equal the request value.
function dtScopeMatch_(row, req) {
  for (var i = 0; i < ['series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language'].length; i++) {
    var dim = ['series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language'][i];
    var tv = dtStr_(row[dim]); if (!tv) continue;
    if (dtLc_(tv) !== dtLc_(req[dim])) return false;
  }
  return true;
}
// Resolve exactly ONE active template. 0 -> NOT_CONFIGURED, >1 -> AMBIGUOUS (fail closed; never latest/first).
function dtResolveTemplate_(templateRows, req) {
  var dt = dtLc_(req.document_type);
  var cand = (templateRows || []).filter(function (r) { return dtLc_(r.document_type) === dt && dtTemplateActive_(r, req.asOf) && dtScopeMatch_(r, req); });
  if (cand.length === 0) return { ok: false, error: 'DOCUMENT_TEMPLATE_NOT_CONFIGURED' };
  if (cand.length > 1) return { ok: false, error: 'DOCUMENT_TEMPLATE_AMBIGUOUS', count: cand.length };
  return { ok: true, template: cand[0] };
}
// dotted-path traversal into the render model (or a collection item). Returns '' if absent.
function dtResolvePath_(root, path) {
  var p = dtStr_(path); if (!p) return '';
  var cur = root, parts = p.split('.');
  for (var i = 0; i < parts.length; i++) { if (cur === null || cur === undefined) return ''; cur = cur[parts[i]]; }
  return (cur === null || cur === undefined) ? '' : cur;
}
function dtApplyTransform_(v, rule) {
  var r = dtLc_(rule); if (!r) return v;
  if (r === 'upper') return dtUc_(v);
  if (r === 'lower') return dtLc_(v);
  return v;
}
function dtApplyFormat_(v, rule) {
  var r = dtLc_(rule); if (!r) return v;
  if (r === 'number' || r === 'currency') return dtNum_(v);
  return v; // date/text pass through (values are already frozen strings/numbers in the snapshot)
}
// resolve a single field's value against a context object (render model root, or a collection item).
function dtResolveField_(field, ctx) {
  var raw = field.data_source_path ? dtResolvePath_(ctx, field.data_source_path) : dtResolvePath_(ctx, field.data_source_field);
  var present = !(raw === '' || raw === null || raw === undefined);
  if (!present) {
    // spec: default_value = present-but-empty; fallback_rule = missing. Apply fallback first for missing.
    if (dtStr_(field.fallback_rule)) raw = field.fallback_rule;
    else if (dtStr_(field.default_value)) raw = field.default_value;
  } else if (raw === '' && dtStr_(field.default_value)) { raw = field.default_value; }
  raw = dtApplyTransform_(raw, field.transform_rule);
  raw = dtApplyFormat_(raw, field.format_rule);
  return { value: raw, present: present || dtStr_(field.default_value) !== '' || dtStr_(field.fallback_rule) !== '' };
}
// Map the render model through document_template_fields -> { values, missing }. Scalars resolve against the model
// root; collections (field_type=collection, data_scope line|allocation) resolve child (collection_item) fields per
// source row. Required + unresolved -> missing (fail-closed signal). NO live lookup; model is snapshot-only.
function dtMapPlaceholders_(model, fieldRows) {
  var fields = (fieldRows || []).filter(function (f) { return dtBool_(f.is_active) || dtStr_(f.is_active) === ''; })
    .slice().sort(function (a, b) { return dtNum_(a.sort_order) - dtNum_(b.sort_order); });
  var values = {}, missing = [];
  function collectionRows(scope) {
    if (dtLc_(scope) === 'line') return (model.lines || []).slice();
    if (dtLc_(scope) === 'allocation') {
      var out = []; (model.lines || []).forEach(function (l) { (l.po_allocations || []).forEach(function (a) { out.push({ sku: l.sku, po_no: a.po_no, allocated_qty: a.allocated_qty, purchase_order_line_id: a.purchase_order_line_id }); }); }); return out;
    }
    return [];
  }
  fields.forEach(function (f) {
    var ftype = dtLc_(f.field_type);
    if (ftype === 'collection_item') return; // handled by its parent collection
    if (ftype === 'collection') {
      var rows = collectionRows(f.data_scope);
      var children = fields.filter(function (c) { return dtLc_(c.field_type) === 'collection_item' && dtStr_(c.collection_key) && dtStr_(c.collection_key) === dtStr_(f.collection_key); });
      values[dtStr_(f.placeholder)] = rows.map(function (item) {
        var row = {};
        children.forEach(function (c) {
          var r = dtResolveField_(c, item);
          row[dtStr_(c.placeholder)] = r.value;
          if (dtBool_(c.required) && !r.present) missing.push({ placeholder: dtStr_(c.placeholder), collection_key: dtStr_(f.collection_key), data_source_field: dtStr_(c.data_source_field), data_source_path: dtStr_(c.data_source_path) });
        });
        return row;
      });
      return;
    }
    var res = dtResolveField_(f, model);
    values[dtStr_(f.placeholder)] = res.value;
    if (dtBool_(f.required) && !res.present) missing.push({ placeholder: dtStr_(f.placeholder), data_source_field: dtStr_(f.data_source_field), data_source_path: dtStr_(f.data_source_path) });
  });
  return { values: values, missing: missing };
}
// deterministic idempotency key for a generated document (snapshot-immutable per shipment).
function dtGeneratedKey_(relatedEntityId, documentTypeEnum, templateId, templateVersion) {
  return dtStr_(relatedEntityId) + '|' + dtLc_(documentTypeEnum) + '|' + dtStr_(templateId) + '|' + dtNum_(templateVersion);
}
// __DOCTPL_PURE_END__

// ---- validate-only reads ----
function dtReadTable_(ss, name, headers) { return sfoRowsAsObjects_(prodRequireSheet_(ss, name, headers)); }

function handleDocumentTemplateList_(body) {
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());
  var docType = dtLc_(body && body.document_type);
  var rows = dtReadTable_(ss, 'document_templates', DOCUMENT_TEMPLATES_HEADERS_).filter(function (r) {
    return dtTemplateActive_(r, '') && (!docType || dtLc_(r.document_type) === docType);
  }).map(function (r) { return { template_id: dtStr_(r.template_id), template_key: dtStr_(r.template_key), template_name: dtStr_(r.template_name), document_type: dtStr_(r.document_type), template_version: dtNum_(r.template_version), template_file_type: dtStr_(r.template_file_type), template_file_id: dtStr_(r.template_file_id) }; });
  return jsonResponse_({ success: true, templates: rows });
}
function handleDocumentTemplateGetFields_(body) {
  var templateId = dtStr_(body && body.template_id);
  if (!templateId) return jsonResponse_({ success: false, error: 'TEMPLATE_ID_REQUIRED' });
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());
  var fields = dtReadTable_(ss, 'document_template_fields', DOCUMENT_TEMPLATE_FIELDS_HEADERS_).filter(function (r) { return dtStr_(r.template_id) === templateId; });
  return jsonResponse_({ success: true, template_id: templateId, fields: fields });
}

// Generate the persisted lifecycle record for a shipment document. Renders via the R3A renderer (snapshot-only),
// resolves ONE active template, maps placeholders, fails closed on required-missing, and idempotently upserts a
// generated_documents record. R3C: when body.generate_file is true, ALSO produces the real Drive file from the
// configured template asset (37_ renderer) and writes its metadata back into the frozen generated_documents file
// columns. When generate_file is falsy the R3B behavior is preserved exactly (record + mapping, no file).
function handleShipmentDocumentGenerate_(body) {
  var shipmentId = dtStr_(body && body.shipment_id);
  var docTypeIn = dtUc_(body && body.document_type);
  var actor = dtStr_(body && body.actor) || 'system';
  var regenerate = !!(body && body.regenerate);
  var wantFile = !!(body && body.generate_file);   // R3C opt-in: generate the real file (default off = R3B behavior)
  if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });
  var docEnum = DOC_TYPE_ENUM_[docTypeIn];
  if (!docEnum) return jsonResponse_({ success: false, error: 'UNSUPPORTED_DOCUMENT_TYPE', supported: ['SHIPDETAIL', 'PL'] });

  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }
  try {
    var ss = SpreadsheetApp.openById(prodExpectedDbId_());
    // 1) render from the frozen snapshot (R3A) — no live masters
    var snap = docReadSnapshot_(ss, shipmentId);
    if (!snap) return jsonResponse_({ success: true, finalized: false, shipment_id: shipmentId, note: 'No finalized snapshot — run finalizeShipmentFinalOutput first.' });
    var model = (docTypeIn === 'SHIPDETAIL') ? docRenderShippingDetail_(snap) : docRenderPackingList_(snap);
    if (!model.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, blocked: model.blocked || false, error: model.error || 'DOCUMENT_NOT_READY', reason: model.reason, missing: model.missing });

    // 2) resolve ONE active template (scope from the frozen model header; fail closed on 0/>1)
    var h = snap.header;
    var req = { document_type: docEnum, country: dtStr_(h.country), marketplace: dtStr_(h.marketplace), carrier_id: dtStr_(body && body.carrier_id), language: dtStr_(body && body.language), asOf: dtStr_(h.dispatch_date) };
    var tRes = dtResolveTemplate_(dtReadTable_(ss, 'document_templates', DOCUMENT_TEMPLATES_HEADERS_), req);
    if (!tRes.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, error: tRes.error, count: tRes.count });
    var tpl = tRes.template;

    // 3) map placeholders through document_template_fields; fail closed on required-missing
    var fields = dtReadTable_(ss, 'document_template_fields', DOCUMENT_TEMPLATE_FIELDS_HEADERS_).filter(function (r) { return dtStr_(r.template_id) === dtStr_(tpl.template_id); });
    var mapped = dtMapPlaceholders_(model, fields);
    if (mapped.missing.length) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, template_id: dtStr_(tpl.template_id), error: 'DOCUMENT_REQUIRED_FIELD_MISSING', missing: mapped.missing });

    // 4) idempotent generated_documents lifecycle record
    var genSheet = prodRequireSheet_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_);
    var key = dtGeneratedKey_(shipmentId, docEnum, tpl.template_id, tpl.template_version);
    var existing = sfoRowsAsObjects_(genSheet).filter(function (r) {
      return dtGeneratedKey_(r.related_entity_id, r.document_type, r.template_id, r.template_version) === key && (dtLc_(r.status) === 'generated' || dtLc_(r.status) === 'regenerated');
    });
    var fileMeta = { document_type: docEnum, shipment_id: shipmentId, shipment_no: dtStr_(h.shipment_no), snapshot_id: dtStr_(h.snapshot_id), snapshot_version: dtStr_(h.snapshot_version), dispatch_date: dtStr_(h.dispatch_date) };
    if (existing.length && !regenerate) {
      var ex = existing[0];
      // R3C: if a file is wanted and this record has none yet, generate it and update THIS row (idempotent reuse).
      if (wantFile && !dtStr_(ex.file_id)) {
        var lfx = dtResolveLeafFolder_(ss, tpl, shipmentId);
        if (!lfx.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, template_id: dtStr_(tpl.template_id), error: lfx.reason, detail: lfx });
        var frx = dfoGenerateFile_(dfoDefaultIo_(), tpl, mapped, fileMeta, { folder_id: lfx.folder_id });
        if (!frx.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, template_id: dtStr_(tpl.template_id), error: frx.error, message: frx.message, type: frx.type, supported: frx.supported, partial_file_id: frx.partial_file_id });
        dtUpdateGeneratedFile_(genSheet, dtStr_(ex.document_id), frx, shipmentTimestamp_(), lfx.folder_id);
        return jsonResponse_({ success: true, reused: true, generated_file: true, document_id: dtStr_(ex.document_id), template_id: dtStr_(tpl.template_id), template_version: dtNum_(tpl.template_version), file_name: frx.file_name, file_id: frx.file_id, file_url: frx.file_url, pdf_file_url: frx.pdf_file_url, download_url: (frx.pdf_file_url || frx.file_url) });
      }
      return jsonResponse_({ success: true, reused: true, document_id: dtStr_(ex.document_id), template_id: dtStr_(tpl.template_id), template_version: dtNum_(tpl.template_version), status: dtStr_(ex.status), file_url: dtStr_(ex.file_url), pdf_file_url: dtStr_(ex.pdf_file_url), download_url: (dtStr_(ex.pdf_file_url) || dtStr_(ex.file_url)), placeholder_values: mapped.values, note: 'Existing generated document reused (idempotent).' });
    }
    // R3C: generate the file BEFORE persisting the row, so a failed file generation never leaves a false "generated"
    // record with no file. (A file created then a DB failure re-runs to REUSE the same row by key — bounded orphan.)
    var fileFields = { file_name: '', file_id: '', file_url: '', pdf_file_id: '', pdf_file_url: '' };
    var leafFolderId = '';
    if (wantFile) {
      var lf = dtResolveLeafFolder_(ss, tpl, shipmentId);
      if (!lf.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, template_id: dtStr_(tpl.template_id), error: lf.reason, detail: lf });
      leafFolderId = lf.folder_id;
      var fr = dfoGenerateFile_(dfoDefaultIo_(), tpl, mapped, fileMeta, { folder_id: leafFolderId });
      if (!fr.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, template_id: dtStr_(tpl.template_id), error: fr.error, message: fr.message, type: fr.type, supported: fr.supported, partial_file_id: fr.partial_file_id });
      fileFields = { file_name: fr.file_name, file_id: fr.file_id, file_url: fr.file_url, pdf_file_id: fr.pdf_file_id, pdf_file_url: fr.pdf_file_url };
    }
    var now = shipmentTimestamp_();
    var docId = 'GDOC-' + Utilities.getUuid().substring(0, 12).toUpperCase();
    var row = {
      document_id: docId, template_id: dtStr_(tpl.template_id), template_key: dtStr_(tpl.template_key), template_version: dtNum_(tpl.template_version),
      related_entity_type: 'shipment', related_entity_id: shipmentId, document_type: docEnum,
      series: '', sku: '', supplier_id: '', factory_id: dtStr_(h.factory_id), carrier_id: dtStr_(h.carrier_id) || dtStr_(body && body.carrier_id),
      country: dtStr_(h.country), marketplace: dtStr_(h.marketplace), language: dtStr_(body && body.language),
      // F1-7N-FB-1B §B — output_folder_id stores the ACTUAL LEAF folder holding the document. It used to store
      // the configured ROOT (tpl.output_folder_id), which was both wrong and unusable as a link target.
      file_name: fileFields.file_name, file_id: fileFields.file_id, file_url: fileFields.file_url, pdf_file_id: fileFields.pdf_file_id, pdf_file_url: fileFields.pdf_file_url, output_folder_id: leafFolderId,
      generated_by: actor, generated_at: now, status: (existing.length ? 'regenerated' : 'generated'), email_status: 'not_sent', email_sent_at: '',
      regenerated_from_document_id: (existing.length ? dtStr_(existing[0].document_id) : ''),
      note: (wantFile ? 'R3C generated file from the configured template asset.' : 'R3B lifecycle record; file generation not requested.'), created_at: now, updated_at: now
    };
    dtAppendByHeader_(genSheet, row);
    return jsonResponse_({ success: true, reused: false, regenerated: existing.length > 0, generated_file: wantFile, document_id: docId, template_id: dtStr_(tpl.template_id), template_version: dtNum_(tpl.template_version), status: row.status, snapshot_id: dtStr_(h.snapshot_id), file_name: fileFields.file_name, file_id: fileFields.file_id, file_url: fileFields.file_url, pdf_file_url: fileFields.pdf_file_url, download_url: (fileFields.pdf_file_url || fileFields.file_url), placeholder_values: mapped.values });
  } catch (err) {
    return jsonResponse_({ success: false, error: 'DOCUMENT_GENERATION_FAILED: ' + (err && err.message ? err.message : err), shipment_id: shipmentId });
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

function dtAppendByHeader_(sheet, obj) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var row = new Array(headers.length).fill('');
  for (var i = 0; i < headers.length; i++) { if (obj.hasOwnProperty(headers[i]) && obj[headers[i]] !== undefined && obj[headers[i]] !== null) row[i] = obj[headers[i]]; }
  sheet.appendRow(row);
}

// R3C — write generated file metadata back onto an existing generated_documents row (by document_id) into the frozen
// file columns only. Never touches factual/lineage columns. No new column.
function dtUpdateGeneratedFile_(sheet, documentId, fr, now, leafFolderId) {
  var d = sheet.getDataRange().getValues();
  var head = d[0].map(function (x) { return String(x).trim(); });
  var cId = head.indexOf('document_id');
  var set = { file_name: fr.file_name, file_id: fr.file_id, file_url: fr.file_url, pdf_file_id: fr.pdf_file_id, pdf_file_url: fr.pdf_file_url, updated_at: now };
  if (dtStr_(leafFolderId)) set.output_folder_id = dtStr_(leafFolderId);
  for (var r = 1; r < d.length; r++) {
    if (String(d[r][cId]).trim() === String(documentId).trim()) {
      Object.keys(set).forEach(function (k) { var c = head.indexOf(k); if (c !== -1) sheet.getRange(r + 1, c + 1).setValue(set[k]); });
      return true;
    }
  }
  return false;
}

// F1-7N-FB-1B §B/§N — the exact LEAF folder this document belongs in. Resolution lives in 39_
// (dgsResolveShipmentLeafFolder_), NOT here: F1-5C-EXPORT-R3B requires this module to read only the document
// tables and the frozen snapshot (through 35_), never a live operational table. 39_ is the system-reader /
// orchestration layer, so the shipment lookup belongs there and this module only consumes the answer.
function dtResolveLeafFolder_(ss, tpl, shipmentId) {
  return dgsResolveShipmentLeafFolder_(ss, tpl, shipmentId);
}

function handleShipmentDocumentGet_(body) {
  var documentId = dtStr_(body && body.document_id);
  if (!documentId) return jsonResponse_({ success: false, error: 'DOCUMENT_ID_REQUIRED' });
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());
  var rows = dtReadTable_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_).filter(function (r) { return dtStr_(r.document_id) === documentId; });
  if (!rows.length) return jsonResponse_({ success: true, found: false, document_id: documentId });
  return jsonResponse_({ success: true, found: true, document: rows[0] });
}
function handleShipmentDocumentList_(body) {
  var shipmentId = dtStr_(body && body.shipment_id);
  if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());
  var rows = dtReadTable_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_).filter(function (r) { return dtStr_(r.related_entity_id) === shipmentId; });
  return jsonResponse_({ success: true, shipment_id: shipmentId, documents: rows });
}
