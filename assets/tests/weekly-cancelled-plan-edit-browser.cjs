'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {createWorld}=require('./helpers/order-mainline-world.cjs'),{parts}=require('./helpers/write-command-flight-world.cjs'),pack=require('../js/core/mixed-carton-packing'),stamp='2026-11-25 10:00:00';
const base=new Function('createWorld','pack','vm','fs','stamp',parts(fs.readFileSync('assets/tests/mixed-carton-command.test.cjs','utf8'),['world'])+';return world;')(createWorld,pack,vm,fs,stamp);
const cancelWorld=new Function('base','vm','fs','assert',parts(fs.readFileSync('assets/tests/shipment-return-review.test.cjs','utf8'),['world'])+';return world;')(base,vm,fs,assert);
const ready=new Function('cancelWorld','vm','fs','assert','require',parts(fs.readFileSync('assets/tests/weekly-cancelled-plan-edit.cjs','utf8'),['ready'])+';return ready;')(cancelWorld,vm,fs,assert,require);
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]})),out=path.resolve('output/cancelled-plan-sku-edit-20261126/browser');
let passed=0;function check(n,v){assert(v,n);passed++;console.log('PASS '+n);}
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [1440,390]){
 const h=ready(),calls=[],page=await browser.newPage({viewport:{width,height:950}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{requests.push(r.request().url());return r.abort();});
 h.put('factory_stock','sku','C','fac_current_stock',2);
 const p=h.rows('shipping_plans')[0],opts={plan:{shippingPlanId:'P1',status:p.status,company:p.company,country:p.country,marketplace:p.marketplace,rejectedReason:p.rejected_reason},token:p.updated_at,values:{},
  lines:h.rows('shipping_plan_lines').map(l=>({shippingPlanLineId:l.shipping_plan_line_id,sku:l.sku,approvedQty:l.approved_qty,raw:l}))};
 const skus=h.rows('marketplace_skus').map(r=>({sku:r.sku,company:r.company,country:r.country,marketplace:r.marketplace,raw:r}));
 await page.exposeFunction('saveFixture',body=>{calls.push(body);return h.call(body);});
 await page.setContent('<!doctype html><html><body><h2>Rejected Plan</h2></body></html>');
 await page.evaluate(()=>{window.KM_PRODUCTION_CONFIG_={endpoint:'https://script.google.com/macros/s/SYNTHETIC_ONLY/exec'};window.fetch=async(_url,options)=>new Response(JSON.stringify(await saveFixture(JSON.parse(options.body))),{status:200});});
 await page.addStyleTag({content:fs.readFileSync('assets/css/pages/shipping-plan.css','utf8')});
 for(const f of ['assets/js/api/operation-system-db-api.js','assets/js/core/mixed-carton-packing.js','assets/js/utils/weekly-draft-editor.js'])await page.addScriptTag({content:fs.readFileSync(f,'utf8')});
 await page.evaluate(async({opts,skus})=>{KM.DB.envId=()=> 'env:cancelled-plan-test';KM.DB.loadScopedTables=async()=>({marketplaceSkus:skus});window.readbacks=0;opts.save=b=>KM.DB.updateShippingPlanLineQty(b);opts.readback=async()=>{readbacks++;return {};};await KM.weeklyDraftEditor.open(opts);},{opts,skus});
 await page.locator('.sp-sku-editor__add select').selectOption('C');await page.locator('[data-add]').click();await page.getByLabel('Quantity C',{exact:true}).fill('30');await page.locator('[data-save]').click();
 await page.waitForFunction(()=>document.querySelector('.sp-sku-editor [role=status]')?.textContent.includes('WEEKLY_STOCK_INSUFFICIENT'));
 check(width+' actual stock refusal shows specific issue, not only generic import failure',!(await page.locator('[role=status]').innerText()).includes('file no longer validates'));
 check(width+' refused addition keeps entered quantity and allows correction',await page.getByLabel('Quantity C',{exact:true}).inputValue()==='30'&&await page.locator('[data-save]').isEnabled());
 check(width+' failed validation wrote no new line or import receipt',h.rows('shipping_plan_lines').length===2&&h.rows('import_batches').length===0);
 await page.screenshot({path:path.join(out,'validation-'+width+'.png'),fullPage:true});
 const fits=await page.locator('.sp-sku-editor').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1;});
 h.put('factory_stock','sku','C','fac_current_stock',100);await page.locator('[data-save]').click();await page.waitForSelector('.sp-sku-editor',{state:'detached'});
 check(width+' returned and Rejected plan saves added SKU through the real journal',h.rows('shipping_plan_lines').find(l=>l.sku==='C')?.approved_qty===30&&h.rows('import_batches')[0].status==='COMMITTED');
 check(width+' one explicit retry and one readback, no automatic resends',calls.length===2&&calls[0].request_id===calls[1].request_id&&await page.evaluate(()=>readbacks)===1);
 check(width+' old cancelled shipment and released holds stay unchanged',h.rows('shipments')[0].status==='cancelled'&&h.rows('factory_stock').every(s=>s.fac_reserved_stock===0));
 check(width+' dialog fits desktop/mobile without outbound requests or exceptions',fits&&errors.length===0&&requests.length===0);await page.close();
}}finally{await browser.close();}console.log('WEEKLY_CANCELLED_PLAN_BROWSER_PASS '+passed+' live_business_writes=0');})().catch(e=>{console.error(e);process.exitCode=1;});
