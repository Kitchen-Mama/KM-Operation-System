'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || 'output/ad4-codex-20261122/release-final');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = f => fs.readFileSync(path.join(root,f),'utf8');
let checked=0;
for (const line of read('INSTALL.sha256.txt').trim().split(/\r?\n/)) {
  const m=/^([a-f0-9]{64}) \*(.+)$/.exec(line); assert(m,'bad manifest row');
  const rel=m[2].replace(/%20/g,' '), p=path.resolve(root,rel);
  assert(p.startsWith(root+path.sep),'path escape');
  assert(!rel.split('/').some(n=>/^(?:00_config|84_|\.env)|pin.*\.local/i.test(n)),'private file');
  assert.equal(sha(fs.readFileSync(p)),m[1],rel); checked++;
}
const r=JSON.parse(read('RELEASE.json'));
const allValues = {};
for (const env of ['Sandbox','Production']) {
  const dir=path.join(root,'candidate',env,'apps-script'), values={};
  for (const n of fs.readdirSync(dir)) {
    assert(!/^(?:00_config|84_)/.test(n),'private GS present');
    const src=fs.readFileSync(path.join(dir,n),'utf8'); new vm.Script(src,{filename:n});
    for (const m of src.matchAll(/\bvar\s+(\w+)\s*=\s*['"]([^'"\r\n]*)['"]/g)) values[m[1]]=m[2];
  }
  allValues[env]=values;
  const E=JSON.parse(read('expected/expected-health-'+(env==='Sandbox'?'sbx':'prod')+'-ad4.json'));
  for (const row of E.register) if (values[row.symbol] !== undefined) assert.equal(values[row.symbol],row.expected,env+' '+row.symbol);
  for (const [s,v] of Object.entries(r.environments[env].stamps)) assert.equal(values[s],v.next);
}
const source=read('candidate/Production/apps-script/01_router.gs');
const ctx={}; vm.createContext(ctx); vm.runInContext(source,ctx);
const p=ctx.RTR_PRODUCTION_PROFILE_, raw=JSON.parse(JSON.stringify(p)); delete raw.policy_sha256;
assert.equal(sha(JSON.stringify(raw)),p.policy_sha256,'production policy digest');
const window={}; vm.runInNewContext(read('candidate/Production/site/production-config.js'),{window});
const pub=JSON.parse(JSON.stringify(p)); delete pub.module_stamps; delete pub.blocked;
assert.deepEqual(JSON.parse(JSON.stringify(window.KM_PRODUCTION_CONFIG_)),pub,'public policy mirror');
for (const m of p.module_stamps) if (allValues.Production[m.symbol] !== undefined) assert.equal(allValues.Production[m.symbol],m.expected,'production gate '+m.symbol);
// Only excluded private/config modules use fixture stamps. Public module stamps come from actual release source.
const v={...Object.fromEntries(p.module_stamps.map(m=>[m.symbol,m.expected])),...allValues.Production};
ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getId:()=> 'fixture-db'})};ctx.prodExpectedDbId_=()=> 'fixture-db';
ctx.rtrSha256Hex_=()=>p.db_fp;ctx.requestOrderDraftV2FlatCutoverEnabled_=()=>true;ctx.sysGlobalValue_=s=>v[s];
assert.equal(ctx.rtrProductionTargetCheck_(),null);
const old=v.SP_BUILD_VERSION_;v.SP_BUILD_VERSION_=old.replace(/-AD4$/,'');assert.equal(ctx.rtrProductionTargetCheck_().code,'PRODUCTION_MODULE_MISMATCH');v.SP_BUILD_VERSION_=old;
const oldSys=v.SYS_BUILD_VERSION_;v.SYS_BUILD_VERSION_=oldSys.replace(/-AD4$/,'');assert.equal(ctx.rtrProductionTargetCheck_().code,'PRODUCTION_MODULE_MISMATCH');v.SYS_BUILD_VERSION_=oldSys;
assert.equal(ctx.rtrProductionTargetCheck_(),null);
const checker=require(path.join(root,'tools/check-prod-health-ad4.cjs')), E=checker.load('final4');
const capture={kind:'KM_PROD_HEALTH_SUMMARY_V2',captured_at:new Date().toISOString(),health_success:true,capabilities_success:true,deployment_release:E.deployment_release,mixed_deployment:false,stale_modules:[],absent_modules:[],modules:E.register.map(x=>({...x,present:true,declared:x.expected,matches:true})),production_gate:{...E.production_gate,bound_equals_constant:true,flat_v2:true,administration_enabled:false,ai_plan_enabled:false}};
assert.deepEqual(checker.check(capture,E,'final4').stops,[]);
capture.production_gate.policy_sha256='stale'; assert(checker.check(capture,E,'final4').stops.some(x=>x.startsWith('POLICY ')));
console.log('AD4_RELEASE_VERIFIED files='+checked+' policy_mirror=PASS public_stamps=PASS production_gate=4/0 health_checker=2/0 private_modules=NOT_READ live=NOT_RUN');
