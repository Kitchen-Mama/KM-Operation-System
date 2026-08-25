// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 38_document_output_folder_resolver.gs — F1-7N-FB-1 Drive output-folder resolution (Shipment + Purchase Order)
// NOTE: All .gs files in this folder share ONE global scope. Copy them into the project TOGETHER.
// ------------------------------------------------------------
// Owns ONE contract: where a generated document is stored. It adds NO table, NO second registry and NO parallel
// Document Engine — 36_ (generated_documents lifecycle) and 37_ (file rendering) remain the authorities; this
// module only resolves the FOLDER those two write into.
//
// F1-7N-FB-1 supersedes DOCUMENT_GENERATION_SYSTEM_SPEC.md §L "Shipment Output Routing v1". The retired path was
//     Shipment/{COUNTRY}/{SHIP_DATE}/{SHIPMENT_NO}_{COUNTRY}/          (four levels, intermediate date directory)
// the active path is
//     Shipment/{DESTINATION_BUCKET}/{external_shipment_id}_{yyyyMMdd(shipped_at)}/     (three levels, no date dir)
// and Purchase Order documents use
//     PurchaseOrder/{yyyyMMdd(document_batch_date)}/
// There is exactly ONE active folder contract; the retired shape is documented in the spec, not implemented here.
//
// ROOT AUTHORITY: document_templates.output_folder_id — the SAME field 36_/37_ already use. No parallel root
// table, and no Drive id is hardcoded in this file (a test asserts it). The live field may legitimately hold a
// full Drive URL, so every read goes through dofNormalizeFolderRef_ before it can reach DriveApp.getFolderById.
//
// Everything above __DOF_PURE_END__ is pure (no DriveApp, no clock, no Sheet) and is unit-tested directly.
// ============================================================

function dofStr_(v) { return String(v == null ? '' : v).trim(); }
function dofUpper_(v) { return dofStr_(v).toUpperCase(); }

// ---- Drive folder reference normalization -------------------------------------------------------------
// Accepts a raw folder ID or a supported Google Drive folder URL and returns the EXACT id, or a typed invalid
// result. An unparsed URL must NEVER reach DriveApp.getFolderById (it throws), which is the live defect this
// closes: document_templates.output_folder_id is named "…_id" but can hold a URL.
var DOF_FOLDER_ID_RE_ = /^[A-Za-z0-9_-]{10,}$/;
var DOF_FOLDER_URL_PATTERNS_ = [
  /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,})/,
  /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?my-drive\/folders\/([A-Za-z0-9_-]{10,})/,
  /^https:\/\/drive\.google\.com\/open\?id=([A-Za-z0-9_-]{10,})/,
  /^https:\/\/drive\.google\.com\/folderview\?id=([A-Za-z0-9_-]{10,})/
];
function dofNormalizeFolderRef_(raw) {
  var v = dofStr_(raw);
  if (!v) return { ok: false, folder_id: '', source: '', reason: 'OUTPUT_FOLDER_REF_BLANK' };
  if (DOF_FOLDER_ID_RE_.test(v)) return { ok: true, folder_id: v, source: 'ID', reason: '' };
  if (/^https?:\/\//i.test(v)) {
    // only the supported Drive folder URL shapes are accepted; a Drive FILE url is not a folder
    for (var i = 0; i < DOF_FOLDER_URL_PATTERNS_.length; i++) {
      var m = DOF_FOLDER_URL_PATTERNS_[i].exec(v);
      if (m) return { ok: true, folder_id: m[1], source: 'URL', reason: '' };
    }
    return { ok: false, folder_id: '', source: 'URL', reason: 'OUTPUT_FOLDER_URL_UNSUPPORTED' };
  }
  return { ok: false, folder_id: '', source: '', reason: 'OUTPUT_FOLDER_REF_INVALID' };
}

// ---- Destination bucket (frozen by the user; NOT inferred, NOT geocoded) -------------------------------
// Any destination outside this table fails closed with UNSUPPORTED_DESTINATION_BUCKET — a new bucket is a
// business decision, never a runtime guess.
var DOF_BUCKET_DIRECT_ = { AU: 'AU', CA: 'CA', JP: 'JP', SG: 'SG', US: 'US', GB: 'UK', UK: 'UK' };
var DOF_EU_MEMBERS_ = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
function dofNormalizeCountryCode_(v) { return dofUpper_(v).replace(/[^A-Z]/g, ''); }
function dofDestinationBucket_(country) {
  var c = dofNormalizeCountryCode_(country);
  if (!c) return { ok: false, bucket: '', reason: 'UNSUPPORTED_DESTINATION_BUCKET', country: '' };
  if (Object.prototype.hasOwnProperty.call(DOF_BUCKET_DIRECT_, c)) return { ok: true, bucket: DOF_BUCKET_DIRECT_[c], reason: '', country: c };
  if (DOF_EU_MEMBERS_.indexOf(c) !== -1) return { ok: true, bucket: 'EU', reason: '', country: c };
  return { ok: false, bucket: '', reason: 'UNSUPPORTED_DESTINATION_BUCKET', country: c };
}

