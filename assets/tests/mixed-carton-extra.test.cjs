'use strict';
const {test}=require('node:test'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const pack=require('../js/core/mixed-carton-packing'),{createWorld}=require('./helpers/order-mainline-world.cjs'),{parts}=require('./helpers/write-command-flight-world.cjs');
const source=fs.readFileSync('assets/tests/mixed-carton-command.test.cjs','utf8'),stamp='2026-11-25 10:00:00';
const baseWorld=new Function('createWorld','pack','vm','fs','stamp',parts(source,['world'])+'\nreturn world;')(createWorld,pack,vm,fs,stamp);
function world(series='S1'){
 const h=baseWorld(),c=h.c;c.KMFSG=require('../js/core/supply-planning-factory-stock-guard');
 for(const f of ['71_api_v1_factory_stock_guard.gs','34_shipment_final_output_handlers.gs','35_shipment_document_renderer.gs','39_document_runtime_service.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+f,'utf8'),c);
 c.gapReadObjects_=(_ss,n)=>h.rows(n);
 h.sheet('warehouses',['warehouse_id','company','is_factory_warehouse','warehouse_type','is_active'],[{warehouse_id:'FACTORY-A',company:'KM',is_factory_warehouse:true,warehouse_type:'factory',is_active:true}]);
 const skus=h.rows('sku_details');h.sheet('sku_details',h.tables.sku_details.grid[0],skus.concat({...skus[0],sku:'C',series}));
 h.sheet('marketplace_skus',h.tables.marketplace_skus.grid[0],h.rows('marketplace_skus').concat({company:'KM',country:'US',marketplace:'Shopify',sku:'C',marketplace_sku_status:'active'}));
 h.sheet('factory_stock',h.tables.factory_stock.grid[0],['A','B','C'].map(sku=>({factory_stock_id:'F-'+sku,warehouse_id:'FACTORY-A',sku,fac_current_stock:100,fac_reserved_stock:0})));
 h.sheet('shipping_allocation_drafts',['allocation_draft_id']);h.sheet('shipping_allocation_draft_lines',['allocation_draft_line_id']);h.sheet('marketplaces',['marketplace_id']);
 return h;
}
function body(){return {request_id:'WDL-EXTRA-NEW-SKU-0001',shipping_plan_id:'P1',expected_plan_updated_at:stamp,packing_version:pack.VERSION,mixed_cartons:[{id:'EXTRA',representative_sku:'A',members:[{sku:'A',quantity:5},{sku:'C',quantity:3}]}],
 line_edits:[{op:'update',shipping_plan_line_id:'A',quantity:45,expected_updated_at:stamp},{op:'update',shipping_plan_line_id:'B',quantity:40,expected_updated_at:stamp},{op:'add',sku:'C',quantity:3}]};}
test('new site SKU plus extra mixed pieces preserves original whole cartons; actual stock guard, journal and replay',()=>{
 const h=world(),before=JSON.stringify(h.rows('factory_stock')),r=h.call(body());assert.equal(r.success,true,JSON.stringify(r));
 const lines=h.rows('shipping_plan_lines'),bySku=Object.fromEntries(lines.map(l=>[l.sku,l]));assert.deepEqual(lines.map(l=>[l.sku,l.approved_qty]),[['A',45],['B',40],['C',3]]);
 const layout=pack.layout(h.c.mcpRecords_(lines,'plan'));assert.equal(layout.physicalCartons,3);assert.deepEqual(layout.blocks.map(b=>[b.mixed,b.rows.map(r=>[r.sku,r.quantity])]),[[true,[['A',5],['C',3]]],[false,[['A',40]]],[false,[['B',40]]]]);
 assert.equal(JSON.stringify(h.rows('factory_stock')),before);assert(bySku.C.shipping_plan_line_id);assert.equal(h.call(body()).replayed,true);assert.equal(h.rows('shipping_plan_lines').length,3);
});
for(const differentSeries of [false,true])test('actual Plan to Shipment DB handoff and factory/CI/PL/Booking model with new SKU, different Series='+differentSeries,()=>{
 const h=world(differentSeries?'S2':'S1'),c=h.c;assert(h.call(body()).success);h.put('shipping_plans','shipping_plan_id','P1','status','approved');
 h.sheet('shipments',c.SHIPMENTS_HEADERS_);h.sheet('shipment_lines',c.SHIPMENT_LINES_HEADERS_);c.shipDestinationDraftGate_=()=>null;c.sc13TryLocked_=()=>null;c.PropertiesService={getScriptProperties:()=>({getProperty:()=>null})};
 const out=c.createShipmentFromApprovedPlan_(h.ss,'P1','test');assert.equal(out.created,true,JSON.stringify(out));
 const lines=h.rows('shipment_lines');assert.deepEqual(lines.map(l=>[l.sku,l.shipment_qty]),[['A',45],['B',40],['C',3]]);assert.equal(c.mcpShipment_(h.ss,out.shipment_id).physicalCartons,3);
 assert.deepEqual(h.rows('factory_stock').map(l=>[l.sku,l.fac_reserved_stock]),[['A',45],['B',40],['C',3]]);
 const snapshot={header:{shipment_id:out.shipment_id,snapshot_id:'SNAP',shipper_legal_name:'Factory',consignee_name:'Warehouse'},readiness:{shipping_detail:{status:'READY'},packing_list:{status:'READY'},commercial_invoice:{status:'READY'}},po_lineage:[],lines:lines.map(l=>({...l,cbm:l.shipment_carton_cbm,declared_currency:'USD',declared_unit_value:2,hs_code:'8509',country_of_origin:'CN'}))};
 for(const family of ['SHIPDETAIL','CI','PL','BOOKING']){const m=c.docRenderByClass_(family,snapshot);assert.equal(m.ok,true,JSON.stringify(m));assert.equal(m.header.totals.qty,88);assert.equal(m.header.totals.cartons,3);
   const mixed=m.lines.filter(l=>l.packing_group_id&&!l.packing_group_id.startsWith('ORDINARY:'));
   if(family==='SHIPDETAIL')assert.equal(m.lines.length,4);else assert.equal(m.lines.length,differentSeries?4:3);
   assert.equal(m.lines.reduce((sum,l)=>sum+Number(l.shipment_qty||l.quantity||l.qty||0),0),88);
 }
});
test('insufficient stock and foreign site SKU cannot use mixed packing to bypass admission',()=>{
 const h=world();h.put('factory_stock','sku','C','fac_current_stock',2);const r=h.call(body());assert.equal(r.success,false);assert.match(JSON.stringify(r),/WEEKLY_STOCK_INSUFFICIENT/);assert.equal(h.rows('shipping_plan_lines').length,2);
 const other=world();other.put('marketplace_skus','sku','C','company','OTHER');assert.equal(other.call(body()).success,false);assert.equal(other.rows('shipping_plan_lines').length,2);
});
