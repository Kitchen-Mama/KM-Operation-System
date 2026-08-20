// Kitchen Mama Operation System — Ongoing-Order site projection (KMOOP) tests — F1-7N-FA-3B0.
// Run: node assets/tests/supply-planning-ongoing-order-projection-f1-7n-fa-3b0.test.js
// Public API (KMOOP.projectOngoingOrderSupply): §42 lifecycle partition, A1 request-source share, A2 company
// monthly FC share, count-once, company boundaries, FLOOR/residual. Plus a DIRECT §43 proof of the internal
// floorAllocateByRatio_ helper (101@30/70, 1@50/50, >100% fail-closed).
// NOTE: intentionally NOT strict (extractFn eval binds the helper into module scope).

var fs = require('fs');
var path = require('path');
var K = require('../js/core/supply-planning-ongoing-order-projection.js');
var project = K.projectOngoingOrderSupply;

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { var X = JSON.stringify(a), E = JSON.stringify(b); if (X !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + X); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- extract + eval the internal §43 FLOOR helper for a DIRECT proof ----
function extractFn(src, name) { var st = src.indexOf('function ' + name); if (st < 0) throw new Error('fn not found: ' + name); var i = src.indexOf('{', st), d = 0, j = i; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) { j++; break; } } } return src.slice(st, j); }
var SRC = fs.readFileSync(path.join(__dirname, '..', 'js/core/supply-planning-ongoing-order-projection.js'), 'utf8');
eval(extractFn(SRC, 'floorAllocateByRatio_'));

function poLine(o) { return Object.assign({ purchaseOrderLineId: 'L1', purchaseOrderId: 'PO1', sku: 'GA', company: 'ResTW', orderedQty: 1000, requestedQty: 1000, completedQty: 0, shippedQty: 0, requestOrderLineId: 'ROL1' }, o); }
function src(marketplace, qty, over) { return Object.assign({ requestOrderLineId: 'ROL1', company: 'ResTW', country: 'US', marketplace: marketplace, siteSku: 'GA-' + marketplace, requestedQty: qty }, over || {}); }
function fc(company, marketplace, basis) { return { company: company, country: 'US', marketplace: marketplace, siteSku: company + '-' + marketplace, siteFcBasis: basis }; }
function run(lines, sources, fcs) { return project({ planningCycle: '2026-08', calculationDate: '2026-08-20', purchaseOrderLines: lines, requestSourceFacts: sources || [], monthlySiteFcFacts: fcs || [] }); }
function alloc(line) { var m = {}; line.siteAllocations.forEach(function (a) { m[a.marketplace] = a.allocatedQty; }); return m; }

// ==========================================================================
section('Lifecycle partition (Phase 16 A-F)');
(function () {
  var A = run([poLine({ completedQty: 0, shippedQty: 0 })], [src('Amazon', 700), src('Shopify', 300)]).lines[0];
  eq(A.notYetReceivedCommittedQty, 1000, 'A ongoing 1000'); eq(A.completedNotShippedQty, 0, 'A completedNotShipped 0');
  var B = run([poLine({ completedQty: 400, shippedQty: 0 })], [src('Amazon', 700), src('Shopify', 300)]).lines[0];
  eq(B.notYetReceivedCommittedQty, 600, 'B ongoing 600'); eq(B.completedNotShippedQty, 400, 'B factory diagnostic 400');
  var C = run([poLine({ completedQty: 700, shippedQty: 300 })], [src('Amazon', 700), src('Shopify', 300)]).lines[0];
  eq(C.notYetReceivedCommittedQty, 300, 'C ongoing 300'); eq(C.completedNotShippedQty, 400, 'C factory 400'); eq(C.shippedLifecycleQty, 300, 'C shipped 300');
  var D = run([poLine({ completedQty: 1000, shippedQty: 0 })], [src('Amazon', 700), src('Shopify', 300)]).lines[0];
  eq(D.notYetReceivedCommittedQty, 0, 'D ongoing 0'); eq(D.siteAllocations.length, 0, 'D no site allocations');
  var E = run([poLine({ completedQty: 1200, shippedQty: 0 })], [src('Amazon', 700), src('Shopify', 300)]).lines[0];
  eq(E.allocationMode, 'BLOCKED', 'E completed>ordered → BLOCKED'); eq(E.issues[0].code, 'COMPLETED_EXCEEDS_ORDERED', 'E issue');
  var F = run([poLine({ completedQty: 300, shippedQty: 500 })], [src('Amazon', 700), src('Shopify', 300)]).lines[0];
  eq(F.allocationMode, 'BLOCKED', 'F shipped>completed → BLOCKED'); eq(F.issues[0].code, 'SHIPPED_EXCEEDS_COMPLETED', 'F issue');
})();

