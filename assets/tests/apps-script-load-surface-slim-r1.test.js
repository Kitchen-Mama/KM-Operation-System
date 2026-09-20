// Kitchen Mama Operation System — APPS-SCRIPT-RUNTIME-SLIM-R1
// PRODUCTION LOAD-SURFACE AUDIT: THE TOOL, AND THE FACTS IT FOUND
// Run: node assets/tests/apps-script-load-surface-slim-r1.test.js
//
// LOCAL / OFFLINE. Reads committed blobs through the audit tool. No network, no DB, no writes.
//
// WHAT THIS SUITE IS FOR. The round it belongs to proposed no change to any runtime file, so there is
// no behaviour here to protect. What there IS to protect is an ANALYSIS that a future round will use
// to decide what may be deleted from production — and an analysis that is wrong in the optimistic
// direction gets a file deleted that something still calls. Two specific ways to be wrong are pinned
// with mutants:
//
//   1. missing a dependency carried in a STRING literal (how Apps Script binds triggers), and
//   2. promoting a trigger owner above AMBIGUOUS when source cannot see the trigger list.
//
// The audit's numeric findings are pinned as <= / >= where a future round should be free to improve
// them, and exactly where the number IS the claim.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
var TOOL_REL = 'assets/tools/apps-script-audit/gs-load-surface-audit.js';
var DOC_REL = 'docs/planning/APPS_SCRIPT_RUNTIME_SLIM_R1_LOAD_SURFACE_AUDIT.md';
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

var TOOL_SRC = read(TOOL_REL);
var DOC = read(DOC_REL);
var tool = require(path.join(REPO, TOOL_REL));

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) { pass++; } else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 92 - n.length)).join('-')); }

var A = tool.analyze({ repo: REPO, rev: 'HEAD' });
var byFile = {};
A.report.forEach(function (r) { byFile[r.file] = r; });

// ---------------------------------------------------------------------------------------------------
section('A  the directory the tool reads');
// ---------------------------------------------------------------------------------------------------
ok(A.directoryFiles >= 80, 'A1 the apps-script directory holds the whole server source', A.directoryFiles);
eq(A.entryPoints, ['01_router.gs'], 'A2 there is exactly ONE web entry point, and it is the router');
ok(A.distinctRoutedActions >= 60, 'A3 the router resolves a substantial action surface', A.distinctRoutedActions);
ok(A.manifestRows >= 26, 'A4 the health manifest declares its required owners', A.manifestRows);
// Bytes come from the committed blob. On this platform the working copy is CRLF, so a tool that read
// the working copy would over-count by one byte per line — about 100 KB across the project.
var lineish = A.report.reduce(function (a, r) { return a + r.bytes; }, 0);
ok(lineish === A.directoryBytes, 'A5 the reported total is the sum of the per-file committed sizes', A.directoryBytes);

// ---------------------------------------------------------------------------------------------------
section('B  the string-literal dependency, which is how a trigger is bound');
// ---------------------------------------------------------------------------------------------------
var sched = byFile['44_gap_materialization_scheduler.gs'];
ok(!!sched, 'B1 the gap-materialization scheduler is in the directory');
eq(sched.triggerHandlers.sort(), ['runDailyInventoryGapMaterialization', 'runDailyOrderPlanningGapMaterialization'],
  'B2 its two trigger handlers are recognised as trigger handlers');
ok(sched.inboundFiles.length === 0, 'B3 NO file references the scheduler in ordinary code — the fact that misleads', sched.inboundFiles);
eq(sched.inboundStringFiles, ['45_api_v1_automation_schedule.gs'],
  'B4 but the automation-schedule owner DOES name its handlers in string literals — the dependency a code-only scan misses');
// The precision half of the same claim, and the reason a string scan is not just "grep for the name":
// 46_ mentions both handlers too, in a LINE COMMENT. A comment is not a dependency, and counting it
// would manufacture an edge that does not exist. The tool must see one of these and not the other.
ok(sched.inboundStringFiles.indexOf('46_api_v1_gap_materialization_job.gs') === -1
  && sched.inboundFiles.indexOf('46_api_v1_gap_materialization_job.gs') === -1,
  'B5 and the file that names them only in a COMMENT is correctly NOT counted', sched.inboundStringFiles);
