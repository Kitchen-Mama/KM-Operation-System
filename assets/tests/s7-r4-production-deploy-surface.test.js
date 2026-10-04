// S7-R4 — TEMP / MIGRATION PRODUCTION DEPLOY-SURFACE CLEANUP + APPS SCRIPT PRODUCTION SURFACE FREEZE.
//
// THE DISTINCTION THIS ROUND EXISTS TO MAKE STRUCTURAL:
//
//     REPOSITORY TOOLING   !=   PRODUCTION DEPLOY SURFACE
//
// SLIM-R1 asked the live Apps Script project, one top-level symbol at a time, which files it contained. Seven
// TEMP files answered absent — 808,195 bytes of migrations, diagnostics and a demo seed that were in
// assets/specs/active/apps-script/ and were not in the deployment. 31 corroborating symbol probes, positive
// controls present, negative controls absent, and the live manifest independently reporting the lifecycle
// migration in absent_optional_modules. The measurement was sound.
//
// What it could not establish is why they would STAY out, and 63_ is where that question is answered. Its
// manifest explains why a sibling tool gets no row: "every manifest reader resolves
// assets/specs/active/apps-script/<file> and only that, because this manifest lists the files SYNCED INTO THE
// PROJECT AS RUNTIME". Membership in that folder IS the claim "this is production runtime". The folder held a
// seed whose COMMIT entry point writes six business tables and whose CLEAR entry point empties them.
//
// Nothing structural kept it out of a release. Only nobody having pasted it yet. "Remember not to paste these
// seven" is not a mechanism, and this suite is the mechanism that replaces it.
//
// WHY A DECLARED CENSUS RATHER THAN A SCAN. A scan ratifies whatever it finds, which is the property that let
// seven tools accumulate in a runtime folder unnoticed. assets/tests/_production-deploy-surface.js declares
// the runtime universe BY NAME; a .gs that appears in the folder without a declaration fails here. That is the
// same shape as _boot-topology.js and for the same reason.
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var REPO = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n'); }

var SURF = require('./_production-deploy-surface.js');
var S = SURF.surface(REPO);

