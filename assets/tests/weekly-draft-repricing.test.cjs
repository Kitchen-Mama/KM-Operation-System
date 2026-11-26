'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createWorld}=require('./helpers/order-mainline-world.cjs'),{parts}=require('./helpers/write-command-flight-world.cjs'),pack=require('../js/core/mixed-carton-packing');
const stamp='2026-11-25 10:00:00';
const base=new Function('createWorld','pack','vm','fs','stamp',parts(fs.readFileSync('assets/tests/mixed-carton-command.test.cjs','utf8'),['world'])+';return world;')(createWorld,pack,vm,fs,stamp);
function world(cards) {
 const h=base(),c=h.c;
 vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/17_carrier_handlers.gs','utf8'),c);
 c.shippingPlanToday_=()=> '2026-11-26';
 // Only tax authority is a fixture; rate matching, totals, exact quote and journal are the real owners.
 c.shippingTaxQuote_=(_ss,_lines,treatment,_country,_day,opts)=>({known:treatment==='included_in_rate',amount:treatment==='included_in_rate'?0:'',currency:opts.freightCurrency});
 c.shippingTaxNumber_=v=>v===''||v==null||!Number.isFinite(Number(v))?null:Number(v);
 c.shippingQuoteComplete_=q=>!!q.rateCardId&&q.estimatedFreightCost!==''&&q.estimatedDuty!=='';
 h.sheet('warehouses',['warehouse_id','warehouse_code','country'],[{warehouse_id:'FACTORY-A',warehouse_code:'FACTORY-A',country:'CN'}]);
 h.sheet('carriers',['carrier_id','carrier_name','status'],[{carrier_id:'C1',carrier_name:'Fixture Carrier',status:'active'}]);
 const details=h.rows('sku_details');h.sheet('sku_details',[...h.tables.sku_details.grid[0],'battery_type'],details.map(r=>({...r,battery_type:'no_battery'})));
 const rates=cards||[0,20].map(t=>({rate_card_id:'R'+t,carrier_id:'C1',origin_country:'CN',destination_country:'US',marketplace:'Shopify',
  shipping_method:'sea',shipping_method_label:'Sea',last_mile_delivery:'ups',charge_type:'weight',charge_unit:'kg',weight_tier:t,weight_tier_unit:'kg',
  dim_divisor:6000,min_box_weight:0,min_box_weight_unit:'kg',currency:'USD',unit_rate:5-t/100,customs_type:'self_customs',battery_type:'no_battery',
  import_duty_treatment:'included_in_rate',status:'active',effective_from:'2026-01-01',effective_to:''}));
 h.sheet('carrier_rate_cards',Object.keys(rates[0]||{rate_card_id:''}),rates);
 for(const [key,value] of Object.entries({carrier_id:'C1',shipping_method:'sea',last_mile_delivery:'ups',customs_type:'self_customs',currency:'USD',estimated_freight_cost:999,estimated_total_cost:999}))h.put('shipping_plans','shipping_plan_id','P1',key,value);
 h.c.wdlCheckStock_=()=>null; // This suite isolates quote mutation; mixed-carton-extra exercises the actual stock guard.
 return h;
}
function body(edits){return {shipping_plan_id:'P1',expected_plan_updated_at:stamp,request_id:'WDL-REPRICE-00000001',line_edits:edits};}
const update=(sku,q)=>({op:'update',shipping_plan_line_id:sku,quantity:q,expected_updated_at:stamp});
function business(h){return JSON.stringify([h.rows('shipping_plans'),h.rows('shipping_plan_lines')]);}
for(const [name,edits,weight,rate] of [
 ['quantity reduction',[update('A',0)],12,5],
 ['quantity increase',[update('A',120)],48,4.8],
 ['SKU removal',[{op:'remove',shipping_plan_line_id:'B',expected_updated_at:stamp}],12,5],
 ['SKU addition',[{op:'add',sku:'C',quantity:40}],36,4.8]
])test(name+' reprices the final contents without another carrier Save',()=>{
 const h=world();if(name==='SKU addition'){
  h.sheet('sku_details',h.tables.sku_details.grid[0],h.rows('sku_details').concat({...h.rows('sku_details')[0],sku:'C'}));
  h.sheet('marketplace_skus',h.tables.marketplace_skus.grid[0],h.rows('marketplace_skus').concat({...h.rows('marketplace_skus')[0],sku:'C'}));
 }
 const request=body(edits),r=h.call(request);assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.data.priced,true,JSON.stringify(r));
 assert.equal(r.data.pricing_recalculated,true);assert.equal(r.data.repricing_required,false);
 assert.equal(h.rows('shipping_plans')[0].estimated_freight_cost,Math.round(weight*rate*100)/100);
 assert.equal(h.rows('shipping_plans')[0].carrier_id,'C1');assert.equal(h.rows('shipping_plans')[0].last_mile_delivery,'ups');
 const saved=business(h);assert.equal(h.call(request).replayed,true);assert.equal(business(h),saved);
});
test('mixed packing uses one representative box, not both SKU carton weights',()=>{
 const h=world(),b=body(['A','B'].map(id=>update(id,40)));b.packing_version=pack.VERSION;
 b.mixed_cartons=[{id:'BOX',representative_sku:'B',members:[{sku:'A',quantity:40},{sku:'B',quantity:40}]}];
 const r=h.call(b);assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.data.priced,true);assert.equal(h.rows('shipping_plans')[0].estimated_freight_cost,60);
});
test('no applicable rate clears the old price and preserves the selected service',()=>{
 const h=world([]),r=h.call(body([update('A',20)]));assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.data.priced,false);assert.equal(r.data.unpriced_reason,'NO_APPLICABLE_CARD');
 assert.equal(h.rows('shipping_plans')[0].estimated_total_cost,'');assert.equal(h.rows('shipping_plans')[0].carrier_id,'C1');
});
test('ambiguous cards require a choice; they are never selected by array order',()=>{
 const h=world(),rates=h.rows('carrier_rate_cards');h.sheet('carrier_rate_cards',h.tables.carrier_rate_cards.grid[0],rates.concat({...rates[0],rate_card_id:'OTHER',last_mile_delivery:''}));
 const r=h.call(body([{op:'remove',shipping_plan_line_id:'B',expected_updated_at:stamp}]));assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.data.unpriced_reason,'CARD_CHOICE_REQUIRED');assert.equal(h.rows('shipping_plans')[0].estimated_total_cost,'');
});
test('a pricing write failure rolls back both SKU edits and previous quote',()=>{
 const h=world(),before=business(h);let failed=false;
 h.tables.shipping_plans.beforeWrite=({col})=>{if(!failed&&h.tables.shipping_plans.grid[0][col-1]==='estimated_freight_cost'){failed=true;throw Error('Injected pricing failure');}};
 const r=h.call(body([update('A',20)]));assert.equal(r.code,'IMPORT_FAILED_ROLLED_BACK',JSON.stringify(r));assert.equal(failed,true);assert.equal(business(h),before);
});
