// F1-7N-FB-4D — LIVE CLOSURE: Site Inventory Add Route → DB → Submit, and the SKU Details read path.
//
// This suite exists because two live failures survived rounds that were reported as fixed, so nothing here is
// allowed to be a structural assertion where an execution is possible. The REAL shipped functions run:
//
//   · 68_'s duplicate diagnostic, against the EXACT three-row live fixture from §A1 and against the cleaned
//     single survivor, plus the four ways a scan can come back empty for a reason that is not "the table is clean".
//   · 16_'s REAL header and line writers (sadUpsertDraftHeaderCore_ / sadUpsertLinesKeyedCore_) driven by the
//     REAL client route grouping (IRDraft.preflightRouteGroups) against an in-memory sheet — Route A 800 and
//     Route B 400, repeat saves, and the corrupted table.
//   · 16_'s REAL scoped readback (handleGetShippingAllocationDraftWorkspace_) for hydrate.
//   · 16_'s REAL Submit owner (sadSubmitToShippingPlansCore_) delegating to 11_'s REAL shipping_plans writer
//     (shippingPlanCommitFromLines_) — commit, grouping, exact quantities, idempotent replay, and the stale
//     selector refusal. No suite had ever EXECUTED this chain before; every prior assertion on it was structural.
//   · the REAL sku-details.js page, loaded whole into a browser-shaped sandbox, against a REAL success envelope
//     and against a render-model exception.
//   · the REAL API client against a fetch spy for the transport/method/action claims.
//
// WHAT THE DIAGNOSIS ACTUALLY FOUND (recorded here so the suite cannot drift from it):
//   §A2 the FB-4B Addendum WAS in the source and was NEVER DELIVERED. b16d3c9 rewrote 674 lines of
//       inventory-replenishment.js and 146 of inventory-compat.js and did not touch index.html at all, so both
//       files stayed pinned at ?v=…20260822 — before the addendum AND before the primary-key fix. A returning
//       browser served the appending code from cache. That is what the three 11:18/11:19/11:20 rows are.
//   §C  "scanned=0" was the count of rows that SURVIVED the scope filter, printed under a name that reads as
//       "rows I looked at". Opposite conclusions, one label.
//   §D  SKU Details' server read set is a strict SUBSET of Regional's and both send the same action through the
//       same builder and transport, so the two pages cannot differ in request, transport or handler. What they
//       DID differ in is the client: the render ran INSIDE the read's rejection handler, so a view exception was
//       reported as "SKU Details read error" and destroyed an intact read model.
//
// Known regression baseline (pre-existing, unrelated): gap-job-done-notice-f1-small-r1,
// order-planning-monthly-projection-consumer-f1-4b-fm3d, replen-header-toggle, supply-planning-route-inventory.
//
// Run: node assets/tests/live-closure-site-inventory-and-sku-read-f1-7n-fb-4d.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var ' + name + '\\s*=').exec(src); if (!m) throw new Error('not found: ' + name);
  var i = src.indexOf('=', m.index) + 1;
  while (' \t\r\n'.indexOf(src[i]) >= 0) i++;
  if (src[i] === '{' || src[i] === '[') {
    var open = src[i], close = open === '{' ? '}' : ']', d = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === open) d++; else if (src[j] === close) { d--; if (d === 0) break; } }
    return src.slice(m.index, j + 1) + ';';
  }
  return src.slice(m.index, src.indexOf(';', i) + 1);
}
function allFnNames(src) {
  var out = [], re = /^function ([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm, m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

var G01 = read('assets/specs/active/apps-script/01_router.gs');
var G11 = read('assets/specs/active/apps-script/11_shipping_plan_handlers.gs');
var G13 = read('assets/specs/active/apps-script/13_procurement_handlers.gs');
var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G59 = read('assets/specs/active/apps-script/59_api_v1_sku_details_workspace.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var G68 = read('assets/specs/active/apps-script/68_api_v1_execution_plan_conflict_diagnostic.gs');
var IR = read('assets/js/pages/inventory-replenishment.js');
var CMP = read('assets/js/utils/inventory-compat.js');
var SKD = read('assets/js/pages/sku-details.js');
var SRD = read('assets/js/pages/sku-regional-details.js');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var INDEX = read('index.html');
var G16C = code(G16), IRC = code(IR), SKDC = code(SKD), SRDC = code(SRD), G68C = code(G68);

var IRDraft = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js')).IRDraft;

// ================================================================================================================
section('§A2 — DID THE FB-4B ADDENDUM REACH THE LIVE BROWSER?');
// ================================================================================================================
// The implementation IS in the source — this is not a missing-code failure.
ok(IRC.indexOf('_irPersistOneRouteGroup_') !== -1, 'A2.1 the multi-route persister exists in the shipped page');
ok(IRC.indexOf('preflightRouteGroups') !== -1, 'A2.2 and the batch pre-flight it depends on');
ok(typeof IRDraft.preflightRouteGroups === 'function', 'A2.3 and the route-grouping authority is really exported');
ok(G16C.indexOf('LINE_PRIMARY_KEY_ALREADY_EXISTS') !== -1, 'A2.4 the server pre-insert primary-key assertion exists');
// …so the failure is DELIVERY. Every changed frontend file must carry a cache-bust token that MOVED.
var STALE_2026_08_22 = /(inventory-replenishment\.js|inventory-compat\.js)\?v=[^"']*20260822/;
ok(!STALE_2026_08_22.test(INDEX),
  'A2.5 neither Site Inventory file is still pinned at a pre-addendum 20260822 token (THE delivery defect)');
var _fb4dTokens = [];
['assets/js/pages/inventory-replenishment.js', 'assets/js/utils/inventory-compat.js',
  'assets/js/pages/sku-details.js', 'assets/js/api/operation-system-db-api.js'].forEach(function (f) {
  var m = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([^"\']+)').exec(INDEX);
  ok(!!m, 'A2.6 ' + f + ' has a cache-bust token at all');
  // F1-7N-FB-4E — RESTATED AS THE RULE THE COMMENT ABOVE ALREADY STATES: the token must have MOVED off the
  // pre-addendum values, and the co-deployed set must SHARE one token. Pinning the literal FB-4D string made
  // every legitimate later bump look like a regression — which is the same trap that let the FB-4B addendum
  // ship without a cache-bust in the first place, now from the opposite direction.
  var STALE_TOKENS_4D = ['r6a1-request-send-20260822', 'donenotice-20260811', 'catseries-20260820',
    'whmoreopts-20260820', 'sku-read-path-20260826'];
  ok(!!m && STALE_TOKENS_4D.indexOf(m[1]) < 0, 'A2.7 ' + f + ' carries a token that MOVED past the pre-FB-4D values (' + (m ? m[1] : 'none') + ')');
  _fb4dTokens.push(m ? m[1] : null);
});
// The other half of the delivery rule: this set is co-deployed, so a token that moves for one of them and not
// the others can still ship a half-updated page — which is the failure mode A2.5 exists for.
ok(_fb4dTokens.length === 4 && _fb4dTokens.every(function (v) { return v === _fb4dTokens[0]; }),
  'A2.8 and all four co-deployed files share ONE token, so they cannot deploy out of step');
// no other cache-busting mechanism exists, so the token IS the delivery contract
ok(!fs.existsSync(path.join(ROOT, 'sw.js')) && !fs.existsSync(path.join(ROOT, 'service-worker.js')),
  'A2.8 there is no service worker, so a stale token cannot be compensated elsewhere');

// ================================================================================================================
section('§C — the duplicate diagnostic, against the EXACT §A1 live fixture');
// ================================================================================================================
var LINE_HEADERS = ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku', 'window_code',
  'window_start_date', 'window_end_date', 'required_by_date', 'planned_qty', 'recommended_qty',
  'units_per_carton', 'route_no', 'source_warehouse_id', 'source_warehouse_code_snapshot', 'line_status',
  'override_reason', 'note', 'created_at', 'updated_at'];
function liveLineRow(created) {
  return ['SADL-K2-16F4E4F9', 'SADH-K2-E7AF9242', 'CO1100-R', '', 'W1', '', '', '', 800, '', 12, 1,
    'WH-CN-YX', 'CN-YX', 'draft', '', '', created, created];
}
var LIVE_THREE = [liveLineRow('2026-08-26 11:18:11'), liveLineRow('2026-08-26 11:19:53'), liveLineRow('2026-08-26 11:20:07')];
var LIVE_ONE = [liveLineRow('2026-08-26 11:18:11')];

function roSheet(headers, rows) {
  return { getDataRange: function () { return { getValues: function () { return [headers].concat(rows); } }; } };
}
function dupRun(lineRows, draftRows, lineHeaders) {
  var tabs = {
    shipping_allocation_draft_lines: roSheet(lineHeaders || LINE_HEADERS, lineRows),
    shipping_allocation_drafts: roSheet(['allocation_draft_id', 'status'],
      draftRows === undefined ? [['SADH-K2-E7AF9242', 'active']] : draftRows)
  };
  var sandbox = {
    console: console, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
    Date: Date, isFinite: isFinite, RegExp: RegExp, Error: Error,
    Logger: { log: function () {} },
    SpreadsheetApp: { openById: function () { return { getSheetByName: function (n) { return tabs[n] || null; } }; } },
    prodExpectedDbId_: function () { return 'DB-TEST'; }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(G68, sandbox, { filename: '68_.gs' });
  return sandbox.handleExecutionPlanDuplicateLineDiagnostic_({
    payload: { allocation_draft_id: 'SADH-K2-E7AF9242', allocation_draft_line_id: '', sku: '' } });
}

// FIXTURE 1 — the three live rows, before the user's manual cleanup.
var d1 = dupRun(LIVE_THREE).data;
eq(d1.rows_matching_scope, 3, 'C1 matching rows = 3');
eq(d1.duplicate_group_count, 1, 'C1 duplicate groups = 1');
eq(d1.byte_identical_group_count, 1, 'C1 byte-identical = 1');
eq(d1.physical_rows_scanned, 3, 'C1 physical rows scanned = 3');
eq(d1.matched_sheet_rows, [2, 3, 4], 'C1 and the matched sheet rows are NAMED');
eq(d1.scope_mismatch, null, 'C1 no scope mismatch — rows really did match');
eq(d1.duplicate_groups[0].proposed_survivor_sheet_row, 2, 'C1 the survivor is the FIRST physical row (11:18:11)');
eq(d1.duplicate_groups[0].proposed_deleted_sheet_rows, [4, 3], 'C1 and the latter two are proposed for deletion, highest first');
eq(d1.zero_write_proof.rows_deleted, 0, 'C1 the diagnostic itself deleted nothing');
eq(d1.read_only, true, 'C1 and declares itself read-only');

// FIXTURE 2 — after the user keeps the first row.
var d2 = dupRun(LIVE_ONE).data;
eq(d2.rows_matching_scope, 1, 'C2 matching rows = 1');
eq(d2.duplicate_group_count, 0, 'C2 duplicate groups = 0');
eq(d2.scope_mismatch, null, 'C2 a genuinely clean result carries NO mismatch');
eq(Number(LIVE_ONE[0][8]), 800, 'C2 surviving qty = 800');
ok(/No duplicate primary key exists in the scanned scope/.test(d2.next_action),
  'C2 and next_action says the scan actually compared rows');

// §C — the four ways an empty scan is NOT a clean table. Each must name DIAGNOSTIC_SCOPE_MISMATCH.
var badHeaders = LINE_HEADERS.slice(); badHeaders[1] = 'draft_id';
var d3 = dupRun(LIVE_THREE, undefined, badHeaders).data;
eq(d3.rows_matching_scope, 0, 'C3 a renamed filter column matches nothing');
eq(d3.physical_rows_scanned, 3, 'C3 while three physical rows WERE scanned — the old single "scanned" field said 0');
eq(d3.scope_mismatch.code, 'DIAGNOSTIC_SCOPE_MISMATCH', 'C3 so a DIAGNOSTIC_SCOPE_MISMATCH is mandatory');
eq(d3.scope_mismatch.reason, 'FILTER_COLUMN_MISSING', 'C3 naming the schema cause');
ok(!/No duplicate primary key exists/.test(d3.next_action), 'C3 and it is never phrased as a clean table');
eq(d3.scope_report.filter_columns_present.allocation_draft_id, false, 'C3 the missing column is reported explicitly');

var ZWSP = String.fromCharCode(0x200B);
var nearMiss = LIVE_THREE.map(function (r) { var c = r.slice(); c[1] = 'SADH-K2-E7AF' + ZWSP + '9242'; return c; });
var d4 = dupRun(nearMiss, [['SADH-K2-E7AF' + ZWSP + '9242', 'active']]).data;
eq(d4.rows_matching_scope, 0, 'C4 an invisible zero-width space defeats the exact scan');
eq(d4.scope_mismatch.reason, 'NEAR_MISS_ONLY', 'C4 reported as a NEAR MISS, not as absence');
eq(d4.scope_mismatch.near_miss_sheet_rows.allocation_draft_id, [2, 3, 4], 'C4 naming the rows that only look different');

var d5 = dupRun([]).data;
eq(d5.physical_rows_scanned, 0, 'C5 an empty tab scans zero rows');
eq(d5.scope_mismatch.reason, 'LINES_TABLE_EMPTY', 'C5 and is named as EMPTY, not as clean');

var d6 = dupRun([liveLineRow('x').map(function (v, i) { return i === 1 ? 'SADH-K2-OTHER' : v; })], []).data;
eq(d6.scope_mismatch.reason, 'TARGET_HEADER_NOT_FOUND', 'C6 a header absent from the drafts table is named');
eq(d6.scope_report.target_header.present, false, 'C6 and the header state says so independently');
// the §C invariant, stated as an invariant
[d3, d4, d5, d6].forEach(function (d, i) {
  ok(d.rows_matching_scope === 0 && !!d.scope_mismatch,
    'C7 INVARIANT: an empty narrowed scan ALWAYS carries a mismatch (case ' + (i + 1) + ')');
});
// still read-only after the repair
var dupDiagSrc = code(extractFn(G68, 'handleExecutionPlanDuplicateLineDiagnostic_')).replace(/'[^']*'/g, "''");
['deleteRow', 'setValue', 'appendRow', 'LockService', 'DriveApp', 'MailApp'].forEach(function (k) {
  ok(dupDiagSrc.indexOf(k) === -1, 'C8 the repaired diagnostic still contains no ' + k);
});

// ================================================================================================================
section('§B — the REAL 16_ writers, driven by the REAL client grouping');
// ================================================================================================================
function FakeSheet(headers) { this.rows = [headers.slice()]; }
FakeSheet.prototype.getLastColumn = function () { return this.rows[0].length; };
FakeSheet.prototype.getLastRow = function () { return this.rows.length; };
FakeSheet.prototype.getName = function () { return this.__name || ''; };
FakeSheet.prototype.insertRowsAfter = function () { return this; };
FakeSheet.prototype.getMaxColumns = function () { return this.rows[0].length; };
FakeSheet.prototype.getMaxRows = function () { return this.rows.length; };
FakeSheet.prototype.getDataRange = function () { var self = this; return { getValues: function () { return self.rows.map(function (r) { return r.slice(); }); } }; };
FakeSheet.prototype.appendRow = function (r) { this.rows.push(r.slice()); };
FakeSheet.prototype.deleteRow = function (n) { this.rows.splice(n - 1, 1); };
FakeSheet.prototype.getRange = function (row, col, nr, nc) {
  var self = this;
  return {
    getValues: function () {
      var out = [];
      for (var i = 0; i < (nr || 1); i++) { var line = [];
        for (var j = 0; j < (nc || 1); j++) line.push(self.rows[row - 1 + i][col - 1 + j]);
        out.push(line); }
      return out;
    },
    setValues: function (vals) {
      for (var i = 0; i < vals.length; i++) for (var j = 0; j < vals[i].length; j++) self.rows[row - 1 + i][col - 1 + j] = vals[i][j];
    },
    getValue: function () { return self.rows[row - 1][col - 1]; },
    setValue: function (v) { self.rows[row - 1][col - 1] = v; }
  };
};

// One sandbox carrying the REAL 16_ + 11_ + 13_ machinery over an in-memory spreadsheet.
function makeServer() {
  var SHEETS = {};
  var sb = {
    console: console, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
    Boolean: Boolean, Date: Date, isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    RegExp: RegExp, Error: Error, encodeURIComponent: encodeURIComponent,
    SHEETS: SHEETS,
    Logger: { log: function () {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: function () { return { getSheetByName: function (n) { return SHEETS[n] || null; },
        insertSheet: function (n) { SHEETS[n] = new FakeSheet([]); return SHEETS[n]; } }; },
      flush: function () {}
    },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    Utilities: { __uuidSeq: 0,
      getUuid: function () { this.__uuidSeq++; return 'UU' + ('0000' + this.__uuidSeq).slice(-4) + 'ABCD-0000-0000'; },
      formatDate: function () { return '2026-08-26'; } },
    Session: { getScriptTimeZone: function () { return 'Asia/Taipei'; } },
    FakeSheet: FakeSheet
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  // ---- the simulated environment (the ONLY thing not shipped) --------------------------------------------
  vm.runInContext([
    "var __now = '2026-08-26 09:00:00';",
    "function procurementTimestamp_() { return __now; }",
    "function shippingPlanTimestamp_() { return __now; }",
    "function shippingPlanToday_() { return '2026-08-26'; }",
    "function prodRequireSheet_(ss, name) { if (!SHEETS[name]) throw new Error('missing sheet ' + name); return SHEETS[name]; }",
    "function prodRequireColumns_() { return true; }",
    "function sheetEnsureColumns_(sh, cols) { return sh; }",
    "function prodExpectedDbId_() { return 'DB-TEST'; }",
    "function prodAssertDbTarget_() { return true; }",
    "var __lastJson = null;",
    "function jsonResponse_(o) { __lastJson = o; return o; }"
  ].join('\n'), sb, { filename: 'env.js' });
  // ---- REAL shipped code --------------------------------------------------------------------------------
  ['procurementEnsureSheet_', 'procurementAppendByHeader_', 'procurementFindRow_', 'procurementNum_']
    .forEach(function (fn) { try { vm.runInContext(extractFn(G13, fn), sb, { filename: '13_' + fn }); } catch (e) {} });
  // Every top-level constant these owners declare, discovered rather than hand-listed: a missing one shows up as
  // a ReferenceError deep inside the real writer, which would look like a production defect and is not one.
  function topLevelVars(src) {
    var out = [], re = /^var ([A-Za-z_][A-Za-z0-9_]*_)\s*=/gm, m;
    while ((m = re.exec(src))) out.push(m[1]);
    return out;
  }
  topLevelVars(G16).forEach(function (v) { try { vm.runInContext(extractVar(G16, v), sb, { filename: '16_' + v }); } catch (e) {} });
  topLevelVars(G11).forEach(function (v) { try { vm.runInContext(extractVar(G11, v), sb, { filename: '11_' + v }); } catch (e) {} });
  // ALL functions from 11_ then 16_ — extracting the whole owner is what makes this the production chain
  allFnNames(G11).forEach(function (fn) { try { vm.runInContext(extractFn(G11, fn), sb, { filename: '11_' + fn }); } catch (e) {} });
  allFnNames(G16).forEach(function (fn) { try { vm.runInContext(extractFn(G16, fn), sb, { filename: '16_' + fn }); } catch (e) {} });
  // the tables this chain touches
  vm.runInContext([
    "SHEETS['shipping_allocation_drafts'] = new FakeSheet(SHIPPING_ALLOCATION_DRAFTS_HEADERS_);",
    "SHEETS['shipping_allocation_draft_lines'] = new FakeSheet(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_);",
    "SHEETS['shipping_plans'] = new FakeSheet(SHIPPING_PLANS_HEADERS_);",
    "SHEETS['shipping_plan_lines'] = new FakeSheet(SHIPPING_PLAN_LINES_HEADERS_);"
  ].join('\n'), sb, { filename: 'tables.js' });
  return sb;
}

var SRV = makeServer();
ok(typeof SRV.sadUpsertDraftHeaderCore_ === 'function', 'B0.1 the REAL header writer loaded');
ok(typeof SRV.sadUpsertLinesKeyedCore_ === 'function', 'B0.2 the REAL line writer loaded');
ok(typeof SRV.sadScanDuplicateLinePks_ === 'function', 'B0.3 the FB-4D pre-write duplicate-PK gate loaded');
ok(typeof SRV.sadSubmitToShippingPlansCore_ === 'function', 'B0.4 the REAL Submit owner loaded');
ok(typeof SRV.shippingPlanCommitFromLines_ === 'function', 'B0.5 and 11_\'s REAL shipping_plans writer');
ok(typeof SRV.handleGetShippingAllocationDraftWorkspace_ === 'function', 'B0.6 and the REAL scoped readback');

// ---- the applied station + the two routes -----------------------------------------------------------------
var CTX = { planning_cycle: '2026-09', company: 'KM', country: 'US', marketplace: 'Amazon',
  source_page: 'inventory_replenishment' };
function routeA(qty) {
  return { sku: 'CO1100-R', planned_qty: qty, ship_from: 'WH-CN-YX', source_warehouse_id: 'WH-CN-YX',
    source_warehouse_code: 'CN-YX', destination: 'Amazon', destination_warehouse_id: '',
    destination_marketplace: 'Amazon', shipping_method: 'Sea', window_code: 'W1', units_per_carton: 12,
    allocation_draft_line_id: '', route_no: 1 };
}
function routeB(qty) {
  return { sku: 'CO1100-R', planned_qty: qty, ship_from: 'WH-CN-YX', source_warehouse_id: 'WH-CN-YX',
    source_warehouse_code: 'CN-YX', destination: 'Amazon', destination_warehouse_id: '',
    destination_marketplace: 'Amazon', shipping_method: 'Air', window_code: 'W1', units_per_carton: 12,
    allocation_draft_line_id: '', route_no: 2 };
}

// Drive the REAL server writers with the REAL client partition and the REAL client payload builders — the exact
// sequence _flushDraftDbPersist / _irPersistOneRouteGroup_ perform. Using the shipped builders matters: an Amazon
// logical destination is expressed as destination_marketplace with a BLANK destination warehouse id, and only the
// real builder gets that right. Hand-rolling the payload here would test a payload the page never sends.
function saveRoutes(srv, routes) {
  var pf = IRDraft.preflightRouteGroups(CTX, 'CO1100-R', routes);
  if (!pf.ok) return { ok: false, conflicts: pf.conflicts };
  var out = [];
  pf.groups.forEach(function (g) {
    var h = g.header || {};
    var headerPayload = IRDraft.buildDraftHeaderPayload({
      planning_cycle: CTX.planning_cycle, company: CTX.company, country: CTX.country, marketplace: CTX.marketplace,
      source_warehouse_id: h.recommended_source_warehouse_id,
      source_warehouse_code: h.source_warehouse_code,
      destination_warehouse_id: h.recommended_destination_warehouse_id,
      destination_warehouse_code: h.destination_warehouse_code,
      shipping_method: h.recommended_shipping_method,
      last_mile_delivery: h.recommended_last_mile_delivery || undefined,
      destination_marketplace: h.destination_marketplace || undefined
    });
    var hres = srv.sadUpsertDraftHeaderCore_(headerPayload);
    if (!hres.success) { out.push({ ok: false, stage: 'header', res: hres, groupKey: g.groupKey }); return; }
    var draftId = hres.data.allocation_draft_id;
    var lines = (g.routes || []).map(function (r) {
      return IRDraft.buildDraftLinePayload('CO1100-R', r, { scope: CTX, system: false });
    });
    var lres = srv.sadUpsertLinesKeyedCore_({ allocation_draft_id: draftId, lines: lines });
    out.push({ ok: !!lres.success, stage: 'lines', groupKey: g.groupKey, allocation_draft_id: draftId,
      headerRes: hres, res: lres });
  });
  return { ok: true, groups: pf.groups, outcomes: out };
}
function rowsOf(srv, tab) {
  var sh = srv.SHEETS[tab], hdr = sh.rows[0];
  return sh.rows.slice(1).map(function (r) { var o = {}; hdr.forEach(function (h, i) { if (h) o[h] = r[i]; }); return o; });
}

// ---- FIXTURE 3 — Route A 800, then + Add Route → Route B 400 ---------------------------------------------
section('§B/§A2.3 — Route A 800 then Add Route B 400');
var s3a = saveRoutes(SRV, [routeA(800)]);
ok(s3a.ok && s3a.outcomes[0].ok, 'B1 Route A saves');
var s3b = saveRoutes(SRV, [routeA(800), routeB(400)]);
ok(s3b.ok, 'B2 the batch pre-flight accepts two DIFFERENT route groups');
eq(s3b.groups.length, 2, 'B2 and partitions them into TWO shipment groups');
ok(s3b.outcomes.every(function (o) { return o.ok; }), 'B2 both groups persist');
var hdrs = rowsOf(SRV, 'shipping_allocation_drafts');
var lns = rowsOf(SRV, 'shipping_allocation_draft_lines');
eq(hdrs.length, 2, 'B3 exactly TWO shipping_allocation_drafts headers');
eq(lns.length, 2, 'B3 exactly TWO lines — one under each header');
var byHdr = {};
lns.forEach(function (l) { byHdr[l.allocation_draft_id] = (byHdr[l.allocation_draft_id] || 0) + 1; });
eq(Object.keys(byHdr).length, 2, 'B3 the two lines sit under two DISTINCT headers');
ok(Object.keys(byHdr).every(function (k) { return byHdr[k] === 1; }), 'B3 exactly one line under each');
eq(lns.map(function (l) { return Number(l.planned_qty); }).sort(function (a, b) { return a - b; }), [400, 800],
  'B4 the exact user quantities are preserved (800 and 400)');
var pks = lns.map(function (l) { return String(l.allocation_draft_line_id); });
eq(pks.length, new Set(pks).size, 'B5 and every physical primary key appears exactly once');
ok(pks.every(function (p) { return /^SADL-K2-/.test(p); }), 'B5 as canonical K2 line ids, not client-local ones');
ok(hdrs.every(function (h) { return /^SADH-K2-/.test(String(h.allocation_draft_id)); }), 'B5 under canonical K2 headers');

// §B3 — the response carries persisted_headers / persisted_lines WITH group keys
var lastLines = s3b.outcomes[s3b.outcomes.length - 1].res.data;
ok(Array.isArray(lastLines.persisted_headers) && lastLines.persisted_headers.length === 1,
  'B6 the line-write response returns persisted_headers');
ok(!!lastLines.persisted_headers[0].route_group_key, 'B6 carrying its route group key');
eq(lastLines.persisted_headers[0].group_id_matches_stored_id, true,
  'B6 and the stored id really is the deterministic id of that group');
ok(lastLines.persisted_lines.every(function (p) { return !!p.route_group_key && !!p.allocation_draft_id; }),
  'B6 and every persisted line names BOTH its header and its group key');
var hdrResp = s3b.outcomes[0].headerRes.data;
ok(!!hdrResp.route_group_key && Array.isArray(hdrResp.persisted_headers),
  'B6 the header-write response reports its own group identity too');

// ---- FIXTURE 4 — repeat saves update only their own route ------------------------------------------------
section('§A2.4/§A2.5 — re-saving Route A touches only Route A');
var beforeIds = rowsOf(SRV, 'shipping_allocation_draft_lines').map(function (l) { return l.allocation_draft_line_id; }).sort();
var s4 = saveRoutes(SRV, [routeA(850), routeB(400)]);
ok(s4.ok && s4.outcomes.every(function (o) { return o.ok; }), 'B7 the repeat save succeeds');
var lns4 = rowsOf(SRV, 'shipping_allocation_draft_lines');
eq(lns4.length, 2, 'B7 and appends NOTHING — still two physical rows');
eq(lns4.map(function (l) { return l.allocation_draft_line_id; }).sort(), beforeIds,
  'B7 with the SAME primary keys (an update, not an insert)');
var qtyByMethod = {};
rowsOf(SRV, 'shipping_allocation_drafts').forEach(function (h) {
  var mine = lns4.filter(function (l) { return l.allocation_draft_id === h.allocation_draft_id; });
  qtyByMethod[String(h.recommended_shipping_method)] = Number(mine[0].planned_qty);
});
eq(qtyByMethod.Sea, 850, 'B8 Route A (Sea) took the new quantity');
eq(qtyByMethod.Air, 400, 'B8 and Route B (Air) is untouched — only Route A changed');
var s4b = saveRoutes(SRV, [routeA(850), routeB(450)]);
ok(s4b.ok, 'B9 now re-save Route B only');
var lns4b = rowsOf(SRV, 'shipping_allocation_draft_lines');
eq(lns4b.length, 2, 'B9 still two rows');
var q2 = {};
rowsOf(SRV, 'shipping_allocation_drafts').forEach(function (h) {
  var mine = lns4b.filter(function (l) { return l.allocation_draft_id === h.allocation_draft_id; });
  q2[String(h.recommended_shipping_method)] = Number(mine[0].planned_qty);
});
eq([q2.Sea, q2.Air], [850, 450], 'B9 Route B took the new quantity and Route A is untouched');

// ---- FIXTURE 5 — reload / hydrate -----------------------------------------------------------------------
section('§A2.6 — reload hydrates BOTH routes with their persisted identities');
var hyd = SRV.handleGetShippingAllocationDraftWorkspace_({ planning_cycle: CTX.planning_cycle,
  company: CTX.company, country: CTX.country, marketplace: CTX.marketplace, source_page: CTX.source_page });
ok(hyd.success, 'B10 the scoped readback succeeds');
eq(hyd.data.status, 'ACTIVE_DRAFT_GROUP_FOUND', 'B10 and reports the multi-shipment-group state (not a conflict)');
eq((hyd.data.drafts || []).length, 2, 'B10 returning BOTH headers');
eq((hyd.data.lines || []).length, 2, 'B10 and both lines');
eq((hyd.data.duplicate_line_identities || []).length, 0, 'B10 with no duplicate identity');
ok((hyd.data.lines || []).every(function (l) { return /^SADL-K2-/.test(String(l.allocation_draft_line_id)) && /^SADH-K2-/.test(String(l.allocation_draft_id)); }),
  'B10 every hydrated line carries its persisted header AND line identity');

// ---- FIXTURE 1 (server side) — the corrupted table BLOCKS the write -------------------------------------
section('§B2 — a pre-existing duplicate primary key BLOCKS the write');
var CORRUPT = makeServer();
saveRoutes(CORRUPT, [routeA(800)]);
var corruptLines = CORRUPT.SHEETS['shipping_allocation_draft_lines'];
var dupSrcRow = corruptLines.rows[1].slice();
corruptLines.rows.push(dupSrcRow.slice());          // the live 11:19:53 row
corruptLines.rows.push(dupSrcRow.slice());          // the live 11:20:07 row
eq(corruptLines.rows.length - 1, 3, 'B11 the fixture now holds the three live physical rows');
var scan = CORRUPT.sadScanDuplicateLinePks_(corruptLines, String(dupSrcRow[1]), []);
eq(scan.ok, false, 'B12 the pre-write scan sees the duplicate');
eq(scan.duplicates[0].physical_rows, 3, 'B12 counting all three physical rows');
eq(scan.duplicates[0].in_affected_scope, true, 'B12 and marks it in the affected scope');
var blocked = saveRoutes(CORRUPT, [routeA(800)]);
var lineOutcome = blocked.outcomes[0];
eq(lineOutcome.ok, false, 'B13 so the save is REFUSED');
eq(lineOutcome.res.data.status, 'EXISTING_DUPLICATE_PRIMARY_KEY_IN_SCOPE', 'B13 with the named code');
eq(lineOutcome.res.zero_write, true, 'B13 declaring a zero write');
eq(CORRUPT.SHEETS['shipping_allocation_draft_lines'].rows.length - 1, 3,
  'B13 and the table is UNCHANGED — three rows in, three rows out');
ok(/duplicate diagnostic/.test(String(lineOutcome.res.error)), 'B13 pointing at the read-only diagnostic as the next action');

// ---- FIXTURE 6 — Submit through the REAL production owner, and replay ------------------------------------
section('§B5 — Submit through the REAL production Submit owner');
var SUB = makeServer();
saveRoutes(SUB, [routeA(800), routeB(400)]);
var draftIds = rowsOf(SUB, 'shipping_allocation_drafts').map(function (h) { return String(h.allocation_draft_id); });
eq(draftIds.length, 2, 'B14 two persisted headers to submit');
var APPLIED = { company: 'KM', country: 'US', marketplace: 'Amazon' };
var sub1 = SUB.sadSubmitToShippingPlansCore_(SUB.SpreadsheetApp.getActiveSpreadsheet(),
  { allocation_draft_ids: draftIds, execution_key: 'SB-FB4D000001', submitted_by: 'inventory-replenishment',
    applied_scope: APPLIED }, draftIds);
ok(sub1 && sub1.success, 'B15 Submit succeeds through the production owner' + (sub1 && !sub1.success ? ' [' + sub1.code + ' ' + sub1.error + ']' : ''));
var planLines = rowsOf(SUB, 'shipping_plan_lines');
var plans = rowsOf(SUB, 'shipping_plans');
eq(planLines.length, 2, 'B16 exactly ONE shipping_plan_lines row per submitted route/SKU identity');
eq(planLines.map(function (l) { return Number(l.requested_qty); }).sort(function (a, b) { return a - b; }), [400, 800],
  'B17 carrying the EXACT user quantities');
eq(planLines.reduce(function (a, l) { return a + Number(l.requested_qty); }, 0), 1200,
  'B17 which total 1,200 units');
ok(plans.length >= 1, 'B18 and a shipping_plans grouping was created');
ok(plans.every(function (p) { return String(p.country) === 'US' && String(p.marketplace) === 'Amazon'; }),
  'B18 for the ONE applied station only');
// idempotent replay
var planCountBefore = plans.length, lineCountBefore = planLines.length;
var sub2 = SUB.sadSubmitToShippingPlansCore_(SUB.SpreadsheetApp.getActiveSpreadsheet(),
  { allocation_draft_ids: draftIds, execution_key: 'SB-FB4D000001', submitted_by: 'inventory-replenishment',
    applied_scope: APPLIED }, draftIds);
eq(rowsOf(SUB, 'shipping_plan_lines').length, lineCountBefore, 'B19 a replay on the SAME execution key adds NO line');
eq(rowsOf(SUB, 'shipping_plans').length, planCountBefore, 'B19 and NO plan');
ok(sub2 && (sub2.success === true || String(sub2.code || '').length > 0), 'B19 and answers deterministically rather than throwing');

// stale selector — a station the drafts do not belong to
var STALE = makeServer();
saveRoutes(STALE, [routeA(800)]);
var staleIds = rowsOf(STALE, 'shipping_allocation_drafts').map(function (h) { return String(h.allocation_draft_id); });
var planRowsBefore = rowsOf(STALE, 'shipping_plans').length;
var stale = STALE.sadSubmitToShippingPlansCore_(STALE.SpreadsheetApp.getActiveSpreadsheet(),
  { allocation_draft_ids: staleIds, execution_key: 'SB-FB4D000002',
    applied_scope: { company: 'KM', country: 'CA', marketplace: 'Amazon' } }, staleIds);
eq(stale.success, false, 'B20 changing the selector without Search is refused');
eq(stale.code, 'APPLIED_SCOPE_MISMATCH', 'B20 by name');
eq(stale.zero_write, true, 'B20 with zero writes');
eq(rowsOf(STALE, 'shipping_plans').length, planRowsBefore, 'B20 and no plan row appeared');

// one Submit writer only
eq((G16C.match(/shippingPlanCommitFromLines_\(/g) || []).length, 1,
  'B21 there is exactly ONE call into the shipping_plans write authority — no second Submit writer');

// ================================================================================================================
section('§B1/§B4 — identities, and client adoption bound to the group key');
// ================================================================================================================
eq(SRV.SAD_K2_GROUP_DIMENSIONS_.length, 10, 'B22 the header identity is the frozen 10-dimension K2 key');
eq(SRV.SAD_LINE_IDENTITY_FIELDS_.join(','), 'sku,site_sku,window_code',
  'B23 and line identity within a header is the frozen natural key');
ok(/function _irAdoptPersistedLineIds_\(sku, draftId, persistedLines, wantGroupKey\)/.test(IRC),
  'B24 client adoption takes the route group key as an explicit scope');
ok(/pDraft !== wantDraft\) return;/.test(IRC), 'B24 a line naming another header is skipped');
ok(/pGroup !== wantGroup\) return;/.test(IRC), 'B24 and a line from another shipment group is skipped');
ok(/ROUTE_GROUP_KEY_MISMATCH/.test(IRC), 'B25 a header resolved into the wrong group is named');
ok(/ROUTE_GROUP_KEY_MISMATCH: 1/.test(IRC), 'B25 and classified INDETERMINATE, so Submit stays blocked');
['persisted', 'not_persisted', 'indeterminate'].forEach(function (st) {
  ok(IRC.indexOf("'" + st + "'") !== -1, 'B26 per-route status ' + st + ' exists');
});
ok(/_irHasUnsavedRoutes_\(\)/.test(IRC), 'B27 and Submit is gated on every route being proven persisted');
// never one scalar id for several routes
ok(/allocationDraftIds/.test(IRC), 'B28 the page tracks EVERY header it wrote, not one scalar');
// no client-local id may reach the canonical decision as authoritative
ok(/SADL-LOCAL-/.test(IRC), 'B29 client-local ids exist (placeholders)');
ok(/return isK2 \? sadK2DeterministicLineId_\(draftId, l\) : sadDeterministicLineId_\(draftId, l\);/.test(G16C),
  'B29 but a K2 draft ALWAYS mints the canonical id — a client id is a hint, never the identity');

// ================================================================================================================
section('§D — SKU Details and SKU Regional, traced separately');
// ================================================================================================================
// The server read set for Details is a strict SUBSET of Regional's, which is why the server cannot be the
// asymmetry: if Regional succeeds, Details' three base tables were read successfully too.
var tblSpec = extractVar(G59, 'SKD_WORKSPACE_TABLES_');
var baseTables = (tblSpec.match(/name: '([a-z_]+)'/g) || []).map(function (m) { return m.replace(/name: '|'/g, ''); });
var gated = (tblSpec.match(/include: '([a-z]+)'/g) || []);
eq(baseTables.length, 5, 'D1 the workspace owner declares five tables');
eq(gated.length, 2, 'D1 of which exactly two are include-gated');
ok(tblSpec.indexOf("{ name: 'sku_details',          requiredCols: ['sku'] }") !== -1,
  'D2 sku_details is unconditional for BOTH pages');
ok(/if \(spec\.include && !include\[spec\.include\]\) continue;/.test(code(G59)),
  'D2 and only the gated tables are skipped — the include ADDS tables, never removes any');

// both pages, one action, one builder, one transport
ok(/window\.KM\.api\.getWorkspace\('skuDetails', params\)/.test(SKDC), 'D3 Details calls getWorkspace(skuDetails)');
ok(/window\.KM\.api\.getWorkspace\('skuDetails', \{ include: \{ regional: true \} \}\)/.test(SRDC),
  'D3 Regional calls the same workspace with include.regional');
eq((code(read('assets/js/api/km-api-foundation.js')).match(/var SKU_DETAILS_ACTION = 'skuDetails\.workspace\.get';/g) || []).length, 1,
  'D3 resolving to ONE action constant');

// ---- the REAL page, cold mount, against a REAL success envelope -----------------------------------------
function mkEl(id) {
  return { id: id, innerHTML: '', hidden: false, style: { cssText: '' }, className: '',
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; }, toggle: function () {} },
    getAttribute: function () { return null; }, setAttribute: function () {}, removeAttribute: function () {},
    querySelectorAll: function () { return []; }, querySelector: function () { return null; },
    appendChild: function (c) { this.children.push(c); }, insertBefore: function (c) { this.children.unshift(c); },
    removeChild: function () {}, addEventListener: function () {}, children: [], childNodes: [],
    firstChild: null, value: '', textContent: '', dataset: {}, scrollLeft: 0, offsetWidth: 100,
    clientWidth: 100, closest: function () { return null; } };
}
function mountSkuDetails(envelope, opts) {
  opts = opts || {};
  var els = {}, requests = [];
  ['upcomingFixedBody', 'upcomingScrollBody', 'runningFixedBody', 'runningScrollBody', 'phasingFixedBody',
    'phasingScrollBody', 'closureFixedBody', 'closureScrollBody', 'sku-section', 'skuDetailsSection']
    .forEach(function (i) { els[i] = mkEl(i); });
  var created = {};
  var sb = {};
  sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.console = { log: function () {}, warn: function () {}, error: function () {} };
  sb.document = {
    getElementById: function (id) { return els[id] || created[id] || null; },
    querySelectorAll: function () { return []; }, querySelector: function () { return null; },
    createElement: function (t) { var e = mkEl('new-' + t); return e; },
    addEventListener: function () {}, removeEventListener: function () {},
    body: mkEl('body'), documentElement: mkEl('html'), readyState: 'complete'
  };
  // a created element becomes findable by id, the way appendChild/insertBefore make it in a real DOM
  var origInsert = els.skuDetailsSection.insertBefore;
  els.skuDetailsSection.insertBefore = function (c) { created[c.id] = c; return origInsert.call(this, c); };
  els.skuDetailsSection.appendChild = function (c) { created[c.id] = c; this.children.push(c); return c; };
  sb.location = { href: 'http://localhost/', search: '', hash: '', pathname: '/' };
  sb.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, length: 0, key: function () { return null; } };
  sb.sessionStorage = sb.localStorage;
  sb.navigator = { userAgent: 'probe', onLine: true };
  sb.setTimeout = function (f) { try { if (typeof f === 'function') f(); } catch (e) {} return 0; };
  sb.clearTimeout = function () {}; sb.setInterval = function () { return 0; }; sb.clearInterval = function () {};
  sb.requestAnimationFrame = function () { return 0; };
  sb.MutationObserver = function () { return { observe: function () {}, disconnect: function () {} }; };
  sb.ResizeObserver = sb.MutationObserver;
  sb.addEventListener = function () {}; sb.alert = function () {};
  sb.Promise = Promise; sb.JSON = JSON; sb.Object = Object; sb.Array = Array; sb.String = String;
  sb.Number = Number; sb.Boolean = Boolean; sb.Math = Math; sb.Date = Date; sb.Set = Set; sb.Map = Map;
  sb.RegExp = RegExp; sb.Error = Error; sb.TypeError = TypeError; sb.isFinite = isFinite; sb.isNaN = isNaN;
  sb.parseInt = parseInt; sb.parseFloat = parseFloat; sb.encodeURIComponent = encodeURIComponent;
  sb.decodeURIComponent = decodeURIComponent; sb.Intl = Intl;
  var loadStateMod = require(path.join(ROOT, 'assets/js/api/km-loading-state.js'));
  sb.KM = {
    api: {
      workspaceApiActive: function () { return true; },
      getWorkspace: function (name, params) {
        requests.push({ name: name, params: JSON.parse(JSON.stringify(params || {})) });
        var e = (typeof envelope === 'function') ? envelope(requests.length) : envelope;
        if (e && e.__reject) return Promise.reject(e.__reject);
        return Promise.resolve(e);
      }
    },
    DB: {}, loadState: loadStateMod.loadState || loadStateMod,
    lifecycle: { register: function () {} }
  };
  vm.createContext(sb);
  // REAL adapter + REAL normalizers from the shipped db-api
  function grab(src, marker) {
    var i = src.indexOf(marker); if (i < 0) throw new Error('marker: ' + marker);
    var d = 0, j = i;
    for (; j < src.length; j++) { var c = src[j]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(i, j + 2); } }
    throw new Error('unterminated');
  }
  var norm = ['normalizeSkuDetailsRecord', 'normalizeTaxReferralRateRecord', 'normalizeTaxRateComponentRecord',
    'normalizeMarketplaceSkuRecord', 'normalizeSkuRegionalDetailRecord'].map(function (n) {
    try { return grab(DBAPI, 'function ' + n + '('); } catch (e) { return 'function ' + n + '(r){ return r; }'; }
  }).join('\n');
  vm.runInContext(norm + '\n' + grab(DBAPI, 'window.KM.DB.adaptSkuDetailsWorkspace = function(data)'), sb, { filename: 'dbapi.js' });
  vm.runInContext(read('assets/js/utils/sku-overrides.js'), sb, { filename: 'sku-overrides.js' });
  vm.runInContext(SKD, sb, { filename: 'sku-details.js' });
  if (opts.breakRender) {
    // a REAL render-model exception: the lifecycle grouper throws while building the view
    vm.runInContext('getAllSkuDataWithOverrides = function () { throw new TypeError("cannot read properties of undefined (reading \'series\')"); };', sb);
    sb.getAllSkuDataWithOverrides = function () { var e = new TypeError("cannot read properties of undefined (reading 'series')"); throw e; };
  }
  vm.runInContext('_skLoadAndRender();', sb);
  return { sb: sb, els: els, created: created, requests: requests };
}

function okEnvelope(withRegional) {
  var data = {
    summary: { skuDetailsCount: 2, taxReferralRateCount: 0, taxRateComponentCount: 0 },
    skuDetails: [
      { sku: 'CO1100-R', product_name: 'A', lifecycle: 'Running in the Market', series: 'CO', category: 'Opener' },
      { sku: 'CO1200-B', product_name: 'B', lifecycle: 'Upcoming SKU', series: 'CO', category: 'Opener' }],
    taxReferralRates: [], taxRateComponents: [],
    capped: {}, counts: { skuDetails: 2 }
  };
  if (withRegional) { data.marketplaceSkus = [{ sku: 'CO1100-R' }]; data.skuRegionalDetails = [{ sku: 'CO1100-R', regional_detail_id: 'R1' }]; }
  return { success: true, data: data, errors: [],
    meta: { apiVersion: '1', source: 'workspace', action: 'skuDetails.workspace.get', workspace: 'skuDetails', requestId: 'REQ-S000001' } };
}

var m1 = mountSkuDetails(okEnvelope(false));
setTimeout(function () {
  eq(m1.requests.length, 1, 'D4 cold mount SKU Details → EXACTLY ONE request');
  eq(m1.requests[0].name, 'skuDetails', 'D4 to the skuDetails workspace');
  eq(m1.requests[0].params.include, undefined, 'D4 with NO regional include');
  var model = vm.runInContext('_skReadModel ? _skReadModel.skuDetails.length : -1', m1.sb);
  eq(model, 2, 'D5 the read model holds both rows');
  ok(/data-sku="CO1100-R"/.test(m1.els.runningFixedBody.innerHTML), 'D5 and the Running row RENDERS');
  ok(/data-sku="CO1200-B"/.test(m1.els.upcomingFixedBody.innerHTML), 'D5 as does the Upcoming row');
  var banner = m1.created['sku-read-error-banner'];
  ok(!banner || !banner.innerHTML, 'D5 with no error banner');

  // ---- a SUCCESSFUL response whose RENDER MODEL throws ------------------------------------------------
  var m2 = mountSkuDetails(okEnvelope(false), { breakRender: true });
  setTimeout(function () {
    eq(m2.requests.length, 1, 'D6 the request still happened exactly once');
    var b = m2.created['sku-read-error-banner'];
    ok(!!b && !!b.innerHTML, 'D6 a render-model exception RENDERS A BANNER');
    ok(/SKU Details view error/.test(b.innerHTML),
      'D6 labelled a VIEW error, not a read error — a successful response is not a transport failure');
    ok(/SKU_DETAILS_RENDER_MODEL_FAILED/.test(b.innerHTML), 'D6 with its own code');
    ok(/The data loaded successfully/.test(b.innerHTML), 'D6 stating that the data DID load');
    var kept = vm.runInContext('_skReadModel ? _skReadModel.skuDetails.length : -1', m2.sb);
    eq(kept, 2, 'D7 and the intact read model is KEPT, not destroyed — the old code nulled it');

    // ---- a genuine READ failure -------------------------------------------------------------------------
    var m3 = mountSkuDetails({ success: false, data: null, errors: [{ code: 'DEPLOYMENT_CONTRACT_MISMATCH',
      message: 'skuDetails.workspace.get is not deployed',
      details: { action: 'skuDetails.workspace.get', request_id: 'REQ-S000009', next_action: 'Publish a new deployment version.' } }],
      meta: { action: 'skuDetails.workspace.get' } });
    setTimeout(function () {
      var b3 = m3.created['sku-read-error-banner'];
      ok(!!b3 && /SKU Details read error/.test(b3.innerHTML), 'D8 a real read failure is labelled a READ error');
      ok(/DEPLOYMENT_CONTRACT_MISMATCH/.test(b3.innerHTML), 'D8 naming the code');
      ok(/skuDetails\.workspace\.get/.test(b3.innerHTML), 'D8 the action');
      ok(/REQ-S000009/.test(b3.innerHTML), 'D8 and the request id');
      ok(/Publish a new deployment version/.test(b3.innerHTML), 'D8 plus the next action');
      eq(vm.runInContext('_skReadModel', m3.sb), null, 'D8 and it FAILS CLOSED — no broad-cache fallback');
      // §D2 — the message is legible: full text in a wrapping host, not the frozen column that clipped it
      ok(/overflow-wrap:break-word/.test(String(b3.style.cssText)), 'D9 the banner host WRAPS rather than clipping');
      ok(!/class="fixed-row"[^>]*>SKU Details read error: /.test(m3.els.upcomingFixedBody.innerHTML),
        'D9 and the diagnosis no longer lives inside the narrow frozen column');
      ok(m3.els.runningFixedBody.innerHTML.length > 0 && m3.els.phasingFixedBody.innerHTML.length > 0,
        'D9 every section is told, so none is left silently blank while another shows an error');

      // ---- no fake empty success / no legacy fallback -----------------------------------------------------
      var m4 = mountSkuDetails({ success: true, data: null, errors: [] });
      setTimeout(function () {
        eq(vm.runInContext('_skReadModel', m4.sb), null, 'D10 a success envelope with no data is NOT treated as data');
        ok(!/data-sku=/.test(m4.els.runningFixedBody.innerHTML), 'D10 and renders no rows');
        ok(/if \(_skEffectiveWorkspace\(\) && !_skReadModel\) return;/.test(SKDC),
          'D11 in workspace mode a missing read model renders NOTHING — no broad cache, no mock arrays');
        ok(/window\.upcomingSkuData/.test(read('assets/js/utils/sku-overrides.js')),
          'D11 (the mock arrays that fallback would have reached really do exist)');
        report();
      }, 60);
    }, 60);
  }, 60);
}, 60);

// ================================================================================================================
function report() {
section('§D3 — page switching, retries, and structural read-path guarantees');
// ================================================================================================================
// Details → Regional → Details: three independent page models. The two pages hold SEPARATE read models and
// separate sequence counters, so one cannot make the other look successful.
ok(/var _skReadModel = null/.test(SKD) && /_srdReadModel/.test(SRD),
  'D12 the two pages hold SEPARATE read models — a Regional success cannot make Details look loaded');
ok(/var _skReadSeq = 0/.test(SKD) && /_srdReadSeq/.test(SRD), 'D12 and separate mount epochs');
ok(/if \(mySeq !== _skReadSeq\) return \{ __superseded: true, model: _skReadModel \};/.test(SKDC),
  'D13 a superseded Details read is ANNOUNCED');
ok(/if \(res && res\.__superseded\) return;/.test(SKDC), 'D13 and the caller stands down instead of rendering from null');
eq((SKDC.match(/if \(res && res\.__superseded\) return;/g) || []).length, 2,
  'D13 on BOTH the mount and the post-write reconcile paths');
// the read and the render are separate outcomes
ok(/\}, function \(err\) \{ _skRenderError_\(err, 'read'\); \}\);/.test(SKDC),
  'D14 the rejection handler is attached to the READ ONLY (two-arg then), not around the render');
ok(/catch \(e\) \{ _skRenderError_\(e, 'render'\); \}/.test(SKDC),
  'D14 and the render has its own catch');
ok(!/_skWorkspaceRefresh_\(\)\.then\(function \(\) \{ renderSkuDetailsTable\(\); \}\)\.catch/.test(SKDC),
  'D14 the old laundering shape is GONE');
// no broad cache, no legacy fallback in either read path
var skRead = [extractFn(SKD, '_skWorkspaceRefresh_'), extractFn(SKD, '_skLoadAndRender'), extractFn(SKD, '_skRenderError_')].join(' ;; ');
var srdRead = [extractFn(SRD, '_srdWorkspaceRefresh_')].join(' ;; ');
[['SKU Details', skRead], ['SKU Regional', srdRead]].forEach(function (pair) {
  ok(pair[1].indexOf('_opDbCache') === -1, 'D15 ' + pair[0] + ' read path never touches the broad _opDbCache');
  ok(pair[1].indexOf('loadOperationDb') === -1, 'D15 ' + pair[0] + ' never calls the whole-DB loader');
  ok(pair[1].indexOf('getOperationDb') === -1, 'D15 ' + pair[0] + ' never falls back to getOperationDb');
});

// ================================================================================================================
section('§D1 — the redirect claim, corrected to what is actually provable');
// ================================================================================================================
// A 302 is how Apps Script returns ANY POST response, so its existence proves nothing about which handler ran.
// What IS provable offline: the action doGet serves and the action doPost serves are disjoint for this action,
// so doGet's terminal message is positive evidence a GET reached /exec without the action.
var doGetSrc = G01.slice(G01.indexOf('function doGet('), G01.indexOf('function doPost('));
var doPostSrc = G01.slice(G01.indexOf('function doPost('));
ok(doPostSrc.indexOf("action === 'skuDetails.workspace.get'") !== -1, 'D16 doPost serves the SKU workspace action');
ok(doGetSrc.indexOf("action === 'skuDetails.workspace.get'") === -1, 'D16 doGet does NOT');
ok(/POST_ONLY_ACTION_ON_GET/.test(G01),
  'D17 so a downgraded GET that DOES carry the action is answered with POST_ONLY_ACTION_ON_GET');
ok(/received_method/.test(G01) && /attempted_action/.test(G01),
  'D17 naming the method actually received and the action attempted — evidence, not inference');
// the action travels in BOTH body and query, so a method downgrade cannot hide which action was meant
var FND = read('assets/js/api/km-api-foundation.js');
ok(/km_via=post/.test(FND), 'D18 the client marks a POST-originated request in the URL');
ok(/km_rid/.test(FND), 'D18 with a correlation id');
ok(/'action=' \+ encodeURIComponent/.test(FND) || /action=\$\{/.test(FND) || /[?&]action=/.test(FND),
  'D18 and the action in the query string as transport correlation');
// …but that is correlation, NOT the root-cause claim. The suite records the honest limit:
ok(true, 'D19 NOTE: a 302 alone is not evidence doGet ran — only doGet\'s own terminal answer is, and it is now self-identifying');

// ================================================================================================================
section('§E — the deployment contract can prove all four owners');
// ================================================================================================================
var stamps = extractVar(G63, 'SYS_MODULE_BUILD_STAMPS_');
[['16_shipping_allocation_handlers.gs', 'SAD_BUILD_VERSION_'],
 ['11_shipping_plan_handlers.gs', 'SP_BUILD_VERSION_'],
 ['01_router.gs', 'RTR_BUILD_VERSION_'],
 ['59_api_v1_sku_details_workspace.gs', 'SKD_BUILD_VERSION_']].forEach(function (pair) {
  ok(stamps.indexOf(pair[0]) !== -1, 'E1 the manifest probes ' + pair[0]);
  ok(stamps.indexOf(pair[1]) !== -1, 'E1 via ' + pair[1]);
});
// each stamp must match what its file really declares
eq((G16.match(/var SAD_BUILD_VERSION_ = '([^']+)';/) || [])[1], 'F1-7N-FB-4D', 'E2 16_ declares the FB-4D build (it changed)');
eq((G11.match(/var SP_BUILD_VERSION_ = '([^']+)';/) || [])[1], 'F1-7N-FA-4B2', 'E2 11_ declares its own last behavioural round (FB-4D did not change it)');
// F1-7N-FB-4E — 01_router.gs changed this round (it now states which handler answered), so pinning the FB-4C-R1
// literal would report a real, intended bump as a regression. The invariant that matters is the one the
// manifest enforces: a file's declared build must equal what SYS_MODULE_BUILD_STAMPS_ expects for it, because
// that disagreement is exactly what a partial Apps Script sync looks like.
var _rtrDeclared = (G01.match(/var RTR_BUILD_VERSION_ = '([^']+)';/) || [])[1];
var _rtrExpected = (G63.match(/'01_router\.gs', symbol: 'RTR_BUILD_VERSION_', expected: '([^']+)'/) || [])[1];
ok(!!_rtrDeclared && /^F1-7N-[A-Z]+-\d+[A-Z](-R\d+[A-Z]?\d*)?$/.test(_rtrDeclared), 'E2 01_ declares a real build (' + _rtrDeclared + ')');
eq(_rtrDeclared, _rtrExpected, 'E2 and it is exactly what the manifest expects for it — a partial sync stays visible');
eq((G59.match(/var SKD_BUILD_VERSION_ = '([^']+)';/) || [])[1], 'F1-7N-FB-4C-R1', 'E2 and 59_ — the SKU repair was client-side');
// F1-7N-FB-4E-R2 — STATED AS THE RULE THIS WAS DEFENDING. FB-4D pinned 68_'s stamp and the action
// contract as literals. R2 moved both, correctly and by those constants' own rules: 68_ changed because its
// duplicate diagnostic became REACHABLE for the first time and needed a scope guard on the routed path, and
// the action contract moved because that route is a new router ACTION. What FB-4D actually needed to defend is
// that 68_ is at FB-4D or later and that the two sides of the action contract AGREE — neither of which a
// frozen string can express.
var _epcNow = (G68.match(/var EPC_BUILD_VERSION_ = '([^']+)';/) || [])[1];
ok(/^F1-7N-FB-4[D-Z]/.test(_epcNow || ''), 'E2 68_ is at FB-4D or later, and moved with its behaviour (' + _epcNow + ')');
var _actNow = Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]);
var _actPin = Number((DBAPI.match(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]);
ok(_actNow >= 7, 'E3 the ACTION contract is at FB-4D level or later and never went backwards (v' + _actNow + ')');
eq(_actPin, _actNow, 'E3 and the client pins exactly it, so the two sides cannot drift apart');
// the client probes the write chain and the FB-4D gate symbol
['upsertShippingAllocationDraftLines', 'getShippingAllocationDraftWorkspace',
  'submitAllocationDraftsToShippingPlans', 'system.executionPlanDuplicateLineDiagnostic'].forEach(function (a) {
  ok(DBAPI.indexOf("'" + a + "'") !== -1, 'E4 the deployment probe covers ' + a);
});
ok(/'sadScanDuplicateLinePks_'/.test(DBAPI),
  'E5 and probes the FB-4D writer symbol the client now depends on');
ok(/'site-inventory': \[/.test(DBAPI), 'E6 Site Inventory has a page-scoped contract verdict');

// ================================================================================================================
section('§G — nothing this round writes, deletes, migrates or mutates Demo');
// ================================================================================================================
[['68_', G68], ['16_', G16], ['11_', G11]].forEach(function (pair) {
  var c = code(pair[1]).replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  ['MailApp', 'GmailApp', 'sendEmail', 'DriveApp', 'TEMP_demo_', 'DEMO4A_'].forEach(function (k) {
    ok(c.indexOf(k) === -1, 'G1 ' + pair[0] + ' contains no ' + k);
  });
});
// the TEMP diagnostics are still present and still gated
ok(/function TEMP_EXECUTION_PLAN_DUPLICATE_DIAGNOSE/.test(G68), 'G2 the TEMP duplicate diagnostic is NOT deleted');
ok(/function TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP/.test(G68), 'G2 nor the gated cleanup');
ok(/var TEMP_DUPFIX_MODE_ = 'DRY_RUN';/.test(G68), 'G2 which still defaults to DRY_RUN');
// no automatic cleanup was added to production
ok(code(extractFn(G16, 'sadUpsertLinesKeyedCore_')).indexOf('deleteRow') === -1,
  'G3 the writer removes no row — the duplicate is REFUSED, never auto-repaired');
// one writer, no fallback
eq((IRC.match(/function _irPersistOneRouteGroup_/g) || []).length, 1, 'G4 one route persister');
eq((G16C.match(/function sadUpsertLinesKeyedCore_/g) || []).length, 1, 'G4 one line writer');

console.log('\n----------------------------------------');
if (fail === 0) console.log('LIVE CLOSURE SITE INVENTORY + SKU READ (F1-7N-FB-4D): ' + pass + ' passed, 0 failed');
else console.log('LIVE CLOSURE SITE INVENTORY + SKU READ (F1-7N-FB-4D): ' + pass + ' passed, ' + fail + ' FAILED');
console.log('----------------------------------------');
process.exit(fail === 0 ? 0 : 1);
}
