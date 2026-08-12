// F1-5C-EXPORT-R3C — actual SHIPDETAIL / PL file generation + storage + download.
// Proves: the file renderer copies the configured template asset and fills tokens from the R3B mapped model (frozen
// R2B snapshot) — never a live master, never a business recompute; multi-PO lineage expands (never collapsed);
// physical qty = snapshot value; fail-closed on missing/unsupported template asset; file generated BEFORE the DB
// record so a failure leaves no false "generated" row; download reference returned; opt-in (R3B behavior preserved).
// Pure fill/expand + dfoGenerateFile_ executed with a FAKE Drive io; the real DriveApp io + 36_ wiring source-guarded.
// Run: node assets/tests/shipment-document-file-f1-5c-export-r3c.test.js
// NOTE: no 'use strict' — extracted pure helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var GS37 = read('specs/active/apps-script/37_shipment_document_file_renderer.gs');
var GS36 = read('specs/active/apps-script/36_document_template_handlers.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');

eval("var DFO_SUPPORTED_TYPES_ = { google_sheet: 1 };");
eval(slice(GS37, '// __DFO_PURE_START__', '// __DFO_PURE_END__'));
eval(extractFn(GS37, 'dfoGenerateFile_'));

// fake Drive io
function fakeIo(store, opts) {
  opts = opts || {};
  return {
    copyTemplate: function (tid, name, folder) { store.copied = { tid: tid, name: name, folder: folder }; return { file_id: 'FILE-1', file_url: 'https://drive/FILE-1' }; },
    readSheetMatrix: function () { return store.matrix.map(function (r) { return r.slice(); }); },
    writeSheetMatrix: function (id, m) { if (opts.failWrite) throw new Error('write boom'); store.written = m; },
    exportPdf: function (id, name) { store.pdf = { name: name }; return { pdf_file_id: 'PDF-1', pdf_file_url: 'https://drive/PDF-1' }; }
  };
}
function tmpl(o) { return Object.assign({ template_file_id: 'TPL-FILE-1', template_file_type: 'google_sheet', output_folder_id: 'FOLDER-1', file_name_rule: '' }, o || {}); }
var MAPPED = { values: {
  SHIPMENT_NO: 'SH-001', TOTAL_QTY: 800,
  LINE_ITEMS: [{ SKU: 'GA0450', QTY: 800, GS1_CODE: '0123456789012', UPC: 20 }, { SKU: 'GA0451', QTY: 100, GS1_CODE: '0123456789029', UPC: 24 }],
  PO_ALLOCATIONS: [{ PO_NO: 'KM-PO-A', ALLOC_QTY: 500 }, { PO_NO: 'KM-PO-B', ALLOC_QTY: 300 }]
} };
var META = { document_type: 'shipment_detail', shipment_id: 'S1', shipment_no: 'SH-001', snapshot_id: 'SFO-S1', snapshot_version: 1, dispatch_date: '2026-08-10' };
var TEMPLATE_MATRIX = [
  ['Shipment', '{{SHIPMENT_NO}}'], ['Total', '{{TOTAL_QTY}}'],
  ['SKU', 'QTY', 'GS1', 'UPC'], ['{{SKU}}', '{{QTY}}', '{{GS1_CODE}}', '{{UPC}}'],
  ['PO', 'ALLOC'], ['{{PO_NO}}', '{{ALLOC_QTY}}']
];

console.log('\n== C/E actual file generated + download reference ==');
var st = { matrix: TEMPLATE_MATRIX }; var r = dfoGenerateFile_(fakeIo(st), tmpl(), MAPPED, META, {});
ok(r.ok === true && r.file_id === 'FILE-1', 'C file generated (template copied)');
ok(r.file_url === 'https://drive/FILE-1' && r.pdf_file_url === 'https://drive/PDF-1', 'E editable + PDF download references returned');
ok(st.copied.tid === 'TPL-FILE-1' && st.copied.folder === 'FOLDER-1', 'file copied from the configured template asset into its output folder');

