// Kitchen Mama Operation System — F1-4B-FM7-R2G-B Contended Factory Cross-Company Pre-Pass.
// Run: node assets/tests/factory-contention-prepass-f1-4b-fm7r2gb.test.js
// -----------------------------------------------------------------------------
// The Order Planning FACTORY double-use (43 grouped by company||sku → each company independently consumed the SAME
// physical pool) is fixed by a SELECTIVE cross-company conservation pre-pass: cheap candidate discovery (marketplace_skus
// sku listed by >=2 companies AND factory_stock exists) → harvest ONLY candidate scopes → confirm >=2 companies with
// eligible Factory demand = CONTENDED → one KMAR cross-company pass → compact partition {receiverKey:qty}. Contended
// skus consume the partition; uncontended skus keep the existing company-local path. The resumable job runs the pre-pass
// as a bounded, crash-safe, size-gated phase BEFORE the per-company slices. This proves candidate conservatism,
// contention confirmation, physical-pool conservation, monolithic==resumable, fail-closed routing, the no-contention
// fast path, mixed workloads, multi-warehouse pools, and the two runtime/size HALT gates. Formulas are untouched.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var F43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var F46 = read('specs/active/apps-script/46_api_v1_gap_materialization_job.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var PRE = 'function prodRequireSheet_(ss, name){ if (ss && ss.__missingSheet) throw new Error("MISSING_SHEET:"+name); return (ss && ss.getSheetByName) ? (ss.getSheetByName(name) || {__sheet:true}) : {__sheet:true}; }\n';
var H = (new Function(BUNDLE + '\n' + F42 + '\n' + PRE + F43 + '\n' + F46 + '\n return {' +
  ' findCandidates: gapOpFindFactoryContentionCandidates_, computeContention: gapOpComputeFactoryContention_,' +
  ' runPrepass: gapOpRunFactoryContentionPrepass_, harvest: gapOpHarvestReceivers_,' +
  ' buildAlloc: gapOpBuildSupplyAllocation_, processOp: gapProcessOrderPlanningScopeSlice_, receiverKey: gapReceiverKey_,' +
  ' start: gapJobStart_, cont: gapJobContinue_, status: gapJobStatus_, newState: gapJobNewState_, publicState: gapJobPublicState_,' +
  ' PHASES: GAP_JOB_PHASES_, SAFE_BYTES: GAP_JOB_PARTITION_SAFE_BYTES_, PROP_KEYS: GAP_JOB_PROP_KEYS_ };'))();

// ---- fixtures -----------------------------------------------------------------------------------------------
function fakeSheet(header, rows) { var vals = [header].concat(rows || []); return { getLastRow: function () { return vals.length; }, getLastColumn: function () { return header.length; }, getDataRange: function () { return { getValues: function () { return vals; } }; } }; }
function fakeSs(sheets) { return { getSheetByName: function (n) { return sheets[n] || null; } }; }
function mktRow(company, country, marketplace, sku) { return [company, country, marketplace, sku]; }
function factoryPool(wh, sku, qty) { return { poolKey: 'FC:' + wh + ':' + sku, poolType: 'FACTORY', warehouseId: wh, effectiveSupplyQty: qty }; }
// a harvested receiver as PASS-1 produces it (with its canonical .key)
function recv(company, country, marketplace, sku, demandQty, priority) {
  var r = { company: company, country: country, marketplace: marketplace, sku: sku, demandQty: demandQty, allocationPriority: priority || 0, requiredByDate: '2026-09-01' };
  r.key = H.receiverKey(company, country, marketplace, sku); return r;
}
function sumFactory(byKey) { var t = 0; for (var k in byKey) if (Object.prototype.hasOwnProperty.call(byKey, k)) t += (byKey[k].factoryCoveredQty || 0); return t; }

// pool X = 60 (single physical pool); A contends 2 marketplaces, B contends 1 → cross-company competition for 60.
var POOLS_X = { overseasPoolsByKey: {}, factoryPoolsBySku: { X: [factoryPool('WF', 'X', 60)] }, eligibleFactoryWarehouseIds: ['WF'], priorityByMkt: {} };
function receiversX() { return [recv('A', 'US', 'AMAZON_US', 'X', 100, 1), recv('A', 'US', 'WALMART_US', 'X', 100, 0), recv('B', 'US', 'AMAZON_US', 'X', 100, 0)]; }

