// Kitchen Mama Operation System — F1-4B-FM6-R2 Recommendation → Execution handoff (KMREX).
// Run: node assets/tests/supply-execution-handoff-f1-4b-fm6r2.test.js
// -----------------------------------------------------------------------------
// KMREX is the ONE canonical execution-DRAFT owner: KMREC recommendation DTO + ALREADY-RESOLVED eligible source
// availabilities → execution-draft DTO. FROZEN Inventory fill (§1): Overseas → Factory → uncovered, with strict
// conservation (overseas + factory + uncovered = recommendedQty; Σ lines = allocatedQty; each ≤ its availability).
// A stored 0 is a real 0 (no line); a MISSING (null) availability is surfaced in unresolvedSources, never a "0"
// line. Order Planning (§2) is a PASSTHROUGH of KMREC's T1–T4 + frozen total (no second allocator; T4 forward-only).
// Pure + deterministic (identical input → identical DTO); no persistence, no gap formula, no PO/shipment write.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
global.KMCALC = require('../js/core/supply-planning-calculations.js');   // KMREC OP total delegates to the canonical cartonizer
var KMREC = require('../js/core/supply-recommendation.js');
var KMREX = require('../js/core/supply-execution-handoff.js');
var KMREX_SRC = read('js/core/supply-execution-handoff.js');
var KMREX_CODE = KMREX_SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
var BUILD = read('tools/build-apps-script-bundle.js');
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

function invRow(o) {
  return Object.assign({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'READY',
    calculation_date: '2026-08-10', d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 0, d30_suggested_qty: 0,
    d45_gap_qty: 0, d45_suggested_qty: 0, d90_gap_qty: 0, d90_suggested_qty: 0, calculated_at: '2026-08-10 13:30:00' }, o || {});
}
function invRec(o) { return KMREC.generateInventoryRecommendation(invRow(o), { now: 'T' }); }
function alloc(rec, avail) { return KMREX.allocateInventoryExecution(rec, avail, { now: 'T' }); }
// conservation assertion for an ACTION/PARTIAL result
function conserves(d) {
  var sumLines = (d.executionLines || []).reduce(function (s, l) { return s + l.allocatedQty; }, 0);
  var eachOk = (d.executionLines || []).every(function (l) { return l.sourceAvailableQty == null || l.allocatedQty <= l.sourceAvailableQty; });
  return sumLines === d.allocatedQty && (d.allocatedQty + d.uncoveredQty) === d.recommendedQty && eachOk &&
    d.allocatedQty >= 0 && d.uncoveredQty >= 0;
}

section('§1/§11 — CO1100-R canonical trace: Overseas → Factory → uncovered (numbers DERIVED, not hard-coded)');
var recCO = invRec({ d90_gap_qty: 4180, d90_suggested_qty: 4200 });
eq([recCO.status, recCO.primaryWindow, recCO.suggestedQty], ['READY', 'D90', 4200], 'pre KMREC recommendedQty=4200 @ D90');
var co = alloc(recCO, { overseasAvailable: 1100, factoryAvailable: 3000, overseasWarehouseId: 'OV-1', factoryWarehouseId: 'FC-1', destinationId: 'AMZ-US' });
eq(co.recommendedQty, recCO.suggestedQty, 'CO recommendedQty carried from KMREC (not fabricated)');
eq([co.executionLines[0].sourceType, co.executionLines[0].allocatedQty], ['OVERSEAS_THREE_PL', 1100], 'I10 Overseas source filled first = min(4200,1100)=1100');
eq([co.executionLines[1].sourceType, co.executionLines[1].allocatedQty], ['FACTORY', 3000], 'I10 Factory fills the remainder = min(3100,3000)=3000');
eq([co.allocatedQty, co.uncoveredQty, co.status], [4100, 100, 'PARTIAL'], 'I11 allocated 4100, uncovered 100 (truthful), status PARTIAL');
ok(conserves(co), '§11 conservation: 1100+3000+100=4200; Σlines=4100; each ≤ availability');

