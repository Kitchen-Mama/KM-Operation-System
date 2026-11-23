'use strict';
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=process.env.DR4_GS||'assets/specs/active/apps-script',site=process.env.DR4_SITE||'.';
const read=f=>fs.readFileSync(f,'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
const c={console,Logger:{log:()=>{}}};vm.createContext(c);
for(const f of ['01_router.gs','34_shipment_final_output_handlers.gs','35_shipment_document_renderer.gs','36_document_template_handlers.gs','39_document_runtime_service.gs']){
 const file=fs.existsSync(dir+'/'+f)?dir+'/'+f:'assets/specs/active/apps-script/'+f;
 vm.runInContext(read(file),c,{filename:f});
}
const body={action:'document.retry',related_entity_type:'shipment',related_entity_id:'SH-TEST',access_session:'TEST'};
if(process.env.DR4_BASELINE==='1'){
 const old={};vm.runInNewContext(cp.execFileSync('git',['show','ebb80643880aa84d78afbaf47e69b2d8fdb4338e:assets/specs/active/apps-script/01_router.gs'],{encoding:'utf8'}),old);
 assert.equal(old.rtrActionGate_(body.action,body).code,'PRODUCTION_ACTION_NOT_ENABLED');console.log('DR4_BASELINE_REPRODUCED PRODUCTION_ACTION_NOT_ENABLED');process.exit(0);
}
let passed=0,generated=0,status='shipped',snapshot=true,revision=0;
function test(n,fn){fn();passed++;console.log('PASS '+n);}
const p=plain(c.RTR_PRODUCTION_PROFILE_),old={};vm.runInNewContext(cp.execFileSync('git',['show','ebb80643880aa84d78afbaf47e69b2d8fdb4338e:assets/specs/active/apps-script/01_router.gs'],{encoding:'utf8'}),old);
test('only document.retry is newly allowed; PO/admin actions and all reads remain unchanged',()=>{
 assert.deepEqual(p.allowed.filter(a=>!old.RTR_PRODUCTION_PROFILE_.allowed.includes(a)),['document.retry']);
 assert.deepEqual(p.blocked,plain(old.RTR_PRODUCTION_PROFILE_.blocked).filter(a=>a!=='document.retry'));
 assert.deepEqual(p.reads,plain(old.RTR_PRODUCTION_PROFILE_.reads));assert(!p.reads.includes('document.retry'));
});
test('router/client policy hash, module stamps and cache token agree',()=>{
 const h={...p};delete h.policy_sha256;assert.equal(p.policy_sha256,crypto.createHash('sha256').update(JSON.stringify(h)).digest('hex'));
 const w={};vm.runInNewContext(read(site+'/production-config.js'),{window:w});const pub={...p};delete pub.module_stamps;delete pub.blocked;
 assert.deepEqual(plain(w.KM_PRODUCTION_CONFIG_),pub);assert(read(site+'/index.html').includes('production-config.js?v=dr4-20261123'));
 const health=read(dir+'/63_api_v1_system_health.gs');const m=/var SYS_MODULE_BUILD_STAMPS_ = (\[[\s\S]*?\n\]);/.exec(health);assert(m);
 const rows=JSON.parse(m[1]);
 for(const symbol of ['RTR_BUILD_VERSION_','SYS_BUILD_VERSION_']){
  const expected=p.module_stamps.find(m=>m.symbol===symbol).expected;assert(expected.endsWith('-DR4'));
  assert.equal(rows.find(m=>m.symbol===symbol).expected,expected);assert(health.includes(expected));
 }
});
c.jsonResponse_=x=>x;c.paControl_=()=>null;c.paSessionCheck_=b=>b.access_session==='TEST'?null:{success:false,code:'AUTH_REQUIRED',zero_write:true};
c.SpreadsheetApp={getActiveSpreadsheet:()=>({getId:()=> 'fixture'})};c.prodExpectedDbId_=()=> 'fixture';c.rtrSha256Hex_=()=>p.db_fp;
const values=Object.fromEntries(p.module_stamps.map(m=>[m.symbol,m.expected]));c.sysGlobalValue_=k=>values[k];c.requestOrderDraftV2FlatCutoverEnabled_=()=>true;
// Unrelated read handlers are not exercised; the real POST action switch, gate and retry handler are.
c.rtrGetReadHandlers_=()=>({});c.kmSrcRevMark_=()=> 'MARK';c.kmSrcRevBump_=()=>{revision++;};
c.dgsDb_=()=>({});c.dgsShipmentContext_=()=>({ok:true,status});c.docReadSnapshot_=()=>snapshot?{header:{shipment_id:'SH-TEST',status:'final'}}:null;
c.dgsGenerateShipmentDocuments_=(ss,id)=>{assert.equal(id,'SH-TEST');generated++;return {ok:true,reused:2,generated:1};};
c.handleConfirmShipmentAndDispatch_=()=>{throw Error('Dispatch must never run');};
function post(b=body){return c.doPost({parameter:{action:b.action},postData:{contents:JSON.stringify(b)}});}
test('real Production POST routes shipment retry to existing R3 handler and reuses documents',()=>{
 const r=post();assert.equal(r.success,true,JSON.stringify(r));assert.equal(generated,1);assert.equal(r.result.reused,2);assert.equal(r.result.generated,1);assert.equal(revision,1);
});
test('PO, malformed and alias-conflicting retry requests are refused before generation',()=>{
 const before=generated;
 for(const bad of [null,[],{}, {...body,related_entity_type:'purchase_order'},{...body,related_entity_id:''},{...body,related_entity_id:123},
  {...body,entity_type:'purchase_order'},{...body,entity_id:'OTHER'},{...body,shipment_id:'OTHER'},{...body,purchase_order_id:'PO'}]){
  assert.equal(c.rtrActionGate_('document.retry',bad).code,'PRODUCTION_DOCUMENT_RETRY_SCOPE_REFUSED');
 }
 const r=post({...body,related_entity_type:'purchase_order'});assert.equal(r.zero_write,true);assert.equal(generated,before);
});
test('authentication remains required before the newly allowed route',()=>{
 const before=generated;assert.equal(post({...body,access_session:''}).code,'AUTH_REQUIRED');assert.equal(generated,before);
});
test('stale health or wrong target still blocks before generation',()=>{
 const before=generated,stamp=values.SYS_BUILD_VERSION_;values.SYS_BUILD_VERSION_='STALE';assert.equal(post().code,'PRODUCTION_MODULE_MISMATCH');values.SYS_BUILD_VERSION_=stamp;
 c.prodExpectedDbId_=()=> 'wrong';assert.equal(post().code,'PRODUCTION_TARGET_MISMATCH');c.prodExpectedDbId_=()=> 'fixture';assert.equal(generated,before);
});
test('Ready to Ship still refuses without re-confirming or generating',()=>{
 const before=generated;status='ready_to_ship';const r=post();assert.equal(r.code,'SHIPMENT_NOT_DISPATCHED');assert.equal(r.zero_write,true);assert.equal(generated,before);status='shipped';
});
test('missing frozen snapshot still refuses without creating one',()=>{
 const before=generated;snapshot=false;const r=post();assert.equal(r.code,'FROZEN_SNAPSHOT_REQUIRED');assert.equal(r.zero_write,true);assert.equal(generated,before);snapshot=true;
});
test('unrelated disabled administration and PO diagnostic actions stay disabled',()=>{
 for(const action of ['factoryOperationConfig.save','automationSchedule.update','document.diagnostic.purchaseOrder'])assert.equal(c.rtrActionGate_(action,body).code,'PRODUCTION_ACTION_NOT_ENABLED');
});
console.log('DOCUMENT_RETRY_DR4_PASS '+passed+' live_business_writes=0 live_drive_writes=0');
