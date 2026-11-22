'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.resolve(root,process.argv[2]||'output/carrier-document-r2-20261122/release-2');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');let count=0;
for(const l of fs.readFileSync(path.join(out,'INSTALL.sha256.txt'),'utf8').trim().split(/\r?\n/)){const m=/^([0-9a-f]{64}) \*(.+)$/.exec(l);assert(m);const f=path.resolve(out,m[2]);assert(f.startsWith(out+path.sep));assert.equal(sha(fs.readFileSync(f)),m[1],m[2]);count++;}
const report=JSON.parse(fs.readFileSync(path.join(out,'RELEASE.json'),'utf8'));
assert.deepEqual(report.sync_files,['36_document_template_handlers.gs','37_shipment_document_file_renderer.gs','39_document_runtime_service.gs']);
for(const env of ['Sandbox','Production']){
 const dir=path.join(out,'candidate',env,'apps-script'),base=path.join(root,'output/dw2-workflow-20261122/release-4/candidate',env,'apps-script');
 assert.deepEqual(fs.readdirSync(dir).sort(),report.sync_files);
 for(const f of report.sync_files){const b=fs.readFileSync(path.join(dir,f));assert.equal(sha(b),report.environments[env][f].sha256);new vm.Script(b.toString('utf8'),{filename:env+'/'+f});}
 for(const [test,vars,match] of [['carrier-document-contract-r2.cjs',{CARRIER_R2_GS:dir,CARRIER_R2_BASE:base},'CARRIER_DOCUMENT_R2_PASS 27'],['document-contract-hotfix-r1.cjs',{DOC_HOTFIX_GS:dir,DOC_HOTFIX_BASE:base},'DOCUMENT_CONTRACT_HOTFIX_PASS 24']]){
  const log=cp.execFileSync(process.execPath,['assets/tests/'+test],{cwd:root,encoding:'utf8',env:{...process.env,...vars}});assert(log.includes(match));console.log(env+' '+log.trim().split(/\r?\n/).at(-1));
 }
}
console.log('CARRIER_R2_VERIFY_OK files='+count+' live_business_writes=0 live_drive_writes=0');
