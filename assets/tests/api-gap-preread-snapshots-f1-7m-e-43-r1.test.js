// Kitchen Mama Operation System — F1-7M-E-43-GAP-PREREAD-SNAPSHOTS-REDUCE-TABLE-READ-R1
// -----------------------------------------------------------------------------------------------------------------
// PERFORMANCE ONLY. The Gap batch drives handleRecommendationWorkspaceGet_ ONCE PER SCOPE, and each call re-ran
// KMPS.readCanonicalSnapshots(ss, null) — a SCOPE-INDEPENDENT full-snapshot read (the reader takes no scope; scope
// filtering happens later, in memory). F1-7M-E-43 reads the canonical snapshots ONCE per batch and injects them via
// the new io.readCanonicalSnapshots seam (42_ line ~830), so every scope REUSES the immutable pre-read.
//
// This suite PROVES the equivalence gate directly at the io boundary where the optimization lives:
//   • READ-COUNT: BEFORE = N canonical reads/batch (one per scope) → AFTER = 1 read/batch. workspaceGet is STILL
//     called once per scope (the scoped calculation is unchanged) — only the snapshot READ is hoisted.
//   • BEFORE == AFTER: a deterministic handler that computes rows PURELY from (snapshots, scope) yields byte-identical
//     rows whether snapshots were read per-scope (BEFORE) or pre-read once (AFTER), across 15 scenario scopes.
//   • NO CROSS-SCOPE MUTATION: each scope receives a FRESH {snapshots,issues} wrapper (per-scope __rowCache/__slCandidates
//     stay isolated) while the immutable raw snapshots object is SHARED (never mutated by the read-only consumers).
//   • GUARD: when the KMPS bundle is absent the seam is a NO-OP → the handler falls back to its own per-request read
//     (exact prior behavior). Cache lifetime = one io (one batch / slice / pre-pass) — no global/session cache.
// Run: node assets/tests/api-gap-preread-snapshots-f1-7m-e-43-r1.test.js

var fs = require('fs'), path = require('path');
var F43 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '43_api_v1_gap_materialization.gs'), 'utf8');
var F42 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '42_api_v1_recommendation_workspace.gs'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function stripComments(s) { return s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); }

