// F1-SHIPMENT-INCOMING-R4 — Shipment remaining-incoming authority + mutually-exclusive ETA buckets.
// Exercises the ACTUAL sources: the core supply-candidate builder (required), procShipmentRemainingQty_
// (extracted from 13_), and the ETA bucket model (extracted from inventory-replenishment.js). Plus scans
// proving no planning path reads wh_on_the_way_qty and the bundle was regenerated.
// Run: node assets/tests/shipment-remaining-incoming-f1-shipment-incoming-r4.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }

var CORE = path.join(__dirname, '..', 'js', 'core');
var GS = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
var CAND = require(path.join(CORE, 'supply-planning-supply-candidates.js'));
var build = CAND.buildKmShipmentSupplyCandidate;

var SRC13 = fs.readFileSync(path.join(GS, '13_procurement_handlers.gs'), 'utf8');
var PROJ = fs.readFileSync(path.join(CORE, 'supply-planning-source-projection.js'), 'utf8');
var BUNDLE = fs.readFileSync(path.join(GS, '90_generated_supply_planning_bundle.gs'), 'utf8');
var IR = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js'), 'utf8');

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
eval(extractFn(SRC13, 'procShipmentLineQty_'));
eval(extractFn(SRC13, 'procShipmentRemainingQty_'));
eval(extractFn(IR, '_irShipmentEtaBucket'));
eval(extractFn(IR, '_irRemainingIncoming'));
eval(extractFn(IR, '_irBucketRemainingByEta'));

function cand(shippedQty, receivedQty) {
  return build({ shipment: { shipmentId: 'S1', company: 'KM', country: 'US', marketplace: 'amazon_us', eta: '2026-09-01', status: 'in_transit', destinationWarehouseId: 'WH-X' },
    line: { shipmentLineId: 'L1', sku: 'SKU-A', shipmentQty: shippedQty, shipmentReceivedQty: receivedQty } });
}

// ===== Candidate quantityRemaining = MAX(0, shipped − received) (the KMQI/gap incoming authority) =====
// Fixture A: 600 / received 0 → remaining 600
eq(cand(600, 0).quantityRemaining, 600, 'A 600/0 → remaining 600');
eq(cand(600, 0).quantityOriginal, 600, 'A quantityOriginal keeps full shipped 600');
// Fixture B: 600 / received 300 → remaining 300 (partial no longer contributes full)
eq(cand(600, 300).quantityRemaining, 300, 'B 600/300 → remaining 300 (not 600, not 0)');
eq(cand(600, 300).quantityReceived, 300, 'B quantityReceived surfaced = 300');
// Fixture C: 600 / received 600 → remaining 0 (fully received drops from incoming)
eq(cand(600, 600).quantityRemaining, 0, 'C 600/600 → remaining 0');
// blank received → 0 → remaining = full
eq(cand(600, '').quantityRemaining, 600, 'blank received → remaining 600');
eq(cand(600, null).quantityRemaining, 600, 'null received → remaining 600');
// defensive: received > shipped → remaining 0 + review flag (§3)
eq(cand(600, 700).quantityRemaining, 0, 'received>shipped → remaining clamped to 0');
ok(cand(600, 700).reviewFlags.indexOf('RECEIVED_EXCEEDS_SHIPPED') !== -1, 'received>shipped → RECEIVED_EXCEEDS_SHIPPED review flag');

// ===== procurement on-the-way remaining (13_ recommendation incoming) =====
var SQ = 0, LQ = 1, RC = 2;   // [shipment_qty, qty, shipment_received_qty]
eq(procShipmentRemainingQty_([600, '', 0], SQ, LQ, RC), 600, 'proc A 600/0 → 600');
eq(procShipmentRemainingQty_([600, '', 300], SQ, LQ, RC), 300, 'proc B 600/300 → 300');
eq(procShipmentRemainingQty_([600, '', 600], SQ, LQ, RC), 0, 'proc C 600/600 → 0');
eq(procShipmentRemainingQty_([600, '', ''], SQ, LQ, RC), 600, 'proc blank received → 600');
eq(procShipmentRemainingQty_([600, '', 700], SQ, LQ, RC), 0, 'proc received>shipped → 0 (never negative)');
eq(procShipmentRemainingQty_([600, '', -5], SQ, LQ, RC), 600, 'proc negative received → treated 0 → 600');
eq(procShipmentRemainingQty_(['', 500, 200], SQ, LQ, RC), 300, 'proc legacy qty 500 − 200 → 300');
eq(procShipmentRemainingQty_([600, ''], SQ, LQ, -1), 600, 'proc no received column → full shipped');

