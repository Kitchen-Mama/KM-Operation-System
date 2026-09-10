// Kitchen Mama Operation System — F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5
// Shared factory stock guard (AI hard limit) + Weekly Shipping Plan manual overage approval.
// Run: node assets/tests/shared-factory-stock-guard-and-overage-approval-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r5.test.js
//
// THE DEFECT THIS ROUND CLOSES, AS MEASURED BY THE CENSUS RATHER THAN SUPPOSED.
//
// `gapOpReadSupplyPoolFacts_` (43_:438) builds the FACTORY supply pool from `factory_stock.fac_current_stock`
// and nothing else. It does not subtract `fac_reserved_stock`, and it does not read one persisted plan. Inside a
// single generation KMMSA/KMALLOC then conserves that pool correctly across competing receivers — so one run has
// never over-allocated itself. But a manual Execution Plan, a draft from a previous run, another marketplace,
// another COMPANY, and a Weekly Shipping Plan already sitting in Pending Approval are every one of them a live
// claim on the same physical cartons at the same factory warehouse, and NOTHING in the system added them up.
// Two companies could each plan the same 520 units and both plans would report healthy.
//
// TWO MECHANISMS, ONE ARITHMETIC, AND THEY ARE NOT THE SAME OVERRIDE.
//
//   A. AI generation is HARD-LIMITED. `evaluateAiGuard` accepts no token, no reason and no actor. A shortfall it
//      cannot settle with the FROZEN allocation priority is a STOP, not a smaller plan invented on the spot.
//   B. A HUMAN with existing submit authority may accept an overage at Draft -> Pending Approval, against a
//      FINGERPRINTED snapshot, with a reason, recorded in an append-only audit.
//
// Both read `availableToAllocate`. If they did not, the person would be confirming an overage against a
// different number from the one the AI refused, which is worse than having no guard at all.
//
// WHAT IS EXECUTED HERE, and what is read as source. Every arithmetic assertion RUNS the shipped pure module
// (KMFSG, from assets/js/core/, which is also the bundled global). Every seam assertion RUNS the shipped
// server functions from 71_ against fake sheets — the sheet reads, the exposure joins, the audit append and the
// stale-confirmation refusal are all really executed. The Draft -> Pending Approval flow RUNS 11_'s real
// `spUpdateShippingPlanStatusCore_` with the real gate wired to it, which is the only way to prove that a
// refusal mutates nothing: the status cell is inspected afterwards. Only ORDERING facts that cannot be observed
// from outside (the guard sits before the writer; the lock encloses the recheck) are read from source — and each
// of those carries a mutant that proves the reading is load-bearing.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
// Sources are LF-normalised at the boundary. The working copy is CRLF (core.autocrlf=true) and the committed
// blobs are LF, so a multi-line anchor written in this file would match on one machine and not the other —
// and a mutation whose target is 'absent' changes nothing, which is the one way a mutant lies.
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
var GS = 'assets/specs/active/apps-script/';
var NL = String.fromCharCode(10);

var STAMP = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5';
var RO = require('./_release-order.js');

var G61 = read(GS + '61_api_v1_weekly_ai_plan.gs');
var G11 = read(GS + '11_shipping_plan_handlers.gs');
var G63 = read(GS + '63_api_v1_system_health.gs');
var G71 = read(GS + '71_api_v1_factory_stock_guard.gs');
var G01 = read(GS + '01_router.gs');
var G21 = read(GS + '21_factory_inventory_handlers.gs');
var G16 = read(GS + '16_shipping_allocation_handlers.gs');
var BUNDLE = read(GS + '90_generated_supply_planning_bundle.gs');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var PAGE = read('assets/js/pages/shipping-plan.js');
var IDX = read('index.html');
var CORE = read('assets/js/core/supply-planning-factory-stock-guard.js');

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
// Source swap that REFUSES to be a no-op. A mutant whose target is absent changes nothing and would be
// "caught" by an assertion that was never challenged.
function swap(src, find, repl) {
  if (src.indexOf(find) === -1) throw new Error('mutation target absent: ' + find.slice(0, 90));
  return src.split(find).join(repl);
}

// The shipped pure module, required directly. It is the SAME file the bundle wraps (F-section proves that).
var KMFSG = require('../js/core/supply-planning-factory-stock-guard.js');

// ================================================================================================================
// A FAKE SPREADSHEET, and the shipped 71_ seam running on top of it.
// ================================================================================================================
function FakeSheet(headers) { this.rows = [headers.slice()]; }
FakeSheet.prototype.getLastColumn = function () { return this.rows[0].length; };
FakeSheet.prototype.getLastRow = function () { return this.rows.length; };
FakeSheet.prototype.getDataRange = function () {
  var s = this;
  return { getValues: function () { return s.rows.map(function (r) { return r.slice(); }); } };
};
FakeSheet.prototype.appendRow = function (r) { this.rows.push(r.slice()); };
FakeSheet.prototype.getRange = function (row, col, nr, nc) {
  var s = this;
  return {
    getValues: function () {
      var o = [];
      for (var i = 0; i < (nr || 1); i++) {
        var l = [];
        for (var j = 0; j < (nc || 1); j++) l.push(s.rows[row - 1 + i][col - 1 + j]);
        o.push(l);
      }
      return o;
    },
    setValue: function (v) { s.rows[row - 1][col - 1] = v; },
    getValue: function () { return s.rows[row - 1][col - 1]; }
  };
};

