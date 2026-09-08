// Kitchen Mama Operation System — F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1
// Override-audit provisioning (no lazy create) + the plan transition as ONE journalled, verified transaction.
// Run: node assets/tests/override-audit-provisioning-and-transaction-rollback-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r5-r1.test.js
//
// TWO DEFECTS R5 SHIPPED, BOTH MEASURED HERE RATHER THAN DESCRIBED.
//
// 1. THE LEDGER WAS SAID TO BE CREATED ON FIRST WRITE. It was not, and it could not have been.
//    `fcWriteEnsureSheet_` is `prodRequireSheet_` (29_), which THROWS SCHEMA_NOT_PROVISIONED on an absent
//    sheet — Production Safety RULE S0-3 moved every create behind an authorized migration DTO, and
//    production-safety-runtime-integration.test.js already asserts that no ensure-helper contains
//    `insertSheet`. R5's own suite could not see this because ITS SANDBOX STUB CREATED THE SHEET. The stub
//    was more capable than production, so the suite proved a property of the stub.
//
//    WHAT ACTUALLY HAPPENED WAS WORSE THAN A LAZY CREATE. The throw landed in 11_'s try/catch, was recorded
//    as `auditRows = -1`, and THE TRANSITION CONTINUED: a plan reached Pending Approval carrying an accepted
//    overage that no record anywhere justified. `audit_persisted: auditRows > 0` reported false, and nothing
//    acted on it.
//
// 2. "THE SAME SCRIPTLOCK" WAS OFFERED AS ATOMICITY. It is not. A lock is an ISOLATION property: it says no
//    other writer interleaves. It says nothing about what is left behind when the third write of five throws,
//    and above is exactly what was left behind. Only a journal can answer that, so the status cells, the
//    note breadcrumb and the ledger rows are now ONE journalled transaction with a VERIFIED rollback — and
//    when the rollback itself cannot be verified the answer is INDETERMINATE, never a tidy zero_write.
//
// EVERY FAILURE IN SECTION B IS INJECTED INTO THE SHEET, NOT MOCKED AT THE SEAM. The fake sheets throw on a
// named cell or on appendRow, the REAL `spUpdateShippingPlanStatusCore_` and the REAL 71_ run on top of them,
// and the assertions read the cells and the ledger back afterwards. A rollback claim that is not read back is
// the class of claim this round exists to delete.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
// LF-normalised at the boundary: the working copy is CRLF (core.autocrlf=true) and the committed blobs are LF,
// so a multi-line anchor would match on one and not the other — and a mutation whose target is absent is a
// mutant that lies.
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
var GS = 'assets/specs/active/apps-script/';
var NL = String.fromCharCode(10);

var STAMP = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1';
var PREV_STAMP = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5';
var RO = require('./_release-order.js');

var G71 = read(GS + '71_api_v1_factory_stock_guard.gs');
var G11 = read(GS + '11_shipping_plan_handlers.gs');
var G63 = read(GS + '63_api_v1_system_health.gs');
var G61 = read(GS + '61_api_v1_weekly_ai_plan.gs');
var G01 = read(GS + '01_router.gs');
var G29 = read(GS + '29_production_safety_adapter.gs');
var G14 = read(GS + '14_fc_write_handlers.gs');
var G21 = read(GS + '21_factory_inventory_handlers.gs');
var G66 = read(GS + '66_api_v1_request_order_send.gs');
var MIG = read('assets/tools/apps-script-migrations/TEMP_migrate_factory_stock_override_audit_r5.gs');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var KMSAFE = require('../js/core/supply-planning-production-safety.js');
var KMFSG = require('../js/core/supply-planning-factory-stock-guard.js');

var pass = 0, fail = 0;
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : ('  [' + JSON.stringify(extra) + ']'))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + NL + '  exp ' + E + NL + '  got ' + A); }
}
function section(t) { console.log(NL + '== ' + t + ' =='); }
var neg = { caught: 0, missed: 0 };
function mut(label, f) {
  var caught;
  try { caught = f() === true; }
  catch (e) { console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); fail++; return; }
  if (caught) { neg.caught++; console.log('neg  ' + label + ' — caught'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
// A swap that REFUSES to be a no-op: a mutant whose target is absent changes nothing and would be "caught" by
// an assertion that was never challenged.
function swap(src, find, repl) {
  if (src.indexOf(find) === -1) throw new Error('mutation target absent: ' + find.slice(0, 90));
  return src.split(find).join(repl);
}
function codeOnly(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
// Comments AND string literals removed, character by character, so an identifier named inside an
// operator-facing message cannot be read as a call to it.
function bareCode(src) {
  var t = String(src), out = '', q = null, line = false, block = false;
  for (var i = 0; i < t.length; i++) {
    var c = t[i], n = t[i + 1];
    if (line) { if (c === '\n') { line = false; out += c; } continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += ' '; continue; }
    out += c;
  }
  return out;
}
function extractFn(src, name) {
  var m = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var d = 0, q = null, line = false, block = false;
  for (var j = m.index + m[0].length - 1; j < src.length; j++) {
    var c = src[j], n = src[j + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; j++; } continue; }
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { line = true; j++; continue; }
    if (c === '/' && n === '*') { block = true; j++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return src.slice(m.index, j + 1); }
  }
  throw new Error('unterminated: ' + name);
}

// The 25 columns, PARSED FROM THE SHIPPED AUTHORITY. A fixture carrying its own copy is a fixture that can
// pass against a schema production refuses — the exact failure this round is correcting.
var AUDIT_HEADERS = (function () {
  var m = /var FSG_OVERRIDE_AUDIT_HEADERS_ = \[([\s\S]*?)\];/.exec(G71);
  if (!m) throw new Error('FSG_OVERRIDE_AUDIT_HEADERS_ not found in 71_');
  return m[1].split(',').map(function (t) { return t.replace(/[\s'"]/g, ''); }).filter(Boolean);
})();

// ================================================================================================================
// A FAKE SPREADSHEET THAT CAN FAIL ON DEMAND, AND LOGS EVERY WRITE.
//
// `fail` is a predicate consulted before each write: { setValue: fn(name,row,col,value), appendRow: fn(row),
// deleteRow: fn(row) } — returning a truthy string throws it. `writeLog` records every write that actually
// landed, which is how "zero mutation" is asserted as an absence of writes rather than as an unchanged cell.
// ================================================================================================================
function FakeSheet(name, headers) {
  this.name = name;
  this.rows = headers && headers.length ? [headers.slice()] : [];
  this.fail = {};
  this.writeLog = [];
}
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastColumn = function () { return this.rows.length ? this.rows[0].length : 0; };
FakeSheet.prototype.getLastRow = function () { return this.rows.length; };
FakeSheet.prototype.getDataRange = function () {
  var s = this;
  return { getValues: function () { return s.rows.map(function (r) { return r.slice(); }); } };
};
FakeSheet.prototype.appendRow = function (r) {
  var m = this.fail.appendRow && this.fail.appendRow(this.rows.length + 1);
  if (m) throw new Error(m);
  this.rows.push(r.slice());
  this.writeLog.push({ op: 'appendRow', row: this.rows.length });
};
FakeSheet.prototype.deleteRow = function (row) {
  var m = this.fail.deleteRow && this.fail.deleteRow(row);
  if (m) throw new Error(m);
  this.rows.splice(row - 1, 1);
  this.writeLog.push({ op: 'deleteRow', row: row });
};
FakeSheet.prototype.getRange = function (row, col, nr, nc) {
  var s = this;
  return {
    getValues: function () {
      var o = [];
      for (var i = 0; i < (nr || 1); i++) {
        var l = [];
        for (var j = 0; j < (nc || 1); j++) l.push((s.rows[row - 1 + i] || [])[col - 1 + j]);
        o.push(l);
      }
      return o;
    },
    getValue: function () { return (s.rows[row - 1] || [])[col - 1]; },
    setValue: function (v) {
      var hdr = s.rows.length ? String(s.rows[0][col - 1] || '') : '';
      var m = s.fail.setValue && s.fail.setValue(hdr, row, col, v);
      if (m) throw new Error(m);
      s.rows[row - 1][col - 1] = v;
      s.writeLog.push({ op: 'setValue', row: row, col: col, header: hdr, value: v });
    },
    setValues: function (vals) {
      var m = s.fail.setValues && s.fail.setValues(row, col);
      if (m) throw new Error(m);
      for (var i = 0; i < vals.length; i++) {
        if (!s.rows[row - 1 + i]) s.rows[row - 1 + i] = [];
        for (var j = 0; j < vals[i].length; j++) s.rows[row - 1 + i][col - 1 + j] = vals[i][j];
      }
      s.writeLog.push({ op: 'setValues', row: row, col: col, rows: vals.length });
    }
  };
};

// `audit` controls the ledger: undefined => provisioned exact + empty; 'absent' => no sheet at all;
// an array of header names => provisioned with exactly those headers.
function World(spec) {
  spec = spec || {};
  var S = {};
  function sheet(name, headers, rows) {
    S[name] = new FakeSheet(name, headers);
    (rows || []).forEach(function (r) {
      S[name].rows.push(headers.map(function (h) { return r[h] === undefined ? '' : r[h]; }));
    });
  }
  sheet('warehouses', ['warehouse_id', 'company', 'country', 'is_active', 'is_factory_warehouse'],
    spec.warehouses || [{ warehouse_id: 'FW-CN', company: 'ResUS', country: 'CN', is_active: true, is_factory_warehouse: true }]);
  // `factory_stock_absent: true` builds the world where availability CANNOT BE ESTABLISHED. An absent table
  // is a different fact from an empty one and the guard reports them differently, so the fixture must be
  // able to say which.
  if (spec.factory_stock_absent !== true) {
    sheet('factory_stock', ['warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock'],
      spec.factory_stock || [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 1000, fac_reserved_stock: 0 }]);
  }
  sheet('shipping_allocation_drafts', ['allocation_draft_id', 'company', 'country', 'marketplace', 'status',
    'recommended_source_warehouse_id', 'generation_type', 'generation_run_id'], spec.drafts || []);
  sheet('shipping_allocation_draft_lines', ['allocation_draft_line_id', 'allocation_draft_id', 'sku',
    'source_warehouse_id', 'planned_qty', 'line_status'], spec.draft_lines || []);
  sheet('shipping_plans', ['shipping_plan_id', 'parent_shipping_plan_id', 'company', 'country', 'marketplace',
    'source_warehouse_id', 'status', 'plan_version', 'submitted_by', 'submitted_at', 'approved_by', 'approved_at',
    'rejected_by', 'rejected_at', 'rejected_reason', 'cancelled_by', 'cancelled_at', 'note', 'updated_by',
    'updated_at', 'transferred_to_shipment_at', 'transferred_shipment_id'], spec.plans || []);
  sheet('shipping_plan_lines', ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'requested_qty'],
    spec.plan_lines || []);
  sheet('marketplaces', ['company', 'country', 'marketplace', 'allocation_priority'], spec.marketplaces || []);
  if (spec.audit !== 'absent') {
    sheet('factory_stock_override_audit', spec.audit || AUDIT_HEADERS, spec.audit_rows || []);
  }
  this.S = S;
  var self = this;
  this.inserted = [];
  this.ss = {
    getId: function () { return 'THE-CONFIGURED-DB'; },
    getSheetByName: function (n) { return S[n] || null; },
    insertSheet: function (n) { self.inserted.push(n); S[n] = new FakeSheet(n, []); return S[n]; }
  };
}
World.prototype.plan = function (id) {
  var v = this.S['shipping_plans'].getDataRange().getValues();
  var H = v[0].map(String);
  for (var r = 1; r < v.length; r++) {
    if (String(v[r][H.indexOf('shipping_plan_id')]) === id) {
      var o = {}; H.forEach(function (h, i) { o[h] = v[r][i]; }); return o;
    }
  }
  return null;
};
World.prototype.auditRows = function () {
  var sh = this.S['factory_stock_override_audit'];
  if (!sh || sh.rows.length < 2) return [];
  var H = sh.rows[0].map(String);
  return sh.rows.slice(1).map(function (r) { var o = {}; H.forEach(function (h, i) { o[h] = r[i]; }); return o; });
};
World.prototype.log = function (name) { return (this.S[name] || { writeLog: [] }).writeLog; };

var LAST_LOCK = null;
function seam(world, opts) {
  opts = opts || {};
  var sb = {
    console: console, JSON: JSON, String: String, Number: Number, Object: Object, Array: Array, Math: Math,
    Date: Date, isFinite: isFinite, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, Error: Error,
    RegExp: RegExp, Boolean: Boolean, eval: eval
  };
  sb.KMFSG = KMFSG;
  sb.KMSAFE = KMSAFE;
  sb.PRODUCTION_DB_SPREADSHEET_ID_ = 'THE-CONFIGURED-DB';
  sb.SpreadsheetApp = { getActiveSpreadsheet: function () { return world.ss; }, flush: function () {} };
  sb.Utilities = { formatDate: function () { return opts.now || '2026-09-08 10:00:00'; } };
  sb.Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
  sb.Logger = { log: function () {} };
  LAST_LOCK = { tried: 0, released: 0, available: opts.lockAvailable !== false };
  sb.LockService = { getScriptLock: function () {
    return { tryLock: function () { LAST_LOCK.tried++; return LAST_LOCK.available; },
      releaseLock: function () { LAST_LOCK.released++; } };
  } };
  var ctx = vm.createContext(sb);
  vm.runInContext('function jsonResponse_(o) { return o; }', ctx);
  // PRODUCTION SEMANTICS for the ensure-helpers: fcWriteEnsureSheet_ IS prodRequireSheet_, and it THROWS on an
  // absent sheet. The REAL 29_ adapter functions are loaded, so the migration DTO is validated by the shipped
  // validator rather than by a stand-in that would accept anything.
  vm.runInContext(extractFn(G29, 'prodSafetyBundle_'), ctx);
  vm.runInContext(extractFn(G29, 'prodExpectedDbId_'), ctx);
  vm.runInContext(extractFn(G29, 'prodSchemaError_'), ctx);
  vm.runInContext(extractFn(G29, 'prodAssertDbTarget_'), ctx);
  vm.runInContext(extractFn(G29, 'prodRequireSheet_'), ctx);
  vm.runInContext(extractFn(G29, 'prodRequireColumns_'), ctx);
  vm.runInContext(extractFn(G29, 'prodMigrateCreateSheet_'), ctx);
  vm.runInContext(extractFn(G14, 'fcWriteEnsureSheet_'), ctx);
  vm.runInContext(extractFn(G14, 'fcWriteEnsureColumns_'), ctx);
  vm.runInContext([
    'function gapTruthy_(v) { return /^(true|yes|1|y)$/i.test(String(v == null ? "" : v).trim()); }',
    'function gapCanonCountry_(c) { return String(c == null ? "" : c).trim().toUpperCase(); }',
    'function gapReadObjects_(ss, name) {',
    '  var sh = ss.getSheetByName(name);',
    '  if (!sh) throw new Error("sheet not found: " + name);',
    '  var v = sh.getDataRange().getValues();',
    '  if (!v || v.length < 2) return [];',
    '  var H = v[0].map(function (h) { return String(h).trim(); });',
    '  var out = [];',
    '  for (var r = 1; r < v.length; r++) { var o = {}; for (var c = 0; c < H.length; c++) o[H[c]] = v[r][c]; out.push(o); }',
    '  return out;',
    '}',
    'function aiplIsAiGenerated_(row) {',
    '  var gt = String((row && row.generation_type) || "").toLowerCase();',
    '  if (gt === "user_created") return false;',
    '  if (gt === "system_generated") return true;',
    '  return !!String((row && row.generation_run_id) || "");',
    '}'].join(NL), ctx);
  vm.runInContext(opts.g71 || G71, ctx, { filename: '71_' });
  vm.runInContext(extractFn(G11, 'shippingPlanTimestamp_'), ctx);
  vm.runInContext(extractFn(G11, 'spApprovalRecoveryState_'), ctx);
  vm.runInContext(extractFn(opts.g11 || G11, 'spUpdateShippingPlanStatusCore_'), ctx);
  vm.runInContext(extractFn(opts.g11 || G11, 'handleUpdateShippingPlanStatus_'), ctx);
  vm.runInContext('function createShipmentFromApprovedPlan_() { return { created: true, shipment_id: "SHP-X" }; }', ctx);
  vm.runInContext('function shipmentFindForPlan_() { return ""; }', ctx);
  if (opts.migration !== false) vm.runInContext(opts.mig || MIG, ctx, { filename: 'TEMP_MIG' });
  return {
    call: function (expr) { return vm.runInContext(expr, ctx); },
    transition: function (body) {
      return vm.runInContext('handleUpdateShippingPlanStatus_(' + JSON.stringify(body) + ')', ctx);
    }
  };
}

// One plan asking for `mine`, one other company holding `other`, `stock` on the shared pool.
function planWorld(mine, other, stock, opts) {
  opts = opts || {};
  var spec = {
    factory_stock: [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: stock, fac_reserved_stock: 0 }],
    plans: [{ shipping_plan_id: 'SP-ME', company: 'ResUS', country: 'US', marketplace: 'Amazon',
        source_warehouse_id: 'FW-CN', status: opts.status || 'draft', plan_version: 1, note: '' },
      { shipping_plan_id: 'SP-OTHER', company: 'OtherCo', country: 'JP', marketplace: 'Rakuten',
        source_warehouse_id: 'FW-CN', status: 'pending_approval', plan_version: 1 }],
    plan_lines: [{ shipping_plan_line_id: 'PL-ME', shipping_plan_id: 'SP-ME', sku: 'SKU1', requested_qty: mine },
      { shipping_plan_line_id: 'PL-OT', shipping_plan_id: 'SP-OTHER', sku: 'SKU1', requested_qty: other }],
    audit: opts.audit, audit_rows: opts.audit_rows
  };
  var w = new World(spec);
  return { w: w, s: seam(w, opts) };
}
// The challenge, then the confirmation built from it — the exact two-step the page performs.
function confirmOnce(W, extra) {
  var ch = W.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'vic' });
  var d = ch.data || {};
  var conf = { inventory_snapshot_fingerprint: d.inventory_snapshot_fingerprint,
    confirmation_token: d.confirmation_token, override_reason: 'cross_site_reallocation',
    override_note: 'covered by CN transfer', override_by: 'vic' };
  for (var k in (extra || {})) conf[k] = extra[k];
  return { challenge: ch, confirmation: conf,
    send: function () {
      return W.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'vic',
        overage_confirmation: conf });
    } };
}