// ---- Folder-name construction -------------------------------------------------------------------------
// Sanitize ONLY what Drive prohibits; the business identifier is otherwise preserved verbatim.
var DOF_DRIVE_FORBIDDEN_RE_ = /[\\\/:*?"<>|]/g;
function dofSanitizeFolderName_(v) {
  var s = dofStr_(v).replace(DOF_DRIVE_FORBIDDEN_RE_, '_').replace(/\s+/g, ' ').trim();
  return s;
}
// yyyyMMdd from a canonical date/datetime STRING. Pure: it parses the already-canonical operation-timezone
// value the DB stores (yyyy-MM-dd[ HH:mm:ss]) and never consults a clock or re-zones. A Date object is
// formatted by the caller through dofFormatYmdInTz_ before it reaches here.
function dofYmdFromCanonical_(v) {
  var s = dofStr_(v);
  var m = /^(\d{4})[-\/](\d{2})[-\/](\d{2})/.exec(s);
  if (!m) return '';
  return m[1] + m[2] + m[3];
}
// Shipment folder: {external_shipment_id}_{yyyyMMdd(shipped_at)}. BOTH inputs are mandatory — there is no
// silent fallback to shipment_id / shipment_no / created_at / today / the retry date.
function dofShipmentFolderName_(externalShipmentId, shippedAt) {
  var ext = dofStr_(externalShipmentId);
  if (!ext) return { ok: false, name: '', reason: 'MISSING_EXTERNAL_SHIPMENT_ID' };
  var ymd = dofYmdFromCanonical_(shippedAt);
  if (!ymd) return { ok: false, name: '', reason: 'MISSING_SHIPPED_AT' };
  var safe = dofSanitizeFolderName_(ext);
  if (!safe) return { ok: false, name: '', reason: 'MISSING_EXTERNAL_SHIPMENT_ID' };
  return { ok: true, name: safe + '_' + ymd, reason: '', external_shipment_id: ext, sanitized_identity: safe, ymd: ymd };
}
// Purchase Order folder: yyyyMMdd of the IMMUTABLE document-batch date frozen at first generation.
function dofPoDateFolderName_(batchDate) {
  var ymd = dofYmdFromCanonical_(batchDate);
  if (!ymd) return { ok: false, name: '', reason: 'MISSING_PO_DOCUMENT_BATCH_DATE' };
  return { ok: true, name: ymd, reason: '', ymd: ymd };
}

// ---- Batch root resolution ----------------------------------------------------------------------------
// Every template in one generation batch must agree on exactly ONE root. Blank, invalid or conflicting roots
// fail closed BEFORE any folder or document is created. Evidence is sanitized (ids only, never credentials).
function dofResolveBatchRoot_(templates, entityType) {
  var list = (templates || []), seen = {}, order = [], invalid = [], blank = 0;
  for (var i = 0; i < list.length; i++) {
    var t = list[i] || {};
    var raw = dofStr_(t.output_folder_id);
    if (!raw) { blank++; continue; }
    var n = dofNormalizeFolderRef_(raw);
    if (!n.ok) { if (invalid.length < 5) invalid.push({ template_id: dofStr_(t.template_id), reason: n.reason }); continue; }
    if (!seen[n.folder_id]) { seen[n.folder_id] = 1; order.push(n.folder_id); }
  }
  if (invalid.length) return { ok: false, root_folder_id: '', reason: 'OUTPUT_FOLDER_ROOT_INVALID', entity_type: dofStr_(entityType), invalid_templates: invalid, distinct_roots: order.length };
  if (!order.length) return { ok: false, root_folder_id: '', reason: 'OUTPUT_FOLDER_ROOT_MISSING', entity_type: dofStr_(entityType), blank_template_count: blank, distinct_roots: 0 };
  if (order.length > 1) return { ok: false, root_folder_id: '', reason: 'OUTPUT_FOLDER_ROOT_CONFLICT', entity_type: dofStr_(entityType), distinct_roots: order.length, root_candidates: order.slice(0, 5) };
  return { ok: true, root_folder_id: order[0], reason: '', entity_type: dofStr_(entityType), distinct_roots: 1, blank_template_count: blank };
}

// ---- Exact-child selection (idempotency rule) ---------------------------------------------------------
// zero exact matches -> CREATE · exactly one -> REUSE · more than one -> typed CONFLICT (fail closed).
// Matching is EXACT on the folder name (never fuzzy, never recursive).
function dofPickExactChild_(children, name) {
  var want = dofStr_(name), hits = [];
  (children || []).forEach(function (c) { if (dofStr_(c && c.name) === want) hits.push(dofStr_(c.id)); });
  if (!hits.length) return { action: 'CREATE', folder_id: '', match_count: 0 };
  if (hits.length === 1) return { action: 'REUSE', folder_id: hits[0], match_count: 1 };
  return { action: 'CONFLICT', folder_id: '', match_count: hits.length, matches: hits.slice(0, 5) };
}

// __DOF_PURE_END__

// ---- io-injected folder resolution --------------------------------------------------------------------
// io = { listChildFolders(parentId) -> [{id,name}], createFolder(parentId, name) -> {id,name} }.
// ensure = find-exact-else-create, re-listing after a create so two concurrent calls converge on the SAME
// folder instead of both keeping their own (last-writer-wins would otherwise duplicate).
function dofEnsureFolder_(io, parentId, name, conflictCode) {
  var pick = dofPickExactChild_(io.listChildFolders(parentId), name);
  if (pick.action === 'CONFLICT') return { ok: false, folder_id: '', reason: conflictCode, match_count: pick.match_count, matches: pick.matches, folder_name: name };
  if (pick.action === 'REUSE') return { ok: true, folder_id: pick.folder_id, created: false, reused: true, folder_name: name };
  var made = io.createFolder(parentId, name);
  // concurrency re-check: if a parallel writer created the same name, converge deterministically (lowest id)
  var after = dofPickExactChild_(io.listChildFolders(parentId), name);
  if (after.action === 'CONFLICT') return { ok: false, folder_id: '', reason: conflictCode, match_count: after.match_count, matches: after.matches, folder_name: name, created_during_race: true };
  return { ok: true, folder_id: dofStr_((made && made.id) || after.folder_id), created: true, reused: false, folder_name: name };
}

// Shipment: root -> {BUCKET} -> {external_shipment_id}_{yyyyMMdd(shipped_at)}
function dofResolveShipmentFolder_(io, opts) {
  opts = opts || {};
  var root = dofResolveBatchRoot_(opts.templates, 'shipment');
  if (!root.ok) return root;
  var bucket = dofDestinationBucket_(opts.destination_country);
  if (!bucket.ok) return { ok: false, folder_id: '', reason: bucket.reason, destination_country: bucket.country, root_folder_id: root.root_folder_id };
  var leaf = dofShipmentFolderName_(opts.external_shipment_id, opts.shipped_at);
  if (!leaf.ok) return { ok: false, folder_id: '', reason: leaf.reason, root_folder_id: root.root_folder_id, destination_bucket: bucket.bucket };
  var bucketFolder = dofEnsureFolder_(io, root.root_folder_id, bucket.bucket, 'SHIPMENT_BUCKET_FOLDER_CONFLICT');
  if (!bucketFolder.ok) return { ok: false, folder_id: '', reason: bucketFolder.reason, match_count: bucketFolder.match_count, root_folder_id: root.root_folder_id, destination_bucket: bucket.bucket };
  var shipFolder = dofEnsureFolder_(io, bucketFolder.folder_id, leaf.name, 'SHIPMENT_FOLDER_CONFLICT');
  if (!shipFolder.ok) return { ok: false, folder_id: '', reason: shipFolder.reason, match_count: shipFolder.match_count, folder_name: leaf.name, root_folder_id: root.root_folder_id, destination_bucket: bucket.bucket };
  return { ok: true, folder_id: shipFolder.folder_id, folder_name: leaf.name, created: shipFolder.created, reused: shipFolder.reused,
    root_folder_id: root.root_folder_id, destination_bucket: bucket.bucket, bucket_folder_id: bucketFolder.folder_id, ymd: leaf.ymd };
}

// Purchase Order: root -> {yyyyMMdd(document_batch_date)}
function dofResolvePoDateFolder_(io, opts) {
  opts = opts || {};
  var root = dofResolveBatchRoot_(opts.templates, 'purchase_order');
  if (!root.ok) return root;
  var leaf = dofPoDateFolderName_(opts.document_batch_date);
  if (!leaf.ok) return { ok: false, folder_id: '', reason: leaf.reason, root_folder_id: root.root_folder_id };
  var dateFolder = dofEnsureFolder_(io, root.root_folder_id, leaf.name, 'PO_DATE_FOLDER_CONFLICT');
  if (!dateFolder.ok) return { ok: false, folder_id: '', reason: dateFolder.reason, match_count: dateFolder.match_count, folder_name: leaf.name, root_folder_id: root.root_folder_id };
  return { ok: true, folder_id: dateFolder.folder_id, folder_name: leaf.name, created: dateFolder.created, reused: dateFolder.reused, root_folder_id: root.root_folder_id, ymd: leaf.ymd };
}

// The Drive io for this resolver lives in 37_shipment_document_file_renderer.gs (dofFolderIo_), which is the
// ONE sanctioned owner of raw Drive primitives in this codebase (F1-5C-EXPORT-R1 §K seam audit). Keeping the
// boundary there means this module stays 100% PURE and fully unit-testable offline, and there is still
// exactly one place where DriveApp is touched. Callers pass that io in.
