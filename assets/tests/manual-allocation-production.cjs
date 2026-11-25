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
test('baseline reproduces blocked edits; only monthly edit and warehouse read are newly allowed', () => {
  assert.equal(old.rtrActionGate_(body.action, body).code, 'PRODUCTION_ACTION_NOT_ENABLED');
  assert.deepEqual(p.allowed.filter(a => !oldP.allowed.includes(a)).sort(), ['factoryInventory.workspace.get', body.action].sort());
  assert.deepEqual(p.blocked, oldP.blocked.filter(a => a !== body.action));
  assert.deepEqual(p.reads.filter(a => a !== 'factoryInventory.workspace.get'), oldP.reads);
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
