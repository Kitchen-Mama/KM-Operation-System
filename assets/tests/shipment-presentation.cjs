'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {mapFunctions}=require('./helpers/map-amazon-receipt-world.cjs');
const {makeClient}=require('./helpers/write-command-flight-world.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
const c=vm.createContext({console});vm.runInContext(mapFunctions(['glmDisplayDate_']),c);
for(const [raw,expected] of [
 ['2026-11-26','2026-11-26'],['2026/11/6','2026-11-06'],['2026-11-26 23:59:58','2026-11-26'],
 ['2026-11-25T16:00:00.000Z','2026-11-26'],['2026-11-26T00:30:00+08:00','2026-11-26'],['2026-11-26T23:30:00-08:00','2026-11-27'],
 ['', ''],[null,''],['bad',''],['2026-02-30',''],['2026-02-30T00:00:00Z',''],['2026-11-26 25:00:00','']
])test('date-only display '+String(raw),()=>assert.equal(c.glmDisplayDate_(raw),expected));
const s=vm.createContext({console,Session:{getScriptTimeZone:()=> 'Asia/Taipei'},Utilities:{formatDate(d,tz){assert.equal(tz,'Asia/Taipei');return new Date(d.getTime()+8*3600000).toISOString().slice(0,19).replace('T',' ');}}});
vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/57_api_v1_shipment_workspace.gs','utf8'),s);
const source=(plan,sku,id,qty)=>'[SC13_SOURCE:'+encodeURIComponent(JSON.stringify({company:'ResUS',plan_id:plan,marketplace:'Amazon',sku,plan_line_id:id,qty}))+']';
const tables={shipments:[{shipment_id:'S1',shipping_plan_id:'P1',status:'in_transit',created_at:'2026-11-25 10:01:02',updated_at:'2026-11-26 10:11:12'},{shipment_id:'S2',shipping_plan_id:'P2',status:'in_transit'}, {shipment_id:'UNBOUND',status:'shipped'}],
 shipment_lines:[{shipment_id:'S1',shipment_line_id:'L1',shipping_plan_line_id:'PL1',sku:'A',shipment_qty:1,note:source('P1','A','PL1',1)},{shipment_id:'S1',shipment_line_id:'L2',shipping_plan_line_id:'PL2',sku:'B',shipment_qty:1,note:source('P3','B','PL2',1)}],
 shipping_plans:[{shipping_plan_id:'P1',created_at:new Date('2026-11-23T16:00:00Z'),private_note:'MUST NOT LEAVE READ'},{shipping_plan_id:'P2',created_at:'2026-11-22 10:02:03'},{shipping_plan_id:'P3',created_at:'2026-11-21 11:12:13'},{shipping_plan_id:'UNRELATED',created_at:'2026-10-01'}]};
test('plan creation metadata is opt-in and reads exact source plan dates, including consolidated lines',()=>{
 const before=JSON.stringify(tables),base=s.shipWorkspaceBuild_(tables,{}),data=s.shipWorkspaceBuild_(tables,{include:{planDates:true}});
 assert(base.shipments.every(x=>!('shippingPlanDates' in x)));
 const one=data.shipments.find(x=>x.shipmentId==='S1');assert.deepEqual(plain(one.shippingPlanDates),[{shippingPlanId:'P1',createdAt:'2026-11-24 00:00:00'},{shippingPlanId:'P3',createdAt:'2026-11-21 11:12:13'}]);
 assert.deepEqual(plain(data.shipments.find(x=>x.shipmentId==='UNBOUND').shippingPlanDates),[]);
 assert.equal(one.raw.created_at,'2026-11-25 10:01:02');assert.equal(one.raw.updated_at,'2026-11-26 10:11:12');
 assert(!JSON.stringify(data).includes('MUST NOT LEAVE READ'));assert(!JSON.stringify(data).includes('UNRELATED'));assert.equal(JSON.stringify(tables),before);
});
test('absent or duplicated plan identity is unknown, never the shipment creation time',()=>{
 const data=s.shipWorkspaceBuild_({...tables,shipping_plans:[tables.shipping_plans[0],tables.shipping_plans[0]]},{include:{planDates:true}});
 assert(data.shipments.find(x=>x.shipmentId==='S1').shippingPlanDates.every(p=>p.createdAt===''));
});
test('exact-shipment paging returns no other shipment plan metadata',()=>{
 const data=s.shipWorkspaceBuild_(tables,{filters:{shipmentId:'S2'},include:{planDates:true}});
 assert.equal(data.shipments.length,1);assert.deepEqual(plain(data.shipments[0].shippingPlanDates),[{shippingPlanId:'P2',createdAt:'2026-11-22 10:02:03'}]);
});
test('handler reads shipping_plans once only when requested',()=>{
 s.shipBuildEnvelope_=(ok,data,errors)=>({success:ok,data,errors});
 for(const requested of [false,true]){const calls=[];const out=s.handleShipmentWorkspaceGet_({payload:{include:{planDates:requested}}},{now:()=>0,openTarget:()=>({}),readTable:(_,name)=>{calls.push(name);return tables[name]||[];}});assert.equal(out.success,true);assert.equal(calls.filter(n=>n==='shipping_plans').length,requested?1:0);}
});
const client=makeClient(),db=client.DB,display=client.sb.window.KM.display;
test('adapter preserves exact plan metadata and full version timestamps',()=>{
 const data=s.shipWorkspaceBuild_(tables,{include:{planDates:true}}),model=db.adaptShipmentWorkspace(plain(data)),one=model.shipments.find(x=>x.shipmentId==='S1');
 assert.deepEqual(plain(one.shippingPlanDates),plain(data.shipments.find(x=>x.shipmentId==='S1').shippingPlanDates));assert.equal(one.updatedAt,'2026-11-26 10:11:12');
});
test('customs labels prefer explicit DB labels while canonical codes remain untouched',()=>{
 assert.equal(display.customsType('formal_customs'),'\u6b63\u5f0f\u5831\u95dc');
 assert.equal(display.customsType('formal_customs','Fixture DB label'),'Fixture DB label');
 assert.equal(display.customsType('formal_customs','formal_customs'),'\u6b63\u5f0f\u5831\u95dc');
 assert.equal(display.customsType('formal_customs','  '),'\u6b63\u5f0f\u5831\u95dc');
});
console.log('SHIPMENT_PRESENTATION_PASS '+passed+' live_requests=0');
