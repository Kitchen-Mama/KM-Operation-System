'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));let checks=0;function ok(v,label){assert(v,label);checks++;}
const raw={purchase_orders:[
 {purchase_order_id:'P1',po_no:'TEST-PRODUCTION',order_status:'partial_completed',warehouse_id:'WH1',created_at:'2026-11-25',expected_completion_date:'2026-12-10'},
 {purchase_order_id:'P2',po_no:'TEST-READY',order_status:'completed',warehouse_id:'WH1',created_at:'2026-11-25',expected_completion_date:'2026-12-10'}],
 purchase_order_lines:[
 {purchase_order_line_id:'L1',purchase_order_id:'P1',sku:'CO1100-R',ordered_qty:100,completed_qty:40,shipped_qty:10,remaining_qty:37},
 {purchase_order_line_id:'L2',purchase_order_id:'P1',sku:'CO1100-R',ordered_qty:50,completed_qty:20,shipped_qty:5,remaining_qty:15},
 {purchase_order_line_id:'L3',purchase_order_id:'P1',sku:'CO1100-S',ordered_qty:30,completed_qty:0,shipped_qty:0,remaining_qty:0},
 {purchase_order_line_id:'L4',purchase_order_id:'P2',sku:'CO1100-R',ordered_qty:200,completed_qty:200,shipped_qty:60,remaining_qty:123},
 {purchase_order_line_id:'L5',purchase_order_id:'P2',sku:'CO1100-S',ordered_qty:0,completed_qty:0,shipped_qty:0,remaining_qty:0}],
 sku_details:[{sku:'CO1100-R',category:'Electric Can Opener',series:'CO1100'},{sku:'CO1100-S',category:'Electric Can Opener',series:'CO1100'}],warehouses:[{warehouse_id:'WH1',warehouse_name:'Factory CN'}]};
const c=vm.createContext({});vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/50_api_v1_purchase_order_workspace.gs','utf8'),c);
const dto=JSON.parse(JSON.stringify(c.poWorkspaceBuild_(raw,{page:{number:1,size:2000}}))),before=JSON.stringify(raw);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('output/po-quantities-20261126',{recursive:true});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'+fs.readFileSync('assets/html/pages/purchase-order-list.html','utf8'));
 for(const file of ['assets/css/base.css','assets/css/components.css','assets/css/layout.css','assets/css/responsive-foundation.css','assets/css/pages/procurement.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
 await page.addStyleTag({content:'body{margin:0;padding:16px;font-family:Arial;background:white}#purchase-order-list-section{display:block}*{box-sizing:border-box}'});
 await page.evaluate(dto=>{window.calls=[];window.failRead=false;window.KM_PRODUCTION_CONFIG_={endpoint:'https://script.google.com/macros/s/FIXTURE/exec'};window.KM={lifecycle:{register:(_id,h)=>window.hooks=h},api:{workspaceApiActive:()=>true,getWorkspace:async(name,payload)=>{calls.push({name,payload});return failRead?{success:false,errors:[{code:'FIXTURE_READ_ERROR',message:'Source unavailable'}]}:{success:true,data:dto};}}};window.fetch=()=>{throw Error('Unexpected direct network access');};},dto);
 for(const file of ['assets/js/api/operation-system-db-api.js','assets/js/utils/multi-select-filter.js','assets/js/pages/purchase-order-list.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.evaluate(()=>{KM.DB.isScopedReadEligible=()=>true;hooks.mount();});await page.waitForFunction(()=>document.querySelector('#pol-tbody').textContent.includes('TEST-PRODUCTION'));
 const header=()=>page.locator('#pol-thead-row th').allTextContents(),numbers=()=>page.locator('#pol-tbody tr').evaluateAll(rows=>rows.map(r=>Array.from(r.querySelectorAll('.pc-num')).map(c=>c.textContent.trim())));
 ok((await header()).join('|')==='PO|Supplier / Factory|Category|Series|SKU|Ordered|Completed|In Production|Note','In Production has its own columns');
 ok(JSON.stringify(await numbers())===JSON.stringify([['150','60','90'],['30','0','30']]),'DB ordered and completed aggregate per SKU; production is ordered minus completed, not shipping remaining');
 ok((await page.locator('#pol-result-meta').innerText()).includes('120 in production'),'production summary is not the 52 units ready to ship');
 ok(await page.locator('#pol-tbody tr').first().locator('td').count()===9,'nine production columns');
 await page.evaluate(()=>polToggleGantt());ok((await page.locator('.pol-gantt-lane').first().getAttribute('title')).includes('In Production 90'),'Gantt tooltip uses the active tab quantities');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.screenshot({path:'output/po-quantities-20261126/production-'+width+'.png',fullPage:true});
 await page.locator('[data-tab="ready"]').click();ok((await header()).join('|')==='PO|Supplier / Factory|Category|Series|SKU|Ordered|Completed|Shipped|Remaining|Note','Ready has Ordered immediately before Completed');
 ok(JSON.stringify(await numbers())===JSON.stringify([['200','200','60','123'],['0','0','0','0']]),'Ready preserves backend remaining (123, not recomputed 140) and displays zero');
 ok((await page.locator('#pol-result-meta').innerText()).includes('123 remaining'),'Ready summary preserves backend balance');
 ok(await page.locator('#pol-tbody tr').first().locator('td').count()===10,'ten Ready columns');
 ok(await page.locator('#pol-tbody [rowspan="2"]').count()===4,'PO, factory, category and Series merged rows remain aligned');
 ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'table overflow contained in its scroll wrapper');
 ok(await page.locator('#pol-tbody .pc-num').evaluateAll(cells=>cells.every(cell=>{const range=document.createRange();range.selectNodeContents(cell);const a=range.getBoundingClientRect(),b=cell.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;})),'quantity text fits its cells');
 await page.screenshot({path:'output/po-quantities-20261126/ready-'+width+'.png',fullPage:true});
 if(width===390){await page.locator('.procurement-table-wrap').first().evaluate(e=>e.scrollLeft=e.scrollWidth);await page.screenshot({path:'output/po-quantities-20261126/ready-390-quantities.png',fullPage:true});}
 await page.locator('#pol-f-sku').fill('NOT-A-SKU');await page.evaluate(()=>polSearch());ok(await page.locator('#pol-tbody td').getAttribute('colspan')==='10','Ready empty state spans ten columns');
 await page.locator('[data-tab="in_production"]').click();ok(await page.locator('#pol-tbody td').getAttribute('colspan')==='9','production empty state spans nine columns');
 await page.evaluate(()=>polReset());await page.locator('[data-tab="ready"]').click();await page.evaluate(()=>{window.failRead=true;polRetryRead();});await page.waitForFunction(()=>document.querySelector('#pol-tbody').textContent.includes('Source unavailable'));
 ok(await page.locator('#pol-tbody td').getAttribute('colspan')==='10','Ready read error spans ten columns');
 await page.evaluate(()=>{window.failRead=false;polRetryRead();});await page.waitForFunction(()=>document.querySelector('#pol-tbody').textContent.includes('TEST-READY'));
 ok(await page.evaluate(()=>calls.every(c=>c.name==='purchaseOrder'&&c.payload.page.size===2000)),'existing read-only bounded PO workspace used');
 ok(!errors.length,JSON.stringify(errors));await page.close();
}}finally{await browser.close();}assert.equal(JSON.stringify(raw),before);console.log('PO_OVERVIEW_QUANTITIES_BROWSER_PASS '+checks+' desktop/mobile / real GAS read DTO / full DB adapter / no writes');})().catch(e=>{console.error(e);process.exitCode=1;});
