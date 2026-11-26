const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto'), cp = require('node:child_process');
const { test } = require('node:test');
const plain = x => JSON.parse(JSON.stringify(x));
const c = vm.createContext({});
vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/01_router.gs', 'utf8'), c);
const p = plain(c.RTR_PRODUCTION_PROFILE_);
const old = vm.createContext({});
vm.runInContext(cp.execFileSync('git', ['show', '8b5f8e8e:assets/specs/active/apps-script/01_router.gs'], { encoding: 'utf8' }), old);
const oldP = plain(old.RTR_PRODUCTION_PROFILE_);
const body = { action: 'updateRecommendationDecisionLocked', recommendationType: 'MONTHLY_ORDER', draftId: 'RD::MONTHLY_ORDER::2026-11::company=KM',
  expectedToken: { draft_version: 1, userEditFingerprint: 'fixture' }, edits: [{ naturalKey: { request_bucket: 'T1', request_month: '2026-12' }, fields: { order_qty: 25 } }] };
function guard(policy = p, overrides = {}) {
  const sent = [], writes = [];
  const w = { KM: { passwordAccess: { assertWriteAllowed: () => writes.push(true) } }, fetch: async (url, init) => {
    sent.push({ url, init });
    return { json: async () => url.includes('getClientCapabilities') ? { success: true, production_gate: { environment: 'KM_PRODUCTION', profile_id: policy.profile_id,
      policy_sha256: policy.policy_sha256, db_fp: policy.db_fp, bound_equals_constant: true, module_stamps_ok: true, flat_v2: true,
      administration_enabled: false, ai_plan_enabled: false, ...overrides } } : { success: true } };
  } };
  vm.runInNewContext(fs.readFileSync('production-config.js', 'utf8'), { window: w });
  vm.runInNewContext(fs.readFileSync('production-guard.js', 'utf8'), { window: w, document: { readyState: 'loading', addEventListener() {} },
    navigator: {}, location: { href: 'https://example.invalid/' }, URL, Object, Error, MutationObserver: class {} });
  return { w, sent, writes };
}
test('pre-overseas-document policy remains usable while new document owners are deployed manually', async () => {
  const previous={...p,policy_sha256:'8cbae3c11b6e6444e65c90cfc1f14097a222969e71e0151f9e5d953c9b566f08'},g=guard(previous);
  await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action:'confirmShipmentAndDispatch',shipment_id:'S'})});
  assert.equal(g.sent.length,2);assert.equal(g.writes.length,1);
});
test('baseline keeps explicit additions limited to monthly edit, warehouse/status reads, mixed packing and campaign builder', () => {
  assert.equal(old.rtrActionGate_(body.action, body).code, 'PRODUCTION_ACTION_NOT_ENABLED');
  assert.deepEqual(p.allowed.filter(a => !oldP.allowed.includes(a)).sort(), ['factoryInventory.workspace.get', 'gapJob.status.get', 'shippingPlan.mixedCartons.save', 'campaign.builder.get','campaign.builder.status','campaign.builder.save', body.action].sort());
  assert.deepEqual(p.blocked, oldP.blocked.filter(a => a !== body.action && a !== 'gapJob.status.get'));
  assert.deepEqual(p.reads.filter(a => a !== 'factoryInventory.workspace.get' && a !== 'gapJob.status.get' && !/^campaign\.builder\./.test(a)), oldP.reads);
  assert.equal(p.ai_plan_enabled, false);
});
test('policy hash, public config and health module stamps agree', () => {
  const h = { ...p }; delete h.policy_sha256;
  assert.equal(p.policy_sha256, crypto.createHash('sha256').update(JSON.stringify(h)).digest('hex'));
  const { w } = guard(); const pub = { ...p }; delete pub.blocked; delete pub.module_stamps;
  assert.deepEqual(plain(w.KM_PRODUCTION_CONFIG_), pub);
  const hc = vm.createContext({}); vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/63_api_v1_system_health.gs', 'utf8'), hc);
  for (const symbol of ['SYS_BUILD_VERSION_', 'RTR_BUILD_VERSION_']) {
    const expected = p.module_stamps.find(r => r.symbol === symbol).expected;
    assert(expected.endsWith('-MA1'));
    assert.equal(hc.SYS_MODULE_BUILD_STAMPS_.find(r => r.symbol === symbol).expected, expected);
  }
});
test('monthly quantity, zero and blank note edits pass both real policy gates', async () => {
  for (const fields of [{ order_qty: 25 }, { order_qty: 0 }, { note: '' }, { order_qty: 20, note: 'manual' }]) {
    const b = { ...body, edits: [{ ...body.edits[0], fields }] };
    assert.equal(c.rtrActionGate_(b.action, b), null);
    const g = guard(); await g.w.fetch(p.endpoint, { method: 'POST', body: JSON.stringify(b) });
    assert.equal(g.sent.length, 2); assert.equal(g.writes.length, 1);
  }
});
test('weekly, T4, snapshots, missing tokens and invalid quantities fail before dispatch', async () => {
  const edits = body.edits;
  for (const bad of [{ recommendationType: 'WEEKLY_SHIPPING' }, { draftId: 'RAD-M-legacy' }, { expectedToken: null }, { reconcile: true },
    { allowInsert: true }, { edits: [] }, { edits: [{ ...edits[0], naturalKey: { request_bucket: 'T4', request_month: '2026-12' } }] },
    { edits: [{ ...edits[0], fields: { recommended_qty: 99 } }] }, { edits: [{ ...edits[0], fields: { order_qty: -1 } }] },
    { edits: [{ ...edits[0], fields: { order_qty: '20' } }] }, { edits: [{ ...edits[0], recommendedSnapshot: {} }] }]) {
    const b = { ...body, ...bad };
    assert.equal(c.rtrActionGate_(b.action, b).code, 'PRODUCTION_ALLOCATION_EDIT_SCOPE_REFUSED');
    const g = guard(); await assert.rejects(g.w.fetch(p.endpoint, { method: 'POST', body: JSON.stringify(b) }), /SCOPE_REFUSED/);
    assert.equal(g.sent.length, 0);
  }
});
test('exact prior deployed policy retains existing actions but refuses the new edit', async () => {
  const g = guard(oldP);
  await g.w.fetch(p.endpoint + '?action=shipment.workspace.get', { method: 'GET' });
  await g.w.fetch(p.endpoint, { method: 'POST', body: JSON.stringify({ action: 'requestOrder.allocationDraft.ensureAndEdit' }) });
  const before = g.sent.length;
  await assert.rejects(g.w.fetch(p.endpoint, { method: 'POST', body: JSON.stringify(body) }), /BACKEND_UPDATE_REQUIRED/);
  assert.equal(g.sent.length, before);
  assert.equal(g.w.KM_PRODUCTION_GUARD_.isActionAllowed(body.action), false);
});
test('unknown policy, wrong DB and partial GS deployment remain fail closed', async () => {
  for (const extra of [{ policy_sha256: 'unknown' }, { db_fp: 'wrong' }, { module_stamps_ok: false }]) {
    const g = guard(p, extra);
    await assert.rejects(g.w.fetch(p.endpoint, { method: 'POST', body: JSON.stringify(body) }), /IDENTITY_MISMATCH/);
    assert.equal(g.sent.length, 1);
  }
});
test('AI generation, weekly edits and administration stay blocked; Shipment retry remains allowed', () => {
  for (const action of ['requestOrderDraft.job.start', 'weeklyAiPlan.generate', 'factoryOperationConfig.save']) {
    assert.equal(c.rtrActionGate_(action, {}).code, 'PRODUCTION_ACTION_NOT_ENABLED');
  }
  assert.equal(c.rtrActionGate_('document.retry', { related_entity_type: 'shipment', related_entity_id: 'S' }), null);
});
test('actual manual create verifies the real raw-row loader and preserves zero on repeat', () => {
  const {createPlanningWorld}=require('./helpers/order-planning-mainline-world.cjs');
  const h=createPlanningWorld(), payload={planning_cycle:'2026-11',scope:{company:'KM',country:'US',marketplace:'Amazon',sku:'SKU-A'},tier:'T1',request_month:'2026-12',order_qty:25,units_per_carton:10};
  let out=h.c.handleRequestOrderAllocationDraftEnsureAndEdit_({payload});
  assert.equal(out.success,true,JSON.stringify(out));assert.equal(out.data.verified,true);assert.equal(out.data.persisted_order_qty,25);
  assert.equal(h.rows('request_order_allocation_drafts').length,1);
  out=h.c.handleRequestOrderAllocationDraftEnsureAndEdit_({payload:{...payload,order_qty:0}});
  assert.equal(out.success,true,JSON.stringify(out));assert.equal(out.data.persisted_order_qty,0);assert.equal(out.data.sendable_tier,false);
  assert.equal(h.rows('request_order_allocation_drafts').length,1);
  assert.equal(h.rows('request_order_allocation_drafts')[0].t1_recommended_qty,0);
});
test('missing manual-create readback remains committed-but-unverified, never Saved', () => {
  const {createPlanningWorld}=require('./helpers/order-planning-mainline-world.cjs');
  const h=createPlanningWorld(),load=h.c.rpoFlatLoadById_;let reads=0;
  h.c.rpoFlatLoadById_=(...args)=>++reads===1?load(...args):({status:'NOT_FOUND',row:null});
  const out=h.c.handleRequestOrderAllocationDraftEnsureAndEdit_({payload:{planning_cycle:'2026-11',scope:{company:'KM',country:'US',marketplace:'Amazon',sku:'SKU-A'},tier:'T1',request_month:'2026-12',order_qty:25,units_per_carton:10}});
  assert.equal(out.success,false);assert.equal(out.code,'ALLOCATION_DRAFT_QUANTITY_NOT_VERIFIED');assert.equal(out.zero_write,false);
});
test('backend identity requires the updated manual allocation module, not only 01 and 63', () => {
  const values=Object.fromEntries(p.module_stamps.map(r=>[r.symbol,r.expected]));
  c.SpreadsheetApp={getActiveSpreadsheet:()=>({getId:()=> 'fixture'})};
  c.prodExpectedDbId_=()=> 'fixture';c.rtrSha256Hex_=()=>p.db_fp;
  c.requestOrderDraftV2FlatCutoverEnabled_=()=>true;c.sysGlobalValue_=symbol=>values[symbol];
  assert.equal(c.rtrProductionTargetCheck_(),null);
  delete values.RAEE_BUILD_VERSION_;
  assert.equal(c.rtrProductionTargetCheck_().code,'PRODUCTION_MODULE_MISMATCH');
});