// =============================================================================================================
section('§1/§13/§14 A-D — candidate discovery is a cheap conservative superset (>=2 companies AND factory stock)');
var msSheet = fakeSheet(['company', 'country', 'marketplace', 'sku'], [
  mktRow('A', 'US', 'AMAZON_US', 'X'), mktRow('B', 'US', 'AMAZON_US', 'X'),   // X: 2 companies + factory stock → CANDIDATE
  mktRow('A', 'US', 'AMAZON_US', 'Y'),                                        // Y: 1 company → excluded
  mktRow('B', 'US', 'AMAZON_US', 'Z'),                                        // Z: 1 company → excluded
  mktRow('A', 'US', 'AMAZON_US', 'W'), mktRow('B', 'UK', 'AMAZON_UK', 'W')    // W: 2 companies but NO factory stock → excluded
]);
var poolFactsABC = { overseasPoolsByKey: {}, factoryPoolsBySku: { X: [factoryPool('WF', 'X', 60)], Y: [factoryPool('WF', 'Y', 10)], Z: [factoryPool('WF', 'Z', 10)] }, eligibleFactoryWarehouseIds: ['WF'], priorityByMkt: {} };
var disc = H.findCandidates(fakeSs({ marketplace_skus: msSheet }), poolFactsABC);
eq(Object.keys(disc.candidateSkus).sort(), ['X'], 'A/B multi-company + factory-stock sku X is the ONLY candidate (single-company Y/Z excluded)');
ok(!disc.candidateSkus.W, 'D a >=2-company sku with NO physical factory_stock (W) is excluded (nothing to contend)');
eq(disc.candidateScopes.map(function (s) { return s.company + '/' + s.country + '/' + s.marketplace; }).sort(), ['A/US/AMAZON_US', 'B/US/AMAZON_US'], 'candidateScopes = only the sites listing a candidate sku (bounds the expensive harvest)');
// conservatism: a genuinely cross-company sku can NEVER be missed — different country/marketplace/priority still discovered
var msSheet2 = fakeSheet(['company', 'country', 'marketplace', 'sku'], [mktRow('A', 'US', 'AMAZON_US', 'X'), mktRow('B', 'DE', 'AMAZON_DE', 'X')]);
ok(H.findCandidates(fakeSs({ marketplace_skus: msSheet2 }), POOLS_X).candidateSkus.X === 1, 'B(false-negative-prevention) same sku across DIFFERENT country/marketplace is still a candidate (physical pool = warehouse+sku)');

section('§3/§13 F-G — candidate is NOT yet contended: canonical demand confirms it');
// false positive: X listed by A+B, but only A actually has Factory demand → UNCONTESTED (no partition)
var fpDemand = H.computeContention([recv('A', 'US', 'AMAZON_US', 'X', 100, 0)], POOLS_X);
eq([fpDemand.contendedSkuCount, Object.keys(fpDemand.partition).length], [0, 0], 'F a candidate with demand from only ONE company is UNCONTESTED (no cross-company partition)');
var realContention = H.computeContention(receiversX(), POOLS_X);
eq(realContention.contendedSkuCount, 1, 'G actual >=2-company Factory demand → sku X CONTENDED');
ok(realContention.contendedSkus.X === 1, 'G2 the contended manifest names sku X');

section('§4/§8/§I/§J H-J — physical pool counted once; Σ allocated <= supply; conserved partition');
ok(Object.keys(realContention.partition).length === 3, 'H every contended receiver seeded in the partition (fail-closed completeness)');
var partTotal = 0; for (var pk in realContention.partition) partTotal += realContention.partition[pk];
ok(partTotal === 60, 'I Σ factory allocated across A+B == physical pool 60 (never 120 — pool counted ONCE, double-use impossible)');
ok(partTotal <= 60, 'J allocated <= physical supply (conserved)');

