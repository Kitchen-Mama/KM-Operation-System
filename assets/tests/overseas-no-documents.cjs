'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parts}=require('./helpers/write-command-flight-world.cjs'),{createEuWorld}=require('./helpers/shipment-import-eu-world.cjs');
const base=new Function('createEuWorld','vm','fs',parts(fs.readFileSync('assets/tests/shipment-no-rate-policy.cjs','utf8'),['world'])+';return world;')(createEuWorld,vm,fs);
const plain=x=>JSON.parse(JSON.stringify(x)),unwrap=x=>x.getContent?JSON.parse(x.getContent()):x;
function world(){
 const h=base('no_battery'),c=h.c;
 for(const f of ['05_overseas_inventory_handlers.gs','57_api_v1_shipment_workspace.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+f,'utf8'),c);
 h.sheet('shipment_plan_links',c.SC13_LINK_HEADERS_);
 h.put('warehouses','warehouse_id','RESUS-FBA','country','US');
 h.put('warehouses','warehouse_id','RESUS-3PL','country','US');
 h.put('marketplaces','company','ResUS','country','US');
 const ship={...h.rows('shipments')[0],source_warehouse_id:'RESUS-3PL',country:'US',external_shipment_id:'NO-DOCS',reference_id:'REF',etd:'2026-11-26',eta:'2026-11-28',shipment_total_cartons:1,final_output_validated_digest:''};
 h.sheet('shipments',[...new Set([...h.tables.shipments.grid[0],...Object.keys(ship)])],[ship]);
 const line={...h.rows('shipment_lines')[0],shipment_carton_qty:1,units_per_carton:40,carton_no_start:1,carton_no_end:1};
 h.sheet('shipment_lines',[...new Set([...h.tables.shipment_lines.grid[0],...Object.keys(line)])],[line]);
 h.sheet('overseas_inventory_snapshot',['overseas_inventory_id','warehouse_id','sku','wh_available_stock','wh_reserved_stock','wh_physical_stock','wh_damaged_stock','updated_at','updated_by','last_movement_at'],[{overseas_inventory_id:'OVS',warehouse_id:'RESUS-3PL',sku:'SKU',wh_available_stock:100,wh_reserved_stock:0,wh_physical_stock:100,wh_damaged_stock:0}]);
 h.sheet('overseas_inventory_movements',c.OVS_MOVEMENT_HEADERS_FOR_SHIPMENT_);
 c.ovsAcquireReservationTx_({snapSheet:h.tables.overseas_inventory_snapshot,movSheet:h.tables.overseas_inventory_movements,warehouseId:'RESUS-3PL',sku:'SKU',qty:40,ownerId:'S',journal:[],now:'2026-11-26 15:56:51',movementDate:'2026-11-26',createdBy:'fixture'});
 h.sheet('shipment_route_templates',h.tables.shipment_route_templates.grid[0],[]);
 h.put('carrier_lead_times','carrier_id','CAR','origin_country','US');h.put('carrier_lead_times','carrier_id','CAR','destination_country','US');
 let forbidden=0;
 const deny=()=>{forbidden++;throw Error('DOCUMENT/DRIVE ACCESS FORBIDDEN');};
 for(const name of ['dgsTemplates_','dofFolderIo_','dfoDefaultIo_','sfoBuildSnapshot_','sfoFinalizeWith_','docReadSnapshot_','dgsGeneratedFor_'])c[name]=deny;
 c.DriveApp=new Proxy({},{get:deny});
 return Object.assign(h,{forbidden:()=>forbidden,confirm:()=>unwrap(c.handleConfirmShipmentAndDispatch_({shipment_id:'S',expected_updated_at:'2026-11-26 15:56:51',route_mode:'MANUAL',actor:'fixture'}))});
}
test('real overseas Confirm consumes its reservation, commits Shipped and replays without document access',()=>{
 const h=world(),r=h.confirm();assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.data.status,'shipped');assert.equal(r.data.document_generation.status,'NOT_REQUIRED');
 assert.equal(h.rows('shipments')[0].final_output_validated_digest,'');
 const stock=h.rows('overseas_inventory_snapshot')[0];assert.equal(stock.wh_available_stock,60);assert.equal(stock.wh_reserved_stock,0);
 assert.equal(h.rows('overseas_inventory_movements').filter(x=>x.movement_type==='shipment_out').length,1);
 assert(h.rows('shipment_routes').length>=2);assert.equal(h.rows('shipment_events').length,1);assert.equal(h.forbidden(),0);
 const before=h.writes(),again=h.confirm();assert.equal(again.success,true,JSON.stringify(again));assert.equal(again.already_confirmed,true);assert.equal(again.data.document_generation.status,'NOT_REQUIRED');assert.equal(h.writes(),before);assert.equal(h.forbidden(),0);
});
test('all document entry points skip before templates, snapshots, registry, folder or renderer access',()=>{
 const h=world(),c=h.c;h.put('shipments','shipment_id','S','status','shipped');const before=h.writes();
 for(const run of [()=>c.dgsShipmentReadiness_(h.ss,'S'),()=>c.dgsFrozenValueGate_(h.ss,'S'),()=>c.dgsShipmentLeafPeek_(h.ss,'S'),()=>c.dgsGenerateShipmentDocuments_(h.ss,'S','fixture',{}),()=>unwrap(c.handleShipmentDocumentGenerate_({shipment_id:'S',document_type:'SHIPDETAIL',generate_file:true})),()=>unwrap(c.handleShipmentDocumentDiagnostic_({shipment_id:'S'}))])assert.equal(run().status,'NOT_REQUIRED');
 assert.equal(unwrap(c.handleDocumentRetry_({entity_type:'shipment',entity_id:'S'})).result.status,'NOT_REQUIRED');
 assert.equal(c.dgsEntityDocumentDtos_(h.ss,'shipment','S').documentGenerationStatus,'NOT_REQUIRED');assert.equal(h.writes(),before);assert.equal(h.forbidden(),0);
});
test('workspace uses already-read warehouse facts, does not offer document recovery, and preserves stored history',()=>{
 const h=world(),c=h.c,ship={...h.rows('shipments')[0],status:'shipped',final_output_validated_digest:'OLD'},history={S:[{document_id:'OLD',status:'failed',note:'old attempt'}]},before=JSON.stringify(history);
 const dto=c.shipWsDocumentsFor_(history,'S',ship,h.rows('warehouses'));assert.equal(dto.documentGenerationStatus,'NOT_REQUIRED');assert.equal(dto.canRetryDocuments,false);assert.equal(dto.documentGenerationError,null);assert.equal(dto.documents.length,0);assert.equal(JSON.stringify(history),before);
});
test('factory, unknown, blank and duplicated sources cannot claim the exemption',()=>{
 const h=world(),c=h.c,wh=h.rows('warehouses');
 for(const id of ['FACTORY','MISSING',''])assert.equal(c.dgsShipmentDocumentsRequired_(id,wh),true);
 assert.equal(c.dgsShipmentDocumentsRequired_('RESUS-3PL',wh),false);
 assert.equal(c.dgsShipmentDocumentsRequired_('RESUS-3PL',wh.concat(wh.filter(x=>x.warehouse_id==='RESUS-3PL'))),true);
 assert.equal(c.dgsShipmentDocumentsRequired_('X',[{warehouse_id:'X'}]),true);
 assert.equal(c.dgsShipmentDocumentsRequired_('X',[{warehouse_id:'X',warehouse_type:'FACTORY',is_factory_warehouse:false}]),true);
 h.put('shipments','shipment_id','S','source_warehouse_id','FACTORY');assert.throws(()=>c.dgsShipmentReadiness_(h.ss,'S'),/FORBIDDEN/);assert(h.forbidden()>0);
});
test('cancelled overseas shipments still refuse dispatch with zero writes',()=>{
 const h=world();h.put('shipments','shipment_id','S','status','cancelled');const before=h.writes(),r=h.confirm();assert.equal(r.success,false);assert.equal(r.code,'SHIPMENT_CANCELLED');assert.equal(h.writes(),before);assert.equal(h.forbidden(),0);
});
test('a client cannot exempt a factory shipment and its document failure remains zero-write',()=>{
 const h=world();h.put('shipments','shipment_id','S','source_warehouse_id','FACTORY');const before=h.writes();
 const r=unwrap(h.c.handleConfirmShipmentAndDispatch_({shipment_id:'S',documents_not_required:true,source_domain:'OVERSEAS',actor:'fixture'}));
 assert.equal(r.success,false);assert.equal(r.stage,'document_readiness');assert.equal(r.zero_write,true);assert.equal(h.writes(),before);assert.equal(h.rows('shipments')[0].status,'ready_to_ship');
});
test('overseas reservation inconsistency still blocks with no dispatch writes',()=>{
 const h=world();h.put('overseas_inventory_snapshot','overseas_inventory_id','OVS','wh_reserved_stock',0);const before=h.writes(),r=h.confirm();
 assert.equal(r.success,false);assert.equal(r.stage,'reservation_books');assert.equal(h.writes(),before);assert.equal(h.forbidden(),0);
});
test('an overseas-to-factory source change while acquiring the lock cannot retain the exemption',()=>{
 const h=world(),c=h.c,original=c.LockService.getScriptLock;let afterChange=0;
 c.LockService.getScriptLock=()=>{const lock=original();return {tryLock:ms=>{h.put('shipments','shipment_id','S','source_warehouse_id','FACTORY');afterChange=h.writes();return lock.tryLock(ms);},releaseLock:()=>lock.releaseLock()};};
 const r=h.confirm();assert.equal(r.success,false,JSON.stringify(r));assert.equal(r.code,'DOCUMENT_SOURCE_CHANGED');assert.equal(r.zero_write,true);assert.equal(h.writes(),afterChange);assert.equal(h.rows('shipments')[0].status,'ready_to_ship');
});
module.exports={world,unwrap,plain};
