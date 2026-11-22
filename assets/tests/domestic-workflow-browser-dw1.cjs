'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const runtime=process.env.KM_NODE_MODULES||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]})),{extract}=require('./ad4/extract.cjs');
const read=f=>fs.readFileSync(f,'utf8'),parts=(file,names)=>extract(read(file),n=>names.includes(n),()=>false).map(p=>p.text).join('\n');
const vocab={carriers:[{carrier_id:'CAR_AMAZON_PARTNERED',carrier_name:'Amazon',services_known:true,services:[{shipping_method:'truck',last_mile_delivery:'parcel'},{shipping_method:'truck',last_mile_delivery:'truck'}]}],shipping_method:[{value:'truck'}],last_mile_delivery:[{value:'parcel'},{value:'truck'}],delivery_type:[{value:'SPD',shipping_method:'truck',last_mile_delivery:'parcel'},{value:'LTL',shipping_method:'truck',last_mile_delivery:'truck'}]};
let pass=0;function check(n,x){assert(x,n);pass++;console.log('PASS '+n);}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('output/dw1-workflow-20261122',{recursive:true});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 await page.setContent('<main style="max-width:360px;font:14px Arial"><h2>Shipping Plan</h2><div id="sp-rc-P"><div class="sp-rc-body"></div></div><h2>Shipment Draft</h2><div id="draft"></div></main>');
 await page.addScriptTag({content:'var SP_RC_={}; function _spEsc(x){return String(x??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll("\\\"","&quot;");} function _spRcPlan_(){return {};} var SH_SVC_TBA_="__TO_BE_ASSIGNED__"; function _shGetShipments(){return [];} function _shEsc(x){return _spEsc(x);} function _shHoldHas16_(){return false;}' });
 await page.addScriptTag({content:parts('assets/js/pages/shipping-plan.js',['_spCustomsNa_','_spCustomsHtml_','_spSvcHtml_','_spSvcDeliveryTypes_','_spSvcPairOptions_','spSvcCarrierChanged','_spRcRenderBase13_'])});
 await page.addScriptTag({content:parts('assets/js/pages/shipping-history.js',['_shSvcHtml_','_shSvcDeliveryTypes_','_shSvcCarrierServices_','_shSvcPairOptions_','shSvcCarrierChanged','_shSvcBox_'])});
 await page.evaluate(v=>{window.SH_RC_={};SP_RC_.P={lane:{customs_applicable:false,customs:[]},current:{carrier_id:'CAR_AMAZON_PARTNERED',shipping_method:'truck',last_mile_delivery:'parcel'},service_vocabulary:v,options:[]};_spRcRenderBase13_('P');SH_RC_.S={...SP_RC_.P,customs_applicable:false,service:{carrier_id:'CAR_AMAZON_PARTNERED',shipping_method:'truck',last_mile_delivery:'parcel'},unpriced_approval:{available:true,enabled:true,carrier_id:'CAR_AMAZON_PARTNERED'},current:{state:'COST_PENDING_AUTO'}};document.getElementById('draft').innerHTML=_shSvcHtml_('S',SH_RC_.S);},vocab);
 check(width+' only Domestic Transport shown on domestic plan',(await page.locator('.sp-rc-body').innerText()).includes('Domestic Transport')&&await page.locator('.sp-rc-carrier,.sp-rc-customs').count()===0);
 check(width+' carrier names have no backend IDs',await page.locator('.sp-svc-carrier').innerText()==='-- Choose carrier --\nAmazon');
 check(width+' redundant SPD/LTL controls removed',await page.locator('.sp-svc-dtype,.sh-svc-dtype').count()===0);
 await page.locator('.sp-svc-carrier').selectOption('CAR_AMAZON_PARTNERED');await page.locator('.sp-svc-lastmile').selectOption('truck');
 check(width+' carrier filtering still works without delivery selector',await page.locator('.sp-svc-method').inputValue()==='truck'&&await page.locator('.sp-svc-lastmile').inputValue()==='truck');
 await page.locator('.sh-svc-carrier').selectOption('CAR_AMAZON_PARTNERED');check(width+' draft carrier filtering works without delivery selector',await page.locator('.sh-svc-method').inputValue()==='truck');
 check(width+' automatic pending price has no extra approval button',await page.locator('.sh-svc-skip').count()===0);
 await page.addScriptTag({content:parts('assets/js/pages/shipping-history.js',['shConfirmShipment','_shCustomsRead_','_shCustomsNa_'])});
 await page.evaluate(()=>{
   window.SH_CUSTOMS_READ_={};window._shTok_=()=> 'v1';window._shExecDirty=()=>[];window.KM={DB:{getShipmentRateCardOptions:async()=>({success:true,current:{state:'COST_PENDING_AUTO'},customs_applicable:false})}};
   const box=document.createElement('div');box.id='sh-exec-S';box.setAttribute('data-total-qty','120');box.innerHTML='<select class="sh-exec-input" data-field="shipments_customs_type"><option value="">Choose customs</option></select>';document.getElementById('draft').append(box);
   _shCustomsRead_({shipmentId:'S'});
 });
 await page.waitForFunction(()=>document.querySelector('#sh-exec-S select').disabled);
 check(width+' server-proven domestic customs is disabled and not submitted',await page.locator('#sh-exec-S select').getAttribute('data-field')===null);
 const confirm=await page.evaluate(async()=>{
   window.confirmOpened=0;window.manualPrompt=0;window.alerts=[];window.alert=x=>alerts.push(x);
   window._shDispatchHeld14_=()=>false;window._shValidateCartons=()=>({ok:true});window._shTokReady_=()=>true;
   window._shCollectExec=()=>({external_shipment_id:'EXT',reference_id:'REF',warehouse_code:'IND7',etd:'2026-11-23',eta:'2026-11-24'});
   window._shHeldDestination_=()=>'';window._shGetShipments=()=>[{shipmentId:'S',carrierId:'CAR',shippingMethod:'truck',sourceWarehouseId:'WH'}];window._shRcState_=()=>({});window._shInFlight_={};
   window._shHoldHas16_=()=>false;window.shUnpricedOpen14=()=>manualPrompt++;window._shGetShipmentLines=()=>[{shipmentId:'S',qty:120}];
   window._shSourceDomain_=()=> 'OVERSEAS';window._shCarrierCell_=()=>({state:'RESOLVED',carrierName:'Amazon'});window._shOpenConfirmModal=()=>confirmOpened++;
   shConfirmShipment('S');await new Promise(r=>setTimeout(r,20));return {opened:confirmOpened,manual:manualPrompt,alerts};
 });
 check(width+' one Confirm opens normal confirmation without reason step',confirm.opened===1&&confirm.manual===0&&confirm.alerts.length===0);
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('select,button')].some(e=>e.getBoundingClientRect().right>innerWidth));check(width+' controls fit viewport',!overflow);
 await page.screenshot({path:path.resolve('output/dw1-workflow-20261122/domestic-'+width+'.png'),fullPage:true});
 await page.evaluate(()=>{SP_RC_.P.lane={customs_applicable:true,customs:[{id:'self',label:'Customs clearance'}]};_spRcRenderBase13_('P');});
 check(width+' export has no domestic title and retains customs',!(await page.locator('.sp-rc-body').innerText()).includes('Domestic Transport')&&await page.locator('.sp-rc-customs').count()===1);
 check(width+' no browser exceptions',errors.length===0);await page.close();
 }
 // Exercise the real factory single-flight controller with raw, validated fixture quantities.
 const page=await browser.newPage();await page.setContent('<div id="ops-section" class="active"></div>');await page.clock.install();
 await page.addScriptTag({content:'var _irSearch={applied:{marketplaceId:"site"}};window.reads=0;window.KM={DB:{factoryStockGuardGet:async()=>{reads++;return reads===1?{success:false,error:{code:"SOURCE_REVISION_PENDING"}}:{success:false,code:"FACTORY_CHANGED_DURING_READ"};}}};'});
 await page.addScriptTag({content:read('assets/js/core/factory-availability-feedback.js')});
 await page.evaluate(()=>KM.factoryAvailability.ensure(false));check('nested server refusal code is preserved',await page.evaluate(()=>KM.factoryAvailability.lastError().message)==='SERVER:SOURCE_REVISION_PENDING');
 for(const ms of [2100,4100,6100,20000])await page.clock.runFor(ms);
 check('transient stock failures retry at most three times',await page.evaluate(()=>reads)===4);
 check('failed stock never becomes a fabricated zero',await page.evaluate(()=>KM.factoryAvailability.rows())===null);
 await page.evaluate(()=>{KM.DB.factoryStockGuardGet=async()=>({success:true,data:{pool_keys:['WH:F||SKU'],byPool:{'WH:F||SKU':{pool_row_found:true,warehouse_id:'F',sku:'SKU',factory_current_stock:100,factory_reserved_stock:20,factory_available_stock:80,active_allocation_draft_qty:5,active_shipping_plan_qty:10,already_allocated_qty:15,available_to_allocate:65}},inventory_snapshot_fingerprint:'fixture',tables_read:['warehouses','factory_stock','shipping_allocation_drafts','shipping_allocation_draft_lines','shipping_plans','shipping_plan_lines'],display14:{revision:'factory-display:fixture',display_only:true,stock:{success:true,meta:{onlyRequested:['factory_stock','warehouses'],siteScopeRequested:false,siteScopeApplied:false},data:{factory_stock:[{warehouse_id:'F',sku:'SKU',fac_current_stock:100,fac_reserved_stock:20}],warehouses:[{warehouse_id:'F',is_factory_warehouse:true}],capped:{factory_stock:false,warehouses:false},counts:{factory_stock:1,warehouses:1}}}}}});});
 await page.evaluate(()=>KM.factoryAvailability.ensure(true));
 check('valid locked display snapshot restores real factory stock',await page.evaluate(()=>KM.factoryAvailability.status()==='READY'&&KM.factoryAvailability.rows()[0].currentStock===100&&KM.factoryAvailability.poolsFor('SKU')[0].available_to_allocate===65));
 await page.close();console.log('DW1_BROWSER_PASS '+pass+' live_business_writes=0');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
