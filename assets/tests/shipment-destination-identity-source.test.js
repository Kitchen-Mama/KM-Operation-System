// B4-R2 — Canonical Shipment Destination Identity Planning-Read Alignment.
// Exercises the ACTUAL source in assets/specs/active/apps-script/13_procurement_handlers.gs by extracting and
// eval'ing the real functions (procSrcNorm_, procShipmentDestId_, procShipmentLineQty_, procurementOnTheWayMaps_)
// — NOT a grep, NOT a re-implementation. Verifies: destination_warehouse_id is primary; legacy warehouse_id is
// read compatibility only; canonical wins on conflict; warehouse_code / display text are never identity;
// origin/source ids are never a destination fallback; missing identity stays explicit; string id "0" is preserved;
// input rows are not mutated; and B4-R1 quantity behavior + exact/bySku aggregates remain unchanged.
// Run: node assets/tests/shipment-destination-identity-source.test.js

var fs = require('fs');
var path = require('path');

var GS = fs.readFileSync(
  path.join(__dirname, '..', 'specs', 'active', 'apps-script', '13_procurement_handlers.gs'), 'utf8');

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

eval(extractFn(GS, 'procSrcNorm_'));
eval(extractFn(GS, 'procShipmentDestId_'));
eval(extractFn(GS, 'procShipmentLineQty_'));
eval(extractFn(GS, 'procShipmentRemainingQty_'));   // F1-SHIPMENT-INCOMING-R4 dependency of procurementOnTheWayMaps_
eval(extractFn(GS, 'procurementOnTheWayMaps_'));

var fail = 0, pass = 0;
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
  else { pass++; console.log('ok   ' + l); }
}
eq(typeof procShipmentDestId_, 'function', 'source: procShipmentDestId_ extracted from 13_procurement_handlers.gs');
eq(typeof procurementOnTheWayMaps_, 'function', 'source: procurementOnTheWayMaps_ extracted from 13_procurement_handlers.gs');

// ---------------------------------------------------------------------------
// Part 1 — destination resolver (procShipmentDestId_). Column layout: [destination_warehouse_id @0, warehouse_id @1].
// ---------------------------------------------------------------------------
var D = 0, W = 1;
eq(procShipmentDestId_(['WH-CANON', 'WH-LEG'], D, W), { id: 'WH-CANON', legacyFallback: false, missing: false }, 'A canonical wins over legacy on conflict');
eq(procShipmentDestId_(['WH-CANON', ''], D, W),       { id: 'WH-CANON', legacyFallback: false, missing: false }, 'B canonical present, legacy blank → canonical');
eq(procShipmentDestId_(['', 'WH-LEG'], D, W),         { id: 'WH-LEG', legacyFallback: true, missing: false },    'C canonical blank → legacy fallback (flagged)');
eq(procShipmentDestId_(['WH-LEG'], -1, 0),            { id: 'WH-LEG', legacyFallback: true, missing: false },    'D canonical column absent → legacy fallback');
eq(procShipmentDestId_(['', ''], D, W),               { id: '', legacyFallback: false, missing: true },          'E both blank → explicit missing');
eq(procShipmentDestId_([], -1, -1),                   { id: '', legacyFallback: false, missing: true },          'F both columns absent → explicit missing');
eq(procShipmentDestId_(['   ', 'WH-LEG'], D, W),      { id: 'WH-LEG', legacyFallback: true, missing: false },    'G whitespace canonical treated as blank → legacy fallback');
eq(procShipmentDestId_(['0', 'WH-LEG'], D, W),        { id: '0', legacyFallback: false, missing: false },        'H string id "0" preserved as canonical id (not coerced to missing)');
eq(procShipmentDestId_([' WH-C ', 'WH-LEG'], D, W),   { id: 'WH-C', legacyFallback: false, missing: false },     'canonical id trimmed via procSrcNorm_');

// ---------------------------------------------------------------------------
// Part 2 — integration via the real procurementOnTheWayMaps_(ss). Header carries warehouse_code / destination /
// source_warehouse_id columns to prove NONE of them are ever used as identity.
// ---------------------------------------------------------------------------
function mkSheet(rows) { return { getDataRange: function () { return { getValues: function () { return rows; } }; } }; }
function mkSS(map) { return { getSheetByName: function (n) { return map[n] || null; } }; }

