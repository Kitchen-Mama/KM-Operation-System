// Kitchen Mama Operation System — F1-4B-FM5-R1 Order Planning TOTAL AUTHORITY (frozen) + persistence audit.
// Run: node assets/tests/recommendation-total-authority-f1-4b-fm5r1.test.js
// -----------------------------------------------------------------------------
// FREEZES the Order Planning actionable total: actionableGapQty = max(0, Σ RAW gap over T1+T2+T3), then CARTONIZED
// ONCE via the canonical KMCALC owner (calculateSuggestedOrderQty). T4 is visibility-only (forwardVisibility),
// NEVER in the total. The total is NEVER Σ of the per-tier carton-rounded suggested (that double-rounds). Per-tier
// values are preserved verbatim. Inventory recommendation is unchanged. Manual (page) and automatic (47.gs) share
// the ONE KMREC owner and the ONE UPC authority (sku_details) → equivalent DTOs. No gap recalc, no downstream
// write, no schema mutation (units_per_carton is NOT persisted to order_planning_gap). Persistence decision table
// does not exist → the round reports RECOMMENDATION_PERSISTENCE_SCHEMA_NOT_FROZEN (proposal only, nothing created).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

// The canonical cartonizer must be discoverable by KMREC's default resolution (bundle global KMCALC). Setting it on
// `global` mirrors how the bundle exposes `var KMCALC = __kmModules['supply-planning-calculations']`.
var KMCALC = require('../js/core/supply-planning-calculations.js');
global.KMCALC = KMCALC;
var KMREC = require('../js/core/supply-recommendation.js');
var KMREC_SRC = read('js/core/supply-recommendation.js');
var KMREC_CODE = KMREC_SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
var F47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var F47CODE = F47.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
var F43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var RO = read('js/pages/request-order.js');
var INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

function opRow(o) {
  return Object.assign({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R',
    calculation_status: 'READY', calculation_month: '2026-08',
    t1_month: '2026-09', t1_gap_qty: 0, t1_suggested_qty: 0, t2_month: '2026-10', t2_gap_qty: 0, t2_suggested_qty: 0,
    t3_month: '2026-11', t3_gap_qty: 0, t3_suggested_qty: 0, t4_month: '2026-12', t4_gap_qty: 0, t4_suggested_qty: 0,
    note: '', calculated_at: '2026-08-10 03:30:00' }, o || {});
}
function invRow(o) {
  return Object.assign({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R',
    calculation_status: 'READY', calculation_date: '2026-08-10',
    d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 0, d30_suggested_qty: 0,
    d45_gap_qty: 0, d45_suggested_qty: 0, d90_gap_qty: 0, d90_suggested_qty: 0,
    note: '', calculated_at: '2026-08-10 13:30:00' }, o || {});
}
var gen = function (row, opts) { return KMREC.generateOrderPlanningRecommendation(row, opts); };

section('§4/§11B — double-rounding is FORBIDDEN (raw gap sum cartonized ONCE, not Σ of per-tier cartons)');
// Per-tier stored suggested are each already cartonized: T1 gap10→40, T2 gap10→40. Σ = 80 (WRONG). Canonical = 40.
var B = gen(opRow({ t1_gap_qty: 10, t1_suggested_qty: 40, t2_gap_qty: 10, t2_suggested_qty: 40, t3_gap_qty: 0, t3_suggested_qty: 0 }), { now: 'T', unitsPerCarton: 40 });
eq([B.status, B.actionableGapQty, B.totalRecommendedQty], ['READY', 20, 40], 'B raw 10+10+0=20 → cartonize once (UPC40) = 40');
ok(B.totalRecommendedQty !== 80, 'B the total is NOT 40+40=80 (forbidden double-rounding of per-tier cartons)');
eq(B.totalAuthority, 'SUM_T1_T3_RAW_GAP_CARTONIZE_ONCE', 'B total authority frozen token');

section('§4/§11C — larger multi-tier case');
var C = gen(opRow({ t1_gap_qty: 50, t1_suggested_qty: 80, t2_gap_qty: 30, t2_suggested_qty: 40, t3_gap_qty: 20, t3_suggested_qty: 40 }), { now: 'T', unitsPerCarton: 40 });
eq([C.actionableGapQty, C.totalRecommendedQty], [100, 120], 'C raw 50+30+20=100 → cartonize once (UPC40) = 120 (NOT 80+40+40=160)');
ok(C.totalRecommendedQty !== 160, 'C total is not the Σ of per-tier cartonized suggested');

section('§5/§11D — T4-only shortage is visibility-only (actionable total = 0, NO_ACTION)');
var D = gen(opRow({ t4_gap_qty: 500, t4_suggested_qty: 520 }), { now: 'T', unitsPerCarton: 40 });
eq([D.status, D.actionableGapQty, D.totalRecommendedQty], ['NO_ACTION', 0, 0], 'D T1–T3 zero, T4=500 → actionable 0, total 0, NO_ACTION (never auto-order 500 now)');
eq([D.forwardVisibility.t4GapQty, D.forwardVisibility.t4SuggestedQty, D.forwardVisibility.t4Month], [500, 520, '2026-12'], 'D T4 remains visible/traceable in forwardVisibility');

