'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {extract}=require('./ad4/extract.cjs');
const runtime=process.env.KM_NODE_MODULES||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
const read=f=>fs.readFileSync(f,'utf8'),parts=(f,names)=>extract(read(f),n=>names.includes(n),()=>false).map(p=>p.text).join('\n');
let passed=0;function check(n,v){assert(v,n);passed++;console.log('PASS '+n);}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('output/dw2-workflow-20261122',{recursive:true});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 await page.setContent('<main style="font:14px Arial;max-width:700px"><section id="ops-section" class="active"><h2>Execution Plan</h2><div id="shipping-methods-SKU"></div><div id="banner"></div></section><div id="details"></div><section id="shipment-grouping-section"><form data-form><fieldset data-settings><label><input type="radio" name="shipmentGrouping" value="SEPARATE">Separate</label><label><input type="radio" name="shipmentGrouping" value="SAME_COMPANY">Same Company</label><label><input type="radio" name="shipmentGrouping" value="CROSS_COMPANY">Cross Company</label><input name="actor" value="UAT"><input name="reason" value="Test"></fieldset><span data-version></span><button data-save>Save</button><button data-refresh type="button">Refresh</button><p data-status></p></form></section></main>');
 await page.addScriptTag({content:read('assets/js/utils/inventory-compat.js')});
 await page.addScriptTag({content:`var _draftDbTouched={SKU:{I:1}},_draftDbInFlight={},_irUnsavedRoutes={},IR_ROUTE_OP_STATES_={DELETING:'Deleting...',DELETE_REFUSED:'Not removed'};
 var replenAllocationDraft={bySku:{SKU:[{qty:80,client_route_instance_id:'I'}]}},cache='',cancels=0;
 window.KM={lifecycle:{register:()=>{}},partialLoader:{loadPartial:async()=>{}},DB:{getShipmentConsolidationPolicy:async()=>({success:true,policy:{mode:'SEPARATE',version:0}})}};
 function _irAckUnknownIsHeld_(){return false;}function _execSyncEmptyState_(){}function updateShippingAllocationTotal(){}function syncExpandPanelHeight(){}
 function _cancelAllocationDraftLine(){cancels++;return Promise.resolve({success:false,zero_write:true});}
 function _irClearRouteUnsaved_(){}function _replenCtx(){return {country:'US',marketplace:'Amazon'};}
 function _persistAllocationDraft(){cache=JSON.stringify(replenAllocationDraft);}var REPLEN_TARGET_DAYS=90;
 function onExecutionRouteEdit(sku){_saveAllocationDraftFromDom(sku);}function _scheduleDraftDbPersist(){}
 function _irEsc_(x){return String(x).replaceAll('&','&amp;').replaceAll('<','&lt;');}function _irRouteOpButtons_(){return '';}
 function _shEsc(x){return _irEsc_(x);}function _irRouteProvenanceOf_(){return 'USER_EXPLICIT_ADD_ROUTE';}
 `});
 await page.addScriptTag({content:parts('assets/js/pages/inventory-replenishment.js',['removeExecutionRoute','_saveAllocationDraftFromDom','_irRouteOpBannerHtml_'])});
 await page.addScriptTag({content:parts('assets/js/pages/shipping-history.js',['_shReadinessDetailsDw2_'])});
 await page.evaluate(()=>{document.getElementById('shipping-methods-SKU').innerHTML='<div class="exec-route-row" data-line-id="LOCAL-LINE" data-route-instance="I"><button onclick="removeExecutionRoute(event,\'SKU\')">Remove</button></div>';});
 await page.getByRole('button',{name:'Remove',exact:true}).click();
 check(width+' unfinished local row is removed without calling cancellation',await page.evaluate(()=>cancels===0&&document.querySelectorAll('.exec-route-row').length===0));
 check(width+' actual DOM collector removes unfinished row from model and recovery cache',await page.evaluate(()=>!replenAllocationDraft.bySku.SKU&&!JSON.parse(cache).bySku.SKU));
 check(width+' discarded local identity is no longer queued',await page.evaluate(()=>!_draftDbTouched.SKU.I));
 await page.evaluate(()=>{_irUnsavedRoutes={'line:L':{sku:'SKU',state:'DELETE_REFUSED',lineId:'L'}};document.getElementById('banner').innerHTML=_irRouteOpBannerHtml_(['line:L']);document.getElementById('details').innerHTML=_shReadinessDetailsDw2_({reason:'DOCUMENT_FIELD_CONTRACT_INVALID',class_key:'SHIPMENT_DETAIL',problems:['SKU (List 1): DOCUMENT_TOKEN_NOT_IN_TEMPLATE'],detail:[{check:'ROOT_FOLDER',diagnostic:{code:'GOOGLE_AUTHORIZATION_REQUIRED',message:'Permission to call DriveApp is required.'}}]});});
 check(width+' failed deletion does not tell user to keep waiting',(await page.locator('#banner').innerText()).includes('needs review'));
 check(width+' verbose database narration is absent',!(await page.locator('#banner').innerText()).includes('database confirms'));
 check(width+' actual field problem and scope diagnosis render', (await page.locator('#details').innerText()).includes('DOCUMENT_TOKEN_NOT_IN_TEMPLATE')&&(await page.locator('#details').innerText()).includes('GOOGLE_AUTHORIZATION_REQUIRED'));
 await page.addScriptTag({content:read('assets/js/pages/shipment-grouping.js')});await page.evaluate(()=>KM.shipmentGrouping.mount());
 check(width+' grouping read enables settings',await page.locator('[data-settings]').isEnabled());
 check(width+' grouping shows current policy version',(await page.locator('[data-version]').innerText()).includes('Version 0'));
 await page.evaluate(()=>{
  window._irSearch={applied:{marketplaceId:'SITE'}};window.stockReads=0;window.refuseStock=true;
  KM.DB.factoryStockGuardGet=async()=>{stockReads++;if(refuseStock)return {success:false,code:'FACTORY_READ_FAILED'};
   return {success:true,data:{pool_keys:[],byPool:{},inventory_snapshot_fingerprint:'fp',tables_read:['warehouses','factory_stock','shipping_allocation_drafts','shipping_allocation_draft_lines','shipping_plans','shipping_plan_lines'],display14:{display_only:true,revision:'fresh',stock:{success:true,data:{factory_stock:[],warehouses:[],counts:{factory_stock:0,warehouses:0},capped:{factory_stock:false,warehouses:false}},meta:{onlyRequested:['factory_stock','warehouses']}}}}};};
 });
 await page.addScriptTag({content:read('assets/js/core/factory-availability-feedback.js')});await page.evaluate(()=>KM.factoryAvailability.ensure(true));
 check(width+' refused stock is unknown, not zero',await page.evaluate(()=>KM.factoryAvailability.status()==='FAILED'&&KM.factoryAvailability.rows()===null));
 await page.evaluate(()=>{document.getElementById('ops-section').classList.remove('active');KM.factoryAvailability.invalidate();window.refuseStock=false;});
 await page.waitForTimeout(300);await page.evaluate(()=>{document.getElementById('ops-section').classList.add('active');return KM.factoryAvailability.resume();});
 check(width+' returning after a write invalidation fetches a fresh stock snapshot',await page.evaluate(()=>KM.factoryAvailability.status()==='READY'&&stockReads===2));
 await page.evaluate(()=>{window.refuseStock=true;return KM.factoryAvailability.ensure(true);});await page.evaluate(()=>{window.refuseStock=false;return KM.factoryAvailability.resume();});
 check(width+' page resume recovers prior FAILED stock without browser reload',await page.evaluate(()=>KM.factoryAvailability.status()==='READY'&&stockReads===4));
 await page.clock.install();
 await page.evaluate(()=>{window.goodStock=KM.DB.factoryStockGuardGet;KM.DB.factoryStockGuardGet=()=>new Promise(resolve=>{window.finishStock=resolve;});window.delayedRead=KM.factoryAvailability.ensure(true);});
 await page.clock.fastForward(31000);
 check(width+' slow stock read has a bounded FAILED display',await page.evaluate(()=>KM.factoryAvailability.status()==='FAILED'));
 await page.evaluate(()=>KM.factoryAvailability.resume());
 await page.evaluate(async()=>{KM.DB.factoryStockGuardGet=window.goodStock;window.finishStock(await window.goodStock());});
 await page.waitForFunction(()=>KM.factoryAvailability.status()==='READY');
 check(width+' requested re-entry refresh resumes after the old timed-out network settles',await page.evaluate(()=>KM.factoryAvailability.status()==='READY'));
 check(width+' no horizontal page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 check(width+' no browser runtime exceptions',errors.length===0);
 await page.screenshot({path:'output/dw2-workflow-20261122/browser-'+width+'.png',fullPage:true});await page.close();
 }}finally{await browser.close();}console.log('DW2_BROWSER_PASS '+passed+' live_business_writes=0');})().catch(e=>{console.error(e);process.exitCode=1;});
