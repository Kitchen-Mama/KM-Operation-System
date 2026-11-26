'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {parts}=require('./helpers/write-command-flight-world.cjs'),{createEuWorld}=require('./helpers/shipment-import-eu-world.cjs');
const unwrap=x=>x.getContent?JSON.parse(x.getContent()):x;
const base=new Function('createEuWorld','vm','fs',parts(fs.readFileSync('assets/tests/shipment-no-rate-policy.cjs','utf8'),['world'])+';return world;')(createEuWorld,vm,fs);
const overseas=new Function('base','vm','fs','unwrap',parts(fs.readFileSync('assets/tests/overseas-no-documents.cjs','utf8'),['world'])+';return world;')(base,vm,fs,unwrap);
const world=new Function('overseas','vm','fs','parts','unwrap',parts(fs.readFileSync('assets/tests/shipment-dispatch-status.cjs','utf8'),['world'])+';return world;')(overseas,vm,fs,parts,unwrap);
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]})),out=path.resolve('output/shipment-dispatch-status-20261126/browser');
let pass=0;function check(name,value){assert(value,name);pass++;console.log('PASS '+name);}
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1440,390])for(const mode of ['clean','pending','drift','network','wrong-id','unrelated']){
  const h=world(),c=h.c,calls=[],errors=[],requests=[];let rpc=0;
  const read=()=>({shipments:h.rows('shipments').map(raw=>({raw,...c.shipWsDocumentsFor_({},raw.shipment_id,raw,h.rows('warehouses'))})),shipmentLines:h.rows('shipment_lines'),warehouses:h.rows('warehouses').map(w=>({...w,marketplace:w.warehouse_type==='FBA'?'Amazon':''})),carriers:h.rows('carriers'),carrierRateCards:[],skuLogistics:[]});
  const page=await browser.newPage({viewport:{width,height:950}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(r.request().url()==='https://fixture.invalid/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main id="fixture"></main></body></html>'});requests.push(r.request().url());return r.abort();});await page.goto('https://fixture.invalid/');
  for(const f of ['assets/css/base.css','assets/css/components.css','assets/css/pages/shipping-history.css'])await page.addStyleTag({content:fs.readFileSync(f,'utf8')});
  await page.addStyleTag({content:'body{margin:0;font:14px Arial}main{padding:12px}*{box-sizing:border-box}'});
  await page.exposeFunction('readFixture',read);await page.exposeFunction('rateFixture',()=>h.options());
  await page.exposeFunction('statusFixture',body=>{rpc++;assert.equal(body.action,'shipment.dispatch.status');assert.equal(body.shipment_id,'S');if(mode==='network')throw Error('offline');const r=h.status();return mode==='wrong-id'?{...r,shipment_id:'OTHER'}:r;});
  for(const f of ['production-config.js','assets/js/api/operation-system-db-api.js','assets/js/pages/shipping-history.js'])await page.addScriptTag({content:fs.readFileSync(f,'utf8')});
  await page.exposeFunction('forbiddenWrite',name=>calls.push(name));
  await page.evaluate(async()=>{
   window.alerts=[];window.alert=x=>alerts.push(x);KM.api=KM.api||{};KM.api.getWorkspace=async()=>({success:true,data:await readFixture()});
   KM.DB.getShipmentRateCardOptions=()=>rateFixture();for(const name of ['updateShipment','generateShipmentLineAllocations','confirmShipmentAndDispatch','retryDocumentGeneration'])KM.DB[name]=()=>forbiddenWrite(name);
   window.fetch=async(_url,opts)=>({ok:true,json:async()=>statusFixture(JSON.parse(opts.body))});
   _shLoadAndRender=async()=>{_shReadModel=KM.DB.adaptShipmentWorkspace(await readFixture());const s=_shGetShipments().find(x=>x.shipmentId==='S');document.getElementById('fixture').innerHTML=_shRenderDbCard(s,_shGetShipmentLines(),'draft');};await _shLoadAndRender();
  });
  await page.locator('.history-expand-btn').click();await page.evaluate(()=>shConfirmShipment('S'));await page.waitForSelector('#sh-confirm-modal',{timeout:3000}).catch(async e=>{throw Error(e.message+' / '+JSON.stringify(await page.evaluate(()=>({alerts,body:document.body.innerText}))))});
  if(mode==='pending')h.properties.KM_SRC_PEND_TEST=String(Date.now());
  if(mode==='unrelated'){h.properties.KM_SRC_PEND_OTHER=String(Date.now());h.properties.KM_SRC_CTX_KM_SRC_PEND_OTHER=JSON.stringify(h.c.kmSrcWriterContext_('confirmShipmentAndDispatch',{shipment_id:'OTHER'}));}
  if(mode==='network'||mode==='wrong-id')await page.evaluate(()=>{KM.api.getWorkspace=async()=>({success:true,data:{shipments:[{raw:{shipment_id:'S',status:'shipped'}}]}});});
  if(mode==='drift')h.put('overseas_inventory_snapshot','overseas_inventory_id','OVS','wh_available_stock',20);
  const before=h.writes(),label=width+' '+mode;
  await page.evaluate(async()=>{localStorage.setItem('km-dispatch-pending14:S','1');delete SH_DISPATCH_HOLD14_.S;await _shDispatchUnknown_('S',null,document.getElementById('sh-confirm-go'),document.getElementById('sh-confirm-cancel'),document.getElementById('sh-confirm-status'));});
  if(mode==='clean'||mode==='unrelated')check(label+' reconciled proof releases the persisted hold and closes the modal',await page.evaluate(()=>!_shDispatchHeld14_('S')&&!document.getElementById('sh-confirm-modal')));
  else {
   check(label+' retains persisted hold and blocks dispatch',await page.evaluate(()=>_shDispatchHeld14_('S')&&document.getElementById('sh-confirm-go').disabled));
   if(mode==='pending')check(label+' names pending writer',await page.locator('#sh-confirm-status').innerText().then(t=>t.includes('SOURCE_WRITE_IN_PROGRESS')));
   check(label+' dialog fits viewport',await page.locator('#sh-confirm-modal').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;}));
  }
  check(label+' performs one read, no automatic save, dispatch, document generation or stock write',rpc===1&&calls.length===0&&h.writes()===before&&h.propertyWrites()===0&&h.forbidden()===0);
  check(label+' has no outbound network, browser exception or alert',requests.length===0&&errors.length===0&&await page.evaluate(()=>alerts.length===0));
  if(mode==='pending')await page.screenshot({path:path.join(out,'pending-'+width+'.png'),fullPage:true});await page.close();
 }
}finally{await browser.close();}console.log('SHIPMENT_DISPATCH_STATUS_BROWSER_PASS '+pass+' live_business_writes=0');})().catch(e=>{console.error(e);process.exitCode=1;});
