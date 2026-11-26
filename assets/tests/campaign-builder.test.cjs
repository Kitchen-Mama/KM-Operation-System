'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../js/core/campaign-builder'),PD=require('../js/core/supply-planning-planning-demand'),HP=require('../js/core/supply-planning-horizon-projection');
const {createWorld}=require('./helpers/order-mainline-world.cjs');
const scope={marketplace_id:'SITE1',company:'KM',country:'US',marketplace:'Amazon',promotion_type:'Coupon',event_flag:'Normal',start_date:'2026-12-01',end_date:'2026-12-10'};
function fixture(){return {marketplaceSkus:['A','B'].map(sku=>({...scope,marketplace_sku_id:'M'+sku,sku,marketplace_sku_status:'active'})),skuDetails:['A','B'].map(sku=>({sku,series:'S1',category:'C1'})),pricingList:['A','B'].map(sku=>({marketplace_sku_id:'M'+sku,regular_price:100,resolvedRegularPrice:100,currency:'USD'})),campaigns:[],campaignSkuLines:[],fcSpecialEvents:[]};}
const row=(sku='A')=>({marketplace_sku_id:'M'+sku,sku,regular_price:100,price_units:'USD',promo_price:80,fc_qty:100});
function world(){const h=createWorld(),c=h.c;c.KMCB=C;c.KMSC=require('../js/core/supply-planning-site-calendar');
 for(const n of ['14_fc_write_handlers.gs','20_campaign_write_handlers.gs','73_api_v1_pricing_write.gs','78_api_v1_import_batch.gs','79_api_v1_po_import.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+n,'utf8'),c,{filename:n});
 c.SpreadsheetApp.openById=()=>h.ss;c.prodExpectedDbId_=()=> 'FIXTURE';c.jsonResponse_=o=>({getContent:()=>JSON.stringify(o)});
 h.sheet('marketplaces',['marketplace_id','company','country','marketplace','status'],[{...scope,status:'active'}]);
 const data=fixture();for(const [n,k]of [['marketplace_skus','marketplaceSkus'],['sku_details','skuDetails'],['pricing_list','pricingList']])h.sheet(n,Object.keys(data[k][0]),data[k]);
 h.sheet('campaigns',c.CAMPAIGNS_HEADERS_);h.sheet('campaign_sku_lines',c.CAMPAIGN_SKU_LINES_HEADERS_);h.sheet('fc_special_events',c.FC_SPECIAL_EVENTS_HEADERS_);
 for(const n of ['campaigns','campaign_sku_lines','fc_special_events','import_batch_changes']){if(h.tables[n])h.tables[n].deleteRows=function(row,count){for(let i=0;i<count;i++)this.deleteRow(row);};}
 h.sheet('import_batches',c.IMB_RECEIPT_HEADERS_);h.sheet('import_batch_changes',c.IMB_CHANGE_HEADERS_);
 return Object.assign(h,{call:b=>JSON.parse(c.handleCampaignBuilderSave_(b).getContent())});}
const body=()=>({request_id:'CAMPAIGN-TEST-0001',builder_version:C.VERSION,scope:{...scope},lines:[row(),row('B')]});
const business=h=>JSON.stringify(['campaigns','campaign_sku_lines','fc_special_events'].map(n=>h.rows(n)));
test('Normal creates one canonical campaign, lines, FC and replay is idempotent',()=>{const h=world(),r=h.call(body());assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.data.readback_verified,true);
 assert.equal(h.rows('campaigns').length,1);assert.equal(h.rows('campaign_sku_lines').length,2);assert.equal(h.rows('fc_special_events').length,2);assert.equal(h.rows('fc_special_events')[0].event_name,'Normal');
 const before=business(h),again=h.call(body());assert.equal(again.success,true,JSON.stringify(again));assert.equal(again.replayed,true);assert.equal(business(h),before);
});
test('new Normal window in same year allowed; inclusive overlap / different type refused',()=>{const h=world();assert(h.call(body()).success);let b=body();b.request_id+='2';b.scope.start_date='2026-12-11';b.scope.end_date='2026-12-12';assert.equal(h.call(b).success,true);
 b=body();b.request_id+='3';b.scope.promotion_type='Best Deal';b.scope.start_date='2026-12-10';b.scope.end_date='2026-12-13';const before=business(h),r=h.call(b);assert.equal(r.success,false);assert.match(JSON.stringify(r),/CAMPAIGN_SKU_DATE_OVERLAP/);assert.equal(business(h),before);
});
for(const [name,change,code]of [
 ['missing price',h=>h.tables.pricing_list.grid.splice(1,1),'MISSING_PRICING_LIST_ROW'],
 ['changed price',h=>h.put('pricing_list','marketplace_sku_id','MA','regular_price',120),'CAMPAIGN_PRICE_CHANGED'],
 ['inactive sku',h=>h.put('marketplace_skus','marketplace_sku_id','MA','marketplace_sku_status','inactive'),'CAMPAIGN_SKU_OUT_OF_SCOPE']
])test('server refuses '+name+' with zero business writes',()=>{const h=world();change(h);const before=business(h),r=h.call(body());assert.equal(r.success,false,JSON.stringify(r));assert.match(JSON.stringify(r),new RegExp(code));assert.equal(business(h),before);});
for(const qty of [0,-1,1.5,true,'abc','   x',Infinity])test('invalid FC '+qty+' is refused, not silently skipped',()=>{const d=fixture();assert.throws(()=>C.validate(scope,[{...row(),fc_qty:qty}],d),/CAMPAIGN_FC_INVALID/);});
test('blank FC is explicitly skipped; missing currencies never turn into USD or zero',()=>{let d=fixture();assert.equal(C.validate(scope,[row(),{...row('B'),fc_qty:''}],d).skipped,1);d.pricingList[0].currency='';assert.throws(()=>C.validate(scope,[row()],d),/MISSING_PRICING/);});
test('same-site, same-type past campaign selection and both independent percentages',()=>{const d=fixture();d.campaigns=[{...scope,campaign_id:'OLD',start_date:'2026-11-01',end_date:'2026-11-10'}];d.campaignSkuLines=[{...row(),campaign_id:'OLD',campaign_sku_line_id:'L1',regular_price:80,promo_price:60}];d.fcSpecialEvents=[{campaign_id:'OLD',campaign_sku_line_id:'L1',fc_qty:40}];
 const cat=C.catalog(d,scope),r=C.applyHistory(d,scope,'OLD','Coupon',scope.start_date,'2026-11-25',cat,25,10);assert.equal(r[0].newFc,50);assert.equal(r[0].dealPrice,90);assert.equal(r[0].baseFc,40);
 assert.equal(C.applyHistory(d,scope,'OLD','Coupon',scope.start_date,'2026-11-25',cat,0,'')[0].dealPrice,75);
 assert.throws(()=>C.applyHistory(d,{...scope,company:'OTHER'},'OLD','Coupon',scope.start_date,'2026-11-25',cat,0,0),/SCOPE_MISMATCH/);
 assert.equal(C.history(d,scope,'Best Deal',scope.start_date,'2026-11-25').length,0);
 assert.equal(C.history(d,scope,'Coupon','2026-11-05','2026-11-25').length,0);
 d.fcSpecialEvents=[];assert.equal(C.history(d,scope,'Coupon',scope.start_date,'2026-11-25').length,0);assert.equal(C.missingForecasts(d,scope,'2026-11-05').length,1);
});
test('journal failure restores all three tables and keeps rolled-back receipt',()=>{const h=world(),before=business(h);let failed=false;h.tables.fc_special_events.beforeWrite=()=>{if(!failed){failed=true;throw Error('Injected FC write failure');}};
 const r=h.call(body());assert.equal(r.code,'IMPORT_FAILED_ROLLED_BACK',JSON.stringify(r));assert.equal(business(h),before);assert.equal(h.rows('import_batches')[0].status,'FAILED_ROLLED_BACK');
});
test('client cannot change a request id payload after commit; stale preview cannot commit',()=>{const h=world();assert(h.call(body()).success);const before=business(h),b=body();b.lines[0].fc_qty=200;assert.equal(h.call(b).code,'IMPORT_BATCH_CONFLICT');assert.equal(business(h),before);});
test('Normal and BFCM authoring results enter the actual Site Inventory daily projection once',()=>{for(const flag of ['Normal','BFCM']){const h=world(),b=body();b.scope.event_flag=flag;assert(h.call(b).success);
 const selling=PD.scopedSpecialEventSellingDays(h.rows('fc_special_events'),scope,'A','2026-11-30');assert.equal(selling.length,1);assert.equal(selling[0].remainingQty,100);
 for(const demandMode of ['sales_driven','forecast_driven']){const r=HP.projectHorizons({calculationDate:'2026-11-30',demandMode,avgSalesPerDay:0,regularFcByMonth:{'2026-12':0,'2027-01':0,'2027-02':0},openingSupplyQty:0,incomingEvents:[],unitsPerCarton:40,specialEventTiming:'selling_days',specialEventDemands:selling});assert.equal(r.ready,true);assert.equal(r.horizons[0].gapQty,100);assert.equal(r.horizons[0].suggestedOrderQty,120);}}
});
test('auto prices resolve through the existing price owner; NA and duplicate identities fail closed',()=>{
 const h=world(),t=h.tables.pricing_list;t.grid[0].push('auto_regular_price');t.grid.slice(1).forEach(r=>{r[t.grid[0].indexOf('regular_price')]='';r.push(100);});assert.equal(h.call(body()).success,true);
 const d=fixture();d.pricingList[0].resolvedRegularPrice=null;assert.throws(()=>C.validate(scope,[row()],d),/MISSING_PRICING/);
 d.marketplaceSkus.push({...d.marketplaceSkus[0],marketplace_sku_id:'OTHER'});assert.throws(()=>C.catalog(d,scope),/IDENTITY_AMBIGUOUS/);
});
test('contended lock cannot create a partial campaign',()=>{const h=world(),before=business(h);h.c.LockService.getScriptLock=()=>({tryLock:()=>false,releaseLock(){}});const r=h.call(body());assert.equal(r.code,'LOCK_UNAVAILABLE');assert.equal(business(h),before);});
test('unverified rollback stays unknown and blocks another same-site create',()=>{const h=world();let failed=false;h.tables.fc_special_events.beforeWrite=()=>{if(!failed){failed=true;throw Error('Injected failure');}};h.tables.campaign_sku_lines.deleteRows=()=>{throw Error('Undo unavailable');};
 const r=h.call(body());assert.equal(r.code,'IMPORT_OUTCOME_UNKNOWN');const b=body();b.request_id+='2';b.scope.start_date='2027-01-01';b.scope.end_date='2027-01-10';const again=h.call(b);assert.equal(again.success,false);assert.match(JSON.stringify(again),/CAMPAIGN_PREVIOUS_OUTCOME_UNKNOWN/);
});
test('real date windows reject impossible/leap dates, preserve cross-year Normal identity and positive rounded money',()=>{
 const d=fixture();assert.throws(()=>C.validate({...scope,start_date:'2027-02-29',end_date:'2027-03-02'},[row()],d),/DATE_INVALID/);
 assert.equal(C.validate({...scope,start_date:'2026-12-29',end_date:'2027-01-02'},[row()],d).end,'2027-01-02');
 d.pricingList[0].resolvedRegularPrice=.001;assert.throws(()=>C.validate(scope,[{...row(),regular_price:.001,promo_price:.001}],d),/PROMO_PRICE_INVALID/);
 const h=world(),c=h.c,k=(campaign)=>c.fcSeUniquenessKey_(f=>({...scope,sku:'A',event_name:'Normal',year:2026,campaign_id:campaign})[f]);assert.notEqual(k('A'),k('B'));
});
test('real Promotion entry uses canonical save UI and merges only the saved site without erasing other sites',()=>{
 const {parts}=require('./helpers/write-command-flight-world.cjs'),source=fs.readFileSync('assets/js/pages/campaign-risk.js','utf8'),api=fs.readFileSync('assets/js/api/operation-system-db-api.js','utf8');let options;
 const c={window:{KM:{campaignBuilderCore:C,campaignBuilder:{open:o=>{options=o;}}}},CampaignRiskState:{...scope,marketplaceId:'SITE1'},promotionMockData:[],crScopeReady:()=>true,crRenderScoped(){},_CR_SHIM:{},
 _crRiskEvidence:{events:[]},_crReadModel:{campaigns:[{campaignId:'OTHER',company:'OTHER',country:'US',marketplace:'Amazon'}],campaignSkuLines:[{campaignId:'OTHER',campaignSkuLineId:'OTHER-L'}]}};
 vm.runInNewContext(parts(api,['normalizeCampaignRecord','normalizeCampaignSkuLineRecord','normalizeFcSpecialEventRecord','_fcParseEventPeriodDates'])+'\n'+parts(source,['_crEqv','openAddPromotionModal']),c);c.openAddPromotionModal();assert.equal(options.origin,'promotion');assert.equal(options.scope.marketplace_id,'SITE1');
 options.onSaved({campaigns:[{...scope,campaign_id:'NEW'}],campaignSkuLines:[{campaign_id:'NEW',campaign_sku_line_id:'NEW-L',sku:'A'}],fcSpecialEvents:[{...scope,event_fc_id:'E',sku:'A'}]});assert.equal(c._crReadModel.campaigns.length,2);assert.equal(c._crReadModel.campaignSkuLines.length,2);assert.equal(c._crReadModel.campaigns[0].campaignId,'OTHER');assert.equal(c._CR_SHIM,null);assert.equal(c._crRiskEvidence.events.length,1);
});
module.exports={world,body,fixture,scope,row};

test('same named campaign accepts disjoint SKU additions, preserves header and replays without duplicate FC',()=>{
 const h=world(),first=body();first.scope.campaign_name='Winter';first.lines=[row('A')];assert(h.call(first).success);
 const header=JSON.stringify(h.rows('campaigns')),a=JSON.stringify(h.rows('fc_special_events')[0]);
 const second={...first,request_id:'CAMPAIGN-APPEND-B',lines:[row('B')]},r=h.call(second);
 assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.data.reused_campaign,true);assert.equal(r.data.added_sku_count,1);assert.equal(r.data.sku_count,2);assert.equal(r.data.fc_count,2);
 assert.equal(JSON.stringify(h.rows('campaigns')),header);assert.equal(JSON.stringify(h.rows('fc_special_events')[0]),a);
 const before=business(h);assert(h.call(second).replayed);assert.equal(business(h),before);
 assert.equal(h.call({...second,request_id:'CAMPAIGN-APPEND-DUP'}).success,false);assert.equal(business(h),before);
});
test('append with different name refuses; failed append restores original campaign graph',()=>{
 const h=world(),first=body();first.scope.campaign_name='Winter';first.lines=[row('A')];assert(h.call(first).success);
 const before=business(h),second={...first,request_id:'CAMPAIGN-APPEND-FAIL',scope:{...first.scope,campaign_name:'Different'},lines:[row('B')]};
 assert.match(JSON.stringify(h.call(second)),/CAMPAIGN_HEADER_CONFLICT/);assert.equal(business(h),before);
 second.request_id+='2';second.scope.campaign_name='Winter';let failed=false;h.tables.fc_special_events.beforeWrite=()=>{if(!failed){failed=true;throw Error('Append failure');}};
 assert.equal(h.call(second).code,'IMPORT_FAILED_ROLLED_BACK');assert.equal(business(h),before);
});