var G46 = read('assets/specs/active/apps-script/46_api_v1_gap_materialization_job.gs');
ok(/\/\/[^\n]*runDailyInventoryGapMaterialization/.test(G46),
  'B5a  …and that comment really is there, so B5 is discriminating rather than vacuous');
ok(sched.reachableFromEntry === true, 'B6 so the scheduler IS reachable, via the string edge');
ok(sched.classification === 'H_AMBIGUOUS_TRIGGER_OWNER',
  'B7 and it is still only AMBIGUOUS — source cannot prove a trigger is not installed', sched.classification);

// ---------------------------------------------------------------------------------------------------
section('C  what the audit found, as findings a later round will act on');
// ---------------------------------------------------------------------------------------------------
// The seven files the live probe found ABSENT from the deployment. Pinned by name because the next
// round's first question is "is this still true", and a changed list must be re-probed, not assumed.
var NOT_DEPLOYED = [
  'TEMP_demo_shipping_shipment_map_seed_v2.gs',
  'TEMP_document_diagnostics.gs',
  'TEMP_draft_migration_diagnostic.gs',
  'TEMP_migrate_request_order_draft_v2.gs',
  'TEMP_migrate_shipping_allocation_ai_lifecycle.gs',
  'TEMP_order_planning_draft_readback_diagnose.gs',
  'TEMP_request_order_send_diagnostics.gs'
];
NOT_DEPLOYED.forEach(function (n, i) {
  ok(!!byFile[n], 'C1.' + (i + 1) + ' ' + n + ' still exists in the repository (source is retained)');
});
var notDeployedBytes = NOT_DEPLOYED.reduce(function (a, n) { return a + (byFile[n] ? byFile[n].bytes : 0); }, 0);
ok(notDeployedBytes > 800000, 'C2 together they are the 808 KB the round assumed was deployed', notDeployedBytes);
ok(A.directoryBytes - notDeployedBytes < 4200000,
  'C3 so the DEPLOYED project is under 4.2 MB, not the 4.71 MB of the directory', A.directoryBytes - notDeployedBytes);

// The two the round named as its candidates are the two largest, and both are already out.
ok(byFile['TEMP_migrate_request_order_draft_v2.gs'].bytes > 400000, 'C4 the Request Order V2 helper is the largest single TEMP file',
  byFile['TEMP_migrate_request_order_draft_v2.gs'].bytes);
ok(byFile['TEMP_demo_shipping_shipment_map_seed_v2.gs'].bytes > 290000, 'C5 the shipping demo seed is the second largest',
  byFile['TEMP_demo_shipping_shipment_map_seed_v2.gs'].bytes);
ok(byFile['TEMP_migrate_request_order_draft_v2.gs'].inboundFiles.length === 0
  && byFile['TEMP_migrate_request_order_draft_v2.gs'].inboundStringFiles.length === 0,
  'C6 no runtime file depends on the V2 migration helper, by code OR by string');
ok(byFile['TEMP_demo_shipping_shipment_map_seed_v2.gs'].inboundFiles.length === 0
  && byFile['TEMP_demo_shipping_shipment_map_seed_v2.gs'].inboundStringFiles.length === 0,
  'C7 nor on the demo seed');

// The cutover flag that decides whether the V2 migration helper could still be needed.
var CFG = read('assets/specs/active/apps-script/00_config.gs');
ok(/var\s+REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_\s*=\s*true\s*;/.test(CFG),
  'C8 the Request Order V2 flat cutover flag is TRUE in the deployed config owner');

// The only three deployed files nothing reaches.
var ORPHANS = ['26_recommendation_source_reader.gs', '27_recommendation_production_source.gs',
               '28_recommendation_verification_diagnostics.gs'];
