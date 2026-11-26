'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{parts}=require('./helpers/write-command-flight-world.cjs');
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));let checks=0;
function ok(v,label){assert(v,label);checks++;}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('output/promo-ratio-20261126',{recursive:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('about:blank');await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body>');
  await page.addStyleTag({content:fs.readFileSync('assets/css/pages/shipping-plan.css','utf8')});
  await page.evaluate(()=>{window.KM_PRODUCTION_CONFIG_={endpoint:'https://script.google.com/macros/s/FIXTURE/exec'};window.KM={};window.calls=[];});
  await page.route('https://script.google.com/**',async r=>{
   await page.evaluate(()=>calls.push('getTable'));
   // The actual adapter consumes the same getTable response envelope as Production, not a pre-normalized stub.
   const rows=Array.from({length:31},(_,i)=>({marketplace_sku_id:'M'+i,company:'ResTW',country:'AU',marketplace:'Amazon',sku:'S'+i,marketplace_sku_status:i%2?'Active':'active'})).concat({company:'OTHER',country:'AU',marketplace:'Amazon',sku:'OTHER',marketplace_sku_status:'active'},{company:'ResTW',country:'AU',marketplace:'Amazon',sku:'INACTIVE',marketplace_sku_status:'inactive'});
   await new Promise(resolve=>setTimeout(resolve,350));await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{table:'marketplace_skus',rows}})});
  });
  await page.addScriptTag({content:fs.readFileSync('assets/js/api/operation-system-db-api.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('assets/js/core/mixed-carton-packing.js','utf8')});await page.addScriptTag({content:fs.readFileSync('assets/js/utils/weekly-draft-editor.js','utf8')});
  await page.evaluate(()=>{KM.DB.envId=()=> 'env:fixture';window.opening=KM.weeklyDraftEditor.open({plan:{shippingPlanId:'P',status:'draft',company:'ResTW',country:'AU',marketplace:'Amazon'},token:'v1',values:{},lines:[{sku:'S0',shippingPlanLineId:'L',approvedQty:40,raw:{updated_at:'v1'}}],save:()=>Promise.resolve({success:true}),readback:()=>Promise.resolve()});});
  ok(await page.locator('[data-mixed]').isDisabled(),'packing is disabled while the full site catalogue loads');ok((await page.locator('[role=status]').innerText()).includes('Loading site SKUs'),'visible loading');
  await page.evaluate(()=>opening);ok((await page.locator('[role=status]').innerText()).includes('31 site SKUs'),'31 site SKUs loaded');
  await page.locator('[data-mixed]').check();await page.locator('[data-add-group]').click();const sel=page.locator('[data-groups] tbody select').first();
  ok(await sel.locator('option').count()===32,'every active site SKU is available, beyond card members');ok(await sel.locator('option[value="S30"]').count()===1,'SKU absent from original card available');ok(await sel.locator('option[value="OTHER"],option[value="INACTIVE"]').count()===0,'foreign and inactive excluded');
  await sel.selectOption('S30');ok(await page.getByLabel('Quantity S30',{exact:true}).inputValue()==='1','extra site SKU creates a shipping row');
  await page.screenshot({path:'output/promo-ratio-20261126/catalog-'+width+'.png',fullPage:true});ok(errors.length===0,JSON.stringify(errors));await page.close();
 }}finally{await browser.close();}console.log('SITE_SKU_CATALOG_BROWSER_PASS '+checks+' actual full DB adapter / raw getTable / delayed response');
})().catch(e=>{console.error(e);process.exitCode=1;});
