'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const runtime=process.env.KM_NODE_MODULES||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
const {extract}=require('./ad4/extract.cjs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});let passed=0;
 const out='output/carrier-document-r3-20261123/browser';fs.mkdirSync(out,{recursive:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
  await page.setContent('<style>body{font:14px Arial;margin:0}.btn{padding:8px;border:1px solid #bbb}</style><main></main>');
  for(const f of ['assets/vendor/exceljs-4.4.0.min.js','assets/js/utils/template-export.js','assets/js/utils/import-batch.js','assets/js/utils/po-factory-import.js'])await page.addScriptTag({content:fs.readFileSync(f,'utf8')});
  await page.evaluate(()=>{
   KM.DB={importTemplateGet:async()=>({success:true,schema_version:'TEST',exported_at:'2026-11-23',scope:{warehouse_id:'WH'},
    lists:{factories:[{value:'WH',label:'Factory',status:'active'}]},sheets:[{name:'StockPO',instruction:'',columns:[{key:'row_type',kind:'locked',hidden:true},{key:'id',kind:'locked',hidden:true},{key:'sku',kind:'editable',type:'text'},{key:'quantity',kind:'editable'}],
     rows:[{id:'ID',sku:'A',quantity:1}],example:{sku:'EXAMPLE',quantity:40}}]})};
   KM.poFactoryImport.open();
  });
  await page.locator('#km-imb-scope-warehouse_id').selectOption('WH');
  await page.locator('#km-imb-workflow-0').click();
  const downloadPromise=page.waitForEvent('download');await page.locator('#km-imb-download').click();const download=await downloadPromise;
  assert(download.suggestedFilename().endsWith('.xlsx'));await download.saveAs(path.join(out,'stock-po-'+width+'.xlsx'));
  await page.waitForFunction(()=>document.querySelector('#km-imb-download')?.disabled===false);
  assert(!await page.locator('#km-imb-status').innerText().then(s=>s.includes('failed')));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,'import-'+width+'.png'),fullPage:true});
  await page.addScriptTag({content:"var SH_DOC_REFRESH_={};function _shEsc(x){return String(x||'');}function _shDocIcon(){return '';}function _shDocLink(){return '';}"});
  const parts=extract(fs.readFileSync('assets/js/pages/shipping-history.js','utf8'),n=>['_shDocRowHtml','shRetryDocument'].includes(n),()=>false);
  await page.addScriptTag({content:parts.map(p=>p.text).join('\n')});
  await page.evaluate(()=>{KM.importBatch.close();window.retryCalls=[];KM.DB.retryDocumentGeneration=async(type,id)=>{retryCalls.push([type,id]);return {success:true};};document.querySelector('main').innerHTML=_shDocRowHtml({status:'CONFIGURATION_REQUIRED',retryable:true,document_type:'commercial_invoice'},true,'S','shipment');});
  await page.getByRole('button',{name:'Retry',exact:true}).click();await page.waitForFunction(()=>retryCalls.length===1);
  assert.deepEqual(await page.evaluate(()=>retryCalls),[['shipment','S']]);
  assert.deepEqual(errors,[]);passed++;console.log('PASS '+width+' actual PO adapter modal download, no overflow or runtime errors');await page.close();
 }}finally{await browser.close();}
 console.log('IMPORT_R3_BROWSER_PASS '+passed);
})().catch(e=>{console.error(e);process.exitCode=1;});
