'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{world,scope}=require('./campaign-builder.test.cjs');
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
(async()=>{const h=world(),browser=await chromium.launch({channel:'chrome',headless:true});let saves=0;try{
 const page=await browser.newPage({viewport:{width:1200,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.exposeFunction('saveFixture',b=>{saves++;return h.call(b);});await page.exposeFunction('readFixture',s=>JSON.parse(h.c.handleCampaignBuilderGet_({scope:s}).getContent()));
 await page.setContent('<!doctype html><body>');await page.addScriptTag({content:fs.readFileSync('assets/js/core/campaign-builder.js','utf8')});
 await page.evaluate(()=>{KM.DB={envId:()=> 'fixture',getCampaignBuilder:readFixture,saveCampaignBundle:saveFixture};});await page.addScriptTag({content:fs.readFileSync('assets/js/utils/campaign-builder.js','utf8')});
 const q=id=>page.locator('[data-cb="'+id+'"]');
 let header;
 for(const sku of ['A','B']){
  await page.evaluate(scope=>KM.campaignBuilder.open({origin:'promotion',scope,lockScope:true,onSaved:()=>window.saved=true}),scope);await page.waitForFunction(()=>!document.querySelector('[data-cb="type"]').disabled);
  await q('name').fill('Winter');await q('type').selectOption('Coupon');await q('start').fill('2026-12-01');await q('end').fill('2026-12-10');await q('sku').selectOption('M'+sku);await q('add').click();await q('discount').fill('20');await q('discount-apply').click();await page.locator('[data-field="newFc"]').fill('100');
  await page.evaluate(()=>window.saved=false);await q('review').click();await q('save').click();await page.waitForFunction(()=>window.saved===true);
  assert.match(await q('status').innerText(),/^Saved:/);assert.equal(h.rows('campaigns').length,1);if(!header)header=JSON.stringify(h.rows('campaigns'));assert.equal(JSON.stringify(h.rows('campaigns')),header);await q('close').click();
 }
 assert.equal(saves,2);assert.equal(h.rows('campaign_sku_lines').length,2);assert.equal(h.rows('fc_special_events').length,2);assert.deepEqual(errors,[]);
 console.log('CAMPAIGN_APPEND_BROWSER_PASS two real UI saves, one unchanged header, both SKU/FC graphs verified');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
