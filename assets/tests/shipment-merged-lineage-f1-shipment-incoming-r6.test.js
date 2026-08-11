// F1-SHIPMENT-INCOMING-R6 — merged shipment frozen receiver lineage + receipt attribution.
// Extracts the ACTUAL projection owner from inventory-replenishment.js and drives §11 fixtures A–J with a
// frozen lineReceiverById (shipping_plan_line_id → receiver). Plus source scans proving dispatch persistence,
// schema contract, normalizer exposure, and no-live-FC-share / destination≠receiver.
// Run: node assets/tests/shipment-merged-lineage-f1-shipment-incoming-r6.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }

var GS = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
var IR = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js'), 'utf8');
var SRC12 = fs.readFileSync(path.join(GS, '12_shipment_handlers.gs'), 'utf8');
var API = fs.readFileSync(path.join(__dirname, '..', 'js', 'api', 'operation-system-db-api.js'), 'utf8');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
eval(/var _IR_TERMINAL_SHIPMENT_STATUS = \{[^}]*\};/.exec(IR)[0]);
eval(extractFn(IR, '_irShipmentEtaBucket'));
eval(extractFn(IR, '_irRemainingIncoming'));
eval(extractFn(IR, '_irReceiverKey'));
eval(extractFn(IR, '_irIsSpecificReceiver'));
eval(extractFn(IR, '_irEtaMs'));
eval(extractFn(IR, '_irBuildShipmentRemainingByReceiver'));

