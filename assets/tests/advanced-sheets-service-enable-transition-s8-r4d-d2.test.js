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
var R44_ID = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R44';

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
// T5 asserted the WORD 'operator' appeared in the declaration. That is a proxy for the fact, and the fact is
// what matters: this repository declares INTENT and cannot prove the service is live in the deployed
// project. R44 makes the fact sharper rather than weaker - the product now DEPENDS on the service - so the
// assertion moves to the two things that are actually load-bearing.
ok(/two separate switches/i.test(read(STATE_REL)),
  'T5  the declaration states that the repository and the Apps Script project are two separate switches — '
  + 'this file is INTENT and cannot prove ADVANCED_SHEETS_SERVICE_LIVE');
ok(/\bPRODUCT_RUNTIME_DEPENDENCY\b/.test(read(STATE_REL))
  && require(path.join(ROOT, STATE_REL)).PRODUCT_RUNTIME_DEPENDENCY === true,
  'T5a and it is now declared a PRODUCT RUNTIME dependency, not benchmark infrastructure — R44 cannot serve '
  + 'its primary read without the service, which is a different kind of claim from "a benchmark used it"');
ok(/runtime_authority|by EXECUTION/i.test(read(STATE_REL)),
  'T5b and it points at the EXECUTED attestation, because a manifest in this repository is not necessarily '
  + 'the manifest in the deployed project');

// ===================================================================================================
console.log('\n================ U — WHAT THE FLIP DID NOT BUY ================\n');

// S8-R4D-E2 - PINNED AT BOTH ENDS, and this is the round that proves it was needed.
//
// U1/U2/U4 read the WORKING TREE and said 'no Product file consumes the service, and no R44 exists'. That
// was the correct claim for S8-R4D-D2 and it was true for exactly as long as D2 was the newest round. R44
// adopts the service deliberately, so a gate reading HEAD now fails while describing a tree that is right.
//
// The fact worth keeping is unchanged and is about D2: ENABLING A SERVICE FOR A BENCHMARK DID NOT ADOPT IT.
// That is a statement about a closed interval, so it is now read at D2_END - the last tree before the
// implementation round - and the head gets its own paragraph below, stating what R44 did on purpose.
var D2_END = '8ba0097';        // S8-R4D-E1's freeze: the last tree in which B1 was NOT in the Product path
function runtimeAt(sha) {
  return git(['ls-tree', '--name-only', sha + ':' + GS]).trim().split(/\r?\n/)
    .filter(function (f) { return /^\d\d_.*\.gs$/.test(f); });
}
var RUNTIME_GS = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) { return /^\d\d_.*\.gs$/.test(f); });
ok(RUNTIME_GS.length > 20, 'U0  the runtime scan sees ' + RUNTIME_GS.length + ' files — the checks below are '
  + 'not passing over an empty list');

var RUNTIME_AT_D2 = runtimeAt(D2_END);
ok(RUNTIME_AT_D2.length > 20, 'U0a and the ' + D2_END + ' scan sees ' + RUNTIME_AT_D2.length + ' files');
eq(RUNTIME_AT_D2.filter(function (f) { return /\bSheets\.Spreadsheets\b/.test(showAt(D2_END, GS + f)); }), [],
  'U1  AT ' + D2_END + ' no Product runtime file consumed the advanced service — enabling it for a '
  + 'benchmark was not adopting it');
eq(RUNTIME_AT_D2.filter(function (f) { return /\bbatchGet\b/.test(showAt(D2_END, GS + f)); }), [],
  'U2  and none called batchGet — B1 PRODUCT IMPLEMENTATION was NOT AUTHORIZED in that round');
ok(/\bSheets\.Spreadsheets\b/.test(read(TOOL_REL)),
  'U3  the TEMP benchmark tool DOES consume it — so U1 is a real exclusion, not a pattern that matches nothing');

ok(new RegExp("var SIR_BUILD_VERSION_ = '" + R43_ID + "'").test(showAt(D2_END, GS + '60_api_v1_inventory_replenishment_workspace.gs')),
  'U4  60_ was still R43 at ' + D2_END + ' — no R44 was cut by enabling a service for a benchmark');
ok(new RegExp("var SYS_DEPLOYMENT_RELEASE_ = '" + R43_ID + "'").test(showAt(D2_END, GS + '63_api_v1_system_health.gs')),
  'U4a and the deployment release was still R43 there');
eq(RUNTIME_AT_D2.filter(function (f) { return /R44/.test(showAt(D2_END, GS + f)); }), [],
  'U4b and the string R44 appeared in no runtime file at all');

