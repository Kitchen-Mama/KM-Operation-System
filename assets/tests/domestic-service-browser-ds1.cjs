'use strict';
// Actual registry, adapter and page controls; synthetic master data, no network or business writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const runtime=process.env.KM_NODE_MODULES||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
const {extract}=require('./ad4/extract.cjs');
const site=path.resolve(process.env.DS1_SITE||'.');
const read=f=>fs.readFileSync(path.join(site,f),'utf8');
const names=['_execEsc','_execMethodRouteCtx','_execResolveMethods','_irMethodScope_','_execMethodOptionsHtml',
  '_irLastMileChoices_','_irLastMileCellHtml_','_irLeadTimeProfileFor_','_irComputeRouteEta','_irMethodToLeadKey'];
const parts=extract(read('assets/js/pages/inventory-replenishment.js'),n=>names.includes(n),n=>['IR_SERVICE_TO_LEAD_KEY_','IR_LABEL_TO_LEAD_KEY_'].includes(n));
assert.equal(parts.length,names.length+2);
const seed={warehouses:[{warehouse_id:'S',warehouse_code:'S',company:'ResUS',country:'US',warehouse_type:'3PL',is_active:true}],
  carriers:[{carrier_id:'CAR_BESTWAY',is_active:'Active'}],carrier_rate_cards:[],carrier_lead_times:[],
  shipment_route_templates:[{route_template_id:'SRT-DOM-BESTWAY-US-LTL-V1',carrier_id:'CAR_BESTWAY',origin_country:'US',destination_country:'US',transit_type:'truck',last_mile_delivery:'truck',is_active:false}]};
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});let pass=0;
  function check(n,c){assert(c,n);pass++;console.log('PASS '+n);}
  try{
    for(const width of [1440,390]){
      const page=await browser.newPage({viewport:{width,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>r.abort());await page.setContent('<main><select id="method" aria-label="Method"></select><div id="lm"></div><output id="eta"></output></main>');
      await page.addScriptTag({content:'window.KM={DB:{}};var _irSearch={applied:{company:"ResUS",country:"US",marketplace:"Amazon"}};function _irCarrierGet(n){return KM.methodRegistry.getLeadTimes(_irSearch.applied);}function onExecutionMethodEdit(){}'});
      for(const f of ['assets/js/core/supply-planning-country-identity.js','assets/js/api/operation-system-db-api.js','assets/js/core/method-registry.js'])await page.addScriptTag({content:read(f)});
      await page.addScriptTag({content:parts.map(p=>p.text).join('\n')});
      await page.evaluate(d=>{
        KM.methodRegistry.adopt(_irSearch.applied,KM.DB.adaptInventoryReplenishmentWorkspace(d));
        window.res=_execResolveMethods(_execMethodRouteCtx('US','US','Amazon','S',''));
        const el=document.getElementById('method');el.innerHTML=_execMethodOptionsHtml(res,'');el.disabled=!res.methods.length;
        el.addEventListener('change',()=>{document.getElementById('lm').innerHTML=_irLastMileCellHtml_(res.methods,el.value,'',null,'TEST',false);});
      },seed);
      check(width+' Method enabled without rate card',await page.locator('#method').isEnabled());
      await page.locator('#method').selectOption('truck');await page.locator('[data-field="last_mile_delivery"]').selectOption('truck');
      const result=await page.evaluate(()=>({method:document.getElementById('method').value,lastmile:document.querySelector('[data-field="last_mile_delivery"]').value,
        eta:_irComputeRouteEta('US',{shipping_method:'truck',last_mile_delivery:'truck'},'US'),facts:res.methods[0]}));
      check(width+' actual controls retain truck/truck (LTL)',result.method==='truck'&&result.lastmile==='truck');
      check(width+' actual ETA calculator stays unknown, not zero',result.eta.available===false&&result.eta.date===''&&result.eta.days===null);
      check(width+' method is explicitly unpriced, no transit profiles',result.facts.priced===false&&result.facts.profiles.length===0&&result.facts.serviceDeclarations[0].carrierId==='CAR_BESTWAY');
      check(width+' no browser exception',errors.length===0);
      await page.screenshot({path:path.resolve('output/ds1-service-20261122/control-'+width+'.png'),fullPage:true});await page.close();
    }
    console.log('DS1_BROWSER_PASS '+pass+' live=NOT_RUN');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
