'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'output/dw2-workflow-20261122/release-4'),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
let count=0;
for(const line of read('INSTALL.sha256.txt').trim().split(/\r?\n/)){const m=/^([a-f0-9]{64}) \*(.+)$/.exec(line);assert(m);const f=m[2].replace(/%20/g,' ');assert(!f.split(/[\\/]/).some(x=>/^(00_config|84_|\.env)|pin.*\.local/i.test(x)));assert.equal(sha(fs.readFileSync(path.join(root,f))),m[1],f);count++;}
const R=JSON.parse(read('RELEASE.json')),versions={};
for(const env of ['Sandbox','Production']){
 const tag=env==='Sandbox'?'sbx':'prod',v=versions[env]={},E=JSON.parse(read('expected/expected-health-'+tag+'-dw2.json'));
 for(const f of R.environments[env].gs_files){if(!f.endsWith('.gs'))continue;const s=read('candidate/'+env+'/apps-script/'+f);new vm.Script(s);for(const m of s.matchAll(/\bvar\s+(\w+)\s*=\s*['"]([^'"\r\n]*)['"]/g))v[m[1]]=m[2];}
 for(const row of E.register)if(v[row.symbol]!==undefined)assert.equal(v[row.symbol],row.expected,env+' '+row.symbol);
 for(const [symbol,s] of Object.entries(R.environments[env].stamps))assert.equal(v[symbol],s.next,env+' '+symbol);
 assert.equal(v.DFO_BUILD_VERSION_,'DW2-RENDERER-20261122');
 for(const f of R.sync_files)if(env==='Production')assert.equal(read('candidate/'+env+'/apps-script/'+f),fs.readFileSync(path.join('assets/specs/active/apps-script',f),'utf8'),f);
 const manifest=JSON.parse(read('candidate/'+env+'/apps-script/appsscript.json'));assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/drive'));
}
const ctx={};vm.createContext(ctx);vm.runInContext(read('candidate/Production/apps-script/01_router.gs'),ctx);
const p=JSON.parse(JSON.stringify(ctx.RTR_PRODUCTION_PROFILE_)),body={...p};delete body.policy_sha256;assert.equal(p.policy_sha256,sha(JSON.stringify(body)));
const w={};vm.runInNewContext(read('candidate/Production/site/production-config.js'),{window:w});const pub={...p};delete pub.module_stamps;delete pub.blocked;assert.deepEqual(JSON.parse(JSON.stringify(w.KM_PRODUCTION_CONFIG_)),pub);
const values={...Object.fromEntries(p.module_stamps.map(x=>[x.symbol,x.expected])),...versions.Production};
ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getId:()=> 'fixture'})};ctx.prodExpectedDbId_=()=> 'fixture';ctx.rtrSha256Hex_=()=>p.db_fp;ctx.requestOrderDraftV2FlatCutoverEnabled_=()=>true;ctx.sysGlobalValue_=s=>values[s];assert.equal(ctx.rtrProductionTargetCheck_(),null);
let guards=1;
for(const symbol of Object.keys(R.environments.Production.stamps).concat('DFO_BUILD_VERSION_')){const current=values[symbol];values[symbol]='stale';assert.equal(ctx.rtrProductionTargetCheck_().code,'PRODUCTION_MODULE_MISMATCH',symbol);values[symbol]=current;guards++;}
for(const action of ['document.diagnostic.shipment','shipment.documentValues.check','shipment.consolidationPolicy.save']){assert(p.allowed.includes(action));assert(!p.blocked.includes(action));assert.equal(ctx.rtrActionGate_(action,{}),null);}
for(const action of ['document.diagnostic.shipment','shipment.documentValues.check'])assert(p.reads.includes(action));
assert(!p.allowed.includes('factoryOperationConfig.save'));assert(!p.allowed.includes('automationSchedule.update'));
const checker=require(path.join(root,'tools/check-prod-health-dw2.cjs')),E=checker.load('final4'),capture={kind:'KM_PROD_HEALTH_SUMMARY_V2',captured_at:new Date().toISOString(),health_success:true,capabilities_success:true,deployment_release:E.deployment_release,mixed_deployment:false,stale_modules:[],absent_modules:[],modules:E.register.map(x=>({...x,present:true,declared:x.expected,matches:true})),production_gate:{...E.production_gate,bound_equals_constant:true,flat_v2:true,administration_enabled:false,ai_plan_enabled:false}};
assert.deepEqual(checker.check(capture,E,'final4').stops,[]);capture.production_gate.policy_sha256='old';assert(checker.check(capture,E,'final4').stops.length>0);
for(const f of ['index.html','production-config.js',...R.front_files])assert.equal(read('candidate/Production/site/'+f),fs.readFileSync(f,'utf8'),f);
for(const f of ['index.html','assets/js/app.js'])assert(read('candidate/Production/site/'+f).includes('dw2-20261122'));
const guard=read('candidate/Sandbox/site/sandbox-guard.js'),start=guard.lastIndexOf('})({'),end=guard.indexOf(', window);',start),config=JSON.parse(guard.slice(start+3,end));
for(const a of ['document.diagnostic.shipment','shipment.documentValues.check'])assert(config.reads[a]);
assert.equal(config.allow_sha256,sha(Buffer.from(' upsertShippingAllocationDraftAtomic submitAllocationDraftsToShippingPlans updateShippingPlanLineQty updateShippingPlanStatus updateShipment shipment.selectRateCard generateShipmentLineAllocations confirmShipmentAndDispatch shippingPlan.selectRateCard appendShippingPlanNote completeShippingPlan shipment.consolidationPolicy.save createShipmentFromPlan cancelShipmentDraft shipment.receipt.update shipment.removePlanFromConsolidated document.retry import.commit siteSku.planning.update shipment.eta.update shipment.route.advance shipment.assignCarrier ')));
console.log('DW2_VERIFIED files='+count+' guard='+guards+'/0 health_checker=2/0 delta_mirror=PASS private_files=NOT_READ live=NOT_RUN');
