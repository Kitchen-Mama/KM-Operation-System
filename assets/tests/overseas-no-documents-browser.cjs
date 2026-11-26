'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {parts}=require('./helpers/write-command-flight-world.cjs'),{createEuWorld}=require('./helpers/shipment-import-eu-world.cjs');
const base=new Function('createEuWorld','vm','fs',parts(fs.readFileSync('assets/tests/shipment-no-rate-policy.cjs','utf8'),['world'])+';return world;')(createEuWorld,vm,fs);
const unwrap=x=>x.getContent?JSON.parse(x.getContent()):x;
const world=new Function('base','vm','fs','unwrap',parts(fs.readFileSync('assets/tests/overseas-no-documents.cjs','utf8'),['world'])+';return world;')(base,vm,fs,unwrap);
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]})),out=path.resolve('output/overseas-no-documents-20261126/browser');
let pass=0;function check(name,value){assert(value,name);console.log('PASS '+name);pass++;}
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [1440,390])for(const lost of [false,true]){
 const h=world(),c=h.c,calls=[],errors=[],requests=[],page=await browser.newPage({viewport:{width,height:950}});c.kmSrcRevGet_=()=> 'FIXTURE-REV';
 h.sheet('shipment_route_templates',h.tables.shipment_route_templates.grid[0],[{route_template_id:'DOMESTIC',route_template_name:'Domestic',destination_country:'US',origin_country:'US',carrier_id:'CAR',transit_type:'truck',last_mile_delivery:'parcel',is_active:true}]);
 const nodes=[{route_template_id:'DOMESTIC',route_template_node_id:'N1',node_sequence:1,node_type:'factory_pickup',node_code:'SOURCE',country:'US'},
 {route_template_id:'DOMESTIC',route_template_node_id:'N2',node_sequence:2,node_type:'warehouse',node_code:'DEST',country:'US',is_destination_placeholder:true}];
 h.sheet('shipment_route_template_nodes',h.tables.shipment_route_template_nodes.grid[0],nodes);
 const read=()=>({shipments:h.rows('shipments').map(raw=>({raw,...c.shipWsDocumentsFor_({},raw.shipment_id,raw,h.rows('warehouses'))})),shipmentLines:h.rows('shipment_lines'),warehouses:h.rows('warehouses').map(w=>({...w,marketplace:w.warehouse_type==='FBA'?'Amazon':''})),carriers:h.rows('carriers'),carrierRateCards:[],skuLogistics:[]});
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{requests.push(r.request().url());return r.abort();});
 await page.setContent('<!doctype html><html><body><main id="fixture"></main></body></html>');
 for(const f of ['assets/css/base.css','assets/css/components.css','assets/css/pages/shipping-history.css'])await page.addStyleTag({content:fs.readFileSync(f,'utf8')});
 await page.addStyleTag({content:'body{margin:0;font:14px Arial}main{padding:12px}*{box-sizing:border-box}'});
 await page.exposeFunction('readFixture',read);await page.exposeFunction('rateFixture',()=>h.options());
 await page.exposeFunction('saveFixture',body=>{calls.push('save');const r=unwrap(c.handleUpdateShipment_(body));assert.equal(r.success,true,JSON.stringify(r));return {...r,...r.data};});
 await page.exposeFunction('allocationFixture',body=>{calls.push('allocation');return unwrap(c.handleGenerateShipmentLineAllocations_(body));});
 await page.exposeFunction('confirmFixture',body=>{calls.push('confirm');const r=unwrap(c.handleConfirmShipmentAndDispatch_(body));assert.equal(r.success,true,JSON.stringify(r));return lost?{success:false,stage:'network'}:r;});
 await page.exposeFunction('dispatchStatusFixture',()=>unwrap(c.handleShipmentDispatchStatus_({shipment_id:'S'})));
 for(const f of ['assets/js/api/operation-system-db-api.js','assets/js/pages/shipping-history.js'])await page.addScriptTag({content:fs.readFileSync(f,'utf8')});
 await page.evaluate(async()=>{
  window.alerts=[];window.alert=x=>alerts.push(x);KM.api=KM.api||{};KM.api.getWorkspace=async()=>({success:true,data:await readFixture()});
  KM.DB.getShipmentRateCardOptions=()=>rateFixture();KM.DB.updateShipment=p=>saveFixture(p);KM.DB.generateShipmentLineAllocations=p=>allocationFixture(p);KM.DB.confirmShipmentAndDispatch=p=>confirmFixture(p);KM.DB.getShipmentDispatchStatus=()=>dispatchStatusFixture();
  _shLoadAndRender=async()=>{_shReadModel=KM.DB.adaptShipmentWorkspace(await readFixture());const s=_shGetShipments().find(s=>s.shipmentId==='S');document.getElementById('fixture').innerHTML=_shRenderDbCard(s,_shGetShipmentLines(),'draft');};await _shLoadAndRender();
 });
 await page.locator('.history-expand-btn').click();await page.evaluate(()=>shConfirmShipment('S'));await page.waitForSelector('#sh-confirm-modal');
 const label=width+' '+(lost?'lost response':'normal');
 check(label+' confirms without promising Drive output',!(await page.locator('#sh-confirm-modal').innerText()).includes('generated in Drive'));
 check(label+' modal is framed',await page.locator('#sh-confirm-modal').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;}));
 await page.screenshot({path:path.join(out,'confirm-'+width+'-'+lost+'.png'),fullPage:true});
 await page.locator('#sh-confirm-go').click();await page.waitForFunction(()=>!document.getElementById('sh-confirm-modal')&&_shGetShipments().find(s=>s.shipmentId==='S')?.status==='shipped',{},{timeout:15000});
 check(label+' closes confirmation directly into the shipped card',await page.locator('#sh-confirm-documents').count()===0&&await page.locator('.sh-doc-panel').count()===0);
 check(label+' sends one dispatch and consumes reserved overseas stock once',calls.filter(x=>x==='confirm').length===1&&h.rows('overseas_inventory_snapshot')[0].wh_reserved_stock===0&&h.rows('overseas_inventory_snapshot')[0].wh_available_stock===60);
 check(label+' performs no document access, outbound request or browser exception',h.forbidden()===0&&errors.length===0&&requests.length===0&&await page.evaluate(()=>alerts.length===0));
 check(label+' releases the unknown-result hold only after server status proof',await page.evaluate(()=>!_shDispatchHeld14_('S')));
 await page.screenshot({path:path.join(out,'shipped-'+width+'-'+lost+'.png'),fullPage:true});await page.close();
}}finally{await browser.close();}console.log('OVERSEAS_NO_DOCUMENTS_BROWSER_PASS '+pass+' live_business_writes=0');})().catch(e=>{console.error(e);process.exitCode=1;});