section('A1 request-source share (Phase 16 G-K)');
(function () {
  var G = run([poLine({ completedQty: 0 })], [src('Amazon', 700), src('Shopify', 300)]).lines[0];
  eq(G.allocationMode, 'REQUEST_SOURCE_LINEAGE', 'G mode A1'); eq(alloc(G), { Amazon: 700, Shopify: 300 }, 'G 700/300'); eq(G.unallocatedResidualQty, 0, 'G residual 0');
  eq(G.siteAllocations[0].sourceReason, 'A1_ORIGINAL_REQUEST_SHARE', 'G reason A1');
  var H = run([poLine({ completedQty: 400 })], [src('Amazon', 700), src('Shopify', 300)]).lines[0];
  eq(alloc(H), { Amazon: 420, Shopify: 180 }, 'H partial → FLOOR 420/180'); eq(H.unallocatedResidualQty, 0, 'H residual 0');
  var I = run([poLine({ completedQty: 999 })], [src('Amazon', 700), src('Shopify', 300)]).lines[0];
  eq(alloc(I), { Amazon: 0, Shopify: 0 }, 'I ongoing 1 → 0/0'); eq(I.unallocatedResidualQty, 1, 'I residual 1 (NOT assigned)');
  var J = run([poLine({ completedQty: 0 })], [src('Amazon', 700), src('Shopify', 200)]).lines[0];
  eq(J.allocationMode, 'BLOCKED', 'J source total 900 != requested 1000 → BLOCKED'); eq(J.issues[0].code, 'A1_SOURCE_TOTAL_MISMATCH', 'J issue');
  var Kk = run([poLine({ completedQty: 0 })], [src('Amazon', 700, { company: 'KM' }), src('Shopify', 300)]).lines[0];
  eq(Kk.allocationMode, 'BLOCKED', 'K cross-company source → BLOCKED'); eq(Kk.issues[0].code, 'A1_CROSS_COMPANY_SOURCE', 'K issue');
})();

section('A2 company monthly FC share (Phase 16 L-R)');
(function () {
  function a2(ordered, completed, fcs) { return run([poLine({ orderedQty: ordered, requestedQty: 0, completedQty: completed, company: 'ResUS' })], [], fcs).lines[0]; }
  var L = a2(100, 0, [fc('ResUS', 'Amazon', 30), fc('ResUS', 'Walmart', 70)]);
  eq(L.allocationMode, 'COMPANY_MONTHLY_FC_SHARE', 'L mode A2'); eq(alloc(L), { Amazon: 30, Walmart: 70 }, 'L 30/70'); eq(L.unallocatedResidualQty, 0, 'L residual 0');
  var M = a2(101, 0, [fc('ResUS', 'Amazon', 30), fc('ResUS', 'Walmart', 70)]);
  eq(alloc(M), { Amazon: 30, Walmart: 70 }, 'M 101 → FLOOR 30/70'); eq(M.unallocatedResidualQty, 1, 'M residual 1');
  var N = a2(1, 0, [fc('ResUS', 'Amazon', 50), fc('ResUS', 'Walmart', 50)]);
  eq(alloc(N), { Amazon: 0, Walmart: 0 }, 'N 1 @ 50/50 → 0/0'); eq(N.unallocatedResidualQty, 1, 'N residual 1');
  var P = a2(100, 0, [fc('ResUS', 'Amazon', 0), fc('ResUS', 'Walmart', 0)]);
  eq(P.allocationMode, 'BLOCKED', 'P zero FC denominator → BLOCKED'); eq(P.issues[0].code, 'A2_ZERO_FC_DENOMINATOR', 'P issue');
  var Q = a2(100, 0, [fc('ResUS', 'Amazon', 30), fc('ResUS', 'Walmart', 70), fc('KM', 'Amazon', 999)]);
  eq(alloc(Q), { Amazon: 30, Walmart: 70 }, 'Q other-company site excluded (no leakage)'); ok(Q.siteAllocations.every(function (a) { return a.company === 'ResUS'; }), 'Q only ResUS sites');
  var R = a2(100, 0, [fc('ResUS', 'Amazon', 42)]);
  eq(alloc(R), { Amazon: 100 }, 'R single valid site → 100%'); eq(R.siteAllocations[0].share, 1, 'R share 1');
})();

