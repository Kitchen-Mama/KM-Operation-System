'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {world,fixture,scope}=require('./campaign-builder.test.cjs');
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
const read=f=>fs.readFileSync(f,'utf8');let checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('output/operations-repair-20261126',{recursive:true});
 try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),h=world(),data=fixture(),errors=[],alerts=[];let saves=0,loseAck=false,statusReads=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.accept();});
  await page.exposeFunction('fixtureSave',b=>{saves++;const r=h.call(b);if(loseAck){loseAck=false;throw Error('Simulated lost acknowledgement');}return r.success?r:{success:false,error:{message:r.error,details:{zero_write:r.writes_performed===0,issues:r.issues}}};});
  await page.exposeFunction('fixtureRead',s=>JSON.parse(h.c.handleCampaignBuilderGet_({scope:s}).getContent()));
  await page.exposeFunction('fixtureStatus',id=>{statusReads++;return JSON.parse(h.c.handleCampaignBuilderStatus_({request_id:id}).getContent());});
  await page.setContent('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body>'+read('assets/html/pages/fc-summary.html')+'</body></html>');
  for(const f of ['assets/css/base.css','assets/css/components.css','assets/css/layout.css','assets/css/responsive-foundation.css','assets/css/pages/fc-overview.css','assets/css/pages/campaign-risk.css','assets/css/pages/campaign-builder.css'])await page.addStyleTag({content:read(f)});
  await page.addScriptTag({content:read('assets/js/core/campaign-builder.js')});
  await page.evaluate(({data,scope})=>{
   const masters=[{...scope,marketplaceId:scope.marketplace_id,status:'active'}];
   KM.DB={envId:()=> 'fixture',getMarketplaceSkus:()=>data.marketplaceSkus.map(r=>({...r,raw:r,marketplaceSkuId:r.marketplace_sku_id,marketplaceSkuStatus:r.marketplace_sku_status})),getMarketplaces:()=>masters,getSkuDetails:()=>data.skuDetails,getFcRegularForecast:()=>[],getFcSpecialEvents:()=>[],getCampaigns:()=>[],getCampaignSkuLines:()=>[],getPricingList:()=>data.pricingList,saveCampaignBundle:fixtureSave,getCampaignBuilder:fixtureRead,getCampaignBuilderStatus:fixtureStatus};window.testData=data;window.testMasters=masters;
  },{data,scope});
  await page.addScriptTag({content:read('assets/js/pages/fc-summary.js')});await page.addScriptTag({content:read('assets/js/utils/campaign-builder.js')});
  await page.evaluate(()=>{
   // Read-boundary fixtures; the standard UI, calculations and save path are the real page code.
   _fcPrereqNeeded_=()=>false;_fcGetMarketplaces=()=>testMasters;_fcGetRegularForecast=()=>[];_evtBuilderEventRows_=()=>[];_evtPricingPending_=()=>false;_fcPricingRows_=()=>testData.pricingList.map(r=>({...r,...testMasters[0],marketplaceSkuId:r.marketplace_sku_id}));_evtEnsurePricing_=()=>Promise.resolve();
   _evtMarketplaceIdentity_=()=>({state:FC_ID_.READY_UNIQUE,marketplaceId:'SITE1'});_fcAfterWriteScoped_=(_s,cb)=>cb();
   document.getElementById('fc-summary-section').classList.add('active');document.getElementById('fc-summary-section').style.display='block';openEventModal();
  });
  eq(await page.locator('.cb-dialog').count(),0);eq(await page.locator('#fc-add-event-modal').isVisible(),true);
  eq(await page.locator('#event-assist-method option').evaluateAll(es=>es.map(e=>e.value)),['growth','adjust','manual']);
  eq(await page.locator('#event-assist-adjust-type option').evaluateAll(es=>es.map(e=>e.value)),['percent','fixed']);
  eq(await page.locator('#event-promotion-type option').count(),6);
  const bounds=await page.locator('#fc-add-event-modal').boundingBox();assert(Math.abs(bounds.x+bounds.width/2-viewport.width/2)<2);assert(Math.abs(bounds.y+bounds.height/2-viewport.height/2)<2);checks+=2;
  await page.locator('#event-start-date').fill('2027-03-01');await page.locator('#event-end-date').fill('2027-03-10');
  await page.locator('#event-builder-mode .fc-mode-pill').nth(1).click();await page.locator('#event-assist-method').selectOption('manual');await page.evaluate(()=>_evtBuildGroups());
  eq(await page.locator('#event-window-confirm-row').isVisible(),false);
  if(viewport.width>600){const input=await page.locator('#event-discount-pct').boundingBox(),button=await page.locator('#event-discount-row button').boundingBox();assert(Math.abs(input.y-button.y)<2);assert(Math.abs(input.height-button.height)<2);checks+=2;}
  eq(await page.evaluate(()=>_evtGroups.flatMap(g=>g.rows).length),2);
  await page.evaluate(()=>{_evtBaseFcForSku=()=>200;_evtGrowthBaseForSku=()=>100;_evtPopulateBaseCampaigns=()=>{document.getElementById('event-assist-base-campaign').innerHTML='<option value="OLD">Old campaign</option>';};});
  await page.locator('#event-assist-method').selectOption('growth');await page.locator('#event-assist-growth').fill('10');await page.evaluate(()=>_evtApplyForecastAssist());eq(await page.evaluate(()=>_evtGroups[0].rows[0].newFc),110);
  await page.locator('#event-assist-method').selectOption('adjust');await page.locator('#event-assist-base-year').fill('2026');await page.locator('#event-assist-adjust-value').fill('20');await page.evaluate(()=>_evtApplyForecastAssist());eq(await page.evaluate(()=>_evtGroups[0].rows[0].newFc),240);
  await page.locator('#event-assist-adjust-type').selectOption('fixed');await page.locator('#event-assist-adjust-value').fill('-10');await page.evaluate(()=>_evtApplyForecastAssist());eq(await page.evaluate(()=>_evtGroups[0].rows[0].newFc),190);
  await page.locator('#event-assist-method').selectOption('manual');await page.locator('.evt-line-fc').first().fill('75');await page.locator('.evt-line-fc').last().fill('25');await page.locator('.evt-line-fc').last().blur();
  await page.evaluate(()=>saveEventUpdate());eq(saves,0);assert(alerts.at(-1).includes('Promotion Type'));checks++;
  await page.locator('#event-promotion-type').selectOption('Coupon');await page.locator('#event-discount-pct').fill('20');await page.evaluate(()=>_evtApplyDiscount());
  await page.screenshot({path:'output/operations-repair-20261126/special-'+viewport.width+'.png',fullPage:true});
  await page.evaluate(()=>saveEventUpdate());assert.equal(saves,1,JSON.stringify(alerts));checks++;eq(h.rows('campaigns')[0]?.promotion_type,'Coupon');eq(h.rows('fc_special_events').map(r=>r.fc_qty),[75,25]);eq(await page.locator('#fc-add-event-modal').isVisible(),false);
  if(viewport.width>600){
   loseAck=true;
   await page.evaluate(async()=>{const pending={...testMasters[0],marketplace_id:'SITE1',promotion_type:'Coupon',event_flag:'Normal',start_date:'2027-04-01',end_date:'2027-04-10',campaign_name:'April'};window.recoveryCase=pending;await _evtCanonicalCreate_(pending,[{marketplaceSkuId:'MA',sku:'A',regularPrice:100,currency:'USD',dealPrice:80,fcQty:50}]);});
   eq(saves,2);eq(await page.evaluate(()=>!!_evtCanonicalPending_),true);eq(h.rows('campaigns').length,2);
   await page.evaluate(()=>_evtCanonicalCreate_(recoveryCase,[]));eq(saves,2);eq(statusReads,1);eq(await page.evaluate(()=>_evtCanonicalPending_),null);eq(h.rows('fc_special_events').length,3);
  }
  await page.evaluate(scope=>KM.campaignBuilder.open({origin:'promotion',scope,lockScope:true}),scope);await page.waitForFunction(()=>!document.querySelector('[data-cb="type"]').disabled);
  eq(await page.locator('[data-cb="method"] option').evaluateAll(es=>es.map(e=>e.value)),['manual','history']);
  const cb=await page.locator('.cb-dialog').boundingBox();assert(Math.abs(cb.x+cb.width/2-viewport.width/2)<2);assert(Math.abs(cb.y+cb.height/2-viewport.height/2)<2);checks+=2;
  if(viewport.width>600){const input=await page.locator('[data-cb="discount"]').boundingBox(),button=await page.locator('[data-cb="discount-apply"]').boundingBox();assert(Math.abs(input.y-button.y)<2);assert(Math.abs(input.height-button.height)<2);checks+=2;}
  await page.screenshot({path:'output/operations-repair-20261126/promotion-'+viewport.width+'.png',fullPage:true});await page.locator('[data-cb="close"]').click();eq(errors,[]);await page.close();
 }
 console.log('OPERATIONS_REPAIR_BROWSER_PASS checks='+checks+' real page scripts, full application CSS, standard Special Event 4 calculations, separate Promotion methods, canonical GAS fixture');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