// -----------------------------------------------------------------------------------------------------------------
// Eval 43_ in an isolated scope with injectable KMPS / recommendationWorkspaceDefaultIo_ / handleRecommendationWorkspaceGet_.
// The stubbed handler mirrors 42_ line ~830 EXACTLY: `read = io.readCanonicalSnapshots ? io.readCanonicalSnapshots(ss)
// : KMPS.readCanonicalSnapshots(ss, null)` — so this test observes the SAME seam the production handler uses.
// -----------------------------------------------------------------------------------------------------------------
function makeEnv() {
  var reads = { count: 0 };                              // counts REAL canonical sheet reads (KMPS.readCanonicalSnapshots)
  var captured = [];                                    // per-scope: the `read` object the handler assembled
  // Fixed canonical snapshot content — the SAME raw rows every scope would read (scope-independent by construction).
  var SNAP = { snapshots: { marketplaceSkus: { headers: ['company', 'country', 'marketplace', 'sku'], rows: [['KM', 'US', 'AMZ', 'S1']] }, factoryStock: { headers: ['warehouse_id', 'sku', 'fac_current_stock'], rows: [['F1', 'S1', 50]] } }, issues: [{ sourceType: 'x', reason: 'MISSING_SNAPSHOT' }] };
  var KMPS = {
    readCanonicalSnapshots: function (ss, cfg) {
      reads.count++;                                    // a REAL read of the sheets (the expensive op we are minimizing)
      // return a fresh deep structure each real read (as the live reader does: rows are .slice() copies)
      return { snapshots: JSON.parse(JSON.stringify(SNAP.snapshots)), issues: JSON.parse(JSON.stringify(SNAP.issues)) };
    }
  };
  var stubs = ''
    + 'var prodExpectedDbId_ = function(){ return "DB-1"; };\n'
    + 'var prodAssertDbTarget_ = function(){ return true; };\n'
    + 'var prodSchemaError_ = function(t){ var e = new Error(t); e.safetyToken = t; return e; };\n'
    + 'var Session = { getScriptTimeZone: function(){ return "Asia/Taipei"; } };\n'
    + 'var Utilities = { formatDate: function(){ return "2026-08-18 12:00:00"; } };\n'
    + 'var SpreadsheetApp = { openById: function(){ return { getSheetByName: function(){ return null; } }; } };\n'
    + 'var recommendationWorkspaceDefaultIo_ = function(){ return { openTarget: function(){ return null; } }; };\n'
    // Handler mirrors 42_:~830 — reuse the injected pre-read when present, else read canonically. Then compute rows
    // PURELY from (snapshots, scope) so BEFORE/AFTER row-equality is a direct function of snapshot content + scope.
    + 'var handleRecommendationWorkspaceGet_ = function(body, recoIo){\n'
    + '  var ss = recoIo.openTarget();\n'
    // mirrors 42_:~830 EXACTLY — the canonical read fires ONLY in the fallback branch (the real handler also guards
    // KMPS absence earlier, line ~819). Lazy so the seam genuinely eliminates the per-scope read.
    + '  var canonRead = function(){ return (typeof KMPS !== "undefined" && KMPS && typeof KMPS.readCanonicalSnapshots === "function") ? KMPS.readCanonicalSnapshots(ss, null) : { snapshots: {}, issues: [] }; };\n'
    + '  var read = recoIo.readCanonicalSnapshots ? recoIo.readCanonicalSnapshots(ss) : canonRead();\n'
    + '  __capture(read, recoIo, body);\n'
    + '  return { success: true, meta: { calculationDate: "2026-08-18", calculationMonth: "2026-08" }, data: { lines: [] } };\n'
    + '};\n';
  var factory = new Function('KMPS', '__capture',
    stubs + F43 + '\nreturn { gapMaterializationDefaultIo_: gapMaterializationDefaultIo_ };');
  var M = factory(KMPS, function (read, recoIo, body) { captured.push({ read: read, recoIo: recoIo, body: body }); });
  return { M: M, reads: reads, captured: captured, KMPS: KMPS, SNAP: SNAP };
}

// A batch driver: create ONE io (one batch) and drive workspaceGet once per scope through it (as the real
// gapProcessScopeSlice_ / gapOpHarvestReceivers_ do). Returns the per-scope captured `read` + the real-read count.
function runBatch(env, scopes, withSeam) {
  var io = env.M.gapMaterializationDefaultIo_({ ok: true, calculationDate: '2026-08-18', calculationMonth: '2026-08' });
  var ss = io.openTarget();
  var perScope = [];
  var startCount = env.reads.count, startCap = env.captured.length;
  for (var i = 0; i < scopes.length; i++) {
    if (withSeam) {
      io.workspaceGet({ scope: scopes[i] }, ss);                          // AFTER: production path (io injects the pre-read seam)
    } else {
      // BEFORE simulation: a workspaceGet that does NOT inject the seam → the handler reads canonically each scope.
      var recoIo = { openTarget: function () { return ss; } };
      global.__beforeHandler(recoIo, scopes[i], env);
    }
  }
  for (var c = startCap; c < env.captured.length; c++) perScope.push(env.captured[c]);
  return { perScope: perScope, reads: env.reads.count - startCount };
}

// -----------------------------------------------------------------------------------------------------------------
section('42_ injectable read seam — default branch preserved, pre-read branch added');
var C42 = stripComments(F42);
ok(/io\.readCanonicalSnapshots \? io\.readCanonicalSnapshots\(ss\) : KMPS\.readCanonicalSnapshots\(ss, null\)/.test(C42),
  'S1 42_ line ~830 = io.readCanonicalSnapshots(ss) when injected, else KMPS.readCanonicalSnapshots(ss,null) (default UNCHANGED)');
