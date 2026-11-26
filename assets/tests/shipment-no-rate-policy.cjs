'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {createEuWorld}=require('./helpers/shipment-import-eu-world.cjs');
function world(battery='rechargeable_lithium') {
 const h=createEuWorld('UK'),c=h.c;
 vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/17_carrier_handlers.gs','utf8'),c);
 vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/11_shipping_plan_handlers.gs','utf8'),c);
 c.shipmentTimestamp_=()=> '2026-11-26 16:00:00';
 c.Utilities.parseDate=s=>new Date(String(s).replace(' ','T')+'+08:00');
 h.sheet('carrier_rate_cards',c.CARRIER_RATE_CARDS_HEADERS_,[]);
 h.sheet('overseas_inventory_movements',[...h.tables.overseas_inventory_movements.grid[0],'movement_type','reference_id'],[]);
 h.sheet('sku_details',['sku','battery_type'],[{sku:'SKU',battery_type:battery}]);
 h.put('carrier_lead_times','carrier_id','CAR','last_mile_delivery','parcel');
 const ship={shipment_id:'S',status:'ready_to_ship',carrier_id:'CAR',shipping_method:'truck',last_mile_delivery:'parcel',country:'UK',marketplace:'Amazon',company:'ResUS',
  warehouse_code:'RESUS-FBA',destination_warehouse_id:'RESUS-FBA',source_warehouse_id:'FACTORY',updated_at:'2026-11-26 15:56:51',rate_card_id:'',rate_card_version:'',
  estimated_duty_currency:'',estimated_freight_cost:'',estimated_duty:'',estimated_customs_fee:'',estimated_total_cost:'',estimated_unit_cost:'',shipment_total_qty:40};
 h.sheet('shipments',[...new Set([...h.tables.shipments.grid[0],...Object.keys(ship)])],[ship]);
 h.sheet('shipment_lines',h.tables.shipment_lines.grid[0],[{shipment_id:'S',shipment_line_id:'L',sku:'SKU',shipment_qty:40}]);
 const lines=[{sku:'SKU',qty:40}],policy=()=>c.shipNoRatePolicy_(h.ss,h.rows('shipments')[0],lines,'2026-11-26');
 const options=()=>{const r=c.handleShipmentRateCardOptions_({shipment_id:'S'});return r.getContent?JSON.parse(r.getContent()):r;};
 return Object.assign(h,{ship,lines,policy,options});
}
for(const battery of ['no_battery','alkaline_battery','lithium_battery','rechargeable_lithium'])test(battery+' with no applicable quote can confirm cost pending; no quote or clearance is invented',()=>{
 const h=world(battery),before=h.writes(),r=h.options();assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.current.state,'COST_PENDING_AUTO',JSON.stringify(r));
 assert.equal(r.current.quote_state,'COST_PENDING');assert.equal(r.current.chosen,false);assert.equal(r.options.length,0);
 assert.equal(Boolean(r.current.cargo_notice),battery.includes('lithium'));
 const s=h.rows('shipments')[0],document=h.c.sfoRateCardLabel_(h.ss,s);assert.equal(document.ok,true,JSON.stringify(document));assert.equal(document.label,'Truck');assert.equal(document.pricing_state,'COST_PENDING_AUTO');
 assert.equal(h.writes(),before);assert.equal(s.estimated_freight_cost,'');assert.equal(s.estimated_total_cost,'');assert.equal(s.rate_card_version,'');
});
test('UK and GB spelling of the same route does not reject a declared service',()=>{
 const h=world();h.put('warehouses','warehouse_id','RESUS-FBA','country','GB');h.put('shipments','shipment_id','S','country','GB');assert.equal(h.policy().allowed,true,JSON.stringify(h.policy()));
});
for(const [name,change,reason]of[
 ['unknown battery',h=>h.put('sku_details','sku','SKU','battery_type','unknown'),'RATE_CARD_BATTERY_UNCLASSIFIED'],
 ['inactive carrier',h=>h.put('carriers','carrier_id','CAR','is_active',false),'CARRIER_INACTIVE'],
 ['missing last mile',h=>h.put('shipments','shipment_id','S','last_mile_delivery',''),'SHIPMENT_LAST_MILE_REQUIRED'],
 ['wrong service',h=>h.put('shipments','shipment_id','S','last_mile_delivery','courier'),'SERVICE_NOT_OFFERED_BY_CARRIER'],
 ['unknown carrier service',h=>{h.sheet('carrier_lead_times',h.tables.carrier_lead_times.grid[0],[]);h.sheet('shipment_route_templates',h.tables.shipment_route_templates.grid[0],[]);},'CARRIER_SERVICE_CAPABILITY_UNKNOWN'],
 ['selected card',h=>h.put('shipments','shipment_id','S','rate_card_id','RC'),'RATE_CARD_ALREADY_RECORDED'],
 ['pending selection',h=>h.put('shipments','shipment_id','S','rate_card_version','pending-unpriced'),'RATE_DECISION_RECORDED'],
 ['stale amount',h=>h.put('shipments','shipment_id','S','estimated_total_cost',10),'SAVED_COST_REQUIRES_REVIEW'],
 ['cancelled',h=>h.put('shipments','shipment_id','S','status','cancelled'),'SHIPMENT_NOT_EDITABLE']
])test(name+' remains blocked for its actual reason, not a generic missing-price error',()=>{
 const h=world();change(h);const before=h.writes(),p=h.policy();assert.equal(p.allowed,false);assert.equal(p.reason,reason,JSON.stringify(p));assert.equal(h.writes(),before);
});
test('an applicable lithium card cannot be silently skipped or replaced by a non-lithium quote',()=>{
 const h=world();h.sheet('carrier_rate_cards',h.c.CARRIER_RATE_CARDS_HEADERS_,[{rate_card_id:'LI',carrier_id:'CAR',origin_country:'CN',destination_country:'UK',shipping_method:'truck',last_mile_delivery:'parcel',status:'active',battery_type:'lithium_battery',effective_from:'2026-01-01'}]);
 assert.equal(h.policy().allowed,false);assert.equal(h.policy().reason,'APPLICABLE_RATE_AVAILABLE');
 h.put('carrier_rate_cards','rate_card_id','LI','battery_type','no_battery');assert.equal(h.policy().allowed,true);
});
test('service messages distinguish a healthy quote, automatic cost pending, TBA and actual eligibility refusals',()=>{
 const {parts}=require('./helpers/write-command-flight-world.cjs'),c=vm.createContext({});
 vm.runInContext(parts(fs.readFileSync('assets/js/pages/shipping-history.js','utf8'),['_shCostPendingMessage_']),c);
 assert.equal(c._shCostPendingMessage_({current:{state:'COMPLETE',cost_pending_reason:'RATE_CARD_ALREADY_RECORDED'}}),'');
 assert.match(c._shCostPendingMessage_({current:{state:'COST_PENDING_AUTO'}}),/confirmation can continue/);
 assert.match(c._shCostPendingMessage_({service:{carrier_state:'TO_BE_ASSIGNED'}}),/carrier to be assigned/);
 const assigned={service:{carrier_id:'CAR',carrier_state:'ASSIGNED'},unpriced_approval:{reason:'LITHIUM_CARRIER_CLEARANCE_REQUIRED'}};
 assert.match(c._shCostPendingMessage_(assigned),/LITHIUM_CARRIER_CLEARANCE_REQUIRED/);assert.doesNotMatch(c._shCostPendingMessage_(assigned),/Save a carrier/);
});
module.exports={world};
