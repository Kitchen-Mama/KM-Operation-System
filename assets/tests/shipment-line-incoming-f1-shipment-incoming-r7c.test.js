// F1-SHIPMENT-INCOMING-R7C — canonical shipment-LINE incoming authority unification (golden fixtures A–N).
// Drives the ONE core owner (KMSLS: buildShipmentLineCandidates + resolveShipmentLineReceiver + the KMDR marketplace
// adapter) and proves the Inventory card resolver attributes the SAME receiver truth for resolvable lines. Physical
// grain = shipment_lines; remaining = MAX(0, shipment_qty − received) (R4 authority, reused); receiver FROZEN by
// dispatch lineage; MULTI/broken/mismatch fail closed. No live FC Share, no wh_on_the_way, no header qty.
// Run: node assets/tests/shipment-line-incoming-f1-shipment-incoming-r7c.test.js

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }

var fs = require('fs');
var path = require('path');
var KMSLS = require('../js/core/supply-planning-shipment-line-source.js');
// the card page is a browser IIFE (top-level window.*) — extract the pure resolvers like the R5/R6 tests do.
var IRSRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js'), 'utf8');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
eval(/var _IR_TERMINAL_SHIPMENT_STATUS = \{[^}]*\};/.exec(IRSRC)[0]);
eval(extractFn(IRSRC, '_irShipmentEtaBucket'));
eval(extractFn(IRSRC, '_irRemainingIncoming'));
eval(extractFn(IRSRC, '_irReceiverKey'));
eval(extractFn(IRSRC, '_irIsSpecificReceiver'));
eval(extractFn(IRSRC, '_irEtaMs'));
eval(extractFn(IRSRC, '_irBuildShipmentRemainingByReceiver'));
var IR = { _irBuildShipmentRemainingByReceiver: _irBuildShipmentRemainingByReceiver, _irReceiverKey: _irReceiverKey };

// canonical plan lineage: PL-US / PL-CA → single-marketplace plans (a combined SHIPMENT merges single-mkt PLANS)
var PLAN_LINES = [
  { shipping_plan_line_id: 'PL-US', shipping_plan_id: 'SP-US', sku: 'SKU-A' },
  { shipping_plan_line_id: 'PL-CA', shipping_plan_id: 'SP-CA', sku: 'SKU-A' }
];
var PLANS = [
  { shipping_plan_id: 'SP-US', company: 'KM', country: 'US', marketplace: 'amazon_us' },
  { shipping_plan_id: 'SP-CA', company: 'KM', country: 'CA', marketplace: 'amazon_ca' }
];
function build(shipments, lines, planLines, plans) {
  return KMSLS.buildShipmentLineCandidates({ shipmentLines: lines, shipments: shipments, shippingPlanLines: planLines || PLAN_LINES, shippingPlans: plans || PLANS });
}
function byLine(res, lineId) { var m = null; res.candidates.forEach(function (e) { if (e.candidate.linkedShipmentLineId === lineId) m = e; }); return m; }
function recv(e) { return e ? [e.candidate.company, e.candidate.country, e.candidate.marketplace] : null; }

// ---------- A ordinary marketplace ----------
var A = build([{ shipment_id: 'S1', company: 'KM', country: 'US', marketplace: 'amazon_us', destination_warehouse_id: 'WH-3PL', status: 'in_transit', eta: '2026-09-10' }],
  [{ shipment_id: 'S1', shipment_line_id: 'L1', sku: 'SKU-A', shipment_qty: 600, shipment_received_qty: 0, shipping_plan_line_id: 'PL-US' }]);
eq(byLine(A, 'L1').candidate.quantityRemaining, 600, 'A ordinary 600/0 → remaining 600');
eq(recv(byLine(A, 'L1')), ['KM', 'US', 'amazon_us'], 'A receiver = frozen lineage US');

// ---------- B partial ----------
var B = build([{ shipment_id: 'S1', company: 'KM', country: 'US', marketplace: 'amazon_us', status: 'in_transit', eta: '2026-09-10' }],
  [{ shipment_id: 'S1', shipment_line_id: 'L1', sku: 'SKU-A', shipment_qty: 600, shipment_received_qty: 300, shipping_plan_line_id: 'PL-US' }]);
eq(byLine(B, 'L1').candidate.quantityRemaining, 300, 'B partial 600/300 → remaining 300 (not 600)');

// ---------- C full ----------
var C = build([{ shipment_id: 'S1', company: 'KM', country: 'US', marketplace: 'amazon_us', status: 'in_transit', eta: '2026-09-10' }],
  [{ shipment_id: 'S1', shipment_line_id: 'L1', sku: 'SKU-A', shipment_qty: 600, shipment_received_qty: 600, shipping_plan_line_id: 'PL-US' }]);
eq(byLine(C, 'L1').candidate.quantityRemaining, 0, 'C full 600/600 → remaining 0');