console.log('\n== F/G physical qty from snapshot + multi-SKU rows ==');
eq(st.written[3], ['GA0450', 800, '0123456789012', 20], 'F/G line 1 filled with snapshot qty (800) at the LINE_ITEMS anchor');
eq(st.written[4], ['GA0451', 100, '0123456789029', 24], 'G second SKU expanded (multi-SKU preserved, one row per line)');

console.log('\n== H multi-PO lineage preserved (never collapsed) ==');
eq(st.written[st.written.length - 2], ['KM-PO-A', 500], 'H PO allocation row 1');
eq(st.written[st.written.length - 1], ['KM-PO-B', 300], 'H PO allocation row 2 (both preserved, not merged into one PO)');
ok(st.written.length === 8, 'H matrix grew by the extra SKU + extra PO row (6 template rows -> 8: 2 line rows + 2 allocation rows)');

console.log('\n== I GS1 barcode distinct from units_per_carton in the rendered file ==');
ok(st.written[3][2] === '0123456789012' && st.written[3][3] === 20, 'I GS1_CODE and UPC(units_per_carton) rendered as distinct cells');

console.log('\n== scalar fill + no token leakage ==');
eq(st.written[0], ['Shipment', 'SH-001'], 'scalar header filled');
ok(!/\{\{[A-Z0-9_]+\}\}/.test(JSON.stringify(st.written)), 'no unresolved {{TOKEN}} leaks into the output');

console.log('\n== filename authority ==');
eq(dfoFilename_('{{DOCUMENT_TYPE}}_{{SHIPMENT_NO}}_{{SNAPSHOT_ID}}', dfoScalarCtx_(dfoSplitValues_(MAPPED.values).scalars, META)), 'shipment_detail_SH-001_SFO-S1', 'filename from file_name_rule placeholders');
eq(dfoFilename_('', dfoScalarCtx_({}, META)), 'KitchenMama_shipment_detail_SH-001_SFO-S1', 'default filename when no rule');

console.log('\n== AE/AF fail closed: missing / unsupported template asset ==');
var st2 = { matrix: TEMPLATE_MATRIX }; var rMiss = dfoGenerateFile_(fakeIo(st2), tmpl({ template_file_id: '' }), MAPPED, META, {});
eq(rMiss.error, 'DOCUMENT_TEMPLATE_ASSET_MISSING', 'AE blank template_file_id -> DOCUMENT_TEMPLATE_ASSET_MISSING'); ok(!st2.copied, 'AE no file copied on missing asset');
eq(dfoGenerateFile_(fakeIo({ matrix: TEMPLATE_MATRIX }), tmpl({ template_file_type: 'pdf' }), MAPPED, META, {}).error, 'DOCUMENT_TEMPLATE_ASSET_TYPE_UNSUPPORTED', 'AF unsupported template type -> fail closed (no fake file)');

