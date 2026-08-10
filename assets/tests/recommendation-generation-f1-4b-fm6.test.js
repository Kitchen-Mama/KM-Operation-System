// Kitchen Mama Operation System — F1-4B-FM6 Recommendation Generation from materialized gaps (KMREC).
// Run: node assets/tests/recommendation-generation-f1-4b-fm6.test.js
// -----------------------------------------------------------------------------
// Phase-1 SUPPLY_RECOMMENDATION reads the ALREADY-MATERIALIZED gap rows (inventory_replenishment_gap /
// order_planning_gap — the single calculation authority) and produces decision DTOs. It recalculates NO gap,
// owns NO formula, and writes NO PO/shipment/execution/inventory/forecast. Inventory picks the EARLIEST non-zero
// shortage window; Order Planning surfaces stored T1–T4 verbatim and HALTS the auto-total (independent per-tier
// carton rounding). Manual AI Plan + the automatic backend entry point share the ONE KMREC owner. Pure-module
// unit tests + source-scan wiring (no live DOM/network).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var KMREC = require('../js/core/supply-recommendation.js');
var KMREC_SRC = read('js/core/supply-recommendation.js');
var F47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var INV = read('js/pages/inventory-replenishment.js');
var RO = read('js/pages/request-order.js');
var INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
var BUILD = read('tools/build-apps-script-bundle.js');
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

function invRow(o) {
  return Object.assign({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R',
    calculation_status: 'READY', calculation_date: '2026-08-10',
    d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 0, d30_suggested_qty: 0,
    d45_gap_qty: 0, d45_suggested_qty: 0, d90_gap_qty: 0, d90_suggested_qty: 0,
    note: '', calculated_at: '2026-08-10 13:30:00' }, o || {});
}
function opRow(o) {
  return Object.assign({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R',
    calculation_status: 'READY', calculation_month: '2026-08',
    t1_month: '2026-09', t1_gap_qty: 0, t1_suggested_qty: 0, t2_month: '2026-10', t2_gap_qty: 0, t2_suggested_qty: 0,
    t3_month: '2026-11', t3_gap_qty: 0, t3_suggested_qty: 0, t4_month: '2026-12', t4_gap_qty: 0, t4_suggested_qty: 0,
    note: '', calculated_at: '2026-08-10 03:30:00' }, o || {});
}

section('INVENTORY — earliest non-zero shortage window (D18→D30→D45→D90), never the largest');
var i1 = KMREC.generateInventoryRecommendation(invRow({ d18_gap_qty: 500, d18_suggested_qty: 520, d90_gap_qty: 9000, d90_suggested_qty: 9200 }), { now: 'T' });
eq([i1.status, i1.primaryWindow, i1.suggestedQty], ['READY', 'D18', 520], 'I1 READY + D18 shortage → choose D18');
var i2 = KMREC.generateInventoryRecommendation(invRow({ d30_gap_qty: 300, d30_suggested_qty: 320, d90_suggested_qty: 9999 }), { now: 'T' });
eq([i2.status, i2.primaryWindow, i2.suggestedQty], ['READY', 'D30', 320], 'I2 D18=0, D30 shortage → choose D30');
var i3 = KMREC.generateInventoryRecommendation(invRow({ d45_gap_qty: 2840, d45_suggested_qty: 2840, d90_gap_qty: 10480, d90_suggested_qty: 10480 }), { now: 'T' });
eq([i3.status, i3.primaryWindow, i3.suggestedQty], ['READY', 'D45', 2840], 'I3 D18/D30=0, D45 shortage → 2840/D45 (NOT the larger D90=10480)');
var i4 = KMREC.generateInventoryRecommendation(invRow({ d90_gap_qty: 400, d90_suggested_qty: 440 }), { now: 'T' });
eq([i4.status, i4.primaryWindow, i4.suggestedQty], ['READY', 'D90', 440], 'I4 only D90 shortage → choose D90');
var i5 = KMREC.generateInventoryRecommendation(invRow({}), { now: 'T' });
eq([i5.status, i5.primaryWindow, i5.suggestedQty], ['NO_ACTION', null, null], 'I5 all suggested zero → NO_ACTION (no action quantity > 0)');
var i6 = KMREC.generateInventoryRecommendation(invRow({ calculation_status: 'BLOCKED', note: 'SALES_BASIS_UNAVAILABLE', d18_suggested_qty: 999 }), { now: 'T' });
eq([i6.status, i6.suggestedQty, i6.primaryWindow], ['BLOCKED', null, null], 'I6 BLOCKED → no fabricated quantity');
ok(Array.isArray(i6.windows) && i6.windows.length === 4, 'I6b BLOCKED still retains all four windows in the source trace');

