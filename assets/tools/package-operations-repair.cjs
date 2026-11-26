'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'assets/specs/active/apps-script');
const names=['01_router.gs','02_core_sheet_db.gs','17b_carrier_rate_card_maintenance.gs','63_api_v1_system_health.gs'];
const out=path.join(root,'output/operations-repair-20261126/release'),dir=path.join(out,'AppsScript'),c=vm.createContext({}),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const sources=names.map(name=>({name,text:fs.readFileSync(path.join(base,name),'utf8')}));sources.forEach(f=>vm.runInContext(f.text,c,{filename:f.name}));
const p=JSON.parse(JSON.stringify(c.RTR_PRODUCTION_PROFILE_)),hash=p.policy_sha256;delete p.policy_sha256;assert.equal(hash,sha(JSON.stringify(p)));
for(const symbol of ['CORE_DB_BUILD_VERSION_','CRC_QUICK_BUILD_VERSION_']){
 assert.equal(p.module_stamps.find(m=>m.symbol===symbol).expected,c[symbol]);assert.equal(c.SYS_MODULE_BUILD_STAMPS_.find(m=>m.symbol===symbol).expected,c[symbol]);
}
fs.mkdirSync(dir,{recursive:true});const files=sources.map(f=>{fs.writeFileSync(path.join(dir,f.name),f.text);return {file:f.name,sha256:sha(f.text)};});
fs.copyFileSync(path.join(root,'docs/handoffs/OPERATIONS_REPAIR_20261126.md'),path.join(out,'README-ACCEPTANCE.md'));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({release:'OPS-REPAIR-20261126-V1',required_verified_base:'a753b9ab0a25e851102b7360b87a8a312db17846',policy_sha256:hash,files},null,2)+'\n');
console.log('OPERATIONS_REPAIR_PACKAGE_PASS files='+files.length+' path='+out);
