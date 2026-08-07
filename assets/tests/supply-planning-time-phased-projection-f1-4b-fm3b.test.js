// Kitchen Mama Operation System — Canonical Time-Phased Supply Projection (KMTPP) — F1-4B-FM3b.
// Run: node assets/tests/supply-planning-time-phased-projection-f1-4b-fm3b.test.js
// -----------------------------------------------------------------------------
// Pure-runtime proof of the ONE chronological projection owner: sequential monthly carry-forward (opening
// supply consumed ONCE, never reused), count-once incoming, late-incoming exclusion, valid zero, missing≠0,
// special-event-once, multi-warehouse isolation, MARKETPLACE (no fake warehouse), determinism (permutation-
// invariant / no mutation / no clock / no RNG / JSON-safe), the generic checkpoint mechanism (day-horizon
// architecture-ready), and the day-horizon authority BOUNDED HALT (no invented day values).

var path = require('path');
var KMTPP = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-time-phased-projection.js'));
var project = KMTPP.projectTimePhasedSupply;

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function tier(mp, t) { for (var i = 0; i < mp.length; i++) if (mp[i].tier === t) return mp[i]; return null; }

section('A. sequential monthly carry-forward — opening supply NOT reused');
var A = project({ destination: 'MKT', openingSupplyQty: 100, demandEvents: [
  { demandId: 'a', date: '2026-09-15', qty: 60, tier: 'T1', month: '2026-09' },
  { demandId: 'b', date: '2026-10-15', qty: 70, tier: 'T2', month: '2026-10' }], incomingEvents: [], checkpoints: [] });
ok(A.ready === true, 'A0 ready');
var A1 = tier(A.monthlyProjection, 'T1'), A2 = tier(A.monthlyProjection, 'T2');
ok(A1.coveredQty === 60 && A1.remainingSupplyQty === 40 && A1.remainingGapQty === 0, 'A1 T1 covered 60, remaining 40, gap 0');
ok(A2.openingSupplyQty === 40 && A2.coveredQty === 40 && A2.remainingSupplyQty === 0 && A2.remainingGapQty === 30, 'A2 T2 opening 40 (carried), covered 40, remaining 0, gap 30 (NOT max(0,70-100)=0)');

section('B. incoming becomes usable between tiers');
var B = project({ destination: 'MKT', openingSupplyQty: 50, demandEvents: [
  { demandId: 'a', date: '2026-09-15', qty: 50, tier: 'T1', month: '2026-09' },
  { demandId: 'b', date: '2026-10-15', qty: 60, tier: 'T2', month: '2026-10' }],
  incomingEvents: [{ incomingId: 'i1', availableDate: '2026-09-28', qty: 40, tier: 'T2' }], checkpoints: [] });
var B1 = tier(B.monthlyProjection, 'T1'), B2 = tier(B.monthlyProjection, 'T2');
ok(B1.remainingGapQty === 0 && B1.remainingSupplyQty === 0, 'B1 T1 gap 0, remaining 0');
ok(B2.openingSupplyQty === 0 && B2.incomingAddedQty === 40 && B2.coveredQty === 40 && B2.remainingGapQty === 20, 'B2 T2 opening 0 + incoming 40 → covered 40, gap 20');

section('C. late incoming does NOT cover an earlier tier');
var C = project({ destination: 'MKT', openingSupplyQty: 0, demandEvents: [
  { demandId: 'a', date: '2026-09-15', qty: 50, tier: 'T1', month: '2026-09' },
  { demandId: 'b', date: '2026-10-15', qty: 50, tier: 'T2', month: '2026-10' }],
  incomingEvents: [{ incomingId: 'i1', availableDate: '2026-10-01', qty: 50, tier: 'T2' }], checkpoints: [] });
var C1 = tier(C.monthlyProjection, 'T1'), C2 = tier(C.monthlyProjection, 'T2');
ok(C1.remainingGapQty === 50 && C1.coveredQty === 0, 'C1 T1 uncovered (late incoming cannot reach back)');
ok(C2.coveredQty === 50 && C2.remainingGapQty === 0, 'C2 T2 covered by the incoming that arrived in its window');

section('D. count-once — one shipment cannot cover two tiers');
var D = project({ destination: 'MKT', openingSupplyQty: 0, demandEvents: [
  { demandId: 'a', date: '2026-09-15', qty: 40, tier: 'T1', month: '2026-09' },
  { demandId: 'b', date: '2026-10-15', qty: 40, tier: 'T2', month: '2026-10' }],
  incomingEvents: [{ incomingId: 'i1', availableDate: '2026-09-01', qty: 40, tier: 'T1' }], checkpoints: [] });