section('§1 — fill-order boundaries');
var r1000 = invRec({ d90_gap_qty: 900, d90_suggested_qty: 1000 });
var i9 = alloc(r1000, { overseasAvailable: 5000, factoryAvailable: 9999 });
eq([i9.executionLines.length, i9.executionLines[0].sourceType, i9.executionLines[0].allocatedQty, i9.uncoveredQty, i9.status], [1, 'OVERSEAS_THREE_PL', 1000, 0, 'ACTION'], 'I9 Overseas fully covers → single Overseas line, Factory untouched, uncovered 0, ACTION');
ok(conserves(i9), 'I9 conserves');
var i11 = alloc(r1000, { overseasAvailable: 200, factoryAvailable: 300 });
eq([i11.allocatedQty, i11.uncoveredQty, i11.status], [500, 500, 'PARTIAL'], 'I11 Overseas+Factory insufficient → allocated 500, uncovered 500');
ok(conserves(i11), 'I11 conserves (200+300+500=1000)');
var i12 = alloc(invRec({ d90_gap_qty: 40, d90_suggested_qty: 40 }), { overseasAvailable: 40, factoryAvailable: 40 });
eq([i12.allocatedQty, i12.uncoveredQty, (i12.executionLines[1] || {}).allocatedQty], [40, 0, undefined], 'I12 no double-count: Overseas covers 40 → Factory line NOT emitted (physical pool never counted twice)');

section('§10 — NO_ACTION / BLOCKED never fabricate allocation');
var i5 = alloc(invRec({}), { overseasAvailable: 999, factoryAvailable: 999 });
eq([i5.status, i5.recommendedQty, i5.executionLines.length, i5.allocatedQty, i5.uncoveredQty], ['NO_ACTION', null, 0, 0, 0], 'I5 NO_ACTION → no positive execution lines');
var i6 = alloc(invRec({ calculation_status: 'BLOCKED', d90_suggested_qty: 4200 }), { overseasAvailable: 999, factoryAvailable: 999 });
eq([i6.status, i6.recommendedQty, i6.executionLines.length, i6.allocatedQty, i6.uncoveredQty], ['BLOCKED', null, 0, null, null], 'I6 BLOCKED → no execution draft quantity, no fabricated allocation');

section('§4 — a stored 0 is a real 0 (no line); a MISSING availability != zero (surfaced, never a "0" line)');
var z = alloc(r1000, { overseasAvailable: 0, factoryAvailable: 1000 });
eq([z.executionLines.length, z.executionLines[0].sourceType, z.allocatedQty, z.unresolvedSources.length], [1, 'FACTORY', 1000, 0], 'I13a Overseas known-0 → no Overseas line; Factory covers; nothing unresolved');
var m = alloc(r1000, { factoryAvailable: 1000 });   // overseasAvailable MISSING (undefined)
eq([m.unresolvedSources, m.executionLines.map(function (l) { return l.sourceType; })], [['OVERSEAS'], ['FACTORY']], 'I13b Overseas MISSING → unresolvedSources=[OVERSEAS], NO overseas "0 available" line fabricated');
ok(m.executionLines.every(function (l) { return l.sourceType !== 'OVERSEAS_THREE_PL'; }) && m.allocatedQty === 1000 && m.uncoveredQty === 0, 'I13c missing Overseas contributes 0 to allocation but is never a real zero-stock line');
var mAll = alloc(r1000, {});   // BOTH missing
eq([mAll.allocatedQty, mAll.uncoveredQty, mAll.unresolvedSources], [0, 1000, ['OVERSEAS', 'FACTORY']], 'I13d both sources unresolved → allocated 0, uncovered = R, both surfaced (never fabricated as 0-stock)');

section('§1 — Inventory gap is unchanged; Factory/Overseas participate ONLY in KMREX (never in the gap)');
ok(!/d18_gap|d30_gap|d45_gap|d90_gap|calculation_status\s*=|KMHP|KMTPP|KMCALC|KMALLOC|KMMSA/.test(KMREX_CODE.replace(/suggestedQty|gapQty/g, '')), 'I14 KMREX never recomputes a gap and invokes no gap/allocation engine (reads the KMREC recommendedQty only)');

