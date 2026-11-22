'use strict';
// Full 16_ submit core, in-memory sheets. Adjacent plan/stock authorities are recording boundaries, not live writers.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{extract}=require('./ad4/extract.cjs');
const gs=process.env.DW2_GS||'assets/specs/active/apps-script',read=f=>fs.readFileSync(f,'utf8');
let passed=0;function test(n,fn){fn();passed++;console.log('PASS '+n);}
class Sheet {
 constructor(headers,rows=[]){this.data=[headers,...rows.map(r=>headers.map(k=>r[k]??''))];this.writes=0;this.reads=0;}
 getLastColumn(){return this.data[0].length;}getLastRow(){return this.data.length;}
 getDataRange(){this.reads++;return this.getRange(1,1,this.data.length,this.getLastColumn());}
 getRange(r,c,nr=1,nc=1){const s=this;return {getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>s.data[r+i-1]?.[c+j-1]??'')),getValue:()=>s.data[r-1]?.[c-1]??'',setValue:v=>{s.writes++;s.data[r-1][c-1]=v;},setValues:rows=>{s.writes++;rows.forEach((row,i)=>row.forEach((v,j)=>s.data[r+i-1][c+j-1]=v));}};}
 objects(){return this.data.slice(1).map(row=>Object.fromEntries(this.data[0].map((k,i)=>[k,row[i]])));}
}
function run(patch={},options={}) {
 const c={console,Proxy,Number,Date};vm.createContext(c);vm.runInContext(read(gs+'/16_shipping_allocation_handlers.gs'),c);
 const find=extract(read('assets/specs/active/apps-script/13_procurement_handlers.gs'),n=>n==='procurementFindRow_',()=>false)[0].text;vm.runInContext(find,c);
 const headers=Array.from(c.SHIPPING_ALLOCATION_DRAFTS_HEADERS_).concat('destination_marketplace');
 const base={allocation_draft_id:'H1',company:'Co',country:'US',marketplace:'Amazon',status:'draft',generation_type:'user_created',created_by:'Owner',created_at:'2026-11-22',draft_version:3,recommended_source_warehouse_id:'SOURCE',recommended_source_warehouse_code_snapshot:'FACTORY',destination_marketplace:'Amazon',recommended_shipping_method:'sea',recommended_last_mile_delivery:'parcel'};
 const h=new Sheet(headers,[{...base,...options.header}]),l=new Sheet(Array.from(c.SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_),[{allocation_draft_id:'H1',allocation_draft_line_id:'L1',sku:'SKU',planned_qty:80,units_per_carton:40,site_sku:'SITE'}]);
 const p=new Sheet(['shipping_plan_id']),pl=new Sheet(['shipping_plan_id']);let commits=0,submitted=[];
 const ss={getSheetByName:n=>({shipping_allocation_drafts:h,shipping_allocation_draft_lines:l,shipping_plans:p,shipping_plan_lines:pl}[n]||null)};
 c.procurementEnsureSheet_=(s,n)=>ss.getSheetByName(n);c.procurementTimestamp_=()=> '2026-11-22 12:00:00';c.SpreadsheetApp={flush:()=>{}};
 c.sadAiPlanSubmitGate16_=()=>({ok:true,aiDraftIds:[]});c.sadAiPlanSiteBlockGate16_=()=>({ok:true});c.sadAiPlanSiteBlockRecheck16_=()=>({ok:true});
 c.sadPlatformDestinationRefusal16_=()=>null;c.sadDestTypeRefusal16_=()=>null;c.sadOverseasPrecheck16_=()=>[];c.sadAttachSiteSnapshot_=()=>{};
 c.shippingPlanSiteSkuMap_=()=>({});c.shippingPlanSiteSkuFor_=()=>'';
 c.shippingPlanCommitFromLines_=(s,lines)=>{commits++;submitted=lines;return options.commitFails?{success:false,code:'DOWNSTREAM_REFUSED',data:{}}:{success:true,data:{outcome:'CREATED',plans:['P1'],plan_count:1,line_count:lines.length}};};
 c.shippingPlanReadObjects_=sh=>sh.objects();c.sadVerifyShippingPlanOutput_=()=>({ok:true,failures:[],verified_lines:submitted.length,verified_qty:80});
 const r=c.sadSubmitToShippingPlansCore_(ss,{allocation_draft_ids:['H1'],execution_key:'EXEC1',expected_versions:{H1:3},expected_line_ids:['L1'],applied_scope:{company:'Co',country:'US',marketplace:'Amazon'},...patch},['H1']);
 return {r,h,l,commits,submitted};
}
test('full submit core commits exact saved routes and advances lifecycle version',()=>{const x=run();assert.equal(x.r.success,true,JSON.stringify(x.r));assert.equal(x.commits,1);assert.equal(x.submitted[0].requested_qty,80);assert.equal(x.h.objects()[0].status,'submitted');assert.equal(x.h.objects()[0].draft_version,'4');assert(x.h.writes<=4,'expected at most four contiguous writes, got '+x.h.writes);assert.equal(x.l.writes,0);});
test('full core refuses exact selection drift before any write',()=>{const x=run({expected_line_ids:['L2']});assert.equal(x.r.code,'SUBMIT_SELECTION_CHANGED');assert.equal(x.r.zero_write,true);assert.equal(x.commits,0);assert.equal(x.h.writes,0);});
test('full core refuses stale expected version before committing',()=>{const x=run({expected_versions:{H1:2}});assert.equal(x.r.code,'SUBMIT_VALIDATION_FAILED');assert.equal(x.commits,0);assert.equal(x.h.writes,0);});
test('downstream refusal keeps draft and version unchanged',()=>{const x=run({}, {commitFails:true});assert.equal(x.r.code,'DOWNSTREAM_REFUSED');assert.equal(x.h.objects()[0].status,'draft');assert.equal(x.h.objects()[0].draft_version,3);assert.equal(x.h.writes,0);});
test('legacy caller without selection retains full-header behavior',()=>assert.equal(run({expected_line_ids:undefined}).r.success,true));
test('malformed selection is a zero-write refusal',()=>{const x=run({expected_line_ids:'L1'});assert.equal(x.r.zero_write,true);assert.equal(x.h.writes,0);});
console.log('DW2_SUBMIT_PASS '+passed+' live_business_writes=0');