// ================================================================================================================
section('A. §A — THE LEDGER IS PROVISIONED BY MIGRATION AND REQUIRED BY THE RUNTIME. NO LAZY CREATE.');
// ================================================================================================================

// A0 — the premise, read from the shipped code rather than assumed: the "ensure" helper cannot create.
ok(/return prodRequireSheet_\(ss, name, headers\);/.test(extractFn(G14, 'fcWriteEnsureSheet_')),
  'A0  fcWriteEnsureSheet_ IS prodRequireSheet_ …');
ok(/if \(!sheet\) throw prodSchemaError_\('SCHEMA_NOT_PROVISIONED'/.test(extractFn(G29, 'prodRequireSheet_')),
  'A0a … which THROWS SCHEMA_NOT_PROVISIONED on an absent sheet — R5 described a create that could not happen');
ok(!/insertSheet/.test(extractFn(G29, 'prodRequireSheet_')),
  'A0b and contains no insertSheet at all (RULE S0-3 moved creation behind a migration DTO)');

// A1 — THE RUNTIME SEAM HAS NO CREATE PATH LEFT. Comment-stripped: 71_'s header names the helper in order to
// record that it is not called, and a prose mention must not read as a call.
ok(!/fcWriteEnsureSheet_|fcWriteEnsureColumns_|insertSheet|prodMigrateCreateSheet_/.test(codeOnly(G71)),
  'A1  §A.4 71_ contains NO ensure-sheet, NO insertSheet and NO migration-create path');
ok(!/insertSheet|prodMigrateCreateSheet_/.test(codeOnly(G11)),
  'A1a and neither does 11_');
ok(/function fsgRequireOverrideAuditSheet_/.test(G71),
  'A1b what replaced it is a REQUIREMENT, named as one');

// A2 — an ABSENT ledger refuses a confirmed overage, with zero mutation of anything.
var A2 = planWorld(800, 300, 1000, { audit: 'absent' });
var a2 = confirmOnce(A2).send();
eq([a2.success, a2.code, a2.zero_write], [false, 'FACTORY_STOCK_OVERRIDE_AUDIT_SCHEMA_MISSING', true],
  'A2  §A.1 an absent ledger refuses the transition with the named code and zero_write');
eq(A2.w.plan('SP-ME').status, 'draft', 'A2a the plan is STILL A DRAFT — the status did not move');
eq(A2.w.log('shipping_plans'), [], 'A2b and not one cell of shipping_plans was written');
eq(A2.w.inserted, [], 'A2c nothing was inserted: the runtime created no sheet');
ok(!A2.w.S['factory_stock_override_audit'], 'A2d the ledger still does not exist');
eq(a2.data.schema.reason, 'TABLE_ABSENT', 'A2e and the refusal says WHY, so an operator knows what to provision');
eq(a2.data.overage_confirmed_but_unrecordable, true,
  'A2f stating the exact situation: a person confirmed, and it could not be recorded');

// A3 — a ledger MISSING ONE of the 25 columns is refused, and the column is named.
var A3 = planWorld(800, 300, 1000, { audit: AUDIT_HEADERS.filter(function (h) { return h !== 'overage_qty'; }) });
var a3 = confirmOnce(A3).send();
eq([a3.success, a3.code], [false, 'FACTORY_STOCK_OVERRIDE_AUDIT_SCHEMA_MISSING'],
  'A3  §A.1 a 24-column ledger is refused …');
eq(a3.data.schema.missing_headers, ['overage_qty'], 'A3a … naming the missing column');
eq(A3.w.plan('SP-ME').status, 'draft', 'A3b with the plan still a Draft');
eq(A3.w.auditRows().length, 0, 'A3c and no row written into the partial ledger');

// A4 — a REORDERED ledger is refused. The row is written by position from the live header, so a reordered
// header would file an override_reason under override_by and the ledger would be evidence of nothing.
var reordered = AUDIT_HEADERS.slice();
var t0 = reordered[12]; reordered[12] = reordered[13]; reordered[13] = t0;
var A4 = planWorld(800, 300, 1000, { audit: reordered });
var a4 = confirmOnce(A4).send();
eq([a4.success, a4.code, a4.data.schema.order_matches],
  [false, 'FACTORY_STOCK_OVERRIDE_AUDIT_SCHEMA_MISSING', false],
  'A4  §A.1 a reordered ledger is refused — the write is positional');
eq(A4.w.plan('SP-ME').status, 'draft', 'A4a with the plan still a Draft');

// A5 — an EXTRA trailing column is tolerated. Additive growth is this database's own contract, and refusing
// it would make the ledger the one table nobody may extend.
var A5 = planWorld(800, 300, 1000, { audit: AUDIT_HEADERS.concat(['some_future_column']) });
var a5 = confirmOnce(A5).send();
eq([a5.success, A5.w.plan('SP-ME').status], [true, 'pending_approval'],
  'A5  an EXTRA trailing column is accepted — additive growth is allowed, reordering is not');
eq(A5.w.auditRows().length, 1, 'A5a and the row is written');

// A6 — the provisioned, exact ledger: the happy path still works end to end.
var A6 = planWorld(800, 300, 1000);
var a6 = confirmOnce(A6).send();
eq([a6.success, A6.w.plan('SP-ME').status], [true, 'pending_approval'],
  'A6  a provisioned ledger admits the confirmation');
var a6o = a6.data.inventory_guard.override;
eq([a6o.audit_rows_appended, a6o.audit_persisted, a6o.audit_readback_verified], [1, true, true],
  'A6a and the audit is reported as PERSISTED because the row was read back by its own identity');

// ---- THE MIGRATION ITSELF ---------------------------------------------------------------------------------
// A7 — execute defaults to FALSE. Called with no options at all, against an absent table, it writes nothing.
var A7 = planWorld(800, 300, 1000, { audit: 'absent' });
var m7 = A7.s.call('tempFsoaMigrate_(SpreadsheetApp.getActiveSpreadsheet(), {})');
eq([m7.execute, m7.dry_run, m7.writes, m7.verdict], [false, true, 0, 'DRY_RUN_ONLY'],
  'A7  §A.3 execute defaults to FALSE and the default run writes nothing');
ok(!A7.w.S['factory_stock_override_audit'] && A7.w.inserted.length === 0,
  'A7a the table is still absent and nothing was inserted');

// A8 — the DRY RUN reports expected headers, existing headers, missing, extra and order mismatch.
var m8 = A7.s.call('TEMP_FSOA_R5_MIGRATE_DRY_RUN()');
eq([m8.writes, m8.dry_run, m8.verdict], [0, true, 'WILL_CREATE'], 'A8  §A.3 the DRY RUN writes 0 and plans a create');
eq(m8.expected_headers, AUDIT_HEADERS, 'A8a reporting the EXPECTED headers, read from the runtime authority');
eq([m8.exists, m8.existing_headers, m8.existing_column_count], [false, null, 0],
  'A8b and the existing state (absent)');
ok(Array.isArray(m8.missing_headers) && Array.isArray(m8.extra_headers) && 'order_matches' in m8,
  'A8c with missing / extra / order_matches all reported');
ok(/^fsoar5-1-[0-9a-f]{8}$/.test(String(m8.checksum)), 'A8d and an operation-specific confirmation checksum', m8.checksum);

// A9 — a blank reviewed checksum is a refusal. There is no default and no fallback.
var m9 = A7.s.call('TEMP_FSOA_R5_MIGRATE_COMMIT()');
eq([m9.verdict, m9.writes, m9.committed], ['REFUSED_NO_REVIEWED_CHECKSUM', 0, false],
  'A9  §A.3 a blank reviewed checksum refuses the commit and writes nothing');

// A10 — a WRONG / stale checksum is a refusal too, even with execute true.
var A10 = planWorld(800, 300, 1000, { audit: 'absent',
  mig: swap(MIG, "var TEMP_FSOA_R5_REVIEWED_CHECKSUM_ = '';",
    "var TEMP_FSOA_R5_REVIEWED_CHECKSUM_ = 'fsoar5-1-deadbeef';") });
var m10 = A10.s.call('TEMP_FSOA_R5_MIGRATE_COMMIT()');
eq([m10.verdict, m10.writes], ['REFUSED_STALE_OR_WRONG_CHECKSUM', 0],
  'A10 a checksum that does not match the live state authorises nothing');
ok(!A10.w.S['factory_stock_override_audit'], 'A10a and the table is still absent');

// A11 — the REAL commit: reviewed checksum pasted in, execute true. Additive create, then verified.
// 800 requested against 1000 with another company holding 300 — an OVERAGE, so the confirmation path is the
// one actually exercised. A world that fits would prove nothing about the ledger.
var A11 = planWorld(800, 300, 1000, { audit: 'absent' });
var A11w = A11.w, A11s = A11.s;
var live11 = A11s.call('TEMP_FSOA_R5_MIGRATE_DRY_RUN()').checksum;
var A11s2 = seam(A11w, { mig: swap(MIG, "var TEMP_FSOA_R5_REVIEWED_CHECKSUM_ = '';",
  "var TEMP_FSOA_R5_REVIEWED_CHECKSUM_ = '" + live11 + "';") });
var m11 = A11s2.call('TEMP_FSOA_R5_MIGRATE_COMMIT()');
eq([m11.verdict, m11.committed, m11.writes], ['COMMIT_VERIFIED', true, 1],
  'A11 §A.3 with the reviewed checksum and execute:true the create is committed and VERIFIED');
eq(A11w.S['factory_stock_override_audit'].rows[0], AUDIT_HEADERS,
  'A11a the ledger carries exactly the 25 columns in order');
eq(A11w.S['factory_stock_override_audit'].rows.length, 1, 'A11b and ZERO data rows — the create populates nothing');
eq(m11.migration_authorization.execute, true, 'A11c through a complete migration authorization DTO');
ok(/prodMigrateCreateSheet_\(ss, auth\.table, auth\.headers, dto\)/.test(MIG)
  && !/insertSheet/.test(codeOnly(MIG)),
  'A11d and the create goes through RULE S0-3, never a bare insertSheet');
// Exactly ONE sheet was touched. Every other table's write log is empty.
var touched11 = Object.keys(A11w.S).filter(function (n) { return A11w.S[n].writeLog.length > 0; });
eq(touched11, ['factory_stock_override_audit'], 'A11e §A.3 exactly ONE sheet was written — no other table moved');

// A12 — run it again: NO_ACTION. A migration that is idempotent cannot be run twice by mistake.
var m12 = A11s2.call('TEMP_FSOA_R5_MIGRATE_COMMIT()');
eq([m12.verdict, m12.writes, m12.committed], ['NO_ACTION', 0, false],
  'A12 §A.3 an already-exact ledger is NO_ACTION, not a second write');

// A13 — and the runtime now accepts a confirmation in that same world.
// The SAME plan, in the SAME world, whose confirmation was refused before the migration.
var a13pre = confirmOnce({ s: A11s2 });
eq([a13pre.challenge.success, a13pre.challenge.code],
  [false, 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED'],
  'A12a the plan is still a Draft and still over-committed, so it still gets the challenge');
var a13 = a13pre.send();
eq([a13.success, A11w.plan('SP-ME').status], [true, 'pending_approval'],
  'A13 and after the migration the SAME confirmation that was refused is accepted');

// A14 — a DIFFERENT existing header is REFUSED, not reshaped. A positional ledger with rows already in it
// cannot be reordered without deciding what those rows mean, and that is not a tool's decision.
var A14 = planWorld(800, 300, 1000, { audit: ['override_audit_id', 'something_else', 'created_at'] });
var m14 = A14.s.call('TEMP_FSOA_R5_MIGRATE_COMMIT()');
eq([m14.verdict, m14.writes], ['REFUSED_HEADER_MISMATCH', 0],
  'A14 §A.3 a foreign header is refused — this file never reorders or appends on an existing sheet');
ok(!/insertColumn|deleteColumn|deleteSheet|setName\(|deleteRow/.test(codeOnly(MIG)),
  'A14a and the migration contains no rename, drop, reorder or row delete of ANY table');

// A15 — the read-only validator, before and after, writes nothing.
var m15 = A7.s.call('TEMP_FSOA_R5_VALIDATE()');
eq([m15.writes, m15.dry_run, m15.runtime_would_accept], [0, true, false],
  'A15 §A.3 the validator is read-only and reports that the runtime would NOT accept an absent ledger');
ok(/undoes this migration completely/.test(String(m15.rollback))
  && /destroys the only record/.test(String(m15.rollback)),
  'A15a with a rollback statement that says both what it undoes and what deleting a USED ledger costs');
var m15b = A11s2.call('TEMP_FSOA_R5_VALIDATE()');
eq([m15b.writes, m15b.runtime_would_accept], [0, true], 'A15b and READY after the migration');

// A16 — NO PRODUCTION MIGRATION WAS RUN THIS ROUND, and the shipped file cannot run one as it stands.
eq((MIG.match(/var TEMP_FSOA_R5_REVIEWED_CHECKSUM_ = '';/g) || []).length, 1,
  'A16 §A.4/§F the shipped migration carries a BLANK reviewed checksum — it refuses to write until a human edits it');
ok(/opts\.execute === true/.test(MIG) && !/execute: true[\s\S]{0,40}\/\/ default/.test(MIG),
  'A16a and execute is only ever true when explicitly passed');
// The runtime validator agrees with the runtime, rather than carrying its own copy of the rule.
ok(/out\.runtime_would_accept = fsgRequireOverrideAuditSheet_\(ss\)\.ok;/.test(G71),
  'A16b §A.3 the 71_ validator answers with the RUNTIME predicate, so verdict and behaviour cannot disagree');

// ================================================================================================================
section('B. §B — ONE TRANSACTION, AND A ROLLBACK THAT IS READ BACK');
// ================================================================================================================
// The shape first, because §B asks whether this is the EXISTING journal vocabulary or a second one.
ok(/kind: 'cell', sheet: sheet, row: targetRow, col: c, prev: rowVals\[c\]/.test(G11),
  'B0  the journal entry is the SAME {kind,sheet,row,col,prev} shape 21_ already replays for 12_ and 13_');
ok(/j\.sheet\.getRange\(j\.row, j\.col \+ 1\)\.setValue\(j\.prev\)/.test(extractFn(G21, 'factoryStockRollbackJournal_')),
  'B0a as read from 21_ itself — this is not a new mechanism, it is the one that exists');
ok(/out\.unverified\.push/.test(extractFn(G71, 'fsgRollbackVerified_'))
  && /CELL_NOT_RESTORED/.test(G71) && /APPENDED_ROW_STILL_PRESENT/.test(G71),
  'B0b what is ADDED is verification: 21_ swallows its replay errors and this one reports them');

// B1 — THE STATUS WRITE FAILS. Nothing is left behind: no audit row, no cell, and the status is untouched.
var B1 = planWorld(800, 300, 1000);
var b1c = confirmOnce(B1);
var b1failed = 0;
B1.w.S['shipping_plans'].fail.setValue = function (header) {
  if (header === 'status' && b1failed === 0) { b1failed++; return 'INJECTED_STATUS_WRITE_FAILURE'; }
  return null;
};
var b1 = b1c.send();
eq([b1.success, b1.code, b1.zero_write], [false, 'OVERRIDE_COMMIT_FAILED_ROLLED_BACK', true],
  'B1  §B.1 the status write fails → the transaction is rolled back and VERIFIED');
eq(B1.w.plan('SP-ME').status, 'draft', 'B1a the status is unchanged');
eq(B1.w.auditRows().length, 0, 'B1b ZERO audit rows — the ledger was never reached');
eq(B1.w.log('factory_stock'), [], 'B1c and no reservation or stock cell was touched');
eq(b1.data.rollback.unverified, [], 'B1d with nothing left unverified');

// B2 — THE AUDIT APPEND FAILS. The status write had already landed; it is PUT BACK.
var B2 = planWorld(800, 300, 1000);
var b2c = confirmOnce(B2);
B2.w.S['factory_stock_override_audit'].fail.appendRow = function () { return 'INJECTED_AUDIT_APPEND_FAILURE'; };
var b2 = b2c.send();
eq([b2.success, b2.code, b2.zero_write], [false, 'OVERRIDE_COMMIT_FAILED_ROLLED_BACK', true],
  'B2  §B.2 the audit append fails → the STATUS is rolled back');
eq(B2.w.plan('SP-ME').status, 'draft',
  'B2a the plan is a Draft again — R5 would have left it in Pending Approval with no audit');
eq([B2.w.plan('SP-ME').submitted_by, B2.w.plan('SP-ME').submitted_at, B2.w.plan('SP-ME').updated_at],
  ['', '', ''], 'B2b and every other cell the transition had written is back to blank');
eq(B2.w.auditRows().length, 0, 'B2c with no audit row');
ok(/INJECTED_AUDIT_APPEND_FAILURE/.test(String(b2.data.cause)), 'B2d and the CAUSE is reported, not hidden');

// B3 — THE RESERVATION PARTICIPANT DOES NOT EXIST, and that is stated rather than assumed.
//
// §B.3 asks what happens when a reservation write fails. In this transaction there is no reservation write to
// fail: `FSTX_RESERVATION_OWNER_TYPE_ = 'shipment'` is the only reservation owner in the frozen model, a plan
// transition creates none, and draft/plan exposure is DERIVED from the rows. So the honest evidence is (a) that
// a successful confirmed override touches `factory_stock` zero times, and (b) that a LATE participant failing
// after both the status and the ledger DOES unwind both — which is the shape the question is really about.
var B3 = planWorld(800, 300, 1000);
var b3 = confirmOnce(B3).send();
eq([b3.success, B3.w.log('factory_stock')], [true, []],
  'B3  §B.3 a CONFIRMED override writes to factory_stock zero times — there is no reservation participant');
eq(B3.w.S['factory_stock'].rows[1], ['FW-CN', 'SKU1', 1000, 0],
  'B3a fac_current_stock and fac_reserved_stock are byte-unchanged by an accepted overage');
ok(!/fac_reserved_stock|factoryStockApplyDelta_|factoryStockAcquireReservationTx_/
  .test(codeOnly(extractFn(G11, 'spUpdateShippingPlanStatusCore_'))),
  'B3b and the transition core names no reservation write at all');

// B4 — A LATE PARTICIPANT FAILS: the note, written AFTER the ledger row. Both are unwound, and the appended
// audit row is DELETED — which is the part a cell-only rollback would miss.
var B4 = planWorld(800, 300, 1000);
var b4c = confirmOnce(B4);
var b4hits = 0;
B4.w.S['shipping_plans'].fail.setValue = function (header) {
  if (header === 'note' && b4hits === 0) { b4hits++; return 'INJECTED_NOTE_WRITE_FAILURE'; }
  return null;
};
var b4 = b4c.send();
eq([b4.success, b4.code, b4.zero_write], [false, 'OVERRIDE_COMMIT_FAILED_ROLLED_BACK', true],
  'B4  §B.4 the note write fails → every preceding mutation is rolled back');
eq(B4.w.plan('SP-ME').status, 'draft', 'B4a the status is back');
eq(B4.w.auditRows().length, 0, 'B4b and the AUDIT ROW THAT WAS ALREADY APPENDED IS GONE');
ok(B4.w.log('factory_stock_override_audit').some(function (e) { return e.op === 'deleteRow'; }),
  'B4c deleted, not merely absent — the rollback really issued the delete');
eq(b4.data.rollback.deleted, 1, 'B4d and reports the one row it removed');

// B5 — THE ROLLBACK ITSELF FAILS. This is the case that must never be reported as a clean refusal.
var B5 = planWorld(800, 300, 1000);
var b5c = confirmOnce(B5);
B5.w.S['shipping_plans'].fail.setValue = function (header) {
  return header === 'status' ? 'INJECTED_PERMANENT_STATUS_CELL_FAILURE' : null;
};
var b5 = b5c.send();
eq([b5.success, b5.code], [false, 'OVERRIDE_COMMIT_INDETERMINATE_ROLLBACK_UNVERIFIED'],
  'B5  §B.5 a rollback that cannot be verified is reported as INDETERMINATE');
eq([b5.zero_write, b5.indeterminate, b5.data.retry_safe], [false, true, false],
  'B5a it does NOT claim zero_write, it declares itself indeterminate, and it says retrying is not safe');
ok(b5.data.unverified.length >= 1 && /CELL_NOT_RESTORED|INJECTED_PERMANENT/.test(JSON.stringify(b5.data.unverified)),
  'B5b naming the exact cell it could not restore');
ok(/Inspect shipping_plans/.test(String(b5.data.next_action)),
  'B5c and telling the operator what to read before doing anything else');

// B6 — A REPLAYED CONFIRMATION. Neither the status, nor the ledger, nor anything else moves twice.
var B6 = planWorld(800, 300, 1000);
var b6c = confirmOnce(B6);
var b6first = b6c.send();
eq([b6first.success, B6.w.plan('SP-ME').status, B6.w.auditRows().length], [true, 'pending_approval', 1],
  'B6  the first confirmation is accepted and writes one audit row');
var b6again = b6c.send();
eq([b6again.success, B6.w.plan('SP-ME').status, B6.w.auditRows().length],
  [false, 'pending_approval', 1],
  'B6a §B.6 the SAME confirmation replayed is refused, and the ledger still holds exactly one row');
// And the append is idempotent BY IDENTITY, not merely unreachable — proven by calling it twice directly.
var B6b = planWorld(800, 300, 1000);
var b6bc = confirmOnce(B6b);
b6bc.send();
var reAppend = B6b.s.call('fsgAppendOverrideAudit_(SpreadsheetApp.getActiveSpreadsheet(), "shipping_plan", '
  + '"SP-ME", "submit", {}, ' + JSON.stringify({ inventory_override: true, override_reason: 'cross_site_reallocation',
    override_reason_label: 'x', override_note: '', override_by: 'vic', override_at: '2026-09-08 10:00:00',
    inventory_snapshot_fingerprint: B6b.w.auditRows()[0].inventory_snapshot_fingerprint,
    pools: [{ source_warehouse_id: 'FW-CN', sku: 'SKU1', available_qty_at_check: 1000, already_allocated_qty: 300,
      requested_plan_qty: 800, projected_total_qty: 1100, overage_qty: 100 }] }) + ', {})');
eq([reAppend.ok, reAppend.appended, reAppend.skipped_existing], [true, 0, 1],
  'B6b and the append itself is idempotent by row identity — a second call writes nothing');
eq(B6b.w.auditRows().length, 1, 'B6c so the ledger cannot acquire a duplicate row');

// B7 — A STALE FINGERPRINT. Zero mutation asserted as an ABSENCE OF WRITES, not as an unchanged cell.
var B7 = planWorld(800, 300, 1000);
B7.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'vic' });   // challenge only
var b7 = B7.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'vic',
  overage_confirmation: { inventory_snapshot_fingerprint: 'deadbeef', override_reason: 'other', override_by: 'vic' } });
