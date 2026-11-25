'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {extract}=require('./ad4/extract.cjs');
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
const read=p=>fs.readFileSync(p,'utf8'),out=path.resolve('output/mixed-cartons-20261125');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});let assertions=0;
 try{for(const viewport of[{width:1280,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('about:blank');await page.setContent('<!doctype html><html><head><style>body{margin:16px;font:14px Arial;color:#1e293b}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #dbe3e9}</style></head><body><main><h2>Shipping Details</h2><table id="details"></table></main></body></html>');
  await page.addStyleTag({content:read('assets/css/pages/shipping-plan.css')});
  await page.addScriptTag({content:read('assets/js/core/mixed-carton-packing.js')});
  await page.evaluate(()=>{
   window.KM.DB={envId:()=> 'env:mixed-test',loadScopedTables:async()=>({marketplaceSkus:['A','B','C'].map(sku=>({sku,company:'KM',country:'US',marketplace:'Amazon',raw:{marketplace_sku_status:'active'}}))})};
   window.saved=[];window.reads=0;window.testOpts={plan:{shippingPlanId:'P1',status:'draft',company:'KM',country:'US',marketplace:'Amazon'},token:'2026-11-25 10:00:00',values:{},
    lines:['A','B'].map(sku=>({sku,shippingPlanLineId:sku,approvedQty:40,raw:{updated_at:'2026-11-25 10:00:00'}})),
    save:async body=>{window.saved.push(body);return {success:true};},readback:async()=>{window.reads++;return {};}};
  });
  await page.addScriptTag({content:read('assets/js/utils/weekly-draft-editor.js')});
  await page.evaluate(()=>KM.weeklyDraftEditor.open(window.testOpts));
  await page.locator('[data-mixed]').check();await page.locator('[data-add-group]').click();
  let f=page.locator('[data-groups] fieldset').nth(0);
  await f.locator('tbody select').nth(0).selectOption('A');await f.locator('tbody select').nth(1).selectOption('B');
  await f.locator('tbody input').nth(0).fill('20');await f.locator('tbody input').nth(1).fill('20');await f.locator('[data-rep]').selectOption('A');
  await page.locator('[data-add-group]').click();f=page.locator('[data-groups] fieldset').nth(1);
  await f.locator('tbody select').nth(0).selectOption('A');await f.locator('tbody select').nth(1).selectOption('B');
  await f.locator('tbody input').nth(0).fill('21');await f.locator('tbody input').nth(1).fill('20');await f.locator('[data-rep]').selectOption('B');
  await page.locator('[data-save]').click();assert.match(await page.locator('[role=status]').innerText(),/exceeds/);assert.equal(await page.evaluate(()=>saved.length),0);assertions+=2;
  await f.locator('tbody input').nth(0).fill('20');
  await page.locator('dialog').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:path.join(out,'editor-'+viewport.width+'.png'),fullPage:true});
  const overflow=await page.locator('dialog').evaluate(el=>({outside:el.getBoundingClientRect().left<0||el.getBoundingClientRect().right>innerWidth,overflow:el.scrollWidth>el.clientWidth+1}));
  assert.deepEqual(overflow,{outside:false,overflow:false});assertions++;
  await page.locator('[data-save]').click();await page.waitForFunction(()=>!document.querySelector('dialog'));
  const saved=await page.evaluate(()=>({body:saved[0],calls:saved.length,reads}));assert.equal(saved.calls,1);assert.equal(saved.reads,1);assert.equal(saved.body.mixed_cartons.length,2);assert.equal(saved.body.packing_version,'MIXED_CARTONS_V1');assert.equal(saved.body.line_edits.length,2);assertions+=5;
  // Render the real Plan and Shipment row functions using persisted canonical line facts.
  for(const [file,name]of[['shipping-plan.js','_spPackingRows_'],['shipping-history.js','_shPackingRows_']]){
   await page.addScriptTag({content:extract(read('assets/js/pages/'+file),n=>n===name,()=>false).map(p=>p.text).join('\n')});
  }
  await page.evaluate(()=>{
   window._spEsc=window._shEsc=v=>String(v).replace(/[&<>"']/g,'');window._spLineDisplay=()=>({currentStock:100,avgSales:2,daysOfSupply:50});
   const core=KM.mixedCartons,packed=core.annotate(['A','B'].map(id=>({id,sku:id,quantity:40,unitsPerCarton:40,itemKg:.2,series:'S1',box:{length:50,width:40,height:30,unit:'cm',grossKg:10}})),[{id:'M1',representativeId:'A',members:[{lineId:'A',quantity:10},{lineId:'B',quantity:20}]},{id:'M2',representativeId:'B',members:[{lineId:'A',quantity:10},{lineId:'B',quantity:20}]}]);
   window.uiLines=packed.map(l=>({shippingPlanLineId:l.id,shipmentLineId:'SH-'+l.id,sku:l.sku,approvedQty:l.quantity,qty:l.quantity,cartonQty:l.ownedCartons,cbm:l.cbm,shipmentCartonCbm:l.cbm,grossWeight:l.grossKg,netWeight:l.netKg,note:l.note}));
   document.querySelector('#details').innerHTML='<thead><tr><th>SKU</th><th>Current stock</th><th>Avg Sales</th><th>Supply days</th><th>Shipping qty</th><th>Cartons</th></tr></thead><tbody>'+_spPackingRows_(uiLines,{}, {})+'</tbody>';
  });
  assert.equal(await page.locator('#details tbody tr').count(),5);assert.equal(await page.locator('#details td[rowspan="2"]').count(),2);assertions+=2;
  await page.screenshot({path:path.join(out,'plan-'+viewport.width+'.png'),fullPage:true});
  await page.evaluate(()=>{document.querySelector('#details').innerHTML='<thead><tr><th>SKU</th><th>Qty</th><th>Cartons</th><th>CBM</th><th>Gross</th><th>Net</th><th>Start</th><th>End</th></tr></thead><tbody>'+_shPackingRows_(uiLines)+'</tbody>';});
  assert.equal(await page.locator('#details tbody tr').count(),5);assert.equal(await page.locator('#details input').count(),0);assertions+=2;
  await page.screenshot({path:path.join(out,'shipment-'+viewport.width+'.png'),fullPage:true});
  assert.deepEqual(errors,[]);assertions++;await page.close();
 }
 console.log('MIXED_CARTON_BROWSER '+assertions+' assertions passed; desktop/mobile screenshots in '+out);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
