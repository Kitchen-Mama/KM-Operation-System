// Kitchen Mama Operation System — API v1 Weekly Shipping READ Workspace tests (Phase API-2).
// Run: node assets/tests/km-api-weekly-workspace.test.js
// LOCAL / SOURCE-LEVEL. (a) eval the REAL pure builders + handler from 40_api_v1_weekly_workspace.gs and run them
// against fixtures with an INJECTED io (zero SpreadsheetApp); (b) drive the REAL Foundation client resolver with an
// injected workspaceInvoke + per-workspace flags. Proves: registry graduation, per-workspace flag, no dual
// execution, requestId, server timing, exact-ID/schema fail-closed, targeted (non-whole-DB) reads, view-model
// mapping by canonical IDs, multi-currency non-aggregation, deterministic filter/sort/pagination, business-failure
// cannot become false-success, abort readiness, cache TTL=0, and legacy parity. No DOM, no live Spreadsheet, no net.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GS_REL = 'specs/active/apps-script/40_api_v1_weekly_workspace.gs';
var GS = read(GS_REL);
var ROUTER = read('specs/active/apps-script/01_router.gs');
var KMAPI = require(path.join(__dirname, '..', 'js', 'api', 'km-api-foundation.js'));

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function run(p) { return Promise.resolve(p).then(function (v) { return v; }, function (e) { return { success: false, errors: [{ code: 'REJECTED', message: String(e) }] }; }); }

// ---- eval the whole .gs (sloppy mode; declares weekly* fns + vars in this scope). The default-io / SpreadsheetApp
//      references live inside weeklyWorkspaceDefaultIo_ which is NEVER called (io is always injected). ----
eval(GS);

// ---- fixtures (raw header-keyed rows, snake_case) --------------------------------------------------------
function fixturePlans() {
  return [
    { shipping_plan_id: 'SP-1', shipping_plan_no: 'W-001', plan_name: 'Alpha', company: 'KM', country: 'US', marketplace: 'AMZ', source_warehouse_id: 'WH-CN', destination_warehouse_id: 'WH-US', shipping_method: 'sea', last_mile_delivery: 'amz_partnered', customs_type: 'formal_customs', carrier_id: 'C-1', estimated_total_cost: '1000', currency: 'USD', plan_version: '1', status: 'draft', updated_at: '2026-08-01T00:00:00Z' },
    { shipping_plan_id: 'SP-2', shipping_plan_no: 'W-002', plan_name: 'Beta', company: 'KM', country: 'US', marketplace: 'AMZ', source_warehouse_id: 'WH-CN', destination_warehouse_id: 'WH-US', shipping_method: 'air', carrier_id: 'C-1', estimated_total_cost: '2000', currency: 'USD', plan_version: '2', status: 'approved', updated_at: '2026-08-03T00:00:00Z' },
    { shipping_plan_id: 'SP-3', shipping_plan_no: 'W-003', plan_name: 'Gamma', company: 'KM', country: 'CA', marketplace: 'AMZ', source_warehouse_id: 'WH-CN', destination_warehouse_id: 'WH-CA', shipping_method: 'sea', carrier_id: '', estimated_total_cost: '500', currency: 'CAD', plan_version: '1', status: 'cancelled', updated_at: '2026-08-02T00:00:00Z' }
  ];
}
function fixtureLines() {
  return [
    { shipping_plan_line_id: 'L-1', shipping_plan_id: 'SP-1', sku: 'GA0450', site_sku: 'US-GA0450', marketplace: 'AMZ', requested_qty: '100', approved_qty: '0', plan_carton_qty: '5', units_per_carton: '20' },
    { shipping_plan_line_id: 'L-2', shipping_plan_id: 'SP-1', sku: 'GA0451', requested_qty: '50', approved_qty: '40' },
    { shipping_plan_line_id: 'L-3', shipping_plan_id: 'SP-2', sku: 'GA0450', requested_qty: '200', approved_qty: '200' }
  ];
}
function fixtureWh() { return [{ warehouse_id: 'WH-CN', warehouse_code: 'CN01', warehouse_name: 'Shenzhen', warehouse_type: 'factory' }, { warehouse_id: 'WH-US', warehouse_code: 'US01', warehouse_name: 'AMZ US', warehouse_type: '3PL' }, { warehouse_id: 'WH-CA', warehouse_code: 'CA01', warehouse_name: 'AMZ CA', warehouse_type: '3PL' }]; }
function fixtureCarriers() { return [{ carrier_id: 'C-1', carrier_name: 'Sinotrans' }]; }
function fixtureTables() { return { shipping_plans: fixturePlans(), shipping_plan_lines: fixtureLines(), warehouses: fixtureWh(), carriers: fixtureCarriers() }; }

