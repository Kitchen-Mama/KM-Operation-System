'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
let checks=0;function check(v,label){assert(v,label);checks++;console.log('PASS '+label);}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:950}}),errors=[],network=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(r.request().url()==='http://fixture.test/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+fs.readFileSync('assets/html/pages/shipping-plan.html','utf8')+'</body></html>'});network.push(r.request().url());return r.abort();});
 await page.goto('http://fixture.test/');
 await page.addStyleTag({content:'*{box-sizing:border-box}body{margin:8px;font:14px Arial}:root{--space-sm:8px;--space-md:16px;--space-lg:24px;--radius-sm:4px;--radius-md:8px;--border-light:#e2e8f0;--text-primary:#263238}'});
 await page.addStyleTag({content:fs.readFileSync('assets/css/pages/shipping-plan.css','utf8')});
 await page.addScriptTag({content:fs.readFileSync('assets/js/api/operation-system-db-api.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('assets/js/pages/shipping-plan.js','utf8')});
 const result=await page.evaluate(async()=>{
 KM.DB.getWarehouses=()=>[];KM.DB.getShippingPlanRateCardOptions=async()=>({success:true,options:[],current:{}});KM.DB.loadScopedTables=async()=>({marketplaces:[{country:'AU',status:'active'},{country:'CA',status:'active'},{country:'FAKE',status:'inactive'},{country:'US',status:'active'}]});
 _spEnsureCountryOptions_();await _spCountryFlight_;
 const p=(id,status,raw={})=>_spWorkspacePlanRecord({planId:id,company:'Fixture',country:id==='D'?'AU':'US',marketplace:'Amazon',status,raw:{updated_at:'2026-11-26 10:00:00',...raw}});
 window.model={source:'workspace',plans:[p('D','draft'),p('R','draft',{rejected_reason:'Adjust quantity'}),p('P','pending_approval'),p('A','approved',{transferred_shipment_id:'S1'}),p('F','approved')],lines:[]};
 _spRenderReadModel_(model);
 return {countries:[...document.getElementById('spCountryFilter').options].map(o=>o.value),approvedGone:!document.getElementById('sp-card-A'),
 rejected:document.querySelector('#sp-card-R .plan-status-badge').textContent,editable:!!document.querySelector('#sp-card-R [onclick*="spDbSubmit"]'),
 recovery:!!document.getElementById('sp-card-F'),pendingCount:document.getElementById('pendingSectionCount').textContent};
 });
 check(result.countries.join(',')===',AU,CA,US',width+' countries come from real active master and plans');
 check(result.approvedGone&&result.recovery,width+' transferred approval leaves review; failed handoff remains recoverable');
 check(result.rejected.includes('Rejected')&&result.editable,width+' rejected draft is labelled and can resubmit');
 check(result.pendingCount==='2',width+' pending section includes failed handoff count');
 await page.selectOption('#spStatusFilter','rejected');await page.evaluate(()=>filterByStatus());
 check(await page.locator('#sp-card-R').isVisible()&&!await page.locator('#sp-card-D').isVisible(),width+' rejected filter separates ordinary drafts');
 await page.evaluate(()=>{model.plans.find(p=>p.shippingPlanId==='R').status='pending_approval';document.getElementById('spStatusFilter').value='all';_spRenderReadModel_(model);});
 check((await page.locator('#sp-card-R .plan-status-badge').innerText()).includes('Pending Approval'),width+' resubmission removes rejected badge despite retained audit');
 await page.selectOption('#spCountryFilter','AU');await page.evaluate(()=>_spRenderReadModel_(model));
 check(await page.locator('#sp-card-D').count()===1&&await page.locator('#sp-card-P').count()===0,width+' country filtering works');
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);check(true,width+' no browser errors or live requests');
 fs.mkdirSync('output/shipping-review-loop-20261126',{recursive:true});await page.screenshot({path:path.resolve('output/shipping-review-loop-20261126/review-'+width+'.png'),fullPage:true});await page.close();
 }
 }finally{await browser.close();}console.log('SHIPPING_REVIEW_LOOP_BROWSER_PASS '+checks+' live_business_writes=0');})().catch(e=>{console.error(e);process.exitCode=1;});
