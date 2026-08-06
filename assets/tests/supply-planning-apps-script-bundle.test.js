// Kitchen Mama Operation System — Apps Script bundle/port tests (Phase 2C, Round 1G).
// Run: node assets/tests/supply-planning-apps-script-bundle.test.js
// Verifies the deterministic port (assets/tools/build-apps-script-bundle.js): reproducible output, canonical
// manifest, and — critically — that the generated bundle EXPOSES + RUNS the pure modules inside an Apps
// Script-like global (a vm context with NO require / module / window / process), and that the 23_-style guard
// passes when the bundle is loaded and fails safely when it is absent.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var BUILD = require('../tools/build-apps-script-bundle.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var CORE_DIR = path.join(__dirname, '..', 'js', 'core');
var GEN_PATH = path.join(__dirname, '..', 'specs', 'active', 'apps-script', '90_generated_supply_planning_bundle.gs');

function readSources() { var s = {}; BUILD.MODULE_ORDER.forEach(function (n) { s[n] = fs.readFileSync(path.join(CORE_DIR, n + '.js'), 'utf8'); }); return s; }
// Load the bundle in an Apps Script-like global: NO require, module, window, process, Buffer, __dirname.
function loadBundle(code) { var ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx, { filename: 'bundle.gs' }); return ctx; }

// ==========================================================================
section('A. deterministic / reproducible output');
(function () {
  var b1 = BUILD.buildBundleFromSources(readSources());
  var b2 = BUILD.buildBundleFromSources(readSources());
  eq(b1.code, b2.code, 'A: same sources → byte-identical bundle');
  eq(b1.hash, b2.hash, 'A: same sources → identical bundle hash');
  ok(/^[0-9a-f]{64}$/.test(b1.hash), 'A: bundle hash is a sha256 hex');
  eq(b1.manifest.length, 28, 'A: manifest lists all 28 canonical modules');
  ok(b1.manifest.every(function (m) { return /^[0-9a-f]{64}$/.test(m.sha256); }), 'A: each manifest entry has a sha256');
})();

section('B. on-disk generated bundle is up to date');
(function () {
  var built = BUILD.buildBundleFromDisk(CORE_DIR);
  var onDisk = BUILD.lf(fs.readFileSync(GEN_PATH, 'utf8'));
  eq(onDisk, BUILD.lf(built.code), 'B: committed 90_generated_*.gs matches a fresh build (reproducible)');
})();

section('C. namespaces available in an Apps Script-like global (no require/module/window)');
(function () {
  var code = BUILD.buildBundleFromDisk(CORE_DIR).code;
  var ctx = loadBundle(code);
  ['KMCALC', 'KMQI', 'KMLEDGER', 'KMALLOC', 'KMLINE', 'KMPC', 'KMPR', 'KMPL', 'KMPB', 'KMPPB', 'KMORCH', 'KMUE',
   'KMSF', 'KMBRIDGE', 'KMSR', 'KMSI', 'KMSRP', 'KMSP', 'KMPS', 'KMSAFE', 'KMPW', 'KMVD'].forEach(function (ns) {
    ok(ctx[ns] && typeof ctx[ns] === 'object', 'C: ' + ns + ' exposed');
  });
  ok(typeof ctx.KMSRP.readRecommendationSourceFacts === 'function' && typeof ctx.KMSRP.readRawTableSnapshot === 'function', 'C: KMSRP production source reader available in bundle');
  ok(typeof ctx.KMSR.readWeeklyRecommendationSource === 'function' && typeof ctx.KMSI.resolveRecommendationFactsFromSource === 'function', 'C: KMSR/KMSI source pipeline available in bundle');
  ok(typeof ctx.KMSP.projectRecommendationProductionSources === 'function' && typeof ctx.KMSP.projectAndRead === 'function', 'C: KMSP projection runtime available in bundle');
  ok(typeof ctx.KMPS.readCanonicalSnapshots === 'function' && typeof ctx.KMPS.resolveProductionFacts === 'function' && typeof ctx.KMPS.buildProductionRecommendationSource === 'function', 'C: KMPS production source wiring available in bundle');
  ok(typeof ctx.KMPW.persistProductionRecommendation === 'function' && typeof ctx.KMPW.sheetSetDeps === 'function' && typeof ctx.KMPW.seedSheetSet === 'function', 'C: KMPW production writer available in bundle');
  ok(typeof ctx.KMVD.namespaceReport === 'function' && typeof ctx.KMVD.auditDraftTables === 'function' && typeof ctx.KMVD.activeDraftAudit === 'function', 'C: KMVD read-only verification diagnostics available in bundle');
  ok(typeof ctx.KMSAFE.validateCanonicalTable === 'function' && typeof ctx.KMSAFE.assertExpectedSpreadsheetId === 'function' && typeof ctx.KMSAFE.assertRuntimeMutationAllowed === 'function', 'C: KMSAFE production safety layer available in bundle');
  ok(typeof ctx.KMPW.validateAuthorizedRecommendationSchemas === 'function' && typeof ctx.KMPW.assertAuthorizedSchemasReady === 'function', 'C: KMPW pre-write schema validation available in bundle');
  ok(typeof ctx.KMORCH.runRecommendationGeneration === 'function', 'C: KMORCH.runRecommendationGeneration available');
  ok(typeof ctx.KMPB.buildRecommendation === 'function', 'C: KMPB.buildRecommendation available');
  ok(typeof ctx.KMPPB.buildPersistencePlan === 'function', 'C: KMPPB.buildPersistencePlan available');
  ok(typeof ctx.KMPR.applyPersistencePlan === 'function' && typeof ctx.KMPR.loadActiveDraftContext === 'function', 'C: KMPR repository API available');
  ok(typeof ctx.KMPL.executeLockedPersistence === 'function', 'C: KMPL.executeLockedPersistence available');
  ok(typeof ctx.KMPC.generateRecommendationDraft === 'function', 'C: KMPC Persistence Core available');
  eq(ctx.KM_BUNDLE_INFO.modules.length, 28, 'C: KM_BUNDLE_INFO manifest present in runtime');
})();