function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function ' + name + '\\s*\\(');
  var m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var i = src.indexOf('{', m.index);
  var d = 0, q = null, line = false, block = false;
  for (var j = i; j < src.length; j++) {
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

// The 25 columns the runtime REQUIRES, read from the shipped authority. A fixture carrying its own copy is a
// fixture that can pass against a schema production refuses.
var FSG_AUDIT_HEADERS = (function () {
  var m = /var FSG_OVERRIDE_AUDIT_HEADERS_ = \[([\s\S]*?)\];/.exec(G71);
  if (!m) throw new Error('FSG_OVERRIDE_AUDIT_HEADERS_ not found in 71_');
  return m[1].split(',').map(function (t) { return t.replace(/[\s'"]/g, ''); }).filter(Boolean);
})();

// Build a world: factory stock, warehouses, allocation drafts + lines, shipping plans + lines, marketplaces.
// `spec` supplies rows; anything omitted is an empty (but PRESENT) table, because an absent table is a
// different fact from an empty one and this guard reports them differently.
function World(spec) {
  spec = spec || {};
  var S = {};
  function sheet(name, headers, rows) {
    S[name] = new FakeSheet(headers);
    (rows || []).forEach(function (r) { S[name].appendRow(headers.map(function (h) { return r[h] === undefined ? '' : r[h]; })); });
  }
  sheet('warehouses', ['warehouse_id', 'warehouse_code', 'warehouse_type', 'company', 'country', 'is_active', 'is_factory_warehouse'],
    spec.warehouses || [{ warehouse_id: 'FW-CN', warehouse_type: 'FACTORY', company: 'ResUS', country: 'CN', is_active: true, is_factory_warehouse: true },
      { warehouse_id: 'FW-TW', warehouse_type: 'FACTORY', company: 'ResUS', country: 'TW', is_active: true, is_factory_warehouse: true },
      { warehouse_id: 'WH-3PL', warehouse_type: '3PL', company: 'ResUS', country: 'US', is_active: true, is_factory_warehouse: false }]);
  sheet('factory_stock', ['warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock'], spec.factory_stock || []);
  sheet('shipping_allocation_drafts', ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country',
    'marketplace', 'status', 'recommended_source_warehouse_id', 'generation_type', 'generation_run_id', 'note'],
    spec.drafts || []);
  sheet('shipping_allocation_draft_lines', ['allocation_draft_line_id', 'allocation_draft_id', 'sku',
    'source_warehouse_id', 'planned_qty', 'recommended_qty', 'line_status'], spec.draft_lines || []);
  sheet('shipping_plans', ['shipping_plan_id', 'parent_shipping_plan_id', 'company', 'country', 'marketplace',
    'source_warehouse_id', 'status', 'plan_version', 'submitted_by', 'submitted_at', 'approved_by', 'approved_at',
    'rejected_by', 'rejected_at', 'rejected_reason', 'cancelled_by', 'cancelled_at', 'note', 'updated_by',
    'updated_at', 'transferred_to_shipment_at', 'transferred_shipment_id'], spec.plans || []);
  sheet('shipping_plan_lines', ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'requested_qty', 'approved_qty'],
    spec.plan_lines || []);
  sheet('marketplaces', ['company', 'country', 'marketplace', 'allocation_priority'], spec.marketplaces || []);
  // R6-R7-R5-R1 §A — THE LEDGER IS PROVISIONED BY DEFAULT, and that is a change of fixture because it is a
  // change of contract: the runtime used to be described as creating this table on first write (it never
  // could — fcWriteEnsureSheet_ is prodRequireSheet_, which THROWS), and it now REQUIRES it and refuses a
  // confirmation it cannot record. `audit_table_absent: true` builds the un-provisioned world on purpose;
  // the P2 suite is where that world is tested.
  if (spec.audit_table_absent !== true) {
    sheet('factory_stock_override_audit', spec.audit_headers || FSG_AUDIT_HEADERS, spec.audit || []);
  }
  this.S = S;
  this.ss = {
    getSheetByName: function (n) { return S[n] || null; },
    insertSheet: function (n) { S[n] = new FakeSheet(['__placeholder']); return S[n]; }
  };
  this.writes = [];
}
World.prototype.plan = function (id) {
  var sh = this.S['shipping_plans'];
  var v = sh.getDataRange().getValues();
  var H = v[0].map(String);
  for (var r = 1; r < v.length; r++) {
    if (String(v[r][H.indexOf('shipping_plan_id')]) === id) {
      var o = {};
      H.forEach(function (h, i) { o[h] = v[r][i]; });
      return o;
    }
  }
  return null;
};
World.prototype.auditRows = function () {
  var sh = this.S['factory_stock_override_audit'];
  if (!sh) return [];
  var v = sh.getDataRange().getValues();
  var H = v[0].map(function (h) { return String(h); });
  return v.slice(1).map(function (r) { var o = {}; H.forEach(function (h, i) { o[h] = r[i]; }); return o; });
};

// The shipped 71_ seam, plus the shipped 11_ core, executed in one context — exactly the ONE global scope Apps
// Script gives them.
var LAST_LOCK = null;
function seam(world, opts) {
  opts = opts || {};
  var sb = {
    console: console, JSON: JSON, String: String, Number: Number, Object: Object, Array: Array, Math: Math,
    Date: Date, isFinite: isFinite, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, Error: Error,
    RegExp: RegExp, Boolean: Boolean
  };
  sb.KMFSG = KMFSG;
  sb.SpreadsheetApp = { getActiveSpreadsheet: function () { return world.ss; } };
  sb.Utilities = { formatDate: function () { return opts.now || '2026-09-08 10:00:00'; },
    getUuid: function () { return 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'; } };
  sb.Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
  sb.Logger = { log: function () {} };
  LAST_LOCK = { tried: 0, released: 0, available: opts.lockAvailable !== false };
  sb.LockService = { getScriptLock: function () {
    return { tryLock: function () { LAST_LOCK.tried++; return LAST_LOCK.available; },
      releaseLock: function () { LAST_LOCK.released++; } };
  } };
  var ctx = vm.createContext(sb);
  // jsonResponse_ returns the object itself, so an assertion reads the payload rather than a serialized blob.
  vm.runInContext('function jsonResponse_(o) { return o; }', ctx);
  // The two sheet helpers 71_ uses to create the append-only audit ledger additively, exactly as 21_ does.
  vm.runInContext([
    // PRODUCTION SEMANTICS, not a convenience. fcWriteEnsureSheet_ IS prodRequireSheet_ (29_): it validates
    // and it THROWS SCHEMA_NOT_PROVISIONED on an absent sheet. RULE S0-3 moved every create behind an
    // authorized migration DTO, and a standing suite asserts no ensure-helper contains insertSheet. The
    // previous stub in this file CREATED the sheet, which is how R5 came to describe a lazy create that
    // could never have happened.
    'function fcWriteEnsureSheet_(ss, name) {',
    '  var sh = ss.getSheetByName(name);',
    '  if (!sh) throw new Error("SCHEMA_NOT_PROVISIONED: " + name);',
    '  return sh;',
    '}',
    'function fcWriteEnsureColumns_() {}',
    'function gapTruthy_(v) { return /^(true|yes|1|y)$/i.test(String(v == null ? "" : v).trim()); }',
    'function gapCanonCountry_(c) { return String(c == null ? "" : c).trim().toUpperCase(); }',
    // The canonical sheet reader, in the same shape gapReadObjects_ returns.
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
    // 69_'s provenance classifier, as 71_ reaches for it.
    'function aiplIsAiGenerated_(row) {',
    '  var gt = String((row && row.generation_type) || "").toLowerCase();',
    '  if (gt === "user_created") return false;',
    '  if (gt === "system_generated" || gt === "scheduled" || gt === "manual_refresh") return true;',
    '  return !!String((row && row.generation_run_id) || "");',
    '}'].join(NL), ctx);
  vm.runInContext(opts.g71 || G71, ctx, { filename: '71_' });
  // 11_: the timestamp helper, the recovery state, the CORE and its lock WRAPPER.
  vm.runInContext(extractFn(G11, 'shippingPlanTimestamp_'), ctx);
  vm.runInContext(extractFn(G11, 'spApprovalRecoveryState_'), ctx);
  vm.runInContext(extractFn(opts.g11 || G11, 'spUpdateShippingPlanStatusCore_'), ctx);
  vm.runInContext(extractFn(opts.g11 || G11, 'handleUpdateShippingPlanStatus_'), ctx);
  // Approve attempts the Shipment Draft. That is 12_'s job and a separate authority; here it is SUPPLIED and
  // NAMED so the boundary of what is real stays visible. It never touches inventory.
  vm.runInContext('function createShipmentFromApprovedPlan_() { return { created: true, shipment_id: "SHP-X", line_count: 1 }; }', ctx);
  vm.runInContext('function shipmentFindForPlan_() { return ""; }', ctx);
  vm.runInContext('function sheetEnsureColumns_() {}', ctx);
  return {
    call: function (expr) { return vm.runInContext(expr, ctx); },
    transition: function (body) {
      return vm.runInContext('handleUpdateShippingPlanStatus_(' + JSON.stringify(body) + ')', ctx);
    },
    aiGuard: function (claims, o) {
      return vm.runInContext('fsgEvaluateAiClaims_(SpreadsheetApp.getActiveSpreadsheet(), '
        + JSON.stringify(claims) + ', ' + JSON.stringify(o || {}) + ')', ctx);
    },
    facts: function (o) {
      return vm.runInContext('fsgReadInventoryFacts_(SpreadsheetApp.getActiveSpreadsheet(), '
        + JSON.stringify(o || {}) + ')', ctx);
    }
  };
}

// ================================================================================================================
section('A. §1/§2 — THE INVENTORY AUTHORITY AND THE DEDUP IDENTITY');
// ================================================================================================================
// The census answers §1 by reading the shipped code rather than by describing it.

ok(/fac_current_stock/.test(G21) && /fac_reserved_stock/.test(G21),
  'A1  the canonical factory balance columns are fac_current_stock / fac_reserved_stock (21_)');
ok(/available:\s*cur\s*-\s*res/.test(G21),
  'A1a and 21_ derives available as current - reserved, which is NOT a stored column');
ok(/var FSTX_RESERVATION_OWNER_TYPE_ = 'shipment';/.test(G21),
  'A2  the ONLY reservation owner in the frozen model is a shipment (21_:405)');
ok(/reservation_expected: false/.test(G61),
  'A2a and the AI Plan activation manifest declares that a draft reserves NOTHING');
ok(/'reservations'/.test(G61) && /tables_guaranteed_zero_mutation/.test(G61),
  'A2b with `reservations` named in tables_guaranteed_zero_mutation');
// The guard therefore DERIVES draft/plan exposure and creates no reservation of its own.
ok(!/factoryStockAcquireReservationTx_|reservedDelta/.test(G71),
  'A3  the guard seam acquires NO reservation and writes no reserved delta');
// Comment-stripped: this file's header NAMES 12_'s reservation helper in order to explain that the guard
// does not call it, and a prose mention must not read as a call.
function codeOnly(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
ok(!/factoryStockAcquireReservationTx_|reservedDelta|fac_reserved_stock\s*=/.test(codeOnly(CORE)),
  'A3a and neither does the pure authority');

eq(KMFSG.poolKey('FW-CN', 'CO1100-R'), 'WH:FW-CN||CO1100-R', 'A4  the pool key is warehouse_id || sku');
eq(KMFSG.poolKey('', 'CO1100-R'), '', 'A4a a blank warehouse yields NO pool key — never a catch-all bucket');
eq(KMFSG.poolKey('FW-CN', ''), '', 'A4b and neither does a blank sku');
eq(KMFSG.poolKey('FW-CN', 'CO1100-R', 'POOL-1'), 'POOL:POOL-1||CO1100-R',
  'A4c an explicit inventory_pool_id takes precedence, so a future migration needs no code change here');

// §6 — the lifecycle matrix, read from the shipped tables rather than from prose.
eq(Object.keys(KMFSG.DRAFT_EXPOSURE_STATUSES).sort(), ['draft', 'partially_submitted', 'site_confirmed'],
  'A5  §6 an allocation draft holds exposure in exactly {draft, site_confirmed, partially_submitted}');
eq(Object.keys(KMFSG.DRAFT_RELEASED_STATUSES).sort(), ['cancelled', 'expired', 'submitted'],
  'A5a and submitted/cancelled/expired hold nothing');
eq(Object.keys(KMFSG.PLAN_EXPOSURE_STATUSES).sort(), ['approved', 'draft', 'pending_approval'],
  'A6  §6 a shipping plan holds exposure in {draft, pending_approval, approved}');
eq(Object.keys(KMFSG.PLAN_RELEASED_STATUSES).sort(), ['cancelled', 'completed'],
  'A6a and cancelled/completed hold nothing');
ok(!KMFSG.PLAN_EXPOSURE_STATUSES.rejected && !KMFSG.PLAN_RELEASED_STATUSES.rejected,
  'A6b `rejected` is in NEITHER set, because 11_ writes status back to draft on reject — it is not a resting status');
eq(Object.keys(KMFSG.DRAFT_LINE_RELEASED_STATUSES).sort(),
  ['cancelled', 'expired', 'superseded', 'superseded_user_review'],
  'A7  §6 a superseded / cancelled / expired LINE holds nothing, and a submitted line still does');

// The lifecycle vocabulary must not drift from 16_'s own enum, which is the writer's authority.
ok(/var SAD_STATUSES_ = \{ draft: 1, site_confirmed: 1, submitted: 1, cancelled: 1, expired: 1 \};/.test(G16),
  'A8  16_ SAD_STATUSES_ is still the five-member header enum the matrix above was derived from');
ok(/var ACTIVE = \{ draft: 1, site_confirmed: 1, partially_submitted: 1 \}/.test(G16),
  'A8a and 16_\'s own ACTIVE literal is byte-for-byte the exposure set');

// The DEDUP identity: the two boundaries, in the shipped writers.
ok(/setCol\('status', 'submitted'\)/.test(G16),
  'A9  DRAFT -> PLAN: 16_ transitions the draft to `submitted` …');
ok(/POSTCHECK_FAILED_ROLLED_BACK/.test(G16),
  'A9a … only after the plan is committed and read back, with a verified rollback if it cannot be confirmed');
ok(/setPlanCell_\('transferred_shipment_id', shipmentId\);/.test(read(GS + '12_shipment_handlers.gs')),
  'A10 PLAN -> SHIPMENT: 12_ stamps transferred_shipment_id …');
ok(/factoryStockAcquireReservationTx_\(/.test(read(GS + '12_shipment_handlers.gs')),
  'A10a … in the same journalled operation that ACQUIRES the factory reservation');
ok(/TRANSFERRED_TO_SHIPMENT/.test(CORE),
  'A10b so the guard releases a transferred plan by name — its units are already inside fac_reserved_stock');

// ================================================================================================================
section('B. §2 — available_to_allocate, EXECUTED, and never filtered by company');
// ================================================================================================================
function availability(spec, selfPlanId) {
  var w = new World(spec);
  var s = seam(w);
  var f = s.facts({ selfPlanId: selfPlanId || '' });
  return { world: w, seam: s, facts: f };
}

var B = availability({
  factory_stock: [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 1000, fac_reserved_stock: 100 }],
  // THREE companies, one physical pool. This is the whole point of §2.
  drafts: [{ allocation_draft_id: 'D-MAN', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
      generation_type: 'user_created', recommended_source_warehouse_id: 'FW-CN' },
    { allocation_draft_id: 'D-OTHERCO', company: 'OtherCo', country: 'JP', marketplace: 'Rakuten', status: 'draft',
      generation_type: 'user_created', recommended_source_warehouse_id: 'FW-CN' }],
  draft_lines: [{ allocation_draft_line_id: 'L1', allocation_draft_id: 'D-MAN', sku: 'SKU1', source_warehouse_id: 'FW-CN', planned_qty: 200 },
    { allocation_draft_line_id: 'L2', allocation_draft_id: 'D-OTHERCO', sku: 'SKU1', source_warehouse_id: 'FW-CN', planned_qty: 150 }],
  plans: [{ shipping_plan_id: 'SP-PEND', company: 'ThirdCo', country: 'DE', marketplace: 'Amazon',
    source_warehouse_id: 'FW-CN', status: 'pending_approval' }],
  plan_lines: [{ shipping_plan_line_id: 'PL1', shipping_plan_id: 'SP-PEND', sku: 'SKU1', requested_qty: 50 }]
});
ok(B.facts.ok, 'B1  the guard read every table it needs', B.facts.reason);
eq(B.facts.tables_read.sort(),
  ['factory_stock', 'marketplaces', 'shipping_allocation_draft_lines', 'shipping_allocation_drafts',
    'shipping_plan_lines', 'shipping_plans', 'warehouses'],
  'B1a and it is the ONLY reader: five exposure tables plus warehouses and marketplaces, once');
var bp = B.facts.available.byPool['WH:FW-CN||SKU1'];
eq(bp.factory_current_stock, 1000, 'B2  factory current stock 1000');
eq(bp.factory_reserved_stock, 100, 'B2a of which 100 is reserved by a shipment');
eq(bp.factory_available_stock, 900, 'B2b so the physical available is 900 (current - reserved)');
eq(bp.active_allocation_draft_qty, 350,
  'B3  draft exposure is 350 — ResUS 200 PLUS OtherCo 150, summed ACROSS COMPANIES');
eq(bp.active_shipping_plan_qty, 50, 'B3a plus a third company\'s Pending Approval plan');
eq(bp.already_allocated_qty, 400, 'B3b already allocated 400');
eq(bp.available_to_allocate, 500, 'B4  available_to_allocate = 900 - 400 = 500');
ok(/never filtered by company/.test(KMFSG.CONTRACT),
  'B4a and the contract says so, because filtering first is exactly how two companies plan the same units');

// A2/§9.7 — two PHYSICAL pools are never added together.
var B7 = availability({
  factory_stock: [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 100 },
    { warehouse_id: 'FW-TW', sku: 'SKU1', fac_current_stock: 900 }]
});
eq(B7.facts.available.pool_keys, ['WH:FW-CN||SKU1', 'WH:FW-TW||SKU1'],
  'B5  §9.7 two factory warehouses are TWO pools, never one');
eq(B7.facts.available.byPool['WH:FW-CN||SKU1'].available_to_allocate, 100,
  'B5a and the CN pool offers 100, not 1000 — stock at two factories is not interchangeable');

// Non-factory stock is not in this pool at all.
var B8 = availability({
  factory_stock: [{ warehouse_id: 'WH-3PL', sku: 'SKU1', fac_current_stock: 5000 }]
});
eq(B8.facts.balances.skipped_non_factory, 1,
  'B6  a NON-factory warehouse row in factory_stock is skipped, exactly as 43_ skips it');
eq(B8.facts.available.pool_keys, [], 'B6a and contributes no pool');

// Terminal and transferred rows hold nothing (§9.22).
var B9 = availability({
  factory_stock: [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 1000 }],
  drafts: [{ allocation_draft_id: 'D-SUB', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'submitted', generation_type: 'user_created', recommended_source_warehouse_id: 'FW-CN' },
    { allocation_draft_id: 'D-CAN', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'cancelled', generation_type: 'user_created', recommended_source_warehouse_id: 'FW-CN' },
    { allocation_draft_id: 'D-EXP', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'expired', generation_type: 'user_created', recommended_source_warehouse_id: 'FW-CN' },
    { allocation_draft_id: 'D-LSUP', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft', generation_type: 'user_created', recommended_source_warehouse_id: 'FW-CN' }],
  draft_lines: [{ allocation_draft_line_id: 'x1', allocation_draft_id: 'D-SUB', sku: 'SKU1', source_warehouse_id: 'FW-CN', planned_qty: 900 },
    { allocation_draft_line_id: 'x2', allocation_draft_id: 'D-CAN', sku: 'SKU1', source_warehouse_id: 'FW-CN', planned_qty: 900 },
    { allocation_draft_line_id: 'x3', allocation_draft_id: 'D-EXP', sku: 'SKU1', source_warehouse_id: 'FW-CN', planned_qty: 900 },
    { allocation_draft_line_id: 'x4', allocation_draft_id: 'D-LSUP', sku: 'SKU1', source_warehouse_id: 'FW-CN', planned_qty: 900, line_status: 'superseded' }],
  plans: [{ shipping_plan_id: 'SP-T', company: 'ResUS', country: 'US', marketplace: 'Amazon', source_warehouse_id: 'FW-CN', status: 'approved', transferred_shipment_id: 'SHP-9' },
    { shipping_plan_id: 'SP-C', company: 'ResUS', country: 'US', marketplace: 'Amazon', source_warehouse_id: 'FW-CN', status: 'completed' },
    { shipping_plan_id: 'SP-X', company: 'ResUS', country: 'US', marketplace: 'Amazon', source_warehouse_id: 'FW-CN', status: 'cancelled' }],
  plan_lines: [{ shipping_plan_line_id: 'y1', shipping_plan_id: 'SP-T', sku: 'SKU1', requested_qty: 700 },
    { shipping_plan_line_id: 'y2', shipping_plan_id: 'SP-C', sku: 'SKU1', requested_qty: 700 },
    { shipping_plan_line_id: 'y3', shipping_plan_id: 'SP-X', sku: 'SKU1', requested_qty: 700 }]
});
eq(B9.facts.available.byPool['WH:FW-CN||SKU1'].already_allocated_qty, 0,
  'B7  §9.22 SUPERSEDED / cancelled / expired / submitted / completed / transferred hold NOTHING');
eq(B9.facts.available.byPool['WH:FW-CN||SKU1'].available_to_allocate, 1000,
  'B7a so the whole 1000 is still allocatable');
eq(B9.facts.planExposure.released.TRANSFERRED_TO_SHIPMENT, 1,
  'B7b and the transferred plan is released for the NAMED reason, not by accident');

// §4.18/§6.5 — the plan being rechecked excludes ITSELF from "already allocated".
var B10 = availability({
  factory_stock: [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 1000 }],
  plans: [{ shipping_plan_id: 'SP-ME', company: 'ResUS', country: 'US', marketplace: 'Amazon', source_warehouse_id: 'FW-CN', status: 'draft' },
    { shipping_plan_id: 'SP-OTHER', company: 'ResUS', country: 'US', marketplace: 'Amazon', source_warehouse_id: 'FW-CN', status: 'pending_approval' }],
  plan_lines: [{ shipping_plan_line_id: 'z1', shipping_plan_id: 'SP-ME', sku: 'SKU1', requested_qty: 400 },
    { shipping_plan_line_id: 'z2', shipping_plan_id: 'SP-OTHER', sku: 'SKU1', requested_qty: 300 }]
}, 'SP-ME');
var b10 = B10.facts.available.byPool['WH:FW-CN||SKU1'];
eq(b10.already_allocated_qty, 300, 'B8  §9.18 the recheck excludes the plan itself from already-allocated …');
eq(b10.current_plan_qty, 400, 'B8a … and reports it separately as current_plan_qty');
eq(b10.projected_total_qty, 700, 'B8b so the projected total is 700 and nothing is counted twice');

// ================================================================================================================
section('C. §3 — MECHANISM A: THE AI HARD GUARD, EXECUTED');
// ================================================================================================================
function guard(spec, claims, opts) {
  var w = new World(spec);
  return { verdict: seam(w).aiGuard(claims, opts || {}), world: w };
}
var POOL = [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 1000, fac_reserved_stock: 0 }];
var AI_OLD_FOR_PROVENANCE = {
  drafts: [{ allocation_draft_id: 'D-AI', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
    generation_type: 'system_generated', generation_run_id: 'AIRUN-OLD', recommended_source_warehouse_id: 'FW-CN' }],
  lines: [{ allocation_draft_line_id: 'LA', allocation_draft_id: 'D-AI', sku: 'SKU1',
    source_warehouse_id: 'FW-CN', planned_qty: 200 }]
};
function manual(qty) {
  return {
    drafts: [{ allocation_draft_id: 'D-MAN', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      status: 'draft', generation_type: 'user_created', recommended_source_warehouse_id: 'FW-CN' }],
    draft_lines: [{ allocation_draft_line_id: 'LM', allocation_draft_id: 'D-MAN', sku: 'SKU1',
      source_warehouse_id: 'FW-CN', planned_qty: qty }]
  };
}
function claim(q, rk) {
  return { warehouse_id: 'FW-CN', sku: 'SKU1', quantity: q, submitted_index: 0,
    receiver_key: rk || 'ResUS||US||Amazon', company: 'ResUS', country: 'US', marketplace: rk ? rk : 'Amazon' };
}

// §9.1 — available 1000, protected manual 300, AI asks 700 → PASS, total exactly 1000.
var m = manual(300);
var C1 = guard({ factory_stock: POOL, drafts: m.drafts, draft_lines: m.draft_lines }, [claim(700)]);
eq(C1.verdict.verdict, 'PASS', 'C1  §9.1 available 1000, protected manual 300, AI asks 700 → PASS');
eq(C1.verdict.granted_total, 700, 'C1a granting the full 700');
eq(C1.verdict.byPool['WH:FW-CN||SKU1'].already_allocated_qty + C1.verdict.granted_total, 1000,
  'C1b and the resulting total exposure is EXACTLY 1000 — the pool, to the unit');

// §9.2 — the same pool, AI asks 800. It must NOT become 1100.
var C2 = guard({ factory_stock: POOL, drafts: m.drafts, draft_lines: m.draft_lines }, [claim(800)]);
eq(C2.verdict.verdict, 'CLAMPED', 'C2  §9.2 AI asks 800 against 700 of headroom → CLAMPED');
eq(C2.verdict.granted_total, 700, 'C2a granting 700, not 800');
eq(C2.verdict.clamped_total, 100, 'C2b and reporting the 100 it refused');
ok(C2.verdict.byPool['WH:FW-CN||SKU1'].already_allocated_qty + C2.verdict.granted_total === 1000,
  'C2c total exposure is 1000 and NEVER 1100');

// §9.5 — a MANUAL draft is never released, so it can never be superseded into headroom.
var C5 = guard({ factory_stock: POOL, drafts: m.drafts, draft_lines: m.draft_lines }, [claim(800)],
  { releaseSet: { 'D-MAN': 1 } });
eq(C5.verdict.byPool['WH:FW-CN||SKU1'].already_allocated_qty, 300,
  'C3  §9.5 a MANUAL draft named in the release set is still counted — AI cannot supersede an operator');
// The FIRST run of this suite caught the module honouring the release set for any id, which made "never
// release a manual draft" a property of 61_ rather than of the guard. It is now the guard's own rule, it
// fails closed on unknown provenance, and the refusal is REPORTED so a caller can see it had no effect.
var C5ex = KMFSG.draftExposure(m.drafts, m.draft_lines,
  { releaseSet: { 'D-MAN': 1 }, isAiRow: function (r) { return String(r.generation_type) !== 'user_created'; } });
eq(C5ex.release_refused, [{ allocation_draft_id: 'D-MAN', reason: 'MANUAL_SOURCE_NEVER_RELEASED' }],
  'C3b and the refusal is recorded with its reason');
var C5un = KMFSG.draftExposure(AI_OLD_FOR_PROVENANCE.drafts, AI_OLD_FOR_PROVENANCE.lines, { releaseSet: { 'D-AI': 1 } });
eq(C5un.release_refused[0].reason, 'PROVENANCE_UNKNOWN_NEVER_RELEASED',
  'C3c and with NO provenance classifier it fails CLOSED rather than releasing an unknown row');
ok(/MANUAL_SOURCE/.test(read(GS + '69_api_v1_ai_plan_lifecycle.gs')),
  'C3a because 69_\'s own selector preserves a manual row by name, and 61_ builds the release set from it');

// §9.3 — old AI 200 replaced by new AI 250: exposure nets to +50, never 450 first.
var AI_OLD = {
  drafts: [{ allocation_draft_id: 'D-AI', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
    generation_type: 'system_generated', generation_run_id: 'AIRUN-OLD', recommended_source_warehouse_id: 'FW-CN' }],
  draft_lines: [{ allocation_draft_line_id: 'LA', allocation_draft_id: 'D-AI', sku: 'SKU1',
    source_warehouse_id: 'FW-CN', planned_qty: 200 }]
};
var C3a = guard({ factory_stock: POOL, drafts: AI_OLD.drafts, draft_lines: AI_OLD.draft_lines }, [claim(250)]);
eq(C3a.verdict.byPool['WH:FW-CN||SKU1'].already_allocated_qty, 200,
  'C4  without a release set the run competes with its OWN previous output (200 still counted) …');
var C3b = guard({ factory_stock: POOL, drafts: AI_OLD.drafts, draft_lines: AI_OLD.draft_lines }, [claim(250)],
  { releaseSet: { 'D-AI': 1 } });
eq(C3b.verdict.byPool['WH:FW-CN||SKU1'].already_allocated_qty, 0,
  'C4a … and WITH it the replacement set is released IN MEMORY first');
eq(C3b.verdict.verdict, 'PASS', 'C4b so the regeneration passes');
eq(C3b.verdict.granted_total, 250, 'C4c at its full 250 — a net increase of 50, never a double count of 450');

// §9.6 — another site / company on the same pool is protected exposure.
var C6 = guard({
  factory_stock: POOL,
  drafts: [{ allocation_draft_id: 'D-JP', company: 'OtherCo', country: 'JP', marketplace: 'Rakuten',
    status: 'draft', generation_type: 'user_created', recommended_source_warehouse_id: 'FW-CN' }],
  draft_lines: [{ allocation_draft_line_id: 'LJ', allocation_draft_id: 'D-JP', sku: 'SKU1',
    source_warehouse_id: 'FW-CN', planned_qty: 950 }]
}, [claim(100)]);
eq(C6.verdict.verdict, 'CLAMPED', 'C5  §9.6 another COMPANY on the same pool is protected exposure');
eq(C6.verdict.granted_total, 50, 'C5a leaving only 50 of headroom');

// §9.7 — a claim on a DIFFERENT physical pool is unaffected by the first pool's exposure.
var C7 = guard({
  factory_stock: [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 100 },
    { warehouse_id: 'FW-TW', sku: 'SKU1', fac_current_stock: 900 }]
}, [{ warehouse_id: 'FW-TW', sku: 'SKU1', quantity: 800, submitted_index: 0, receiver_key: 'ResUS||US||Amazon' }]);
eq(C7.verdict.verdict, 'PASS', 'C6  §9.7 a claim on FW-TW is judged against FW-TW alone');
eq(C7.verdict.granted_total, 800, 'C6a granting 800 from the 900 that pool actually holds');

// §9.10 — concurrent claims on one pool must not over-allocate; and a tie cannot be split.
var C10 = guard({ factory_stock: [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 100 }],
  marketplaces: [{ company: 'ResUS', country: 'US', marketplace: 'Amazon', allocation_priority: 5 },
    { company: 'ResUS', country: 'US', marketplace: 'Walmart', allocation_priority: 5 }] },
  [{ warehouse_id: 'FW-CN', sku: 'SKU1', quantity: 80, submitted_index: 0, receiver_key: 'ResUS||US||Amazon' },
   { warehouse_id: 'FW-CN', sku: 'SKU1', quantity: 80, submitted_index: 1, receiver_key: 'ResUS||US||Walmart' }]);
eq(C10.verdict.verdict, 'STOP',
  'C7  §9.10 two receivers competing for 100 with EQUAL priority → STOP, never 160 committed');
eq(C10.verdict.stops[0].code, 'FACTORY_STOCK_ALLOCATION_PRIORITY_UNRESOLVED',
  'C7a §3.9 because splitting a tie is an allocation decision this guard may not invent');
eq(C10.verdict.granted_total, 0, 'C7b and it grants nothing at all');

// … but a DISTINCT frozen priority is followed, because that authority already exists.
var C11 = guard({ factory_stock: [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 100 }],
  marketplaces: [{ company: 'ResUS', country: 'US', marketplace: 'Amazon', allocation_priority: 1 },
    { company: 'ResUS', country: 'US', marketplace: 'Walmart', allocation_priority: 9 }] },
  [{ warehouse_id: 'FW-CN', sku: 'SKU1', quantity: 80, submitted_index: 0, receiver_key: 'ResUS||US||Amazon' },
   { warehouse_id: 'FW-CN', sku: 'SKU1', quantity: 80, submitted_index: 1, receiver_key: 'ResUS||US||Walmart' }]);
eq(C11.verdict.verdict, 'CLAMPED', 'C8  with a DISTINCT allocation_priority the frozen order is applied');
eq(C11.verdict.claims[1].granted_qty, 80, 'C8a the higher priority (Walmart, 9) is served in full');
eq(C11.verdict.claims[0].granted_qty, 20, 'C8b and the lower gets the 20 that remain');
eq(C11.verdict.granted_total, 100, 'C8c conserving the pool exactly');
ok(/allocation_priority/.test(read(GS + '43_api_v1_gap_materialization.gs')),
  'C8d and allocation_priority is the EXISTING frozen authority 43_ already reads');

// A pool nobody can name, and a pool with no row, are refusals rather than silent zeros.
var C12 = guard({ factory_stock: [] }, [claim(100)]);
eq(C12.verdict.verdict, 'STOP', 'C9  a claim on a pool with NO factory_stock row STOPs …');
eq(C12.verdict.stops[0].code, 'FACTORY_STOCK_POOL_UNKNOWN',
  'C9a … named, rather than clamped to zero and reported as a plan that generated nothing');

// AI has NO override channel. Not "an unused one" — none.
ok(KMFSG.evaluateAiGuard({ available: { byPool: {}, pool_keys: [] }, claims: [] }).overridable === false,
  'C10 §3.8 the AI verdict declares itself NOT overridable');
var aiSrc = extractFn(CORE, 'evaluateAiGuard');
ok(!/confirmOverage|override_reason|confirmation_token|expectedFingerprint/.test(aiSrc),
  'C10a and evaluateAiGuard\'s body contains no override vocabulary at all');
var C13 = guard({ factory_stock: POOL, drafts: m.drafts, draft_lines: m.draft_lines }, [claim(800)],
  { override_reason: 'other', confirmation_token: 'FSOC-ANY', inventory_override: true });
eq(C13.verdict.granted_total, 700,
  'C10b passing a confirmation to the AI guard changes NOTHING — it is still clamped to 700');

// ================================================================================================================
section('D. §4/§5 — MECHANISM B: THE MANUAL OVERAGE, EXECUTED THROUGH 11_');
// ================================================================================================================
// The real spUpdateShippingPlanStatusCore_ with the real gate. Every refusal is checked for ZERO MUTATION by
// reading the status cell back afterwards, which is the only way that claim can be made honestly.
function planWorld(currentQty, otherQty, stock, opts) {
  opts = opts || {};
  var spec = {
    factory_stock: [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: stock, fac_reserved_stock: 0 }],
    plans: [{ shipping_plan_id: 'SP-ME', company: 'ResUS', country: 'US', marketplace: 'Amazon',
        source_warehouse_id: 'FW-CN', status: opts.status || 'draft', plan_version: 1, note: '' },
      { shipping_plan_id: 'SP-OTHER', company: 'OtherCo', country: 'JP', marketplace: 'Rakuten',
        source_warehouse_id: 'FW-CN', status: 'pending_approval', plan_version: 1 }],
    plan_lines: [{ shipping_plan_line_id: 'PL-ME', shipping_plan_id: 'SP-ME', sku: 'SKU1', requested_qty: currentQty },
      { shipping_plan_line_id: 'PL-OT', shipping_plan_id: 'SP-OTHER', sku: 'SKU1', requested_qty: otherQty }]
  };
  if (opts.audit) { spec.audit = opts.audit; spec.audit_headers = opts.audit_headers; }
  if (opts.audit_table_absent) spec.audit_table_absent = true;
  var w = new World(spec);
  return { w: w, s: seam(w, opts) };
}

// §9.11 — it fits. No modal, no confirmation, straight to Pending Approval.
var D1 = planWorld(400, 300, 1000);
var r1 = D1.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'vic' });
eq(r1.success, true, 'D1  §9.11 a plan that fits goes to Pending Approval');
eq(D1.w.plan('SP-ME').status, 'pending_approval', 'D1a the status really moved');
eq(r1.data.inventory_guard.overage_present, false, 'D1b with overage_present FALSE — no modal is required');
eq(r1.data.inventory_guard.override, null, 'D1c and no override was recorded, because none happened');
ok(LAST_LOCK.tried === 1 && LAST_LOCK.released === 1,
  'D1d and the whole transition ran inside exactly one acquired-and-released ScriptLock');