// injected io: deterministic clock (5ms steps) + seq, spy on reads, optional fail modes
function makeIo(tables, opts) {
  opts = opts || {}; var reads = []; var t = 0, s = 0;
  return {
    _reads: reads,
    now: function () { t += 5; return t; },
    nextSeq: function () { return ++s; },
    openTarget: function () { if (opts.wrongTarget) { var e = new Error('wrong target'); e.safetyToken = 'WRONG_SPREADSHEET_TARGET'; throw e; } return { __ss: 1 }; },
    readTable: function (ss, name) { reads.push(name); if (opts.missing === name) { var e = new Error('missing ' + name); e.safetyToken = 'SCHEMA_NOT_PROVISIONED'; e.table = name; throw e; } return tables[name] || []; }
  };
}
function makeLegacy() { var calls = []; return { _calls: calls, getOperationDb: function () { calls.push(['getOperationDb']); return { tables: {} }; }, updateShippingPlanStatus: function (p) { calls.push(['updateShippingPlanStatus', p]); return { ok: 1 }; } }; }

(async function main() {

  // =====================================================================================================
  section('Router registration + no whole-DB read (source)');
  ok(/action === 'weeklyShipping\.workspace\.get'/.test(ROUTER) && /handleWeeklyShippingWorkspaceGet_/.test(ROUTER), 'RT1 router dispatches weeklyShipping.workspace.get → handler');
  ok(GS.indexOf('getOperationDb(') < 0, 'RT2 the Weekly workspace .gs never CALLS getOperationDb (no 44-table read)');
  ok(/WEEKLY_WORKSPACE_TABLES_/.test(GS) && GS.indexOf("'shipping_plans'") >= 0 && GS.indexOf("'shipping_plan_lines'") >= 0, 'RT3 only Weekly tables declared');

  // =====================================================================================================
  section('Pure View-Model builder (weeklyWorkspaceBuild_)');
  var vm = weeklyWorkspaceBuild_(fixtureTables(), {});
  ok(vm.pagination.totalItems === 3, 'VM1 three plans');
  ok(vm.plans[0].planId === 'SP-2' && vm.plans[1].planId === 'SP-3' && vm.plans[2].planId === 'SP-1', 'VM2 default sort updated_at desc');
  var sp1 = vm.plans[2];
  ok(sp1.totalQty === 140 && sp1.lineCount === 2, 'VM3 totalQty sums effective line qty (approved else requested) = 140, lineCount 2');
  ok(sp1.sourceWarehouse.name === 'Shenzhen' && sp1.destinationWarehouse.name === 'AMZ US', 'VM4 warehouse JOIN by id');
  ok(sp1.carrier.name === 'Sinotrans' && sp1.status === 'draft' && sp1.statusLabel === 'Draft', 'VM5 carrier join + raw status + label');
  ok(vm.plans[0].planVersion === 2, 'VM6 numeric plan_version coerced');

  section('Filter / sort / pagination determinism');
  ok(weeklyWorkspaceBuild_(fixtureTables(), { filters: { status: 'approved' } }).plans.length === 1, 'FS1 status filter');
  ok(weeklyWorkspaceBuild_(fixtureTables(), { filters: { country: 'CA' } }).plans[0].planId === 'SP-3', 'FS2 country filter');
  ok(weeklyWorkspaceBuild_(fixtureTables(), { filters: { sourceWarehouseId: 'WH-CN' } }).plans.length === 3, 'FS3 source warehouse filter by ID');
  ok(weeklyWorkspaceBuild_(fixtureTables(), { search: 'beta' }).plans.length === 1, 'FS4 search matches plan_name');
  var pg = weeklyWorkspaceBuild_(fixtureTables(), { page: { number: 1, size: 2 } });
  ok(pg.plans.length === 2 && pg.pagination.totalPages === 2 && pg.pagination.pageSize === 2, 'FS5 pagination page1 size2');
  var pg2 = weeklyWorkspaceBuild_(fixtureTables(), { page: { number: 2, size: 2 } });
  ok(pg2.plans.length === 1 && pg2.plans[0].planId === 'SP-1', 'FS6 pagination page2');
  ok(Object.keys(pg.detailsByPlanId).sort().join(',') === 'SP-2,SP-3', 'FS7 details attached ONLY for returned page plans');
  var asc = weeklyWorkspaceBuild_(fixtureTables(), { sort: [{ field: 'plan_id', direction: 'asc' }] });
  ok(asc.plans[0].planId === 'SP-1' && asc.plans[2].planId === 'SP-3', 'FS8 sort by plan_id asc');
  var threw = false; try { weeklyWorkspaceBuild_(fixtureTables(), { sort: [{ field: 'secret_field' }] }); } catch (e) { threw = (e.validationCode === 'VALIDATION_FAILED'); }
  ok(threw, 'FS9 invalid sort field → VALIDATION_FAILED');

  section('Summary + multi-currency (no cross-currency aggregation)');
  var sm = weeklyWorkspaceBuild_(fixtureTables(), {}).summary;
  ok(sm.totalPlans === 3 && sm.draftPlans === 1 && sm.approvedPlans === 1 && sm.cancelledPlans === 1, 'SM1 status counts');
  ok(sm.totalUnits === 340, 'SM2 totalUnits = 140 + 200 + 0 = 340');
  ok(sm.currencySummary.length === 2 && sm.estimatedCost === null, 'SM3 two currencies → estimatedCost null (never aggregated)');
  var usd = sm.currencySummary.filter(function (c) { return c.currency === 'USD'; })[0];
  ok(usd.amount === 3000 && sm.currencySummary.filter(function (c) { return c.currency === 'CAD'; })[0].amount === 500, 'SM4 per-currency sums (USD 3000, CAD 500)');
  // summary after filters, before pagination (country=US matches SP-1 + SP-2; currency is intentionally NOT a filter):
  var smF = weeklyWorkspaceBuild_(fixtureTables(), { filters: { country: 'US' }, page: { size: 1 } });
  ok(smF.summary.totalPlans === 2 && smF.plans.length === 1, 'SM5 summary reflects FILTERED set (2), pagination limits rows (1)');

  section('Filter options + line identity');
  var opt = vm.filters.options;
  ok(JSON.stringify(opt.countries) === JSON.stringify(['CA', 'US']) && JSON.stringify(opt.companies) === JSON.stringify(['KM']), 'FO1 dedup+sorted country/company options');
  ok(opt.sourceWarehouses.some(function (w) { return w.warehouseId === 'WH-CN' && w.name === 'Shenzhen'; }), 'FO2 warehouse options carry id+code+name');
  ok(opt.statuses.some(function (s) { return s.status === 'approved' && s.statusLabel === 'Approved'; }), 'FO3 status options carry raw+label');
  var det = pg.detailsByPlanId['SP-2'];
  ok(det.lines[0].lineId === 'L-3' && det.lines[0].planId === 'SP-2' && det.lines[0].approvedQty === 200, 'LN1 line mapped by canonical lineId (not position)');
  var det1 = weeklyWorkspaceBuild_(fixtureTables(), { filters: { status: 'draft' } }).detailsByPlanId['SP-1'];
  ok(det1.lines.length === 2 && det1.lines[0].sku === 'GA0450' && det1.lines[1].sku === 'GA0451', 'LN2 same-SKU lines NOT merged (no aggregation invented)');

  section('dataVersion');
  ok(vm.dataVersion.latestUpdatedAt === '2026-08-03T00:00:00Z', 'DV1 latest updated_at among filtered');

  // =====================================================================================================
  section('Server handler (injected io) — timing, requestId, tablesRead, targeted reads');
  var io = makeIo(fixtureTables());
  var env = handleWeeklyShippingWorkspaceGet_({ requestId: 'REQ-ABC123', payload: {} }, io);
  ok(env.success === true && env.meta.requestId === 'REQ-ABC123', 'H1 success + client requestId echoed');
  ok(env.meta.serverDurationMs === 5 && typeof env.meta.serverDurationMs === 'number', 'H2 serverDurationMs diagnostic present (deterministic clock)');
  ok(env.meta.tablesRead === 4 && env.meta.source === 'workspace' && env.meta.apiVersion === '1', 'H3 tablesRead=4, canonical meta');
  ok(JSON.stringify(io._reads) === JSON.stringify(['shipping_plans', 'shipping_plan_lines', 'warehouses', 'carriers']), 'H4 reads ONLY the 4 Weekly tables, once each — never getOperationDb');
  ok(env.data.plans.length === 3, 'H5 view model returned');

  section('RequestId hardening');
  ok(weeklyMakeRequestId_('REQ-ok_1', makeIo({})) === 'REQ-ok_1', 'RQ1 valid client requestId kept');
  ok(weeklyMakeRequestId_('not valid!', makeIo({})) === 'REQ-S000001', 'RQ2 invalid → server-generated correlation id');
  ok(weeklyMakeRequestId_('', makeIo({})) === 'REQ-S000001', 'RQ3 missing → server-generated');
  var envNoId = handleWeeklyShippingWorkspaceGet_({ payload: {} }, makeIo(fixtureTables()));
  ok(/^REQ-S\d{6}$/.test(envNoId.meta.requestId), 'RQ4 handler mints a server requestId when absent');

  section('Fail-closed (exact-ID / schema) + business-failure never false-success');
  var wrong = handleWeeklyShippingWorkspaceGet_({ payload: {} }, makeIo(fixtureTables(), { wrongTarget: true }));
  ok(wrong.success === false && wrong.data === null && wrong.errors[0].code === 'WRONG_SPREADSHEET_TARGET', 'FC1 wrong Spreadsheet target → fail closed');
  var miss = handleWeeklyShippingWorkspaceGet_({ payload: {} }, makeIo(fixtureTables(), { missing: 'warehouses' }));
  ok(miss.success === false && miss.errors[0].code === 'SCHEMA_NOT_PROVISIONED', 'FC2 missing table → fail closed');
  var badSort = handleWeeklyShippingWorkspaceGet_({ payload: { sort: [{ field: 'zzz' }] } }, makeIo(fixtureTables()));
  ok(badSort.success === false && badSort.errors[0].code === 'VALIDATION_FAILED' && badSort.data === null, 'FC3 builder throw → success:false (no false success)');
  var empty = handleWeeklyShippingWorkspaceGet_({ payload: {} }, makeIo({ shipping_plans: [], shipping_plan_lines: [], warehouses: [], carriers: [] }));
  ok(empty.success === true && empty.data.plans.length === 0 && empty.data.summary.totalPlans === 0, 'FC4 empty legitimate dataset → success:true with empty arrays');

  // =====================================================================================================
  section('Foundation client resolver — per-workspace flag, no dual execution, requestId, abort');
  var invokeCalls;
  function fakeInvoke(serverEnv) { return function (action, dto, signal) { invokeCalls.push({ action: action, dto: dto, signal: signal }); return Promise.resolve(serverEnv); }; }
  function serverOk(reqId) { return { success: true, data: { plans: [], summary: {} }, meta: { requestId: reqId, serverDurationMs: 12, tablesRead: 4 }, errors: [] }; }

  var lg = makeLegacy(); invokeCalls = [];
  var api = KMAPI.createApiFoundation({ legacy: lg, idGen: function () { return 'REQ-CGEN01'; }, workspaceInvoke: function (a, d, s) { invokeCalls.push({ action: a, dto: d, signal: s }); return Promise.resolve(serverOk(d.requestId)); } });
  ok(api.registry.get('weeklyShipping').status === 'IMPLEMENTED', 'CR1 weeklyShipping IMPLEMENTED');
  ok(api.registry.get('requestOrder').status === 'REGISTERED', 'CR2 other workspaces still REGISTERED');

  var r0 = await run(api.client.getWorkspace('weeklyShipping'));
  ok(r0.success === true && r0.meta.source === 'legacy' && lg._calls.some(function (c) { return c[0] === 'getOperationDb'; }) && invokeCalls.length === 0, 'CR3 master flag OFF → legacy (no workspace invoke)');

  api.setWorkspaceApiEnabled(true);
  lg._calls.length = 0;
  var r1 = await run(api.client.getWorkspace('weeklyShipping'));
  ok(r1.success === true && r1.meta.source === 'legacy' && invokeCalls.length === 0, 'CR4 master ON but weekly per-workspace OFF → still legacy (disabled Weekly = legacy)');

  api.setWorkspaceEnabled('weeklyShipping', true);
  lg._calls.length = 0; invokeCalls.length = 0;
  var r2 = await run(api.client.getWorkspace('weeklyShipping', { filters: { country: 'US' } }));
  ok(r2.success === true && r2.meta.source === 'workspace', 'CR5 master ON + weekly ON → workspace path');
  ok(invokeCalls.length === 1 && invokeCalls[0].action === 'weeklyShipping.workspace.get', 'CR6 exactly ONE workspace invoke (no dual execution)');
  ok(lg._calls.length === 0, 'CR7 no legacy call in workspace mode');
  ok(r2.meta.requestId === 'REQ-CGEN01' && invokeCalls[0].dto.requestId === 'REQ-CGEN01', 'CR8 requestId generated + propagated + echoed');
  ok(invokeCalls[0].dto.payload.filters.country === 'US' && invokeCalls[0].dto.payload.page.size === 25, 'CR9 DTO carries filters + bounded default page');
  ok(typeof r2.meta.sequence === 'number', 'CR10 response carries a call sequence (stale-response readiness)');

  // client-provided requestId honored
  invokeCalls.length = 0;
  var r3 = await run(api.client.getWorkspace('weeklyShipping', { requestId: 'REQ-USER99' }));
  ok(r3.meta.requestId === 'REQ-USER99', 'CR11 valid client requestId honored');
  invokeCalls.length = 0;
  var r4 = await run(api.client.getWorkspace('weeklyShipping', { requestId: 'bad id!' }));
  ok(r4.meta.requestId === 'REQ-CGEN01', 'CR12 invalid client requestId → generated');

  // rollback by disabling weekly
  api.setWorkspaceEnabled('weeklyShipping', false); lg._calls.length = 0; invokeCalls.length = 0;
  var r5 = await run(api.client.getWorkspace('weeklyShipping'));
  ok(r5.meta.source === 'legacy' && invokeCalls.length === 0, 'CR13 rollback: disabling Weekly restores Legacy immediately');
  api.setWorkspaceEnabled('weeklyShipping', true);

  // abort readiness
  invokeCalls.length = 0;
  var aborted = await run(api.client.getWorkspace('weeklyShipping', {}, { signal: { aborted: true } }));
  ok(aborted.success === false && aborted.errors[0].code === 'ABORTED' && invokeCalls.length === 0, 'CR14 pre-aborted signal → ABORTED, no invoke');

  // sequence increments across calls
  var s1 = await run(api.client.getWorkspace('weeklyShipping'));
  var s2 = await run(api.client.getWorkspace('weeklyShipping'));
  ok(s2.meta.sequence > s1.meta.sequence, 'CR15 sequence strictly increments (page can ignore stale)');

  section('Business failure + malformed response cannot become false-success');
  var apiFail = KMAPI.createApiFoundation({ legacy: makeLegacy(), workspaceFlags: { weeklyShipping: true }, flags: { USE_WORKSPACE_API: true }, workspaceInvoke: function () { return Promise.resolve({ success: false, errors: [{ code: 'WRONG_SPREADSHEET_TARGET', message: 'x', details: null }] }); } });
  var fr = await run(apiFail.client.getWorkspace('weeklyShipping'));
  ok(fr.success === false && fr.errors[0].code === 'WRONG_SPREADSHEET_TARGET', 'BF1 server {success:false} → outer success:false (not masked)');
  var apiMal = KMAPI.createApiFoundation({ legacy: makeLegacy(), workspaceFlags: { weeklyShipping: true }, flags: { USE_WORKSPACE_API: true }, workspaceInvoke: function () { return Promise.resolve({ nope: 1 }); } });
  var mr = await run(apiMal.client.getWorkspace('weeklyShipping'));
  ok(mr.success === false && mr.errors[0].code === 'TRANSPORT_ERROR', 'BF2 malformed server response (no success field) → structured failure');

  section('Cache TTL=0 + no write methods invoked + other workspaces unaffected');
  ok(api.cache.ttl === 0 && api.cache.get('weeklyShipping') === null, 'CA1 cache disabled (TTL 0)');
  ok(!lg._calls.some(function (c) { return c[0] === 'updateShippingPlanStatus'; }), 'WR1 no Weekly WRITE method invoked by the read workspace');
  var other = await run(api.client.getWorkspace('shipment'));   // master ON, shipment unimplemented + not enabled
  ok(other.success === false && other.errors[0].code === 'WORKSPACE_NOT_IMPLEMENTED', 'OW1 other (unimplemented) workspace still fails closed, unaffected by Weekly enablement');

  // =====================================================================================================
  section('Legacy ↔ Workspace parity (fixtures)');
  // "legacy-derived" expectation computed directly from the same raw rows (mirrors normalizeShippingPlanRecord).
  var rawPlans = fixturePlans(), rawLines = fixtureLines();
  var wsView = weeklyWorkspaceBuild_(fixtureTables(), { page: { size: 50 } });
  var diffs = [];
  ok(wsView.pagination.totalItems === rawPlans.length, 'PAR1 plan count parity');
  rawPlans.forEach(function (rp) {
    var wp = wsView.plans.filter(function (p) { return p.planId === rp.shipping_plan_id; })[0];
    if (!wp) { diffs.push({ id: rp.shipping_plan_id, kind: 'MISSING_SOURCE' }); return; }
    if (wp.status !== String(rp.status)) diffs.push({ id: rp.shipping_plan_id, kind: 'MAPPING_DEFECT', field: 'status' });
    var expLines = rawLines.filter(function (l) { return l.shipping_plan_id === rp.shipping_plan_id; });
    if (wp.lineCount !== expLines.length) diffs.push({ id: rp.shipping_plan_id, kind: 'MAPPING_DEFECT', field: 'lineCount' });
    var expQty = expLines.reduce(function (s, l) { var a = Number(l.approved_qty) || 0; return s + (a > 0 ? a : (Number(l.requested_qty) || 0)); }, 0);
    if (wp.totalQty !== expQty) diffs.push({ id: rp.shipping_plan_id, kind: 'MAPPING_DEFECT', field: 'totalQty' });
    if (wp.currency !== (String(rp.currency) || null)) diffs.push({ id: rp.shipping_plan_id, kind: 'MAPPING_DEFECT', field: 'currency' });
  });
  ok(diffs.length === 0, 'PAR2 status/lineCount/totalQty/currency parity (0 MAPPING_DEFECT): ' + JSON.stringify(diffs));

  console.log('\n----------------------------------------');
  console.log('API WEEKLY WORKSPACE: ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
