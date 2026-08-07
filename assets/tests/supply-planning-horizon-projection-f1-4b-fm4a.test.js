// Kitchen Mama Operation System — Canonical Day-Horizon Projection (KMHP) — F1-4B-FM4a.
// Run: node assets/tests/supply-planning-horizon-projection-f1-4b-fm4a.test.js
// -----------------------------------------------------------------------------
// Proves the ONE canonical D18/D30/D45/D90 owner: daily regular-FC distribution (monthlyFC / real days-in-month,
// full precision), dated cumulative checkpoints = calculationDate + N days (deterministic, clockless), reusing the
// FROZEN KMTPP chronology (count-once carry-forward) + FROZEN KMCALC carton owner. Cross-month, late-incoming
// time-phasing, opening counted once, valid-zero, missing-source truthful, real month lengths (28/29/30/31),
// permutation invariance, multi-warehouse isolation, monthlyProjection non-regression, no clock. No live DB.

'use strict';
var KMHP = require('../js/core/supply-planning-horizon-projection.js');
var KMTPP = require('../js/core/supply-planning-time-phased-projection.js');
var KMCALC = require('../js/core/supply-planning-calculations.js');
var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function H(res, wc) { for (var i = 0; i < res.horizons.length; i++) if (res.horizons[i].windowCode === wc) return res.horizons[i]; return null; }
// FC map where every month distributes to an integer daily rate (clean assertions).
function fc(over) { var m = { '2026-08': 3100, '2026-09': 3000, '2026-10': 3100, '2026-11': 3000 }; if (over) for (var k in over) { if (over[k] === null) delete m[k]; else m[k] = over[k]; } return m; }
function run(over) {
  var base = { destination: { destinationType: 'MARKETPLACE' }, calculationDate: '2026-08-07', openingSupplyQty: 1000, regularFcByMonth: fc(), incomingEvents: [], unitsPerCarton: 40 };
  if (over) for (var k in over) base[k] = over[k];
  return KMHP.projectHorizons(base);
}

// =============================================================================
section('A. single-month D18 (entirely within Aug; 3100/31 = 100/day × 18 = 1800)');
var a = run({ openingSupplyQty: 5000 });
ok(a.ready === true && a.horizons.length === 4, 'A0 ready, 4 horizons D18/D30/D45/D90');
ok(H(a, 'D18').requiredByDate === '2026-08-25', 'A1 D18 requiredBy = calcDate + 18 = 2026-08-25');
ok(H(a, 'D18').demandQty === 1800, 'A2 D18 demand = 18 × (3100/31) = 1800 (daily distribution, real month length)');
ok(H(a, 'D18').gapQty === 0 && H(a, 'D18').remainingSupplyQty === 3200, 'A3 opening 5000 covers 1800 → gap 0, remaining 3200');

section('B/C/D. cross-month cumulative windows');
ok(H(run(), 'D30').requiredByDate === '2026-09-06' && H(run(), 'D30').demandQty === 3000, 'B D30 = 2026-09-06; demand Aug8–31 (2400) + Sep1–6 (600) = 3000');
ok(H(run(), 'D45').requiredByDate === '2026-09-21' && H(run(), 'D45').demandQty === 4500, 'C D45 = 2026-09-21; 2400 + Sep1–21 (2100) = 4500');
ok(H(run(), 'D90').requiredByDate === '2026-11-05' && H(run(), 'D90').demandQty === 9000, 'D D90 = 2026-11-05; Aug8–Nov5 = 90 days × 100 = 9000');

section('E/F. incoming time-phasing (before D18 vs after-D18-before-D30)');
var e = run({ openingSupplyQty: 1000, incomingEvents: [{ incomingId: 'SH1', eta: '2026-08-10', qty: 500, sourceType: 'KM' }] });
ok(H(e, 'D18').incomingAddedQty === 500 && H(e, 'D18').coveredQty === 1500 && H(e, 'D18').gapQty === 300, 'E incoming ETA before D18 → counted at D18 (cov 1500, gap 300)');
var f = run({ openingSupplyQty: 1000, incomingEvents: [{ incomingId: 'SH2', eta: '2026-08-27', qty: 500, sourceType: 'KM' }] });
ok(H(f, 'D18').incomingAddedQty === 0 && H(f, 'D18').gapQty === 800, 'F1 incoming ETA after D18 → NOT in D18 (incoming 0, gap 800)');
ok(H(f, 'D30').incomingAddedQty === 500 && H(f, 'D30').gapQty === 1500, 'F2 same incoming IS in D30 (late-for-D18 covers D30+)');