// §9.12 — it does not fit. Structured challenge, and NOTHING mutates.
var D2 = planWorld(800, 300, 1000);
var r2 = D2.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'vic' });
eq(r2.success, false, 'D2  §9.12 an over-committing plan is REFUSED');
eq(r2.code, 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED', 'D2a with the typed confirmation code');
eq(D2.w.plan('SP-ME').status, 'draft', 'D2b and the plan is STILL a Draft — zero mutation');
eq(r2.zero_write, true, 'D2c stated as zero_write');
eq(r2.data.total_overage_qty, 100, 'D2d the overage is 100 (300 already allocated + 800 vs 1000 available)');
var op = r2.data.overage_pools[0];
eq([op.source_warehouse_id, op.sku, op.factory_available_stock, op.already_allocated_qty,
  op.current_plan_qty, op.projected_total_qty, op.overage_qty],
  ['FW-CN', 'SKU1', 1000, 300, 800, 1100, 100],
  'D2e §4 the response carries pool, SKU, available, already-allocated, this plan, projected and overage');
ok(!!r2.data.inventory_snapshot_fingerprint, 'D2f and an inventory_snapshot_fingerprint');
ok(!!r2.data.confirmation_token, 'D2g and a server challenge token');
eq(r2.data.title, 'Planned Quantity Exceeds Available Factory Stock', 'D2h the exact required title');
ok(/exceeds the currently available factory stock/.test(r2.data.message)
  && /inventory reallocation, incoming production, or another confirmed arrangement/.test(r2.data.message),
  'D2i and the exact required message');
eq(r2.data.buttons, { cancel: 'Cancel', confirm: 'Confirm Overage' }, 'D2j Cancel / Confirm Overage');
eq(r2.data.reason_options.map(function (o) { return o.value; }),
  ['cross_site_reallocation', 'incoming_production_confirmed', 'physical_stock_pending_system_update', 'other'],
  'D2k with the four required reasons');
// §9.19 — the other company's plan is named as affected, which is what "review allocations to other companies
// and marketplaces" requires in order to be actionable.
eq(r2.data.affected.length, 1, 'D3  §9.19 the affected holder is reported …');
eq([r2.data.affected[0].company, r2.data.affected[0].quantity, r2.data.affected[0].references],
  ['OtherCo', 300, ['SP-OTHER']], 'D3a … by company, quantity and plan id, across companies on one pool');

// §9.13 — Cancel is a non-event. The page returns the original refusal and sends nothing.
ok(/if \(!conf\) return res;/.test(PAGE),
  'D4  §9.13 Cancel returns the original refusal and sends NOTHING further');
ok(/_spOverageAsk\(challenge\)\.then/.test(PAGE) && !/while|for \(/.test(extractFn(PAGE, '_spIsOverageChallenge')),
  'D4a and the confirm path is a single follow-up, never a loop');

// §9.15 — missing reason / actor / fingerprint are refusals, and still mutate nothing.
[['no fingerprint', { override_reason: 'other', override_by: 'vic' }, 'FACTORY_STOCK_OVERAGE_FINGERPRINT_REQUIRED'],
 ['no actor', { override_reason: 'other', inventory_snapshot_fingerprint: 'x' }, 'FACTORY_STOCK_OVERAGE_ACTOR_REQUIRED'],
 ['no reason', { override_by: 'vic', inventory_snapshot_fingerprint: 'x' }, 'FACTORY_STOCK_OVERAGE_REASON_REQUIRED'],
 ['an unrecognised reason', { override_by: 'vic', override_reason: 'because I said so', inventory_snapshot_fingerprint: 'x' },
   'FACTORY_STOCK_OVERAGE_REASON_NOT_RECOGNISED']
].forEach(function (t, i) {
  var W = planWorld(800, 300, 1000);
  var r = W.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'vic', overage_confirmation: t[1] });
  eq([r.success, r.code, W.w.plan('SP-ME').status], [false, t[2], 'draft'],
    'D5.' + (i + 1) + ' §9.15 ' + t[0] + ' → refused, and the plan is still a Draft');
});

