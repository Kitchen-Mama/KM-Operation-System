'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {extract}=require('./ad4/extract.cjs');
const runtime=process.env.KM_NODE_MODULES||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
const source=fs.readFileSync('assets/js/pages/shipping-history.js','utf8');
const names=['_shEsc','_shDispatchHeld14_','_shDispatchHold14_','_shDispatchUnknown_','_shCloseConfirmModal','_shActiveListEl_','_shToggleCardEl','shViewShipmentDocuments','shDocumentPanelHtml','_shDocRowHtml','_shDocIcon','_shDocLink','shDocPanelState','_shDocHelp','_shDocErrorHtml','shRetryDocument'];
const vars=['SH_DISPATCH_HOLD14_','SH_DISPATCH_CHECK14_','SH_DISPATCHED_STATUSES_R71_','SH_DOC_REFRESH_','SH_DOC_STATE_LABEL_','SH_DOC_ALERT_STATE_','SH_DOC_PANEL_VISIBLE_ROWS_','SH_DOC_REASON_HELP_'];
const code=extract(source,n=>names.includes(n),n=>vars.includes(n)).map(p=>p.text).join('\n');
const out=path.resolve('output/document-recovery-20261126/browser');fs.mkdirSync(out,{recursive:true});
let passed=0;function check(label,condition){assert(condition,label);passed++;console.log('PASS '+label);}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{requests.push(r.request().url());return r.abort();});
  await page.setContent('<style>body{margin:16px;font:14px Arial}*{box-sizing:border-box}.history-list{max-width:760px}.history-card{padding:16px;border:1px solid #ddd}.history-expand-btn{padding:6px 10px}#sh-confirm-actions{display:flex;gap:8px;flex-wrap:wrap}#sh-confirm-modal{max-width:460px;padding:20px;background:#fff;border:1px solid #ddd}button{min-height:32px}h2{font-size:20px}</style><section id="shippinghistory-section" style="display:none"><div class="history-list"><div class="history-card" id="sh-card-S"><div class="history-card-details" style="display:none"></div></div></div></section><section id="shipment-draft-section" class="active"><h2>Shipment Workspace</h2><select id="shd-filter-status"><option value="ready_to_ship">Ready to Ship</option><option value="">All</option></select><div class="history-list"></div></section><div id="sh-confirm-modal"><h3>Confirm Shipment</h3><p id="fixture-status"></p><div id="sh-confirm-actions"><button id="sh-confirm-cancel">Close</button><button id="sh-confirm-go">Confirm &amp; Dispatch</button></div></div>');
  await page.addScriptTag({content:code});
  await page.evaluate(()=>{
   window.dispatches=0;window.readbacks=0;window.retries=[];window.readStatus='shipped';window.reply={success:true,result:{ok:true,failed:0,configuration_required:0}};
   window.docs={entity_type:'shipment',entity_id:'S',documents:[],generation_status:'CONFIRMED_RETRY_REQUIRED',can_retry:true,error:{reason:'DOCUMENT_OUTPUTS_MISSING',retryable:true}};
   window.KM={api:{getWorkspace:async()=>({success:true,data:{shipments:[{shipmentId:'S',status:readStatus,documents:[],documentGenerationStatus:'CONFIRMED_RETRY_REQUIRED'}]}})},DB:{adaptShipmentWorkspace:x=>x,retryDocumentGeneration:async(type,id)=>{retries.push([type,id]);return reply;}}};
   window._shReadbackOne_=()=>new Promise(resolve=>setTimeout(()=>{
    readbacks++;document.querySelector('#shipment-draft-section .history-list').innerHTML='<article class="history-card" id="sh-card-S"><h3>Fixture Shipment</h3><button class="history-expand-btn" aria-expanded="false">Expand</button><div class="history-card-details" style="display:none">'+shDocumentPanelHtml(docs)+'</div></article>';resolve('TARGETED');
   },20));
   SH_DOC_REFRESH_.shipment=id=>shViewShipmentDocuments(id);
   document.getElementById('sh-confirm-go').addEventListener('click',()=>dispatches++);
  });
  await page.evaluate(()=>_shDispatchUnknown_('S',null,document.getElementById('sh-confirm-go'),document.getElementById('sh-confirm-cancel'),document.getElementById('fixture-status')));
  check(width+' recovered confirmation offers View Documents',await page.locator('#sh-confirm-go').textContent()==='View Documents');
  await page.locator('#sh-confirm-go').click();await page.waitForFunction(()=>readbacks===1);
  check(width+' navigation removes the old dispatch event listener',await page.evaluate(()=>dispatches===0));
  check(width+' navigation clears incompatible status filter',await page.locator('#shd-filter-status').inputValue()==='');
  check(width+' navigation waits for readback and opens only the active card',await page.evaluate(()=>document.querySelector('#shipment-draft-section .history-card-details').style.display==='block'&&document.querySelector('#shippinghistory-section .history-card-details').style.display==='none'));
  check(width+' empty document panel offers exactly one generation control',await page.locator('#shipment-draft-section .sh-doc-retry').count()===1);
  check(width+' empty panel does not fabricate a download',await page.locator('#shipment-draft-section .sh-doc-panel a').count()===0);
  await page.screenshot({path:path.join(out,'missing-'+width+'.png'),fullPage:true});
  await page.evaluate(async()=>{
   docs={...docs,documents:[{document_label:'Shipping Detail',file_name:'Fixture Shipping Detail',status:'READY',file_url:'https://example.invalid/file',pdf_file_url:'https://example.invalid/pdf'},{document_label:'Carrier Booking',file_name:'Fixture Carrier Booking',status:'READY',file_url:'https://example.invalid/booking',pdf_file_url:'https://example.invalid/booking-pdf'}],generation_status:'READY',can_retry:false,error:null};
   await shRetryDocument('shipment','S',document.querySelector('#shipment-draft-section .sh-doc-retry'));
  });
  check(width+' generation sends only document retry for the entity',await page.evaluate(()=>JSON.stringify(retries)==='[["shipment","S"]]'&&dispatches===0));
  check(width+' success refreshes to real file metadata and PDF links',await page.locator('#shipment-draft-section .sh-doc-panel a').count()===4);
  check(width+' ready document panel has no missing-output warning',await page.locator('#shipment-draft-section .sh-doc-error').count()===0);
  check(width+' links retain safe new-tab attributes',await page.locator('#shipment-draft-section .sh-doc-panel a').evaluateAll(a=>a.every(x=>x.target==='_blank'&&x.rel.includes('noopener'))));
  const overflow=await page.locator('#shipment-draft-section .sh-doc-panel').evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('button,a,.sh-doc-row')].some(c=>{const q=c.getBoundingClientRect();return q.left<r.left-1||q.right>r.right+1;});});
  check(width+' document controls stay within the panel',!overflow);
  await page.screenshot({path:path.join(out,'ready-'+width+'.png'),fullPage:true});
  const failure=await page.evaluate(async()=>{
   let refreshed=0;SH_DOC_REFRESH_.shipment=()=>refreshed++;
   const b=document.createElement('button');document.body.appendChild(b);
   reply={success:true,result:{ok:false,configuration_required:1,results:[{class_key:'CARRIER_BOOKING',status:'CONFIGURATION_REQUIRED',reason:'DOCUMENT_REQUIRED_FIELD_MISSING'}]}};
   await shRetryDocument('shipment','S',b);const failed=b.textContent==='Retry failed'&&b.title.includes('CARRIER_BOOKING: DOCUMENT_REQUIRED_FIELD_MISSING')&&refreshed===1;
   reply={success:false,stage:'network'};await shRetryDocument('shipment','S',b);
   return {failed,unknown:b.textContent==='Outcome unknown'&&refreshed===1,dispatches};
  });
  check(width+' configuration errors are not reported as success',failure.failed);
  check(width+' network uncertainty is not called failure or automatically resent',failure.unknown&&failure.dispatches===0);
  check(width+' no page exceptions or live requests',errors.length===0&&requests.length===0);
  await page.close();
 }}finally{await browser.close();}
 console.log('SHIPMENT_DOCUMENT_RECOVERY_BROWSER_PASS '+passed+' live_requests=0');
})().catch(e=>{console.error(e);process.exitCode=1;});