// ---------- D merged shipment (header MULTI) → per-line receivers ----------
var MERGED = [{ shipment_id: 'M1', company: 'KM', country: 'US', marketplace: 'MULTI', destination_warehouse_id: 'WH-3PL', status: 'in_transit', eta: '2026-09-10' }];
var D = build(MERGED, [
  { shipment_id: 'M1', shipment_line_id: 'LA', sku: 'SKU-A', shipment_qty: 600, shipment_received_qty: 300, shipping_plan_line_id: 'PL-US' },
  { shipment_id: 'M1', shipment_line_id: 'LB', sku: 'SKU-A', shipment_qty: 400, shipment_received_qty: 0, shipping_plan_line_id: 'PL-CA' }
]);
eq([byLine(D, 'LA').candidate.quantityRemaining, recv(byLine(D, 'LA'))[1]], [300, 'US'], 'D merged US line → 300 @ US');
eq([byLine(D, 'LB').candidate.quantityRemaining, recv(byLine(D, 'LB'))[1]], [400, 'CA'], 'D merged CA line → 400 @ CA');
ok(byLine(D, 'LA').candidate.marketplace === 'amazon_us' && byLine(D, 'LB').candidate.marketplace === 'amazon_ca', 'D no MULTI leakage (per-line specific receivers)');

// ---------- E merged full receipt on US ----------
var E = build(MERGED, [
  { shipment_id: 'M1', shipment_line_id: 'LA', sku: 'SKU-A', shipment_qty: 600, shipment_received_qty: 600, shipping_plan_line_id: 'PL-US' },
  { shipment_id: 'M1', shipment_line_id: 'LB', sku: 'SKU-A', shipment_qty: 400, shipment_received_qty: 0, shipping_plan_line_id: 'PL-CA' }
]);
eq(byLine(E, 'LA').candidate.quantityRemaining, 0, 'E US fully received → 0');
eq(byLine(E, 'LB').candidate.quantityRemaining, 400, 'E CA still 400');

// ---------- F header MULTI + valid lineage → resolves (covered by D); explicit ----------
ok(byLine(D, 'LA').resolution.source === 'FROZEN_SHIPPING_PLAN_LINE', 'F MULTI header + valid lineage → resolved by frozen lineage');

// ---------- G header MULTI + blank lineage → fail closed ----------
var G = build(MERGED, [{ shipment_id: 'M1', shipment_line_id: 'LX', sku: 'SKU-A', shipment_qty: 500, shipment_received_qty: 0, shipping_plan_line_id: '' }]);
eq([byLine(G, 'LX').resolution.status, byLine(G, 'LX').resolution.reason], ['UNRESOLVED', 'HEADER_MULTI_OR_MISSING'], 'G MULTI header + blank lineage → fail closed (no invented split)');
eq(recv(byLine(G, 'LX')), [null, null, null], 'G unresolved → null receiver (candidate MISSING_COMPANY → downstream excludes)');

// ---------- H invalid lineage (plan line missing) → fail closed ----------
var H = build(MERGED, [{ shipment_id: 'M1', shipment_line_id: 'LH', sku: 'SKU-A', shipment_qty: 100, shipment_received_qty: 0, shipping_plan_line_id: 'PL-GHOST' }]);
eq([byLine(H, 'LH').resolution.status, byLine(H, 'LH').resolution.reason], ['UNRESOLVED', 'LINEAGE_PLAN_LINE_NOT_FOUND'], 'H present-but-dangling lineage → fail closed (no header fallback)');

// ---------- I present lineage SKU mismatch → fail closed ----------
var I = build(MERGED, [{ shipment_id: 'M1', shipment_line_id: 'LI', sku: 'SKU-B', shipment_qty: 100, shipment_received_qty: 0, shipping_plan_line_id: 'PL-US' }]);
eq([byLine(I, 'LI').resolution.status, byLine(I, 'LI').resolution.reason], ['UNRESOLVED', 'LINEAGE_SKU_MISMATCH'], 'I lineage present but SKU mismatch → fail closed (never silently remapped)');

// ---------- J self-fulfilled warehouse: same line-grain source + correct remaining ----------
var J = build([{ shipment_id: 'S9', company: 'KM', country: 'US', marketplace: 'self_us', destination_warehouse_id: 'WH-OWN', status: 'in_transit', eta: '2026-09-10' }],
  [{ shipment_id: 'S9', shipment_line_id: 'LJ', sku: 'SKU-A', shipment_qty: 200, shipment_received_qty: 50, shipping_plan_line_id: '' }]);
eq([byLine(J, 'LJ').candidate.quantityRemaining, byLine(J, 'LJ').candidate.destinationWarehouseId, byLine(J, 'LJ').candidate.marketplace], [150, 'WH-OWN', 'self_us'], 'J self-fulfilled → line-grain remaining 150; header fallback receiver; destination warehouse carried but not the receiver identity');