// §9.16 — a STALE fingerprint is refused and the CURRENT difference is returned.
var D6 = planWorld(800, 300, 1000);
var stale = D6.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'vic',
  overage_confirmation: { inventory_snapshot_fingerprint: 'deadbeef', override_reason: 'other', override_by: 'vic' } });
eq(stale.code, 'FACTORY_STOCK_OVERAGE_SNAPSHOT_STALE', 'D6  §9.16 a stale fingerprint is refused');
eq(D6.w.plan('SP-ME').status, 'draft', 'D6a with zero mutation');
eq(stale.data.latest.total_overage_qty, 100, 'D6b and the response carries the CURRENT overage, not an error alone');
ok(stale.data.stale.current_fingerprint !== 'deadbeef', 'D6c naming both fingerprints so the drift is visible');

// §9.14 — Confirm Overage: Pending Approval + audit, in one operation.
var D7 = planWorld(800, 300, 1000);
var fp7 = D7.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'vic' }).data;
var r7 = D7.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'vic',
  overage_confirmation: { inventory_snapshot_fingerprint: fp7.inventory_snapshot_fingerprint,
    confirmation_token: fp7.confirmation_token, override_reason: 'cross_site_reallocation',
    override_note: 'covered by CN transfer', override_by: 'vic' } });
