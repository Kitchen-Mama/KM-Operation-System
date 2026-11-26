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

test('cancelled shipment history does not prevent Reject -> add/remove/quantity Save -> resubmit -> fresh shipment',()=>{
 const h=world(),c=h.c;
 // Restore the real ownership gate: the older packing fixture replaces it with an admission stub.
 vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/11_shipping_plan_handlers.gs','utf8'),c);
 vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs','utf8'),c);
 vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/32_shipment_line_allocation_handlers.gs','utf8'),c);
 h.sheet('shipment_line_allocations',c.SHIPMENT_LINE_ALLOCATIONS_HEADERS_,[]);
 c.fsgGatePlanTransition_=()=>({proceed:true,audit:null});
 let held=false;const lock={tryLock:()=>{held=true;return true;},hasLock:()=>held,releaseLock:()=>{held=false;}};c.LockService={getScriptLock:()=>lock};
 assert.equal(h.cancel().success,true);
 const transition=(kind,extra={})=>JSON.parse(c.handleUpdateShippingPlanStatus_({shipping_plan_id:'P1',transition:kind,expected_updated_at:h.rows('shipping_plans')[0].updated_at,actor:'fixture',...extra}).getContent());
 assert.equal(transition('reject',{rejected_reason:'Add another SKU'}).success,true);
 h.sheet('sku_details',h.tables.sku_details.grid[0],h.rows('sku_details').concat({...h.rows('sku_details')[0],sku:'C'}));
 h.sheet('marketplace_skus',h.tables.marketplace_skus.grid[0],h.rows('marketplace_skus').concat({...h.rows('marketplace_skus')[0],sku:'C'}));
 const stock=h.rows('factory_stock');h.sheet('factory_stock',h.tables.factory_stock.grid[0],stock.concat({...stock[0],factory_stock_id:'F-C',sku:'C',fac_reserved_stock:0}));
 c.KMFSG=require('../js/core/supply-planning-factory-stock-guard');
 vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/71_api_v1_factory_stock_guard.gs','utf8'),c);
 c.gapReadObjects_=(_ss,n)=>h.rows(n);
 h.sheet('warehouses',['warehouse_id','company','is_factory_warehouse','warehouse_type','is_active'],[{warehouse_id:'FACTORY-A',company:'KM',is_factory_warehouse:true,warehouse_type:'factory',is_active:true}]);
 h.sheet('shipping_allocation_drafts',['allocation_draft_id']);h.sheet('shipping_allocation_draft_lines',['allocation_draft_line_id']);h.sheet('marketplaces',['marketplace_id']);
 const lines=h.rows('shipping_plan_lines'),request={shipping_plan_id:'P1',expected_plan_updated_at:h.rows('shipping_plans')[0].updated_at,request_id:'WDL-CANCEL-REJECT-ADD-0001',line_edits:[
  {op:'update',shipping_plan_line_id:'A',quantity:60,expected_updated_at:lines.find(l=>l.sku==='A').updated_at},
  {op:'remove',shipping_plan_line_id:'B',expected_updated_at:lines.find(l=>l.sku==='B').updated_at},{op:'add',sku:'C',quantity:30}]};
 const saved=h.call(request);assert.equal(saved.success,true,JSON.stringify(saved));
 assert.deepEqual(h.rows('shipping_plan_lines').map(l=>[l.sku,l.approved_qty]),[['A',60],['C',30]]);
 const before=business(h);assert.equal(h.call(request).replayed,true);assert.equal(business(h),before);
 assert.equal(transition('submit').success,true);assert.equal(transition('approve').success,true);
 const fresh=h.rows('shipments').find(s=>s.shipment_id!==h.sid);assert(fresh);assert.equal(fresh.status,'draft');
 assert.deepEqual(h.rows('shipment_lines').filter(l=>l.shipment_id===fresh.shipment_id).map(l=>[l.sku,l.shipment_qty]),[['A',60],['C',30]]);
 assert.deepEqual(h.rows('factory_stock').map(s=>[s.sku,s.fac_reserved_stock]),[['A',60],['B',0],['C',30]]);
 assert.equal(h.rows('shipments').find(s=>s.shipment_id===h.sid).status,'cancelled');
});

test('cancel, reject, resubmit and approve creates fresh identities; approval and old cancel replays are harmless',()=>{
 const h=world(),c=h.c,old={...h.rows('shipments')[0]};
 // GAS retains one acquired script lock in an execution; nested tryLock has no effect.
 let held=false;const lock={tryLock:()=>{held=true;return true;},hasLock:()=>held,releaseLock:()=>{held=false;}};
 c.LockService={getScriptLock:()=>lock};
 c.fsgGatePlanTransition_=()=>({proceed:true,audit:null});
 const transition=(kind,extra={})=>JSON.parse(c.handleUpdateShippingPlanStatus_({shipping_plan_id:'P1',transition:kind,expected_updated_at:h.rows('shipping_plans')[0].updated_at,actor:'fixture',...extra}).getContent());
 assert.equal(h.cancel().success,true);
 assert.equal(transition('reject',{rejected_reason:'Revise shipping contents'}).success,true);
 assert.equal(h.rows('shipping_plans')[0].status,'draft');
 assert.equal(transition('submit').success,true);
 const approved=transition('approve');assert.equal(approved.success,true,JSON.stringify(approved));
 const fresh=h.rows('shipments').find(s=>s.shipment_id!==h.sid);assert(fresh,JSON.stringify(approved));
 for(const key of ['shipment_id','shipment_no','external_shipment_id'])assert.notEqual(fresh[key],old[key],key);
 assert.equal(fresh.status,'draft');assert.equal(h.rows('shipments').find(s=>s.shipment_id===h.sid).status,'cancelled');
 assert.equal(h.rows('shipping_plans')[0].transferred_shipment_id,fresh.shipment_id);
 const newLines=h.rows('shipment_lines').filter(l=>l.shipment_id===fresh.shipment_id),oldLines=h.rows('shipment_lines').filter(l=>l.shipment_id===h.sid);
 assert.equal(newLines.length,2);assert(newLines.every(l=>!oldLines.some(o=>o.shipment_line_id===l.shipment_line_id)));
 assert.deepEqual(h.rows('factory_stock').map(s=>[s.fac_current_stock,s.fac_reserved_stock]),[[100,40],[100,40]]);
 const before=business(h);assert.equal(transition('approve').success,true);assert.equal(business(h),before);
 assert.equal(h.cancel().data.outcome,'REUSED');assert.equal(business(h),before);
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
