// Kitchen Mama Operation System — Weekly Shipping Plan READ page cutover tests (Phase API-3A).
// Run: node assets/tests/km-api-weekly-page-cutover.test.js
// LOCAL / SOURCE-LEVEL. Extracts + evals the REAL page read-boundary helpers from shipping-plan.js and drives
// them with fake window.KM.api / window.KM.DB. Proves: reversible read source (Legacy default, Workspace when
// flag effective), no dual read, no silent Workspace→Legacy fallback, Workspace→normalized-record adapter,
// snapshot-primary (live=null) Workspace render, visible error (not empty) on failure, stale-seq guard, and that
// every Weekly WRITE stays on Legacy KM.DB. No DOM render, no live Spreadsheet, no network.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/shipping-plan.js');

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
// eval the pure boundary helpers into module scope (sloppy mode; they reference `window` = global.window).
// Must eval at top level (not inside a callback) so the declarations are visible to main().
var _spSrc = ['_spNum', '_spKey', '_spLatestMap', '_spEffectiveWorkspace', '_spCurrentFilters_', '_spWorkspacePlanRecord',
 '_spWorkspaceLineRecord', '_spAdaptWorkspaceToRecords', '_spBuildLegacyLiveMaps_', 'loadWeeklyShippingReadModel_']
  .map(function (n) { return extractFn(JS, n); }).join('\n');
eval(_spSrc);

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function run(p) { return Promise.resolve(p).then(function (v) { return v; }, function (e) { return { __threw: String(e) }; }); }

// ---- fakes ------------------------------------------------------------------------------------------
function wsEnv(ok) {
  return {
    success: ok,
    data: ok ? {
      plans: [
        { planId: 'SP-1', planNo: 'W-1', planName: 'Alpha', company: 'KM', country: 'US', marketplace: 'AMZ', status: 'draft', statusLabel: 'Draft', planVersion: 1, shippingMethod: 'sea', carrier: { id: 'C-1', name: 'Sino' }, currency: 'USD', updatedAt: '2026-08-03', raw: { shipping_plan_id: 'SP-1', created_at: '2026-08-01', note: 'hi', estimated_total_cost: '1000', estimated_freight_cost: '800', completed_at: '', transferred_shipment_id: '' } },
        { planId: 'SP-2', planNo: 'W-2', planName: 'Beta', company: 'KM', country: 'CA', marketplace: 'AMZ', status: 'approved', statusLabel: 'Approved', planVersion: 2, carrier: { id: '', name: '' }, currency: 'CAD', updatedAt: '2026-08-02', raw: { shipping_plan_id: 'SP-2', transferred_shipment_id: 'SHP-9' } }
      ],
      detailsByPlanId: {
        'SP-1': { lines: [{ lineId: 'L-1', planId: 'SP-1', sku: 'GA0450', approvedQty: 100, cartonQty: 5, unitsPerCarton: 20, raw: { snapshot_current_stock: '300', snapshot_avg_sales_per_day: '10', snapshot_days_of_supply: '30', cbm: '1.2' } }] },
        'SP-2': { lines: [{ lineId: 'L-2', planId: 'SP-2', sku: 'GA0451', approvedQty: 40, cartonQty: 2, unitsPerCarton: 20, raw: {} }] }
      },
      summary: { totalPlans: 2 }, filters: { options: {} }
    } : null,
    meta: { requestId: 'REQ-X', source: 'workspace', serverDurationMs: 9, tablesRead: 4 },
    errors: ok ? [] : [{ code: 'WRONG_SPREADSHEET_TARGET', message: 'wrong target', details: null }]
  };
}
function makeApi(active, env) {
  var calls = { getWorkspace: 0 };
  return {
    _calls: calls,
    workspaceApiActive: function (n) { return active && n === 'weeklyShipping'; },
    getWorkspace: function (name, params) { calls.getWorkspace++; calls.lastParams = params; return Promise.resolve(env); }
  };
}
function makeDb() {
  var calls = { getShippingPlans: 0, getShippingPlanLines: 0 };
  return {
    _calls: calls,
    getShippingPlans: function () { calls.getShippingPlans++; return [{ shippingPlanId: 'LEG-1', status: 'draft', country: 'US' }]; },
    getShippingPlanLines: function () { calls.getShippingPlanLines++; return [{ shippingPlanLineId: 'LL-1', shippingPlanId: 'LEG-1', sku: 'GA9' }]; },
    getShipments: function () { return [{ shippingPlanId: 'LEG-1' }]; },
    getAmazonInventorySnapshot: function () { return []; },
    getAmazonWeeklySalesSnapshot: function () { return []; },
    getMarketplaces: function () { return []; }
  };
}