section('§15/§L K — K1 scenario: monolithic conserved == resumable (per-company slices consume the SAME partition)');
var recvX = receiversX();
var contention = H.computeContention(recvX, POOLS_X);
var mono = H.buildAlloc(recvX, POOLS_X, contention).byReceiverKey;                                   // all companies at once
var aOnly = H.buildAlloc(recvX.filter(function (r) { return r.company === 'A'; }), POOLS_X, contention).byReceiverKey;
var bOnly = H.buildAlloc(recvX.filter(function (r) { return r.company === 'B'; }), POOLS_X, contention).byReceiverKey;
var merged = {}; [aOnly, bOnly].forEach(function (m) { for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) merged[k] = m[k]; });
eq(merged, mono, 'K/L per-company slices (union) == monolithic conserved allocation — chunk boundary is inert');
eq(sumFactory(mono), 60, 'K2 total Factory across companies == 60 (the previous double-use of 120 is FIXED)');
// the pre-1 defect, reproduced WITHOUT contention (old grouping) doubled the pool:
var doubleUse = H.buildAlloc(recvX, POOLS_X).byReceiverKey;                                          // no contention → old company||sku grouping
ok(sumFactory(doubleUse) === 120, 'K3 the OLD (no-contention) grouping over-allocates 120 (2× the 60 pool) — this is what the pre-pass eliminates');

section('§12/§O O — a CONTENDED receiver missing from the partition FAILS CLOSED (never a full-pool fallback)');
var badContention = { contendedSkus: { X: 1 }, partition: {} };   // contended but empty partition
var threw = false; try { H.buildAlloc(receiversX(), POOLS_X, badContention); } catch (e) { threw = /FACTORY_CONTENTION_PARTITION_MISSING/.test(e.message); }
ok(threw, 'O a contended sku whose receiver is absent from the partition THROWS FACTORY_CONTENTION_PARTITION_MISSING (fail closed)');

section('§10/§13/§17/§P P-Q — uncontended skus keep the existing company-local path; mixed workload');
var mixedPools = { overseasPoolsByKey: {}, factoryPoolsBySku: { X: [factoryPool('WF', 'X', 60)], Y: [factoryPool('WF', 'Y', 40)], Z: [factoryPool('WF', 'Z', 30)] }, eligibleFactoryWarehouseIds: ['WF'], priorityByMkt: {} };
var mixedRecv = [recv('A', 'US', 'AMAZON_US', 'X', 100, 0), recv('B', 'US', 'AMAZON_US', 'X', 100, 0),   // X contended (A+B)
  recv('A', 'US', 'AMAZON_US', 'Y', 25, 0),   // Y — A only (uncontended)
  recv('B', 'US', 'AMAZON_US', 'Z', 15, 0)];  // Z — B only (uncontended)
var mixC = H.computeContention(mixedRecv, mixedPools);
eq(Object.keys(mixC.contendedSkus).sort(), ['X'], 'Q only X is contended; Y and Z stay uncontended');
var mixAlloc = H.buildAlloc(mixedRecv, mixedPools, mixC).byReceiverKey;
// UNCHANGED existing behavior: KMMSA's single-receiver rule assigns 100% of the eligible pool (NOT demand-capped).
eq(mixAlloc[H.receiverKey('A', 'US', 'AMAZON_US', 'Y')].factoryCoveredQty, 40, 'P uncontended Y keeps existing company-local allocation (sole receiver → 100% of pool 40)');
eq(mixAlloc[H.receiverKey('B', 'US', 'AMAZON_US', 'Z')].factoryCoveredQty, 30, 'P2 uncontended Z keeps existing company-local allocation (100% of pool 30)');
eq(sumFactory({ x1: mixAlloc[H.receiverKey('A', 'US', 'AMAZON_US', 'X')], x2: mixAlloc[H.receiverKey('B', 'US', 'AMAZON_US', 'X')] }), 60, 'Q2 contended X still conserved to 60 across A+B');

section('§16/§R R — the no-contention FAST PATH: an empty/absent contention runs the existing per-company path');
var noneAlloc = H.buildAlloc([recv('A', 'US', 'AMAZON_US', 'Y', 25, 0)], { overseasPoolsByKey: {}, factoryPoolsBySku: { Y: [factoryPool('WF', 'Y', 40)] }, eligibleFactoryWarehouseIds: ['WF'], priorityByMkt: {} }, { contendedSkus: {}, partition: {} }).byReceiverKey;
eq(noneAlloc[H.receiverKey('A', 'US', 'AMAZON_US', 'Y')].factoryCoveredQty, 40, 'R an empty-but-present contention → company-local allocation unchanged (sole receiver → 100% of pool 40)');

