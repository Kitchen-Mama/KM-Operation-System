'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parts}=require('./helpers/write-command-flight-world.cjs'),{createEuWorld}=require('./helpers/shipment-import-eu-world.cjs');
const base=new Function('createEuWorld','vm','fs',parts(fs.readFileSync('assets/tests/shipment-no-rate-policy.cjs','utf8'),['world'])+';return world;')(createEuWorld,vm,fs);
const unwrap=x=>x.getContent?JSON.parse(x.getContent()):x;
const overseas=new Function('base','vm','fs','unwrap',parts(fs.readFileSync('assets/tests/overseas-no-documents.cjs','utf8'),['world'])+';return world;')(base,vm,fs,unwrap);
function world(factory=false){
 const h=overseas(),c=h.c,properties={KM_SOURCE_REVISION:'REV-1'};let propertyWrites=0;
 vm.runInContext(parts(fs.readFileSync('assets/specs/active/apps-script/01_router.gs','utf8'),['kmSrcRevGet_'],['KM_SRC_REV_KEY_']),c);
 c.PropertiesService={getScriptProperties:()=>({getProperties:()=>({...properties}),setProperty(){propertyWrites++;throw Error('PROPERTY WRITE FORBIDDEN');},deleteProperty(){propertyWrites++;throw Error('PROPERTY WRITE FORBIDDEN');}})};
 if(factory){
  h.put('shipments','shipment_id','S','source_warehouse_id','FACTORY');
  h.sheet('factory_stock',h.tables.factory_stock.grid[0],[{factory_stock_id:'F',warehouse_id:'FACTORY',sku:'SKU',fac_current_stock:100,fac_reserved_stock:0}]);
  h.sheet('factory_stock_movements',h.tables.factory_stock_movements.grid[0]);
  c.factoryStockAcquireReservationTx_({stockSheet:h.tables.factory_stock,movSheet:h.tables.factory_stock_movements,warehouseId:'FACTORY',sku:'SKU',qty:40,ownerId:'S',journal:[],now:'2026-11-26 15:56:51',movementDate:'2026-11-26',createdBy:'fixture'});
  h.sheet('overseas_inventory_movements',h.tables.overseas_inventory_movements.grid[0]);h.put('overseas_inventory_snapshot','overseas_inventory_id','OVS','wh_available_stock',100);h.put('overseas_inventory_snapshot','overseas_inventory_id','OVS','wh_reserved_stock',0);
 }
 return Object.assign(h,{properties,propertyWrites:()=>propertyWrites,status:()=>unwrap(c.handleShipmentDispatchStatus_({shipment_id:'S'}))});
}
for(const factory of [false,true])test((factory?'factory':'overseas')+' safe retry is proven from real stock and reservation books without any writes',()=>{
 const h=world(factory),before=h.writes(),r=h.status();assert.equal(r.state,'NOT_DISPATCHED',JSON.stringify(r));assert.equal(r.safe_to_retry,true);assert.equal(r.source_revision,'REV-1');assert.equal(r.writes_performed,0);assert.equal(h.writes(),before);assert.equal(h.propertyWrites(),0);assert.equal(h.forbidden(),0);
});
test('a live writer retains the hold; a dead writer lease can expire without deleting any property',()=>{
 const h=world();h.properties.KM_SRC_PEND_TEST=String(Date.now());assert.equal(h.status().state,'IN_PROGRESS');
 h.properties.KM_SRC_PEND_TEST=String(Date.now()-11*60*1000);const before=JSON.stringify(h.properties),r=h.status();assert.equal(r.safe_to_retry,true,JSON.stringify(r));assert.equal(JSON.stringify(h.properties),before);assert.equal(h.propertyWrites(),0);
 h.properties.KM_SRC_PEND_TEST='invalid';assert.equal(h.status().state,'UNKNOWN');assert.equal(h.status().safe_to_retry,false);
});
for(const [name,mutate]of[
 ['stock-cell drift without a movement',h=>h.put('factory_stock','factory_stock_id','F','fac_current_stock',60)],
 ['reservation mismatch',h=>h.put('factory_stock','factory_stock_id','F','fac_reserved_stock',0)],
 ['source changed',h=>h.put('shipments','shipment_id','S','source_warehouse_id','MISSING')],
 ['changed quantities',h=>h.put('shipment_lines','shipment_line_id','L','shipment_qty',80)],
 ['blank version',h=>h.put('shipments','shipment_id','S','updated_at','')],
 ['historical row',h=>h.put('shipments','shipment_id','S','record_origin','IMPORT_HISTORICAL')],
 ['a leftover route',h=>h.tables.shipment_routes.appendRow(h.tables.shipment_routes.grid[0].map(k=>k==='shipment_id'?'S':''))],
 ['executed PO allocation',h=>h.tables.shipment_line_allocations.appendRow(h.tables.shipment_line_allocations.grid[0].map(k=>({shipment_line_id:'L',allocation_status:'executed',allocated_qty:40})[k]))]
])test(name+' never releases a pending Confirm',()=>{
 const h=world(true);mutate(h);const before=h.writes(),r=h.status();assert.equal(r.safe_to_retry,false,JSON.stringify(r));assert.equal(r.state,'REVIEW_REQUIRED');assert.equal(h.writes(),before);assert.equal(h.propertyWrites(),0);
});
test('missing evidence schema is unknown, never interpreted as empty evidence',()=>{
 const h=world();h.tables.shipment_events.grid[0][h.tables.shipment_events.grid[0].indexOf('shipment_id')]='missing';const r=h.status();assert.equal(r.safe_to_retry,false);assert.equal(r.reason,'DISPATCH_EVIDENCE_COLUMNS_MISSING');
});
test('revision changing during the read cannot authorize retry',()=>{
 const h=world(),original=h.c.kmSrcRevGet_;let n=0;h.c.kmSrcRevGet_=()=>++n===1?original():'REV-2';const r=h.status();assert.equal(r.reason,'SOURCE_CHANGED_DURING_CHECK');assert.equal(r.safe_to_retry,false);
});
test('a real committed dispatch is verified without attempting another dispatch or generating documents',()=>{
 const h=world();assert.equal(h.confirm().success,true);const before=h.writes(),r=h.status();assert.equal(r.state,'DISPATCHED',JSON.stringify(r));assert.equal(r.safe_to_retry,false);assert.equal(h.writes(),before);assert.equal(h.forbidden(),0);
});
module.exports={world,unwrap};
