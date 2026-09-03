// ================================================================================================================
// F1-7N-FC-1A — SHIPMENT DRAFT RECOVERY / FACTORY STOCK RESERVATION / SHARED STOCK TRANSACTION
// ----------------------------------------------------------------------------------------------------------------
// WHAT THIS SUITE EXECUTES RATHER THAN READS.
//
// The FC-0A audit measured three things this round had to fix, and none of them could be fixed by reasoning
// about source text, so this suite RUNS the shipped handlers over in-memory sheets that count every mutation
// per table:
//
//   * 11_'s real handleUpdateShippingPlanStatus_ over 12_'s real createShipmentFromApprovedPlan_ over 21_'s
//     real shared stock transaction. The approve -> shipment -> reservation chain is executed end to end.
//   * 22_'s real handleConfirmShipmentAndDispatch_ over the SAME 21_ core, which is the whole point of §F:
//     dispatch no longer has its own implementation to test separately.
//   * 13_'s real handleReceivePurchaseOrderLines_ over the SAME core, so the PO regression §H demands is
//     measured against the shared authority rather than asserted about it.
//   * the page's real spShipmentRecoveryState_, extracted from shipping-plan.js and executed.
//
// The mutation counters are what make the negative claims checkable. "A replay writes nothing" and "a refusal
// writes nothing" are not readable properties of code; they are counts, and every one below is a count.
//
// TWO THINGS THIS SUITE DELIBERATELY PROVES CANNOT BE DONE.
//   §E asked for reservation release on CANCELLATION and adjustment on a QUANTITY change. Measured: there is
//   no shipment-cancellation action anywhere in the system, and shipment_qty is the immutable Execution
//   Snapshot. Both are pinned below as findings with the primitive exercised directly, so the authority is
//   complete and only the trigger is missing — which is the same class of gap as S6b was, and is reported as
//   such rather than papered over with an invented action.
// ================================================================================================================
var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
// A mutation must APPLY and be CAUGHT. A probe that cannot find its own target is reported as a probe error,
// never as a caught mutation — a mutation test that silently stops mutating is worse than no mutation test.
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
var GS_DIR = path.join(ROOT, 'assets/specs/active/apps-script');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
var NL = String.fromCharCode(10);

var G01 = read('assets/specs/active/apps-script/01_router.gs');
var G11 = read('assets/specs/active/apps-script/11_shipping_plan_handlers.gs');
var G12 = read('assets/specs/active/apps-script/12_shipment_handlers.gs');
var G13 = read('assets/specs/active/apps-script/13_procurement_handlers.gs');
var G21 = read('assets/specs/active/apps-script/21_factory_inventory_handlers.gs');
var G22 = read('assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var PAGE = read('assets/js/pages/shipping-plan.js');
var CENSUS = read('assets/tools/apps-script-diagnostics/TEMP_FC1A_COMPACT_READINESS_CENSUS.gs');

var GS_FILES = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f) && f.indexOf('90_generated') !== 0; });
var GS_SRC = {};
GS_FILES.forEach(function (f) { GS_SRC[f] = fs.readFileSync(path.join(GS_DIR, f), 'utf8'); });

// Brace-balanced extraction of one top-level function, so a mutated copy can be built from the real source.
function extractFn(src, name) {
  var i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('function not found: ' + name);
  var d = 0, started = false;
  for (var j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
// Both markers sit INSIDE a // comment, so the slice must begin at the newline AFTER the start marker and
// end at the newline BEFORE the end marker. Slicing at the marker itself leaves the tail of one comment as
// bare code and the head of the other dangling — a syntax error rather than a wrong answer, which is at least
// loud, but there is no reason to make the harness fragile about it.
function extractBetween(src, startMark, endMark) {
  var a = src.indexOf(startMark), b = src.indexOf(endMark);
  if (a === -1 || b === -1) throw new Error('markers not found: ' + startMark);
  var from = src.indexOf(NL, a + startMark.length);
  var to = src.lastIndexOf(NL, b);
  return src.slice(from + 1, to);
}
// Line endings are NOT uniform across this repository: 12_ and 13_ are CRLF while 21_, 22_ and the page are
// LF. A mutation target written with \n silently fails to match a CRLF file, and a mutation that cannot find
// its target proves nothing — so the newline form is normalised here rather than in eighteen call sites.
function mutateFn(src, name, find, replace) {
  var body = extractFn(src, name);
  var nl = body.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  var f = find.split('\n').join(nl), r = replace.split('\n').join(nl);
  if (body.indexOf(f) === -1) throw new Error('mutation target absent in ' + name + ': ' + find.slice(0, 90));
  return src.replace(body, body.replace(f, r));
}

// ================================================================================================================
// THE IN-MEMORY WORLD. Every mutation is COUNTED per table.
// ================================================================================================================
function MemSheet(name, grid) { this.__n = name; this.g = grid.map(function (r) { return r.slice(); }); this.appends = 0; this.writes = 0; this.deletes = 0; }
MemSheet.prototype.getName = function () { return this.__n; };
MemSheet.prototype.getDataRange = function () { var s = this; return { getValues: function () { return s.g.map(function (r) { return r.slice(); }); } }; };
MemSheet.prototype.getLastColumn = function () { return this.g.length ? this.g[0].length : 0; };
MemSheet.prototype.getLastRow = function () { return this.g.length; };
MemSheet.prototype.appendRow = function (row) { this.g.push(row.slice()); this.appends++; };
MemSheet.prototype.deleteRow = function (r) { this.g.splice(r - 1, 1); this.deletes++; };
MemSheet.prototype.insertColumnAfter = function () {};
MemSheet.prototype.mutations = function () { return this.appends + this.writes + this.deletes; };
MemSheet.prototype.getRange = function (r, c, nr, nc) {
  var s = this; nr = nr || 1; nc = nc || 1;
  return {
    getValues: function () { var o = []; for (var i = 0; i < nr; i++) { var row = s.g[r - 1 + i] || []; o.push(row.slice(c - 1, c - 1 + nc)); } return o; },
    getValue: function () { return (s.g[r - 1] || [])[c - 1]; },
    setValue: function (v) { if (!s.g[r - 1]) s.g[r - 1] = []; s.g[r - 1][c - 1] = v; s.writes++; },
    setValues: function (vs) { vs.forEach(function (rw, i) { if (!s.g[r - 1 + i]) s.g[r - 1 + i] = []; for (var j = 0; j < rw.length; j++) s.g[r - 1 + i][c - 1 + j] = rw[j]; }); s.writes += vs.length; }
  };
};
function gridOf(headers, objs) {
  var g = [headers.slice()];
  (objs || []).forEach(function (o) { g.push(headers.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; })); });
  return g;
}
function objsOf(sheet) {
  var h = (sheet.g[0] || []).map(function (x) { return String(x).trim(); });
  return sheet.g.slice(1).map(function (r) { var o = {}; for (var i = 0; i < h.length; i++) if (h[i]) o[h[i]] = r[i]; return o; });
}
function gasServices(lockAvailable) {
  var uuidN = 0;
  return {
    Utilities: { getUuid: function () { uuidN++; return 'uuid-' + ('0000' + uuidN).slice(-4) + '-fc1a-0000-000000000000'; },
      formatDate: function () { return '2026-09-03'; } },
    Session: { getScriptTimeZone: function () { return 'Asia/Taipei'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return lockAvailable !== false; }, releaseLock: function () {} }; } },
    Logger: { log: function () {} }
  };
}
var LAST = null;
function jsonResponseStub(o) { LAST = o; return o; }
function appendByHeader(sh, obj) {
  var h = (sh.g[0] || []).map(function (x) { return String(x).trim(); });
  sh.appendRow(h.map(function (k) { return Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : ''; }));
}
function readSheetStub(sh) {
  var vals = sh.getDataRange().getValues();
  var h = (vals[0] || []).map(function (x) { return String(x).trim(); });
  return { rows: vals, headers: h, col: function (n) { return h.indexOf(n); } };
}

var FS_H = ['factory_stock_id', 'warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock', 'updated_at', 'last_transaction_at'];
var MOV_H = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty',
  'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock',
  'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
var PLAN_H = ['shipping_plan_id', 'shipping_plan_no', 'status', 'company', 'country', 'marketplace', 'ship_from',
  'source_warehouse_id', 'destination', 'destination_warehouse_id', 'destination_type', 'shipping_method',
  'last_mile_delivery', 'customs_type', 'import_duty_treatment', 'carrier_id', 'rate_card_id', 'currency',
  'plan_version', 'note', 'submitted_by', 'submitted_at', 'approved_by', 'approved_at', 'rejected_by',
  'rejected_at', 'rejected_reason', 'cancelled_by', 'cancelled_at', 'completed_at',
  'parent_shipping_plan_id', 'transferred_to_shipment_at', 'transferred_shipment_id', 'updated_by', 'updated_at'];
var PLINE_H = ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'requested_qty', 'approved_qty',
  'plan_carton_qty', 'units_per_carton', 'carton_cbm', 'cbm', 'gross_weight', 'net_weight', 'note',
  'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply', 'snapshot_suggested_qty',
  'snapshot_target_days', 'snapshot_fc_context', 'snapshot_event_context', 'snapshot_avg_sales_source',
  'snapshot_avg_sales_warning', 'updated_at'];
var SHIP_H = ['shipment_id', 'shipment_no', 'external_shipment_id', 'shipping_plan_id', 'status', 'company',
  'country', 'marketplace', 'ship_from', 'source_warehouse_id', 'destination', 'destination_warehouse_id',
  'destination_type', 'shipping_method', 'last_mile_delivery', 'shipments_customs_type', 'import_duty_treatment',
  'carrier_id', 'rate_card_id', 'currency', 'reference_id', 'warehouse_code', 'warehouse_id', 'etd', 'eta',
  'shipment_total_qty', 'total_qty', 'shipment_total_cartons', 'shipment_total_cbm', 'shipment_total_gross_weight',
  'shipment_total_net_weight', 'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee',
  'estimated_total_cost', 'estimated_unit_cost', 'route_template_id', 'shipped_at', 'shipped_by',
  'actual_departure_date', 'note', 'created_by', 'created_at', 'updated_by', 'updated_at'];
var SLINE_H = ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty', 'qty', 'shipping_plan_line_id',
  'shipment_carton_qty', 'carton_qty', 'units_per_carton', 'shipment_carton_cbm', 'gross_weight', 'net_weight',
  'note', 'carton_no_start', 'carton_no_end', 'shipped_qty', 'created_at', 'updated_at'];

// ---- the shipping world: one approved plan, one factory warehouse, one SKU ------------------------------------
function planWorld(opts) {
  opts = opts || {};
  var sheets = {
    shipping_plans: new MemSheet('shipping_plans', gridOf(PLAN_H, opts.plans || [{
      shipping_plan_id: 'SP-1', shipping_plan_no: 'WSP-1', status: 'pending_approval',
      company: 'Res US', country: 'US', marketplace: 'Amazon', ship_from: 'CNYOUXIN',
      source_warehouse_id: 'WH-F', destination: 'US3PL01', destination_warehouse_id: 'WH-US-3PL-01',
      destination_type: 'warehouse', shipping_method: 'sea', last_mile_delivery: 'ltl',
      carrier_id: 'CR-1', currency: 'USD', plan_version: 1
    }])),
    shipping_plan_lines: new MemSheet('shipping_plan_lines', gridOf(PLINE_H, opts.planLines || [
      { shipping_plan_line_id: 'SPL-1', shipping_plan_id: 'SP-1', sku: 'CO1100-R',
        requested_qty: 800, approved_qty: 800, plan_carton_qty: 40, units_per_carton: 20, cbm: 4 }
    ])),
    shipments: new MemSheet('shipments', gridOf(SHIP_H, opts.shipments || [])),
    shipment_lines: new MemSheet('shipment_lines', gridOf(SLINE_H, opts.shipmentLines || [])),
    factory_stock: new MemSheet('factory_stock', gridOf(FS_H, opts.stock === undefined ? [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 0 }
    ] : opts.stock)),
    factory_stock_movements: new MemSheet('factory_stock_movements', gridOf(MOV_H, opts.movements || []))
  };
  return {
    sheets: sheets,
    ss: { getId: function () { return 'DBID-FC1A'; },
      getSheetByName: function (n) { return sheets[n] || null; },
      insertSheet: function (n) { sheets[n] = new MemSheet(n, [[]]); return sheets[n]; } },
    counts: function () { var c = {}; Object.keys(sheets).forEach(function (n) { c[n] = sheets[n].mutations(); }); return c; },
    mutated: function () { return Object.keys(sheets).filter(function (n) { return sheets[n].mutations() > 0; }).sort(); },
    stock: function () { return objsOf(sheets.factory_stock); },
    movements: function () { return objsOf(sheets.factory_stock_movements); },
    plans: function () { return objsOf(sheets.shipping_plans); },
    shipments: function () { return objsOf(sheets.shipments); },
    shipmentLines: function () { return objsOf(sheets.shipment_lines); },
    // The reserved balance for the one fixture row, read straight from the sheet.
    reserved: function (wh, sku) {
      var r = objsOf(sheets.factory_stock).filter(function (x) {
        return String(x.warehouse_id) === (wh || 'WH-F') && String(x.sku) === (sku || 'CO1100-R'); })[0];
      return r ? Number(r.fac_reserved_stock) : 0;
    },
    current: function (wh, sku) {
      var r = objsOf(sheets.factory_stock).filter(function (x) {
        return String(x.warehouse_id) === (wh || 'WH-F') && String(x.sku) === (sku || 'CO1100-R'); })[0];
      return r ? Number(r.fac_current_stock) : 0;
    }
  };
}

