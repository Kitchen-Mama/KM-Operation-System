'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'), read=p=>fs.readFileSync(path.join(root,p),'utf8');
const runtime=process.env.KM_NODE_MODULES||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});let checks=0;
  const out=path.join(root,'output/sku-image-fix-20261125');fs.mkdirSync(out,{recursive:true});
  try{for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.route('**/*',r=>r.request().url().endsWith('/assets/img/products/SJ1210-R.jpg')
      ?r.fulfill({contentType:'image/jpeg',body:fs.readFileSync(path.join(root,'assets/img/products/SJ1210-R.jpg'))}):r.abort());
    await page.setContent('<base href="https://fixture.invalid/">'+read('assets/html/pages/sku-details.html'));
    for(const css of ['base.css','components.css','layout.css','pages/sku-details.css'])await page.addStyleTag({content:read('assets/css/'+css)});
    for(const f of ['km-repo-asset-manifest.js','km-image-reference-policy.js','sku-overrides.js'])await page.addScriptTag({content:read('assets/js/utils/'+f)});
    await page.addScriptTag({content:read('assets/js/pages/sku-details.js')});
    await page.evaluate(()=>{
      document.querySelectorAll('.module-section').forEach(e=>{e.classList.add('active');e.style.display='block';});
      renderSkuLifecycleTable('running',[{sku:'SJ1210-R',series:'SJ1210',category:'Slow Juicer',productName:'Juicer',lifecycle:'Running in the Market',image_url:'assets/img/products/SJ1210-R.jpg'}]);
    });
    const img=page.locator('#runningScrollBody img');
    await img.waitFor({state:'visible'});
    await page.waitForFunction(()=>{const i=document.querySelector('#runningScrollBody img');return i&&i.complete&&i.naturalWidth>0;});
    assert.equal(await img.count(),1);checks++;
    assert.equal(await img.getAttribute('src'),'assets/img/products/SJ1210-R.jpg');checks++;
    assert(await img.evaluate(i=>i.naturalWidth>0&&i.naturalHeight>0));checks++;
    assert.equal(await img.evaluate(i=>getComputedStyle(i.nextElementSibling).display),'none');checks++;
    await page.screenshot({path:path.join(out,'sku-image-'+width+'.png')});await page.close();
  }}finally{await browser.close();}
  console.log('Product image browser: '+checks+' checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
