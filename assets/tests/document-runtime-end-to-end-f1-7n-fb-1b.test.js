// F1-7N-FB-1B — Document runtime end-to-end: system-computed payload / Drive output only.
// Run: node assets/tests/document-runtime-end-to-end-f1-7n-fb-1b.test.js
//
// Every behavioural test EXECUTES THE REAL SHIPPED PURE FUNCTIONS, extracted from the Apps Script sources and
// evaluated here — never a re-implementation. The io-injected paths run against an in-memory Drive double, so
// NO DriveApp call, NO live folder, NO live document, NO DB write and NO email is ever produced by this suite.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
var G39 = read('specs/active/apps-script/39_document_runtime_service.gs');
var G38 = read('specs/active/apps-script/38_document_output_folder_resolver.gs');
var G37 = read('specs/active/apps-script/37_shipment_document_file_renderer.gs');
var G36 = read('specs/active/apps-script/36_document_template_handlers.gs');
var G35 = read('specs/active/apps-script/35_shipment_document_renderer.gs');
var G34 = read('specs/active/apps-script/34_shipment_final_output_handlers.gs');
var G22 = read('specs/active/apps-script/22_shipment_dispatch_handlers.gs');
var G13 = read('specs/active/apps-script/13_procurement_handlers.gs');
var G57 = read('specs/active/apps-script/57_api_v1_shipment_workspace.gs');
var G50 = read('specs/active/apps-script/50_api_v1_purchase_order_workspace.gs');
var RTR = read('specs/active/apps-script/01_router.gs');
var SH = read('js/pages/shipping-history.js');
var POJS = read('js/pages/purchase-order-overview.js');
var API = read('js/api/operation-system-db-api.js');
var SPEC = read('../docs/planning/DOCUMENT_GENERATION_SYSTEM_SPEC.md');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
// Brace matching that understands strings, template literals, regex literals and comments — a naive counter
// mis-reads real shipped code like '{{' + token + '}}' or /\{\{[A-Z0-9_]+\}\}/g and silently truncates it.
var RE_PRECEDERS_ = '(,=:[!&|?{};+-*%<>~^' ;
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing fn ' + name);
  var i = src.indexOf('{', start), depth = 0, prev = '';
  for (; i < src.length; i++) {
    var c = src[i], n2 = src.substr(i, 2);
    if (n2 === '//') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (n2 === '/*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      var q = c; i++;
      for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; }
      prev = q; continue;
    }
    if (c === '/' && RE_PRECEDERS_.indexOf(prev) !== -1) {
      i++;
      for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === '[') { for (i++; i < src.length && src[i] !== ']'; i++) { if (src[i] === '\\') i++; } continue; } if (src[i] === '/') break; }
      prev = '/'; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return src.slice(start, i + 1); }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error('unbalanced ' + name);
}
function extractVar(src, name) {
  // Stop at the first ';' that ENDS its line (an optional trailing // comment may follow). A bare ';\n' match
  // silently swallows the FOLLOWING declarations whenever the line ends in a comment, which both duplicates
  // code into the eval payload and can truncate a later chunk mid-function.
  var m = src.match(new RegExp('var ' + name + ' = [\\s\\S]*?;[^\\n]*\\n'));
  if (!m) throw new Error('missing var ' + name);
  return m[0];
}
// strip comment lines before scanning for a forbidden token, so a PROHIBITION comment never counts as a hit
function code(src) {
  return src.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
}

// ---- load the REAL pure cores -------------------------------------------------------------------------
var LOAD = [];
['DOF_FOLDER_ID_RE_', 'DOF_BUCKET_DIRECT_', 'DOF_EU_MEMBERS_', 'DOF_DRIVE_FORBIDDEN_RE_'].forEach(function (v) { LOAD.push(extractVar(G38, v)); });
LOAD.push(G38.match(/var DOF_FOLDER_URL_PATTERNS_ = \[[\s\S]*?\n\];/)[0]);
['dofStr_', 'dofUpper_', 'dofNormalizeFolderRef_', 'dofNormalizeCountryCode_', 'dofDestinationBucket_', 'dofSanitizeFolderName_',
  'dofYmdFromCanonical_', 'dofShipmentFolderName_', 'dofPoDateFolderName_', 'dofResolveBatchRoot_', 'dofPickExactChild_',
  'dofEnsureFolder_', 'dofResolveShipmentFolder_', 'dofResolvePoDateFolder_'].forEach(function (f) { LOAD.push(extractFn(G38, f)); });

['DGS_ROW_GENERATED_', 'DGS_ROW_REGENERATED_', 'DGS_ROW_FAILED_', 'DGS_ROW_CANCELLED_', 'DGS_NOTE_REASON_',
  'DGS_NOTE_RETRY_', 'DGS_SCOPE_DIMS_', 'DGS_DRIVE_FORBIDDEN_RE_'].forEach(function (v) { LOAD.push(extractVar(G39, v)); });
