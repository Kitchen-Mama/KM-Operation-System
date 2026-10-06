/**
 * S8-R4D-D2 — THE SERVICE-STATE TRANSITION.
 *
 * D1 built a guard that answers "is the manifest consistent with the declared state RIGHT NOW". That is a
 * question about one tree. This suite asks the different question D2 creates: "was the move from PRE_ENABLE
 * to POST_ENABLE a single, deliberate, bounded event" — a question about the history between two trees.
 *
 * WHY THAT IS A SEPARATE SUITE. The declaration and the manifest are ONE state expressed in two files. A
 * commit that carries only one half leaves a tree where the guard still passes on its own terms while the
 * repository means two different things: `SHEETS_ENABLED: true` with no service in the manifest deploys a
 * script that throws on `Sheets`, and a service in the manifest with the flag still false is precisely the
 * "it appeared and nobody decided it should" failure D1 exists to prevent. Neither half is wrong in
 * isolation, which is why only a suite that reads BOTH halves at EVERY point can see it.
 *
 * WHAT THIS SUITE CANNOT SAY. Enabling the service in the Apps Script project and the Google Sheets API in
 * the attached Cloud project are OPERATOR actions in Google's console. No repository file records them and
 * no test here can prove them. ADVANCED_SHEETS_SERVICE_LIVE is therefore operator-reported evidence, and
 * T5 states that explicitly rather than letting a green suite imply the service is actually live.
 *
 * SCOPE. Enablement authorises the READ-ONLY BENCHMARK and nothing else (S8-R4D-D2 §1). Section U asserts
 * what the flip did NOT buy: no Product consumer, no batchGet in the runtime, no R44.
 */
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
var MANIFEST_REL = GS + 'appsscript.json';
var STATE_REL = 'assets/tests/_advanced-services-state.js';
var TOOL_REL = 'assets/tools/apps-script-diagnostics/TEMP_S8_R4D_B1_ADVANCED_SHEETS_BENCHMARK.gs';
// S8-R4D-D1's head: the LAST PRE_ENABLE tree, and also the FIRST tree in which the declaration file exists
// at all — it was created by 7a3f9fa. Pinning the walk at D-D's 4a4a7f8 instead would ask git for a file
// that is not there, which is a different thing from asking it for a file that says `false`.
var PRE_SHA = '3d71590';
// The manifest itself has not moved since well before either sha (last touched by 4fe53bd), so the manifest
// baseline and the declaration baseline are the same tree here — asserted below rather than assumed.
var MANIFEST_BASE_SHA = '4a4a7f8';
var R43_ID = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R43';