section('§4/§S S — MULTI-WAREHOUSE physical pools (warehouse_id+sku) counted once each; conserved across companies');
var mwPools = { overseasPoolsByKey: {}, factoryPoolsBySku: { X: [factoryPool('W1', 'X', 600), factoryPool('W2', 'X', 400)] }, eligibleFactoryWarehouseIds: ['W1', 'W2'], priorityByMkt: {} };
var mwRecv = [recv('A', 'US', 'AMAZON_US', 'X', 700, 0), recv('B', 'US', 'AMAZON_US', 'X', 700, 0)];
var mwC = H.computeContention(mwRecv, mwPools);
var mwTotal = 0; for (var mk in mwC.partition) mwTotal += mwC.partition[mk];
eq(mwTotal, 1000, 'S two physical pools (W1=600 + W2=400) allocate to exactly 1000 total across A+B (each pool counted once, no double-use)');
ok(mwTotal <= 1000, 'S2 Σ allocated <= physical supply across both warehouses');

section('§6/§16 — pre-pass owner: no candidate → fast path (NO harvest); candidate → harvest + conserve');
var prepassIoNoCall = { workspaceGet: function () { throw new Error('MUST_NOT_HARVEST_WHEN_NO_CANDIDATE'); } };
var noCandSs = fakeSs({ marketplace_skus: fakeSheet(['company', 'country', 'marketplace', 'sku'], [mktRow('A', 'US', 'AMAZON_US', 'Y')]) });   // 1 company → no candidate
var preNone = H.runPrepass(prepassIoNoCall, noCandSs, poolFactsABC);
eq([preNone.candidateScopeCount, preNone.contendedSkuCount, Object.keys(preNone.contention.partition).length], [0, 0, 0], 'pre-pass with NO candidate does zero harvest and returns an empty partition (§16 fast path)');
// candidate present → harvest returns canonical MARKETPLACE_ORDER_NEED lines for X; confirm contention + conserve
function opLine(sku, qty) { return { sku: sku, recommendationMode: 'MARKETPLACE_ORDER_NEED', blocked: false, allocatedForecastQty: qty, monthlyProjection: [{ tier: 'T1', month: '2026-09' }] }; }
var harvestIo = { workspaceGet: function (body) { var sc = body.payload.scope; return { success: true, meta: { calculationMonth: '2026-09' }, data: { lines: [opLine('X', 100)] } }; } };
var candSs = fakeSs({ marketplace_skus: fakeSheet(['company', 'country', 'marketplace', 'sku'], [mktRow('A', 'US', 'AMAZON_US', 'X'), mktRow('B', 'US', 'AMAZON_US', 'X')]) });
var preX = H.runPrepass(harvestIo, candSs, POOLS_X);
eq([preX.candidateSkuCount, preX.contendedSkuCount], [1, 1], 'pre-pass harvests the candidate scopes → confirms X contended');
var preTotal = 0; for (var ptk in preX.contention.partition) preTotal += preX.contention.partition[ptk];
eq(preTotal, 60, 'pre-pass partition conserves the physical pool to 60 across A+B');