eq([b7.success, b7.code, b7.zero_write], [false, 'FACTORY_STOCK_OVERAGE_SNAPSHOT_STALE', true],
  'B7  §B.7 a stale fingerprint is refused …');
eq([B7.w.log('shipping_plans'), B7.w.log('factory_stock_override_audit'), B7.w.log('factory_stock')],
  [[], [], []], 'B7a … with not a single write to ANY table');

// B8 — the boundary is explicit about what it does NOT roll back, and that is the frozen decision.
var core11 = extractFn(G11, 'spUpdateShippingPlanStatusCore_');
var iCatch = core11.indexOf('} catch (eTxn) {');
// THE CALL, not the name. 11_'s own Combined-Plan comment names createShipmentFromApprovedPlan_ hundreds of
// lines earlier to say that a child plan's transfer is blocked there, and an indexOf on the bare identifier
// finds that sentence first — reporting the shipment creation as INSIDE the transaction, which is false.
var iShip = core11.indexOf('createShipmentFromApprovedPlan_(ss, planId, approvedBy)');
ok(iCatch > 0 && iShip > iCatch,
  'B8  the Shipment Draft creation is OUTSIDE the transaction — an approval is kept even when the draft fails (§D)');
var iGateB = core11.indexOf('fsgGatePlanTransition_');
var iTry = core11.indexOf('  try {');
ok(iGateB > 0 && iTry > iGateB,
  'B8a and the GATE still runs before the transaction opens, so a refusal never enters it');

