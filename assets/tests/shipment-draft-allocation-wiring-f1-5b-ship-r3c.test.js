// F1-5B-SHIP-R3C — Shipment Draft → canonical FIFO allocation wiring (frontend, presentation/orchestration only).
// Proves: the Confirm & Dispatch flow persists physical truth (Save) → reconciles canonical DRAFT allocations via
// the ONE R3A backend authority (generateShipmentLineAllocations, shipment-scoped, no per-SKU fan-out) → then
// dispatches (R3B); insufficient capacity fails closed (readiness blocked, no dispatch, draft stays saved); the
// frontend contains NO FIFO / PO-capacity / shipped_qty math; R3A/R3B semantics unchanged.
// Run: node assets/tests/shipment-draft-allocation-wiring-f1-5b-ship-r3c.test.js
// NOTE: source/DOM guards only (no live globe / WebGL / fetch).

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var SH = read('js/pages/shipping-history.js');
var API = read('js/api/operation-system-db-api.js');
var run = extractFn(SH, '_shRunConfirm');

console.log('\n== DB API adapter — thin bridge to the ONE R3A authority ==');
ok(/window\.KM\.DB\.generateShipmentLineAllocations = async function/.test(API), 'generateShipmentLineAllocations DB method exists');
ok(/action: 'generateShipmentLineAllocations'/.test(API), 'adapter posts the canonical router action');
var apiFn = API.slice(API.indexOf('window.KM.DB.generateShipmentLineAllocations = async'), API.indexOf('window.KM.DB.generateShipmentLineAllocations = async') + 1300);
ok(/loadOperationDb\(\{ force: true \}\)/.test(apiFn), 'adapter refreshes canonical DB cache on success (draft allocations visible)');
ok(!/order_date|allocated_qty|completed_qty|\.sort\(|shipped_qty/.test(apiFn), 'adapter contains NO FIFO / capacity / shipped math (pure transport)');

console.log('\n== §3 write order: Save → reconcile → dispatch ==');
var iSave = run.indexOf('updateShipment(execPayload)');
var iAlloc = run.indexOf('generateShipmentLineAllocations({ shipment_id');
var iDispatch = run.indexOf('confirmShipmentAndDispatch({ shipment_id');
ok(iSave > -1 && iAlloc > iSave, '§3 physical Save persists BEFORE allocation reconciliation');
ok(iAlloc > -1 && iDispatch > iAlloc, '§3 allocation reconciles BEFORE Confirm & Dispatch (never allocate-then-save)');

console.log('\n== §17 one shipment-scoped reconcile — no per-SKU fan-out ==');
ok((run.match(/generateShipmentLineAllocations\(/g) || []).length === 1, 'exactly ONE reconcile call in the dispatch flow');
ok(/generateShipmentLineAllocations\(\{ shipment_id: shipmentId/.test(run), 'reconcile is shipment-scoped (one call reconciles all lines)');
ok(!/Promise\.all[\s\S]{0,120}generateShipmentLineAllocations/.test(SH) && !/forEach[\s\S]{0,80}generateShipmentLineAllocations/.test(SH), '§17 no Promise.all / per-line fan-out of the allocation call');

console.log('\n== §6/§9 insufficient capacity fails closed (readiness gate; backend still authoritative) ==');
ok(/alloc\.success === false/.test(run) && /throw \{ _handled: true \}/.test(run), 'allocation failure blocks the chain (no dispatch) via a handled sentinel');
ok(/Needs Attention/.test(run) && /shipment draft is saved/.test(run), '§6/§18 physical draft stays saved; readiness = Needs Attention with an actionable message');
ok(/shortage_qty != null[\s\S]{0,120}available_capacity/.test(run), '§6 surfaces backend shortfall (need/available/short) — not recomputed in frontend');
// the dispatch call is only reachable AFTER the readiness check passes
ok(run.indexOf('throw { _handled: true }') < run.indexOf('confirmShipmentAndDispatch({ shipment_id'), 'fail-closed branch precedes the dispatch call (blocked shipments never dispatch)');
ok(/if \(err && err\._handled\) return;/.test(run), 'handled block does not fall through to a generic error');
ok(/confirmShipmentAndDispatch\(\{ shipment_id: shipmentId/.test(run), '§9 backend Confirm & Dispatch (R3B) still invoked on ready — frontend readiness is UX only');

console.log('\n== §2/§12/§35 no frontend FIFO / PO-capacity / shipped math ==');
ok(!/order_date/.test(SH), '§12 no order_date FIFO key anywhere in Shipment Draft frontend');
ok(!/completed_qty\s*-\s*shipped_qty|completed\s*-\s*shipped/.test(SH), '§35 no completed−shipped capacity math in frontend');
ok(!/\.shipped_qty\s*=|shipped_qty\s*\+=/.test(SH), '§35 frontend never writes/derives shipped_qty');
ok(!/purchase_order_line_id\s*[:=]/.test(SH), '§14 frontend does not assign purchase_order_line_id (multi-PO authority is backend allocations)');
ok(!/slaFifoCompare_|slaAllocate|eligible.*po.*line/i.test(SH), '§2 no FIFO/eligible-PO/allocation engine in frontend');

console.log('\n== §10/§15 R3B remains the execution + capacity-revalidation authority ==');
ok(/confirmShipmentAndDispatch/.test(SH) && !/PO_CAPACITY_CHANGED_BEFORE_DISPATCH|slaPrepareExecution_/.test(SH), '§10 frontend does not duplicate R3B in-lock capacity revalidation');
ok(!/allocation_status\s*[:=]\s*['"]executed/.test(SH), '§15 frontend never flips allocations to executed (R3B/dispatch owns execution)');

console.log('\n----------------------------------------');
console.log('SHIPMENT DRAFT ALLOCATION WIRING (F1-5B-SHIP-R3C): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
