// F1-7N-FB-4F-A — LEGACY ALLOCATION DRAFT READ-ONLY RECONCILIATION DIAGNOSIS.
//
// The live Execution Plan refuses one route with LEGACY_ROUTE_RECONCILIATION_REQUIRED (aggregated by the page as
// ROUTE_GROUP_PARTIAL_FAILURE). This round DIAGNOSES that refusal and designs a migration; it executes none.
//
// The suite EXECUTES the shipped Apps Script — 16_ (the identity authorities), 68_ (the read-only diagnostic
// helpers) and the new un-routed TEMP file — in one VM over a spreadsheet stub whose every write method THROWS.
// "Read-only" is therefore measured, not described: a single setValue / row append / lock acquisition anywhere in
// the path fails the run rather than being asserted away by reading the source.
//
// Run: node assets/tests/legacy-allocation-draft-reconcile-diagnosis-f1-7n-fb-4f-a.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var GS = path.join(ROOT, 'assets/specs/active/apps-script');
var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; } else { failed++; console.log('  FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n' + t); }
function readRepo(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function readGs(f) { return fs.readFileSync(path.join(GS, f), 'utf8'); }

// F1-7N-FB-4F-B1 §H — THE DIAGNOSTIC MOVED OUT OF THE APPS SCRIPT SYNC DIRECTORY, and this suite follows it.
//
// It was in assets/specs/active/apps-script/, which is the set of files the owner guard in
// action-registry-and-router-completeness-f1-7n-fb-4e-r2 watches with
// `git diff --name-only <R1> -- "assets/specs/active/apps-script"`. That guard was therefore RIGHT to fail: a
// read-only diagnostic sitting in the deploy directory is, as far as any mechanical check can tell, an active
// runtime file. The guard was not weakened and the file was not added to the owner list — it simply is not a
// runtime file, so it does not live where runtime files live.
//
// It stays fully testable from here: this suite reads and executes it exactly as before, and the user may delete
// it from the live Apps Script editor whenever convenient. No deployment version is needed for its removal,
// because nothing routes to it.
var TEMP_FILE = 'TEMP_legacy_allocation_draft_reconcile_diagnose.gs';
var TEMP_DIR = path.join(ROOT, 'assets', 'tools', 'apps-script-diagnostics');
var TEMP_PATH = path.join(TEMP_DIR, TEMP_FILE);
var TEMP_SRC = fs.readFileSync(TEMP_PATH, 'utf8');
// And it is NOT in the deploy directory any more — asserted here so a future round cannot quietly move it back.
ok(!fs.existsSync(path.join(GS, TEMP_FILE)),
  'H1 the TEMP diagnostic is NOT in the Apps Script sync directory');
ok(fs.existsSync(TEMP_PATH), 'H1b it is in assets/tools/apps-script-diagnostics/ instead');
var SAD_SRC = readGs('16_shipping_allocation_handlers.gs');
var EPC_SRC = readGs('68_api_v1_execution_plan_conflict_diagnostic.gs');

// =============================================================================================================
// THE HARNESS — every mutation is a thrown error, so a write cannot pass unnoticed.
// =============================================================================================================
var HDRS_30 = ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status',
  'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
  'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
  'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery',
  'generation_type', 'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of', 'draft_version',
  'created_by', 'created_at', 'updated_by', 'updated_at',
  'submitted_by', 'submitted_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'];
var LINE_HDRS = ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku', 'window_code',
  'window_start_date', 'window_end_date', 'required_by_date', 'regular_demand_snapshot',
  'special_event_demand_snapshot', 'destination_stock_snapshot', 'qualified_incoming_snapshot',
  'approved_supply_snapshot', 'calculated_gap_qty', 'source_initial_available_qty_snapshot',
  'source_available_before_allocation_snapshot', 'allocation_sequence', 'recommendation_reason',
  'recommendation_flags', 'recommended_qty', 'source_warehouse_id', 'source_warehouse_code_snapshot',
  'planned_qty', 'units_per_carton', 'route_no', 'line_status', 'override_reason', 'note',
  'created_at', 'updated_at'];

var SECRET_NOTE = 'operator note: hold for QC, approver ops-lead@kitchenmama.example';
var SECRET_LINE_NOTE = 'line note: split from the August cycle by jane.doe@kitchenmama.example';

function baseDraft(over) {
  var d = {
    allocation_draft_id: 'SAD-20260901-0001', planning_cycle: '2026-09', source_page: 'inventory_replenishment',
    company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', status: 'draft',
    recommended_source_warehouse_id: 'WH-KM-CN-FAC1', recommended_destination_warehouse_id: '',
    recommended_source_warehouse_code_snapshot: 'CN-YX', recommended_destination_warehouse_code_snapshot: '',
    recommendation_group_no: '', recommended_shipping_method: 'sea_express', recommended_last_mile_delivery: '',
    generation_type: 'manual', calculation_run_id: '', formula_version: '', calculated_at: '',
    source_data_as_of: '', draft_version: '3',
    created_by: 'ops', created_at: '2026-08-01', updated_by: 'ops', updated_at: '2026-08-30',
    submitted_by: '', submitted_at: '', cancelled_by: '', cancelled_at: '', cancel_reason: '',
    note: SECRET_NOTE
  };
  Object.keys(over || {}).forEach(function (k) { d[k] = over[k]; });
  return d;
}
function baseLine(over) {
  var l = {
    allocation_draft_line_id: 'SADL-AAAA1111', allocation_draft_id: 'SAD-20260901-0001',
    sku: 'CO1100-R', site_sku: 'CO1100-R-AMZ', window_code: 'D90',
    recommended_qty: 400, source_warehouse_id: 'WH-KM-CN-FAC1', source_warehouse_code_snapshot: 'CN-YX',
    planned_qty: 400, units_per_carton: 12, route_no: '1', line_status: 'draft',
    override_reason: '', note: SECRET_LINE_NOTE, created_at: '2026-08-01', updated_at: '2026-08-30'
  };
  Object.keys(over || {}).forEach(function (k) { l[k] = over[k]; });
  return l;
}

