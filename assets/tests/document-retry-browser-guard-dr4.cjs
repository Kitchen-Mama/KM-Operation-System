'use strict';
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict');
const guard=fs.readFileSync('production-guard.js','utf8');
async function exercise(config,expected){
 let sends=0,authChecks=0;
 const window={KM:{passwordAccess:{assertWriteAllowed(){authChecks++;}}},fetch:async(url,init)=>{
  if(String(url).includes('getClientCapabilities')){const C=window.KM_PRODUCTION_CONFIG_;return {json:async()=>({success:true,production_gate:{environment:'KM_PRODUCTION',profile_id:C.profile_id,policy_sha256:C.policy_sha256,db_fp:C.db_fp,bound_equals_constant:true,module_stamps_ok:true,flat_v2:true,administration_enabled:false,ai_plan_enabled:false}})};}
  const body=JSON.parse(init.body);assert.equal(body.action,'document.retry');assert.equal(body.related_entity_type,'shipment');sends++;return {json:async()=>({success:true})};
 }};
 const c={window,URL,location:{href:'https://example.invalid/'},navigator:{},document:{readyState:'loading',addEventListener(){}},console};vm.createContext(c);
 vm.runInContext(config,c);vm.runInContext(guard,c);
 const request=()=>window.fetch(window.KM_PRODUCTION_CONFIG_.endpoint,{method:'POST',body:JSON.stringify({action:'document.retry',related_entity_type:'shipment',related_entity_id:'SH-TEST'})});
 if(expected==='blocked'){
  await assert.rejects(request,/PRODUCTION_ACTION_NOT_ENABLED/);assert.equal(sends,0);assert.equal(authChecks,0);
 }else{
  assert.equal((await (await request()).json()).success,true);assert.equal(sends,1);assert.equal(authChecks,1);assert.equal(window.KM_PRODUCTION_GUARD_.verdict,'VERIFIED');
 }
}
(async()=>{
 await exercise(cp.execFileSync('git',['show','ebb80643880aa84d78afbaf47e69b2d8fdb4338e:production-config.js'],{encoding:'utf8'}),'blocked');
 console.log('PASS old actual browser guard reproduces Production action not enabled before any API call');
 await exercise(fs.readFileSync('production-config.js','utf8'),'allowed');
 console.log('PASS actual browser guard verifies new policy identity and write authentication before sending Shipment Retry');
 console.log('DOCUMENT_RETRY_BROWSER_GUARD_DR4_PASS 2 live_requests=0');
})().catch(e=>{console.error(e);process.exitCode=1;});
