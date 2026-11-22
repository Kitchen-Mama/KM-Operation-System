'use strict';
// Real runtime functions, synthetic Sheets/Drive only. No network or business writes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {extract}=require('./ad4/extract.cjs');
const root=process.env.DW2_GS||'assets/specs/active/apps-script',read=f=>fs.readFileSync(f,'utf8');
let passed=0;function test(n,fn){fn();passed++;console.log('PASS '+n);}
const c={console};vm.createContext(c);
for(const f of ['37_shipment_document_file_renderer.gs','38_document_output_folder_resolver.gs','36_document_template_handlers.gs','34_shipment_final_output_handlers.gs','39_document_runtime_service.gs','12_shipment_handlers.gs','16_shipping_allocation_handlers.gs'])vm.runInContext(read(root+'/'+f),c,{filename:f});
c.jsonResponse_=x=>x;
const sheets={};let writes=0,copies=0,pdfs=0;
function workbook(id){
 const tab={values:[['{{SHIPMENT_NO}}','',''],['{{SKU}}','{{QTY}}','{{PO_NO}}'],['','','']],getName:()=> 'List 1'};
 function range(r,col,nr=1,nc=1){return {getNumColumns:()=>nc,getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>tab.values[r+i-1]?.[col+j-1]??'')),getValue:()=>tab.values[r-1]?.[col-1]??'',getFormulas:()=>Array.from({length:nr},()=>Array(nc).fill('')),getMergedRanges:()=>[],setValues:rows=>{writes++;rows.forEach((a,i)=>a.forEach((v,j)=>{tab.values[r+i-1]??=[];tab.values[r+i-1][col+j-1]=v;}));},setValue:v=>{writes++;tab.values[r-1][col-1]=v;},copyTo:target=>target.setValues(range(r,col,nr,nc).getValues())};}
 tab.getRange=range;tab.getDataRange=()=>range(1,1,tab.values.length,3);tab.insertRowsAfter=(r,n)=>tab.values.splice(r,0,...Array.from({length:n},()=>['','','']));
 const book={getSheets:()=>[tab],getSheetByName:n=>n==='List 1'?tab:null,getNamedRanges:()=>[]};sheets[id]=book;return book;
}
workbook('TPL');
const folder={getId:()=> 'ROOT',getName:()=> 'Output',createFile:()=>{pdfs++;return {getId:()=> 'PDF',getUrl:()=> 'https://drive.google.com/file/d/PDF/view'};}};
function file(id){return {getId:()=>id,getName:()=>id,getUrl:()=> 'https://docs.google.com/spreadsheets/d/'+id,getMimeType:()=> 'application/vnd.google-apps.spreadsheet',getParents:()=>{let once=false;return {hasNext:()=>!once,next:()=>{once=true;return folder;}};},makeCopy:()=>{copies++;workbook('COPY');return file('COPY');},getAs:()=>({setName(){return this;}})};}
c.DriveApp={getFolderById:()=>folder,getFileById:file};c.SpreadsheetApp={openById:id=>sheets[id],flush:()=>{}};
const io=c.dfoDefaultIo_(),spec={name:'List 1',scalars:{SHIPMENT_NO:'EXT-1'},children:{ITEMS:['SKU','QTY','PO_NO']},required:['SHIPMENT_NO','SKU','QTY'],collections:{ITEMS:[{SKU:'SKU-RED',QTY:80,PO_NO:''},{SKU:'SKU-SILVER',QTY:40,PO_NO:''}]}};
test('real renderer exposes workbook preflight and recovery IO',()=>['planWorkbook','fillWorkbook','attemptFiles','renameFile','fileMeta','exportOffice'].forEach(k=>assert.equal(typeof io[k],'function')));
test('real workbook preflight reads named tab with zero writes',()=>{assert.equal(io.planWorkbook('TPL',[spec]),'');assert.equal(writes,0);assert.equal(copies,0);});
test('missing worksheet still refuses',()=>assert.match(io.planWorkbook('TPL',[{...spec,name:'Missing'}]),/WORKSHEET_MISSING/));
test('missing required placeholder still refuses',()=>assert.match(io.planWorkbook('TPL',[{...spec,required:['ABSENT']}]),/TOKEN_NOT_IN_TEMPLATE/));
test('actual payload orchestration creates workbook and PDF',()=>{const r=c.dfoRenderPayload_(io,{template_file_id:'TPL',template_file_type:'google_sheet',folder_id:'ROOT',file_name:'Shipment',scalars:{},collections:{},sheets:[spec]});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.pdf_file_id,'PDF');assert.equal(copies,1);assert.equal(pdfs,1);});
test('actual workbook fill retains quantities and blank overseas PO',()=>assert.equal(JSON.stringify(sheets.COPY.getSheets()[0].values.slice(0,3)),JSON.stringify([['EXT-1','',''],['SKU-RED',80,''],['SKU-SILVER',40,'']])));
test('template is never overwritten',()=>assert.equal(sheets.TPL.getSheets()[0].values[0][0],'{{SHIPMENT_NO}}'));
test('real 39_ field contract reaches workbook preflight without a missing-method refusal',()=>{
 const original=c.dgsFieldsFor_;
 c.dgsFieldsFor_=()=>[{worksheet_name:'List 1',placeholder:'SHIPMENT_NO',field_type:'scalar',data_source_table:'shipments',data_source_field:'external_shipment_id',required:true,is_active:true}];
 assert.equal(JSON.stringify(c.dgsFieldContract_({}, {template_id:'T',template:{template_file_id:'TPL',template_file_type:'google_sheet'},render:'SHIPDETAIL'},()=>[],null)),'[]');
 c.dgsFieldsFor_=original;
});
test('invalid workbook refuses before file copy',()=>{const before=copies;const r=c.dfoRenderPayload_(io,{template_file_id:'TPL',template_file_type:'google_sheet',folder_id:'ROOT',file_name:'Bad',sheets:[{...spec,required:['ABSENT']}]});assert.equal(r.ok,false);assert.equal(copies,before);});
test('real Drive readiness compares the MIME string, not legacy numeric flag',()=>assert.equal(c.dgsDriveReadiness_(c.dofProbeIo_(),[{template_file_id:'TPL',template_file_type:'google_sheet',output_folder_id:'ROOT1234567890'}],'shipment').ok,true));
test('scope failure preserves safe actionable diagnosis',()=>{c.DriveApp.getFolderById=()=>{throw Error('You do not have permission to call DriveApp.getFolderById. Required permissions: https://www.googleapis.com/auth/drive');};const r=c.dgsDriveReadiness_(c.dofProbeIo_(),[{template_file_id:'TPL',template_file_type:'google_sheet',output_folder_id:'ROOT1234567890'}],'shipment');assert.equal(r.ok,false);assert.equal(r.checks[0].diagnostic.code,'GOOGLE_AUTHORIZATION_REQUIRED');c.DriveApp.getFolderById=()=>folder;});
test('probe error masks credentials and email-shaped text',()=>{const r=c.dfoProbeError_(Error('a'.repeat(64)+' owner@example.com https://example.com/private'));assert(!r.message.includes('a'.repeat(64)));assert(!r.message.includes('owner@example.com'));});
test('manifest declares all renderer service scopes',()=>{const scopes=JSON.parse(read('assets/specs/active/apps-script/appsscript.json')).oauthScopes;for(const s of ['drive','documents','script.external_request'])assert(scopes.includes('https://www.googleapis.com/auth/'+s));});
const {IRSubmitPreflight:pf}=require('../js/utils/inventory-compat.js');
const route={sku:'SKU',scopeKey:'co|us|amazon',route_provenance:'USER_EXPLICIT_ADD_ROUTE',allocation_draft_id:'H1',allocation_draft_line_id:'L1',draft_version:3,qty:80,complete:true,company:'Co',country:'US',shipping_method:'truck',destination_type:'WAREHOUSE',destination_code:'D'};
const input={persistedOnly:true,routes:[route],scope:{company:'Co',country:'US',marketplace:'Amazon'},appliedScopeKey:'co|us|amazon'};
test('complete persisted route remains eligible',()=>{const r=pf.evaluate(input);assert(r.ok);assert.deepEqual(r.candidate.lineIds,['L1']);assert.equal(r.candidate.expectedVersions.H1,3);});
test('incomplete local composer does not block saved routes',()=>{const r=pf.evaluate({...input,routes:[route,{sku:'OTHER',route_kind:'COMPOSER',composer_touched:true,complete:false}],saveFailed:['OTHER']});assert(r.ok);assert.equal(r.candidate.lineCount,1);assert.equal(r.excluded[0].reason,'INCOMPLETE_LOCAL_ROUTE');assert(pf.buildConfirmation(r,{}));});
test('unsaved complete route is not submitted',()=>{const r=pf.evaluate({...input,routes:[route,{...route,sku:'NEW',allocation_draft_id:'',allocation_draft_line_id:''}]});assert(r.ok);assert.equal(r.candidate.lineCount,1);assert(r.excluded.some(x=>x.reason==='NOT_YET_SAVED'));});
test('incomplete edit excludes its shared draft rather than submitting the stored old version',()=>{const r=pf.evaluate({...input,routes:[route,{...route,sku:'OTHER',allocation_draft_line_id:'L2',complete:false},{...route,allocation_draft_id:'H2',allocation_draft_line_id:'L3'}]});assert(r.ok);assert.deepEqual(r.candidate.draftIds,['H2']);assert.deepEqual(r.candidate.lineIds,['L3']);});
for(const patch of [{inFlightWrites:['OTHER']},{pendingCancels:['OTHER']},{saveFailed:['line:L2']},{draftStateUnverified:'WRITE_OUTCOME_UNKNOWN'}])test('uncertain writes/deletes still block '+Object.keys(patch)[0],()=>assert.equal(pf.evaluate({...input,...patch}).ok,false));
test('only incomplete rows returns no persisted candidate',()=>assert.equal(pf.evaluate({...input,routes:[{sku:'OTHER',complete:false}]}).code,'NO_PERSISTED_CANDIDATE'));
test('server exact selection accepts the entire requested draft lines',()=>assert(c.sadSubmitSelectionDw2_([{lines:[{allocation_draft_line_id:'L1'}]}],['L1'])));
for(const ids of [[],['L1','L1'],['L2'],['L1','L2']])test('server refuses changed/extra/duplicate selection '+JSON.stringify(ids),()=>assert.equal(c.sadSubmitSelectionDw2_([{lines:[{allocation_draft_line_id:'L1'}]}],ids),false));
test('batched submit writes only changed contiguous cells',()=>{const calls=[],row=['=FORMULA','draft','old','old','untouched'];const sh={getRange:(r,col,nr,nc)=>({setValues:vs=>{calls.push([col,nc]);vs[0].forEach((v,i)=>row[col+i-1]=v);}})};c.sadSubmitCellsDw2_(sh,2,['formula','status','updated_by','updated_at','other'],{status:'submitted',updated_by:'user',updated_at:'today'});assert.deepEqual(calls,[[2,3]]);assert.equal(row[0],'=FORMULA');assert.equal(row[4],'untouched');});
let property=null,sets=0;c.PropertiesService={getScriptProperties:()=>({getProperty:()=>property,setProperty:(k,v)=>{property=v;sets++;}})};c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};c.RTR_PRODUCTION_PROFILE_={environment:'KM_PRODUCTION'};c.shipmentTimestamp_=()=> '2026-11-22';
test('Production grouping settings load without Sandbox exception',()=>assert.equal(c.handleShipmentConsolidationPolicyGet_().policy.mode,'SEPARATE'));
test('Production policy saves with an optimistic version',()=>{assert(c.handleShipmentConsolidationPolicySave_({mode:'SAME_COMPANY',expected_version:0,actor:'UAT',reason:'test'}).success);assert.equal(sets,1);});
test('stale policy save is zero-write',()=>{const r=c.handleShipmentConsolidationPolicySave_({mode:'CROSS_COMPANY',expected_version:0,actor:'UAT',reason:'test'});assert.equal(r.code,'POLICY_EDIT_CONFLICT');assert.equal(r.zero_write,true);assert.equal(sets,1);});
test('unrecognized environment cannot save policy',()=>{c.RTR_PRODUCTION_PROFILE_={environment:'OTHER'};assert.equal(c.handleShipmentConsolidationPolicyGet_().code,'ENVIRONMENT_NOT_ENABLED');});
const lane={source_warehouse_id:'FACTORY',destination_warehouse_id:'D-KM',country:'US',carrier_id:'CARRIER',shipping_method:'sea_express',last_mile_delivery:'parcel',shipments_customs_type:'third_party_customs'},shared={valid:{'SHARED':{members:['D-KM','D-RESUS']}}};
test('same-company channels share one physical merge key',()=>assert.equal(c.sc13Key_({...lane,marketplace:'Shopify'},false),c.sc13Key_({...lane,marketplace:'Target Plus'},false)));
test('approved cross-company destination mapping unifies the physical merge key',()=>assert.equal(c.xcdMergeKey_(lane,false,{mode:'CROSS_COMPANY'},shared),c.xcdMergeKey_({...lane,destination_warehouse_id:'D-RESUS'},false,{mode:'CROSS_COMPANY'},shared)));
test('different destinations stay separate without cross-company policy',()=>assert.notEqual(c.xcdMergeKey_(lane,false,{mode:'SAME_COMPANY'},shared),c.xcdMergeKey_({...lane,destination_warehouse_id:'D-RESUS'},false,{mode:'SAME_COMPANY'},shared)));
const parts=(f,names)=>extract(read(f),n=>names.includes(n),()=>false).map(x=>x.text).join('\n');
const k={window:{KM:{}},replenAllocationDraft:{bySku:{A:[{allocation_draft_id:'H1'}],B:[{qty:5,route_incomplete:true}]},allocationDraftIds:['H1'],submitExecutionKey:'OLD'},_persistAllocationDraft:()=>{}};vm.createContext(k);vm.runInContext(parts('assets/js/pages/inventory-replenishment.js',['_irKeepUnsubmittedRoutesDw2_']),k);
test('partial submit preserves incomplete recovery rows and drops the used execution key',()=>{k._irKeepUnsubmittedRoutesDw2_(['H1']);assert(!k.replenAllocationDraft.bySku.A);assert.equal(k.replenAllocationDraft.bySku.B[0].qty,5);assert(!k.replenAllocationDraft.submitExecutionKey);});
async function authCase(code) {
 let calls=0;
 const endpoint='https://script.google.com/macros/s/'+'x'.repeat(32)+'/exec';
 const saved=JSON.stringify({version:1,endpoint,access_session:'a'.repeat(64),expires_at:Date.now()+60000});
 const a={URL,location:{href:'https://example.com'},document:{querySelector:()=>null,readyState:'loading',addEventListener:()=>{}},window:{
  KM_PRODUCTION_CONFIG_:{endpoint},sessionStorage:{getItem:()=>saved,removeItem:()=>{}},
  fetch:async(url,opts)=>{
   calls++;assert(!url.includes('a'.repeat(64)));assert(JSON.parse(opts.body).access_session);
   return {clone:()=>({json:async()=>({success:false,code})})};
  }
 }};
 vm.createContext(a);vm.runInContext(read('assets/js/core/password-access.js'),a);
 await a.window.fetch(endpoint,{method:'POST',body:JSON.stringify({action:'updateShipment'})});
 assert.equal(calls,1);return a.window.KM.passwordAccess;
}
(async()=>{for(const code of ['AUTH_RATE_LIMIT','AUTH_MODULE_MISSING','AUTH_BUSY']){const a=await authCase(code);test('transient '+code+' does not discard a valid local session',()=>assert(a.isSignedIn()));}const a=await authCase('AUTH_SESSION_EXPIRED');test('expired server session still signs out without replay',()=>assert(!a.isSignedIn()));console.log('DW2_PASS '+passed+' live_business_writes=0');})().catch(e=>{console.error(e);process.exitCode=1;});
