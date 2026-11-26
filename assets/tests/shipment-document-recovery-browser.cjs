'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {extract}=require('./ad4/extract.cjs');
const runtime=process.env.KM_NODE_MODULES||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
const source=fs.readFileSync('assets/js/pages/shipping-history.js','utf8');
const names=['_shEsc','_shDispatchHeld14_','_shDispatchHold14_','_shDispatchUnknown_','_shCloseConfirmModal','_shActiveListEl_','_shToggleCardEl','_ensureShipmentOverviewMarkup','updateHistoryDateTriggerText','formatHistoryDate','shViewShipmentDocuments','shDocumentPanelHtml','_shDocRowHtml','_shDocIcon','_shDocLink','shDocPanelState','_shDocHelp','_shDocErrorHtml','shRetryDocument'];
const vars=['historyState','shOverviewFilterState','SH_DISPATCH_HOLD14_','SH_DISPATCH_CHECK14_','SH_DISPATCHED_STATUSES_R71_','SH_DOC_REFRESH_','SH_DOC_STATE_LABEL_','SH_DOC_ALERT_STATE_','SH_DOC_PANEL_VISIBLE_ROWS_','SH_DOC_REASON_HELP_'];
const extracted=extract(source,n=>names.includes(n),n=>vars.includes(n));
for(const name of names)assert(extracted.some(p=>p.name===name),'Missing source extraction: '+name);
const code=extracted.map(p=>p.text).join('\n');
const overviewMarkup='<section id="shippinghistory-section" style="display:none"><h2>Shipment Overview</h2><div id="sh-f-country-mount"></div><div id="sh-f-method-mount"></div><button id="historyDateTrigger"><span class="history-date-trigger-text">Last 30 days</span></button><div class="filter-group--sku"><input value="OTHER-SKU"></div><div class="history-list"><article class="history-card" id="sh-card-OTHER"><div class="history-card-details" style="display:none"></div></article></div></section>';
const out=path.resolve('output/document-recovery-20261126/browser');fs.mkdirSync(out,{recursive:true});
let passed=0;function check(label,condition){assert(condition,label);passed++;console.log('PASS '+label);}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{requests.push(r.request().url());return r.abort();});
  await page.setContent('<style>body{margin:16px;font:14px Arial}*{box-sizing:border-box}.history-list{max-width:760px}.history-card{padding:16px;border:1px solid #ddd}.history-expand-btn{padding:6px 10px}#sh-confirm-actions{display:flex;gap:8px;flex-wrap:wrap}#sh-confirm-modal{max-width:460px;padding:20px;background:#fff;border:1px solid #ddd}button{min-height:32px}h2{font-size:20px}</style><div id="shippinghistory-mount"></div><section id="shipment-draft-section" class="active"><h2>Shipment Workspace</h2><select id="shd-filter-status"><option value="ready_to_ship">Ready to Ship</option><option value="">All</option></select><div class="history-list"><article class="history-card" id="sh-card-S"><div class="history-card-details" style="display:none"></div></article></div></section><div id="sh-confirm-modal"><h3>Confirm Shipment</h3><p id="fixture-status"></p><div id="sh-confirm-actions"><button id="sh-confirm-cancel">Close</button><button id="sh-confirm-go">Confirm &amp; Dispatch</button></div></div>');
  await page.addScriptTag({content:code});
  await page.evaluate(markup=>{
   window.dispatches=0;window.readbacks=0;window.retries=[];window.navigation=[];window.filterSelections={country:['AU'],method:['sea']};window.readbackContexts=[];window.partialLoads=[];window.readStatus='shipped';window.reply={success:true,result:{ok:true,failed:0,configuration_required:0}};
   shOverviewFilterState={country:['AU'],method:['sea']};
   window.docs={entity_type:'shipment',entity_id:'S',documents:[],generation_status:'CONFIRMED_RETRY_REQUIRED',can_retry:true,error:{reason:'DOCUMENT_OUTPUTS_MISSING',retryable:true}};
   window.KM={partialLoader:{loadPartial:async(...args)=>{
    partialLoads.push(args);await new Promise(resolve=>setTimeout(resolve,20));
    document.querySelector(args[2]).innerHTML=markup;
    for(const key of ['country','method'])document.getElementById('sh-f-'+key+'-mount').__kmfCtl={setSelected:values=>{filterSelections[key]=values.slice();}};
   }},api:{getWorkspace:async()=>({success:true,data:{shipments:[{shipmentId:'S',status:readStatus,documents:[],documentGenerationStatus:'CONFIRMED_RETRY_REQUIRED'}]}})},DB:{adaptShipmentWorkspace:x=>x,retryDocumentGeneration:async(type,id)=>{retries.push([type,id]);return reply;}}};
   window.showSection=key=>{
    navigation.push({key,preloaded:!!document.getElementById('shippinghistory-section')});
    for(const [id,active] of [['shipment-draft-section',key==='shipment-draft'],['shippinghistory-section',key==='shipment-overview']]){
     const section=document.getElementById(id);if(section){section.classList.toggle('active',active);section.style.display=active?'block':'none';}
    }
   };
   window._shReadbackOne_=id=>{
    readbackContexts.push({id,overview:document.getElementById('shippinghistory-section').classList.contains('active'),filters:JSON.stringify(shOverviewFilterState),selections:JSON.stringify(filterSelections),dateCleared:historyState.dateRange.start===null&&historyState.dateRange.end===null,sku:document.querySelector('#shippinghistory-section .filter-group--sku input').value});
    return new Promise(resolve=>setTimeout(()=>{
     const list=document.querySelector('#shippinghistory-section .history-list'),old=list.querySelector('[id="sh-card-S"]');if(old)old.remove();
     list.insertAdjacentHTML('beforeend','<article class="history-card" id="sh-card-S"><h3>Fixture Shipment</h3><button class="history-expand-btn" aria-expanded="false">Expand</button><div class="history-card-details" style="display:none">'+shDocumentPanelHtml(docs)+'</div></article>');readbacks++;resolve('TARGETED');
    },20));
   };
   SH_DOC_REFRESH_.shipment=id=>shViewShipmentDocuments(id);
   document.getElementById('sh-confirm-go').addEventListener('click',()=>dispatches++);
  },overviewMarkup);
  await page.evaluate(()=>_shDispatchUnknown_('S',null,document.getElementById('sh-confirm-go'),document.getElementById('sh-confirm-cancel'),document.getElementById('fixture-status')));
  check(width+' recovered confirmation offers View Documents',await page.locator('#sh-confirm-go').textContent()==='View Documents');
  check(width+' Overview starts unloaded with unrelated filters',await page.evaluate(()=>!document.getElementById('shippinghistory-section')&&shOverviewFilterState.country.length===1&&shOverviewFilterState.method.length===1&&!!historyState.dateRange.start));
  await page.locator('#sh-confirm-go').click();await page.waitForFunction(()=>readbacks===1&&document.querySelector('#shippinghistory-section [id="sh-card-S"] .history-card-details').style.display==='block');
  check(width+' navigation removes the old dispatch event listener',await page.evaluate(()=>dispatches===0));
  check(width+' navigation preloads Overview before selecting its route',await page.evaluate(()=>JSON.stringify(partialLoads)==='[["shippinghistory","assets/html/pages/shipping-history.html","#shippinghistory-mount"]]'&&JSON.stringify(navigation)==='[{"key":"shipment-overview","preloaded":true}]'));
  check(width+' navigation clears Overview filters before targeted readback',await page.evaluate(()=>readbackContexts.length===1&&readbackContexts.every(c=>c.id==='S'&&c.overview&&c.filters==='{"country":[],"method":[]}'&&c.selections==='{"country":[],"method":[]}'&&c.dateCleared&&c.sku==='')));
  check(width+' date trigger reflects the cleared range',await page.locator('#historyDateTrigger').innerText()==='Select date range');
  check(width+' navigation leaves the Draft status filter unchanged',await page.locator('#shd-filter-status').inputValue()==='ready_to_ship');
  check(width+' navigation waits for readback and opens only the target Overview card',await page.evaluate(()=>document.querySelector('#shippinghistory-section [id="sh-card-S"] .history-card-details').style.display==='block'&&document.querySelector('#shippinghistory-section [id="sh-card-S"] .history-expand-btn').getAttribute('aria-expanded')==='true'&&document.querySelector('#shippinghistory-section [id="sh-card-OTHER"] .history-card-details').style.display==='none'&&document.querySelector('#shipment-draft-section .history-card-details').style.display==='none'&&!document.getElementById('shipment-draft-section').classList.contains('active')));
  check(width+' empty document panel offers exactly one generation control',await page.locator('#shippinghistory-section .sh-doc-retry').count()===1);
  check(width+' empty panel does not fabricate a download',await page.locator('#shippinghistory-section .sh-doc-panel a').count()===0);
  await page.screenshot({path:path.join(out,'missing-'+width+'.png'),fullPage:true});
  await page.evaluate(async()=>{
   docs={...docs,documents:[{document_label:'Shipping Detail',file_name:'Fixture Shipping Detail',status:'READY',file_url:'https://example.invalid/file',pdf_file_url:'https://example.invalid/pdf'},{document_label:'Carrier Booking',file_name:'Fixture Carrier Booking',status:'READY',file_url:'https://example.invalid/booking',pdf_file_url:'https://example.invalid/booking-pdf'}],generation_status:'READY',can_retry:false,error:null};
   await shRetryDocument('shipment','S',document.querySelector('#shippinghistory-section .sh-doc-retry'));
  });
  check(width+' generation sends only document retry for the entity',await page.evaluate(()=>JSON.stringify(retries)==='[["shipment","S"]]'&&dispatches===0));
  check(width+' successful retry reuses Overview markup and reopens the refreshed card',await page.evaluate(()=>partialLoads.length===1&&navigation.length===2&&navigation.every(n=>n.key==='shipment-overview'&&n.preloaded)&&readbacks===2&&document.querySelector('#shippinghistory-section [id="sh-card-S"] .history-card-details').style.display==='block'));
  check(width+' success refreshes to real file metadata and PDF links',await page.locator('#shippinghistory-section .sh-doc-panel a').count()===4);
  check(width+' ready document panel has no missing-output warning',await page.locator('#shippinghistory-section .sh-doc-error').count()===0);
  check(width+' links retain safe new-tab attributes',await page.locator('#shippinghistory-section .sh-doc-panel a').evaluateAll(a=>a.every(x=>x.target==='_blank'&&x.rel.includes('noopener'))));
  const overflow=await page.locator('#shippinghistory-section .sh-doc-panel').evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('button,a,.sh-doc-row')].some(c=>{const q=c.getBoundingClientRect();return q.left<r.left-1||q.right>r.right+1;});});
  check(width+' document controls stay within the panel',!overflow);
  await page.screenshot({path:path.join(out,'ready-'+width+'.png'),fullPage:true});
  const failure=await page.evaluate(async()=>{
   let refreshed=0;SH_DOC_REFRESH_.shipment=()=>refreshed++;
   const b=document.createElement('button');document.body.appendChild(b);
   reply={success:true,result:{ok:false,configuration_required:1,results:[{class_key:'CARRIER_BOOKING',status:'CONFIGURATION_REQUIRED',reason:'DOCUMENT_REQUIRED_FIELD_MISSING'}]}};
   await shRetryDocument('shipment','S',b);const failed=b.textContent==='Retry failed'&&b.title.includes('CARRIER_BOOKING: DOCUMENT_REQUIRED_FIELD_MISSING')&&refreshed===1;
   reply={success:false,stage:'network'};await shRetryDocument('shipment','S',b);
   return {failed,unknown:b.textContent==='Outcome unknown'&&refreshed===1&&retries.length===3&&retries.every(([type,id])=>type==='shipment'&&id==='S'),dispatches};
  });
  check(width+' configuration errors are not reported as success',failure.failed);
  check(width+' network uncertainty is not called failure or automatically resent',failure.unknown&&failure.dispatches===0);
  check(width+' no page exceptions or live requests',errors.length===0&&requests.length===0);
  await page.close();
 }}finally{await browser.close();}
 console.log('SHIPMENT_DOCUMENT_RECOVERY_BROWSER_PASS '+passed+' live_requests=0');
})().catch(e=>{console.error(e);process.exitCode=1;});
