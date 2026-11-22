'use strict';
// Generated public artifacts only. Each environment starts from its own frozen public sources.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {extract}=require('../tests/ad4/extract.cjs');
const root=path.resolve(__dirname,'../..'),source='assets/specs/active/apps-script';
const base=path.join(root,'output/dw1-workflow-20261122/release-5'),ad4=path.join(root,'output/ad4-codex-20261122/release-final'),ds1=path.join(root,'output/ds1-service-20261122/release-2');
const out=path.resolve(process.argv[2]||'output/dw2-workflow-20261122/release-4');
const read=f=>fs.readFileSync(f,'utf8'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const put=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,v);},json=(f,v)=>put(f,JSON.stringify(v,null,2)+'\n');
const delta=['11_shipping_plan_handlers.gs','12_shipment_handlers.gs','16_shipping_allocation_handlers.gs','39_document_runtime_service.gs'];
const symbols={'11_shipping_plan_handlers.gs':'SP_BUILD_VERSION_','12_shipment_handlers.gs':'SHIPMENT_BUILD_VERSION_','16_shipping_allocation_handlers.gs':'SAD_BUILD_VERSION_'};
const front=['assets/js/api/operation-system-db-api.js','assets/js/app.js','assets/js/core/factory-availability-feedback.js','assets/js/core/password-access.js','assets/js/pages/inventory-replenishment.js','assets/js/pages/shipping-history.js','assets/js/pages/shipment-grouping.js','assets/js/utils/inventory-compat.js'];
const renderer='37_shipment_document_file_renderer.gs',restored=['35_shipment_document_renderer.gs','36_document_template_handlers.gs','38_document_output_folder_resolver.gs'],sync=['01_router.gs',...delta,...restored,renderer,'63_api_v1_system_health.gs','appsscript.json'];
const privateName=n=>/^(?:00_config|84_|\.env)|pin.*\.local/i.test(n);
function list(dir,p=''){return fs.readdirSync(path.join(dir,p),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(e=>{if(privateName(e.name))return [];assert(!e.isSymbolicLink());const n=p?p+'/'+e.name:e.name;return e.isDirectory()?list(dir,n):[n];});}
function stamp(s,n){const m=new RegExp('var\\s+'+n+'\\s*=\\s*[\'\"]([^\'\"]+)').exec(s);assert(m,n);return m[1];}
function replace(s,a,b){assert(s.includes(a),'Missing '+a);return s.split(a).join(b);}
function variable(s,n){const p=extract(s,()=>false,k=>k===n)[0];assert(p,n);const ctx={};vm.runInNewContext(p.text,ctx);return {part:p,value:JSON.parse(JSON.stringify(ctx[n]))};}
function setVariable(s,n,value){const p=variable(s,n).part;return s.slice(0,p.start)+'var '+n+' = '+JSON.stringify(value,null,2)+';'+s.slice(p.end);}
assert(!fs.existsSync(out),'Use a fresh output directory');
assert.equal(sha(fs.readFileSync(path.join(base,'INSTALL.sha256.txt'))),'eaf3ffb0c0f6e90e2f7b0f7327730c84af7ab1c9115389629d0bc3eecc55ebe7');
const raw=cp.execFileSync('git',['diff','--no-ext-diff','--relative='+source,'--',...delta.map(f=>source+'/'+f)],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
const stampNames=Object.values(symbols).concat('DGS_BUILD_VERSION_','DGS_PRODUCTION_PROFILE_BUILD_VERSION_');
const patch=raw.split(/(?=^diff --git )/m).filter(Boolean).map(block=>{const chunks=block.split(/(?=^@@ )/m),head=chunks.shift(),hunks=chunks.filter(h=>{const lines=h.split('\n').filter(l=>/^[+-](?![+-])/.test(l));return !lines.length||!lines.every(l=>stampNames.some(n=>new RegExp('^[+-]var '+n+'\\s*=').test(l)));});return hunks.length?head+hunks.join(''):'';}).join('');
assert(patch.trim(),'No reviewed GS delta');
const report={build:'r6.10-dw2',base:'r6.9-dw1',sync_files:sync,front_files:front,no_live_data_writes:true,no_schema_changes:true,no_bundle_rebuild:true,uat:'OWNER_REQUIRED',environments:{}};
for(const env of ['Sandbox','Production']){
 const dst=path.join(out,'candidate',env),g=path.join(dst,'apps-script');
 for(const b of [ad4,ds1,base])for(const f of list(path.join(b,'candidate',env,'apps-script')))put(path.join(g,f),fs.readFileSync(path.join(b,'candidate',env,'apps-script',f)));
 if(env==='Sandbox'){
  // Stable modules omitted by the delta install: use the Sandbox base named by AD3's own tree builder.
  const stable='C:/Users/viczh/kmc/pkg/phase1-next-20261113/joint-afinal-ad2-build/atests/c2/r/tests/int-trees/m/P0T-S/apps-script';
  const pins={'36_document_template_handlers.gs':'badbfa07ac3bfe2581a044d8f602382f5daee62ba3226ae73cc263346d0555e1','38_document_output_folder_resolver.gs':'d38ba9b61708d0a44c38ac41da316234d836a21a34fe7a59309c7337acad46f9'};
  for(const [f,pin] of Object.entries(pins)){const text=read(path.join(stable,f));assert.equal(sha(Buffer.from(text.replace(/\r\n/g,'\n').trim())),pin);put(path.join(g,f),text);}
 }
 for(const f of list(path.join(base,'candidate',env,'site')))put(path.join(dst,'site',f),fs.readFileSync(path.join(base,'candidate',env,'site',f)));
 cp.execFileSync('git',['apply','--unsafe-paths','--whitespace=nowarn','--directory='+path.relative(root,g).replace(/\\/g,'/')],{cwd:root,input:patch});
 // Both reviewed AD3-c2 renderer bases are identical; no environment profile is imported with the restore.
 assert.equal(sha(Buffer.from(read(path.join(g,renderer)).replace(/\r\n/g,'\n').trim())),'e78c8f3a4cea1e659d3f14e59571d97cbf67f1d0273c5a126ef13dd605a84c64');
 put(path.join(g,renderer),fs.readFileSync(path.join(root,source,renderer)));
 put(path.join(g,'appsscript.json'),fs.readFileSync(path.join(root,source,'appsscript.json')));
 const stamps={};
 for(const f of delta){let s=read(path.join(g,f));const names=symbols[f]?[symbols[f]]:[env==='Production'?'DGS_PRODUCTION_PROFILE_BUILD_VERSION_':'DGS_BUILD_VERSION_'];for(const symbol of names){const v=stamp(s,symbol);assert(!v.endsWith('-DW2'));stamps[symbol]={old:v,next:v+'-DW2'};s=replace(s,v,v+'-DW2');}put(path.join(g,f),s);}
 let router=read(path.join(g,'01_router.gs')),health=read(path.join(g,'63_api_v1_system_health.gs'));
 for(const [name,s] of [['RTR_BUILD_VERSION_',router],['SYS_BUILD_VERSION_',health]]){const v=stamp(s,name);stamps[name]={old:v,next:v+'-DW2'};}
 for(const {old:v,next} of Object.values(stamps)){if(router.includes(v))router=replace(router,v,next);if(health.includes(v))health=replace(health,v,next);}
 for(const [action,handler] of [['document.diagnostic.shipment','handleShipmentDocumentDiagnostic_'],['shipment.documentValues.check','handleShipmentDocumentValuesCheck_']]){
  if(!new RegExp("['\"]"+action.replaceAll('.','\\.')+"['\"]\\s*:").test(router))router=router.replace(/(['"]shipment\.consolidationPolicy\.get['"]\s*:\s*handleShipmentConsolidationPolicyGet_,)/,'$1\n\''+action+'\': '+handler+',');
  assert(router.includes("'"+action+"': "+handler));
 }
 const rendererStamp={file:renderer,symbol:'DFO_BUILD_VERSION_',expected:'DW2-RENDERER-20261122',owns:'Drive renderer: workbook preflight, fill, PDF and read-only probe diagnostics'};
 let modules=variable(health,'SYS_MODULE_BUILD_STAMPS_').value;assert(!modules.some(x=>x.symbol===rendererStamp.symbol));modules.push(rendererStamp);health=setVariable(health,'SYS_MODULE_BUILD_STAMPS_',modules);
 let policy;
 if(env==='Production'){
  policy=variable(router,'RTR_PRODUCTION_PROFILE_').value;
  const extra=['document.diagnostic.shipment','shipment.documentValues.check','shipment.consolidationPolicy.save'];
  policy.allowed=[...new Set(policy.allowed.concat(extra))].sort();policy.reads=[...new Set(policy.reads.concat(extra.slice(0,2)))].sort();policy.blocked=policy.blocked.filter(a=>!extra.includes(a));
  policy.module_stamps.push({symbol:rendererStamp.symbol,expected:rendererStamp.expected,optional:false});
  const h={...policy};delete h.policy_sha256;policy.policy_sha256=sha(JSON.stringify(h));router=setVariable(router,'RTR_PRODUCTION_PROFILE_',policy);
  const configPath=path.join(dst,'site/production-config.js'),config=read(configPath),oldHash=variable(read(path.join(base,'candidate/Production/apps-script/01_router.gs')),'RTR_PRODUCTION_PROFILE_').value.policy_sha256;
  let publicConfig={...policy};delete publicConfig.module_stamps;delete publicConfig.blocked;
  const p=/(var c = )\{[\s\S]*?\n\};/.exec(config);assert(p,'public config shape');put(configPath,config.replace(p[0],p[1]+JSON.stringify(publicConfig,null,2)+';'));
  assert(!read(configPath).includes(oldHash));
 }
 put(path.join(g,'01_router.gs'),router);put(path.join(g,'63_api_v1_system_health.gs'),health);
 if(env==='Sandbox'){
  const guardPath=path.join(dst,'site/sandbox-guard.js'),guard=read(guardPath),start=guard.lastIndexOf('})({'),end=guard.indexOf(', window);',start);assert(start>=0&&end>start);
  const config=JSON.parse(guard.slice(start+3,end));
  config.reads['document.diagnostic.shipment']='rtrGetReadHandlers_';config.reads['shipment.documentValues.check']='rtrGetReadHandlers_';
  put(guardPath,guard.slice(0,start+3)+JSON.stringify(config)+guard.slice(end));
 }
 for(const f of front)put(path.join(dst,'site',f),fs.readFileSync(path.join(root,f)));
 const appFile=path.join(dst,'site/assets/js/app.js');let app=read(appFile);app=app.replace(/assets\/js\/pages\/inventory-replenishment\.js\?v=[^'"\s]+/g,'assets/js/pages/inventory-replenishment.js?v=r76-a2sad3-20261129-ds2-dw1-dw2-20261122').replace(/assets\/js\/pages\/shipment-grouping\.js\?v=[^'"\s]+/g,'assets/js/pages/shipment-grouping.js?v=r76-a2sad3-20261129-ds2-dw1-dw2-20261122');put(appFile,app);
 let index=read(path.join(dst,'site/index.html'));
 for(const f of front){const re=new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\?v=[^"\']+','g');index=index.replace(re,f+'?v=r76-a2sad3-20261129-ds2-dw1-dw2-20261122');}
 if(policy)index=index.replace(/production-config.js\?v=[^"']+/,'production-config.js?v=dw2-20261122');put(path.join(dst,'site/index.html'),index);
 if(env==='Sandbox')put(path.join(dst,'site/index.html'),index.replace('src="sandbox-guard.js"','src="sandbox-guard.js?v=dw2-20261122"'));
 const tag=env==='Production'?'prod':'sbx',oldName='expected-health-'+tag+'-dw1.json',newName='expected-health-'+tag+'-dw2.json',expected=JSON.parse(read(path.join(base,'expected',oldName)));
 expected.build=report.build;expected.about='DW2 document/workflow repair; owner authorization, deployment and UAT required.';
 for(const a of [expected.register,expected.a_files,expected.changed_stamps_vs_fix2])for(const row of a||[])if(stamps[row.symbol])row.expected=stamps[row.symbol].next;
 expected.register.push({...rendererStamp,optional:false});
 if(policy){expected.production_gate.policy_sha256=policy.policy_sha256;expected.production_gate.gate_module_stamps=Object.fromEntries(policy.module_stamps.map(r=>[r.symbol,r.expected]));expected.client_config.policy_sha256=policy.policy_sha256;}
 json(path.join(out,'expected',newName),expected);
 let checker=read(path.join(base,'tools/check-'+tag+'-health-dw1.cjs'));checker=replace(checker,oldName,newName);checker=replace(checker,sha(fs.readFileSync(path.join(base,'expected',oldName))),sha(fs.readFileSync(path.join(out,'expected',newName))));put(path.join(out,'tools/check-'+tag+'-health-dw2.cjs'),checker.replace(/HEALTH_DW1/g,'HEALTH_DW2'));
 const gs=list(g);for(const f of gs)if(f.endsWith('.gs'))new vm.Script(read(path.join(g,f)),{filename:f});
 report.environments[env]={stamps,gs_files:gs,policy_sha256:policy&&policy.policy_sha256};
}
put(path.join(out,'expected/expected-health-prod-R0.json'),fs.readFileSync(path.join(base,'expected/expected-health-prod-R0.json')));
for(const f of ['PROD_HEALTH_COPY_A2.v2_1.js','SANDBOX_HEALTH_COPY_A2.v3_1.js'])put(path.join(out,'tools',f),fs.readFileSync(path.join(base,'tools',f)));
put(path.join(out,'OWNER_STEPS.md'),read(path.join(root,'docs/planning/DW2_WORKFLOW_FIXES_20261122.md')));
json(path.join(out,'RELEASE.json'),report);
put(path.join(out,'INSTALL.sha256.txt'),list(out).map(f=>sha(fs.readFileSync(path.join(out,f)))+' *'+f.replace(/ /g,'%20')).join('\n')+'\n');
for(const f of sync)put(path.join(root,source,f),fs.readFileSync(path.join(out,'candidate/Production/apps-script',f)));
for(const f of ['index.html','production-config.js','assets/js/app.js'])put(path.join(root,f),fs.readFileSync(path.join(out,'candidate/Production/site',f)));
console.log('DW2_BUILD_OK '+out+'\nINSTALL_SHA256 '+sha(fs.readFileSync(path.join(out,'INSTALL.sha256.txt'))));