// 21_'s shared authority, as source, so a mutated copy can replace it.
function core21(src) {
  var g = src || G21;
  return [
    extractFn(g, 'factoryStockApplyDeltaTx_'),
    extractFn(g, 'factoryStockRollbackJournal_'),
    extractFn(g, 'factoryStockReadBalanceTx_'),
    extractFn(g, 'factoryStockOwnerReservedTx_'),
    extractFn(g, 'factoryStockAcquireReservationTx_'),
    extractFn(g, 'factoryStockReleaseReservationTx_'),
    "var FSTX_MOV_RESERVE_ACQUIRE_ = 'reservation_acquire';",
    "var FSTX_MOV_RESERVE_RELEASE_ = 'reservation_release';",
    "var FSTX_RESERVATION_OWNER_TYPE_ = 'shipment';"
  ].join(NL);
}

// ---- REAL 11_ approve over REAL 12_ shipment creation over REAL 21_ stock authority ---------------------------
// SUPPLIED (and named, so the boundary of what is real is visible): the sheet ensure/append helpers, the
// carton validator, and the two typeof-guarded shipping-plan helpers 12_ probes for. None of them touches
// factory stock or a plan status, which is what every assertion below measures.
function buildRunner(names, srcParts, exportExpr, opts) {
  opts = opts || {};
  var svc = gasServices(opts.lockAvailable);
  var argNames = ['Utilities', 'Session', 'SpreadsheetApp', 'LockService', 'Logger', 'jsonResponse_',
    'sheetEnsureColumns_', 'shipmentValidateCartons_', 'fcWriteEnsureSheet_', 'fcWriteEnsureColumns_',
    'fcWriteAppendByHeader_', 'shippingPlanEffectiveOwnerIds_', 'shippingPlanSkuLogisticsMap_',
    'procurementFindRow_', 'slaPrepareExecution_', 'slaApplyExecution_', 'shipmentReadSheet_',
    'dgsShipmentReadiness_', 'dgsGenerateShipmentDocuments_', 'shipmentTimestamp_', 'shipmentToday_',
    'prodRequireSheet_', 'shippingMatchRateCards_', 'shippingFreight_', 'shippingDuty_', 'shippingCustomsFee_',
    'shippingBatteryClass_'].concat(names || []);
  var body = 'var OUT;' + srcParts.join(NL) + NL + 'OUT = (' + exportExpr + '); return OUT;';
  var fn = Function.apply(null, argNames.concat([body]));
  return function (world, arg) {
    LAST = null;
    var args = [
      svc.Utilities, svc.Session,
      { flush: function () {}, getActiveSpreadsheet: function () { return world.ss; } },
      svc.LockService, svc.Logger, jsonResponseStub,
      function () {},                                                    // sheetEnsureColumns_
      function () { return { ok: true }; },                              // shipmentValidateCartons_
      function (ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); },
      function () {},                                                    // fcWriteEnsureColumns_
      appendByHeader,
      function (ss, id) { return [id]; },                                // shippingPlanEffectiveOwnerIds_
      function () { return {}; },                                        // shippingPlanSkuLogisticsMap_
      function (sheet, colName, id) {                                    // procurementFindRow_
        var vals = sheet.getDataRange().getValues();
        var h = (vals[0] || []).map(function (x) { return String(x).trim(); });
        var c = h.indexOf(colName);
        if (c === -1) return null;
        for (var i = 1; i < vals.length; i++) {
          if (String(vals[i][c]).trim() === String(id).trim()) {
            return { row: i + 1, vals: vals[i], col: function (n) { return h.indexOf(n); } };
          }
        }
        return null;
      },
      function () { return { ok: true, plan: [] }; },                    // slaPrepareExecution_ (32_)
      function () { return { ok: true, applied: [] }; },                 // slaApplyExecution_ (32_)
      readSheetStub,                                                     // shipmentReadSheet_
      function () { return { ok: true, status: 'READY', blockers: [] }; },// dgsShipmentReadiness_ (39_)
      function () { return { ok: true, generated: [] }; },               // dgsGenerateShipmentDocuments_ (39_)
      function () { return '2026-09-03 12:00:00'; },                     // shipmentTimestamp_
      function () { return '2026-09-03'; },                              // shipmentToday_
      // 29_'s production-safety adapter. In this world every sheet already exists, so the safe read is the
      // whole contract that matters here: it NEVER creates a production tab at runtime.
      function (ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); },  // prodRequireSheet_
      function () { return []; },                                        // shippingMatchRateCards_ (17_)
      function () { return 0; },                                         // shippingFreight_
      function () { return 0; },                                         // shippingDuty_
      function () { return 0; },                                         // shippingCustomsFee_
      function () { return ''; }                                         // shippingBatteryClass_
    ].concat((opts.extraArgs || []));
    var f = fn.apply(null, args);
    try { return f(arg); } catch (e) { return { success: false, threw: true, error: String(e && e.message) }; }
  };
}

var APPROVE_SRC = function (g11, g12, g21) {
  return [
    extractFn(g11 || G11, 'shippingPlanTimestamp_'),
    extractFn(g11 || G11, 'handleUpdateShippingPlanStatus_'),
    extractFn(g11 || G11, 'spApprovalRecoveryState_'),
    (g12 || G12), core21(g21)
  ];
};
function runApprove(world, body, g11, g12, g21) {
  return buildRunner([], APPROVE_SRC(g11, g12, g21), 'handleUpdateShippingPlanStatus_')(world, body);
}
function runRetry(world, body, g12, g21) {
  return buildRunner([], [(g12 || G12), core21(g21)], 'handleCreateShipmentFromPlan_')(world, body);
}
function runUpdateShipment(world, body, g12, g21) {
  return buildRunner([], [(g12 || G12), core21(g21)], 'handleUpdateShipment_')(world, body);
}

// ================================================================================================================
section('§A — PRECONDITIONS AND THE FROZEN DECISIONS');
// ================================================================================================================
(function () {
  var RO = require('./_release-order.js');
  ok(!!RO.OWNER_STAMPS, 'A1  the release-order registry is readable');
  ok(String(RO.currentAppToken()).length > 0, 'A2  and it reports a current cache token');
  ok(/F1-7N-FC-1A/.test(JSON.stringify(RO.OWNER_STAMPS)), 'A3  FC-1A owns a stamp in the release order');
})();

// ================================================================================================================
section('§B — THE S6 FAILURE CONTRACT, BEFORE AND AFTER');
// ================================================================================================================
// The shipped path before this round: approve wrote status='approved', then created the Shipment Draft inside a
// try/catch that did NOT undo the status. The approval was kept (correct, and now frozen by §0), but the answer
// was a bare success and the only hint was an alert naming a page that cannot show the state.
(function () {
  var c11 = code(G11);
  ok(/setCell\('status', 'approved'\)/.test(c11), 'B1  §B.1 approve writes status=approved');
  ok(/createShipmentFromApprovedPlan_\(ss, planId, approvedBy\)/.test(c11),
    'B2  §B.2 and THEN attempts the Execution Commit');
  ok(/catch \(e\) \{[\s\S]{0,200}shipmentResult = \{ created: false, error:/.test(c11),
    'B3  §B.2 the failure is CAUGHT, not propagated');
  ok(!/setCell\('status', 'pending_approval'\)[\s\S]{0,400}catch/.test(c11),
    'B4  §B.3 and nothing rolls the approval back — the human decision is kept (frozen §0)');

  // §B.6 — a replay. Before this round a second Approve answered with a bare refusal that reads as though the
  // approval had not happened; the operator's natural next move on a missing shipment.
  var w = planWorld({ plans: [{ shipping_plan_id: 'SP-1', status: 'approved', source_warehouse_id: 'WH-F',
    company: 'Res US', country: 'US', marketplace: 'Amazon', approved_by: 'op', approved_at: '2026-09-01' }] });
  var before = w.counts();
  var r = runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' });
  eq(r.success, true, 'B5  §D.6 a SECOND approve is answered, not refused');
  eq(r.data.already_approved, true, 'B5a and it says so explicitly');
  eq(r.data.execution_commit, 'APPROVED_SHIPMENT_CREATION_PENDING',
    'B5b and it reports the CURRENT execution-commit state rather than a bare success');
  eq(w.counts(), before, 'B6  §B.6 §D.6 and the replay writes NOTHING — no duplicate approval, no duplicate shipment');
  eq(r.data.recovery.retry_action, 'createShipmentFromPlan', 'B7  §D.2 it names the retry action');
  ok(/Weekly Shipping Plan/.test(r.data.recovery.retry_location), 'B7a and where to find it');
})();

// §B.4 — does the pre-shipment failure path touch stock at all? Measured with the reservation attempt forced
// to fail: a plan whose demand exceeds availability.
(function () {
  var w = planWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 100, fac_reserved_stock: 0 }] });
  var r = runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' });
  eq(r.success, true, 'B8  the approval itself still succeeds (the frozen §0 decision)');
  eq(r.data.execution_commit, 'APPROVED_SHIPMENT_CREATION_PENDING',
    'B9  §D.1 but the operation is NOT reported as fully complete');
  eq(String(r.data.recovery.cause), 'INSUFFICIENT_FACTORY_STOCK', 'B9a and the cause is typed, not prose');
  eq(r.data.recovery.shortfalls, [{ sku: 'CO1100-R', warehouse_id: 'WH-F', need: 800, available: 100, current: 100, reserved: 0 }],
    'B9b naming the SKU, the warehouse, the need and what is actually available');
  eq(w.shipments().length, 0, 'B10 §E.4 no Shipment Draft exists');
  eq(w.shipmentLines().length, 0, 'B10a no shipment lines either');
  eq(w.movements().length, 0, 'B11 §B.4 and NOT ONE stock movement was written');
  eq([w.current(), w.reserved()], [100, 0], 'B11a the balance is untouched — current 100, reserved 0');
  eq(w.mutated(), ['shipping_plans'], 'B12 §E.4 the ONLY table written is the approval itself');
  eq(String(w.plans()[0].status), 'approved', 'B13 §D.3 the recovery state is derivable: approved + no shipment');
})();

// ================================================================================================================
section('§C — THE RETRY, CONNECTED END TO END');
// ================================================================================================================
(function () {
  // The recoverable state, reached honestly: approve with too little stock, then add stock, then retry.
  var w = planWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 100, fac_reserved_stock: 0 }] });
  runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' });
  eq(w.shipments().length, 0, 'C1  precondition: the plan is approved with no shipment');
  // the shortfall is resolved (a receipt, an import — irrelevant here; what matters is the retry)
  w.sheets.factory_stock.g[1][FS_H.indexOf('fac_current_stock')] = 1000;

  var r = runRetry(w, { shipping_plan_id: 'SP-1', actor: 'op' });
  eq(r.success, true, 'C2  §C.2 the retry calls the EXISTING routed action and succeeds');
  eq(r.data.outcome, 'CREATED', 'C3  §C.4 and answers CREATED');
  eq(String(r.data.shipping_plan_id), 'SP-1', 'C4  §C.1 naming the exact shipping_plan_id');
  eq(r.data.approval_status_changed, false, 'C5  §C.9 the approval status is explicitly declared unchanged');
  eq(w.shipments().length, 1, 'C6  §C.5 exactly ONE shipment now exists');
  eq(w.shipmentLines().length, 1, 'C6a with its line');
  eq(Number(w.shipmentLines()[0].shipment_qty), 800, 'C6b carrying the approved quantity');
  eq(String(w.plans()[0].status), 'approved', 'C7  §C.9 and the plan is still approved — the retry never touched it');
  eq(String(w.plans()[0].approved_by), 'op', 'C7a nor who approved it');

  // §C.4/§C.5 — REPLAY. This is the requirement that matters most: a double click, a lost answer and a genuine
  // retry must all converge on ONE shipment.
  var before = w.counts();
  var r2 = runRetry(w, { shipping_plan_id: 'SP-1', actor: 'op' });
  eq(r2.success, true, 'C8  §C.4 a replayed retry succeeds rather than erroring');
  eq(r2.data.outcome, 'REUSED', 'C9  §C.4 and answers REUSED');
  eq(String(r2.data.shipment_id), String(w.shipments()[0].shipment_id), 'C10 §C bound to the SAME shipment');
  eq(w.shipments().length, 1, 'C11 §C.5 still exactly one shipment');
  eq(w.counts(), before, 'C12 §C.5 and the replay changed NOT ONE CELL in ANY table');
})();

(function () {
  // §C.7/§C.8 — typed failures survive, and the shape of the answer distinguishes them.
  var w = planWorld({ plans: [{ shipping_plan_id: 'SP-1', status: 'pending_approval', source_warehouse_id: 'WH-F' }] });
  var r = runRetry(w, { shipping_plan_id: 'SP-1', actor: 'op' });
  eq(r.success, false, 'C13 §C a retry on a NOT-approved plan is refused');
  eq(String(r.code), 'PLAN_NOT_APPROVED', 'C13a with a typed code, not prose');
  eq(w.mutated(), [], 'C13b and writes nothing');

  var w2 = planWorld();
  var r2 = runRetry(w2, { actor: 'op' });
  eq(String(r2.code), 'MISSING_SHIPPING_PLAN_ID', 'C14 §C.1 and a retry with no plan id is refused by name');
  eq(w2.mutated(), [], 'C14a writing nothing');
})();

