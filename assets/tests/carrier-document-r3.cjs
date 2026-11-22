'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const c = { console }; vm.createContext(c);
const dir = process.env.CARRIER_R3_GS || 'assets/specs/active/apps-script';
const base = process.env.CARRIER_R3_BASE || 'assets/specs/active/apps-script';
for (const f of ['03_master_data_handlers.gs','12_shipment_handlers.gs','17_carrier_handlers.gs','34_shipment_final_output_handlers.gs','35_shipment_document_renderer.gs','36_document_template_handlers.gs','37_shipment_document_file_renderer.gs','39_document_runtime_service.gs']) {
  const path = fs.existsSync(dir+'/'+f) ? dir+'/'+f : fs.existsSync(base+'/'+f) ? base+'/'+f : 'assets/specs/active/apps-script/'+f;
  vm.runInContext(fs.readFileSync(path,'utf8'),c,{filename:f});
}
const fixture = JSON.parse(fs.readFileSync('assets/tests/fixtures/carrier-document-r3-sinotrans.json','utf8'));
const r2 = JSON.parse(fs.readFileSync('assets/tests/fixtures/carrier-document-contract-r2.json','utf8'));
function table(rows) { const h = [...new Set(rows.flatMap(r=>Object.keys(r)))]; return {getDataRange:()=>({getValues:()=>[h,...rows.map(r=>h.map(k=>r[k]??''))]})}; }
c.dtRequireKnownLayoutSc2_ = c.prodRequireSheet_ = (ss,name)=>table(name==='document_template_fields'?fixture.fields:[]);
c.xcoLinkCount_ = ()=>0;
const snap = {header:{shipment_id:'S',snapshot_id:'SNAP',snapshot_version:1,shipment_no:'INTERNAL',external_shipment_id:'FBA-TEST',reference_id:'REF',
  shipper_legal_name:'Fixture',consignee_name:'FC',consignee_country:'JP',consignee_address_line_1:'Street',consignee_city:'City',consignee_state_or_region:'State',consignee_postal_code:'00123',
  consignee_contact_ref:'UNIQUE:FC',consignee_contact_phone:'',consignee_contact_email:'',country:'JP',company:'ResTW',marketplace:'Amazon',warehouse_code:'NGO3',shipping_method_label:'Air service',shipping_method:'air',etd:'2026-11-26',currency:'RMB'},
  lines:[{shipment_line_id:'L1',sku:'A',product_name_en:'Product',product_name_cn:'Product CN',shipment_qty:80,shipment_carton_qty:2,units_per_carton:40,
    carton_no_start:'1',carton_no_end:'2',declared_currency:'USD',declared_unit_value:3.3,country_of_origin:'CN',hs_code:'8509805040',tax_match:'RESOLVED',
    gross_weight:29,net_weight:18.96,cbm:0.1223,carton_length:56.8,carton_width:45.8,carton_height:23.5,material:'ABS',product_use:'Kitchen',battery_type:'no_battery',magnet_type:'no_magnet',
    carton_weight:14.5,package_weight:0.237,sku_master_ref:'UNIQUE:A',regular_price:25,regular_price_currency:'JPY',regular_price_ref:'PRICE:A:AUTO',product_url:'https://example.invalid/A',marketplace_product_id:'ASIN-A',regional_ref:'UNIQUE:A'}],
  po_lineage:[],readiness:{commercial_invoice:{status:'READY'},packing_list:{status:'READY'},shipping_detail:{status:'READY'}}};