section('D. ported modules actually RUN end-to-end inside the bundle context');
(function () {
  var ctx = loadBundle(BUILD.buildBundleFromDisk(CORE_DIR).code);
  var SCOPE_M = { planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'regular', sku: 'GA0450' };
  // Plan Builder → Core → Persistence Plan Builder → Repository apply, all via the bundle globals.
  var out = ctx.KMPB.buildRecommendation({
    recommendationType: 'MONTHLY_ORDER', mode: 'SCHEDULED_REFRESH', planningCycle: '2026-08', businessScope: SCOPE_M,
    calculationRunId: 'RUN-X', formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-03', draftVersion: 1,
    lines: [{ request_month: '2026-08', request_bucket: 'T1', recommendedQty: 137, snapshotRow: { units_per_carton: 20 } }]
  });
  eq(out.generationType, 'scheduled', 'D: bundle KMPB maps generation_type');
  var gen = ctx.KMPC.generateRecommendationDraft(ctx.KMPC.createStore(), out.command);
  eq(gen.result.status, 'COMPLETED', 'D: bundle KMPC generated a draft');
  var token = ctx.KMPR.computeExpectedToken(1, []);
  var identity = { draftId: gen.result.draftId, activeKey: gen.store.drafts[0].activeKey, businessScopeKey: ctx.KMPR.buildBusinessScopeKey('MONTHLY_ORDER', SCOPE_M) };
  var plan = ctx.KMPPB.buildPersistencePlan({ recommendationType: 'MONTHLY_ORDER', identity: identity, prevStore: { drafts: [], lines: [], runs: [] }, nextStore: gen.store, coreResult: gen.result, command: out.command, lineDetails: out.lineDetails, generationType: out.generationType, expectedToken: token, actor: 'sys', now: 'T' });
  ok(ctx.KMPR.validatePersistencePlan(plan) === true, 'D: bundle KMPPB produced a valid PA-7 plan');
  // build a fake sheet + apply via the bundle repository
  var s = ctx.KMPR.createSheetSet();
  s.request_order_allocation_drafts.headers = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku', 'status', 'generation_type', 'calculation_run_id', 'formula_version', 'source_data_as_of', 'draft_version'];
  s.request_order_allocation_draft_lines.headers = ['request_allocation_line_id', 'request_allocation_draft_id', 'request_month', 'request_bucket', 'recommended_qty', 'order_qty', 'units_per_carton', 'line_status', 'user_edited', 'user_edited_by'];
  s[ctx.KMPR.RUN_JOURNAL_TABLE].headers = ctx.KMPR.RUN_JOURNAL_HEADERS.slice();
  var res = ctx.KMPR.applyPersistencePlan(s, plan, token, { now: 'T', actor: 'sys' });
  eq(res.runStatus, 'COMPLETED', 'D: bundle KMPR applied the plan to a fake sheet');
  eq(s.request_order_allocation_draft_lines.rows.length, 1, 'D: one line written by the ported repository');
  // partial-carton snapshot preserved through the fully-ported path
  var recIdx = s.request_order_allocation_draft_lines.headers.indexOf('recommended_qty');
  eq(s.request_order_allocation_draft_lines.rows[0][recIdx], 137, 'D: partial-carton recommended snapshot exact via bundle');
})();

section('E. guard passes when loaded, fails safely when absent');
(function () {
  // 23_-style guard body
  var guardSrc = 'function rprPureModule_(){ if (typeof KMPR === "undefined") { throw new Error("KMPR not present"); } return KMPR; } rprPureModule_();';
  // absent bundle → guard throws
  var empty = {}; vm.createContext(empty);
  var threw = false; try { vm.runInContext(guardSrc, empty); } catch (e) { threw = true; }
  ok(threw, 'E: guard throws when the bundle is absent (fails safe)');
  // loaded bundle → guard returns KMPR
  var ctx = loadBundle(BUILD.buildBundleFromDisk(CORE_DIR).code);
  var okGuard = vm.runInContext(guardSrc + ' typeof KMPR;', ctx);
  eq(okGuard, 'object', 'E: guard passes when the bundle is loaded');
})();

section('F. no residual Node/browser-only runtime dependency');
(function () {
  // The bundle ran to completion in a context with NO require/module/window/process/Buffer (sections C–E).
  // Assert additionally that the emitted code never references process/Buffer/__dirname/document at top level.
  var code = BUILD.buildBundleFromDisk(CORE_DIR).code;
  ok(code.indexOf('process.') === -1, 'F: no process.* in generated bundle');
  ok(code.indexOf('Buffer') === -1, 'F: no Buffer in generated bundle');
  ok(code.indexOf('__dirname') === -1, 'F: no __dirname in generated bundle');
  ok(code.indexOf('document.') === -1, 'F: no document.* in generated bundle');
  // require/module/window appear only inside guarded UMD checks or the bundle's own shim — never called unguarded
  ok(code.indexOf('__kmRequire') !== -1, 'F: bundle provides an in-scope require shim');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 1G Apps Script bundle/port assertions passed (' + pass + ' assertions).');
