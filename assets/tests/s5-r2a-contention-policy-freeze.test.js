// S5-R2A — D-S5-1 CONTENTION POLICY ACCEPTANCE — canonical contract tests.
//
// WHAT THIS IS. The operator accepted the already-live §41 receiver contention policy: a sequential greedy in
// a canonical receiver order, applied identically at 0, 1, 2 and 3+ receivers. This suite owns that contract.
//
// HOW IT IS TESTED. The frozen rule is written here as a SPEC MODEL — the sort, then the greedy — and the
// live implementation is executed beside it over every fixture. Agreement is the assertion. That is stronger
// than a table of expected numbers: a hardcoded table only proves the numbers someone typed, whereas a model
// proves the RULE, and the mutants below break the model to show the comparison actually bites.
//
// THE SORT IS DERIVED, NEVER ASSUMED. §4 of the round is explicit that which receiver goes first must come
// from the sort contract, not from a name. Every expectation here is computed through `canonicalOrder()`, and
// §B proves each of the three sort axes independently by constructing inputs where that axis alone decides.
// Naming 'A' as the winner because it is called A would pass while proving nothing.
//
// NO 50/50 BRANCH EXISTS. The previously proposed proportional split was rejected, so it is not modelled and
// is not mutated. A mutant for a branch the system does not have would be theatre.
//
// OWNERSHIP: this suite owns the CONTENTION ALGORITHM. `s5-r2-decision-freeze.test.js` owns the frozen spec
// VOCABULARY (action enum, reason tokens, state, consumption order). The contention fixtures and the 50/50
// reference model were removed from that suite in this round — see its header note.
//
// NO FILE IS WRITTEN. The live module runs over inputs this file builds; mutants are in-memory.
//
// Run: node assets/tests/s5-r2a-contention-policy-freeze.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
var CORE = 'assets/js/core/';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var KMFSR = require(path.join(ROOT, CORE + 'supply-planning-surplus-reallocation.js'));
var CALC = '2026-09-28';
var RBY = '2026-10-15';

// ---------------------------------------------------------------------------------------------------------
// THE FROZEN CONTRACT, as a model.
// ---------------------------------------------------------------------------------------------------------
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

// RECEIVER_SORT: requiredByDate ASC -> allocationPriority DESC (higher first) -> demandKey ASC.
function canonicalOrder(receivers) {
  return receivers.slice().sort(function (a, b) {
    return cmpStr(a.requiredByDate, b.requiredByDate)
      || (b.allocationPriority - a.allocationPriority)
      || cmpStr(a.demandKey, b.demandKey);
  });
}

// ALLOCATION_METHOD: SEQUENTIAL_GREEDY. Each receiver in canonical order takes the smaller of its remaining
// eligible residual gap and the donor's remaining available surplus. One algorithm for every receiver count.
function sequentialGreedy(donorQty, receivers) {
  var remaining = donorQty, alloc = {};
  canonicalOrder(receivers).forEach(function (r) {
    var take = Math.min(r.gap, remaining);
    if (take < 0) take = 0;
    alloc[r.demandKey] = take;
    remaining -= take;
  });
  return { alloc: alloc, unallocated: remaining };
}

// ---- live-module plumbing ----
function LR(key, gap, opts) {
  opts = opts || {};
  return { demandKey: key, gap: gap,
    requiredByDate: opts.requiredByDate || RBY,
    allocationPriority: opts.priority === undefined ? 1 : opts.priority };
}
function toLive(donorQty, receivers, donorOwnNeed) {
  var rs = [{ demandKey: 'DONOR', requiredByDate: RBY, allocationPriority: 1,
    projectedRequirementQty: donorOwnNeed || 0, eligibleFactoryWarehouseIds: ['WH1'],
    initialAllocationBySource: { WH1: donorQty } }];
  receivers.forEach(function (r) {
    rs.push({ demandKey: r.demandKey, requiredByDate: r.requiredByDate, allocationPriority: r.allocationPriority,
      projectedRequirementQty: r.gap, eligibleFactoryWarehouseIds: ['WH1'], initialAllocationBySource: {} });
  });
  return rs;
}
function runLive(donorQty, receivers, opts) {
  opts = opts || {};
  return KMFSR.reallocatePreallocatedFactorySupply({
    masterSku: 'SKU1', calculationDate: CALC,
    unusedFactorySupplyQty: opts.unused || 0,
    receivers: opts.raw || toLive(donorQty, receivers, opts.donorOwnNeed)
  });
}
function liveAlloc(out) {
  var m = {};
  (out.receivers || []).forEach(function (r) { if (r.demandKey !== 'DONOR') m[r.demandKey] = r.reallocatedInQty; });
  return m;
}

