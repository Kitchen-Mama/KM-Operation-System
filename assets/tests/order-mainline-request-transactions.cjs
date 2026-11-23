const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { extract } = require('./ad4/extract.cjs');
const root = path.resolve(__dirname, '../..'), gs = 'assets/specs/active/apps-script/';
const read = p => fs.readFileSync(process.env.KM_RO_GS && p.endsWith('/13_procurement_handlers.gs')
  ? path.join(process.env.KM_RO_GS, '13_procurement_handlers.gs') : path.join(root, p), 'utf8');
const fixture = extract(fs.readFileSync(path.join(root, 'assets/tests/order-mainline-phase1.cjs'), 'utf8'),
  n => ['host', 'request', 'status', 'approved', 'convert'].includes(n), n => ['stockHeaders', 'movementHeaders'].includes(n)).map(p => p.text).join('\n');
const { host, request, status, approved, convert } = new Function('assert', 'vm', 'read', 'gs', 'crypto', fixture + '\nreturn {host, request, status, approved, convert};')(assert, vm, read, gs, crypto);
const names = ['request_orders', 'request_order_lines', 'request_order_line_sources', 'purchase_orders', 'purchase_order_lines'];
const snapshot = h => JSON.stringify(names.map(n => h.tables[n].grid));
const append = (h, name, row) => h.tables[name].appendRow(h.tables[name].grid[0].map(k => row[k] ?? ''));
function fail(h, name, op, predicate = () => true, after = false, times = 1) {
  const sh = h.tables[name]; let remaining = times;
  function invoke(event, run) {
    if (remaining && predicate(event)) { remaining--; if (after) run(); throw Error('SYNTHETIC_' + name + '_' + op); }
    return run();
  }
  if (op === 'setValue' || op === 'setValues') {
    const get = sh.getRange;
    sh.getRange = (...args) => { const range = get(...args), write = range[op]; return { ...range,
      [op]: value => invoke({ row: args[0], col: args[1], value }, () => write(value)) }; };
    return () => { sh.getRange = get; };
  }
  const original = sh[op]; sh[op] = (...args) => invoke({ args }, () => original(...args));
  return () => { sh[op] = original; };
}
function checkRollback(h, run) {
  const before = snapshot(h), r = run();
  assert.equal(r.success, false, JSON.stringify(r)); assert.equal(r.rollback_verified, true, JSON.stringify(r));
  assert.equal(r.compensated, true); assert.equal(snapshot(h), before);
  return r;
}
for (const action of ['status', 'edit', 'cancel', 'convert']) test('busy shared lock refuses ' + action + ' before any business writes', () => {
  const h = host(), id = request(h), line = h.rows('request_order_lines')[0];
  const before = snapshot(h), writes = h.writes();
  h.c.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock() {} });
  const r = action === 'status' ? status(h, id, 'submit') : action === 'edit' ? h.c.handleUpdateRequestOrderLineQty_({ lines: [{ request_order_line_id: line.request_order_line_id, approved_qty: 20 }] })
    : action === 'cancel' ? h.c.handleCancelRequestOrderTier_({ request_order_line_ids: [line.request_order_line_id] }) : convert(h, id);
  assert.equal(r.code, 'PO_LOCK_UNAVAILABLE'); assert.equal(snapshot(h), before); assert.equal(h.writes(), writes);
});
for (const transition of ['submit', 'approve', 'reject', 'cancel']) {
  for (const after of [false, true]) test(transition + ': line status failure ' + (after ? 'after landing' : 'before landing') + ' restores the entire decision', () => {
    const h = host(), id = request(h, ['T1', 'T2']);
    if (['approve', 'reject'].includes(transition)) assert.equal(status(h, id, 'submit').success, true);
    const col = h.tables.request_order_lines.grid[0].indexOf('line_status') + 1;
    fail(h, 'request_order_lines', 'setValue', e => e.col === col && e.row === 3, after);
    checkRollback(h, () => status(h, id, transition, { rejected_reason: 'fixture revision' }));
  });
}
test('rejection resubmit failure also restores version, rejection reason and previous note', () => {
  const h = host(), id = request(h); status(h, id, 'submit'); status(h, id, 'reject', { rejected_reason: 'fixture revision' });
  fail(h, 'request_order_lines', 'setValue'); checkRollback(h, () => status(h, id, 'submit'));
});
test('source quantity write failure restores approved quantity, company totals and source rows', () => {
  const h = host(), id = request(h), line = h.rows('request_order_lines')[0];
  append(h, 'request_order_line_sources', { request_order_line_source_id: 'SOURCE-A', request_order_line_id: line.request_order_line_id,
    request_order_id: id, sku: line.sku, company: 'KM', tier_type: 'T1', approved_qty: 40 });
  const col = h.tables.request_order_line_sources.grid[0].indexOf('updated_at') + 1;
  fail(h, 'request_order_line_sources', 'setValue', e => e.col === col);
  checkRollback(h, () => h.c.handleUpdateRequestOrderLineQty_({ lines: [{ request_order_line_id: line.request_order_line_id, approved_qty: 20 }] }));
});
test('landed manual allocation/source append is removed without losing pre-existing allocation', () => {
  const h = host(), id = request(h);
  fail(h, 'request_order_line_sources', 'appendRow', () => true, true);
  checkRollback(h, () => h.c.handleUpdateRequestOrderLineQty_({ lines: [{ new_line: true, request_order_id: id,
    sku: 'SKU-A', company: 'ResUS', request_bucket: 'T1', approved_qty: 10, units_per_carton: 10 }] }));
});
test('partial tier cancellation restores every selected line and header', () => {
  const h = host(), id = request(h, ['T1', 'T2']), lines = h.rows('request_order_lines');
  fail(h, 'request_order_lines', 'setValue', e => e.row === 3);
  checkRollback(h, () => h.c.handleCancelRequestOrderTier_({ request_order_line_ids: lines.map(l => l.request_order_line_id) }));
  assert.equal(h.rows('request_orders')[0].request_status, 'draft');
});
test('edit and tier cancellation cannot interleave inside submission', () => {
  const h = host(), id = request(h), line = h.rows('request_order_lines')[0], col = h.tables.request_orders.grid[0].indexOf('request_status') + 1;
  let edited, cancelled;
  h.tables.request_orders.beforeWrite = e => { if (e.col === col && e.value === 'pending_approval') {
    h.tables.request_orders.beforeWrite = null;
    edited = h.c.handleUpdateRequestOrderLineQty_({ lines: [{ request_order_line_id: line.request_order_line_id, approved_qty: 999 }] });
    cancelled = h.c.handleCancelRequestOrderTier_({ request_order_line_ids: [line.request_order_line_id] });
  } };
  assert.equal(status(h, id, 'submit').success, true); assert.equal(edited.code, 'PO_LOCK_UNAVAILABLE'); assert.equal(cancelled.code, 'PO_LOCK_UNAVAILABLE');
  assert.equal(h.rows('request_order_lines')[0].approved_qty, 40); assert.equal(h.rows('request_order_lines')[0].line_status, 'submitted');
});
for (const quantity of ['', -1, 1.5, 'not-a-number', Infinity, true]) test('invalid approved quantity refuses an entire edit batch: ' + String(quantity), () => {
  const h = host(), id = request(h, ['T1', 'T2']), lines = h.rows('request_order_lines'), before = snapshot(h), writes = h.writes();
  const r = h.c.handleUpdateRequestOrderLineQty_({ lines: [
    { request_order_line_id: lines[0].request_order_line_id, approved_qty: 20 },
    { request_order_line_id: lines[1].request_order_line_id, approved_qty: quantity }
  ] });
  assert.equal(r.code, 'REQUEST_APPROVED_QTY_INVALID'); assert.equal(snapshot(h), before); assert.equal(h.writes(), writes);
});
test('zero lines are excluded from PO groups while requested history stays unchanged', () => {
  const h = host(), id = request(h, ['T1', 'T2', 'T3']), lines = h.rows('request_order_lines');
  const requested = lines.map(l => l.requested_qty);
  assert.equal(h.c.handleUpdateRequestOrderLineQty_({ lines: lines.slice(1).map(l => ({ request_order_line_id: l.request_order_line_id, approved_qty: 0 })) }).success, true);
  assert.equal(status(h, id, 'submit').success, true); assert.equal(status(h, id, 'approve').success, true);
  const r = convert(h, id); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(r.data.po_count, 1);
  assert.equal(h.rows('purchase_order_lines').length, 1); assert.equal(h.rows('purchase_orders')[0].total_qty, 40);
  assert.deepEqual(h.rows('request_order_lines').map(l => l.requested_qty), requested);
  assert(h.rows('request_order_lines').slice(1).every(l => !l.purchase_order_line_id));
});
test('legacy pending/approved all-zero requests cannot approve or convert', () => {
  const h = host(), id = request(h), line = h.rows('request_order_lines')[0];
  h.put('request_order_lines', 'request_order_line_id', line.request_order_line_id, 'approved_qty', 0);
  for (const state of ['pending_approval', 'approved']) {
    h.put('request_orders', 'request_order_id', id, 'request_status', state);
    const before = snapshot(h), writes = h.writes(), r = state === 'approved' ? convert(h, id) : status(h, id, 'approve');
    assert.equal(r.code, 'REQUEST_NO_POSITIVE_LINES'); assert.equal(snapshot(h), before); assert.equal(h.writes(), writes);
  }
});
for (const table of ['purchase_orders', 'purchase_order_lines']) {
  for (const after of [false, true]) {
    for (const occurrence of [1, 2]) test('conversion ' + table + ' append #' + occurrence + ' failure ' + (after ? 'after landing' : 'before landing') + ' fully rolls back and retries', () => {
      const h = host(), id = approved(h, ['T1', 'T2', 'T3']); let seen = 0;
      const undo = fail(h, table, 'appendRow', () => ++seen === occurrence, after);
      checkRollback(h, () => convert(h, id)); undo();
      const r = convert(h, id); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(h.rows('purchase_orders').length, 2);
      assert.equal(h.rows('purchase_order_lines').length, 3); const writes = h.writes();
      assert.equal(convert(h, id).data.reused, true); assert.equal(h.writes(), writes);
    });
  }
}
for (const after of [false, true]) {
  test('conversion backlink failure ' + (after ? 'after landing' : 'before landing') + ' restores prior backlinks', () => {
    const h = host(), id = approved(h, ['T1', 'T2']), col = h.tables.request_order_lines.grid[0].indexOf('purchase_order_line_id') + 1;
    fail(h, 'request_order_lines', 'setValue', e => e.col === col && e.row === 3, after);
    checkRollback(h, () => convert(h, id));
  });
  test('conversion final header status failure ' + (after ? 'after landing' : 'before landing') + ' restores PO and Request together', () => {
    const h = host(), id = approved(h, ['T1', 'T2']), col = h.tables.request_orders.grid[0].indexOf('request_status') + 1;
    fail(h, 'request_orders', 'setValue', e => e.col === col && e.value === 'converted_to_po', after);
    checkRollback(h, () => convert(h, id));
  });
}
test('a throwing rollback delete that actually landed is classified by readback, not the exception alone', () => {
  const h = host(), id = approved(h); fail(h, 'purchase_orders', 'appendRow', () => true, true);
  fail(h, 'purchase_order_lines', 'deleteRow', () => true, true);
  checkRollback(h, () => convert(h, id));
});
test('unverified cleanup is never called compensated; marker blocks Request mutations and PO issue', () => {
  const h = host(), id = approved(h); fail(h, 'purchase_orders', 'appendRow', () => true, true);
  fail(h, 'purchase_orders', 'deleteRow', () => true, false, Infinity);
  const r = convert(h, id); assert.equal(r.compensated, false); assert.equal(r.rollback_verified, false); assert.equal(r.retry_safe, false);
  assert.equal(r.code, 'PROCUREMENT_RECOVERY_REQUIRED'); assert.equal(r.recovery_marker_recorded, true);
  const po = h.rows('purchase_orders')[0]; assert(po);
  const before = snapshot(h), writes = h.writes();
  for (const run of [() => convert(h, id), () => status(h, id, 'done'),
    () => h.c.handleUpdateRequestOrderLineQty_({ lines: [{ request_order_line_id: h.rows('request_order_lines')[0].request_order_line_id, approved_qty: 5 }] }),
    () => h.c.handleCancelRequestOrderTier_({ request_order_line_ids: [h.rows('request_order_lines')[0].request_order_line_id] }),
    () => h.c.handleUpdatePurchaseOrderStatus_({ purchase_order_id: po.purchase_order_id, transition: 'issue' })]) assert.equal(run().code, 'PROCUREMENT_RECOVERY_REQUIRED');
  assert.equal(snapshot(h), before); assert.equal(h.writes(), writes);
});
test('even if a recovery marker cannot be saved, a header-only partial result cannot be reused', () => {
  const h = host(), id = approved(h); fail(h, 'purchase_orders', 'appendRow', () => true, true);
  fail(h, 'purchase_orders', 'deleteRow', () => true, false, Infinity);
  const note = h.tables.request_orders.grid[0].indexOf('note') + 1;
  fail(h, 'request_orders', 'setValue', e => e.col === note, false, Infinity);
  const r = convert(h, id); assert.equal(r.recovery_marker_recorded, false); assert.equal(r.compensated, false);
  const before = snapshot(h); assert.equal(convert(h, id).error, 'PO_CONVERSION_STATE_INCONSISTENT'); assert.equal(snapshot(h), before);
});
test('compensation preserves unrelated rows including an independently changed note', () => {
  const h = host(), id = approved(h), other = request(h), original = h.tables.purchase_orders.appendRow;
  h.tables.purchase_orders.appendRow = row => { h.put('request_orders', 'request_order_id', other, 'note', 'independent change'); original(row); throw Error('SYNTHETIC_APPEND_AFTER_OTHER_EDIT'); };
  const r = convert(h, id); assert.equal(r.compensated, true, JSON.stringify(r));
  assert.equal(h.rows('request_orders').find(r => r.request_order_id === other).note, 'independent change');
  assert.equal(h.rows('purchase_orders').length, 0); assert.equal(h.rows('purchase_order_lines').length, 0);
});
test('missing schema and duplicate affected IDs refuse before any business write', () => {
  for (const broken of ['missing_table', 'duplicate_line']) {
    const h = host(), id = request(h), line = h.rows('request_order_lines')[0];
    if (broken === 'missing_table') delete h.tables.purchase_order_lines;
    else append(h, 'request_order_lines', line);
    const writes = h.writes(), r = broken === 'missing_table' ? convert(h, id) : status(h, id, 'submit');
    assert.equal(r.code, 'REQUEST_MUTATION_PRECHECK_FAILED'); assert.equal(h.writes(), writes);
  }
});
test('a dangling pre-existing backlink is surfaced, not overwritten by a fresh conversion', () => {
  const h = host(), id = approved(h), line = h.rows('request_order_lines')[0];
  h.put('request_order_lines', 'request_order_line_id', line.request_order_line_id, 'purchase_order_line_id', 'DANGLING');
  const before = snapshot(h); assert.equal(convert(h, id).error, 'PO_CONVERSION_STATE_INCONSISTENT'); assert.equal(snapshot(h), before);
});
test('failure while repairing a legacy missing group preserves the already-created PO and backlinks', () => {
  const h = host(), id = approved(h, ['T1', 'T2']); assert.equal(convert(h, id).success, true);
  const second = h.rows('purchase_orders').find(p => p.request_bucket === 'T2_T3');
  for (const name of ['purchase_order_lines', 'purchase_orders']) {
    const sh = h.tables[name], col = sh.grid[0].indexOf('purchase_order_id');
    for (let i = sh.grid.length - 1; i > 0; i--) if (sh.grid[i][col] === second.purchase_order_id) sh.deleteRow(i + 1);
  }
  const secondLine = h.rows('request_order_lines').find(l => l.request_bucket === 'T2');
  h.put('request_order_lines', 'request_order_line_id', secondLine.request_order_line_id, 'purchase_order_line_id', '');
  h.put('request_orders', 'request_order_id', id, 'request_status', 'approved');
  const undo = fail(h, 'purchase_orders', 'appendRow', () => true, true);
  checkRollback(h, () => convert(h, id)); undo();
  const original = JSON.stringify(h.rows('purchase_orders')[0]);
  const r = convert(h, id); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(r.data.recovered, true);
  assert.equal(JSON.stringify(h.rows('purchase_orders')[0]), original); assert.equal(h.rows('purchase_orders').length, 2);
});
test('rollback restores a formula rather than replacing it with its evaluated value', () => {
  const h = host(), id = request(h); status(h, id, 'submit');
  const sh = h.tables.request_orders, col = sh.grid[0].indexOf('note') + 1, formula = '=CONCAT("fixture"," note")';
  h.put('request_orders', 'request_order_id', id, 'note', 'fixture note');
  let currentFormula = formula;
  const getData = sh.getDataRange, getRange = sh.getRange;
  sh.getDataRange = () => ({ ...getData(), getFormulas: () => sh.grid.map((r, i) => r.map((v, c) => i === 1 && c === col - 1 ? currentFormula : '')) });
  sh.getRange = (...args) => { const r = getRange(...args), write = r.setValue; return { ...r, setValue(value) {
    if (args[0] === 2 && args[1] === col) { currentFormula = String(value).startsWith('=') ? value : ''; return write(currentFormula ? 'fixture note' : value); }
    return write(value);
  } }; };
  fail(h, 'request_order_lines', 'setValue');
  checkRollback(h, () => status(h, id, 'reject', { rejected_reason: 'fixture rejection' }));
  assert.equal(currentFormula, formula);
});
test('missing line status schema cannot trigger automatic header creation on reject', () => {
  const h = host(), id = request(h); status(h, id, 'submit');
  const sh = h.tables.request_order_lines, col = sh.grid[0].indexOf('line_status'); sh.grid.forEach(r => r.splice(col, 1));
  const before = snapshot(h), writes = h.writes(), r = status(h, id, 'reject', { rejected_reason: 'fixture rejection' });
  assert.equal(r.code, 'REQUEST_MUTATION_PRECHECK_FAILED'); assert.equal(snapshot(h), before); assert.equal(h.writes(), writes);
});
