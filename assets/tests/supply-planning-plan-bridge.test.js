// Kitchen Mama Operation System — Recommendation Facts → Plan Builder BRIDGE tests (Phase 2C, Round 1O).
// Run: node assets/tests/supply-planning-plan-bridge.test.js
// Pure Node — exercises bridgeRecommendationFactsToPlan in assets/js/core/supply-planning-plan-bridge.js.
// Builds REAL resolved Weekly / Monthly recommendation facts (real buildDemandLedger/buildSupplyLedger + real
// allocators via projectAllocationInputs + real resolveWeekly/MonthlyRecommendationFacts), bridges them to the
// exact existing Plan Builder input schema, and feeds the bridged output into the REAL Plan Builder
// (supply-planning-plan-builder.js → buildRecommendation) to prove compatibility. Verifies mechanical field
// remap, run-level ownership, blocked/zero semantics, byte value preservation (NO recalculation), allocation
// lineage as non-authoritative metadata, determinism/purity. New assertion count reported separately.

'use strict';
var SF = require('../js/core/supply-planning-source-facts.js');
var LEDGER = require('../js/core/supply-planning-ledgers.js');
var PB = require('../js/core/supply-planning-plan-builder.js');
var BR = require('../js/core/supply-planning-plan-bridge.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function throwsRange(fn, l) { try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var SEP = String.fromCharCode(1);
var IDENT = { company: 'KM', country: 'US', masterSku: 'CO1100-R', fulfillmentModel: 'self_fulfilled' };
var WSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen' };
var MSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'monthly', sku: 'CO1100-R' };

// ---- shared fact builders (mirror the Round 1M / 1N resolver test setups) --------------------------------
function dEntry(cycle, ref, dest, mkt, qty) { return { demandType: 'REGULAR', masterSku: 'CO1100-R', company: 'KM', country: 'US', marketplace: mkt, destinationWarehouseId: dest, planningCycle: cycle, requiredByDate: '2026-09-01', sourceRef: ref, quantity: qty }; }
function sEntry(lin, wh, pt, qty) { return { supplyLineageRef: lin, masterSku: 'CO1100-R', company: 'KM', warehouseId: wh, poolType: pt, lifecycleBucket: 'CURRENT_STOCK', quantity: qty }; }
function dk(dl, ref) { for (var i = 0; i < dl.entries.length; i++) { var k = dl.entries[i].demandKey; if (k.slice(-ref.length) === ref && k.charAt(k.length - ref.length - 1) === SEP) return k; } throw new Error('no demandKey ' + ref); }

