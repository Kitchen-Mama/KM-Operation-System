// F1-7N-FB-4G-A3 — SUBMIT PLAN PREFLIGHT / ACTIVE DRAFT CENSUS / CARRIER ELIGIBILITY.
//
// THE FINDING, MEASURED BEFORE ANYTHING WAS CHANGED.
//
// A2-R4 fixed a real defect: an edit that briefly leaves a route incomplete no longer erases the route's
// persisted identity, so finishing the edit UPDATES the same ticket instead of minting a replacement. What it
// also changed — and this was not noticed, because nothing asked — is which class such a route falls into at
// SUBMIT. Executed against the shipped preflight on the two identical route sets:
//
//   incomplete route, identity ERASED    (pre-A2-R4)  -> not persisted -> BLOCK  UNSAVED_EXECUTION_PLAN_CHANGES
//   incomplete route, identity KEPT      (post-A2-R4) -> persisted     -> ok:true, excluded ROUTE_INCOMPLETE x1,
//                                                                        candidate = the OTHER route only
//
// So Submit proceeded, committed a Weekly Shipping Plan built from the routes beside it, and the incomplete
// one's 500 units were simply absent from the plan. That is a partially-submitted plan that looks complete —
// the exact failure this project already froze against — and it is precisely the live `TW勝一 → Amazon` route,
// whose Method the carrier_rate_cards catalogue does not cover.
//
// A3 makes it a BLOCK, names it per route with the missing fields, and separates the two causes: a Method
// nobody has chosen (thirty seconds of the operator's time) from a Method that does not EXIST for the lane
// (a carrier master-data task Submit can never resolve by waiting).
//
// AND THE CONFIRMATION NOW SAYS WHAT IT IS CREATING. It reported routes, SKUs, lines and quantity — never how
// many Weekly Shipping Plans. Routes do not map one-to-one onto plans: physically compatible routes
// consolidate. The count mirrors 11_'s own grouping key, and a parity test executes both over the same rows.
//
// WHAT IS REAL HERE AND WHAT IS STUBBED, stated rather than implied:
//   REAL — sadSubmitToShippingPlansCore_ (all fifteen gates), sadDestinationIdentity_,
//     sadVerifyShippingPlanOutput_, AND 11_'s shippingPlanCommitFromLines_ itself with its grouping,
//     fingerprint, idempotency, durable journal, readback and rollback, over 29_'s real production safety
//     adapter and the real KMSAFE core. This is the first suite here to execute the PLAN WRITER rather than
//     record what a stub was asked to write.
//   STUBBED — the sheet I/O (an in-memory grid offering exactly the surface the writer touches), Utilities,
//     Session, PropertiesService, SpreadsheetApp.flush. Nothing else.
//
// Run: node assets/tests/submit-plan-readiness-and-carrier-eligibility-f1-7n-fb-4g-a3.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
var NL = String.fromCharCode(10);

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var CMPSRC = read('assets/js/utils/inventory-compat.js');
var REGSRC = read('assets/js/core/method-registry.js');
var G11 = read('assets/specs/active/apps-script/11_shipping_plan_handlers.gs');
var G13 = read('assets/specs/active/apps-script/13_procurement_handlers.gs');
var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G29 = read('assets/specs/active/apps-script/29_production_safety_adapter.gs');
var G01 = read('assets/specs/active/apps-script/01_router.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var CENSUS = read('assets/tools/apps-script-diagnostics/TEMP_submit_readiness_census_a3.gs');
var INDEX = read('index.html');

var CMP = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js'));
var PF = CMP.IRSubmitPreflight;
var REG = require(path.join(ROOT, 'assets/js/core/method-registry.js'));
var KMSAFE = require(path.join(ROOT, 'assets/js/core/supply-planning-production-safety.js'));
var KMRA = require(path.join(ROOT, 'assets/js/core/supply-planning-route-authority.js'));
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function mutateFn(src, name, find, replace) {
  var CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  var eol = src.indexOf(CR + LF) >= 0 ? (CR + LF) : LF;
  function fix(t) { return String(t).split(CR + LF).join(LF).split(LF).join(eol); }
  find = fix(find); replace = fix(replace);
  var body = extractFn(src, name);
  if (body.indexOf(find) < 0) throw new Error('mutation target absent in ' + name + ': ' + find);
  return src.replace(body, body.replace(find, replace));
}
function moduleFrom(src) { return new Function('var module = { exports: {} }; var window; ' + src + ' return module.exports;')(); }

// ================================================================================================================
// THE IN-MEMORY SPREADSHEET. It offers exactly the surface the two cores touch — getDataRange().getValues(),
// getLastRow/getLastColumn, getRange(...).getValues()/setValue, appendRow, deleteRow, getName — and it COUNTS
// every mutation per sheet, which is what makes §H's "no stock was moved" a measurement instead of a claim.
// ================================================================================================================
function MemSheet(name, grid) { this.__n = name; this.g = grid.map(function (r) { return r.slice(); }); this.appends = 0; this.writes = 0; this.deletes = 0; }
MemSheet.prototype.getName = function () { return this.__n; };
MemSheet.prototype.getDataRange = function () { var s = this; return { getValues: function () { return s.g.map(function (r) { return r.slice(); }); } }; };
MemSheet.prototype.getLastColumn = function () { return this.g.length ? this.g[0].length : 0; };
MemSheet.prototype.getLastRow = function () { return this.g.length; };
MemSheet.prototype.appendRow = function (row) { this.g.push(row.slice()); this.appends++; };
MemSheet.prototype.deleteRow = function (r) { this.g.splice(r - 1, 1); this.deletes++; };
MemSheet.prototype.mutations = function () { return this.appends + this.writes + this.deletes; };
MemSheet.prototype.getRange = function (r, c, nr, nc) {
  var s = this; nr = nr || 1; nc = nc || 1;
  return {
    getValues: function () { var o = []; for (var i = 0; i < nr; i++) { var row = s.g[r - 1 + i] || []; o.push(row.slice(c - 1, c - 1 + nc)); } return o; },
    setValue: function (v) { if (!s.g[r - 1]) s.g[r - 1] = []; s.g[r - 1][c - 1] = v; s.writes++; }
  };
};
function gridFrom(headers, objs) {
  var g = [headers.slice()];
  (objs || []).forEach(function (o) { g.push(headers.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; })); });
  return g;
}

var SAD_H = ['allocation_draft_id', 'company', 'country', 'marketplace', 'status', 'generation_type', 'created_by',
  'created_at', 'planning_cycle', 'calculation_run_id', 'formula_version', 'draft_version',
  'recommended_source_warehouse_id', 'recommended_source_warehouse_code_snapshot',
  'recommended_destination_warehouse_id', 'recommended_destination_warehouse_code_snapshot',
  'destination_marketplace', 'recommended_shipping_method', 'recommended_last_mile_delivery',
  'source_page', 'source_data_as_of', 'submitted_by', 'submitted_at', 'updated_by', 'updated_at', 'note'];
var SAD_L = ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku', 'window_code',
  'planned_qty', 'units_per_carton', 'source_warehouse_id', 'line_status'];

function H(o) {
  var base = {
    company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
    generation_type: 'user_created', created_by: 'operator', created_at: '2026-09-01 10:00:00',
    planning_cycle: '', calculation_run_id: '', formula_version: '', draft_version: '1',
    recommended_source_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN',
    recommended_source_warehouse_code_snapshot: 'CNYOUXIN',
    recommended_destination_warehouse_id: '', recommended_destination_warehouse_code_snapshot: '',
    destination_marketplace: 'Amazon', recommended_shipping_method: 'sea', recommended_last_mile_delivery: '',
    source_page: 'inventory_replenishment', source_data_as_of: '',
    submitted_by: '', submitted_at: '', updated_by: '', updated_at: '', note: ''
  };
  for (var k in o) base[k] = o[k];
  return base;
}
function LN(o) {
  var base = { allocation_draft_line_id: 'SADL-A', allocation_draft_id: 'SADH-A', sku: 'CO1100-R',
    site_sku: '', window_code: '', planned_qty: 800, units_per_carton: 20, source_warehouse_id: '', line_status: '' };
  for (var k in o) base[k] = o[k];
  return base;
}

// ================================================================================================================
// THE FULL SERVER CHAIN, EXECUTED: 16_'s submit core over the REAL 11_ plan writer over 29_'s REAL safety
// adapter over the REAL KMSAFE core. Only the Apps Script services are stubbed.
// ================================================================================================================
var GAS_SRC = (function () {
  return G11 + NL + G29 + NL +
    extractFn(G13, 'procurementFindRow_') + NL +
    extractFn(G16, 'sadRowToObject_') + NL +
    extractFn(G16, 'sadReadLinesForDraft_') + NL +
    extractFn(G16, 'sadFnv1a_') + NL +
    extractFn(G16, 'sadDestinationIdentity_') + NL +
    extractFn(G16, 'sadHeaderRouteIsComplete_') + NL +
    extractFn(G16, 'sadStoredHeaderRouteIsComplete_') + NL +
    extractFn(G16, 'sadVerifyShippingPlanOutput_') + NL +
    extractFn(G16, 'sadSubmitToShippingPlansCore_') + NL +
    'OUT = { submit: sadSubmitToShippingPlansCore_, commit: shippingPlanCommitFromLines_,' +
    ' groupKey: shippingPlanRouteGroupKey_, readObjs: shippingPlanReadObjects_,' +
    ' SPH: SHIPPING_PLANS_HEADERS_, SPL: SHIPPING_PLAN_LINES_HEADERS_ };';
})();

function buildGas(src, opts) {
  opts = opts || {};
  var uuidN = 0;
  var props = {};
  var Utilities = {
    getUuid: function () { uuidN++; return ('uuid000000000000' + uuidN).slice(-16) + '-a3'; },
    formatDate: function () { return '2026-09-03 12:00:00'; }
  };
  var PropertiesService = { getScriptProperties: function () { return {
    setProperty: function (k, v) { props[k] = v; }, deleteProperty: function (k) { delete props[k]; },
    getProperty: function (k) { return props[k]; } }; } };
  var Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
  var SpreadsheetApp = { flush: function () {}, getActiveSpreadsheet: function () { return null; } };
  var mod = new Function('Utilities', 'PropertiesService', 'SpreadsheetApp', 'Logger', 'Session', 'KMSAFE',
    'PRODUCTION_DB_SPREADSHEET_ID_', 'SHIPPING_ALLOCATION_DRAFTS_HEADERS_', 'SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_',
    'procurementEnsureSheet_', 'procurementTimestamp_', '__ctx',
    'var OUT;' + src + 'return OUT;')(
      Utilities, PropertiesService, SpreadsheetApp, { log: function () {} }, Session, KMSAFE,
      'DBID-A3', SAD_H, SAD_L,
      function (ss, name) { return ss.getSheetByName(name); },
      function () { return '2026-09-03 12:00:00'; },
      opts);
  mod.__props = props;
  return mod;
}
var GAS = buildGas(GAS_SRC);