section('§43 FLOOR helper — DIRECT proof (Phase 18)');
(function () {
  var a = floorAllocateByRatio_(101, [{ key: 'x', ratio: 0.3 }, { key: 'y', ratio: 0.7 }]);
  ok(a.ok, '§43 101@30/70 ok'); eq(a.allocations.map(function (z) { return z.allocatedQty; }), [30, 70], '§43 101 → 30/70'); eq(a.residual, 1, '§43 101 residual 1');
  var b = floorAllocateByRatio_(1, [{ key: 'x', ratio: 0.5 }, { key: 'y', ratio: 0.5 }]);
  eq(b.allocations.map(function (z) { return z.allocatedQty; }), [0, 0], '§43 1@50/50 → 0/0'); eq(b.residual, 1, '§43 1 residual 1');
  var c = floorAllocateByRatio_(100, [{ key: 'x', ratio: 0.6 }, { key: 'y', ratio: 0.7 }]);
  ok(!c.ok && c.issue === 'RATIO_TOTAL_EXCEEDS_100', '§43 Σratio>1.0 → fail closed');
  var d = floorAllocateByRatio_(100, [{ key: 'x', ratio: 1.0 }]);
  ok(d.ok && d.allocations[0].allocatedQty === 100 && d.residual === 0, '§43 full single ratio 1.0 → 100/0');
})();

section('General conservation + count-once + isolation (Phase 12/16 S-Y, 17)');
(function () {
  var res = run([poLine({ completedQty: 400 })], [src('Amazon', 700), src('Shopify', 300)]);
  var L1 = res.lines[0];
  var sumAlloc = L1.siteAllocations.reduce(function (s, a) { return s + a.allocatedQty; }, 0);
  ok(sumAlloc <= L1.notYetReceivedCommittedQty, 'S Σ allocated ≤ ongoing');
  eq(sumAlloc + L1.unallocatedResidualQty, L1.notYetReceivedCommittedQty, 'T allocated + residual = ongoing (count-once)');
  ok(L1.notYetReceivedCommittedQty === L1.orderedQty - L1.completedQty, 'U ongoing excludes completed (no completed leak)');
  // V: shipped never in ongoing — construct a shipped case and confirm ongoing unaffected by shipped
  var Vc = run([poLine({ completedQty: 700, shippedQty: 300 })], [src('Amazon', 700), src('Shopify', 300)]).lines[0];
  var sumV = Vc.siteAllocations.reduce(function (s, a) { return s + a.allocatedQty; }, 0);
  eq(sumV + Vc.unallocatedResidualQty, Vc.notYetReceivedCommittedQty, 'V shipped excluded (allocated+residual=ongoing=300)');
  // W: no largest-remainder (1@50/50 already 0/0). X: determinism (permuted input identical).
  var r1 = run([poLine({ completedQty: 400 })], [src('Amazon', 700), src('Shopify', 300)]);
  var r2 = run([poLine({ completedQty: 400 })], [src('Shopify', 300), src('Amazon', 700)]);
  eq(r1, r2, 'X determinism — source order invariant');
  // Y: input not mutated
  var input = { planningCycle: 'c', calculationDate: 'd', purchaseOrderLines: [poLine({ completedQty: 400 })], requestSourceFacts: [src('Amazon', 700), src('Shopify', 300)], monthlySiteFcFacts: [] };
  var frozen = JSON.stringify(input); project(input); eq(JSON.stringify(input), frozen, 'Y input not mutated');
})();

section('Phase 17 — KMOOP contains no KMFSR / factory / net-order-need / carton logic (SOURCE)');
(function () {
  ok(!/KMFSR|projectSurplusReallocation/.test(SRC), 'no KMFSR call');
  ok(!/allocateFactoryDeterministic|sumRemainingShortages|netOrderNeed/.test(SRC), 'no factory alloc / net order need');
  ok(!/units_per_carton|Math\.ceil|carton/.test(SRC), 'no carton rounding');
  ok(!/SpreadsheetApp|PropertiesService|require\(|Date\.now|Math\.random/.test(SRC.replace(/typeof require/g, '')), 'pure: no DB/API/clock/random');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All F1-7N-FA-3B0 KMOOP assertions passed (' + pass + ' assertions).');