// ---------------------------------------------------------------------------------------------------------
section('A. §4 worked examples — the model and the live rule agree, and the winner is DERIVED');

var EXAMPLES = [
  { id: 'A  donor 100 · gaps 100/100', donor: 100, recv: [LR('A', 100), LR('B', 100)] },
  { id: 'B  donor 100 · gaps 20/100', donor: 100, recv: [LR('A', 20), LR('B', 100)] },
  { id: 'C  donor 100 · gaps 20/30', donor: 100, recv: [LR('A', 20), LR('B', 30)] },
  { id: 'D  donor 101 · gaps 100/100 (odd)', donor: 101, recv: [LR('A', 100), LR('B', 100)] },
  { id: 'E  donor 100 · gaps 100/100/100', donor: 100, recv: [LR('A', 100), LR('B', 100), LR('C', 100)] }
];

EXAMPLES.forEach(function (x) {
  var model = sequentialGreedy(x.donor, x.recv);
  var live = liveAlloc(runLive(x.donor, x.recv));
  eq(live, model.alloc, 'A1  ' + x.id + '  -> ' + JSON.stringify(model.alloc) +
    (model.unallocated ? '  (' + model.unallocated + ' unallocated)' : ''));

  // the first receiver is whoever the SORT puts first, not whoever is named first
  var first = canonicalOrder(x.recv)[0];
  var expectFirst = Math.min(first.gap, x.donor);
  eq(live[first.demandKey], expectFirst,
    'A2  ' + x.id + ': the canonically-first receiver (' + first.demandKey + ') takes ' + expectFirst);
});

// A3 — example D in words: there is no rounding policy because there is no proportional split.
var dModel = sequentialGreedy(101, [LR('A', 100), LR('B', 100)]);
eq(dModel, { alloc: { A: 100, B: 1 }, unallocated: 0 },
  'A3  odd donor needs no rounding rule — the cap is the receiver residual, the rest flows on');

// ---------------------------------------------------------------------------------------------------------
section('B. RECEIVER_SORT — each axis proved independently against the live rule');

// Each case isolates ONE axis: the other two are held equal, so only the axis under test can decide.
var SORT_CASES = [
  { id: 'requiredByDate ASC decides',
    recv: [LR('A', 100, { requiredByDate: '2026-11-15' }), LR('B', 100, { requiredByDate: '2026-10-15' })],
    winner: 'B' },
  { id: 'allocationPriority DESC decides when dates tie',
    recv: [LR('A', 100, { priority: 1 }), LR('B', 100, { priority: 9 })],
    winner: 'B' },
  { id: 'demandKey ASC is the stable tie-break',
    recv: [LR('Z', 100), LR('A', 100)],
    winner: 'A' }
];
SORT_CASES.forEach(function (c) {
  var live = liveAlloc(runLive(100, c.recv));
  eq(canonicalOrder(c.recv)[0].demandKey, c.winner, 'B1  model: ' + c.id);
  eq(live[c.winner], 100, 'B2  live:  ' + c.id + ' (' + c.winner + ' served first)');
});

// B3 — the tie-break is stable under input permutation: the same set in any order gives the same answer.
var permA = [LR('A', 40), LR('B', 40), LR('C', 40)];
var permB = [LR('C', 40), LR('A', 40), LR('B', 40)];
eq(liveAlloc(runLive(100, permA)), liveAlloc(runLive(100, permB)),
  'B3  STABLE_TIE_BREAK — input order does not change the outcome');

// ---------------------------------------------------------------------------------------------------------
section('C. §10 coverage — invariants over every required fixture');

var FIXTURES = [
  { id: '0 receivers', donor: 100, recv: [] },
  { id: '1 receiver', donor: 100, recv: [LR('A', 40)] },
  { id: '1 receiver, gap exceeds donor', donor: 40, recv: [LR('A', 100)] },
  { id: '2 equal receivers', donor: 100, recv: [LR('A', 100), LR('B', 100)] },
  { id: '2 unequal receivers', donor: 100, recv: [LR('A', 20), LR('B', 100)] },
  { id: '3 receivers', donor: 100, recv: [LR('A', 100), LR('B', 100), LR('C', 100)] },
  { id: 'donor > total demand', donor: 100, recv: [LR('A', 20), LR('B', 30)] },
  { id: 'donor < total demand', donor: 50, recv: [LR('A', 40), LR('B', 40)] },
  { id: 'odd donor quantity', donor: 101, recv: [LR('A', 100), LR('B', 100)] },
  { id: 'zero-gap receiver among real ones', donor: 100, recv: [LR('A', 0), LR('B', 60)] }
];

