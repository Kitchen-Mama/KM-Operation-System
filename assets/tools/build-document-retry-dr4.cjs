'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),src='assets/specs/active/apps-script';
const out=path.resolve(root,process.argv[2]||'output/document-retry-dr4-20261123/release-1');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),put=(f,b)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b);};
const files=['01_router.gs','63_api_v1_system_health.gs'],front=['index.html','production-config.js'];
assert(!fs.existsSync(out),'Choose a fresh release directory');assert.equal(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),'ebb80643880aa84d78afbaf47e69b2d8fdb4338e');
const base=path.join(root,'output/dw2-workflow-20261122/release-4');
assert.equal(sha(fs.readFileSync(path.join(base,'INSTALL.sha256.txt'))),'2e5be5c5d66e0a014606f7980b6adc8719e388ae909b3bfcabbf304cc8828c64');
const manifest=new Map(fs.readFileSync(path.join(base,'INSTALL.sha256.txt'),'utf8').trim().split(/\r?\n/).map(l=>{const m=/^([a-f0-9]{64}) \*(.+)$/.exec(l);assert(m);return [m[2].replace(/%20/g,' '),m[1]];}));
const dst=path.join(out,'candidate/Production/apps-script');
for(const f of files){const rel='candidate/Production/apps-script/'+f,b=fs.readFileSync(path.join(base,rel));assert.equal(sha(b),manifest.get(rel));put(path.join(dst,f),b);}
const patch=cp.execFileSync('git',['diff','--no-ext-diff','--relative='+src,'--',...files.map(f=>src+'/'+f)],{cwd:root,encoding:'utf8'});
assert(patch.includes('rtrShipmentDocumentRetryScope_'));put(path.join(out,'hotfix.patch'),patch);
cp.execFileSync('git',['apply','--whitespace=nowarn','--directory='+path.relative(root,dst).replace(/\\/g,'/')],{cwd:root,input:patch});
for(const f of files){const mirror=fs.readFileSync(path.join(root,src,f));assert.equal(fs.readFileSync(path.join(dst,f),'utf8').replace(/\r\n/g,'\n'),mirror.toString().replace(/\r\n/g,'\n'));new vm.Script(mirror.toString());put(path.join(dst,f),mirror);}
for(const f of front)put(path.join(out,'candidate/Production/site',f),fs.readFileSync(path.join(root,f)));
const c={};vm.runInNewContext(fs.readFileSync(path.join(dst,files[0]),'utf8'),c);
put(path.join(out,'EXPECTED_POLICY.json'),JSON.stringify(c.RTR_PRODUCTION_PROFILE_,null,2)+'\n');
const repro=cp.execFileSync(process.execPath,['assets/tests/document-retry-production-dr4.cjs'],{cwd:root,encoding:'utf8',env:{...process.env,DR4_BASELINE:'1'}});
assert(repro.includes('DR4_BASELINE_REPRODUCED'));put(path.join(out,'BASELINE_REPRODUCED.txt'),repro);
const logs=cp.execFileSync(process.execPath,['assets/tests/document-retry-production-dr4.cjs'],{cwd:root,encoding:'utf8',env:{...process.env,DR4_GS:dst,DR4_SITE:path.join(out,'candidate/Production/site'),DR4_BASELINE:''}});
assert(logs.includes('DOCUMENT_RETRY_DR4_PASS 9'));put(path.join(out,'VERIFIED_TESTS.txt'),logs);
put(path.join(out,'OWNER_STEPS.md'),fs.readFileSync(path.join(root,'docs/planning/DOCUMENT_RETRY_PRODUCTION_DR4_20261123.md')));
put(path.join(out,'RELEASE.json'),JSON.stringify({release:'r6.10.4-document-retry-dr4',environment:'Production only',prerequisite:'R3 release-1 installed',sync_files:files,frontend_files:front,policy_sha256:c.RTR_PRODUCTION_PROFILE_.policy_sha256,bundle_rebuild:false,live_writes:0},null,2)+'\n');
const list=['hotfix.patch','EXPECTED_POLICY.json','BASELINE_REPRODUCED.txt','VERIFIED_TESTS.txt','OWNER_STEPS.md','RELEASE.json',...files.map(f=>'candidate/Production/apps-script/'+f),...front.map(f=>'candidate/Production/site/'+f)];
put(path.join(out,'INSTALL.sha256.txt'),list.sort().map(f=>sha(fs.readFileSync(path.join(out,f)))+' *'+f).join('\n')+'\n');
console.log(logs+'DR4_BUILD_OK '+out+'\nINSTALL_SHA256 '+sha(fs.readFileSync(path.join(out,'INSTALL.sha256.txt'))));
