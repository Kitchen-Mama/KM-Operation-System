// B4-R1 — Canonical Shipment Quantity Source Repair (procurementOnTheWayMaps_).
// Exercises the ACTUAL source in assets/specs/active/apps-script/13_procurement_handlers.gs by extracting
// the pure functions (procSrcNorm_, procShipmentLineQty_, procurementOnTheWayMaps_) and eval'ing them —
// NOT a string-grep, NOT a re-implementation. Verifies: shipment_qty is primary, legacy `qty` is read
// compatibility only, canonical 0 never falls back, canonical+legacy are never summed, each line is counted
// once, grouping keys + closed-status filter are preserved, and input rows are not mutated.
// Run: node assets/tests/procurement-shipment-qty-source.test.js

var fs = require('fs');
var path = require('path');

var GS = fs.readFileSync(
  path.join(__dirname, '..', 'specs', 'active', 'apps-script', '13_procurement_handlers.gs'), 'utf8');

// Extract a top-level `function name(...) { ... }` by brace-matching (these three functions contain no
// braces inside string/comment literals, so depth counting is exact).
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('source function not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces extracting: ' + name);
}

// eval the real source functions into this scope (function declarations hoist into local scope).
eval(extractFn(GS, 'procSrcNorm_'));
eval(extractFn(GS, 'procShipmentLineQty_'));
eval(extractFn(GS, 'procurementOnTheWayMaps_'));

var fail = 0, pass = 0;
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
  else { pass++; console.log('ok   ' + l); }
}
// Guard: prove we are testing the real source, not a stub.
eq(typeof procShipmentLineQty_, 'function', 'source: procShipmentLineQty_ extracted from 13_procurement_handlers.gs');
eq(typeof procurementOnTheWayMaps_, 'function', 'source: procurementOnTheWayMaps_ extracted from 13_procurement_handlers.gs');

// ---------------------------------------------------------------------------
// Part 1 — row-level quantity resolution (procShipmentLineQty_)
// Column layout used below: [shipment_qty @0, qty @1]; helper is index-driven.
// ---------------------------------------------------------------------------
var SQ = 0, LQ = 1;
eq(procShipmentLineQty_([100, 80], SQ, LQ), 100, 'A canonical positive preferred over legacy (100 not 80)');
eq(procShipmentLineQty_([0,   80], SQ, LQ), 0,   'B canonical zero stays 0, does NOT fall back to legacy 80');
eq(procShipmentLineQty_(['',  80], SQ, LQ), 80,  'C canonical blank → legacy fallback 80');
eq(procShipmentLineQty_([80], -1, 0),        80,  'D canonical column absent → legacy fallback 80');
eq(procShipmentLineQty_([100, ''], SQ, LQ), 100, 'E canonical valid, legacy blank → 100');
eq(procShipmentLineQty_(['',  ''], SQ, LQ), 0,   'F both blank → 0');
eq(procShipmentLineQty_([], -1, -1),         0,   'F2 both columns absent → 0');
eq(procShipmentLineQty_(['abc', 80], SQ, LQ), 0, 'G present-but-malformed canonical → 0 (no legacy override)');
eq(procShipmentLineQty_([-5, 80],  SQ, LQ), 0,   'H negative canonical → 0 (never increases On-the-Way)');
eq(procShipmentLineQty_(['  ', 80], SQ, LQ), 80, 'C2 whitespace-only canonical treated as blank → legacy 80');
eq(procShipmentLineQty_(['100', '80'], SQ, LQ), 100, 'numeric-string canonical parsed → 100');
eq(procShipmentLineQty_(['', '-9'], SQ, LQ), 0,  'negative legacy fallback → 0 (never increases On-the-Way)');

// ---------------------------------------------------------------------------
// Part 2 — full aggregation via the real procurementOnTheWayMaps_(ss) with a mock Spreadsheet.
// ---------------------------------------------------------------------------
function mkSheet(rows) { return { getDataRange: function () { return { getValues: function () { return rows; } }; } }; }
function mkSS(map) { return { getSheetByName: function (n) { return map[n] || null; } }; }