test('actual warehouse module stamps satisfy the router gate and health manifest together', () => {
  const ctx = vm.createContext({});
  for (const file of ['01_router.gs','63_api_v1_system_health.gs','70_api_v1_overseas_stock_workspace.gs','88_api_v1_warehouse_lifecycle.gs']) {
    vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/' + file, 'utf8'), ctx);
  }
  const actual = Object.fromEntries(p.module_stamps.map(m => [m.symbol, m.expected]));
  for (const symbol of ['RTR_BUILD_VERSION_','SYS_BUILD_VERSION_','OSW_BUILD_VERSION_','FIW_BUILD_VERSION_']) {
    actual[symbol] = ctx[symbol];
    assert.equal(p.module_stamps.find(m => m.symbol === symbol).expected, actual[symbol]);
    assert.equal(ctx.SYS_MODULE_BUILD_STAMPS_.find(m => m.symbol === symbol).expected, actual[symbol]);
  }
  ctx.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getId: () => 'fixture' }) };
  ctx.prodExpectedDbId_ = () => 'fixture'; ctx.rtrSha256Hex_ = () => p.db_fp;
  ctx.requestOrderDraftV2FlatCutoverEnabled_ = () => true; ctx.sysGlobalValue_ = symbol => actual[symbol];
  assert.equal(ctx.rtrProductionTargetCheck_(), null);
  actual.OSW_BUILD_VERSION_ = 'F1-7N-FB-4E-R3';
  assert.equal(ctx.rtrProductionTargetCheck_().code, 'PRODUCTION_MODULE_MISMATCH');
  assert.deepEqual(plain(ctx.rtrProductionTargetCheck_().modules), ['OSW_BUILD_VERSION_']);
});