eq(r7.success, true, 'D7  §9.14 a valid confirmation is accepted');
eq(D7.w.plan('SP-ME').status, 'pending_approval', 'D7a the plan moves to Pending Approval');
var ov = r7.data.inventory_guard.override;
eq([ov.inventory_override, ov.override_reason, ov.override_by, ov.total_overage_qty, ov.audit_persisted],
  [true, 'cross_site_reallocation', 'vic', 100, true],
  'D7b and the override is reported with reason, actor, quantity and a PERSISTED audit');
var arows = D7.w.auditRows();
eq(arows.length, 1, 'D7c one append-only audit row per affected pool');
eq([arows[0].entity_type, arows[0].entity_id, arows[0].transition, arows[0].source_warehouse_id, arows[0].sku],
  ['shipping_plan', 'SP-ME', 'submit', 'FW-CN', 'SKU1'], 'D7d identifying the plan, transition and pool');
eq([arows[0].available_qty_at_check, arows[0].already_allocated_qty, arows[0].requested_plan_qty,
  arows[0].projected_total_qty, arows[0].overage_qty],
  [1000, 300, 800, 1100, 100], 'D7e §4.6 with every required quantity recorded');
eq([arows[0].inventory_override, arows[0].override_reason, arows[0].override_by],
  [true, 'cross_site_reallocation', 'vic'], 'D7f and the override flag, reason and actor');
ok(!!arows[0].inventory_snapshot_fingerprint && !!arows[0].override_at,
  'D7g plus the snapshot fingerprint and the time it was accepted');
ok(/INVENTORY_OVERRIDE total_overage=100/.test(String(D7.w.plan('SP-ME').note)),
  'D7h and a findable breadcrumb on the plan\'s own note');

// An overage cannot be "confirmed" when there is none — otherwise the audit stops meaning anything.
var D8 = planWorld(400, 300, 1000);
var r8 = D8.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'vic',
  overage_confirmation: { inventory_snapshot_fingerprint: 'x', override_reason: 'other', override_by: 'vic' } });
eq(r8.success, true, 'D8  a confirmation sent for a plan that FITS still succeeds …');
eq(r8.data.inventory_guard.override, null, 'D8a … but records NO override: the plan never needed one');
eq(D8.w.auditRows().length, 0, 'D8b and writes no audit row');

// §9.17 — an API caller bypassing the page meets the same guard, because the gate is on the transition.
ok(/if \(action === 'factoryStockGuard\.get'\)/.test(G01),
  'D9  §9.17 the only guard ACTION in the router is a READ …');
ok(!/factoryStockOverage\.confirm|confirmOverage/.test(G01),
  'D9a … there is no confirm endpoint, so no second door to the write');
