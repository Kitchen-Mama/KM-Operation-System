'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),src='assets/specs/active/apps-script';
const out=path.resolve(root,process.argv[2]||'output/carrier-document-r3-20261123/release-1');
const baseline='2a199de55e65b1895e47dd326adc3391ed5c983c';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),put=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);};
const changed=['12_shipment_handlers.gs','34_shipment_final_output_handlers.gs','36_document_template_handlers.gs','39_document_runtime_service.gs'];
const sync=[...changed,'37_shipment_document_file_renderer.gs'].sort();
const front=['index.html','assets/js/app.js','assets/js/pages/factory-stock.js','assets/js/pages/overseas-stock.js','assets/js/pages/purchase-order-list.js','assets/js/pages/shipping-history.js','assets/js/utils/import-batch.js','assets/js/utils/po-factory-import.js','assets/js/utils/template-export.js'];
assert(!fs.existsSync(out),'Choose a fresh output directory');
assert.equal(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),baseline,'Build before committing from R2 baseline');
function manifest(dir,pin){assert.equal(sha(fs.readFileSync(path.join(dir,'INSTALL.sha256.txt'))),pin);return new Map(fs.readFileSync(path.join(dir,'INSTALL.sha256.txt'),'utf8').trim().split(/\r?\n/).map(l=>{const m=/^([a-f0-9]{64}) \*(.+)$/.exec(l);assert(m);return [m[2].replace(/%20/g,' '),m[1]];}));}
const dw=path.join(root,'output/dw2-workflow-20261122/release-4'),r2=path.join(root,'output/carrier-document-r2-20261122/release-2');
const md=manifest(dw,'2e5be5c5d66e0a014606f7980b6adc8719e388ae909b3bfcabbf304cc8828c64');
const mr=manifest(r2,'f55fc7976678595ac20bb2b1e0ddc5b0c185d52e801d6ca34b70724d12e26afa');
const patch=cp.execFileSync('git',['diff','--no-ext-diff','--relative='+src,'--',...changed.map(f=>src+'/'+f)],{cwd:root,encoding:'utf8'});
assert(patch.includes('shipServiceLabel_')&&patch.includes('sfoRegionalExact_'));put(path.join(out,'hotfix.patch'),patch);
const report={release:'r6.10.3-carrier-import-r3',base_commit:baseline,sync_files:sync,frontend_files:front,bundle_rebuild:false,router_changed:false,manifest_changed:false,schema_changed:false,live_writes:0,apps_script_deployment:'OWNER_REQUIRED',environments:{}};
for(const env of ['Sandbox','Production']){
 const dst=path.join(out,'candidate',env,'apps-script'),old={};
 for(const f of sync){const from=/^(12_|34_)/.test(f)?dw:r2,m=/^(12_|34_)/.test(f)?md:mr,key='candidate/'+env+'/apps-script/'+f,b=fs.readFileSync(path.join(from,key));assert.equal(sha(b),m.get(key),key);old[f]=sha(b);put(path.join(dst,f),b);}
 const envPatch=env==='Sandbox'?patch.replaceAll('dtRequireKnownLayoutSc2_(ss, name, headers)','prodRequireSheet_(ss, name, headers)'):patch;
 cp.execFileSync('git',['apply','--whitespace=nowarn','--directory='+path.relative(root,dst).replace(/\\/g,'/')],{cwd:root,input:envPatch});
 if(env==='Sandbox')assert(!fs.readFileSync(path.join(dst,'36_document_template_handlers.gs'),'utf8').includes('dtRequireKnownLayoutSc2_'));
 report.environments[env]=Object.fromEntries(sync.map(f=>{let b=fs.readFileSync(path.join(dst,f));if(env==='Production'){const mirror=fs.readFileSync(path.join(root,src,f));assert.equal(b.toString('utf8').replace(/\r\n/g,'\n'),mirror.toString('utf8').replace(/\r\n/g,'\n'));b=mirror;put(path.join(dst,f),b);}return [f,{base_sha256:old[f],sha256:sha(b)}];}));
}
for(const f of front)put(path.join(out,'frontend-delta',f),fs.readFileSync(path.join(root,f)));
for(const f of changed)put(path.join(out,'baseline-reproduction',f),cp.execFileSync('git',['show',baseline+':'+src+'/'+f],{cwd:root}));
const log=cp.execFileSync(process.execPath,['assets/tests/carrier-document-r3.cjs'],{cwd:root,encoding:'utf8',env:{...process.env,CARRIER_R3_GS:path.join(out,'baseline-reproduction'),CARRIER_R3_BASE:path.join(root,src),CARRIER_R3_REPRODUCE:'1'}});
assert(log.includes('DOCUMENT_SOURCE_NOT_IN_MODEL:pricing_list.auto_regular_price'));put(path.join(out,'BASELINE_REPRODUCED.txt'),log);
put(path.join(out,'OWNER_STEPS.md'),fs.readFileSync(path.join(root,'docs/planning/CARRIER_DOCUMENT_IMPORT_R3_20261123.md')));
put(path.join(out,'RELEASE.json'),JSON.stringify(report,null,2)+'\n');
const files=['hotfix.patch','BASELINE_REPRODUCED.txt','OWNER_STEPS.md','RELEASE.json',...front.map(f=>'frontend-delta/'+f),...changed.map(f=>'baseline-reproduction/'+f),...['Sandbox','Production'].flatMap(e=>sync.map(f=>'candidate/'+e+'/apps-script/'+f))];
put(path.join(out,'INSTALL.sha256.txt'),files.sort().map(f=>sha(fs.readFileSync(path.join(out,f)))+' *'+f).join('\n')+'\n');
console.log('CARRIER_R3_BUILD_OK '+out+'\nINSTALL_SHA256 '+sha(fs.readFileSync(path.join(out,'INSTALL.sha256.txt'))));