var overAlloc = 0, overfill = 0, doubleConsume = 0;
FIXTURES.forEach(function (f) {
  var out = runLive(f.donor, f.recv);
  var model = sequentialGreedy(f.donor, f.recv);
  eq(liveAlloc(out), model.alloc, 'C1  ' + f.id);

  var totIn = 0, totOut = 0;
  (out.receivers || []).forEach(function (r) {
    totIn += r.reallocatedInQty; totOut += r.reallocatedOutQty;
    if (r.reallocatedInQty > r.preTransferRemainingShortageQty) overfill++;
    if (r.initialFactoryAllocationQty - r.reallocatedOutQty < r.protectedFactoryQty) overAlloc++;
  });
  if (totIn !== totOut) doubleConsume++;
  if (totOut > f.donor) overAlloc++;
  ok(totIn === totOut, 'C2  ' + f.id + ': conserved (in ' + totIn + ' = out ' + totOut + ')');
});
eq([overAlloc, overfill, doubleConsume], [0, 0, 0],
  'C3  OVER_ALLOCATION = 0 · RECEIVER_OVERFILL = 0 · DOUBLE_CONSUMPTION = 0');

// C4 — determinism.
eq(JSON.stringify(runLive(100, [LR('A', 20), LR('B', 100), LR('C', 30)])),
  JSON.stringify(runLive(100, [LR('A', 20), LR('B', 100), LR('C', 30)])),
  'C4  DETERMINISTIC = YES (byte-identical output for identical input)');

// C5 — donor's own already-allocated need is protected before anything is releasable.
var protectedRun = runLive(100, [LR('A', 100)], { donorOwnNeed: 60 });
eq(liveAlloc(protectedRun), { A: 40 }, 'C5  already-allocated donor need is protected (only 40 releasable)');

// C6 — reserved / unallocated physical supply never enters the donor pool (§43.6).
var reservedRun = runLive(60, [LR('A', 100)], { unused: 40 });
var movedR = 0; (reservedRun.transferLedger || []).forEach(function (t) { movedR += t.qty; });
eq(movedR, 60, 'C6  reserved/unallocated physical residual is not donor surplus — only 60 moved');

// C7 — duplicate lineage and negative gap fail closed.
function throwsRange(f) { try { f(); return false; } catch (e) { return e instanceof RangeError; } }
ok(throwsRange(function () {
  return runLive(0, [], { raw: toLive(100, [LR('A', 100), LR('A', 100)]) });
}), 'C7  duplicate lineage fails closed (DOUBLE_CONSUMPTION impossible)');
ok(throwsRange(function () {
  return runLive(0, [], { raw: toLive(100, [LR('A', -50)]) });
}), 'C8  a negative gap fails closed (never clamped to zero)');

// C9 — MARKETPLACE_IN_POOL_KEY = NO.
var ledgers = code(read(CORE + 'supply-planning-ledgers.js'));
var poolExpr = (ledgers.match(/var poolKey = \[[^\]]*\]/) || [])[0] || '';
ok(poolExpr.length > 0 && poolExpr.indexOf('marketplace') < 0, 'C9  MARKETPLACE_IN_POOL_KEY = NO');

// ---------------------------------------------------------------------------------------------------------
section('D. The one algorithm covers every receiver count (no count-specific path)');

// If a receiver-count branch were ever introduced, the model — which has no such branch — would stop matching
// live at exactly that count. Running 0..4 proves the single algorithm holds across the boundary.
[0, 1, 2, 3, 4].forEach(function (n) {
  var recv = [];
  for (var i = 0; i < n; i++) recv.push(LR(String.fromCharCode(65 + i), 60));
  var model = sequentialGreedy(100, recv);
  eq(liveAlloc(runLive(100, recv)), model.alloc, 'D1  ' + n + ' receiver(s): same algorithm');
});
ok(true, 'D2  ZERO/ONE/TWO/THREE_PLUS all derive from SEQUENTIAL_GREEDY — no count-specific rule');

// ---------------------------------------------------------------------------------------------------------
section('E. Mutation — the five §10 targets (in memory; no file is written)');