// THE HEAD HALF — what R44 did on purpose, stated rather than inherited. Adoption is now EXPECTED, and it is
// expected in exactly one file: a second Product consumer appearing without its own round would still fail.
// CONSUMING the service and ATTESTING it are different things, and 63_ does the second: it asks
// `typeof Sheets` so a deployment that lost the service says so in system.health. That is a namespace
// check, not a read, and it issues no request. So the detector matches CALL SITES over comment-stripped
// source — otherwise the health attestation, and the prose describing it, would count as adoption.
var CALL_RE = /Sheets\.Spreadsheets\.(get|Values\.batchGet)\s*\(/;
eq(RUNTIME_GS.filter(function (f) { return CALL_RE.test(stripComments(read(GS + f))); }),
  ['60_api_v1_inventory_replenishment_workspace.gs'],
  'U5  AT HEAD exactly ONE Product runtime file CALLS the advanced service — the first-layer reader, '
  + 'and nothing else drifted onto the dependency');
eq(RUNTIME_GS.filter(function (f) { return /Values\.batchGet\s*\(/.test(stripComments(read(GS + f))); }),
  ['60_api_v1_inventory_replenishment_workspace.gs'],
  'U5a and exactly one calls batchGet');
ok(/typeof Sheets/.test(stripComments(read(GS + '63_api_v1_system_health.gs')))
  && !CALL_RE.test(stripComments(read(GS + '63_api_v1_system_health.gs'))),
  'U5b 63_ ATTESTS the service without calling it — a typeof check costs no API call, which is what lets '
  + 'the health probe answer honestly on a deployment that cannot serve the read at all');
ok(new RegExp("var SIR_BUILD_VERSION_ = '" + R44_ID + "'").test(read(GS + '60_api_v1_inventory_replenishment_workspace.gs')),
  'U6  and it declares R44 — the round its read transport changed');
ok(new RegExp("var SYS_DEPLOYMENT_RELEASE_ = '" + R44_ID + "'").test(read(GS + '63_api_v1_system_health.gs')),
  'U6a and the deployment release is R44');
ok(!/R44/.test(read(GS + '01_router.gs')),
  'U6b 01_ is NOT stamped R44 — no action, no route and no request field moved');

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
console.log('\n================ P — THE §8 AVAILABILITY PROBE IS READ ONLY ================\n');

// The probe reaches PRODUCTION. It gets the same zero-write treatment the benchmark tool gets, for the
// same reason: 'it only reads' is a claim about a file, and a claim about a file is testable.
var PROBE_REL = 'assets/tools/apps-script-diagnostics/TEMP_S8_R4D_D2_SHEETS_AVAILABILITY_PROBE.gs';
var PROBE = read(PROBE_REL);

// Comments are stripped first. The probe's header EXPLAINS that it performs no write, and a detector
// that punished the documentation it depends on would teach the next author to stop writing it.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/[ \t]\/\/.*$/gm, ' ');
}
var PROBE_CODE = stripComments(PROBE);
var WRITE_PRIMS = ['setValue', 'setValues', 'appendRow', 'insertRow', 'insertRows', 'deleteRow',
  'deleteRows', 'insertSheet', 'deleteSheet', 'clearContents', 'clear(', 'setFormula', 'setBackground',
  'PropertiesService', 'CacheService', 'DriveApp', 'MailApp', 'GmailApp', 'ScriptApp.newTrigger',
  'Sheets.Spreadsheets.Values.update', 'Sheets.Spreadsheets.Values.append',
  'Sheets.Spreadsheets.batchUpdate'];
eq(WRITE_PRIMS.filter(function (w) { return PROBE_CODE.indexOf(w) !== -1; }), [],
  'P1  WRITE_PRIMITIVE_COUNT = 0 — no sheet write, property, cache, drive, mail or trigger primitive');
ok(/PASTE\s*[·.|-]\s*RUN\s*[·.|-]\s*REPORT\s*[·.|-]\s*REMOVE/i.test(PROBE),
  'P2  the header declares PASTE / RUN / REPORT / REMOVE — it says what it is, in the file itself');

// It must not become a measurement. A probe that reported milliseconds would have its number read as the
// benchmark's, and the first call after a service is enabled is the worst sample that will ever be taken.
ok(!/Date\.now\(\)|getTime\(\)|_MS\b|elapsed/i.test(PROBE_CODE),
  'P3  it takes NO timing — §8 answers availability, and §15 answers speed, in pairs, separately');

// One cell. A probe that pulled a whole sheet would be a small benchmark nobody controlled.
var ranges = PROBE_CODE.match(/ranges:\s*\[([^\]]*)\]/);
ok(!!ranges, 'P4  the batchGet call names its ranges literally, so the width is reviewable');
eq((ranges ? ranges[1] : '').split(',').length, 1, 'P4a exactly ONE range');
ok(/!A1:A1'/.test(ranges ? ranges[1] : ''), 'P4b and it is a single cell — A1:A1');
ok(/fields:\s*'sheets\.properties\.title'/.test(PROBE_CODE),
  'P4c and the metadata call is field-limited to titles, so it pulls no grid data');

// No spreadsheet id is introduced by a diagnostic. It reads the one the runtime already declares.
ok(/PRODUCTION_DB_SPREADSHEET_ID_/.test(PROBE_CODE),
  'P5  the id comes from 00_config.gs — no literal id is introduced by a TEMP file');
eq((PROBE_CODE.match(/1[A-Za-z0-9_-]{30,}/g) || []), [],
  'P5a and no spreadsheet-id-shaped literal appears anywhere in it');

// It is not product code: no action, no route, no handler reaches it.
ok(!/registerAction|KMWRR|KM_ACTION|doGet|doPost/.test(PROBE_CODE),
  'P6  it registers no action and defines no entry point the router could reach');
eq(fs.readdirSync(path.join(ROOT, GS)).filter(function (f) {
  return /\.gs$/.test(f) && /D2PROBE_/.test(read(GS + f)); }), [],
  'P6a and no Apps Script runtime file calls it');

// THE THREE QUESTIONS STAY THREE. Namespace, get and batchGet fail for three different reasons — the
// service not added, the Cloud API not enabled, and a permission problem. Collapsing them discards the
// only diagnosis the probe exists to produce, and a partial pass must never report LIVE.
['SHEETS_NAMESPACE_RESOLVES', 'SPREADSHEETS_GET_OK', 'VALUES_BATCHGET_OK'].forEach(function (k) {
  ok(PROBE_CODE.indexOf(k) !== -1, 'P7  it reports ' + k + ' on its own');
});
var liveExpr = (PROBE_CODE.match(/ADVANCED_SHEETS_SERVICE_LIVE\s*=\s*[\s\S]*?;/g) || []).join(' ');
eq(['SHEETS_NAMESPACE_RESOLVES', 'SPREADSHEETS_GET_OK', 'VALUES_BATCHGET_OK']
    .filter(function (k) { return liveExpr.indexOf(k) === -1; }), [],
  'P7a and LIVE = YES requires ALL THREE — two of three would hand the benchmark a candidate arm that '
  + 'cannot complete');

// A failure must be reportable. Summarising the error text away is how a 403 SERVICE_DISABLED becomes
// an indistinguishable false.
eq((PROBE_CODE.match(/errors\.push\(/g) || []).length, 4,
  'P8  every one of the three calls, plus the hard stop, pushes its RAW error text');

// ===================================================================================================
console.log('\n================ W — MUTANTS ================\n');

// Mutations are applied to in-memory COPIES. Nothing is written to disk: a suite that rewrites a real source
// file and is then killed leaves the mutant behind, and that has already cost this repository a round.
var TREE = {
  state: NOW_STATE_SRC,
  manifest: NOW_MANIFEST_SRC,
  probe: PROBE,
  runtime: RUNTIME_GS.reduce(function (a, f) { a[f] = read(GS + f); return a; }, {})
};
function clone(t) { return { state: t.state, manifest: t.manifest, probe: t.probe, runtime: JSON.parse(JSON.stringify(t.runtime)) }; }
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
var B1_OWNER_ = '60_api_v1_inventory_replenishment_workspace.gs';
function otherRuntime(t) { return Object.keys(t.runtime).filter(function (f) { return f !== B1_OWNER_; })[0]; }
// EXACTLY ONE owner, named. 'none' stopped being the right answer at R44; 'exactly the declared one' is
// stronger than either, because it still fails when a second file drifts onto the dependency.
var dRuntimeConsumes = function (t) {
  var hits = Object.keys(t.runtime).filter(function (f) { return /Sheets\.Spreadsheets\.(get|Values\.batchGet)\s*\(/.test(stripComments(t.runtime[f])); });
  return hits.length !== 1 || hits[0] !== B1_OWNER_;
};
var dRuntimeBatchGet = function (t) {
  var hits = Object.keys(t.runtime).filter(function (f) { return /Values\.batchGet\s*\(/.test(stripComments(t.runtime[f])); });
  return hits.length !== 1 || hits[0] !== B1_OWNER_;
};
// R44 is now EXPECTED in the two owners and forbidden everywhere else — the same shape, one release later.
var dR44 = function (t) {
  var hits = Object.keys(t.runtime).filter(function (f) { return /R6-R7-R44/.test(t.runtime[f]); }).sort();
  return JSON.stringify(hits) !== JSON.stringify([B1_OWNER_, '63_api_v1_system_health.gs']);
};
var dProbeWrites = function (t) { var c = stripComments(t.probe); return WRITE_PRIMS.some(function (w) { return c.indexOf(w) !== -1; }); };
var dProbeLive = function (t) {
  var e = (stripComments(t.probe).match(/ADVANCED_SHEETS_SERVICE_LIVE\s*=\s*[\s\S]*?;/g) || []).join(' ');
  return ['SHEETS_NAMESPACE_RESOLVES', 'SPREADSHEETS_GET_OK', 'VALUES_BATCHGET_OK']
    .some(function (k) { return e.indexOf(k) === -1; });
};
var dProbeRange = function (t) {
  var m = stripComments(t.probe).match(/ranges:\s*\[([^\]]*)\]/);
  return !m || m[1].split(',').length !== 1 || !/!A1:A1'/.test(m[1]);
};
var dProbeId = function (t) { return (stripComments(t.probe).match(/1[A-Za-z0-9_-]{30,}/g) || []).length > 0; };
var dProbeTiming = function (t) { return /Date\.now\(\)|getTime\(\)|_MS\b|elapsed/i.test(stripComments(t.probe)); };
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
  // S8-R4D-E2 - these two now mutate a SECOND consumer onto the dependency, because the FIRST one is the
  // whole point of R44. The detectors compare against the declared single owner rather than against zero.
  { id: 'M10', why: 'a SECOND Product runtime file starts consuming the advanced service',
    det: dRuntimeConsumes, mut: function (t) { t.runtime[otherRuntime(t)] += '\nfunction x_(){ return Sheets.Spreadsheets.get(id, {}); }\n'; } },
  { id: 'M11', why: 'a SECOND Product runtime file starts calling batchGet',
    det: dRuntimeBatchGet, mut: function (t) { t.runtime[otherRuntime(t)] += '\nfunction y_(){ return Sheets.Spreadsheets.Values.batchGet(id, {}); }\n'; } },
  { id: 'M12', why: 'a THIRD runtime file is marched to R44 to make the release look complete',
    det: dR44, mut: function (t) { t.runtime[otherRuntime(t)] += '\n// ' + R44_ID + '\n'; } },
  { id: 'M13', why: 'an unrelated manifest edit hides beside the service, so deletion no longer restores PRE',
    det: dRollback, mut: function (t) { t.manifest = t.manifest.replace('"STACKDRIVER"', '"NONE"'); } },
  // The §8 probe's own gates. It reaches Production, so its mutants run here rather than nowhere.
  { id: 'M14', why: 'the probe gains a write primitive',
    det: dProbeWrites, mut: function (t) { t.probe += '\nfunction z_(){ sh.getRange(1,1).setValue(1); }\n'; } },
  { id: 'M15', why: 'LIVE is computed from two of the three answers, so a partial pass reports YES',
    det: dProbeLive, mut: function (t) { t.probe = t.probe.replace('&& out.VALUES_BATCHGET_OK)', ')'); } },
  { id: 'M16', why: 'the one-cell range is widened into an unmeasured read of a whole sheet',
    det: dProbeRange, mut: function (t) { t.probe = t.probe.replace("marketplaces!A1:A1", 'marketplaces!A:AZ'); } },
  { id: 'M17', why: 'a literal spreadsheet id is introduced by a TEMP diagnostic',
    det: dProbeId, mut: function (t) { t.probe = t.probe.replace('PRODUCTION_DB_SPREADSHEET_ID_',
      "'1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk'"); } },
  { id: 'M18', why: 'the probe starts timing itself, inviting its number to be read as the benchmark',
    det: dProbeTiming, mut: function (t) { t.probe += '\nvar t0 = Date.now();\n'; } }
];

var survived = 0, vacuous = 0;
MUTANTS.forEach(function (m) {
  var clean = clone(TREE);
  if (m.det(clean)) { vacuous++; console.log('VACUOUS ' + m.id + '  the detector already fires on the UNMUTATED tree — it is not detecting the fault'); return; }
  var t = clone(TREE);
  m.mut(t);
  var changed = t.state !== clean.state || t.manifest !== clean.manifest || t.probe !== clean.probe
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