var shipments = [
  ['shipment_id', 'status', 'country', 'marketplace', 'destination_warehouse_id', 'warehouse_id', 'warehouse_code', 'destination', 'source_warehouse_id'],
  ['S1', 'in_transit', 'US', 'amazon_us', 'WH-A', 'WH-LEG', 'CODE-A', 'Some Dest Text', 'SRC-1'],   // canonical WH-A wins
  ['S2', 'shipped',    'US', 'amazon_us', '',     'WH-B',   'CODE-B', 'Text B',         'SRC-2'],   // legacy fallback WH-B
  ['S3', 'in_transit', 'US', 'amazon_us', '',     '',       'CODE-C', 'Display Only C', 'SRC-3'],   // missing (code/text/source ignored)
  ['S4', 'cancelled',  'US', 'amazon_us', 'WH-Z', 'WH-Z',   'CODE-Z', 'Z',              'SRC-Z']    // CLOSED → excluded entirely
];
var lines = [
  ['shipment_id', 'sku', 'shipment_qty', 'qty'],
  ['S1', 'SKU-X', 100, 999],
  ['S2', 'SKU-X', 50, 999],
  ['S3', 'SKU-X', 30, 999],
  ['S4', 'SKU-X', 100, 100]
];
var shipmentsSnap = JSON.stringify(shipments);
var linesSnap = JSON.stringify(lines);
var res = procurementOnTheWayMaps_(mkSS({ shipments: mkSheet(shipments), shipment_lines: mkSheet(lines) }));

// byDest: destination-scoped aggregate keyed by resolved canonical destination id.
eq(res.byDest['sku-x|wh-a'], 100, 'byDest: canonical destination_warehouse_id WH-A (not code/text/legacy)');
eq(res.byDest['sku-x|wh-b'], 50, 'byDest: legacy warehouse_id WH-B used as fallback when canonical blank');
eq(res.byDest['sku-x|__MISSING_DEST__'], 30, 'byDest: missing destination is explicit under __MISSING_DEST__ sentinel (code/text/source NOT used)');
eq(res.byDest['sku-x|code-a'], undefined, 'warehouse_code is NEVER a destination key');
eq(res.byDest['sku-x|some dest text'], undefined, 'destination display text is NEVER a destination key');
eq(res.byDest['sku-x|src-1'], undefined, 'source_warehouse_id (origin) is NEVER a destination fallback');
eq(res.byDest['sku-x|wh-z'], undefined, 'CLOSED shipment (cancelled) excluded from byDest too');

// B4-R1 aggregates preserved exactly (destination read did not change totals).
eq(res.exact['sku-x|us|amazon_us'], 180, 'B4-R1 preserved: exact = 100 + 50 + 30 = 180 (S4 cancelled excluded; shipment_qty primary, legacy 999 ignored)');
eq(res.bySku['sku-x'], 180, 'B4-R1 preserved: bySku = 180');
eq(Object.keys(res.exact), ['sku-x|us|amazon_us'], 'B4-R1 preserved: exact grouping key unchanged (sku|country|marketplace)');

// Additive contract + read-only.
eq([res.exact !== undefined, res.bySku !== undefined, res.byDest !== undefined], [true, true, true], 'return is additive: { exact, bySku, byDest }');
eq(JSON.stringify(shipments), shipmentsSnap, 'shipments source rows NOT mutated (read-only)');
eq(JSON.stringify(lines), linesSnap, 'shipment_lines source rows NOT mutated (read-only)');

// Legacy-only sheet (no destination_warehouse_id column at all) → warehouse_id fallback still works.
var shipments2 = [
  ['shipment_id', 'status', 'country', 'marketplace', 'warehouse_id'],
  ['S1', 'in_transit', 'US', 'amazon_us', 'WH-LEG']
];
var lines2 = [['shipment_id', 'sku', 'shipment_qty'], ['S1', 'SKU-Y', 70]];
var res2 = procurementOnTheWayMaps_(mkSS({ shipments: mkSheet(shipments2), shipment_lines: mkSheet(lines2) }));
eq(res2.byDest['sku-y|wh-leg'], 70, 'legacy-only sheet: warehouse_id read as destination fallback');

if (fail) { console.error('\n' + fail + ' ASSERTION(S) FAILED'); process.exit(1); }
console.log('\nAll B4-R2 shipment-destination-identity assertions passed (' + pass + ' assertions).');