ok(/fsgGatePlanTransition_\(ss, planId, transition/.test(G11),
  'D9b the gate is inside handleUpdateShippingPlanStatus_\'s own core, which every caller goes through');

// §5 — Pending Approval -> Approved. Silent when unchanged; re-confirmed when the shortfall grew.
var D10 = planWorld(800, 300, 1000, { status: 'pending_approval',
  audit_headers: ['entity_id', 'inventory_override', 'override_reason', 'override_by', 'override_at',
    'overage_qty', 'inventory_snapshot_fingerprint'],
  audit: [] });
// Establish what was confirmed: recompute the fingerprint the way the server does, then record it.
var fpNow = D10.s.call('fsgReadInventoryFacts_(SpreadsheetApp.getActiveSpreadsheet(), { selfPlanId: "SP-ME" }).available.fingerprint');
D10.w.S['factory_stock_override_audit'].appendRow(
  ['SP-ME', true, 'other', 'vic', '2026-09-08 09:00:00', 100, fpNow]);
var r10 = D10.s.transition({ shipping_plan_id: 'SP-ME', transition: 'approve', actor: 'boss' });
eq(r10.success, true, 'D10 §9.20 Approve with an UNCHANGED snapshot passes …');
eq(D10.w.plan('SP-ME').status, 'approved', 'D10a the plan is approved');
eq(r10.data.inventory_guard.recheck.silent, true, 'D10b … SILENTLY — the approver is not asked again');
eq(r10.data.inventory_guard.recheck.snapshot_unchanged, true, 'D10c because the snapshot is the confirmed one');

// §9.21 — the snapshot moved and the overage GREW: re-confirmation required, and nothing mutates.
var D11 = planWorld(800, 300, 600, { status: 'pending_approval',
  audit_headers: ['entity_id', 'inventory_override', 'override_reason', 'override_by', 'override_at',
    'overage_qty', 'inventory_snapshot_fingerprint'],
  audit: [{ entity_id: 'SP-ME', inventory_override: true, override_reason: 'other', override_by: 'vic',
    override_at: '2026-09-08 09:00:00', overage_qty: 100,
    inventory_snapshot_fingerprint: 'a-fingerprint-from-before' }] });
var r11 = D11.s.transition({ shipping_plan_id: 'SP-ME', transition: 'approve', actor: 'boss' });
eq(r11.success, false, 'D11 §9.21 stock fell to 600, so the shortfall grew → Approve is refused');
eq(r11.code, 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED', 'D11a with the confirmation code');
eq(D11.w.plan('SP-ME').status, 'pending_approval', 'D11b and the plan does NOT become approved');
eq(r11.data.current_overage_qty, 500, 'D11c reporting the NEW shortfall of 500');
eq(r11.data.previously_confirmed_overage_qty, 100, 'D11d beside the 100 that was actually accepted');
ok(r11.data.reconfirmation_required === true, 'D11e so a stale acceptance cannot carry a larger overage through');

// reject and cancel REDUCE exposure and are never gated — a plan nobody can cancel is a trap.
var D12 = planWorld(9000, 300, 10, { status: 'pending_approval' });
var r12 = D12.s.transition({ shipping_plan_id: 'SP-ME', transition: 'cancel', actor: 'vic' });
eq([r12.success, D12.w.plan('SP-ME').status], [true, 'cancelled'],
  'D12 a wildly over-committed plan can still be CANCELLED — the gate does not run for cancel');
eq(r12.data.inventory_guard, null, 'D12a and reports no inventory verdict, because none was needed');

// §9.23 — Shipment Draft neither reallocates nor overrides.
eq(KMFSG.evaluateShipmentDraftAdmission({ planStatus: 'approved', approvedSnapshotQty: 800, planRequestedQty: 800 }).admit,
  true, 'D13 §9.23 Shipment Draft admits an approved plan whose snapshot still matches');
eq(KMFSG.evaluateShipmentDraftAdmission({ planStatus: 'approved', approvedSnapshotQty: 900, planRequestedQty: 800 }).code,
  'UPSTREAM_SNAPSHOT_INVALID', 'D13a and REFUSES a moved snapshot rather than repairing the number itself');
eq(KMFSG.evaluateShipmentDraftAdmission({ planStatus: 'pending_approval' }).code,
  'SHIPMENT_DRAFT_REQUIRES_APPROVED_PLAN', 'D13b an unapproved plan is not admissible');
eq(KMFSG.evaluateShipmentDraftAdmission({ planStatus: 'approved', approvedSnapshotQty: 1, planRequestedQty: 1 }).overridable,
  false, 'D13c and it declares NO override channel of its own');
ok(!/fsgGatePlanTransition_|confirmOverage|inventory_override/.test(read(GS + '12_shipment_handlers.gs')),
  'D13d 12_ contains no second override logic');

// ================================================================================================================
section('E. §3/§4 — THE ORDERING FACTS: guard before writer, lock around recheck');
// ================================================================================================================
var k2 = extractFn(G61, 'weeklyAiPlanGenerateK2_');
var iGuard = k2.indexOf('fsgEvaluateAiClaims_');
var iPass2 = k2.indexOf('---- PASS 2: write.');
var iWrite = k2.indexOf('handleUpsertShippingAllocationDraftAtomic_({');
ok(iGuard > 0 && iPass2 > iGuard && iWrite > iPass2,
  'E1  §3 the guard runs BEFORE PASS 2, and PASS 2 is where the only write lives');
ok(k2.indexOf('aiplActivationGate_') < iGuard,
  'E1a after the activation/schema gate, so it is the LAST check before the writer');
// The guard reads the COMPLETE proposed set. A per-group check inside PASS 2 could not see the run's own later
// groups competing for the same pool.
ok(/planned\.forEach\(function \(pl\) \{[\s\S]*?fsgClaims\.push/.test(k2),
  'E2  it builds its claims from the complete PASS-1 set, not one group at a time');
ok(/if \(!fsgVerdict\.ok\)|fsgVerdict\.guard_unavailable/.test(k2),
  'E3  a guard that cannot read the pool REFUSES rather than being treated as finding nothing wrong');
ok(/db_writes: 0/.test(k2.slice(iGuard, iPass2)),
  'E3a and every refusal on that path states db_writes: 0');

var core11 = extractFn(G11, 'spUpdateShippingPlanStatusCore_');
var wrap11 = extractFn(G11, 'handleUpdateShippingPlanStatus_');
ok(/LockService\.getScriptLock/.test(wrap11) && /spUpdateShippingPlanStatusCore_/.test(wrap11),
  'E4  §4.6 the transition is wrapped in a ScriptLock …');
ok(/finally \{ try \{ lock\.releaseLock/.test(wrap11),
  'E4a … released in a finally, so no early return can leak it');
ok(!/LockService/.test(core11),
  'E4b and the core takes no lock of its own, so the recheck and the write are ONE critical section');
var iGate = core11.indexOf('fsgGatePlanTransition_');
var iSet = core11.indexOf("setCell('status'");
ok(iGate > 0 && iSet > iGate, 'E5  the gate is reached BEFORE the first status write');
var iAudit = core11.indexOf('fsgAppendOverrideAudit_');
ok(iAudit > iSet, 'E5a and the audit is appended after it, inside the same lock');
ok(/if \(!fsgGate\.proceed\) return fsgGate\.response;/.test(core11),
  'E6  a refusal returns before any setCell — zero mutation is structural, not asserted');

// The frontend is not the authority.
ok(/it is not the enforcement, which is why the server never trusts it/.test(PAGE),
  'E7  §3 the page says outright that its own check is not the enforcement');
ok(!/factory_available_stock\s*-\s*|available_to_allocate\s*=/.test(PAGE),
  'E7a and it computes no availability of its own');
ok(!/KMFSG/.test(IDX), 'E7b KMFSG is not even loaded in the browser — the page cannot compute a verdict');
ok(/factoryStockGuard\.get/.test(DBAPI) && !/factoryStockGuardConfirm|overage\.confirm/.test(DBAPI),
  'E7c and the adapter exposes a READ only, with no confirm method');

// §3.10 — the VALID_ZERO fast path stays at zero writes: no claim, so nothing to guard.
ok(/if \(fsgClaims\.length\) \{/.test(k2),
  'E8  §3.10 the guard is entered only when a positive claim exists …');
var noAction = k2.indexOf('weeklyAiPlanK2NoAction_');
ok(noAction > 0 && noAction < iGuard,
  'E8a … and the NO_ACTION short circuit returns before it, so a valid zero still writes nothing');

// ================================================================================================================
section('F. RELEASE IDENTITY — one shared authority, and the deployment can be asked for it');
// ================================================================================================================
var fsgB = (G71.match(/var FSG_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var spB = (G11.match(/var SP_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var wapB = (G61.match(/var WAP_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var rtrB = (G01.match(/var RTR_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var sysRel = (G63.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/) || [])[1];
[['71_ FSG', fsgB], ['11_ SP', spB], ['61_ WAP', wapB], ['01_ RTR', rtrB], ['63_ RELEASE', sysRel]]
  .forEach(function (pair, i) {
    ok(RO.stampAtOrAfter(pair[1], STAMP),
      'F1.' + (i + 1) + ' ' + pair[0] + ' is at or after the round that introduced the guard', pair[1]);
  });
// A FLOOR, not an equality, and the reason is a fact about how this series works: a per-module stamp records
// the round the FILE last changed, and marching it to the release is the confusion 63_'s own header warns
// about. R5-R1 changed 71_, 11_ and 63_ and did not change 61_ or 01_, so an exact equality would have to be
// wrong about two of the five. What must still hold exactly is that the RELEASE is at or after every module
// it carries — a deployment cannot be older than its parts.
ok(RO.stampAtOrAfter(sysRel, fsgB) && RO.stampAtOrAfter(sysRel, spB)
  && RO.stampAtOrAfter(sysRel, wapB) && RO.stampAtOrAfter(sysRel, rtrB),
  'F1a and the RELEASE is at or after every module stamp it ships');
[['71_api_v1_factory_stock_guard.gs', 'FSG_BUILD_VERSION_', fsgB],
 ['11_shipping_plan_handlers.gs', 'SP_BUILD_VERSION_', spB],
 ['61_api_v1_weekly_ai_plan.gs', 'WAP_BUILD_VERSION_', wapB],
 ['01_router.gs', 'RTR_BUILD_VERSION_', rtrB]
].forEach(function (p, i) {
  ok(new RegExp("file: '" + p[0] + "', symbol: '" + p[1] + "', expected: '" + p[2] + "'").test(G63),
    'F2.' + (i + 1) + ' and 63_\'s manifest row for ' + p[0] + ' expects exactly what it declares');
});
eq((G63.match(/file: '11_shipping_plan_handlers\.gs'/g) || []).length, 1,
  'F2a with exactly ONE row per owner file — a duplicate row is two answers to one question');
var cfg = (read(GS + '00_config.gs').match(/var CONFIG_BUILD_VERSION_ = '([^']+)'/) || [])[1];
ok(cfg !== STAMP && new RegExp("symbol: 'CONFIG_BUILD_VERSION_', expected: '" + cfg + "'").test(G63),
  'F3  00_config.gs did NOT change, so its stamp is not marched forward');
ok(RO.stampAtOrAfter(RO.OWNER_STAMPS[RO.OWNER_STAMPS.length - 1], STAMP),
  'F4  this round is registered in the release order');
// PRODUCT-STRATEGY-P1-B1-R1 - A FLOOR, NOT AN EQUALITY. This pinned 12 as a literal, which was true
// exactly once: R6-R7-R7 adds productPricing.workspace.get and moves the same constant to 13 under the
// same rule this line is about, so the equality turned a CORRECT bump into a regression. That is the
// defect R5-R1's C8 and R5's E3a both named and repaired the same way. What R5 owns is that the
// contract
// moved BECAUSE it added a route, and that nothing may take it back below where R5 left it.
var _f5ac = Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/) || [])[1]);
ok(_f5ac >= 12,
  'F5  the action contract is at or after 12, where R5 moved it because a router ACTION was added',
  _f5ac);
// PRODUCT-STRATEGY-P1-B1-R1 — THE CLAIM IS 'TO MATCH', so it is asserted as a match. Pinning the
// literal 12 said the same thing only while 12 was current; R6-R7-R7 moves both sides to 13 under the
// rule this line is about and the literal turned that into a failure. MATCH is the durable property
// and it is the one the drift mutants (R5-R1 E10) are aimed at.
eq(Number((DBAPI.match(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/) || [])[1]),
  Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/) || [])[1]),
  'F5a and the frontend pins its minimum to MATCH the deployed contract, in the same commit');
eq(Number((G63.match(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+)/) || [])[1]), 1,
  'F5b while the transport envelope is unchanged');
ok(/{ action: 'factoryStockGuard\.get', handler: 'handleFactoryStockGuardGet_'/.test(G63),
  'F6  the new action is registered with its handler …');
ok((G71.match(/function handleFactoryStockGuardGet_\(/g) || []).length === 1,
  'F6a … which is defined exactly once, in 71_');

// The bundle carries the pure module, and it is the SAME bytes as the hand-edited source.
ok(/var KMFSG = __kmModules\["supply-planning-factory-stock-guard"\];/.test(BUNDLE),
  'F7  KMFSG is a global in the generated bundle');
var tool = require('../tools/build-apps-script-bundle.js');
ok(tool.MODULE_ORDER.indexOf('supply-planning-factory-stock-guard') !== -1,
  'F7a registered in the build tool\'s dependency order');
var srcs = {};
tool.MODULE_ORDER.forEach(function (mm) { srcs[mm] = read('assets/js/core/' + mm + '.js'); });
eq(tool.buildBundleFromSources(srcs).code.replace(/\r\n/g, '\n'), BUNDLE.replace(/\r\n/g, '\n'),
  'F7b and the committed bundle is exactly what the tool produces from the canonical modules');
// ONE fingerprint algorithm in the system, proven rather than commented.
var sadFnv = new Function('return ' + /function sadFnv1a_\(str\)[^\n]*/.exec(G16)[0].replace('function sadFnv1a_', 'function'))();
['', 'a', 'WH:FW-CN||SKU1', '1000:0:350:50:0'].forEach(function (s, i) {
  eq(KMFSG.fnv1a(s), sadFnv(s), 'F8.' + (i + 1) + ' KMFSG.fnv1a is byte-identical to 16_ sadFnv1a_');
});
// Cache identity: the two browser files changed, so the co-deployed set must rotate together.
eq(RO.misplacedIndexTokens(IDX), [], 'F9  no cache token is misplaced in index.html');
eq(RO.staleAppTokenRefs(IDX), [], 'F9a and no co-deployed asset was left behind on a previous token');
var tok = RO.currentAppToken();
ok(!!tok && RO.ROUND_TOKENS.indexOf(tok) !== -1, 'F9b index.html carries a REGISTERED round token', tok);

// ================================================================================================================
section('G. §8/§10 — SCHEMA BOUNDARY AND THE SAFETY INVARIANTS');
// ================================================================================================================
// §8 — exactly ONE schema addition, and it is a NEW append-only table. No live header is touched.
eq((G71.match(/var FSG_OVERRIDE_AUDIT_TABLE_ = '([^']+)'/) || [])[1], 'factory_stock_override_audit',
  'G1  §8 the only new table is factory_stock_override_audit');
// R6-R7-R5-R1 §A — THE RUNTIME PROVISIONS NOTHING. The table is created by an authorized migration
// (TEMP_migrate_factory_stock_override_audit_r5.gs) and the runtime REQUIRES it. R5 asserted the opposite
// here and the assertion passed, because it measured a call to a helper whose name says 'ensure' — while
// that helper is prodRequireSheet_, which throws. The assertion was true and meant nothing.
// Comment-stripped: 71_'s header NAMES fcWriteEnsureSheet_ precisely in order to record that it creates
// nothing and is no longer called, and a prose mention must not read as a call.
ok(!/fcWriteEnsureSheet_|fcWriteEnsureColumns_|insertSheet/.test(codeOnly(G71)),
  'G1a  §A the runtime seam contains NO ensure-sheet and NO insertSheet path at all');
ok(/function fsgRequireOverrideAuditSheet_/.test(G71)
  && /FSG_AUDIT_SCHEMA_REFUSAL_ = 'FACTORY_STOCK_OVERRIDE_AUDIT_SCHEMA_MISSING'/.test(G71),
  'G1a1 it REQUIRES the ledger instead, with one named refusal');
var G71schema = extractFn(G71, 'fsgValidateOverrideAuditSchema_');
ok(/dry_run: true, writes: 0/.test(G71schema),
  'G1b with a DRY-RUN validator that writes nothing');
ok(/rollback/.test(G71schema), 'G1c and a stated rollback');
ok(!/SHIPPING_PLANS_HEADERS_\s*=|SHIPPING_PLAN_LINES_HEADERS_\s*=/.test(G71)
  && !/insertColumn|deleteColumn|setName\(/.test(G71),
  'G1d and 71_ adds no column to any existing table and renames nothing');
// §8 — THE LIVE HEADER AUTHORITIES ARE BYTE-UNCHANGED BY THIS ROUND. Compared against HEAD rather than
// described: an appended column is exactly the change §8 forbids without a migration, and the four positional
// gates in 11_ and 16_ fail closed the moment a live header stops matching its authority.
var cp = require('child_process');
[['assets/specs/active/apps-script/11_shipping_plan_handlers.gs', ['SHIPPING_PLANS_HEADERS_', 'SHIPPING_PLAN_LINES_HEADERS_']],
 ['assets/specs/active/apps-script/16_shipping_allocation_handlers.gs', ['SHIPPING_ALLOCATION_DRAFTS_HEADERS_',
   'SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_', 'SAD_LIFECYCLE_TAIL_COLUMNS_', 'SAD_LINE_ETA_TAIL_COLUMNS_']]
].forEach(function (pair) {
  var live = read(pair[0]).replace(/\r\n/g, '\n');
  var head;
  try {
    head = cp.execSync('git show HEAD:"' + pair[0] + '"', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
      .replace(/\r\n/g, '\n');
  } catch (e) { head = null; }
  pair[1].forEach(function (sym) {
    var re = new RegExp('var ' + sym + ' =[\\s\\S]*?\\n\\];');
    var a = re.exec(live);
    ok(!!a, 'G2 ' + sym + ' is still declared in ' + pair[0].split('/').pop());
    if (!a || head === null) return;
    var b = re.exec(head);
    eq(a[0], b ? b[0] : null, 'G2a ' + sym + ' is BYTE-IDENTICAL to HEAD — no column added, none reordered');
  });
});

// §10 — the flag and the allowlist.
var CFG = read(GS + '00_config.gs');
ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(CFG),
  'G3  §10 INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ is still false');
// AN ASSIGNMENT STATEMENT, not a mention. 61_ legitimately names the flag inside an operator-facing message
// ("… is staged OFF (INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false); zero rows …") and inside a comment,
// and it reads the flag through inventoryAiPlanDbGenerationEnabled_(). None of those is a write, and a
// substring test that called them one would fail on prose forever while catching no real assignment.
ok(!/^\s*(?:var\s+)?INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=(?!=)/m.test(G71 + NL + G11 + NL + G61),
  'G3a and no file this round touched contains an ASSIGNMENT to it');
ok((CFG.match(/^\s*var\s+INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=(?!=)/gm) || []).length === 1,
  'G3b the flag is DECLARED in exactly ONE place, and that place is 00_config.gs');
var allow = (CFG.match(/var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[[\s\S]*?\];/) || [])[0] || '';
eq((allow.match(/\{/g) || []).length, 1, 'G4  §10 the activation allowlist still holds exactly one entry');
ok(!/\*/.test(allow), 'G4a with no wildcard');

// The guard writes nothing on any read path.
var readOnly = [extractFn(G71, 'fsgReadInventoryFacts_'), extractFn(G71, 'fsgEvaluateAiClaims_'),
  extractFn(G71, 'fsgEvaluatePlanOverage_'), extractFn(G71, 'handleFactoryStockGuardGet_'),
  extractFn(G71, 'fsgLastConfirmedOverride_')].join(NL);
ok(!/setValue|appendRow|setValues|insertSheet|LockService/.test(readOnly),
  'G5  every read path in the seam is free of setValue / appendRow / insertSheet / LockService');
ok(/appendRow/.test(extractFn(G71, 'fsgAppendOverrideAudit_')),
  'G5a and the ONLY writer in 71_ is the audit append');
ok(/if \(!audit \|\| audit\.inventory_override !== true\) \{ out\.code = 'NO_OVERRIDE_TO_RECORD'/
  .test(extractFn(G71, 'fsgAppendOverrideAudit_')),
  'G5b which refuses to write unless an override was actually confirmed …');
// … and says WHICH of the two it was. `return 0` meant both 'nothing needed writing' and 'the ledger does
// not exist', and those two answers being the same value is what let an unrecordable override through.
ok(/out\.code = req\.code; return out;/.test(extractFn(G71, 'fsgAppendOverrideAudit_')),
  'G5c and a MISSING ledger is a distinct typed refusal, not the same 0');
// The pure module cannot write anything at all.
ok(!/SpreadsheetApp|getRange|appendRow|setValue|LockService|Utilities/.test(CORE),
  'G6  the pure authority touches no spreadsheet API — it is executable and auditable in Node');

// ================================================================================================================
section('H. MUTANTS — §9');
// ================================================================================================================
function poolOf(v) { return v.byPool['WH:FW-CN||SKU1'] || null; }

mut('N1 the company filter isolates the shared pool (each company sees only its own exposure)', function () {
  // The defect this round exists to close: filter exposure by the requesting company first.
  var w = new World({ factory_stock: POOL,
    drafts: [{ allocation_draft_id: 'D-JP', company: 'OtherCo', country: 'JP', marketplace: 'Rakuten',
      status: 'draft', generation_type: 'user_created', recommended_source_warehouse_id: 'FW-CN' }],
    draft_lines: [{ allocation_draft_line_id: 'LJ', allocation_draft_id: 'D-JP', sku: 'SKU1',
      source_warehouse_id: 'FW-CN', planned_qty: 950 }] });
  var honest = seam(w).aiGuard([claim(100)], {});
  // The mutant: drop every row whose company is not the claimant's.
  var mSrc = swap(G71, 'var pEx = KMFSG.planExposure(plans, planLines, { selfPlanId: opts.selfPlanId || \'\' });',
    "plans = plans.filter(function (p) { return String(p.company || '') === 'ResUS'; });"
    + " dHeaders = dHeaders.filter(function (h) { return String(h.company || '') === 'ResUS'; });"
    + " dEx = KMFSG.draftExposure(dHeaders, dLines, {});"
    + " var pEx = KMFSG.planExposure(plans, planLines, { selfPlanId: opts.selfPlanId || '' });");
  var bad = seam(new World({ factory_stock: POOL,
    drafts: [{ allocation_draft_id: 'D-JP', company: 'OtherCo', country: 'JP', marketplace: 'Rakuten',
      status: 'draft', generation_type: 'user_created', recommended_source_warehouse_id: 'FW-CN' }],
    draft_lines: [{ allocation_draft_line_id: 'LJ', allocation_draft_id: 'D-JP', sku: 'SKU1',
      source_warehouse_id: 'FW-CN', planned_qty: 950 }] }), { g71: mSrc }).aiGuard([claim(100)], {});
  return honest.verdict === 'CLAMPED' && poolOf(honest).already_allocated_qty === 950
    && bad.verdict === 'PASS' && poolOf(bad).already_allocated_qty === 0;
});

mut('N2 the current plan double-counts itself at recheck', function () {
  var spec = { factory_stock: POOL,
    plans: [{ shipping_plan_id: 'SP-ME', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      source_warehouse_id: 'FW-CN', status: 'draft', plan_version: 1 }],
    plan_lines: [{ shipping_plan_line_id: 'PL-ME', shipping_plan_id: 'SP-ME', sku: 'SKU1', requested_qty: 600 }] };
  var honest = seam(new World(spec)).transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'v' });
  // The mutant: stop excluding the plan being submitted, so 600 is counted as OTHER exposure too.
  var mSrc = swap(G71, "var pEx = KMFSG.planExposure(plans, planLines, { selfPlanId: opts.selfPlanId || '' });",
    'var pEx = KMFSG.planExposure(plans, planLines, {});'
    + " pEx.selfByPool = {}; (planLines || []).forEach(function (l) { if (String(l.shipping_plan_id) === String(opts.selfPlanId)) {"
    + " var k = KMFSG.poolKey('FW-CN', l.sku); pEx.selfByPool[k] = { pool_key: k, qty: Number(l.requested_qty) || 0, line_count: 1 }; } });");
  var bad = seam(new World(spec), { g71: mSrc }).transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'v' });
  return honest.success === true && bad.success === false
    && bad.code === 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED';
});

mut('N3 the old AI draft is not released, so a regeneration competes with its own output', function () {
  var spec = { factory_stock: POOL, drafts: AI_OLD.drafts, draft_lines: AI_OLD.draft_lines };
  var honest = seam(new World(spec)).aiGuard([claim(900)], { releaseSet: { 'D-AI': 1 } });
  var mSrc = swap(G71, 'releaseSet: opts.releaseSet || {},', 'releaseSet: {},');
  var bad = seam(new World(spec), { g71: mSrc }).aiGuard([claim(900)], { releaseSet: { 'D-AI': 1 } });
  return honest.verdict === 'PASS' && honest.granted_total === 900
    && bad.verdict === 'CLAMPED' && bad.granted_total === 800;
});

mut('N4 the release set is widened so a MANUAL draft can be released by a generation', function () {
  // The gate is `relAi === true`. Widening it to "anything named in the set" is exactly the defect the
  // first run of this suite found, and it is the one that lets a generation supersede an operator's plan.
  var mSrc = swap(CORE, '        if (relAi === true) { out.released.IN_RELEASE_SET++; return; }',
    '        if (true) { out.released.IN_RELEASE_SET++; return; }');
  var mod = new Function('var module = { exports: {} }; ' + mSrc + '; return module.exports;')();
  var bal = mod.normalizeBalances([{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 1000 }]);
  var isAi = function (r) { return String(r.generation_type) !== 'user_created'; };
  var opt = { releaseSet: { 'D-MAN': 1 }, isAiRow: isAi };
  var honestEx = KMFSG.draftExposure(manual(300).drafts, manual(300).draft_lines, opt);
  var badEx = mod.draftExposure(manual(300).drafts, manual(300).draft_lines, opt);
  return honestEx.byPool['WH:FW-CN||SKU1'].qty === 300
    && honestEx.release_refused[0].reason === 'MANUAL_SOURCE_NEVER_RELEASED'
    && badEx.byPool['WH:FW-CN||SKU1'] === undefined && !!bal;
});

mut('N5 the guard is a FRONTEND check only — the server transition stops consulting it', function () {
  var spec = { factory_stock: POOL,
    plans: [{ shipping_plan_id: 'SP-ME', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      source_warehouse_id: 'FW-CN', status: 'draft', plan_version: 1 }],
    plan_lines: [{ shipping_plan_line_id: 'PL-ME', shipping_plan_id: 'SP-ME', sku: 'SKU1', requested_qty: 5000 }] };
  var w1 = new World(spec);
  var honest = seam(w1).transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'v' });
  var m11 = swap(G11, '    if (!fsgGate.proceed) return fsgGate.response;',
    '    if (false && !fsgGate.proceed) return fsgGate.response;');
  var w2 = new World(spec);
  var bad = seam(w2, { g11: m11 }).transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'v' });
  return honest.success === false && w1.plan('SP-ME').status === 'draft'
    && bad.success === true && w2.plan('SP-ME').status === 'pending_approval';
});

mut('N6 a STALE confirmation is accepted', function () {
  var honest = planWorld(800, 300, 1000);
  var hr = honest.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'v',
    overage_confirmation: { inventory_snapshot_fingerprint: 'stale', override_reason: 'other', override_by: 'v' } });
  var mSrc = swap(CORE, 'if (expected !== current) {', 'if (false) {');
  var mod = new Function('var module = { exports: {} }; ' + mSrc + '; return module.exports;')();
  var W = planWorld(800, 300, 1000);
  var f = W.s.call('fsgReadInventoryFacts_(SpreadsheetApp.getActiveSpreadsheet(), { selfPlanId: "SP-ME" })');
  var badRes = mod.confirmOverage({ available: f.available, shippingPlanId: 'SP-ME', exposureRows: f.exposureRows,
    expectedFingerprint: 'stale', reason: 'other', actor: 'v' });
  return hr.code === 'FACTORY_STOCK_OVERAGE_SNAPSHOT_STALE' && badRes.accepted === true;
});

mut('N7 the override channel becomes reachable from the AI guard', function () {
  var mSrc = swap(CORE, '      overridable: false,' + NL
    + "      override_note: 'An AI generation has no overage channel.",
    '      overridable: !!input.confirmation_token,' + NL
    + "      override_note: 'An AI generation has no overage channel.");
  var mod = new Function('var module = { exports: {} }; ' + mSrc + '; return module.exports;')();
  var av = { byPool: {}, pool_keys: [] };
  return KMFSG.evaluateAiGuard({ available: av, claims: [], confirmation_token: 'FSOC-X' }).overridable === false
    && mod.evaluateAiGuard({ available: av, claims: [], confirmation_token: 'FSOC-X' }).overridable === true;
});

mut('N8 a TERMINAL row is counted again as live exposure', function () {
  var spec = { factory_stock: POOL,
    drafts: [{ allocation_draft_id: 'D-SUB', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      status: 'submitted', generation_type: 'user_created', recommended_source_warehouse_id: 'FW-CN' }],
    draft_lines: [{ allocation_draft_line_id: 'x', allocation_draft_id: 'D-SUB', sku: 'SKU1',
      source_warehouse_id: 'FW-CN', planned_qty: 950 }] };
  var honest = seam(new World(spec)).aiGuard([claim(900)], {});
  var mSrc = swap(CORE, 'if (DRAFT_RELEASED_STATUSES[st]) { out.released.STATUS_RELEASED++; return; }',
    'if (false) { out.released.STATUS_RELEASED++; return; }');
  var mod = new Function('var module = { exports: {} }; ' + mSrc + '; return module.exports;')();
  var badEx = mod.draftExposure(spec.drafts, spec.draft_lines, {});
  return honest.verdict === 'PASS' && honest.granted_total === 900
    && badEx.byPool['WH:FW-CN||SKU1'] === undefined;
});

mut('N9 the same quantity is counted in BOTH the plan and the shipment reservation it became', function () {
  var spec = {
    factory_stock: [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 1000, fac_reserved_stock: 700 }],
    plans: [{ shipping_plan_id: 'SP-T', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      source_warehouse_id: 'FW-CN', status: 'approved', transferred_shipment_id: 'SHP-9' }],
    plan_lines: [{ shipping_plan_line_id: 'y', shipping_plan_id: 'SP-T', sku: 'SKU1', requested_qty: 700 }] };
  var honest = seam(new World(spec)).aiGuard([claim(300)], {});
  var mSrc = swap(CORE, 'if (transferred) { out.released.TRANSFERRED_TO_SHIPMENT++; return; }',
    'if (false) { out.released.TRANSFERRED_TO_SHIPMENT++; return; }');
  var mod = new Function('var module = { exports: {} }; ' + mSrc + '; return module.exports;')();
  var bal = mod.normalizeBalances(
    [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 1000, fac_reserved_stock: 700 }]);
  var badAv = mod.availableToAllocate({ balances: bal,
    planExposure: mod.planExposure(spec.plans, spec.plan_lines, {}) });
  return honest.verdict === 'PASS' && honest.granted_total === 300
    && badAv.byPool['WH:FW-CN||SKU1'].available_to_allocate === -400;
});

