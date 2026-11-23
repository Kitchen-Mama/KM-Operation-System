'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.resolve(root,process.argv[2]||'output/document-retry-dr4-20261123/release-1');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');let n=0;
for(const line of fs.readFileSync(path.join(out,'INSTALL.sha256.txt'),'utf8').trim().split(/\r?\n/)){const m=/^([a-f0-9]{64}) \*(.+)$/.exec(line);assert(m);const f=path.resolve(out,m[2]);assert(f.startsWith(out+path.sep));assert.equal(sha(fs.readFileSync(f)),m[1],m[2]);n++;}
const R=JSON.parse(fs.readFileSync(path.join(out,'RELEASE.json'),'utf8'));assert.equal(R.environment,'Production only');assert.deepEqual(R.sync_files,['01_router.gs','63_api_v1_system_health.gs']);
const gs=path.join(out,'candidate/Production/apps-script'),site=path.join(out,'candidate/Production/site');
assert.deepEqual(fs.readdirSync(gs).sort(),R.sync_files);
for(const f of R.sync_files){const b=fs.readFileSync(path.join(gs,f));new vm.Script(b.toString());assert.equal(sha(b),sha(fs.readFileSync(path.join(root,'assets/specs/active/apps-script',f))));}
for(const f of R.frontend_files)assert.equal(sha(fs.readFileSync(path.join(site,f))),sha(fs.readFileSync(path.join(root,f))));
const c={};vm.runInNewContext(fs.readFileSync(path.join(gs,'01_router.gs'),'utf8'),c);assert.deepEqual(JSON.parse(JSON.stringify(c.RTR_PRODUCTION_PROFILE_)),JSON.parse(fs.readFileSync(path.join(out,'EXPECTED_POLICY.json'),'utf8')));
for(const [test,vars,expected] of [['document-retry-production-dr4.cjs',{DR4_GS:gs,DR4_SITE:site,DR4_BASELINE:''},'DOCUMENT_RETRY_DR4_PASS 9'],['document-retry-browser-guard-dr4.cjs',{},'DOCUMENT_RETRY_BROWSER_GUARD_DR4_PASS 2']]){
 const log=cp.execFileSync(process.execPath,['assets/tests/'+test],{cwd:root,encoding:'utf8',env:{...process.env,...vars}});assert(log.includes(expected));console.log(log.trim().split(/\r?\n/).at(-1));
}
console.log('DOCUMENT_RETRY_DR4_VERIFIED hashes='+n+' production_only=true live_writes=0');
