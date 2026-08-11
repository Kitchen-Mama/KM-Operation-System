// F1-SHIPMENT-MAP-R8 — Shipment Map Phase-1 functional closure.
// Extracts the ACTUAL pure helpers from global-logistics-map.js (no re-implementation) and drives the two
// closure behaviors: §13 backend-status summary bucketing + §9.1 changed-only receipt collection. Plus source
// scans proving the loop reuses the canonical owners (no second shipment/route/receipt owner; no frontend
// inventory math). Run: node assets/tests/shipment-map-closure-f1-shipment-map-r8.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }

var SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'global-logistics-map.js'), 'utf8');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
// pull the module-level bucket table + the two pure helpers straight from source
eval(/var GLM_STATUS_BUCKETS_ = \[[\s\S]*?\];/.exec(SRC)[0]);
eval(extractFn(SRC, 'glmStatusSummary'));
eval(extractFn(SRC, 'glmReceiptChangedLines'));

// ===== §13 backend-status summary bucketing =====
function s(st) { return { status: st }; }
var sm = glmStatusSummary([s('in_transit'), s('shipped'), s('arrived'), s('ready_to_ship'), s('partially_received'), s('partial_received'), s('received'), s('completed'), s('delivered')]);
function bucket(k) { for (var i = 0; i < sm.length; i++) if (sm[i].key === k) return sm[i]; return null; }
eq(bucket('inTransit').count, 4, '§13 In Transit groups shipped/in_transit/arrived/ready_to_ship');
eq(bucket('partiallyReceived').count, 2, '§13 Partially Received groups partially_received + legacy partial_received');
eq(bucket('received').count, 3, '§13 Received groups received/completed/delivered');
eq(bucket('other').count, 0, '§13 known vocabulary leaves Other empty');

// unknown status is surfaced under Other with its raw token (never silently reclassified)
var smU = glmStatusSummary([s('in_transit'), s('weird_state'), s('weird_state'), s('')]);
eq(bucket2(smU, 'other').count, 3, '§13 unknown + blank fall into Other (conservative, no invented bucket)');
eq(bucket2(smU, 'other').statuses, ['weird_state'], '§13 Other reports the raw unknown status token (blank omitted)');
function bucket2(arr, k) { for (var i = 0; i < arr.length; i++) if (arr[i].key === k) return arr[i]; return null; }

// backend value 'partially_received' is the derived truth (never 'partial_received' from the frontend)
eq(bucket2(glmStatusSummary([s('partially_received')]), 'partiallyReceived').count, 1, '§7 derived partially_received counts as Partially Received');

// summary is pure (input array untouched)
var inp = [s('received')]; glmStatusSummary(inp); eq(inp.length, 1, 'summary does not mutate input');

// ===== §9.1 changed-only receipt collection (underpins fixtures D / G / H) =====
// D — 0→300 on one line, other line unchanged → only the changed line submitted
eq(glmReceiptChangedLines([{ shipment_line_id: 'L1', value: '300', prev: '0' }, { shipment_line_id: 'L2', value: '400', prev: '400' }]),
   [{ shipment_line_id: 'L1', shipment_received_qty: 300 }], 'D only the changed cumulative line is submitted');
// G — repeated full save 600→600 → nothing submitted (backend idempotent no-op never queued)
eq(glmReceiptChangedLines([{ shipment_line_id: 'L1', value: '600', prev: '600' }]), [], 'G unchanged 600→600 submits nothing');
// H — 600→500 (backward) IS submitted so the backend can reject it (frontend never silently blocks/rewrites)
eq(glmReceiptChangedLines([{ shipment_line_id: 'L1', value: '500', prev: '600' }]),
   [{ shipment_line_id: 'L1', shipment_received_qty: 500 }], 'H backward value still submitted for backend rejection');
// blank / non-finite value → not submitted (nothing to write); missing id → skipped
eq(glmReceiptChangedLines([{ shipment_line_id: 'L1', value: '', prev: '0' }, { shipment_line_id: '', value: '5', prev: '0' }]), [], 'blank value + missing id skipped');
// prev blank treated as 0 → a first real value is a change
eq(glmReceiptChangedLines([{ shipment_line_id: 'L1', value: '10', prev: '' }]), [{ shipment_line_id: 'L1', shipment_received_qty: 10 }], 'blank prev = 0 → first value is a change');

// ===== source scans: no second owner, no frontend inventory math, reuses canonical actions =====
function stripComments(x) { return x.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); }
var code = stripComments(SRC);
ok(/updateShipmentReceipt\(/.test(code), 'receipt Save reuses the canonical shipment.receipt.update adapter');
ok(/advanceShipmentRoutePoint\(/.test(code), 'route update reuses the canonical shipment.route.advance adapter');
ok(!/overseas_inventory|wh_available_stock|wh_on_the_way/.test(code), 'Map performs NO overseas inventory math (backend-owned)');
ok(!/current_route_node_id/.test(code), 'no second current-route-point authority on the frontend');
// remaining is DISPLAY arithmetic only (max(shipped-received,0)); no persisted remaining field written
ok(/Math\.max\(shipped\s*-\s*recv,\s*0\)/.test(code) || /Math\.max\(shipped\s*-\s*v,\s*0\)/.test(code), 'remaining is derived display arithmetic only');
// status summary reflects the shared filtered collection (filters drive list + map + summary — §12)
ok(/renderStatusSummary\(\)/.test(code) && /glmStatusSummary\(filteredVms\(\)\)/.test(code), '§12/§13 summary uses the same filteredVms() collection as list + map');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