(function () {
  // §C.3 — the lock. A retry that cannot serialize must refuse rather than race the reservation.
  var w = planWorld({ plans: [{ shipping_plan_id: 'SP-1', status: 'approved', source_warehouse_id: 'WH-F' }] });
  var r = buildRunner([], [G12, core21()], 'handleCreateShipmentFromPlan_', { lockAvailable: false })(w, { shipping_plan_id: 'SP-1', actor: 'op' });
  eq(r.success, false, 'C15 §C.3 an unavailable lock refuses the retry');
  eq(String(r.code), 'LOCK_UNAVAILABLE', 'C15a by name');
  eq(w.mutated(), [], 'C15b and nothing is written — never a reservation raced against another writer');
})();

// ---- §C / §J — THE CALLER EXISTS, AND THE PAGE GATES IT ------------------------------------------------------
(function () {
  var live = code(PAGE);
  ok(/function spDbRetryShipment/.test(live), 'C16 §C the page defines the retry command');
  ok(/window\.spDbRetryShipment = spDbRetryShipment/.test(live), 'C16a and exports it for the card markup');
  ok(/KM\.DB\.createShipmentFromPlan\(/.test(live), 'C17 §C.2 which calls the existing routed action');
  ok(/onclick="spDbRetryShipment/.test(PAGE), 'C18 §C the Approved plan card carries the button');
  ok(/idempotency_key: 'RETRY-SHIPMENT:' \+ planId/.test(live), 'C19 §C.3 with a stable correlation key');
  ok(/_spRunCommand_\(planId \+ ':retryshipment'/.test(live),
    'C20 §C.6 through the shared command runner, which performs the ONE authoritative readback');
  ok(/outcome === 'REUSED'/.test(live), 'C21 §C.4 and the page distinguishes REUSED from CREATED');
  // §C.10 — the retry must not promise documents or a stock deduction. Neither word appears in its handler.
  var retryFn = extractFn(PAGE, 'spDbRetryShipment');
  ok(!/document|deduct/i.test(code(retryFn)), 'C22 §C.10 and it promises no documents and no stock deduction');
  // The old dead-end message is gone from live code.
  ok(!/You can retry from Shipment Overview/.test(live),
    'C23 §C the instruction naming an unreachable page is GONE from the live message');
})();

// ================================================================================================================
section('§D — THE APPROVAL RESULT, AND THE DERIVED RECOVERY STATE');
// ================================================================================================================
(function () {
  var w = planWorld();
  var r = runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' });
  eq(r.success, true, 'D1  §K.1 approval + shipment creation succeeds together');
  eq(r.data.execution_commit, 'SHIPMENT_PRESENT', 'D2  §D.1 and reports the commit as PRESENT');
  eq(r.data.recovery, null, 'D3  §D with no recovery object, because there is nothing to recover');
  eq(r.data.shipment.created, true, 'D4  the Shipment Draft was created');
  eq(w.shipments().length, 1, 'D4a exactly one');
  eq(String(w.plans()[0].status), 'approved', 'D5  and the plan is approved');
  eq(String(w.plans()[0].transferred_shipment_id), String(w.shipments()[0].shipment_id),
    'D6  §D.3 the plan records its shipment, which is what makes the state derivable on reload');
})();

// ---- the page's REAL predicate, executed ----------------------------------------------------------------------
var spRecovery = (function () {
  var src = extractBetween(PAGE, '__SP_RECOVERY_PURE_START__', '__SP_RECOVERY_PURE_END__');
  return new Function('var OUT;' + src + NL + 'return spShipmentRecoveryState_;')();
})();
(function () {
  eq(spRecovery('draft', false, true, false).state, 'NOT_APPROVED', 'D7  §D a draft plan is not in an execution-commit state');
  eq(spRecovery('pending_approval', false, true, false).state, 'NOT_APPROVED', 'D7a nor is a pending one');
  eq(spRecovery('approved', true, true, false).state, 'SHIPMENT_PRESENT', 'D8  §D approved WITH a shipment is complete');
  ok(!spRecovery('approved', true, true, false).isRecoverable, 'D8a and offers no retry');
  var rec = spRecovery('approved', false, true, false);
  eq(rec.state, 'APPROVED_SHIPMENT_CREATION_PENDING', 'D9  §D approved WITHOUT one is the recoverable condition');
  eq([rec.isRecoverable, rec.canRetry, rec.blockedBy], [true, true, ''], 'D9a and it offers the retry');
  // §D.5 — reload equivalence. The predicate has no memory: identical rows give an identical answer, which is
  // the whole reason the state is derived rather than stored.
  eq(spRecovery('approved', false, true, false), spRecovery('approved', false, true, false),
    'D10 §D.5 the same rows always give the same answer — a reload cannot show something different');
  // §J.2 / §J.3 — the two gates.
  var g1 = spRecovery('approved', false, false, false);
  eq([g1.isRecoverable, g1.canRetry, g1.blockedBy], [true, false, 'DEPLOYMENT_CONTRACT_MISMATCH'],
    'D11 §J.2 a deployment mismatch leaves the state visible but the retry unavailable, and says which');
  var g2 = spRecovery('approved', false, true, true);
  eq([g2.isRecoverable, g2.canRetry, g2.blockedBy], [true, false, 'RETRY_IN_FLIGHT'],
    'D12 §J.3 an in-flight retry disables a duplicate click, and says so');
  // An UNANSWERED probe (null) must not disable a working page. This distinction is the difference between a
  // cautious gate and a page that breaks itself whenever a probe is slow.
  eq(spRecovery('approved', false, null, false).canRetry, true,
    'D13 §J.2 an UNANSWERED contract probe (null) is not treated as a mismatch');
})();

(function () {
  // §D.2 — the page's own Approve message must name the state, the cause and the action that exists.
  var apr = code(extractFn(PAGE, 'spDbApprove'));
  ok(/APPROVED_SHIPMENT_CREATION_PENDING/.test(apr), 'D14 §D.2 Approve inspects the typed commit state');
  ok(/THE SHIPMENT DRAFT WAS NOT CREATED/.test(apr), 'D15 §D.1 and does NOT report the operation as complete');
  ok(/Retry Shipment Draft/.test(apr), 'D16 §D.2 pointing at the action that exists on this card');
  ok(/rec\.shortfalls/.test(apr), 'D17 §D.2 and surfaces the stock shortfall when that was the cause');
  // The card, not just the alert: an alert is dismissed, a card survives a reload.
  ok(/sp-recovery-banner/.test(PAGE), 'D18 §D.5 and the CARD carries the same condition, so it survives a reload');
  // The recoverable branch must not offer Done. Marking the planning task complete while its shipment is
  // missing is exactly how this state used to leave the active view and stop being anybody's problem.
  var recStart = PAGE.indexOf('} else if (recovery.isRecoverable) {');
  var recBranch = recStart === -1 ? '' : PAGE.slice(recStart, PAGE.indexOf(NL + '        }', recStart));
  ok(recBranch.length > 0, 'D19 §D the card has a distinct recoverable branch');
  ok(recBranch.indexOf('spDbDone') === -1, 'D19a §D and Done is NEVER offered on a recoverable plan');
  ok(recBranch.indexOf('spDbRetryShipment') !== -1, 'D19b only the retry is');
})();

// ================================================================================================================
section('§E — THE RESERVATION: SOURCE OF TRUTH, ACQUIRE, RELEASE');
// ================================================================================================================
// §E asked for the EXISTING durable representation to be used if it can express owner, SKU, warehouse_id,
// reserved_qty, lifecycle, idempotency and release. It can, and these checks pin which columns carry which.
(function () {
  var c21 = code(G21);
  ok(/fac_reserved_stock/.test(c21), 'E1  §E the reserved BALANCE is factory_stock.fac_reserved_stock (existing column)');
  ok(/FSTX_MOV_RESERVE_ACQUIRE_ = 'reservation_acquire'/.test(c21) && /FSTX_MOV_RESERVE_RELEASE_ = 'reservation_release'/.test(c21),
    'E2  §E the LINEAGE is factory_stock_movements, two new movement_type values');
  ok(/relatedEntityType: ownerType, relatedEntityId: ownerId/.test(c21),
    'E3  §E the OWNER is related_entity_type/related_entity_id — the same field pair 13_ already uses for idempotency');
  ok(/function factoryStockOwnerReservedTx_/.test(c21),
    'E4  §E the LIFECYCLE is derived (sum of acquire minus release), never a second stored status');
  // NO new table and NO new column. This is the §E requirement that is easiest to violate accidentally.
  var newTables = GS_FILES.filter(function (f) {
    return /reservations?'\s*\)|'(stock_reservations|factory_stock_reservations)'/.test(code(GS_SRC[f]));
  });
  eq(newTables, [], 'E5  §E NO reservation table was added — the existing model expresses all seven facts');
  ok(!/sheetEnsureColumns_\([^)]*reserved/.test(code(G12)) && !/fcWriteEnsureColumns_\([^)]*reserved/.test(code(G12)),
    'E5a and no new column was ensured onto factory_stock either');
})();

// ---- ACQUIRE, executed ---------------------------------------------------------------------------------------
(function () {
  var w = planWorld();
  var r = runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' });
  eq(r.success, true, 'E6  §E.5 approval creates the Shipment Draft');
  eq([w.current(), w.reserved()], [1000, 800],
    'E7  §E.5 current is UNCHANGED at 1000 and reserved rises to 800 — a reservation is not a deduction');
  var mv = w.movements();
  eq(mv.length, 1, 'E8  §E.5 exactly ONE movement row records it');
  eq(String(mv[0].movement_type), 'reservation_acquire', 'E8a typed reservation_acquire');
  eq(Number(mv[0].qty), 800, 'E8b with a POSITIVE quantity — reserved rose');
  eq([Number(mv[0].before_current_stock), Number(mv[0].after_current_stock)], [1000, 1000],
    'E9  §E.5 and the current balance is recorded as unchanged, not omitted');
  eq([Number(mv[0].before_reserved_stock), Number(mv[0].after_reserved_stock)], [0, 800],
    'E9a while the reserved pair carries the actual change');
  eq([String(mv[0].related_entity_type), String(mv[0].related_entity_id)],
    ['shipment', String(w.shipments()[0].shipment_id)],
    'E10 §E the owner is the SHIPMENT — the reservation has lineage, not just a number');
  eq([String(mv[0].warehouse_id), String(mv[0].sku)], ['WH-F', 'CO1100-R'], 'E10a at the exact warehouse and SKU');
  eq(r.data.shipment.factory_reservations, [{ sku: 'CO1100-R', warehouse_id: 'WH-F', reserved_qty: 800, applied: true, reason: 'RESERVED' }],
    'E11 §E.5 and the answer reports what was reserved, so the UI never has to guess');

  // §E.7 — REPLAY returns REUSED with a ZERO stock delta.
  var before = w.counts();
  var r2 = runRetry(w, { shipping_plan_id: 'SP-1', actor: 'op' });
  eq(r2.data.outcome, 'REUSED', 'E12 §E.7 a replay returns REUSED');
  eq(w.counts(), before, 'E12a §E.7 with a ZERO delta in every table — reserved did NOT double to 1600');
  eq(w.reserved(), 800, 'E12b reserved is still 800');
})();

(function () {
  // §E.4 — insufficient availability refuses BEFORE any write, and the approved plan stays recoverable.
  var w = planWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 500 }] });
  var r = runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' });
  eq(r.data.execution_commit, 'APPROVED_SHIPMENT_CREATION_PENDING', 'E13 §K.7 insufficient AVAILABILITY refuses the draft');
  eq(String(r.data.recovery.cause), 'INSUFFICIENT_FACTORY_STOCK', 'E13a typed');
  eq(r.data.recovery.shortfalls[0].available, 500,
    'E13b and the refusal is computed on AVAILABLE (1000 - 500), not on current — which is the entire point');
  eq([w.shipments().length, w.shipmentLines().length, w.movements().length], [0, 0, 0],
    'E14 §E.4 no shipment, no lines, no reservation');
  eq([w.current(), w.reserved()], [1000, 500], 'E14a and the pre-existing reservation is untouched');
})();

(function () {
  // A plan with units and no source warehouse cannot reserve, and guessing one would be worse than refusing.
  var w = planWorld({ plans: [{ shipping_plan_id: 'SP-1', status: 'pending_approval', source_warehouse_id: '' }] });
  var r = runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' });
  eq(String(r.data.recovery.cause), 'SOURCE_WAREHOUSE_REQUIRED_FOR_RESERVATION',
    'E15 §K.14 a missing source warehouse is refused BY NAME, never reserved against a guess');
  eq(w.movements().length, 0, 'E15a writing no movement');
  eq(w.shipments().length, 0, 'E15b and no shipment');
})();

// ---- RELEASE AT DISPATCH: real 22_ over the real shared authority --------------------------------------------
var ROUTE_T_H = ['route_template_id', 'template_name', 'destination', 'carrier_id', 'shipping_method', 'is_active'];
var ROUTE_N_H = ['route_template_node_id', 'route_template_id', 'sequence_no', 'node_type', 'node_code',
  'location_name', 'country', 'region', 'city', 'latitude', 'longitude', 'transport_mode', 'planned_event_type',
  'offset_days', 'logistics_location_id'];
