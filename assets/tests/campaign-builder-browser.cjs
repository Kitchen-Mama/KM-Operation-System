'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {world,body,scope}=require('./campaign-builder.test.cjs');
const {parts}=require('./helpers/write-command-flight-world.cjs');
const riskScript=fs.readFileSync('assets/js/core/supply-planning-country-identity.js','utf8')+'\n'+fs.readFileSync('assets/js/utils/promotion-risk-ratio.js','utf8')+'\nvar _crRiskEvidence={state:"READY",indexes:{},rows:["A","B"].flatMap(sku=>Array.from({length:30},(_,i)=>({sku,country:"US",marketplace:"Amazon",sales_units:1,snapshot_date:KM.promotionRiskRatio.shift("2026-11-26",i-30)})))};function _crDB(){return {getMarketplaces:()=>[{company:"KM",country:"US",marketplace:"Amazon"}]};}\n'+parts(fs.readFileSync('assets/js/pages/campaign-risk.js','utf8'),['calculateSkuRisk','_crMatchPromos','_crRiskIndex_']);
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
let checks=0,saves=0,readFails=0,writeUnknown=false;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function run(){
 const h=world();let d=body();d.scope={...scope,start_date:'2026-10-01',end_date:'2026-10-10'};assert(h.call(d).success);saves=0;
 const old=h.c.Utilities.formatDate;h.c.Utilities.formatDate=(date,tz,p)=>p==='yyyy-MM-dd'?'2026-11-25':old(date,tz,p);
 const server=http.createServer(async(req,res)=>{try{
  if(req.url==='/fixture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/css/pages/campaign-builder.css"><style>body{font-family:Arial;font-size:13px;background:#fff}</style><h1>Campaign Test</h1><script src="/assets/js/core/campaign-builder.js"></script><script>window.KM.DB={getCampaignBuilder:async scope=>(await fetch("/read",{method:"POST",body:JSON.stringify(scope)})).json(),saveCampaignBundle:async b=>(await fetch("/save",{method:"POST",body:JSON.stringify(b)})).json(),getCampaignBuilderStatus:async id=>(await fetch("/status",{method:"POST",body:JSON.stringify({request_id:id})})).json()};</script><script>'+riskScript+'</script><script src="/assets/js/utils/campaign-builder.js"></script></html>');return;}
  if(['/read','/save','/status'].includes(req.url)){let text='';for await(const chunk of req)text+=chunk;const input=JSON.parse(text);let result;
   if(req.url==='/read'){if(readFails){readFails--;result={success:false,error:{message:'Injected read failure'}};}else{result=JSON.parse(h.c.handleCampaignBuilderGet_({scope:input}).getContent());}}
   if(req.url==='/save'){saves++;await new Promise(r=>setTimeout(r,120));result=h.call(input);if(writeUnknown)result={success:false,error:{code:'HTTP_TRANSPORT_ERROR',message:'Injected lost acknowledgement'}};else if(!result.success)result={success:false,error:{message:result.error,details:{issues:result.issues,zero_write:result.writes_performed===0}}};}
   if(req.url==='/status')result=JSON.parse(h.c.handleCampaignBuilderStatus_(input).getContent());
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;}
  const filename=path.resolve('.'+req.url);if(!filename.startsWith(path.resolve('assets')+path.sep)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',filename.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(filename));
 }catch(e){res.writeHead(500);res.end(e.stack);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept());const base='http://127.0.0.1:'+server.address().port;await page.goto(base+'/fixture');
  await page.evaluate(scope=>KM.campaignBuilder.open({origin:'promotion',scope,lockScope:true,onSaved:()=>{window.savedView=true;}}),scope);
  const field=id=>page.locator('[data-cb="'+id+'"]');await field('sku').locator('option[value="MA"]').waitFor({state:'attached'});await field('add').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-cb="add"]').disabled);
  eq(await field('country').isDisabled(),true);eq(await field('site').isDisabled(),true);eq(await field('flag').inputValue(),'Normal');
  await field('type').selectOption('Coupon');await field('start').fill('2026-12-01');await field('end').fill('2026-12-10');
  await field('method').selectOption('history');eq(await field('history').locator('option').count(),2);
  await field('history').selectOption({index:1});await field('growth').fill('25');await field('discount').fill('10');await field('history-apply').click();
  eq(await page.locator('[data-field="newFc"]').first().inputValue(),'125');eq(await page.locator('[data-field="dealPrice"]').first().inputValue(),'90');eq(await page.locator('[data-row]').count(),2);
  await page.locator('[data-field="newFc"]').first().fill('130');await page.locator('[data-field="dealPrice"]').first().fill('85');eq(await page.locator('[data-field="discountPct"]').first().inputValue(),'15');
  await field('review').click();eq(await field('save').isVisible(),true);await page.locator('[data-field="newFc"]').first().fill('135');eq(await field('save').isVisible(),false);
  await field('review').click();await fs.promises.mkdir('output/campaign-builder-20261125',{recursive:true});await page.screenshot({path:'output/campaign-builder-20261125/desktop.png',fullPage:true});
  await field('save').click();await page.waitForFunction(()=>window.savedView===true);eq(saves,1);eq(h.rows('campaigns').length,2);eq(h.rows('fc_special_events').slice(-2).map(r=>r.fc_qty),[135,125]);
  eq(await field('review').isDisabled(),true);await field('close').click();
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>KM.campaignBuilder.open({origin:'forecast'}));await field('country').locator('option[value="US"]').waitFor({state:'attached'});await field('country').selectOption('US');await field('site').selectOption('SITE1');await page.waitForFunction(()=>!document.querySelector('[data-cb="type"]').disabled);await field('sku').locator('option[value="MA"]').waitFor({state:'attached'});
  await field('type').selectOption('Best Deal');await field('start').fill('2027-01-01');await field('end').fill('2027-01-10');await field('sku').selectOption('MA');await field('add').click();await field('sku').selectOption('MB');await field('add').click();eq(await page.locator('[data-row]').count(),2);
  await field('discount').fill('20');await field('discount-apply').click();await page.locator('[data-field="newFc"]').first().fill('70');await page.locator('[data-field="newFc"]').last().fill('30');
  await page.screenshot({path:'output/campaign-builder-20261125/mobile.png',fullPage:true});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);eq(await page.locator('.cb-dialog').evaluate(e=>e.getBoundingClientRect().width<=innerWidth),true);
  writeUnknown=true;await field('review').click();await field('save').click();await page.waitForFunction(()=>document.querySelector('[data-cb="status"]').textContent.includes('Outcome unconfirmed'));
  eq(await field('save').isDisabled(),true);eq(saves,2);await page.reload();await page.evaluate(scope=>KM.campaignBuilder.open({origin:'forecast',scope}),scope);await field('check').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-cb="check"]').disabled);
  eq(await field('type').isDisabled(),true);await field('check').click();await page.waitForFunction(()=>document.querySelector('[data-cb="status"]').textContent.startsWith('Saved:'));eq(saves,2);eq(h.rows('campaigns').length,3);
  await field('close').click();readFails=1;await page.evaluate(()=>KM.campaignBuilder.open({origin:'forecast'}));await field('retry').waitFor({state:'visible'});await field('retry').click();await field('country').locator('option[value="US"]').waitFor({state:'attached'});eq(await field('country').locator('option').count(),2);eq(errors,[]);await field('close').click();
  console.log('CAMPAIGN_BUILDER_BROWSER_PASS checks='+checks+' saves='+saves+' desktop/mobile + real GAS fixture + receipt reconciliation');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
