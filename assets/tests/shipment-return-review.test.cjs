'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createWorld}=require('./helpers/order-mainline-world.cjs'),{parts}=require('./helpers/write-command-flight-world.cjs'),pack=require('../js/core/mixed-carton-packing');
const stamp='2026-11-25 10:00:00';
const base=new Function('createWorld','pack','vm','fs','stamp',parts(fs.readFileSync('assets/tests/mixed-carton-command.test.cjs','utf8'),['world'])+';return world;')(createWorld,pack,vm,fs,stamp);
function world(){
 const h=base(),c=h.c;
 h.put('shipping_plans','shipping_plan_id','P1','status','approved');
 h.sheet('shipments',[...new Set([...c.SHIPMENTS_HEADERS_,'cancelled_by','cancelled_at','cancel_reason'])]);h.sheet('shipment_lines',c.SHIPMENT_LINES_HEADERS_);
 h.sheet('factory_stock',h.tables.factory_stock.grid[0],['A','B'].map(sku=>({factory_stock_id:'F-'+sku,warehouse_id:'FACTORY-A',sku,fac_current_stock:100,fac_reserved_stock:0})));
 c.shipDestinationDraftGate_=()=>null;c.sc13TryLocked_=()=>null;c.PropertiesService={getScriptProperties:()=>({getProperty:()=>null})};
 const created=c.createShipmentFromApprovedPlan_(h.ss,'P1','fixture');assert.equal(created.created,true,JSON.stringify(created));
 const sid=created.shipment_id;
 function cancel(){const s=h.rows('shipments').find(s=>s.shipment_id===sid);return JSON.parse(c.handleCancelShipmentDraft_({shipment_id:sid,expected_updated_at:s.updated_at,expected_status:s.status,reason:'Fixture cancellation',actor:'fixture'}).getContent());}
 return Object.assign(h,{sid,cancel});
}
function business(h){return JSON.stringify(['shipping_plans','shipments','factory_stock','factory_stock_movements','shipment_line_allocations','shipment_plan_links'].map(n=>h.tables[n]?h.rows(n):[]));}
test('actual cancellation returns plan to review and releases real reservations exactly once',()=>{
 const h=world();assert.deepEqual(h.rows('factory_stock').map(s=>s.fac_reserved_stock),[40,40]);
 const r=h.cancel();assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.data.plan_execution_commit,'PENDING_APPROVAL');
 assert.equal(r.data.reservation_released,80);assert.equal(h.rows('shipping_plans')[0].status,'pending_approval');
 assert.equal(h.rows('shipping_plans')[0].transferred_shipment_id,'');assert.equal(h.rows('shipments')[0].status,'cancelled');
 assert.deepEqual(h.rows('factory_stock').map(s=>[s.fac_current_stock,s.fac_reserved_stock]),[[100,0],[100,0]]);
 const before=business(h);assert.equal(h.cancel().data.outcome,'REUSED');assert.equal(business(h),before);
 // The ordinary approval handoff can now create a different draft; replaying the old cancel cannot undo it.
 h.put('shipping_plans','shipping_plan_id','P1','status','approved');
 const next=h.c.createShipmentFromApprovedPlan_(h.ss,'P1','fixture');assert.equal(next.created,true,JSON.stringify(next));assert.notEqual(next.shipment_id,h.sid);
 const again=business(h);assert.equal(h.cancel().data.outcome,'REUSED');assert.equal(business(h),again);
});
test('cancel refuses a changed review plan before releasing any reservation',()=>{
 const h=world();h.put('shipping_plans','shipping_plan_id','P1','status','draft');const before=business(h),r=h.cancel();
 assert.equal(r.success,false);assert.equal(r.code,'CANCEL_PLAN_REVIEW_UNPROVEN');assert.equal(r.zero_write,true);assert.equal(business(h),before);
});
test('a plan write failure rolls back shipment status, plan handoff and stock release',()=>{
 const h=world(),before=business(h);let failed=false;
 h.tables.shipping_plans.beforeWrite=({col})=>{if(!failed&&h.tables.shipping_plans.grid[0][col-1]==='status'){failed=true;throw Error('Injected review write failure');}};
 const r=h.cancel();assert.equal(failed,true);assert.equal(r.success,false);assert.equal(r.code,'CANCEL_ROLLED_BACK',JSON.stringify(r));assert.equal(business(h),before);
});
test('dispatched shipment remains non-cancellable',()=>{
 const h=world();h.put('shipments','shipment_id',h.sid,'status','shipped');const before=business(h),r=h.cancel();
 assert.equal(r.success,false);assert.equal(r.code,'SHIPMENT_ALREADY_DISPATCHED');assert.equal(business(h),before);
});
test('consolidated plans all return to review and their link audit is retained',()=>{
 const h=world(),c=h.c,plan=h.rows('shipping_plans')[0];
 h.sheet('shipping_plans',h.tables.shipping_plans.grid[0],[plan,{...plan,shipping_plan_id:'P2',status:'completed',completed_at:stamp,transferred_shipment_id:h.sid}]);
 h.sheet('shipment_plan_links',[...c.SC13_LINK_HEADERS_,'link_status','ended_at'],['P1','P2'].map((id,i)=>({shipment_plan_link_id:'LINK-'+i,shipment_id:h.sid,shipping_plan_id:id,created_at:stamp,link_status:'active'})));
 const r=h.cancel();assert.equal(r.success,true,JSON.stringify(r));assert.deepEqual(r.data.plans_returned_to_pending,['P1','P2']);
 assert(h.rows('shipping_plans').every(p=>p.status==='pending_approval'&&!p.transferred_shipment_id&&!p.completed_at));
 assert(h.rows('shipment_plan_links').every(l=>l.link_status==='cancelled'&&l.ended_at));
 assert.equal(r.data.reservation_released,80);
});