var D1 = tier(D.monthlyProjection, 'T1'), D2 = tier(D.monthlyProjection, 'T2');
ok(D1.coveredQty === 40 && D1.remainingGapQty === 0, 'D1 shipment covers T1');
ok(D2.coveredQty === 0 && D2.remainingGapQty === 40, 'D2 the SAME shipment is NOT reused for T2 (count-once)');
ok(D.meta.totalIncomingQty === 40, 'D3 total incoming applied exactly once');

section('E. valid zero — zero demand / zero gap remains valid zero');
var E = project({ destination: 'MKT', openingSupplyQty: 10, demandEvents: [{ demandId: 'a', date: '2026-09-15', qty: 0, tier: 'T1', month: '2026-09' }], incomingEvents: [], checkpoints: [] });
var E1 = tier(E.monthlyProjection, 'T1');
ok(E.ready === true && E1.demandQty === 0 && E1.remainingGapQty === 0 && E1.remainingSupplyQty === 10, 'E1 zero demand → valid zero gap, supply intact');

section('F. missing opening supply ≠ zero (fail closed)');
var F = project({ destination: 'MKT', openingSupplyQty: null, demandEvents: [{ demandId: 'a', date: '2026-09-15', qty: 5, tier: 'T1' }], incomingEvents: [], checkpoints: [] });
ok(F.ready === false && F.issues[0].code === 'OPENING_SUPPLY_UNAVAILABLE', 'F1 missing opening supply → not ready, OPENING_SUPPLY_UNAVAILABLE (never treated as 0)');

section('G. special-event demand enters ONCE (at its prep date) — not double-counted');
// Regular FC (T1) + one Special Event demand event tagged into its pull-forward tier: summed once, not twice.
var G = project({ destination: 'MKT', openingSupplyQty: 100, demandEvents: [
  { demandId: 'fc-t1', date: '2026-09-15', qty: 40, tier: 'T1', month: '2026-09', demandType: 'REGULAR_FC' },
  { demandId: 'evt-1', date: '2026-09-05', qty: 30, tier: 'T1', month: '2026-09', demandType: 'SPECIAL_EVENT' }], incomingEvents: [], checkpoints: [] });
var G1 = tier(G.monthlyProjection, 'T1');
ok(G1.demandQty === 70 && G1.coveredQty === 70 && G1.remainingSupplyQty === 30, 'G1 T1 demand = 40 FC + 30 event = 70 (event counted exactly once)');

section('H. multi-warehouse isolation — WH-A stock/incoming never leaks into WH-B');
var HA = project({ destination: 'WAREHOUSE||KM||US||AMZ||WH-A', openingSupplyQty: 30, demandEvents: [{ demandId: 'a', date: '2026-09-15', qty: 50, tier: 'T1', month: '2026-09' }], incomingEvents: [{ incomingId: 'ia', availableDate: '2026-09-01', qty: 5, tier: 'T1' }], checkpoints: [] });
var HB = project({ destination: 'WAREHOUSE||KM||US||AMZ||WH-B', openingSupplyQty: 70, demandEvents: [{ demandId: 'b', date: '2026-09-15', qty: 40, tier: 'T1', month: '2026-09' }], incomingEvents: [], checkpoints: [] });
ok(tier(HA.monthlyProjection, 'T1').remainingGapQty === 15, 'H1 WH-A: 30+5 vs 50 → gap 15 (own stock/incoming only)');
ok(tier(HB.monthlyProjection, 'T1').remainingGapQty === 0 && tier(HB.monthlyProjection, 'T1').remainingSupplyQty === 30, 'H2 WH-B: 70 vs 40 → gap 0, remaining 30 (independent projection)');
ok(HA.meta.destination !== HB.meta.destination, 'H3 destination identity preserved per node');

section('I. MARKETPLACE — destination identity passthrough, no fabricated warehouse');
var I = project({ destination: 'MARKETPLACE||KM||US||AMZ||MP1', openingSupplyQty: 120, demandEvents: [{ demandId: 'a', date: '2026-09-15', qty: 1000, tier: 'T1', month: '2026-09' }], incomingEvents: [], checkpoints: [] });
ok(I.meta.destination === 'MARKETPLACE||KM||US||AMZ||MP1' && !/WAREHOUSE/.test(I.meta.destination), 'I1 marketplace destination preserved; no warehouse invented');
ok(tier(I.monthlyProjection, 'T1').remainingGapQty === 880, 'I1b marketplace gap 1000-120 = 880');

