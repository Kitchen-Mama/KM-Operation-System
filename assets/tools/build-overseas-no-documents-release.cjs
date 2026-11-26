'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),src=path.join(root,'assets/specs/active/apps-script'),out=path.join(root,'output/overseas-no-documents-20261126/gs');
const files=['01_router.gs','12_shipment_handlers.gs','22_shipment_dispatch_handlers.gs','36_document_template_handlers.gs','39_document_runtime_service.gs','57_api_v1_shipment_workspace.gs','63_api_v1_system_health.gs','83_api_v1_weekly_draft_lines.gs'];
const c=vm.createContext({}),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const name of files)vm.runInContext(fs.readFileSync(path.join(src,name),'utf8'),c,{filename:name});
const policy=JSON.parse(JSON.stringify(c.RTR_PRODUCTION_PROFILE_)),body={...policy};delete body.policy_sha256;assert.equal(sha(JSON.stringify(body)),policy.policy_sha256);
for(const name of ['SHIPMENT_BUILD_VERSION_','CSD_BUILD_VERSION_','DOCUMENT_LAYOUT_BUILD_VERSION_','DGS_PRODUCTION_PROFILE_BUILD_VERSION_','SHIP_WS_BUILD_VERSION_','WDL_BUILD_VERSION_'])for(const pins of [policy.module_stamps,c.SYS_MODULE_BUILD_STAMPS_])assert.equal(pins.find(p=>p.symbol===name).expected,c[name],name);
assert(fs.readFileSync(path.join(root,'production-config.js'),'utf8').includes(policy.policy_sha256));
assert.equal(c.dgsShipmentDocumentsRequired_('O',[{warehouse_id:'O',warehouse_type:'3PL',is_factory_warehouse:false}]),false);
assert.equal(c.dgsShipmentDocumentsRequired_('F',[{warehouse_id:'F',warehouse_type:'FACTORY',is_factory_warehouse:true}]),true);
fs.mkdirSync(out,{recursive:true});const manifest={release:'overseas-no-documents-20261126-v1',policy_sha256:policy.policy_sha256,no_schema_changes:true,no_live_business_writes:true,includes_previous_shipping_fixes:true,files:[]};
for(const name of files){const bytes=fs.readFileSync(path.join(src,name));fs.writeFileSync(path.join(out,name),bytes);manifest.files.push({name,sha256:sha(bytes)});}
fs.writeFileSync(path.join(out,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');fs.copyFileSync(path.join(root,'docs/deploy/OVERSEAS_NO_DOCUMENTS_20261126.md'),path.join(out,'README.md'));
console.log('OVERSEAS_NO_DOCUMENTS_PACKAGE_PASS '+out+' / '+files.length+' public GS files');
