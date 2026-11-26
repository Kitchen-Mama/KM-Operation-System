'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parts}=require('./helpers/write-command-flight-world.cjs'),R=require('../js/utils/promotion-risk-ratio');
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));let checks=0;function ok(v,label){assert(v,label);checks++;}
const scope={company:'KM',country:'US',marketplace:'Amazon',marketplace_id:'SITE'},anchor='2026-11-26',skus=['A','B','C','D'];
const raw={marketplaces:[{...scope,status:'active'}],marketplace_skus:skus.map(sku=>({...scope,sku,marketplace_sku_id:'M'+sku,marketplace_sku_status:'active'})),sku_details:skus.map(sku=>({sku,category:'Can Openers',series:'S1',product_name:'Test '+sku})),
 campaigns:[{...scope,campaign_id:'C1',campaign_name:'Normal promo',promotion_type:'Coupon',start_date:R.shift(anchor,-30),end_date:R.shift(anchor,-15)},{...scope,company:'OTHER',campaign_id:'FOREIGN',start_date:R.shift(anchor,-30),end_date:R.shift(anchor,-1)}],
 campaign_sku_lines:[{campaign_id:'C1',campaign_sku_line_id:'L1',marketplace_sku_id:'MA',sku:'A'},{campaign_id:'FOREIGN',campaign_sku_line_id:'L2',marketplace_sku_id:'MC',sku:'C'}]};
const tables={amazon_daily_sales_snapshot:['A','B','C'].flatMap(sku=>Array.from({length:90},(_,i)=>({country:'US',marketplace:'Amazon',channel:'Amazon',sku,snapshot_date:R.shift(anchor,-90+i),sales_units:i>=60?1:0}))),
 fc_special_events:[{...scope,event_fc_id:'E1',sku:'A',scope_type:'SKU',scope_id:'A',event_start_date:R.shift(anchor,-30),event_end_date:R.shift(anchor,-15),fc_qty:100},{...scope,event_fc_id:'E2',sku:'B',event_name:'BFCM',event_start_date:R.shift(anchor,-30),event_end_date:R.shift(anchor,-22),fc_qty:100}]};
tables.amazon_daily_sales_snapshot.unshift(...['A','B','C'].map(sku=>({country:'US',marketplace:'Amazon',channel:'Amazon',sku,snapshot_date:'',sales_units:2})));
raw.campaigns.push({...scope,campaign_id:'FUTURE',start_date:'2026-12-01',end_date:'2026-12-05'});
raw.campaign_sku_lines.push({campaign_id:'FUTURE',campaign_sku_line_id:'FUTURE-A',marketplace_sku_id:'MA',sku:'A'});
// Build the actual 60_ response, including capped and requestEcho, rather than hand-inventing its contract.
const c=vm.createContext({});vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs','utf8'),c);
const payload={only:['amazon_daily_sales_snapshot','fc_special_events'],recentWindow:false},data=JSON.parse(JSON.stringify(c.sirWorkspaceBuild_(tables,payload)));
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('output/promo-ratio-20261126',{recursive:true});
try{for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-11-26T20:00:00Z')});
 await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'+fs.readFileSync('assets/html/pages/campaign-risk.html','utf8'));
 for(const file of ['assets/css/base.css','assets/css/components.css','assets/css/pages/campaign-risk.css'])if(fs.existsSync(file))await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
 await page.addStyleTag({content:'body{padding:16px;font-family:Arial}#campaign-risk-section{display:block}*{box-sizing:border-box}'});
 await page.evaluate(({raw,data,payload})=>{window.KM={lifecycle:{register(){}},api:{getWorkspace:async(name,p)=>{window.requests.push({name,p});return window.failRead?{success:false}:{success:true,data:window.capped?{...data,capped:{amazon_daily_sales_snapshot:true,fc_special_events:false}}:data};}}};window.requests=[];window.raw=raw;window.payload=payload;window.KM_PRODUCTION_CONFIG_={endpoint:'https://script.google.com/macros/s/FIXTURE/exec'};},{raw,data,payload});
 for(const file of ['assets/js/api/operation-system-db-api.js','assets/js/core/supply-planning-country-identity.js','assets/js/utils/promotion-risk-ratio.js','assets/js/pages/campaign-risk.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.evaluate(()=>{_crReadModel=normalizeOperationDb(raw);Object.assign(CampaignRiskState,{company:'KM',country:'US',marketplace:'Amazon',marketplaceId:'SITE'});crRenderScoped();});
 await page.waitForFunction(()=>_crRiskEvidence.state==='READY');
 const results=await page.evaluate(()=>getFilteredRiskResults());ok(results.length===4,'full risk page includes every active SKU');
 for(const [sku,risk,count]of [['A','High Risk',16],['B','Watch',9],['C','Safe',0],['D','Missing Data',null]]){const r=results.find(r=>r.sku===sku);ok(r.riskLevel===risk,sku+' expected '+risk+': '+JSON.stringify(r));ok(r.promoSalesDays===count,sku+' numerator matches actual positive-sales-day intersection');}
 const future=results.find(r=>r.sku==='A').futureRisks[0];ok(!future.missing&&future.partial&&future.skippedDateRows===1,'undated source rows leave future windows usable and explicitly partial');
 ok((await page.locator('#cr-table-scroll-body [title*="undated sales record"]').count())>0,'excluded undated observations are disclosed in tooltips');
 ok((await page.locator('.cr-kpi-value').allTextContents()).join(',')==='1,1,1','missing history never inflates Safe KPI');ok((await page.locator('#cr-table-scroll-body').innerText()).includes('53.3%'),'ratio displayed');
 ok(await page.evaluate(()=>requests.length===1&&requests[0].name==='inventoryReplenishment'&&JSON.stringify(requests[0].p)===JSON.stringify(payload)),'only two requested tables and no historical truncation');
 await page.screenshot({path:'output/promo-ratio-20261126/risk-'+width+'.png',fullPage:true});
 await page.evaluate(async()=>{window.capped=true;await crRetryRiskEvidence();});ok((await page.locator('#cr-table-scroll-body').innerText()).includes('truncated'),'capped data visibly refused');ok((await page.locator('.cr-kpi-value').allTextContents()).join(',')==='0,0,0','failed data never produces Safe');
 await page.evaluate(async()=>{window.capped=false;await crRetryRiskEvidence();});ok(await page.evaluate(()=>_crRiskEvidence.state==='READY'),'explicit Retry recovers');ok(!errors.length,JSON.stringify(errors));await page.close();}
}finally{await browser.close();}console.log('PROMOTION_RISK_PAGE_BROWSER_PASS '+checks+' full page / actual DB normalization / actual GAS response builder');})().catch(e=>{console.error(e);process.exitCode=1;});
