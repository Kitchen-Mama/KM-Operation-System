'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),src='assets/specs/active/apps-script';
const dw2=path.join(root,'output/dw2-workflow-20261122/release-4'),r1=path.join(root,'output/document-contract-r1-20261122/release-2');
const out=path.resolve(root,process.argv[2]||'output/carrier-document-r2-20261122/release-2');
const files=['36_document_template_handlers.gs','37_shipment_document_file_renderer.gs','39_document_runtime_service.gs'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),put=(f,b)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b);};
function manifest(dir,pin){assert.equal(sha(fs.readFileSync(path.join(dir,'INSTALL.sha256.txt'))),pin);return new Map(fs.readFileSync(path.join(dir,'INSTALL.sha256.txt'),'utf8').trim().split(/\r?\n/).map(l=>{const m=/^([0-9a-f]{64}) \*(.+)$/.exec(l);assert(m);return [m[2].replace(/%20/g,' '),m[1]];}));}
assert(!fs.existsSync(out),'Use a fresh output directory');
const dwPin='2e5be5c5d66e0a014606f7980b6adc8719e388ae909b3bfcabbf304cc8828c64',r1Pin='7adec7fcb543c631a13207b43fde48595b1c75a8e0816c9076c902d5a6f7afc6';
const md=manifest(dw2,dwPin),mr=manifest(r1,r1Pin);
const baseline='036edcccd28e1b07a3416d5d419d055aee50cc61';
assert.equal(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),baseline,'Build from reviewed R1 baseline before committing R2');
const patch=cp.execFileSync('git',['diff','--no-ext-diff','--relative='+src,'--',...files.map(f=>src+'/'+f)],{cwd:root,encoding:'utf8'});
assert(patch.includes('dtNormalizeCarrierFieldsR2_'));put(path.join(out,'hotfix.patch'),patch);
const report={release:'r6.10.2-carrier-document-r2',base_commit:baseline,dw2_install_sha256:dwPin,r1_install_sha256:r1Pin,sync_files:files,live_business_writes:0,live_drive_writes:0,frontend_changes:false,bundle_rebuild:false,apps_script_deployment:'OWNER_REQUIRED',environments:{}};
for(const env of ['Sandbox','Production']){
 const dst=path.join(out,'candidate',env,'apps-script'),old={};
 for(const f of files){const dir=f.startsWith('37_')?dw2:r1,m=f.startsWith('37_')?md:mr,key='candidate/'+env+'/apps-script/'+f,b=fs.readFileSync(path.join(dir,key));assert.equal(sha(b),m.get(key),key);old[f]=sha(b);put(path.join(dst,f),b);}
 // Preserve Sandbox's own reader; SC2 is a Production layout adapter, not part of this hotfix.
 const envPatch=env==='Sandbox'?patch.replaceAll('dtRequireKnownLayoutSc2_(ss, name, headers)','prodRequireSheet_(ss, name, headers)'):patch;
 cp.execFileSync('git',['apply','--whitespace=nowarn','--directory='+path.relative(root,dst).replace(/\\/g,'/')],{cwd:root,input:envPatch});
 if(env==='Sandbox')assert(!fs.readFileSync(path.join(dst,files[0]),'utf8').includes('dtRequireKnownLayoutSc2_'));
 report.environments[env]=Object.fromEntries(files.map(f=>{let b=fs.readFileSync(path.join(dst,f));if(env==='Production'){const mirror=fs.readFileSync(path.join(root,src,f));assert.equal(b.toString('utf8').replace(/\r\n/g,'\n'),mirror.toString('utf8').replace(/\r\n/g,'\n'));b=mirror;put(path.join(dst,f),b);}return [f,{base_sha256:old[f],sha256:sha(b)}];}));
}
const repro=path.join(out,'baseline-reproduction');
for(const f of files)put(path.join(repro,f),cp.execFileSync('git',['show',baseline+':'+src+'/'+f],{cwd:root}));
const log=cp.execFileSync(process.execPath,['assets/tests/carrier-document-contract-r2.cjs'],{cwd:root,encoding:'utf8',env:{...process.env,CARRIER_R2_GS:repro,CARRIER_R2_BASE:path.join(root,src),CARRIER_R2_REPRODUCE:'1'}});
assert.equal((log.match(/BASELINE_REPRODUCED /g)||[]).length,3);put(path.join(out,'BASELINE_REPRODUCED.txt'),log);
put(path.join(out,'OWNER_STEPS.md'),fs.readFileSync(path.join(root,'docs/planning/CARRIER_DOCUMENT_CONTRACT_R2_20261122.md')));
put(path.join(out,'RELEASE.json'),JSON.stringify(report,null,2)+'\n');
const list=['hotfix.patch','OWNER_STEPS.md','RELEASE.json','BASELINE_REPRODUCED.txt',...files.map(f=>'baseline-reproduction/'+f),...['Sandbox','Production'].flatMap(e=>files.map(f=>'candidate/'+e+'/apps-script/'+f))];
put(path.join(out,'INSTALL.sha256.txt'),list.sort().map(f=>sha(fs.readFileSync(path.join(out,f)))+' *'+f).join('\n')+'\n');
console.log(log+'CARRIER_R2_BUILD_OK '+out+'\nINSTALL_SHA256 '+sha(fs.readFileSync(path.join(out,'INSTALL.sha256.txt'))));
