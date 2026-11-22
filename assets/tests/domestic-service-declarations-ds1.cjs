'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const MR = require('../js/core/method-registry.js');
const db = {window:{KM:{DB:{}}}, console, localStorage:{getItem:()=>null,setItem(){}}};
vm.createContext(db);
vm.runInContext(fs.readFileSync('assets/js/api/operation-system-db-api.js','utf8'),db);
const adapt = data => db.window.KM.DB.adaptInventoryReplenishmentWorkspace(data);
const wh = (id, country, extra={}) => ({warehouse_id:id,warehouse_code:id,company:'ResUS',country,warehouse_type:'3PL',is_active:true,...extra});
const tmpl = (id,country,carrier='CAR_A',lm='parcel',extra={}) => ({route_template_id:id,origin_country:country,destination_country:country,carrier_id:carrier,transit_type:'truck',last_mile_delivery:lm,is_active:false,...extra});
const data = {warehouses:[wh('S','US'),wh('D','US',{warehouse_type:'FBA'}),wh('D3','US')],
  carriers:[{carrier_id:'CAR_A',is_active:'Active'},{carrier_id:'CAR_B',is_active:'Active'}],
  shipment_route_templates:[tmpl('SRT-DOM-A','US'),tmpl('SRT-DOM-B','US','CAR_B','truck')],carrier_rate_cards:[],carrier_lead_times:[]};