var pass = 0, fail = 0;
function ok(c, m, extra) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m + (extra === undefined ? '' : '\n   ' + extra)); } }
function eq(a, b, m) { var A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m, A === B ? '' : 'expected ' + B + '\n   actual   ' + A); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function git(args) { return cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
function showAt(sha, rel) { return git(['show', sha + ':' + rel]); }

// The declaration is a module, and `require` caches. Parsing the literal keeps the SAME reader for a tree on
// disk and a tree in git, so T3 compares like with like rather than one parsed form against another.
function declaredEnabled(src) {
  var m = src.match(/^\s*SHEETS_ENABLED:\s*(true|false)\s*,/m);
  if (!m) return null;
  return m[1] === 'true';
}
function sheetsCount(manifestSrc) {
  var m = JSON.parse(manifestSrc);
  var list = (m.dependencies && m.dependencies.enabledAdvancedServices) || [];
  return list.filter(function (s) { return String(s.serviceId).toLowerCase() === 'sheets'; }).length;
}

// ===================================================================================================
console.log('\n================ T — THE TRANSITION IS ONE EVENT ================\n');

var PRE_STATE_SRC = showAt(PRE_SHA, STATE_REL);
var PRE_MANIFEST_SRC = showAt(PRE_SHA, MANIFEST_REL);
eq(declaredEnabled(PRE_STATE_SRC), false,
  'T1  at ' + PRE_SHA + ' the repository declared the service DISABLED');
eq(sheetsCount(PRE_MANIFEST_SRC), 0,
  'T1a ...and the manifest there declared no Sheets service — both halves of PRE_ENABLE, read from git');
eq(PRE_MANIFEST_SRC, showAt(MANIFEST_BASE_SHA, MANIFEST_REL),
  'T1b and the manifest at ' + PRE_SHA + ' is byte-identical to the one at ' + MANIFEST_BASE_SHA + ', so the '
  + 'declaration baseline and the manifest baseline are genuinely the same tree rather than assumed to be');

var NOW_STATE_SRC = read(STATE_REL);
var NOW_MANIFEST_SRC = read(MANIFEST_REL);
eq(declaredEnabled(NOW_STATE_SRC), true,
  'T2  in the working tree the repository declares the service ENABLED — S8-R4D-D2 §3');
eq(sheetsCount(NOW_MANIFEST_SRC), 1,
  'T2a ...and the manifest declares Sheets exactly once — both halves of POST_ENABLE');

// The core claim. The two files are ONE state; a point where they disagree is a tree that deploys a meaning
// nobody chose. This walks every commit of the round AND the working tree, so an uncommitted half is caught
// before it is committed rather than after — the suite is not blind to the tree it is run against.
var commits = git(['rev-list', '--reverse', PRE_SHA + '..HEAD']).trim().split(/\r?\n/).filter(Boolean);
var points = commits.map(function (c) {
  return { label: c.slice(0, 7), state: showAt(c, STATE_REL), manifest: showAt(c, MANIFEST_REL) };
});
points.unshift({ label: PRE_SHA + ' (base)', state: PRE_STATE_SRC, manifest: PRE_MANIFEST_SRC });
points.push({ label: 'WORKING TREE', state: NOW_STATE_SRC, manifest: NOW_MANIFEST_SRC });

var split = points.filter(function (p) {
  return declaredEnabled(p.state) !== (sheetsCount(p.manifest) === 1);
}).map(function (p) { return p.label + ' declared=' + declaredEnabled(p.state) + ' manifest=' + sheetsCount(p.manifest); });
eq(split, [],
  'T3  at EVERY point from ' + PRE_SHA + ' to the working tree the declaration and the manifest AGREE — the '
  + 'flip and the service entry are one state and must land in one commit');
ok(points.length >= 2,
  'T3a ...and that walk saw ' + points.length + ' points, so T3 is not passing over an empty history');
// The floor above is weak on its own: two agreeing PRE points would satisfy it. The walk is only meaningful
// if it actually SPANS the transition, so assert it contains both states rather than merely some points.
// (Before the transition commit exists the walk is base + working tree; afterwards it is base + commit +
// working tree. Both span it, which is why this suite is honest about an uncommitted tree.)
ok(points.some(function (p) { return declaredEnabled(p.state) === false; })
  && points.some(function (p) { return declaredEnabled(p.state) === true; }),
  'T3b ...and it SPANS the transition — it contains a declared-false point and a declared-true point, so T3 '
  + 'is comparing the two states rather than one state with itself');

// The transition point itself, named. Useful to a reader and, more importantly, proof the round actually
// contains a transition rather than having started life already enabled.
var flipped = [];
for (var i = 1; i < points.length; i++) {
  if (declaredEnabled(points[i].state) !== declaredEnabled(points[i - 1].state)) flipped.push(points[i].label);
}
eq(flipped.length, 1,
  'T4  the state flips EXACTLY ONCE in this round (at ' + (flipped[0] || 'nowhere') + ') — not twice, and '
  + 'not never');

// A green suite must not be read as "the service is live". Google's console is not in this repository.
ok(/operator/i.test(read(STATE_REL)),
  'T5  the declaration states that the Apps Script / Cloud switch is an OPERATOR action — this repository '
  + 'declares INTENT and cannot prove ADVANCED_SHEETS_SERVICE_LIVE');

// ===================================================================================================
console.log('\n================ U — WHAT THE FLIP DID NOT BUY ================\n');

var RUNTIME_GS = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) { return /^\d\d_.*\.gs$/.test(f); });
ok(RUNTIME_GS.length > 20, 'U0  the runtime scan sees ' + RUNTIME_GS.length + ' files — the checks below are '
  + 'not passing over an empty list');

