'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),src=path.join(root,'assets/specs/active/apps-script'),out=path.join(root,'output/document-carton-order-20261126/gs');
const files=['01_router.gs','36_document_template_handlers.gs','39_document_runtime_service.gs','57_api_v1_shipment_workspace.gs','63_api_v1_system_health.gs'];
const c=vm.createContext({}),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const name of files)vm.runInContext(fs.readFileSync(path.join(src,name),'utf8'),c,{filename:name});
const policy=JSON.parse(JSON.stringify(c.RTR_PRODUCTION_PROFILE_)),body={...policy};delete body.policy_sha256;
assert.equal(sha(JSON.stringify(body)),policy.policy_sha256);
for(const name of ['DOCUMENT_LAYOUT_BUILD_VERSION_','DGS_PRODUCTION_PROFILE_BUILD_VERSION_','SHIP_WS_BUILD_VERSION_']){
 for(const pins of [policy.module_stamps,c.SYS_MODULE_BUILD_STAMPS_])assert.equal(pins.find(p=>p.symbol===name).expected,c[name],name);
}
assert(fs.readFileSync(path.join(root,'production-config.js'),'utf8').includes(policy.policy_sha256));
fs.mkdirSync(out,{recursive:true});
const manifest={release:'document-carton-order-20261126-v1',policy_sha256:policy.policy_sha256,no_schema_changes:true,no_business_writes:true,includes_document_recovery:true,files:[]};
for(const name of files){const bytes=fs.readFileSync(path.join(src,name));fs.writeFileSync(path.join(out,name),bytes);manifest.files.push({name,sha256:sha(bytes)});}
fs.writeFileSync(path.join(out,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
fs.copyFileSync(path.join(root,'docs/deploy/DOCUMENT_CARTON_ORDER_20261126.md'),path.join(out,'README.md'));
console.log('DOCUMENT_CARTON_ORDER_PACKAGE_PASS '+out+' / '+files.length+' public GS files');
