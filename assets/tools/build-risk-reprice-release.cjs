'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),src=path.join(root,'assets/specs/active/apps-script'),out=path.join(root,'output/risk-reprice-20261126');
const files=['01_router.gs','20_campaign_write_handlers.gs','63_api_v1_system_health.gs','83_api_v1_weekly_draft_lines.gs'];
const c=vm.createContext({}),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const name of files)vm.runInContext(fs.readFileSync(path.join(src,name),'utf8'),c,{filename:name});
const policy=JSON.parse(JSON.stringify(c.RTR_PRODUCTION_PROFILE_)),body={...policy};delete body.policy_sha256;
assert.equal(sha(JSON.stringify(body)),policy.policy_sha256);
for(const pins of [policy.module_stamps,c.SYS_MODULE_BUILD_STAMPS_])for(const symbol of ['WDL_BUILD_VERSION_','CAMPAIGN_BUILD_VERSION_'])assert.equal(pins.find(p=>p.symbol===symbol).expected,c[symbol]);
assert(fs.readFileSync(path.join(root,'production-config.js'),'utf8').includes(policy.policy_sha256));
fs.mkdirSync(out,{recursive:true});
const manifest={release:'risk-reprice-20261126-v2',weekly_build:c.WDL_BUILD_VERSION_,policy_sha256:policy.policy_sha256,no_live_writes:true,no_schema_changes:true,files:[]};
for(const name of files){const bytes=fs.readFileSync(path.join(src,name));fs.writeFileSync(path.join(out,name),bytes);manifest.files.push({name,sha256:sha(bytes)});}
fs.writeFileSync(path.join(out,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
fs.copyFileSync(path.join(root,'docs/deploy/RISK_REPRICE_20261126.md'),path.join(out,'README.md'));
console.log('RISK_REPRICE_PACKAGE_PASS '+out+' / '+files.length+' public GS files');