eq(RUNTIME_GS.filter(function (f) { return /\bSheets\.Spreadsheets\b/.test(read(GS + f)); }), [],
  'U1  NO Product runtime file consumes the advanced service — enabling it for a benchmark is not adopting it');
eq(RUNTIME_GS.filter(function (f) { return /\bbatchGet\b/.test(read(GS + f)); }), [],
  'U2  and no Product runtime file calls batchGet — B1 PRODUCT IMPLEMENTATION = NOT AUTHORIZED (§1)');
ok(/\bSheets\.Spreadsheets\b/.test(read(TOOL_REL)),
  'U3  the TEMP benchmark tool DOES consume it — so U1 is a real exclusion, not a pattern that matches nothing');

ok(new RegExp("var SIR_BUILD_VERSION_ = '" + R43_ID + "'").test(read(GS + '60_api_v1_inventory_replenishment_workspace.gs')),
  'U4  60_ is still R43 — no R44 is cut by enabling a service for a benchmark');
ok(new RegExp("var SYS_DEPLOYMENT_RELEASE_ = '" + R43_ID + "'").test(read(GS + '63_api_v1_system_health.gs')),
  'U4a and the deployment release is still R43');
eq(RUNTIME_GS.filter(function (f) { return /R44/.test(read(GS + f)); }), [],
  'U4b and the string R44 appears in no runtime file at all');

var preManifest = JSON.parse(PRE_MANIFEST_SRC), nowManifest = JSON.parse(NOW_MANIFEST_SRC);
eq(nowManifest.oauthScopes, preManifest.oauthScopes,
  'U5  OAUTH_SCOPE_CHANGE_REQUIRED = NO — the scope set at ' + PRE_SHA + ' and now are identical, so no '
  + 'new consent is expected and an unexpected prompt is a signal, not noise');
eq(nowManifest.webapp, preManifest.webapp,
  'U6  the Web App executeAs / access settings are unchanged');
eq([nowManifest.timeZone, nowManifest.runtimeVersion, nowManifest.exceptionLogging],
  [preManifest.timeZone, preManifest.runtimeVersion, preManifest.exceptionLogging],
  'U7  and timezone, runtime and exception logging are unchanged — the timezone in particular is what makes '
  + 'a date cell local midnight, so moving it would silently move 41 date columns');

// ===================================================================================================
console.log('\n================ V — ROLLBACK IS DEFINED, NOT IMPROVISED ================\n');

// A NO-GO must restore the PRE state exactly. Rather than assert prose, compute it: strip the Sheets entry
// from the current manifest and the result must be byte-identical to the manifest at PRE_SHA.
var rolledBack = JSON.parse(JSON.stringify(nowManifest));
rolledBack.dependencies.enabledAdvancedServices = rolledBack.dependencies.enabledAdvancedServices
  .filter(function (s) { return String(s.serviceId).toLowerCase() !== 'sheets'; });
eq(rolledBack, preManifest,
  'V1  removing the Sheets entry restores the ' + PRE_SHA + ' manifest EXACTLY — the change is reversible by '
  + 'deletion alone, with no other edit to undo');
ok(/NO-GO/.test(read(STATE_REL)) && /flips this back to false/.test(read(STATE_REL)),
  'V2  and the declaration names the NO-GO cleanup — both halves move back together, for the same reason '
  + 'they moved forward together');

