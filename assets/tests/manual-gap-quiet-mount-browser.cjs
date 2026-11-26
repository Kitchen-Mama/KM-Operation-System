'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root,read}=require('./helpers/write-command-flight-world.cjs'),{mount}=require('./manual-gap-status-browser.cjs');
const runtime=process.env.KM_NODE_MODULES||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[runtime]}));let checks=0;
function check(label,value){assert(value,label);checks++;console.log('PASS '+label);}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('output/gap-investigation-20261126',{recursive:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:950}}),errors=[],outbound=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url()==='http://fixture.test/'?r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><body>'+read('assets/html/pages/inventory-replenishment.html')+'</body>'}):(outbound.push(r.request().url()),r.abort()));
  await mount(page,'quiet');await page.evaluate(()=>_irResumeGapJobNow_());
  check(width+' clean mount has no status read or notification',await page.evaluate(()=>calls.statuses===0&&(!document.getElementById('replen-ai-support-notice')||document.getElementById('replen-ai-support-notice').hidden)));
  await page.evaluate(()=>{_irManualGap={scope,runId:null,dispatched:true,unknown:true};_irManualGapStore_(_irManualGap);_irAiSupportNotice_('info','Recalculate','Checking that no server job is running before clearing the local wait...');return _irResumeGapJobNow_();});
  check(width+' stale Checking is removed and unresolved guard retained',await page.evaluate(()=>calls.statuses===0&&!!_irManualGapHeld_()&&_irRecalcAllBusy&&document.getElementById('replen-ai-support-notice').hidden));
  await page.locator('#replenAiSupportTrigger').click();await page.getByRole('menuitem',{name:'Check calculation status',exact:true}).click();
  await page.waitForFunction(()=>_irManualGap&&!_irManualGap.checking);
  check(width+' explicit menu status performs one read, never starts a job',await page.evaluate(()=>calls.statuses===1&&calls.starts===0)&&await page.getByRole('button',{name:'Clear local wait',exact:true}).isVisible());
  await page.evaluate(()=>{KM.DB.getGapJobStatus=()=>{calls.statuses++;return new Promise(resolve=>window.resolveQuietStatus=resolve);};window.pendingQuietCheck=_irManualGapCheck_();});
  await page.locator('#replen-ai-support-notice [aria-label="Close"]').click();
  await page.evaluate(()=>{resolveQuietStatus(job('DONE','OLD'));return pendingQuietCheck;});
  check(width+' dismiss survives a late response without removing duplicate-start guard',await page.evaluate(()=>document.getElementById('replen-ai-support-notice').hidden&&_irManualGap.noticeDismissed&&calls.starts===0));
  await mount(page,'quiet');await page.evaluate(()=>_irResumeGapJobNow_());
  check(width+' full reload restores guard silently without reads',await page.evaluate(()=>calls.statuses===0&&!!_irManualGapHeld_()&&_irManualGap.noticeDismissed&&(!document.getElementById('replen-ai-support-notice')||document.getElementById('replen-ai-support-notice').hidden)));
  await page.evaluate(()=>{KM.DB.getGapJobStatus=()=>{calls.statuses++;return Promise.resolve(job('NONE',null));};});
  await page.locator('#replenAiSupportTrigger').click();await page.screenshot({path:path.join(root,'output/gap-investigation-20261126/quiet-status-'+width+'.png'),fullPage:true});
  await page.getByRole('menuitem',{name:'Check calculation status',exact:true}).click();await page.waitForFunction(()=>_irManualGap&&!_irManualGap.checking);
  await page.getByRole('button',{name:'Clear local wait',exact:true}).click();await page.waitForFunction(()=>!_irManualGap);
  check(width+' confirmed local clear removes stored wait and status action',await page.evaluate(()=>!sessionStorage.getItem(_irManualGapKey_())&&!document.querySelector('[data-ir-job-status]')&&calls.starts===0));
  await page.locator('#replen-ai-support-notice [aria-label="Close"]').click();await mount(page,'quiet');await page.evaluate(()=>_irResumeGapJobNow_());
  check(width+' cleared wait never reappears on reload',await page.evaluate(()=>calls.statuses===0&&!_irManualGapHeld_()&&(!document.getElementById('replen-ai-support-notice')||document.getElementById('replen-ai-support-notice').hidden)));
  await page.evaluate(()=>{_irManualGap={scope,runId:'KNOWN',dispatched:true,unknown:true};_irManualGapStore_(_irManualGap);_irRecoScopeRequest=()=>null;KM.DB.getGapJobStatus=()=>new Promise(resolve=>window.resolveKnownQuiet=resolve);window.knownQuiet=_irManualGapCheck_();});
  await page.locator('#replen-ai-support-notice [aria-label="Close"]').click();await page.evaluate(()=>{resolveKnownQuiet(job('DONE','KNOWN'));return knownQuiet;});
  check(width+' late exact-run completion stays dismissed even after releasing the wait',await page.evaluate(()=>!_irManualGapHeld_()&&document.getElementById('replen-ai-support-notice').hidden));
  check(width+' no browser errors or live requests',errors.length===0&&outbound.length===0);await page.close();
 }}finally{await browser.close();}
 console.log('MANUAL_GAP_QUIET_MOUNT_PASS '+checks+' live_business_writes=0');
})().catch(e=>{console.error(e);process.exitCode=1;});