// ===== mutually-exclusive ETA buckets (Fixtures E,F,G,H,I,J) =====
eq(_irShipmentEtaBucket(10), 'd0_18', 'E ETA +10 → 0-18 bucket');
eq(_irShipmentEtaBucket(25), 'd19_30', 'F ETA +25 → 19-30 bucket ONLY');
eq(_irShipmentEtaBucket(40), 'd31_45', 'G ETA +40 → 31-45 bucket ONLY');
eq(_irShipmentEtaBucket(60), 'd45_plus', 'H ETA +60 → 45+ bucket');
eq(_irShipmentEtaBucket(18), 'd0_18', 'boundary 18 → 0-18');
eq(_irShipmentEtaBucket(19), 'd19_30', 'boundary 19 → 19-30');
eq(_irShipmentEtaBucket(45), 'd31_45', 'boundary 45 → 31-45');
eq(_irShipmentEtaBucket(46), 'd45_plus', 'boundary 46 → 45+');
eq(_irShipmentEtaBucket(-3), 'overdue', 'overdue (ETA<today) → separate overdue state by default');
eq(_irShipmentEtaBucket(-3, true), 'd0_18', 'overdue fold option → earliest bucket');
// aggregation is mutually exclusive (no line double-counted)
var buckets = _irBucketRemainingByEta([
  { etaDays: 10, remaining: 300 }, { etaDays: 25, remaining: 500 }, { etaDays: 40, remaining: 200 }, { etaDays: 60, remaining: 100 }
]);
eq([buckets.d0_18, buckets.d19_30, buckets.d31_45, buckets.d45_plus], [300, 500, 200, 100], 'aggregate: each remaining lands in exactly one bucket');
// Fixture J — partially_received line contributes remaining, bucketed once
eq(_irBucketRemainingByEta([{ etaDays: 25, remaining: _irRemainingIncoming(600, 300) }]).d19_30, 300, 'J partial 600/300 remaining 300 → 19-30 only');
// Fixture I — fully received contributes 0 to every bucket
eq(_irBucketRemainingByEta([{ etaDays: 25, remaining: _irRemainingIncoming(600, 600) }]).d19_30, 0, 'I fully received → 0 in bucket');
// frontend remaining mirror
eq(_irRemainingIncoming(600, 300), 300, 'remaining mirror 600/300 → 300');
eq(_irRemainingIncoming(600, 600), 0, 'remaining mirror 600/600 → 0');
eq(_irRemainingIncoming(600, 700), 0, 'remaining mirror over-receipt → 0');

// ===== §8 double-count: no planning incoming path reads wh_on_the_way_qty (ignore prose in comments) =====
function stripComments(s) { return s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); }
ok(!/wh_on_the_way_qty/.test(stripComments(fs.readFileSync(path.join(CORE, 'supply-planning-supply-candidates.js'), 'utf8'))), 'candidate builder never reads wh_on_the_way_qty (code, not comments)');
ok(!/wh_on_the_way_qty/.test(stripComments(PROJ)), 'source projection never reads wh_on_the_way_qty as incoming (code, not comments)');
// procurement on-the-way is shipment-derived, not the overseas snapshot column.
ok(/procShipmentRemainingQty_/.test(SRC13) && !/overseas_inventory_snapshot[\s\S]{0,80}on_the_way/.test(SRC13), 'procurement incoming = shipment-derived remaining, not overseas snapshot on_the_way');

// ===== source projection threads received; bundle regenerated with the remaining authority =====
// R7C: the shipment INCOMING assembly (incl. received-qty threading) moved to the ONE canonical line owner,
// which the projection delegates to. The R4 remaining authority (MAX(0, shipmentQty − received)) is unchanged.
ok(/shipmentReceivedQty:\s*has\(ln, 'shipment_received_qty'\)/.test(fs.readFileSync(path.join(CORE, 'supply-planning-shipment-line-source.js'), 'utf8')) && /buildShipmentLineCandidates/.test(PROJ), 'canonical line owner threads shipment_received_qty; projection delegates to it');
ok(/quantityReceived/.test(BUNDLE) && /MAX\(0, shipmentQty . received\)|MAX\(0, shipmentQty − received\)/.test(BUNDLE), 'bundle regenerated: candidate remaining authority present in 90_ generated bundle');

// ===== §1 partially_received stays eligible (status filter unchanged) — procurement CLOSED set excludes received but NOT partially_received =====
ok(/CLOSED = \{ completed: 1, received: 1, closed: 1, cancelled: 1, canceled: 1, delivered: 1 \}/.test(SRC13), 'CLOSED set unchanged: received excluded, partially_received still active');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