mut('N10 the writer runs before the guard (the guard moves inside PASS 2)', function () {
  var m61 = swap(G61, '  if (fsgClaims.length) {', '  if (false && fsgClaims.length) {');
  var k = extractFn(m61, 'weeklyAiPlanGenerateK2_');
  // The honest source reaches the guard before PASS 2; the mutant never reaches it at all.
  return k.indexOf('if (false && fsgClaims.length)') !== -1
    && iGuard > 0 && iPass2 > iGuard;
});

mut('N11 the lock is dropped, so the recheck and the write stop being one operation', function () {
  var m11 = swap(G11, '  try { return spUpdateShippingPlanStatusCore_(ss, body); }' + NL
    + '  finally { try { lock.releaseLock(); } catch (eRl) { /* best-effort */ } }',
    '  return spUpdateShippingPlanStatusCore_(ss, body);');
  var w = extractFn(m11, 'handleUpdateShippingPlanStatus_');
  return !/finally \{ try \{ lock\.releaseLock/.test(w)
    && /finally \{ try \{ lock\.releaseLock/.test(wrap11);
});

mut('N12 the idempotency of a replayed confirmation is lost — a second confirm re-stamps the override', function () {
  // The SAME confirmation replayed must not produce a second audit trail on a plan that already moved.
  var W = planWorld(800, 300, 1000);
  var ch = W.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'v' }).data;
  var conf = { inventory_snapshot_fingerprint: ch.inventory_snapshot_fingerprint,
    confirmation_token: ch.confirmation_token, override_reason: 'other', override_by: 'v' };
  var first = W.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'v', overage_confirmation: conf });
  var rows1 = W.w.auditRows().length;
  var second = W.s.transition({ shipping_plan_id: 'SP-ME', transition: 'submit', actor: 'v', overage_confirmation: conf });
  var rows2 = W.w.auditRows().length;
  // The status guard in 11_ ("Only a Draft plan can be submitted") is what makes the replay inert, and the
  // audit must not grow. If either were untrue, one click retried would double-stamp the override.
  return first.success === true && rows1 === 1 && second.success === false && rows2 === 1;
});

