'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parts}=require('./helpers/write-command-flight-world.cjs');
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
const fixture=new Function('MKT_ID','MKT2_ID','skuOf',parts(fs.readFileSync('assets/tests/_cp2s-r2-inplace-dom-runner.js','utf8'),['fixtureWorkspace','recoLines'])+';return {fixtureWorkspace,recoLines};')('US-A','OTHER',i=>'SKU-'+i);
const us=fixture.fixtureWorkspace(2,false),au=JSON.parse(JSON.stringify(us));
for(const name of Object.keys(au))au[name].forEach(r=>{if(r.country)r.country='AU';if(r.company)r.company='FixtureAU';if(r.marketplace_id)r.marketplace_id='AU-A';if(r.marketplace_sku_id)r.marketplace_sku_id='AU-'+r.marketplace_sku_id;});
const raw={};for(const k of Object.keys(us))raw[k]=us[k].concat(au[k]);raw.sku_details=us.sku_details;
raw.warehouses=[{warehouse_id:'US-FBA',warehouse_name:'US FBA',warehouse_type:'FBA',country:'US',company:'FixtureCo'},{warehouse_id:'AU-FBA',warehouse_name:'AU FBA',warehouse_type:'FBA',country:'AU',company:'FixtureAU'}];
raw.shipments=['US','AU'].map(country=>({shipment_id:'SHIP-'+country,company:country==='US'?'FixtureCo':'FixtureAU',country,marketplace:'Amazon',status:'in_transit',eta:'2026-11-30',destination_warehouse_id:country+'-FBA'}));
raw.shipment_lines=['US','AU'].map(country=>({shipment_line_id:'LINE-'+country,shipment_id:'SHIP-'+country,sku:'SKU-0',shipment_qty:country==='US'?45:19,shipment_received_qty:0}));
const c=vm.createContext({});vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs','utf8'),c);
let checks=0;const failures=[];function ok(v,label){checks++;if(!v)failures.push(label);}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('output/inventory-site-switch-20261126',{recursive:true});try{
for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-11-26T12:00:00Z')});
 await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'+fs.readFileSync('assets/html/pages/inventory-replenishment.html','utf8'));
 for(const css of ['base.css','components.css','layout.css','responsive-foundation.css','pages/inventory-replenishment.css'])await page.addStyleTag({content:fs.readFileSync('assets/css/'+css,'utf8')});await page.addStyleTag({content:'body{margin:0;background:white}.module-section{display:block}#ops-section{padding:12px}'});
 await page.exposeFunction('sourceWorkspace',payload=>JSON.parse(JSON.stringify(c.sirWorkspaceBuild_(raw,payload))));
 await page.evaluate(()=>{window.KM_PRODUCTION_CONFIG_={endpoint:'https://script.google.com/macros/s/FIXTURE/exec'};window.KM={lifecycle:{register(){}}};window.calls=[];window.revision='R1';window.probeDelay=0;window.epoch={planning:0,exposure:0};});
 for(const file of ['assets/js/utils/inventory-compat.js','assets/js/core/supply-planning-planning-demand.js','assets/js/core/supply-planning-site-calendar.js','assets/js/core/supply-planning-active-route-classification.js','assets/js/api/operation-system-db-api.js','assets/js/pages/inventory-replenishment.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.evaluate(({raw,lines})=>{
  KM.DB.envId=()=> 'fixture';KM.DB.sourceWriteEpoch=()=>epoch;KM.DB.probeSourceRevision=async()=>{calls.push({name:'revision'});await new Promise(r=>setTimeout(r,probeDelay));return revision;};
  KM.DB.getInventoryReplenishmentGap=async scope=>{calls.push({name:'gap',scope});await new Promise(r=>setTimeout(r,50));return {success:true,data:{rows:[0,1].map(i=>({...scope,sku:'SKU-'+i,calculation_status:i?'BLOCKED':'READY',calculation_date:'2026-11-25',d90_suggested_qty:scope.country==='US'?80:120,d90_gap_qty:scope.country==='US'?78:113,note:'FORMULA=SITE_DAILY_V2 ALLOC=DAILY_3PL_V1',calculated_at:'2026-11-25 20:00:00'}))},envelope:{meta:{sourceRevision:revision,gapMaterializationHandlerVersion:'dc2-r2-d4'}}};};
  KM.api={workspaceApiActive:()=>true,getWorkspace:async(name,payload)=>{calls.push({name,payload});await new Promise(r=>setTimeout(r,50));const country=payload.scope?.country||'US';return {success:true,data:name==='recommendation'?{lines:lines.map(l=>({...l,horizonBasis:{...l.horizonBasis,avgSalesPerDay:country==='US'?7:13}}))}:await sourceWorkspace(payload),meta:{sourceRevision:revision,recommendationWorkspaceHandlerVersion:'dc2-r2-f7',horizonFormula:'SITE_DAILY_V2',calculationDate:KM.siteCalendar.localDate(Date.now(),country),calculationMonth:'2026-11',planningCycle:'RECO-2026-11'}};}};
  _irRegistry={status:'READY',model:_irAdaptScopeRegistry_({marketplaces:raw.marketplaces,countries:['US','AU']}),error:null,seq:1};
  _irReadModel=KM.DB.adaptInventoryReplenishmentWorkspace(raw);_irReadModelAt=Date.now();_irReadModelSource={..._irSourceStamp_(),server:revision};
  _irEffectiveWorkspace=()=>true;_replenDemoOn=()=>false;_irLoadCarrierPlanning_=()=>Promise.resolve();
  _irBootstrap={mode:'COALESCED'};window.choose=country=>{_irSetSelectors_({country,marketplaceId:country+'-A'});searchReplenishment();};
  window.values=()=>{const row=document.querySelector('#replenScrollBody .scroll-row[data-sku="SKU-0"]');return row?['.replen-onway-cell','.replen-avg-cell','.replen-dos-cell','.replen-suggested-cell'].map(s=>row.querySelector(s).textContent):[];};
  window.paints=[];const render=renderReplenishment;renderReplenishment=function(){const result=render.apply(this,arguments);paints.push({country:_irSearch.applied?.country,cells:values()});return result;};
 },{raw,lines:fixture.recoLines(2,7)});
 for(const country of ['US','AU','US']){const before=await page.evaluate(()=>calls.length);await page.evaluate(country=>choose(country),country);
  await page.waitForFunction(country=>_irSearch.applied?.country===country&&_irRecoState.loadedOk&&_irResultMatchesAppliedScope_(_irRecoState)&&_irMatState.loadedOk&&_irResultMatchesAppliedScope_(_irMatState)&&_irExposureStateForRender_()==='READY',country);
  console.log(width,country,await page.evaluate(before=>({values:values(),newCalls:calls.slice(before).map(c=>c.name),cache:_irRecoReadDiag_().cache,suggested:_irSuggestedQtyState_({sku:'SKU-0'})}),before));
  const cells=await page.evaluate(()=>values());ok(cells[3]?.includes(country==='US'?'80':'120'),width+' '+country+' stored Suggested Qty displayed even after site midnight');ok(cells[1]?.includes(country==='US'?'7.0':'13.0'),width+' '+country+' correct cached velocity');
  if(country==='AU')await page.evaluate(()=>{window.afterAU=calls.length;window.probeDelay=350;window.paints=[];});
 }
 ok(await page.evaluate(()=>calls.slice(afterAU).filter(c=>c.name!=='revision').length===0),width+' warm US return has zero data requests');
 ok(await page.evaluate(()=>paints[0]?.country==='US'&&paints[0].cells[0].includes('45')&&paints[0].cells[1].includes('7.0')&&paints[0].cells[3].includes('80')),width+' first warm table paint already includes all cached columns');
 const guards=await page.evaluate(()=>{
  const blocked=_irSuggestedQtyState_({sku:'SKU-1'}),row=_irMatState.bySku['SKU-0'],saved={...row};
  row.d90_suggested_qty=0;const zero=_irSuggestedQtyState_({sku:'SKU-0'});
  row.note='FORMULA=OLD';const old=_irSuggestedQtyState_({sku:'SKU-0'});
  Object.assign(row,saved);const status=_irMatState.status;_irMatState.status='READ_ERROR';const failed=_irSuggestedQtyState_({sku:'SKU-0'});_irMatState.status=status;
  return {blocked,zero,old,failed};
 });
 ok(guards.blocked.state==='NONE'&&guards.old.state==='NONE'&&guards.failed.state==='NONE',width+' blocked, obsolete formula and failed reads never publish quantities');
 ok(guards.zero.state==='READY'&&guards.zero.value===0&&guards.zero.stale,width+' dated stored zero is an explicit zero, not missing');
 await page.clock.setFixedTime(new Date('2026-11-26T04:40:00Z'));
 const isoGuard=await page.evaluate(()=>{
  const row=_irMatState.bySku['SKU-0'],saved={...row};row.calculation_date='2026-11-24T16:00:00.000Z';row.d90_suggested_qty=0;
  const state=_irSuggestedQtyState_({sku:'SKU-0'}),html=_irSuggestedCellHtml({sku:'SKU-0'});Object.assign(row,saved);return {state,html};
 });
 ok(isoGuard.state.state==='READY'&&isoGuard.state.value===0&&!isoGuard.state.stale&&isoGuard.state.calculationDate==='2026-11-25',width+' production UTC ISO date normalizes to the stored November 25 planning day');
 ok(isoGuard.html==='<span class="replen-suggested-cell__value">0</span>',width+' actual reported READY zero renders without a false stale or recalculation warning');
 await page.clock.setFixedTime(new Date('2026-11-26T12:00:00Z'));
 await page.evaluate(()=>choose('AU'));
 await page.waitForFunction(()=>_irSearch.applied?.country==='AU'&&_irResultMatchesAppliedScope_(_irRecoState));
 await page.evaluate(()=>{delete _irRecoCacheLoad()[_irRecoCacheKey({company:'FixtureCo',country:'US',marketplace:'Amazon'})];window.paints=[];window.probeDelay=0;choose('US');});
 await page.waitForFunction(()=>paints.some(p=>p.country==='US'));
 ok(await page.evaluate(()=>paints[0].cells[1].includes('7.0')&&paints[0].cells[0].includes('45')),width+' scoped display snapshot retains US metrics even when its recommendation cache needs refresh');
 await page.waitForFunction(()=>_irSearch.applied?.country==='US'&&_irRecoState.loadedOk&&_irResultMatchesAppliedScope_(_irRecoState));
 await page.evaluate(()=>{window.beforeWrite=calls.length;epoch.planning++;choose('US');});
 await page.waitForFunction(()=>calls.length>beforeWrite&&_irSearch.status==='READY'&&_irRecoState.loadedOk&&_irRecoState.source.planning===epoch.planning&&_irMatState.loadedOk&&_irMatState.source.planning===epoch.planning);
 ok(await page.evaluate(()=>calls.slice(beforeWrite).filter(c=>c.name==='recommendation').length===1&&calls.slice(beforeWrite).filter(c=>c.name==='gap').length===1),width+' a real source write refreshes the recommendation and gap exactly once');
 ok(await page.evaluate(()=>_irRecoReadDiag_().cacheHistory.some(e=>e.reason==='SOURCE_WRITTEN_SINCE')),width+' completed refresh preserves its cache invalidation reason for diagnostics');
 ok(await page.evaluate(()=>{const saved=_irWarmCellsByScope[_irAppliedScopeKey_()];saved.environment='different-environment';_irActivateWarmCells_();return _irWarmCells===null;}),width+' cached display never crosses environments');
 ok(!errors.length,width+' no browser errors '+JSON.stringify(errors));await page.screenshot({path:'output/inventory-site-switch-20261126/site-'+width+'.png',fullPage:true});await page.close();
}console.log('INVENTORY_SITE_SWITCH '+checks+' checks; failures='+JSON.stringify(failures));assert.equal(failures.length,0);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
