'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createEuWorld,members}=require('./helpers/shipment-import-eu-world.cjs');
const {parts}=require('./helpers/write-command-flight-world.cjs');
const ui=vm.createContext({window:{KM:{countryIdentity:require('../js/core/supply-planning-country-identity')}}});
vm.runInContext(parts(fs.readFileSync('assets/js/pages/shipping-history.js','utf8'),['_shDestinationCountryOk_','_shSetMember15e_']),ui);
for(const country of members)test('picker, destination save, quote and document country agree for EU -> '+country,()=>{
 const h=createEuWorld(country),c=h.c;
 if(!c.dgsDestCountry15g_)vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/39_document_runtime_service.gs','utf8'),c);
 const before=h.writes(),fact={country:'EU',company:'ResUS',destination_warehouse_id:'',warehouse_id:'',warehouse_code:''};
 const headers=Object.keys(fact),sheet={col:k=>headers.indexOf(k)};
 assert.equal(ui._shDestinationCountryOk_(country,'EU'),true);
 assert.equal(c.csdShipmentDestinationCountryOk_(country,'EU'),true);
 const saved=c.shipDestAliasN01_(h.ss,sheet,headers.map(k=>fact[k]),{warehouse_id:'RESUS-FBA'});
 assert.equal(saved.refuse,undefined,JSON.stringify(saved));assert.equal(saved.target,'RESUS-FBA');
 assert.equal(c.shipRateDestination_(h.ss,{...fact,destination_warehouse_id:'RESUS-FBA'}).country,country);
 const docs=c.dgsDestCountry15g_(h.ss,{...fact,destination_warehouse_id:'RESUS-FBA'});
 assert.equal(docs.country,country);assert.equal(docs.unresolved,'');
 assert.equal(h.writes(),before);
});
for(const country of ['GB','UK','CH','NO','US','CN'])test('non-member '+country+' remains unavailable and refused',()=>{
 const h=createEuWorld(country),c=h.c;
 assert.equal(ui._shDestinationCountryOk_(country,'EU'),false);
 assert.equal(c.shipDestinationCountryOk_(country,'EU'),false);
 assert.throws(()=>c.shipRateDestination_(h.ss,{country:'EU',destination_warehouse_id:'RESUS-FBA'}),/RATE_DESTINATION_COUNTRY_MISMATCH/);
});
test('national scopes, company, activity, factory and duplicate destination guards are not widened',()=>{
 const h=createEuWorld(),c=h.c,fact={country:'DE',company:'ResUS',destination_warehouse_id:''},headers=Object.keys(fact),sheet={col:k=>headers.indexOf(k)};
 const save=()=>c.shipDestAliasN01_(h.ss,sheet,headers.map(k=>fact[k]),{warehouse_id:'RESUS-FBA'});
 assert.equal(ui._shDestinationCountryOk_('PL','DE'),false);assert.equal(save().refuse.code,'SHIPMENT_DESTINATION_COUNTRY_MISMATCH');
 fact.country='EU';fact.company='KM';assert.equal(save().refuse.code,'SHIPMENT_DESTINATION_COMPANY_MISMATCH');fact.company='ResUS';
 h.put('warehouses','warehouse_id','RESUS-FBA','is_active',false);assert.equal(save().refuse.code,'SHIPMENT_DESTINATION_INACTIVE');
 h.put('warehouses','warehouse_id','RESUS-FBA','is_active',true);h.put('warehouses','warehouse_id','RESUS-FBA','is_factory_warehouse',true);assert.equal(save().refuse.code,'SHIPMENT_DESTINATION_IS_FACTORY');
 h.put('warehouses','warehouse_id','RESUS-FBA','is_factory_warehouse',false);
 h.tables.warehouses.appendRow(h.tables.warehouses.grid.find(r=>r[0]==='RESUS-FBA').slice());assert.equal(save().refuse.code,'SHIPMENT_DESTINATION_AMBIGUOUS');
});
test('shipping does not expand frozen inventory or sales scope; missing destination rule fails closed',()=>{
 const h=createEuWorld(),c=h.c,K=ui.window.KM.countryIdentity;
 assert.deepEqual(K.planningSetMembers('EU'),['EU','DE','ES','IT','FR']);
 assert.deepEqual(K.sourceCountriesForScope('EU','Amazon').members,['IT','DE','ES','FR']);
 c.csdShipmentDestinationCountryOk_=undefined;assert.equal(c.shipDestinationCountryOk_('PL','EU'),false);
});