test('failed identity can recover after deployment without retaining a rejected promise forever', async () => {
  const flags = { module_stamps_ok: false }, g = guard(p, flags);
  await assert.rejects(g.w.fetch(p.endpoint + '?action=shipment.workspace.get'), /IDENTITY_MISMATCH/);
  flags.module_stamps_ok = true;
  await g.w.fetch(p.endpoint + '?action=shipment.workspace.get');
  assert.equal(g.w.KM_PRODUCTION_GUARD_.verdict, 'VERIFIED');
  assert.equal(g.sent.length, 3);
});

test('pre-warehouse exact policy keeps existing reads and manual edit, but blocks the new warehouse action', async () => {
  const previous = { ...p, policy_sha256: 'cc77c5a4692be7e787c65557198f7d673bcc06ece2cfb658f6655601fffd9420' }, g = guard(previous);
  await g.w.fetch(p.endpoint + '?action=inventoryReplenishment.workspace.get');
  await g.w.fetch(p.endpoint, { method: 'POST', body: JSON.stringify(body) });
  const before = g.sent.length;
  await assert.rejects(g.w.fetch(p.endpoint + '?action=factoryInventory.workspace.get'), /WAREHOUSE_BACKEND_UPDATE_REQUIRED/);
  assert.equal(g.sent.length, before);
});