section('INVENTORY — determinism / lineage / staleness / valid-zero');
var KMREC_CODE = KMREC_SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
// F1-4B-FM5-R1: KMREC recalculates NO gap (no gap/demand/allocation engine). It MAY call the canonical KMCALC
// cartonizer ONCE for the frozen actionable total — that is not a gap recalculation, it is the single carton owner.
ok(!/KMHP|KMTPP|KMALLOC|KMMSA|projectHorizons|projectTimePhasedSupply/.test(KMREC_CODE), 'I7 KMREC CODE runs NO gap/demand/allocation engine (reads stored gaps only)');
eq(i3.sourceCalculatedAt, '2026-08-10 13:30:00', 'I8 sourceCalculatedAt retained from the gap row');
var i3newer = invRow({ d45_suggested_qty: 2840, calculated_at: '2026-08-11 13:30:00' });
ok(KMREC.isStale(i3, i3newer) === true, 'I9 a newer gap (advanced calculated_at) invalidates the old recommendation');
ok(KMREC.isStale(i3, invRow({ calculated_at: '2026-08-10 13:30:00' })) === false, 'I9b same calculated_at → not stale');
var iz = KMREC.generateInventoryRecommendation(invRow({ d18_gap_qty: '', d18_suggested_qty: '' }), { now: 'T' });
eq([iz.windows[0].suggestedQty, iz.windows[1].suggestedQty], [null, 0], 'S9 valid ZERO (0) is a real value; MISSING ("") is null — never conflated');
ok(/startInventoryReplenishmentGapJob/.test(INV) === true && /generateInventoryRecommendation\(r, \{ now: now \}\)/.test(INV) && !/recalculate|workspace\.get/.test(INV.slice(INV.indexOf('function handleReplenAiPlan'), INV.indexOf('window.handleReplenAiPlan'))), 'I10 manual AI Plan generates from _irMatState materialized rows via KMREC — no gap recalc / workspace call in the handler');

section('ORDER PLANNING — stored T1–T4 verbatim; total HALTED; BLOCKED safe');
var o1 = KMREC.generateOrderPlanningRecommendation(opRow({ t1_suggested_qty: 40, t2_suggested_qty: 0, t3_suggested_qty: 120, t4_suggested_qty: 80, t1_gap_qty: 33 }), { now: 'T' });
eq(o1.tiers.map(function (t) { return t.suggestedQty; }), [40, 0, 120, 80], 'O1 T1–T4 suggested read verbatim into tiers[]');
eq(o1.tiers.map(function (t) { return t.month; }), ['2026-09', '2026-10', '2026-11', '2026-12'], 'O1b tier months preserved');
var o2 = KMREC.generateOrderPlanningRecommendation(opRow({ calculation_status: 'BLOCKED', t1_suggested_qty: 999 }), { now: 'T' });
eq([o2.status, o2.suggestedQty, o2.totalRecommendedQty], ['BLOCKED', null, null], 'O2 BLOCKED → no quantity, no total');
// F1-4B-FM5-R1: total authority is now FROZEN (SUM_T1_T3_RAW_GAP_CARTONIZE_ONCE). No UPC supplied here → total
// stays null (never a fabricated / Σ-of-cartonized number); the frozen authority token is present regardless.
eq([o1.totalRecommendedQty, o1.totalAuthority], [null, 'SUM_T1_T3_RAW_GAP_CARTONIZE_ONCE'], 'O6/O7 total NOT auto-summed; authority frozen; null without units-per-carton');
ok(Array.isArray(o1.tiers) && o1.tiers.length === 4, 'O8 tiers preserved in the DTO');
var oNo = KMREC.generateOrderPlanningRecommendation(opRow({}), { now: 'T' });
eq(oNo.status, 'NO_ACTION', 'O-none all tier suggested 0 → NO_ACTION');
ok(!/KMTPP|KMMSA|KMALLOC/.test(KMREC_CODE), 'O4/O5 KMREC CODE does NOT recalculate the gap or re-run allocation (no KMTPP/KMMSA/KMALLOC)');
var roHandler = RO.slice(RO.indexOf('function handleRequestOrderAiPlan'), RO.indexOf('window.handleRequestOrderAiPlan'));
ok(/generateOrderPlanningRecommendation/.test(roHandler) && !/order_qty|orderQty\s*=|_roAllocEdit/.test(roHandler), 'O3 OP AI Plan generates via KMREC and NEVER writes/normalizes the manual Order Qty');