(async function main() {

  // =====================================================================================================
  section('_spEffectiveWorkspace gate');
  global.window = { KM: {} };
  ok(_spEffectiveWorkspace() === false, 'EF1 no KM.api → false (production default = Legacy)');
  global.window.KM.api = makeApi(false, wsEnv(true));
  ok(_spEffectiveWorkspace() === false, 'EF2 workspaceApiActive false → false');
  global.window.KM.api = makeApi(true, wsEnv(true));
  ok(_spEffectiveWorkspace() === true, 'EF3 workspaceApiActive true → true');

  // =====================================================================================================
  section('Legacy default read path');
  global.window = { KM: { DB: makeDb() } };   // no KM.api → Legacy
  var mLeg = await run(loadWeeklyShippingReadModel_());
  ok(mLeg.source === 'legacy', 'LG1 no KM.api → source legacy');
  ok(mLeg.plans[0].shippingPlanId === 'LEG-1' && window.KM.DB._calls.getShippingPlans === 1, 'LG2 reads getShippingPlans');
  ok(mLeg.live && mLeg.live.inv && mLeg.shipmentMap['LEG-1'] === true, 'LG3 legacy enrichment maps built (live + shipmentMap)');

  // =====================================================================================================
  section('Workspace read path (flag effective)');
  var api = makeApi(true, wsEnv(true)); var db = makeDb();
  global.window = { KM: { api: api, DB: db } };
  var mWs = await run(loadWeeklyShippingReadModel_());
  ok(mWs.source === 'workspace' && api._calls.getWorkspace === 1, 'WS1 flag effective → getWorkspace called once');
  ok(db._calls.getShippingPlans === 0 && db._calls.getShippingPlanLines === 0, 'WS2 NO dual read — legacy getShippingPlans NOT called');
  ok(mWs.live === null, 'WS3 Workspace mode is snapshot-primary (live=null; no cross-domain fallback)');
  ok(mWs.plans.length === 2 && mWs.plans[0].shippingPlanId === 'SP-1' && mWs.plans[0].status === 'draft', 'WS4 plans adapted to normalized records');
  ok(mWs.plans[0].estimatedTotalCost === '1000' && mWs.plans[0].createdAt === '2026-08-01' && mWs.plans[0].note === 'hi', 'WS5 plan raw fields mapped (cost/createdAt/note)');
  ok(mWs.plans[1].transferredShipmentId === 'SHP-9', 'WS6 transferred_* mapped (drives Done in Workspace mode)');
  ok(mWs.lines.length === 2 && mWs.lines[0].shippingPlanLineId === 'L-1' && mWs.lines[0].shippingPlanId === 'SP-1', 'WS7 lines adapted + linked by planId (canonical id, not position)');
  ok(mWs.lines[0].snapshotCurrentStock === 300 && mWs.lines[0].snapshotAvgSalesPerDay === 10 && mWs.lines[0].snapshotDaysOfSupply === '30', 'WS8 line snapshot fields mapped from raw');
  ok(mWs.lines[0].raw && mWs.lines[0].raw.snapshot_current_stock === '300', 'WS9 raw retained for _spHasRaw presence checks');
  ok(mWs.meta && mWs.meta.requestId === 'REQ-X', 'WS10 response meta (requestId) carried through');

  // =====================================================================================================
  section('Workspace failure → visible error, NO silent legacy fallback');
  var api2 = makeApi(true, wsEnv(false)); var db2 = makeDb();
  global.window = { KM: { api: api2, DB: db2 } };
  var mErr = await run(loadWeeklyShippingReadModel_());
  ok(mErr.source === 'workspace' && mErr.error && mErr.error.code === 'WRONG_SPREADSHEET_TARGET', 'ERR1 failure surfaces structured error');
  ok(!mErr.plans, 'ERR2 no data rendered on failure');
  ok(db2._calls.getShippingPlans === 0, 'ERR3 NO silent fallback to Legacy after Workspace request started');

  // =====================================================================================================
  section('KM.api enabled but getWorkspace missing → fail visibly');
  global.window = { KM: { api: { workspaceApiActive: function () { return true; } }, DB: makeDb() } };
  var mNo = await run(loadWeeklyShippingReadModel_());
  ok(mNo.source === 'workspace' && mNo.error && mNo.error.code === 'WORKSPACE_UNAVAILABLE', 'AV1 enabled-but-unavailable fails visibly (never fake success)');

  // =====================================================================================================
  section('Rollback: disabling Weekly restores Legacy');
  var apiOff = makeApi(false, wsEnv(true)); var dbOff = makeDb();
  global.window = { KM: { api: apiOff, DB: dbOff } };
  var mRb = await run(loadWeeklyShippingReadModel_());
  ok(mRb.source === 'legacy' && apiOff._calls.getWorkspace === 0 && dbOff._calls.getShippingPlans === 1, 'RB1 disabling Weekly → immediate Legacy, no workspace call');

  // =====================================================================================================
  section('Source-level: writes stay Legacy · stale guard · error-not-empty · entry gate');
  ok(/window\.KM\.DB\.updateShippingPlanStatus/.test(JS) && /window\.KM\.DB\.updateShippingPlanLineQty/.test(JS) && /window\.KM\.DB\.completeShippingPlan/.test(JS) && /window\.KM\.DB\.appendShippingPlanNote/.test(JS), 'SR1 all Weekly writes still call Legacy KM.DB');
  ok(JS.indexOf('KM.api.executeCommand') < 0 && JS.indexOf('.workspace.') < 0, 'SR2 no Workspace WRITE command / no write action used by the page');
  // getWorkspace appears ONLY inside the read boundary (loadWeeklyShippingReadModel_), never in a write fn
  function stripLineComments(s) { return s.replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }
  var boundaryFn = extractFn(JS, 'loadWeeklyShippingReadModel_');
  var wsInFile = (stripLineComments(JS).match(/KM\.api\.getWorkspace/g) || []).length;
  var wsInBoundary = (stripLineComments(boundaryFn).match(/KM\.api\.getWorkspace/g) || []).length;
  ok(wsInFile > 0 && wsInFile === wsInBoundary, 'SR3 every KM.api.getWorkspace CODE reference is inside the read boundary (never a write fn)');
  ok(/_spReadSeq/.test(JS) && /mySeq !== _spReadSeq/.test(JS), 'SR4 stale-response guard present (only newest load renders)');
  ok(/_spRenderReadError_/.test(JS) && /No records|No shipping plans/.test(JS), 'SR5 error state is distinct from the empty-state message');
  ok(/_spUseDb\(\) \|\| _spEffectiveWorkspace\(\)/.test(JS), 'SR6 entry routes to DB/Workspace path when Workspace is effective');

  console.log('\n----------------------------------------');
  console.log('WEEKLY PAGE CUTOVER: ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