section('§8/§B7 — deterministic (pure): identical input → identical execution draft (idempotent at the owner)');
eq(alloc(recCO, { overseasAvailable: 1100, factoryAvailable: 3000 }), alloc(recCO, { overseasAvailable: 1100, factoryAvailable: 3000 }), 'B7 identical (rec, availability) → byte-identical DTO (no RNG, no clock)');
ok(co.sourceFingerprint && co.sourceFingerprint === recCO.sourceFingerprint && co.sourceCalculatedAt === recCO.sourceCalculatedAt, 'B8 source lineage (fingerprint + calculated_at) carried into the execution draft → staleness detectable downstream');

section('§2 — Order Planning passthrough: T1–T4 retained, frozen total, T4 forward-only, NO second allocator');
var opRec = KMREC.generateOrderPlanningRecommendation({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'READY', calculation_month: '2026-08',
  t1_month: '2026-09', t1_gap_qty: 50, t1_suggested_qty: 80, t2_month: '2026-10', t2_gap_qty: 30, t2_suggested_qty: 40,
  t3_month: '2026-11', t3_gap_qty: 20, t3_suggested_qty: 40, t4_month: '2026-12', t4_gap_qty: 500, t4_suggested_qty: 520, calculated_at: '2026-08-10 03:30:00' }, { now: 'T', unitsPerCarton: 40 });
var opEx = KMREX.buildOrderPlanningExecution(opRec, { now: 'T' });
eq(opEx.tiers.map(function (t) { return t.tier + ':' + t.suggestedQty; }), ['T1:80', 'T2:40', 'T3:40', 'T4:520'], 'O1 T1–T4 retained verbatim from KMREC');
eq([opEx.totalRecommendedQty, opEx.totalAuthority], [120, 'SUM_T1_T3_RAW_GAP_CARTONIZE_ONCE'], 'O2 frozen actionable total (raw T1–T3 cartonized once) preserved');
eq(opEx.executionLines.map(function (l) { return l.tier; }), ['T1', 'T2', 'T3'], 'O3 execution draft lines = T1–T3 only; T4 excluded (forward visibility)');
eq([opEx.forwardVisibility.t4GapQty, opEx.forwardVisibility.t4SuggestedQty], [500, 520], 'O3b T4 retained as forward visibility only');
ok(!/order_qty|orderQty/i.test(KMREX_CODE), 'O4 KMREX never references/writes manual Order Qty');
ok(!/allocateShared|feasibleReallocation|gapOpBuildSupplyAllocation|KMMSA|KMALLOC/.test(KMREX_CODE), 'O7 KMREX contains NO second allocator (OP is a passthrough of the already-materialized tiers)');

section('§12/§13 — draft-only boundary + one shared owner; bundle + browser registration');
ok(!/purchase_order|createPurchaseOrder|createShipment|shipping_plan|appendRow|setValues|deductStock|forecast\w*\s*=/i.test(KMREX_CODE), 'B3/B4/B5/§12 KMREX writes NO PO / shipment / stock / forecast / sheet (draft generation only)');
ok(/supply-execution-handoff/.test(BUILD) && /\['KMREX', 'supply-execution-handoff'\]/.test(BUILD), 'bundle registers KMREX (MODULE_ORDER + GLOBALS) → automatic backend path can call the SAME owner');
ok(/kmrex-fm6r2-1/.test(BUNDLE), 'the rebuilt bundle contains the KMREX module (manual + automatic share ONE owner, §13)');
ok(/assets\/js\/core\/supply-execution-handoff\.js/.test(INDEX) && INDEX.indexOf('supply-execution-handoff.js') > INDEX.indexOf('supply-recommendation.js'), 'browser loads KMREX after KMREC');

console.log('\n----------------------------------------');
console.log('RECOMMENDATION → EXECUTION HANDOFF (F1-4B-FM6-R2): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
