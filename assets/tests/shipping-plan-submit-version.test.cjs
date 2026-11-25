'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { extract } = require('./ad4/extract.cjs');
const source = fs.readFileSync('assets/js/pages/shipping-plan.js', 'utf8');
const names = ['_spTok_', '_spWsModel_', '_spPlanRec_', '_spLineRec_', '_spPlanTok_', '_spQtyBody_', '_spAdoptLineTok_', '_spAdoptQtyPlanTok_', 'spDbSubmit'];
let pass = 0;
async function test(label, run) { await run(); console.log('PASS ' + label); pass++; }
function setup(mode = 'normal') {
  const old = '2026-11-25 10:00:00', next = '2026-11-25 10:00:01', other = '2026-11-25 10:00:02';
  const calls = { qty: [], status: [] }, plan = { shippingPlanId: 'P', updatedAt: old, status: 'draft', raw: { updated_at: old } };
  let server = old, count = 0;
  const c = { console, _spLastModel: { source: 'workspace', plans: [plan], lines: [{ shippingPlanLineId: 'L', raw: { updated_at: old } }] },
    _spCollectQtyLines: () => mode === 'noLines' ? [] : [{ shipping_plan_line_id: 'L', approved_qty: 20, expected_updated_at: old }],
    _spRunCommand_: (_, run) => run(), _spPatchLocalQty() {}, _spIsOverageChallenge: r => r.challenge || null,
    _spOverageAsk: async () => ({ confirmed: true }), window: { KM: { DB: {
      updateShippingPlanLineQty: async b => {
        calls.qty.push(b); assert.equal(b.expected_plan_updated_at, old);
        if (mode === 'qtyConflict') return { success: false, error: { code: 'EDIT_CONFLICT' } };
        server = mode === 'legacy' ? old : mode === 'concurrent' ? other : next;
        const rows = mode === 'missing' ? [] : mode === 'duplicate' ? [{ shipping_plan_id: 'P', updated_at: next }, { shipping_plan_id: 'P', updated_at: next }] : [{ shipping_plan_id: 'P', updated_at: next }];
        return { success: true, data: { updated_at: next, ...(mode === 'legacy' ? {} : { repriced_plans: rows }) } };
      },
      updateShippingPlanStatus: async b => {
        calls.status.push(b);
        if (b.expected_updated_at !== server) return { success: false, error: { code: 'EDIT_CONFLICT', details: { current_updated_at: server } } };
        if (mode === 'overage' && !count++) return { success: false, challenge: { pools: [] } };
        return { success: true };
      }
    } } }
  };
  vm.createContext(c); vm.runInContext(extract(source, n => names.includes(n), () => false).map(x => x.text).join('\n'), c);
  return { c, calls, plan, old, next };
}
(async () => {
  await test('qty repricing acknowledgement supplies the next Submit token, not the stale opened version', async () => {
    const { c, calls, plan, next } = setup(); assert.equal((await c.spDbSubmit('P')).success, true);
    assert.equal(calls.status.length, 1); assert.equal(calls.status[0].expected_updated_at, next); assert.equal(plan.updatedAt, next);
  });
  await test('another edit after this qty save still conflicts, no retry or token borrowing', async () => {
    const { c, calls } = setup('concurrent'); const r = await c.spDbSubmit('P');
    assert.equal(r.error.code, 'EDIT_CONFLICT'); assert.equal(r.error.qtySaved, true); assert.equal(calls.status.length, 1);
  });
  for (const mode of ['missing', 'duplicate']) await test(mode + ' acknowledged plan identity stops status writes', async () => {
    const { c, calls } = setup(mode); assert.equal((await c.spDbSubmit('P')).error.code, 'PLAN_WRITE_TOKEN_UNVERIFIED'); assert.equal(calls.status.length, 0);
  });
  await test('qty refusal stops Submit', async () => { const { c, calls } = setup('qtyConflict'); await c.spDbSubmit('P'); assert.equal(calls.status.length, 0); });
  await test('legacy qty writers and no-line submission retain their original version contract', async () => {
    for (const mode of ['legacy', 'noLines']) { const { c, calls, old } = setup(mode); assert.equal((await c.spDbSubmit('P')).success, true); assert.equal(calls.status[0].expected_updated_at, old); }
  });
  await test('overage confirmation uses the same newly acknowledged Plan version', async () => {
    const { c, calls, next } = setup('overage'); assert.equal((await c.spDbSubmit('P')).success, true);
    assert.equal(calls.status.length, 2); assert(calls.status.every(b => b.expected_updated_at === next));
  });
  await test('a locally superseded receipt cannot overwrite a newer Plan version', async () => {
    const { c, old, plan } = setup(); plan.updatedAt = '2026-11-25 11:00:00';
    assert.equal(c._spAdoptQtyPlanTok_('P', { data: { repriced_plans: [{ shipping_plan_id: 'P', updated_at: '2026-11-25 10:00:01' }] } }, old), '');
  });
  console.log('SUBMIT_VERSION_PASS ' + pass + ' live_business_writes=0');
})().catch(e => { console.error(e); process.exitCode = 1; });
