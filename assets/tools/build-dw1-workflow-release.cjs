'use strict';
// Apply the reviewed public-source delta to each environment's own immutable base. Never reads private GS.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),old=path.join(root,'output/ds1-service-20261122/release-2'),ad4=path.join(root,'output/ad4-codex-20261122/release-final');
const out=path.resolve(process.argv[2]||path.join(root,'output/dw1-workflow-20261122/release-5'));
const sourceDir='assets/specs/active/apps-script',read=p=>fs.readFileSync(p,'utf8'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const put=(p,x)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,x);},json=(p,x)=>put(p,JSON.stringify(x,null,2)+'\n');
const delta=['11_shipping_plan_handlers.gs','12_shipment_handlers.gs','34_shipment_final_output_handlers.gs','39_document_runtime_service.gs','71_api_v1_factory_stock_guard.gs'];
const symbols={ '11_shipping_plan_handlers.gs':'SP_BUILD_VERSION_', '12_shipment_handlers.gs':'SHIPMENT_BUILD_VERSION_', '34_shipment_final_output_handlers.gs':'SFO_BUILD_VERSION_', '71_api_v1_factory_stock_guard.gs':'FSG_BUILD_VERSION_'};
const front=['assets/js/api/operation-system-db-api.js','assets/js/app.js','assets/js/core/factory-availability-feedback.js','assets/js/pages/inventory-replenishment.js','assets/js/pages/shipping-plan.js','assets/js/pages/shipping-history.js'];
function list(dir,p=''){return fs.readdirSync(path.join(dir,p),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(e=>{if(/^(?:00_config|84_|\.env)|pin.*\.local/i.test(e.name))return [];assert(!e.isSymbolicLink());const n=p?p+'/'+e.name:e.name;return e.isDirectory()?list(dir,n):[n];});}
const match=(s,k)=>{const m=new RegExp('var\\s+'+k+'\\s*=\\s*[\'\"]([^\'\"]+)').exec(s);assert(m,k);return m[1];};
function replace(s,a,b){assert(s.includes(a),'missing '+a);return s.split(a).join(b);}
assert(!fs.existsSync(out),'Use a fresh output directory');
assert.equal(sha(fs.readFileSync(path.join(old,'INSTALL.sha256.txt'))),'42f54f60b188c4f751659e4d401f3835c34dca5066505cd21e34a4a58a162e89');
const rawPatch=cp.execFileSync('git',['diff','--no-ext-diff','--relative='+sourceDir,'--',...delta.map(f=>sourceDir+'/'+f)],{cwd:root,encoding:'utf8'});
// Rebuilding a fresh candidate after a local stamp mirror must not apply Production-only stamp hunks to Sandbox.
const stampNames=Object.values(symbols).concat('DGS_PRODUCTION_PROFILE_BUILD_VERSION_');
const patch=rawPatch.split(/(?=^diff --git )/m).filter(Boolean).map(block=>{const chunks=block.split(/(?=^@@ )/m),header=chunks.shift(),hunks=chunks.filter(h=>{
 const changed=h.split('\n').filter(l=>/^[+-](?![+-])/.test(l));return !changed.length||!changed.every(l=>stampNames.some(n=>new RegExp('^[+-]var '+n+'\\s*=').test(l)));
});return hunks.length?header+hunks.join(''):'';}).join('');assert(patch.length>0,'No public GS delta');
const report={build:'r6.9-dw1',base:'r6.8-ds1',no_schema_changes:true,no_live_data_writes:true,no_bundle_rebuild:true,first_submit_db_issue:'OPEN - owner report, not reproduced',environments:{}};
for(const env of ['Sandbox','Production']){
 const dst=path.join(out,'candidate',env),base=path.join(old,'candidate',env),g=path.join(dst,'apps-script');
 for(const f of list(path.join(base,'site')))put(path.join(dst,'site',f),fs.readFileSync(path.join(base,'site',f)));
 for(const f of front)put(path.join(dst,'site',f),fs.readFileSync(path.join(root,f)));
 for(const f of delta)put(path.join(g,f),fs.readFileSync(path.join(ad4,'candidate',env,'apps-script',f)));
 cp.execFileSync('git',['apply','--unsafe-paths','--whitespace=nowarn','--directory='+path.relative(root,g).replace(/\\/g,'/')],{cwd:root,input:patch});
 const stamps={};
 for(const f of delta){let s=read(path.join(g,f));const symbol=symbols[f]||(env==='Production'?'DGS_PRODUCTION_PROFILE_BUILD_VERSION_':'');if(symbol){const v=match(s,symbol);assert(!v.endsWith('-DW1'),'DW1 input already stamped');stamps[symbol]={old:v,next:v+'-DW1'};s=replace(s,v,v+'-DW1');put(path.join(g,f),s);}}
 let health=read(path.join(base,'apps-script/63_api_v1_system_health.gs')),hs=match(health,'SYS_BUILD_VERSION_');stamps.SYS_BUILD_VERSION_={old:hs,next:hs+'-DW1'};
 let router,policy;
 if(env==='Production'){router=read(path.join(base,'apps-script/01_router.gs'));const rs=match(router,'RTR_BUILD_VERSION_');stamps.RTR_BUILD_VERSION_={old:rs,next:rs+'-DW1'};}
 for(const {old:v,next} of Object.values(stamps)){if(health.includes(v))health=replace(health,v,next);if(router&&router.includes(v))router=replace(router,v,next);}
 put(path.join(g,'63_api_v1_system_health.gs'),health);
 if(router){const ctx={};vm.runInNewContext(router,ctx);policy=JSON.parse(JSON.stringify(ctx.RTR_PRODUCTION_PROFILE_));const prev=policy.policy_sha256,body={...policy};delete body.policy_sha256;policy.policy_sha256=sha(JSON.stringify(body));router=replace(router,prev,policy.policy_sha256);put(path.join(g,'01_router.gs'),router);const cfg=path.join(dst,'site/production-config.js');put(cfg,replace(read(cfg),prev,policy.policy_sha256));}
 let index=read(path.join(dst,'site/index.html'));
 for(const f of front.filter(f=>!f.endsWith('/inventory-replenishment.js'))){const re=new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\?v=[^\"\']+');assert(re.test(index),f);index=index.replace(re,f+'?v=r76-a2sad3-20261129-ds2-dw1');}
 if(policy)index=index.replace(/production-config.js\?v=[^"']+/,'production-config.js?v=r76-dw1-20261122');put(path.join(dst,'site/index.html'),index);
 const tag=env==='Production'?'prod':'sbx',oldName='expected-health-'+tag+'-ds1.json',newName='expected-health-'+tag+'-dw1.json';
 const expected=JSON.parse(read(path.join(old,'expected',oldName)));expected.build=report.build;expected.about='DW1 domestic workflow; synthetic regression verified, owner deployment and UAT required.';
 for(const a of [expected.register,expected.a_files,expected.changed_stamps_vs_fix2])for(const row of a||[])if(stamps[row.symbol])row.expected=stamps[row.symbol].next;
 if(policy){expected.production_gate.policy_sha256=policy.policy_sha256;expected.production_gate.gate_module_stamps=Object.fromEntries(policy.module_stamps.map(r=>[r.symbol,r.expected]));expected.client_config.policy_sha256=policy.policy_sha256;}
 json(path.join(out,'expected',newName),expected);
 let checker=read(path.join(old,'tools/check-'+tag+'-health-ds1.cjs'));checker=replace(checker,oldName,newName);checker=replace(checker,sha(fs.readFileSync(path.join(old,'expected',oldName))),sha(fs.readFileSync(path.join(out,'expected',newName))));put(path.join(out,'tools/check-'+tag+'-health-dw1.cjs'),checker.replace(/HEALTH_DS1/g,'HEALTH_DW1'));
 const gs=list(g);for(const f of gs)new vm.Script(read(path.join(g,f)),{filename:f});
 json(path.join(out,'expected/gs-dw1.'+env+'.json'),Object.fromEntries(gs.map(f=>[f,sha(Buffer.from(read(path.join(g,f)).replace(/\r\n/g,'\n')))])));
 report.environments[env]={stamps,gs_files:gs,site_files:list(path.join(dst,'site')).length,policy_sha256:policy&&policy.policy_sha256};
}
put(path.join(out,'expected/expected-health-prod-R0.json'),fs.readFileSync(path.join(old,'expected/expected-health-prod-R0.json')));
for(const f of ['PROD_HEALTH_COPY_A2.v2_1.js','SANDBOX_HEALTH_COPY_A2.v3_1.js'])put(path.join(out,'tools',f),fs.readFileSync(path.join(old,'tools',f)));
json(path.join(out,'RELEASE.json'),report);
put(path.join(out,'INSTALL.sha256.txt'),list(out).map(f=>sha(fs.readFileSync(path.join(out,f)))+' *'+f.replace(/ /g,'%20')).join('\n')+'\n');
// Shared repository publishes the Production public-source mirror only.
for(const f of report.environments.Production.gs_files)put(path.join(root,sourceDir,f),fs.readFileSync(path.join(out,'candidate/Production/apps-script',f)));
put(path.join(root,'production-config.js'),fs.readFileSync(path.join(out,'candidate/Production/site/production-config.js')));
put(path.join(root,'index.html'),fs.readFileSync(path.join(out,'candidate/Production/site/index.html')));
console.log('DW1_BUILD_OK '+out+'\nINSTALL_SHA256 '+sha(fs.readFileSync(path.join(out,'INSTALL.sha256.txt'))));