section('G/H/I. incoming after D30/D45/D90');
var g = run({ openingSupplyQty: 0, incomingEvents: [{ incomingId: 'S', eta: '2026-09-10', qty: 100, sourceType: 'KM' }] });
ok(H(g, 'D30').incomingAddedQty === 0 && H(g, 'D45').incomingAddedQty === 100, 'G incoming ETA (Sep10) after D30(Sep6) but before D45(Sep21) → only D45+');
var iAfter90 = run({ openingSupplyQty: 0, incomingEvents: [{ incomingId: 'S', eta: '2027-01-01', qty: 100, sourceType: 'KM' }] });
ok(H(iAfter90, 'D90').incomingAddedQty === 0, 'I incoming ETA after D90 → counted in NO horizon');

section('J/W. opening exhausted ONCE + incoming counted ONCE (no reset / no double)');
var j = run({ openingSupplyQty: 500, incomingEvents: [] });
ok(H(j, 'D18').gapQty === 1300 && H(j, 'D30').gapQty === 2500 && H(j, 'D30').coveredQty === 500, 'J opening 500 consumed once (D18 gap 1300, D30 gap 2500, covered stays 500 — never reset)');
ok(H(e, 'D18').incomingAddedQty === H(e, 'D30').incomingAddedQty, 'W the single 500 incoming is cumulative, not doubled (D18 500 == D30 500)');

section('K. valid zero gap → 0 (not null/unavailable)');
var k = run({ openingSupplyQty: 100000 });
ok(H(k, 'D18').gapQty === 0 && H(k, 'D18').suggestedOrderQty === 0, 'K covered fully → gap 0 AND suggested 0 (zero ≠ missing)');

section('L. missing opening supply → fail closed (never fabricated 0)');
var l = KMHP.projectHorizons({ destination: null, calculationDate: '2026-08-07', openingSupplyQty: null, regularFcByMonth: fc(), unitsPerCarton: 40 });
ok(l.ready === false && /OPENING_SUPPLY_UNAVAILABLE/.test(JSON.stringify(l.issues)), 'L opening null → ready false, OPENING_SUPPLY_UNAVAILABLE');

section('M. missing monthly FC covering a needed horizon → that horizon unavailable (never fabricated)');
var mMiss = run({ regularFcByMonth: fc({ '2026-09': null }) });
ok(H(mMiss, 'D18').gapQty !== null && H(mMiss, 'D30').gapQty === null && H(mMiss, 'D30').demandQty === null, 'M D18 (Aug-only) available; D30 (crosses missing Sep) → demand/gap null (truthful)');
ok(H(mMiss, 'D30').openingSupplyQty === 1000, 'M2 opening still surfaced on the unavailable horizon (never a fake 0 gap)');

section('N/O/P/Q. real month lengths 28 / 29(leap) / 30 / 31 drive the daily rate');
ok(H(KMHP.projectHorizons({ calculationDate: '2026-02-01', openingSupplyQty: 100000, regularFcByMonth: { '2026-02': 2800 }, unitsPerCarton: 40 }), 'D18').demandQty === 1800, 'N Feb-2026 (28d): 2800/28 = 100/day → D18 1800');
ok(H(KMHP.projectHorizons({ calculationDate: '2028-02-01', openingSupplyQty: 100000, regularFcByMonth: { '2028-02': 2900 }, unitsPerCarton: 40 }), 'D18').demandQty === 1800, 'O Feb-2028 (29d leap): 2900/29 = 100/day → D18 1800');
ok(H(KMHP.projectHorizons({ calculationDate: '2026-04-01', openingSupplyQty: 100000, regularFcByMonth: { '2026-04': 3000 }, unitsPerCarton: 40 }), 'D18').demandQty === 1800, 'P Apr (30d): 3000/30 = 100/day → D18 1800');
ok(H(KMHP.projectHorizons({ calculationDate: '2026-01-01', openingSupplyQty: 100000, regularFcByMonth: { '2026-01': 3100 }, unitsPerCarton: 40 }), 'D18').demandQty === 1800, 'Q Jan (31d): 3100/31 = 100/day → D18 1800');

section('R. permutation invariance (incoming order does not change output)');
var r1 = run({ openingSupplyQty: 0, incomingEvents: [{ incomingId: 'A', eta: '2026-08-10', qty: 100, sourceType: 'KM' }, { incomingId: 'B', eta: '2026-09-10', qty: 200, sourceType: 'KM' }] });
var r2 = run({ openingSupplyQty: 0, incomingEvents: [{ incomingId: 'B', eta: '2026-09-10', qty: 200, sourceType: 'KM' }, { incomingId: 'A', eta: '2026-08-10', qty: 100, sourceType: 'KM' }] });
ok(JSON.stringify(r1.horizons) === JSON.stringify(r2.horizons), 'R reordering incoming → identical horizons (deterministic)');

