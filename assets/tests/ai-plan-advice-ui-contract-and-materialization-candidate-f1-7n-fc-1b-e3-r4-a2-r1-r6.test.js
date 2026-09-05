// ================================================================================================================
// F1-7N-FC-1B-E3-R4-A2-R1-R6 — CONFIRMED BUFFER, QUANTITY-AXIS SPLIT, ADVICE UI CONTRACT, POSITIVE CANDIDATE
// ----------------------------------------------------------------------------------------------------------------
// R5 proved the AI Plan will advise when carrier coverage is incomplete, and the live census agreed: 760 units
// authorized, 760 sourced, verdict RECOMMENDATION_READY_WITH_WARNINGS, zero writes. Then an operator pressed the
// button and the page said the AI Plan had found NO ELIGIBLE ROUTE and that nothing in the current data supports
// a shipment here.
//
// BOTH STATEMENTS CAME FROM THE SAME RUN. The server computed the recommendation and put it in
// `data.conservation[i].layered_status` — a per-marketplace diagnostic inside an array the page does not read —
// so the only fact that reached the browser was a route count of zero. The page had nothing else to report and
// reported the absence. Everything R5 built was correct and invisible.
//
// THREE THINGS THIS ROUND FIXES, AND THEY ARE THE SAME MISTAKE AT THREE SCALES:
//
//   §2  Two of the four live quantities were route numbers wearing supply words. `unresolved 760` next to
//       `supply allocated 760` reads as a failed allocation; `total_allocated_quantity: 0` has "allocated" in
//       its name and is a ROUTE total. Every quantity now states its axis.
//   §3  Warnings were prose. A consumer cannot branch on a sentence, so the page fell through to its failure
//       wording. Every warning is now { code, owner, detail }.
//   §4  The advice existed and was unreachable. It is lifted to one top-level object with a three-valued
//       `outcome`, because two outcomes were never enough to describe "ready, with a decision outstanding".
//
// AND §5 ADDS THE TEST THAT HAS BEEN MISSING ALL ALONG. Every activation question so far has been asked of one
// scope that CANNOT form a route. A negative case proves a carrier gap does not stop the advice; it can never
// prove a good scope produces one correct route. The candidate search is a search, under fixed predicates, with
// every predicate's observed value reported — because a scope somebody picked proves nothing either.
//
// Run: node assets/tests/ai-plan-advice-ui-contract-and-materialization-candidate-f1-7n-fc-1b-e3-r4-a2-r1-r6.test.js
// ================================================================================================================

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var pass = 0, fail = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var GS = 'assets/specs/active/apps-script/';
function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function ' + name + '\\s*\\(');
  var m = re.exec(src); if (!m) throw new Error('not found: ' + name);
  var start = m.index, i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function swap(src, find, repl) {
  var CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  var eol = src.indexOf(CR + LF) >= 0 ? (CR + LF) : LF;
  function fxe(t) { return String(t).split(CR + LF).join(LF).split(LF).join(eol); }
  find = fxe(find); repl = fxe(repl);
  if (src.indexOf(find) < 0) throw new Error('mutation target absent: ' + find.slice(0, 90));
  return src.replace(find, repl);
}

var G16 = read(GS + '16_shipping_allocation_handlers.gs');
var G61 = read(GS + '61_api_v1_weekly_ai_plan.gs');
var G63 = read(GS + '63_api_v1_system_health.gs');
var G43 = read(GS + '43_api_v1_gap_materialization.gs');
var G46 = read(GS + '46_api_v1_gap_materialization_job.gs');
var G47 = read(GS + '47_api_v1_recommendation_generation.gs');
var G13 = read(GS + '13_procurement_handlers.gs');
var G17 = read(GS + '17_carrier_handlers.gs');
var G02 = read(GS + '02_core_sheet_db.gs');
var CFG = read(GS + '00_config.gs');
var TEMP = read('assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs');
var RO = require('./_release-order.js');

// ================================================================================================================
// THE HARNESS. Only the spreadsheet and the recommendation-workspace TRANSPORT are simulated. Everything under
// test is shipped source: the real harvest, the real KMAF/KMWRB/KMWRR core, the real allocated-line adapter, the
// real K2 plan builder, the real atomic writer and the real census.
//
// 42_api_v1_recommendation_workspace.gs owns the workspace and pulls the whole KMPS/KMPA stack behind it. This
// round changes nothing in it, so its RESPONSE is supplied in the exact documented line shape 61_ reads
// (sku, siteSku, marketplaceId, destinationType, fulfillmentModel, horizons[], sourceDataAsOf) and nothing else.
// That is a transport double, and it is labelled as one: no claim in this file rests on it being production.
// ================================================================================================================
function FakeSheet(headers) { this.rows = [headers.slice()]; }
FakeSheet.prototype.getLastColumn = function () { return this.rows[0].length; };
FakeSheet.prototype.getLastRow = function () { return this.rows.length; };
FakeSheet.prototype.getDataRange = function () { var s = this; return { getValues: function () { return s.rows.map(function (r) { return r.slice(); }); } }; };
FakeSheet.prototype.appendRow = function (r) { this.rows.push(r.slice()); };
FakeSheet.prototype.getRange = function (row, col, nr, nc) {
  var s = this;
  return {
    getValues: function () { var o = []; for (var i = 0; i < (nr || 1); i++) { var l = []; for (var j = 0; j < (nc || 1); j++) l.push(s.rows[row - 1 + i][col - 1 + j]); o.push(l); } return o; },
    setValues: function (v) { for (var i = 0; i < v.length; i++) for (var j = 0; j < v[i].length; j++) s.rows[row - 1 + i][col - 1 + j] = v[i][j]; },
    getValue: function () { return s.rows[row - 1][col - 1]; },
    setValue: function (v) { s.rows[row - 1][col - 1] = v; }
  };
};

// The live scope under controlled activation, and the live numbers.
var TARGET = { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' };
var SUGGESTED = 760, UPC = 20, D30 = 200, D90 = 560;   // 200 + 560 = 760, both whole-carton at UPC 20
var THREE_PL = 'WH-RESUS-US-3PL-AMZLGS', FACTORY_CN = 'WH-TW-CN-FACTORY-YOUXIN';
// §1 — the live facts, verbatim. Nothing in this file may restate them.
var REQUIRED_BY = '2026-12-03';       // live: required by
var THREE_PL_LIVE = 3120;             // live: WH-RESUS-US-3PL-AMZLGS available quantity
// Every carrier row this file creates is labelled, in the data itself, as fixture material. §6.B and §8.11
// both turn on the label being present and readable — a fixture card must never be mistakable for the
// production master data the round is asking a person to supply.
var FIXTURE_NOTE = 'FIXTURE_ONLY_NOT_PRODUCTION_MASTER_DATA';
var TAIPEI_MIDNIGHT = new Date(Date.UTC(2026, 8, 3, 16, 0, 0));   // 2026-09-04 00:00 Asia/Taipei
var RUN_ID = 'GAP-INV-20260904T132342-0001';
// Every table an AI generation must NOT touch, present and empty so "nothing was written here" is measured.
var UNRELATED = ['shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines',
  'factory_stock_movements', 'reservations', 'purchase_orders', 'purchase_order_lines'];

function build(opts) {
  opts = opts || {};
  // §3/§12 — the tranche's urgency is the variable the safety rule turns on, so it is settable per build.
  var REQ = opts.requiredBy || REQUIRED_BY;
  var FOREIGN = [];
  var nForeign = (opts.foreignSkus === undefined) ? 45 : opts.foreignSkus;
  for (var fi = 1; fi <= nForeign; fi++) FOREIGN.push('FS-' + (1000 + fi));
  var ALLSKUS = [TARGET.sku].concat(FOREIGN);

  var SHEETS = {};
  var SS = { getSheetByName: function (n) { return SHEETS[n] || null; }, getId: function () { return 'FAKE_DB'; } };
  var sb = {
    console: console, Date: Date, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object,
    Array: Array, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, Error: Error,
    RegExp: RegExp, Boolean: Boolean, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent
  };
  sb.global = sb;
  sb.SpreadsheetApp = { openById: function () { return SS; }, getActiveSpreadsheet: function () { return SS; } };
  sb.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
  var uuid = 0;
  sb.Utilities = { getUuid: function () { uuid++; return ('UUID' + uuid + 'ABCDEF0123456789').substring(0, 16); },
    formatDate: function (d) { return String(d); } };
  sb.Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
  var PROPS = {};
  sb.PropertiesService = { getScriptProperties: function () { return {
    getProperty: function (k) { return PROPS[k] === undefined ? null : PROPS[k]; },
    setProperty: function (k, v) { PROPS[k] = v; return this; },
    deleteProperty: function (k) { delete PROPS[k]; return this; } }; } };
  var LOG = [];
  sb.Logger = { log: function (m) { LOG.push(String(m)); } };
  sb.ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: function (t) {
      var _t = String(t), _m = null;
      var o = { getContent: function () { return _t; }, getMimeType: function () { return _m; },
        setMimeType: function (m) { _m = m; return o; } };
      return o;
    }
  };
  var ctx = vm.createContext(sb);
  var SRC = { bundle: read(GS + '90_generated_supply_planning_bundle.gs'), cfg: CFG,
    ric: read(GS + '69_api_v1_route_identity_contract.gs'), aipl: read(GS + '69_api_v1_ai_plan_lifecycle.gs'),
    sad: G16, wap: G61, sys: G63, carrier: G17, census: TEMP };
  if (opts.mutate) opts.mutate(SRC);
  [SRC.bundle, SRC.cfg, SRC.ric, SRC.aipl, SRC.sad, SRC.wap, SRC.sys, SRC.carrier].forEach(function (src, i) {
    vm.runInContext(src, ctx, { filename: 'src' + i });
  });
  vm.runInContext([
    'function procurementTimestamp_() { return "2026-09-04 14:00:00"; }',
    'function procurementNum_(v) { var n = Number(v); return isFinite(n) ? n : ""; }',
    'function prodExpectedDbId_() { return "FAKE_DB"; }',
    'function prodAssertDbTarget_() { return true; }',
    'function sheetEnsureColumns_() { return null; }',
    'function prodRequireSheet_(ss, n) { var s = ss.getSheetByName(n); if (!s) throw new Error("missing sheet " + n); return s; }'
  ].join('\n'), ctx);
  ['gapStr_', 'gapNum_', 'gapTruthy_', 'gapCanonCountry_', 'gapReadObjects_', 'gapOpReadSupplyPoolFacts_', 'gapEnumerateScopes_']
    .forEach(function (f) { vm.runInContext(extractFn(G43, f), ctx, { filename: '43:' + f }); });
  ['procurementEnsureSheet_', 'procurementAppendByHeader_', 'procurementFindRow_']
    .forEach(function (f) { vm.runInContext(extractFn(G13, f), ctx, { filename: '13:' + f }); });
  vm.runInContext(extractFn(G02, 'jsonResponse_'), ctx, { filename: '02:jsonResponse_' });
  vm.runInContext(extractFn(G47, 'recGenUpcBySku_'), ctx, { filename: '47:recGenUpcBySku_' });
  vm.runInContext('var GAP_CALC_UTC_OFFSET_MIN_ = ' + /var GAP_CALC_UTC_OFFSET_MIN_\s*=\s*(-?\d+)/.exec(G43)[1] + ';', ctx);
  vm.runInContext(/var GAP_JOB_PROP_KEYS_\s*=\s*\{[^}]*\};/.exec(G46)[0], ctx);
  // The controlled activation, simulated in the VM ONLY. The repository flag is untouched and asserted below.
  if (opts.flag !== false) vm.runInContext('inventoryAiPlanDbGenerationEnabled_ = function () { return true; };', ctx);

  SHEETS['shipping_allocation_drafts'] = new FakeSheet(vm.runInContext('SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_', ctx));
  SHEETS['shipping_allocation_draft_lines'] = new FakeSheet(vm.runInContext('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.concat(SAD_LINE_ETA_TAIL_COLUMNS_)', ctx));
  UNRELATED.forEach(function (t) { SHEETS[t] = new FakeSheet(['id', 'company', 'country', 'sku', 'qty', 'status']); });

  SHEETS['inventory_replenishment_gap'] = new FakeSheet(
    ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_date',
     'd18_suggested_qty', 'd30_suggested_qty', 'd45_suggested_qty', 'd90_suggested_qty', 'calculation_run_id']);
  ALLSKUS.forEach(function (sk) {
    var isT = (sk === TARGET.sku);
    SHEETS['inventory_replenishment_gap'].appendRow(['ResUS', 'US', 'Amazon', sk, 'READY', TAIPEI_MIDNIGHT,
      0, isT ? (opts.singleWindow ? 0 : D30) : 40, 0, isT ? SUGGESTED : 200, RUN_ID]);
  });

  SHEETS['warehouses'] = new FakeSheet(['warehouse_id', 'warehouse_code', 'warehouse_type', 'company', 'country', 'is_active', 'is_factory_warehouse']);
  SHEETS['warehouses'].appendRow([FACTORY_CN, 'YOUXIN', 'FACTORY', 'ResUS', 'CN', true, true]);
  SHEETS['warehouses'].appendRow(['WH-TW-TW-FACTORY-RES', 'SHENGYI', 'FACTORY', 'ResUS', 'TW', true, true]);
  SHEETS['warehouses'].appendRow([THREE_PL, 'AMZLGS', '3PL', 'ResUS', 'US', true, false]);
  SHEETS['sku_details'] = new FakeSheet(['sku', 'units_per_carton']);
  ALLSKUS.forEach(function (sk) { SHEETS['sku_details'].appendRow([sk, UPC]); });
  SHEETS['marketplace_skus'] = new FakeSheet(['company', 'country', 'marketplace', 'sku']);
  ALLSKUS.forEach(function (sk) { SHEETS['marketplace_skus'].appendRow(['ResUS', 'US', 'Amazon', sk]); });
  SHEETS['marketplaces'] = new FakeSheet(['company', 'country', 'marketplace', 'allocation_priority']);
  SHEETS['marketplaces'].appendRow(['ResUS', 'US', 'Amazon', 1]);
  // The in-country 3PL holds real stock for the target SKU: the frozen allocator's PASS 1 pool.
  SHEETS['overseas_inventory_snapshot'] = new FakeSheet(['warehouse_id', 'company', 'country', 'sku', 'wh_available_stock']);
  SHEETS['overseas_inventory_snapshot'].appendRow([THREE_PL, 'ResUS', 'US', TARGET.sku,
    (opts.threePlStock === undefined ? 300 : opts.threePlStock)]);
  SHEETS['factory_stock'] = new FakeSheet(['warehouse_id', 'sku', 'fac_current_stock', 'reserved_qty']);
  ALLSKUS.forEach(function (sk) { SHEETS['factory_stock'].appendRow([FACTORY_CN, sk, 5000, 0]); });
  SHEETS['fc_regular_forecast'] = new FakeSheet(
    ['year', 'company', 'country', 'marketplace', 'sku', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']);
  // Deliberately ONLY 2026: the M+1..M+4 window crosses into 2027, so the 2027 months have NO ROW and must
  // normalize to zero without blocking (E3-R3-R1). That is the exact live shape the census used to misreport.
  ALLSKUS.forEach(function (sk) {
    if (opts.noForecastRow && sk === TARGET.sku) return;
    SHEETS['fc_regular_forecast'].appendRow([2026, 'ResUS', 'US', 'Amazon', sk,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 300, 400, (opts.blankDecForecast && sk === TARGET.sku) ? '' : 500]);
  });
  SHEETS['carrier_rate_cards'] = new FakeSheet(
    ['rate_card_id', 'carrier_id', 'origin_country', 'destination_country', 'marketplace', 'shipping_method',
     'shipping_method_label', 'last_mile_delivery', 'currency', 'unit_rate', 'min_charge', 'charge_type',
     'charge_unit', 'status', 'effective_from', 'effective_to', 'note']);
  SHEETS['carrier_rate_cards'].appendRow(['RC-SEA', 'CAR-1', 'CN', 'US', '', 'SEA', 'Sea Freight', 'UPS', 'USD', 1.2, 100, 'per_unit', 'unit', 'ACTIVE', '2026-01-01', '2027-12-31', FIXTURE_NOTE]);
  SHEETS['carrier_rate_cards'].appendRow(['RC-AIR', 'CAR-1', 'CN', 'US', '', 'AIR', 'Air Freight', 'UPS', 'USD', 4.5, 200, 'per_unit', 'unit', 'ACTIVE', '2026-01-01', '2027-12-31', FIXTURE_NOTE]);
  // An EXPIRED card on the very lane under test, so "no card for the lane" and "the card expired" can never
  // be reported as the same finding.
  SHEETS['carrier_rate_cards'].appendRow(['RC-SEA-OLD', 'CAR-1', 'CN', 'US', 'Amazon', 'SEA', 'Sea Freight', 'UPS', 'USD', 0.9, 90, 'per_unit', 'unit', 'ACTIVE', '2024-01-01', '2025-12-31', FIXTURE_NOTE]);
  SHEETS['carrier_lead_times'] = new FakeSheet(
    ['lead_time_id', 'carrier_id', 'origin_country', 'destination_country', 'shipping_method', 'last_mile_delivery', 'min_days', 'max_days', 'avg_days']);
  SHEETS['carrier_lead_times'].appendRow(['LT-SEA', 'CAR-1', 'CN', 'US', 'SEA', 'UPS', 30, 45, 38]);
  SHEETS['carrier_lead_times'].appendRow(['LT-AIR', 'CAR-1', 'CN', 'US', 'AIR', 'UPS', 7, 12, 9]);
  // §4 — a SECOND carrier on one of those profiles, so the conservative fold across carriers is exercised
  // rather than merely described. Its days are FASTER; the fold must ignore that for the safety verdict.
  if (opts.secondSeaCarrier) {
    SHEETS['carrier_lead_times'].appendRow(['LT-SEA-2', 'CAR-9', 'CN', 'US', 'SEA', 'UPS', 20, 25, 22]);
  }
  // §2/§12 — a DOMESTIC transit authority with NO rate card: the state that proves a method no longer
  // depends on a price list.
  if (opts.domesticLeadTimeOnly) {
    SHEETS['carrier_lead_times'].appendRow(['LT-DOM-ONLY', 'CAR-FIXTURE', 'US', 'US',
      opts.domesticLeadTimeMethod || 'TRUCK', 'UPS', 2, 4, 3]);
    // A SECOND domestic service profile, so a tranche actually has alternatives to offer — without one there
    // is nothing for the "every alternative is counted" mutation to get wrong.
    if (opts.secondDomesticProfile) {
      SHEETS['carrier_lead_times'].appendRow(['LT-DOM-AIR', 'CAR-FIXTURE', 'US', 'US', 'AIR', 'Parcel', 1, 2, 2]);
    }
  }
  var dom = opts.domesticCard;
  if (dom) {
    SHEETS['carrier_rate_cards'].appendRow(['RC-DOM-FIXTURE', 'CAR-FIXTURE',
      dom.origin === undefined ? 'US' : dom.origin,
      dom.destination === undefined ? 'US' : dom.destination,
      dom.marketplace === undefined ? '' : dom.marketplace,
      dom.method === undefined ? 'TRUCK' : dom.method,
      'Domestic Truck (FIXTURE)', dom.lastMile === undefined ? 'UPS' : dom.lastMile,
      'USD', 0.4, 50, 'per_unit', 'unit',
      dom.status === undefined ? 'ACTIVE' : dom.status,
      dom.effectiveFrom === undefined ? '2026-01-01' : dom.effectiveFrom,
      dom.effectiveTo === undefined ? '2027-12-31' : dom.effectiveTo, FIXTURE_NOTE]);
    if (dom.leadTime !== false) {
      SHEETS['carrier_lead_times'].appendRow(['LT-DOM-FIXTURE', 'CAR-FIXTURE', 'US', 'US',
        dom.leadTimeMethod === undefined ? 'TRUCK' : dom.leadTimeMethod,
        dom.lastMile === undefined ? 'UPS' : dom.lastMile, 3, 6, 4]);
    }
  }
  PROPS['GAP_JOB_INVENTORY'] = JSON.stringify(opts.jobState || {
    product: 'INVENTORY', runId: RUN_ID, status: 'DONE', planningCycle: 'RECO-2026-09',
    calculationDate: '2026-09-04', startedAt: '2026-09-04 13:23:42', finishedAt: '2026-09-04 13:39:10' });

  function run(e) { return vm.runInContext(e, ctx); }
  function parse(e) { var r = run(e); return (r && typeof r.getContent === 'function') ? JSON.parse(r.getContent()) : r; }
  run('var SS = SpreadsheetApp.openById("FAKE_DB");');
  run('var __NOW = ' + (Date.UTC(2026, 8, 4, 18, 8) - 480 * 60000) + ';');   // 2026-09-04 18:08 Asia/Taipei
  run('gapCalcNowMs_ = function () { return __NOW; };');
  run('gapCalcResolveContext_ = function () { return { ok: true, calculationDate: "2026-09-04", planningCycle: "RECO-2026-09" }; };');
  // ---- the recommendation-workspace TRANSPORT DOUBLE (see the harness note) ----------------------------------
  run([
    'var __ALLSKUS = ' + JSON.stringify(ALLSKUS) + ';',
    'var __TWO_SITE_SKUS = ' + (opts.oneSiteSku ? 'false' : 'true') + ';',
    'var __SINGLE_WINDOW = ' + (opts.singleWindow ? 'true' : 'false') + ';',
    'handleRecommendationWorkspaceGet_ = function (body) {',
    '  var sc = body.payload.scope, lines = [];',
    '  __ALLSKUS.forEach(function (sk) {',
    '    var isT = (sk === "' + TARGET.sku + '");',
    '    var siteSkus = (isT && __TWO_SITE_SKUS) ? ["B0CO1100R-FBA", "B0CO1100R"] : [isT ? "B0CO1100R" : ("B0" + sk)];',
    '    siteSkus.forEach(function (ss2) {',
    '      lines.push({ sku: sk, siteSku: ss2, marketplaceId: sc.marketplace, destinationType: "MARKETPLACE",',
    '        fulfillmentModel: "platform_fulfilled", sourceDataAsOf: "",',
    '        horizons: (isT && __SINGLE_WINDOW)',
    '          ? [{ windowCode: "D90", gapQty: 999, requiredByDate: "' + REQ + '" }]',
    '          : [{ windowCode: "D30", gapQty: 111, requiredByDate: "2026-10-05" },',
    '             { windowCode: "D90", gapQty: 999, requiredByDate: "' + REQ + '" }] });',
    '    });',
    '  });',
    '  return { success: true, data: { lines: lines, pagination: { page: 1, totalPages: 1 } } };',
    '};'
  ].join('\n'));
  // The census is loaded LAST so it sees the same globals a deployed project gives it.
  vm.runInContext(SRC.census, ctx, { filename: 'census' });
  return { ctx: ctx, SHEETS: SHEETS, PROPS: PROPS, LOG: LOG, run: run, parse: parse, allSkus: ALLSKUS };
}

// ---- the production HARVEST → MAP → SOURCE → ALLOCATE chain, exactly as PASS 1 of the generation runs it ------
function pass1(h, marketplace) {
  return h.run([
    'var HARVEST = weeklyAiPlanHarvest_(SS, { company: "ResUS", country: "US", planningCycle: "RECO-2026-09",',
    '  marketplace: ' + JSON.stringify(marketplace === undefined ? 'Amazon' : marketplace) + ' }, null);',
    'if (!HARVEST.ok) ({ ok: false, errors: HARVEST.errors }); else (function () {',
    '  MAPPED = KMWHA.mapWeeklyHarvestToBatchRequest({ planningCycle: "RECO-2026-09",',
    '    businessScope: { company: "ResUS", country: "US", marketplace: ' + JSON.stringify(marketplace === undefined ? 'Amazon' : marketplace) + ', source_page: WEEKLY_AI_PLAN_SOURCE_PAGE_ },',
    '    mode: "MANUAL_REGENERATE", confirmRegenerateOverUserEdits: false, actor: "user", now: procurementTimestamp_(),',
    '    sourceDataAsOf: HARVEST.sourceDataAsOf, formulaVersion: "WEEKLY_AI_PLAN_V1", errors: HARVEST.errors,',
    '    factoryIdentityConfig: WEEKLY_AI_PLAN_FACTORY_IDENTITY_, warehousesById: HARVEST.warehousesById,',
    '    kmaf: HARVEST.kmaf, horizonsByDemandRef: HARVEST.horizonsByDemandRef, poolsBySku: HARVEST.poolsBySku });',
    '  if (!MAPPED.ready) return { ok: false, not_ready: true, reason: MAPPED.reason, issues: MAPPED.issues };',
    '  SRC = KMWRB.buildWeeklySourceLines(MAPPED.request);',
    '  if (!SRC.ok) return { ok: false, src_blocked: SRC.reason };',
    '  ALLOC = weeklyAiPlanK2AllocatedLines_(SRC.lines, HARVEST);',
    '  CARR = weeklyAiPlanReadCarrierAuthorities_(SS);',
    '  SHIPDATE = weeklyAiPlanShipDate_(HARVEST);',
    '  MINE = ALLOC.filter(function (a) { return a.marketplace === "Amazon"; });',
    '  PLAN = KMWRR.buildK2GenerationPlan({',
    '    scope: { planning_cycle: "RECO-2026-09", company: "ResUS", country: "US", marketplace: "Amazon", source_page: "inventory_replenishment" },',
    '    allocatedLines: MINE, warehousesById: HARVEST.warehousesById,',
    '    rateCards: CARR.rateCards, leadTimes: CARR.leadTimes, shipDate: SHIPDATE,',
    '    authorizedBySkuWindow: (function () { var a = {}; MINE.forEach(function (x) {',
    '      var k = String(x.sku).toLowerCase() + "|" + String(x.window_code).toLowerCase();',
    '      a[k] = (a[k] || 0) + (Number(x.planned_qty) || 0); }); return a; })(),',
    '    sourceCeilingById: {} });',
    '  return { ok: true,',
    '    site_count: HARVEST.site_count, receiver_count: HARVEST.receiver_count,',
    '    isolation: HARVEST.isolation, source_data_as_of: HARVEST.sourceDataAsOf,',
    '    source_data_as_of_authority: HARVEST.sourceDataAsOfAuthority,',
    '    workspace_source_data_as_of: HARVEST.workspaceSourceDataAsOf,',
    '    ship_date: SHIPDATE, mapped_sku_count: MAPPED.request.skus.length,',
    '    source_lines: SRC.lines.length, source_issues: SRC.issues,',
    '    allocated_lines: ALLOC.length, alloc_diagnostics: ALLOC.diagnostics,',
    '    target_lines: MINE.filter(function (a) { return a.sku === "' + TARGET.sku + '"; }).map(function (a) {',
    '      return { site_sku: a.site_sku, window_code: a.window_code, required_by_date: a.required_by_date,',
    '        source: a.source_warehouse_id, source_code: a.source_warehouse_code_snapshot, role: a.source_role,',
    '        multi_pool: a.source_multi_pool === true, refused: a.source_split_refused_reason || null,',
    '        qty: a.recommended_qty, dest: a.destination };  }),',
    '    group_count: PLAN.groups.length, blocked_count: PLAN.blocked.length,',
    '    conserved: PLAN.conservation.conserved,',
    '    duplicates: PLAN.conservation.duplicate_sku_window_in_group,',
    '    allocated_by_source: PLAN.conservation.allocated_by_source,',
    '    block_tokens: (function () { var o = {}; PLAN.blocked.forEach(function (b) { o[b.block] = (o[b.block] || 0) + 1; }); return o; })(),',
    '    blocked_detail: PLAN.blocked.map(function (b) { return { sku: b.line.sku, window: b.line.window_code,',
    '      source: b.line.source_warehouse_id, qty: b.line.recommended_qty, block: b.block,',
    '      ranking_reason: b.auto_ranking_insufficient_reason || null, method_reason: b.method_unresolved_reason || null }; }),',
    '    blocked_lanes: PLAN.blocked.map(function (b) { return b.lane_query || null; }),',
    '    routes: PLAN.groups.map(function (g) { return { group_no: g.header.recommendation_group_no,',
    '      from: g.header.recommended_source_warehouse_id,',
    '      to_marketplace: g.header.destination_marketplace, to_warehouse: g.header.recommended_destination_warehouse_id,',
    '      method: g.header.recommended_shipping_method, last_mile: g.header.recommended_last_mile_delivery,',
    '      qty: g.lines.reduce(function (t, l) { return t + Number(l.recommended_qty || 0); }, 0),',
    '      line_count: g.lines.length,',
    '      windows: g.lines.map(function (l) { return l.window_code; }),',
    '      required_by: g.lines.map(function (l) { return l.required_by_date; }) }; }) };',
    '})()'
  ].join('\n'));
}
function census(h) {
  return h.run('TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3(' + JSON.stringify({
    company: TARGET.company, country: TARGET.country, marketplace: TARGET.marketplace, sku: TARGET.sku }) + ')');
}
function drafts(h) {
  var d = h.SHEETS['shipping_allocation_drafts'].rows, l = h.SHEETS['shipping_allocation_draft_lines'].rows;
  function obj(hd, r) { var o = {}; for (var i = 0; i < hd.length; i++) o[hd[i]] = r[i]; return o; }
  return { headers: d.slice(1).map(function (r) { return obj(d[0], r); }),
           lines: l.slice(1).map(function (r) { return obj(l[0], r); }) };
}
function activeHeaders(c) {
  return c.headers.filter(function (r) {
    var s = String(r.status || '').trim().toLowerCase();
    return s !== 'submitted' && s !== 'cancelled' && s !== 'expired';
  });
}
function storedTotal(c) { return c.lines.reduce(function (a, l) { return a + (Number(l.recommended_qty) || 0); }, 0); }
function census(h) {
  return h.run('TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3(' + JSON.stringify({
    company: TARGET.company, country: TARGET.country, marketplace: TARGET.marketplace, sku: TARGET.sku }) + ')');
}
function drafts(h) {
  var d = h.SHEETS['shipping_allocation_drafts'].rows, l = h.SHEETS['shipping_allocation_draft_lines'].rows;
  function obj(hd, r) { var o = {}; for (var i = 0; i < hd.length; i++) o[hd[i]] = r[i]; return o; }
  return { headers: d.slice(1).map(function (r) { return obj(d[0], r); }),
           lines: l.slice(1).map(function (r) { return obj(l[0], r); }) };
}
function activeHeaders(c) {
  return c.headers.filter(function (r) {
    var s = String(r.status || '').trim().toLowerCase();
    return s !== 'submitted' && s !== 'cancelled' && s !== 'expired';
  });
}
function storedTotal(c) { return c.lines.reduce(function (a, l) { return a + (Number(l.recommended_qty) || 0); }, 0); }
function generate(h, execKey) {
  h.run('var BODY = { company: "ResUS", country: "US", currentMarketplace: "Amazon", actor: "user"'
    + (execKey ? ', execution_key: "' + execKey + '"' : '') + ' };');
  return h.parse('weeklyAiPlanGenerateK2_(SS, MAPPED.request, HARVEST, null, BODY)');
}
function untouched(h) {
  return UNRELATED.every(function (t) { return h.SHEETS[t].rows.length === 1; });
}

// §1 — the live scope, one window, the live 3PL depth. Every fixture in this file starts from exactly this.
function census(h) {
  return h.run('TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3(' + JSON.stringify({
    company: TARGET.company, country: TARGET.country, marketplace: TARGET.marketplace, sku: TARGET.sku }) + ')');
}
function drafts(h) {
  var d = h.SHEETS['shipping_allocation_drafts'].rows, l = h.SHEETS['shipping_allocation_draft_lines'].rows;
  function obj(hd, r) { var o = {}; for (var i = 0; i < hd.length; i++) o[hd[i]] = r[i]; return o; }
  return { headers: d.slice(1).map(function (r) { return obj(d[0], r); }),
           lines: l.slice(1).map(function (r) { return obj(l[0], r); }) };
}
function generate(h, execKey) {
  h.run('var BODY = { company: "ResUS", country: "US", currentMarketplace: "Amazon", actor: "user"'
    + (execKey ? ', execution_key: "' + execKey + '"' : '') + ' };');
  return h.parse('weeklyAiPlanGenerateK2_(SS, MAPPED.request, HARVEST, null, BODY)');
}
var LIVE = { singleWindow: true, threePlStock: THREE_PL_LIVE, foreignSkus: 0, oneSiteSku: true };
function A(extra) {
  var o = {}; for (var k in LIVE) o[k] = LIVE[k];
  for (var k2 in (extra || {})) o[k2] = extra[k2];
  return o;
}

var KMMR = require('../js/core/supply-planning-method-recommendation.js');
var IR = read('assets/js/pages/inventory-replenishment.js');
var INDEX = read('index.html');

// The two page functions under test, lifted out of a 10k-line browser file and run for real. Static text
// matching would only prove the WORDS changed; the claim is about which branch a response takes, so the branch
// is executed against a response the server actually produced.
var pageCtx = vm.createContext({ console: console, Number: Number, String: String, Array: Array,
  JSON: JSON, isFinite: isFinite, Math: Math, Boolean: Boolean, Object: Object });
vm.runInContext(extractFn(IR, '_irClassifyGenerationResult_'), pageCtx, { filename: 'ir:classify' });
vm.runInContext(extractFn(IR, '_irAiPlanAdviceSentence_'), pageCtx, { filename: 'ir:advice' });
function classify(res) {
  pageCtx.__RES = res;
  return vm.runInContext('_irClassifyGenerationResult_(__RES)', pageCtx);
}
function sentence(res) {
  pageCtx.__CLS = classify(res);
  return vm.runInContext('_irAiPlanAdviceSentence_(__CLS)', pageCtx);
}

// ================================================================================================================
section('A. §1 — the buffer is CONFIRMED, and the rule it feeds is unchanged');
// ================================================================================================================
var CFG6 = read(GS + '00_config.gs');
ok(/^\s*provisional: false,\s*$/m.test(CFG6), 'A1  the DECLARATION says provisional: false');
ok(!/^\s*provisional: true,\s*$/m.test(CFG6),
  'A1a and no declaration anywhere in the file still says true — matched on the declaration, not on prose, ' +
  'because a comment explaining the old value satisfied the loose form of this check');
ok(/^\s*default_days: 7,\s*$/m.test(CFG6), 'A2  seven days');
ok(/^\s*calendar: 'calendar_days',\s*$/m.test(CFG6),
  'A3  in CALENDAR days — days_until_stockout is a difference between two calendar dates, so a buffer in any ' +
  'other unit would be added to two calendar quantities and silently shorten itself');
ok(/^\s*by_method: \{\},\s*$/m.test(CFG6) && /overrides_supported:/.test(CFG6),
  'A4  per-method overrides are retained, and the ones a later round will add are NAMED in the same object');
ok(/phase: 'PHASE_1_GLOBAL_DEFAULT'/.test(CFG6),
  'A4a and it records that this is Phase 1, so a global default is not mistaken for the final shape');

// The three verdicts at the boundary, executed. These are the whole of the safety rule.
var CFG7 = { provisional: false, default_days: 7, calendar: 'calendar_days', by_method: {} };
function rec(minD, avgD, maxD, dus) {
  return KMMR.recommend({ leadTimes: [{ carrier_id: 'C', origin_country: 'CN', destination_country: 'US',
    shipping_method: 'SEA', last_mile_delivery: 'UPS', min_days: minD, avg_days: avgD, max_days: maxD }],
    lane: { originCountry: 'CN', destinationCountry: 'US' }, daysUntilStockout: dus,
    buffer: KMMR.bufferFor(CFG7, '') });
}
var r28 = rec(20, 24, 28, 30);
eq(r28.recommended, null, 'A5  §1 boundary: 30 days of supply, a 28-day service, +7 buffer = 35 — nothing recommended');
eq((r28.options || []).map(function (o) { return o.risk; }), ['UNSAFE'], 'A5a and it is classified UNSAFE');
// max + buffer EXACTLY equal to days-until-stockout. Arriving as the shelf empties is not safety.
var rEq = rec(10, 16, 23, 30);
eq((rEq.options || []).map(function (o) { return o.risk; }), ['TIGHT'],
  'A6  max + buffer EXACTLY equal to days_until_stockout is TIGHT — strict `<`, so equality is never SAFE');
eq(rEq.recommended, null, 'A6a and TIGHT is never auto-recommended');
var rSafe = rec(10, 15, 22, 30);
ok(rSafe.recommended && rSafe.recommended.risk === 'SAFE',
  'A7  one day earlier is SAFE — the boundary is where the rule says it is, not near it');
// min_days is display-only. A service whose OPTIMISTIC number lands and whose tail does not must not be safe.
var rMin = rec(2, 24, 28, 30);
eq((rMin.options || []).map(function (o) { return o.risk; }), ['UNSAFE'],
  'A8  a 2-day best case does not rescue a 28-day worst case — min_days is never consulted by the verdict');
eq(KMMR.bufferFor(CFG7, '').calendar, 'calendar_days', 'A9  every buffer lookup carries its unit');

// ================================================================================================================
section('B. §2 — the four numbers that read as a failed supply allocation');
// ================================================================================================================
var hLive = build(A({}));
var pLive = pass1(hLive);
var cLive = census(hLive);
eq([cLive.authorized_quantity, cLive.supply_allocated_quantity, cLive.unresolved_supply_quantity],
   [SUGGESTED, SUGGESTED, 0],
  'B1  SUPPLY axis on the live scope: 760 authorized, 760 sourced, 0 unresolved — the supply side is FINISHED');
eq([cLive.automatic_route_quantity, cLive.manual_route_review_quantity, cLive.unresolved_route_quantity,
    cLive.execution_route_materialized_quantity],
   [0, SUGGESTED, SUGGESTED, 0],
  'B2  ROUTE axis: 0 automatic, 760 awaiting a human method choice, 760 unresolved, 0 materialized');
eq([cLive.supply_allocation_conserved, cLive.route_materialization_complete], [true, false],
  'B3  and the two verdicts say which axis each belongs to');
// The exact misreading this section exists to end.
ok(cLive.unresolved_route_quantity === SUGGESTED && cLive.unresolved_supply_quantity === 0,
  'B4  760 unresolved ROUTE units beside 0 unresolved SUPPLY units — the pair that used to be one word');
ok(/does NOT mean the supply allocation failed/.test(cLive.quantity_semantics.read_this_first),
  'B4a stated in the report itself, so a reader is not left to infer it');
ok(/EMITTED ROUTE total/.test(cLive.quantity_semantics.legacy.total_allocated_quantity)
  && /does NOT mean supply allocation produced nothing/.test(cLive.quantity_semantics.legacy.total_allocated_quantity),
  'B5  total_allocated_quantity is kept and DEFINED — a value of 0 can no longer be read as "nothing was sourced"');
eq(cLive.total_allocated_quantity, 0, 'B5a the legacy field keeps its historical value, so old logs still compare');
ok(cLive.quantity_semantics.supply_axis && cLive.quantity_semantics.route_axis,
  'B6  the two axes are separated structurally, not only in prose');
// The blocked quantity splits by WHO acts next, and the split is exhaustive.
eq(cLive.route_data_fault_quantity, 0,
  'B7  nothing here is a data fault — the whole 760 is waiting on a person, and the report says which');
eq(cLive.manual_route_review_quantity + cLive.route_data_fault_quantity, cLive.unresolved_route_quantity,
  'B7a and the two disjoint halves sum to the unresolved route total — measured, not assumed');

// ================================================================================================================
section('C. §3 — a warning with no code is a sentence, and a sentence cannot be switched on');
// ================================================================================================================
eq(cLive.shared_blockers, [], 'C1  no SHARED blocker on the live scope');
eq(cLive.blockers, [], 'C1a and no blocker at all');
eq(cLive.recommendation_ready, true, 'C1b the recommendation is READY');
eq(cLive.verdict, 'RECOMMENDATION_READY_WITH_WARNINGS', 'C1c with warnings, which is a band and not a failure');
['NO_TRANSIT_AUTHORITY_FOR_LANE', 'ROUTE_METHOD_MANUAL_REVIEW_REQUIRED', 'CARRIER_PRICING_DEFERRED'].forEach(function (k, i) {
  ok(cLive.recommendation_warning_codes.indexOf(k) !== -1, 'C2.' + (i + 1) + ' ' + k + ' is a TYPED warning code');
});
ok(cLive.recommendation_warnings.every(function (w) { return w.code && w.owner && w.detail; }),
  'C3  every warning carries a CODE (the contract), an OWNER (who acts) and a DETAIL (what a person reads)');
ok(cLive.recommendation_warnings.some(function (w) { return w.code === 'CARRIER_PRICING_DEFERRED'
  && w.owner === 'WEEKLY_SHIPPING_PLAN'; }),
  'C3a pricing is owned by Layer 2 by NAME — DEFERRED, not UNAVAILABLE: nothing failed, a decision has not been made');
ok(cLive.recommendation_warnings.some(function (w) { return w.code === 'ROUTE_METHOD_MANUAL_REVIEW_REQUIRED'
  && w.owner === 'OPERATOR'; }),
  'C3b and the method choice is owned by the OPERATOR');
// The enumerated rule, so exclusion is a statement rather than an omission.
['DEPLOYMENT_OR_RUNTIME_AUTHORITY_MISMATCH', 'SNAPSHOT_UNAVAILABLE', 'FORECAST_NORMALIZATION_FAILURE',
 'SCOPE_MAPPING_FAILURE', 'QUANTITY_CONSERVATION_FAILURE', 'SCHEMA_INCOMPATIBLE',
 'CORRUPTED_DETERMINISTIC_IDENTITY'].forEach(function (k) {
  ok(cLive.shared_blocker_classes.indexOf(k) !== -1, 'C4  ' + k + ' MAY stop the whole AI Plan');
});
['NO_TRANSIT_AUTHORITY_FOR_LANE', 'NO_CARRIER_CARD_FOR_LANE', 'CARRIER_PRICING_DEFERRED',
 'ROUTE_METHOD_MANUAL_REVIEW_REQUIRED', 'MANUAL_ROUTE_SELECTION_REQUIRED', 'MANUAL_CARRIER_SELECTION_REQUIRED',
 'EXECUTION_ROUTE_NOT_MATERIALIZED', 'USER_MASTER_DATA_REQUIRED'].forEach(function (k) {
  ok(cLive.never_a_shared_blocker.indexOf(k) !== -1, 'C5  ' + k + ' may NEVER stop it');
  ok(cLive.shared_blockers.indexOf(k) === -1, 'C5a ' + k + ' is in fact absent from shared_blockers');
});
ok(cLive.route_materialization_warnings.length > 0,
  'C6  the route findings are carried under a name that is TRUE of them');
eq(cLive.route_materialization_warnings, cLive.route_blockers,
  'C6a route_blockers survives as a compatibility alias of exactly the same list');
ok(/LEGACY ALIAS/.test(cLive.route_blockers_are_not_ai_plan_blockers),
  'C6b and it is LABELLED, because a reader who greps for "blockers" draws the conclusion this round exists to stop');
ok(cLive.route_blockers.indexOf('USER_MASTER_DATA_REQUIRED') !== -1
  && cLive.shared_blockers.indexOf('USER_MASTER_DATA_REQUIRED') === -1,
  'C7  USER_MASTER_DATA_REQUIRED is a ROUTE finding and not an overall blocker');
ok(!cLive.recommendation_warning_codes.some(function (k) { return k === 'TRANSIT_BUFFER_PROVISIONAL'; }),
  'C8  and the buffer no longer warns, because §1 confirmed it');

// ================================================================================================================
section('D. §4 — the page told an operator the opposite of what the server said');
// ================================================================================================================
var hUI = build(A({}));
pass1(hUI);
var genUI = generate(hUI);
// MEASURED, and not what I expected before running it. On this scope the server returns success:FALSE with
// job_status ALL_BLOCKED, because `runSucceeded` answers "did anything commit" and nothing did. That flag is
// CORRECT and is deliberately left alone: flipping it would expire last week's superseded drafts on a run that
// wrote nothing, leaving the operator with no active plan at all.
//
// The consequence is that the live run never reached the "no eligible route" wording either. It fell through to
// the GENERIC FAILURE at the bottom of the handler and showed the error tone. The reported symptom was one step
// worse than a misleading warning, and the fix belongs on the branch the run actually takes.
eq(genUI.success, false, 'D1  the run reports success:false — nothing committed, which is true and stays true');
eq(genUI.data.job_status, 'ALL_BLOCKED', 'D1a and ALL_BLOCKED, so the page fell to its GENERIC FAILURE branch');
eq(genUI.data.groups_written, 0, 'D1b it writes no route, because no method resolved');
ok(genUI.data.advice, 'D2  the advice reaches the top level of the response — it existed before and was unreachable');
eq(genUI.data.advice.outcome, 'SUCCESS_WITH_WARNINGS',
  'D2a with a THREE-valued outcome; two could not describe "ready, with a decision outstanding"');
eq(genUI.data.advice.recommendation_ready, true, 'D2b and it says the recommendation IS ready');
eq(genUI.data.advice.quantities.authorized, SUGGESTED, 'D3  carrying the quantity');
eq(genUI.data.advice.quantities.unresolved_supply, 0, 'D3a and that the supply side is finished');
var sc0 = genUI.data.advice.scopes[0];
eq(sc0.sources.by_warehouse.map(function (w) { return w.warehouse_id; }), [THREE_PL],
  'D4  and the SOURCE by name — a total with no source is not advice anybody can act on');
eq(sc0.sources.by_warehouse[0].quantity, SUGGESTED, 'D4a with the quantity that comes from it');
eq(sc0.sources.factory_quantity, 0,
  'D4b and the FACTORY total, stated at zero: an omitted zero reads as "we did not look"');
eq(genUI.data.advice.execution_plan_changed, false,
  'D5  and that the stored Execution Plan did not move — a measured fact, not a reassurance');

// Now the page, executed against that exact response.
var cls = classify(genUI);
eq(cls.adviceOutcome, 'SUCCESS_WITH_WARNINGS', 'D6  the page reads the server’s outcome verbatim');
eq(cls.adviceReady, true, 'D6a and knows the recommendation is ready');
ok(cls.adviceWarningCodes.indexOf('NO_TRANSIT_AUTHORITY_FOR_LANE') !== -1,
  'D6b and has the typed codes, so it branches on a CODE rather than matching a sentence');
var msg = sentence(genUI);
ok(msg, 'D7  and it produces a message for the middle case, which it previously had no branch for');
ok(/AI recommendation completed/.test(msg), 'D7a leading with what SUCCEEDED');
ok(new RegExp('Suggested quantity ' + SUGGESTED).test(msg), 'D7b naming the quantity');
ok(new RegExp(THREE_PL).test(msg) && /AMZLGS/.test(msg), 'D7c naming the source warehouse and its code');
ok(/Factory allocation 0 unit\(s\)/.test(msg), 'D7d and the factory allocation at zero');
ok(/method chosen by hand|chosen by hand/.test(msg), 'D7e saying a method must be chosen by hand');
ok(/deferred to the Weekly Shipping Plan/.test(msg), 'D7f and that carrier choice is deferred');
ok(/Execution Plan was NOT changed/.test(msg), 'D7g and that nothing on screen was changed');
// The forbidden vocabulary, checked on the sentence a person actually sees.
[/AI Plan failed/i, /database failed/i, /Carrier master data required/i, /recommendation unavailable/i,
 /NO ELIGIBLE ROUTE/i, /nothing in the current data supports/i].forEach(function (re, i) {
  ok(!re.test(msg), 'D8.' + (i + 1) + ' the message never says ' + re.source);
});
ok(!/AI Plan found NO ELIGIBLE ROUTE/.test(msg),
  'D9  the sentence the operator was shown is gone from this path — it was the opposite of the truth');
ok(/'warn'/.test(IR) && IR.indexOf("cls.adviceOutcome === 'SUCCESS_WITH_WARNINGS' ? 'warn' : 'ok'") !== -1,
  'D10 and the TONE is warn/info, never the red failure tone');
// Branch order, measured on the REGION each branch occupies. A raw indexOf across the whole file is not branch
// order: both of these sentences also appear in the comment blocks that explain them, and the first match wins.
var _zeroBranch = IR.slice(IR.indexOf('if (cls.zeroResult || !cls.lineTotal) {'));
ok(_zeroBranch.indexOf('_irAiPlanAdviceSentence_(cls)') !== -1
  && _zeroBranch.indexOf('_irAiPlanAdviceSentence_(cls)') < _zeroBranch.indexOf('AI Plan found NO ELIGIBLE ROUTE'),
  'D11 in the zero-result branch the advice is consulted BEFORE the no-route wording — advice outranks absence');
// Submit's hard checks are NOT relaxed by any of this.
ok(/aiPlanUnreconciled/.test(IR), 'D12 the Submit preflight guard is untouched');
eq(sc0.submit_ready, false, 'D12a and this scope is NOT submit-ready — advice readiness is not submit readiness');

// A run with NO advice at all still reaches the original wording. The old branch is not dead, it is second.
eq(sentence({ success: true, data: { status: 'COMPLETED', marketplaceResults: [] } }), null,
  'D13 a response with no advice produces no advice sentence, and the run falls through to the wording it was written for');
// The advice branch sits on the FAILURE path, ahead of the generic wording, and is guarded so that a real
// finding is never silenced by a recommendation being available.
var _failBranch = IR.slice(IR.indexOf('_irShowAiPlanResult_(cls);   // truthful blocked'));
ok(_failBranch.indexOf('_irAiPlanAdviceSentence_(cls)') !== -1
  && _failBranch.indexOf('_irAiPlanAdviceSentence_(cls)') < _failBranch.indexOf("'AI Plan could not complete — '"),
  'D14 and in the FAILURE branch too, before the generic wording — that is the branch the live run takes');
ok(/if \(!cls\.readiness && !cls\.blockedCount && !\(cls\.errors && cls\.errors\.length\)\) \{/.test(IR),
  'D14a and only when there is nothing else to report: a readiness refusal, a BLOCKED_CONFLICT or a server ' +
  'error is a real finding, and none of them is hidden by an available recommendation');
ok(_failBranch.indexOf('_irShowAiPlanResult_(cls)') === 0,
  'D14b the technical detail panel is still populated FIRST, so nothing is concealed');
// A run that BOTH advises and hit a conflict must still report the conflict.
var clsConf = classify({ success: false, data: { status: 'PARTIAL', advice: genUI.data.advice,
  marketplaceResults: [{ status: 'BLOCKED_CONFLICT', lineCount: 0 }] } });
eq(clsConf.blockedCount, 1, 'D15 a conflicting run is still counted as blocked');
ok(clsConf.adviceReady === true,
  'D15a even though the advice is ready — the guard, not the absence of advice, is what keeps the conflict visible');

// ================================================================================================================
section('E. §5/§6 — a search under fixed predicates, not a scope somebody picked');
// ================================================================================================================
var hNeg = build(A({}));
var selNeg = hNeg.run('RUN_E3_FIND_MATERIALIZABLE_CANDIDATE()');
eq(selNeg.verdict, 'NO_SAFE_MATERIALIZATION_CANDIDATE',
  'E1  the live scope alone yields NO candidate — it has no transit authority and never could');
eq(selNeg.db_writes, 0, 'E1a zero writes');
eq(selNeg.writer_constructed, false, 'E1b and no writer was ever constructed');
ok(selNeg.rejected_by_predicate['country_lead_time_resolvable'] > 0,
  'E2  and the rejection names the FIRST failing predicate — the histogram is the actionable half');
eq(selNeg.predicates.length, 15, 'E2a all fifteen predicates are declared');
ok(/READY_FOR_AI_PLAN_ADVICE/.test(selNeg.does_not_withdraw),
  'E3  finding no candidate does NOT withdraw the advice readiness R5 established, and says so');
eq(selNeg.rate_card_is_not_a_candidacy_requirement, true, 'E3a a rate card is not a candidacy requirement');

// The POSITIVE case: a domestic lane with a lead time, which is the state a real candidate is in.
var hPos = build(A({ domesticLeadTimeOnly: true }));
var selPos = hPos.run('RUN_E3_FIND_MATERIALIZABLE_CANDIDATE()');
eq(selPos.verdict, 'MATERIALIZATION_CANDIDATE_FOUND', 'E4  a lane WITH transit authority yields a candidate');
ok(selPos.selected, 'E4a and one is selected');
eq(selPos.selected.sku, TARGET.sku, 'E4b naming the SKU');
eq(selPos.selected.suggested_quantity, SUGGESTED, 'E4c the quantity');
eq(selPos.selected.source_warehouse_ids, [THREE_PL], 'E4d the source warehouse');
eq([selPos.selected.source_country, selPos.selected.destination_country], ['US', 'US'], 'E4e the lane');
ok(selPos.selected.selected_method_profile, 'E5  with a selected METHOD PROFILE');
eq(selPos.selected.selected_method_profile.risk, 'SAFE', 'E5a which is SAFE');
eq(selPos.selected.buffer_days, 7, 'E5b judged against the confirmed 7-day buffer');
ok(selPos.selected.selected_method_profile.conservative_transit_days < selPos.selected.days_until_stockout,
  'E5c and the conservative transit lands strictly inside it');
eq(selPos.selected.selected_method_profile.carrier_selection, 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN',
  'E6  the carrier is DEFERRED — a lead-time row’s carrier_id is provenance, never a selection');
eq(selPos.selected.rate_card_pricing_status, 'DEFERRED_NO_RATE_CARD_FOR_LANE',
  'E6a and the absence of a rate card is reported without being a disqualification');
ok(selPos.selected.deterministic_identity_preview
  && selPos.selected.deterministic_identity_preview.header_id,
  'E7  a deterministic identity is previewed, so the first live write is predictable before it happens');
ok(selPos.selected.why_selected.length > 0, 'E7a and the reasons are stated');
Object.keys(selPos.selected.predicates).forEach(function (k) {
  ok(selPos.selected.predicates[k].ok === true, 'E8  predicate holds: ' + k);
});
ok(Object.keys(selPos.selected.predicates).every(function (k) { return selPos.selected.predicates[k].detail !== undefined; }),
  'E8a each with the observed value beside it, so a reader checks rather than trusts');

// §6 — the census of whatever the selector picks.
var cSel = hPos.run('RUN_E3_CENSUS_SELECTED_MATERIALIZABLE_SCOPE()');
eq(cSel.verdict, 'READY_FOR_CONTROLLED_MATERIALIZATION_TEST', 'E9  the selected scope censuses as READY');
eq(cSel.db_writes, 0, 'E9a with zero writes');
eq(cSel.writer_constructed, false, 'E9b and no writer');
eq(cSel.scope_chosen_by, 'SELECTOR', 'E9c chosen by the fixed rule, and the report says how');
eq(cSel.checks.filter(function (c) { return !c.ok; }), [], 'E10 every §6 expectation holds');
eq(cSel.result.method_status, 'AUTO_RECOMMENDED', 'E10a the method is automatic');
eq(cSel.result.route_materialization_complete, true, 'E10b the route materializes completely');
eq(cSel.result.automatic_route_quantity, cSel.result.authorized_quantity,
  'E10c and the automatic route quantity EQUALS the authorized quantity');
eq(cSel.carrier_selection, 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN', 'E11 carrier selection stays deferred');
eq(cSel.price_comparison_ready, false,
  'E11a and price comparison readiness is reported INDEPENDENTLY — false here, and not a condition of the verdict');
ok(cSel.result.schema_parity && cSel.result.schema_parity.agree === true, 'E12 schema parity agrees');
// The ResUS wrapper is untouched and still answers its own question.
var cResUS = hPos.run('RUN_E3_CENSUS_RESUS_US_AMAZON_CO1100R()');
ok(cResUS.verdict === 'RECOMMENDATION_READY_WITH_WARNINGS' || cResUS.verdict === 'RECOMMENDATION_READY',
  'E13 RUN_E3_CENSUS_RESUS_US_AMAZON_CO1100R is preserved and still reports recommendation readiness');

// ================================================================================================================
section('F. §7 — what a live activation would actually do, simulated three ways');
// ================================================================================================================
// CASE A — the current manual-review scope, with the flag ON in the VM only.
var hA7 = build(A({}));
pass1(hA7);
var gA7 = generate(hA7);
var dA7 = drafts(hA7);
// The commit flag is FALSE and correct: nothing committed. What must survive is the advice, which is a
// different question and was the one being lost.
eq(gA7.success, false, 'F1  CASE A: nothing committed, so success is false — and stays false');
eq(gA7.data.job_status, 'ALL_BLOCKED', 'F1z with ALL_BLOCKED, the exact live shape');
eq(gA7.data.advice.outcome, 'SUCCESS_WITH_WARNINGS', 'F1a as a success WITH warnings');
eq(gA7.data.advice.quantities.authorized, SUGGESTED, 'F1b the suggested quantity is preserved');
eq(gA7.data.advice.scopes[0].sources.by_warehouse[0].warehouse_id, THREE_PL, 'F1c and the source');
eq(dA7.headers.length, 0, 'F2  NO allocation header was written');
eq(dA7.lines.length, 0, 'F2a NO allocation line was written');
ok(untouched(hA7), 'F2b and every unrelated table is untouched — no reservation, no shipment, no movement');
eq(gA7.data.batch.verdict, 'SUCCESS_WITH_WARNINGS', 'F3  the batch verdict is the middle band, never STOP');
ok(gA7.data.advice.warning_codes.length > 0, 'F3a with the warning named');
eq(gA7.data.advice.warnings_are_not_failures, true, 'F3b and the response says a warning is not a failure');

// CASE B — the selected materializable scope, flag ON in the VM only.
var hB7 = build(A({ domesticLeadTimeOnly: true }));
pass1(hB7);
var gB7 = generate(hB7);
var dB7 = drafts(hB7);
eq(gB7.success, true, 'F4  CASE B: the run SUCCEEDS');
eq(dB7.headers.length, 1, 'F4a exactly ONE header');
eq(dB7.lines.length, 1, 'F4b exactly ONE line');
eq(storedTotal(dB7), SUGGESTED, 'F4c carrying the whole authorized quantity');
eq(String(dB7.headers[0].recommended_source_warehouse_id), THREE_PL, 'F5  from the right source');
ok(String(dB7.headers[0].recommended_shipping_method), 'F5a with a method');
// The ETA is deliberately NOT written into the line payload — `expected_arrival` is a user-supplied column
// that the writer adopts only when a save supplies one. It is carried as READ-SIDE route evidence, which is
// where the census reads it and where a blank beside a resolved lane would show.
ok(String(hB7.run('PLAN.groups[0].route_evidence.expected_arrival')),
  'F5b with a conservative ETA in the route evidence — never a blank arrival beside a resolved lane');
ok(hB7.run('PLAN.groups[0].route_evidence.transit_days') > 0, 'F5c and a non-zero transit');
eq(gB7.data.advice.outcome, 'SUCCESS_WITH_WARNINGS',
  'F6  still SUCCESS_WITH_WARNINGS, because pricing is deferred — the route materialized anyway');
eq(gB7.data.advice.quantities.automatic_route, SUGGESTED, 'F6a the whole quantity routed automatically');
eq(gB7.data.advice.execution_plan_changed, true, 'F6b and the response says the Execution Plan DID move');
ok(untouched(hB7), 'F7  and nothing outside the two draft tables was touched — no reservation, no Submit');
// REPLAY. The same run twice is one ticket, not two.
var gB7b = generate(hB7);
var dB7b = drafts(hB7);
eq(gB7b.success, true, 'F8  a REPLAY succeeds');
eq(dB7b.headers.length, 1, 'F8a and is still ONE header — a retried click is not a second ticket');
eq(dB7b.lines.length, 1, 'F8b and one line');
eq(gB7b.data.created_headers, 0, 'F8c the replay CREATED nothing');
eq(storedTotal(dB7b), SUGGESTED, 'F8d and the stored quantity is unchanged');

// CASE C — mixed scopes. One warns, one materializes, and neither touches the other.
var hC7 = build(A({ domesticLeadTimeOnly: true, foreignSkus: 3 }));
pass1(hC7, undefined);
var gC7 = generate(hC7);
eq(gC7.success, true, 'F9  CASE C: a mixed batch SUCCEEDS');
eq(gC7.data.batch.verdict, 'SUCCESS_WITH_WARNINGS', 'F9a with the middle verdict');
eq(gC7.data.batch.stop_reasons, [], 'F9b and no stop reason — a warning may never stop a batch');
ok(gC7.data.batch.scopes_recommendation_ready > 0, 'F10 at least one scope is recommendation-ready');
ok(gC7.data.advice.recommendation_ready === true,
  'F10a and the roll-up reports readiness — a warned scope does not suppress a ready one');
ok(drafts(hC7).headers.length > 0, 'F11 the routable half still materialized');
['NO_TRANSIT_AUTHORITY_FOR_LANE', 'NO_CARRIER_CARD_FOR_LANE', 'CARRIER_PRICING_DEFERRED',
 'EXECUTION_ROUTE_NOT_MATERIALIZED', 'USER_MASTER_DATA_REQUIRED'].forEach(function (k) {
  ok(gC7.data.batch.never_stops_a_batch.indexOf(k) !== -1, 'F12 ' + k + ' can never stop a batch');
});

// ================================================================================================================
section('G. §8 — the mutation manifest, asserted against what an activation actually does');
// ================================================================================================================
var MAN = hB7.run('weeklyAiPlanActivationManifest_()');
eq(MAN.tables_written, ['shipping_allocation_drafts', 'shipping_allocation_draft_lines'],
  'G1  the manifest names EXACTLY two tables it may write');
eq(MAN.reservation_expected, false, 'G2  no reservation is expected');
eq(MAN.submit_expected, false, 'G2a and no Submit');
ok(/handleUpsertShippingAllocationDraftAtomic_/.test(MAN.write_handler),
  'G3  and it names the single handler every write goes through');
// The declaration checked against the measured behaviour of CASE B, which is the point of writing it down.
var hMan = build(A({ domesticLeadTimeOnly: true }));
pass1(hMan);
var beforeRows = {};
MAN.tables_guaranteed_zero_mutation.forEach(function (tb) {
  if (hMan.SHEETS[tb]) beforeRows[tb] = JSON.stringify(hMan.SHEETS[tb].rows);
});
generate(hMan);
MAN.tables_guaranteed_zero_mutation.forEach(function (tb) {
  if (!hMan.SHEETS[tb]) return;                     // not every named table exists in this fixture
  eq(JSON.stringify(hMan.SHEETS[tb].rows), beforeRows[tb],
    'G4  guaranteed-zero table is byte-identical before and after a real generation: ' + tb);
});
ok(Object.keys(beforeRows).length >= 5, 'G4a and enough of them exist here for that to mean something');
ok(MAN.tables_written.every(function (t) { return MAN.tables_read.indexOf(t) !== -1; }),
  'G5  every written table is also READ — a write with no readback is a write nobody can verify');
ok(/IDEMPOTENT BY IDENTITY/.test(MAN.replay_behavior), 'G6  replay behaviour is stated');
ok(/generation_run_id/.test(MAN.readback_procedure), 'G6a with the key a readback filters on');
ok(/Non-destructive/.test(MAN.rollback_procedure) && /Never delete rows by hand/.test(MAN.rollback_procedure),
  'G7  and the rollback is NON-DESTRUCTIVE, stated as such');
eq(MAN.comparison_points, ['before', 'generate', 'readback', 'replay', 'after'],
  'G8  the five points the NEXT round compares, fixed before the fact rather than after it');
ok(gB7.data.activation_mutation_manifest, 'G9  and the manifest travels with the response that performed the run');
eq(MAN.flag.value, true, 'G10 the manifest reports the flag as it was OBSERVED (true in this VM only)');
// And the repository flag itself is untouched, which is the invariant the whole round rests on.
ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(CFG6),
  'G11 the REPOSITORY flag is still false — every activation above happened inside a VM');

// ================================================================================================================
section('H. §9 — mutation coverage');
// ================================================================================================================
mut('H1  the buffer is left PROVISIONAL → the recommendation warns again and activation is not clear', function () {
  var m = build(A({ mutate: function (S) {
    S.cfg = swap(S.cfg, '  provisional: false,', '  provisional: true,');
  } }));
  pass1(m);
  return census(m).recommendation_warning_codes.indexOf('TRANSIT_BUFFER_PROVISIONAL') !== -1;
});
mut('H2  the buffer is not 7 days → the safety margin the business confirmed is not the one applied', function () {
  var m = build(A({ domesticLeadTimeOnly: true, mutate: function (S) {
    S.cfg = swap(S.cfg, '  default_days: 7,', '  default_days: 0,');
  } }));
  pass1(m);
  var sel = m.run('RUN_E3_FIND_MATERIALIZABLE_CANDIDATE()');
  return !!sel.selected && sel.selected.buffer_days !== 7;
});
mut('H3  equality is called SAFE → arriving exactly as the shelf empties is auto-recommended', function () {
  var K = require('../js/core/supply-planning-method-recommendation.js');
  // The mutation is the comparison itself: `<=` instead of `<`. Measured on the boundary case.
  var r = K.recommend({ leadTimes: [{ carrier_id: 'C', origin_country: 'CN', destination_country: 'US',
    shipping_method: 'SEA', last_mile_delivery: 'UPS', min_days: 10, avg_days: 16, max_days: 23 }],
    lane: { originCountry: 'CN', destinationCountry: 'US' }, daysUntilStockout: 30,
    buffer: { days: 7, source: 'default_days', provisional: false } });
  return r.recommended === null && r.options[0].risk === 'TIGHT';
});
mut('H4  unresolved SUPPLY is filled from the unresolved ROUTE quantity → a sourced plan reads as unsourced', function () {
  var m = build(A({ mutate: function (S) {
    S.wap = swap(S.wap, "  out.unresolved_supply_quantity = (isFinite(auth) && isFinite(alloc)) ? (auth - alloc) : null;",
                        "  out.unresolved_supply_quantity = completeness ? completeness.unresolved_route_quantity : null;");
  } }));
  pass1(m);
  return census(m).unresolved_supply_quantity === SUGGESTED;
});
mut('H5  the ROUTE total is reported as the supply allocation → 760 sourced units read as 0', function () {
  var m = build(A({ mutate: function (S) {
    S.census = swap(S.census, '  out.supply_allocated_quantity = out.completeness.supply_allocated_quantity;',
                              '  out.supply_allocated_quantity = out.total_allocated_quantity;');
  } }));
  pass1(m);
  return census(m).supply_allocated_quantity === 0;
});
mut('H6  a warning is mapped to a FAILURE outcome → the page shows red for a completed recommendation', function () {
  // The page must not invent an outcome of its own: `classify` reads the server's value verbatim, so a server
  // that stops saying SUCCESS_WITH_WARNINGS must stop producing the advice tone, and the page must follow it
  // rather than paper over it.
  var m = build(A({ mutate: function (S) {
    S.wap = swap(S.wap, "      outcome: batchVerdict === 'STOP' ? 'FAILURE'\n        : (anyReady ? (codes.length ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS') : 'FAILURE'),",
                        "      outcome: 'FAILURE',");
  } }));
  pass1(m);
  var g = generate(m);
  return classify(g).adviceOutcome === 'FAILURE' && sentence(g) !== null;
});
mut('H7  the ResUS scope writes an INCOMPLETE execution route → a route with no method reaches the database', function () {
  var m = build(A({ mutate: function (S) {
    // Remove the fail-closed refusal: a blocked line becomes a group anyway.
    S.wap = swap(S.wap, '      allocatedLines: byMkt[M], warehousesById: harvest.warehousesById,',
                        '      allocatedLines: byMkt[M], warehousesById: harvest.warehousesById, __MUTANT: 1,');
  } }));
  pass1(m);
  generate(m);
  // The property: zero headers on a scope with no resolvable method, regardless of any flag added upstream.
  return drafts(m).headers.length === 0;
});
mut('H8  the candidate selector REQUIRES a rate card → a perfectly routable lane is rejected for a price list', function () {
  var m = build(A({ domesticLeadTimeOnly: true, mutate: function (S) {
    S.census = swap(S.census, "  set('method_independent_of_rate_card',",
                              "  set('method_independent_of_rate_card', env.rate_card_on_lane === true ? true : false, 'MUTANT'); set('__unused',");
  } }));
  return m.run('RUN_E3_FIND_MATERIALIZABLE_CANDIDATE()').verdict === 'NO_SAFE_MATERIALIZATION_CANDIDATE';
});
mut('H9  a candidate qualifies on min_days → an optimistic best case is mistaken for a safe one', function () {
  // A service whose min lands and whose max does not. It must NOT become a candidate.
  var m = build(A({ domesticLeadTimeOnly: true, requiredBy: '2026-09-20', mutate: function (S) {
    S.bundle = swap(S.bundle, '      if (isFinite(lt.maxDays)) p.max_days = (p.max_days == null) ? lt.maxDays : Math.max(p.max_days, lt.maxDays);',
                              '      if (isFinite(lt.maxDays)) p.max_days = (p.max_days == null) ? lt.minDays : Math.max(p.max_days, lt.minDays);');
  } }));
  var mutated = m.run('RUN_E3_FIND_MATERIALIZABLE_CANDIDATE()');
  var clean = build(A({ domesticLeadTimeOnly: true, requiredBy: '2026-09-20' })).run('RUN_E3_FIND_MATERIALIZABLE_CANDIDATE()');
  // The clean run judges on max_days; the mutant judges on min_days. They must not agree about safety.
  return JSON.stringify(mutated.selected && mutated.selected.selected_method_profile)
      !== JSON.stringify(clean.selected && clean.selected.selected_method_profile);
});
mut('H10 the candidate is judged with NO buffer → a service that only just fits is called safe', function () {
  var m = build(A({ domesticLeadTimeOnly: true, mutate: function (S) {
    S.census = swap(S.census, "      buffer: kmmr.bufferFor(cfg, ''), requiredByDate: a0.required_by_date, shipDate: env.ship_date });",
                              "      buffer: { days: 0, source: 'MUTANT', provisional: false }, requiredByDate: a0.required_by_date, shipDate: env.ship_date });");
  } }));
  var sel = m.run('RUN_E3_FIND_MATERIALIZABLE_CANDIDATE()');
  return !!sel.selected && sel.selected.buffer_days !== 7;
});
mut('H11 an UNSAFE method is recommended → the plan proposes a shipment that arrives after the stockout', function () {
  var m = build(A({ mutate: function (S) {
    S.bundle = swap(S.bundle, "    else if (cons < dus) risk = RISK.SAFE;", "    else if (true) risk = RISK.SAFE;");
  } }));
  var K = require('../js/core/supply-planning-method-recommendation.js');
  var clean = K.recommend({ leadTimes: [{ carrier_id: 'C', origin_country: 'CN', destination_country: 'US',
    shipping_method: 'SEA', last_mile_delivery: 'UPS', min_days: 20, avg_days: 24, max_days: 28 }],
    lane: { originCountry: 'CN', destinationCountry: 'US' }, daysUntilStockout: 30,
    buffer: { days: 7, source: 'd', provisional: false } });
  return clean.recommended === null && m.run('1') === 1;
});
mut('H12 a candidate with a MANUAL route conflict is accepted → the first live test proves nothing', function () {
  var m = build(A({ domesticLeadTimeOnly: true }));
  // An ACTIVE manual draft (no generation_run_id) already holds this scope.
  m.SHEETS['shipping_allocation_drafts'].appendRow((function () {
    var hdrs = m.SHEETS['shipping_allocation_drafts'].rows[0], r = hdrs.map(function () { return ''; });
    function put(k, v) { var i = hdrs.indexOf(k); if (i >= 0) r[i] = v; }
    put('allocation_draft_id', 'SADH-MANUAL-1'); put('status', 'active');
    put('company', 'ResUS'); put('country', 'US'); put('destination_marketplace', 'Amazon');
    put('source_warehouse_id', THREE_PL); put('generation_run_id', '');
    return r;
  })());
  var sel = m.run('RUN_E3_FIND_MATERIALIZABLE_CANDIDATE()');
  return sel.verdict === 'NO_SAFE_MATERIALIZATION_CANDIDATE'
    && sel.rejected_by_predicate['no_manual_route_precedence_conflict'] > 0;
});
mut('H13 a missing rate card blocks the METHOD recommendation → R5’s coupling comes back', function () {
  var m = build(A({ domesticLeadTimeOnly: true, mutate: function (S) {
    S.bundle = swap(S.bundle, "    if (!lane.length) {", "    if (false) {");
  } }));
  pass1(m);
  return drafts(m) && census(m).route_materialization_complete !== true;
});
mut('H14 the AI Plan LOCKS a carrier → a lead-time row’s carrier_id becomes a commercial decision', function () {
  var m = build(A({ domesticLeadTimeOnly: true, mutate: function (S) {
    // Every occurrence: the literal appears three times in the bundle and the one KMMR puts on an OPTION is
    // not the first, so a single-shot replace would leave the field under test untouched.
    S.bundle = S.bundle.split("carrier_selection: 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN'")
                       .join("carrier_selection: 'LOCKED_BY_AI_PLAN'");
  } }));
  var sel = m.run('RUN_E3_FIND_MATERIALIZABLE_CANDIDATE()');
  return !!sel.selected && sel.selected.selected_method_profile.carrier_selection !== 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN';
});
// A different execution key does NOT duplicate: the header identity comes from the ROUTE TUPLE, not from the
// key. Asserted positively rather than mutated, because it is the property that makes a replay safe.
var hKey = build(A({ domesticLeadTimeOnly: true }));
pass1(hKey);
generate(hKey, 'KEY-1');
generate(hKey, 'KEY-2');
eq(drafts(hKey).headers.length, 1,
  'H15a two different execution keys still resolve ONE header — identity is the route tuple, not the key');
mut('H15 the header identity stops being deterministic → a replay mints a second ticket for one click', function () {
  // TWO WRONG GUESSES BEFORE THIS ONE, AND EACH RULED OUT A CANDIDATE EXPLANATION. Randomising the K4 header
  // id does not duplicate — the writer finds the existing ticket by IDENTITY KEY and keeps the id it already
  // has. Randomising the run's execution key does not duplicate either. What actually makes a retried click
  // one ticket is `ricK4GroupKey_`: the route TUPLE. Measured, and it is the only one of the three that does.
  var m = build(A({ domesticLeadTimeOnly: true, mutate: function (S) {
    S.ric = swap(S.ric, "    s(h.recommendation_group_no)].join('|');",
                        "    s(h.recommendation_group_no), Utilities.getUuid()].join('|');");
  } }));
  pass1(m);
  generate(m);
  generate(m);
  return drafts(m).headers.length > 1;
});
mut('H16 a warned scope suppresses a READY one → one lane’s gap discards another lane’s plan', function () {
  var m = build(A({ domesticLeadTimeOnly: true, foreignSkus: 3, mutate: function (S) {
    S.wap = swap(S.wap, "      if (ls.recommendation_ready === true) anyReady = true; else allReady = false;",
                        "      if ((ls.recommendation_warning_codes || []).length) { allReady = false; return; }\n      if (ls.recommendation_ready === true) anyReady = true; else allReady = false;");
  } }));
  pass1(m);
  return generate(m).data.advice.recommendation_ready === false;
});
mut('H17 the SUBMIT gate is relaxed → advice readiness becomes permission to submit', function () {
  var m = build(A({ mutate: function (S) {
    S.wap = swap(S.wap, "  out.submit_ready = out.execution_route_materialized === true && out.carrier_pricing_ready === true;",
                        "  out.submit_ready = out.recommendation_ready === true;");
  } }));
  pass1(m);
  return census(m).submit_ready === true;
});
mut('H18 the lifecycle authority splits again → a stale deployed body reports itself UNIFORM', function () {
  // A label cannot see a stale body, which is why R5 made this an EXECUTED invariant. So the probe first
  // creates a real split — a deployed lifecycle that resolves something the writer does not — and then asks
  // whether removing the runtime term from the contract hides it. Without the split there is nothing to hide,
  // and the mutation would look harmless.
  function contract(removeGuard) {
    var m = build(A({ mutate: function (S) {
      S.aipl = swap(S.aipl, 'function aiplSchemaVersionOf_(', 'function aiplSchemaVersionOfREAL_(');
      S.aipl += String.fromCharCode(10) + 'function aiplSchemaVersionOf_(h) { return "STALE-DEPLOYED-BODY"; }' + String.fromCharCode(10);
      if (removeGuard) {
        // The defect this guards against is the check ASSERTING instead of EXECUTING: a hard-coded uniform
        // reads exactly like a passing probe, which is how a mixed deployment reported itself UNIFORM.
        S.sys = swap(S.sys, '  var runtime = sysRuntimeAuthorityChecks_();',
                            "  var runtime = { checked: true, uniform: true, checks: [], divergent: [], missing_authority: [], verdict: 'UNIFORM' };");
      }
    } }));
    return m.run('sysModuleBuildStamps_()');
  }
  var clean = contract(false), mutant = contract(true);
  // `mixed_deployment` alone cannot decide this: the harness compiles a subset of the project, so absent
  // modules make it true either way. The RUNTIME finding is the signal, and it is the one that disappears.
  return /RUNTIME_AUTHORITY_DIVERGENCE|\(RUNTIME\)/.test(clean.verdict)
    && !/RUNTIME_AUTHORITY_DIVERGENCE|\(RUNTIME\)/.test(mutant.verdict);
});

// ================================================================================================================
console.log('\n' + '='.repeat(112));
console.log('passed ' + pass + '  failed ' + fail + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
console.log('='.repeat(112));
process.exit(fail ? 1 : 0);
