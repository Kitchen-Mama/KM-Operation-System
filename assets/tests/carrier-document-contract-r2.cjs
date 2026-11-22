'use strict';
// Actual saved carrier mappings and template tokens, synthetic snapshot/Sheets/Drive only.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = process.env.CARRIER_R2_GS || 'assets/specs/active/apps-script';
const base = process.env.CARRIER_R2_BASE || root;
const fixture = JSON.parse(fs.readFileSync('assets/tests/fixtures/carrier-document-contract-r2.json', 'utf8'));
const c = { console }; vm.createContext(c);
for (const f of ['03_master_data_handlers.gs', '12_shipment_handlers.gs', '17_carrier_handlers.gs', '34_shipment_final_output_handlers.gs', '35_shipment_document_renderer.gs', '36_document_template_handlers.gs', '37_shipment_document_file_renderer.gs', '38_document_output_folder_resolver.gs', '39_document_runtime_service.gs']) {
  const shared = ['03_master_data_handlers.gs','17_carrier_handlers.gs'].includes(f);
  const dir = fs.existsSync(root + '/' + f) ? root : fs.existsSync(base + '/' + f) ? base : shared ? 'assets/specs/active/apps-script' : base;
  vm.runInContext(fs.readFileSync(dir + '/' + f, 'utf8'), c, { filename: f });
}
const plain = x => JSON.parse(JSON.stringify(x)), clone = x => JSON.parse(JSON.stringify(x));
let passed = 0, writes = 0, copies = 0, pdfs = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
let rawFields = clone(fixture.fields);
function table(objects) {
  const keys = [...new Set(objects.flatMap(o => Object.keys(o)))];
  return { getDataRange: () => ({ getValues: () => [keys, ...objects.map(o => keys.map(k => o[k] ?? ''))] }) };
}
c.dtRequireKnownLayoutSc2_ = (ss, name) => table(name === 'document_template_fields' ? rawFields : fixture.templates);
c.prodRequireSheet_ = c.dtRequireKnownLayoutSc2_;
c.xcoLinkCount_ = () => 0;
c.sfoReadTable_ = (ss, name) => { assert.equal(name, 'sku_details'); return [{ sku: 'A', series: 'A' }, { sku: 'B', series: 'B' }]; };
const snapshot = {
  header: { shipment_id: 'S', snapshot_id: 'SNAP', snapshot_version: 1, shipment_no: 'INTERNAL', external_shipment_id: 'FBA-TEST', reference_id: 'REF',
    shipper_legal_name: 'Fixture Company', consignee_name: 'Fixture FC', consignee_address_line_1: '1 Main Street', consignee_city: 'City', consignee_state_or_region: 'CA',
    consignee_postal_code: '00123', consignee_country: 'US', consignee_contact_phone: '123', consignee_contact_email: 'fixture@example.invalid', consignee_contact_ref: 'UNIQUE:fixture',
    country: 'US', company: 'ResUS', marketplace: 'Amazon', warehouse_code: 'ONT8', shipping_method_label: 'Frozen sea service', shipping_method: 'sea',
    shipments_customs_type: 'formal_customs', last_mile_delivery: 'parcel', etd: '2026-11-30', invoice_no: 'INV', currency: 'USD' },
  lines: [0, 1].map(i => ({ shipment_line_id: 'L' + i, sku: i ? 'B' : 'A', product_name_en: 'Product ' + i, product_name_cn: 'Product ' + i,
    shipment_qty: i ? 40 : 80, shipment_carton_qty: i ? 1 : 2, units_per_carton: 40, carton_no_start: i ? '3' : '1', carton_no_end: i ? '3' : '2',
    declared_currency: 'USD', declared_unit_value: 3.3, country_of_origin: 'CN', hs_code: '8509805040', tax_match: 'RESOLVED', vat_no: '', eori_no: '',
    gross_weight: i ? 14 : 28, net_weight: i ? 12 : 24, cbm: i ? 0.1 : 0.2, carton_length: 50, carton_width: 40, carton_height: 30,
    material: 'ABS', product_use: 'Kitchen', battery_type: 'no_battery', magnet_type: 'no_magnet', carton_weight: 14, package_weight: 0.5, sku_master_ref: 'UNIQUE:fixture',
    product_url: 'https://example.invalid/product/' + i, marketplace_product_id: 'ASIN' + i, regional_ref: 'UNIQUE:fixture' })),
  po_lineage: [], readiness: { shipping_detail: { status: 'READY' }, packing_list: { status: 'READY' }, commercial_invoice: { status: 'READY' } }
};
const books = {};
function workbook(key, source) {
  const tabs = Object.fromEntries(Object.entries(clone(source)).map(([name, rows]) => {
    const width = Math.max(...rows.map(r => r.length));
    const values = rows.map(r => Array.from({ length: width }, (_,j) => r[j] || ''));
    function range(r, col, nr = 1, nc = 1) { return {
      getNumColumns: () => nc, getNumRows: () => nr,
      getValues: () => Array.from({ length: nr }, (_,i) => Array.from({ length: nc }, (_,j) => { const v = values[r+i-1]?.[col+j-1] ?? ''; return typeof v === 'string' && v.startsWith('=') ? '' : v; })),
      getFormulas: () => Array.from({ length: nr }, (_,i) => Array.from({ length: nc }, (_,j) => { const v = values[r+i-1]?.[col+j-1]; return typeof v === 'string' && v.startsWith('=') ? v : ''; })),
      getMergedRanges: () => [], getValue: () => {
        const v = values[r-1]?.[col-1] ?? '', m = /^='([^']+)'!\$?([A-Z]+)\$?(\d+)$/.exec(v);
        return m ? tabs[m[1]].values[Number(m[3])-1][c.dfoColN_(m[2])-1] : v;
      },
      setValues: matrix => { writes++; matrix.forEach((row,i) => row.forEach((v,j) => { values[r+i-1] ??= Array(width).fill(''); values[r+i-1][col+j-1] = v; })); },
      setValue: v => { writes++; values[r-1][col-1] = v; }, setFormula: v => { writes++; values[r-1][col-1] = v; },
      copyTo: target => { writes++; target.setValues([values[r-1].slice(col-1,col-1+nc)]); }
    }; }
    return [name, { values, getName: () => name, getDataRange: () => range(1,1,values.length,width), getRange: range,
      insertRowsAfter: (r,n) => { writes++; values.splice(r,0,...Array.from({length:n},()=>Array(width).fill(''))); } }];
  }));
  return books[key] = { getSheetByName: n => tabs[n], getSheets: () => Object.values(tabs), getNamedRanges: () => [] };
}
for (const [key, book] of Object.entries(fixture.workbooks)) workbook(key, book);
c.SpreadsheetApp = { openById: id => books[id], flush: () => {} };
const io = c.dfoDefaultIo_();
const renderIo = {...io, copyTemplate: (id,name,folder) => {
  assert.equal(folder,'ROOT'); copies++; const copy='GENERATED_'+copies; workbook(copy,fixture.workbooks[id]);
  return {file_id:copy,file_url:'https://example.invalid/'+copy};
}, exportPdf: () => { pdfs++; return {pdf_file_id:'PDF_'+pdfs,pdf_file_url:'https://example.invalid/pdf/'+pdfs}; }, renameFile: () => { throw Error('Unexpected render failure'); }};
const templates = fixture.templates.map(t => ({ ...t, template_file_id: t.template_key, file_name_rule: 'File_{{TOTAL_QTY}}_{{TOTAL_CARTONS}}' }));
c.dgsTemplates_ = () => templates;
function entry(key) {
  const tpl = templates.find(t => t.template_key === key);
  return { template: tpl, template_id: tpl.template_id, template_key: key, render: key.startsWith('BOOKING') ? 'BOOKING' : 'PL', class_key: key.startsWith('BOOKING') ? 'CARRIER_BOOKING' : 'PACKING_LIST_EXPORT' };
}
function model(key, snap = snapshot) { const m = c.docRenderByClass_(entry(key).render, snap); assert(m.ok, JSON.stringify(m)); return m; }
const cols = [...c.SFO_LINE_HEADERS_, ...c.SFO_DB16L_, ...c.SFO_DB16A_, ...c.SFO_DB16U_, ...c.DT_DB12_];
const x = {
  snap: () => [...c.SFO_SNAPSHOT_HEADERS_, ...c.SFO_DB16_], rc: () => ({ ok: true }), dest: () => ({ ok: true }),
  master: () => [], contact: () => [], db12: () => [], k1: () => [],
  fn: (tpl, have) => c.dgsFileNameBorrow_(c.dgsFileNameDefs_(tpl,have,templates,c.dtReadTable_({},'document_template_fields',[])),model(tpl.template_key),()=>tpl.template_key,true)
};
function resolve(key, snap = snapshot) { return c.dgsResolvePayload_({}, { entry: entry(key), model: model(key,snap), related_entity_type: 'shipment', related_entity_id: 'S', folder_id: 'ROOT' }); }
if (process.env.CARRIER_R2_REPRODUCE === '1') {
  for (const key of templates.map(t => t.template_key)) {
    const errors = c.dgsFieldContract_({},entry(key),()=>cols,x);
    assert(errors.length > 0, key); console.log('BASELINE_REPRODUCED ' + key + ' ' + errors.join('\n').slice(0,1400));
  }
  process.exit(0);
}
test('105 saved mappings are covered without editing the fixture', () => assert.equal(rawFields.length,105));
test('normalization is immutable and idempotent', () => {
  const before = JSON.stringify(rawFields), once = c.dtNormalizeCarrierFieldsR2_(rawFields);
  assert.equal(JSON.stringify(rawFields),before); assert.deepEqual(plain(c.dtNormalizeCarrierFieldsR2_(once)),plain(once));
});
for (const key of templates.map(t => t.template_key)) {
  test(key + ' real field contract and workbook preflight pass read-only', () => {
    const before = writes; assert.deepEqual(plain(c.dgsFieldContract_({},entry(key),()=>cols,x)),[]); assert.equal(writes,before);
  });
  test(key + ' resolves actual frozen model and all saved fields', () => {
    const r = resolve(key); assert(r.ok,JSON.stringify(r)); assert.equal(r.payload.file_name,'File_120_3');
    assert.equal(io.planWorkbook(key,r.payload.sheets,null,{check_values:true}),'');
  });
  test(key + ' fills a copy, preserves the template and expands collections', () => {
    const r = resolve(key); assert(r.ok,JSON.stringify(r)); const before = JSON.stringify(books[key].getSheets().map(s=>s.values));
    const generated = c.dfoRenderPayload_(renderIo,r.payload); assert(generated.ok,JSON.stringify(generated)); assert(generated.pdf_file_id);
    assert.equal(JSON.stringify(books[key].getSheets().map(s=>s.values)),before);
    const out = JSON.stringify(books[generated.file_id].getSheets().map(s=>s.values)); assert(!out.includes('{{'),out.slice(0,300)); assert(out.includes('Product 0')); assert(out.includes('Product 1'));
  });
}
test('AGL v1 fixed USD is carried as an explicit policy, not a dropped required field', () => {
  const r = resolve('BOOKING_AGL'), sheet = r.payload.sheets[0]; assert(sheet.required.includes('DECLARED_CURRENCY'));
  assert.equal(sheet.fixed_scalars.DECLARED_CURRENCY,'USD'); assert.equal(sheet.scalars.DECLARED_CURRENCY,'USD');
});
test('AGL v1 non-USD snapshot is rejected before copy', () => {
  const snap = clone(snapshot); snap.header.currency = 'EUR'; snap.lines.forEach(l=>l.declared_currency='EUR');
  const before=copies,r = resolve('BOOKING_AGL',snap); assert.equal(r.ok,false); assert.equal(r.reason,'DOCUMENT_FIXED_VALUE_MISMATCH'); assert.equal(copies,before);
});
test('AGL fixed USD must physically exist in the template', () => {
  const r = resolve('BOOKING_AGL'); workbook('NO_USD',fixture.workbooks.BOOKING_AGL); books.NO_USD.getSheetByName('Template').values[34][10] = '';
  assert.match(io.planWorkbook('NO_USD',r.payload.sheets,null,{check_values:true}),/FIXED_VALUE_NOT_IN_TEMPLATE/);
  const before=copies,generated=c.dfoRenderPayload_(renderIo,{...r.payload,template_file_id:'NO_USD'}); assert.equal(generated.ok,false); assert.equal(copies,before);
});
test('a non-AGL template cannot claim the AGL fixed-USD exception', () => {
  const t = { ...entry('BOOKING_AGL').template, template_key: 'OTHER' }; assert(!c.dgsSheetPolicyCarrierR2_({name:'Template'},t).fixed_scalars);
});
test('other missing required AGL tokens still block', () => {
  const r = resolve('BOOKING_AGL'); workbook('NO_QTY',fixture.workbooks.BOOKING_AGL); books.NO_QTY.getSheetByName('Template').values[21][9] = '';
  assert.match(io.planWorkbook('NO_QTY',r.payload.sheets,null,{check_values:true}),/TOKEN_NOT_IN_TEMPLATE.*QTY/);
});
test('frozen declared currency must be available, never fabricated from USD default', () => {
  const snap = clone(snapshot); snap.lines.forEach(l=>l.declared_currency='');
  assert.equal(resolve('BOOKING_AGL',snap).ok,false);
});
test('AGL reserved-capacity overflow retains USD and extends footer formulas on the copy', () => {
  const snap = clone(snapshot); snap.lines = Array.from({length:20},(_,i)=>({...snap.lines[i%2],shipment_line_id:'L'+i,sku:'SKU'+i}));
  const r = resolve('BOOKING_AGL',snap); assert(r.ok,JSON.stringify(r)); workbook('OVERFLOW',fixture.workbooks.BOOKING_AGL);
  io.fillWorkbook('OVERFLOW',r.payload.sheets); const rows = books.OVERFLOW.getSheetByName('Template').values;
  assert.equal(rows[41][10],'USD'); assert.equal(rows[41][11],'=SUM(L22:L41)');
  assert(!JSON.stringify(rows).includes('{{')); assert(rows.flat().includes('2026-11-30'));
});
test('TOP SEALAND repeaters bind only within their own worksheet', () => {
  const fs = c.dgsFieldsFor_({},entry('BOOKING_TOP_SEALAND').template_id);
  for (const f of fs.filter(f=>f.data_scope==='line' && f.field_type!=='collection')) assert.equal(f.collection_key,f.worksheet_name===Object.keys(fixture.workbooks.BOOKING_TOP_SEALAND)[0]?'CARRIER_INVOICE_LINES':'CARRIER_PACKING_LINES');
  const ref = fs.find(f=>f.placeholder==='CARTON_REFERENCE'); assert.equal(ref.transform_rule,'carton_reference_format');
});
test('TOP SEALAND warehouse aliases use the frozen consignee, preserving postal leading zeros', () => {
  const r = resolve('BOOKING_TOP_SEALAND'), s = r.payload.sheets[0].scalars;
  assert.equal(s.WAREHOUSE_NAME,'Fixture FC'); assert.equal(s.WAREHOUSE_ADDRESS,'1 Main Street'); assert.equal(s.WAREHOUSE_POSTAL_CODE,'00123'); assert.equal(s.WAREHOUSE_COUNTRY_CODE,'US');
  assert.equal(s.CUSTOMS_TYPE,c.customsTypeLabel_('formal_customs'));
});
test('unresolved destination still blocks warehouse-source aliases', () => {
  assert.match(c.dgsFieldContract_({},entry('BOOKING_TOP_SEALAND'),()=>cols,{...x,dest:()=>({ok:false,error:'NOT_UNIQUE'})}).join(),/DOCUMENT_DESTINATION_UNRESOLVED/);
});
test('ambiguous collection controllers are never guessed', () => {
  const old = rawFields; const control = rawFields.find(f=>f.placeholder==='CARRIER_INVOICE_LINES'); rawFields = [...rawFields,{...control,field_id:'DUP'}];
  assert.match(c.dgsFieldContract_({},entry('BOOKING_TOP_SEALAND'),()=>cols,x).join(),/COLLECTION_UNDEFINED/); rawFields = old;
});
test('unknown nonblank collection keys remain invalid', () => {
  const old = rawFields; rawFields = clone(old); rawFields.find(f=>f.field_id==='FIELD-BOOKING-INV-0120').collection_key='UNKNOWN';
  assert.match(c.dgsFieldContract_({},entry('BOOKING_TOP_SEALAND'),()=>cols,x).join(),/COLLECTION_UNDEFINED:UNKNOWN/); rawFields = old;
});
test('SINOTRANS repairs exactly the five recognized shifted total rows', () => {
  const fs = c.dgsFieldsFor_({},entry('PACKING_LIST_SINOTRANS').template_id).filter(f=>f.placeholder.startsWith('TOTAL_'));
  assert.equal(fs.length,5); for(const f of fs){assert.equal(f.data_source_table,'shipments');assert.equal(f.data_scope,'total');}
});
test('unknown shifted source shapes stay blocked', () => {
  const old = rawFields; rawFields = clone(old); rawFields.find(f=>f.field_id==='FIELD-SINOTRANS-PL-0400').data_source_field='shipments.unreviewed';
  assert.match(c.dgsFieldContract_({},entry('PACKING_LIST_SINOTRANS'),()=>cols,x).join(),/SOURCE_NOT_IN_MODEL/); rawFields = old;
});
test('the legacy total correction does not apply to another template', () => {
  const f = {...fixture.fields.find(f=>f.field_id==='FIELD-SINOTRANS-PL-0400'),template_key:'OTHER'};
  assert.deepEqual(plain(c.dtNormalizeCarrierFieldsR2_([f])[0]),f);
});
test('all copy-like writes in this test were synthetic and no Drive files were created', () => {assert.equal(copies,3);assert.equal(pdfs,3);});
console.log('CARRIER_DOCUMENT_R2_PASS ' + passed + ' live_business_writes=0 live_drive_writes=0');