// =============================================================================================================
// job-lifecycle fakes (Script Properties + lock + scheduler + clock + slice + pre-pass), self-contained.
function fakeEnv(opts) {
  opts = opts || {}; var store = {}, scheduled = [], cleared = [], processed = [], clock = 0, msClock = 0, lockHeld = false, prepassCalls = 0;
  return {
    _store: store, _scheduled: scheduled, _cleared: cleared, _processed: processed, get _prepassCalls() { return prepassCalls; },
    nowMs: function () { return msClock; }, _advanceMs: function (d) { msClock += d; },
    props: { get: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, set: function (k, v) { store[k] = v; }, del: function (k) { delete store[k]; } },
    lock: { acquire: function () { if (lockHeld) return false; lockHeld = true; return true; }, release: function () { lockHeld = false; } },
    resolveContext: function (p) { return { ok: true, jobType: p, calculationDate: '2026-08-09', calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' }; },
    openTarget: function () { return { __ss: true }; },
    requireResultSheet: function () { return { __sheet: true }; },
    enumerateScopes: function () { return (opts.scopes || []).slice(); },
    newRunId: function () { return 'GAP-OP-20260810T000000-0001'; },
    timestamp: function () { clock++; return '2026-08-10 00:00:' + ('0' + (clock % 60)).slice(-2); },
    workerBudgetMs: opts.workerBudgetMs,
    scheduleContinuation: function (p, ms) { scheduled.push({ product: p, ms: ms }); },
    clearContinuationTriggers: function (p) { cleared.push(p); for (var i = scheduled.length - 1; i >= 0; i--) if (scheduled[i].product === p) scheduled.splice(i, 1); },
    runFactoryPrepass: function (p, ss, ctx) { prepassCalls++; if (opts.prepassThrows) throw new Error('PREPASS_BOOM'); return opts.prepass || { contention: { contendedSkus: {}, partition: {} }, candidateSkuCount: 0, contendedSkuCount: 0, contendedReceiverCount: 0 }; },
    processSlice: function (product, sliceScopes, ss, sheet, ctx) {
      processed.push({ scopes: sliceScopes.map(function (s) { return s.company; }), factoryContention: ctx.factoryContention });
      msClock += (opts.sliceMs != null ? opts.sliceMs : 300000);
      return { written: sliceScopes.length, ready: sliceScopes.length, blocked: 0, errors: 0, scopeErrors: [] };
    }
  };
}
function opScopes() { return [{ company: 'A', country: 'US', marketplace: 'AMAZON_US' }, { company: 'B', country: 'US', marketplace: 'AMAZON_US' }]; }
function isTerminal(s) { return s === 'DONE' || s === 'FAILED' || s === 'CANCELLED' || s === 'STALLED'; }

section('§6 M/N — job runs the pre-pass phase BEFORE the company slices; the partition is persisted + injected');
var e1 = fakeEnv({ scopes: opScopes(), prepass: { contention: { contendedSkus: { X: 1 }, partition: { 'A||US||AMAZON_US||X': 60, 'B||US||AMAZON_US||X': 0 } }, candidateSkuCount: 1, contendedSkuCount: 1, contendedReceiverCount: 2 } });
var st1 = H.start('ORDER_PLANNING', e1);
eq(JSON.parse(e1._store[H.PROP_KEYS.ORDER_PLANNING]).phase, H.PHASES.FACTORY_PREPASS, 'M1 a fresh OP job starts in the FACTORY_PREPASS phase');
var pp = H.cont('ORDER_PLANNING', e1);   // pre-pass worker
eq([pp.phase, e1._prepassCalls, e1._processed.length], [H.PHASES.COMPANY_SLICES, 1, 0], 'M2 the first worker runs the pre-pass ONCE (no slice yet) then advances to COMPANY_SLICES');
var stored1 = JSON.parse(e1._store[H.PROP_KEYS.ORDER_PLANNING]);
eq([stored1.factoryContendedCount, stored1.factoryContendedReceiverCount], [1, 2], 'M3 contention diagnostics persisted (counts)');
ok(stored1.factoryContention === null && stored1.factoryContentionMeta && stored1.factoryContentionMeta.chunkCount >= 1, 'M4 the partition is persisted via multi-property chunked storage (META in state; not inline) — content round-trip proven by N2');
ok(stored1.factoryPartitionBytes > 0 && stored1.factoryPartitionBytes <= H.SAFE_BYTES, 'M5 partition serialized bytes recorded within the safe budget');
// next workers run the company slices, consuming the injected partition
var slice1 = H.cont('ORDER_PLANNING', e1);
eq([slice1.status, e1._processed.length], ['RUNNING', 1], 'N1 the next worker runs a company slice (A)');
ok(e1._processed[0].factoryContention && e1._processed[0].factoryContention.partition['A||US||AMAZON_US||X'] === 60, 'N2 the slice received the persisted contention partition via ctx (never re-inlined)');
var last = slice1; for (var g = 0; g < 6 && !isTerminal(last.status); g++) last = H.cont('ORDER_PLANNING', e1);
eq(last.status, 'DONE', 'N3 the job reaches DONE after the pre-pass + both company slices');
eq(e1._prepassCalls, 1, 'N4 the pre-pass ran EXACTLY once for the whole run (not per company)');

section('public STATUS surfaces contention COUNTS only — never the partition/receiver payload (§8/§29 Test 2)');
var pubOp = H.status('ORDER_PLANNING', null, e1).data;
ok('factoryContendedCount' in pubOp && 'factoryCandidateCount' in pubOp && 'phase' in pubOp, 'the diagnostics counts + phase are exposed for triage');
ok(pubOp.factoryContention === undefined && !/partition|X\b|\|\|/.test(JSON.stringify(pubOp)), 'the partition / receiver keys are NEVER surfaced in public status');

section('§7 — pre-pass that never completes → truthful terminal CONTENDED_FACTORY_PREPASS_EXCEEDS_WORKER_BUDGET');
var eBudget = fakeEnv({ scopes: opScopes(), prepassThrows: true });
H.start('ORDER_PLANNING', eBudget);
var bLast = null; for (var bi = 0; bi < 8 && !(bLast && isTerminal(bLast.status)); bi++) bLast = H.cont('ORDER_PLANNING', eBudget);
eq(bLast.status, 'FAILED', 'the pre-pass failing across bounded attempts → terminal FAILED (never a silent per-company double-use fallback)');
ok(/FACTORY_PREPASS_FAILED|CONTENDED_FACTORY_PREPASS_EXCEEDS_WORKER_BUDGET/.test(bLast.lastError || ''), 'the terminal reason names the pre-pass budget/failure gate');
ok(eBudget._processed.length === 0, 'no company slice ran when the pre-pass never produced a partition (fail closed)');

section('§9 — F1-7N-FA-3C-PRE1: an oversize partition is stored via MULTI-PROPERTY chunks (authorized) — no size terminal, no auto-split of allocation');
var bigPartition = {}; for (var r = 0; r < 500; r++) bigPartition['CO||US||AMAZON_US||SKU-LONG-IDENTIFIER-' + r] = r;
var eSize = fakeEnv({ scopes: opScopes(), prepass: { contention: { contendedSkus: { X: 1 }, partition: bigPartition }, candidateSkuCount: 1, contendedSkuCount: 1, contendedReceiverCount: 500 } });
H.start('ORDER_PLANNING', eSize);
var sizeRes = H.cont('ORDER_PLANNING', eSize);
ok(sizeRes.status !== 'FAILED', '§9 oversize partition no longer terminates (single-property size limit superseded by authorized multi-property storage)');
var sizeStored = JSON.parse(eSize._store[H.PROP_KEYS.ORDER_PLANNING]);
eq(sizeStored.phase, H.PHASES.COMPANY_SLICES, '§9 pre-pass ADVANCES to COMPANY_SLICES after chunked persist (partition intact, no double-use)');
ok(sizeStored.factoryContentionMeta && sizeStored.factoryContentionMeta.chunkCount > 1, '§9 partition stored as MULTIPLE safe chunks');
var partPrefix9 = H.PROP_KEYS.ORDER_PLANNING + ':PART:';
var chunkKs9 = Object.keys(eSize._store).filter(function (k) { return k.indexOf(partPrefix9) === 0; });
eq(chunkKs9.length, sizeStored.factoryContentionMeta.chunkCount, '§9 exactly one property per chunk');
chunkKs9.forEach(function (k) { ok(String(eSize._store[k]).length <= H.SAFE_BYTES, '§9 chunk within safe per-value budget: ' + k); });

section('§22/§X — INVENTORY has NO pre-pass phase (unchanged); it starts directly in COMPANY_SLICES');
var eInv = fakeEnv({ scopes: [{ company: 'KM', country: 'US', marketplace: 'AMAZON_US' }] });
H.start('INVENTORY', eInv);
eq(JSON.parse(eInv._store[H.PROP_KEYS.INVENTORY]).phase, H.PHASES.COMPANY_SLICES, 'X Inventory job starts in COMPANY_SLICES (no shared pool → no contention pre-pass)');
H.cont('INVENTORY', eInv);
eq([eInv._prepassCalls, eInv._processed.length], [0, 1], 'X2 Inventory never invokes the pre-pass; its first worker runs a slice directly');

console.log('\n----------------------------------------');
console.log('FACTORY CONTENTION PRE-PASS (F1-4B-FM7-R2G-B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
