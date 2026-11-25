'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
let now = Date.parse('2026-11-25T00:00:00Z'), seq = 0, held = false, unavailable = false, writes = 0;
const props = new Map();
const scriptLock = () => ({
  tryLock() { if (held || unavailable) return false; held = true; return true; },
  releaseLock() { assert.equal(held, true); held = false; }
});
const ctx = {
  Date: class extends Date { static now() { return now; } },
  Utilities: { getUuid: () => 'owner-' + (++seq) },
  LockService: { getScriptLock: scriptLock },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => props.get(k) || null,
    setProperty: (k, v) => props.set(k, v), deleteProperty: k => props.delete(k)
  }) }, SpreadsheetApp: { flush() { assert.equal(held, false, 'flush cannot hold the global lock'); } },
  gapBatchEnvelope_: (success, data, code, message) => ({ success, data, code, message })
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/46_api_v1_gap_materialization_job.gs', 'utf8'), ctx);
let count = 0;
function test(name, fn) { props.clear(); held = unavailable = false; fn(); count++; console.log('PASS ' + name); }
test('worker lease excludes gap workers but lets shipping and rate saves acquire the global lock', () => {
  const a = ctx.gapJobScriptLock_(), b = ctx.gapJobScriptLock_();
  assert.equal(a.acquire(10000), true); assert.equal(held, false);
  assert.equal(b.acquire(10000), false); assert.equal(held, false);
  const shipping = scriptLock(); assert.equal(shipping.tryLock(30000), true); shipping.releaseLock();
  const rate = scriptLock(); assert.equal(rate.tryLock(30000), true); rate.releaseLock();
  a.release(); assert.equal(b.acquire(10000), true); b.release();
});
test('hard-killed lease expires after eight minutes; earlier owner cannot release its successor', () => {
  const a = ctx.gapJobScriptLock_(), b = ctx.gapJobScriptLock_();
  assert.equal(a.acquire(1), true); now += 479999; assert.equal(b.acquire(1), false);
  now += 2; assert.equal(b.acquire(1), true); a.release();
  assert.equal(ctx.gapJobScriptLock_().acquire(1), false); b.release();
  assert.equal(ctx.gapJobScriptLock_().acquire(1), true);
});
test('missing services, malformed leases and busy global lock fail closed', () => {
  const a = ctx.gapJobScriptLock_(); props.set(ctx.GAP_JOB_LEASE_KEY_, '{'); assert.equal(a.acquire(1), false); assert.equal(held, false);
  props.set(ctx.GAP_JOB_LEASE_KEY_, '{}'); assert.equal(a.acquire(1), false);
  props.clear(); unavailable = true; assert.equal(a.acquire(1), false); a.release(); assert.equal(props.size, 0);
});
function env(state) {
  props.set('GAP_JOB_INVENTORY', JSON.stringify(state));
  return { lock: { acquire: () => false }, props: { get: k => props.get(k), set() { writes++; } },
    nowMs: () => now, scheduleContinuation() {}, timestamp: () => 'now' };
}
test('second Start joins a healthy run even while its worker owns the lease', () => {
  const state = { status: 'RUNNING', runId: 'one', scopeCursor: 2, scopesTotal: 5, updatedAtMs: now };
  const e = env(state), before = props.get('GAP_JOB_INVENTORY');
  const r = ctx.gapJobStart_('INVENTORY', e);
  assert.equal(r.success, true); assert.equal(r.data.alreadyRunning, true); assert.equal(r.data.runId, 'one');
  assert.equal(props.get('GAP_JOB_INVENTORY'), before);
});
test('a losing continuation does not mutate checkpoints, liveness or terminal state', () => {
  const e = env({ status: 'RUNNING', runId: 'one', scopeCursor: 2, updatedAtMs: now });
  const before = props.get('GAP_JOB_INVENTORY'); writes = 0;
  for (let i = 0; i < 10; i++) assert.equal(ctx.gapJobContinue_('INVENTORY', e).status, 'RESCHEDULED_LOCKED');
  assert.equal(writes, 0); assert.equal(props.get('GAP_JOB_INVENTORY'), before);
});
test('without an active job lock contention remains an explicit no-start error', () => {
  const e = env({ status: 'DONE', runId: 'old' });
  const r = ctx.gapJobStart_('INVENTORY', e);
  assert.equal(r.success, false); assert.equal(r.code, 'GAP_JOB_LOCK_UNAVAILABLE');
});
console.log('Gap lease: ' + count + ' scenarios passed');