// Case set 1: canonical primary + zero-not-fallback + no-sum + closed-status filter + single-count.
var shipments1 = [
  ['shipment_id', 'status', 'country', 'marketplace'],
  ['S1', 'in_transit', 'US', 'amazon_us'],
  ['S2', 'cancelled',  'US', 'amazon_us']   // CLOSED → excluded
];
var lines1 = [
  ['shipment_id', 'sku', 'shipment_qty', 'qty'],
  ['S1', 'SKU-A', 100, 80],   // → 100 (canonical, not legacy, not summed)
  ['S1', 'SKU-A', 0,   50],   // → 0   (canonical zero, no fallback)
  ['S2', 'SKU-A', 100, 100]   // parent cancelled → excluded entirely
];
var lines1Snapshot = JSON.stringify(lines1);
var res1 = procurementOnTheWayMaps_(mkSS({ shipments: mkSheet(shipments1), shipment_lines: mkSheet(lines1) }));
eq(res1.exact['sku-a|us|amazon_us'], 100, 'aggregate: 100 + 0 = 100 (canonical primary, zero no-fallback, no double-sum)');
eq(res1.bySku['sku-a'], 100, 'bySku aggregate = 100 (S2 cancelled excluded)');
eq(Object.keys(res1.exact), ['sku-a|us|amazon_us'], 'grouping key preserved: sku|country|marketplace, lowercased');
eq(JSON.stringify(lines1), lines1Snapshot, 'input shipment_lines rows are NOT mutated (read-only)');

// Case set 2: canonical blank → legacy fallback; two lines aggregate once each.
var shipments2 = [['shipment_id', 'status', 'country', 'marketplace'], ['S1', 'shipped', 'US', 'amazon_us']];
var lines2 = [
  ['shipment_id', 'sku', 'shipment_qty', 'qty'],
  ['S1', 'SKU-B', '', 80],   // → 80 (legacy fallback)
  ['S1', 'SKU-B', 20, '']    // → 20 (canonical)
];
var res2 = procurementOnTheWayMaps_(mkSS({ shipments: mkSheet(shipments2), shipment_lines: mkSheet(lines2) }));
eq(res2.exact['sku-b|us|amazon_us'], 100, 'aggregate: legacy 80 + canonical 20 = 100 (each line counted once)');

// Case set 3: shipment_qty column entirely absent → legacy read-compat still works.
var shipments3 = [['shipment_id', 'status', 'country', 'marketplace'], ['S1', 'in_transit', 'US', 'amazon_us']];
var lines3 = [
  ['shipment_id', 'sku', 'qty'],
  ['S1', 'SKU-C', 80]
];
var res3 = procurementOnTheWayMaps_(mkSS({ shipments: mkSheet(shipments3), shipment_lines: mkSheet(lines3) }));
eq(res3.exact['sku-c|us|amazon_us'], 80, 'legacy-only sheet: qty column read as fallback (80)');

// Case set 4: 'delivered'/'completed' closed statuses excluded (status filter preserved unchanged).
var shipments4 = [
  ['shipment_id', 'status', 'country', 'marketplace'],
  ['S1', 'delivered', 'US', 'amazon_us'],
  ['S2', 'completed', 'US', 'amazon_us']
];
var lines4 = [
  ['shipment_id', 'sku', 'shipment_qty', 'qty'],
  ['S1', 'SKU-D', 100, 100],
  ['S2', 'SKU-D', 100, 100]
];
var res4 = procurementOnTheWayMaps_(mkSS({ shipments: mkSheet(shipments4), shipment_lines: mkSheet(lines4) }));
eq(res4.exact['sku-d|us|amazon_us'], undefined, 'closed statuses (delivered/completed) excluded → no entry');
eq(res4.bySku['sku-d'] || 0, 0, 'closed statuses contribute 0 to bySku');

// Return shape preserved.
eq(Object.keys(res1).sort(), ['bySku', 'exact'], 'return shape preserved: { exact, bySku }');

if (fail) { console.error('\n' + fail + ' ASSERTION(S) FAILED'); process.exit(1); }
console.log('\nAll B4-R1 shipment-quantity-source assertions passed (' + pass + ' assertions).');