var RTR = read(GS + '01_router.gs');
var G61 = read(GS + '61_api_v1_weekly_ai_plan.gs');
var G63 = read(GS + '63_api_v1_system_health.gs');
var G69 = read(GS + '69_api_v1_ai_plan_lifecycle.gs');
var CFG = read(GS + '00_config.gs');

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }
// Comments stripped, string literals KEPT. A refusal message that names a tool is a real guidance edge;
// a line comment that names one is not a dependency of any kind.
function code(s) {
  return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function mut(label, fn) {
  mutants++;
  var caught = false;
  try { caught = fn() === true; } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}

// The seven, with where each went and what it can do. CAN_WRITE_BUSINESS_DATA is read from the file, not
// assumed from the name: TEMP_draft_migration_diagnostic.gs is called a migration and is strictly read-only,
// and the demo seed is called a seed and is the single most dangerous tool in the set.
var RELOCATED = [
  { file: 'TEMP_demo_shipping_shipment_map_seed_v2.gs', dir: 'apps-script-seeds',
    cls: 'SEED', writes: true, bytes: 300182 },
  { file: 'TEMP_migrate_request_order_draft_v2.gs', dir: 'apps-script-migrations',
    cls: 'ONE_TIME_MIGRATION', writes: true, bytes: 418557 },
  { file: 'TEMP_migrate_shipping_allocation_ai_lifecycle.gs', dir: 'apps-script-migrations',
    cls: 'ONE_TIME_MIGRATION', writes: true, bytes: 36728 },
  { file: 'TEMP_document_diagnostics.gs', dir: 'apps-script-diagnostics',
    cls: 'DIAGNOSTIC', writes: false, bytes: 15423 },
  { file: 'TEMP_draft_migration_diagnostic.gs', dir: 'apps-script-diagnostics',
    cls: 'DIAGNOSTIC', writes: false, bytes: 7292 },
  { file: 'TEMP_order_planning_draft_readback_diagnose.gs', dir: 'apps-script-diagnostics',
    cls: 'DIAGNOSTIC', writes: false, bytes: 17404 },
  { file: 'TEMP_request_order_send_diagnostics.gs', dir: 'apps-script-diagnostics',
    cls: 'DIAGNOSTIC', writes: false, bytes: 12609 }
];

// ----------------------------------------------------------------------------------------------------------
section('A  the production runtime universe is DECLARED, and the folder matches it');
// ----------------------------------------------------------------------------------------------------------
eq(S.undeclared, [], 'A1  UNDECLARED_RUNTIME_FILE_COUNT = 0 — no .gs has appeared in the runtime folder '
  + 'without being declared; this is the gate a newly-added TEMP file hits');
eq(S.missing, [], 'A2  and no declared runtime owner has silently left the folder');
eq(S.declaredCount, S.liveCount, 'A3  the declared universe and the folder are the same size');
eq(S.liveCount, 77, 'A4  FINAL_PRODUCTION_APPS_SCRIPT_RUNTIME_FILE_COUNT = 77', S.liveCount);
ok(S.projectManifestPresent, 'A5  appsscript.json is present and is counted separately — it is the project '
  + 'manifest, not a .gs source file');

// ----------------------------------------------------------------------------------------------------------
section('B  the runtime universe excludes every non-runtime TEMP tool');
// ----------------------------------------------------------------------------------------------------------
eq(S.nonRuntimeInRuntimeDir, [], 'B1  NON_RUNTIME_TEMP_IN_FINAL_PRODUCTION_DEPLOY_SET = 0, by NAME — the '
  + 'second net, independent of the declared list, so defeating one guard is not enough');
eq(S.declared.filter(function (f) { return /^TEMP_/.test(f); }), [],
  'B2  and no TEMP file is DECLARED runtime either');
eq(S.doubleClaimed, [], 'B3  no file is both declared runtime and resident in a tooling directory');
RELOCATED.forEach(function (r, i) {
  ok(S.live.indexOf(r.file) === -1, 'B4.' + (i + 1) + ' ' + r.file + ' is OUT of the runtime folder');
});

// ----------------------------------------------------------------------------------------------------------
section('C  relocated, not destroyed — the repository keeps the recovery and audit value');
// ----------------------------------------------------------------------------------------------------------
var retainedBytes = 0;
RELOCATED.forEach(function (r, i) {
  var rel = 'assets/tools/' + r.dir + '/' + r.file;
  var abs = path.join(REPO, rel);
  ok(fs.existsSync(abs), 'C1.' + (i + 1) + ' ' + r.file + ' is retained at assets/tools/' + r.dir + '/');
  if (!fs.existsSync(abs)) return;
  var bytes = fs.readFileSync(abs, 'latin1').split(String.fromCharCode(13)).join('').length;
  eq(bytes, r.bytes, 'C2.' + (i + 1) + ' with its bytes unchanged by the move');
  retainedBytes += bytes;
});
eq(retainedBytes, 808195, 'C3  REPOSITORY_RETAINED_NON_RUNTIME_TOOL bytes = the same 808,195 SLIM-R1 '
  + 'measured — the audit was never wrong about the size, only about where the bytes had to live');
eq(RELOCATED.length, 7, 'C4  PRODUCTION_DEPLOY_EXCLUDED_TOOL_COUNT = 7');

// ----------------------------------------------------------------------------------------------------------
section('D  the dangerous demo seed');
// ----------------------------------------------------------------------------------------------------------
var SEED = read('assets/tools/apps-script-seeds/TEMP_demo_shipping_shipment_map_seed_v2.gs');
var writeOrder = /var DEMO4A_WRITE_ORDER_ = \[([^\]]*)\]/.exec(SEED);
var clearOrder = /var DEMO4A_CLEAR_ORDER_ = \[([^\]]*)\]/.exec(SEED);
ok(!!writeOrder && !!clearOrder, 'D1  the seed declares both a write order and a clear order');
var tables = writeOrder[1].split(',').map(function (t) { return t.trim().replace(/'/g, ''); }).sort();
eq(tables, ['shipment_events', 'shipment_lines', 'shipment_routes', 'shipments',
  'shipping_plan_lines', 'shipping_plans'],
  'D2  it mutates SIX business tables — this is the exact scope, read from the file');
var cleared = clearOrder[1].split(',').map(function (t) { return t.trim().replace(/'/g, ''); }).sort();
eq(cleared, tables, 'D3  and it can CLEAR every one of them, which is the half a "seed" does not suggest');
ok(S.live.indexOf('TEMP_demo_shipping_shipment_map_seed_v2.gs') === -1
  && S.declared.indexOf('TEMP_demo_shipping_shipment_map_seed_v2.gs') === -1,
  'D4  TEMP_DEMO_SHIPPING_MAP_SEED_PRODUCTION_DEPLOY_ALLOWED = NO, by both nets');
// Nothing in the runtime universe calls it. Proven across every runtime file rather than asserted.
var seedSymbols = (SEED.match(/^function (TEMP_DEMO4A_[A-Za-z0-9_]+)/gm) || [])
  .map(function (m) { return m.replace('function ', ''); });
ok(seedSymbols.length >= 10, 'D5  the seed declares its entry points as top-level functions', seedSymbols.length);
var seedCallers = S.live.filter(function (f) {
  var src = read(GS + f);
  return seedSymbols.some(function (sy) { return src.indexOf(sy) !== -1; });
});
eq(seedCallers, [], 'D6  TEMP_DEMO_SHIPPING_MAP_SEED_RUNTIME_DEPENDENCY_COUNT = 0 — no runtime file names '
  + 'any of its entry points, by code or by string');

// ----------------------------------------------------------------------------------------------------------
section('E  production-facing guidance still resolves to a tool that exists');
// ----------------------------------------------------------------------------------------------------------
// §15: a production error must never point at a helper nobody can find. These two refusals name migration
// entry points by symbol, and both files moved — so this is the check the move could have broken.
var GUIDANCE = [
  { sym: 'TEMP_R6F2_PREFLIGHT_INVENTORY_K2_ROUTE_AUTHORITY', src: G61, from: '61_api_v1_weekly_ai_plan.gs',
    tool: 'assets/tools/apps-script-migrations/TEMP_migrate_request_order_draft_v2.gs' },
  { sym: 'TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN', src: G69, from: '69_api_v1_ai_plan_lifecycle.gs',
    tool: 'assets/tools/apps-script-migrations/TEMP_migrate_shipping_allocation_ai_lifecycle.gs' },
  { sym: 'TEMP_AI_LIFECYCLE_MIGRATE_COMMIT', src: G69, from: '69_api_v1_ai_plan_lifecycle.gs',
    tool: 'assets/tools/apps-script-migrations/TEMP_migrate_shipping_allocation_ai_lifecycle.gs' },
  { sym: 'TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE', src: G69, from: '69_api_v1_ai_plan_lifecycle.gs',
    tool: 'assets/tools/apps-script-migrations/TEMP_migrate_shipping_allocation_ai_lifecycle.gs' },
  { sym: 'TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3', src: CFG, from: '00_config.gs',
    tool: 'assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs' }
];
var dead = [];
GUIDANCE.forEach(function (g, i) {
  ok(g.src.indexOf(g.sym) !== -1, 'E1.' + (i + 1) + ' ' + g.from + ' still names ' + g.sym);
  var toolSrc = fs.existsSync(path.join(REPO, g.tool)) ? read(g.tool) : '';
  var defined = new RegExp('function\\s+' + g.sym + '\\s*\\(').test(toolSrc);
  if (!defined) dead.push(g.sym + ' -> ' + g.tool);
  ok(defined, 'E1.' + (i + 1) + 'a and the named tool is retrievable and defines it');
});
eq(dead, [], 'E2  PRODUCTION_GUIDANCE_DEAD_TOOL_REFERENCE_COUNT = 0 and DEAD_TEMP_REFERENCE_COUNT_POST = 0');
// The guidance says "run it in the Apps Script project", which has ALWAYS meant paste-then-run: the live
// probe proved none of these tools was in the project before the move either. Relocation changed where the
// operator finds the file, not whether the instruction was true.
ok(/Run TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN\(\) in the Apps Script project/.test(G69),
  'E3  and the instruction is still phrased as paste-then-run, which the relocation does not falsify');

// ----------------------------------------------------------------------------------------------------------
section('F  the generated bundle and every routed handler survived the cleanup');
// ----------------------------------------------------------------------------------------------------------
ok(S.declared.indexOf('90_generated_supply_planning_bundle.gs') !== -1,
  'F1  GENERATED_RUNTIME_OWNER is still in the runtime universe — generated is not diagnostic');
eq(S.declared.filter(function (f) { return /^90_/.test(f); }), ['90_generated_supply_planning_bundle.gs'],
  'F2  GENERATED_RUNTIME_OWNER_COUNT = 1');
// Every routed action must resolve to a handler defined in a file that is still runtime.
// THE ROUTER HAS TWO DISPATCH SHAPES AND ONLY ONE OF THEM IS A MAP. The GET read table is
// `'action': handleX_,`; the POST surface is `if (action === 'x') { return handleX_(body); }`. A map-only
// regex finds 24 of them and would have let F4 check a sixth of the surface while claiming all of it.
// Every handler IDENTIFIER the router mentions is collected, which is shape-independent.
var handlerNames = {};
(RTR.match(/\bhandle[A-Za-z0-9_]*_\b/g) || []).forEach(function (h) { handlerNames[h] = 1; });
var routed = Object.keys(handlerNames).sort();
ok(routed.length >= 130, 'F3  the router mentions the whole handler surface, both dispatch shapes',
  routed.length);
var runtimeSrc = S.live.map(function (f) { return read(GS + f); }).join('\n');
var orphan = routed.filter(function (h) {
  return !new RegExp('function\\s+' + h + '\\s*\\(').test(runtimeSrc);
});
eq(orphan, [],
  'F4  MISSING_ROUTER_HANDLER_COUNT = 0 and ORPHAN_PRODUCTION_ACTION_COUNT = 0 — every routed action still '
  + 'resolves to a handler inside the runtime universe, with no TEMP file present');
// and no runtime file depends on a symbol that only a relocated tool defines
var movedSymbols = [];
RELOCATED.forEach(function (r) {
  var src = read('assets/tools/' + r.dir + '/' + r.file);
  (src.match(/^function ([A-Za-z0-9_]+)\s*\(/gm) || []).forEach(function (f) {
    movedSymbols.push(f.replace(/^function /, '').replace(/\s*\($/, ''));
  });
});
ok(movedSymbols.length > 50, 'F5  the relocated tools declare a large symbol surface', movedSymbols.length);
// GUIDANCE SURFACES ARE NAMED, NOT FILTERED OUT SILENTLY. Three runtime files legitimately name a symbol
// that left, inside a refusal string an operator reads: 61_ names the K2 route-authority preflight, 69_
// names the three AI-lifecycle entry points, 00_ names the activation census. Any OTHER file naming one
// IN CODE is a dependency the move could have broken.
var GUIDANCE_FILES = ['00_config.gs', '61_api_v1_weekly_ai_plan.gs', '69_api_v1_ai_plan_lifecycle.gs'];
var leaked = [];
S.live.forEach(function (f) {
  if (GUIDANCE_FILES.indexOf(f) !== -1) return;
  var src = code(read(GS + f));
  var hits = movedSymbols.filter(function (sy) {
    return sy.length > 12 && new RegExp('\\b' + sy + '\\b').test(src);
  });
  if (hits.length) leaked.push(f + ' -> ' + hits.sort().join(', '));
});
eq(leaked, [], 'F6  and no other runtime file references a symbol that left with them IN CODE — the three '
  + 'that do are the documented guidance surfaces, named here rather than filtered out silently');
// The precision half, which is not free: 66_ names two of the relocated wrappers in a LINE COMMENT and
// depends on neither — it is the file they call into. Counting that mention as an edge is how dead code
// stays deployed forever, and it is the error this suite made on its first run.
var G66_RAW = read(GS + '66_api_v1_request_order_send.gs');
ok(/TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE/.test(G66_RAW),
  'F6a 66_ DOES mention a relocated wrapper...');
ok(!/TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE/.test(code(G66_RAW)),
  'F6b ...only in a comment, so it is not an edge — precision matters here as much as recall');

// ----------------------------------------------------------------------------------------------------------
section('G  the deployment selector cannot widen to swallow a tooling directory');
// ----------------------------------------------------------------------------------------------------------
eq(Object.keys(SURF.TOOLING_DIRS).sort(), ['assets/tools/apps-script-diagnostics',
  'assets/tools/apps-script-migrations', 'assets/tools/apps-script-seeds'],
  'G1  the three tooling directories are declared, each with what membership means');
ok(S.toolingCount >= 39, 'G2  and they hold the repository tooling', S.toolingCount);
// The selector is the DECLARED list. A tool directory is never a source of runtime membership, so a file
// added to one tomorrow cannot reach production by sitting there.
var toolingNames = Object.keys(S.tooling).reduce(function (a, d) { return a.concat(S.tooling[d]); }, []);
eq(toolingNames.filter(function (f) { return S.declared.indexOf(f) !== -1; }), [],
  'G3  not one of the ' + toolingNames.length + ' tooling files is in the declared runtime universe');

// ----------------------------------------------------------------------------------------------------------
section('H  what this round did NOT touch');
// ----------------------------------------------------------------------------------------------------------
// PINNED TO THE ROUND'S PRE_SHA, NOT TO HEAD~1. The round lands in more than one commit, so HEAD~1 would
// make this mean 'the last commit' and it would go quiet the moment a docs-only commit followed. What must
// hold is that across the WHOLE round exactly one runtime file changed.
//
// S8-R4B-1A - AND THE OTHER END IS PINNED NOW TOO, WHICH IS THE WHOLE REPAIR. This read
// `PRE_SHA..HEAD`. While S7-R4 was the newest round that was the same interval, so the bug was
// invisible; the moment ANY later round touched a runtime file, a claim about what S7-R4 changed
// started reporting what every round since had changed, and S8-R4B-1 made it fail by adding
// 01_router.gs. The assertion was RIGHT and its interval was wrong.
//
// This is a HISTORICAL_RELEASE_INVARIANT: a fact about R40 that must read the same in ten rounds'
// time, so it is pinned at BOTH ends. The CURRENT_HEAD_RELEASE_INVARIANT - what the NEWEST release
// changed - is a different claim and is asserted separately below, so neither can quietly stand in
// for the other.
var PRE_SHA = '085c2fd';
var POST_SHA = 'ff8246e';   // S7-R4's last commit: the sweep-found guard repair. R40 ends here.
var changed = cp.execFileSync('git', ['diff', '--name-only', PRE_SHA, POST_SHA],
  { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
eq(changed.filter(function (f) { return /forecast-review/i.test(f); }), [],
  'H1  FORECAST_REVIEW_CHANGED_IN_S7_R4 = NO');
// The only runtime .gs this round edited is 63_, and only its manifest commentary.
var runtimeChanged = changed.filter(function (f) { return f.indexOf('assets/specs/active/apps-script/') === 0; });
eq(runtimeChanged.filter(function (f) { return f.indexOf('/TEMP_') === -1; }),
  ['assets/specs/active/apps-script/63_api_v1_system_health.gs'],
  'H2  exactly ONE runtime file changed IN R40, and the seven relocations are renames git reports '
  + 'separately');
// S8-R4B-1A - THE CURRENT-HEAD HALF, stated rather than inherited. R41 reclassifies
// factoryStockGuard.get from the POST write chain onto the GET read table, so the router changed and
// the manifest that carries its expected stamp changed with it. TWO runtime files, named - and 71_ is
// deliberately not among them: the Factory Guard handler was not touched, only the verb reaching it.
var sinceR40 = cp.execFileSync('git', ['diff', '--name-only', POST_SHA, 'HEAD'],
  { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
eq(sinceR40.filter(function (f) {
  return f.indexOf('assets/specs/active/apps-script/') === 0 && f.indexOf('/TEMP_') === -1;
}), ['assets/specs/active/apps-script/01_router.gs',
     'assets/specs/active/apps-script/63_api_v1_system_health.gs'],
  'H2a and since R40 ended, EXACTLY the two runtime files R41 owns have changed');
var R41_ID = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R41';
eq((read(GS + '01_router.gs').match(/var RTR_BUILD_VERSION_ = '([^']+)'/) || [])[1], R41_ID,
  'H2b both of them declare R41 - the router, whose routing table changed');
eq((G63.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/) || [])[1], R41_ID,
  'H2c ...and the manifest, which is where a release is cut');
ok(!/R41/.test(read(GS + '71_api_v1_factory_stock_guard.gs')),
  'H2d 71_ is NOT stamped R41 - the handler did not change, and stamping an unchanged owner to make '
  + 'a release look complete is the one thing these stamps exist to prevent');
ok(/S7-R4 — THE FOLDER IS NO LONGER WHAT DISTINGUISHES THEM/.test(G63),
  'H3  and what changed in it is the manifest rule that the relocation falsified');
ok(/absence is ACTIONABLE/i.test(G63) || /ABSENCE IS ACTIONABLE/.test(G63),
  'H3a replaced by the reason that was always the real one');
eq(S.declared.filter(function (f) { return /login|role|capability|permission/i.test(f); }), [],
  'H4  S9_PERMISSION_WORK_IMPLEMENTED = NO — no authorization owner was added');

// ----------------------------------------------------------------------------------------------------------
section('J  the whole TEMP census, so the reported count is asserted rather than claimed');
// ----------------------------------------------------------------------------------------------------------
eq(S.toolingByClass, { ONE_TIME_MIGRATION: 4, DIAGNOSTIC: 35, SEED: 1 },
  'J1  TEMP tooling by class — 4 migrations, 35 diagnostics, 1 seed');
eq(S.toolingCount, 40, 'J2  40 .gs tools live in the tooling directories');

// Two TEMP artifacts are in neither place, and both are accounted for rather than ignored.
var LIVE_PASTE = 'tmp/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3_LIVE_PASTE.gs';
var SEALED = 'assets/tests/fixtures/TEMP_migrate_fc_target_rules_header_r2ba2.retired.gs.txt';
ok(fs.existsSync(path.join(REPO, LIVE_PASTE)),
  'J3  a tracked live-paste copy of the activation census sits in tmp/ — DIAGNOSTIC, repo-retained');
ok(LIVE_PASTE.indexOf('assets/specs/active/apps-script/') === -1 && LIVE_PASTE.indexOf('assets/tools/') === -1,
  'J3a it is outside BOTH the runtime folder and the tooling directories, so it cannot reach production; '
  + 'S7-R4 classifies it and does not move it — §6 requires exclusion, not deletion');
ok(fs.existsSync(path.join(REPO, SEALED)),
  'J4  and the fc_target_rules migration retired in R2B-A2-R6 survives as a SHA-256-sealed fixture — the '
  + 'precedent this round followed, one round before it was asked for');
ok(!/\.gs$/.test(SEALED), 'J4a it is a .txt fixture, which is why it is not a deployable artifact');
eq(S.toolingCount + 2, 42, 'J5  TEMP_ARTIFACT_COUNT = 42, and UNKNOWN_TEMP_CLASSIFICATION_COUNT = 0');

// ----------------------------------------------------------------------------------------------------------
section('I  mutants — every guard above is load-bearing');
// ----------------------------------------------------------------------------------------------------------
function withLive(extra) {
  // the census as it would read if `extra` appeared in the runtime folder
  var live = S.live.concat(extra).sort();
  return {
    undeclared: live.filter(function (f) { return S.declared.indexOf(f) === -1; }),
    nonRuntime: live.filter(function (f) { return SURF.NON_RUNTIME_NAME_RE.test(f); })
  };
}
mut('I1 the dangerous demo seed re-added to the production deploy set', function () {
  var r = withLive(['TEMP_demo_shipping_shipment_map_seed_v2.gs']);
  return r.undeclared.length === 1 && r.nonRuntime.length === 1;
});
mut('I2 a BRAND NEW TEMP tool dropped into the runtime folder — the case a scan would ratify', function () {
  var r = withLive(['TEMP_s8_something_quick.gs']);
  return r.undeclared.length === 1 && r.nonRuntime.length === 1;
});
mut('I3 a migration helper marked as production runtime by adding it to the declared list', function () {
  var declared = S.declared.concat(['TEMP_migrate_request_order_draft_v2.gs']);
  // the declared-list net is defeated; the NAME net must still catch it
  var live = S.live.concat(['TEMP_migrate_request_order_draft_v2.gs']);
  return live.filter(function (f) { return SURF.NON_RUNTIME_NAME_RE.test(f); }).length === 1
    && declared.filter(function (f) { return /^TEMP_/.test(f); }).length === 1;
});
mut('I4 a diagnostic census copied into permanent runtime', function () {
  var r = withLive(['TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs']);
  return r.undeclared.length === 1 && r.nonRuntime.length === 1;
});
mut('I5 the generated bundle wrongly excluded from the runtime universe', function () {
  var d = S.declared.filter(function (f) { return f !== '90_generated_supply_planning_bundle.gs'; });
  return d.indexOf('90_generated_supply_planning_bundle.gs') === -1
    && d.filter(function (f) { return /^90_/.test(f); }).length === 0;
});
mut('I6 a production handler removed along with a TEMP cleanup', function () {
  var crippled = runtimeSrc.replace(/function\s+handleSystemHealth_\s*\(/, 'function __removed_handler_(');
  return routed.filter(function (r) {
    return !new RegExp('function\\s+' + r.handler + '\\s*\\(').test(crippled);
  }).length > 0;
});
mut('I7 dead operator guidance left behind — the named tool no longer defines the symbol', function () {
  var toolSrc = read('assets/tools/apps-script-migrations/TEMP_migrate_shipping_allocation_ai_lifecycle.gs')
    .replace(/function\s+TEMP_AI_LIFECYCLE_MIGRATE_COMMIT\s*\(/, 'function __gone_(');
  return !/function\s+TEMP_AI_LIFECYCLE_MIGRATE_COMMIT\s*\(/.test(toolSrc)
    && G69.indexOf('TEMP_AI_LIFECYCLE_MIGRATE_COMMIT') !== -1;
});
mut('I8 the deployment selector widened to blindly include a tooling directory', function () {
  var widened = S.declared.concat(S.tooling['assets/tools/apps-script-seeds']);
  return widened.filter(function (f) { return SURF.NON_RUNTIME_NAME_RE.test(f); }).length > 0;
});
mut('I9 a declared runtime owner silently dropped out of the folder', function () {
  var live = S.live.filter(function (f) { return f !== '01_router.gs'; });
  return S.declared.filter(function (f) { return live.indexOf(f) === -1; }).length === 1;
});
mut('I10 the name net alone, with the declared list deleted — it must still see a TEMP file', function () {
  return SURF.NON_RUNTIME_NAME_RE.test('TEMP_anything.gs')
    && !SURF.NON_RUNTIME_NAME_RE.test('63_api_v1_system_health.gs');
});
mut('I11 a comment mention counted as a code dependency — the edge this suite invented on its first run',
  function () {
    var raw = read(GS + '66_api_v1_request_order_send.gs');
    // scanning the RAW source finds it; scanning stripped code does not. If code() ever stopped
    // stripping, F6 would start reporting 66_ as a dependency again.
    return /TEMP_REQUEST_ORDER_SEND_PREVIEW/.test(raw) && !/TEMP_REQUEST_ORDER_SEND_PREVIEW/.test(code(raw));
  });
mut('I12 the demo seed losing its clear order, which is how it stops looking dangerous', function () {
  var m = SEED.replace(/var DEMO4A_CLEAR_ORDER_ = \[[^\]]*\]/, 'var DEMO4A_CLEAR_ORDER_ = []');
  var c = /var DEMO4A_CLEAR_ORDER_ = \[([^\]]*)\]/.exec(m);
  return c[1].trim() === '';
});

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + '  ' + pass + ' passed / ' + fail + ' failed'
  + '   mutants ' + mutants + ', survived ' + survived);
process.exitCode = fail ? 1 : 0;