function build(opts) {
  opts = opts || {};
  var writes = [];
  function forbid(name) { return function () { writes.push(name); throw new Error('WRITE_ATTEMPTED:' + name); }; }
  function makeSheet(name, headers, rows) {
    var data = [headers.slice()].concat((rows || []).map(function (r) {
      return headers.map(function (h) { return r[h] === undefined ? '' : r[h]; });
    }));
    return {
      getName: function () { return name; },
      getLastRow: function () { return data.length; },
      getLastColumn: function () { return headers.length; },
      getDataRange: function () { return { getValues: function () { return data.map(function (r) { return r.slice(); }); } }; },
      // getRange is FAITHFUL to its arguments. A stub that always returned the header row made a legacy row look
      // route-COMPLETE (every cell held its own column name, which is truthy) and the guard under test returned
      // ''. A harness that cannot reproduce the refusal cannot prove the refusal is intact.
      getRange: function (row, col, numRows, numCols) {
        var r0 = (row || 1) - 1, c0 = (col || 1) - 1;
        var nr = numRows === undefined ? 1 : numRows, nc = numCols === undefined ? 1 : numCols;
        var slice = [];
        for (var i = 0; i < nr; i++) {
          var src = data[r0 + i] || [];
          slice.push(src.slice(c0, c0 + nc));
        }
        return { getValues: function () { return slice.map(function (x) { return x.slice(); }); },
          getValue: function () { return slice[0] ? slice[0][0] : ''; },
          setValue: forbid('setValue'), setValues: forbid('setValues') };
      },
      appendRow: forbid('appendRow'), insertRows: forbid('insertRows'), insertRowAfter: forbid('insertRowAfter'),
      deleteRow: forbid('deleteRow'), deleteRows: forbid('deleteRows'),
      insertColumnsAfter: forbid('insertColumnsAfter'), setName: forbid('setName'), clear: forbid('clear')
    };
  }
  var headerCols = opts.headerCols || HDRS_30;
  var tabs = {
    shipping_allocation_drafts: makeSheet('shipping_allocation_drafts', headerCols, opts.drafts || [baseDraft()]),
    shipping_allocation_draft_lines: makeSheet('shipping_allocation_draft_lines', LINE_HDRS, opts.lines || [baseLine()]),
    shipping_plans: makeSheet('shipping_plans', ['shipping_plan_id', 'submit_batch_id', 'status'],
      opts.plans || [{ shipping_plan_id: 'SP-1', submit_batch_id: 'EX-1', status: 'draft' }]),
    shipping_plan_lines: makeSheet('shipping_plan_lines', ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'source_reason'],
      opts.planLines === undefined
        ? [{ shipping_plan_line_id: 'SPL-1', shipping_plan_id: 'SP-1', sku: 'CO1100-R',
            source_reason: 'allocation_draft:SAD-20260901-0001|run:R1|fv:v1|cyc:2026-09|line:SADL-AAAA1111' }]
        : opts.planLines),
    warehouses: makeSheet('warehouses', ['warehouse_id', 'warehouse_code', 'warehouse_name', 'country', 'company'],
      opts.warehouses === undefined
        ? [{ warehouse_id: 'WH-KM-CN-FAC1', warehouse_code: 'CN-YX', warehouse_name: 'CN侑鑫', country: 'CN', company: 'Kitchen Mama' }]
        : opts.warehouses)
  };
  if (opts.dropTabs) opts.dropTabs.forEach(function (n) { delete tabs[n]; });
  var ss = {
    getId: function () { return 'PROD-DB-ID'; },
    getSheetByName: function (n) { return tabs[n] || null; },
    insertSheet: forbid('insertSheet'),
    getSpreadsheetTimeZone: function () { return 'Etc/GMT'; }
  };
  var logs = [];
  var sb = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    JSON: JSON, Math: Math, Date: Date, Array: Array, Object: Object, String: String, Number: Number,
    Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat,
    PRODUCTION_DB_SPREADSHEET_ID_: 'PROD-DB-ID',
    SpreadsheetApp: {
      openById: function (id) { if (id !== 'PROD-DB-ID') throw new Error('WRONG_SPREADSHEET_TARGET'); return ss; },
      getActiveSpreadsheet: function () { return ss; },
      flush: forbid('SpreadsheetApp.flush')
    },
    Logger: { log: function (m) { logs.push(String(m)); } },
    LockService: { getScriptLock: forbid('LockService.getScriptLock'), getDocumentLock: forbid('LockService.getDocumentLock') },
    DriveApp: { getFileById: forbid('DriveApp.getFileById'), createFile: forbid('DriveApp.createFile') },
    MailApp: { sendEmail: forbid('MailApp.sendEmail') },
    GmailApp: { sendEmail: forbid('GmailApp.sendEmail') },
    PropertiesService: { getScriptProperties: forbid('PropertiesService.getScriptProperties') },
    UrlFetchApp: { fetch: forbid('UrlFetchApp.fetch') },
    ContentService: {
      createTextOutput: function (s) { var o = { setMimeType: function () { return o; }, getContent: function () { return s; } }; return o; },
      MimeType: { JSON: 'application/json' }
    },
    Session: { getActiveUser: function () { return { getEmail: function () { return 'tester@example.test'; } }; } }
  };
  sb.globalThis = sb;
  var ctx = vm.createContext(sb);
  var loadErrors = [];
  // FB-4F-B1 §H — the three RUNTIME files still come from the Apps Script sync directory; the DIAGNOSTIC comes
  // from the tooling directory it now lives in. Same source, same execution, different — and correct — home,
  // which is the whole point: it is not a runtime file, so it does not sit where runtime files sit.
  [['29_production_safety_adapter.gs', GS], ['16_shipping_allocation_handlers.gs', GS],
    ['68_api_v1_execution_plan_conflict_diagnostic.gs', GS], [TEMP_FILE, TEMP_DIR]].forEach(function (pair) {
    var f = pair[0];
    try { vm.runInContext(fs.readFileSync(path.join(pair[1], f), 'utf8'), ctx, { filename: f }); }
    catch (e) { loadErrors.push(f + ': ' + e.message); }
  });
  return {
    ctx: ctx, sb: sb, writes: writes, logs: logs, loadErrors: loadErrors,
    run: function (code) { return vm.runInContext(code, ctx); },
    diagnose: function (target) {
      ctx.__T = target || null;
      return vm.runInContext('tempFb4faDiagnose_(__T || TEMP_FB4FA_TARGET_)', ctx);
    },
    logRun: function () { return vm.runInContext('TEMP_LEGACY_ALLOCATION_DRAFT_RECONCILE_DIAGNOSE()', ctx); }
  };
}