// Weekly ------------------------------------------------------------------------------------------------
function recv(key, demandKey, elig, extra) { var r = { receiverKey: key, demandKey: demandKey, marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', fulfillmentModel: 'self_fulfilled', survivalNeedQty: 50, allocationPriority: 1, demandWeight: 1, eligiblePoolTypes: elig }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }
function wProj(de, se, rf) { var dl = LEDGER.buildDemandLedger({ entries: de }), sl = LEDGER.buildSupplyLedger({ entries: se }); return { proj: SF.projectAllocationInputs({ identity: IDENT, demandLedger: dl, supplyLedger: sl, receiverFacts: rf || [], factoryDemandFacts: [] }), dl: dl }; }
function wf(dl, ref, win, gap, upc, extra) { var f = { recommendationType: 'WEEKLY_SHIPPING', sku: 'CO1100-R', siteSku: 'ST-1', windowCode: win, demandKey: dk(dl, ref), company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', calculatedGap: gap, unitsPerCarton: upc }; if (extra) for (var k in extra) f[k] = extra[k]; return f; }
function resolveW(proj, facts) { return SF.resolveWeeklyRecommendationFacts({ planningCycle: '2026-W40', businessScope: WSCOPE, allocationProjection: proj, weeklyPlanningFacts: facts, formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01' }); }
function weeklyFacts(facts) { var s = wProj([dEntry('2026-W40', 'd1', 'WH-3PL', 'AMAZON_US', 100)], [sEntry('sp', 'WH-3PL', 'THREE_PL', 100)], [recv('R1', dk(LEDGER.buildDemandLedger({ entries: [dEntry('2026-W40', 'd1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['THREE_PL'])]); return resolveW(s.proj, facts(s.dl)); }

// Monthly -----------------------------------------------------------------------------------------------
function fdem(key, elig) { return { demandKey: key, marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', requiredByDate: '2026-09-01', allocationPriority: 1, eligibleFactoryWarehouseIds: elig }; }
function mProj(de, se, ff) { var dl = LEDGER.buildDemandLedger({ entries: de }), sl = LEDGER.buildSupplyLedger({ entries: se }); return { proj: SF.projectAllocationInputs({ identity: IDENT, demandLedger: dl, supplyLedger: sl, factoryDemandFacts: ff || [] }), dl: dl }; }
function mf(dl, ref, month, bucket, need, upc, extra) { var f = { recommendationType: 'MONTHLY_ORDER', masterSku: 'CO1100-R', siteSku: 'ST-1', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', requestMonth: month, requestBucket: bucket, demandKey: dk(dl, ref), netOrderNeed: need, unitsPerCarton: upc }; if (extra) for (var k in extra) f[k] = extra[k]; return f; }
function resolveM(proj, dl, facts) { return SF.resolveMonthlyRecommendationFacts({ planningCycle: '2026-M08', businessScope: MSCOPE, allocationProjection: proj, monthlyPlanningFacts: facts, formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01', demandLedger: dl }); }
function monthlyFacts(build) { var dl = LEDGER.buildDemandLedger({ entries: [dEntry('2026-M08', 'd1', 'WH-3PL', 'AMAZON_US', 100)] }); var p = SF.projectAllocationInputs({ identity: IDENT, demandLedger: dl, supplyLedger: LEDGER.buildSupplyLedger({ entries: [sEntry('fs', 'WH-FAC', 'FACTORY', 60)] }), factoryDemandFacts: [fdem(dk(dl, 'd1'), ['WH-FAC'])] }); return resolveM(p, dl, build(dl)); }

// hand-crafted facts shell (for pure structural bridge edge-cases — contract is defined on the fact SHAPE)
function shell(type, scope, lines, over) { var f = { recommendationType: type, ready: true, status: 'OK', reason: null, issues: [], planningCycle: type === 'WEEKLY_SHIPPING' ? '2026-W40' : '2026-M08', businessScope: scope, lines: lines, allocationSummary: {}, blockedInputs: [], formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01', lineage: [] }; if (over) for (var k in over) f[k] = over[k]; return f; }

function bridge(facts, over) { var inp = { recommendationFacts: facts, mode: 'SCHEDULED_REFRESH', calculationRunId: 'RUN-1', draftVersion: 1 }; if (over) for (var k in over) inp[k] = over[k]; return BR.bridgeRecommendationFactsToPlan(inp); }

// ==========================================================================
section('A. Weekly field mapping — mechanical camelCase → snake_case natural key');
(function () {
  var f = weeklyFacts(function (dl) { return [wf(dl, 'd1', 'W40-A', 100, 12)]; });
  var out = bridge(f);
  eq([out.recommendationType, out.mode, out.planningCycle, out.calculationRunId, out.draftVersion], ['WEEKLY_SHIPPING', 'SCHEDULED_REFRESH', '2026-W40', 'RUN-1', 1], 'A1 run-level fields (type/mode from facts+caller; runId/draftVersion caller-owned)');
  eq([out.businessScope, out.formulaVersion, out.sourceDataAsOf], [WSCOPE, 'fv1', '2026-08-01'], 'A2 scope/formulaVersion/sourceDataAsOf propagated from facts verbatim');
  eq(out.lines.length, 1, 'A3 one bridged line');
  var l = out.lines[0];
  eq([l.sku, l.site_sku, l.window_code], ['CO1100-R', 'ST-1', 'W40-A'], 'A4 masterSku/siteSku/windowCode → sku/site_sku/window_code');
  eq([l.blocked, l.recommendedQty], [false, 96], 'A5 blocked=false; recommendedQty 96 preserved (no recompute)');
  eq(l.demandKey !== undefined, true, 'A6 demandKey carried onto plan line');
  ok(typeof l.lineage === 'object' && !Array.isArray(l.lineage), 'A7 lineage carried as the Plan Builder object slot');
  var str = JSON.stringify(l);
  ok(str.indexOf('masterSku') < 0 && str.indexOf('windowCode') < 0 && str.indexOf('planned_qty') < 0 && str.indexOf('order_qty') < 0 && str.indexOf('calculatedGap') < 0, 'A8 no camelCase / user-qty / live-analysis leakage on the plan line');
  // preserved calc lineage lives in non-authoritative metadata
  var mk = out.lines[0].sku + SEP + out.lines[0].site_sku + SEP + out.lines[0].window_code;
  eq([out.metadata.lineMetaByKey[mk].calculatedGap, out.metadata.lineMetaByKey[mk].recommendedQty], [100, 96], 'A9 calculatedGap + recommendedQty preserved in metadata');
  ok(Array.isArray(out.metadata.lineMetaByKey[mk].allocationBreakdown) && out.metadata.lineMetaByKey[mk].allocationBreakdown.length >= 1, 'A10 allocation breakdown preserved as metadata');
})();

section('B. Weekly blocked / valid-zero mapping');
(function () {
  // blocked (full natural key present) — missing UPC
  var fb = weeklyFacts(function (dl) { return [wf(dl, 'd1', 'W40-A', 100, undefined)]; });
  var ob = bridge(fb);
  eq([ob.lines[0].blocked, ob.lines[0].recommendedQty, ob.lines[0].reason], [true, null, 'MISSING_OR_INVALID_UNITS_PER_CARTON'], 'B1 blocked line → blocked=true, recommendedQty null, reason preserved exactly');
  // valid zero — gap 0 → recommendedQty 0, NOT blocked, NOT a fabricated missing
  var fz = weeklyFacts(function (dl) { return [wf(dl, 'd1', 'W40-A', 0, 12)]; });
  var oz = bridge(fz);
  eq([oz.lines[0].blocked, oz.lines[0].recommendedQty], [false, 0], 'B2 valid zero recommendedQty stays 0 (not blocked)');
})();

section('C. Weekly structural-blocked line → unmappable metadata (never a Plan Builder line, never thrown)');
(function () {
  var f = weeklyFacts(function (dl) { return [wf(dl, 'd1', '', 100, 12)]; }); // MISSING_WINDOW_CODE → incomplete key
  var out = bridge(f);
  eq(out.lines.length, 0, 'C1 no Plan Builder line for an incomplete natural key');
  eq(out.metadata.unmappableBlockedLines.length, 1, 'C2 surfaced as data in unmappableBlockedLines');
  eq(out.metadata.unmappableBlockedLines[0].blockedReason, 'MISSING_WINDOW_CODE', 'C3 blockedReason preserved on the unmappable record');
})();

section('D. Monthly field mapping — requestMonth/requestBucket → snake_case; sku in scope not line key');
(function () {
  var f = monthlyFacts(function (dl) { return [mf(dl, 'd1', '2026-09', 'B1', 13, 12)]; });
  var out = bridge(f, { mode: 'MANUAL_REGENERATE' });
  eq([out.recommendationType, out.mode, out.planningCycle], ['MONTHLY_ORDER', 'MANUAL_REGENERATE', '2026-M08'], 'D1 Monthly run-level fields');
  var l = out.lines[0];
  eq([l.request_month, l.request_bucket, l.blocked, l.recommendedQty], ['2026-09', 'B1', false, 24], 'D2 requestMonth/requestBucket → request_month/request_bucket; recommendedQty 24 preserved');
  var str = JSON.stringify(l);
  ok(str.indexOf('masterSku') < 0 && str.indexOf('requestMonth') < 0 && str.indexOf('order_qty') < 0 && str.indexOf('planned_qty') < 0 && str.indexOf('netOrderNeed') < 0, 'D3 no camelCase / sku / user-qty / netOrderNeed leakage on plan line');
  var mk = l.request_month + SEP + l.request_bucket;
  eq([out.metadata.lineMetaByKey[mk].netOrderNeed, out.metadata.lineMetaByKey[mk].cartonQty], [13, 2], 'D4 netOrderNeed 13 (unrounded) + cartonQty 2 preserved in metadata');
})();

section('E. Monthly blocked / zero / multi-factory metadata');
(function () {
  // zero need → recommendedQty 0, not blocked
  var fz = monthlyFacts(function (dl) { return [{ recommendationType: 'MONTHLY_ORDER', masterSku: 'CO1100-R', requestMonth: '2026-09', requestBucket: 'B1', demandKey: dk(dl, 'd1'), unitsPerCarton: 12, demand: 50, destinationCurrentStock: 60, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0 }]; });
  var oz = bridge(fz);
  eq([oz.lines[0].blocked, oz.lines[0].recommendedQty], [false, 0], 'E1 Monthly valid zero stays 0');
  // missing need → blocked
  var fb = monthlyFacts(function (dl) { return [{ recommendationType: 'MONTHLY_ORDER', masterSku: 'CO1100-R', requestMonth: '2026-09', requestBucket: 'B1', demandKey: dk(dl, 'd1'), unitsPerCarton: 12 }]; });
  var ob = bridge(fb);
  eq([ob.lines[0].blocked, ob.lines[0].recommendedQty, ob.lines[0].reason], [true, null, 'MISSING_NET_ORDER_NEED'], 'E2 missing Net Order Need → blocked null');
  // multi-factory breakdown preserved verbatim in metadata (never flattened / re-capped)
  var dl = LEDGER.buildDemandLedger({ entries: [dEntry('2026-M08', 'd1', 'WH-3PL', 'AMAZON_US', 100)] });
  var p = SF.projectAllocationInputs({ identity: IDENT, demandLedger: dl, supplyLedger: LEDGER.buildSupplyLedger({ entries: [sEntry('a', 'WH-FAC-A', 'FACTORY', 40), sEntry('b', 'WH-FAC-B', 'FACTORY', 40)] }), factoryDemandFacts: [fdem(dk(dl, 'd1'), ['WH-FAC-A', 'WH-FAC-B'])] });
  var out = bridge(resolveM(p, dl, [mf(dl, 'd1', '2026-09', 'B1', 100, 12)]));
  var mk = '2026-09' + SEP + 'B1';
  var bd = out.metadata.lineMetaByKey[mk].allocationBreakdown;
  var distinct = {}, sum = 0; bd.forEach(function (b) { distinct[b.sourcePoolKey] = 1; sum += b.allocatedQty; });
  eq([bd.length >= 2, Object.keys(distinct).length, sum, out.lines[0].recommendedQty], [true, 2, 80, 108], 'E3 two factory pools preserved in metadata (80); recommendedQty demand-based 108 (allocation NOT a cap)');
})();

section('F. Run-level ownership — required, preserved, never generated');
(function () {
  var f = weeklyFacts(function (dl) { return [wf(dl, 'd1', 'W40-A', 100, 12)]; });
  // formulaVersion / sourceDataAsOf propagation
  eq([bridge(f).formulaVersion, bridge(f).sourceDataAsOf], ['fv1', '2026-08-01'], 'F1 formulaVersion + sourceDataAsOf propagated');
  // calculationRunId required + preserved
  throwsType(function () { BR.bridgeRecommendationFactsToPlan({ recommendationFacts: f, mode: 'SCHEDULED_REFRESH' }); }, 'F2 missing calculationRunId → TypeError');
  eq(bridge(f, { calculationRunId: 'RUN-9' }).calculationRunId, 'RUN-9', 'F3 calculationRunId preserved verbatim');
  // mode required + must be supported
  throwsType(function () { BR.bridgeRecommendationFactsToPlan({ recommendationFacts: f, calculationRunId: 'R' }); }, 'F4 missing mode → TypeError');
  throwsRange(function () { bridge(f, { mode: 'SOMETHING_ELSE' }); }, 'F5 unsupported mode → RangeError');
  // draftVersion: preserved when valid, null when absent (never generated), RangeError when invalid
  eq(bridge(f, { draftVersion: 3 }).draftVersion, 3, 'F6 draftVersion preserved');
  eq(BR.bridgeRecommendationFactsToPlan({ recommendationFacts: f, mode: 'SCHEDULED_REFRESH', calculationRunId: 'R' }).draftVersion, null, 'F7 absent draftVersion → null (no generated default)');
  throwsRange(function () { bridge(f, { draftVersion: 0 }); }, 'F8 non-positive draftVersion → RangeError');
  throwsRange(function () { bridge(f, { draftVersion: 1.5 }); }, 'F9 non-integer draftVersion → RangeError');
  // recommendationType mismatch / unsupported
  throwsRange(function () { bridge(f, { recommendationType: 'MONTHLY_ORDER' }); }, 'F10 recommendationType mismatch → RangeError');
  throwsRange(function () { bridge(shell('SOMETHING', WSCOPE, [])); }, 'F11 unsupported recommendationType → RangeError');
  // changing run metadata changes ONLY run metadata, not line values
  var a = bridge(f, { mode: 'SCHEDULED_REFRESH', calculationRunId: 'RX', draftVersion: 1 });
  var b = bridge(f, { mode: 'MANUAL_REGENERATE', calculationRunId: 'RY', draftVersion: 2 });
  eq(a.lines, b.lines, 'F12 run-metadata change does not alter line values');
})();

section('G. Value preservation — bridge performs NO calculation (exact equality)');
(function () {
  var wfacts = weeklyFacts(function (dl) { return [wf(dl, 'd1', 'W40-A', 100, 12)]; });
  var wl = wfacts.lines[0]; var wo = bridge(wfacts); var wmk = wl.masterSku + SEP + wl.siteSku + SEP + wl.windowCode;
  eq([wo.lines[0].recommendedQty, wo.metadata.lineMetaByKey[wmk].calculatedGap, wo.metadata.lineMetaByKey[wmk].unallocatedQty], [wl.recommendedQty, wl.calculatedGap, wl.unallocatedQty], 'G1 Weekly recommendedQty/calculatedGap/unallocatedQty identical to resolver');
  var mfacts = monthlyFacts(function (dl) { return [mf(dl, 'd1', '2026-09', 'B1', 13, 12)]; });
  var ml = mfacts.lines[0]; var mo = bridge(mfacts); var mmk = ml.requestMonth + SEP + ml.requestBucket;
  eq([mo.lines[0].recommendedQty, mo.metadata.lineMetaByKey[mmk].netOrderNeed, mo.metadata.lineMetaByKey[mmk].cartonQty, mo.metadata.lineMetaByKey[mmk].unallocatedQty], [ml.recommendedQty, ml.netOrderNeed, ml.cartonQty, ml.unallocatedQty], 'G2 Monthly recommendedQty/netOrderNeed/cartonQty/unallocatedQty identical to resolver');
  eq([mo.formulaVersion, mo.sourceDataAsOf], [mfacts.formulaVersion, mfacts.sourceDataAsOf], 'G3 formulaVersion/sourceDataAsOf identical to resolver');
})();

section('H. Scope mismatch + duplicate mapped key → fail closed');
(function () {
  // Weekly: a line whose company conflicts with run-level scope
  var fw = weeklyFacts(function (dl) { return [wf(dl, 'd1', 'W40-A', 100, 12, { company: 'ACME' })]; });
  throwsRange(function () { bridge(fw); }, 'H1 Weekly line company ≠ scope.company → RangeError');
  // Weekly duplicate mapped key (hand-crafted two identical natural keys)
  var wdup = shell('WEEKLY_SHIPPING', WSCOPE, [
    { masterSku: 'CO1100-R', siteSku: 'ST-1', windowCode: 'W40-A', recommendedQty: 12, blockedReason: null, demandKey: 'k1', lineage: [], allocationBreakdown: [] },
    { masterSku: 'CO1100-R', siteSku: 'ST-1', windowCode: 'W40-A', recommendedQty: 24, blockedReason: null, demandKey: 'k2', lineage: [], allocationBreakdown: [] }
  ]);
  throwsRange(function () { bridge(wdup); }, 'H2 Weekly duplicate mapped Plan Builder key → RangeError');
  // Monthly duplicate arises NATURALLY: PB key drops sku → two masterSkus same (month,bucket) collide when scope has no sku
  var mdup = shell('MONTHLY_ORDER', { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'monthly' }, [
    { masterSku: 'CO1100-R', requestMonth: '2026-09', requestBucket: 'B1', recommendedQty: 24, blockedReason: null, demandKey: 'k1', lineage: [], allocationBreakdown: [] },
    { masterSku: 'CO2200-B', requestMonth: '2026-09', requestBucket: 'B1', recommendedQty: 36, blockedReason: null, demandKey: 'k2', lineage: [], allocationBreakdown: [] }
  ]);
  throwsRange(function () { bridge(mdup); }, 'H3 Monthly duplicate mapped key (sku dropped from PB grain) → RangeError');
  // Monthly masterSku ≠ scope.sku → RangeError
  var mms = shell('MONTHLY_ORDER', MSCOPE, [{ masterSku: 'OTHER', requestMonth: '2026-09', requestBucket: 'B1', recommendedQty: 24, blockedReason: null, demandKey: 'k1', lineage: [], allocationBreakdown: [] }]);
  throwsRange(function () { bridge(mms); }, 'H4 Monthly line masterSku ≠ scope.sku → RangeError');
})();

section('I. Plan Builder compatibility — REAL buildRecommendation accepts bridged facts');
(function () {
  // Weekly: mix of a normal + a blocked line, both with full natural keys (two DISTINCT windows)
  var s = wProj([dEntry('2026-W40', 'd1', 'WH-3PL', 'AMAZON_US', 100)], [sEntry('sp', 'WH-3PL', 'THREE_PL', 100)], [recv('R1', dk(LEDGER.buildDemandLedger({ entries: [dEntry('2026-W40', 'd1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['THREE_PL'])]);
  var wf2 = resolveW(s.proj, [wf(s.dl, 'd1', 'W40-A', 100, 12), wf(s.dl, 'd1', 'W40-B', 100, undefined)]);
  var wout = bridge(wf2);
  var wcmd = PB.buildRecommendation(wout);
  eq(wcmd.recommendationType, 'WEEKLY_SHIPPING', 'I1 Plan Builder accepts bridged Weekly facts');
  eq(wcmd.command.recommendedLines.length, 2, 'I2 both lines projected (no duplicate created)');
  eq(wcmd.generationType, 'scheduled', 'I3 Plan Builder maps mode SCHEDULED_REFRESH → scheduled (Plan-Builder-owned)');
  eq(wcmd.userQtyColumn, 'planned_qty', 'I4 Weekly userQty column stays Plan Builder/Persistence-owned (planned_qty)');
  var blk = wcmd.command.recommendedLines.filter(function (l) { return l.lineState === 'BLOCKED'; });
  eq([blk.length, blk[0].recommendedQty, blk[0].reason], [1, null, 'MISSING_OR_INVALID_UNITS_PER_CARTON'], 'I5 blocked line → lineState BLOCKED, recommendedQty null, reason carried through Plan Builder');
  eq(PB.splitLineKey('WEEKLY_SHIPPING', wcmd.command.recommendedLines[0].lineKey), { sku: 'CO1100-R', site_sku: 'ST-1', window_code: 'W40-A', source_warehouse_id: 'WH-3PL', route_no: '' }, 'I6 Plan Builder reconstructs the mechanical natural key (R3C2: 5-part; per-source WH-3PL threaded end-to-end)');
  // Monthly through the real Plan Builder
  var mout = bridge(monthlyFacts(function (dl) { return [mf(dl, 'd1', '2026-09', 'B1', 13, 12)]; }), { mode: 'MANUAL_REGENERATE' });
  var mcmd = PB.buildRecommendation(mout);
  eq([mcmd.recommendationType, mcmd.generationType, mcmd.userQtyColumn], ['MONTHLY_ORDER', 'manual_refresh', 'order_qty'], 'I7 Plan Builder accepts bridged Monthly facts; order_qty stays PB/Persistence-owned');
  eq(mcmd.command.recommendedLines[0].recommendedQty, 24, 'I8 Monthly recommendedQty flows through Plan Builder unchanged (24)');
  // deterministic Plan Builder output from the same bridged facts
  eq(PB.buildRecommendation(mout).command, mcmd.command, 'I9 deterministic Plan Builder command');
  // no live-analysis authority reached Plan Builder (no snapshotRow forbidden keys) — buildRecommendation did not throw
  ok(!wcmd.command.recommendedLines[0].hasOwnProperty('gap') && !wcmd.command.recommendedLines[0].hasOwnProperty('calculated_gap'), 'I10 no live-analysis authority persisted through Plan Builder');
})();

section('J. Purity / determinism / error');
(function () {
  var f = weeklyFacts(function (dl) { return [wf(dl, 'd1', 'W40-A', 100, 12)]; });
  var inp = { recommendationFacts: f, mode: 'SCHEDULED_REFRESH', calculationRunId: 'RUN-1', draftVersion: 1 };
  var snap = JSON.stringify(inp);
  var a1 = BR.bridgeRecommendationFactsToPlan(inp);
  ok(JSON.stringify(inp) === snap, 'J1 input not mutated');
  var a2 = BR.bridgeRecommendationFactsToPlan(inp);
  eq(a1, a2, 'J2 repeat deep-equal (deterministic)');
  ok(a1 !== a2 && a1.lines !== a2.lines, 'J3 fresh result objects');
  a1.lines.push({ tampered: 1 });
  eq(BR.bridgeRecommendationFactsToPlan(inp).lines.length, 1, 'J4 mutating a prior result does not leak');
  // permutation invariance — reversing the facts line order yields identical bridged output
  var multi = shell('MONTHLY_ORDER', MSCOPE, [
    { masterSku: 'CO1100-R', requestMonth: '2026-10', requestBucket: 'B2', recommendedQty: 48, blockedReason: null, demandKey: 'k2', lineage: ['demand:k2'], allocationBreakdown: [] },
    { masterSku: 'CO1100-R', requestMonth: '2026-09', requestBucket: 'B1', recommendedQty: 24, blockedReason: null, demandKey: 'k1', lineage: ['demand:k1'], allocationBreakdown: [] }
  ]);
  var rev = shell('MONTHLY_ORDER', MSCOPE, multi.lines.slice().reverse());
  eq(bridge(multi).lines, bridge(rev).lines, 'J5 permutation-invariant bridged lines (sorted by mapped key)');
  // malformed input
  throwsType(function () { BR.bridgeRecommendationFactsToPlan(null); }, 'J6 null input → TypeError');
  throwsType(function () { BR.bridgeRecommendationFactsToPlan({ mode: 'SCHEDULED_REFRESH', calculationRunId: 'R' }); }, 'J7 missing recommendationFacts → TypeError');
  throwsType(function () { bridge({ recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: WSCOPE, lines: 'x' }); }, 'J8 non-array lines → TypeError');
  throwsType(function () { bridge(shell('WEEKLY_SHIPPING', WSCOPE, [42])); }, 'J9 non-object line → TypeError');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1O Recommendation Facts → Plan Builder Bridge assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