// ---------- K terminal shipment → adapter status terminal (downstream incoming 0) ----------
var K = build([{ shipment_id: 'S1', company: 'KM', country: 'US', marketplace: 'amazon_us', status: 'received', eta: '2026-09-10' }],
  [{ shipment_id: 'S1', shipment_line_id: 'L1', sku: 'SKU-A', shipment_qty: 600, shipment_received_qty: 600, shipping_plan_line_id: 'PL-US' }]);
ok(KMSLS.toMarketplaceIncomingCandidate(byLine(K, 'L1')).status === 'received', 'K terminal status preserved (KMQI/INC excludes → incoming 0; not a KMSLS re-derivation)');

// ---------- L ETA preserved (only source grain changed) ----------
eq(byLine(A, 'L1').candidate.eta, '2026-09-10', 'L candidate carries the shipment ETA verbatim');

// ---------- M FC Share after dispatch → attribution unchanged (resolver reads no FC input) ----------
var M1 = build(MERGED, [{ shipment_id: 'M1', shipment_line_id: 'LA', sku: 'SKU-A', shipment_qty: 600, shipment_received_qty: 300, shipping_plan_line_id: 'PL-US' }]);
var M2 = build(MERGED, [{ shipment_id: 'M1', shipment_line_id: 'LA', sku: 'SKU-A', shipment_qty: 600, shipment_received_qty: 300, shipping_plan_line_id: 'PL-US' }]);
eq(recv(byLine(M1, 'LA')), recv(byLine(M2, 'LA')), 'M attribution deterministic — no live FC Share input exists in the resolver');

// ---------- N conservation: Σ receiver remaining == Σ eligible physical remaining ----------
var attributed = 0, physical = 0;
D.candidates.forEach(function (e) { if (e.resolution.status === 'RESOLVED') attributed += e.candidate.quantityRemaining; physical += e.candidate.quantityRemaining; });
eq([attributed, physical], [700, 700], 'N Σ attributed == Σ physical remaining (300 + 400); never exceeds physical');

// ---------- marketplace adapter shape (KMDR consumes; no header qty / no NOT_MARKETPLACE exclusion) ----------
var mkt = KMSLS.toMarketplaceIncomingCandidate(byLine(D, 'LA'));
ok(mkt.destinationType === 'MARKETPLACE' && mkt.marketplace === 'amazon_us' && mkt.quantity === 300 && mkt.sku === 'SKU-A', 'marketplace adapter: destType=MARKETPLACE, receiver + R4 remaining carried (KMDR must not re-derive)');
var mktG = KMSLS.toMarketplaceIncomingCandidate(byLine(G, 'LX'));
ok(mktG.marketplace === '', 'marketplace adapter for UNRESOLVED → blank marketplace → KMDR identity fails closed');

// ---------- CARD PARITY: same merged shipment, card resolver attributes the SAME US/CA split ----------
var lineReceiverById = { 'PL-US': { company: 'KM', country: 'US', marketplace: 'amazon_us' }, 'PL-CA': { company: 'KM', country: 'CA', marketplace: 'amazon_ca' } };
var TODAY = Date.UTC(2026, 7, 11);
var cardShipments = [{ shipmentId: 'M1', company: 'KM', country: 'US', marketplace: 'MULTI', eta: '2026-09-10', status: 'in_transit' }];
var cardLines = [
  { shipmentId: 'M1', shipmentLineId: 'LA', sku: 'SKU-A', shipmentQty: 600, shipmentReceivedQty: 300, shippingPlanLineId: 'PL-US' },
  { shipmentId: 'M1', shipmentLineId: 'LB', sku: 'SKU-A', shipmentQty: 400, shipmentReceivedQty: 0, shippingPlanLineId: 'PL-CA' }
];
var cardMap = IR._irBuildShipmentRemainingByReceiver(cardShipments, cardLines, TODAY, lineReceiverById);
function cardTotal(company, country, marketplace) { var r = cardMap[IR._irReceiverKey(company, country, marketplace, 'SKU-A')]; return r ? (r.overdue + r.d0_18 + r.d19_30 + r.d31_45 + r.d45_plus) : 0; }
eq(cardTotal('KM', 'US', 'amazon_us'), 300, 'CARD == PLANNING: US receiver total 300 (matches core candidate)');
eq(cardTotal('KM', 'CA', 'amazon_ca'), 400, 'CARD == PLANNING: CA receiver total 400 (matches core candidate)');
// present-but-broken lineage on the card → fail closed (NOT header fallback)
var cardBroken = IR._irBuildShipmentRemainingByReceiver(cardShipments, [{ shipmentId: 'M1', shipmentLineId: 'LH', sku: 'SKU-A', shipmentQty: 100, shipmentReceivedQty: 0, shippingPlanLineId: 'PL-GHOST' }], TODAY, lineReceiverById);
ok(Object.keys(cardBroken).length === 0, 'CARD parity: present-but-unresolvable lineage fails closed (no MULTI/header fallback)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