// ================================================================================================================
section('C. §C — THE CORRECTED SYNC SET, MEASURED FROM THE TREE');
// ================================================================================================================
// The previous report said "5 files" and listed six. The set is not a matter of memory: it is what changed.
// THE ROUND'S BASELINE, DERIVED. The commit that first put this stamp into 63_ is the start of the round;
// its parent is the release the operator is upgrading FROM. Everything since is what has to be synced,
// working-tree edits included.
function git(cmd) {
  try { return cp.execSync('git ' + cmd, { cwd: ROOT, encoding: 'utf8' }); } catch (e) { return null; }
}
var REL63 = 'assets/specs/active/apps-script/63_api_v1_system_health.gs';
function roundBaseline() {
  // NOTHING IS PASSED THROUGH A SHELL QUOTE. The first attempt used `git log -S"…'stamp'…"`, and a
  // single-quoted argument means nothing to cmd.exe: the pickaxe matched no commit, the baseline silently
  // became HEAD, and the diff was empty — a derivation that failed by returning a plausible answer.
  var log = git('log --format=%H -- ' + REL63);
  if (log === null) return null;
  var commits = log.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  for (var i = 0; i < commits.length; i++) {
    var blob = git('show ' + commits[i] + ':' + REL63);
    if (blob === null) continue;
    // The newest commit whose 63_ does NOT carry this stamp is the release being upgraded from.
    if (blob.indexOf("SYS_DEPLOYMENT_RELEASE_ = '" + STAMP + "'") === -1) return commits[i];
  }
  return null;
}
var BASE = roundBaseline();
ok(!!BASE, 'C0  the round baseline is DERIVED from the commit that introduced this stamp', BASE);
// A baseline that resolves to HEAD is the failure mode of the first attempt: it makes the diff empty and
// the sync set look like nothing changed. It has to be a STRICT ancestor.
ok(!!BASE && String(git('merge-base --is-ancestor ' + BASE + ' HEAD')) !== 'null'
  && String(git('rev-parse HEAD')).trim() !== BASE,
  'C0a and it is a STRICT ancestor of HEAD, not HEAD itself', BASE);
ok(!!BASE && String(git('show ' + BASE + ':' + REL63)).indexOf("SYS_DEPLOYMENT_RELEASE_ = '" + PREV_STAMP + "'") !== -1,
  'C0b and 63_ at that baseline declares the PREVIOUS release, which is what makes it the right baseline');
