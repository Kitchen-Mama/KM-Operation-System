const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const { createPlanningWorld } = require('./helpers/order-planning-mainline-world.cjs');
const { openHarness } = require('./order-mainline-browser-c1.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const read = p => fs.readFileSync(p, 'utf8'), plain = x => JSON.parse(JSON.stringify(x));
const router = vm.createContext({}); vm.runInContext(read('assets/specs/active/apps-script/01_router.gs'), router);
const p = plain(router.RTR_PRODUCTION_PROFILE_);
const output = 'output/manual-allocation-20261124/verification';
let checks = 0;
function check(name, value) { assert(value, name); checks++; console.log('PASS '+name); }
function world() {
  const h = createPlanningWorld(), base = h.dispatch;
  h.c.OP_GAP_TABLE_ = 'order_planning_gap';
  h.sheet('order_planning_gap', ['company','country','marketplace','sku','calculation_status'], [
    { company:'KM',country:'US',marketplace:'Amazon',sku:'SKU-A',calculation_status:'READY' },
    { company:'KM',country:'US',marketplace:'Amazon',sku:'SKU-B',calculation_status:'READY' }]);
  const handlers = { 'requestOrder.allocationDraft.ensureAndEdit':'handleRequestOrderAllocationDraftEnsureAndEdit_',
    getRecommendationDraftToken:'handleGetRecommendationDraftToken_', updateRecommendationDecisionLocked:'handleUpdateRecommendationDecisionLocked_' };
  h.dispatch = b => {
    if (h.failRead && b.action === 'requestOrderDraft.getActive') return {success:false,error:{code:'FIXTURE_READ_FAILED'}};
    if (!handlers[b.action]) return base(b);
    h.calls.push(plain(b));
    const refusal = router.rtrActionGate_(b.action,b);
    if (refusal) return { success:false, code:refusal.code, error:{ code:refusal.code } };
    if (h.failEdit && b.action === 'updateRecommendationDecisionLocked') return { success:false,error:{code:'FIXTURE_EDIT_FAILED'} };
    return plain(h.c[handlers[b.action]](b));
  };
  return h;
}
async function setup(browser,width,h,old=false) {
  const host = await openHarness(browser,width,h,{endpoint:p.endpoint}), {page}=host;
  await page.clock.setFixedTime(new Date('2026-11-24T10:00:00+08:00'));
  await page.evaluate(policy => {
    window.fixturePolicy = policy;
    KM.passwordAccess = { assertWriteAllowed() {}, isSignedIn:()=>true };
    window.fetch = async (url,init={}) => {
      if (url.includes('getClientCapabilities')) return new Response(JSON.stringify({ success:true,production_gate:{
        environment:'KM_PRODUCTION',profile_id:fixturePolicy.profile_id,policy_sha256:fixturePolicy.policy_sha256,db_fp:fixturePolicy.db_fp,
        bound_equals_constant:true,module_stamps_ok:true,flat_v2:true,administration_enabled:false,ai_plan_enabled:false } }));
      const params = new URL(url).searchParams;
      const body = init.body ? JSON.parse(init.body) : JSON.parse(params.get('km_body') || '{}');
      if (!body.action) body.action = params.get('action');
      return new Response(JSON.stringify(await fixtureDispatch(body)), {status:200,headers:{'Content-Type':'application/json'}});
    };
  }, { ...p, policy_sha256:old?'27eedfe4914bcebb1431b7680f5720046e937f49e3f35a7f205212f4c949add8':p.policy_sha256 });
  await page.addScriptTag({content:read('production-config.js')});
  await page.addScriptTag({content:read('production-guard.js')});
  await page.addStyleTag({content:read('assets/css/pages/request-order.css')});
  await page.addScriptTag({content:read('assets/js/pages/request-order.js')});
  await page.evaluate(html => { document.body.innerHTML='<main>'+html+'</main>'; },read('assets/html/pages/request-order.html'));
  await page.evaluate(async()=>{
    KM.api.requestOrderSiteConfirmRequired=()=>false;
    _roL2Ready=true; window._opRecoEnabled=()=>false;
    requestOrderState.data=[{sku:'SKU-A',company:'KM',country:'US',marketplace:'Amazon',series:'SERIES-A',boxSize:10,shortageM1:-40},
      {sku:'SKU-B',company:'KM',country:'US',marketplace:'Amazon',series:'SERIES-B',boxSize:10,shortageM1:-80}];
    await _roHydratePersistedDraftsForLoadedScopes_();
    document.getElementById('ro-request-type').value='t1';
    window.mountAllocation=()=>{
      document.getElementById('allocation-fixture')?.remove();
      var host=document.createElement('div');host.id='allocation-fixture';host.innerHTML=renderExpandPanel(requestOrderState.data[0]);
      document.getElementById('request-order-section').appendChild(host);
    };
    mountAllocation();
  });
  return host;
}
async function scenario(browser,width) {
  const h=world(),{page,errors,outbound,dialogs}=await setup(browser,width,h);
  const qty=page.locator('#allocation-fixture .ro-alloc-qty[data-bucket="T1"]');
  const note=page.locator('#allocation-fixture .ro-alloc-note[data-bucket="T1"]');
  async function change(value,saved=true) {
    await qty.fill(String(value)); await qty.blur();
    if(saved) await page.waitForFunction(()=>document.querySelector('#allocation-fixture .ro-alloc-qty[data-bucket="T1"]').classList.contains('is-saved'));
  }
  try {
    check(width+' actual READY gap readback yields confirmed NO_SAVED_DRAFT',await page.evaluate(()=>_roDraftUiState_(requestOrderState.data[0])==='NO_SAVED_DRAFT'));
    check(width+' manual quantity is enabled and blank, never prefilled from suggested 40',!await qty.isDisabled()&&await qty.inputValue()==='');
    check(width+' no draft creation from render and note alone stays disabled',h.rows('request_order_allocation_drafts').length===0&&await note.isDisabled());
    check(width+' obsolete AI Plan-required banners removed',await page.locator('.ro-rec-nodraft,.ro-alloc-state--none').count()===0);
    await change(-1,false); await change(0,false);
    check(width+' negative and initial zero never create drafts',h.rows('request_order_allocation_drafts').length===0);
    await change(25);
    check(width+' actual edit creates one canonical persisted manual allocation',h.rows('request_order_allocation_drafts').length===1&&h.rows('request_order_allocation_drafts')[0].t1_order_qty===25&&/^RD::MONTHLY_ORDER::/.test(h.rows('request_order_allocation_drafts')[0].request_allocation_draft_id));
    check(width+' persisted quantity unlocks its note',!await note.isDisabled());
    await change(35);
    check(width+' Production guard and real locked writer accept subsequent edits',h.rows('request_order_allocation_drafts')[0].t1_order_qty===35);
    await note.fill('Manual production test'); await note.blur();
    await page.waitForFunction(()=>document.querySelector('#allocation-fixture .ro-alloc-note[data-bucket="T1"]').classList.contains('is-saved'));
    check(width+' actual locked note persists',h.rows('request_order_allocation_drafts')[0].t1_note==='Manual production test');
    await page.evaluate(async()=>{requestOrderState.allocEdits={};await _roHydratePersistedDraftsForLoadedScopes_();mountAllocation();});
    check(width+' fresh hydration retains saved quantity and note',await qty.inputValue()==='35'&&await note.inputValue()==='Manual production test');
    for (const tier of ['T2','T3']) {
      const other=page.locator('#allocation-fixture .ro-alloc-qty[data-bucket="'+tier+'"]');
      await other.fill('15');await other.blur();
      await page.waitForFunction(tier=>document.querySelector('#allocation-fixture .ro-alloc-qty[data-bucket="'+tier+'"]').classList.contains('is-saved'),tier);
      check(width+' manual '+tier+' initializes its own month after hydration',h.rows('request_order_allocation_drafts')[0][tier.toLowerCase()+'_order_qty']===15&&h.rows('request_order_allocation_drafts')[0][tier.toLowerCase()+'_month']===(tier==='T2'?'2027-01':'2027-02'));
    }
    await change(0);
    await page.evaluate(async()=>{requestOrderState.allocEdits={};await _roHydratePersistedDraftsForLoadedScopes_();mountAllocation();});
    check(width+' persisted zero remains zero after reload',await qty.inputValue()==='0');
    await change(35);
    h.failEdit=true;await change(45,false);
    await page.waitForFunction(()=>document.querySelector('#allocation-fixture .ro-alloc-qty[data-bucket="T1"]').classList.contains('is-invalid'));
    const sends=h.calls.filter(c=>c.action==='sendRequestOrderOrchestration').length;
    await page.evaluate(()=>document.getElementById('allocation-fixture').hidden=true);
    await page.locator('#ro-send-request-btn').click();
    check(width+' failed edit blocks Send without silently using prior saved quantity',h.rows('request_orders').length===0&&h.calls.filter(c=>c.action==='sendRequestOrderOrchestration').length===sends);
    await page.evaluate(()=>document.getElementById('allocation-fixture').hidden=false);
    h.failEdit=false; await change(35);
    await page.screenshot({path:path.join(output,'allocation-'+width+'.png'),fullPage:true});
    await page.evaluate(()=>document.getElementById('allocation-fixture').hidden=true);
    await page.locator('#ro-send-request-btn').click();
    await page.waitForFunction(()=>document.getElementById('ro-send-request-btn').classList.contains('is-success'));
    check(width+' manual allocation reaches actual Send orchestration and Request draft',h.rows('request_orders').length===1&&h.rows('request_order_lines')[0].requested_qty===35&&h.rows('request_order_allocation_drafts')[0].t1_status==='submitted');
    check(width+' untouched draft-less suggested SKU is not asserted or sent',h.rows('request_order_lines').length===1&&h.rows('request_order_lines')[0].sku==='SKU-A'&&h.calls.filter(c=>c.action==='sendRequestOrderOrchestration').every(c=>!c.payload.intents.some(i=>i.sku==='SKU-B')));
    h.failRead=true;
    const beforeRead=h.writes();
    await page.evaluate(async()=>{_roCanonicalDraftBySku={};_roNoDraftSkus={};_roDraftDtoCache={};await _roHydratePersistedDraftsForLoadedScopes_();mountAllocation();});
    check(width+' actual failed draft read stays locked and creates nothing',await qty.isDisabled()&&h.writes()===beforeRead&&await page.evaluate(()=>_roHydrationStatus==='ERROR'));
    h.failRead=false;
    for(const state of ['LOADING','ERROR','NO_SCOPE','CONFLICT']) {
      await page.evaluate(state=>{
        _roCanonicalDraftBySku={};_roNoDraftSkus={};_roHydrationStatus=state;
        if(state==='CONFLICT')_roCanonicalDraftBySku[_roDraftKey_(requestOrderState.data[0])]={conflict:true};
        mountAllocation();
      },state);
      check(width+' '+state+' remains locked',await qty.isDisabled());
    }
    assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
  } catch(e){console.error(JSON.stringify({errors,dialogs,calls:h.calls.slice(-4),debug:await page.evaluate(async()=>({hydration:_roHydrationStatus,verdict:KM_PRODUCTION_GUARD_.verdict,read:await KM.DB.getActiveRequestOrderDrafts({company:'KM',country:'US',marketplace:'Amazon'}).catch(e=>({error:e.message}))}))}));await page.screenshot({path:path.join(output,'failure-'+width+'.png'),fullPage:true});throw e;}
  finally{await page.close();}
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const width of [1440,390])await scenario(browser,width);
    const h=world(),{page,errors,outbound}=await setup(browser,1440,h,true);
    try {
      const qty=page.locator('#allocation-fixture .ro-alloc-qty[data-bucket="T1"]');
      await qty.fill('25');await qty.blur();
      await page.waitForFunction(()=>document.querySelector('#allocation-fixture .ro-alloc-qty').classList.contains('is-invalid'));
      check('old deployed policy requires GS update before new manual allocation writes',h.rows('request_order_allocation_drafts').length===0&&/backend update required/.test(await qty.getAttribute('title')));
      await page.evaluate(()=>document.getElementById('allocation-fixture').hidden=true);
      await page.locator('#ro-send-request-btn').click();
      check('old backend mismatch cannot send an unpersisted quantity',h.rows('request_orders').length===0);
      assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
    } finally {await page.close();}
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({success:true,checks,viewports:[1440,390],liveBusinessWrites:0,outboundRequests:0},null,2));
  } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