// =============================================================================================================
// §A — THE REFUSAL IS INTACT AND FAIL-CLOSED.
// =============================================================================================================
section('§A — THE LEGACY REFUSAL');
(function () {
  var h = build();
  eq(h.loadErrors, [], 'A0 16_, 68_ and the TEMP diagnostic all load');
  eq(h.run('typeof sadLegacyReconcileReason_'), 'function', 'A1 the legacy guard is present');
  eq(h.run('typeof sadResolveActiveDraftK2OrK3_'), 'function', 'A2 the unified resolver is present');

  // THE PREDICATE, executed. A persisted header with a blank destination warehouse is route-INCOMPLETE, and a
  // non-K2 id whose persisted route is incomplete is exactly what raises the refusal.
  h.ctx.__ROW = baseDraft();
  eq(h.run('sadHeaderRouteIsComplete_(__ROW)'), false,
    'A3 the persisted legacy row is route-INCOMPLETE by the shipped predicate (blank destination warehouse)');
  h.ctx.__REQ = { recommended_source_warehouse_id: 'WH-KM-CN-FAC1', recommended_destination_warehouse_id: '',
    destination_marketplace: 'Amazon', recommended_shipping_method: 'sea_express' };
  eq(h.run('sadHeaderRouteIsComplete_(__REQ)'), true,
    'A4 ... while the REQUEST carrying destination_marketplace IS route-complete — the two disagree, and that is the whole defect');

  // The guard itself, run over a found-row shape.
  h.ctx.__FOUND = { row: 2, col: function () { return -1; } };
  var reason = h.run('(function(){ var sh = SpreadsheetApp.openById("PROD-DB-ID").getSheetByName("shipping_allocation_drafts");'
    + ' return sadLegacyReconcileReason_(sh, { row: 2, col: function(){ return -1; } }, false, __REQ); })()');
  eq(reason, 'LEGACY_ROUTE_RECONCILIATION_REQUIRED',
    'A5 the shipped guard raises LEGACY_ROUTE_RECONCILIATION_REQUIRED for this exact row');
  eq(h.writes, [], 'A6 ... and reaching that verdict wrote nothing');

  // allow_legacy_reconcile is the ONLY way past it, and it is a separate explicit user migration.
  var allowed = h.run('(function(){ var sh = SpreadsheetApp.openById("PROD-DB-ID").getSheetByName("shipping_allocation_drafts");'
    + ' return sadLegacyReconcileReason_(sh, { row: 2, col: function(){ return -1; } }, true, __REQ); })()');
  eq(allowed, '', 'A7 only an explicit allow_legacy_reconcile bypasses it (the USER migration flag)');

  // Both BLOCK call sites refuse BEFORE any write. Asserted on the source ORDER, since the runtime proof is A6.
  var manual = /function sadUpsertDraftHeaderCore_[\s\S]*?\n}/.exec(SAD_SRC);
  ok(!!manual, 'A8 the manual write core was located');
  if (manual) {
    var body = manual[0];
    var iGuard = body.indexOf('sadLegacyReconcileReason_');
    var iWrite = body.search(/setValue\(|appendRow\(/);
    ok(iGuard !== -1 && iWrite !== -1 && iGuard < iWrite, 'A9 the manual core evaluates the guard BEFORE its first write');
  }
  var atomic = SAD_SRC.indexOf('function sadAtomicUpsertCore_');
  var atomicGuard = SAD_SRC.indexOf('sadLegacyReconcileReason_(hSh', atomic);
  ok(atomic !== -1 && atomicGuard !== -1, 'A10 the atomic core evaluates the same guard');
  ok(/zero_write: true, data: \{ reason: legR/.test(SAD_SRC), 'A11 the atomic refusal states zero_write explicitly');

  // The refusal is not weakened anywhere: no fallback, no auto-conversion, no permissive update.
  ok(!/allowLegacyReconcile\s*:\s*true/.test(SAD_SRC.replace(/opts\.allowLegacyReconcile === true/g, '')),
    'A12 nothing in 16_ hard-codes allowLegacyReconcile to true');
  ok(/return \{ status: 'BLOCK', reason: 'LEGACY_ROUTE_RECONCILIATION_REQUIRED'/.test(SAD_SRC),
    'A13 the resolver still BLOCKs rather than adopting a legacy row');

  // ROUTE_GROUP_PARTIAL_FAILURE is the CLIENT aggregating per-route outcomes — it is not a second backend code.
  var IR = readRepo('assets/js/pages/inventory-replenishment.js');
  ok(/reasonCode: 'ROUTE_GROUP_PARTIAL_FAILURE'/.test(IR), 'A14 ROUTE_GROUP_PARTIAL_FAILURE is produced by the page');
  ok(/first\.code \|\| 'ROUTE_GROUP_PARTIAL_FAILURE'/.test(IR),
    'A15 ... carrying the FIRST per-route backend code, which is how the legacy refusal reached the operator');
})();

// =============================================================================================================
// §B/§C — THE DIAGNOSTIC IS BOUNDED, UN-ROUTED AND STRUCTURALLY READ-ONLY.
// =============================================================================================================
section('§B/§C — THE DIAGNOSTIC');
(function () {
  // UN-ROUTED: the entry point is not in any router table and no action was added.
  var ROUTER = readGs('01_router.gs');
  ok(ROUTER.indexOf('TEMP_LEGACY_ALLOCATION_DRAFT_RECONCILE_DIAGNOSE') === -1, 'B1 the diagnostic is not routed');
  ok(ROUTER.indexOf('legacyAllocationDraftReconcile') === -1, 'B2 no new action name was added to the router');
  var HEALTH = readGs('63_api_v1_system_health.gs');
  // F1-7N-FC-1A-R1 — at-or-after: FB-4F-A was a diagnosis round and added no action; R1 adds one.
ok(Number((HEALTH.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]) >= 10,
  'B3 the deployed action contract is at or after 10');
  // F1-7N-FB-4G-A2-R3 - RESTATED to a floor: an equality forbids every later round from adding an action.
  ok(Number((HEALTH.match(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/) || [])[1]) >= 9,
    'B4 the required-action list is at or after 9');
  ok(/var SYS_TRANSPORT_CONTRACT_VERSION_ = 1;/.test(HEALTH), 'B5 the transport contract stays 1');

  // STRUCTURALLY READ-ONLY. Comments and string literals are stripped FIRST, then CALL SITES are matched — a
  // helper named in prose is not a call, and a scan that cannot tell those apart proves nothing.
  var stripped = TEMP_SRC
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
  var forbidden = ['appendRow', 'setValue', 'setValues', 'insertSheet', 'deleteRow', 'deleteRows',
    'insertRowAfter', 'insertColumnsAfter', 'procurementEnsureSheet_', 'sheetEnsureColumns_',
    'LockService', 'DriveApp', 'MailApp', 'GmailApp', 'UrlFetchApp', 'setName', 'clearContent'];
  var found = forbidden.filter(function (n) { return new RegExp(n.replace(/[$]/g, '\\$') + '\\s*\\(').test(stripped); });
  eq(found, [], 'B6 no write / lock / mail / fetch CALL SITE exists in the diagnostic');
  ok(!/PropertiesService\s*\.\s*\w+\s*\(/.test(stripped), 'B7 no PropertiesService call site either');
  ok(!/\bCOMMIT\b/.test(stripped), 'B8 there is no COMMIT mode in this file, not even a disabled one');

  // It reuses the shipped authorities instead of re-implementing them.
  ['sadHeaderRouteIsComplete_', 'sadK2GroupKey_', 'sadK2DeterministicHeaderId_'].forEach(function (n) {
    ok(new RegExp("typeof " + n + " === 'function'").test(TEMP_SRC), 'B9 it checks for the shipped authority ' + n);
    ok(TEMP_SRC.indexOf('function ' + n) === -1, 'B9b ... and does not define its own ' + n);
  });
  ['epcReadTable_', 'epcIdRef_', 'epcIdentityFamily_', 'epcFnv1a_'].forEach(function (n) {
    ok(new RegExp(n + '\\s*\\(').test(stripped), 'B10 it reuses 68_\'s ' + n);
    ok(TEMP_SRC.indexOf('function ' + n) === -1, 'B10b ... rather than copying it');
  });
  // 67_ is about a DIFFERENT table, so it is deliberately not used.
  var ADI = readGs('67_api_v1_allocation_draft_identity.gs');
  ok(/ADI_DRAFTS_TABLE_ = 'request_order_allocation_drafts'/.test(ADI),
    'B11 67_ diagnoses request_order_allocation_drafts — a different table and a different identity family');
  ok(TEMP_SRC.indexOf('handleAllocationDraftIdentityDiagnostic_') === -1,
    'B12 ... so the new diagnostic does not call it');
})();

// =============================================================================================================
// §C — IT REFUSES WITHOUT A BOUNDED TARGET, AND IT WRITES NOTHING WHEN IT RUNS.
// =============================================================================================================
section('§C — BOUNDING AND ZERO WRITE');
(function () {
  var h = build();
  ['country', 'marketplace', 'sku'].forEach(function (k) {
    var t = { country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' };
    t[k] = '';
    var r = h.diagnose(t);
    eq(r.refused && r.refused.code, 'SCOPE_INCOMPLETE', 'C1 a missing ' + k + ' refuses the run');
    ok((r.refused.missing || []).indexOf(k) !== -1, 'C1b ... naming ' + k);
    eq(r.decision, 'REFUSED', 'C1c ... and the decision is REFUSED');
  });
  eq(h.writes, [], 'C2 a refused run wrote nothing');

  // The full envelope the round requires.
  var d = h.diagnose();
  eq(d.diagnostic, 'TEMP_LEGACY_ALLOCATION_DRAFT_RECONCILE_DIAGNOSE', 'C3 envelope: diagnostic');
  eq(d.round, 'F1-7N-FB-4F-A', 'C4 envelope: round');
  eq(d.readOnly, true, 'C5 envelope: readOnly');
  eq(d.DB_WRITES, 0, 'C6 envelope: DB_WRITES');
  eq(d.DRIVE_WRITES, 0, 'C7 envelope: DRIVE_WRITES');
  eq(d.LOCKS_ACQUIRED, 0, 'C8 envelope: LOCKS_ACQUIRED');
  eq(h.writes, [], 'C9 a FULL run attempted zero writes, zero locks, zero Drive and zero mail — measured, not described');

  // Ambiguity fails closed.
  var h2 = build({ drafts: [baseDraft(), baseDraft({ allocation_draft_id: 'SAD-20260901-0002', company: 'ResUS' })],
    lines: [baseLine(), baseLine({ allocation_draft_line_id: 'SADL-BBBB2222', allocation_draft_id: 'SAD-20260901-0002' })] });
  var amb = h2.diagnose();
  eq(amb.refused && amb.refused.code, 'SCOPE_AMBIGUOUS_MULTIPLE_COMPANIES',
    'C10 two companies owning the same country/marketplace/SKU refuses instead of picking one');
  eq((amb.refused.companies || []).length, 2, 'C10b ... naming both');
  eq(h2.writes, [], 'C11 ... having written nothing');

  // A scope that matches nothing is stated, never answered with a confident empty proposal.
  var h3 = build({ lines: [baseLine({ sku: 'ZZ9999-R' })] });
  eq(h3.diagnose().refused.code, 'NO_MATCHING_RECORDS', 'C12 no matching record is a stated refusal');

  // Without 16_ loaded, it refuses rather than re-deriving the identity rules itself.
  var sbLite = vm.createContext({ JSON: JSON, Math: Math, Date: Date, String: String, Number: Number,
    Object: Object, Array: Array, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite,
    PRODUCTION_DB_SPREADSHEET_ID_: 'PROD-DB-ID',
    SpreadsheetApp: { openById: function () { return { getSheetByName: function (n) {
      if (n === 'shipping_allocation_drafts') return { getDataRange: function () { return { getValues: function () { return [HDRS_30, HDRS_30.map(function (k) { return baseDraft()[k] === undefined ? '' : baseDraft()[k]; })]; } }; } };
      if (n === 'shipping_allocation_draft_lines') return { getDataRange: function () { return { getValues: function () { return [LINE_HDRS, LINE_HDRS.map(function (k) { return baseLine()[k] === undefined ? '' : baseLine()[k]; })]; } }; } };
      return null; } }; } },
    Logger: { log: function () {} } });
  vm.runInContext(readGs('29_production_safety_adapter.gs'), sbLite);
  vm.runInContext(EPC_SRC, sbLite);
  vm.runInContext(TEMP_SRC, sbLite);
  var lite = vm.runInContext('tempFb4faDiagnose_(TEMP_FB4FA_TARGET_)', sbLite);
  eq(lite.refused && lite.refused.code, 'PRODUCTION_AUTHORITY_UNAVAILABLE',
    'C13 with 16_ absent it REFUSES rather than inventing a second identity algorithm');
})();

// =============================================================================================================
// §D — IDENTITY FAMILIES, MASKING, AND THE PERSISTED / DERIVED / CLIENT-ONLY SPLIT.
// =============================================================================================================
section('§D — IDENTITY AND CLASSIFICATION');
(function () {
  var h = build({
    drafts: [baseDraft(), baseDraft({ allocation_draft_id: 'SADH-K2-DEADBEEF', status: 'draft',
      recommended_destination_warehouse_id: 'WH-US-AMZ-1' })],
    lines: [baseLine(), baseLine({ allocation_draft_line_id: 'SADL-K2-CAFE0001', allocation_draft_id: 'SADH-K2-DEADBEEF' })]
  });
  var d = h.diagnose();
  ok(!d.refused, 'D0 the mixed-family fixture diagnoses (' + (d.refused ? d.refused.code : 'ok') + ')');
  if (d.refused) return;
  var fam = d.sections['2_identity_family'];
  eq(fam.headers_matched, 2, 'D1 both headers are matched');
  ok(fam.by_identity_family.LEGACY === 1, 'D2 the SAD- row with an incomplete persisted route is LEGACY');
  ok((fam.by_identity_family.K2 || 0) + (fam.by_identity_family.CANONICAL || 0) === 1,
    'D3 the SADH-K2- row is classified in the K2 family, separately from the legacy one');
  eq(fam.additional_id_shapes_found['SAD-'], 1, 'D4 the actual id shapes found are reported');
  eq(fam.additional_id_shapes_found['SADH-K2-'], 1, 'D4b ... both of them');
  var shapes = {};
  d.sections['3_lines'].lines.forEach(function (l) { shapes[l.id_shape] = (shapes[l.id_shape] || 0) + 1; });
  eq(shapes, { 'SADL-': 1, 'SADL-K2-': 1 }, 'D5 line identity shapes are reported separately too');

  // MASKING: no full id, and no free text at all.
  var blob = JSON.stringify(d);
  ok(blob.indexOf('SAD-20260901-0001') === -1, 'D6 no full header id appears anywhere in the output');
  ok(blob.indexOf('SADL-AAAA1111') === -1, 'D7 no full line id appears either');
  ok(blob.indexOf(SECRET_NOTE) === -1, 'D8 the operator note is never printed');
  ok(blob.indexOf(SECRET_LINE_NOTE) === -1, 'D9 the line note is never printed');
  ok(blob.indexOf('@kitchenmama.example') === -1, 'D10 no email address leaks through a note');
  ok(/"note_ref":\{"present":true,"length":\d+,"hash":"h:[0-9a-f]{8}"\}/.test(blob),
    'D11 a note is reported by presence, length and hash — enough to prove a migration preserved it');

  // The same masking holds through the LOG path, which is what the operator actually reads.
  h.logRun();
  var logBlob = h.logs.join('\n');
  ok(logBlob.indexOf('SAD-20260901-0001') === -1, 'D12 the log masks the header id too');
  ok(logBlob.indexOf(SECRET_NOTE) === -1, 'D13 the log never prints a note');
  ok(logBlob.indexOf('note_present=true') !== -1, 'D14 ... it prints only that one exists');
  eq(h.writes, [], 'D15 the log path wrote nothing');

  // CLASSIFICATION: a UI label is never treated as proof of persistence.
  var dims = d.sections['4_dimension_classification'].dimensions;
  function classOf(name) { var x = dims.filter(function (y) { return y.dimension === name; })[0]; return x ? x.classification : '(absent)'; }
  eq(classOf('destination MARKETPLACE (To)'), 'CLIENT_ONLY_UNPERSISTABLE',
    'D16 destination_marketplace is CLIENT-ONLY — the column does not exist');
  eq(classOf('expected arrival'), 'CLIENT_ONLY_UNPERSISTABLE', 'D17 expected arrival is client-only as well');
  eq(classOf('origin (From)'), 'PERSISTED_CANONICAL', 'D18 the origin warehouse id IS persisted canonically');
  eq(classOf('K2 group key'), 'DERIVED', 'D19 the group key is DERIVED, never stored');
  ok(dims.filter(function (x) { return x.classification === 'DERIVED'; }).length >= 3,
    'D20 derived values are listed as derived rather than folded in with persisted ones');

  // With the column present, the classification flips — the test proves the rule, not the fixture.
  var h2 = build({ headerCols: HDRS_30.concat(['destination_marketplace']),
    drafts: [baseDraft({ destination_marketplace: 'Amazon' })] });
  var d2 = h2.diagnose();
  var dims2 = d2.sections['4_dimension_classification'].dimensions;
  eq(dims2.filter(function (x) { return x.dimension === 'destination MARKETPLACE (To)'; })[0].classification,
    'PERSISTED_CANONICAL', 'D21 the same dimension is PERSISTED_CANONICAL once the column exists');
})();

// =============================================================================================================
// §E — NATURAL KEY AND COLLISIONS.
// =============================================================================================================
section('§E — NATURAL KEY AND COLLISIONS');
(function () {
  var h = build();
  var d = h.diagnose();
  var nk = d.sections['5_natural_key'];
  eq(nk.k2_dimensions_from_runtime.length, 10, 'E1 the K2 header key has ten dimensions');
  eq(nk.k2_line_dimensions_from_runtime, ['allocation_draft_id', 'sku', 'site_sku', 'window_code'],
    'E2 the K2 line key is the shipped four');
  eq(nk.request_route_complete, true, 'E3 the request IS route-complete (it carries destination_marketplace)');
  ok(/^h:[0-9a-f]{8}$/.test(nk.requested_k2_group_key_hash), 'E4 the requested group key is reported as a hash, not a key');
  ok(nk.proposed_k2_header_id_ref.masked.indexOf('SADH-K2-') === 0, 'E5 the proposed canonical id is a K2 id');
  eq(nk.legacy_headers_matched, 1, 'E6 one legacy header matched');
  eq(nk.canonical_k2_header_already_exists, false, 'E7 no canonical K2 header exists for this target yet');

  // TWO legacy rows collapsing onto ONE K2 key must be reported and must make the proposal unsafe.
  var h2 = build({
    drafts: [baseDraft(), baseDraft({ allocation_draft_id: 'SAD-20260901-0009' })],
    lines: [baseLine(), baseLine({ allocation_draft_line_id: 'SADL-CCCC3333', allocation_draft_id: 'SAD-20260901-0009' })]
  });
  var d2 = h2.diagnose();
  var nk2 = d2.sections['5_natural_key'];
  eq(nk2.multiple_legacy_rows_collapse_to_one_k2_key, true, 'E8 two legacy rows on one K2 key are detected');
  ok(nk2.collapsing_group_members.length >= 1, 'E9 ... and their members are named (masked)');
  eq(nk2.contested_identities_that_must_remain_blocked.length, 2,
    'E10 a contested group is reported as identities that must remain BLOCKED');
  eq(d2.mechanically_safe, false, 'E11 a collision makes the proposal mechanically UNSAFE');
  ok(d2.unsafe_reasons.join(' ').indexOf('collapses onto a single K2 group key') !== -1, 'E12 ... stating why');

  // One legacy row whose own lines disagree about the route would expand ambiguously.
  var h3 = build({ lines: [baseLine(), baseLine({ allocation_draft_line_id: 'SADL-DDDD4444', route_no: '2', source_warehouse_id: 'WH-KM-TW-FAC1' })] });
  var nk3 = h3.diagnose().sections['5_natural_key'];
  eq(nk3.one_legacy_row_expands_to_multiple_routes.length, 1,
    'E13 a legacy row whose lines carry two different routes is reported as ambiguous expansion');
})();

// =============================================================================================================
// §F — QUANTITY CONSERVATION.
// =============================================================================================================
section('§F — QUANTITY CONSERVATION');
(function () {
  var h = build();
  var q = h.diagnose().sections['6_quantity_conservation'];
  eq(q.before_line_quantity_total, 400, 'F1 the before total is summed from persisted cells');
  eq(q.after_proposed_line_quantity_total, 400, 'F2 the after total is computed, not assumed');
  eq(q.conserved, true, 'F3 before == after');
  eq(q.lines_with_blank_or_non_numeric_qty, 0, 'F4 no blank quantity in this fixture');
  eq(q.unexplained_delta, 0, 'F5 the attempted route quantity is fully explained');

  // A BLANK quantity is unknown, never zero, and it makes the proposal unsafe.
  var hb = build({ lines: [baseLine({ planned_qty: '' })] });
  var db = hb.diagnose();
  eq(db.sections['6_quantity_conservation'].lines_with_blank_or_non_numeric_qty, 1, 'F6 a blank planned_qty is counted, not treated as 0');
  eq(db.mechanically_safe, false, 'F7 a blank quantity makes the proposal mechanically UNSAFE');
  ok(db.unsafe_reasons.join(' ').indexOf('blank or non-numeric planned_qty') !== -1, 'F8 ... stating why');

  var hn = build({ lines: [baseLine({ planned_qty: 'four hundred' })] });
  eq(hn.diagnose().sections['6_quantity_conservation'].lines_with_blank_or_non_numeric_qty, 1,
    'F9 a non-numeric planned_qty is treated the same way');

  // A mismatch against the attempted quantity is reported as a delta, never redistributed or rounded away.
  var hd = build({ lines: [baseLine({ planned_qty: 350 })] });
  eq(hd.diagnose().sections['6_quantity_conservation'].unexplained_delta, -50,
    'F10 a difference from the attempted quantity is reported as an explicit delta');
})();

// =============================================================================================================
// §G — DOWNSTREAM FOREIGN KEYS.
// =============================================================================================================
section('§G — DOWNSTREAM FOREIGN KEYS');
(function () {
  var h = build();
  var fk = h.diagnose().sections['7_downstream_foreign_keys'];
  eq(fk.stored_fk_column_found, false, 'G1 no table stores an allocation_draft_id column');
  ok(fk.tables_searched_for_a_stored_fk_column.length >= 8, 'G2 the search is bounded and enumerated');
  var pl = fk.textual_references.filter(function (r) { return r.referencing_column === 'source_reason'; })[0];
  ok(!!pl, 'G3 shipping_plan_lines.source_reason is inventoried as a textual reference');
  eq(pl.row_count, 1, 'G4 ... and the matching row is counted');
  eq(pl.preserved_by_in_place_completion, true, 'G5 in-place completion preserves it');
  eq(pl.preserved_by_identity_replacement, false, 'G6 an identity replacement would NOT');
  eq(pl.also_binds_submit_idempotency, true, 'G7 ... and it is a Submit fingerprint field, so re-keying changes the idempotency hash');

  // The claim in G7 is checked against the shipped fingerprint definition rather than asserted.
  var SP = readGs('11_shipping_plan_handlers.gs');
  ok(/SP_LINE_FP_STR_ = \[[^\]]*'source_reason'/.test(SP.replace(/\s+/g, ' ')),
    'G8 source_reason really is in the spfp-1 line fingerprint');
  ok(/source_reason: lineageBase \+ '\|line:'/.test(SAD_SRC), 'G9 ... and Submit really writes the draft + line ids into it');

  // The reverse pointer on the draft note is inventoried too.
  var hs = build({ drafts: [baseDraft({ status: 'submitted', note: '[SUBMITTED @2026-08-30 → shipping_plan SP-1 · exec EX-1]' })] });
  var fk2 = hs.diagnose().sections['7_downstream_foreign_keys'];
  var noteRef = fk2.textual_references.filter(function (r) { return r.referencing_column === 'note'; })[0];
  eq(noteRef.row_count, 1, 'G10 the submit stamp on the draft note is detected');

  // Zero references is a real answer, distinct from "not looked at".
  var h0 = build({ planLines: [] });
  var fk0 = h0.diagnose().sections['7_downstream_foreign_keys'];
  eq(fk0.textual_references.filter(function (r) { return r.referencing_column === 'source_reason'; })[0].row_count, 0,
    'G11 zero downstream references is reported as zero, with the table still named');
})();

// =============================================================================================================
// §H — THE DESTINATION-MARKETPLACE SCHEMA DECISION.
// =============================================================================================================
section('§H — SCHEMA DECISION');
(function () {
  var h = build();
  var d = h.diagnose();
  var dm = d.sections['8_destination_marketplace'];
  eq(dm.persisted_canonical_column_exists, false, 'H1 destination_marketplace is NOT a persisted canonical column');
  eq(dm.client_sends_it, true, 'H2 ... while the client sends it');
  eq(d.schema_change_required, true, 'H3 schema_change_required');
  eq(d.mechanically_safe, false, 'H4 mechanically_safe = false');
  eq(d.decision, 'STOP_FOR_SCHEMA_REVIEW', 'H5 decision = STOP_FOR_SCHEMA_REVIEW');

  // The proposal is complete and append-only, and it does NOT encode a marketplace as a warehouse.
  var p = dm.proposal;
  ok(!!p, 'H6 a schema proposal is produced');
  eq(p.target_sheet, 'shipping_allocation_drafts', 'H7 proposal: target sheet');
  eq(p.new_column_name, 'destination_marketplace', 'H8 proposal: exact column name');
  ok(/APPEND-ONLY/.test(p.insertion_policy), 'H9 proposal: append-only insertion policy');
  ['data_type', 'writer_changes_required', 'reader_changes_required', 'backfill_source',
    'ambiguous_legacy_rows', 'validation', 'cutover_impact', 'rollback'].forEach(function (k) {
    ok(!!p[k], 'H10 proposal carries ' + k);
  });
  ok(/never guessed/.test(p.ambiguous_legacy_rows), 'H11 an ambiguous legacy row is left blank, never guessed');
  ok(/warehouse id OR a destination marketplace, never both/.test(p.validation),
    'H12 a marketplace is never encoded as a warehouse');
  var blob = JSON.stringify(dm);
  ok(blob.indexOf('WH-AMAZON') === -1 && blob.indexOf('warehouse_id: \'Amazon\'') === -1,
    'H13 the proposal never suggests a fake warehouse id for Amazon');

  // DERIVED from the shipped rule: persisting the column is necessary but not sufficient.
  eq(dm.is_a_k2_group_dimension_in_the_shipped_rule, false,
    'H14 destination_marketplace is NOT one of the dimensions sadK2GroupKey_ separates on');
  ok(/NECESSARY but NOT SUFFICIENT/.test(dm.grouping_consequence),
    'H15 ... so the proposal says persisting it alone would still collapse two marketplace destinations');

  // With the column present the decision changes — the rule is being tested, not the fixture.
  var h2 = build({ headerCols: HDRS_30.concat(['destination_marketplace']),
    drafts: [baseDraft({ destination_marketplace: 'Amazon' })] });
  var d2 = h2.diagnose();
  eq(d2.schema_change_required, false, 'H16 with the column present no schema change is required');
  ok(d2.decision !== 'STOP_FOR_SCHEMA_REVIEW', 'H17 ... and the schema stop is lifted (' + d2.decision + ')');
})();

// =============================================================================================================
// §I/§J — MAPPING AND THE PROTECTED CHECKSUM.
// =============================================================================================================
section('§I/§J — MAPPING AND CHECKSUM');
(function () {
  var h = build();
  var d = h.diagnose();
  var m = d.sections['9_mapping'];
  eq(m.mechanism, 'NO_SAFE_AUTOMATIC_MIGRATION_UNTIL_SCHEMA_REVIEW', 'I1 no mechanism is selected to dodge the schema review');
  ok(m.rows.every(function (r) { return r.identity_changes === false; }), 'I2 no proposed row changes its identity');
  ok(m.rows.every(function (r) { return (r.preserved_references || []).length > 0; }), 'I3 every row names the references it preserves');
  ok(/spfp-1/.test(m.mechanism_rationale), 'I4 the rationale cites the Submit fingerprint as the reason re-keying was rejected');

  var cs = d.sections['10_checksum'];
  ok(/^fb4fa-1:[0-9a-f]{8}$/.test(cs.checksum), 'J1 the checksum is a versioned deterministic value');
  eq(cs.protected_header_fields.length, 30, 'J2 all 30 header fields are protected');
  ok(cs.protected_line_fields.indexOf('planned_qty') !== -1, 'J3 planned_qty is protected');
  ok(cs.protected_line_fields.indexOf('note') !== -1, 'J4 operator notes are protected');
  ok(/FB4FB_CHECKSUM_MISMATCH/.test(cs.usage), 'J5 the mismatch refusal is named');

  // Determinism, then sensitivity: the checksum must be stable across runs and move for ANY protected field.
  eq(build().diagnose().sections['10_checksum'].checksum, cs.checksum, 'J6 the same data yields the same checksum');
  var moved = [];
  var probes = [
    ['header status', { drafts: [baseDraft({ status: 'site_confirmed' })] }],
    ['header note', { drafts: [baseDraft({ note: SECRET_NOTE + ' (edited)' })] }],
    ['header updated_at', { drafts: [baseDraft({ updated_at: '2026-08-31' })] }],
    ['header draft_version', { drafts: [baseDraft({ draft_version: '4' })] }],
    ['header method', { drafts: [baseDraft({ recommended_shipping_method: 'air_express' })] }],
    ['line planned_qty', { lines: [baseLine({ planned_qty: 401 })] }],
    ['line note', { lines: [baseLine({ note: SECRET_LINE_NOTE + '!' })] }],
    ['line window_code', { lines: [baseLine({ window_code: 'D45' })] }],
    ['line route_no', { lines: [baseLine({ route_no: '2' })] }]
  ];
  probes.forEach(function (p) {
    var c2 = build(p[1]).diagnose().sections['10_checksum'].checksum;
    if (c2 !== cs.checksum) moved.push(p[0]);
  });
  eq(moved.length, probes.length, 'J7 the checksum moves when ANY protected field changes (' + moved.length + '/' + probes.length + ')');
  // A field OUTSIDE the protected set must not move it, or the checksum is just "everything changed".
  var unprotected = build({ lines: [baseLine({ recommendation_reason: 'a different reason string' })] })
    .diagnose().sections['10_checksum'].checksum;
  eq(unprotected, cs.checksum, 'J8 ... and does NOT move for a field outside the protected set');
})();

// =============================================================================================================
// §L — NOTHING ELSE MOVED.
// =============================================================================================================
section('§L — NOTHING ELSE MOVED');
(function () {
  // No AI Plan, Submit Plan or Send Request path is reachable from this file.
  var stripped = TEMP_SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  ['handleSubmitShippingAllocationDrafts_', 'handleSubmitAllocationDraftsToShippingPlans_',
    'shippingPlanCommitFromLines_', 'handleRequestOrderSend', 'aplGenerate', 'handleUpsertShippingAllocationDraftAtomic_',
    'sadUpsertDraftHeaderCore_', 'sadSchemaGenerationColumns_', 'sadSupportedSchemaVersions_', 'sadResolveHeaderSchema_',
  'sadDraftsSchemaReason_', 'sadAtomicUpsertCore_', 'sadSubmitToShippingPlansCore_'].forEach(function (n) {
    ok(!new RegExp(n + '\\s*\\(').test(stripped), 'L1 no call site for ' + n);
  });

  // Transport, endpoint and retry contracts are untouched.
  var TP = readRepo('assets/js/api/km-transport.js');
  ok(/function readUrl\(/.test(TP) && /READ_URL_MAX/.test(TP), 'L2 the canonical GET read and its URL bound are intact');
  ok(/REDIRECT_TARGET_NOT_FOUND/.test(TP), 'L3 bounded redirect recovery is intact');
  var DB = readRepo('assets/js/api/operation-system-db-api.js');
  eq((DB.match(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1],
  (readGs('63_api_v1_system_health.gs').match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1],
  'L4 the client action-contract pin AGREES with the deployment');
  ok(/'LEGACY_ROUTE_RECONCILIATION_REQUIRED'/.test(DB), 'L5 the client still recognises the legacy refusal as typed');

  // FB-4D / FB-4E contracts that this round must not disturb.
  ok(/function sadScanDuplicateLinePks_/.test(SAD_SRC), 'L6 the FB-4D pre-write duplicate-PK gate is intact');
  // F1-7N-FB-4F-B3 - RESTATED AS A FLOOR, which is what it always meant. FB-4F-A was a read-only diagnosis
  // round and changed no writer, so it pinned 16_'s stamp at FB-4D. But that is an equality with "now": B3 is
  // the round that legitimately teaches the writer the new columns, and this line then failed while describing
  // the correct state - the same failure the map suites hit five rounds running before mapTokenAtOrAfter.
  //
  // The durable statement is that FB-4F-A ITSELF changed no writer, so 16_ must be at FB-4D OR LATER, never
  // EARLIER. That still catches the defect this was written for (a diagnosis round quietly editing the writer,
  // which would have to move the stamp backwards or leave it behind) and it stays true afterwards.
  var _l7 = (SAD_SRC.match(/var SAD_BUILD_VERSION_ = '([^']+)';/) || [])[1] || '';
  // F1-7N-FB-4G-A0-R1 — the stamp order moved to _release-order.js (four suites held their own copy).
  var _l7Order = require(require('path').join(__dirname, '_release-order.js')).OWNER_STAMPS;
  ok(_l7Order.indexOf(_l7) >= _l7Order.indexOf('F1-7N-FB-4D'),
    'L7 16_ is at the FB-4D floor or later — FB-4F-A itself changed no writer (' + _l7 + ')');
  ok(/var EPC_BUILD_VERSION_ = 'F1-7N-FB-4E-R2'/.test(EPC_SRC), 'L8 68_ did not change this round either');
  var ROUTER = readGs('01_router.gs');
  // F1-7N-FC-1A-R1 — DERIVED. FB-4F-A was a diagnosis round that changed no router, which is what this
  // asserted; R1 adds a dispatch and moves the stamp. The durable property is the PAIR: whatever the router
  // declares, the deployment manifest expects exactly that. A declaration and an expectation that drift apart
  // are the two halves of a partial sync, and either alone is the bug.
  var _l9Expect = ((readGs('63_api_v1_system_health.gs').match(/\{ file: '01_router\.gs',[^}]*expected: '([^']+)'/) || [])[1]) || '(none)';
  ok(new RegExp("var RTR_BUILD_VERSION_ = '" + _l9Expect + "'").test(ROUTER),
    'L9 the router declares exactly the build its manifest expects (' + _l9Expect + ')');
  ok(/rtrEmitHandlerResult_\(_rtrRead\[action\]\(_parsed\.body\)\)/.test(ROUTER),
    'L10 the R4B-R2 GET dispatch fix is preserved');
  var IR = readRepo('assets/js/pages/inventory-replenishment.js');
  ok(/function _irScrollRowHtml_/.test(IR) && /_irVerifyRenderedRows_\(data\.length\)/.test(IR),
    'L11 the R4B-R3 render closure is preserved');
  var MODAL = readRepo('assets/js/utils/scope-select-modal.js');
  ok(/var _dom = null, _state = null, _openToken = 0;/.test(MODAL), 'L12 the R4B-R3 scope-modal fix is preserved');
})();

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