ORPHANS.forEach(function (n, i) {
  var r = byFile[n];
  ok(r && r.reachableFromEntry === false, 'C9.' + (i + 1) + ' ' + n + ' is deployed but unreached');
  ok(r && r.inboundFiles.length === 0 && r.inboundStringFiles.length === 0,
    'C10.' + (i + 1) + ' …and nothing references it, by code or string');
  ok(r && r.mutations.filter(function (m) { return m === 'sheetWrite' || m === 'driveMail'; }).length === 0,
    'C11.' + (i + 1) + ' …and it cannot write a sheet or send mail', r ? r.mutations : null);
});
var orphanBytes = ORPHANS.reduce(function (a, n) { return a + byFile[n].bytes; }, 0);
ok(orphanBytes < 12000, 'C12 the entire remaining retirement surface is under 12 KB', orphanBytes);
ok(orphanBytes / (A.directoryBytes - notDeployedBytes) < 0.005,
  'C13 which is under half a percent of the deployed project — a cleanup, never a latency fix',
  (100 * orphanBytes / (A.directoryBytes - notDeployedBytes)).toFixed(2) + '%');

// The generated bundle is the largest single deployed file and is REQUIRED.
var bundle = byFile['90_generated_supply_planning_bundle.gs'];
ok(bundle.classification === 'B_GENERATED_RUNTIME', 'C14 the generated bundle is classified as generated runtime');
ok(bundle.bytes > 1000000, 'C15 and it alone is over 1 MB — larger than everything retirable by two orders of magnitude', bundle.bytes);

// ---------------------------------------------------------------------------------------------------
section('D  the document records what the tool cannot');
// ---------------------------------------------------------------------------------------------------
[
  ['RETIREMENT_AUTHORIZED = NO', 'D1 the audit authorises no retirement'],
  ['SCHEDULED_TRIGGER_EVIDENCE', 'D2 it names trigger evidence as an open operator question'],
  ['808,195', 'D3 it records the not-deployed byte total'],
  ['4,125,608', 'D4 it records the deployed byte total'],
  ['typeof', 'D5 it explains that presence was established by a typeof probe'],
  ['negative control', 'D6 …and that the probe was shown to discriminate']
].forEach(function (p) { ok(DOC.indexOf(p[0]) > -1, p[1] + '  (' + p[0] + ')'); });
ok(DOC.indexOf('APPS_SCRIPT_SYNC_REQUIRED = NO') > -1, 'D7 and that nothing needs syncing');

// ---------------------------------------------------------------------------------------------------
section('E  mutants');
// ---------------------------------------------------------------------------------------------------
var mutants = [];
function runMutated(src) {
  var mod = { exports: {} };
  vm.runInNewContext(src, {
    module: mod, exports: mod.exports, require: require, console: console,
    process: process, Buffer: Buffer, __dirname: path.join(REPO, 'assets/tools/apps-script-audit'), __filename: 'm.js'
  });
  return mod.exports.analyze({ repo: REPO, rev: 'HEAD' });
}
function mutant(label, mutate, detect) {
  var src;
  try { src = mutate(TOOL_SRC); } catch (e) { src = null; }
  if (src === null || src === TOOL_SRC) {
    mutants.push({ label: label, survived: true });
    console.error('SURVIVED  ' + label + '  (the mutation did not apply — the anchor is gone)');
    return;
  }
  var caught = false;
  try { caught = detect(runMutated(src)); } catch (e) { caught = true; }
  mutants.push({ label: label, survived: !caught });
  console.log('  ' + (caught ? 'ok       ' : 'SURVIVED ') + label + (caught ? ' (caught)' : ''));
}
function swap(src, a, b) {
  if (src.split(a).length - 1 !== 1) { throw new Error('anchor not unique: ' + a.slice(0, 60)); }
  return src.replace(a, b);
}

// M1 — the whole point of the tool. Stop scanning string literals for symbol names.
mutant('M1  string-literal references are no longer dependencies', function (s) {
  return swap(s, "if (lit && /^[A-Za-z_$][\\w$]*$/.test(lit) && OWNER[lit]) { s[lit] = 1; }", 'if (false) { s[lit] = 1; }');
}, function (M) {
  var f = M.report.filter(function (r) { return r.file === '44_gap_materialization_scheduler.gs'; })[0];
  return f.inboundStringFiles.length === 0 || f.reachableFromEntry === false;
});