section('J. determinism — permutation-invariant, no mutation, no clock/RNG, JSON-safe');
var evD = [{ demandId: 'b', date: '2026-10-15', qty: 70, tier: 'T2', month: '2026-10' }, { demandId: 'a', date: '2026-09-15', qty: 60, tier: 'T1', month: '2026-09' }];
var evI = [{ incomingId: 'i2', availableDate: '2026-10-01', qty: 10, tier: 'T2' }, { incomingId: 'i1', availableDate: '2026-09-01', qty: 20, tier: 'T1' }];
var frozenIn = JSON.stringify({ evD: evD, evI: evI });
var J1 = project({ destination: 'MKT', openingSupplyQty: 100, demandEvents: evD, incomingEvents: evI, checkpoints: [] });
var J2 = project({ destination: 'MKT', openingSupplyQty: 100, demandEvents: evD.slice().reverse(), incomingEvents: evI.slice().reverse(), checkpoints: [] });
ok(JSON.stringify(J1.monthlyProjection) === JSON.stringify(J2.monthlyProjection), 'J1 permutation of input events → identical monthlyProjection');
ok(JSON.stringify({ evD: evD, evI: evI }) === frozenIn, 'J2 inputs not mutated');
ok(JSON.stringify(J1) === JSON.stringify(JSON.parse(JSON.stringify(J1))), 'J3 output is JSON-safe (no functions/DOM)');
var SRC = require('fs').readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-time-phased-projection.js'), 'utf8')
  .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');   // strip comments (they mention "Date.now()" as forbidden)
ok(!/Date\.now\(|new Date\(|Math\.random\(/.test(SRC), 'J4 no clock / RNG in the projection owner code');

section('K. generic checkpoint mechanism (day-horizon ARCHITECTURE-ready) + authority HALT (no invented day values)');
// The mechanism can snapshot ANY dated checkpoint from the single timeline — proving day horizons are ready
// the moment their two missing authorities (calc-DAY anchor + intra-month day-demand rule) are frozen.
var K = project({ destination: 'MKT', openingSupplyQty: 100, demandEvents: [
  { demandId: 'd1', date: '2026-09-10', qty: 30, tier: 'T1', month: '2026-09' },
  { demandId: 'd2', date: '2026-09-25', qty: 50, tier: 'T1', month: '2026-09' }],
  incomingEvents: [], checkpoints: [
  { checkpointId: 'D18', date: '2026-09-18', kind: 'DAY' },
  { checkpointId: 'D30', date: '2026-09-30', kind: 'DAY' }] });
var d18 = K.checkpoints[0], d30 = K.checkpoints[1];
ok(d18.checkpointId === 'D18' && d18.cumulativeDemandQty === 30 && d18.remainingSupplyQty === 70 && d18.gapQty === 0, 'K1 D18 snapshot = demand-so-far 30, remaining 70 (mechanism works when dated demand is supplied)');
ok(d30.checkpointId === 'D30' && d30.cumulativeDemandQty === 80 && d30.remainingSupplyQty === 20, 'K2 D30 snapshot cumulative 80, remaining 20 (monotonic carry-forward)');
// HALT marker: the owner NEVER fabricates day demand from a monthly total — day checkpoints require the
// caller to supply dated demand events. With NO dated day-demand + NO calc-day anchor (the live case),
// the LIVE handler must not construct day checkpoints (documented bounded HALT, not tested with fake values).
ok(project({ destination: 'MKT', openingSupplyQty: 100, demandEvents: [{ demandId: 'm', date: '2026-09-15', qty: 80, tier: 'T1', month: '2026-09' }], incomingEvents: [], checkpoints: [] }).checkpoints.length === 0, 'K3 no checkpoints requested → none emitted (owner never invents day horizons)');

section('L. full T1..T4 sequential chain');
var L = project({ destination: 'MKT', openingSupplyQty: 100, demandEvents: [
  { demandId: 't1', date: '2026-09-15', qty: 30, tier: 'T1', month: '2026-09' },
  { demandId: 't2', date: '2026-10-15', qty: 30, tier: 'T2', month: '2026-10' },
  { demandId: 't3', date: '2026-11-15', qty: 30, tier: 'T3', month: '2026-11' },
  { demandId: 't4', date: '2026-12-15', qty: 30, tier: 'T4', month: '2026-12' }], incomingEvents: [], checkpoints: [] });
ok(L.monthlyProjection.length === 4, 'L0 four tiers produced');
ok(tier(L.monthlyProjection, 'T1').remainingSupplyQty === 70 && tier(L.monthlyProjection, 'T2').remainingSupplyQty === 40 && tier(L.monthlyProjection, 'T3').remainingSupplyQty === 10 && tier(L.monthlyProjection, 'T4').remainingGapQty === 20, 'L1 100→70→40→10 then T4 demand 30 → gap 20 (carry-forward across all four)');

console.log('\n----------------------------------------');
console.log('TIME-PHASED SUPPLY PROJECTION (F1-4B-FM3b): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