// ===================================================================================================
console.log('\n================ W — MUTANTS ================\n');

// Mutations are applied to in-memory COPIES. Nothing is written to disk: a suite that rewrites a real source
// file and is then killed leaves the mutant behind, and that has already cost this repository a round.
var TREE = {
  state: NOW_STATE_SRC,
  manifest: NOW_MANIFEST_SRC,
  runtime: RUNTIME_GS.reduce(function (a, f) { a[f] = read(GS + f); return a; }, {})
};
function clone(t) { return { state: t.state, manifest: t.manifest, runtime: JSON.parse(JSON.stringify(t.runtime)) }; }
function anyRuntime(t) { return Object.keys(t.runtime)[0]; }
// The release mutant must land in a file that actually CARRIES the stamp. Pointed at an arbitrary runtime
// file the replace is a silent no-op, and a no-op mutation reported as caught is a lie about coverage.
var STAMPED_FILE = '60_api_v1_inventory_replenishment_workspace.gs';

// Each detector returns TRUE when it sees the fault.
var dSplitState = function (t) { return declaredEnabled(t.state) !== (sheetsCount(t.manifest) === 1); };
var dEntryShape = function (t) {
  var list = (JSON.parse(t.manifest).dependencies || {}).enabledAdvancedServices || [];
  var sh = list.filter(function (s) { return String(s.serviceId).toLowerCase() === 'sheets'; });
  return sh.length !== 1 || sh[0].version !== 'v4' || sh[0].userSymbol !== 'Sheets';
};
var dBigQueryGone = function (t) {
  var list = (JSON.parse(t.manifest).dependencies || {}).enabledAdvancedServices || [];
  return list.filter(function (s) { return s.serviceId === 'bigquery'; }).length !== 1;
};
var dScope = function (t) { return JSON.stringify(JSON.parse(t.manifest).oauthScopes) !== JSON.stringify(preManifest.oauthScopes); };
var dWebapp = function (t) { return JSON.stringify(JSON.parse(t.manifest).webapp) !== JSON.stringify(preManifest.webapp); };
var dTimeZone = function (t) { return JSON.parse(t.manifest).timeZone !== preManifest.timeZone; };
var dRuntimeConsumes = function (t) { return Object.keys(t.runtime).some(function (f) { return /\bSheets\.Spreadsheets\b/.test(t.runtime[f]); }); };
var dRuntimeBatchGet = function (t) { return Object.keys(t.runtime).some(function (f) { return /\bbatchGet\b/.test(t.runtime[f]); }); };
var dR44 = function (t) { return Object.keys(t.runtime).some(function (f) { return /R44/.test(t.runtime[f]); }); };
var dRollback = function (t) {
  var m = JSON.parse(t.manifest);
  m.dependencies.enabledAdvancedServices = m.dependencies.enabledAdvancedServices
    .filter(function (s) { return String(s.serviceId).toLowerCase() !== 'sheets'; });
  return JSON.stringify(m) !== JSON.stringify(preManifest);
};

