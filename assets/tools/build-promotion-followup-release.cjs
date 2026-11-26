'use strict';
// Public delta only; never copy a complete Apps Script folder over an already deployed project.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),src=path.join(root,'assets/specs/active/apps-script'),out=path.join(root,'output/promotion-followup-20261126');
const files=['01_router.gs','20_campaign_write_handlers.gs','63_api_v1_system_health.gs'],ctx=vm.createContext({}),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const f of files)vm.runInContext(fs.readFileSync(path.join(src,f),'utf8'),ctx,{filename:f});
const policy=JSON.parse(JSON.stringify(ctx.RTR_PRODUCTION_PROFILE_)),copy={...policy};delete copy.policy_sha256;assert.equal(sha(JSON.stringify(copy)),policy.policy_sha256);
for(const list of [policy.module_stamps,ctx.SYS_MODULE_BUILD_STAMPS_])assert.equal(list.find(m=>m.symbol==='CAMPAIGN_BUILD_VERSION_').expected,ctx.CAMPAIGN_BUILD_VERSION_);
fs.mkdirSync(out,{recursive:true});
const manifest={release:'promo-ratio-20261126-v1',policy_sha256:policy.policy_sha256,campaign_build:ctx.CAMPAIGN_BUILD_VERSION_,no_live_writes:true,no_schema_changes:true,files:[]};
for(const name of files){const bytes=fs.readFileSync(path.join(src,name));fs.writeFileSync(path.join(out,name),bytes);manifest.files.push({name,sha256:sha(bytes)});}
fs.writeFileSync(path.join(out,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
fs.copyFileSync(path.join(root,'docs/deploy/PROMOTION_FOLLOWUP_20261126.md'),path.join(out,'README.md'));
console.log('PROMOTION_FOLLOWUP_PACKAGE_PASS '+out+' / '+files.length+' public GAS files / policy '+policy.policy_sha256);