section('§11E — all actionable tiers zero → NO_ACTION');
var E = gen(opRow({}), { now: 'T', unitsPerCarton: 40 });
eq([E.status, E.actionableGapQty, E.totalRecommendedQty], ['NO_ACTION', 0, 0], 'E T1–T3 all zero → NO_ACTION / total 0');

section('§11F — BLOCKED materialized row → no actionable qty, no total');
var F = gen(opRow({ calculation_status: 'BLOCKED', note: 'TIER_VALUE_MISSING:T2', t1_gap_qty: 99, t1_suggested_qty: 99 }), { now: 'T', unitsPerCarton: 40 });
eq([F.status, F.actionableGapQty, F.totalRecommendedQty], ['BLOCKED', null, null], 'F BLOCKED → actionableGapQty null, total null (no fabricated quantity)');

section('§2/§11G — per-tier values preserved VERBATIM; T4 excluded from the total');
var G = gen(opRow({ t1_gap_qty: 10, t1_suggested_qty: 40, t2_gap_qty: 10, t2_suggested_qty: 40, t3_gap_qty: 0, t3_suggested_qty: 0, t4_gap_qty: 700, t4_suggested_qty: 720 }), { now: 'T', unitsPerCarton: 40 });
eq(G.tiers.map(function (t) { return t.suggestedQty; }), [40, 40, 0, 720], 'G per-tier suggested unchanged (incl. T4=720)');
eq(G.tiers.map(function (t) { return t.gapQty; }), [10, 10, 0, 700], 'G per-tier gap unchanged');
eq([G.actionableTierCount, G.actionableGapQty, G.totalRecommendedQty], [3, 20, 40], 'G actionable tiers = 3; T4 700 excluded from the total (still 40)');

section('§3/§9 — updated Order Planning DTO shape');
['tiers', 'actionableTierCount', 'actionableGapQty', 'totalRecommendedQty', 'totalAuthority', 'forwardVisibility', 'primaryMonth'].forEach(function (k) { ok(k in G, 'DTO has ' + k); });
['t4Month', 't4GapQty', 't4SuggestedQty'].forEach(function (k) { ok(k in G.forwardVisibility, 'forwardVisibility has ' + k); });

section('units-per-carton absent → total null + reason (never a fabricated / single-rounded number)');
var U = gen(opRow({ t1_gap_qty: 10, t1_suggested_qty: 40, t2_gap_qty: 10, t2_suggested_qty: 40 }), { now: 'T' });   // no UPC
eq([U.status, U.actionableGapQty, U.totalRecommendedQty, U.totalUnavailableReason], ['READY', 20, null, 'UNITS_PER_CARTON_NOT_AVAILABLE'], 'no UPC → READY, actionableGapQty computed, total null + UNITS_PER_CARTON_NOT_AVAILABLE');
ok(U.totalAuthority === 'SUM_T1_T3_RAW_GAP_CARTONIZE_ONCE', 'authority is still the frozen rule even when total is null');

section('§6 cartonization owner — the canonical KMCALC (single owner), not reimplemented in KMREC');
ok(/resolveCartonizer_/.test(KMREC_CODE) && /calculateSuggestedOrderQty/.test(KMREC_CODE) && /supplyPlanningCalculations/.test(KMREC_CODE), 'KMREC delegates to KMCALC.calculateSuggestedOrderQty (bundle global or browser namespace)');
ok(!/Math\.ceil\([^)]*unitsPerCarton|need\s*\/\s*upc/.test(KMREC_CODE), 'KMREC does NOT reimplement carton math (no second formula owner)');
// The resolved cartonizer equals the canonical KMCALC formula ceil(need/upc)*upc.
eq(KMCALC.calculateSuggestedOrderQty({ netOrderNeed: 100, unitsPerCarton: 40 }), 120, 'KMCALC canonical: ceil(100/40)*40 = 120');

section('§11J — manual (page) == automatic (47.gs) for identical source rows + identical UPC authority');
var srcRow = opRow({ t1_gap_qty: 50, t1_suggested_qty: 80, t2_gap_qty: 30, t2_suggested_qty: 40, t3_gap_qty: 20, t3_suggested_qty: 40 });
var manual = KMREC.generateOrderPlanningRecommendation(srcRow, { now: 'FIXED', unitsPerCarton: 40 });
// automatic path enriches the row with units_per_carton from sku_details, then generateBatch (one owner).
var autoRow = Object.assign({}, srcRow, { units_per_carton: 40 });
var autoBatch = KMREC.generateBatch('ORDER_PLANNING', [autoRow], { now: 'FIXED' });
eq(autoBatch.recommendations[0], manual, 'J manual + automatic produce identical DTOs from identical source + UPC');
ok(/recGenUpcBySku_/.test(F47) && /units_per_carton = u/.test(F47), 'J-auto 47.gs joins sku_details UPC onto OP rows (same authority as the manual page)');