var MUTANTS = [
  { id: 'M1', why: 'the declaration says ENABLED but the manifest never got the service (half a transition)',
    det: dSplitState, mut: function (t) { t.manifest = t.manifest.replace(/,\s*\{[^{}]*"serviceId":\s*"sheets"[^{}]*\}/, ''); } },
  { id: 'M2', why: 'the manifest got the service but the declaration was never flipped (the other half)',
    det: dSplitState, mut: function (t) { t.state = t.state.replace('SHEETS_ENABLED: true', 'SHEETS_ENABLED: false'); } },
  { id: 'M3', why: 'Sheets declared with the wrong serviceId (spreadsheets)',
    det: dEntryShape, mut: function (t) { t.manifest = t.manifest.replace('"serviceId": "sheets"', '"serviceId": "spreadsheets"'); } },
  { id: 'M4', why: 'Sheets declared at v3 rather than v4',
    det: dEntryShape, mut: function (t) { t.manifest = t.manifest.replace('"version": "v4"', '"version": "v3"'); } },
  { id: 'M5', why: 'Sheets declared twice — a reader could trust the stale entry',
    det: dEntryShape, mut: function (t) { t.manifest = t.manifest.replace(/(\{[^{}]*"serviceId":\s*"sheets"[^{}]*\})/, '$1, $1'); } },
  { id: 'M6', why: 'BigQuery dropped while adding Sheets — the Amazon import breaks and the diff looks like one line',
    det: dBigQueryGone, mut: function (t) { t.manifest = t.manifest.replace(/\{[^{}]*"serviceId":\s*"bigquery"[^{}]*\},\s*/, ''); } },
  { id: 'M7', why: 'a new OAuth scope rides along with the service addition',
    det: dScope, mut: function (t) { t.manifest = t.manifest.replace('"https://www.googleapis.com/auth/spreadsheets"', '"https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"'); } },
  { id: 'M8', why: 'the Web App is quietly reconfigured to execute as the accessing user',
    det: dWebapp, mut: function (t) { t.manifest = t.manifest.replace('"USER_DEPLOYING"', '"USER_ACCESSING"'); } },
  { id: 'M9', why: 'the manifest timezone moves, which silently moves every date cell the product reads',
    det: dTimeZone, mut: function (t) { t.manifest = t.manifest.replace('"Asia/Taipei"', '"America/Los_Angeles"'); } },
  { id: 'M10', why: 'a Product runtime file starts consuming the advanced service',
    det: dRuntimeConsumes, mut: function (t) { t.runtime[anyRuntime(t)] += '\nfunction x_(){ return Sheets.Spreadsheets.get(id); }\n'; } },
  { id: 'M11', why: 'a Product runtime file starts calling batchGet',
    det: dRuntimeBatchGet, mut: function (t) { t.runtime[anyRuntime(t)] += '\nfunction y_(){ return Sheets.Spreadsheets.Values.batchGet(id, {}); }\n'; } },
  { id: 'M12', why: 'benchmark infrastructure cuts an R44 release',
    det: dR44, mut: function (t) { t.runtime[STAMPED_FILE] = t.runtime[STAMPED_FILE].replace(R43_ID, R43_ID.replace('R43', 'R44')); } },
  { id: 'M13', why: 'an unrelated manifest edit hides beside the service, so deletion no longer restores PRE',
    det: dRollback, mut: function (t) { t.manifest = t.manifest.replace('"STACKDRIVER"', '"NONE"'); } }
];

var survived = 0, vacuous = 0;
MUTANTS.forEach(function (m) {
  var clean = clone(TREE);
  if (m.det(clean)) { vacuous++; console.log('VACUOUS ' + m.id + '  the detector already fires on the UNMUTATED tree — it is not detecting the fault'); return; }
  var t = clone(TREE);
  m.mut(t);
  var changed = t.state !== clean.state || t.manifest !== clean.manifest
    || JSON.stringify(t.runtime) !== JSON.stringify(clean.runtime);
  if (!changed) { vacuous++; console.log('VACUOUS ' + m.id + '  the mutation changed NOTHING — a no-op cannot be caught, and reporting it as caught would be a lie'); return; }
  if (m.det(t)) { console.log('caught: ' + m.id + '  ' + m.why); }
  else { survived++; console.log('SURVIVED ' + m.id + '  ' + m.why); }
});
eq(survived, 0, 'W1  0 mutants survived');
eq(vacuous, 0, 'W2  0 vacuous mutants');

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + MUTANTS.length + ' mutants, ' + survived + ' survived, ' + (vacuous === 0 ? 'vacuity clean' : vacuous + ' VACUOUS'));
console.log(new Array(101).join('='));
process.exitCode = fail === 0 ? 0 : 1;
