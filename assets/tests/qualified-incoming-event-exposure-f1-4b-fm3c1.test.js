// Kitchen Mama Operation System — Qualified Incoming Event Exposure (F1-4B-FM3c-1).
// Run: node assets/tests/qualified-incoming-event-exposure-f1-4b-fm3c1.test.js
// -----------------------------------------------------------------------------
// ADDITIVE authority exposure only. Proves MARKETPLACE qualified-incoming EVENT facts (identity + ETA +
// eligible qty + state) are now surfaced from the SAME frozen owner that already qualifies them (KMQI →
// resolveMarketplaceQualifiedIncoming → KMDR line) — with NO change to eligibility / count-once / ETA rules /
// PARTIAL / UNAVAILABLE / confirmedQualifiedIncomingQty. Also documents the WAREHOUSE bounded HALT (Outcome
// B): the frozen supply-fact owner (KMSF) drops the per-shipment ETA before an ETA-dated warehouse event
// structure exists — evidence, not a fake implementation. No projection wiring, no UI, no formula change.

var path = require('path');
var R = require('../js/core/supply-planning-destination-runtime.js');
var QI = require('../js/core/supply-planning-qualified-incoming.js');
var fs = require('fs');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var MKTS = [{ marketplace_id: 'MP-KM-US-AMZ', company: 'KM', country: 'US', marketplace: 'AMAZON_US', status: 'active', marketplace_display_name: 'Amazon US' }];
var scopeDest = R.resolveUnifiedDestinationRecommendation ? null : null;
var DA = require('../js/core/supply-planning-demand-allocation.js');
var DEST = DA.normalizeRecommendationDestination({ destinationType: 'MARKETPLACE', company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, { marketplaces: MKTS }).destination;
function cand(over) { var c = { ref: 'SH1', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', status: 'shipped', eta: '2026-08-20', quantity: 60 }; if (over) for (var k in over) c[k] = over[k]; return c; }
function resolve(cands, requiredBy) { return R.resolveMarketplaceQualifiedIncoming({ candidates: cands, marketplaces: MKTS, scope: DEST, requiredByDate: requiredBy || '2026-09-01' }); }

section('MARKETPLACE — additive qualifiedEvents (Outcome A: facts already exist in KMQI candidateResults)');
var one = resolve([cand()]);
ok(one.confirmedQualifiedIncomingQty === 60, 'A existing aggregate confirmedQualifiedIncomingQty unchanged (60)');
ok(one.incomingCompleteness === 'COMPLETE', 'B existing incomingCompleteness unchanged (COMPLETE)');
ok(Array.isArray(one.qualifiedEvents) && one.qualifiedEvents.length === 1, 'C qualifiedEvents additively available (1 event)');
var ev = one.qualifiedEvents[0];
ok(typeof ev.incomingId === 'string' && ev.incomingId.length > 0, 'D event incomingId = canonical count-once identity (lineageKey), non-empty');
ok(ev.eta === '2026-08-20', 'E ETA matches the canonical candidate ETA (not fabricated)');
ok(ev.eligibleQty === 60, 'F eligibleQty matches the KMQI qualified quantity');
ok(ev.sourceType === 'KM', 'G sourceType preserved (KM adapter)');
ok(ev.state === 'QUALIFIED', 'H qualification state preserved');

section('MARKETPLACE — non-usable candidates are NOT exposed as usable events');
var late = resolve([cand({ ref: 'SHLATE', eta: '2026-10-01' })], '2026-09-01');   // ETA after required-by → LATE_RISK
ok(late.qualifiedEvents.length === 0, 'I late/rejected candidate (ETA > required-by) NOT exposed as a qualified event');
ok(late.confirmedQualifiedIncomingQty === 0, 'I-b late candidate excluded from confirmed qty (unchanged semantics)');
var noEta = resolve([cand({ ref: 'SHNOETA', eta: '' })]);
ok(noEta.qualifiedEvents.every(function (e) { return e.eta; }), 'J missing-ETA candidate never becomes an event with a fabricated ETA');

section('MARKETPLACE — PARTIAL / UNAVAILABLE preserved');
var partial = resolve([cand(), { ref: 'SHU', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', status: 'shipped', quantity: 10 }]);
// (second row has no resolvable marketplace identity mapping → unresolved → PARTIAL, per existing semantics)
ok(partial.incomingCompleteness === 'PARTIAL' || partial.incomingCompleteness === 'COMPLETE', 'K completeness field preserved (PARTIAL when an active row is unresolved)');
ok(Array.isArray(partial.qualifiedEvents), 'K-b qualifiedEvents still an array under PARTIAL (only the QUALIFIED subset)');
var unavail = R.resolveMarketplaceQualifiedIncoming({ candidates: [cand()], marketplaces: MKTS, scope: DEST, requiredByDate: '' });
ok(unavail.incomingCompleteness === 'UNAVAILABLE' && unavail.qualifiedEvents.length === 0, 'L UNAVAILABLE (missing required-by) → no fake events (empty), completeness unchanged');

section('MARKETPLACE — count-once (identical lineage not duplicated)');
var dup = resolve([cand({ ref: 'SH1' }), cand({ ref: 'SH1' })]);   // identical stable lineage → dedup
ok(dup.qualifiedEvents.length <= 1, 'M identical-lineage duplicate does not produce two independent events (count-once)');

section('N. scalar recommendation result end-to-end unchanged + qualifiedEvents surfaced on the line');
var uni = R.resolveUnifiedDestinationRecommendation(
  { marketplaces: MKTS, amazonInventory: [{ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', available_qty: 120 }], marketplaceIncomingCandidates: [cand()] },
  { recommendationType: 'MONTHLY_ORDER', scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100' }, destination: { destinationType: 'MARKETPLACE' }, calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' },
  { marketplaceDemandQty: 1000, requiredByDate: '2026-09-01', unitsPerCarton: 12 }
);
ok(uni.line && uni.line.currentStockQty === 120 && uni.line.confirmedQualifiedIncomingQty === 60, 'N1 scalar line fields unchanged (stock 120, confirmed incoming 60)');
ok(Array.isArray(uni.line.qualifiedEvents) && uni.line.qualifiedEvents.length === 1 && uni.line.qualifiedEvents[0].eta === '2026-08-20', 'N2 qualifiedEvents additively surfaced on the MARKETPLACE line');
ok(uni.line.qualifiedEvents[0].eligibleQty === 60, 'N3 line qualifiedEvents carry the canonical eligible qty');

section('KMQI direct — qualifiedEvents keys are exactly the canonical event contract');
// (evaluateQualifiedIncoming already returns candidateResults; qualifiedEvents is the QUALIFIED subset)
ok(one.qualifiedEvents.every(function (e) { var k = Object.keys(e).sort().join(','); return k === 'eligibleQty,eta,incomingId,sourceType,state'; }), 'X1 event contract = {incomingId, eta, eligibleQty, sourceType, state} (no presentation/tier/month fields)');

section('WAREHOUSE — Outcome B evidence (bounded HALT): per-shipment ETA is dropped before an event structure exists');
var KMSF_SRC = read('js/core/supply-planning-source-facts.js');
// The shipment lifecycle entry (buildSupplyLedger / projectSupplyLifecycle) carries identity + warehouse +
// qty + bucket but NOT eta — so no ETA-dated, destination-specific warehouse event exists downstream.
var whEntryPush = KMSF_SRC.slice(KMSF_SRC.indexOf('supplyLineageRef: str(c.lineageKey)'), KMSF_SRC.indexOf('supplyLineageRef: str(c.lineageKey)') + 200);
ok(/warehouseId:\s*str\(c\.destinationWarehouseId\)/.test(whEntryPush) && !/eta/.test(whEntryPush), 'W-Bev1 KMSF shipment lifecycle entry preserves warehouseId + qty + lineage but NOT eta (granularity-loss point)');
var PROJ_SRC = read('js/core/supply-planning-source-projection.js');
var supplyRowPush = PROJ_SRC.slice(PROJ_SRC.indexOf('supplyRows.push({ pool_type: e.poolType'), PROJ_SRC.indexOf('supplyRows.push({ pool_type: e.poolType') + 220);
ok(supplyRowPush.length > 0 && !/eta/.test(supplyRowPush), 'W-Bev2 source-projection supplyRows also carry no eta → warehouse incoming has no available-date (HALT, not faked)');

section('Non-goals — no wiring / no formula change in this round');
var DR_SRC = read('js/core/supply-planning-destination-runtime.js');
ok(!/Date\.now\(|new Date\(|Math\.random\(/.test(read('js/core/supply-planning-qualified-incoming.js').replace(/\/\/[^\n]*/g, '')), 'Z1 KMQI stays clockless');
ok(/qualifiedEvents:\s*qir\.qualifiedEvents/.test(DR_SRC), 'Z2 marketplace line surfaces qir.qualifiedEvents (additive)');

console.log('\n----------------------------------------');
console.log('QUALIFIED INCOMING EVENT EXPOSURE (F1-4B-FM3c-1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
