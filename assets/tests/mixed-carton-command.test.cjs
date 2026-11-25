'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createWorld}=require('./helpers/order-mainline-world.cjs'),pack=require('../js/core/mixed-carton-packing.js');
const stamp='2026-11-25 10:00:00';
function world(){
 const h=createWorld(),c=h.c;c.KMPACK=pack;
 for(const f of['11_shipping_plan_handlers.gs','78_api_v1_import_batch.gs','79_api_v1_po_import.gs','82_api_v1_po_factory_import.gs','83_api_v1_weekly_draft_lines.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+f,'utf8'),c,{filename:f});
 c.SpreadsheetApp.openById=()=>h.ss;c.prodExpectedDbId_=()=> 'FIXTURE';c.jsonResponse_=o=>({getContent:()=>JSON.stringify(o)});
 c.Utilities.parseDate=s=>new Date(String(s).replace(' ','T')+'+08:00');
 c.spApprovedCancelEligibility_=()=>({ok:true});
 h.sheet('shipping_plans',c.SHIPPING_PLANS_HEADERS_,[{shipping_plan_id:'P1',status:'draft',company:'KM',country:'US',marketplace:'Shopify',source_warehouse_id:'FACTORY-A',updated_at:stamp,note:'Planning note',estimated_total_cost:100}]);
 h.sheet('shipping_plan_lines',c.SHIPPING_PLAN_LINES_HEADERS_,['A','B'].map(s=>({shipping_plan_line_id:s,shipping_plan_id:'P1',sku:s,approved_qty:40,requested_qty:40,units_per_carton:40,plan_carton_qty:1,cbm:.06,gross_weight:12,net_weight:10,note:'Original note',updated_at:stamp})));
 h.sheet('sku_details',['sku','series','units_per_carton','product_status','carton_length','carton_width','carton_height','carton_dimension_unit','carton_weight','item_weight'],['A','B'].map(sku=>({sku,series:'S1',units_per_carton:40,product_status:'active',carton_length:50,carton_width:40,carton_height:30,carton_dimension_unit:'cm',carton_weight:12,item_weight:.25})));
 h.sheet('marketplace_skus',['company','country','marketplace','sku','marketplace_sku_status'],['A','B'].map(sku=>({sku,company:'KM',country:'US',marketplace:'Shopify',marketplace_sku_status:'active'})));
 h.sheet('import_batches',c.IMB_RECEIPT_HEADERS_);h.sheet('import_batch_changes',c.IMB_CHANGE_HEADERS_);
 const call=b=>JSON.parse(c.handleWeeklyDraftLines_(b).getContent());
 return Object.assign(h,{call});
}
function body(){return {shipping_plan_id:'P1',expected_plan_updated_at:stamp,request_id:'WDL-MIXED-0000000001',packing_version:pack.VERSION,
 mixed_cartons:[{id:'MC1',representative_sku:'A',members:[{sku:'A',quantity:40},{sku:'B',quantity:40}]}],
 line_edits:['A','B'].map(id=>({op:'update',shipping_plan_line_id:id,quantity:40,expected_updated_at:stamp}))};}
function business(h){return JSON.stringify(['shipping_plans','shipping_plan_lines','factory_stock','factory_stock_movements','purchase_order_lines'].map(n=>h.rows(n)));}
test('real import validate/journal/commit stores one physical box without changing stock or SKU quantities',()=>{
 const h=world(),stock=JSON.stringify(h.rows('factory_stock')),r=h.call(body());assert.equal(r.success,true,JSON.stringify(r));
 const lines=h.rows('shipping_plan_lines');assert.deepEqual(lines.map(l=>l.approved_qty),[40,40]);assert.deepEqual(lines.map(l=>l.plan_carton_qty),[1,0]);
 assert.deepEqual(lines.map(l=>l.gross_weight),[12,0]);assert.equal(JSON.stringify(h.rows('factory_stock')),stock);
 assert.equal(h.rows('shipping_plans')[0].estimated_total_cost,'');assert(lines.every(l=>pack.metadata(l.note)));
 assert.equal(h.rows('import_batches')[0].status,'COMMITTED');assert.equal(r.data.readback_verified,true);
 const before=business(h),replay=h.call(body());assert.equal(replay.success,true,JSON.stringify(replay));assert.equal(replay.replayed,true);assert.equal(business(h),before);
});
for(const [name,change]of[
 ['stale plan',b=>b.expected_plan_updated_at='2026-11-25 09:00:00'],['stale line',b=>b.line_edits[0].expected_updated_at='2026-11-25 09:00:00'],
 ['overallocated',b=>b.mixed_cartons[0].members[0].quantity=41],['fractional',b=>b.mixed_cartons[0].members[0].quantity=1.5],
 ['foreign SKU',b=>b.mixed_cartons[0].members[0].sku='OTHER'],['invalid representative',b=>b.mixed_cartons[0].representative_sku='OTHER']
])test('command refuses '+name+' without changing business rows',()=>{const h=world(),b=body(),before=business(h);change(b);const r=h.call(b);assert.equal(r.success,false,JSON.stringify(r));assert.equal(business(h),before);});
test('journal failure undoes all SKU metrics/notes and plan quote, keeping receipt for reconciliation',()=>{
 const h=world(),before=business(h);let failed=false;h.tables.shipping_plan_lines.beforeWrite=({col})=>{if(!failed&&h.tables.shipping_plan_lines.grid[0][col-1]==='gross_weight'){failed=true;throw Error('Injected metric write failure');}};
 const r=h.call(body());assert.equal(r.code,'IMPORT_FAILED_ROLLED_BACK',JSON.stringify(r));assert.equal(business(h),before);assert.equal(h.rows('import_batches')[0].status,'FAILED_ROLLED_BACK');
});
test('packing can be removed atomically and ordinary cartons restored',()=>{
 const h=world();assert.equal(h.call(body()).success,true);const b=body();b.request_id+='2';b.expected_plan_updated_at=h.rows('shipping_plans')[0].updated_at;b.mixed_cartons=[];
 b.line_edits.forEach(e=>e.expected_updated_at=h.rows('shipping_plan_lines').find(l=>l.shipping_plan_line_id===e.shipping_plan_line_id).updated_at);
 const r=h.call(b);assert.equal(r.success,true,JSON.stringify(r));assert.deepEqual(h.rows('shipping_plan_lines').map(l=>l.plan_carton_qty),[1,1]);assert(h.rows('shipping_plan_lines').every(l=>!pack.metadata(l.note)));
});
test('legacy Edit SKUs writer cannot silently recalculate already mixed cartons',()=>{
 const h=world();assert.equal(h.call(body()).success,true);const b=body();b.request_id+='2';b.expected_plan_updated_at=h.rows('shipping_plans')[0].updated_at;delete b.packing_version;delete b.mixed_cartons;
 b.line_edits.forEach(e=>e.expected_updated_at=h.rows('shipping_plan_lines').find(l=>l.shipping_plan_line_id===e.shipping_plan_line_id).updated_at);
 const before=business(h),r=h.call(b);assert.equal(r.success,false);assert.equal(r.issues[0].code,'MIXED_CARTON_EDITOR_REQUIRED');assert.equal(business(h),before);
});
test('actual approved-plan handoff preserves all SKU quantities and packing, reserving each SKU once',()=>{
 const h=world(),c=h.c;assert.equal(h.call(body()).success,true);
 h.put('shipping_plans','shipping_plan_id','P1','status','approved');
 h.sheet('shipments',c.SHIPMENTS_HEADERS_);h.sheet('shipment_lines',c.SHIPMENT_LINES_HEADERS_);
 h.sheet('factory_stock',h.tables.factory_stock.grid[0],['A','B'].map(sku=>({factory_stock_id:'F-'+sku,warehouse_id:'FACTORY-A',sku,fac_current_stock:100,fac_reserved_stock:0})));
 // This fixture declares an eligible route and no consolidation candidate. Both are separate admission owners.
 c.shipDestinationDraftGate_=()=>null;c.sc13TryLocked_=()=>null;
 c.PropertiesService={getScriptProperties:()=>({getProperty:()=>null})};
 const r=c.createShipmentFromApprovedPlan_(h.ss,'P1','test');assert.equal(r.created,true,JSON.stringify(r));
 const lines=h.rows('shipment_lines');assert.deepEqual(lines.map(l=>l.shipment_qty),[40,40]);assert.deepEqual(lines.map(l=>l.shipment_carton_qty),[1,0]);
 assert.equal(c.mcpShipment_(h.ss,r.shipment_id).physicalCartons,1);assert.equal(h.rows('shipments')[0].shipment_total_cartons,1);
 assert.deepEqual(h.rows('factory_stock').map(l=>[l.fac_current_stock,l.fac_reserved_stock]),[[100,40],[100,40]]);
});