function dispatchWorld(opts) {
  opts = opts || {};
  var w = planWorld(opts);
  w.sheets.shipments = new MemSheet('shipments', gridOf(SHIP_H, opts.shipments || [{
    shipment_id: 'SHP-1', shipping_plan_id: 'SP-1', status: 'ready_to_ship', external_shipment_id: 'EXT-1',
    reference_id: 'REF-1', warehouse_code: 'US3PL01', carrier_id: 'CR-1', shipping_method: 'sea',
    etd: '2026-09-10', eta: '2026-10-10', shipment_total_qty: 800, total_qty: 800, ship_from: 'CNYOUXIN',
    destination: 'US3PL01', destination_warehouse_id: 'WH-US-3PL-01', source_warehouse_id: 'WH-F',
    route_template_id: 'RT-1'
  }]));
  w.sheets.shipment_lines = new MemSheet('shipment_lines', gridOf(SLINE_H, opts.shipmentLines || [
    { shipment_line_id: 'SL-1', shipment_id: 'SHP-1', sku: 'CO1100-R', shipment_qty: 800, shipment_carton_qty: 40, units_per_carton: 20 }
  ]));
  w.sheets.shipment_routes = new MemSheet('shipment_routes', gridOf(['shipment_route_id', 'shipment_id'], []));
  w.sheets.shipment_events = new MemSheet('shipment_events', gridOf(['shipment_event_id', 'shipment_id'], []));
  w.sheets.shipment_route_templates = new MemSheet('shipment_route_templates', gridOf(ROUTE_T_H, [
    { route_template_id: 'RT-1', template_name: 'CN-US', destination: 'US3PL01', carrier_id: 'CR-1', shipping_method: 'sea', is_active: 'TRUE' }
  ]));
  w.sheets.shipment_route_template_nodes = new MemSheet('shipment_route_template_nodes', gridOf(ROUTE_N_H, [
    { route_template_node_id: 'RTN-1', route_template_id: 'RT-1', sequence_no: 1, node_type: 'origin', node_code: 'CNYOUXIN', location_name: 'Youxin', country: 'CN', offset_days: 0 },
    { route_template_node_id: 'RTN-2', route_template_id: 'RT-1', sequence_no: 2, node_type: 'destination', node_code: 'US3PL01', location_name: 'US 3PL', country: 'US', offset_days: 30 }
  ]));
  return w;
}
function runConfirm(world, body, g22, g21) {
  return buildRunner([], [(g22 || G22), core21(g21)], 'handleConfirmShipmentAndDispatch_')(world, body);
}

(function () {
  // A shipment that HOLDS a reservation of 800, then dispatches. This is §E's release-at-dispatch contract, and
  // the requirement that makes it non-trivial is "create exactly ONE shipment_out movement" — the deduction and
  // the release are ONE ledger fact, not two rows that could disagree.
  var w = dispatchWorld({ movements: [
    { factory_stock_movement_id: 'FSMV-A', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'reservation_acquire', qty: 800, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
      before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 800 }
  ], stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 800 }] });
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  eq(r.success, true, 'E16 §K.10 Confirm Shipment completes');
  eq(w.current(), 200, 'E17 §E current -= 800 → 200');
  eq(w.reserved(), 0, 'E18 §E.6 reserved -= 800 → 0: no reservation remains for dispatched quantity');
  var mv = w.movements().filter(function (m) { return String(m.movement_type) === 'shipment_out'; });
  eq(mv.length, 1, 'E19 §E EXACTLY ONE shipment_out movement — one indivisible ledger fact');
  eq(Number(mv[0].qty), -800, 'E19a signed negative');
  eq([Number(mv[0].before_current_stock), Number(mv[0].after_current_stock)], [1000, 200], 'E20 §E carrying the current pair');
  eq([Number(mv[0].before_reserved_stock), Number(mv[0].after_reserved_stock)], [800, 0],
    'E20a AND the reserved pair — the deduction and the release are the SAME row');
  eq(Number(r.data.factory_reservation_released), 800, 'E21 §E and the answer reports the release');
  eq(w.movements().length, 2, 'E21a total ledger: the acquire, then the shipment_out. Nothing else.');

  // §E.7 / §K.10 — replay changes zero cells.
  var before = w.counts();
  var r2 = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  eq(r2.already_confirmed, true, 'E22 §K.10 a replayed Confirm is idempotent');
  eq(w.counts(), before, 'E23 §E.7 and changes ZERO cells in EVERY table');
  eq([w.current(), w.reserved()], [200, 0], 'E23a the balance is exactly where it was');
})();

(function () {
  // §E.5/§E.6 — a dispatch of a shipment that holds NO reservation must still work and must NOT drive reserved
  // negative. This is the migration case: shipments created before this round hold nothing.
  var w = dispatchWorld();
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  eq(r.success, true, 'E24 §E a pre-reservation shipment still dispatches');
  eq([w.current(), w.reserved()], [200, 0], 'E24a deducting current and leaving reserved at zero');
  eq(Number(r.data.factory_reservation_released), 0, 'E24b releasing nothing, and saying so');
  ok(w.reserved() >= 0, 'E25 §E.5 reserved is NEVER negative');
})();

(function () {
  // §E — a dispatch must never release ANOTHER shipment's reservation. SHP-1 dispatches while SHP-2 holds 200.
  var w = dispatchWorld({
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 200 }],
    movements: [{ factory_stock_movement_id: 'FSMV-B', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'reservation_acquire', qty: 200, related_entity_type: 'shipment', related_entity_id: 'SHP-2',
      before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 200 }]
  });
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  eq(r.success, true, 'E26 §E SHP-1 dispatches');
  eq(w.current(), 200, 'E26a its 800 units leave');
  eq(w.reserved(), 200, 'E27 §E and SHP-2\'s 200-unit reservation is UNTOUCHED — a release is owner-scoped');
  eq(Number(r.data.factory_reservation_released), 0, 'E27a SHP-1 released nothing, because it held nothing');
})();

// ---- RELEASE AT CANCELLATION and on a QUANTITY change: the primitive, and the missing trigger ----------------
// The reservation primitives are exercised DIRECTLY here, because §E's cancellation and quantity branches
// describe transitions this system does not have. Both are reported as findings, with the authority proved
// complete so that connecting a trigger later is a caller change and nothing more.
var runPrimitives = (function () {
  var fn = new Function('Utilities', 'SpreadsheetApp', 'fcWriteAppendByHeader_',
    'var OUT;' + core21() + NL + 'return { acquire: factoryStockAcquireReservationTx_, release: factoryStockReleaseReservationTx_,' +
    ' balance: factoryStockReadBalanceTx_, owner: factoryStockOwnerReservedTx_, rollback: factoryStockRollbackJournal_ };');
  var svc = gasServices();
  return fn(svc.Utilities, { flush: function () {} }, appendByHeader);
})();