test('Check status passes both real production gates as a read, without a write assertion', async () => {
  const g = guard(), request = { action: 'gapJob.status.get', payload: { product: 'INVENTORY', runId: 'RUN' } };
  assert.equal(c.rtrActionGate_(request.action, request), null);
  assert.equal(p.reads.includes(request.action), true); assert.equal(p.blocked.includes(request.action), false);
  await g.w.fetch(p.endpoint + '?action=gapJob.status.get&km_body=' + encodeURIComponent(JSON.stringify(request)), { method: 'GET' });
  assert.equal(g.sent.length, 2); assert.equal(g.writes.length, 0);
  assert(g.sent[1].url.includes('gapJob.status.get'));
});

test('pre-status exact policy retains warehouse reads but requires the new router for job status', async () => {
  const previous = { ...p, policy_sha256: 'ab29a81c6c86068efdaebd4d2e2ee19846dc953709c14e1373e17cbe8d8842ab' }, g = guard(previous);
  await g.w.fetch(p.endpoint + '?action=factoryInventory.workspace.get');
  const before = g.sent.length;
  await assert.rejects(g.w.fetch(p.endpoint + '?action=gapJob.status.get'), /STATUS_BACKEND_UPDATE_REQUIRED/);
  assert.equal(g.sent.length, before);
});

test('real status transport preserves production guard refusal instead of disguising it as a network error', async () => {
  const { makeClient } = require('./helpers/write-command-flight-world.cjs'), h = makeClient();
  let calls = 0;
  h.sb._kmFetchBounded_ = () => { calls++; return Promise.reject(new Error('PRODUCTION_STATUS_BACKEND_UPDATE_REQUIRED')); };
  const result = await h.DB.getGapJobStatus('INVENTORY', 'RUN');
  assert.equal(result.success, false); assert.equal(result.error.code, 'PRODUCTION_STATUS_BACKEND_UPDATE_REQUIRED');
  assert.equal(calls, 1);
});

