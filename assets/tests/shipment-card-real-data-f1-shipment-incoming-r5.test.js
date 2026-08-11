// F1-SHIPMENT-INCOMING-R5 — Shipping Shipment card real shipment-derived projection.
// Extracts the ACTUAL projection owner + helpers from inventory-replenishment.js (no re-implementation) and
// drives §12 fixtures A–O, plus source scans proving real wiring, no wh_on_the_way read, and card render rows.
// Run: node assets/tests/shipment-card-real-data-f1-shipment-incoming-r5.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }

var IR = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js'), 'utf8');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
// the frozen terminal-status var (referenced by the projection owner)
eval(/var _IR_TERMINAL_SHIPMENT_STATUS = \{[^}]*\};/.exec(IR)[0]);
eval(extractFn(IR, '_irShipmentEtaBucket'));
eval(extractFn(IR, '_irRemainingIncoming'));
eval(extractFn(IR, '_irReceiverKey'));
eval(extractFn(IR, '_irEtaMs'));
eval(extractFn(IR, '_irBucketRemainingByEta'));
eval(extractFn(IR, '_irBuildShipmentRemainingByReceiver'));

var TODAY = Date.UTC(2026, 7, 11);   // 2026-08-11
function ymd(offsetDays) { var d = new Date(TODAY + offsetDays * 86400000); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
function ship(id, mkt, eta, status) { return { shipmentId: id, company: 'KM', country: 'US', marketplace: mkt, eta: eta, status: status || 'in_transit' }; }
function line(id, shipId, sku, qty, recv) { return { shipmentLineId: id, shipmentId: shipId, sku: sku, shipmentQty: qty, shipmentReceivedQty: recv }; }
var KEY = _irReceiverKey('KM', 'US', 'amazon_us', 'SKU-A');
function proj(ships, lines) { return _irBuildShipmentRemainingByReceiver(ships, lines, TODAY); }
function rec(m) { return m[KEY] || { overdue: 0, d0_18: 0, d19_30: 0, d31_45: 0, d45_plus: 0 }; }

// A — 600/0 ETA+10 → Within 18 = 600
eq(rec(proj([ship('S1', 'amazon_us', ymd(10))], [line('L1', 'S1', 'SKU-A', 600, 0)])).d0_18, 600, 'A 600/0 +10 → d0_18 600');
// B — 600/300 +10 → 300
eq(rec(proj([ship('S1', 'amazon_us', ymd(10))], [line('L1', 'S1', 'SKU-A', 600, 300)])).d0_18, 300, 'B 600/300 +10 → d0_18 300 (not 600)');
// C — 600/600 → all buckets 0
eq(rec(proj([ship('S1', 'amazon_us', ymd(10))], [line('L1', 'S1', 'SKU-A', 600, 600)])), { overdue: 0, d0_18: 0, d19_30: 0, d31_45: 0, d45_plus: 0 }, 'C fully received → all buckets 0');
// D — 600/300 +25 → Within 30 only
eq(rec(proj([ship('S1', 'amazon_us', ymd(25))], [line('L1', 'S1', 'SKU-A', 600, 300)])), { overdue: 0, d0_18: 0, d19_30: 300, d31_45: 0, d45_plus: 0, unknown: 0 }, 'D +25 → d19_30 300 only');
// E — +40 → Within 45 only
eq(rec(proj([ship('S1', 'amazon_us', ymd(40))], [line('L1', 'S1', 'SKU-A', 500, 0)])).d31_45, 500, 'E +40 → d31_45 only');
// F — +60 → 45+ only
eq(rec(proj([ship('S1', 'amazon_us', ymd(60))], [line('L1', 'S1', 'SKU-A', 400, 0)])).d45_plus, 400, 'F +60 → d45_plus only');
// G — ETA yesterday remaining 300 → Overdue
eq(rec(proj([ship('S1', 'amazon_us', ymd(-1))], [line('L1', 'S1', 'SKU-A', 600, 300)])).overdue, 300, 'G overdue → 300');
// H — terminal shipment → all 0
['received', 'completed', 'closed', 'cancelled', 'delivered'].forEach(function (st) {
  var m = proj([ship('S1', 'amazon_us', ymd(10), st)], [line('L1', 'S1', 'SKU-A', 600, 0)]);
  eq(rec(m).d0_18, 0, 'H terminal ' + st + ' → 0 incoming');
});
// I — partially_received still appears (remaining)
eq(rec(proj([ship('S1', 'amazon_us', ymd(10), 'partially_received')], [line('L1', 'S1', 'SKU-A', 600, 250)])).d0_18, 350, 'I partially_received → remaining 350 appears');
// J — two shipments same receiver, different ETA buckets
eq(rec(proj([ship('S1', 'amazon_us', ymd(10)), ship('S2', 'amazon_us', ymd(40))], [line('L1', 'S1', 'SKU-A', 300, 0), line('L2', 'S2', 'SKU-A', 200, 0)])), { overdue: 0, d0_18: 300, d19_30: 0, d31_45: 200, d45_plus: 0, unknown: 0 }, 'J two shipments → 18=300, 45=200');
// K — different marketplace does NOT leak into this receiver key
var mK = proj([ship('S1', 'walmart_us', ymd(10))], [line('L1', 'S1', 'SKU-A', 600, 0)]);
eq(mK[KEY], undefined, 'K different marketplace does not attribute to amazon_us receiver');
ok(mK[_irReceiverKey('KM', 'US', 'walmart_us', 'SKU-A')].d0_18 === 600, 'K attributes to its own canonical receiver');
// L — merged MULTI shipment keyed under multi (excluded from specific-marketplace receiver)
var mL = proj([ship('S1', 'MULTI', ymd(10))], [line('L1', 'S1', 'SKU-A', 1000, 0)]);
eq(mL[KEY], undefined, 'L merged MULTI shipment not attributed to a specific-marketplace receiver');
ok(mL[_irReceiverKey('KM', 'US', 'multi', 'SKU-A')].d0_18 === 1000, 'L MULTI kept under multi key (conserved, not split)');
// O — card total for receiver = Σ remaining for that receiver
var mO = proj([ship('S1', 'amazon_us', ymd(10)), ship('S2', 'amazon_us', ymd(40))], [line('L1', 'S1', 'SKU-A', 600, 300), line('L2', 'S2', 'SKU-A', 200, 0)]);
var r = rec(mO); eq(r.overdue + r.d0_18 + r.d19_30 + r.d31_45 + r.d45_plus, 500, 'O receiver card total = Σ remaining (300 + 200)');

// ===== source wiring scans =====
function stripComments(s) { return s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); }
var live = IR.slice(IR.indexOf('function _getCloudReplenishmentData'));
live = live.slice(0, live.indexOf('\nfunction '));
ok(/get\('getShipments'\)/.test(live) && /get\('getShipmentLines'\)/.test(live), 'cloud path reads real getShipments + getShipmentLines');
ok(/_irBuildShipmentRemainingByReceiver\(shipments, shipmentLines/.test(live), 'cloud path builds the receiver projection');
ok(/within18days: shipRem\.d0_18/.test(live) && /within45plus: shipRem\.d45_plus/.test(live), 'cloud row sources card buckets from the real projection (no more within18days: 0)');
ok(!/within18days: 0/.test(live), 'cloud path no longer hard-codes within18days: 0');
ok(!/wh_on_the_way/.test(stripComments(IR.slice(IR.indexOf('function _irBuildShipmentRemainingByReceiver'), IR.indexOf('function _irBuildShipmentRemainingByReceiver') + 1400))), 'projection owner never reads wh_on_the_way_*');
// card render rows: Overdue (conditional) + 45+ added, three buckets present
ok(/replen-card__title">Shipping Shipment/.test(IR) && /45\+ days/.test(IR) && /shipOverdue/.test(IR) && /within45plus/.test(IR), 'card render has Overdue + 45+ rows sourced from real fields');
// projection uses no FC-share input (attribution is shipment-derived only)
ok(!/fcShare|fc_share|FC Share/i.test(extractFn(IR, '_irBuildShipmentRemainingByReceiver')), 'N projection never reads FC Share (no live-share rewrite of dispatched shipment)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
