'use strict';
// Actual Search commit -> catalogue request -> adapter -> registry -> row repaint.
// The transport/master data are fixtures; no Production transaction or autosave is run.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const runtime=process.env.KM_NODE_MODULES||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
const {extract}=require('./ad4/extract.cjs');
const source=fs.readFileSync(process.env.DS2_PAGE||'assets/js/pages/inventory-replenishment.js','utf8');
const names=['_irApplySearch_','_irLoadCarrierPlanning_','_irMethodScope_','_execResolveMethods','_execMethodRouteCtx',
  '_execEsc','_execMethodOptionsHtml','_execRebuildMethodOptions','_irLastMileChoices_','_irLastMileCellHtml_','_irPaintLastMileCell_',
  '_irComputeRouteEta','_irLeadTimeProfileFor_','_irMethodToLeadKey'];
const parts=extract(source,n=>names.includes(n),n=>['IR_SERVICE_TO_LEAD_KEY_','IR_LABEL_TO_LEAD_KEY_'].includes(n));
assert.equal(parts.length,names.length+2);
const countries=['US','CA','UK','DE','AU','JP','FR'];
const fixture={marketplaces:[],warehouses:[],carriers:[{carrier_id:'CAR_AMAZON_PARTNERED',is_active:'Active'},{carrier_id:'CAR_BESTWAY',is_active:'Active'}],
  carrier_rate_cards:[],carrier_lead_times:[],shipment_route_templates:[]};
for(const country of countries){
  for(const company of ['ResUS','KM']){
    fixture.marketplaces.push({marketplace_id:company+'-'+country,company,country,marketplace:company==='KM'?'Shopify':'Amazon',status:'active'});
    fixture.warehouses.push({warehouse_id:company+'-'+country+'-AMZL',warehouse_code:company+'-'+country+'-AMZL',company,country,warehouse_type:'3PL',is_active:true,is_factory_warehouse:false});
    if(country==='US')fixture.warehouses.push({warehouse_id:company+'-US-WINIT',warehouse_code:company+'-US-WINIT',company,country,warehouse_type:'3PL',is_active:true,is_factory_warehouse:false});
  }
  for(const lm of ['parcel','truck'])fixture.shipment_route_templates.push({route_template_id:'SRT-DOM-AMAZON-'+country+'-'+lm,
    origin_country:country,destination_country:country,carrier_id:'CAR_AMAZON_PARTNERED',transit_type:'truck',last_mile_delivery:lm,is_active:false});
}
fixture.shipment_route_templates.push({route_template_id:'SRT-DOM-BESTWAY-US-LTL',origin_country:'US',destination_country:'US',carrier_id:'CAR_BESTWAY',transit_type:'truck',last_mile_delivery:'truck',is_active:false});
const cases=countries.map(country=>({company:'ResUS',country,marketplace:'Amazon',dest:''})).concat([{company:'KM',country:'US',marketplace:'Shopify',dest:'KM-US-WINIT'}]);
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});let pass=0;
  function check(n,c){assert(c,n);pass++;console.log('PASS '+n);}
  fs.mkdirSync('output/ds2-method-scope-20261122',{recursive:true});
  try{for(const width of [1440,390])for(const c of cases){
    const page=await browser.newPage({viewport:{width,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
    await page.setContent('<div id="shipping-methods-TEST"><div class="exec-route-row"><select data-field="source_warehouse_id"></select><select data-field="destination_warehouse_id"></select><select data-field="shipping_method"></select><div class="replen-card__lastmile-cell"><input data-field="last_mile_delivery" value=""></div></div></div>');
    await page.addScriptTag({content:'window.KM={DB:{}};var _irSearch={seq:1,applied:null};function populateReplenFiltersFromRegistry(){}function renderReplenishment(){}function _irSearchBlockedNotice_(){}function onExecutionMethodEdit(){}'});
    for(const f of ['assets/js/core/supply-planning-country-identity.js','assets/js/api/operation-system-db-api.js','assets/js/core/method-registry.js'])await page.addScriptTag({content:fs.readFileSync(f,'utf8')});
    await page.addScriptTag({content:parts.map(p=>p.text).join('\n')});
    await page.evaluate(async({d,c})=>{
      window.data=d;window.reads=0;window.requested=[];window.model=KM.DB.adaptInventoryReplenishmentWorkspace(d);
      window._irWsGet=n=>model[n]||[];
      window._replenSelectedScope=()=>({company:c.company,country:c.country,marketplace:c.marketplace});
      KM.api={getWorkspace:async(n,p)=>{reads++;requested.push(p);return {success:true,data:d};}};
      window._irRebuildAllMethodOptions_=()=>_execRebuildMethodOptions('TEST');
      document.querySelector('[data-field="source_warehouse_id"]').innerHTML='<option value="'+c.company+'-'+c.country+'-AMZL" data-wh-country="'+c.country+'">AMZL</option>';
      document.querySelector('[data-field="destination_warehouse_id"]').innerHTML='<option value="'+(c.dest||'logical')+'" data-wh-type="'+(c.dest?'3PL':'MARKETPLACE_DESTINATION')+'" data-wh-code="'+c.dest+'">'+(c.dest?'WINIT':'Amazon')+'</option>';
      _irApplySearch_({country:c.country,marketplaceId:c.company+'-'+c.country},1);
      await _irLoadCarrierPlanning_();_execRebuildMethodOptions('TEST');
    },{d:fixture,c});
    const label=width+' '+c.company+'/'+c.country+'/'+(c.dest?'WINIT':'Amazon');
    check(label+' actual Search shape is country + marketplaceId only',await page.evaluate(()=>Object.keys(_irSearch.applied).sort().join(',')==='country,marketplaceId'));
    check(label+' Truck enabled after actual async catalogue read and repaint',await page.locator('[data-field="shipping_method"]').isEnabled());
    await page.locator('[data-field="shipping_method"]').selectOption('truck');
    check(label+' one bounded read, no rate card or lead-time activation',await page.evaluate(()=>reads===1&&requested[0].only.length===5&&KM.methodRegistry.getLeadTimes(_irMethodScope_()).length===0));
    const selected=await page.evaluate(()=>_irMethodScope_());
    check(label+' resolved company is correct',selected.company===c.company&&selected.marketplace===c.marketplace);
    // Editing a filter without Search cannot make this row borrow the pending site's company.
    await page.evaluate(()=>{window._replenSelectedScope=()=>({company:'OTHER',country:'CA',marketplace:'Other'});});
    check(label+' pending filter cannot replace applied company',await page.evaluate(co=>_irMethodScope_().company===co,c.company));
    check(label+' no browser exceptions',errors.length===0);
    if(c.country==='US')await page.screenshot({path:path.resolve('output/ds2-method-scope-20261122/'+c.company+'-'+width+'.png'),fullPage:true});
    await page.close();
  }
  console.log('DS2_SEARCH_BROWSER_PASS '+pass+' live=NOT_RUN');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