test('pre-mixed exact policy retains status reads, but cannot send mixed packing writes', async () => {
  const previous={...p,policy_sha256:'320bc376386e5da3c6af894746f69e8b2ceb1291992a0ba1aa698703a00c8221'},g=guard(previous);
  await g.w.fetch(p.endpoint+'?action=gapJob.status.get');
  const before=g.sent.length;
  await assert.rejects(g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action:'shippingPlan.mixedCartons.save'})}),/MIXED_CARTONS_BACKEND_UPDATE_REQUIRED/);
  assert.equal(g.sent.length,before);
});
test('mixed packing action is enabled only by matching backend policy and modules', async () => {
  assert.equal(c.rtrActionGate_('shippingPlan.mixedCartons.save',{}),null);
  const g=guard();await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action:'shippingPlan.mixedCartons.save'})});
  assert.equal(g.sent.length,2);assert.equal(g.writes.length,1);
  const ctx=vm.createContext({});
  for(const file of ['01_router.gs','63_api_v1_system_health.gs','11_shipping_plan_handlers.gs','12_shipment_handlers.gs','34_shipment_final_output_handlers.gs','35_shipment_document_renderer.gs','39_document_runtime_service.gs','80_api_v1_shipment_import.gs','83_api_v1_weekly_draft_lines.gs','90_generated_supply_planning_bundle.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+file,'utf8'),ctx);
  for(const symbol of ['WDL_BUILD_VERSION_','SP_BUILD_VERSION_','SHIPMENT_BUILD_VERSION_','SFO_BUILD_VERSION_','SDR_BUILD_VERSION_','DGS_PRODUCTION_PROFILE_BUILD_VERSION_','SHI_BUILD_VERSION_','KM_BUNDLE_CONTENT_HASH_']){
    assert.equal(p.module_stamps.find(m=>m.symbol===symbol).expected,ctx[symbol]);
    assert.equal(ctx.SYS_MODULE_BUILD_STAMPS_.find(m=>m.symbol===symbol).expected,ctx[symbol]);
  }
  assert.equal(ctx.KMPACK.VERSION,'MIXED_CARTONS_V1');
});
test('real mixed-packing client deduplicates writes and invalidates planning/exposure caches',async()=>{
  const {makeClient}=require('./helpers/write-command-flight-world.cjs'),h=makeClient({hold:true});h.sb._kmWriterPostWrite_=async()=>{};
  assert.deepEqual(plain(h.DB.sourceWriteFamilies('saveMixedCartons')),['planning','exposure']);
  assert.equal(h.DB.saveMixedCartons.__kmSourceWriter.name,'saveMixedCartons');assert.equal(h.DB._sourceWriterListDrift.length,0);
  const b={shipping_plan_id:'P1',request_id:'WDL-MIXED-CLIENT',packing_version:'MIXED_CARTONS_V1',mixed_cartons:[],line_edits:[]};
  const a=h.DB.saveMixedCartons(b),again=h.DB.saveMixedCartons(b);assert.equal(a,again);
  assert.equal(h.log.fetches.length,1);assert.equal(JSON.parse(h.log.fetches[0].body).action,'shippingPlan.mixedCartons.save');
  assert.equal(h.epoch().planning,1);assert.equal(h.epoch().exposure,1);
  h.release(JSON.stringify({success:true,data:{readback_verified:true}}));await a;
  assert.equal(h.epoch().planning,2);assert.equal(h.epoch().exposure,2);
});

test('new campaign service requires matching release while pre-campaign retains existing actions',async()=>{
 const prior={...p,policy_sha256:'ead55e3515dc2e807724274b5c27c0b519b0c8f969364e314f0737c1e0e3c87c'},g=guard(prior);
 for(const action of ['gapJob.status.get','factoryInventory.workspace.get','shippingPlan.mixedCartons.save'])await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});
 for(const action of ['campaign.builder.get','campaign.builder.status','campaign.builder.save']){const before=g.sent.length;await assert.rejects(g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})}),/CAMPAIGN_BACKEND_UPDATE_REQUIRED/);assert.equal(g.sent.length,before);}
 const fresh=guard();for(const action of ['campaign.builder.get','campaign.builder.status','campaign.builder.save']){assert.equal(c.rtrActionGate_(action,{}),null);await fresh.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});}
 assert.equal(fresh.writes.length,1);
 assert.equal(c.rtrActionGate_('import.commit',{domain:'campaign_builder',mode:'CREATE'}).code,'PRODUCTION_IMPORT_SCOPE_REFUSED');
});
test('campaign module pins, core and health manifest agree; canonical client is single-flight and invalidates both source families',async()=>{
 const context=vm.createContext({});for(const file of ['20_campaign_write_handlers.gs','14_fc_write_handlers.gs','78_api_v1_import_batch.gs','63_api_v1_system_health.gs','90_generated_supply_planning_bundle.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+file,'utf8'),context);
 for(const symbol of ['CAMPAIGN_BUILD_VERSION_','FCW_BUILD_VERSION_','IMB_BUILD_VERSION_','KM_BUNDLE_CONTENT_HASH_']){assert.equal(p.module_stamps.find(m=>m.symbol===symbol).expected,context[symbol]);assert.equal(context.SYS_MODULE_BUILD_STAMPS_.find(m=>m.symbol===symbol).expected,context[symbol]);}
 assert.equal(context.KMCB.VERSION,'CAMPAIGN_BUILDER_V1');
 const {makeClient}=require('./helpers/write-command-flight-world.cjs'),h=makeClient({hold:true});h.sb._kmWriterPostWrite_=async()=>{};
 assert.deepEqual(plain(h.DB.sourceWriteFamilies('saveCampaignBundle')),['planning','exposure']);assert.equal(h.DB._sourceWriterListDrift.length,0);
 const b={request_id:'CB-TEST-CLIENT',builder_version:'CAMPAIGN_BUILDER_V1',scope:{},lines:[]},a=h.DB.saveCampaignBundle(b),again=h.DB.saveCampaignBundle(b);assert.equal(a,again);
 assert.equal(h.log.fetches.length,1);assert.equal(JSON.parse(h.log.fetches[0].body).action,'campaign.builder.save');assert.equal(h.epoch().planning,1);assert.equal(h.epoch().exposure,1);
 h.release(JSON.stringify({success:true,data:{readback_verified:true}}));await a;assert.equal(h.epoch().planning,2);assert.equal(h.epoch().exposure,2);
});

test('verified deployed a753 policy retains every action needed during this frontend rollout',async()=>{
 const previous={...p,policy_sha256:'0afcd8ef72dbffe76d670a765d7769ea1fa382691a0dfdf4f8b59d0b1ffb0161'},g=guard(previous);
 for(const action of ['factoryInventory.workspace.get','gapJob.status.get','shippingPlan.mixedCartons.save','campaign.builder.get','campaign.builder.status','campaign.builder.save'])await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});
 assert.equal(g.sent.length,7);
});