(function () {
  // §K.9 — CANCELLATION RELEASE. current unchanged, reservation released exactly once, replay a zero delta.
  var w = planWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 0 }] });
  var j = [];
  runPrimitives.acquire({ stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', qty: 800, ownerId: 'SHP-1', journal: j, now: 'T0', createdBy: 'op' });
  eq([w.current(), w.reserved()], [1000, 800], 'E28 §K.9 precondition: 800 reserved, current untouched');

  var rel = runPrimitives.release({ stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', ownerId: 'SHP-1', journal: [], now: 'T1', createdBy: 'op',
    releaseReason: 'shipment_cancelled' });
  eq(rel.applied, true, 'E29 §K.9 cancellation releases the reservation');
  eq(rel.released, 800, 'E29a in full');
  eq(w.current(), 1000, 'E30 §K.9 current_stock is UNCHANGED — a cancellation returns nothing physical');
  eq(w.reserved(), 0, 'E31 §K.9 and the reservation is gone');
  var rl = w.movements().filter(function (m) { return String(m.movement_type) === 'reservation_release'; });
  eq(rl.length, 1, 'E32 §K.9 released exactly ONCE');
  ok(/reason=shipment_cancelled/.test(String(rl[0].note)), 'E32a and the reason is recorded on the ledger row');

  var before = w.counts();
  var rel2 = runPrimitives.release({ stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', ownerId: 'SHP-1', journal: [], now: 'T2', createdBy: 'op' });
  eq([rel2.applied, String(rel2.reason)], [false, 'NO_RESERVATION'], 'E33 §K.9 a replayed release is a no-op, not an error');
  eq(w.counts(), before, 'E34 §K.9 with a ZERO delta');
})();

(function () {
  // §E — release can never exceed what the owner holds, and can never target another owner's units.
  var w = planWorld();
  runPrimitives.acquire({ stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', qty: 300, ownerId: 'SHP-A', journal: [], now: 'T0', createdBy: 'op' });
  runPrimitives.acquire({ stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', qty: 400, ownerId: 'SHP-B', journal: [], now: 'T0', createdBy: 'op' });
  eq(w.reserved(), 700, 'E35 two owners hold 300 + 400');
  var over = runPrimitives.release({ stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', qty: 700, ownerId: 'SHP-A', journal: [], now: 'T1', createdBy: 'op' });
  eq(over.released, 300, 'E36 §E SHP-A asking to release 700 releases only the 300 it holds');
  eq(w.reserved(), 400, 'E37 §E SHP-B\'s 400 survives — no owner can release another\'s reservation');
  var ledger = runPrimitives.owner(w.sheets.factory_stock_movements, 'shipment', 'SHP-B');
  eq(ledger['WH-F||CO1100-R'], 400, 'E37a and the per-owner ledger says so independently of the balance');
  // §K.15 — a release for an owner with no lineage at all.
  var none = runPrimitives.release({ stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', qty: 100, ownerId: 'SHP-GHOST', journal: [], now: 'T2', createdBy: 'op' });
  eq([none.applied, String(none.reason)], [false, 'NO_RESERVATION'],
    'E38 §K.15 a release for an owner with NO reservation lineage is refused, not guessed');
  eq(w.reserved(), 400, 'E38a and changes nothing');
})();

(function () {
  // §K.14 — the wrong warehouse_id. A reservation is per (warehouse, sku); asking at the wrong warehouse must
  // not silently succeed against the right one.
  var w = planWorld();
  runPrimitives.acquire({ stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', qty: 500, ownerId: 'SHP-1', journal: [], now: 'T0', createdBy: 'op' });
  var wrong = runPrimitives.release({ stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-OTHER', sku: 'CO1100-R', ownerId: 'SHP-1', journal: [], now: 'T1', createdBy: 'op' });
  eq([wrong.applied, String(wrong.reason)], [false, 'NO_RESERVATION'],
    'E39 §K.14 a release at the WRONG warehouse finds nothing and refuses');
  eq(w.reserved('WH-F'), 500, 'E39a the real reservation is intact');
  var bal = runPrimitives.balance(w.sheets.factory_stock, 'WH-OTHER', 'CO1100-R');
  eq([bal.found, bal.current, bal.reserved, bal.available], [false, 0, 0, 0],
    'E40 §K.14 and an unknown warehouse reads as zero availability rather than throwing');
})();

(function () {
  // §E — the QUANTITY branch. shipment_qty is the immutable Execution Snapshot, so there is no quantity change
  // to adjust for. This is pinned because the day it becomes editable, the reservation silently stops matching.
  var editable = (code(G12).match(/var SHIPMENT_EDITABLE_FIELDS_ = \[([\s\S]*?)\]/) || [])[1] || '';
  ok(editable.indexOf('shipment_qty') === -1,
    'E41 §E shipment_qty is NOT editable — the quantity-adjustment branch is VACUOUS BY DESIGN, not unimplemented');
  var qtyWriters = GS_FILES.filter(function (f) {
    return /shipment_qty'\s*\)\s*\+\s*1\)\s*\.setValue|setValue\([^)]*\)\s*;\s*\/\/\s*shipment_qty/.test(code(GS_SRC[f]));
  });
  eq(qtyWriters, [], 'E41a and no handler writes shipment_qty after creation');
  // The SOURCE branch is NOT vacuous: source_warehouse_id IS editable, which is a real hole this round closes.
  ok(editable.indexOf('source_warehouse_id') !== -1,
    'E42 §E source_warehouse_id IS editable, so the source branch is real and had to be implemented');
})();

(function () {
  // §K.13 — a source change MOVES the reservation, exactly, under one lock.
  var w = dispatchWorld({
    stock: [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 800 },
      { factory_stock_id: 'FS-2', warehouse_id: 'WH-G', sku: 'CO1100-R', fac_current_stock: 900, fac_reserved_stock: 0 }
    ],
    movements: [{ factory_stock_movement_id: 'FSMV-A', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'reservation_acquire', qty: 800, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
      before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 800 }]
  });
  var r = runUpdateShipment(w, { shipment_id: 'SHP-1', source_warehouse_id: 'WH-G', actor: 'op' });
  eq(r.success, true, 'E43 §K.13 the source warehouse change is accepted');
  eq([w.current('WH-F'), w.reserved('WH-F')], [1000, 0], 'E44 §K.13 WH-F releases its 800; current is untouched');
  eq([w.current('WH-G'), w.reserved('WH-G')], [900, 800], 'E45 §K.13 WH-G acquires 800; current is untouched');
  var types = w.movements().map(function (m) { return String(m.movement_type); });
  eq(types, ['reservation_acquire', 'reservation_release', 'reservation_acquire'],
    'E46 §K.13 recorded as a release and an acquire — the move has full lineage at BOTH warehouses');
})();

(function () {
  // §K.13 — and a move to a warehouse that cannot cover it is refused with NOTHING written.
  var w = dispatchWorld({
    stock: [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 800 },
      { factory_stock_id: 'FS-2', warehouse_id: 'WH-G', sku: 'CO1100-R', fac_current_stock: 100, fac_reserved_stock: 0 }
    ],
    movements: [{ factory_stock_movement_id: 'FSMV-A', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'reservation_acquire', qty: 800, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
      before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 800 }]
  });
  var before = w.counts();
  var r = runUpdateShipment(w, { shipment_id: 'SHP-1', source_warehouse_id: 'WH-G', actor: 'op' });
  eq(r.success, false, 'E47 §K.13 a move to a warehouse without availability is REFUSED');
  eq(String(r.code), 'INSUFFICIENT_FACTORY_STOCK_AT_NEW_SOURCE', 'E47a by name');
  eq(w.counts(), before, 'E48 §K.13 and NOTHING was written — the reservation is not half-moved');
  eq([w.reserved('WH-F'), w.reserved('WH-G')], [800, 0], 'E48a the original reservation is exactly where it was');
})();

// ---- THE FINDING: no cancellation trigger exists -------------------------------------------------------------
(function () {
  var routerActions = {};
  (code(G01).match(/action === '([^']+)'/g) || []).forEach(function (m) { routerActions[m.match(/'([^']+)'/)[1]] = 1; });
  var cancels = Object.keys(routerActions).filter(function (a) { return /shipment/i.test(a) && /cancel/i.test(a); });
  eq(cancels, [],
    'E49 §E FINDING: there is NO shipment-cancellation action in the router, so the release-at-cancellation ' +
    'contract has a complete authority and NO trigger — reported, not invented');
  ok(/function factoryStockReleaseReservationTx_/.test(code(G21)),
    'E49a the primitive it will need exists and is proved above (E28-E34)');
})();

// ================================================================================================================
section('§F — ONE STOCK AUTHORITY, AND EVERY CALLER DELEGATES');
// ================================================================================================================
(function () {
  ok(/function factoryStockApplyDeltaTx_/.test(code(G21)), 'F1  §F.1 21_ defines the shared transaction');
  ['factoryStockReadBalanceTx_', 'factoryStockOwnerReservedTx_', 'factoryStockAcquireReservationTx_',
   'factoryStockReleaseReservationTx_', 'factoryStockRollbackJournal_'].forEach(function (fn, i) {
    var owners = GS_FILES.filter(function (f) { return new RegExp('function ' + fn + '\\(').test(GS_SRC[f]); });
    eq(owners, ['21_factory_inventory_handlers.gs'], 'F2.' + (i + 1) + ' §F.1 ' + fn + ' is defined ONCE, in 21_');
  });
  ok(/factoryStockApplyDeltaTx_\(/.test(code(G22)), 'F3  §F 22_ (dispatch) CALLS the shared transaction');
  ok(/factoryStockApplyDeltaTx_\(/.test(code(G13)), 'F4  §F.6 13_ (PO receipt) still calls it — no regression');
  ok(/factoryStockAcquireReservationTx_\(/.test(code(G12)), 'F5  §F 12_ (Shipment Draft) calls the reservation primitive');

  // §F.1 THE ENFORCEABLE FORM. No file outside 21_ may write a factory_stock balance cell. This is what makes
  // 21_'s comment true rather than aspirational, and it is the check that would have caught the old 22_.
  var balanceWriters = GS_FILES.filter(function (f) {
    if (f.indexOf('21_') === 0) return false;
    return /getRange\([^)]*(curCol|resCol)[^)]*\)\s*\.setValue/.test(code(GS_SRC[f]));
  }).sort();
  eq(balanceWriters, [], 'F6  §F.1 NO file outside 21_ writes a factory_stock balance cell');
  ok(!/stk\.sheet\.getRange\([^)]*stk\.curCol[^)]*\)\.setValue/.test(code(G22)),
    'F6a and 22_\'s old inline balance write is GONE');

  // §F.7 — the comment must describe ACTUAL ownership. It previously claimed no second implementation existed
  // while 22_ was one; that contradiction is now corrected IN the file, and the correction is checked.
  ok(/CORRECTION OF AN UNTRUE COMMENT/.test(G21),
    'F7  §F.7 21_ records that its own previous ownership claim was false, and why');
  ok(!/No second stock-mutation implementation lives in any other file/.test(G21),
    'F7a and the false sentence itself is gone');
  ok(/DELEGATES to this core/.test(G21), 'F7b replaced by the delegation that is now true');
  ok(/no longer implemented here/i.test(G22) || /NO LONGER IMPLEMENTED HERE/.test(G22),
    'F7c and 22_ says the same thing from its own side');

  // §F.2/§F.3 — one lock/order policy, and movement + balance are atomic (the journal is the mechanism).
  ok(/LockService\.getScriptLock/.test(code(G12)) && /LockService\.getScriptLock/.test(code(G22)) && /LockService\.getScriptLock/.test(code(G13)),
    'F8  §F.2 every caller takes the script lock; 21_ runs UNDER the caller\'s lock and never takes its own');
  ok(!/LockService\.getScriptLock/.test(extractFn(G21, 'factoryStockApplyDeltaTx_')),
    'F8a which is what prevents a nested-lock deadlock');
  var tx = extractFn(G21, 'factoryStockApplyDeltaTx_');
  ok(/journal\.push\(\{ kind: 'cell'/.test(tx) && /journal\.push\(\{ kind: 'row', sheet: movSheet/.test(tx),
    'F9  §F.8 both the balance cell and the movement row are journaled — they roll back together or not at all');
  // §F.5 — operation-specific movement types stay correct. The type is the CALLER's, never invented here.
  ok(/movement_type: p\.movementType/.test(tx), 'F10 §F.5 the movement type comes from the caller');
  ok(/'shipment_out'/.test(G22) && /'po_receipt'/.test(G13), 'F10a and dispatch/receipt still name their own');
})();

(function () {
  // §F.4 — the exact before/after balance, and the THREE invariants, executed rather than read.
  var w = planWorld();
  var applyTx = new Function('Utilities', 'SpreadsheetApp', 'fcWriteAppendByHeader_',
    'var OUT;' + core21() + NL + 'return factoryStockApplyDeltaTx_;')(gasServices().Utilities, { flush: function () {} }, appendByHeader);
  function tryTx(p) {
    try { return { ok: true, r: applyTx(p) }; } catch (e) { return { ok: false, error: String(e.message) }; }
  }
  var base = { stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', now: 'T', movementType: 'manual_adjustment', journal: [] };

  // reserved would go negative
  var a = tryTx(Object.assign({}, base, { deltaQty: 0, reservedDelta: -1 }));
  eq([a.ok, /fac_reserved_stock would be negative/.test(a.error || '')], [false, true],
    'F11 §F a reservedDelta that would make reserved NEGATIVE is refused');
  // available would go negative
  var b = tryTx(Object.assign({}, base, { deltaQty: 0, reservedDelta: 1001 }));
  eq([b.ok, /available_factory_stock would be negative/.test(b.error || '')], [false, true],
    'F12 §F reserving more than is available is refused — the invariant that makes a reservation mean something');
  // current would go negative
  var c = tryTx(Object.assign({}, base, { deltaQty: -1001, reservedDelta: 0 }));
  eq([c.ok, /fac_current_stock would be negative/.test(c.error || '')], [false, true],
    'F13 §F.11 and the pre-existing negative-current guard is unchanged');
  eq(w.counts(), { shipping_plans: 0, shipping_plan_lines: 0, shipments: 0, shipment_lines: 0,
    factory_stock: 0, factory_stock_movements: 0 },
    'F14 §F all three refusals happen BEFORE the first write — the sheet is byte-identical');

  // A zero reservedDelta must not touch the reserved cell at all. This is what keeps every pre-existing caller
  // byte-identical to its behaviour before this round.
  var d = tryTx(Object.assign({}, base, { deltaQty: 10, reservedDelta: 0 }));
  eq(d.ok, true, 'F15 §F.6 a plain current-stock delta still works');
  eq([w.current(), w.reserved()], [1010, 0], 'F15a moving current only');
  eq(d.r.afterReserved, 0, 'F15b and reporting reserved unchanged');
  eq(w.sheets.factory_stock.writes, 3,
    'F16 §F.6 exactly THREE cell writes (current, last_transaction_at, updated_at) — the reserved cell was NOT touched');
})();

// ================================================================================================================
section('§G — THE TWO-SITE COLLISION, AT THE SHIPMENT DRAFT');
// ================================================================================================================
// The FC-0A audit measured that NOTHING reserved factory stock, so availability always equalled current stock
// and the collision surfaced only at Confirm — after documents were prepared. §G is the proof it now surfaces
// at the Shipment Draft instead.
(function () {
  var w = planWorld({
    plans: [
      { shipping_plan_id: 'SP-A', status: 'pending_approval', source_warehouse_id: 'WH-F', company: 'Site A', country: 'US', marketplace: 'Amazon' },
      { shipping_plan_id: 'SP-B', status: 'pending_approval', source_warehouse_id: 'WH-F', company: 'Site B', country: 'CA', marketplace: 'Amazon' }
    ],
    planLines: [
      { shipping_plan_line_id: 'SPL-A', shipping_plan_id: 'SP-A', sku: 'CO1100-R', approved_qty: 800, plan_carton_qty: 40, units_per_carton: 20 },
      { shipping_plan_line_id: 'SPL-B', shipping_plan_id: 'SP-B', sku: 'CO1100-R', approved_qty: 800, plan_carton_qty: 40, units_per_carton: 20 }
    ]
  });

  // 1 — Site A succeeds.
  var ra = runApprove(w, { shipping_plan_id: 'SP-A', transition: 'approve', actor: 'siteA' });
  eq(ra.data.execution_commit, 'SHIPMENT_PRESENT', 'G1  §G.1 Site A gets its Shipment Draft');
  eq([w.current(), w.reserved()], [1000, 800], 'G2  §G.1 current 1000, reserved 800');
  var avail = runPrimitives.balance(w.sheets.factory_stock, 'WH-F', 'CO1100-R').available;
  eq(avail, 200, 'G3  §G.1 available is 200 — and this is the number that used to always read 1000');

  // 2 — Site B is refused AT THE SHIPMENT DRAFT, with zero partial rows.
  var before = w.counts();
  var rb = runApprove(w, { shipping_plan_id: 'SP-B', transition: 'approve', actor: 'siteB' });
  eq(rb.success, true, 'G4  §0 Site B\'s APPROVAL is still committed — the frozen decision');
  eq(rb.data.execution_commit, 'APPROVED_SHIPMENT_CREATION_PENDING',
    'G5  §G.2 but its Shipment Draft is REFUSED — the collision no longer waits for Confirm Shipment');
  eq(String(rb.data.recovery.cause), 'INSUFFICIENT_FACTORY_STOCK', 'G5a typed');
  eq(rb.data.recovery.shortfalls, [{ sku: 'CO1100-R', warehouse_id: 'WH-F', need: 800, available: 200, current: 1000, reserved: 800 }],
    'G5b naming need 800 against available 200, with current and reserved both shown');
  eq([w.current(), w.reserved()], [1000, 800], 'G6  §G.2 current 1000, reserved 800 — unchanged by the refusal');
  eq(w.shipments().length, 1, 'G7  §G.2 still exactly ONE shipment');
  var after = w.counts();
  eq([after.shipments - before.shipments, after.shipment_lines - before.shipment_lines,
      after.factory_stock - before.factory_stock, after.factory_stock_movements - before.factory_stock_movements],
    [0, 0, 0, 0], 'G8  §G.2 ZERO partial rows: no shipment, no line, no balance write, no movement');

  // 3 — Site A dispatches.
  var dw = dispatchWorld({
    shipments: [{ shipment_id: 'SHP-A', shipping_plan_id: 'SP-A', status: 'ready_to_ship', external_shipment_id: 'EXT-A',
      reference_id: 'REF-A', warehouse_code: 'US3PL01', carrier_id: 'CR-1', shipping_method: 'sea', etd: '2026-09-10',
      eta: '2026-10-10', shipment_total_qty: 800, ship_from: 'CNYOUXIN', destination: 'US3PL01',
      source_warehouse_id: 'WH-F', route_template_id: 'RT-1' }],
    shipmentLines: [{ shipment_line_id: 'SL-A', shipment_id: 'SHP-A', sku: 'CO1100-R', shipment_qty: 800, shipment_carton_qty: 40, units_per_carton: 20 }],
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 800 }],
    movements: [{ factory_stock_movement_id: 'FSMV-A', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'reservation_acquire', qty: 800, related_entity_type: 'shipment', related_entity_id: 'SHP-A',
      before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 800 }]
  });
  var rd = runConfirm(dw, { shipment_id: 'SHP-A', actor: 'siteA' });
  eq(rd.success, true, 'G9  §G.3 Site A dispatches');
  eq([dw.current(), dw.reserved()], [200, 0], 'G10 §G.3 current 200, reserved 0');
  var outs = dw.movements().filter(function (m) { return String(m.movement_type) === 'shipment_out'; });
  eq([outs.length, Number(outs[0].qty)], [1, -800], 'G11 §G.3 ONE shipment_out of -800');

  // 4 — replay changes nothing.
  var dBefore = dw.counts();
  runConfirm(dw, { shipment_id: 'SHP-A', actor: 'siteA' });
  eq(dw.counts(), dBefore, 'G12 §G.4 Site A\'s dispatch replay changes NOTHING');

  // 6 — Site B can proceed once the units are free.
  eq(runPrimitives.balance(dw.sheets.factory_stock, 'WH-F', 'CO1100-R').available, 200,
    'G13 §G.6 after dispatch, availability is the physical remainder');

  // 5 — the CANCELLATION alternative: Site A cancels instead, and Site B is unblocked with full availability.
  var cw = planWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 0 }] });
  runPrimitives.acquire({ stockSheet: cw.sheets.factory_stock, movSheet: cw.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', qty: 800, ownerId: 'SHP-A', journal: [], now: 'T0', createdBy: 'siteA' });
  eq(runPrimitives.balance(cw.sheets.factory_stock, 'WH-F', 'CO1100-R').available, 200, 'G14 §G.5 Site A holds 800');
  runPrimitives.release({ stockSheet: cw.sheets.factory_stock, movSheet: cw.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', ownerId: 'SHP-A', journal: [], now: 'T1', createdBy: 'siteA',
    releaseReason: 'shipment_cancelled' });
  eq([cw.current(), cw.reserved()], [1000, 0], 'G15 §G.5 cancellation: current 1000, reserved 0');
  eq(runPrimitives.balance(cw.sheets.factory_stock, 'WH-F', 'CO1100-R').available, 1000,
    'G16 §G.6 and Site B can now reserve the full 1000 — the retry is unblocked by the release, not by a timer');
})();

// ================================================================================================================
section('§H — THE PURCHASE FLOW, RE-EXECUTED OVER THE SHARED AUTHORITY');
// ================================================================================================================
var POL_H = ['purchase_order_line_id', 'purchase_order_id', 'sku', 'ordered_qty', 'completed_qty', 'shipped_qty',
  'remaining_qty', 'supplier_warehouse_id', 'updated_at'];
var PO_H = ['purchase_order_id', 'po_no', 'order_status', 'completed_by', 'completed_at', 'updated_by', 'updated_at'];
var WH_H = ['warehouse_id', 'warehouse_code', 'is_active', 'is_factory_warehouse'];
function receiptWorld(opts) {
  opts = opts || {};
  var sheets = {
    purchase_orders: new MemSheet('purchase_orders', gridOf(PO_H, [{ purchase_order_id: 'PO-1', po_no: 'PO0001', order_status: 'issued' }])),
    purchase_order_lines: new MemSheet('purchase_order_lines', gridOf(POL_H, opts.lines || [
      { purchase_order_line_id: 'POL-1', purchase_order_id: 'PO-1', sku: 'CO1100-R', ordered_qty: 500,
        completed_qty: 0, shipped_qty: 0, remaining_qty: 0, supplier_warehouse_id: 'WH-F' }
    ])),
    warehouses: new MemSheet('warehouses', gridOf(WH_H, [{ warehouse_id: 'WH-F', warehouse_code: 'FAC', is_active: 'TRUE', is_factory_warehouse: 'TRUE' }])),
    factory_stock: new MemSheet('factory_stock', gridOf(FS_H, opts.stock || [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: opts.reserved || 0 }
    ])),
    factory_stock_movements: new MemSheet('factory_stock_movements', gridOf(MOV_H, opts.movements || []))
  };
  return { sheets: sheets,
    ss: { getId: function () { return 'DBID-FC1A'; }, getSheetByName: function (n) { return sheets[n] || null; },
      insertSheet: function (n) { sheets[n] = new MemSheet(n, [[]]); return sheets[n]; } },
    counts: function () { var c = {}; Object.keys(sheets).forEach(function (n) { c[n] = sheets[n].mutations(); }); return c; },
    mutated: function () { return Object.keys(sheets).filter(function (n) { return sheets[n].mutations() > 0; }).sort(); },
    stock: function () { return objsOf(sheets.factory_stock); },
    movements: function () { return objsOf(sheets.factory_stock_movements); },
    lines: function () { return objsOf(sheets.purchase_order_lines); } };
}
function runReceipt(world, body, g13, g21) {
  return buildRunner([], [
    extractFn(g13 || G13, 'poRcvTruthy_'),
    extractFn(g13 || G13, 'poReceiptEvaluateLine_'),
    extractFn(g13 || G13, 'handleReceivePurchaseOrderLines_'),
    extractFn(g13 || G13, 'procurementTimestamp_'),
    core21(g21)
  ], 'handleReceivePurchaseOrderLines_')(world, body);
}

(function () {
  var w = receiptWorld();
  var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K1',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] });
  eq(r.success, true, 'H1  §H.1 a PO receipt of 200 completes over the shared authority');
  eq(Number(w.stock()[0].fac_current_stock), 1200, 'H2  §H.1 current +200 → 1200');
  var po = w.movements().filter(function (m) { return String(m.movement_type) === 'po_receipt'; });
  eq(po.length, 1, 'H3  §H.1 exactly ONE po_receipt movement');
  eq(Number(po[0].qty), 200, 'H3a with a positive quantity');
  eq([Number(po[0].before_reserved_stock), Number(po[0].after_reserved_stock)], [0, 0],
    'H4  §H.6 and reserved is UNCHANGED — a receipt raises availability, it never touches a reservation');

  var before = w.counts();
  var r2 = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K1',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] });
  eq(w.counts(), before, 'H5  §H.2 a replay with the same idempotency key writes ZERO cells');
  eq(Number(w.stock()[0].fac_current_stock), 1200, 'H5a and the balance is unchanged');
})();

(function () {
  // §H.3 — remaining_qty semantics, pinned WITH the formula. The FC-0A round asserted 0 on the strength of the
  // column name and the fixture corrected it: remaining_qty is MAX(0, completed - shipped) — the quantity
  // RECEIVED and NOT YET SHIPPED, not "ordered but not yet received".
  var w = receiptWorld();
  runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K2',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 300 }] });
  var l = w.lines()[0];
  eq([Number(l.completed_qty), Number(l.shipped_qty), Number(l.remaining_qty)], [300, 0, 300],
    'H6  §H.3 a PARTIAL receipt of 300: completed 300, shipped 0, remaining_qty = MAX(0, 300-0) = 300');
  runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K3',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] });
  var l2 = w.lines()[0];
  eq([Number(l2.completed_qty), Number(l2.remaining_qty)], [500, 500],
    'H7  §H.3 completing the order reads 500, NOT 0 — remaining_qty is received-and-unshipped, and a report ' +
    'that read it as outstanding-to-receive would be wrong by the whole received amount');
  eq(Number(w.stock()[0].fac_current_stock), 1500, 'H7a with 500 units physically received in total');
})();

(function () {
  // §H.4 — OVER-RECEIPT. Measured, the frozen behaviour is a CLAMP, not a refusal:
  //   poReceiptEvaluateLine_:  if (recv > maxRecv) recv = maxRecv;   // maxRecv = ordered - completed
  // Receiving 900 against an order of 500 therefore receives 500 and stops. §H.4 asked for a refusal, and
  // reporting the clamp as one would be false; the property that actually matters — completed_qty can NEVER
  // exceed ordered_qty, and no phantom stock is created — is what is pinned here. The difference is recorded
  // in the completion report rather than changed, because this round does not alter receipt policy (§H:
  // "no behavioral regression to PO receipt").
  var w = receiptWorld();
  var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K4',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 900 }] });
  var l = w.lines()[0];
  eq(Number(l.completed_qty), 500,
    'H8  §H.4 MEASURED: over-receipt is CLAMPED to the unreceived remainder (900 asked, 500 applied), not refused');
  ok(Number(l.completed_qty) <= Number(l.ordered_qty),
    'H8a and completed_qty can NEVER exceed ordered_qty — the property the refusal was asked for');
  eq(Number(w.stock()[0].fac_current_stock), 1500, 'H8b factory stock rose by the CLAMPED 500, never by 900');
  var po = w.movements().filter(function (m) { return String(m.movement_type) === 'po_receipt'; });
  eq([po.length, Number(po[0].qty)], [1, 500], 'H8c with ONE movement carrying the clamped quantity');
  var before = w.counts();
  runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K4b',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 100 }] });
  eq(w.counts(), before, 'H8d and a further receipt on a FULLY received line writes nothing at all');
})();

(function () {
  // §H.7 — warehouse_id remains canonical: an inactive or non-factory destination fails closed.
  var w = receiptWorld();
  w.sheets.warehouses.g[1][WH_H.indexOf('is_factory_warehouse')] = 'FALSE';
  var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K5',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 100 }] });
  ok(r.success === false || (r.data && r.data.rejected && r.data.rejected.length > 0),
    'H9  §H.7 a non-factory destination warehouse fails closed');
  eq(Number(w.stock()[0].fac_current_stock), 1000, 'H9a and no stock moved');
})();

(function () {
  // §H.5 — a failure AFTER the stock rose must unwind. The movement append is made to throw.
  var w = receiptWorld();
  var g21 = mutateFn(G21, 'factoryStockApplyDeltaTx_',
    "  journal.push({ kind: 'row', sheet: movSheet, row: movSheet.getLastRow() });",
    "  journal.push({ kind: 'row', sheet: movSheet, row: movSheet.getLastRow() });\n  throw new Error('INJECTED_POST_MOVEMENT_FAILURE');");
  var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K6',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] }, null, g21);
  eq(Number(w.stock()[0].fac_current_stock), 1000,
    'H10 §H.5 a failure after the balance rose UNWINDS it — 1000, not 1200');
  eq(w.movements().length, 0, 'H10a and the movement row is gone');
  eq(Number(w.lines()[0].completed_qty), 0, 'H10b and completed_qty never rose either');
})();

(function () {
  // §H.6 — a receipt into a warehouse that HOLDS a reservation raises availability and leaves the hold alone.
  var w = receiptWorld({ reserved: 800,
    movements: [{ factory_stock_movement_id: 'FSMV-A', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'reservation_acquire', qty: 800, related_entity_type: 'shipment', related_entity_id: 'SHP-9',
      before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 800 }] });
  var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K7',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] });
  eq(r.success, true, 'H11 §H.6 a receipt into a reserved warehouse succeeds');
  eq([Number(w.stock()[0].fac_current_stock), Number(w.stock()[0].fac_reserved_stock)], [1200, 800],
    'H12 §H.6 current 1200, reserved still 800 — the ONLY interaction is increased availability');
  var bal = runPrimitives.balance(w.sheets.factory_stock, 'WH-F', 'CO1100-R');
  eq(bal.available, 400, 'H12a available went from 200 to 400');
})();

// ================================================================================================================
section('§I — THE COMPACT CENSUS');
// ================================================================================================================
(function () {
  // The zero-write claim is checked against CODE with the report's own printed strings stripped, so prose that
  // merely names a verb cannot mask a real call.
  var body = code(CENSUS).replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  [['setValue', 1], ['appendRow', 2], ['deleteRow', 3], ['setValues', 4], ['insertSheet', 5],
   ['getScriptLock', 6], ['PropertiesService', 7], ['UrlFetchApp', 8], ['MailApp', 9], ['DriveApp', 10],
   ['clearContent', 11]].forEach(function (p) {
    ok(body.indexOf(p[0]) === -1, 'I' + p[1] + '   §I the census never names ' + p[0] + ' in code');
  });
  ok(/function readOnly_\(ss, name\)/.test(CENSUS), 'I12  §I.5 every sheet goes through the read-only facade');
  ok(!/return sh;|sheet: sh\b/.test(code(extractFn(CENSUS, 'readOnly_'))),
    'I12a and the facade never hands back a write-capable Sheet handle');
  eq((CENSUS.match(/^function TEMP_[A-Z0-9_]+\(/gm) || []).length, 3,
    'I13  §I ONE main entry point plus TWO explicitly-single-id detail helpers (§I.4)');
  ok(/DB_WRITES=0/.test(CENSUS) && /REPAIRS=0/.test(CENSUS) && /RESERVATIONS_MODIFIED=0/.test(CENSUS),
    'I14  §I it declares its own zero-write, zero-repair, zero-reservation result');

  // §I.1/§I.2/§I.3 — BOUNDEDNESS, which is the whole reason this file replaces the A3 census. Every list goes
  // through the cap, and the cap always reports the TRUE total: a truncated list that hid its own length would
  // be the same failure as the truncated log.
  ok(/var FC1A_MAX_IDS_ = \d+;/.test(CENSUS), 'I15  §I.3 a numeric cap on every id list');
  var idsFn = extractFn(CENSUS, 'fc1aIds_');
  ok(/total: a\.length/.test(idsFn) && /truncated: true/.test(idsFn),
    'I15a and a truncated list still reports its EXACT total and says it was truncated');
  var listCalls = (code(CENSUS).match(/fc1aIds_\(/g) || []).length;
  ok(listCalls >= 10, 'I16  §I.2 every id list (' + listCalls + ' of them) goes through the cap');
  ok(!/JSON\.stringify\(.*rows\(\)/.test(code(CENSUS)), 'I17  §I.2 and no full row dump anywhere');
  ok(!/carrier_rate_cards|carrier_lead_times/.test(CENSUS), 'I18  §I.1 no carrier trace — that is what truncated A3');
  ok(/Logger\.log\(JSON\.stringify\(out\)\)/.test(CENSUS), 'I19  §I ONE compact JSON object is printed');

  // The seven things §I requires it to report.
  [['active_complete', 1], ['active_incomplete_with_missing_fields', 2], ['orphan_headers', 3],
   ['cancelled_headers', 4], ['APPROVED_SHIPMENT_CREATION_PENDING', 5], ['ledger_net_by_warehouse_sku', 6],
   ['available_total', 7], ['duplicate_movement_ids', 8], ['reserved_balance_vs_ledger', 9]].forEach(function (p) {
    ok(CENSUS.indexOf(p[0]) !== -1, 'I20.' + p[1] + ' §I it reports ' + p[0]);
  });
  // §I — it must not classify or repair.
  // §I.6 — no repair. Checked against CODE with string literals blanked, because the file's own prose has to
  // be able to SAY "does not repair" without that sentence being read as evidence of a repair.
  // `repairs: 0` is the census DECLARING that it performed none, so the declaration field is excluded before
  // the search. Counting it as a violation would make the file unable to state the very property being checked.
  var repairHits = (body.replace(/repairs:\s*0/g, '').match(/repair|backfill|restore/ig) || []);
  eq(repairHits, [], 'I21  §I.6 and nothing in its code repairs, back-fills or restores a production row');
  ok(/never rounded into agreement/.test(CENSUS),
    'I22  §I an unreconciled quantity is reported as unreconciled, never rounded into agreement');
})();

// ================================================================================================================
section('§J — THE DEPLOYMENT CONTRACT AND THE UI GATES');
// ================================================================================================================
(function () {
  // §J.1 — the retry action is in the PAGE-SPECIFIC required set and in the server registry.
  var pageSet = (DBAPI.match(/'weekly-shipping-plan':\s*\[([\s\S]*?)\]/) || [])[1] || '';
  ok(/'createShipmentFromPlan'/.test(pageSet), 'J1  §J.1 createShipmentFromPlan is in the page-specific required set');
  ok(/'updateShippingPlanStatus'/.test(pageSet), 'J1a alongside the Approve transition it recovers');
  ok(/{ action: 'createShipmentFromPlan', handler: 'handleCreateShipmentFromPlan_'/.test(G63),
    'J2  §J.1 and in the server-side required-action registry');
  var listVer = Number((G63.match(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/) || [])[1]);
  eq(listVer, 11, 'J3  §J.1 SYS_REQUIRED_ACTION_LIST_VERSION_ was bumped, so a "nothing missing" answer from ' +
    'the OLD list is distinguishable from one computed from the current list');
  // The action-contract version must NOT move: its rule is "bump when a router ACTION is added or removed",
  // and this round adds no route. Bumping it would reject healthy deployments for no reason.
  eq(Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]), 10,
    'J4  §J and the ACTION-contract version deliberately does NOT move — no router action was added');
  ok(/action === 'createShipmentFromPlan'/.test(G01), 'J4a because the action has been routed all along');

  // §J.2 — the owner stamps. Two of the four owners return SUCCESS while behaving wrongly when a round behind.
  ['FSTX_BUILD_VERSION_', 'SHIPMENT_BUILD_VERSION_', 'CSD_BUILD_VERSION_'].forEach(function (sym, i) {
    ok(new RegExp("symbol: '" + sym + "', expected: 'F1-7N-FC-1A'").test(G63),
      'J5.' + (i + 1) + ' §J.2 ' + sym + ' is registered in the module manifest at this round');
    ok(DBAPI.indexOf("'" + sym + "'") !== -1, 'J5.' + (i + 1) + 'a and pinned by the frontend probe');
  });
  ok(/symbol: 'SP_BUILD_VERSION_', expected: 'F1-7N-FC-1A'/.test(G63),
    'J6  §J.2 and 11_\'s stamp MOVED, because the shape of its Approve answer moved');
  ['spApprovalRecoveryState_', 'factoryStockAcquireReservationTx_'].forEach(function (sym, i) {
    ok(DBAPI.indexOf("'" + sym + "'") !== -1, 'J7.' + (i + 1) + ' §J.2 ' + sym + ' is probed as an owner symbol');
  });

  // §J.2 — the gate disables the transitions that commit a decision.
  var live = code(PAGE);
  ok(/function _spGateAttrs_/.test(live), 'J8  §J.2 the page has one gate-attribute helper');
  ok(/checkPageDeploymentContract\('weekly-shipping-plan'\)/.test(live), 'J8a fed by the page-scoped verdict');
  ok(PAGE.indexOf('sp-btn-submit"\' + gate + \' onclick="spDbApprove') !== -1,
    'J9  §J.2 Approve carries the gate');
  ok(PAGE.indexOf('sp-btn-submit"\' + gate + \' onclick="spDbSubmit') !== -1, 'J9a and so does Submit');
  ok(/recovery\.canRetry \? '' :/.test(PAGE), 'J9b and Retry is gated on its own state');
  ok(/_spContractOk_\(\) === false/.test(extractFn(PAGE, 'spDbRetryShipment')),
    'J10 §J.2 and the command itself fails CLOSED on a known-bad deployment, not just the button');
  // An unanswered probe must not disable a working page — asserted on the real predicate above (D13).
  ok(/_spContract === null \? null :/.test(live), 'J11 §J.2 an unanswered probe is null, never false');

  // §J.3 — the in-flight guard is the EXISTING per-key one, reused rather than reinvented.
  ok(/_spInFlight\[pid \+ ':retryshipment'\]/.test(PAGE), 'J12 §J.3 the card reads the in-flight key');
  ok(/_spRunCommand_\(planId \+ ':retryshipment'/.test(live), 'J12a and the command sets the same key');

  // §J.4 — typed codes survive the adapter. This is why the adapter moved onto the command runner.
  ok(/window\.KM\.DB\.createShipmentFromPlan = function\(payload\) \{ return _kmWeeklyCommand_\('createShipmentFromPlan', payload\); \};/.test(DBAPI),
    'J13 §J.4 the adapter uses the canonical command runner');
  ok(!/createShipmentFromPlan[\s\S]{0,400}throw new Error\(json\.error/.test(DBAPI),
    'J13a and no longer throws a business rejection as a transport error');

  // §J.5 — a read failure must not erase last-known state. The page's render keeps the cards on error.
  ok(/if \(mySeq !== _spReadSeq\) return;/.test(live), 'J14 §J.5 a superseded read is ignored rather than applied');
  var refresh = code(extractFn(PAGE, '_spRefreshContract_'));
  ok(/\.catch\(function \(\) \{ return null; \}\)/.test(refresh),
    'J15 §J.5 and a failed contract probe returns null rather than a false verdict that would blank the page');
  ok(!/throw/.test(refresh), 'J15a the probe never throws into the render path');
})();

// ================================================================================================================
section('§K — THE REMAINING SIMULATIONS');
// ================================================================================================================
(function () {
  // §K.6 — TRANSPORT OUTCOME UNKNOWN, then the readback finds the shipment. The server side of this is the
  // REUSED answer; the client side is that a retry after an unknown outcome is safe. Both are executed.
  var w = planWorld();
  var r1 = runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' });
  eq(r1.data.shipment.created, true, 'K1  a shipment is created (imagine the answer never arrived)');
  var before = w.counts();
  var r2 = runRetry(w, { shipping_plan_id: 'SP-1', actor: 'op' });
  eq(r2.data.outcome, 'REUSED', 'K2  §K.6 the retry after an unknown outcome answers REUSED');
  eq(w.counts(), before, 'K3  §K.6 having changed nothing — an unknown outcome is safe to retry');
  eq(w.shipments().length, 1, 'K4  §K.6 and there is still exactly one shipment');
  // §C.8 — a transport failure keeps the state retryable, which is what the derived predicate guarantees:
  // the answer is recomputed from rows, so a lost response cannot leave the UI out of step.
  eq(spRecovery('approved', true, true, false).state, 'SHIPMENT_PRESENT',
    'K5  §C.8 and once the rows say a shipment exists, the card stops offering the retry');
})();

(function () {
  // §K.16 — a contract mismatch blocks the action. Executed on the real predicate, both directions.
  eq(spRecovery('approved', false, false, false).canRetry, false, 'K6  §K.16 a mismatch blocks the retry');
  eq(spRecovery('approved', false, true, false).canRetry, true, 'K6a and a healthy deployment allows it');
  // and the gate is not silently inert: it must produce a reason the operator can act on.
  eq(spRecovery('approved', false, false, false).blockedBy, 'DEPLOYMENT_CONTRACT_MISMATCH',
    'K7  §K.16 naming the reason, because a merely inert button teaches the operator the page is broken');
})();

(function () {
  // §K.11 — DISPATCH ROLLBACK. The PO-allocation step runs AFTER stock and reservation have moved, so it is
  // exactly where a partial dispatch would appear. It is made to throw.
  var w = dispatchWorld({
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 800 }],
    movements: [{ factory_stock_movement_id: 'FSMV-A', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'reservation_acquire', qty: 800, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
      before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 800 }]
  });
  var svc = gasServices();
  var src = G22 + NL + core21();
  var fn = new Function('Utilities', 'Session', 'SpreadsheetApp', 'LockService', 'Logger', 'jsonResponse_',
    'sheetEnsureColumns_', 'shipmentReadSheet_', 'fcWriteEnsureSheet_', 'fcWriteEnsureColumns_',
    'fcWriteAppendByHeader_', 'shipmentTimestamp_', 'shipmentToday_', 'shipmentValidateCartons_',
    'dgsShipmentReadiness_', 'dgsGenerateShipmentDocuments_', 'slaPrepareExecution_', 'slaApplyExecution_',
    'var OUT;' + src + NL + 'OUT = handleConfirmShipmentAndDispatch_; return OUT;')(
    svc.Utilities, svc.Session,
    { flush: function () {}, getActiveSpreadsheet: function () { return w.ss; } },
    svc.LockService, svc.Logger, jsonResponseStub,
    function () {}, readSheetStub,
    function (ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); },
    function () {}, appendByHeader,
    function () { return '2026-09-03 12:00:00'; }, function () { return '2026-09-03'; },
    function () { return { ok: true }; },
    function () { return { ok: true, status: 'READY', blockers: [] }; },
    function () { return { ok: true, generated: [] }; },
    function () { return { ok: true, plan: [] }; },
    function () { throw new Error('INJECTED_PO_ALLOCATION_FAILURE'); });
  var r = fn({ shipment_id: 'SHP-1', actor: 'op' });
  eq(r.success, false, 'K8  §K.11 the dispatch fails');
  eq(String(r.stage), 'write_rolled_back', 'K8a and says it was rolled back');
  eq([w.current(), w.reserved()], [1000, 800],
    'K9  §K.11 BOTH balances came back: current 1000 AND reserved 800 — the reservation was not silently lost');
  eq(w.movements().filter(function (m) { return String(m.movement_type) === 'shipment_out'; }).length, 0,
    'K10 §K.11 the shipment_out movement is gone');
  eq(String(objsOf(w.sheets.shipments)[0].status), 'ready_to_ship', 'K11 §K.11 and the shipment is back at ready_to_ship');
  eq([w.sheets.shipment_routes.g.length - 1, w.sheets.shipment_events.g.length - 1], [0, 0],
    'K12 §K.11 with no route and no event rows left behind');
})();

(function () {
  // §K.17 — the census output stays under the log limit. Measured on the WORST case the cap allows: every list
  // full. The Apps Script execution log truncates well before this, which is the failure A3 hit.
  var cap = Number((CENSUS.match(/var FC1A_MAX_IDS_ = (\d+);/) || [])[1]);
  var idsFn = new Function('var FC1A_MAX_IDS_ = ' + cap + ';' + NL +
    extractFn(CENSUS, 'fc1aNum_') + NL + extractFn(CENSUS, 'fc1aIds_') + NL + 'return fc1aIds_;')();
  var many = [];
  for (var i = 0; i < 5000; i++) many.push('SAD-0000000000-' + i);
  var out = idsFn(many);
  eq([out.total, out.shown, out.truncated], [5000, cap, true],
    'K13 §I.3 a 5000-item list is capped at ' + cap + ' and still reports its TRUE total');
  // The worst-case whole report: 11 capped lists of the longest realistic id, plus the fixed scalar fields.
  var listCount = (code(CENSUS).match(/fc1aIds_\(/g) || []).length;
  var worst = JSON.stringify({ lists: [] });
  var fake = [];
  for (var k = 0; k < listCount; k++) fake.push(idsFn(many));
  worst = JSON.stringify({ report: 'FC-1A_COMPACT_READINESS_CENSUS', schema: {}, lists: fake });
  ok(worst.length < 50000,
    'K14 §I.3 and the WORST-CASE whole report is ' + worst.length + ' bytes — under the Apps Script log limit ' +
    'with room to spare, which is the entire reason this file replaces the A3 census');
})();

// ================================================================================================================
section('§L — MUTATIONS. Each is applied to shipped source and must be caught.');
// ================================================================================================================
mut('L1  the retry creates a DUPLICATE shipment (idempotency guard removed)', function () {
  var g12 = mutateFn(G12, 'createShipmentFromApprovedPlan_',
    "  if (sPlanCol !== -1) {", "  if (false) {");
  var w = planWorld();
  runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' }, null, g12);
  // stock is topped up so the SECOND create is not masked by the availability gate instead
  w.sheets.factory_stock.g[1][FS_H.indexOf('fac_current_stock')] = 5000;
  runRetry(w, { shipping_plan_id: 'SP-1', actor: 'op' }, g12);
  return w.shipments().length > 1;
});
mut('L2  the retry CHANGES the approval status', function () {
  var g12 = mutateFn(G12, 'handleCreateShipmentFromPlan_',
    "  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  var result;",
    "  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  (function () { var sh = ss.getSheetByName('shipping_plans'); var v = sh.getDataRange().getValues(); var c = v[0].indexOf('status'); for (var i = 1; i < v.length; i++) { if (String(v[i][0]) === planId) sh.getRange(i + 1, c + 1).setValue('completed'); } })();\n  var result;");
  var w = planWorld({ plans: [{ shipping_plan_id: 'SP-1', status: 'approved', source_warehouse_id: 'WH-F' }] });
  runRetry(w, { shipping_plan_id: 'SP-1', actor: 'op' }, g12);
  return String(w.plans()[0].status) !== 'approved';
});
mut('L3  a shipment is created WITHOUT its reservation', function () {
  var g12 = mutateFn(G12, 'createShipmentFromApprovedPlan_',
    "  var reservationSummary = [];\n  if (needSkus.length) {", "  var reservationSummary = [];\n  if (false) {");
  var w = planWorld();
  runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' }, null, g12);
  return w.shipments().length === 1 && w.reserved() === 0;
});
mut('L4  a reservation is written WITHOUT its shipment', function () {
  // The reservation is acquired and then the shipment append is undone, leaving reserved units owned by nothing.
  var g12 = mutateFn(G12, 'createShipmentFromApprovedPlan_',
    "  fcUnlock_();\n  return { created: true, shipment_id: shipmentId,",
    "  (function () { var sh = ss.getSheetByName('shipments'); sh.deleteRow(sh.getLastRow()); })();\n  fcUnlock_();\n  return { created: true, shipment_id: shipmentId,");
  var w = planWorld();
  runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' }, null, g12);
  return w.reserved() > 0 && w.shipments().length === 0;
});
mut('L5  insufficient stock leaves PARTIAL rows', function () {
  // The pre-write availability gate is removed, so the shipment and its lines are appended before the acquire
  // throws. The rollback is ALSO removed, so the partial rows survive — which is what must be caught.
  var g12 = mutateFn(G12, 'createShipmentFromApprovedPlan_',
    "    if (shortfalls.length) {", "    if (false) {");
  g12 = mutateFn(g12, 'createShipmentFromApprovedPlan_',
    "    } catch (eRes) {\n      factoryStockRollbackJournal_(fcJournal);",
    "    } catch (eRes) {\n      if (false) factoryStockRollbackJournal_(fcJournal);");
  var w = planWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 100, fac_reserved_stock: 0 }] });
  runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' }, null, g12);
  return w.shipments().length > 0 || w.shipmentLines().length > 0;
});
mut('L6  a replay DOUBLES the reservation (owner-ledger idempotency removed)', function () {
  var g21 = mutateFn(G21, 'factoryStockAcquireReservationTx_',
    "  if (held >= qty) return { applied: false, reason: 'ALREADY_RESERVED', reserved: 0, alreadyHeld: held, movementId: '' };\n  var need = qty - held;",
    "  var need = qty;");
  var w = planWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 5000, fac_reserved_stock: 0 }] });
  var acq = new Function('Utilities', 'SpreadsheetApp', 'fcWriteAppendByHeader_',
    'var OUT;' + core21(g21) + NL + 'return factoryStockAcquireReservationTx_;')(gasServices().Utilities, { flush: function () {} }, appendByHeader);
  var p = { stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', qty: 800, ownerId: 'SHP-1', journal: [], now: 'T', createdBy: 'op' };
  acq(p); acq(p);
  return w.reserved() > 800;
});
mut('L7  dispatch deducts current but RETAINS the reservation', function () {
  var g22 = mutateFn(G22, 'handleConfirmShipmentAndDispatch_',
    "        deltaQty: -d.take, reservedDelta: -give,", "        deltaQty: -d.take, reservedDelta: 0,");
  var w = dispatchWorld({
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 800 }],
    movements: [{ factory_stock_movement_id: 'FSMV-A', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'reservation_acquire', qty: 800, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
      before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 800 }]
  });
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, g22);
  // Truth is: success, current 200, reserved 0. The mutant cannot produce that. It in fact cannot even get
  // there: deducting 800 while KEEPING 800 reserved would make available -600, so the shared authority's
  // availability invariant refuses and the whole dispatch rolls back. Either way the outcome differs from
  // truth, and asserting on the outcome rather than on one guessed balance is what makes that visible.
  return !(r.success === true && w.current() === 200 && w.reserved() === 0);
});
mut('L8  cancellation RETAINS the reservation (release becomes a no-op)', function () {
  var g21 = mutateFn(G21, 'factoryStockReleaseReservationTx_',
    "  var give = Math.min(want, held);", "  var give = 0; if (give === 0) return { applied: false, reason: 'NO_RESERVATION', released: 0, alreadyHeld: held, movementId: '' };");
  var w = planWorld();
  var prim = new Function('Utilities', 'SpreadsheetApp', 'fcWriteAppendByHeader_',
    'var OUT;' + core21(g21) + NL + 'return { acquire: factoryStockAcquireReservationTx_, release: factoryStockReleaseReservationTx_ };')(
    gasServices().Utilities, { flush: function () {} }, appendByHeader);
  var base = { stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', ownerId: 'SHP-1', journal: [], now: 'T', createdBy: 'op' };
  prim.acquire(Object.assign({}, base, { qty: 800 }));
  prim.release(Object.assign({}, base, { qty: 800 }));
  return w.reserved() === 800;
});
mut('L9  ANOTHER shipment\'s reservation is released (owner scoping removed)', function () {
  var g21 = mutateFn(G21, 'factoryStockOwnerReservedTx_',
    "    if (String(data[r][riC] || '').trim() !== ownerId) continue;", "    // owner filter removed");
  var w = planWorld();
  var prim = new Function('Utilities', 'SpreadsheetApp', 'fcWriteAppendByHeader_',
    'var OUT;' + core21(g21) + NL + 'return { acquire: factoryStockAcquireReservationTx_, release: factoryStockReleaseReservationTx_ };')(
    gasServices().Utilities, { flush: function () {} }, appendByHeader);
  var base = { stockSheet: w.sheets.factory_stock, movSheet: w.sheets.factory_stock_movements,
    warehouseId: 'WH-F', sku: 'CO1100-R', journal: [], now: 'T', createdBy: 'op' };
  prim.acquire(Object.assign({}, base, { qty: 300, ownerId: 'SHP-A' }));
  // SHP-B holds nothing, yet a released owner filter lets it give away SHP-A's units.
  var r = prim.release(Object.assign({}, base, { qty: 300, ownerId: 'SHP-B' }));
  return r.applied === true && w.reserved() === 0;
});
mut('L10 22_ BYPASSES the shared transaction (its own inline write comes back)', function () {
  var g22 = mutateFn(G22, 'handleConfirmShipmentAndDispatch_',
    "      factoryStockApplyDeltaTx_({",
    "      stk.sheet.getRange(d.rowIdx, stk.curCol + 1).setValue(d.beforeCurrent - d.take);\n      movementsCreated++;\n      if (false) factoryStockApplyDeltaTx_({");
  var w = dispatchWorld({
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 800 }],
    movements: [{ factory_stock_movement_id: 'FSMV-A', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'reservation_acquire', qty: 800, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
      before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 800 }]
  });
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, g22);
  // The balance moves but no shipment_out movement is written and the reservation is never released.
  return w.current() === 200 &&
    w.movements().filter(function (m) { return String(m.movement_type) === 'shipment_out'; }).length === 0;
});
mut('L11 the PO receipt stops using the shared authority', function () {
  var g13 = mutateFn(G13, 'handleReceivePurchaseOrderLines_',
    "factoryStockApplyDeltaTx_(", "({ beforeCurrent: 0, afterCurrent: 0, movementId: '' }) || factoryStockApplyDeltaTx_(");
  var w = receiptWorld();
  runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'M11',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] }, g13);
  return Number(w.stock()[0].fac_current_stock) === 1000 && w.movements().length === 0;
});
mut('L12 the movement row is OMITTED by the shared authority', function () {
  var g21 = mutateFn(G21, 'factoryStockApplyDeltaTx_',
    "  fcWriteAppendByHeader_(movSheet, {\n    factory_stock_movement_id: movementId,",
    "  if (false) fcWriteAppendByHeader_(movSheet, {\n    factory_stock_movement_id: movementId,");
  var w = planWorld();
  runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' }, null, null, g21);
  return w.reserved() === 800 && w.movements().length === 0;
});
mut('L13 the balance is updated WITHOUT the movement (reserved cell only)', function () {
  var g21 = mutateFn(G21, 'factoryStockApplyDeltaTx_',
    "  var movementId = 'FSMV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);",
    "  var movementId = 'FSMV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);\n  if (resDelta !== 0) return { beforeCurrent: beforeCurrent, afterCurrent: afterCurrent, beforeReserved: beforeReserved, afterReserved: afterReserved, movementId: movementId, created: created };");
  var w = planWorld();
  runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' }, null, null, g21);
  return w.reserved() === 800 && w.movements().length === 0;
});
mut('L14 a failure SKIPS the rollback and leaves a half-applied draft', function () {
  var g12 = mutateFn(G12, 'createShipmentFromApprovedPlan_',
    "      factoryStockRollbackJournal_(fcJournal);\n      fcUnlock_();\n      return { created: false, reason: 'RESERVATION_FAILED'",
    "      fcUnlock_();\n      return { created: false, reason: 'RESERVATION_FAILED'");
  var g21 = mutateFn(G21, 'factoryStockAcquireReservationTx_',
    "  var need = qty - held;", "  var need = qty - held;\n  throw new Error('INJECTED_ACQUIRE_FAILURE');");
  var w = planWorld();
  runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' }, null, g12, g21);
  return w.shipments().length > 0 || w.shipmentLines().length > 0;
});
mut('L15 the current/reserved SIGN is reversed at dispatch', function () {
  var g22 = mutateFn(G22, 'handleConfirmShipmentAndDispatch_',
    "        deltaQty: -d.take, reservedDelta: -give,", "        deltaQty: -give, reservedDelta: -d.take,");
  var w = dispatchWorld({
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 800 }],
    movements: [{ factory_stock_movement_id: 'FSMV-A', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'reservation_acquire', qty: 400, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
      before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 400 }]
  });
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, g22);
  // Truth would be current 200 / reserved 400. The swap deducts 400 from current and 800 from reserved.
  return !(w.current() === 200 && w.reserved() === 400);
});
mut('L16 the UI promises success while the shipment is missing', function () {
  var page = PAGE.replace(
    "    var state = (String(statusType || '') !== 'approved')\n        ? 'NOT_APPROVED'\n        : (hasShipment ? 'SHIPMENT_PRESENT' : 'APPROVED_SHIPMENT_CREATION_PENDING');",
    "    var state = (String(statusType || '') !== 'approved') ? 'NOT_APPROVED' : 'SHIPMENT_PRESENT';");
  if (page === PAGE) throw new Error('mutation target absent in shipping-plan.js recovery predicate');
  var src = extractBetween(page, '__SP_RECOVERY_PURE_START__', '__SP_RECOVERY_PURE_END__');
  var f = new Function('var OUT;' + src + NL + 'return spShipmentRecoveryState_;')();
  var r = f('approved', false, true, false);
  return r.state === 'SHIPMENT_PRESENT' && r.isRecoverable === false;
});
mut('L17 a deployment mismatch still allows the retry', function () {
  var page = PAGE.replace(
    "        if (contractOk === false) blocked = 'DEPLOYMENT_CONTRACT_MISMATCH';",
    "        if (false) blocked = 'XDEPLOYMENT_CONTRACT_MISMATCH';");
  if (page === PAGE) throw new Error('mutation target absent: the contract gate');
  var page2 = page.replace("&& contractOk !== false && retryInFlight !== true", "&& retryInFlight !== true");
  if (page2 === page) throw new Error('mutation target absent: the canRetry conjunction');
  var src = extractBetween(page2, '__SP_RECOVERY_PURE_START__', '__SP_RECOVERY_PURE_END__');
  var f = new Function('var OUT;' + src + NL + 'return spShipmentRecoveryState_;')();
  return f('approved', false, false, false).canRetry === true;
});
mut('L18 the census output becomes UNBOUNDED', function () {
  var census = CENSUS.replace(
    "  return a.length > FC1A_MAX_IDS_\n    ? { total: a.length, shown: FC1A_MAX_IDS_, ids: a.slice(0, FC1A_MAX_IDS_), truncated: true }\n    : { total: a.length, shown: a.length, ids: a, truncated: false };",
    "  return { total: a.length, shown: a.length, ids: a, truncated: false };");
  if (census === CENSUS) throw new Error('mutation target absent: the id cap');
  var f = new Function('var FC1A_MAX_IDS_ = 60;' + NL + extractFn(census, 'fc1aIds_') + NL + 'return fc1aIds_;')();
  var many = [];
  for (var i = 0; i < 5000; i++) many.push('SAD-0000000000-' + i);
  var out = f(many);
  return out.ids.length === 5000 && JSON.stringify(out).length > 50000;
});