const tpl = {template_id:'TPL-CI-SINOTRANS-V1',template_key:'COMMERCIAL_INVOICE_SINOTRANS',template_version:1,template_file_type:'google_sheet',template_file_id:'CI',file_name_rule:'File_{{SHIPMENT_NO}}_{{TOTAL_CARTONS}}'};
const entry = {template:tpl,template_id:tpl.template_id,template_key:tpl.template_key,render:'CI',class_key:'COMMERCIAL_INVOICE_EXPORT',document_usage:'carrier'};
c.dgsTemplates_ = ()=>[tpl];
c.sfoReadTable_ = ()=>[{sku:'A',series:'A'}];
const model = c.docRenderByClass_('CI',snap);
const result = c.dgsResolvePayload_({}, {entry,model,related_entity_type:'shipment',related_entity_id:'S',folder_id:'ROOT'});
if (process.env.CARRIER_R3_REPRODUCE) { assert.equal(result.ok,false); console.log('BASELINE_SINOTRANS',JSON.stringify(result)); process.exit(0); }
assert.equal(result.ok,true,JSON.stringify(result));
console.log('PASS SINOTRANS saved 40-field payload');
let passed=1;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
const plain=x=>JSON.parse(JSON.stringify(x));
test('legacy auto price alias uses frozen effective price and requires provenance',()=>{
  const f=fixture.fields.find(f=>f.placeholder==='REGULAR_PRICE'), line=c.docRenderByClass_('CI',snap).lines[0];
  assert.equal(c.dtResolveField_(f,line,true,model.header).value,25);
  assert(c.dtResolveField_(f,{...line,regular_price_ref:''},true,model.header).bad.length);
  assert(c.dtResolveField_(f,{...line,regular_price:''},true,model.header).bad.length);
});
function book(matrix) {
  const a=matrix.map(r=>Array.from({length:27},(_,i)=>r[i]||''));
  function range(r,col,nr=1,nc=1){return {getNumRows:()=>nr,getNumColumns:()=>nc,getMergedRanges:()=>[],
    getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>a[r+i-1]?.[col+j-1]??'')),
    getFormulas:()=>Array.from({length:nr},()=>Array(nc).fill('')),
    setValues:m=>m.forEach((row,i)=>row.forEach((v,j)=>{a[r+i-1]??=Array(27).fill('');a[r+i-1][col+j-1]=v;})),
    setValue:v=>{a[r-1][col-1]=v;},copyTo:to=>to.setValues([a[r-1].slice(col-1,col-1+nc)])};}
  const sh={getName:()=>Object.keys(fixture.workbook)[0],getDataRange:()=>range(1,1,a.length,27),getRange:range,insertRowsAfter:(r,n)=>a.splice(r,0,...Array.from({length:n},()=>Array(27).fill('')))};
  return {a,getSheets:()=>[sh],getNamedRanges:()=>[],getSheetByName:()=>sh};
}
const wb=book(Object.values(fixture.workbook)[0]);
c.SpreadsheetApp={openById:()=>wb,flush:()=>{}};
test('SINOTRANS actual token matrix plans and fills header plus repeated SHIPMENT_NO',()=>{
  const io=c.dfoDefaultIo_();assert.equal(io.planWorkbook('CI',result.payload.sheets,null,{check_values:true}),'');
  io.fillWorkbook('CI',result.payload.sheets,null);
  assert.equal(wb.a[1][2],'FBA-TEST');assert.equal(wb.a[18][2],'FBA-TEST');assert.equal(wb.a[18][16],25);
  assert(!JSON.stringify(wb.a).includes('{{'));
});
const h=['sku','company','country','marketplace','regional_detail_id','product_url','marketplace_product_id'];
const site={company:'KM',country:'US',marketplace:'Shopify'};
const exact={sku:'A',...site,regional_detail_id:'EXACT',product_url:'',marketplace_product_id:'SHOP-A'};
const alt={sku:'A',company:'ResUS',country:'US',marketplace:'Amazon',regional_detail_id:'ALT',product_url:'https://example.invalid/A',marketplace_product_id:'AMZ-A'};
function facts(rows,s=site,sku='A'){return c.sfoRegional_({h,rows},sku,s);}
test('missing URL falls back within SKU without replacing exact marketplace ID',()=>{
  const f=facts([exact,alt]);assert.equal(f.product_url,alt.product_url);assert.equal(f.marketplace_product_id,'SHOP-A');assert.match(f.regional_ref,/product_url_source=SAME_SKU:/);
  assert.deepEqual(plain(c.dtMasterIssues_([f],'sku_regional_details.product_url')),{un:[],inv:[],miss:[]});
});
test('exact valid URL wins over any fallback',()=>assert.equal(facts([{...exact,product_url:'https://exact.invalid/A'},alt]).product_url,'https://exact.invalid/A'));
test('fallback is stable under source row reordering',()=>{
  const other={...alt,regional_detail_id:'Z',product_url:'https://another.invalid/A'};
  assert.deepEqual(plain(facts([exact,alt,other])),plain(facts([other,alt,exact])));
});
test('unmatched site and multi site allow URL only, not marketplace IDs',()=>{
  for(const s of [{...site,company:'OTHER'},{...site,marketplace:'multi'}]){
    const f=facts([alt],s);assert.equal(f.product_url,alt.product_url);assert.equal(f.marketplace_product_id,'');
    assert.equal(c.dtMasterIssues_([f],'sku_regional_details.product_url').un.length,0);
    assert(c.dtMasterIssues_([f],'sku_regional_details.marketplace_product_id').un.length);
  }
});
test('another SKU and invalid URLs cannot fill a missing URL',()=>{
  const f=facts([exact,{...alt,sku:'B'},{...alt,product_url:'javascript:alert(1)'}]);assert.equal(f.product_url,'');
  assert(c.dtMasterBad_(c.dtMasterIssues_([f],'sku_regional_details.product_url'),'sku_regional_details.product_url',true).length);
});
test('source rows and frozen models remain immutable',()=>{
  const rows=[exact,alt],before=JSON.stringify(rows);facts(rows);assert.equal(JSON.stringify(rows),before);
  const beforeSnap=JSON.stringify(snap);c.docRenderByClass_('CI',snap);assert.equal(JSON.stringify(snap),beforeSnap);
});
let cards=[{carrier_id:'TOP',shipping_method:'truck',last_mile_delivery:'parcel',destination_country:'UK',shipping_method_label:'\u5361\u6d3e'}];
const ss={getSheetByName:()=>table(cards)};
c.shipmentTimestamp_=()=> '2026-11-23 01:00:00';c.shippingRateActive_=()=>true;c.sfoDestCountry15g_=()=> 'UK';
const shipment={shipment_id:'S',carrier_id:'TOP',country:'UK',shipping_method:'truck',last_mile_delivery:'parcel'};
test('unpriced service label resolves consistent carrier rate labels without applying price',()=>{
  assert.equal(c.shipServiceLabel_(ss,shipment),'\u5361\u6d3e');assert.equal(shipment.rate_card_id,undefined);
});
test('conflicting service labels do not select an arbitrary service',()=>{
  cards.push({...cards[0],shipping_method_label:'Other'});assert.equal(c.shipServiceLabel_(ss,shipment),'');cards.pop();
});
test('other carrier country and last mile do not leak labels',()=>{
  for(const diff of [{carrier_id:'OTHER'},{last_mile_delivery:'truck'},{shipping_method:'air'}]) assert.equal(c.shipServiceLabel_(ss,{...shipment,...diff}),'');
});
test('old unpriced approval resolves label only for a new snapshot, not old snapshots',()=>{
  c.shipNoRatePolicy_=()=>({allowed:false});c.shipUnpricedMeta_=()=>({label:'Truck'});c.shipUnpricedValid_=()=>true;c.shipRcLines_=()=>[];
  const r=c.sfoRateCardLabel_(ss,{...shipment,rate_card_version:'OLD-APPROVAL'});assert.equal(r.label,'\u5361\u6d3e');assert.equal(r.rate_card_id,'');assert.equal(r.version,'OLD-APPROVAL');
  assert.equal(c.docRenderByClass_('CI',{...snap,header:{...snap.header,shipping_method_label:'Truck'}}).header.shipping_method_label,'Truck');
});
test('batch planner reuses ready outputs and retries only failed classes',()=>{
  const entries=['DETAIL','CI','PL'].map(template_id=>({template_id,template_version:1}));
  const rows=entries.map((e,i)=>({...e,related_entity_type:'shipment',related_entity_id:'S',status:i===1?'failed':'generated',file_id:i===1?'':'FILE'+i,file_url:i===1?'':'https://example.invalid/'+i,note:i===1?'DGS_REASON=DOCUMENT_CONFIGURATION_REQUIRED; DGS_RETRYABLE=0;':''}));
  const plan=c.dgsPlanBatch_(entries,rows,'shipment','S');assert.equal(plan.reuse.length,2);assert.equal(plan.todo.length,1);assert.equal(plan.todo[0].entry.template_id,'CI');
});
test('configuration-failed shipment exposes a document-only retry, PO scope remains unchanged',()=>{
  const r={document_id:'D',related_entity_type:'shipment',related_entity_id:'S',status:'failed',note:'DGS_REASON=DOCUMENT_CONFIGURATION_REQUIRED; DGS_RETRYABLE=0; Mapping incomplete'};
  assert.equal(c.dgsDocumentDto_(r).retryable,true);
  assert.equal(c.dgsDocumentDto_({...r,related_entity_type:'purchase_order'}).retryable,false);
});
test('retry refuses invalid type, unshipped shipment and missing frozen snapshot without generation',()=>{
  let calls=0;c.jsonResponse_=x=>x;c.dgsDb_=()=>({});c.dgsGenerateShipmentDocuments_=()=>{calls++;return {ok:true};};
  c.dgsShipmentContext_=()=>({ok:true,status:'ready_to_ship'});c.docReadSnapshot_=()=>null;
  assert.equal(c.handleDocumentRetry_({related_entity_type:'shipment',related_entity_id:'S'}).zero_write,true);
  assert.equal(c.handleDocumentRetry_({related_entity_type:'other',related_entity_id:'S'}).zero_write,true);
  c.dgsShipmentContext_=()=>({ok:true,status:'shipped'});
  assert.equal(c.handleDocumentRetry_({related_entity_type:'shipment',related_entity_id:'S'}).code,'FROZEN_SNAPSHOT_REQUIRED');assert.equal(calls,0);
});
test('retry delegates only document generation for an existing final snapshot',()=>{
  let calls=0;c.docReadSnapshot_=()=>({header:{shipment_id:'S',status:'final'}});
  c.dgsGenerateShipmentDocuments_=(ss,id,actor,opts)=>{assert.equal(id,'S');assert.deepEqual(plain(opts),{});calls++;return {ok:true,reused:2,generated:1};};
  c.confirmShipmentAndDispatch_=()=>{throw Error('Dispatch must never be retried');};
  const r=c.handleDocumentRetry_({related_entity_type:'shipment',related_entity_id:'S'});assert.equal(r.success,true);assert.equal(r.result.reused,2);assert.equal(calls,1);
});
console.log('CARRIER_R3_PASS '+passed+' live_writes=0');
