'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.resolve(root,process.argv[2]||'output/carrier-document-r3-20261123/release-1');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');let count=0;
for(const line of fs.readFileSync(path.join(out,'INSTALL.sha256.txt'),'utf8').trim().split(/\r?\n/)){const m=/^([a-f0-9]{64}) \*(.+)$/.exec(line);assert(m);const f=path.resolve(out,m[2]);assert(f.startsWith(out+path.sep));assert.equal(sha(fs.readFileSync(f)),m[1],m[2]);count++;}
const R=JSON.parse(fs.readFileSync(path.join(out,'RELEASE.json'),'utf8'));
assert.equal(R.bundle_rebuild,false);assert.equal(R.live_writes,0);
for(const env of ['Sandbox','Production']){
 const dir=path.join(out,'candidate',env,'apps-script'),base=path.join(root,'output/dw2-workflow-20261122/release-4/candidate',env,'apps-script');
 assert.deepEqual(fs.readdirSync(dir).sort(),R.sync_files);
 for(const f of R.sync_files){const b=fs.readFileSync(path.join(dir,f));assert.equal(sha(b),R.environments[env][f].sha256);new vm.Script(b.toString('utf8'),{filename:env+'/'+f});}
 for(const [file,vars,expected] of [['carrier-document-r3.cjs',{CARRIER_R3_GS:dir,CARRIER_R3_BASE:base},'CARRIER_R3_PASS 17'],['carrier-document-contract-r2.cjs',{CARRIER_R2_GS:dir,CARRIER_R2_BASE:base},'CARRIER_DOCUMENT_R2_PASS 27'],['document-contract-hotfix-r1.cjs',{DOC_HOTFIX_GS:dir,DOC_HOTFIX_BASE:base},'DOCUMENT_CONTRACT_HOTFIX_PASS 24']]){
  const log=cp.execFileSync(process.execPath,['assets/tests/'+file],{cwd:root,encoding:'utf8',env:{...process.env,...vars}});assert(log.includes(expected));console.log(env+' '+log.trim().split(/\r?\n/).at(-1));
 }
}
for(const f of R.frontend_files){const b=fs.readFileSync(path.join(out,'frontend-delta',f));assert.equal(sha(b),sha(fs.readFileSync(path.join(root,f))));if(f.endsWith('.js'))new vm.Script(b.toString('utf8'),{filename:f});}
console.log('CARRIER_R3_VERIFIED hashes='+count+' environments=2 live_writes=0');