test('opaque carrier version requires both real row reader and writer, with matching health pins',()=>{
 const ctx=vm.createContext({});for(const file of ['02_core_sheet_db.gs','17b_carrier_rate_card_maintenance.gs','63_api_v1_system_health.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+file,'utf8'),ctx);
 for(const symbol of ['CORE_DB_BUILD_VERSION_','CRC_QUICK_BUILD_VERSION_']){assert.equal(p.module_stamps.find(m=>m.symbol===symbol).expected,ctx[symbol]);assert.equal(ctx.SYS_MODULE_BUILD_STAMPS_.find(m=>m.symbol===symbol).expected,ctx[symbol]);}
});

test('pre-append deployed policy retains reads and existing commands during this frontend rollout',async()=>{
 const previous={...p,policy_sha256:'5e7d63c7f31a05dc261748eca7f9ab96e993b13586f21e1645cb246e56af8e47'},g=guard(previous);
 for(const action of ['factoryInventory.workspace.get','gapJob.status.get','shippingPlan.mixedCartons.save','campaign.builder.get','campaign.builder.status','campaign.builder.save'])await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});
 assert.equal(g.sent.length,7);
});

test('pre-repricing policy keeps existing commands usable until the manual GS update',async()=>{
 const previous={...p,policy_sha256:'6d4a8af2ba5379008716e21b10acd3e8044c4f3b95120936a25450fb2fcbfa64'},g=guard(previous);
 for(const action of ['factoryInventory.workspace.get','gapJob.status.get','shippingPlan.mixedCartons.save','campaign.builder.get','campaign.builder.status','campaign.builder.save'])await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});
 assert.equal(g.sent.length,7);
});
test('pre-review policy retains all existing operations during the manual GS update',async()=>{
 const previous={...p,policy_sha256:'e2eafb38f249636bc4657eb8ce00817a267a7547607ee05a1d0017adb3775138'},g=guard(previous);
 for(const action of ['factoryInventory.workspace.get','gapJob.status.get','shippingPlan.mixedCartons.save','campaign.builder.get','campaign.builder.status','campaign.builder.save','cancelShipmentDraft'])await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});
 assert.equal(g.sent.length,8);
});
test('shipping review requires all shared document owners, including the party resolver',()=>{
 const ctx=vm.createContext({});for(const file of ['12_shipment_handlers.gs','33_party_authority_handlers.gs','34_shipment_final_output_handlers.gs','36_document_template_handlers.gs','39_document_runtime_service.gs','63_api_v1_system_health.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+file,'utf8'),ctx);
 for(const symbol of ['PARTY_BUILD_VERSION_','SHIPMENT_BUILD_VERSION_','SFO_BUILD_VERSION_','DOCUMENT_LAYOUT_BUILD_VERSION_','DGS_PRODUCTION_PROFILE_BUILD_VERSION_']){assert.equal(p.module_stamps.find(m=>m.symbol===symbol).expected,ctx[symbol]);assert.equal(ctx.SYS_MODULE_BUILD_STAMPS_.find(m=>m.symbol===symbol).expected,ctx[symbol]);}
 assert.equal(p.module_stamps.find(m=>m.symbol==='PARTY_BUILD_VERSION_').optional,false);
});

test('pre-document-recovery policy retains all existing operations during the manual GS update',async()=>{
 const previous={...p,policy_sha256:'0026f8ebcc150b0ed8cfd9e411d1ceefa13053283af228a42025dfd40c55d4f7'},g=guard(previous);
 for(const action of ['factoryInventory.workspace.get','gapJob.status.get','shippingPlan.mixedCartons.save','campaign.builder.get','campaign.builder.status','campaign.builder.save','cancelShipmentDraft','document.retry'])await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});
 assert.equal(g.sent.length,9);
});

