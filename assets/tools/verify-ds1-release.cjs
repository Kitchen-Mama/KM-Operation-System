'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'output/ds1-service-20261122/release-2');
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let checked=0;for(const line of read('INSTALL.sha256.txt').trim().split(/\r?\n/)){
  const m=/^([a-f0-9]{64}) \*(.+)$/.exec(line);assert(m);const rel=m[2].replace(/%20/g,' '),file=path.resolve(root,rel);
  assert(file.startsWith(root+path.sep));assert(!rel.split(/[\\/]/).some(n=>/^(?:00_config|84_|\.env)|pin.*\.local/i.test(n)));
  assert.equal(sha(fs.readFileSync(file)),m[1],rel);checked++;
}
const report=JSON.parse(read('RELEASE.json')),versions={};
for(const env of ['Sandbox','Production']){
  versions[env]={};const dir=path.join(root,'candidate',env,'apps-script');
  for(const f of fs.readdirSync(dir)){const source=read('candidate/'+env+'/apps-script/'+f);new vm.Script(source);
    for(const m of source.matchAll(/\bvar\s+(\w+)\s*=\s*['"]([^'"\r\n]*)['"]/g))versions[env][m[1]]=m[2];}
  const E=JSON.parse(read('expected/expected-health-'+(env==='Sandbox'?'sbx':'prod')+'-ds1.json'));
  for(const r of E.register)if(versions[env][r.symbol]!==undefined)assert.equal(versions[env][r.symbol],r.expected,env+' '+r.symbol);
  for(const r of Object.values(report.environments[env].stamps))assert(Object.values(versions[env]).includes(r.next));
}
const ctx={};vm.createContext(ctx);vm.runInContext(read('candidate/Production/apps-script/01_router.gs'),ctx);
const p=JSON.parse(JSON.stringify(ctx.RTR_PRODUCTION_PROFILE_)),body={...p};delete body.policy_sha256;assert.equal(sha(JSON.stringify(body)),p.policy_sha256);
const w={};vm.runInNewContext(read('candidate/Production/site/production-config.js'),{window:w});
const pub={...p};delete pub.module_stamps;delete pub.blocked;assert.deepEqual(JSON.parse(JSON.stringify(w.KM_PRODUCTION_CONFIG_)),pub);
const values={...Object.fromEntries(p.module_stamps.map(m=>[m.symbol,m.expected])),...versions.Production};
ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getId:()=> 'fixture'})};ctx.prodExpectedDbId_=()=> 'fixture';ctx.rtrSha256Hex_=()=>p.db_fp;
ctx.requestOrderDraftV2FlatCutoverEnabled_=()=>true;ctx.sysGlobalValue_=s=>values[s];assert.equal(ctx.rtrProductionTargetCheck_(),null);
for(const symbol of ['SIR_BUILD_VERSION_','SYS_BUILD_VERSION_','RTR_BUILD_VERSION_']){
  const current=values[symbol];values[symbol]=current.replace(/-DS1$/,'');assert.equal(ctx.rtrProductionTargetCheck_().code,'PRODUCTION_MODULE_MISMATCH');values[symbol]=current;
}
assert.equal(ctx.rtrProductionTargetCheck_(),null);
const checker=require(path.join(root,'tools/check-prod-health-ds1.cjs')),E=checker.load('final4');
const capture={kind:'KM_PROD_HEALTH_SUMMARY_V2',captured_at:new Date().toISOString(),health_success:true,capabilities_success:true,
  deployment_release:E.deployment_release,mixed_deployment:false,stale_modules:[],absent_modules:[],modules:E.register.map(x=>({...x,present:true,declared:x.expected,matches:true})),
  production_gate:{...E.production_gate,bound_equals_constant:true,flat_v2:true,administration_enabled:false,ai_plan_enabled:false}};
assert.deepEqual(checker.check(capture,E,'final4').stops,[]);
capture.production_gate.policy_sha256='stale';assert(checker.check(capture,E,'final4').stops.length>0);
for(const env of ['Sandbox','Production'])for(const f of ['assets/js/core/method-registry.js','assets/js/api/operation-system-db-api.js']){
  assert.equal(read('candidate/'+env+'/site/'+f).replace(/\r\n/g,'\n'),fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'));
}
console.log('DS1_VERIFIED files='+checked+' guard=5/0 health_checker=2/0 policy_mirror=PASS stamps=PASS live=NOT_RUN');