function changedSinceBaseline() {
  if (!BASE) return null;
  var tracked = git('diff --name-only ' + BASE);
  var others = git('ls-files --others --exclude-standard');
  if (tracked === null || others === null) return null;
  return (tracked + '\n' + others).split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
}
var changed = changedSinceBaseline(), newFiles = [];
if (changed === null) {
  ok(false, 'C0a git is readable so the sync set can be MEASURED rather than remembered');
} else {
  var all = changed.concat(newFiles);
  var gsChanged = all.filter(function (f) { return /\.gs$/.test(f); }).sort();
  // 61_, 01_ and 90_ are NOT in this round. A per-module stamp records the round its file last changed, and
  // marching one to the release is the confusion 63_'s own header warns about.
  // FIVE files, and the fifth is the one a remembered list would have dropped: the activation census's
  // pin must follow SYS_DEPLOYMENT_RELEASE_ or the live manifest STOPs on a healthy deployment. Two stamps
  // in it move and nothing captured is touched.
  eq(gsChanged, [
    'assets/specs/active/apps-script/11_shipping_plan_handlers.gs',
    'assets/specs/active/apps-script/63_api_v1_system_health.gs',
    'assets/specs/active/apps-script/71_api_v1_factory_stock_guard.gs',
    'assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs',
    'assets/tools/apps-script-migrations/TEMP_migrate_factory_stock_override_audit_r5.gs'
  ], 'C1  §C the Apps Script set that changed this round is 71_, 11_, 63_, the census pin and the new TEMP migration');
  // And what changed in the census is TWO STAMPS. Not the captured activation evidence.
  var censusDiff = String(git('diff --numstat ' + BASE
    + ' -- assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs')).trim().split(/\s+/);
  eq([censusDiff[0], censusDiff[1]], ['2', '2'],
    'C1a and the census changed by exactly two lines — the two build pins, not one byte of captured evidence');
  ok(all.indexOf('assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs') === -1,
    'C2  §C 90_ did NOT change — no pure module moved, so BUNDLE_REBUILD is NOT required this round');
  ok(all.indexOf('assets/specs/active/apps-script/00_config.gs') === -1,
    'C3  §F 00_config.gs is untouched');
  var browser = all.filter(function (f) { return /^assets\/(js|css)\//.test(f) || f === 'index.html'; });
  eq(browser, [], 'C4  §C NO browser file changed, so no cache token rotates and the frontend need not be republished');
}

// The action contract did NOT move, which is what makes C4 safe: a new action would have forced both.
var sysAC = (G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1];
var expAC = (DBAPI.match(/KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/) || [])[1];
eq([sysAC, expAC], ['12', '12'],
  'C5  §C the action contract stays at 12 on BOTH sides — no action was added or removed');
// But a NEW DEPLOYMENT VERSION *is* required, and this is the field that says so.
var sysRel = (G63.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/) || [])[1];
eq(sysRel, STAMP, 'C6  §C SYS_DEPLOYMENT_RELEASE_ moved, so a NEW Web App deployment version IS required');
var fsgB = (G71.match(/var FSG_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var spB = (G11.match(/var SP_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var sysB = (G63.match(/var SYS_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var wapB = (G61.match(/var WAP_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var rtrB = (G01.match(/var RTR_BUILD_VERSION_ = '([^']+)'/) || [])[1];
eq([fsgB, spB, sysB], [STAMP, STAMP, STAMP], 'C7  the three modules that changed declare this round …');
eq([wapB, rtrB], [PREV_STAMP, PREV_STAMP], 'C7a … and the two that did not, do NOT — a stamp is not a release');
ok(RO.stampAtOrAfter(sysRel, wapB) && RO.stampAtOrAfter(sysRel, rtrB),
  'C7b while the RELEASE is at or after every module it ships');
ok(RO.OWNER_STAMPS.indexOf(STAMP) === RO.OWNER_STAMPS.length - 1 && RO.BUILD_STAMP_RE.test(STAMP),
  'C8  and this round\'s stamp is registered, last, and legally shaped');

// The manifest can be ASKED which files to sync, so the list is not a prose artifact.
var manifest = (G63.match(/\{ file: '(?:71_api_v1_factory_stock_guard|11_shipping_plan_handlers|63_api_v1_system_health)\.gs'[^}]*\}/g) || []);
eq(manifest.length, 3, 'C9  §C all three changed modules have a manifest row …');
ok(manifest.every(function (r) { return r.indexOf(STAMP) !== -1; }),
  'C9a … and every one of those rows expects this round');
// C10 — THE PROVISIONING TOOL IS NOT IN THE DEPLOYMENT MANIFEST, AND THAT IS THE CORRECTED DECISION.
//
// A row was added there first, by analogy with TEMP_migrate_shipping_allocation_ai_lifecycle.gs. Three
// standing suites rejected it in one step, and they were right: every manifest reader resolves
// assets/specs/active/apps-script/<file> and only that, because the manifest lists what is SYNCED INTO THE
// PROJECT AS RUNTIME. The lifecycle migration has a row because it lives in that folder — the precedent is
// the folder, not being a migration. This tool lives in assets/tools/apps-script-migrations/ beside
// TEMP_shipping_allocation_schema_b4_append.gs, which has no row either.
// A MANIFEST ROW, not a mention. 63_ now carries a comment explaining why the row is absent, and that
// comment necessarily names the file — testing for the filename would forbid the explanation.
function manifestRowFor(file) {
  return new RegExp("\\{ file: '" + file.replace(/\./g, '\\.') + "'").test(G63);
}
ok(!manifestRowFor('TEMP_migrate_factory_stock_override_audit_r5.gs'),
  'C10 the provisioning tool has NO deployment-manifest row — it is not synced as runtime');
ok(!manifestRowFor('TEMP_shipping_allocation_schema_b4_append.gs'),
  'C10a matching the ONLY precedent for a migration tool in that folder');
ok(manifestRowFor('TEMP_migrate_shipping_allocation_ai_lifecycle.gs'),
  'C10c while the one that DOES have a row lives in the runtime folder — the precedent is the folder');
// Discovery lives where an operator actually meets the problem: in the refusal.
ok(/TEMP_migrate_factory_stock_override_audit_r5\.gs/.test(G71)
  && /TEMP_FSOA_R5_MIGRATE_DRY_RUN\(\)/.test(G71) && /TEMP_FSOA_R5_MIGRATE_COMMIT\(\)/.test(G71),
  'C10b and the refusal itself names the file and both functions to run');
// A mixed deployment is refused rather than run unguarded, in BOTH directions.
ok(/FACTORY_STOCK_GUARD_SEAM_MISSING/.test(G11) && /FACTORY_STOCK_GUARD_MODULE_MISSING/.test(G71),
  'C11 §C a half-synced project refuses the transition instead of running it unguarded');

// ================================================================================================================
section('D. §D — THE TEMP INVENTORY, EVERY ROW BACKED BY A MEASUREMENT');
// ================================================================================================================
// The classification is DECLARED here and then CHECKED against the tree, so a row cannot quietly become wrong.
// `repo` is whether the file exists in this repository at all; `tests` is how many suites READ it from disk,
// which is what decides whether deleting it from the REPO is safe — a separate question from whether it can be
// removed from the Apps Script project.
var TEMP_INVENTORY = [
  { file: 'assets/specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs',
    verdict: 'KEEP_UNTIL_R5_VALIDATION', extract: true },
  { file: 'assets/specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs',
    verdict: 'UNKNOWN_NEEDS_EVIDENCE', extract: false },
  { file: 'assets/specs/active/apps-script/TEMP_migrate_shipping_allocation_ai_lifecycle.gs',
    verdict: 'REMOVE_AFTER_MIGRATION_VALIDATED', extract: false },
  { file: 'assets/tools/apps-script-diagnostics/TEMP_migrate_create_idempotency_key_a2_r3.gs',
    verdict: 'REMOVE_AFTER_MIGRATION_VALIDATED', extract: false },
  { file: 'assets/tools/apps-script-diagnostics/TEMP_FC1AR1_RESERVATION_RECONCILIATION.gs',
    verdict: 'KEEP_UNTIL_R5_VALIDATION', extract: false },
  { file: 'assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs',
    verdict: 'KEEP_UNTIL_R5_VALIDATION', extract: false },
  { file: 'assets/tools/apps-script-diagnostics/TEMP_FC_FORECAST_YEAR_ROLLOVER_CENSUS_FC1B_E3_R2.gs',
    verdict: 'SAFE_TO_REMOVE_NOW', extract: false },
  { file: 'assets/tools/apps-script-diagnostics/TEMP_FC_REGULAR_FORECAST_YEAR_ROLLOVER_2027.gs',
    verdict: 'REMOVE_AFTER_MIGRATION_VALIDATED', extract: false },
  { file: 'assets/tools/apps-script-diagnostics/TEMP_FC1A_COMPACT_READINESS_CENSUS.gs',
    verdict: 'KEEP_UNTIL_R5_VALIDATION', extract: false },
  { file: 'assets/specs/active/apps-script/TEMP_RUN_E3_CENSUS_ONCE.gs',
    verdict: 'UNKNOWN_NEEDS_EVIDENCE', extract: false, expect_absent: true },
  { file: 'assets/specs/active/apps-script/未命名.gs',
    verdict: 'UNKNOWN_NEEDS_EVIDENCE', extract: false, expect_absent: true }
];
var VERDICTS = { KEEP_UNTIL_R5_VALIDATION: 1, SAFE_TO_REMOVE_NOW: 1, REMOVE_AFTER_MIGRATION_VALIDATED: 1,
  EXTRACT_TO_FORMAL_MODULE: 1, UNKNOWN_NEEDS_EVIDENCE: 1 };
ok(TEMP_INVENTORY.every(function (r) { return VERDICTS[r.verdict] === 1; }),
  'D0  every classification is one of the five §D categories');

// D1 — the presence claim. A file the user named that is NOT in the repo cannot be classified from here, and
// UNKNOWN_NEEDS_EVIDENCE is the only honest verdict for it.
TEMP_INVENTORY.forEach(function (r, i) {
  var exists = fs.existsSync(path.join(ROOT, r.file));
  if (r.expect_absent) {
    eq([exists, r.verdict], [false, 'UNKNOWN_NEEDS_EVIDENCE'],
      'D1.' + (i + 1) + ' ' + r.file.split('/').pop() + ' is NOT in the repo → UNKNOWN_NEEDS_EVIDENCE');
  } else {
    ok(exists, 'D1.' + (i + 1) + ' ' + r.file.split('/').pop() + ' is present and classifiable');
  }
});

// D2 — NO formal runtime module calls ANY TEMP entry point. This is the single fact that makes every "remove"
// verdict possible, and it is measured across every numbered .gs rather than asserted per file.
var runtimeFiles = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) {
  return /^\d\d_.*\.gs$/.test(f);
});
ok(runtimeFiles.length >= 30, 'D2  the numbered runtime set is enumerated', runtimeFiles.length);
var tempCallers = [];
runtimeFiles.forEach(function (f) {
  var src = bareCode(read(GS + f));
  // A CALL, not a mention: an identifier beginning TEMP_/tempRod/tmig/tb2/tb4/tb5/DEMO4A_ followed by '('.
  var m = src.match(/\b(?:TEMP_[A-Za-z0-9_]*|tempRod[A-Za-z0-9_]*|tmig[A-Za-z0-9_]*|tb[245][A-Za-z0-9_]*|DEMO4A_[A-Za-z0-9_]*)\s*\(/g);
  if (!m) return;
  // 63_ defines its OWN editor-run wrappers (TEMP_SYSTEM_HEALTH_CHECK etc.); a file calling a function it
  // also defines is not a dependency on a TEMP FILE.
  var own = m.filter(function (c) {
    var nm = c.replace(/\s*\($/, '');
    return !(new RegExp('function\\s+' + nm + '\\s*\\(').test(src));
  });
  if (own.length) tempCallers.push({ file: f, calls: own });
});
eq(tempCallers, [], 'D2a §D.1 no numbered runtime module CALLS any TEMP entry point');

// D3 — no TEMP function is a trigger handler. A trigger would make "remove the file" break a schedule.
var triggerHandlers = [];
runtimeFiles.forEach(function (f) {
  var src = read(GS + f);
  var m = src.match(/newTrigger\((?:'([^']*)'|([A-Za-z0-9_]+))\)/g) || [];
  m.forEach(function (t) { triggerHandlers.push(t); });
});
ok(!triggerHandlers.some(function (t) { return /TEMP_/.test(t); }),
  'D3  §D.2 no ScriptApp trigger names a TEMP handler', triggerHandlers.length);

// D4 — the trap this project already fell into, asserted so it cannot recur: a REQUIRED router action whose
// handler lives in a TEMP file. `system.requestOrderSendDiagnosticStatus` is in the router and in the browser
// contract, and its handler is in 66_ — NOT in TEMP_request_order_send_diagnostics.gs.
ok(/'system\.requestOrderSendDiagnosticStatus':\s*handleRequestOrderSendDiagnosticStatus_/.test(G01),
  'D4  the diagnostic-status action is a REQUIRED routed action …');
ok(/function handleRequestOrderSendDiagnosticStatus_/.test(G66),
  'D4a … and its handler lives in 66_, so removing the TEMP file cannot break the deployment contract');
ok(!/function handleRequestOrderSendDiagnosticStatus_/
  .test(read(GS + 'TEMP_request_order_send_diagnostics.gs')),
  'D4b the TEMP file holds only editor wrappers — the ownership move is real, not documented');

// D5 — KEEP_UNTIL_R5_VALIDATION is not a feeling. Each KEEP file must own an entry point this round's release
// steps actually require, or a reconciliation of a number this round's guard depends on.
var CENSUS = read('assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs');
['RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT', 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK',
 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST'].forEach(function (fn, i) {
  ok(new RegExp('function ' + fn + '\\s*\\(').test(CENSUS),
    'D5.' + (i + 1) + ' the census owns ' + fn + ' — required on the R5 deployment, so it is KEEP');
});
ok(/fac_reserved_stock/.test(read('assets/tools/apps-script-diagnostics/TEMP_FC1AR1_RESERVATION_RECONCILIATION.gs')),
  'D5.4 the reservation reconciliation is the only check on fac_reserved_stock, which this guard SUBTRACTS → KEEP');
ok(/approved_without_shipment|fc1aApprovedWithoutShipment_/
  .test(read('assets/tools/apps-script-diagnostics/TEMP_FC1A_COMPACT_READINESS_CENSUS.gs')),
  'D5.5 the readiness census owns the approved-without-shipment count this round\'s boundary rests on → KEEP');

// D6 — EXTRACT_TO_FORMAL_MODULE, and it is one specific thing rather than a tidy-up wish: a TEMP file MINTS
// the internal controlled authority and calls the REAL production generator. Whatever else is true of that
// file, production generation reachable only from a file marked for deletion is a structural problem.
var RODV2 = read('assets/specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs');
ok(/WeeklyAiPlanControlledAuthority_\.mint\(/.test(RODV2) && /weeklyAiPlanGenerateK2_\(/.test(RODV2),
  'D6  §D.5 TEMP_migrate_request_order_draft_v2 mints the controlled authority and calls the real generator');
eq(TEMP_INVENTORY.filter(function (r) { return r.extract; }).map(function (r) { return r.file.split('/').pop(); }),
  ['TEMP_migrate_request_order_draft_v2.gs'],
  'D6a so exactly one file carries an EXTRACT_TO_FORMAL_MODULE finding');
ok(!/WeeklyAiPlanControlledAuthority_\.mint\(/.test(codeOnly(G61)),
  'D6b and 61_ does NOT mint it — the capability really does live only in the TEMP file');

// D7 — DELETING FROM THE REPO IS A DIFFERENT QUESTION FROM REMOVING FROM THE APPS SCRIPT PROJECT, and the
// numbers say so. Every file below is read from disk by live suites, so a repo deletion breaks tests that have
// nothing to do with Apps Script. The deletion list must therefore be scoped to the PROJECT.
var testFiles = fs.readdirSync(path.join(ROOT, 'assets/tests')).filter(function (f) { return /\.test\.js$/.test(f); });
function suitesReading(base) {
  return testFiles.filter(function (t) {
    return read('assets/tests/' + t).indexOf(base) !== -1;
  }).length;
}
var readCounts = {};
TEMP_INVENTORY.forEach(function (r) {
  if (r.expect_absent) return;
  readCounts[r.file.split('/').pop()] = suitesReading(r.file.split('/').pop());
});
ok(Object.keys(readCounts).some(function (k) { return readCounts[k] > 0; }),
  'D7  §D.6 TEMP files ARE read from disk by live suites', readCounts);
eq(readCounts['TEMP_FC_FORECAST_YEAR_ROLLOVER_CENSUS_FC1B_E3_R2.gs'] > 0, true,
  'D7a including the one classified SAFE_TO_REMOVE_NOW — which is therefore safe to remove from the PROJECT, not the repo');

// D8 — and the one file whose absence the deployment manifest already tolerates, which is the pattern the new
// migration follows: optional means "absent after use is correct".
ok(/TEMP_migrate_shipping_allocation_ai_lifecycle\.gs'[^}]*optional: true/.test(G63),
  'D8  §D.6 the completed lifecycle migration is manifest-OPTIONAL, so removing it breaks no contract');

// ================================================================================================================
section('F. THE EDITOR ENTRY POINTS — the census exists, is top-level, and writes nothing');
// ================================================================================================================
// WHY THIS SECTION EXISTS. The R5-R1 runbook told the operator to run
// RUN_R6R7_R5_FACTORY_STOCK_GUARD_CENSUS() and it did not say which FILE to open first. The Apps Script Run
// selector is populated from the file selected in the editor, so an operator who had just finished the
// migration — with TEMP_migrate_factory_stock_override_audit_r5.gs open — could not see it, and the natural
// reading of that is "the function was never implemented".
//
// It WAS implemented. What was missing was any standing assertion about it: R5's G5 write-freedom list names
// fsgReadInventoryFacts_, fsgEvaluateAiClaims_, fsgEvaluatePlanOverage_, handleFactoryStockGuardGet_ and
// fsgLastConfirmedOverride_ — and NEITHER of the two RUN_ entry points an operator actually invokes. The two
// functions a human runs by hand against production were the two nothing measured.

// ---- F1  IT EXISTS, EXACTLY ONCE, AT THE TOP LEVEL, AND TAKES NO ARGUMENTS ------------------------------
// Brace-depth walked outside comments and strings. Depth 0 is what the Run selector can offer; a function
// nested inside anything is unreachable from the toolbar no matter how it is named.
function topLevelFns(src) {
  var out = [], d = 0, q = null, line = false, block = false;
  for (var i = 0; i < src.length; i++) {
    var c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') { d++; continue; }
    if (c === '}') { d--; continue; }
    if (c === 'f' && src.substr(i, 9) === 'function ') {
      var m = /^function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/.exec(src.slice(i));
      if (m) out.push({ name: m[1], depth: d, params: m[2].trim(),
        line: src.slice(0, i).split('\n').length });
    }
  }
  return out;
}
var CENSUS_FN = 'RUN_R6R7_R5_FACTORY_STOCK_GUARD_CENSUS';
var SCHEMA_FN = 'RUN_R6R7_R5_FACTORY_STOCK_GUARD_SCHEMA_VALIDATE';
var fns71 = topLevelFns(G71);
[CENSUS_FN, SCHEMA_FN].forEach(function (nm, i) {
  var hits = fns71.filter(function (f) { return f.name === nm; });
  eq(hits.length, 1, 'F1.' + (i + 1) + ' ' + nm + ' is declared exactly once in 71_');
  if (!hits.length) return;
  eq([hits[0].depth, hits[0].params], [0, ''],
    'F1.' + (i + 1) + 'a and it is TOP-LEVEL and argument-free, so the Run selector can offer it');
});
// And nowhere else in the project, because one shared global scope means a duplicate silently wins.
var elsewhere = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) {
  return /\.gs$/.test(f) && f !== '71_api_v1_factory_stock_guard.gs';
}).filter(function (f) { return read(GS + f).indexOf('function ' + CENSUS_FN) !== -1; });
eq(elsewhere, [], 'F2  no other runtime module defines it — no shadowing in the one shared global scope');
['assets/tools/apps-script-diagnostics', 'assets/tools/apps-script-migrations'].forEach(function (dir, i) {
  var dup = fs.readdirSync(path.join(ROOT, dir)).filter(function (f) {
    return /\.gs$/.test(f) && read(dir + '/' + f).indexOf('function ' + CENSUS_FN) !== -1;
  });
  eq(dup, [], 'F2.' + (i + 1) + ' nor does any file in ' + dir.split('/').pop());
});
// The file it lives in is the file the sync list names, and the census is in its LAST 40 lines — which is why
// a truncated paste is a real possibility and is the second thing to check.
var censusLine = fns71.filter(function (f) { return f.name === CENSUS_FN; })[0].line;
var total71 = G71.split('\n').length;
ok(total71 - censusLine < 40,
  'F3  the census is in the TAIL of 71_ (line ' + censusLine + ' of ' + total71 + ') — a short paste loses it first');

// ---- F4  THE WHOLE TRANSITIVE CLOSURE NAMES NO WRITE API ------------------------------------------------
var WRITE_APIS = /setValue\(|setValues\(|appendRow\(|insertSheet\(|deleteSheet\(|deleteRow\(|deleteRows\(|insertRowsAfter\(|insertRowsBefore\(|insertColumn|deleteColumn|clearContent|setName\(|LockService|setProperty\(|deleteProperty\(|fcWriteAppendByHeader_|prodMigrateCreateSheet_|prodMigrateAppendColumns_/;
function closureOf(src, entry) {
  var seen = {}, reached = [], queue = [entry];
  while (queue.length) {
    var nm = queue.shift();
    if (seen[nm]) continue;
    seen[nm] = 1;
    var body;
    try { body = extractFn(src, nm); } catch (e) { continue; }   // defined outside this file
    var b = bareCode(body);
    reached.push({ name: nm, writes: WRITE_APIS.test(b) });
    (b.match(/\b[A-Za-z0-9_$]+\s*\(/g) || []).forEach(function (call) {
      var c = call.replace(/\s*\($/, '');
      if (c === nm) return;
      try { if (extractFn(src, c)) queue.push(c); } catch (e) { /* not local */ }
    });
  }
  return reached;
}
var censusClosure = closureOf(G71, CENSUS_FN);
ok(censusClosure.length >= 6, 'F4  the census closure inside 71_ is walked', censusClosure.length);
eq(censusClosure.filter(function (o) { return o.writes; }).map(function (o) { return o.name; }), [],
  'F4a §3 NOT ONE function the census can reach names a write API, a lock or a property write');
eq(closureOf(G71, SCHEMA_FN).filter(function (o) { return o.writes; }).map(function (o) { return o.name; }), [],
  'F4b and the same holds for the schema validator beside it');
// The two readers it reaches OUTSIDE 71_ are read-only in their own files, which is where that must be true.
ok(!WRITE_APIS.test(bareCode(extractFn(read(GS + '43_api_v1_gap_materialization.gs'), 'gapReadObjects_'))),
  'F4c and gapReadObjects_ — the one sheet reader it calls — writes nothing either');
ok(!/SpreadsheetApp|getRange|appendRow|setValue|LockService/.test(read('assets/js/core/supply-planning-factory-stock-guard.js')),
  'F4d while the pool arithmetic it delegates to cannot touch a spreadsheet at all');

// ---- F5  RUN IT. Every mutating API on these sheets RECORDS THE ATTEMPT AND THEN THROWS ------------------
// A source scan says "no write is named". This says "it wrote nothing", which is a different and stronger
// claim — and the sheets are rigged so a write cannot even succeed quietly.
function censusWorld(spec) {
  spec = spec || {};
  var attempts = [];
  var w = new World(spec);
  Object.keys(w.S).forEach(function (n) {
    var sh = w.S[n];
    sh.fail.setValue = function () { attempts.push({ op: 'setValue', sheet: n }); return 'WRITE_ATTEMPTED'; };
    sh.fail.setValues = function () { attempts.push({ op: 'setValues', sheet: n }); return 'WRITE_ATTEMPTED'; };
    sh.fail.appendRow = function () { attempts.push({ op: 'appendRow', sheet: n }); return 'WRITE_ATTEMPTED'; };
    sh.fail.deleteRow = function () { attempts.push({ op: 'deleteRow', sheet: n }); return 'WRITE_ATTEMPTED'; };
  });
  return { w: w, attempts: attempts, s: seam(w, spec) };
}
// TWO physical factory pools, TWO companies drawing on ONE of them, one MANUAL draft, one plan already
// transferred to a shipment, and one non-factory warehouse carrying stock. Every distinction the pool
// arithmetic has to make is present in this one world.
var CW = {
  warehouses: [
    { warehouse_id: 'FW-CN', company: 'ResUS', country: 'CN', is_active: true, is_factory_warehouse: true },
    { warehouse_id: 'FW-TW', company: 'ResUS', country: 'TW', is_active: true, is_factory_warehouse: true },
    { warehouse_id: 'WH-3PL', company: 'ResUS', country: 'US', is_active: true, is_factory_warehouse: false }],
  factory_stock: [
    { warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 1000, fac_reserved_stock: 0 },
    { warehouse_id: 'FW-TW', sku: 'SKU1', fac_current_stock: 900, fac_reserved_stock: 0 },
    { warehouse_id: 'WH-3PL', sku: 'SKU1', fac_current_stock: 5000, fac_reserved_stock: 0 }],
  drafts: [{ allocation_draft_id: 'D-MAN', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    status: 'draft', recommended_source_warehouse_id: 'FW-CN', generation_type: 'user_created' }],
  draft_lines: [{ allocation_draft_line_id: 'L1', allocation_draft_id: 'D-MAN', sku: 'SKU1',
    source_warehouse_id: 'FW-CN', planned_qty: 300 }],
  plans: [
    { shipping_plan_id: 'SP-US', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      source_warehouse_id: 'FW-CN', status: 'pending_approval' },
    { shipping_plan_id: 'SP-JP', company: 'OtherCo', country: 'JP', marketplace: 'Rakuten',
      source_warehouse_id: 'FW-CN', status: 'approved' },
    { shipping_plan_id: 'SP-GONE', company: 'OtherCo', country: 'JP', marketplace: 'Rakuten',
      source_warehouse_id: 'FW-CN', status: 'approved', transferred_shipment_id: 'SHP-9' }],
  plan_lines: [
    { shipping_plan_line_id: 'P1', shipping_plan_id: 'SP-US', sku: 'SKU1', requested_qty: 500 },
    { shipping_plan_line_id: 'P2', shipping_plan_id: 'SP-JP', sku: 'SKU1', requested_qty: 400 },
    { shipping_plan_line_id: 'P3', shipping_plan_id: 'SP-GONE', sku: 'SKU1', requested_qty: 777 }]
};
function runCensus(over) {
  var spec = {};
  Object.keys(CW).forEach(function (k) { spec[k] = CW[k]; });
  Object.keys(over || {}).forEach(function (k) { spec[k] = over[k]; });
  var C = censusWorld(spec);
  // A THROW is an outcome, not an accident: the rigged sheets refuse every write, so a census that tries
  // one dies here. Capturing it is what lets E17 distinguish 'wrote nothing' from 'was stopped'.
  var res = null, threw = null;
  try { res = C.s.call(CENSUS_FN + '()'); }
  catch (e) { threw = String((e && e.message) ? e.message : e); }
  return { res: res, threw: threw, attempts: C.attempts, w: C.w };
}
var F5 = runCensus();
eq(F5.attempts, [], 'F5  §3 the census attempted ZERO writes — measured, not scanned');
eq(F5.threw, null, 'F5.0 and it completed, so the zero above is a full run rather than an early death');
eq(F5.res.writes, 0, 'F5a and it reports writes: 0');
eq(F5.res.ok, true, 'F5b having read a complete database');
eq(F5.res.build, STAMP, 'F5c stamped with the deployed build, so the answer names the code that produced it');
eq(F5.res.tables_read, ['warehouses', 'factory_stock', 'shipping_allocation_drafts',
  'shipping_allocation_draft_lines', 'shipping_plans', 'shipping_plan_lines', 'marketplaces'],
  'F5d and it states which seven tables it read');

// ---- F6  THE POOL ARITHMETIC IS THE PRODUCTION ONE, NOT A SECOND READING OF IT --------------------------
// 300 manual draft (ResUS) + 500 plan (ResUS) + 400 plan (OtherCo) = 1200 against 1000 on ONE warehouse.
// The 777 on the transferred plan is NOT counted — it is already inside fac_reserved_stock.
var oc = F5.res.pools_already_over_committed;
eq(oc.length, 1, 'F6  exactly one pool is over-committed …');
eq([oc[0].pool_key, oc[0].warehouse_id, oc[0].sku], ['WH:FW-CN||SKU1', 'FW-CN', 'SKU1'],
  'F6a … and it is named by pool key, WAREHOUSE and SKU — the identifiers a review needs');
eq([oc[0].factory_current_stock, oc[0].factory_reserved_stock, oc[0].factory_available_stock,
  oc[0].active_allocation_draft_qty, oc[0].active_shipping_plan_qty,
  oc[0].already_allocated_qty, oc[0].available_to_allocate],
  [1000, 0, 1000, 300, 900, 1200, -200],
  'F6b with the full arithmetic, and a NEGATIVE headroom reported rather than clamped to zero');
eq(oc[0].active_allocation_draft_manual_qty, 300,
  'F6c the manual draft is counted and labelled MANUAL, so nobody reads it as the AI\'s');
// CROSS-COMPANY. This is the defect the whole guard exists for: if the census filtered by company it would
// see 800 against 1000 and report a healthy pool.
ok(oc[0].active_shipping_plan_qty === 900,
  'F6d §4 the two companies\' plans are SUMMED (500 + 400), never filtered to the requesting company');
// PER POOL. Two physical factory warehouses are two pools; adding them would show 1900 of stock and hide it.
eq(F5.res.pool_count, 2, 'F6e two physical factory pools stay two pools …');
eq(F5.res.pools_sample.map(function (r) { return r.pool_key; }).sort(),
  ['WH:FW-CN||SKU1', 'WH:FW-TW||SKU1'], 'F6f … keyed by warehouse and SKU');
eq(F5.res.pools_sample.filter(function (r) { return r.warehouse_id === 'FW-TW'; })[0].available_to_allocate, 900,
  'F6g and the untouched pool keeps its own headroom — the shortfall does not leak across warehouses');
// The 3PL warehouse holds 5000 units of the same SKU and is NOT factory stock. Counting it would erase the
// overcommit entirely, which is exactly the category error 43_ calls two INDEPENDENT pools.
eq([F5.res.balances.examined, F5.res.balances.counted, F5.res.balances.skipped_non_factory], [3, 2, 1],
  'F6h the non-factory warehouse is examined, EXCLUDED, and the exclusion is counted');
// And the transferred plan.
eq(F5.res.plan_exposure.released.TRANSFERRED_TO_SHIPMENT, 1,
  'F6i the plan already transferred to a shipment is released BY NAME, so its units are not double-counted');

// ---- F7  SCHEMA READINESS, AND WHAT AN INCOMPLETE DATABASE MUST *NOT* LOOK LIKE ------------------------
eq([F5.res.schema.verdict, F5.res.schema.runtime_would_accept, F5.res.schema.writes],
  ['READY', true, 0], 'F7  the census carries the override-audit schema readiness, and asks the RUNTIME');
eq(F5.res.schema.dry_run, true, 'F7a declared dry_run');
eq(F5.res.guard_module_present, true, 'F7b and states that the pure guard module is loaded');
// AN UNREADABLE DATABASE MUST NEVER PRODUCE A CLEAN BILL OF HEALTH. `pools_already_over_committed: []` on a
// failed read would read to an operator as "no pool is over-committed", which is the worst possible lie for
// this particular field. The census OMITS it instead and says why.
var F8 = runCensus({ factory_stock_absent: true });
eq([F8.res.ok, F8.res.reason], [false, 'FACTORY_STOCK_READ_FAILED'],
  'F8  §4 an unreadable factory_stock is reported as a FAILED read, with the reason');
eq(F8.res.pools_already_over_committed, undefined,
  'F8a and pools_already_over_committed is ABSENT, never an empty list that reads as "nothing is wrong"');
eq(F8.res.pool_count, undefined, 'F8b nor is a pool count invented for a census that counted nothing');
eq(F8.attempts, [], 'F8c and the failure path writes nothing either');
eq(F8.res.writes, 0, 'F8d still reporting writes: 0');

// ---- F9  THE RUNBOOK DEFECT, RECORDED SO IT CANNOT RECUR -----------------------------------------------
// The census is reachable ONLY from the file that defines it, because the Apps Script Run selector is
// populated from the file open in the editor. Any runbook line that names it must name its file.
ok(/Run from the editor: `RUN_R6R7_R5_FACTORY_STOCK_GUARD_CENSUS\(\)`/.test(G71),
  'F9  71_ documents its own entry point at the definition, which is where an operator can find it');
eq(fns71.filter(function (f) { return /^RUN_/.test(f.name) && f.depth === 0; })
  .map(function (f) { return f.name; }).sort(),
  [CENSUS_FN, SCHEMA_FN].sort(),
  'F9a and 71_ offers the selector exactly TWO entry points — the pair a runbook must name together');
// ================================================================================================================
section('E. MUTANTS — §E');
// ================================================================================================================

mut('E1 the runtime lazily creates the audit table again', function () {
  // The mutant restores R5's behaviour: an absent ledger is CREATED on the confirmation path.
  // The mutant restores R5's INTENDED behaviour with the API that could actually have done it: create the
  // tab and write the header row on the confirmation path. Both the gate's requirement and the append's are
  // replaced, because R5's claim was that neither existed.
  var lazy = [
    '  if (!req.ok) {',
    '    var lz = ss.insertSheet(FSG_OVERRIDE_AUDIT_TABLE_);',
    '    lz.getRange(1, 1, 1, FSG_OVERRIDE_AUDIT_HEADERS_.length).setValues([FSG_OVERRIDE_AUDIT_HEADERS_]);',
    '    req = fsgRequireOverrideAuditSheet_(ss);',
    '  }'].join(NL);
  var mSrc = swap(G71,
    "  var req = fsgRequireOverrideAuditSheet_(ss);" + NL
    + "  out.schema = { exists: req.exists, reason: req.reason, missing_headers: req.missing_headers,",
    "  var req = fsgRequireOverrideAuditSheet_(ss);" + NL + lazy + NL
    + "  out.schema = { exists: req.exists, reason: req.reason, missing_headers: req.missing_headers,");
  mSrc = swap(mSrc, "  var auditReq = fsgRequireOverrideAuditSheet_(ss);" + NL + "  if (!auditReq.ok) {",
    "  var auditReq = fsgRequireOverrideAuditSheet_(ss);" + NL + "  if (false) {");
  var W = planWorld(800, 300, 1000, { audit: 'absent', g71: mSrc });
  var r = confirmOnce(W).send();
  // Honest code refuses with the named code and creates nothing.
  var H = planWorld(800, 300, 1000, { audit: 'absent' });
  var hr = confirmOnce(H).send();
  // The mutant CREATES the ledger during a business transition and accepts the override; the honest code
  // refuses and leaves the database exactly as it found it.
  return hr.code === 'FACTORY_STOCK_OVERRIDE_AUDIT_SCHEMA_MISSING' && !H.w.S['factory_stock_override_audit']
    && H.w.inserted.length === 0
    && r.success === true && W.w.inserted.indexOf('factory_stock_override_audit') !== -1;
});

mut('E2 the gate stops requiring the ledger, so the status moves and the audit cannot be written', function () {
  var mSrc = swap(G71, "  var auditReq = fsgRequireOverrideAuditSheet_(ss);" + NL + "  if (!auditReq.ok) {",
    "  var auditReq = fsgRequireOverrideAuditSheet_(ss);" + NL + "  if (false) {");
  var W = planWorld(800, 300, 1000, { audit: 'absent', g71: mSrc });
  var r = confirmOnce(W).send();
  // With the requirement gone the transition enters the transaction, the append refuses, and the ONLY thing
  // that keeps the plan out of Pending Approval is the rollback. The mutant is caught by the CODE, not by the
  // outcome — so assert the outcome changed at all, and that the honest path never reaches the transaction.
  var H = planWorld(800, 300, 1000, { audit: 'absent' });
  confirmOnce(H).send();
  return r.code !== 'FACTORY_STOCK_OVERRIDE_AUDIT_SCHEMA_MISSING' && H.w.log('shipping_plans').length === 0
    && W.w.log('shipping_plans').length > 0;
});

mut('E3 a missing schema is absorbed instead of throwing, leaving pending_approval with no audit', function () {
  // R5's exact defect: the append refusal is swallowed and the transition continues.
  var mSrc = swap(G11, "      if (!ap.ok) throw new Error(String(ap.code || 'OVERRIDE_AUDIT_APPEND_REFUSED'));",
    "      if (!ap.ok) { ap = { ok: true, appended: 0, skipped_existing: 0, expected: 0 }; }");
  // R5 also had no read-back. With the read-back in place the absorbed refusal is STILL caught, so both
  // have to go before the R5 outcome is reachable — which is the property being demonstrated.
  mSrc = swap(mSrc,
    "      if (!vr.ok) throw new Error('OVERRIDE_COMMIT_READBACK_FAILED:' + String(vr.code || '') + ' '",
    "      if (false) throw new Error('OVERRIDE_COMMIT_READBACK_FAILED:' + String(vr.code || '') + ' '");
  // Reach the append with an absent ledger by ALSO removing the gate's requirement, which is what R5 had.
  var noGate = swap(G71, "  var auditReq = fsgRequireOverrideAuditSheet_(ss);" + NL + "  if (!auditReq.ok) {",
    "  var auditReq = fsgRequireOverrideAuditSheet_(ss);" + NL + "  if (false) {");
  var W = planWorld(800, 300, 1000, { audit: 'absent', g11: mSrc, g71: noGate });
  var r = confirmOnce(W).send();
  var mutantLeftIt = W.w.plan('SP-ME').status === 'pending_approval' && W.w.auditRows().length === 0;
  var H = planWorld(800, 300, 1000, { audit: 'absent', g71: noGate });
  var hr = confirmOnce(H).send();
  var honestRolledBack = H.w.plan('SP-ME').status === 'draft' && hr.success === false;
  return mutantLeftIt && honestRolledBack;
});

mut('E4 the audit append is not journalled, so a later failure leaves the row behind', function () {
  var mSrc = swap(G11, "        journal: spTxn });", "        journal: null });");
  var W = planWorld(800, 300, 1000, { g11: mSrc });
  var c = confirmOnce(W);
  W.w.S['shipping_plans'].fail.setValue = function (h) { return h === 'note' ? 'INJECTED' : null; };
  c.send();
  var H = planWorld(800, 300, 1000);
  var hc = confirmOnce(H);
  H.w.S['shipping_plans'].fail.setValue = function (h) { return h === 'note' ? 'INJECTED' : null; };
  hc.send();
  return W.w.auditRows().length === 1 && H.w.auditRows().length === 0;
});

mut('E5 the status cells are not journalled, so an audit failure leaves pending_approval standing', function () {
  var mSrc = swap(G11, "    spTxn.push({ kind: 'cell', sheet: sheet, row: targetRow, col: c, prev: rowVals[c] });",
    "    /* not journalled */");
  var W = planWorld(800, 300, 1000, { g11: mSrc });
  var c = confirmOnce(W);
  W.w.S['factory_stock_override_audit'].fail.appendRow = function () { return 'INJECTED'; };
  c.send();
  var H = planWorld(800, 300, 1000);
  var hc = confirmOnce(H);
  H.w.S['factory_stock_override_audit'].fail.appendRow = function () { return 'INJECTED'; };
  hc.send();
  return W.w.plan('SP-ME').status === 'pending_approval' && H.w.plan('SP-ME').status === 'draft';
});

mut('E6 a rollback failure is reported as a clean zero-write refusal', function () {
  var mSrc = swap(G11, "    if (spRb.ok) {", "    if (true) {");
  var W = planWorld(800, 300, 1000, { g11: mSrc });
  var c = confirmOnce(W);
  W.w.S['shipping_plans'].fail.setValue = function (h) { return h === 'status' ? 'INJECTED_PERMANENT' : null; };
  var r = c.send();
  var H = planWorld(800, 300, 1000);
  var hc = confirmOnce(H);
  H.w.S['shipping_plans'].fail.setValue = function (h) { return h === 'status' ? 'INJECTED_PERMANENT' : null; };
  var hr = hc.send();
  return r.zero_write === true && r.code === 'OVERRIDE_COMMIT_FAILED_ROLLED_BACK'
    && hr.zero_write === false && hr.indeterminate === true;
});

mut('E7 the rollback stops verifying, so an unrestored cell passes as restored', function () {
  var mSrc = swap(G71, "  out.ok = out.unverified.length === 0;" + NL + "  return out;" + NL + "}",
    "  out.ok = true;" + NL + "  return out;" + NL + "}");
  var W = planWorld(800, 300, 1000, { g71: mSrc });
  var c = confirmOnce(W);
  W.w.S['shipping_plans'].fail.setValue = function (h) { return h === 'status' ? 'INJECTED_PERMANENT' : null; };
  var r = c.send();
  var H = planWorld(800, 300, 1000);
  var hc = confirmOnce(H);
  H.w.S['shipping_plans'].fail.setValue = function (h) { return h === 'status' ? 'INJECTED_PERMANENT' : null; };
  var hr = hc.send();
  return r.code === 'OVERRIDE_COMMIT_FAILED_ROLLED_BACK'
    && hr.code === 'OVERRIDE_COMMIT_INDETERMINATE_ROLLBACK_UNVERIFIED';
});

mut('E8 the append loses its idempotency guard, so a replayed confirmation writes a duplicate row', function () {
  var mSrc = swap(G71,
    "    if (fsgFindRowByColumnValue_(sheet, 'override_audit_id', rowId) !== -1) {",
    "    if (false) {");
  // The status precondition already refuses a replayed TRANSITION, so the append is reached DIRECTLY with
  // the identical audit object — which is the only way to ask whether the writer itself is idempotent
  // rather than merely unreachable.
  function replay(src) {
    var W = planWorld(800, 300, 1000, src ? { g71: src } : {});
    confirmOnce(W).send();
    var a = W.w.auditRows()[0];
    var auditObj = { inventory_override: true, override_reason: 'cross_site_reallocation',
      override_reason_label: 'x', override_note: '', override_by: 'vic', override_at: '2026-09-08 10:00:00',
      inventory_snapshot_fingerprint: a && a.inventory_snapshot_fingerprint,
      pools: [{ source_warehouse_id: 'FW-CN', sku: 'SKU1', available_qty_at_check: 1000,
        already_allocated_qty: 300, requested_plan_qty: 800, projected_total_qty: 1100, overage_qty: 100 }] };
    W.s.call('fsgAppendOverrideAudit_(SpreadsheetApp.getActiveSpreadsheet(), "shipping_plan", "SP-ME", '
      + '"submit", {}, ' + JSON.stringify(auditObj) + ', {})');
    return W.w.auditRows().length;
  }
  return replay(mSrc) === 2 && replay(null) === 1;
});

mut('E9 the commit stops being read back, so a write that never landed reports success', function () {
  var mSrc = swap(G11,
    "      if (!vr.ok) throw new Error('OVERRIDE_COMMIT_READBACK_FAILED:' + String(vr.code || '') + ' '",
    "      if (false) throw new Error('OVERRIDE_COMMIT_READBACK_FAILED:' + String(vr.code || '') + ' '");
  // A sheet that ACCEPTS the append and silently drops it: the row is never really there.
  function silentDrop(W) {
    var sh = W.w.S['factory_stock_override_audit'];
    sh.appendRow = function () { this.writeLog.push({ op: 'appendRow', row: -1 }); };
  }
  var W = planWorld(800, 300, 1000, { g11: mSrc });
  var c = confirmOnce(W); silentDrop(W); var r = c.send();
  var H = planWorld(800, 300, 1000);
  var hc = confirmOnce(H); silentDrop(H); var hr = hc.send();
  return r.success === true && W.w.auditRows().length === 0
    && hr.success === false && H.w.plan('SP-ME').status === 'draft';
});

mut('E10 the frontend pin drifts below the deployed action contract', function () {
  var mSrc = swap(DBAPI, 'KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 12', 'KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 11');
  var honest = Number((DBAPI.match(/KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/) || [])[1]);
  var mutant = Number((mSrc.match(/KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/) || [])[1]);
  var deployed = Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]);
  return honest === deployed && mutant !== deployed;
});

mut('E11 a TEMP entry point becomes reachable from the numbered runtime', function () {
  // 71_ is the file this round owns; the mutant makes it depend on the census.
  var mSrc = swap(G71, "function RUN_R6R7_R5_FACTORY_STOCK_GUARD_CENSUS() {",
    "function RUN_R6R7_R5_FACTORY_STOCK_GUARD_CENSUS() {" + NL
    + "  try { TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3(); } catch (e) {}");
  function callsTemp(src) {
    var c = bareCode(src);
    var m = c.match(/\bTEMP_[A-Za-z0-9_]*\s*\(/g) || [];
    return m.filter(function (x) {
      var nm = x.replace(/\s*\($/, '');
      return !(new RegExp('function\\s+' + nm + '\\s*\\(').test(c));
    }).length;
  }
  return callsTemp(G71) === 0 && callsTemp(mSrc) > 0;
});

mut('E12 the migration writes without a reviewed checksum', function () {
  var mSrc = swap(MIG, "  var reviewed = tempFsoaStr_(TEMP_FSOA_R5_REVIEWED_CHECKSUM_);",
    "  var reviewed = tempFsoaStr_(TEMP_FSOA_R5_REVIEWED_CHECKSUM_) || tempFsoaAnalyze_(ss).checksum;");
  var W = planWorld(800, 300, 1000, { audit: 'absent', mig: mSrc });
  var r = W.s.call('TEMP_FSOA_R5_MIGRATE_COMMIT()');
  var H = planWorld(800, 300, 1000, { audit: 'absent' });
  var hr = H.s.call('TEMP_FSOA_R5_MIGRATE_COMMIT()');
  return r.committed === true && hr.verdict === 'REFUSED_NO_REVIEWED_CHECKSUM' && hr.writes === 0;
});

mut('E13 the migration stops re-checking under the lock, so a reviewed plan authorises a moved state', function () {
  var mSrc = swap(MIG, "    if (!mid.ok || mid.checksum !== reviewed) {", "    if (false) {");
  function run(src) {
    var W = planWorld(800, 300, 1000, { audit: 'absent', mig: src });
    var live = W.s.call('TEMP_FSOA_R5_MIGRATE_DRY_RUN()').checksum;
    // The reviewed checksum is pasted, and then the state MOVES: the table appears with a foreign header.
    var W2 = planWorld(800, 300, 1000, { audit: 'absent',
      mig: swap(src, "var TEMP_FSOA_R5_REVIEWED_CHECKSUM_ = '';",
        "var TEMP_FSOA_R5_REVIEWED_CHECKSUM_ = '" + live + "';") });
    // Make the state move at the moment the lock is taken, by giving the world a ledger the plan did not see.
    W2.w.S['factory_stock_override_audit'] = new FakeSheet('factory_stock_override_audit', ['not_the_schema']);
    return W2.s.call('TEMP_FSOA_R5_MIGRATE_COMMIT()');
  }
  var mr = run(mSrc), hr = run(MIG);
  // The honest file refuses; the mutant reaches the create attempt on a state nobody reviewed.
  return /REFUSED/.test(String(hr.verdict)) && !/REFUSED_STATE_MOVED_UNDER_LOCK/.test(String(mr.verdict));
});

mut('E14 the ledger requirement accepts a reordered header, so the row is filed under the wrong columns',
  function () {
    var mSrc = swap(G71, "  if (!out.order_matches) { out.reason = 'COLUMN_ORDER_MISMATCH'; return out; }",
      "  if (false) { out.reason = 'COLUMN_ORDER_MISMATCH'; return out; }");
    var ro = AUDIT_HEADERS.slice();
    var t = ro[12]; ro[12] = ro[13]; ro[13] = t;
    var W = planWorld(800, 300, 1000, { audit: ro, g71: mSrc });
    var r = confirmOnce(W).send();
    var H = planWorld(800, 300, 1000, { audit: ro });
    var hr = confirmOnce(H).send();
    return r.success === true && hr.code === 'FACTORY_STOCK_OVERRIDE_AUDIT_SCHEMA_MISSING';
  });


mut('E15 the census filters the pool by the requesting company, hiding a cross-company overcommit', function () {
  // The one defect the whole guard exists to close, aimed at the CENSUS: company / country / marketplace are
  // the DESTINATION. Filtering exposure by company before the arithmetic is precisely how two companies came
  // to plan the same cartons, and a census that did it would report FW-CN as healthy at 800 of 1000.
  var mSrc = swap(G71, '  var pEx = KMFSG.planExposure(plans, planLines, { selfPlanId: opts.selfPlanId || \'\' });',
    '  var pEx = KMFSG.planExposure(plans.filter(function (p) { return String(p.company) === \'ResUS\'; }),'
    + ' planLines, { selfPlanId: opts.selfPlanId || \'\' });');
  var bad = runCensus({ g71: mSrc });
  var good = runCensus();
  return good.res.pools_already_over_committed.length === 1
    && good.res.pools_already_over_committed[0].available_to_allocate === -200
    && bad.res.pools_already_over_committed.length === 0;
});

mut('E16 the per-pool arithmetic is collapsed to one SKU total across every factory warehouse', function () {
  // Two physical factories are not one bigger factory. Collapsed, FW-CN and FW-TW would show 1900 of stock
  // against 1200 of exposure and the overcommit would vanish — while the cartons in Taiwan still cannot be
  // loaded onto a container in China.
  var mSrc = swap(read('assets/js/core/supply-planning-factory-stock-guard.js'),
    "  if (p) return 'POOL:' + p + '||' + s;",
    "  if (p) return 'POOL:' + p + '||' + s;" + NL + '  return s;');
  var tmp = path.join(require('os').tmpdir(), 'kmfsg_e16_' + Date.now() + '.js');
  fs.writeFileSync(tmp, mSrc, 'utf8');
  var mutModule = require(tmp);
  var good = runCensus();
  var badPools = mutModule.availableToAllocate({
    balances: mutModule.normalizeBalances(CW.factory_stock, { eligibleWarehouseIds: { 'FW-CN': 1, 'FW-TW': 1 } }),
    draftExposure: mutModule.draftExposure(CW.drafts, CW.draft_lines, {}),
    planExposure: mutModule.planExposure(CW.plans, CW.plan_lines, {})
  });
  try { fs.unlinkSync(tmp); } catch (e) {}
  var badOver = badPools.pool_keys.filter(function (k) { return badPools.byPool[k].available_to_allocate < 0; });
  return good.res.pool_count === 2 && good.res.pools_already_over_committed.length === 1
    && badPools.pool_keys.length === 1 && badOver.length === 0;
});

mut('E17 the census writes — writes: 0 becomes a literal nobody checked', function () {
  // `writes: 0` is a field in an object. It is worth exactly as much as the absence of a write API on every
  // path that can reach it, which is why F4a walks the closure and F5 runs the thing.
  var mSrc = swap(G71, '  Logger.log(JSON.stringify(out, null, 2));' + NL + '  return out;' + NL + '}',
    "  ss.getSheetByName('factory_stock').getRange(2, 3).setValue(0);" + NL
    + '  Logger.log(JSON.stringify(out, null, 2));' + NL + '  return out;' + NL + '}');
  var bad = runCensus({ g71: mSrc });
  var good = runCensus();
  // The mutant's write is REFUSED by the rigged sheet, so it dies on the attempt. What distinguishes the
  // two is the attempt log — not the `writes: 0` field, which the mutant would have reported just as
  // cheerfully had the sheet let it through. That is the whole reason this probe runs the code.
  return good.threw === null && good.attempts.length === 0 && good.res.writes === 0
    && bad.attempts.length > 0
    && (bad.threw !== null || (bad.res && bad.res.writes === 0));
});

mut('E18 an unreadable database is reported as a census with nothing over-committed', function () {
  // The most dangerous shape this function can take: a clean bill of health issued by a read that failed.
  var mSrc = swap(G71, '  if (facts.ok) {' + NL + '    out.tables_read = facts.tables_read;',
    '  out.pools_already_over_committed = [];' + NL
    + '  if (facts.ok) {' + NL + '    out.tables_read = facts.tables_read;');
  var bad = runCensus({ factory_stock_absent: true, g71: mSrc });
  var good = runCensus({ factory_stock_absent: true });
  return good.res.ok === false && good.res.pools_already_over_committed === undefined
    && bad.res.ok === false && Array.isArray(bad.res.pools_already_over_committed)
    && bad.res.pools_already_over_committed.length === 0;
});

// ================================================================================================================
console.log(NL + '-'.repeat(112));
console.log('OVERRIDE AUDIT PROVISIONING + TRANSACTION ROLLBACK (' + STAMP + '):');
console.log('passed ' + pass + '  failed ' + fail + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
console.log('-'.repeat(112));
process.exit(fail === 0 ? 0 : 1);