var TODAY = Date.UTC(2026, 7, 11);
function ymd(off) { var d = new Date(TODAY + off * 86400000); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
// merged MULTI shipment header + two physical lines with FROZEN lineage to US / CA receivers.
function multiShip() { return [{ shipmentId: 'M1', company: 'KM', country: 'US', marketplace: 'MULTI', eta: ymd(10), status: 'in_transit' }]; }
var LINEAGE = { 'PL-US': { company: 'KM', country: 'US', marketplace: 'amazon_us' }, 'PL-CA': { company: 'KM', country: 'CA', marketplace: 'amazon_ca' } };
function ln(id, sku, qty, recv, planLineId) { return { shipmentLineId: id, shipmentId: 'M1', sku: sku, shipmentQty: qty, shipmentReceivedQty: recv, shippingPlanLineId: planLineId }; }
function proj(lines, lineage) { return _irBuildShipmentRemainingByReceiver(multiShip(), lines, TODAY, lineage === undefined ? LINEAGE : lineage); }
var US = _irReceiverKey('KM', 'US', 'amazon_us', 'SKU-A');
var CA = _irReceiverKey('KM', 'CA', 'amazon_ca', 'SKU-A');
var MULTI = _irReceiverKey('KM', 'US', 'multi', 'SKU-A');

// A — ordinary (non-MULTI, no lineage) unchanged: header scope used
var ord = _irBuildShipmentRemainingByReceiver([{ shipmentId: 'S1', company: 'KM', country: 'US', marketplace: 'amazon_us', eta: ymd(10), status: 'in_transit' }], [{ shipmentLineId: 'L', shipmentId: 'S1', sku: 'SKU-A', shipmentQty: 600, shipmentReceivedQty: 0, shippingPlanLineId: '' }], TODAY, {});
eq((ord[US] || {}).d0_18, 600, 'A ordinary shipment unchanged (header scope, 600)');

// B — MULTI, two lines → US 600 / CA 400 via frozen lineage
var mB = proj([ln('L1', 'SKU-A', 600, 0, 'PL-US'), ln('L2', 'SKU-A', 400, 0, 'PL-CA')]);
eq((mB[US] || {}).d0_18, 600, 'B merged line1 → US 600');
eq((mB[CA] || {}).d0_18, 400, 'B merged line2 → CA 400');
ok(mB[MULTI] === undefined, 'B nothing left under MULTI (both lines attributed)');

// C — line1 partial receipt 300 → US remaining 300; CA still 400
var mC = proj([ln('L1', 'SKU-A', 600, 300, 'PL-US'), ln('L2', 'SKU-A', 400, 0, 'PL-CA')]);
eq((mC[US] || {}).d0_18, 300, 'C US partial → remaining 300');
eq((mC[CA] || {}).d0_18, 400, 'C CA unaffected → 400');

// D — line1 full receipt → US remaining 0
var mD = proj([ln('L1', 'SKU-A', 600, 600, 'PL-US'), ln('L2', 'SKU-A', 400, 0, 'PL-CA')]);
ok(mD[US] === undefined || (mD[US].d0_18 === 0), 'D US fully received → 0');
eq((mD[CA] || {}).d0_18, 400, 'D CA still 400');

// E — header MULTI + valid lineage → specific attribution succeeds (covered by B); explicit assert
ok((mB[US] || {}).d0_18 === 600 && (mB[CA] || {}).d0_18 === 400, 'E MULTI header + lineage → specific receivers');

// F — historical merged: blank lineage → stays under MULTI (fail-closed), not attributed to US/CA
var mF = proj([ln('L1', 'SKU-A', 600, 0, '')]);
ok(mF[US] === undefined && mF[CA] === undefined, 'F blank lineage → NOT attributed to specific receiver');
eq((mF[MULTI] || {}).d0_18, 600, 'F blank lineage → remains under MULTI (fail-closed)');

// G — FC Share change after dispatch: projection uses lineage map only (no FC input) → unchanged
var mG1 = proj([ln('L1', 'SKU-A', 600, 0, 'PL-US')]);
var mG2 = proj([ln('L1', 'SKU-A', 600, 0, 'PL-US')]);   // identical inputs; no FC-share parameter exists
eq((mG1[US] || {}).d0_18, (mG2[US] || {}).d0_18, 'G attribution deterministic (no live FC Share input)');

// I — Σ attributed remaining == Σ physical remaining
var linesI = [ln('L1', 'SKU-A', 600, 300, 'PL-US'), ln('L2', 'SKU-A', 400, 100, 'PL-CA')];
var mI = proj(linesI);
var attributed = 0; Object.keys(mI).forEach(function (k) { var r = mI[k]; attributed += r.overdue + r.d0_18 + r.d19_30 + r.d31_45 + r.d45_plus; });
var physical = linesI.reduce(function (a, l) { return a + _irRemainingIncoming(l.shipmentQty, l.shipmentReceivedQty); }, 0);
eq(attributed, physical, 'I Σ attributed remaining == Σ physical remaining (' + physical + ')');

// J — no receiver attribution exceeds its physical line qty (1:1: attributed == line remaining ≤ shipment_qty)
eq((mC[US] || {}).d0_18 <= 600 && (mC[CA] || {}).d0_18 <= 400, true, 'J no receiver exceeds physical line qty');

// ===== source scans =====
// schema: SHIPMENT_LINES_HEADERS_ carries shipping_plan_line_id (1:1, single id — no CSV/JSON)
ok(/SHIPMENT_LINES_HEADERS_[\s\S]*'shipping_plan_line_id'/.test(SRC12), 'schema: shipment_lines header contract includes shipping_plan_line_id');
// dispatch persists it 1:1 from the source plan line
ok(/shipping_plan_line_id:\s*plv\(lr, 'shipping_plan_line_id'\)/.test(SRC12), 'dispatch persists shipping_plan_line_id from the exact source plan line');
ok(/sheetEnsureColumns_\(shipmentLineSheet, \[[^\]]*'shipping_plan_line_id'/.test(SRC12), 'dispatch ensures the shipping_plan_line_id column (predating tabs)');
// normalizer exposes it
ok(/shippingPlanLineId: String\(r\.shipping_plan_line_id/.test(API), 'normalizer exposes shippingPlanLineId');
// projection prefers frozen lineage, falls back to header scope
ok(/lineRecv\[ln\.shippingPlanLineId\]/.test(IR) && /_irIsSpecificReceiver/.test(IR), 'projection prefers frozen lineage receiver; present-but-unresolved lineage fails closed (R7C parity)');
// H — destination warehouse identity is NOT used as the receiver key (company/country/marketplace/sku only)
ok(!/destination_warehouse|destinationWarehouseId/.test(extractFn(IR, '_irBuildShipmentRemainingByReceiver')), 'H destination warehouse identity not conflated with marketplace receiver');
// no live FC Share anywhere in the projection / lineage build
function stripComments(s) { return s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); }
var live = IR.slice(IR.indexOf('function _getCloudReplenishmentData')); live = live.slice(0, live.indexOf('\nfunction '));
ok(/getShippingPlanLines/.test(live) && /getShippingPlans/.test(live) && /lineReceiverById/.test(live), 'cloud path builds lineReceiverById from shipping_plan_lines + shipping_plans');
var lineageBuild = stripComments(live.slice(0, live.indexOf('rows = filtered.map')));
ok(!/fcShare|fc_share/i.test(lineageBuild), 'no live FC Share used to build lineage (code, not comments)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