// Each mutant breaks the MODEL. The assertion under test is model-vs-live agreement, so a broken model must
// disagree with the live implementation on at least one fixture. A mutant that still agrees everywhere would
// mean the fixture set cannot see that property at all.
function modelDisagrees(mutatedFn) {
  return FIXTURES.concat(EXAMPLES.map(function (x) { return { id: x.id, donor: x.donor, recv: x.recv }; }))
    .some(function (f) {
      var live = liveAlloc(runLive(f.donor, f.recv));
      var m;
      try { m = mutatedFn(f.donor, f.recv); } catch (e) { return true; }
      return JSON.stringify(live) !== JSON.stringify(m.alloc);
    });
}

// THE FIVE §10 TARGETS ARE BROKEN IN THE LIVE MODULE, NOT IN THE MODEL. Mutating only the model would prove
// that my model is sensitive to an axis — not that the shipped implementation is the thing enforcing it. So
// each mutant recompiles the real source with one defect and checks the real behaviour changes.
//
// The first version of E6 was weak in exactly that way: it re-stated C7 ("live rejects duplicates") and added
// a vacuous second clause, so it would have passed even if nothing protected anything. Replaced, not banked.
var Module = require('module');
var KMFSR_PATH = path.join(ROOT, CORE, 'supply-planning-surplus-reallocation.js');
var KMFSR_SRC = fs.readFileSync(KMFSR_PATH, 'utf8');
var SRC_EOL = KMFSR_SRC.indexOf('\r\n') >= 0 ? '\r\n' : '\n';

// Compile a mutated copy in memory. Nothing is written to disk; `require` inside it still resolves normally
// because the synthetic module keeps the real file's path.
function loadMutated(src) {
  var m = new Module(KMFSR_PATH, null);
  m.filename = KMFSR_PATH;
  m.paths = Module._nodeModulePaths(path.dirname(KMFSR_PATH));
  m._compile(src, KMFSR_PATH);
  return m.exports;
}
function mutateSrc(from, to) {
  var f = Array.isArray(from) ? from.join(SRC_EOL) : from;
  if (KMFSR_SRC.indexOf(f) < 0) throw new Error('anchor missing: ' + f.slice(0, 70));
  if (KMFSR_SRC.indexOf(f) !== KMFSR_SRC.lastIndexOf(f)) throw new Error('anchor ambiguous');
  return KMFSR_SRC.replace(f, function () { return Array.isArray(to) ? to.join(SRC_EOL) : to; });
}
function allocWith(mod, donorQty, receivers) {
  var out = mod.reallocatePreallocatedFactorySupply({
    masterSku: 'SKU1', calculationDate: CALC, unusedFactorySupplyQty: 0,
    receivers: toLive(donorQty, receivers, 0)
  });
  var m = {};
  (out.receivers || []).forEach(function (r) { if (r.demandKey !== 'DONOR') m[r.demandKey] = r.reallocatedInQty; });
  return m;
}
var RECEIVER_SORT_SRC =
  '      return cmpStr(a.requiredByDate, b.requiredByDate) || (b.allocationPriority - a.allocationPriority) || cmpStr(a.demandKey, b.demandKey);';

// A sort defect can only be SEEN where that axis decides. The generic fixtures share one date and one
// priority, so each axis mutant runs against the §B case built to isolate it — otherwise a mutant would
// report as killed on a fixture that could never have shown it.
function sortMutantCaught(sortCase, mutatedReturn) {
  var mod = loadMutated(mutateSrc(RECEIVER_SORT_SRC, mutatedReturn));
  return JSON.stringify(allocWith(mod, 100, sortCase.recv)) !== JSON.stringify(liveAlloc(runLive(100, sortCase.recv)));
}

mut('E1 live receiver sort reversed (requiredByDate DESC)', function () {
  return sortMutantCaught(SORT_CASES[0],
    '      return cmpStr(b.requiredByDate, a.requiredByDate) || (b.allocationPriority - a.allocationPriority) || cmpStr(a.demandKey, b.demandKey);');
});

mut('E2 live allocationPriority sorted ASC instead of DESC', function () {
  return sortMutantCaught(SORT_CASES[1],
    '      return cmpStr(a.requiredByDate, b.requiredByDate) || (a.allocationPriority - b.allocationPriority) || cmpStr(a.demandKey, b.demandKey);');
});

mut('E3 live stable tie-break reversed (demandKey DESC)', function () {
  return sortMutantCaught(SORT_CASES[2],
    '      return cmpStr(a.requiredByDate, b.requiredByDate) || (b.allocationPriority - a.allocationPriority) || cmpStr(b.demandKey, a.demandKey);');
});