LOAD.push(G39.match(/var DGS_PRE_DISPATCH_REASONS_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(G39.match(/var DGS_SHIPMENT_CLASSES_ = \[[\s\S]*?\n\];/)[0]);
LOAD.push(G39.match(/var DGS_DOC_LABEL_ = \{[\s\S]*?\n\};/)[0]);
['dgsStr_', 'dgsLc_', 'dgsUc_', 'dgsNum_', 'dgsBool_', 'dgsCell_', 'dgsEncodeNote_', 'dgsDecodeNote_', 'dgsRowState_',
  'dgsBatchState_', 'dgsFailureClass_', 'dgsRetryable_', 'dgsScopeMatch_', 'dgsScopeExact_', 'dgsInWindow_', 'dgsActive_',
  'dgsClassCandidates_', 'dgsShipmentManifest_', 'dgsSelectPoTemplate_', 'dgsCanonicalJson_', 'dgsChecksum_',
  'dgsSplitMapped_', 'dgsFillText_', 'dgsFilename_', 'dgsBuildRenderPayload_', 'dgsShipMonth_', 'dgsPoPayloadModel_',
  'dgsDriveReadiness_', 'dgsIdentityKey_', 'dgsPoBatchDate_', 'dgsPlanBatch_', 'dgsRegistryRow_', 'dgsDocumentDto_',
  'dgsDocumentLabel_', 'dgsFolderUrl_'].forEach(function (f) { LOAD.push(extractFn(G39, f)); });

['docStr_', 'docLc_', 'docUc_', 'docNum_', 'docAddr_', 'docRequire_', 'docLinePos_', 'docDistinctPoNos_',
  'docFamilyStatus_', 'docTotals_', 'docHeaderBlock_', 'docRenderShippingDetail_', 'docRenderPackingList_',
  'docRenderCommercialInvoice_', 'docCiUnresolvedFields_', 'docRenderByClass_'].forEach(function (f) { LOAD.push(extractFn(G35, f)); });
LOAD.push(G35.match(/var DOC_CI_UNRESOLVED_AUTHORITY_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(extractVar(G35, 'DOC_SUPPORTED_'));

['dtStr_', 'dtLc_', 'dtUc_', 'dtNum_', 'dtBool_', 'dtResolvePath_', 'dtApplyTransform_', 'dtApplyFormat_',
  'dtResolveField_', 'dtMapPlaceholders_'].forEach(function (f) { LOAD.push(extractFn(G36, f)); });
LOAD.push(G36.match(/var GENERATED_DOCUMENTS_HEADERS_ = \[[\s\S]*?\n\];/)[0]);

LOAD.push(extractVar(G37, 'DFO_SUPPORTED_TYPES_'));
['dfoStr_', 'dfoLc_', 'dfoCell_', 'dfoWrap_', 'dfoSupportedType_', 'dfoValidateAsset_', 'dfoSplitValues_',
  'dfoScalarCtx_', 'dfoFillText_', 'dfoSanitize_', 'dfoFillCell_', 'dfoRowChildKeys_', 'dfoCollectionChildTokens_',
  'dfoFillSheetMatrix_', 'dfoFilename_', 'dfoRenderPayload_'].forEach(function (f) { LOAD.push(extractFn(G37, f)); });

LOAD.push(extractVar(G34, 'SFO_DISPATCHED_STATUS_'));
LOAD.push(extractVar(G34, 'SFO_NOT_DISPATCHED_STATUS_'));

// workspace document projections (pure)
['shipWsStr_', 'shipWsLc_', 'shipWsDocumentsFor_', 'shipWsGroupDocuments_'].forEach(function (f) { LOAD.push(extractFn(G57, f)); });
['poWsStr_', 'poWsLc_', 'poWsDocumentsFor_', 'poWsGroupDocuments_'].forEach(function (f) { LOAD.push(extractFn(G50, f)); });

// the shared Document Panel (pure presentation)
LOAD.push('function _shEsc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\'/g,"&#39;");}');
LOAD.push(extractVar(SH, 'SH_DOC_PANEL_VISIBLE_ROWS_'));
LOAD.push(SH.match(/var SH_DOC_STATE_LABEL_ = \{[\s\S]*?\n\};/)[0]);
LOAD.push(extractVar(SH, 'SH_DOC_ALERT_STATE_'));
LOAD.push(SH.match(/var SH_DOC_REASON_HELP_ = \{[\s\S]*?\n\};/)[0]);
['shDocPanelState', '_shDocIcon', '_shDocLink', '_shDocRowHtml', '_shDocHelp', '_shDocErrorHtml', 'shDocumentPanelHtml']
  .forEach(function (f) { LOAD.push(extractFn(SH, f)); });

eval(LOAD.join('\n'));

// ---- in-memory Drive double (NO DriveApp, NO network, NO live folder/file) ------------------------------
function FakeDrive(seed) {
  this.byId = {}; this.children = {}; this.files = {}; this.created = 0; this.copies = 0; this.pdfs = 0;
  this.probeCalls = 0; this.mutations = 0; this.n = 0;
  var self = this;
  (seed || []).forEach(function (f) {
    self.byId[f.id] = f;
    if (f.kind === 'file') self.files[f.id] = f;
    else (self.children[f.parent] = self.children[f.parent] || []).push({ id: f.id, name: f.name });
  });
}
FakeDrive.prototype.folderIo = function () {
  var self = this;
  return {
    listChildFolders: function (parentId) { return (self.children[parentId] || []).slice(); },
    createFolder: function (parentId, name) {
      self.created++; self.mutations++;
      var id = 'F' + (++self.n) + '-' + name.replace(/[^A-Za-z0-9]/g, '');
      self.byId[id] = { id: id, name: name, parent: parentId };
      (self.children[parentId] = self.children[parentId] || []).push({ id: id, name: name });
      return { id: id, name: name };
    }
  };
};
FakeDrive.prototype.probeIo = function () {
  var self = this;
  return {
    probeFolder: function (id) { self.probeCalls++; var f = self.byId[id]; return (f && f.kind !== 'file') ? { ok: true, id: id, name: f.name } : { ok: false, reason: 'FOLDER_INACCESSIBLE' }; },
    probeFile: function (id) { self.probeCalls++; var f = self.files[id]; return f ? { ok: true, id: id, name: f.name, mime: f.mime || 'sheet' } : { ok: false, reason: 'FILE_INACCESSIBLE' }; }
  };
};
FakeDrive.prototype.renderIo = function (opts) {
  var self = this; opts = opts || {};
  return {
    copyTemplate: function (templateFileId, filename, folderId) {
      if (opts.failCopy) throw new Error('copy exploded');
      self.copies++; self.mutations++;
      var id = 'FILE' + (++self.n);
      self.files[id] = { id: id, name: filename, parent: folderId };
      return { file_id: id, file_url: 'https://docs.google.com/x/' + id };
    },
    readSheetMatrix: function () { return [['{{PO_NO}}', '{{TOTAL_QTY}}'], ['{{LINE_ITEMS}}', '{{SKU}}']]; },
    writeSheetMatrix: function () { self.mutations++; },
    exportPdf: function (fileId, filename, folderId) {
      if (opts.failPdf) throw new Error('pdf export timed out');
      self.pdfs++; self.mutations++;
      var id = 'PDF' + (++self.n);
      self.files[id] = { id: id, name: filename + '.pdf', parent: folderId };
      return { pdf_file_id: id, pdf_file_url: 'https://drive.google.com/file/d/' + id };
    }
  };
};

var SHIP_ROOT = 'ROOTSHIPMENT1234567890';
var PO_ROOT = 'ROOTPURCHASEORDER12345';
var TPL_FILE = 'TEMPLATEFILEID1234567';

// =======================================================================================================
section('B1. the architectural boundary — the system computes, Drive only outputs');

var C37 = code(G37);
ok(!/\b(shipments|purchase_orders|purchase_order_lines|shipment_lines|shipment_line_allocations|warehouses|sku_details|tax_referral_rates)\b/.test(C37),
  '1. the Drive renderer (37_) reads NO business table');
ok(!/getSheetByName|openById\(prodExpectedDbId_|sfoReadTable_|dtReadTable_/.test(C37),
  '1. and opens no Sheet / no DB at all');
ok(!/dgsSelectPoTemplate_|dgsShipmentManifest_|dofDestinationBucket_|dtResolveTemplate_/.test(C37),
  '1. it never selects a template or chooses an applicable document class');
ok(!/DGS_SHIPMENT_CLASSES_|document_usage/.test(C37), '1. and knows nothing about applicability');
ok(!/\.setValue\(|order_status|shipments\.status|'shipped'|'issued'/.test(C37), '1. it never mutates a business status');
// the reverse direction: the system side owns no raw Drive primitive
var C39 = code(G39);
ok(!/DriveApp|DocumentApp|\.getAs\(|makeCopy\(|createFile\(/.test(C39), '1. and the system service (39_) touches NO raw Drive primitive');
ok(/dofFolderIo_|dofProbeIo_|dfoDefaultIo_/.test(C39), '1. it reaches Drive only through the ONE sanctioned 37_ boundary');
ok(/dfoRenderPayload_/.test(G37) && /payload\.scalars/.test(G37), '1. 37_ renders from a fully resolved payload');

// the payload really is finished strings by then
var built = dgsBuildRenderPayload_({
  template: { template_id: 'T1', template_key: 'PO_STD', template_version: 2, template_file_id: TPL_FILE, template_file_type: 'google_sheet', document_type: 'purchase_order', document_usage: 'factory', file_name_rule: 'KM_{{PO_NO}}_{{TOTAL_QTY}}' },
  values: { PO_NO: 'PO-1001', TOTAL_QTY: 360, TOTAL_CARTONS: 19, COUNTRY: 'US', WAREHOUSE_CODE: 'ABE2', LINE_ITEMS: [{ SKU: 'A1', QTY: 120 }] },
  related_entity_type: 'purchase_order', related_entity_id: 'PO-X', class_key: 'PURCHASE_ORDER', folder_id: 'LEAF1'
});
ok(built.ok, '1. payload builds');
eq(built.payload.scalars.TOTAL_QTY, '360', '1. TOTAL_QTY reaches the renderer as the finished string "360"');
eq(built.payload.scalars.TOTAL_CARTONS, '19', '1. TOTAL_CARTONS as "19"');
eq(built.payload.scalars.COUNTRY, 'US', '1. COUNTRY as "US"');
eq(built.payload.scalars.WAREHOUSE_CODE, 'ABE2', '1. WAREHOUSE_CODE as "ABE2"');
eq(built.payload.collections.LINE_ITEMS[0].QTY, '120', '1. collection cells are finished strings too');
eq(built.payload.file_name, 'KM_PO-1001_360', '1. the filename is constructed by the SYSTEM, not by Drive');
ok(/^CS[0-9A-F]{8}$/.test(built.payload.source_checksum), '1. and the payload carries a deterministic source checksum');
eq(dgsChecksum_({ b: 1, a: 2 }), dgsChecksum_({ a: 2, b: 1 }), '1. the checksum is key-order independent (canonical JSON)');
ok(dgsChecksum_({ a: 1 }) !== dgsChecksum_({ a: 2 }), '1. and changes when a fact changes (drift is detectable)');

// =======================================================================================================
section('B2. Drive readiness is a NON-MUTATING pre-check');

var drive = new FakeDrive([
  { id: SHIP_ROOT, name: 'Shipment' }, { id: PO_ROOT, name: 'Purchase Order' },
  { id: TPL_FILE, name: 'PO Template', kind: 'file' }
]);
function tpl(over) {
  return Object.assign({ template_id: 'T1', template_key: 'K1', template_version: 1, output_folder_id: SHIP_ROOT,
    template_file_id: TPL_FILE, template_file_type: 'google_sheet', status: 'active', is_active: 'TRUE',
    related_entity_type: 'shipment', document_type: 'shipment_detail', document_usage: 'internal' }, over || {});
}
var rd = dgsDriveReadiness_(drive.probeIo(), [{ class_key: 'SHIPMENT_DETAIL', template: tpl() }], 'shipment');
ok(rd.ok && rd.status === 'READY', '2. a fully configured batch is READY');
eq(drive.mutations, 0, '2. readiness created NOTHING — no probe folder, no test file, zero mutations');
eq(drive.created, 0, '2. and zero folders');
ok(drive.probeCalls > 0, '2. it really did open the identities (it is not a no-op)');
ok(/does not guarantee/.test(rd.note), '2. and it does not claim a later write is guaranteed');

var rdBad = dgsDriveReadiness_(drive.probeIo(), [{ class_key: 'X', template: tpl({ template_file_id: 'MISSINGFILE12345678' }) }], 'shipment');
eq(rdBad.reason, 'DOCUMENT_TEMPLATE_ASSET_INACCESSIBLE', '2. an unreachable template file BLOCKS');
var rdRoot = dgsDriveReadiness_(drive.probeIo(), [{ class_key: 'X', template: tpl({ output_folder_id: 'NOSUCHROOT1234567890' }) }], 'shipment');
eq(rdRoot.reason, 'OUTPUT_FOLDER_ROOT_INACCESSIBLE', '2. an unreachable root BLOCKS');
var rdType = dgsDriveReadiness_(drive.probeIo(), [{ class_key: 'X', template: tpl({ template_file_type: 'docx' }) }], 'shipment');
eq(rdType.reason, 'DOCUMENT_TEMPLATE_TYPE_UNSUPPORTED', '2. an unfillable template type BLOCKS');
eq(drive.mutations, 0, '2. every BLOCKED path also created nothing');

// =======================================================================================================
section('B3. Drive root normalization + conflict');

var byId = dofNormalizeFolderRef_(SHIP_ROOT);
var byUrl = dofNormalizeFolderRef_('https://drive.google.com/drive/folders/' + SHIP_ROOT);
var byUrlU = dofNormalizeFolderRef_('https://drive.google.com/drive/u/2/folders/' + SHIP_ROOT + '?usp=sharing');
eq([byId.folder_id, byUrl.folder_id, byUrlU.folder_id], [SHIP_ROOT, SHIP_ROOT, SHIP_ROOT], '3. a raw ID and every supported URL form normalize to the SAME exact id');
eq(dofResolveBatchRoot_([tpl(), tpl({ output_folder_id: 'https://drive.google.com/drive/folders/' + SHIP_ROOT })], 'shipment').ok, true,
  '3. two different URL/ID strings resolving to one id are NOT a conflict');
eq(dofResolveBatchRoot_([tpl(), tpl({ output_folder_id: PO_ROOT })], 'shipment').reason, 'OUTPUT_FOLDER_ROOT_CONFLICT',
  '3. genuinely different roots in one batch BLOCK');
eq(dofResolveBatchRoot_([tpl({ output_folder_id: '' })], 'shipment').reason, 'OUTPUT_FOLDER_ROOT_MISSING', '3. a blank root BLOCKS');
eq(dofResolveBatchRoot_([tpl({ output_folder_id: 'not a folder' })], 'shipment').reason, 'OUTPUT_FOLDER_ROOT_INVALID', '3. an unparseable root BLOCKS');
ok(!/1WY-PvU5dh8trCxjpVp6BQzZLgLl0_mn_|1K0Gp55ipuYB0TqnoDRoSh7JoTl3FPOM9/.test(G39 + G38 + G37 + G36 + G35 + G22 + G13 + G57 + G50 + RTR + SH + POJS + API),
  '3. NEITHER live Drive root id is hardcoded anywhere in application source');

// =======================================================================================================
section('B4. §H applicability — exact, deterministic, never broadened');

function shipTpl(over) {
  return Object.assign({ template_id: 'T', template_key: 'K', template_version: 1, output_folder_id: SHIP_ROOT,
    template_file_id: TPL_FILE, template_file_type: 'google_sheet', status: 'active', is_active: 'TRUE',
    related_entity_type: 'shipment', series: '', sku: '', supplier_id: '', factory_id: '', carrier_id: '',
    country: '', marketplace: '', language: '' }, over || {});
}
var TEMPLATES = [
  shipTpl({ template_id: 'T-SD', template_key: 'SHIPDETAIL_STANDARD', document_type: 'shipment_detail', document_usage: 'internal' }),
  shipTpl({ template_id: 'T-CIE', template_key: 'COMMERCIAL_INVOICE_EXPORT', document_type: 'commercial_invoice', document_usage: 'export' }),
  shipTpl({ template_id: 'T-PLE', template_key: 'PACKING_LIST_EXPORT', document_type: 'packing_list', document_usage: 'export' }),
  shipTpl({ template_id: 'T-CIU', template_key: 'COMMERCIAL_INVOICE_IMPORT_US', document_type: 'commercial_invoice', document_usage: 'import', country: 'US' }),
  shipTpl({ template_id: 'T-PLU', template_key: 'PACKING_LIST_IMPORT_US', document_type: 'packing_list', document_usage: 'import', country: 'US' }),
  shipTpl({ template_id: 'T-CIJ', template_key: 'COMMERCIAL_INVOICE_IMPORT_JP', document_type: 'commercial_invoice', document_usage: 'import', country: 'JP' }),
  shipTpl({ template_id: 'T-BTS', template_key: 'BOOKING_TOP_SEALAND', document_type: 'carrier_booking_form', document_usage: 'carrier', carrier_id: 'CAR_TOP_SEALAND' }),
  shipTpl({ template_id: 'T-BAGL', template_key: 'BOOKING_AGL', document_type: 'carrier_booking_form', document_usage: 'carrier', carrier_id: 'CAR_AGL' }),
  shipTpl({ template_id: 'T-SINO', template_key: 'COMMERCIAL_INVOICE_SINOTRANS', document_type: 'commercial_invoice', document_usage: 'carrier', carrier_id: 'CAR_SINOTRANS' })
];
var usCtx = { country: 'US', marketplace: '', carrier_id: 'CAR_TOP_SEALAND', series: '', sku: '', supplier_id: '', factory_id: '', language: '', as_of: '2026-08-25' };
var man = dgsShipmentManifest_(TEMPLATES, usCtx);
ok(man.ok, '4. the controlled US / TOP SEALAND shipment resolves cleanly');
eq(man.entries.map(function (e) { return e.template_key; }).sort(),
  ['BOOKING_TOP_SEALAND', 'COMMERCIAL_INVOICE_EXPORT', 'COMMERCIAL_INVOICE_IMPORT_US', 'PACKING_LIST_EXPORT', 'PACKING_LIST_IMPORT_US', 'SHIPDETAIL_STANDARD'],
  '4. exactly the six applicable classes — SHIPDETAIL + export CI/PL + US import CI/PL + the TOP SEALAND booking');
eq(man.required_count, 3, '4. three are ALWAYS-required (SHIPDETAIL + export CI + export PL)');
var keys = man.entries.map(function (e) { return e.template_key; });
ok(keys.indexOf('BOOKING_AGL') === -1, '4. NO AGL form for a TOP SEALAND shipment');
ok(keys.indexOf('COMMERCIAL_INVOICE_SINOTRANS') === -1, '4. NO SINOTRANS form for another carrier');
ok(keys.indexOf('COMMERCIAL_INVOICE_IMPORT_JP') === -1, '4. NO JP import form on a US shipment');
ok(man.entries.length < TEMPLATES.length, '4. and it never generates every active shipment template indiscriminately');

var jpCtx = Object.assign({}, usCtx, { country: 'JP', carrier_id: 'CAR_AGL' });
var jpMan = dgsShipmentManifest_(TEMPLATES, jpCtx);
var jpKeys = jpMan.entries.map(function (e) { return e.template_key; });
ok(jpKeys.indexOf('COMMERCIAL_INVOICE_IMPORT_US') === -1 && jpKeys.indexOf('PACKING_LIST_IMPORT_US') === -1,
  '4. US destination forms never appear on a non-US shipment');
ok(jpKeys.indexOf('COMMERCIAL_INVOICE_IMPORT_JP') !== -1, '4. the JP shipment gets the JP import form instead');
ok(jpKeys.indexOf('BOOKING_AGL') !== -1 && jpKeys.indexOf('BOOKING_TOP_SEALAND') === -1, '4. and only its OWN carrier booking');

// an UNSCOPED import template must NOT be able to trigger a destination form anywhere
var loose = TEMPLATES.concat([shipTpl({ template_id: 'T-LOOSE', template_key: 'PACKING_LIST_IMPORT_ANY', document_type: 'packing_list', document_usage: 'import', country: '' })]);
var looseMan = dgsShipmentManifest_(loose, Object.assign({}, usCtx, { country: 'AU' }));
eq(looseMan.entries.filter(function (e) { return e.document_usage === 'import'; }).length, 0,
  '4. an UNSCOPED import template never fires — destination classes require an EXACT country match');

// 0 / >1 behaviour
var noSd = TEMPLATES.filter(function (t) { return t.template_id !== 'T-SD'; });
eq(dgsShipmentManifest_(noSd, usCtx).errors[0].reason, 'SHIPMENT_DOCUMENT_TEMPLATE_UNRESOLVED', '4. a missing ALWAYS class BLOCKS');
var dupe = TEMPLATES.concat([shipTpl({ template_id: 'T-SD2', template_key: 'SHIPDETAIL_ALT', document_type: 'shipment_detail', document_usage: 'internal' })]);
eq(dgsShipmentManifest_(dupe, usCtx).errors[0].reason, 'SHIPMENT_DOCUMENT_TEMPLATE_AMBIGUOUS', '4. two equally specific matches BLOCK — never "first in sheet order"');
var noBooking = TEMPLATES.filter(function (t) { return t.document_type !== 'carrier_booking_form'; });
ok(dgsShipmentManifest_(noBooking, usCtx).ok, '4. a missing CONDITIONAL class is NOT an error — it simply does not apply');
var inactive = TEMPLATES.map(function (t) { return t.template_id === 'T-SD' ? Object.assign({}, t, { is_active: 'FALSE' }) : t; });
eq(dgsShipmentManifest_(inactive, usCtx).errors[0].reason, 'SHIPMENT_DOCUMENT_TEMPLATE_UNRESOLVED', '4. an inactive template does not count');
var expired = TEMPLATES.map(function (t) { return t.template_id === 'T-SD' ? Object.assign({}, t, { effective_to: '2026-01-01' }) : t; });
eq(dgsShipmentManifest_(expired, usCtx).errors[0].reason, 'SHIPMENT_DOCUMENT_TEMPLATE_UNRESOLVED', '4. nor does an out-of-window one');

// =======================================================================================================
section('B5. §G Purchase Order template selection — exact factory + series');

function poTpl(over) {
  return Object.assign({ template_id: 'P', template_key: 'PO', template_version: 1, output_folder_id: PO_ROOT,
    template_file_id: TPL_FILE, template_file_type: 'google_sheet', status: 'active', is_active: 'TRUE',
    related_entity_type: 'purchase_order', document_type: 'purchase_order',
    series: '', sku: '', supplier_id: '', factory_id: '', carrier_id: '', country: '', marketplace: '', language: '' }, over || {});
}
var poCtx = { factory_id: 'CN_YOUXIN', series: 'SEALER', supplier_id: '', sku: '', carrier_id: '', country: '', marketplace: '', language: '', as_of: '2026-08-25' };
var exact = poTpl({ template_id: 'P-EXACT', template_key: 'PO_YOUXIN_SEALER', factory_id: 'CN_YOUXIN', series: 'SEALER' });
var other = poTpl({ template_id: 'P-OTHER', template_key: 'PO_SHENGYI_SEALER', factory_id: 'TW_SHENGYI', series: 'SEALER' });
eq(dgsSelectPoTemplate_([exact, other], poCtx).template_key, 'PO_YOUXIN_SEALER', '5. the exact factory + series template is selected');
eq(dgsSelectPoTemplate_([other], poCtx).reason, 'PO_DOCUMENT_TEMPLATE_UNRESOLVED',
  '5. a populated-but-different factory EXCLUDES the row — it never falls through to an unrelated factory');
eq(dgsSelectPoTemplate_([poTpl({ factory_id: 'CN_YOUXIN', series: 'SEAL' })], poCtx).reason, 'PO_DOCUMENT_TEMPLATE_UNRESOLVED',
  '5. series matching is EXACT — "SEAL" does not match "SEALER" by prefix');
eq(dgsSelectPoTemplate_([exact, poTpl({ template_id: 'P-DUP', template_key: 'PO_DUP', factory_id: 'CN_YOUXIN', series: 'SEALER' })], poCtx).reason,
  'PO_DOCUMENT_TEMPLATE_AMBIGUOUS', '5. two equally specific PO templates BLOCK');
eq(dgsSelectPoTemplate_([], poCtx).reason, 'PO_DOCUMENT_TEMPLATE_UNRESOLVED', '5. zero matches BLOCK');
eq(dgsSelectPoTemplate_([Object.assign({}, exact, { is_active: 'FALSE' })], poCtx).reason, 'PO_DOCUMENT_TEMPLATE_UNRESOLVED', '5. inactive templates are excluded');
eq(dgsSelectPoTemplate_([Object.assign({}, exact, { related_entity_type: 'shipment' })], poCtx).reason, 'PO_DOCUMENT_TEMPLATE_UNRESOLVED',
  '5. a shipment-scoped template can never be selected for a PO');

// =======================================================================================================
section('B6. §G PO payload — the system computes every value');

var PO = { purchase_order_id: 'PO-1', po_no: 'KM26-0801', km_po_no: 'KM-0801', series: 'SEALER', currency: 'USD',
  supplier_id: 'SUP1', supplier_name: 'You Xin', factory_id: 'CN_YOUXIN', expected_ship_date: '2026-10-14',
  supplier_expected_ready_date: '2026-09-30', order_date: '', deposit_due_date: '' };
var POL = [
  { purchase_order_line_id: 'L1', sku: 'KM-A', ordered_qty: '240', carton_qty: '12', units_per_carton: '20', unit_price: '3.5' },
  { purchase_order_line_id: 'L2', sku: 'KM-B', ordered_qty: '120', carton_qty: '7', units_per_carton: '18', unit_price: '4' },
  { purchase_order_line_id: 'L3', sku: 'KM-A', ordered_qty: '0', carton_qty: '0', units_per_carton: '20', unit_price: '3.5' }
];
var poModel = dgsPoPayloadModel_(PO, POL, { factory_name: 'CN侑鑫', order_date_candidate: '2026-08-25',
  deposit_due_date_candidate: '2026-09-01', sku_labels: { 'KM-A': { product_name_en: 'Sealer A', factory_item_name: '封口機A', factory_item_unit: 'PCS' } } });
eq(poModel.header.total_qty, 360, '6. TOTAL_QTY is summed by the system (240+120+0)');
eq(poModel.header.total_cartons, 19, '6. TOTAL_CARTONS is summed by the system (12+7+0)');
eq(poModel.header.total_amount, 1320, '6. the line amounts are computed by the system (240*3.5 + 120*4)');
eq(poModel.header.total_sku, 2, '6. total_sku is COUNT(DISTINCT sku), not a line count');
eq(poModel.header.ship_month, '2026-10', '6. SHIP_MONTH is derived from expected_ship_date');
eq(poModel.header.ship_date_full, '2026-10-14', '6. SHIP_DATE_FULL is the full date');
eq(poModel.header.doc_date, '2026-08-25', '6. DOC_DATE uses the frozen Send PO candidate while order_date is still blank');
eq(poModel.header.deposit_due_date, '2026-09-01', '6. DEPOSIT_DUE_DATE uses the same frozen candidate');
eq(poModel.header.factory_name, 'CN侑鑫', '6. the factory name comes from the authorized master join');
eq(poModel.lines[0].factory_item_name, '封口機A', '6. the factory item name resolves through the label join');
eq(poModel.lines[0].factory_item_unit, 'PCS', '6. and the factory item unit');
eq(poModel.lines[0].line_amount, 840, '6. per-line amount is computed here, never by Drive');
eq(poModel.lines[1].expected_ready_date, '2026-09-30', '6. expected dates fall back to the PO header value');
// a PO line that carries its OWN factory label must win over the master join
var ownLabel = dgsPoPayloadModel_(PO, [{ sku: 'KM-A', ordered_qty: '1', factory_item_name: 'LINE OWNS THIS' }],
  { sku_labels: { 'KM-A': { factory_item_name: 'master' } } });
eq(ownLabel.lines[0].factory_item_name, 'LINE OWNS THIS', '6. the PO line OWNS its committed value; the join is a label fallback only');

// =======================================================================================================
section('B7. §N folder routing — buckets, identity, and retry-date stability');

eq(['US', 'CA', 'AU', 'JP', 'SG'].map(function (c) { return dofDestinationBucket_(c).bucket; }), ['US', 'CA', 'AU', 'JP', 'SG'], '7. direct buckets');
eq([dofDestinationBucket_('GB').bucket, dofDestinationBucket_('UK').bucket], ['UK', 'UK'], '7. GB and UK both map to UK');
eq(['DE', 'FR', 'IT', 'NL', 'SE', 'PL', 'IE'].map(function (c) { return dofDestinationBucket_(c).bucket; }), ['EU', 'EU', 'EU', 'EU', 'EU', 'EU', 'EU'], '7. EU members map to EU');
eq(dofDestinationBucket_('CH').reason, 'UNSUPPORTED_DESTINATION_BUCKET', '7. a non-member fails closed (Switzerland is not in the EU list)');
eq(dofDestinationBucket_('').reason, 'UNSUPPORTED_DESTINATION_BUCKET', '7. and so does a blank destination');

var d2 = new FakeDrive([{ id: SHIP_ROOT, name: 'Shipment' }]);
var shipTemplates = [tpl(), tpl({ template_id: 'T2' })];
var f1 = dofResolveShipmentFolder_(d2.folderIo(), { templates: shipTemplates, destination_country: 'US', external_shipment_id: 'KM-SHOPIFY-260825-01', shipped_at: '2026-08-25 09:12:00' });
ok(f1.ok, '7. the shipment leaf folder resolves');
eq(f1.folder_name, 'KM-SHOPIFY-260825-01_20260825', '7. named {external_shipment_id}_{yyyyMMdd(shipped_at)}');
eq(f1.destination_bucket, 'US', '7. under the US bucket');
eq(d2.created, 2, '7. exactly two folders created the first time (bucket + leaf)');
// a RETRY on a later day must reuse the SAME folder, because the date comes from the PERSISTED shipped_at
var f2 = dofResolveShipmentFolder_(d2.folderIo(), { templates: shipTemplates, destination_country: 'US', external_shipment_id: 'KM-SHOPIFY-260825-01', shipped_at: '2026-08-25 09:12:00' });
eq(f2.folder_id, f1.folder_id, '7. a retry resolves to the SAME leaf folder');
eq(f2.reused, true, '7. and reuses rather than creating');
eq(d2.created, 2, '7. so a retry creates NO new folder');
eq(dofShipmentFolderName_('', '2026-08-25').reason, 'MISSING_EXTERNAL_SHIPMENT_ID', '7. no external id -> no folder identity (never a shipment_id fallback)');
eq(dofShipmentFolderName_('X', '').reason, 'MISSING_SHIPPED_AT', '7. no shipped_at -> no folder identity (never today, never the retry date)');
eq(dofShipmentFolderName_('X-1', '2026-08-25').ymd, '20260825', '7. the folder date is derived from shipped_at alone');

var d3 = new FakeDrive([{ id: PO_ROOT, name: 'Purchase Order' }]);
var p1 = dofResolvePoDateFolder_(d3.folderIo(), { templates: [poTpl()], document_batch_date: '2026-08-25' });
eq(p1.folder_name, '20260825', '7. the PO date folder is yyyyMMdd');
var p2 = dofResolvePoDateFolder_(d3.folderIo(), { templates: [poTpl()], document_batch_date: '2026-08-25' });
eq([p2.folder_id === p1.folder_id, d3.created], [true, 1], '7. same-date PO documents share ONE date folder');
// batch-date recovery: the registry's FIRST attempt wins, so a retry never re-dates
eq(dgsPoBatchDate_([{ generated_at: '2026-09-02 10:00:00' }, { generated_at: '2026-08-25 08:00:00' }], '2026-09-30').ymd, '20260825',
  '7. document_batch_at is recovered from the EARLIEST registry attempt, not the retry date');
eq(dgsPoBatchDate_([], '2026-08-25').source, 'FIRST_ATTEMPT', '7. with no prior attempt it is genuinely the first');
eq(dofPickExactChild_([{ id: 'a', name: 'X' }, { id: 'b', name: 'X' }], 'X').action, 'CONFLICT', '7. duplicate exact folders BLOCK');
eq(dofPickExactChild_([{ id: 'a', name: 'XY' }], 'X').action, 'CREATE', '7. matching is exact — a near name is not a match');

// =======================================================================================================
section('B8. §E `shipped` snapshot eligibility');

eq(!!SFO_DISPATCHED_STATUS_.ready_to_ship, false, '8. ready_to_ship is NOT final-output eligible');
eq(!!SFO_DISPATCHED_STATUS_.draft, false, '8. nor is draft');
eq(!!SFO_DISPATCHED_STATUS_.shipped, true, '8. `shipped` IS eligible — a newly confirmed shipment can finalize immediately');
eq([!!SFO_DISPATCHED_STATUS_.in_transit, !!SFO_DISPATCHED_STATUS_.arrived, !!SFO_DISPATCHED_STATUS_.received,
  !!SFO_DISPATCHED_STATUS_.completed, !!SFO_DISPATCHED_STATUS_.closed], [true, true, true, true, true], '8. later states remain eligible');
eq(Object.keys(SFO_NOT_DISPATCHED_STATUS_).sort(), ['cancelled', 'draft', 'ready_to_ship'], '8. and the ineligible set is stated explicitly');
ok(/handleFinalizeShipmentFinalOutput_\(\{ shipment_id: shipmentId, actor: actor \}\)/.test(G39), '8. the ONE existing snapshot owner is called');
eq((G39.match(/handleFinalizeShipmentFinalOutput_\(/g) || []).length, 1, '8. exactly once — no second snapshot implementation');
ok(/already_finalized/.test(G34), '8. and that owner is idempotent (an existing active snapshot is reused)');
ok(!/the map does not need to promote/.test(code(G22)) && /shipped/.test(G39), '8. the map never has to promote a shipment before documents can be generated');

// =======================================================================================================
section('B9. §D failure classification — what may block, what may never un-ship');

['MISSING_EXTERNAL_SHIPMENT_ID', 'UNSUPPORTED_DESTINATION_BUCKET', 'SHIPMENT_DOCUMENT_TEMPLATE_UNRESOLVED',
  'SHIPMENT_DOCUMENT_TEMPLATE_AMBIGUOUS', 'DOCUMENT_REQUIRED_FIELD_MISSING', 'OUTPUT_FOLDER_ROOT_CONFLICT',
  'OUTPUT_FOLDER_ROOT_INACCESSIBLE', 'DOCUMENT_TEMPLATE_ASSET_INACCESSIBLE', 'DOCUMENT_TEMPLATE_TYPE_UNSUPPORTED']
  .forEach(function (r) { eq(dgsFailureClass_(r), 'PRE_DISPATCH_BLOCKING', '9. D1 blocks before dispatch: ' + r); });
['DOCUMENT_FILE_COPY_FAILED', 'DOCUMENT_FILE_FILL_FAILED', 'DOCUMENT_PDF_EXPORT_FAILED', 'DOCUMENT_GENERATION_FAILED']
  .forEach(function (r) { eq(dgsFailureClass_(r), 'POST_DISPATCH_RECOVERABLE', '9. D2 is recoverable, never reversible: ' + r); });
eq(dgsRetryable_('DOCUMENT_PDF_EXPORT_FAILED'), true, '9. a timed-out PDF export is retryable');
eq(dgsRetryable_('SHIPMENT_DOCUMENT_TEMPLATE_UNRESOLVED'), false, '9. a configuration failure is NOT silently retryable');

// the dispatch handler wiring itself
ok(/dgsShipmentReadiness_\(ss, shipmentId/.test(G22), '9. Confirm Shipment runs the pre-dispatch readiness gate');
var gateIdx = G22.indexOf('dgsShipmentReadiness_');
var lockIdx = G22.indexOf('var lock = LockService.getScriptLock()');
ok(gateIdx > 0 && gateIdx < lockIdx, '9. the gate runs BEFORE the ScriptLock — it is read-only and must not hold it');
ok(/stage: 'document_readiness'/.test(G22) && /remains ready_to_ship and shipped_at is blank/.test(G22),
  '9. a blocked gate returns a typed stage and states that nothing was written');
ok(!/skip_document_readiness|force_confirm|bypass/i.test(code(G22)),
  '9. there is NO bypass parameter — no caller can opt out of the gate');
ok(/catch \(eg\) \{ docGate = \{ ok: false, status: 'BLOCKED'/.test(G22),
  '9. and a readiness check that itself throws is treated as BLOCKED, never as permission to proceed');
var genIdx = G22.indexOf('dgsGenerateShipmentDocuments_(ss, shipmentId');
ok(/lock\.releaseLock\(\);\n\n    \/\/ -+ F1-7N-FB-1B \(D2\)/.test(G22),
  '9. the dispatch lock is released IMMEDIATELY before the document block — rendering never runs inside it');
ok(genIdx > G22.indexOf('// ---------- F1-7N-FB-1B (D2)'), '9. and the document call sits inside that post-lock block');
ok(genIdx > lockIdx, '9. it is certainly not before the lock is taken');
ok(/catch \(ed\)/.test(G22), '9. and it is wrapped, so a Drive throw cannot escape into the dispatch result');
ok(!/undoAll\(\)[\s\S]{0,400}dgsGenerateShipmentDocuments_/.test(G22), '9. a document failure never enters the compensating rollback');
ok(/RETRY_REQUIRED/.test(G22) && /The shipment remains Shipped/.test(G22), '9. a D2 failure reports retry-required while the shipment stays Shipped');
eq(/setShip\('status', CSD_CONFIRMED_STATUS_/.test(G22), true, '9. Confirm writes the confirmed status through the one setter');
eq(/var CSD_CONFIRMED_STATUS_ = 'shipped';/.test(G22), true, '9. and that status is `shipped`');
ok(!/setShip\('status', CSD_INTRANSIT_/.test(G22), '9. Confirm never writes in_transit');

// =======================================================================================================
section('B10. §C/§M Send PO — document gate in FRONT of the one canonical writer');

ok(/pcDocumentGateForIssue_\(ss, poId, actor, orderDate, depositDue\)/.test(G13), '10. Send PO runs the document gate');
var gIdx = G13.indexOf('poDocResult = pcDocumentGateForIssue_');
var sIdx = G13.indexOf("setStatus('issued')");
ok(gIdx > 0 && gIdx < sIdx, '10. the document is produced BEFORE the status is written');
ok(/if \(!poDocResult\.ok\) \{[\s\S]{0,600}The PO remains Draft/.test(G13), '10. on failure the PO remains Draft');
ok(/stage: 'document_generation'/.test(G13), '10. with a typed stage the UI can act on');
eq((G13.match(/setStatus\('issued'\)/g) || []).length, 1, '10. there is still exactly ONE PO issue writer — no second transition path');
ok(/order_status: \(transition === 'issue'\) \? 'issued' : undefined/.test(G13), '10. Send PO writes the canonical `issued` token');
ok(/ui_group: \(transition === 'issue'\) \? 'In Production' : undefined/.test(G13), '10. and reports In Production as a UI GROUP LABEL');
ok(!/setStatus\('in_production'\)[\s\S]{0,80}issue/.test(G13), '10. Send PO never writes an in_production DB status');
ok(/GROUP_OF/.test(POJS) && /issued: 'in_production'/.test(POJS), '10. the UI group mapping is where In Production actually lives');
ok(/LockService\.getScriptLock\(\)/.test(G13.slice(0, G13.indexOf('pcDocumentGateForIssue_'))), '10. generate-then-issue is one locked idempotent unit');

// §R no email anywhere on these paths
var EMAIL = /MailApp|GmailApp|GmailApp\.|sendEmail|\bgmail\b/i;
[['13_', G13], ['22_', G22], ['39_', G39], ['36_', G36], ['37_', G37], ['35_', G35], ['38_', G38]].forEach(function (pair) {
  ok(!EMAIL.test(code(pair[1])), '10. no email API is called from ' + pair[0]);
});
ok(/email_status: dgsLc_\(o\.email_status\) \|\| 'not_sent'/.test(G39), '10. email_status stays at the canonical unsent value');
ok(/email_sent: \(transition === 'issue'\) \? false : undefined/.test(G13), '10. and Send PO reports explicitly that no email was sent');

// =======================================================================================================
section('B11. §K/§J render models — Shipment Detail, Packing List, Commercial Invoice');

function snap(over) {
  var h = Object.assign({
    snapshot_id: 'SFO-S1', shipment_id: 'S1', snapshot_version: 1, shipment_no: 'SH-1', reference_id: 'REF-1',
    country: 'US', marketplace: 'AMAZON_US', warehouse_code: 'ABE2', carrier_id: 'CAR_TOP_SEALAND', carrier_name: 'TOP SEALAND',
    shipping_method: 'Sea', etd: '2026-08-20', eta: '2026-09-25', dispatch_date: '2026-08-25',
    invoice_no: 'INV-2026-0801', currency: 'USD', booking_no: 'BK-1', container_no: 'CN-1',
    shipper_legal_name: 'Kitchen Mama LLC', shipper_display_name: 'Kitchen Mama', shipper_country: 'US',
    shipper_address_line_1: '1 Main St', shipper_city: 'Austin', shipper_postal_code: '78701', shipper_tax_or_business_id: 'TAX-1',
    seller_of_record_legal_name: 'Kitchen Mama LLC',
    consignee_name: 'Amazon ABE2', consignee_location_id: 'LOC-ABE2', consignee_warehouse_id: 'WH-ABE2',
    consignee_address_line_1: '705 Boulder Dr', consignee_city: 'Breinigsville', consignee_country: 'US',
    factory_id: 'CN_YOUXIN', factory_name: 'CN侑鑫'
  }, (over && over.header) || {});
  var lines = (over && over.lines) || [
    { snapshot_line_id: 'SL1', shipment_line_id: 'L1', sku: 'KM-A', site_sku: 'B0A', product_name_en: 'Sealer A', product_name_cn: '封口機A',
      shipment_qty: '240', shipment_carton_qty: '12', carton_no_start: '1', carton_no_end: '12', units_per_carton: '20',
      gross_weight: '120', net_weight: '108', cbm: '1.2', carton_length: '40', carton_width: '30', carton_height: '25',
      gs1_code: '00123', gs1_type: 'UPC', country_of_origin: 'CN', hs_code: '8422.30', declared_currency: 'USD', declared_unit_value: '3.5' },
    { snapshot_line_id: 'SL2', shipment_line_id: 'L2', sku: 'KM-B', site_sku: 'B0B', product_name_en: 'Opener B', product_name_cn: '開瓶器B',
      shipment_qty: '120', shipment_carton_qty: '7', carton_no_start: '13', carton_no_end: '19', units_per_carton: '18',
      gross_weight: '70', net_weight: '63', cbm: '0.7', carton_length: '40', carton_width: '30', carton_height: '25',
      gs1_code: '00456', gs1_type: 'UPC', country_of_origin: 'CN', hs_code: '8205.51', declared_currency: 'USD', declared_unit_value: '4' }
  ];
  var readiness = (over && over.readiness) || {
    shipping_detail: { status: 'READY' }, packing_list: { status: 'READY' }, commercial_invoice: { status: 'READY' },
    booking: { status: 'READY' }, customs: { status: 'BLOCKED', reason: 'LEGAL_IMPORTER_AUTHORITY_GAP' }
  };
  return { header: h, lines: lines, po_lineage: [
    { shipment_line_id: 'L1', po_no: 'KM26-0801', allocated_qty: '240', purchase_order_line_id: 'PL1', purchase_order_id: 'PO-1' },
    { shipment_line_id: 'L2', po_no: 'KM26-0802', allocated_qty: '120', purchase_order_line_id: 'PL2', purchase_order_id: 'PO-2' }
  ], readiness: readiness };
}
var S = snap();
var sd = docRenderShippingDetail_(S);
ok(sd.ok, '11. Shipment Detail renders');
eq(sd.header.totals, { qty: 360, cartons: 19, gross_weight: 190, net_weight: 171, cbm: 1.9 }, '11. its totals are derived Σ over the frozen lines');
eq(sd.header.po_numbers, ['KM26-0801', 'KM26-0802'], '11. multi-PO lineage is preserved, not collapsed');
eq(sd.lines[0].declared_total_value, 840, '11. declared total is derived (unit × qty), never stored twice');
eq(sd.lines[0].carton_no_start + '-' + sd.lines[0].carton_no_end, '1-12', '11. carton ranges come from the snapshot');

var pl = docRenderPackingList_(S);
ok(pl.ok, '11. Export Packing List renders');
ok(!('hs_code' in pl.lines[0]) && !('declared_unit_value' in pl.lines[0]), '11. and carries NO commercial/customs values (physical view only)');
eq(pl.header.totals.cartons, 19, '11. with the same physical carton total');
// US destination PL is the SAME factual model — the import/export difference lives in the template
var plUs = docRenderByClass_('PL', S);
eq(JSON.stringify(plUs.lines), JSON.stringify(pl.lines), '11. the US destination Packing List renders from the same outbound facts');

var ci = docRenderCommercialInvoice_(S);
ok(ci.ok, '11. Export Commercial Invoice renders');
eq(ci.header.invoice_no, 'INV-2026-0801', '11. invoice_no is a frozen snapshot fact');
eq(ci.header.currency, 'USD', '11. currency is frozen, never inferred');
eq(ci.header.invoice_total_value, 1320, '11. the invoice total is derived (840 + 480)');
eq([ci.lines[0].hs_code, ci.lines[0].country_of_origin], ['8422.30', 'CN'], '11. HS code and origin are frozen customs facts');
eq(ci.lines[1].declared_total_value, 480, '11. per-line declared totals are computed by the system');
eq(ci.header.consignee.name, 'Amazon ABE2', '11. the consignee is the frozen R2A party, never re-resolved');
var ciUs = docRenderByClass_('CI', S);
ok(ciUs.ok, '11. the US destination Commercial Invoice renders from the same outbound facts');
// mixed currency is a real error, not something to average away
var mixed = snap({ lines: [Object.assign({}, S.lines[0]), Object.assign({}, S.lines[1], { declared_currency: 'EUR' })] });
eq(docRenderCommercialInvoice_(mixed).error, 'COMMERCIAL_INVOICE_CURRENCY_CONFLICT', '11. a mixed-currency invoice fails closed');
// a missing declared value blocks the CI family only
var noDecl = snap({ readiness: { shipping_detail: { status: 'READY' }, packing_list: { status: 'READY' },
  commercial_invoice: { status: 'BLOCKED', reason: 'MISSING_DECLARED_VALUE' }, customs: { status: 'BLOCKED', reason: 'LEGAL_IMPORTER_AUTHORITY_GAP' } } });
eq(docRenderCommercialInvoice_(noDecl).reason, 'MISSING_DECLARED_VALUE', '11. a CI without declared values is blocked with the exact reason');
ok(docRenderShippingDetail_(noDecl).ok && docRenderPackingList_(noDecl).ok, '11. and that never blocks Shipment Detail or Packing List');
eq(docRenderByClass_('BOOKING', S).error, 'UNSUPPORTED_DOCUMENT_TYPE', '11. Carrier Booking has no render model yet and says so honestly');
eq([DOC_SUPPORTED_.SHIPDETAIL, DOC_SUPPORTED_.PL, DOC_SUPPORTED_.CI], [1, 1, 1], '11. the supported render set is SHIPDETAIL + PL + CI');

// =======================================================================================================
section('B12. §I destination customs documents vs LEGAL IMPORTER authority');

// The snapshot's customs family is (correctly) permanently blocked...
eq(S.readiness.customs.reason, 'LEGAL_IMPORTER_AUTHORITY_GAP', '12. the legal-importer gate is still present in the snapshot readiness');
ok(/LEGAL_IMPORTER_AUTHORITY_GAP/.test(G34), '12. and is still DEFINED in its canonical owner (34_) — not deleted, not weakened');
ok(/customs: \{ status: 'BLOCKED', reason: 'LEGAL_IMPORTER_AUTHORITY_GAP' \}/.test(G34), '12. it still blocks the customs family unconditionally');
// ...but it must NOT gate document generation
var ciGate = extractFn(G35, 'docRenderCommercialInvoice_');
ok(/docFamilyStatus_\(snap, 'commercial_invoice'/.test(ciGate), '12. the CI render gate is the commercial_invoice family');
ok(!/'customs'/.test(ciGate), '12. and NEVER the customs family');
ok(!/'customs'/.test(extractFn(G35, 'docRenderPackingList_')), '12. the Packing List gate is likewise not the customs family');
// an import-usage document renders even while the legal gate is blocked
ok(docRenderCommercialInvoice_(S).ok && S.readiness.customs.status === 'BLOCKED',
  '12. a destination customs DOCUMENT generates while the LEGAL importer authority remains blocked');
ok(!/LEGAL_IMPORTER_AUTHORITY_GAP/.test(code(G39)), '12. the document runtime never consults the legal gate at all');
ok(/DESTINATION CUSTOMS DOCUMENTS ARE NOT A LEGAL IMPORTER CLAIM/.test(G35),
  '12. the source states that destination customs documents are not a legal importer claim');
ok(/grant no import authority[\s\S]{0,200}prove no\n \* importer identity/.test(G35),
  '12. and that they grant no import authority and prove no importer identity');
ok(/preserved untouched for the workflows it governs/.test(G35), '12. while the legal gate stays intact for the workflows it governs');
ok(/grant no import authority/i.test(SPEC) && /Legal importer authority/i.test(SPEC), '12. and the canonical spec distinguishes the two concepts');

// =======================================================================================================
section('B13. §J Commercial Invoice field-support behaviour');

eq(Object.keys(DOC_CI_UNRESOLVED_AUTHORITY_).sort(),
  ['IMPORTER_OF_RECORD', 'INCOTERM', 'PAYMENT_TERMS', 'PORT_OF_DISCHARGE', 'PORT_OF_LOADING'],
  '13. the five CI fields with NO canonical owner are named explicitly');
eq(docCiUnresolvedFields_([{ placeholder: 'INCOTERM', required: 'TRUE' }])[0].reason, 'DOCUMENT_FIELD_AUTHORITY_MISSING',
  '13. a REQUIRED field with no authority is reported, never invented');
eq(docCiUnresolvedFields_([{ placeholder: 'INCOTERM', required: 'FALSE' }]).length, 0, '13. an OPTIONAL one does not block');
eq(docCiUnresolvedFields_([{ placeholder: 'HS_CODE', required: 'TRUE' }]).length, 0, '13. a field that DOES have an authority is fine');
ok(/configuration_required: true/.test(G39) && /DOCUMENT_CONFIGURATION_REQUIRED/.test(G39),
  '13. such a CI is registered as CONFIGURATION_REQUIRED');
ok(/unresolved\.length \? 'DOCUMENT_FIELD_AUTHORITY_MISSING' : 'DOCUMENT_REQUIRED_FIELD_MISSING'/.test(G39),
  '13. with the field-authority reason distinguished from an ordinary empty field');
eq(dgsRowState_({ status: 'failed', note: dgsEncodeNote_('DOCUMENT_CONFIGURATION_REQUIRED', false, 'x') }), 'CONFIGURATION_REQUIRED',
  '13. and it surfaces as CONFIGURATION_REQUIRED — not falsely GENERATED');
ok(!/GENERATED/.test(dgsRowState_({ status: 'failed', note: dgsEncodeNote_('DOCUMENT_CONFIGURATION_REQUIRED', false, 'x') })),
  '13. never GENERATED');
ok(/CONFIGURATION_REQUIRED/.test(SH), '13. and the panel has a state for it — it is not silently omitted');

// §D/§G example_value must never reach production output
ok(!/example_value/.test(code(G39)), '14. the document runtime never reads example_value');
ok(!/example_value/.test(code(G37)), '14. nor does the Drive renderer');
ok(!/example_value/.test(code(G35)), '14. nor do the render models');
var mapFn = extractFn(G36, 'dtResolveField_') + extractFn(G36, 'dtMapPlaceholders_');
ok(!/example_value/.test(mapFn), '14. and the field resolver never falls back to it');
var mapped = dtMapPlaceholders_({ header: { po_no: '' }, lines: [] },
  [{ placeholder: 'PO_NO', field_type: 'scalar', data_source_path: 'header.po_no', required: 'TRUE', example_value: 'SHOULD-NEVER-APPEAR', is_active: 'TRUE' }]);
eq(mapped.missing.length, 1, '14. a required-but-empty field is MISSING');
ok(String(mapped.values.PO_NO).indexOf('SHOULD-NEVER-APPEAR') === -1, '14. and the example value is never substituted for it');

// =======================================================================================================
section('B15. §B generated_documents writer projection is complete');

var HEADERS = GENERATED_DOCUMENTS_HEADERS_;   // the REAL frozen list, eval'd from 36_ in the LOAD payload
var projected = dgsRegistryRow_({ document_id: 'G1', related_entity_type: 'shipment', related_entity_id: 'S1', status: 'generated', output_folder_id: 'LEAF' });
eq(Object.keys(projected).sort(), HEADERS.slice().sort(), '15. the writer projects EXACTLY the 30 frozen physical columns');
eq(HEADERS.length, 30, '15. and the frozen contract is 30 columns');
eq(projected.email_status, 'not_sent', '15. email_status defaults to the canonical unsent value');
eq(projected.output_folder_id, 'LEAF', '15. output_folder_id carries the LEAF folder');
ok(/output_folder_id: leafFolderId/.test(G36), '15. 36_ writes the resolved LEAF, not the configured root');
ok(!/output_folder_id: dtStr_\(tpl\.output_folder_id\)/.test(G36), '15. the old root-storing behaviour is gone');
ok(/output_folder_id: one\.file\.output_folder_id \|\| folder\.folder_id/.test(G39), '15. and 39_ stores the folder the file actually landed in');
ok(/related_entity_id: shipmentId/.test(G39) && /related_entity_id: poId/.test(G39), '15. related_entity_id stores the internal PK');
// inspect the RHS of every related_entity_id assignment across the whole service
var fkRhs = (G39.match(/related_entity_id:\s*([A-Za-z0-9_.()' ]+?)[,\n}]/g) || []).map(function (m) { return m.replace(/related_entity_id:\s*/, '').replace(/[,\n}]$/, '').trim(); });
ok(fkRhs.length >= 8, '15. found every related_entity_id assignment (' + fkRhs.length + ')');
var badFk = fkRhs.filter(function (v) { return /_no\b|po_no|shipment_no|reference_id/.test(v); });
eq(badFk, [], '15. NOT ONE of them is a display number — a *_no is never used as an FK');
ok(fkRhs.every(function (v) { return /(shipmentId|poId|entityId|related_entity_id)/.test(v); }), '15. every one is an internal id');

// =======================================================================================================
section('B16. §O lifecycle states with NO new enum token');

var FROZEN = ['generated', 'regenerated', 'emailed', 'archived', 'cancelled', 'failed'];
[DGS_ROW_GENERATED_, DGS_ROW_REGENERATED_, DGS_ROW_FAILED_, DGS_ROW_CANCELLED_].forEach(function (t) {
  ok(FROZEN.indexOf(t) !== -1, '16. every persisted token is inside the FROZEN spec enum: ' + t);
});
eq(dgsRowState_({ status: 'generated', file_id: 'F1' }), 'READY', '16. generated + a real file = READY');
eq(dgsRowState_({ status: 'generated', file_id: '' }), 'GENERATING', '16. generated with no file yet is still in flight');
eq(dgsRowState_({ status: 'failed', note: dgsEncodeNote_('DOCUMENT_PDF_EXPORT_FAILED', true, 'timed out') }), 'FAILED_RETRYABLE', '16. failed + retryable');
eq(dgsRowState_({ status: 'failed', note: dgsEncodeNote_('DOCUMENT_TEMPLATE_TYPE_UNSUPPORTED', false, 'x') }), 'FAILED_TERMINAL', '16. failed + terminal');
eq(dgsRowState_({ status: 'cancelled' }), 'SUPERSEDED', '16. cancelled expresses stale/superseded');
eq(dgsDecodeNote_(dgsEncodeNote_('DOCUMENT_PDF_EXPORT_FAILED', true, 'PDF timed out')).reason, 'DOCUMENT_PDF_EXPORT_FAILED', '16. the typed reason round-trips through note');
eq(dgsDecodeNote_(dgsEncodeNote_('X_Y', true, 'human text')).text, 'human text', '16. and the human text stays readable');

var readyRow = { status: 'generated', file_id: 'F1' };
var failRow = { status: 'failed', note: dgsEncodeNote_('DOCUMENT_PDF_EXPORT_FAILED', true, 'x') };
eq(dgsBatchState_([], {}), 'NONE', '16. no rows = NONE');
eq(dgsBatchState_([], { checking: true }), 'CHECKING', '16. readiness in flight = CHECKING');
eq(dgsBatchState_([readyRow, readyRow], { expected: 2 }), 'READY', '16. all expected documents present = READY');
eq(dgsBatchState_([readyRow], { expected: 5 }), 'PARTIAL', '16. 1 of 5 expected = PARTIAL (the panel alone could not know this)');
eq(dgsBatchState_([readyRow, failRow], { expected: 2 }), 'PARTIAL', '16. mixed = PARTIAL');
eq(dgsBatchState_([failRow], { expected: 1 }), 'FAILED', '16. all failed = FAILED');
eq(dgsBatchState_([failRow], { expected: 1, entity_committed: true }), 'CONFIRMED_RETRY_REQUIRED',
  '16. a failure on an already-committed shipment reads as "confirmed — retry required", never as a failed shipment');
eq(dgsBatchState_([{ status: 'failed', note: dgsEncodeNote_('DOCUMENT_CONFIGURATION_REQUIRED', false, 'x') }], { expected: 1 }), 'CONFIGURATION_REQUIRED', '16. configuration required');
eq(dgsBatchState_([{ status: 'cancelled' }], {}), 'NONE', '16. superseded rows do not count as live documents');

// idempotency + retry planning
var entries = man.entries;
var existingAll = entries.map(function (e) { return { related_entity_type: 'shipment', related_entity_id: 'S1', template_id: e.template_id, template_version: e.template_version, status: 'generated', file_id: 'F-' + e.template_id }; });
var planAll = dgsPlanBatch_(entries, existingAll, 'shipment', 'S1');
eq([planAll.complete, planAll.todo.length, planAll.reuse.length], [true, 0, 6], '16. a fully generated batch has NOTHING to do — repeated clicks duplicate nothing');
var partial = existingAll.slice(0, 4).concat([Object.assign({}, existingAll[4], { status: 'failed', file_id: '', note: dgsEncodeNote_('DOCUMENT_PDF_EXPORT_FAILED', true, 'x') })]);
var planPartial = dgsPlanBatch_(entries, partial, 'shipment', 'S1');
eq([planPartial.reuse.length, planPartial.todo.length], [4, 2], '16. retry reuses the 4 good outputs and redoes only the failed + missing one');
eq(dgsIdentityKey_('shipment', 'S1', 'T-SD', 1), dgsIdentityKey_('SHIPMENT', 'S1', 'T-SD', '1'), '16. the identity key is normalization-stable');
ok(dgsIdentityKey_('shipment', 'S1', 'T-SD', 1) !== dgsIdentityKey_('shipment', 'S1', 'T-SD', 2), '16. but a template VERSION change is a different document');
ok(/regenerated_from_document_id: item\.row \? dgsStr_\(item\.row\.document_id\) : ''/.test(G39), '16. explicit regeneration links to its predecessor');

// =======================================================================================================
section('B17. end-to-end render through the in-memory Drive double');

var d4 = new FakeDrive([{ id: PO_ROOT, name: 'Purchase Order' }, { id: TPL_FILE, name: 'PO Template', kind: 'file' }]);
var poFolder = dofResolvePoDateFolder_(d4.folderIo(), { templates: [poTpl()], document_batch_date: '2026-08-25' });
var poBuilt = dgsBuildRenderPayload_({
  template: poTpl({ file_name_rule: 'KitchenMama_{{PO_NO}}_{{TOTAL_QTY}}' }),
  values: { PO_NO: 'KM26-0801', TOTAL_QTY: 360, LINE_ITEMS: [{ SKU: 'KM-A' }, { SKU: 'KM-B' }] },
  related_entity_type: 'purchase_order', related_entity_id: 'PO-1', class_key: 'PURCHASE_ORDER', folder_id: poFolder.folder_id
});
var rendered = dfoRenderPayload_(d4.renderIo(), poBuilt.payload, {});
ok(rendered.ok, '17. the payload renders to a native file + PDF');
eq(rendered.file_name, 'KitchenMama_KM26-0801_360', '17. under the system-computed filename');
eq(rendered.output_folder_id, poFolder.folder_id, '17. inside the resolved LEAF folder — not the configured root');
ok(rendered.output_folder_id !== PO_ROOT, '17. confirmed: the leaf is not the root');
eq([d4.copies, d4.pdfs], [1, 1], '17. exactly one copy and one PDF');

// a PDF export failure is reported (D2), and the native file it already made is NOT orphaned silently
var d5 = new FakeDrive([{ id: PO_ROOT, name: 'Purchase Order' }, { id: TPL_FILE, name: 'PO Template', kind: 'file' }]);
var pf = dofResolvePoDateFolder_(d5.folderIo(), { templates: [poTpl()], document_batch_date: '2026-08-25' });
var failPdf = dfoRenderPayload_(d5.renderIo({ failPdf: true }), Object.assign({}, poBuilt.payload, { folder_id: pf.folder_id }), {});
eq(failPdf.ok, false, '17. a PDF export failure is reported, never swallowed');
eq(failPdf.error, 'DOCUMENT_PDF_EXPORT_FAILED', '17. with a typed reason');
eq(dgsFailureClass_(failPdf.error), 'POST_DISPATCH_RECOVERABLE', '17. classified as recoverable — it can never un-ship a shipment');
ok(failPdf.file_id, '17. and the already-created native file is reported for the retry, not lost');
// the renderer refuses to guess a destination
eq(dfoRenderPayload_(d5.renderIo(), Object.assign({}, poBuilt.payload, { folder_id: '' }), {}).error, 'DOCUMENT_OUTPUT_FOLDER_REQUIRED',
  '17. the renderer refuses to run without an explicit resolved folder — it never picks one itself');

// =======================================================================================================
section('B18. §P workspace + API projection');

var REG = [
  { related_entity_type: 'shipment', related_entity_id: 'S1', document_id: 'G1', document_type: 'shipment_detail', template_key: 'SHIPDETAIL_STANDARD', status: 'generated', file_id: 'F1', file_url: 'https://docs.google.com/x/F1', pdf_file_url: 'https://drive.google.com/file/d/P1', output_folder_id: 'LEAF1', generated_at: '2026-08-25 09:20:00', email_status: 'not_sent', note: '' },
  { related_entity_type: 'shipment', related_entity_id: 'S1', document_id: 'G2', document_type: 'packing_list', template_key: 'PACKING_LIST_IMPORT_US', status: 'failed', file_id: '', output_folder_id: 'LEAF1', generated_at: '2026-08-25 09:20:00', email_status: 'not_sent', note: dgsEncodeNote_('DOCUMENT_PDF_EXPORT_FAILED', true, 'PDF export timed out') },
  { related_entity_type: 'purchase_order', related_entity_id: 'PO-1', document_id: 'G3', document_type: 'purchase_order', template_key: 'PO_YOUXIN', status: 'generated', file_id: 'F3', file_url: 'https://docs.google.com/x/F3', output_folder_id: 'PLEAF', generated_at: '2026-08-25 08:00:00', email_status: 'not_sent', note: '' }
];
var grouped = shipWsGroupDocuments_(REG, 'shipment');
eq(Object.keys(grouped), ['S1'], '18. the shipment workspace groups only shipment rows');
var shipDto = shipWsDocumentsFor_(grouped, 'S1');
eq(shipDto.documents.length, 2, '18. and projects both documents onto the shipment view-model');
eq(shipDto.documentFolderUrl, 'https://drive.google.com/drive/folders/LEAF1', '18. with a safe folder URL built from the resolved leaf id');
eq(shipDto.documentGenerationStatus, 'CONFIRMED_RETRY_REQUIRED', '18. and the truthful committed-entity state');
eq(shipDto.canRetryDocuments, true, '18. retry is offered');
eq(shipDto.documentGenerationError.reason, 'DOCUMENT_PDF_EXPORT_FAILED', '18. the error assistance names the typed reason');
eq(shipDto.documentGenerationError.documentLabel, 'Packing List (Destination Customs)', '18. and the affected document, labelled for a human');
eq(shipDto.documents[0].download_url, 'https://drive.google.com/file/d/P1', '18. download prefers the PDF when one exists');
var poDto = poWsDocumentsFor_(poWsGroupDocuments_(REG, 'purchase_order'), 'PO-1');
eq([poDto.documents.length, poDto.documentGenerationStatus], [1, 'READY'], '18. and the PO workspace projects its own document');
eq(poDto.documents[0].document_label, 'Purchase Order', '18. with a friendly label');
eq(shipWsDocumentsFor_({}, 'NOPE').documentGenerationStatus, 'NONE', '18. an entity with no documents truthfully reports NONE');

ok(/{ name: 'generated_documents',\s+requiredCols: \[\], optional: true, include: 'documents' }/.test(G57), '18. the shipment workspace reads the registry as a BOUNDED include');
ok(/{ name: 'generated_documents',  requiredCols: \[\], optional: true }/.test(G50), '18. the PO workspace reads it optionally');
ok(/include: \{ documents: true \}/.test(SH), '18. and the Shipment page actually asks for it');
['document.list', 'document.get', 'document.retry', 'document.diagnostic.purchaseOrder', 'document.diagnostic.shipment']
  .forEach(function (a) { ok(RTR.indexOf("action === '" + a + "'") !== -1, '18. router exposes ' + a); });
['listEntityDocuments', 'getGeneratedDocument', 'retryDocumentGeneration', 'runPoDocumentDiagnostic', 'runShipmentDocumentDiagnostic']
  .forEach(function (m) { ok(API.indexOf('window.KM.DB.' + m) !== -1, '18. client exposes KM.DB.' + m); });
ok(!/DriveApp|drive\.google\.com\/drive\/folders\/'\s*\+/.test(code(SH).replace(/dgsFolderUrl_/g, '')), '18. the frontend never builds a Drive query');
ok(!/getFolders\(|getFiles\(|listChildFolders/.test(SH + POJS + API), '18. and never enumerates a Drive folder');

// =======================================================================================================
section('B19. §Q Document Panel renders live data and real error assistance');

var panel = shDocumentPanelHtml({
  title: 'Shipment Documents', entity_type: 'shipment', entity_id: 'S1',
  folder_url: shipDto.documentFolderUrl, documents: shipDto.documents,
  generation_status: shipDto.documentGenerationStatus, error: shipDto.documentGenerationError, can_retry: true
});
ok(panel.indexOf('data-doc-state="CONFIRMED_RETRY_REQUIRED"') !== -1, '19. the panel renders the backend state verbatim');
ok(panel.indexOf('Shipment confirmed — document retry required') !== -1, '19. with the truthful label');
ok(panel.indexOf('Shipment Detail') !== -1 && panel.indexOf('Packing List (Destination Customs)') !== -1, '19. both documents are listed by friendly name');
ok(panel.indexOf('Open Folder') !== -1, '19. Open Folder is offered');
ok(panel.indexOf('Download') !== -1, '19. Download is offered for the artifact that has one');
ok(panel.indexOf('DOCUMENT_PDF_EXPORT_FAILED') !== -1, '19. the typed reason is shown');
ok(panel.indexOf('The PDF export did not complete.') !== -1, '19. alongside a plain-language summary');
ok(panel.indexOf('Where to fix:') !== -1, '19. and where to correct it');
ok(panel.indexOf('shRetryDocument(') !== -1, '19. with a Retry action');
// no raw URL is ever body text — every URL occurrence must sit inside an href
(panel.match(/https?:\/\/[^\s"'<>]+/g) || []).forEach(function (u) {
  ok(panel.indexOf('href="' + u + '"') !== -1, '19. URL appears ONLY as an href, never as body text: ' + u.slice(0, 40));
});
ok(panel.indexOf('rel="noopener noreferrer"') !== -1, '19. links open safely in a new tab');
ok(panel.indexOf('Download All') === -1, '19. no fake "Download All" (no backend ZIP artifact exists)');
ok(!/stack|Error:\s*at\s/i.test(panel), '19. no stack trace is exposed');

var noRetry = shDocumentPanelHtml({ entity_id: 'S1', documents: shipDto.documents, generation_status: 'FAILED', error: shipDto.documentGenerationError, can_retry: false });
ok(noRetry.indexOf('shRetryDocument(') === -1, '19. Retry is hidden without permission — frontend visibility is not authorization');
eq(shDocPanelState({ documents: [], generation_status: '' }), 'NONE', '19. an entity with nothing truthfully says so');
eq(shDocPanelState({ checking: true }), 'CHECKING', '19. and readiness in flight says Checking');
eq(shDocPanelState({ generation_status: 'PARTIAL', documents: [{ status: 'READY' }] }), 'PARTIAL',
  '19. the backend state wins over the panel-local guess (it knows how many were expected)');
['NONE', 'CHECKING', 'GENERATING', 'CONFIGURATION_REQUIRED', 'PARTIAL', 'READY', 'FAILED', 'CONFIRMED_RETRY_REQUIRED']
  .forEach(function (s) { ok(!!SH_DOC_STATE_LABEL_[s], '19. the panel has a label for ' + s); });
ok(shDocumentPanelHtml({ entity_id: 'X', documents: [], generation_status: 'NONE' }).indexOf('No documents generated yet') !== -1,
  '19. and an empty panel is honest rather than implying files exist');
ok(/window\.shRetryDocument = shRetryDocument;/.test(SH), '19. the Retry handler is actually exported (it was referenced but undefined)');
ok(/function shRetryDocument\(/.test(SH), '19. and defined');
ok(/entity_type: 'purchase_order'/.test(POJS), '19. the PO Workspace reuses the SAME panel contract');
ok((POJS.match(/function shDocumentPanelHtml/g) || []).length === 0, '19. with no second panel implementation');

// V3G6A must still be intact
ok(/function _shToggleCardEl\(card\)/.test(SH) && /src\.closest\('\.history-card'\)/.test(SH), '19. the V3G6A Expand fix (click-scoped card resolution) is intact');
ok(/btn\.setAttribute\('aria-expanded'/.test(SH), '19. including the aria-expanded sync');

// =======================================================================================================
section('B20. §S diagnostics are read-only, and the Demo seed is untouched');

var diagPo = extractFn(G39, 'handlePoDocumentDiagnostic_');
var diagShip = extractFn(G39, 'handleShipmentDocumentDiagnostic_');
[['PO', diagPo], ['Shipment', diagShip]].forEach(function (pair) {
  ok(!/dofFolderIo_|createFolder|dgsWriteRegistry_|dgsUpdateRegistry_|appendRow|setValue|handleFinalizeShipmentFinalOutput_/.test(pair[1]),
    '20. the ' + pair[0] + ' diagnostic performs ZERO writes and creates no folder/file');
  ok(/dofProbeIo_/.test(pair[1]) || /dgsShipmentReadiness_/.test(pair[1]),
    '20. its Drive check goes through the non-mutating probe io (directly or via dgsShipmentReadiness_) — ' + pair[0]);
  ok(/writes_performed: 0, folders_created: 0, files_created: 0/.test(pair[1]), '20. and states that explicitly — ' + pair[0]);
  ok(/preview path/.test(pair[1]), '20. it never claims a real Drive round trip — ' + pair[0]);
  ok(/dgsLog_\(/.test(pair[1]), '20. and emits one compact log — ' + pair[0]);
});
ok(/pre_dispatch_system_readiness/.test(diagShip) && /pre_dispatch_drive_readiness/.test(diagShip),
  '20. the Shipment diagnostic reports system and Drive readiness SEPARATELY');
ok(/applicable_manifest/.test(diagShip) && /field_completeness_by_document/.test(diagShip), '20. plus the manifest and per-document completeness');
ok(/persisted_shipped_at/.test(diagShip) && /final_folder_preview/.test(diagShip) && /safe_retry_verdict/.test(diagShip),
  '20. and, for an already shipped shipment, the persisted shipped_at, final folder and retry verdict');
ok(/ui_group/.test(diagPo) && /payload_checksum/.test(diagPo) && /folder_preview/.test(diagPo), '20. the PO diagnostic reports the UI group, checksum and folder preview');
// the readiness path the Shipment diagnostic delegates to must itself be probe-only
var readinessFn = extractFn(G39, 'dgsShipmentReadiness_');
ok(/dofProbeIo_/.test(readinessFn), '20. dgsShipmentReadiness_ uses the non-mutating probe io');
ok(!/dofFolderIo_|createFolder|dgsWriteRegistry_|appendRow|setValue/.test(readinessFn),
  '20. and creates no folder, writes no row — the pre-dispatch gate is strictly read-only');

// nothing in this change touches the Demo seed tool or Demo rows
var CHANGED = [G39, G38, G37, G36, G35, G34, G22, G13, G57, G50, RTR, SH, POJS, API].join('\n');
ok(!/TEMP_demo_shipping_shipment_map_seed_v2|DEMO4A_|demoSeedCommit|COMMIT_CONFIRM|CLEAR_CONFIRM/.test(CHANGED),
  '20. no changed file references the Demo seed tool, its helpers or its confirmation constants');

// =======================================================================================================
section('B21. §V canonical documentation leaves no contradictory active text');

ok(/## Q\. Document Runtime — system-computed payload, Drive-output-only \(F1-7N-FB-1B\)/.test(SPEC), '21. the new canonical section exists');
ok(/Google Drive is not a calculation engine and is not a business-data source/.test(SPEC), '21. it states the architectural boundary');
ok(/CORRECTED by F1-7N-FB-1B §B/.test(SPEC), '21. the old "output_folder_id = the root" rule is explicitly corrected');
ok(/`generated_documents.output_folder_id` now stores the ACTUAL LEAF folder/.test(SPEC), '21. and replaced by the leaf rule');
ok(/D1 — pre-dispatch readiness failure → BLOCKS Shipped/.test(SPEC) && /D2 — post-dispatch Drive\/render failure → RECOVERABLE/.test(SPEC),
  '21. both failure classes are canonical');
ok(/never rolls back a real physical\ndispatch because Drive timed out/.test(SPEC) || /never rolls back a real physical/.test(SPEC),
  '21. and no competing "Drive failure rolls back dispatch" rule remains');
ok(/"In Production" is a UI GROUP LABEL, not a DB status/.test(SPEC), '21. the issued / In Production distinction is recorded');
ok(/No email is sent/.test(SPEC) && /Email Automation is a later consumer/.test(SPEC), '21. so is the no-email boundary and its later dependency');
ok(/Q\.5 Shipment applicability matrix/.test(SPEC) && /COMMERCIAL_INVOICE_IMPORT/.test(SPEC), '21. the exact applicability matrix is canonical');
ok(/Q\.9 Snapshot eligibility/.test(SPEC) && /`ready_to_ship` is deliberately \*\*not\*\* eligible/.test(SPEC), '21. and the shipped snapshot rule');
ok(/There is exactly \*\*ONE active folder contract\*\*/.test(SPEC), '21. the single active folder contract still holds');
ok(/INCOTERM/.test(SPEC) && /CONFIGURATION_REQUIRED/.test(SPEC), '21. the CI runtime status and its unresolved fields are recorded');

// =======================================================================================================
console.log('\n----------------------------------------');
console.log('PASS ' + pass + '   FAIL ' + fail);
console.log('----------------------------------------');
if (fail) process.exit(1);
