// Kitchen Mama Operation System — F1-7N-D-1 Apps Script bundle export guard.
// Run: node assets/tests/weekly-ai-plan-bundle-exports-f1-7n-d-1-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// Proves the regenerated 90_generated_supply_planning_bundle.gs exposes the weekly AI Plan runtime globals (KMWSA /
// KMWIA / KMWRD / KMWRT) with their expected functions, resolvable in a headless (Apps-Script-like) global scope,
// with NO duplicate global declarations and NO regression of the existing recommendation globals. Also confirms the
// bundle is reproducible (matches the builder) via a deterministic-hash header presence check.

var fs = require('fs'), path = require('path'), vm = require('vm');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var BUNDLE_PATH = path.join(__dirname, '..', 'specs', 'active', 'apps-script', '90_generated_supply_planning_bundle.gs');
var src = fs.readFileSync(BUNDLE_PATH, 'utf8');

// =================================================================================================================
section('Source: weekly globals declared exactly once (no duplicates)');
['KMWSA', 'KMWIA', 'KMWRD', 'KMWRT'].forEach(function (g) {
  var re = new RegExp('var ' + g + ' = __kmModules\\[', 'g');
  var n = (src.match(re) || []).length;
  ok(n === 1, 'global ' + g + ' declared exactly once (found ' + n + ')');
});
['supply-planning-weekly-source-allocation', 'supply-planning-weekly-input-assembler', 'supply-planning-weekly-recommendation-draft', 'supply-planning-weekly-recommendation-runtime'].forEach(function (m) {
  ok(src.indexOf('"' + m + '"') !== -1, 'module registered in bundle: ' + m);
});
// existing globals still present (no regression)
['KMREC', 'KMORCH', 'KMPR', 'KMPL', 'KMBRIDGE', 'KMAF', 'KMSF', 'KMHP', 'KMPA'].forEach(function (g) {
  ok(new RegExp('var ' + g + ' = __kmModules\\[').test(src), 'existing global still present: ' + g);
});
ok(/bundle_sha256 = [0-9a-f]{64}/.test(src), 'deterministic bundle_sha256 header present');

// =================================================================================================================
section('Runtime: bundle evaluates headless and resolves the weekly globals');
// Apps Script-like sandbox: no window/document; the UMD modules take their non-browser branch. The pure supply-
// planning modules touch no Apps Script service at load time, so the definition block evaluates cleanly.
var sandbox = {};
sandbox.globalThis = sandbox;
var evalOk = true, evalErr = null;
try {
  vm.runInNewContext(src, sandbox, { filename: '90_generated_supply_planning_bundle.gs' });
} catch (e) { evalOk = false; evalErr = e; }
ok(evalOk, 'bundle evaluates in a headless global scope' + (evalOk ? '' : ' -> ' + (evalErr && evalErr.message)));

if (evalOk) {
  ok(sandbox.KMWSA && typeof sandbox.KMWSA.buildWeeklySourceAllocation === 'function', 'AV KMWSA.buildWeeklySourceAllocation resolves');
  ok(sandbox.KMWIA && typeof sandbox.KMWIA.assembleWeeklySourceAllocationInput === 'function', 'AU KMWIA.assembleWeeklySourceAllocationInput resolves');
  ok(sandbox.KMWRD && typeof sandbox.KMWRD.persistWeeklyRecommendationDraft === 'function', 'AW KMWRD.persistWeeklyRecommendationDraft resolves');
  ok(sandbox.KMWRT && typeof sandbox.KMWRT.generateWeeklyShippingRecommendationDraft === 'function', 'AY KMWRT.generateWeeklyShippingRecommendationDraft resolves');
  eq(sandbox.KMWRT && sandbox.KMWRT._version, 'f1-7n-d-1-r1', 'KMWRT version tag resolves via bundle');
  // existing recommendation globals still resolve (no bundle regression)
  ok(sandbox.KMORCH && typeof sandbox.KMORCH.runRecommendationGeneration === 'function', 'KMORCH still resolves');
  ok(sandbox.KMPR && sandbox.KMPR.TABLES && sandbox.KMPR.TABLES.WEEKLY_SHIPPING, 'KMPR.TABLES.WEEKLY_SHIPPING still resolves');
  // end-to-end through the bundled globals (no Node require) — the runtime owner drives assembler->builder->persist
  var CN = 'WH-TW-CN-FACTORY-YOUXIN', TW = 'WH-TW-TW-FACTORY-RES';
  var cap = {};
  var res = sandbox.KMWRT.generateWeeklyShippingRecommendationDraft({
    planningCycle: 'RECO-2026-08', businessScope: { company: 'KM', country: 'US', marketplace: 'amz', source_page: 'SITE_INVENTORY' },
    masterSku: 'SKU1', mode: 'SCHEDULED_REFRESH', sourceDataAsOf: '2026-08-18T00:00:00Z',
    factoryIdentityConfig: { CN_YOUXIN: CN, TW_SHENGYI: TW },
    warehousesById: { 'WH-TW-CN-FACTORY-YOUXIN': { warehouse_id: CN, warehouse_type: 'FACTORY', is_factory_warehouse: true, is_active: true }, 'WH-TW-TW-FACTORY-RES': { warehouse_id: TW, warehouse_type: 'FACTORY', is_factory_warehouse: true, is_active: true } },
    overseasSupplyPools: [{ poolKey: 'OV', poolType: 'THREE_PL', warehouseId: 'W-OV', effectiveSupplyQty: 100 }],
    factoryPools: [{ poolKey: 'FC', poolType: 'FACTORY', warehouseId: CN, effectiveSupplyQty: 100 }],
    lanes: [{ siteSku: 'S1', destinationWarehouseId: 'DEST-1', marketplace: 'amz', company: 'KM', country: 'US', cumulativeGapByWindow: { D18: 100 }, requiredByByWindow: { D18: '2026-09-01' }, unitsPerCarton: 1, survivalNeedQty: 0, demandWeight: 1, fulfillmentModel: 'self_fulfilled', eligiblePoolTypes: ['THREE_PL'], allocationPriority: 5 }]
  }, {
    loadActiveContext: function () { return { status: 'CREATE' }; },
    loadPriorSnapshot: function () { return null; },
    lockedApply: function (plan) { cap.plan = plan; return { status: 'COMPLETED' }; }
  });
  ok(res.success === true && res.status === 'COMPLETED', 'bundled KMWRT generates + persists end-to-end (COMPLETED)');
  eq(res.formulaVersion, 'WEEKLY_AI_PLAN_V1', 'bundled generation carries WEEKLY_AI_PLAN_V1');
  ok(cap.plan && JSON.stringify(cap.plan).indexOf('shipping_allocation_drafts') !== -1, 'bundled persist targets shipping_allocation_drafts');
}

console.log('\n----------------------------------------');
console.log('WEEKLY AI PLAN BUNDLE EXPORTS (F1-7N-D-1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
