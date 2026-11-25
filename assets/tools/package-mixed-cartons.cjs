'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'assets/specs/active/apps-script');
const names=['01_router.gs','11_shipping_plan_handlers.gs','12_shipment_handlers.gs','34_shipment_final_output_handlers.gs','35_shipment_document_renderer.gs','39_document_runtime_service.gs','63_api_v1_system_health.gs','80_api_v1_shipment_import.gs','83_api_v1_weekly_draft_lines.gs','90_generated_supply_planning_bundle.gs'];
const out=path.join(root,'output/mixed-cartons-20261125/release'),dir=path.join(out,'AppsScript'),c=vm.createContext({});
const source=names.map(name=>({name,text:fs.readFileSync(path.join(base,name),'utf8')}));
source.forEach(f=>vm.runInContext(f.text,c,{filename:f.name}));
const profile=JSON.parse(JSON.stringify(c.RTR_PRODUCTION_PROFILE_)),declared=profile.policy_sha256;delete profile.policy_sha256;
assert.equal(declared,crypto.createHash('sha256').update(JSON.stringify(profile)).digest('hex'));
for(const m of c.RTR_PRODUCTION_PROFILE_.module_stamps){if(c[m.symbol]!==undefined)assert.equal(c[m.symbol],m.expected,'Release module mismatch: '+m.symbol);}
assert.equal(c.KMPACK.VERSION,'MIXED_CARTONS_V1');
fs.mkdirSync(dir,{recursive:true});
const files=source.map(f=>{fs.writeFileSync(path.join(dir,f.name),f.text);return {file:f.name,sha256:crypto.createHash('sha256').update(f.text).digest('hex')};});
fs.copyFileSync(path.join(root,'docs/handoffs/MIXED_CARTONS_20261125.md'),path.join(out,'README-ACCEPTANCE.md'));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({release:'MIXED-CARTONS-20261125-V1',base_commit:'60719f79',policy_sha256:declared,bundle_source_hash:c.KM_BUNDLE_CONTENT_HASH_,files},null,2)+'\n');
console.log('MIXED_CARTONS_PACKAGE_PASS files='+files.length+' path='+out);