const clone=x=>JSON.parse(JSON.stringify(x));
const scope={company:'ResUS',country:'US',marketplace:'Amazon'};
const lane={sourceWarehouseId:'S',originCountry:'US',destinationCountry:'US',marketplace:'Amazon'};
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
function resolve(d=data,s=scope,r=lane){const reg=MR.create();reg.adopt(s,adapt(d));return reg.resolve(s,r,'2026-11-22');}
check('zero cards and zero lead times offer Truck, both last miles, no price or ETA',()=>{
  const r=resolve(),m=r.methods[0];assert.equal(r.status,'READY');assert.equal(m.value,'truck');
  assert.deepEqual(m.lastMileOptions,['parcel','truck']);assert.equal(m.priced,false);assert.deepEqual(m.pricedCarrierIds,[]);
  assert.equal(m.profiles.length,0);assert.equal(m.transitProfileCount,0);assert(!('avgDays'in m));
  assert.equal(r.pricing.available,false);assert.equal(m.carrierSelection,MR.DEFERRED_CARRIER_SELECTION);
});
for(const country of ['US','CA','UK','DE','AU','JP','FR']) for(const marketplace of ['Amazon','Shopify','Walmart']) {
  check(country+' / '+marketplace+' uses configured physical lane, no station hardcode',()=>{
    const d=clone(data);d.warehouses=[wh('S',country)];d.shipment_route_templates=[tmpl('SRT-DOM-A',country)];
    const r=resolve(d,{...scope,country,marketplace},{...lane,originCountry:country,destinationCountry:country,marketplace});
    assert.equal(r.status,'READY');assert.equal(r.methods[0].priced,false);
  });
}
check('EU planning scope lists DE only; it never grants DE to FR',()=>{
  const d=clone(data);d.warehouses=[wh('S','DE')];d.shipment_route_templates=[tmpl('SRT-DOM-DE','DE'),tmpl('SRT-DOM-FR','FR')];
  const r=resolve(d,{...scope,country:'EU'},{...lane,originCountry:'DE',destinationCountry:'EU'});
  assert.equal(r.status,'READY');assert.deepEqual(r.methods[0].destinationCountries,['DE']);
  assert.equal(resolve(d,{...scope,country:'FR'},{...lane,originCountry:'DE',destinationCountry:'FR'}).methods.length,0);
});
const negative = [
  ['US to CA',d=>d,r=>({...r,destinationCountry:'CA'})],
  ['factory source',d=>{d.warehouses[0].warehouse_type='FACTORY';return d;}],
  ['factory flag',d=>{d.warehouses[0].is_factory_warehouse=true;return d;}],
  ['inactive source',d=>{d.warehouses[0].is_active=false;return d;}],
  ['foreign company',d=>{d.warehouses[0].company='KM';return d;}],
  ['duplicate source',d=>{d.warehouses.push(d.warehouses[0]);return d;}],
  ['unknown source',d=>d,r=>({...r,sourceWarehouseId:'missing'})],
  ['forged origin',d=>d,r=>({...r,originCountry:'DE',destinationCountry:'DE'})],
  ['inactive carriers',d=>{d.carriers.forEach(c=>c.is_active=false);return d;}],
  ['duplicate carriers',d=>{d.carriers=d.carriers.concat(clone(d.carriers));return d;}],
  ['missing carriers',d=>{d.carriers=[];return d;}],
  ['duplicate templates',d=>{d.shipment_route_templates=d.shipment_route_templates.concat(clone(d.shipment_route_templates));return d;}],
  ['EU row grants nothing',d=>{d.shipment_route_templates.forEach(t=>{t.origin_country='EU';t.destination_country='EU';});return d;}],
  ['blank row country grants nothing',d=>{d.shipment_route_templates.forEach(t=>t.origin_country='');return d;}],
  ['inactive unrelated template',d=>{d.shipment_route_templates.forEach(t=>t.route_template_id=t.route_template_id.replace('SRT-DOM-','OTHER-'));return d;}],
  ['wrong source binding',d=>{d.shipment_route_templates.forEach(t=>t.origin_warehouse_id='other');return d;}],
  ['regional template cannot widen',d=>{d.shipment_route_templates.forEach(t=>t.destination_region='WEST');return d;}],
  ['customs template not a domestic declaration',d=>{d.shipment_route_templates.forEach(t=>t.customs_type='formal_customs');return d;}],
  ['unclassified battery',d=>d,r=>({...r,batteryType:'unclassified'})],
  ['unknown destination code',d=>d,r=>({...r,destinationWarehouseCode:'missing'})],
  ['duplicate destination',d=>{d.warehouses.push(d.warehouses[1]);return d;},r=>({...r,destinationWarehouseCode:'D'})],
  ['wrong destination country',d=>{d.warehouses[1].country='CA';return d;},r=>({...r,destinationWarehouseCode:'D'})],
  ['logical WFS remains blocked',d=>{d.warehouses[1].marketplace='Walmart';return d;},r=>({...r,destinationWarehouseCode:'D'})]
];
for(const [name,change,route] of negative)check(name,()=>assert.equal(resolve(change(clone(data)),scope,route?route(lane):lane).methods.length,0));
check('real FBA and approved US 3PL destinations',()=>{
  assert.equal(resolve(data,scope,{...lane,destinationWarehouseCode:'D'}).status,'READY');
  assert.equal(resolve(data,scope,{...lane,destinationWarehouseCode:'D3'}).status,'READY');
});
check('non-US 3PL transfer not opened',()=>{
  const d=clone(data);d.warehouses=d.warehouses.map(w=>({...w,country:'CA'}));d.shipment_route_templates=[tmpl('SRT-DOM-A','CA')];
  assert.equal(resolve(d,{...scope,country:'CA'},{...lane,originCountry:'CA',destinationCountry:'CA',destinationWarehouseCode:'D3'}).methods.length,0);
});
check('all 54 inactive estimates affect neither methods nor transit',()=>{
  const d=clone(data);d.carrier_lead_times=Array.from({length:54},(_,i)=>({lead_time_id:'L'+i,carrier_id:'CAR_A',origin_country:'US',destination_country:'US',shipping_method:'truck',last_mile_delivery:'parcel',avg_days:5,is_active:false}));
  assert.deepEqual(resolve(d),resolve(data));
});
check('priced international lane byte-equivalent before/after declarations',()=>{
  const d=clone(data);d.carrier_rate_cards=[{rate_card_id:'RC',carrier_id:'INTL',origin_country:'CN',destination_country:'US',shipping_method:'sea',status:'active'}];
  d.carrier_lead_times=[{lead_time_id:'L',carrier_id:'INTL',origin_country:'CN',destination_country:'US',shipping_method:'sea',last_mile_delivery:'truck',avg_days:30,is_active:true}];
  const r={...lane,originCountry:'CN'};const before=clone(d);before.shipment_route_templates=[];
  assert.deepEqual(resolve(d,scope,r),resolve(before,scope,r));
});
check('active card prevents borrowing disabled declarations for that carrier',()=>{
  const d=clone(data);d.carrier_rate_cards=[{rate_card_id:'RC',carrier_id:'CAR_A',origin_country:'CN',destination_country:'US',shipping_method:'sea',status:'active'}];
  assert.deepEqual(resolve(d).methods[0].carrierIds,['CAR_B']);
});
check('active transit profile unchanged when another unpriced last mile is added',()=>{
  const d=clone(data);d.carrier_lead_times=[{lead_time_id:'L',carrier_id:'CAR_A',origin_country:'US',destination_country:'US',shipping_method:'truck',last_mile_delivery:'parcel',avg_days:9,is_active:true}];
  const r=resolve(d);assert.equal(r.methods[0].profiles[0].avgDays,9);assert.equal(r.methods[0].transitProfileCount,1);
  assert.deepEqual(r.methods[0].lastMileOptions,['parcel','truck']);
});
check('the configured 18 templates retain seven Amazon lanes and US-only local carriers',()=>{
  const configured=JSON.parse(fs.readFileSync('output/route-db-hotfix-20261121/DOMESTIC_SEED_PLAN_20261121.json','utf8'));
  const headers=['route_template_id','route_template_name','route_version','origin_country','origin_warehouse_id','destination_country','destination_region','destination_warehouse_id','carrier_id','transit_type','last_mile_delivery','customs_type','priority','is_active','effective_from','effective_to','note','created_at','updated_at'];
  const d={carrier_rate_cards:[],carrier_lead_times:[],carriers:configured.carriers.map(r=>({carrier_id:r[0],is_active:r[16]})),
    shipment_route_templates:configured.templates.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])))};
  const server={console};vm.createContext(server);
  for(const f of ['22_shipment_dispatch_handlers.gs','12_shipment_handlers.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+f,'utf8'),server);
  server.KMCID=require('../js/core/supply-planning-country-identity.js');
  for(const country of ['US','CA','UK','DE','AU','JP','FR']){
    d.warehouses=[wh('S',country)];const r=resolve(d,{...scope,country},{...lane,originCountry:country,destinationCountry:country});
    const declarations=r.methods[0].serviceDeclarations;
    assert.equal(declarations.filter(x=>x.carrierId==='CAR_AMAZON_PARTNERED').length,2);
    assert.equal(declarations.length,country==='US'?6:2);
    const ss={getSheetByName:n=>{const rows=d[n]||[];const h=Array.from(new Set(rows.flatMap(Object.keys)));return{getDataRange:()=>({getValues:()=>[h,...rows.map(x=>h.map(k=>x[k]))]})};}};
    for(const dec of declarations)assert.equal(server.shipSvcCapabilityCheck_(ss,dec.carrierId,'truck',dec.lastMileDelivery,country,country),null);
  }
});
async function main(){
  const server={console};vm.createContext(server);
  vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs','utf8'),server);
  const baseline={console};vm.createContext(baseline);
  vm.runInContext(fs.readFileSync('output/ad4-codex-20261122/release-final/candidate/Production/apps-script/60_api_v1_inventory_replenishment_workspace.gs','utf8'),baseline);
  check('primary read is unchanged; declaration tables remain include-gated',()=>{
    assert.equal(JSON.stringify(server.sirWorkspaceBuild_(data,{})),JSON.stringify(baseline.sirWorkspaceBuild_(data,{})));
  });
  check('secondary read includes declarations verbatim and missing sheets are empty',()=>{
    const p={include:{carrierPlanning:true},only:['carriers','shipment_route_templates','warehouses','carrier_rate_cards','carrier_lead_times']};
    const r=server.sirWorkspaceBuild_(data,p);assert.equal(Object.keys(r.counts).length,5);assert.equal(r.shipment_route_templates[0].is_active,false);
    assert.equal(server.sirWorkspaceBuild_({},p).shipment_route_templates.length,0);
  });
  check('read revision echo from R56 is preserved',()=>{
    server.SIR_SRC_REV_='fixture-revision';assert.equal(server.sirBuildEnvelope_(true,{},[],{}).meta.sourceRevision,'fixture-revision');
  });
  let calls=0,payload;
  const win={KM:{DB:db.window.KM.DB,api:{getWorkspace:async (name,p)=>{calls++;payload=p;return{success:true,data};}}}};
  vm.runInNewContext(fs.readFileSync('assets/js/core/method-registry.js','utf8'),{window:win});
  const reg=win.KM.methodRegistry;
  await Promise.all(Array.from({length:20},()=>reg.ensureLoaded(scope)));
  check('one bounded catalogue read for twenty rows',()=>{assert.equal(calls,1);assert.equal(payload.only.length,5);assert(payload.only.includes('shipment_route_templates'));assert.equal(reg.resolve(scope,lane).status,'READY');});
  check('wrong station cannot use cached catalogue',()=>assert.equal(reg.resolve({...scope,company:'KM'},lane).status,'STALE_SCOPE'));
  const fail=MR.create({read:()=>({success:false,errors:[{code:'DENIED'}]})});await fail.ensureLoaded(scope);
  check('failed read remains ERROR with no declaration fallback',()=>assert.equal(fail.resolve(scope,lane).status,'ERROR'));
  console.log('DS1_TESTS_PASS '+count+' live=NOT_RUN private_files=NOT_READ');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
