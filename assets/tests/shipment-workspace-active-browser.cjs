'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]})),out=path.resolve('output/shipment-workspace-active-20261126');
const c=vm.createContext({});vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/57_api_v1_shipment_workspace.gs','utf8'),c);
const statuses=['draft','ready_to_ship','shipped','cancelled','in_transit','arrived','received','closed'];
const rows=statuses.map((status,i)=>({shipment_id:'S'+i,external_shipment_id:'FIXTURE-'+status.toUpperCase(),status,company:'ResUS',marketplace:'Amazon',country:i<2?'US':i===3?'AU':'UK',
 shipping_method:'truck',shipment_total_qty:40,created_at:'2020-01-01',updated_at:'2026-11-26 17:00:00',cancelled_at:status==='cancelled'?'2026-11-26 16:00:00':'',cancel_reason:status==='cancelled'?'Duplicate plan <test>':'',
 etd:'2020-01-02',eta:'2020-02-01'}));
const fixture=JSON.parse(JSON.stringify(c.shipWorkspaceBuild_({shipments:rows,shipment_lines:rows.map(r=>({shipment_id:r.shipment_id,shipment_line_id:'L'+r.shipment_id,sku:'SKU',shipment_qty:40}))},{include:{skuLogistics:true}})));
let count=0;function check(name,value){assert(value,name);console.log('PASS '+name);count++;}
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:950}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{requests.push(r.request().url());return r.abort();});
 await page.setContent('<!doctype html><html><body><main><div id="shipment-draft-mount">'+fs.readFileSync('assets/html/pages/shipment-draft.html','utf8')+'</div><div id="shippinghistory-mount">'+fs.readFileSync('assets/html/pages/shipping-history.html','utf8')+'</div></main></body></html>');
 for(const f of ['assets/css/base.css','assets/css/components.css','assets/css/pages/shipping-history.css','assets/css/responsive-foundation.css'])await page.addStyleTag({content:fs.readFileSync(f,'utf8')});
 await page.addStyleTag({content:'body{margin:0;font:14px Arial}main{padding:16px}*{box-sizing:border-box}.module-section{display:none}.module-section.active{display:block}'});
 for(const f of ['assets/js/api/operation-system-db-api.js','assets/js/utils/multi-select-filter.js','assets/js/pages/shipping-history.js'])await page.addScriptTag({content:fs.readFileSync(f,'utf8')});
 await page.evaluate(data=>{
  window.fixture=data;window.writes=[];window.reads=[];window.alert=message=>{throw Error(message);};
  _shReadModel=KM.DB.adaptShipmentWorkspace(data);KM.DB.isScopedReadEligible=()=>true;_shRegion_=()=>null;_shRcAutoLoad_=()=>{};_shArrivalEnsure_=()=>{};
  KM.api={workspaceApiActive:()=>true,getWorkspace:async(name,p)=>{reads.push(p);const id=p.filters&&p.filters.shipmentId;return {success:true,data:id?{...fixture,shipments:fixture.shipments.filter(s=>(s.shipment_id||s.raw?.shipment_id)===id),shipmentLines:fixture.shipmentLines.filter(l=>l.shipment_id===id)}:fixture};}};
  for(const name of ['updateShipment','confirmShipmentAndDispatch','cancelShipmentDraft','retryDocumentGeneration'])KM.DB[name]=()=>{writes.push(name);throw Error('WRITE FORBIDDEN');};
  showSection=key=>{document.getElementById('shipment-draft-section').classList.toggle('active',key==='shipment-draft');document.getElementById('shippinghistory-section').classList.toggle('active',key==='shipment-overview');if(key==='shipment-overview'){_shInitFilters();renderShipmentOverview();}};
  showSection('shipment-draft');_shdEnsureFilter();renderShipmentDraft();
 },fixture);
 check(width+' workspace contains only pending execution cards',JSON.stringify(await page.locator('#shipment-draft-section .history-card').evaluateAll(ns=>ns.map(n=>n.id)))==='["sh-card-S0","sh-card-S1"]');
 check(width+' status filter contains only All, Draft and Ready to Ship',JSON.stringify(await page.locator('#shd-filter-status option').evaluateAll(ns=>ns.map(n=>n.value)))==='["","draft","ready_to_ship"]');
 check(width+' workspace country options exclude historical-only destinations',JSON.stringify(await page.locator('#shd-filter-country option').evaluateAll(ns=>ns.map(n=>n.value)))==='["","US"]');
 await page.selectOption('#shd-filter-status','ready_to_ship');check(width+' ready filter works',await page.locator('#shipment-draft-section .history-card').count()===1&&await page.locator('#sh-card-S1').count()===1);
 await page.selectOption('#shd-filter-status','');await page.screenshot({path:path.join(out,'workspace-'+width+'.png'),fullPage:true});
 check(width+' workspace header and controls fit viewport',await page.locator('#shipment-draft-section .page-header').evaluate(h=>Array.from(h.querySelectorAll('h2,label,select')).every(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})));
 await page.evaluate(()=>{historyState.dateRange={start:null,end:null};showSection('shipment-overview');});
 check(width+' overview includes shipped, cancelled and all existing later statuses',await page.locator('#shippinghistory-section .history-card').count()===6&&await page.locator('#shippinghistory-section #sh-card-S2').count()===1&&await page.locator('#shippinghistory-section #sh-card-S3').count()===1);
 await page.locator('#sh-card-S3 .history-expand-btn').click();
 check(width+' cancellation reason is readable and escaped',await page.locator('#sh-card-S3').innerText().then(t=>t.includes('Cancelled')&&t.includes('Cancellation reason: Duplicate plan <test>')));
 check(width+' cancelled record offers no execution or document generation controls',await page.locator('#sh-card-S3 input:not([readonly]):not([disabled]),#sh-card-S3 select:not([disabled]),#sh-card-S3 .sh-doc-retry,#sh-card-S3 .sh-doc-panel').count()===0);
 await page.evaluate(()=>{historyState.dateRange={start:new Date(2026,10,26),end:new Date(2026,10,26)};renderShipmentOverview();});
 check(width+' recent cancellation is filterable by cancellation date, not its old ETD',await page.locator('#shippinghistory-section .history-card').count()===1&&await page.locator('#sh-card-S3').count()===1);
 await page.screenshot({path:path.join(out,'cancelled-'+width+'.png'),fullPage:true});
 await page.evaluate(()=>{
  showSection('shipment-draft');fixture.shipments.find(s=>s.raw.shipment_id==='S0').raw.status='shipped';_shReadModel=KM.DB.adaptShipmentWorkspace(fixture);renderShipmentDraft();
 });
 check(width+' post-dispatch refresh removes the card from Workspace',await page.locator('#shipment-draft-section #sh-card-S0').count()===0);
 await page.evaluate(()=>{shOverviewFilterState={country:['AU'],method:['sea']};_shInitFilters();document.querySelector('#shippinghistory-section .filter-group--sku input').value='OTHER';});
 await page.evaluate(()=>shViewShipmentDocuments('S2'));
 check(width+' View Documents navigates to Overview and opens its target despite unrelated filters',await page.evaluate(()=>document.getElementById('shippinghistory-section').classList.contains('active')&&document.querySelector('#shippinghistory-section #sh-card-S2 .history-card-details').style.display==='block'&&shOverviewFilterState.country.length===0&&shOverviewFilterState.method.length===0&&document.querySelector('#shippinghistory-section .filter-group--sku input').value===''));
 check(width+' shared read model retains all records and only reads were sent',await page.evaluate(()=>_shReadModel.shipments.length===8&&writes.length===0&&reads.length===1));
 check(width+' no browser exceptions or live network requests',errors.length===0&&requests.length===0);await page.close();
 }}finally{await browser.close();}console.log('SHIPMENT_WORKSPACE_ACTIVE_BROWSER_PASS '+count+' live_business_writes=0');})().catch(e=>{console.error(e);process.exitCode=1;});