console.log('\n== AC file failure leaves no false completed record (fail closed + partial reported) ==');
var st3 = { matrix: TEMPLATE_MATRIX }; var rFail = dfoGenerateFile_(fakeIo(st3, { failWrite: true }), tmpl(), MAPPED, META, {});
eq(rFail.ok, false, 'AC fill failure -> not ok'); eq(rFail.error, 'DOCUMENT_FILE_FILL_FAILED', 'AC error token'); eq(rFail.partial_file_id, 'FILE-1', 'AC partial file id reported for scoped recovery');
ok(/if \(!fr\.ok\) return jsonResponse_\(\{ success: false[\s\S]{0,140}error: fr\.error/.test(GS36), 'AC 36_ returns fail-closed (no generated_documents row) when file generation fails');
ok(GS36.indexOf('if (wantFile) {') < GS36.indexOf('dtAppendByHeader_(genSheet, row)'), 'AC file is generated BEFORE the record is appended');

console.log('\n== Y/Z/M no live-master reads, no FIFO/gap/forecast, immutable inputs ==');
var codeOnly37 = GS37.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/sku_details|tax_referral_rates|company_legal_entities|logistics_locations|warehouses|purchase_order|shipment_lines|shipment_final_output/.test(codeOnly37), 'Y renderer reads no live master / snapshot / operational table (input is the mapped model only)');
ok(!/partyResolve|dtResolveTemplate_|dtMapPlaceholders_|sfoBuildSnapshot_|slaFifoCompare_|order_date|\bgap\b|\bforecast\b|recommendation/i.test(codeOnly37), 'Z renderer runs no template resolve / mapping / FIFO / gap / forecast / recommendation');

console.log('\n== raw Drive access isolated in dfoDefaultIo_ only ==');
var defaultIo = extractFn(GS37, 'dfoDefaultIo_');
ok(/DriveApp|SpreadsheetApp|\.getAs\(|makeCopy/.test(defaultIo), 'the real Drive/Sheets calls live in dfoDefaultIo_');
var pureBlock = slice(GS37, '// __DFO_PURE_START__', '// __DFO_PURE_END__');
ok(!/DriveApp|SpreadsheetApp|makeCopy|\.getAs\(/.test(pureBlock) && !/DriveApp|SpreadsheetApp/.test(extractFn(GS37, 'dfoGenerateFile_')), 'orchestrator + pure fill touch NO raw Drive API (io-injected)');

console.log('\n== 36_ extension: opt-in, download_url, update file-columns-only, no second engine ==');
ok(/var wantFile = !!\(body && body\.generate_file\)/.test(GS36), 'file generation is OPT-IN (generate_file) — R3B default behavior preserved');
ok(/dfoGenerateFile_\(dfoDefaultIo_\(\), tpl, mapped, fileMeta/.test(GS36), '36_ delegates file generation to the 37_ renderer (no second file engine)');
ok(/download_url: \(fileFields\.pdf_file_url \|\| fileFields\.file_url\)/.test(GS36) || /download_url: \(frx\.pdf_file_url \|\| frx\.file_url\)/.test(GS36), 'download_url returned (PDF preferred, else editable file)');
var updFn = extractFn(GS36, 'dtUpdateGeneratedFile_');
ok(/file_name|file_id|file_url|pdf_file_id|pdf_file_url/.test(updFn) && !/shipment_qty|recommended|template_version:|related_entity/.test(updFn), 'AB file-metadata update writes ONLY file columns (never factual/lineage)');
ok(/template_version: dtNum_\(tpl\.template_version\)/.test(GS36) && /regenerated_from_document_id:/.test(GS36), 'N/T R3B template-version + regeneration lineage preserved (unchanged)');

console.log('\n== W/X customs gap does not touch SD/PL file path ==');
ok(!/customs|LEGAL_IMPORTER/i.test(GS37), 'W/X file renderer never consults customs / legal importer for SHIPDETAIL / PL');

console.log('\n== AA frontend adapter is thin (no placeholder mapping / totals / master / template choice) ==');
ok(/KM\.DB\.generateShipmentDocument = async function/.test(DBAPI) && /action: 'shipmentDocument\.generate'/.test(DBAPI), 'adapter posts the canonical shipmentDocument.generate action');
var adapter = slice(DBAPI, 'KM.DB.generateShipmentDocument = async', 'KM.DB.openGeneratedDocument');
ok(!/\{\{|placeholder|totals|sku_details|tax_referral|template_version|dtMap|dtResolve/i.test(adapter), 'AA adapter performs NO placeholder mapping / totals / master resolution / template version logic');
ok(/KM\.DB\.openGeneratedDocument = function/.test(DBAPI) && /window\.open\(url/.test(DBAPI), 'download/open contract: open the returned download_url (presentation only)');

console.log('\n== router: reuses the R3B shipmentDocument.generate action (no new lifecycle) ==');
ok(/action === 'shipmentDocument\.generate'/.test(ROUTER) && /handleShipmentDocumentGenerate_\(body\)/.test(ROUTER), 'shipmentDocument.generate routed (R3B lifecycle owner, extended in place)');

console.log('\n----------------------------------------');
console.log('SHIPMENT DOCUMENT FILE (F1-5C-EXPORT-R3C): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
