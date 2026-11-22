'use strict';
// Local component test in real Chromium. Transport and command orchestration are labelled test doubles.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths:[runtime] }));
const { extract } = require('./extract.cjs');
const release = path.join(process.env.AD4_CANDIDATE || path.resolve('output/ad4-codex-20261122/release-final/candidate'),'Sandbox/site');
const source = fs.readFileSync(path.join(release,'assets/js/pages/shipping-plan.js'),'utf8');
const api = fs.readFileSync(path.join(release,'assets/js/api/operation-system-db-api.js'),'utf8');
const names = ['_spEsc','_spMoney_','_spRcLoadingHtml_','_spRcRenderBase13_','_spWk1CardTxt_','_spWk1KnownHtml_','_spWk1CxPicked_','_spEuLead15e_','_spSavedQuoteTextCp2d_','_spSvcHtml_','_spSvcDeliveryTypes_','_spSvcPairOptions_','spSvcCarrierChanged','spSvcPickDeliveryType','spSvcSave','_spCostBreakdownHtml_','_spCustomsNa_','_spCustomsHtml_'];
const parts = extract(source,n => names.includes(n),() => false);
assert.equal(parts.length,names.length);
const start = api.indexOf('window.KM.DB.selectShippingPlanRateCardWithCustoms = function');
assert(start > 0); const end = api.indexOf('\n};',start) + 3;
const vocab = require('./service-vocabulary.fixture.json').vocabulary;
const setup = `window.KM={DB:{}}; var SP_RC_={},SP_RC_SEL_={},_SP_WK1_SAVING_={},_kmPlanRcInFlight_={}; window.__req=[];
function _kmDocumentAction(a,b){__req.push({a,b});return Promise.resolve({success:true,carrier_id:'CAR_BESTWAY',shipping_method:'truck',last_mile_delivery:'truck',priced:false,unpriced_reason:'NO_APPLICABLE_CARD',estimated_total_cost:''});}
function _spPlanTok_(){return 'v1';} function _spRcPlan_(){return {shippingMethod:''};} function _spReadbackAfterWrite_(){return Promise.resolve();} function _spNotify_(m){window.__note=m;}
function _spRunCommand_(key,fn,opts){return fn().then(r=>{window.__result=r;return r;});}`;
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  let pass = 0; const checked = (name,condition) => { assert(condition,name); pass++; console.log('PASS '+name); };
  try {
    for (const width of [1440,820]) {
      const page = await browser.newPage({viewport:{width,height:900}}); const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>r.abort());
      await page.setContent('<div id="sp-rc-PL-1" data-plan-id="PL-1"><div class="sp-rc-body"></div></div>');
      await page.addScriptTag({content:setup+'\n'+api.slice(start,end)+'\n'+parts.map(p=>p.text).join('\n')});
      await page.evaluate(v=>{SP_RC_['PL-1']={success:true,options:[],current:{state:'NONE'},lane:{customs_applicable:false,customs_basis:{country:'US'},customs:[{id:'self_customs',label:'Fixture global customs'}]},service_vocabulary:v}; _spRcRenderBase13_('PL-1');},vocab);
      checked(width+' domestic NA text with nonempty global customs list',await page.locator('.sp-rc-customs-na').count()===1 && await page.locator('.sp-rc-customs').count()===0);
      await page.locator('.sp-svc-carrier').selectOption('CAR_BESTWAY');
      checked(width+' BestWay LTL only',JSON.stringify(await page.locator('.sp-svc-dtype option').evaluateAll(a=>a.map(x=>x.value).filter(Boolean)))==='["LTL"]');
      await page.locator('.sp-svc-dtype').selectOption('LTL');
      await page.evaluate(()=>spSvcSave('PL-1'));
      checked(width+' actual DOM sends domestic explicit-service request once',await page.evaluate(()=>__req.length===1&&__req[0].a==='shippingPlan.selectRateCard'&&__req[0].b.delivery_type==='LTL'&&!('customs_type' in __req[0].b)&&!__req[0].b.rate_card_id));
      await page.screenshot({path:path.resolve('output/ad4-codex-20261122/browser-'+width+'.png'),fullPage:true});
      await page.evaluate(()=>{__req=[]; SP_RC_['PL-1'].lane={customs_applicable:true,customs:[{id:'self_customs',label:'Self customs'}]};_spRcRenderBase13_('PL-1');});
      checked(width+' required customs rendered on zero-card path',await page.locator('.sp-rc-customs').count()===1);
      await page.locator('.sp-svc-carrier').selectOption('CAR_BESTWAY');await page.locator('.sp-svc-dtype').selectOption('LTL');
      await page.evaluate(()=>spSvcSave('PL-1'));
      checked(width+' required customs blocks before transport',await page.evaluate(()=>__req.length===0&&document.querySelector('.sp-svc-note').textContent.includes('Choose a customs')));
      checked(width+' no browser exceptions',errors.length===0);
      await page.close();
    }
    console.log('SUMMARY browser pass='+pass+' fail=0 (local component; not live shipment E2E)');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