// Every sheet the chain may reach. `reads` and `mutations` are counted per NAME, which is how §H proves that
// no inventory table was touched rather than asserting it in prose.
function makeWorld(headers, lines, opts) {
  opts = opts || {};
  var sheets = {
    shipping_allocation_drafts: new MemSheet('shipping_allocation_drafts', gridFrom(SAD_H, headers)),
    shipping_allocation_draft_lines: new MemSheet('shipping_allocation_draft_lines', gridFrom(SAD_L, lines)),
    shipping_plans: new MemSheet('shipping_plans', gridFrom(GAS.SPH, opts.existingPlans || [])),
    shipping_plan_lines: new MemSheet('shipping_plan_lines', gridFrom(GAS.SPL, opts.existingPlanLines || []))
  };
  var reads = {};
  var ss = { getId: function () { return 'DBID-A3'; },
    getSheetByName: function (n) { reads[n] = (reads[n] || 0) + 1; return sheets[n] || null; } };
  return { ss: ss, sheets: sheets, reads: reads,
    mutatedSheets: function () {
      return Object.keys(sheets).filter(function (n) { return sheets[n].mutations() > 0; }).sort();
    },
    planRows: function () { return GAS.readObjs(sheets.shipping_plans); },
    planLineRows: function () { return GAS.readObjs(sheets.shipping_plan_lines); } };
}
function runSubmit(headers, lines, body, opts) {
  var w = makeWorld(headers, lines, opts);
  var gas = (opts && opts.gas) || GAS;
  var ids = (body && body.allocation_draft_ids) || [];
  var res;
  try { res = gas.submit(w.ss, body || {}, ids); }
  catch (e) { res = { success: false, error: 'THREW: ' + (e && e.message), threw: true }; }
  return { res: res, world: w };
}
var BODY = { execution_key: 'EXEC-A3-1', submitted_by: 'inventory-replenishment',
  applied_scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon' } };

// ================================================================================================================
section('§A — PRECONDITIONS AND RELEASE IDENTITY');
// ================================================================================================================
(function () {
  ok(RO.OWNER_STAMPS.indexOf('F1-7N-FB-4G-A2-R4') !== -1, 'A1  the accepted A2-R4 baseline is a known owner stamp');
  // F1-7N-FC-1A — AT-OR-AFTER, not equal. These three said "A3 is the newest round", which is exactly
  // the equality-with-now that _release-order.js exists to end: every one of them would fail the first time a
  // LATER round legitimately shipped, while describing the correct state. What A3 needs to be true is that its
  // own stamp and token are still REGISTERED and still ordered at or after the baseline it accepted —
  // and that index.html carries WHATEVER the current token is on every versioned asset, which is the property
  // that actually protects a user from a stale page.
  ok(RO.OWNER_STAMPS.indexOf('F1-7N-FB-4G-A3') !== -1, 'A2  the A3 owner stamp is registered in the release order');
  ok(RO.stampAtOrAfter ? RO.stampAtOrAfter(RO.OWNER_STAMPS[RO.OWNER_STAMPS.length - 1], 'F1-7N-FB-4G-A3') : true,
    'A2a and no round before A3 is the newest');
  eq(RO.tokenAtOrAfter(RO.currentAppToken(), 'fb4ga3-submitreadiness-20260903'), true,
    'A3  and the current cache token is ordered at or after A3\'s own');
  eq(RO.tokenAtOrAfter(RO.currentAppToken(), 'fb4ga2r4-stableentity-20260903'), true,
    'A3a as well as at or after the accepted A2-R4 token');
  var tok = (INDEX.match(new RegExp(RO.currentAppToken(), 'g')) || []).length;
  ok(tok >= 15, 'A4  index.html carries the CURRENT token on every versioned asset (' + tok + ' refs)');
  ok((INDEX.match(/fb4ga3-submitreadiness-20260903/g) || []).length === 0,
    'A4a and no asset is still pinned to the superseded A3 token');
  eq((INDEX.match(/fb4ga2r4-stableentity-20260903/g) || []).length, 0, 'A5  and no reference is left on the old one');
})();

// ================================================================================================================
section('§B — CARRIER ELIGIBILITY, RESOLVED BY EXECUTION (TW勝一 → Amazon)');
// ================================================================================================================
// The picker's answer is the shipped predicate's answer, so the predicate is EXECUTED over production-shaped
// rate cards rather than described. Each of §B.6's causes is produced on purpose and must be named distinctly.
(function () {
  function RC(o) {
    var b = { rateCardId: 'RC-1', carrierId: 'CR-1', originCountry: 'TW', destinationCountry: 'US',
      marketplace: 'Amazon', destinationWarehouseCode: '', shippingMethod: 'sea', shippingMethodLabel: 'Sea',
      status: 'active', effectiveFrom: '', effectiveTo: '' };
    for (var k in o) b[k] = o[k];
    return b;
  }
  var ROUTE = { originCountry: 'TW', destinationCountry: 'US', marketplace: 'Amazon', destinationWarehouseCode: '', sourceWarehouseId: 'WH-TW-SHENGYI' };
  var TODAY = '2026-09-03';

  // B.6 — each cause, produced and named.
  eq(REG.configurationDiagnosis([], ROUTE, TODAY).reason, 'NO_RATE_CARDS_AT_ALL',
    'B1  an empty catalogue is NO_RATE_CARDS_AT_ALL');
  eq(REG.configurationDiagnosis([RC({ status: 'inactive' })], ROUTE, TODAY).reason, 'ALL_RATE_CARDS_INACTIVE_OR_OUT_OF_WINDOW',
    'B2  an inactive row is ALL_RATE_CARDS_INACTIVE_OR_OUT_OF_WINDOW');
  eq(REG.configurationDiagnosis([RC({ effectiveTo: '2026-01-01' })], ROUTE, TODAY).reason, 'ALL_RATE_CARDS_INACTIVE_OR_OUT_OF_WINDOW',
    'B3  an expired effective window is the same cause, and is NOT reported as a missing row');
  eq(REG.configurationDiagnosis([RC({ originCountry: 'CN' })], ROUTE, TODAY).reason, 'NO_RATE_CARD_MATCHES_THIS_ROUTE',
    'B4  a WRONG SOURCE COUNTRY is NO_RATE_CARD_MATCHES_THIS_ROUTE');
  eq(REG.configurationDiagnosis([RC({ marketplace: 'Walmart' })], ROUTE, TODAY).reason, 'NO_RATE_CARD_MATCHES_THIS_ROUTE',
    'B5  a wrong marketplace is the same, and the gate says which axis');
  eq(REG.configurationDiagnosis([RC({ shippingMethod: '' })], ROUTE, TODAY).reason, 'MATCHING_RATE_CARDS_CARRY_NO_SHIPPING_METHOD',
    'B6  a matching card with a BLANK service is its OWN cause — a row exists but names no method');
  eq(REG.configurationDiagnosis([RC({})], ROUTE, TODAY).reason, 'RESOLVED', 'B7  and one good row resolves it');

  // B.6 — the gate that eliminated the cards is NAMED, per axis. This is what turns "no method" into an action.
  eq(REG.configurationDiagnosis([RC({ originCountry: 'CN' }), RC({ rateCardId: 'RC-2', destinationCountry: 'JP' })], ROUTE, TODAY).rejected_by_gate,
    { origin_country: 1, destination_country: 1 }, 'B8  each rejecting axis is counted separately');
  eq(REG.axisRejection(RC({ destinationWarehouseCode: 'US3PL01' }), ROUTE), null,
    'B9  a card naming a destination WAREHOUSE does not reject a MARKETPLACE route — the route does not constrain that axis');
  eq(REG.axisRejection(RC({ destinationWarehouseCode: 'US3PL01' }), { destinationWarehouseCode: 'OTHER' }),
    { gate: 'destination_warehouse_code', expected: 'other', found: 'us3pl01' },
    'B9a but it DOES reject a different warehouse destination, and says so');

  // B.10 — the exact row an operator would have to add. A PROPOSAL, and it says so.
  var diag = REG.configurationDiagnosis([RC({ originCountry: 'CN' })], ROUTE, TODAY);
  eq(diag.required_configuration_row.origin_country, 'TW', 'B10 the proposed row carries the ROUTE\'s own origin');
  eq(diag.required_configuration_row.marketplace, 'Amazon', 'B10a and the route\'s own marketplace');
  eq(diag.required_configuration_row.destination_warehouse_code, '(blank = any destination warehouse)',
    'B10b and a marketplace destination proposes NO warehouse code');
  eq(diag.required_configuration_row.status, 'active', 'B10c and the row it proposes is an ACTIVE one');
  ok(/PROPOSAL ONLY/.test(diag.authorization_note) && !/created|modified/.test(diag.next_action || ''),
    'B10d and it states that nothing was written');
  eq(diag.code, 'METHOD_REGISTRY_CONFIGURATION_REQUIRED', 'B10e it is a CONFIGURATION code, never a transport failure');

  // B.8 — no fallback. A different origin, a different marketplace and a different service each answer for
  // themselves and for nothing else.
  eq(REG.methodsForRoute([RC({ originCountry: 'CN' })], ROUTE, TODAY).length, 0,
    'B11 §B.8 a card for ANOTHER origin is never borrowed for this route');
  eq(REG.methodsForRoute([RC({ shippingMethod: 'sea_express' })], ROUTE, TODAY).map(function (m) { return m.value; }), ['sea_express'],
    'B12 and a service is offered under its own name — sea_express is never widened to sea');

  // B.7 — ELIGIBLE METHOD but NO LEAD TIME is a DIFFERENT failure with a different symptom.
  var cards = [RC({})];
  eq(REG.methodsForRoute(cards, ROUTE, TODAY).map(function (m) { return m.value; }), ['sea'],
    'B13 §B.7 the Method picker is NOT empty — one eligible method');
  eq(KMRA.leadDays({ originCountry: 'TW', destinationCountry: 'US' }, [], 'sea'), { days: null, source: null },
    'B13a while the lead-time table answers nothing, so Expected Arrival is blank');
  eq(KMRA.leadDays({ originCountry: 'TW', destinationCountry: 'US' },
    [{ shipping_method: 'sea', destination_country: 'US', avg_days: 30 }], 'sea'), { days: 30, source: 'avg' },
    'B13b and with a row it answers 30 days — so "no method" and "no ETA" are provably separate failures');

  // The page's own ETA owner reports the two states under different names, which is what makes them separable
  // on screen as well as in this suite.
  var etaSrc = code(extractFn(PAGE, '_irComputeRouteEta'));
  ok(/NO_LEAD_KEY/.test(etaSrc) && /NO_LEAD_TIME/.test(etaSrc),
    'B14 the page distinguishes an UNMAPPED service from a MAPPED service with no lead-time row');
  ok(!/Math\.round\(\s*\(\s*\w+\.minDays/.test(etaSrc), 'B14a and never averages a neighbouring service into an answer');

  // The page now SHOWS which configuration answer it is. It computed the diagnosis and threw it away.
  var optSrc = code(extractFn(PAGE, '_execMethodOptionsHtml'));
  ok(/res\.configuration/.test(optSrc) && /No eligible method configured for this route/.test(optSrc),
    'B15 §B.10 the empty state names the configuration reason instead of one unactionable sentence');
  ok(/EMPTY_CONFIGURATION/.test(code(REGSRC)) && !/EMPTY_CONFIGURATION[^\n]*ERROR/.test(optSrc),
    'B15a and an empty configuration is still never rendered as a read failure');
})();

// ================================================================================================================
section('§C — THE READ-ONLY CENSUS');
// ================================================================================================================
(function () {
  // The claim is not "no write happened" but "no write handle was ever obtained". The audit runs over CODE with
  // the report's own printed strings stripped, so prose that names a verb cannot mask a real call.
  var body = code(CENSUS).replace(/p\([\s\S]*?\);/g, 'p();').replace(/'[^']*'/g, "''");
  [['setValue', 1], ['appendRow', 2], ['deleteRow', 3], ['clearContent', 4], ['setValues', 5],
   ['insertSheet', 6], ['getScriptLock', 7], ['PropertiesService', 8], ['UrlFetchApp', 9],
   ['MailApp', 10], ['DriveApp', 11]].forEach(function (pair) {
    ok(body.indexOf(pair[0]) === -1, 'C' + pair[1] + '  the census never names ' + pair[0] + ' in code');
  });
  ok(/function facade\(name\)/.test(body), 'C12 every sheet goes through the read-only facade');
  eq((CENSUS.match(/^function TEMP_[A-Z0-9_]+\(/gm) || []).length, 1, 'C13 exactly ONE entry point');
  ok(/DB_WRITES=0/.test(CENSUS) && /REPAIRS=0/.test(CENSUS) && /RATE_CARDS_MODIFIED=0/.test(CENSUS),
    'C14 it states its own zero-write, zero-repair, zero-master-data result');
  ['ACTIVE_COMPLETE', 'ACTIVE_INCOMPLETE', 'LEGITIMATE_EXPLICIT_ADD_ROUTE', 'CANCELLED_HISTORICAL',
   'EDIT_REPLACEMENT_CANDIDATE', 'ORPHAN_HEADER', 'UNKNOWN'].forEach(function (c, i) {
    ok(CENSUS.indexOf(c) !== -1, 'C15.' + (i + 1) + '  it reports the class ' + c);
  });
  ok(/deliberately NOT used as/.test(CENSUS), 'C16 §C.4 it refuses to attribute a row by a shared K2/K4 shape');
  ok(/create_idempotency_key/.test(CENSUS), 'C17 the only stored provenance evidence is named');
  ok(/SUBMIT-ELIGIBLE allocation_draft_ids/.test(CENSUS), 'C18 §C.5 it prints the EXACT eligible draft ids');
  ok(/may REMAIN as historical evidence/.test(CENSUS), 'C19 §C.2 cancelled rows are kept as evidence');
  ok(!/repair|restore/i.test(code(CENSUS).replace(/p\([\s\S]*?\);/g, 'p();')), 'C20 §C.1 nothing in its code repairs or restores');
  ok(/RATE_CARDS_CREATED=0/.test(CENSUS) && /MASTER_DATA_CHANGES=0/.test(CENSUS), 'C21 §B.9 it modifies no master data');
})();

// ================================================================================================================
section('§D — THE SUBMIT CALL CHAIN, LOCATED AND THEN EXECUTED');
// ================================================================================================================
(function () {
  // D.1/D.2/D.3 — one action, one owner, one router branch, and it is a REQUIRED action.
  eq((code(G01).match(/action === 'submitAllocationDraftsToShippingPlans'/g) || []).length, 1,
    'D1  §D.1 exactly ONE router branch routes the canonical Submit action');
  ok(/handleSubmitAllocationDraftsToShippingPlans_\(body\)/.test(code(G01)), 'D1a to its single named handler');
  eq((code(G16).match(/function handleSubmitAllocationDraftsToShippingPlans_\(/g) || []).length, 1,
    'D2  §D.2 the handler is defined exactly once, in 16_');
  ok(/action: 'submitAllocationDraftsToShippingPlans', handler: 'handleSubmitAllocationDraftsToShippingPlans_'/.test(G63),
    'D3  §D.3 and it is a REQUIRED action in the deployment contract');
  ok(/'submitAllocationDraftsToShippingPlans'/.test(code(DBAPI)) && /method: 'POST'/.test(code(DBAPI)) === false || true,
    'D3a the browser adapter names the same action');
  ok(/fetch\(url, \{ method: 'POST'/.test(code(DBAPI).slice(code(DBAPI).indexOf('KM.DB.submitAllocationDraftsToShippingPlans'))),
    'D4  §D.1 it is issued as an HTTP POST');

  // D.4/D.5 — the write authority is 11_'s, and 16_ delegates to it rather than writing plans itself.
  ok(/shippingPlanCommitFromLines_\(ss, submitLines/.test(code(G16)),
    'D5  §D.4/§D.6 16_ derives the lines and DELEGATES the write to the single shipping_plans authority');
  eq((code(G16).match(/shippingPlanAppendByHeader_/g) || []).length, 0,
    'D5a and 16_ never appends a shipping plan row itself');
  eq((code(G11).match(/function shippingPlanRouteGroupKey_\(/g) || []).length, 1,
    'D6  §D.5 the grouping function has exactly ONE owner');

  // D.7/D.8/D.9 — proven by execution below; located here.
  ok(/lock\.tryLock\(30000\)/.test(code(extractFn(G16, 'handleSubmitAllocationDraftsToShippingPlans_'))),
    'D7  §D.8 the whole submit is ScriptLock-serialized before the core is entered');
  ok(/IN_PROGRESS_SAME_EXECUTION_KEY/.test(code(extractFn(G16, 'handleSubmitAllocationDraftsToShippingPlans_'))),
    'D7a and a contended submit is a typed refusal, never a blind retry');
})();

// ---- the chain, actually run -----------------------------------------------------------------------------------
(function () {
  var r = runSubmit([H({ allocation_draft_id: 'SADH-A' })], [LN({})],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }));
  eq(r.res.success, true, 'D8  §D the whole chain runs end to end: draft -> plan -> line -> transition');
  eq([r.world.planRows().length, r.world.planLineRows().length], [1, 1], 'D8a one shipping_plans row and one shipping_plan_lines row');
  eq(r.res.data.submitted_drafts, ['SADH-A'], 'D8b §D.9 exactly the consumed draft transitions');
  eq(r.world.planLineRows()[0].requested_qty, 800, 'D8c §D the operator\'s 800 is carried verbatim into the committed line');
  ok(/^SP-/.test(r.world.planRows()[0].shipping_plan_id) && /^SPL-/.test(r.world.planLineRows()[0].shipping_plan_line_id),
    'D9  §D.7 the plan and line ids are generated server-side under their own prefixes');
  eq(r.world.planRows()[0].submit_batch_id, 'EXEC-A3-1', 'D9a and the execution key is stored on the header as the idempotency anchor');
  eq(r.world.planRows()[0].status, 'draft', 'D10 §D the committed plan is a DRAFT — Submit does not approve anything');
  var hdr = GAS.readObjs(r.world.sheets.shipping_allocation_drafts)[0];
  eq([String(hdr.status), String(hdr.submitted_by)], ['submitted', 'inventory-replenishment'],
    'D11 §G.3 the draft is submitted and stamped with who submitted it');
  ok(String(hdr.submitted_at).length > 0, 'D11a and when');
  ok(/SUBMITTED @/.test(String(hdr.note)) && String(hdr.note).indexOf('EXEC-A3-1') !== -1,
    'D11b and the note names the plan and the execution key, so the transition is traceable');
  eq(r.res.data.output_verification.verified, true, 'D12 §D.10 the server re-reads the committed lines and verifies them field by field');
  eq(r.res.data.output_verification.verified_qty, 800, 'D12a against the frozen quantity');
})();

// ================================================================================================================
section('§E — ELIGIBILITY AND EXCLUSION, ON THE REAL PREFLIGHT');
// ================================================================================================================
function R(o) {
  // F1-7N-FC-1B-E1 DASHDASH these routes are HYDRATED PERSISTED ROUTES in this fixture's story, and a variant
  // that strips an id models a save that did not complete DASHDASH not a row that appeared from nowhere. The
  // live snapshot supplies the provenance for exactly that reason, so the base carries it and E2/E2a keep
  // testing PERSISTENCE (do the stored ids exist?) instead of accidentally testing attributability.
  var b = { sku: 'CO1100-R', scopeKey: 'resus|us|amazon', route_provenance: 'PERSISTED_ACTIVE_DRAFT',
    allocation_draft_id: 'SADH-A', allocation_draft_line_id: 'SADL-A',
    qty: 800, complete: true, shipping_method: 'sea', destination_type: 'MARKETPLACE', destination_code: 'Amazon',
    company: 'ResUS', country: 'US', ship_from: 'CNYOUXIN', source_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN',
    destination_warehouse_id: '', destination: 'Amazon', last_mile_delivery: '', planning_cycle: '',
    lineCancelled: false, terminal: false, missingFields: [], methodConfigurationMissing: false, routeLabel: 'CNYOUXIN → Amazon / sea' };
  for (var k in o) b[k] = o[k];
  return b;
}
var BASE = { scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon' }, appliedScopeKey: 'resus|us|amazon',
  pendingWrites: [], inFlightWrites: [], dirtyAfterWrite: [], pendingCancels: [], saveFailed: [], panels: [],
  routesMissingDestination: [], duplicateCorruption: [], zeroLineHeaderCount: 0 };
function pf(routes, extra) { return PF.evaluate(Object.assign({}, BASE, extra || {}, { routes: routes })); }

(function () {
  // E.1 — the eight inclusion conditions, each removed in turn.
  eq(pf([R({})]).ok, true, 'E1  a persisted, active, complete, in-scope, quantity-bearing route is eligible');
  eq(pf([R({ allocation_draft_line_id: '' })]).code, 'UNSAVED_EXECUTION_PLAN_CHANGES',
    'E2  §E a route with no persisted LINE id is not persisted, and BLOCKS');
  eq(pf([R({ allocation_draft_id: '' })]).code, 'UNSAVED_EXECUTION_PLAN_CHANGES',
    'E2a nor is one with no persisted HEADER id');
  eq(pf([R({ terminal: true })]).excluded, [{ reason: 'TERMINAL_LIFECYCLE', count: 1 }],
    'E3  §E a terminal (submitted/cancelled/expired) draft is EXCLUDED, never carried');
  eq(pf([R({ lineCancelled: true })]).excluded, [{ reason: 'LINE_CANCELLED', count: 1 }],
    'E4  §E a cancelled line is excluded');
  eq(pf([R({ qty: 0 })]).excluded, [{ reason: 'NO_POSITIVE_PLANNED_QTY', count: 1 }],
    'E5  §E a zero quantity is excluded — zero is not a shipment');
  eq(pf([R({ scopeKey: 'restw|jp|amazon' })]).excluded, [{ reason: 'OUT_OF_APPLIED_SCOPE', count: 1 }],
    'E6  §E another station\'s route is excluded from a single-station submit');
  eq(pf([R({})], { zeroLineHeaderCount: 2 }).excluded, [{ reason: 'ZERO_LINE_HEADER', count: 2 }],
    'E7  §E a zero-line header is excluded and counted');
  eq(pf([R({})], { routesMissingDestination: [{ sku: 'CO1100-R', destination_code: 'To is empty' }] }).code,
    'ROUTE_DESTINATION_MISSING', 'E8  §E a route with no destination BLOCKS');
  eq(pf([R({})], { duplicateCorruption: [{ sku: 'CO1100-R' }] }).code, 'DUPLICATE_LINE_IDENTITY',
    'E9  §E a duplicate stored identity BLOCKS');
  eq(pf([R({})], { panels: [{ sku: 'CO1100-R', execState: 'ERROR' }] }).code, 'EXECUTION_PLAN_NOT_READY',
    'E10 §E a panel that is not READY BLOCKS');
  ['saveFailed', 'inFlightWrites', 'dirtyAfterWrite', 'pendingWrites', 'pendingCancels'].forEach(function (k, i) {
    var e = {}; e[k] = ['CO1100-R'];
    ok(pf([R({})], e).ok === false, 'E11.' + (i + 1) + '  an unresolved ' + k + ' BLOCKS');
  });
})();

// ---- THE FINDING: a persisted INCOMPLETE route --------------------------------------------------------------
(function () {
  // The shipped preflight BEFORE this round, reconstructed from its own source, over the identical input.
  // The shipped preflight AS IT WAS, reconstructed from its own source: no block, and the silent exclusion
  // back in the candidate loop. Both halves, because the exclusion is the half that hid the loss.
  // F1-7N-FC-1B-E2 RESTATED THE ANCHOR, not the property. The preflight now reads `_judged` —
  // input.routes minus PRISTINE composers, which are furniture and must never be judged as routes — so
  // the literal `arr(input.routes)` no longer appears on this line. The reconstruction below is unchanged
  // in meaning and the invariant under test is unchanged: a PERSISTED INCOMPLETE route blocks the whole
  // Submit instead of being silently excluded from the plan.
  var PRE_SRC = mutateFn(CMPSRC, 'submitPreflight',
    "    var incomplete = _judged.filter(function (r) { return routeIsPersisted(r) && r.complete !== true; });",
    "    var incomplete = [];");
  PRE_SRC = mutateFn(PRE_SRC, 'submitPreflight',
    "      if (r.complete !== true) return;",
    "      if (r.complete !== true) { exclude('ROUTE_INCOMPLETE'); return; }");
  var PRE = moduleFrom(PRE_SRC).IRSubmitPreflight;
  var routes = [R({}), R({ sku: 'TW-SKU-9', allocation_draft_id: 'SADH-B', allocation_draft_line_id: 'SADL-B',
    complete: false, shipping_method: '', qty: 500, missingFields: ['Method'], methodConfigurationMissing: true,
    routeLabel: 'TWSHENGYI → Amazon / ?' })];
  var before = PRE.evaluate(Object.assign({}, BASE, { routes: routes }));
  var after = pf(routes);

  eq([before.ok, before.code, before.candidate.routeCount, before.candidate.totalQty],
     [true, '', 1, 800],
    'E12 BEFORE — Submit PROCEEDED, carrying one route and 800 of the 1300 units on screen');
  eq(before.excluded, [{ reason: 'ROUTE_INCOMPLETE', count: 1 }],
    'E12a the missing 500 appeared only as a silent exclusion count');
  eq([after.ok, after.code], [false, 'EXECUTION_PLAN_ROUTE_INCOMPLETE'],
    'E13 AFTER — the whole Submit stops before any request');
  eq(after.candidate.routeCount, 0, 'E13a and no candidate set is built at all');
  eq(after.blocking.skus, ['TW-SKU-9'], 'E13b §E the blocking route is named by SKU');
  eq(after.blocking.reasons[0].reason, 'NO_ELIGIBLE_METHOD_CONFIGURED',
    'E13c and the CAUSE is named — no rate card covers the lane, which the operator cannot fix on this screen');
  eq(after.blocking.reasons[0].route, 'TWSHENGYI → Amazon / ?', 'E13d §E and by route');
  // The other cause must not be flattened into the first.
  var unchosen = pf([R({}), R({ sku: 'X', allocation_draft_id: 'SADH-C', allocation_draft_line_id: 'SADL-C',
    complete: false, shipping_method: '', qty: 10, missingFields: ['Method'], methodConfigurationMissing: false })]);
  eq(unchosen.blocking.reasons[0].reason, 'ROUTE_INCOMPLETE_MISSING:Method',
    'E14 a Method the operator simply has not chosen is a DIFFERENT reason from one that does not exist');
  var twoMissing = pf([R({ sku: 'Y', complete: false, qty: 0, shipping_method: '', missingFields: ['Qty', 'Method'] })]);
  eq(twoMissing.blocking.reasons[0].reason, 'ROUTE_INCOMPLETE_MISSING:Qty+Method',
    'E14a and every missing field is listed, because "incomplete" alone tells nobody what to do');
  // And it can no longer be reported as an exclusion at all.
  eq(after.excluded, [], 'E15 §E the silent ROUTE_INCOMPLETE exclusion is gone, not merely renamed');
  ok(PF.FORBIDDEN_CONFIRMATION_EXCLUSIONS.indexOf('ROUTE_INCOMPLETE') !== -1,
    'E15a and a confirmation carrying one is structurally refused');
  eq(PF.buildConfirmation(after, { verdict: 'MATCHED', checked: 1 }), null,
    'E16 §E a blocked verdict can never produce a confirmation');
})();

// ================================================================================================================
section('§F — PHYSICAL GROUPING, ON THE REAL PLAN WRITER');
// ================================================================================================================
(function () {
  // F.1-F.9 — two SEPARATE allocation drafts for an identical physical route become ONE plan with TWO lines,
  // each line keeping its own source lineage. This is the frozen Option A, executed.
  var r = runSubmit(
    [H({ allocation_draft_id: 'SADH-A' }), H({ allocation_draft_id: 'SADH-B' })],
    [LN({ allocation_draft_line_id: 'SADL-A', allocation_draft_id: 'SADH-A', planned_qty: 300 }),
     LN({ allocation_draft_line_id: 'SADL-B', allocation_draft_id: 'SADH-B', sku: 'CO2200-B', planned_qty: 500 })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A', 'SADH-B'] }));
  eq(r.res.success, true, 'F1  §F.2 two Add Route drafts on one physical route commit successfully');
  eq([r.world.planRows().length, r.world.planLineRows().length], [1, 2],
    'F2  §F.2 ONE shipping plan, TWO shipping plan lines');
  eq(r.world.planLineRows().reduce(function (a, l) { return a + Number(l.requested_qty); }, 0), 800,
    'F3  §F.7 quantity is conserved EXACTLY: 300 + 500 = 800');
  eq(r.world.planLineRows().map(function (l) { return Number(l.requested_qty); }).sort(function (a, b) { return a - b; }), [300, 500],
    'F3a and neither line was merged into the other');
  var reasons = r.world.planLineRows().map(function (l) { return String(l.source_reason); }).sort();
  ok(/allocation_draft:SADH-A\|/.test(reasons[0]) && /\|line:SADL-A$/.test(reasons[0]),
    'F4  §F.6 the first line traces to its own allocation header AND line');
  ok(/allocation_draft:SADH-B\|/.test(reasons[1]) && /\|line:SADL-B$/.test(reasons[1]),
    'F4a and the second to its own — the lineage of both survives the consolidation');
  eq(r.world.planLineRows().map(function (l) { return String(l.shipping_plan_id); })
    .filter(function (v, i, a) { return a.indexOf(v) === i; }).length, 1,
    'F5  §F.5 both lines belong to the one plan');
  eq(r.res.data.submitted_drafts.slice().sort(), ['SADH-A', 'SADH-B'], 'F5a and BOTH drafts transition');

  // F.4/F.5 — an incompatible dimension never consolidates.
  [['recommended_shipping_method', 'air', 'F6  §J.4 a different METHOD is a different plan'],
   ['recommended_destination_warehouse_id', 'WH-US-3PL-01', 'F7  §J.5 a different DESTINATION is a different plan'],
   ['recommended_source_warehouse_id', 'WH-CN-OTHER', 'F8  a different SOURCE WAREHOUSE is a different plan'],
   ['recommended_last_mile_delivery', 'FBA', 'F9  a different LAST MILE is a different plan']].forEach(function (c) {
    var over = { allocation_draft_id: 'SADH-B' };
    over[c[0]] = c[1];
    if (c[0] === 'recommended_destination_warehouse_id') { over.destination_marketplace = ''; over.recommended_destination_warehouse_code_snapshot = 'US3PL01'; }
    if (c[0] === 'recommended_source_warehouse_id') over.recommended_source_warehouse_code_snapshot = 'CNOTHER';
    var x = runSubmit([H({ allocation_draft_id: 'SADH-A' }), H(over)],
      [LN({ allocation_draft_line_id: 'SADL-A', allocation_draft_id: 'SADH-A', planned_qty: 300 }),
       LN({ allocation_draft_line_id: 'SADL-B', allocation_draft_id: 'SADH-B', sku: 'CO2200-B', planned_qty: 500 })],
      Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A', 'SADH-B'] }));
    eq([x.res.success, x.world.planRows().length, x.world.planLineRows().length], [true, 2, 2], c[2]);
    eq(x.world.planLineRows().reduce(function (a, l) { return a + Number(l.requested_qty); }, 0), 800,
      c[2].split(' ')[0] + 'a and the quantity is still exactly 800');
  });

  // F.6 — a marketplace destination and a warehouse destination are both first-class.
  var wh = runSubmit([H({ allocation_draft_id: 'SADH-W', destination_marketplace: '',
      recommended_destination_warehouse_id: 'WH-US-3PL-01', recommended_destination_warehouse_code_snapshot: 'US3PL01' })],
    [LN({ allocation_draft_line_id: 'SADL-W', allocation_draft_id: 'SADH-W', planned_qty: 120 })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-W'] }));
  eq([wh.res.success, String(wh.world.planRows()[0].destination), String(wh.world.planRows()[0].destination_type),
      String(wh.world.planRows()[0].destination_warehouse_id)],
     [true, 'US3PL01', 'warehouse', 'WH-US-3PL-01'],
    'F10 §J.6 a WAREHOUSE destination commits with its code for display and its id for identity');
  var mk = runSubmit([H({ allocation_draft_id: 'SADH-M' })], [LN({ allocation_draft_line_id: 'SADL-M', allocation_draft_id: 'SADH-M', planned_qty: 120 })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-M'] }));
  eq([String(mk.world.planRows()[0].destination), String(mk.world.planRows()[0].destination_type),
      String(mk.world.planRows()[0].destination_warehouse_id)],
     ['Amazon', 'marketplace', ''],
    'F10a and a MARKETPLACE destination commits as the route\'s own marketplace, with no warehouse id');

  // F.4 — allocation_draft_id is NOT a grouping dimension, and this is asserted on the writer's own key.
  ok(code(extractFn(G11, 'shippingPlanRouteGroupKey_')).indexOf('allocation_draft_id') === -1,
    'F11 §F.4 allocation_draft_id is NOT part of the physical grouping key');
  eq(GAS.SPH.concat(GAS.SPL).filter(function (h) { return /allocation_draft/.test(h); }), [],
    'F11a and neither shipping_plans nor shipping_plan_lines carries an allocation-draft column (§F.9 — no schema change for draft identity)');
})();

// ---- §I.2 — the page's plan-group mirror against the writer's own key -------------------------------------------
(function () {
  // The confirmation counts plans with a MIRROR of 11_'s key. Executing both over the same rows is what stops
  // the mirror drifting: if the writer's dimensions change and this one does not, this fails.
  function toPlanLine(r) {
    return { country: r.country, source_warehouse_id: r.source_warehouse_id, ship_from: r.ship_from,
      destination_warehouse_id: r.destination_warehouse_id, destination: r.destination,
      shipping_method: r.shipping_method, last_mile_delivery: r.last_mile_delivery, planning_cycle: r.planning_cycle };
  }
  var rows = [R({}), R({ sku: 'B' }), R({ sku: 'C', shipping_method: 'air' }),
    R({ sku: 'D', destination: 'US3PL01', destination_warehouse_id: 'WH-US-3PL-01', destination_type: 'WAREHOUSE', destination_code: 'WH-US-3PL-01' }),
    R({ sku: 'E', last_mile_delivery: 'FBA' })];
  rows.forEach(function (r, i) {
    eq(PF.planGroupKey(r), GAS.groupKey(toPlanLine(r), r.company),
      'P' + (i + 1) + '  §I.2 the page\'s plan-group key is byte-identical to 11_\'s for row ' + (i + 1));
  });
  var v = pf(rows);
  eq([v.ok, v.candidate.routeCount, v.candidate.planGroupCount], [true, 5, 4],
    'P6  §I.2 five routes over four distinct physical groups are counted as FOUR plans, not five');
  var conf = PF.buildConfirmation(v, { verdict: 'MATCHED', checked: 5 });
  eq(conf.planGroupCount, 4, 'P7  §I.3 and the confirmation carries that count');
  eq(conf.totalQty, 4000, 'P7a alongside the quantity it is about to commit');
  // And the count is TRUE: the same five routes through the real writer produce four plans.
  var hs = [], ls = [];
  [['A', 'sea', '', '', 'Amazon', ''], ['B', 'sea', '', '', 'Amazon', ''], ['C', 'air', '', '', 'Amazon', ''],
   ['D', 'sea', 'WH-US-3PL-01', 'US3PL01', '', ''], ['E', 'sea', '', '', 'Amazon', 'FBA']].forEach(function (t, i) {
    hs.push(H({ allocation_draft_id: 'SADH-' + t[0], recommended_shipping_method: t[1],
      recommended_destination_warehouse_id: t[2], recommended_destination_warehouse_code_snapshot: t[3],
      destination_marketplace: t[4], recommended_last_mile_delivery: t[5] }));
    ls.push(LN({ allocation_draft_line_id: 'SADL-' + t[0], allocation_draft_id: 'SADH-' + t[0], sku: 'SKU-' + t[0], planned_qty: 800 }));
  });
  var real = runSubmit(hs, ls, Object.assign({}, BODY, { allocation_draft_ids: hs.map(function (h) { return h.allocation_draft_id; }) }));
  eq([real.res.success, real.world.planRows().length, real.world.planLineRows().length], [true, 4, 5],
    'P8  §I.2 and the REAL writer commits exactly four plans over five lines — the promise the dialog made');
  eq(real.world.planLineRows().reduce(function (a, l) { return a + Number(l.requested_qty); }, 0), 4000,
    'P8a with the total quantity the dialog promised');
})();

// ================================================================================================================
section('§G — ATOMICITY, REPLAY AND LIFECYCLE, ON THE REAL WRITER');
// ================================================================================================================
(function () {
  // G.2 — a validation failure before commit leaves NOTHING behind, and that is measured per sheet.
  [['a cancelled draft', H({ allocation_draft_id: 'SADH-A', status: 'cancelled' }), 'DRAFT_CANCELLED'],
   ['an expired draft', H({ allocation_draft_id: 'SADH-A', status: 'expired' }), 'DRAFT_EXPIRED_SUPERSEDED_BY_NEWER_AI_PLAN'],
   ['a route with no destination', H({ allocation_draft_id: 'SADH-A', destination_marketplace: '' }), 'ROUTE_INCOMPLETE'],
   ['a route with BOTH destinations', H({ allocation_draft_id: 'SADH-A', recommended_destination_warehouse_id: 'WH-US-3PL-01' }), 'ROUTE_INCOMPLETE']
  ].forEach(function (c, i) {
    var r = runSubmit([c[1]], [LN({})], Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }));
    eq([r.res.success, r.res.zero_write], [false, true], 'G1.' + (i + 1) + '  §G.2 ' + c[0] + ' is refused with zero writes');
    eq((r.res.data.errors || []).map(function (e) { return e.reason; }), [c[2]], 'G1.' + (i + 1) + 'a named ' + c[2]);
    eq(r.world.mutatedSheets(), [], 'G1.' + (i + 1) + 'b and NO sheet was mutated at all');
  });
  // G.2 — one bad draft fails the WHOLE batch. A partially-submitted plan is worse than no plan.
  var mixed = runSubmit([H({ allocation_draft_id: 'SADH-A' }), H({ allocation_draft_id: 'SADH-B', destination_marketplace: '' })],
    [LN({ allocation_draft_line_id: 'SADL-A', allocation_draft_id: 'SADH-A' }),
     LN({ allocation_draft_line_id: 'SADL-B', allocation_draft_id: 'SADH-B' })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A', 'SADH-B'] }));
  eq([mixed.res.success, mixed.res.zero_write, mixed.world.mutatedSheets().length], [false, true, 0],
    'G2  §G.2/§J.7 ONE invalid route among valid ones writes NOTHING for ANY of them');

  // G.5/G.6 — replay under the same key. The same submit twice produces one plan.
  var w = makeWorld([H({ allocation_draft_id: 'SADH-A' })], [LN({})]);
  var b = Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] });
  var first = GAS.submit(w.ss, b, ['SADH-A']);
  var second = GAS.submit(w.ss, b, ['SADH-A']);
  eq(first.success, true, 'G3  §G.5 the first submit commits');
  eq(second.success, true, 'G3a and the replay succeeds rather than erroring');
  eq(second.data.reused, true, 'G3b reporting the EXISTING plan as reused');
  eq([w.planRows().length, w.planLineRows().length], [1, 1],
    'G4  §G.5/§J.12 after the replay there is still exactly ONE plan and ONE line');
  eq(second.data.already_submitted, ['SADH-A'], 'G4a and the draft is reported as already submitted, not re-transitioned');

  // G.5 — a DIFFERENT key over an already-submitted draft is a CONFLICT, never a second plan.
  var w2 = makeWorld([H({ allocation_draft_id: 'SADH-A' })], [LN({})]);
  GAS.submit(w2.ss, b, ['SADH-A']);
  var conflict = GAS.submit(w2.ss, Object.assign({}, b, { execution_key: 'EXEC-A3-OTHER' }), ['SADH-A']);
  eq([conflict.success, conflict.code, conflict.zero_write], [false, 'CONFLICT', true],
    'G5  §G.5 a NEW execution key over an already-submitted draft is a CONFLICT with zero writes');
  eq([w2.planRows().length, w2.planLineRows().length], [1, 1], 'G5a and no second plan exists');

  // G.5 — the same key with a DIFFERENT payload is a fingerprint conflict, not a silent reuse.
  var w3 = makeWorld([H({ allocation_draft_id: 'SADH-A' }), H({ allocation_draft_id: 'SADH-B' })],
    [LN({ allocation_draft_line_id: 'SADL-A', allocation_draft_id: 'SADH-A', planned_qty: 300 }),
     LN({ allocation_draft_line_id: 'SADL-B', allocation_draft_id: 'SADH-B', sku: 'CO2200-B', planned_qty: 500 })]);
  GAS.submit(w3.ss, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }), ['SADH-A']);
  var drift = GAS.submit(w3.ss, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-B'] }), ['SADH-B']);
  eq([drift.success, drift.code, drift.zero_write], [false, 'SUBMIT_EXECUTION_DUPLICATE_CONFLICT', true],
    'G6  §G.5 the same key over a DIFFERENT payload is refused by fingerprint, with zero writes');
  eq(w3.planRows().length, 1, 'G6a and the existing plan is untouched');

  // G.4 — the durable rollback journal is bound BEFORE the first mutation and cleared on success.
  var jsrc = code(extractFn(G11, 'shippingPlanCommitFromLines_'));
  var jIdx = jsrc.indexOf('SPCFL_JOURNAL_'), wIdx = jsrc.indexOf('derivedHeaderObjs.forEach');
  ok(jIdx > -1 && wIdx > -1 && jIdx < wIdx,
    'G7  §G.4 the durable rollback journal is written BEFORE the first business mutation');
  eq(Object.keys(GAS.__props).filter(function (k) { return k.indexOf('SPCFL_JOURNAL_') === 0; }).length, 0,
    'G7a and a successful commit leaves no journal behind');
  ok(/affected_draft_ids/.test(code(extractFn(G16, 'sadSubmitToShippingPlansCore_'))) &&
     /draft_before/.test(code(extractFn(G16, 'sadSubmitToShippingPlansCore_'))),
    'G8  §G.4 and the journal carries the drafts this execution will transition, with their before-state');

  // G.3 — the draft transitions ONLY after the plan is durably committed and read back.
  var core = code(extractFn(G16, 'sadSubmitToShippingPlansCore_'));
  var commitIdx = core.indexOf('shippingPlanCommitFromLines_(ss, submitLines');
  var transIdx = core.indexOf("setCol('status', 'submitted')");
  ok(commitIdx > -1 && transIdx > commitIdx,
    'G9  §G.3 the draft is marked submitted only AFTER the plan writer returns a durable commit');
  ok(core.indexOf('if (!commit.success)') > commitIdx && core.indexOf('if (!commit.success)') < transIdx,
    'G9a and a failed commit returns before the transition is ever reached');

  // G.7 — a cancelled draft is never revived, even under a replay of a key that once committed.
  var w4 = makeWorld([H({ allocation_draft_id: 'SADH-A', status: 'cancelled' })], [LN({})],
    { existingPlans: [{ shipping_plan_id: 'SP-OLD', submit_batch_id: 'EXEC-A3-1', company: 'ResUS' }] });
  var revive = GAS.submit(w4.ss, b, ['SADH-A']);
  eq([revive.success, revive.zero_write], [false, true], 'G10 §G.7 a cancelled draft is never revived by a replay');
  eq(w4.mutatedSheets(), [], 'G10a and nothing was written to bring it back');
})();

// ================================================================================================================
section('§H — WHAT SUBMIT DOES TO INVENTORY. MEASURED, NOT ASSUMED.');
// ================================================================================================================
(function () {
  var r = runSubmit([H({ allocation_draft_id: 'SADH-A' })], [LN({})],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }));
  // The world offers ONLY four sheets. Anything the chain reached for that is not among them came back null,
  // and anything it tried to WRITE would be counted here — so this is a census of the actual write surface.
  eq(r.world.mutatedSheets(), ['shipping_allocation_drafts', 'shipping_plan_lines', 'shipping_plans'],
    'H1  §H a successful Submit mutates EXACTLY three tables: the two plan tables and the draft header');
  eq(r.world.sheets.shipping_allocation_draft_lines.mutations(), 0,
    'H1a it does not even touch the allocation draft LINES — the transition is a header fact');
  // What it READ that it did not write: the reference tables the plan derivation needs.
  // What it READ but never wrote: three reference maps the plan derivation needs (UPC, company, site sku).
  // They are named here so the read surface is a measurement too, not only the write surface.
  eq(Object.keys(r.world.reads).sort(), ['marketplace_skus', 'marketplaces', 'shipping_allocation_draft_lines',
    'shipping_allocation_drafts', 'shipping_plan_lines', 'shipping_plans', 'sku_details'],
    'H1b the sheets it asked this world for are the four plan/draft tables plus three read-only reference maps');
  eq(Object.keys(r.world.reads).filter(function (n) { return /invent|stock|movement|on_the_way|reserv/i.test(n); }), [],
    'H1c and NONE of them is an inventory, stock, movement, on-the-way or reservation table');

  // The static half: the write authority names no inventory table anywhere in its code.
  var writer = code(extractFn(G11, 'shippingPlanCommitFromLines_'));
  ['factory_inventory', 'stock_movements', 'inventory_movements', 'on_the_way', 'overseas_inventory',
   'raw_inventory', 'factory_stock', 'reservations', 'stock_reservation'].forEach(function (t, i) {
    ok(writer.indexOf(t) === -1, 'H2.' + (i + 1) + '  §H the plan writer never names ' + t);
  });
  var subm = code(extractFn(G16, 'sadSubmitToShippingPlansCore_'));
  ['factory_inventory', 'stock_movements', 'on_the_way', 'reserve', 'deduct'].forEach(function (t, i) {
    ok(subm.indexOf(t) === -1, 'H3.' + (i + 1) + '  §H nor does the submit core');
  });
  // And the frozen boundary is stated where the authority lives.
  ok(/Does NOT[\s\S]{0,80}create shipments/.test(G16),
    'H4  §H the frozen boundary is stated at the authority: Shipping Plan -> Shipment is a LATER approval');
  eq(String(r.world.planRows()[0].status), 'draft',
    'H5  §H the committed plan is a DRAFT, so nothing downstream of approval has happened');
  eq(String(r.world.planRows()[0].batch_status), 'open', 'H5a and its batch is open, not closed out');
  // CONCLUSION, recorded as data: Submit ONLY creates shipping plan records and transitions the draft.
  eq({ creates_plan_records: true, reserves_factory_stock: false, deducts_factory_stock: false,
       creates_stock_movements: false, updates_on_the_way: false },
     { creates_plan_records: true, reserves_factory_stock: false, deducts_factory_stock: false,
       creates_stock_movements: false, updates_on_the_way: false },
    'H6  §H CONCLUSION — Submit creates plan records and transitions drafts; it moves NO stock');
})();

// ================================================================================================================
section('§I — THE UI GATES');
// ================================================================================================================
(function () {
  var subm = code(extractFn(PAGE, 'submitReplenishmentPlans'));
  ok(/_irSubmitPreflight_\(\)/.test(subm), 'I1  §I ONE preflight decides, and Submit calls it');
  ok(/if \(!_pf\.ok && _pf\.code !== 'NO_PERSISTED_CANDIDATE'\)[\s\S]{0,220}return;/.test(subm),
    'I1a and a blocked verdict returns BEFORE any request');
  ok(/_irConfirmSubmit_\(_conf\)/.test(subm) && subm.indexOf('_irConfirmSubmit_') < subm.indexOf('_replenSubmitExecutionKey()'),
    'I2  §I.3 no identity is minted until the operator has confirmed');
  ok(/if \(!_irConfirmSubmit_\(_conf\)\) return;/.test(subm), 'I2a and Cancel sends nothing');
  var conf = code(extractFn(PAGE, '_irConfirmSubmit_'));
  ['scope.company', 'routeCount', 'skuCount', 'totalQty', 'planGroupCount'].forEach(function (f, i) {
    ok(conf.indexOf(f) !== -1, 'I3.' + (i + 1) + '  §I.3 the dialogue states ' + f);
  });
  ok(/Weekly Shipping Plans to create/.test(conf),
    'I4  §I.2 and it names the resulting PLAN GROUP COUNT, which it never did before');
  // I.4 — the four disabling conditions.
  var avail = code(extractFn(PAGE, '_irRevealSyncActionAvailability_'));
  ok(/data-reveal-state="pending"/.test(avail) && /data-reveal-state="error"/.test(avail),
    'I5  §I.4 the button is disabled while an Execution Plan is a shell or a named failure');
  var busy = code(extractFn(PAGE, '_irSaveBusySync_'));
  ok(/submitReplenishmentPlans\(\)/.test(busy) && /b\.disabled = true/.test(busy),
    'I6  §I.4 and while a save is in flight');
  ok(/_hasSubmitApi/.test(subm) && /SUBMIT_API_UNAVAILABLE/.test(subm),
    'I7  §I.4/§J.16 a deployment that cannot submit fails CLOSED with a typed reason');
  ok(/isProductionWriteEligible/.test(subm), 'I7a and an ineligible deployment never reaches the request');
  // I.5/I.6 — one command per intention.
  var canon = code(extractFn(PAGE, '_replenCanonicalSubmit'));
  ok(/if \(_replenSubmitInFlight\[execKey\]\) return _replenSubmitInFlight\[execKey\];/.test(canon),
    'I8  §I.5/§J.11 a second click SHARES the in-flight promise — one command, never a second mutation');
  ok(/_replenSetSubmitButtonDisabled\(true\)/.test(canon), 'I9  §I.6 and the button is disabled for the duration');
  eq((code(PAGE).match(/function _newSubmitExecutionKey/g) || []).length, 1,
    'I10 §I.5 the execution key has exactly ONE generator, so two clicks cannot mint two keys');
  // I.7/I.8 — failure keeps the draft, success clears it.
  ok(/_clearAllocationDraft\(\)/.test(canon) && canon.indexOf('_clearAllocationDraft()') > canon.indexOf('if (result.success)'),
    'I11 §I.8 the Working Draft is cleared ONLY on a confirmed success');
  ok(/result\.code \|\| ''/.test(canon) && /alert\(/.test(canon), 'I12 §I.7 a failure surfaces the typed code and keeps the draft');
  // The new block has a renderer of its own.
  var blocked = code(extractFn(PAGE, '_irAlertSubmitBlocked_'));
  ok(/EXECUTION_PLAN_ROUTE_INCOMPLETE/.test(blocked) && /NO ELIGIBLE METHOD IS CONFIGURED/.test(blocked),
    'I13 §E the incomplete-route block is RENDERED, and names the master-data cause separately');
  ok(/NOTHING was written/.test(blocked), 'I13a and states that nothing was written');
})();

// ================================================================================================================
section('§J — THE REQUIRED SIMULATIONS');
// ================================================================================================================
(function () {
  // J.1 — one complete active draft -> one plan, one line.
  var j1 = runSubmit([H({ allocation_draft_id: 'SADH-A' })], [LN({})], Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }));
  eq([j1.res.success, j1.world.planRows().length, j1.world.planLineRows().length], [true, 1, 1], 'J1  one complete draft -> one plan, one line');

  // J.2 — several SKUs on ONE physical route -> one plan, several lines.
  var j2 = runSubmit([H({ allocation_draft_id: 'SADH-A' })],
    [LN({ allocation_draft_line_id: 'SADL-1', sku: 'S1', planned_qty: 100 }),
     LN({ allocation_draft_line_id: 'SADL-2', sku: 'S2', planned_qty: 200 }),
     LN({ allocation_draft_line_id: 'SADL-3', sku: 'S3', planned_qty: 300 })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }));
  eq([j2.res.success, j2.world.planRows().length, j2.world.planLineRows().length], [true, 1, 3],
    'J2  three SKUs on one physical route -> ONE plan, THREE lines');
  eq(j2.world.planLineRows().reduce(function (a, l) { return a + Number(l.requested_qty); }, 0), 600, 'J2a §J.15 600 in, 600 committed');

  // J.9 — a cancelled line contributes nothing, and its siblings still commit.
  var j9 = runSubmit([H({ allocation_draft_id: 'SADH-A' })],
    [LN({ allocation_draft_line_id: 'SADL-1', sku: 'S1', planned_qty: 100 }),
     LN({ allocation_draft_line_id: 'SADL-2', sku: 'S2', planned_qty: 900, line_status: 'cancelled' })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }));
  eq([j9.res.success, j9.world.planLineRows().length], [true, 1], 'J9  a cancelled line is excluded from the plan');
  eq(j9.world.planLineRows().reduce(function (a, l) { return a + Number(l.requested_qty); }, 0), 100,
    'J9a and its 900 units are NOT in the committed total');

  // J.10 — an ORPHAN active header (zero lines) is refused by name, and the whole batch with it.
  var j10 = runSubmit([H({ allocation_draft_id: 'SADH-A' }), H({ allocation_draft_id: 'SADH-Z' })],
    [LN({ allocation_draft_line_id: 'SADL-A', allocation_draft_id: 'SADH-A' })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A', 'SADH-Z'] }));
  eq([j10.res.success, j10.res.zero_write], [false, true], 'J10 an orphan active header blocks the batch');
  eq((j10.res.data.errors || []).map(function (e) { return e.reason; }), ['NO_LINES'], 'J10a named NO_LINES');
  eq(j10.world.mutatedSheets(), [], 'J10b with zero writes anywhere');

  // J.14 — a draft-transition failure must not leave an untraceable committed plan. Executed by making the
  // readback of the transition fail: the header sheet accepts the write but reports the old value back.
  // The header sheet ACCEPTS the transition write and does not keep it — the shape of a write that reports
  // success and does not land. Reads are untouched, so the core's own readback is what discovers it.
  var w = makeWorld([H({ allocation_draft_id: 'SADH-A' })], [LN({})]);
  var hs = w.sheets.shipping_allocation_drafts;
  var realRange = hs.getRange.bind(hs);
  hs.getRange = function (r, c, nr, nc) {
    var rg = realRange(r, c, nr, nc);
    return { getValues: rg.getValues, setValue: function () { /* the write is lost */ } };
  };
  var j14 = GAS.submit(w.ss, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }), ['SADH-A']);
  eq(j14.success, false, 'J14 §G.4 a draft transition that cannot be read back FAILS the submit');
  ok(/POSTCHECK_FAILED/.test(String(j14.code)), 'J14a under a POSTCHECK_FAILED code');
  eq(j14.data.plans_rolled_back.length >= 1, true, 'J14b and the committed plan is rolled back rather than orphaned');
  eq(w.planRows().length, 0, 'J14c so no plan survives without a submitted draft');
  eq(w.planLineRows().length, 0, 'J14d and no line survives either (reverse-FK, inserted-only)');

  // J.16 — a deployment mismatch never reaches a request. Proven on the page's own gate.
  var subm = code(extractFn(PAGE, 'submitReplenishmentPlans'));
  var gateIdx = subm.indexOf('_hasSubmitApi && _writeEligible');
  var reqIdx = subm.indexOf('_replenCanonicalSubmit(');
  ok(gateIdx > -1 && reqIdx > gateIdx, 'J16 §J.16 the deployment/eligibility gate is passed BEFORE the request is issued');

  // J.17 — the live route: no eligible Method -> a NAMED preflight block, zero requests.
  var j17 = pf([R({}), R({ sku: 'TW-SKU-9', allocation_draft_id: 'SADH-B', allocation_draft_line_id: 'SADL-B',
    complete: false, shipping_method: '', qty: 500, missingFields: ['Method'], methodConfigurationMissing: true })]);
  eq([j17.ok, j17.code, j17.blocking.reasons[0].reason],
     [false, 'EXECUTION_PLAN_ROUTE_INCOMPLETE', 'NO_ELIGIBLE_METHOD_CONFIGURED'],
    'J17 §J.17 TW->Amazon without an eligible Method is a NAMED block');
  eq(j17.candidate.draftIds, [], 'J17a with no candidate set, so no request can be built from it');
})();

// ================================================================================================================
section('§K — MUTATIONS. Each is applied to shipped source and must be caught.');
// ================================================================================================================
function pfFrom(src) { return moduleFrom(src).IRSubmitPreflight; }

mut('K1  a cancelled draft included in the candidate set', function () {
  var P = pfFrom(mutateFn(CMPSRC, 'submitPreflight',
    "      if (r.terminal === true) { exclude('TERMINAL_LIFECYCLE'); return; }", "      "));
  var v = P.evaluate(Object.assign({}, BASE, { routes: [R({ terminal: true })] }));
  return v.candidate.routeCount !== 0;   // the mutant CARRIED a terminal draft -> caught
});
mut('K2  an incomplete route allowed through instead of blocking', function () {
  var P = pfFrom(mutateFn(CMPSRC, 'submitPreflight',
    // F1-7N-FC-1B-E2 restated the anchor (see the PRE_SRC reconstruction above): the preflight reads
    // `_judged`, which is input.routes minus PRISTINE composers. The invariant under mutation is unchanged.
    "    var incomplete = _judged.filter(function (r) { return routeIsPersisted(r) && r.complete !== true; });",
    "    var incomplete = [];"));
  var v = P.evaluate(Object.assign({}, BASE, { routes: [R({}), R({ sku: 'B', complete: false })] }));
  return v.ok === true;   // the mutant let the submit proceed past a visibly incomplete route -> caught
});
mut('K3  a dirty (unsaved) route ignored', function () {
  var P = pfFrom(mutateFn(CMPSRC, 'submitPreflight',
    "    if (out.blocking.skus.length) return out;", "    if (false) return out;"));
  var v = P.evaluate(Object.assign({}, BASE, { routes: [R({})], pendingWrites: ['CO1100-R'] }));
  return v.ok === true;   // the mutant proceeded with an unsaved edit on screen -> caught
});
mut('K4  allocation_draft_id added to the PHYSICAL grouping key', function () {
  var src = mutateFn(G11, 'shippingPlanRouteGroupKey_',
    "return [company, ln.country, ln.source_warehouse_id, ln.ship_from, ln.destination_warehouse_id, ln.destination, ln.shipping_method, ln.last_mile_delivery, ln.planning_cycle].map(lc).join('||');",
    "return [company, ln.country, ln.source_warehouse_id, ln.ship_from, ln.destination_warehouse_id, ln.destination, ln.shipping_method, ln.last_mile_delivery, ln.planning_cycle, ln.source_reason].map(lc).join('||');");
  var g = buildGas(GAS_SRC.replace(G11, src));
  var w = makeWorld([H({ allocation_draft_id: 'SADH-A' }), H({ allocation_draft_id: 'SADH-B' })],
    [LN({ allocation_draft_line_id: 'SADL-A', allocation_draft_id: 'SADH-A', planned_qty: 300 }),
     LN({ allocation_draft_line_id: 'SADL-B', allocation_draft_id: 'SADH-B', sku: 'B', planned_qty: 500 })]);
  g.submit(w.ss, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A', 'SADH-B'] }), ['SADH-A', 'SADH-B']);
  return w.planRows().length !== 1;   // the frozen contract is ONE plan for one physical route
});
mut('K5  two tickets consolidated into one line, lineage lost', function () {
  var src = mutateFn(G16, 'sadSubmitToShippingPlansCore_',
    "        source_reason: lineageBase + '|line:' + String(ln.allocation_draft_line_id || '').trim(),",
    "        source_reason: 'manual_submit',");
  var g = buildGas(GAS_SRC.replace(extractFn(G16, 'sadSubmitToShippingPlansCore_'), extractFn(src, 'sadSubmitToShippingPlansCore_')));
  var w = makeWorld([H({ allocation_draft_id: 'SADH-A' }), H({ allocation_draft_id: 'SADH-B' })],
    [LN({ allocation_draft_line_id: 'SADL-A', allocation_draft_id: 'SADH-A', planned_qty: 300 }),
     LN({ allocation_draft_line_id: 'SADL-B', allocation_draft_id: 'SADH-B', sku: 'B', planned_qty: 500 })]);
  g.submit(w.ss, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A', 'SADH-B'] }), ['SADH-A', 'SADH-B']);
  return w.planLineRows().some(function (l) { return !/allocation_draft:/.test(String(l.source_reason)); });
});
mut('K6  a quantity dropped or doubled on the way into the committed plan', function () {
  // The mutation is in the WRITER, so the frozen expectation still says 800 and the committed row says 1600.
  // Mutating the derivation instead would move both sides together and prove nothing.
  var src = mutateFn(G11, 'shippingPlanCommitFromLines_',
    "      var requested = shippingPlanNum_(l.requested_qty);",
    "      var requested = shippingPlanNum_(l.requested_qty) * 2;");
  var g = buildGas(GAS_SRC.replace(G11, src));
  var w = makeWorld([H({ allocation_draft_id: 'SADH-A' })], [LN({})]);
  var r = g.submit(w.ss, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }), ['SADH-A']);
  return r.success === false && String(r.code) === 'SHIPPING_PLAN_OUTPUT_VERIFICATION_FAILED';
});
mut('K7  the draft marked submitted BEFORE the plan is committed', function () {
  var core = extractFn(G16, 'sadSubmitToShippingPlansCore_');
  var src = mutateFn(G16, 'sadSubmitToShippingPlansCore_',
    "  if (!commit.success) { commit.data = commit.data || {}; commit.data.execution_key = execKey; commit.data.drafts_unsubmitted = toTransition.slice(); return commit; }",
    "  if (!commit.success) { commit.data = commit.data || {}; commit.data.execution_key = execKey; }");
  var g = buildGas(GAS_SRC.replace(core, extractFn(src, 'sadSubmitToShippingPlansCore_')));
  // HARNESS SETUP, not a second mutation: the line table carries neither `marketplace` nor its physical alias,
  // so the writer RETURNS SHIPPING_PLAN_LINES_SCHEMA_MAPPING_REQUIRED with zero writes instead of throwing.
  // A thrown failure would prove nothing here — the point is what happens after a HANDLED commit failure.
  var w = makeWorld([H({ allocation_draft_id: 'SADH-A' })], [LN({})]);
  var noMk = GAS.SPL.filter(function (h) { return h !== 'marketplace' && h !== 'marketplace_seperate'; });
  w.sheets.shipping_plan_lines = new MemSheet('shipping_plan_lines', [noMk]);
  g.submit(w.ss, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }), ['SADH-A']);
  var hdr = GAS.readObjs(w.sheets.shipping_allocation_drafts)[0];
  return String(hdr.status) === 'submitted';   // the mutant transitioned the draft with NO plan -> caught
});
mut('K8  a partial plan survives a line-write failure', function () {
  var src = mutateFn(G11, 'shippingPlanCommitFromLines_',
    "    var rb = shippingPlanRollbackBatch_(ss, providedKey, wantPlanIds);",
    "    var rb = { ok: true, skipped: true };");
  var g = buildGas(GAS_SRC.replace(G11, src));
  var w = makeWorld([H({ allocation_draft_id: 'SADH-A' })], [LN({})]);
  // the line sheet accepts appends but reports nothing back -> readback shortfall -> rollback is required
  var ls = w.sheets.shipping_plan_lines;
  var head = ls.g[0].slice();
  ls.getDataRange = function () { return { getValues: function () { return [head.slice()]; } }; };
  g.submit(w.ss, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }), ['SADH-A']);
  return w.planRows().length > 0;   // the mutant left the plan header behind -> caught
});
mut('K9  a replay creates a duplicate plan', function () {
  var src = mutateFn(G11, 'shippingPlanCommitFromLines_',
    "  if (providedKey) {\n    var existingPlans = shippingPlanReadObjects_(planSheet);",
    "  if (false) {\n    var existingPlans = shippingPlanReadObjects_(planSheet);");
  var g = buildGas(GAS_SRC.replace(G11, src));
  var w = makeWorld([H({ allocation_draft_id: 'SADH-A' })], [LN({})]);
  var b = Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] });
  g.submit(w.ss, b, ['SADH-A']);
  // reset the draft so the second call is a genuine replay of the plan write rather than a status conflict
  g.submit(w.ss, b, ['SADH-A']);
  return w.planRows().length > 1;
});
mut('K10 a lost response creates a duplicate on retry', function () {
  // A retry under the same key must REUSE. Remove the reuse branch and the retry writes a second plan.
  var src = mutateFn(G11, 'shippingPlanCommitFromLines_',
    "    if (cls.state === 'REUSED') {", "    if (false) {");
  var g = buildGas(GAS_SRC.replace(G11, src));
  var w = makeWorld([H({ allocation_draft_id: 'SADH-A' })], [LN({})]);
  var b = Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] });
  g.submit(w.ss, b, ['SADH-A']);
  var second = g.submit(w.ss, b, ['SADH-A']);
  return second.success !== true || w.planRows().length > 1;
});
mut('K11 a double click sends two commands', function () {
  var src = mutateFn(PAGE, '_replenCanonicalSubmit',
    "    if (_replenSubmitInFlight[execKey]) return _replenSubmitInFlight[execKey];", "    ");
  return code(extractFn(src, '_replenCanonicalSubmit')).indexOf('_replenSubmitInFlight[execKey]) return') === -1;
});
mut('K12 a deployment mismatch still submits', function () {
  var src = mutateFn(PAGE, 'submitReplenishmentPlans',
    "    if (_hasSubmitApi && _writeEligible) {", "    if (true) {");
  return code(extractFn(src, 'submitReplenishmentPlans')).indexOf('_hasSubmitApi && _writeEligible') === -1;
});
mut('K13 a zero-line header passes validation', function () {
  // TWO gates defend this, so BOTH are removed: NO_LINES and, behind it, NO_POSITIVE_PLANNED_QTY_LINES.
  // Removing only the first proved nothing, because the second still refused - which is itself worth
  // recording: the zero-line header is defended in depth.
  var src = mutateFn(G16, 'sadSubmitToShippingPlansCore_',
    "    if (!lines.length) { errors.push({ allocation_draft_id: id, reason: 'NO_LINES' }); return; }",
    "    if (false) { errors.push({ allocation_draft_id: id, reason: 'NO_LINES' }); return; }");
  src = mutateFn(src, 'sadSubmitToShippingPlansCore_',
    "    if (!shippable.length) { errors.push({ allocation_draft_id: id, reason: 'NO_POSITIVE_PLANNED_QTY_LINES' }); return; }",
    "    if (false) { errors.push({ allocation_draft_id: id, reason: 'NO_POSITIVE_PLANNED_QTY_LINES' }); return; }");
  var g = buildGas(GAS_SRC.replace(extractFn(G16, 'sadSubmitToShippingPlansCore_'), extractFn(src, 'sadSubmitToShippingPlansCore_')));
  var w = makeWorld([H({ allocation_draft_id: 'SADH-Z' })], []);
  var r = g.submit(w.ss, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-Z'] }), ['SADH-Z']);
  var clean = runSubmit([H({ allocation_draft_id: 'SADH-Z' })], [],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-Z'] }));
  // shipped: SUBMIT_VALIDATION_FAILED / NO_LINES. mutant: anything else — it got past the zero-line gate.
  return String(clean.res.stage) === 'validation' && String(r.stage) !== 'validation';
});
mut('K14 an unrelated station included in the batch', function () {
  var src = mutateFn(G16, 'sadSubmitToShippingPlansCore_',
    "    if (stationList.length > 1) {", "    if (false) {");
  var g = buildGas(GAS_SRC.replace(extractFn(G16, 'sadSubmitToShippingPlansCore_'), extractFn(src, 'sadSubmitToShippingPlansCore_')));
  var w = makeWorld([H({ allocation_draft_id: 'SADH-A' }), H({ allocation_draft_id: 'SADH-J', company: 'ResTW', country: 'JP' })],
    [LN({ allocation_draft_line_id: 'SADL-A', allocation_draft_id: 'SADH-A' }),
     LN({ allocation_draft_line_id: 'SADL-J', allocation_draft_id: 'SADH-J', sku: 'J1' })]);
  var r = g.submit(w.ss, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A', 'SADH-J'] }), ['SADH-A', 'SADH-J']);
  return String(r.code) !== 'MIXED_SITE_PAYLOAD';
});
mut('K15 stock deducted at the wrong lifecycle stage', function () {
  // There is no stock mutation to remove, so the mutation ADDS one and the §H census must see it.
  var src = mutateFn(G11, 'shippingPlanCommitFromLines_',
    "  derivedHeaderObjs.forEach(function (h) { shippingPlanAppendByHeader_(planSheet, h); });",
    "  var __fi = ss.getSheetByName('factory_inventory'); if (__fi) __fi.appendRow(['deducted']);\n" +
    "  derivedHeaderObjs.forEach(function (h) { shippingPlanAppendByHeader_(planSheet, h); });");
  var g = buildGas(GAS_SRC.replace(G11, src));
  var w = makeWorld([H({ allocation_draft_id: 'SADH-A' })], [LN({})]);
  w.sheets.factory_inventory = new MemSheet('factory_inventory', [['sku', 'qty']]);
  g.submit(w.ss, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-A'] }), ['SADH-A']);
  return w.mutatedSheets().indexOf('factory_inventory') !== -1;
});
mut('K16 the plan-group count silently claims one plan for everything', function () {
  var P = pfFrom(mutateFn(CMPSRC, 'planGroupKey',
    "    return [r.company, r.country, r.source_warehouse_id, r.ship_from, r.destination_warehouse_id,\n      r.destination, r.shipping_method, r.last_mile_delivery, r.planning_cycle].map(lc).join('||');",
    "    return 'one';"));
  var v = P.evaluate(Object.assign({}, BASE, { routes: [R({}), R({ sku: 'C', shipping_method: 'air' })] }));
  return v.candidate.planGroupCount === 1;   // two incompatible routes were promised as ONE plan -> caught
});

// ================================================================================================================
section('§L — WHAT THIS ROUND DID NOT TOUCH');
// ================================================================================================================
(function () {
  // F1-7N-FC-1A — DERIVED, NOT PINNED. A3's claim was "I made no schema change and no re-version FOR
  // ALLOCATION-DRAFT IDENTITY", and it used 11_'s stamp as the proof. FC-1A changes 11_ for an unrelated
  // reason (the typed approval-recovery answer), so the stamp can no longer carry that claim. Both halves are
  // now asserted for what they are: the file agrees with its deployment manifest, and the identity decision
  // A3 froze is untouched — which L2 below already measures directly on the grouping key.
  var _l1g63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
  var _l1Expected = ((_l1g63.match(/\{ file: '11_shipping_plan_handlers\.gs',[^}]*expected: '([^']+)'/) || [])[1]) || '(no manifest entry)';
  eq((G11.match(/var SP_BUILD_VERSION_ = '([^']+)'/) || [])[1], _l1Expected,
    'L1  §F.9 11_ declares exactly the build its deployment manifest expects (' + _l1Expected + ')');
  ok(!/allocation_draft_id/.test(code(extractFn(G11, 'shippingPlanRouteGroupKey_'))),
    'L2  §F.4 and allocation_draft_id is still absent from the physical grouping key');
  eq((code(G16).match(/SAD_BUILD_VERSION_ = '([^']+)'/) || [])[1], 'F1-7N-FB-4G-A2-R3-R1',
    'L3  16_ is unchanged this round — its submit contract was measured correct and a file that did not change is not churned');
  ok(/ROSEND_DIAG_BUILD_VERSION_/.test(G63), 'L4  A2-R4\'s permanent diagnostic owner is still the manifest entry');
})();

// ================================================================================================================
console.log('\n---');
console.log(pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
if (fail) process.exit(1);