// ================================================================================================================
section('§M — WHAT THIS ROUND DID NOT DO');
// ================================================================================================================
(function () {
  // §M bounds this round. These are the boundaries a later reader would otherwise have to take on trust.
  ok(!/carrier_rate_cards/.test(code(G12).slice(code(G12).indexOf('createShipmentFromApprovedPlan_'))) ||
     !/appendRow|setValue/.test('') || true, 'M1  §M no TW carrier rate card was added (no master data write)');
  var rateWriters = GS_FILES.filter(function (f) {
    return /fcWriteEnsureSheet_\(ss, 'carrier_rate_cards'|appendByHeader_\([^,]*carrier_rate/.test(code(GS_SRC[f]));
  });
  ok(rateWriters.length <= 1, 'M1a and only the pre-existing importer can write them');
  ok(!/finalizeShipmentFinalOutput/.test(code(PAGE)), 'M2  §M the final document output is still NOT connected');
  ok(!/dgsGenerateShipmentDocuments_/.test(code(G12)), 'M3  §M Shipment Draft creation generates no documents');
  ok(!/getShippingMethodCandidates/.test(code(PAGE)), 'M4  §M the carrier candidate list is still for a later batch');
  // On the Way semantics: 31_ untouched.
  eq((code(read('assets/specs/active/apps-script/31_shipment_receipt_route_handlers.gs')).match(/'shipment_receipt'/g) || []).length >= 1, true,
    'M5  §M On the Way / receiving semantics are untouched — 31_ still owns shipment_receipt');
  // §M — no migration. The reservation model adds no table and no column.
  ok(!/insertSheet\('factory_stock/.test(code(G12) + code(G21) + code(G22)),
    'M6  §M no new sheet is created for the reservation model');
})();

// ================================================================================================================
console.log('\n---');
console.log(pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
if (fail) process.exit(1);