section('SHARED — one owner (manual + auto), no downstream write, deterministic, lineage');
ok(/KMREC\.generateBatch\(p, rows/.test(F47) && /window\.KMREC\.generateInventoryRecommendation/.test(INV) && /window\.KMREC\.generateOrderPlanningRecommendation/.test(RO), 'S1 manual (both pages) + automatic (47.gs) call the SAME KMREC owner');
ok(/function runInventoryRecommendationGeneration\(\)/.test(F47) && /function runOrderPlanningRecommendationGeneration\(\)/.test(F47) && /function runRecommendationGeneration\(product\)/.test(F47), 'S1b automatic callable entry points exist and delegate to the shared generator');
var F47CODE = F47.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/purchase_order|createPurchaseOrder|po_lines/i.test(KMREC_CODE + F47CODE), 'S2 no Purchase Order write');
ok(!/shipment|createShipment|shipping_plan/i.test(KMREC_CODE + F47CODE), 'S3 no shipment write');
ok(!/appendRow|setValues|setValue\(|insertSheet|createSheet|adjustInventory|overseas_inventory|factory_stock/i.test(KMREC_CODE + F47CODE), 'S4/S6 no inventory/sheet/schema write — 47 READS gaps only (gapReadObjects_), KMREC touches no sheet');
ok(/gapReadObjects_\(ss, table\)/.test(F47), 'S6b the automatic path READS the materialized gap table (no recalculation, no whole-DB load)');
ok(!/forecast\w*\s*=|importFcRegular|upsertFc|fc_regular/i.test(KMREC_CODE + F47CODE), 'S5 no forecast write');
var d1 = KMREC.generateOrderPlanningRecommendation(opRow({ t1_suggested_qty: 40, t3_suggested_qty: 120 }), { now: 'FIXED' });
var d2 = KMREC.generateOrderPlanningRecommendation(opRow({ t1_suggested_qty: 40, t3_suggested_qty: 120 }), { now: 'FIXED' });
eq(d1, d2, 'S7 deterministic — identical input (+ same injected now) → identical recommendation');
ok(i3.recommendationId && i3.sourceType === 'INVENTORY_GAP' && i3.company === 'KM' && i3.sku === 'CO1100-R' && i3.sourceFingerprint, 'S8 source lineage preserved (id + sourceType + business key + fingerprint)');
ok(KMREC.isStale(o1, opRow({ calculated_at: '2099-01-01 00:00:00' })) === true, 'S10 stale recommendation detectable (fingerprint mismatch on a newer gap)');

section('bundle / wiring — KMREC bundled for the backend + loaded in the browser');
ok(/supply-recommendation/.test(BUILD) && /\['KMREC', 'supply-recommendation'\]/.test(BUILD), 'B1 KMREC registered in the bundle MODULE_ORDER + GLOBALS');
ok(/kmrec-fm6r1-1/.test(BUNDLE) && /supply-recommendation \(verbatim/.test(BUNDLE), 'B2 the rebuilt bundle contains the KMREC module (backend automatic path can call it)');
ok(/assets\/js\/core\/supply-recommendation\.js/.test(INDEX), 'B3 KMREC loaded in index.html (browser manual AI Plan)');

section('DTO shape (§9) — compact canonical decision output');
['recommendationId', 'product', 'company', 'country', 'marketplace', 'sku', 'sourceType', 'sourceCalculatedAt', 'status', 'reason', 'generatedAt'].forEach(function (k) { ok(k in i3, 'DTO has ' + k); });
ok('windows' in i3 && 'primaryWindow' in i3, 'DTO(inventory) carries windows[] + primaryWindow');
ok('tiers' in o1 && 'primaryMonth' in o1 && 'totalAuthority' in o1, 'DTO(order-planning) carries tiers[] + primaryMonth + totalAuthority');

console.log('\n----------------------------------------');
console.log('RECOMMENDATION GENERATION (F1-4B-FM6): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
