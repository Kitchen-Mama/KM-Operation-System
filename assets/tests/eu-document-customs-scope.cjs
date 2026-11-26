'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createEuWorld}=require('./helpers/shipment-import-eu-world.cjs'),{parts}=require('./helpers/write-command-flight-world.cjs');
const base=new Function('createEuWorld','vm','fs',parts(fs.readFileSync('assets/tests/shipment-no-rate-policy.cjs','utf8'),['world'])+';return world;')(createEuWorld,vm,fs);
function world(){
 const h=base('no_battery'),c=h.c;
 for(const file of ['33_party_authority_handlers.gs','19_tax_handlers.gs','35_shipment_document_renderer.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+file,'utf8'),c);
 c.shippingTaxDay_=(_,value)=>c.taxDate_(value);
 h.sheet('shipment_plan_links',c.SC13_LINK_HEADERS_);
 h.put('shipments','shipment_id','S','country','EU');h.put('shipments','shipment_id','S','etd','2026-12-02');
 h.put('warehouses','warehouse_id','RESUS-FBA','country','PL');
 const wh=h.rows('warehouses').map(w=>({...w,...(w.warehouse_id==='RESUS-FBA'?{warehouse_code:'WRO5',warehouse_name:'Amazon FBA WRO5',address_line1:'Fixture address',city:'Okmiany',state:'Fixture region',postal_code:'59-225'}:{})}));
 h.sheet('warehouses',[...new Set(wh.flatMap(Object.keys))],wh);
 h.sheet('company_legal_entities',c.COMPANY_LEGAL_ENTITIES_HEADERS_,[{company_legal_entity_id:'CLE',company:'ResUS',legal_name:'Fixture exporter',country:'TW',is_active:true}]);
 h.sheet('logistics_locations',['logistics_location_id','warehouse_id','is_active']);
 h.sheet('sku_details',['sku','series','product_name','battery_type','units_per_carton','country_of_origin'],[{sku:'SKU',series:'CO1100',product_name:'Fixture opener',battery_type:'no_battery',units_per_carton:40,country_of_origin:'CN'}]);
 h.sheet('tax_referral_rates',c.TAX_REFERRAL_RATES_HEADERS_,[
 {tax_rate_id:'EU-CN',series:'CO1100',country_of_origin:'CN',duty_country:'EU',declared_value:2.5,declared_currency:'EUR',hscode:'EU-HS',effective_from:'2026-01-01'},
 {tax_rate_id:'PL-CN',series:'CO1100',country_of_origin:'CN',duty_country:'PL',declared_value:99,declared_currency:'PLN',hscode:'PL-HS',effective_from:'2026-01-01'}]);
 h.sheet('shipment_line_allocations',c.SHIPMENT_LINE_ALLOCATIONS_HEADERS_,[{shipment_line_allocation_id:'A',shipment_line_id:'L',purchase_order_line_id:'POL',sku:'SKU',allocated_qty:40,allocation_status:'draft'}]);
 h.sheet('purchase_orders',h.tables.purchase_orders.grid[0],[{purchase_order_id:'PO',po_no:'PO-1',warehouse_id:'FACTORY',order_status:'completed'}]);
 h.sheet('purchase_order_lines',h.tables.purchase_order_lines.grid[0],[{purchase_order_line_id:'POL',purchase_order_id:'PO',sku:'SKU',series:'CO1100',ordered_qty:40,completed_qty:40,remaining_qty:40}]);
 h.sheet('shipment_final_output_snapshots',[...new Set([...c.SFO_SNAPSHOT_HEADERS_,...c.SFO_DB16_])]);
 h.sheet('shipment_final_output_lines',[...new Set([...c.SFO_LINE_HEADERS_,...c.SFO_DB16L_,...c.SFO_DB16A_,...c.SFO_DB16U_])]);
 h.sheet('shipment_final_output_line_pos',c.SFO_LINE_PO_HEADERS_);
 c.sfoRateCardLabel_=()=>({ok:true,label:'Truck',rate_card_id:'',version:''});
 return Object.assign(h,{build:()=>c.sfoBuildSnapshot_(h.ss,'S',{prospective:true})});
}
test('real EU/WRO5 snapshot uses the exact physical PL declaration and keeps its PL consignee',()=>{
 const h=world(),before=h.writes(),r=h.build();assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.header.country,'EU');assert.equal(r.header.consignee_country,'PL');assert.equal(r.header.consignee_name,'Amazon FBA WRO5');
 assert.equal(r.lines[0].tax_rate_id,'PL-CN');assert.equal(r.lines[0].declared_unit_value,99);assert.equal(r.lines[0].declared_currency,'PLN');assert.equal(r.lines[0].hs_code,'PL-HS');
 assert.equal(r.readiness.commercial_invoice.status,'READY');assert.equal(h.c.shipRateDestination_(h.ss,h.rows('shipments')[0]).country,'PL');assert.equal(h.writes(),before);
});
test('a national PL shipment retains the exact PL declaration row',()=>{
 const h=world();h.put('shipments','shipment_id','S','country','PL');const r=h.build();assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.lines[0].tax_rate_id,'PL-CN');assert.equal(r.lines[0].declared_unit_value,99);
});
test('missing PL and DE data cannot borrow EU or FR declaration',()=>{
 const h=world();h.put('tax_referral_rates','tax_rate_id','PL-CN','duty_country','FR');const r=h.build();assert.equal(r.ok,true);assert.equal(r.lines[0].tax_match,'PL_DE_NOT_FOUND');assert.equal(r.readiness.commercial_invoice.status,'BLOCKED');
});
for(const [name,key,value,match]of[
 ['expired PL record','effective_to','2026-11-30','PL_DE_NOT_FOUND'],
 ['future PL record','effective_from','2027-01-01','PL_DE_NOT_FOUND'],
 ['wrong origin','country_of_origin','TW','PL_DE_NOT_FOUND'],
 ['zero declared value','declared_value',0,'RESOLVED'],
 ['missing declared currency','declared_currency','','RESOLVED']
])test(name+' remains blocked, without borrowing another country',()=>{
 const h=world();h.put('tax_referral_rates','tax_rate_id','PL-CN',key,value);const before=h.writes(),r=h.build();assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.lines[0].tax_match,match);assert.equal(r.readiness.commercial_invoice.status,'BLOCKED');assert.equal(h.writes(),before);
});
test('duplicate effective PL records remain ambiguous',()=>{
 const h=world(),row=h.rows('tax_referral_rates')[1];h.tables.tax_referral_rates.appendRow(h.tables.tax_referral_rates.grid[0].map(k=>k==='tax_rate_id'?'DUP':row[k]));
 assert.equal(h.build().lines[0].tax_match,'AMBIGUOUS');assert.equal(h.build().readiness.commercial_invoice.status,'BLOCKED');
});
test('the actual frozen-value gate names each missing SKU and tax lookup instead of only MISSING_DECLARED_VALUE',()=>{
 const h=world(),c=h.c;h.put('tax_referral_rates','tax_rate_id','PL-CN','declared_currency','');
 c.dgsTemplates_=()=>[];c.dgsShipmentManifest_=()=>({ok:true,entries:[{render:'BOOKING',class_key:'CARRIER_BOOKING',template_key:'BOOKING_TOP_SEALAND'}]});
 const before=h.writes(),r=c.dgsFrozenValueGate_(h.ss,'S');assert.equal(r.ok,false,JSON.stringify(r));assert.equal(r.built,null);
 const p=r.blockers[0].problems.join('\n');assert.match(p,/line 1 SKU/);assert.match(p,/declared_currency is blank/);assert.match(p,/duty_country=PL/);assert.match(p,/tax_rate_id=PL-CN/);assert.equal(h.writes(),before);
});
test('the same frozen-value gate accepts exact PL values for a PL address without document or business writes',()=>{
 const h=world(),c=h.c;c.dgsTemplates_=()=>[];c.dgsShipmentManifest_=()=>({ok:true,entries:[{render:'BOOKING',class_key:'CARRIER_BOOKING',template_key:'BOOKING_TOP_SEALAND'}]});
 c.dgsResolvePayload_=(_,request)=>{assert.equal(request.model.lines[0].declared_unit_value,99);assert.equal(request.model.lines[0].declared_currency,'PLN');return {ok:true};};
 const before=h.writes(),r=c.dgsFrozenValueGate_(h.ss,'S');assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.built.lines[0].tax_rate_id,'PL-CN');assert.equal(r.built.header.consignee_country,'PL');assert.equal(h.writes(),before);
});
test('currency conflict preflight uses the same physical PL declaration scope as the snapshot',()=>{
 const h=world(),c=h.c,first=h.rows('shipment_lines')[0];
 h.tables.shipment_lines.appendRow(h.tables.shipment_lines.grid[0].map(k=>({...first,shipment_line_id:'L2',sku:'SKU2'})[k]));
 h.tables.sku_details.appendRow(h.tables.sku_details.grid[0].map(k=>({sku:'SKU2',series:'CO1150',country_of_origin:'CN'})[k]));
 h.tables.tax_referral_rates.appendRow(h.tables.tax_referral_rates.grid[0].map(k=>({tax_rate_id:'EU-OTHER',series:'CO1150',country_of_origin:'CN',duty_country:'PL',declared_value:3,declared_currency:'USD',effective_from:'2026-01-01'})[k]));
 const before=h.writes(),r=c.xcoCiCurrencyConflict_(h.ss,{row:h.rows('shipments')[0]},{entries:[{render:'CI',class_key:'CI',requirement:'ALWAYS'}]},{CI:1});
 assert.equal(r.reason,'COMMERCIAL_INVOICE_CURRENCY_CONFLICT');assert.equal(r.value,'PLN / USD');assert.equal(h.writes(),before);
});
function deWorld(){
 const h=world();h.put('tax_referral_rates','tax_rate_id','PL-CN','duty_country','DE');h.put('tax_referral_rates','tax_rate_id','PL-CN','declared_currency','EUR');h.put('tax_referral_rates','tax_rate_id','PL-CN','declared_value',5.3);
 h.put('tax_referral_rates','tax_rate_id','PL-CN','vat_no','DE-VAT');h.put('tax_referral_rates','tax_rate_id','PL-CN','eori_no','DE-EORI');return h;
}
test('owner-approved PL -> DE compatibility builds a valid EU/WRO5 invoice with frozen provenance, not a DE address',()=>{
 const h=deWorld(),before=h.writes(),r=h.build();assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.readiness.commercial_invoice.status,'READY');
 assert.equal(r.header.consignee_country,'PL');assert.equal(r.header.consignee_name,'Amazon FBA WRO5');assert.equal(r.header.country,'EU');
 const l=r.lines[0];assert.equal(l.declared_unit_value,5.3);assert.equal(l.declared_currency,'EUR');assert.equal(l.hs_code,'PL-HS');assert.equal(l.country_of_origin,'CN');assert.equal(l.tax_rate_id,'PL-CN');assert.equal(l.vat_no,'');assert.equal(l.eori_no,'');
 assert.equal(r.readiness.declaration_compatibility[0].source_duty_country,'DE');assert.equal(r.readiness.declaration_compatibility[0].requested_duty_country,'PL');
 const frozen=h.c.sfoFrozenRows_(r,'S','fixture','2026-11-26');assert.equal(JSON.parse(frozen.header.readiness_detail).declaration_compatibility[0].tax_rate_id,'PL-CN');assert.equal(h.writes(),before);
});
test('an effective exact PL row always takes priority over DE compatibility',()=>{
 const h=deWorld(),row={...h.rows('tax_referral_rates')[1],tax_rate_id:'EXACT-PL',duty_country:'PL',declared_value:7,declared_currency:'PLN',vat_no:'PL-VAT',eori_no:'PL-EORI'};
 h.tables.tax_referral_rates.appendRow(h.tables.tax_referral_rates.grid[0].map(k=>row[k]));const r=h.build();assert.equal(r.lines[0].tax_rate_id,'EXACT-PL');assert.equal(r.lines[0].declared_unit_value,7);assert.equal(r.lines[0].vat_no,'PL-VAT');assert.equal(r.readiness.declaration_compatibility,undefined);
});
for(const [name,key,value,match]of[
 ['expired DE','effective_to','2026-11-30','PL_DE_NOT_FOUND'],['future DE','effective_from','2027-01-01','PL_DE_NOT_FOUND'],['wrong DE origin','country_of_origin','TW','PL_DE_NOT_FOUND'],
 ['blank DE currency','declared_currency','','RESOLVED'],['zero DE declared value','declared_value',0,'RESOLVED']
])test(name+' does not invent a usable declaration',()=>{
 const h=deWorld();h.put('tax_referral_rates','tax_rate_id','PL-CN',key,value);const before=h.writes(),r=h.build();assert.equal(r.lines[0].tax_match,match);assert.equal(r.readiness.commercial_invoice.status,'BLOCKED');assert.equal(h.writes(),before);
});
test('DE compatibility never spreads to a missing FR, ES or EU jurisdiction',()=>{
 const h=deWorld(),rows=h.rows('tax_referral_rates').filter(r=>r.duty_country==='DE');
 for(const country of ['FR','ES','EU','CA'])assert.equal(h.c.sfoResolveCustoms_(rows,'CO1100',country,'2026-12-02','CN',h.ss).resolved,false);
});
test('ambiguous DE source is refused rather than choosing an arbitrary declaration',()=>{
 const h=deWorld(),row=h.rows('tax_referral_rates')[1];h.tables.tax_referral_rates.appendRow(h.tables.tax_referral_rates.grid[0].map(k=>k==='tax_rate_id'?'DE-DUP':row[k]));
 const r=h.build();assert.equal(r.lines[0].tax_match,'PL_DE_AMBIGUOUS');assert.equal(r.readiness.commercial_invoice.status,'BLOCKED');
});
test('the actual frozen-value gate and carrier invoice accept DE compatibility and preserve its audit',()=>{
 const h=deWorld(),c=h.c;c.dgsTemplates_=()=>[];c.dgsShipmentManifest_=()=>({ok:true,entries:[{render:'BOOKING',class_key:'CARRIER_BOOKING',template_key:'BOOKING_TOP_SEALAND'}]});
 c.dgsResolvePayload_=(_,request)=>{assert.equal(request.model.lines[0].declared_unit_value,5.3);assert.equal(request.model.lines[0].declared_currency,'EUR');return {ok:true};};
 const before=h.writes(),r=c.dgsFrozenValueGate_(h.ss,'S');assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.built.readiness.declaration_compatibility[0].source_duty_country,'DE');assert.equal(r.built.header.consignee_country,'PL');assert.equal(h.writes(),before);
});
module.exports={world,deWorld};