section('S/T. MARKETPLACE no fake warehouse + two-warehouse isolation');
ok(H(run(), 'D18').openingSupplyQty === 1000 && JSON.stringify(run().meta.destination) === JSON.stringify({ destinationType: 'MARKETPLACE' }) && !/warehouseId/.test(JSON.stringify(run().horizons)), 'S MARKETPLACE: no fabricated warehouse identity in horizons');
var whA = run({ destination: { destinationType: 'WAREHOUSE', warehouseId: 'WH-A' }, openingSupplyQty: 300, incomingEvents: [{ incomingId: 'A1', eta: '2026-08-10', qty: 400, sourceType: 'KM' }] });
var whB = run({ destination: { destinationType: 'WAREHOUSE', warehouseId: 'WH-B' }, openingSupplyQty: 0, incomingEvents: [{ incomingId: 'B1', eta: '2026-08-10', qty: 50, sourceType: 'KM' }] });
ok(H(whA, 'D18').openingSupplyQty === 300 && H(whA, 'D18').incomingAddedQty === 400, 'T1 WH-A sees only its own opening 300 + incoming 400');
ok(H(whB, 'D18').openingSupplyQty === 0 && H(whB, 'D18').incomingAddedQty === 50, 'T2 WH-B isolated (own opening 0 + incoming 50; WH-A never pooled in)');

section('U/CO1100-R. monthlyProjection NON-REGRESSION (KMTPP T1–T4 unchanged) + checkpoint additive field');
// monthlyProjection path passes NO checkpoints → the additive cumulativeIncomingQty cannot affect it.
var mp = KMTPP.projectTimePhasedSupply({ destination: { destinationType: 'MARKETPLACE' }, openingSupplyQty: 5286,
  demandEvents: [{ demandId: 'T1', date: '2026-09-01', qty: 7000, tier: 'T1', month: '2026-09' }, { demandId: 'T2', date: '2026-10-01', qty: 4282, tier: 'T2', month: '2026-10' }, { demandId: 'T3', date: '2026-11-01', qty: 7500, tier: 'T3', month: '2026-11' }, { demandId: 'T4', date: '2026-12-01', qty: 0, tier: 'T4', month: '2026-12' }],
  incomingEvents: [], checkpoints: [] });
function tier(t) { for (var i = 0; i < mp.monthlyProjection.length; i++) if (mp.monthlyProjection[i].tier === t) return mp.monthlyProjection[i]; return null; }
function sug(gap) { return gap <= 0 ? 0 : KMCALC.calculateSuggestedOrderQty({ netOrderNeed: gap, unitsPerCarton: 40 }); }
ok(tier('T1').remainingGapQty === 1714 && sug(1714) === 1720, 'CO1100-R T1: gap 1714, suggested 1720 (unchanged)');
ok(tier('T2').remainingGapQty === 4282 && sug(4282) === 4320, 'CO1100-R T2: gap 4282, suggested 4320 (unchanged)');
ok(tier('T3').remainingGapQty === 7500 && sug(7500) === 7520, 'CO1100-R T3: gap 7500, suggested 7520 (unchanged)');
ok(tier('T4').remainingGapQty === 0, 'CO1100-R T4: gap 0 (unchanged)');
ok(mp.checkpoints.length === 0, 'U monthlyProjection call emits no checkpoints (additive checkpoint field cannot regress it)');

section('V. clockless / deterministic (no Date / RNG authority)');
var srcH = read('js/core/supply-planning-horizon-projection.js').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/Date\.now\(|new Date\(|Math\.random\(/.test(srcH), 'V KMHP has no Date.now / new Date / Math.random');

section('carton suggestion via frozen KMCALC owner');
ok(H(j, 'D18').suggestedOrderQty === KMCALC.calculateSuggestedOrderQty({ netOrderNeed: 1300, unitsPerCarton: 40 }), 'suggested = KMCALC carton CEIL over gapQty (no new rounding formula)');
ok(KMHP.projectHorizons({ calculationDate: 'bad', openingSupplyQty: 1, regularFcByMonth: {} }).issues[0].code === 'CALCULATION_DATE_INVALID', 'malformed calcDate → CALCULATION_DATE_INVALID (fail closed)');
ok(KMHP.projectHorizons({ openingSupplyQty: 1, regularFcByMonth: {} }).issues[0].code === 'CALCULATION_DATE_NOT_CONFIGURED', 'missing calcDate → CALCULATION_DATE_NOT_CONFIGURED (fail closed)');

console.log('\n----------------------------------------');
console.log('HORIZON PROJECTION (F1-4B-FM4a): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