mut('N13 an unrecognised plan status is treated as live exposure', function () {
  var mSrc = swap(CORE, 'if (!PLAN_EXPOSURE_STATUSES[st]) { out.released.STATUS_UNRECOGNISED++; return; }',
    'if (false) { out.released.STATUS_UNRECOGNISED++; return; }');
  var mod = new Function('var module = { exports: {} }; ' + mSrc + '; return module.exports;')();
  var plans = [{ shipping_plan_id: 'SP-?', company: 'X', source_warehouse_id: 'FW-CN', status: 'somethingelse' }];
  var lines = [{ shipping_plan_id: 'SP-?', sku: 'SKU1', requested_qty: 900 }];
  var honest = KMFSG.planExposure(plans, lines, {});
  var bad = mod.planExposure(plans, lines, {});
  return !honest.byPool['WH:FW-CN||SKU1'] && honest.released.STATUS_UNRECOGNISED === 1
    && bad.byPool['WH:FW-CN||SKU1'].qty === 900;
});

mut('N14 the per-pool arithmetic is collapsed to one global total', function () {
  var mSrc = swap(CORE, "    if (p) return 'POOL:' + p + '||' + s;", "    if (true) return 'GLOBAL';");
  var mod = new Function('var module = { exports: {} }; ' + mSrc + '; return module.exports;')();
  var rows = [{ warehouse_id: 'FW-CN', sku: 'SKU1', fac_current_stock: 100 },
    { warehouse_id: 'FW-TW', sku: 'SKU1', fac_current_stock: 900 }];
  var honest = KMFSG.availableToAllocate({ balances: KMFSG.normalizeBalances(rows) });
  var bad = mod.availableToAllocate({ balances: mod.normalizeBalances(rows) });
  return honest.pool_keys.length === 2
    && honest.byPool['WH:FW-CN||SKU1'].available_to_allocate === 100
    && bad.pool_keys.length === 1;
});

console.log(NL + '-'.repeat(112));
console.log('SHARED FACTORY STOCK GUARD + WEEKLY SHIPPING PLAN OVERAGE APPROVAL (' + STAMP + '):');
console.log('passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
console.log('-'.repeat(112));
if (fail) process.exit(1);