test('document recovery pins both workspace projection and runtime in router and health',()=>{
 const ctx=vm.createContext({});for(const file of ['39_document_runtime_service.gs','57_api_v1_shipment_workspace.gs','63_api_v1_system_health.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+file,'utf8'),ctx);
 for(const symbol of ['DGS_PRODUCTION_PROFILE_BUILD_VERSION_','SHIP_WS_BUILD_VERSION_']){assert.equal(p.module_stamps.find(m=>m.symbol===symbol).expected,ctx[symbol]);assert.equal(ctx.SYS_MODULE_BUILD_STAMPS_.find(m=>m.symbol===symbol).expected,ctx[symbol]);}
});

test('pre-carton-order policy stays usable while the three changed GS owners are updated',async()=>{
 const previous={...p,policy_sha256:'bc5fbba6d72658b1dd4aa5095b75b5b53017f383671236715115069ac5c6b15c'},g=guard(previous);
 for(const action of ['factoryInventory.workspace.get','gapJob.status.get','shippingPlan.mixedCartons.save','campaign.builder.get','campaign.builder.status','campaign.builder.save','cancelShipmentDraft','document.retry'])await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});
 assert.equal(g.sent.length,9);
});

test('pre-presentation policy keeps current shipping reads and commands usable during manual GS rollout',async()=>{
 const previous={...p,policy_sha256:'354126dc9ac9f5af0b9e36c09619aa2cce443d08cfb932ad4e86ce799adc4e07'},g=guard(previous);
 for(const action of ['shipment.workspace.get','updateShippingPlanStatus','shippingPlan.mixedCartons.save','cancelShipmentDraft','document.retry'])await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});
 assert.equal(g.sent.length,6);
});

test('pre-EU-destination policy retains current operations until destination GS owners are updated',async()=>{
 const previous={...p,policy_sha256:'b7f1312171e1c458337dd16653f649d231418d0bddc7c8b61e6319ead8f62ed8'},g=guard(previous);
 for(const action of ['shipment.workspace.get','updateShipment','shipment.selectRateCard','document.retry','cancelShipmentDraft','gapJob.status.get'])await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});
 assert.equal(g.sent.length,7);
});

test('pre-no-rate policy remains usable during manual GS rollout without widening permissions',async()=>{
 const previous={...p,policy_sha256:'21998a70bf573bb35f588b295dd0421eafb5336e12190542bc27ef954b7e0547'},g=guard(previous);
 for(const action of ['shipment.workspace.get','updateShipment','shipment.rateCardOptions','shipment.selectRateCard','document.retry','cancelShipmentDraft','gapJob.status.get'])await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});
 assert.equal(g.sent.length,8);
});

test('pre-cancelled-plan-edit policy remains usable while the WDL owner is deployed manually',async()=>{
 const previous={...p,policy_sha256:'f1e0bdd348032e242d335b2e4496e573734672849237069cb23fff0f256b8762'},g=guard(previous);
 for(const action of ['shipment.workspace.get','updateShippingPlanLineQty','shippingPlan.mixedCartons.save','updateShipment','shipment.rateCardOptions','document.retry','gapJob.status.get'])await g.w.fetch(p.endpoint,{method:'POST',body:JSON.stringify({action})});
 assert.equal(g.sent.length,8);
});
