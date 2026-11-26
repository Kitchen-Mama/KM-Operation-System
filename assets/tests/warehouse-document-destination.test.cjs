'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({});
for(const f of ['33_party_authority_handlers.gs','34_shipment_final_output_handlers.gs','35_shipment_document_renderer.gs','36_document_template_handlers.gs','39_document_runtime_service.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+f,'utf8'),c,{filename:f});
const plain=v=>JSON.parse(JSON.stringify(v)),shipment={shipment_id:'S',destination_warehouse_id:'W',country:'US'},warehouse={warehouse_id:'W',warehouse_name:'Fixture FC',is_active:true,address_line1:'1 Test Road',address_line2:'Unit A',city:'Test City',state:'California',country:'US',postal_code:'00123',contact_name:'',contact_phone:'',contact_email:''};
const resolve=(locations=[],warehouses=[warehouse])=>c.partyResolveConsignee_(locations,shipment,null,warehouses);
test('exact active warehouse supplies the missing location without guessing a code',()=>{
 const r=resolve();assert.equal(r.ok,true);assert.equal(r.consignee.source,'WAREHOUSE_MASTER');assert.equal(r.consignee.warehouse_id,'W');assert.equal(r.consignee.recipient_name,'Fixture FC');assert.equal(r.consignee.postal_code,'00123');
 assert.equal(resolve([],[{...warehouse,warehouse_id:'OTHER',warehouse_code:'W'}]).ok,false);
});
test('inactive, ambiguous or incomplete warehouse facts still block',()=>{
 assert.equal(resolve([],[{...warehouse,is_active:false}]).ok,false);assert.equal(resolve([],[warehouse,warehouse]).error,'DESTINATION_WAREHOUSE_AMBIGUOUS');
 assert.equal(resolve([],[{...warehouse,address_line1:''}]).error,'DESTINATION_WAREHOUSE_ADDRESS_INCOMPLETE');
});
test('an existing eligible location keeps authority; rejected/duplicate locations cannot be bypassed',()=>{
 const loc={warehouse_id:'W',is_active:true,location_name:'Verified location',address_line_1:'2 Verified Road',country:'US'};
 assert.equal(resolve([loc]).consignee.recipient_name,'Verified location');assert.equal(resolve([{...loc,verification_status:'rejected'}]).ok,false);assert.equal(resolve([loc,loc]).error,'DESTINATION_LOCATION_AMBIGUOUS');
});
const fields=['warehouse_name','contact_name','address','city','state','postal_code','country','contact_phone','contact_email'].map(field=>({placeholder:'WAREHOUSE_'+field.toUpperCase(),data_source_table:'warehouses',data_source_field:field,field_type:'scalar',data_scope:'header',required:true,is_active:true}));
for(const carrier of ['TOP_SEALAND','AGL','OTHER_CARRIER'])test(carrier+' shares frozen destination/contact mapping with blank contact allowances',()=>{
 const dest=resolve(),h=c.sfoBuildHeader_({...shipment,carrier_id:carrier,shipping_method:'sea'},{legal_name:'Fixture exporter'},{},dest.consignee,{},{});
 Object.assign(h,c.sfoWarehouseContact_({h:Object.keys(warehouse),rows:[warehouse]},'W',dest.consignee.warehouse_id));
 const model={header:c.docHeaderBlock_(h,[],[]),lines:[]},mapped=c.dtMapPlaceholders_(model,fields);
 assert.deepEqual(plain(mapped.missing),[]);assert.equal(mapped.values.WAREHOUSE_CONTACT_NAME,'Fixture FC');assert.equal(mapped.values.WAREHOUSE_CONTACT_PHONE,'');assert.equal(mapped.values.WAREHOUSE_CONTACT_EMAIL,'');assert.equal(mapped.values.WAREHOUSE_POSTAL_CODE,'00123');
 assert(mapped.warnings.some(w=>w.warning==='DOCUMENT_FIELD_BLANK_ALLOWED:warehouses.contact_phone'));
 c.dgsFieldsFor_=()=>fields;
 const contract=c.dgsFieldContract_({}, {template_id:'T',template:{file_name_rule:''},render:'CI'},()=>[],{
  snap:()=>Object.keys(h),dest:()=>dest,contact:src=>{const issues=c.dtMasterIssues_([h],src);issues.miss=[];return c.dtMasterBad_(issues,src,false);}
 });assert.deepEqual(plain(contract),[]);
 const readiness=c.sfoDocumentReadiness_(h,[{declared_currency:'USD',declared_unit_value:2}]);
 for(const family of ['shipping_detail','packing_list','commercial_invoice','booking'])assert.equal(readiness[family].status,'READY',family+' must accept the canonical warehouse without inventing a location ID');
 assert.equal(h.consignee_location_id,'');
 for(const field of ['consignee_warehouse_id','consignee_name','consignee_address_line_1','consignee_city','consignee_country'])assert.equal(c.sfoDocumentReadiness_({...h,[field]:''},[{declared_currency:'USD',declared_unit_value:2}]).packing_list.status,'BLOCKED',field);
});
test('a warehouse/consignee identity mismatch still blocks contact resolution',()=>{
 const contact=c.sfoWarehouseContact_({h:Object.keys(warehouse),rows:[warehouse]},'W','OTHER');
 assert.match(c.dtMasterBad_(c.dtMasterIssues_([contact],'warehouses.contact_phone'),'warehouses.contact_phone',false).join(),/CONTACT_CONSIGNEE_MISMATCH/);
});
