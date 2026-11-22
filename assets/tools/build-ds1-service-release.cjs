'use strict';
// New delta package; AD3/c2 and AD4/c3 are immutable inputs. No remote writes or private sources.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'output/ad4-codex-20261122/release-final');
const out=path.resolve(process.argv[2]||path.join(root,'output/ds1-service-20261122/release-2'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
const json=(p,x)=>write(p,JSON.stringify(x,null,2)+'\n');
function files(d,p=''){return fs.readdirSync(path.join(d,p),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(e=>{
  if(/^(?:00_config|84_|\.env)|pin.*\.local/i.test(e.name))return[];
  assert(!e.isSymbolicLink());const n=p?p+'/'+e.name:e.name;return e.isDirectory()?files(d,n):[n];
});}
function replace(s,a,b){assert(s.includes(a),'missing anchor '+a.slice(0,90));return s.split(a).join(b);}
assert(!fs.existsSync(out),'Choose a fresh output directory');
assert.equal(sha(fs.readFileSync(path.join(base,'INSTALL.sha256.txt'))),'7d725eef1f5907a1bc0474c7d324270c0c66cc672f0fffd8c4351a310dd28070');
const frontend=['assets/js/core/method-registry.js','assets/js/api/operation-system-db-api.js'];
const report={build:'r6.8-ds1',base:'r6.7-ad4-codex-c3',no_schema_changes:true,no_master_data_writes:true,no_b8_merge:true,no_bundle_rebuild:true,
  sandbox_delta_gs:['60_api_v1_inventory_replenishment_workspace.gs','63_api_v1_system_health.gs'],
  production_delta_gs:['60_api_v1_inventory_replenishment_workspace.gs','63_api_v1_system_health.gs','01_router.gs'],environments:{}};
const stamp=sym=>new RegExp('var\\s+'+sym+'\\s*=\\s*[\'\"]([^\'\"]+)[\'\"]');
for(const env of ['Sandbox','Production']){
  const src=path.join(base,'candidate',env),dst=path.join(out,'candidate',env),stamps={};
  // A complete site copy, but ONLY the changed GS files, so copying this package cannot replace unrelated handlers.
  for(const f of files(path.join(src,'site')))write(path.join(dst,'site',f),fs.readFileSync(path.join(src,'site',f)));
  for(const f of frontend)write(path.join(dst,'site',f),fs.readFileSync(path.join(root,f)));
  const workspaceFile='60_api_v1_inventory_replenishment_workspace.gs';
  const ws=read(path.join(root,'assets/specs/active/apps-script',workspaceFile));
  stamps.SIR_BUILD_VERSION_={old:'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R56',next:stamp('SIR_BUILD_VERSION_').exec(ws)[1]};
  write(path.join(dst,'apps-script',workspaceFile),ws);
  let health=read(path.join(src,'apps-script/63_api_v1_system_health.gs'));
  const hs=stamp('SYS_BUILD_VERSION_').exec(health)[1];stamps.SYS_BUILD_VERSION_={old:hs,next:hs+'-DS1'};
  health=replace(health,hs,hs+'-DS1');
  health=replace(health,stamps.SIR_BUILD_VERSION_.old,stamps.SIR_BUILD_VERSION_.next);
  let policy;
  if(env==='Production'){
    let router=read(path.join(src,'apps-script/01_router.gs'));
    const rs=stamp('RTR_BUILD_VERSION_').exec(router)[1];stamps.RTR_BUILD_VERSION_={old:rs,next:rs+'-DS1'};
    for(const s of Object.values(stamps))router=replace(router,s.old,s.next);
    health=replace(health,rs,rs+'-DS1');
    const ctx={};vm.runInNewContext(router,ctx);policy=JSON.parse(JSON.stringify(ctx.RTR_PRODUCTION_PROFILE_));
    const old=policy.policy_sha256,body={...policy};delete body.policy_sha256;policy.policy_sha256=sha(JSON.stringify(body));
    router=replace(router,old,policy.policy_sha256);write(path.join(dst,'apps-script/01_router.gs'),router);
    const cfg=path.join(dst,'site/production-config.js');write(cfg,replace(read(cfg),old,policy.policy_sha256));
  }
  write(path.join(dst,'apps-script/63_api_v1_system_health.gs'),health);
  const ix=path.join(dst,'site/index.html');let index=read(ix);
  for(const f of [...frontend,...(env==='Production'?['production-config.js']:[])]){
    const re=new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\?v=([^\"\']+)');
    const m=re.exec(index);assert(m,'index asset '+f);index=replace(index,m[0],m[0]+'-ds1');
  }
  write(ix,index);
  const short=env==='Sandbox'?'sbx':'prod',oldExpected='expected-health-'+short+'-ad4.json',newExpected='expected-health-'+short+'-ds1.json';
  const expected=JSON.parse(read(path.join(base,'expected',oldExpected)));
  for(const arr of [expected.register,expected.a_files,expected.changed_stamps_vs_fix2])if(Array.isArray(arr))for(const r of arr)if(stamps[r.symbol])r.expected=stamps[r.symbol].next;
  expected.build=report.build;expected.about='DS1 service-only methods; local tests, Owner UAT pending.';
  if(policy){expected.production_gate.policy_sha256=policy.policy_sha256;expected.production_gate.gate_module_stamps=Object.fromEntries(policy.module_stamps.map(r=>[r.symbol,r.expected]));expected.client_config.policy_sha256=policy.policy_sha256;}
  json(path.join(out,'expected',newExpected),expected);
  let checker=read(path.join(base,'tools','check-'+short+'-health-ad4.cjs'));
  checker=replace(checker,oldExpected,newExpected);checker=replace(checker,sha(fs.readFileSync(path.join(base,'expected',oldExpected))),sha(fs.readFileSync(path.join(out,'expected',newExpected))));
  checker=checker.replace(/HEALTH_AD4/g,'HEALTH_DS1');
  write(path.join(out,'tools','check-'+short+'-health-ds1.cjs'),checker);
  const delta=env==='Sandbox'?report.sandbox_delta_gs:report.production_delta_gs;
  for(const f of delta)new vm.Script(read(path.join(dst,'apps-script',f)),{filename:f});
  const hashes=Object.fromEntries(delta.map(f=>[f,sha(Buffer.from(read(path.join(dst,'apps-script',f)).replace(/\r\n/g,'\n')))]));
  json(path.join(out,'expected','gs-ds1.'+env+'.json'),hashes);
  const siteList=files(path.join(dst,'site')).map(f=>sha(fs.readFileSync(path.join(dst,'site',f)))+' *site/'+f.replace(/ /g,'%20')).join('\n')+'\n';
  write(path.join(out,'expected','DS1.'+env+'.site.sha256.txt'),siteList);
  report.environments[env]={stamps,gs_files:delta.length,site_files:siteList.trim().split('\n').length,policy_sha256:policy&&policy.policy_sha256};
}
write(path.join(out,'expected/expected-health-prod-R0.json'),fs.readFileSync(path.join(base,'expected/expected-health-prod-R0.json')));
for(const f of ['PROD_HEALTH_COPY_A2.v2_1.js','SANDBOX_HEALTH_COPY_A2.v3_1.js'])write(path.join(out,'tools',f),fs.readFileSync(path.join(base,'tools',f)));
json(path.join(out,'RELEASE.json'),report);
write(path.join(out,'INSTALL.sha256.txt'),files(out).map(f=>sha(fs.readFileSync(path.join(out,f)))+' *'+f.replace(/ /g,'%20')).join('\n')+'\n');
console.log('DS1_BUILD_OK '+out+'\nINSTALL_SHA256 '+sha(fs.readFileSync(path.join(out,'INSTALL.sha256.txt'))));