section('§11K — staleness detectable via source fingerprint');
ok(KMREC.isStale(manual, opRow({ calculated_at: '2099-01-01 00:00:00' })) === true, 'K newer gap calculated_at → stale');
ok(KMREC.isStale(manual, opRow({ calculated_at: '2026-08-10 03:30:00' })) === false, 'K same calculated_at → not stale');

section('§11A/§11I — Inventory recommendation UNCHANGED (no OP-only fields leak in)');
var inv = KMREC.generateInventoryRecommendation(invRow({ d18_gap_qty: 500, d18_suggested_qty: 520 }), { now: 'T' });
eq([inv.status, inv.primaryWindow, inv.suggestedQty], ['READY', 'D18', 520], 'A/I inventory earliest-window unchanged');
ok(!('actionableGapQty' in inv) && !('forwardVisibility' in inv) && !('actionableTierCount' in inv), 'A/I inventory DTO carries NO order-planning total fields');

section('§11L/§11M/§11N — no downstream write, no gap recalc, no schema mutation');
ok(!/appendRow|setValues|setValue\(|insertSheet|createSheet|purchase_order|createShipment|shipping_plan|factory_stock|overseas_inventory/i.test(KMREC_CODE + F47CODE), 'L no PO/shipment/inventory/sheet write in KMREC or 47.gs');
ok(!/KMTPP|KMMSA|KMALLOC|projectHorizons|projectTimePhasedSupply/.test(KMREC_CODE), 'M KMREC runs no gap/demand/allocation engine');
// N: order_planning_gap schema is untouched — units_per_carton is NOT a stored column; 47 stamps it in memory only.
ok(!/units_per_carton/.test(F43.match(/OP_GAP_HEADERS_ = \[[\s\S]*?\];/)[0]), 'N order_planning_gap headers do NOT include units_per_carton (no schema change)');
ok(/rows\[i\]\.units_per_carton = u/.test(F47) && !/prodRequireSheet_\(ss, OP_GAP_TABLE_[\s\S]{0,80}units_per_carton/.test(F47), 'N 47.gs stamps units_per_carton on the in-memory row only (never writes it back)');

section('§7 — manual OP AI Plan surfaces the Actionable Total + basis; Order Qty untouched');
var roHandler = RO.slice(RO.indexOf('function handleRequestOrderAiPlan'), RO.indexOf('window.handleRequestOrderAiPlan'));
ok(/unitsPerCarton: upcBySku\[String\(sku\)\]/.test(roHandler), 'AI Plan passes the SKU units-per-carton (sku_details/boxSize) into KMREC');
ok(/generateOrderPlanningRecommendation/.test(roHandler) && !/order_qty|orderQty\s*=|_roAllocEdit/.test(roHandler), 'AI Plan generates via KMREC and NEVER writes the manual Order Qty');
var actionFn = RO.slice(RO.indexOf('function _roRecoActionHtml'), RO.indexOf('function handleRequestOrderAiPlan'));
ok(/Actionable Total/.test(actionFn) && /totalRecommendedQty/.test(actionFn), 'AI Plan display renders the Actionable Total from dto.totalRecommendedQty');
ok(/T1–T3 raw gaps, cartonized once/.test(actionFn) && /visibility/.test(actionFn), 'AI Plan display states the basis (raw T1–T3, cartonized once) + T4 visibility');
// Browser must load KMCALC (the cartonizer) before KMREC so the manual total resolves (server uses the bundle global).
ok(/assets\/js\/core\/supply-planning-calculations\.js/.test(INDEX) &&
  INDEX.indexOf('assets/js/core/supply-planning-calculations.js') < INDEX.indexOf('assets/js/core/supply-recommendation.js'),
  'index.html loads KMCALC before KMREC (browser cartonizer available for the actionable total)');

section('§6/§17/§18 — recommendation DECISION persistence authority does NOT exist (proposal only, nothing created)');
// The only recommendation-domain table is the run journal (recommendation_calculation_runs); the draft tables are
// downstream execution/allocation. There is NO recommendation decision table (recommendation_id/decision_status/...).
var RPR = read('specs/active/apps-script/23_recommendation_persistence_repository.gs');
ok(/recommendation_calculation_runs/.test(RPR), 'run journal exists (recommendation_calculation_runs) — metadata, not a decision table');
ok(!/recommendation_decisions|recommendation_drafts\b/.test(RPR + F47), 'no recommendation DECISION table is created this round (RECOMMENDATION_PERSISTENCE_SCHEMA_NOT_FROZEN — proposal only)');
ok(/shipping_allocation_drafts/.test(RPR) && /request_order_allocation_drafts/.test(RPR), 'existing draft tables remain downstream execution/allocation (not reused as recommendation storage)');

console.log('\n----------------------------------------');
console.log('ORDER PLANNING TOTAL AUTHORITY (F1-4B-FM5-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