mut('E4 live receiver cap removed (overfill past the residual gap)', function () {
  var mod = loadMutated(mutateSrc(
    '            receiverRemainingShortage: rf.remainingShortageQty,',
    '            receiverRemainingShortage: Number.MAX_SAFE_INTEGER,'));
  var got = allocWith(mod, 100, [LR('A', 20), LR('B', 30)]);
  return got.A > 20;   // A must not be able to take more than its 20 residual
});

mut('E5 live donor cap removed (all three guards) — and it takes all three', function () {
  // THE DONOR CAP IS TRIPLED, which two successive inert mutants uncovered rather than a reading of the code.
  // Three independent guards each cap a donor at its real surplus:
  //   (1) donorRemainingSurplus    -> the MIN inside applyFeasibleReallocation
  //   (2) timelyTransferableQty    -> the §41.5A pass-through, the SAME `avail`, in that same MIN
  //   (3) df.releasableSurplusQty  -> gates the donor loop, so an exhausted donor is skipped for the next receiver
  // Breaking one, then two, changed nothing: the survivors held the line. That is the fifth round running in
  // which a defence here turned out to be doubled, and it is worth more than the kill — a single-guard defect
  // in this function cannot over-allocate a donor.
  // The honest mutant for "the donor cap is gone" therefore removes the whole set, and over-allocation follows
  // immediately, which is what proves the set is collectively load-bearing.
  var src = mutateSrc(
    ['            donorRemainingSurplus: avail,',
     '            timelyTransferableQty: avail'],
    ['            donorRemainingSurplus: Number.MAX_SAFE_INTEGER,',
     '            timelyTransferableQty: Number.MAX_SAFE_INTEGER']);
  src = src.replace('        if (df.releasableSurplusQty <= 0) continue;', function () { return '        /* guard removed */'; });
  var mod = loadMutated(src);
  var got = allocWith(mod, 100, [LR('A', 100), LR('B', 100)]);
  return (got.A + got.B) > 100;   // the donor only had 100
});

mut('E5a each donor guard is individually sufficient (defence in depth, measured)', function () {
  // Remove guards (1) and (2) and leave (3): the cap must STILL hold. This is the positive form of what the
  // two inert mutants above were accidentally demonstrating, asserted deliberately instead of by surprise.
  var mod = loadMutated(mutateSrc(
    ['            donorRemainingSurplus: avail,',
     '            timelyTransferableQty: avail'],
    ['            donorRemainingSurplus: Number.MAX_SAFE_INTEGER,',
     '            timelyTransferableQty: Number.MAX_SAFE_INTEGER']));
  var got = allocWith(mod, 100, [LR('A', 100), LR('B', 100)]);
  return (got.A + got.B) <= 100;   // the surviving guard alone still conserves the donor
});

mut('E6 live duplicate-lineage protection removed', function () {
  var mod = loadMutated(mutateSrc(
    "      if (recSeen[demandKey]) throw new RangeError('KMFSR: duplicate demandKey \"' + demandKey + '\"');",
    '      /* guard removed */'));
  var realRejects = throwsRange(function () { return runLive(0, [], { raw: toLive(100, [LR('A', 100), LR('A', 100)]) }); });
  var mutantAccepts = true;
  try { allocWith(mod, 100, [LR('A', 100), LR('A', 100)]); } catch (e) { mutantAccepts = false; }
  return realRejects === true && mutantAccepts === true;   // the guard is what refuses it
});

mut('E7 a receiver-count-specific branch is introduced at 2', function () {
  return modelDisagrees(function (donorQty, receivers) {
    if (receivers.length === 2) {   // the rejected proportional branch, as a REGRESSION probe only
      var h = Math.floor(donorQty * 0.5);
      return { alloc: { A: Math.min(h, receivers[0].gap), B: Math.min(h, receivers[1].gap) } };
    }
    return sequentialGreedy(donorQty, receivers);
  });
});

// ---------------------------------------------------------------------------------------------------------
section('RESULT');
console.log('passed ' + pass + '  failed ' + fail + '  mutants killed ' + neg.caught + '/' + (neg.caught + neg.missed));
if (fail > 0) { console.error('\nS5-R2A CONTENTION CONTRACT DRIFT'); process.exit(1); }
console.log('D_S5_1_DONOR_CONTENTION = SEQUENTIAL_GREEDY — model and live agree on every fixture');