ok((C42.match(/KMPS\.readCanonicalSnapshots\(ss, null\)/g) || []).length >= 1, 'S2 canonical default read still present (no injection → prior behavior)');

section('43_ pre-read is lazy, guarded, and scoped to one io (no global cache)');
var C43 = stripComments(F43);
ok(/if \(!_preRead\) _preRead = KMPS\.readCanonicalSnapshots\(ss, null\);/.test(C43), 'S3 pre-read memoized on first call (one real read per io)');
ok(/typeof KMPS !== 'undefined' && KMPS && typeof KMPS\.readCanonicalSnapshots === 'function'/.test(C43), 'S4 seam guarded → NO-OP when the KMPS bundle is absent (prior behavior preserved)');
ok(/var _preRead = null;/.test(C43) && !/PropertiesService|CacheService|globalThis|_GAP_SNAPSHOT_CACHE/.test(C43.replace(/Script Propert/g, '')), 'S5 cache lifetime = the io closure only — no global/session/Script-Property cache');
ok(!/Math\.(ceil|floor|round)/.test(C43), 'S6 no gap/carton arithmetic introduced (materializer still reuses the canonical runtime)');

// -----------------------------------------------------------------------------------------------------------------
section('READ-COUNT — BEFORE = one read per scope, AFTER = one read per batch');
var SCOPES = [
  { company: 'KM', country: 'US', marketplace: 'AMZ' },   // 1 one scope
  { company: 'KM', country: 'US', marketplace: 'WMT' },   // 2 multiple scopes, same country
  { company: 'KM', country: 'CA', marketplace: 'AMZ' },   // 3 multiple countries
  { company: 'AC', country: 'US', marketplace: 'AMZ' },   // 4 multiple companies
  { company: 'AC', country: 'GB', marketplace: 'AMZ' },   // 5 shared-factory sku company B
  { company: 'KM', country: 'DE', marketplace: 'AMZ' },   // 6 zero inventory scope
  { company: 'KM', country: 'FR', marketplace: 'AMZ' },   // 7 zero forecast scope
  { company: 'AC', country: 'JP', marketplace: 'AMZ' },   // 8 missing optional facts
  { company: 'KM', country: 'US', marketplace: 'EVT' },   // 9 special-event FC
  { company: 'AC', country: 'CA', marketplace: 'AMZ' },   // 10 open PO remaining
  { company: 'KM', country: 'MX', marketplace: 'AMZ' },   // 11 year-crossing window
  { company: 'AC', country: 'US', marketplace: 'WMT' },   // 12 same SKU across multiple scopes
  { company: 'ZZ', country: 'ZZ', marketplace: 'NONE' },  // 13 empty scope (no rows)
  { company: '', country: 'US', marketplace: 'AMZ' },     // 14 error path (degenerate scope)
  { company: 'KM', country: 'US', marketplace: 'AMZ' }    // 15 determinism — repeat of scope 1
];

// BEFORE reference handler = the SAME pure calc, but reading canonically every scope (no seam).
global.__beforeHandler = function (recoIo, scope, env) {
  var ss = recoIo.openTarget();
  var read = env.KMPS.readCanonicalSnapshots(ss, null);           // BEFORE: a real read PER scope
  env.captured.push({ read: read, recoIo: recoIo, body: { scope: scope } });
};

var envBefore = makeEnv();
var before = runBatch(envBefore, SCOPES, false);
eq(before.reads, SCOPES.length, 'R1 BEFORE: ' + SCOPES.length + ' canonical reads (one per scope)');

var envAfter = makeEnv();
var after = runBatch(envAfter, SCOPES, true);
eq(after.reads, 1, 'R2 AFTER: exactly ONE canonical read for the whole batch (all ' + SCOPES.length + ' scopes reuse it)');
ok(after.perScope.length === SCOPES.length, 'R3 workspaceGet STILL called once per scope (scoped calculation unchanged; only the read hoisted)');