// M2 — reachability stops following the string edge, so the scheduler drops off the graph.
mutant('M2  reachability follows code edges only', function (s) {
  return swap(s, "Object.keys(DEPS[cur] || {}).concat(Object.keys(STRDEPS[cur] || {}))",
    'Object.keys(DEPS[cur] || {}).concat([])');
}, function (M) {
  var f = M.report.filter(function (r) { return r.file === '44_gap_materialization_scheduler.gs'; })[0];
  return f.reachableFromEntry === false;
});

// M3 — a trigger owner is promoted to REQUIRED, which reads as "safe, it is runtime" instead of
// "unknown, ask the operator". Both are wrong; only one of them gets a file deleted.
mutant('M3  a trigger owner is classified as required runtime instead of ambiguous', function (s) {
  return swap(s, "if (DECL[n].functions.some(function (f) { return TRIGGER[f]; })) { return 'H_AMBIGUOUS_TRIGGER_OWNER'; }",
    "if (false) { return 'H_AMBIGUOUS_TRIGGER_OWNER'; }");
}, function (M) {
  var f = M.report.filter(function (r) { return r.file === '44_gap_materialization_scheduler.gs'; })[0];
  return f.classification !== 'H_AMBIGUOUS_TRIGGER_OWNER';
});

// M4 — declarations are matched anywhere on a line, so locals inside functions become globals and
// every file appears to depend on every other.
mutant('M4  indented declarations count as top-level globals', function (s) {
  return swap(s, "var mv = /^var\\s+([A-Za-z_$][\\w$]*)\\s*=/.exec(l);",
    'var mv = /var\\s+([A-Za-z_$][\\w$]*)\\s*=/.exec(l);');
}, function (M) {
  var f = M.report.filter(function (r) { return r.file === 'TEMP_migrate_request_order_draft_v2.gs'; })[0];
  return f.inboundFiles.length > 0 || f.reachableFromEntry === true;
});

// M5 — LINE comments are no longer stripped, so a symbol merely discussed in prose becomes a
// dependency. 46_ names both scheduler handlers in a line comment and depends on neither, so it is
// the exact case that appears out of nowhere when this breaks. A tool that manufactures edges reports
// files as load-bearing when they are not, which is the failure that keeps dead code deployed forever.
mutant('M5  line comments are scanned for identifiers', function (s) {
  return swap(s, ".split('\\n').map(function (l) { return l.replace(/(^|[^:\"'])\\/\\/.*$/, '$1'); }).join('\\n')",
    ".split('\\n').map(function (l) { return l; }).join('\\n')");
}, function (M) {
  var sc = M.report.filter(function (r) { return r.file === '44_gap_materialization_scheduler.gs'; })[0];
  return sc.inboundFiles.indexOf('46_api_v1_gap_materialization_job.gs') > -1;
});

// M6 — the bundle stops being recognised, so the largest deployed file lands in a removable class.
mutant('M6  the generated bundle is no longer recognised as generated', function (s) {
  return swap(s, "if (n === BUNDLE) { return 'B_GENERATED_RUNTIME'; }", "if (false) { return 'B_GENERATED_RUNTIME'; }");
}, function (M) {
  var b = M.report.filter(function (r) { return r.file === '90_generated_supply_planning_bundle.gs'; })[0];
  return b.classification !== 'B_GENERATED_RUNTIME';
});

console.log('    ' + mutants.length + ' mutants, ' + mutants.filter(function (m) { return m.survived; }).length + ' survived');

console.log('\n================================================================');
console.log('APPS-SCRIPT-RUNTIME-SLIM-R1 LOAD SURFACE:  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants.length + ' mutants, ' + mutants.filter(function (m) { return m.survived; }).length + ' survived');
process.exit(fail === 0 && mutants.filter(function (m) { return m.survived; }).length === 0 ? 0 : 1);
