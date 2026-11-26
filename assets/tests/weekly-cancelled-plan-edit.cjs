'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createWorld}=require('./helpers/order-mainline-world.cjs'),{parts}=require('./helpers/write-command-flight-world.cjs'),pack=require('../js/core/mixed-carton-packing'),stamp='2026-11-25 10:00:00';
const base=new Function('createWorld','pack','vm','fs','stamp',parts(fs.readFileSync('assets/tests/mixed-carton-command.test.cjs','utf8'),['world'])+';return world;')(createWorld,pack,vm,fs,stamp);
const cancelWorld=new Function('base','vm','fs','assert',parts(fs.readFileSync('assets/tests/shipment-return-review.test.cjs','utf8'),['world'])+';return world;')(base,vm,fs,assert);
function ready(){
 const h=cancelWorld(),c=h.c;
 for(const f of ['11_shipping_plan_handlers.gs','22_shipment_dispatch_handlers.gs','32_shipment_line_allocation_handlers.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+f,'utf8'),c);
 h.sheet('shipment_line_allocations',c.SHIPMENT_LINE_ALLOCATIONS_HEADERS_,[]);
 assert.equal(h.cancel().success,true);c.fsgGatePlanTransition_=()=>({proceed:true,audit:null});
 const p=h.rows('shipping_plans')[0];
 const r=JSON.parse(c.handleUpdateShippingPlanStatus_({shipping_plan_id:'P1',transition:'reject',expected_updated_at:p.updated_at,rejected_reason:'Revise contents',actor:'fixture'}).getContent());assert.equal(r.success,true,JSON.stringify(r));
 h.sheet('sku_details',h.tables.sku_details.grid[0],h.rows('sku_details').concat({...h.rows('sku_details')[0],sku:'C'}));
 h.sheet('marketplace_skus',h.tables.marketplace_skus.grid[0],h.rows('marketplace_skus').concat({...h.rows('marketplace_skus')[0],sku:'C'}));
 const stock=h.rows('factory_stock');h.sheet('factory_stock',h.tables.factory_stock.grid[0],stock.concat({...stock[0],factory_stock_id:'F-C',sku:'C',fac_reserved_stock:0}));
 c.KMFSG=require('../js/core/supply-planning-factory-stock-guard');vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/71_api_v1_factory_stock_guard.gs','utf8'),c);c.gapReadObjects_=(_ss,n)=>h.rows(n);
 h.sheet('warehouses',['warehouse_id','company','is_factory_warehouse','warehouse_type','is_active'],[{warehouse_id:'FACTORY-A',company:'KM',is_factory_warehouse:true,warehouse_type:'factory',is_active:true}]);
 h.sheet('shipping_allocation_drafts',['allocation_draft_id']);h.sheet('shipping_allocation_draft_lines',['allocation_draft_line_id']);h.sheet('marketplaces',['marketplace_id']);
 h.request=()=>({shipping_plan_id:'P1',expected_plan_updated_at:h.rows('shipping_plans')[0].updated_at,request_id:'WDL-RETURNED-ADD-000001',line_edits:[{op:'add',sku:'C',quantity:30}]});
 return h;
}
test('real returned/rejected Plan can add a site SKU and retry the committed request without writes',()=>{
 const h=ready(),req=h.request(),r=h.call(req);assert.equal(r.success,true,JSON.stringify(r));assert.equal(h.rows('shipping_plan_lines').find(l=>l.sku==='C').approved_qty,30);
 const before=h.writes();assert.equal(h.call(req).replayed,true);assert.equal(h.writes(),before);
});
test('released PO allocation history is retained without preventing an addition',()=>{
 const h=ready();h.sheet('shipment_line_allocations',h.tables.shipment_line_allocations.grid[0],[{shipment_line_allocation_id:'OLD-RELEASED',shipment_line_id:h.rows('shipment_lines')[0].shipment_line_id,allocation_status:'released',allocated_qty:40}]);
 assert.equal(h.call(h.request()).success,true);assert.equal(h.rows('shipment_line_allocations')[0].allocation_status,'released');
});
for(const [name,change,code]of[
 ['live shipment',h=>h.put('shipments','shipment_id',h.sid,'status','draft'),'SHIPMENT_EXISTS_FOR_PLAN'],
 ['handoff marker retained',h=>h.put('shipping_plans','shipping_plan_id','P1','transferred_shipment_id',h.sid),'PLAN_ALREADY_TRANSFERRED_TO_SHIPMENT'],
 ['missing cancellation stamp',h=>h.put('shipments','shipment_id',h.sid,'cancelled_at',''),'WEEKLY_CANCEL_STATE_UNPROVEN'],
 ['dispatch route evidence',h=>h.sheet('shipment_routes',['shipment_id'],[{shipment_id:h.sid}]),'WEEKLY_CANCEL_DISPATCH_EVIDENCE'],
 ['unreleased draft allocation',h=>h.sheet('shipment_line_allocations',h.tables.shipment_line_allocations.grid[0],[{shipment_line_allocation_id:'OLD-AL',shipment_line_id:h.rows('shipment_lines')[0].shipment_line_id,allocation_status:'draft',allocated_qty:40}]),'WEEKLY_CANCEL_ALLOCATION_UNRELEASED'],
 ['executed allocation',h=>h.sheet('shipment_line_allocations',h.tables.shipment_line_allocations.grid[0],[{shipment_line_allocation_id:'OLD-AL',shipment_line_id:h.rows('shipment_lines')[0].shipment_line_id,allocation_status:'executed',allocated_qty:40}]),'WEEKLY_CANCEL_ALLOCATION_UNPROVEN'],
 ['reservation books disagree',h=>h.put('factory_stock','sku','A','fac_reserved_stock',1),'WEEKLY_CANCEL_RESERVATION_UNPROVEN'],
 ['residual reservation with balanced books',h=>{const r=h.rows('factory_stock_movements').find(r=>r.sku==='A'&&r.movement_type===h.c.FSTX_MOV_RESERVE_RELEASE_);assert(r);h.put('factory_stock_movements','factory_stock_movement_id',r.factory_stock_movement_id,'qty',Number(r.qty)+1);h.put('factory_stock','sku','A','fac_reserved_stock',1);},'WEEKLY_CANCEL_RESERVATION_UNRELEASED'],
 ['insufficient new SKU stock',h=>h.put('factory_stock','sku','C','fac_current_stock',2),'WEEKLY_STOCK_INSUFFICIENT'],
 ['foreign site SKU',h=>h.put('marketplace_skus','sku','C','company','OTHER'),'WEEKLY_SKU_NOT_ACTIVE_AT_SITE']
])test(name+' is refused with a visible specific issue and zero writes',()=>{
 const h=ready();change(h);const before=h.writes(),r=h.call(h.request());assert.equal(r.success,false,JSON.stringify(r));assert.equal(r.code,'WEEKLY_LINES_VALIDATION_FAILED');assert.equal(r.issues[0].code,code,JSON.stringify(r));assert.equal(h.writes(),before);assert.equal(h.rows('shipping_plan_lines').some(l=>l.sku==='C'),false);
});