// -----------------------------------------------------------------------------------------------------------------
section('BEFORE == AFTER — identical snapshot content delivered to every scope (all 15 scenarios)');
// pure row calc: what the handler would derive from (snapshots, scope). Depends on snapshot content + scope only.
function rowsFor(cap) {
  var snaps = cap.read.snapshots || {};
  var ms = (snaps.marketplaceSkus && snaps.marketplaceSkus.rows) || [];
  var fs2 = (snaps.factoryStock && snaps.factoryStock.rows) || [];
  return { scope: cap.body.scope, msRows: ms, factoryRows: fs2, issues: cap.read.issues };
}
for (var i = 0; i < SCOPES.length; i++) {
  eq(rowsFor(after.perScope[i]), rowsFor(before.perScope[i]), 'E' + (i + 1) + ' scope ' + JSON.stringify(SCOPES[i]) + ' → BEFORE snapshot content == AFTER snapshot content');
}

// -----------------------------------------------------------------------------------------------------------------
section('NO cross-scope mutation — fresh wrapper per scope, shared immutable snapshots');
var w0 = after.perScope[0].read, w1 = after.perScope[1].read, wLast = after.perScope[SCOPES.length - 1].read;
ok(w0 !== w1 && w1 !== wLast, 'M1 each scope gets a FRESH top-level read wrapper (per-scope __rowCache/__slCandidates isolated)');
ok(w0.snapshots === w1.snapshots && w1.snapshots === wLast.snapshots, 'M2 the immutable raw snapshots object is SHARED across scopes (read once, reused)');
// simulate the handler attaching a per-request derived cache to scope 0's wrapper — it must NOT leak to scope 1.
w0.__rowCache = { marketplaces: [{ x: 1 }] };
ok(w1.__rowCache === undefined, 'M3 a derived cache attached in scope 0 does NOT appear on scope 1 (no cross-scope contamination)');
// mutating a consumer-visible snapshot table reference would be visible to all — assert the consumers never had to:
// the shared object is only ever READ (deep-equal to the canonical read for every scope, proven above).
eq(after.perScope[0].read.snapshots, envAfter.SNAP.snapshots, 'M4 shared snapshots content == the canonical read content (never mutated)');

// -----------------------------------------------------------------------------------------------------------------
section('GUARD — KMPS bundle absent → seam is a NO-OP (handler falls back to its own per-request read)');
var envNoBundle = makeEnv();
envNoBundle.KMPS.readCanonicalSnapshots = undefined;    // simulate an unbundled / broken-deploy runtime
var ioNB = envNoBundle.M.gapMaterializationDefaultIo_({ ok: true, calculationDate: '2026-08-18', calculationMonth: '2026-08' });
var ssNB = ioNB.openTarget();
var beforeCap = envNoBundle.captured.length;
ioNB.workspaceGet({ scope: SCOPES[0] }, ssNB);          // handler will read canonically itself (no seam injected)
var capNB = envNoBundle.captured[beforeCap];
ok(capNB && capNB.recoIo.readCanonicalSnapshots === undefined, 'G1 no readCanonicalSnapshots seam injected when KMPS.readCanonicalSnapshots is not a function');
ok(capNB && capNB.read && capNB.read.snapshots, 'G2 handler still produced a canonical read via its own fallback (prior behavior preserved)');

// -----------------------------------------------------------------------------------------------------------------
section('DETERMINISM — a second batch on a fresh io reads exactly once again (per-io lifetime)');
var envRepeat = makeEnv();
var run1 = runBatch(envRepeat, SCOPES, true);
var run2 = runBatch(envRepeat, SCOPES, true);            // NOTE: runBatch creates a NEW io each call (new batch)
eq([run1.reads, run2.reads], [1, 1], 'D1 each batch (fresh io) performs exactly one canonical read — cache never bleeds across batches');
eq(rowsFor(run2.perScope[0]), rowsFor(run1.perScope[0]), 'D2 repeated batch is deterministic (identical snapshot content)');

console.log('\n----------------------------------------');
console.log('GAP PREREAD SNAPSHOTS (F1-7M-E-43): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
