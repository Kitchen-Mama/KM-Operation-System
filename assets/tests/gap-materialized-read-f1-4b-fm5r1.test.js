// Kitchen Mama Operation System — Materialized Gap READ cutover (F1-4B-FM5-R1).
// Run: node assets/tests/gap-materialized-read-f1-4b-fm5r1.test.js
// -----------------------------------------------------------------------------
// Proves the READ cutover: (server) bounded scope reads of inventory_replenishment_gap / order_planning_gap return
// stored rows verbatim (zero stays 0; blank stays blank); (Inventory frontend) the expanded card renders D18/D30/
// D45/D90 from the STORED row via the frozen outlook renderer with NO live recommendation.workspace.get on expand,
// valid-zero + missing preserved, NOT_CALCULATED honest, manual recalc invalidates+refetches; (Order Planning
// frontend) the expanded row reads T1–T4 gap/suggested from the STORED row (no getWorkspace), manual Order Qty
// cells untouched; and neither product reuses the other's formula. Server .gs eval'd with stubs; page blocks eval'd.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GAPSRC = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var INVJS = read('js/pages/inventory-replenishment.js');
var ROJS = read('js/pages/request-order.js');
var INVCSS = read('css/pages/inventory-replenishment.css');
var ROCSS = read('css/pages/request-order.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function tick() { return Promise.resolve().then(function () {}).then(function () {}).then(function () {}); }

// ========================= SERVER READ (43_) =========================
section('SERVER · bounded scope read returns stored rows verbatim');
var lastReq = null;
var GAP = (new Function('__setReq',
  'var prodExpectedDbId_=function(){return "DB-1";};var prodAssertDbTarget_=function(){return true;};'
  + 'var prodSchemaError_=function(t){var e=new Error(t);e.safetyToken=t;return e;};'
  + 'var Utilities={formatDate:function(){return "2026-08-07 12:00:00";}};var Session={getScriptTimeZone:function(){return "UTC";}};'
  + 'var SpreadsheetApp={openById:function(){return null;}};var handleRecommendationWorkspaceGet_=function(){return {success:false};};'
  + 'var recommendationWorkspaceDefaultIo_=function(){return {};};'
  + 'var prodRequireSheet_=function(ss,name){__setReq(name);return ss.getSheetByName(name);};'
  + GAPSRC + '\nreturn { handleGetInventoryReplenishmentGap_:handleGetInventoryReplenishmentGap_, handleGetOrderPlanningGap_:handleGetOrderPlanningGap_, INV_GAP_HEADERS_:INV_GAP_HEADERS_, OP_GAP_HEADERS_:OP_GAP_HEADERS_ };'))(function (n) { lastReq = n; });

function sheetFrom(headers, rows) {
  return { getName: function () { return '(s)'; }, getLastColumn: function () { return headers.length; }, getLastRow: function () { return rows.length + 1; },
    getDataRange: function () { return { getValues: function () { return [headers.slice()].concat(rows.map(function (r) { return r.slice(); })); } }; },
    getRange: function (r, c, nr, nc) { return { getValues: function () { return r === 1 ? [headers.slice()] : rows.slice(r - 2, r - 2 + nr); } }; } };
}
function ioWith(sheetsByName) { return { now: function () { return 0; }, tz: function () { return 'UTC'; }, openTarget: function () { return { getSheetByName: function (n) { return sheetsByName[n] || null; } }; } }; }
// inventory rows: one READY (valid-zero D18) + one BLOCKED (blank qty) + one other-scope row
var INVH = GAP.INV_GAP_HEADERS_;
function invRow(vals) { return INVH.map(function (h) { return vals[h] === undefined ? '' : vals[h]; }); }
var invRows = [
  invRow({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'READY', calculation_date: '2026-08-07', d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 120, d30_suggested_qty: 120, d45_gap_qty: 600, d45_suggested_qty: 600, d90_gap_qty: 1200, d90_suggested_qty: 1200, note: 'Shortage within 30 days', calculated_at: '2026-08-07 12:00:00', updated_at: '2026-08-07 12:00:00' }),
  invRow({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO2000-R', calculation_status: 'BLOCKED', calculation_date: '2026-08-07', d18_gap_qty: '', d18_suggested_qty: '', note: 'MARKETPLACE_STOCK_MISSING', calculated_at: '2026-08-07 12:00:00' }),
  invRow({ company: 'KM', country: 'CA', marketplace: 'AMAZON_CA', sku: 'CO1100-R', calculation_status: 'READY', d18_gap_qty: 5 })
];
var invEnv = GAP.handleGetInventoryReplenishmentGap_({ payload: { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' } } }, ioWith({ inventory_replenishment_gap: sheetFrom(INVH, invRows) }));
ok(invEnv.success === true, 'SRV1 inventory read success');
eq(invEnv.data.rows.length, 2, 'SRV2 scope filter → only US/AMAZON_US rows (CA excluded)');
eq([invEnv.data.rows[0].d18_gap_qty, invEnv.data.rows[0].d30_gap_qty], [0, 120], 'SRV3 stored values verbatim; valid zero stays 0');
eq([invEnv.data.rows[1].calculation_status, invEnv.data.rows[1].d18_gap_qty], ['BLOCKED', ''], 'SRV4 BLOCKED row: qty stays blank (missing != 0)');
eq(lastReq, 'inventory_replenishment_gap', 'SRV5 validated (fail-closed) the inventory gap table only');

var OPH = GAP.OP_GAP_HEADERS_;
function opRow(vals) { return OPH.map(function (h) { return vals[h] === undefined ? '' : vals[h]; }); }
var opRows = [opRow({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'READY', calculation_month: '2026-08', t1_month: '2026-09', t1_gap_qty: 0, t1_suggested_qty: 0, t2_month: '2026-10', t2_gap_qty: 1500, t2_suggested_qty: 1520, t3_month: '2026-11', t3_gap_qty: 7500, t3_suggested_qty: 7520, t4_month: '2026-12', t4_gap_qty: 0, t4_suggested_qty: 0 })];
var opEnv = GAP.handleGetOrderPlanningGap_({ payload: { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R' } } }, ioWith({ order_planning_gap: sheetFrom(OPH, opRows) }));
eq([opEnv.success, opEnv.data.rows.length], [true, 1], 'SRV6 order-planning read success + sku filter');
eq([opEnv.data.rows[0].t2_gap_qty, opEnv.data.rows[0].t2_suggested_qty, opEnv.data.rows[0].t1_gap_qty], [1500, 1520, 0], 'SRV7 T1–T4 stored values verbatim (valid zero preserved)');

section('WIRING · router + KM.DB read endpoints');
ok((ROUTER.match(/inventoryReplenishmentGap\.get/g) || []).length === 1 && (ROUTER.match(/orderPlanningGap\.get/g) || []).length === 1, 'W1 router registers both READ actions once');
ok(/getInventoryReplenishmentGap = function/.test(DBAPI) && /getOrderPlanningGap = function/.test(DBAPI), 'W2 KM.DB exposes both materialized readers');

// ========================= INVENTORY FRONTEND READ CUTOVER =========================
section('INVENTORY · expand reads STORED row (no live getWorkspace), valid zero + missing preserved');
(function () {
  function slice(m1, m2) { var a = INVJS.indexOf(m1), b = INVJS.indexOf(m2); return INVJS.slice(a, b); }
  var IRCTX = slice('// __IRCTX_START__', '// __IRCTX_END__');
  var IRRECO = slice('// __IRRECO_START__', '// __IRRECO_END__');
  global.window = { IRCountry: { matches: function (a, b) { return String(a).trim().toUpperCase() === String(b).trim().toUpperCase(); } } };
  global.document = { getElementById: function () { return null; }, querySelectorAll: function () { return []; } };
  global.AbortController = function () { this.signal = {}; this.abort = function () {}; };
  global.escapeReplenHtml = function (s) { return String(s == null ? '' : s); };
  var _irctxLastContext = null;
  global.getReplenishmentData = function () { return []; };
  global._recSummaryRows = function () { return ''; };
  global.updateReplenRecoContext = function () { return _irctxLastContext; };
  eval(IRCTX); eval(IRRECO);
  var wsCalls = { n: 0 };
  var readCalls = { n: 0 };
  var invReadEnv = { success: true, data: { rows: [
    { sku: 'CO1100-R', calculation_status: 'READY', calculation_date: '2026-08-07', d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 120, d30_suggested_qty: 120, d45_gap_qty: 600, d45_suggested_qty: 600, d90_gap_qty: 1200, d90_suggested_qty: 1200, note: 'Shortage within 30 days', calculated_at: '2026-08-07 12:00:00' }
  ] } };
  global.window.KM = {
    api: { workspaceApiActive: function () { return true; }, getWorkspace: function () { wsCalls.n++; return Promise.resolve({ success: true, data: { lines: [] } }); } },
    DB: { getInventoryReplenishmentGap: function () { readCalls.n++; return Promise.resolve(invReadEnv); } }
  };
  _irctxLastContext = { status: 'READY', company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceId: 'MP1', missing: [], issues: [] };
  return Promise.resolve(loadInventoryGap_()).then(tick).then(function () {
    ok(wsCalls.n === 0, 'INV1 expand/scope load did NOT call live recommendation.workspace.get (READ-ONLY)');
    ok(readCalls.n === 1, 'INV2 one materialized read for the scope');
    var body = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
    ok(/replen-horizon-table--outlook/.test(body) && !/Replenishment Outlook/.test(body) && !/replen-horizon-dest__badge/.test(body), 'INV3 renders the frozen outlook table from the stored row — R4UI: no "Replenishment Outlook" sub-title, no "Materialized" badge in the normal view');
    ok(/18 Days/.test(body) && /90 Days/.test(body), 'INV4 D18–D90 rows present');
    ok(/replen-recsum-table__num">1200</.test(body) && /replen-recsum-table__num">600</.test(body), 'INV5 D45/D90 gap from GAP DB verbatim');
    ok(/replen-recsum-table__num">0</.test(body), 'INV6 valid zero renders 0 (D18)');
    var bodyMissing = _irRecoSummaryCardBody({ sku: 'DOES-NOT-EXIST' });
    ok(/NOT_CALCULATED/.test(bodyMissing), 'INV7 SKU with no stored row → NOT_CALCULATED (never fabricated 0)');
    // manual recalc refresh → refetch
    readCalls.n = 0;
    return Promise.resolve(refreshInventoryGapAfterRecalc_()).then(tick).then(function () {
      ok(readCalls.n === 1, 'INV8 manual recalc refresh re-reads the stored rows (no per-SKU live calc)');
      ok(wsCalls.n === 0, 'INV9 recalc refresh still issues NO live getWorkspace');
    });
  });
})().then(function () {

// ========================= ORDER PLANNING FRONTEND READ CUTOVER =========================
section('ORDER PLANNING · expand reads STORED T1–T4 (no getWorkspace), Order Qty cells untouched');
  var a = ROJS.indexOf('// __OPRECO_START__'), b = ROJS.indexOf('// __OPRECO_END__');
  var OPRECO = ROJS.slice(a, b);
  var ITEM = { sku: 'CO1100', company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
  global._roEsc = function (s) { return String(s == null ? '' : s); };
  global._roRowKey = function (item) { return [item.sku || '', item.company != null ? item.company : '', item.country || '', item.marketplace || ''].join('|'); };
  global._roPanelId = function (k) { return 'ro-expand-' + String(k == null ? '' : k).replace(/[^A-Za-z0-9_-]/g, '-'); };
  var PANEL_ID = global._roPanelId(global._roRowKey(ITEM));
  var cells = {}; ['T1', 'T2', 'T3', 'T4'].forEach(function (t) { cells['gap:' + t] = { innerHTML: '' }; cells['suggested:' + t] = { innerHTML: '' }; cells['demand:' + t] = { innerHTML: '' }; });
  var orderQtyTouched = false;
  var fakePanel = { querySelector: function (sel) { var m = /\[data-ro-(gap|suggested|demand)-tier="(T[1-4])"\]/.exec(sel); if (/order-qty/.test(sel)) { orderQtyTouched = true; } return m ? (cells[m[1] + ':' + m[2]] || null) : null; } };
  global.window = {};
  global.document = { getElementById: function (id) { return id === PANEL_ID ? fakePanel : null; }, querySelector: function () { return null; } };
  global.AbortController = function () { this.signal = {}; this.abort = function () {}; };
  var requestOrderState = { expandedRowKey: global._roRowKey(ITEM), data: [ITEM] };
  global.requestOrderState = requestOrderState;
  eval(OPRECO);
  var wsCalls = { n: 0 }, readCalls = { n: 0 };
  var opReadEnv = { success: true, data: { rows: [{ sku: 'CO1100', calculation_status: 'READY', calculation_month: '2026-08', t1_month: '2026-09', t1_gap_qty: 0, t1_suggested_qty: 0, t2_month: '2026-10', t2_gap_qty: 1500, t2_suggested_qty: 1520, t3_month: '2026-11', t3_gap_qty: 7500, t3_suggested_qty: 7520, t4_month: '2026-12', t4_gap_qty: 0, t4_suggested_qty: 0 }] } };
  global.window.KM = {
    api: { workspaceApiActive: function () { return true; }, getWorkspace: function () { wsCalls.n++; return Promise.resolve({ success: true, data: { lines: [] } }); } },
    DB: { getOrderPlanningGap: function () { readCalls.n++; return Promise.resolve(opReadEnv); } }
  };
  return Promise.resolve(_opLoadRecommendation(ITEM)).then(tick).then(function () {
    ok(wsCalls.n === 0, 'OP1 expand did NOT call live recommendation.workspace.get (READ-ONLY)');
    ok(readCalls.n === 1, 'OP2 one materialized order-planning read');
    var proj = _opRecoPrimaryProjection();
    ok(proj && proj.length === 4, 'OP3 T1–T4 monthlyProjection synthesized from the stored row');
    var t2 = null, t1 = null; proj.forEach(function (p) { if (p.tier === 'T2') t2 = p; if (p.tier === 'T1') t1 = p; });
    eq([t2.remainingGapQty, t2.suggestedOrderQty, t2.month], [1500, 1520, '2026-10'], 'OP4 T2 gap/suggested/month from GAP DB verbatim');
    eq([t1.remainingGapQty, t1.suggestedOrderQty], [0, 0], 'OP5 T1 valid zero preserved (0, not —)');
    ok(cells['gap:T2'].innerHTML.indexOf('1,500') >= 0 || cells['gap:T2'].innerHTML.indexOf('1500') >= 0, 'OP6 Demand Summary Gap cell patched from stored T2 gap');
    ok(orderQtyTouched === false, 'OP7 manual Order Qty cells never touched by the materialized patch');
  });

}).then(function () {

section('NO CONVERGENCE + CONTAINMENT');
  ok(/getInventoryReplenishmentGap/.test(INVJS) && !/getOrderPlanningGap/.test(INVJS), 'NC1 Inventory reads ONLY the inventory gap table (no Order Planning source)');
  ok(/getOrderPlanningGap/.test(ROJS) && !/getInventoryReplenishmentGap/.test(ROJS), 'NC2 Order Planning reads ONLY the order-planning gap table');
  var INVMAT = INVJS.slice(INVJS.indexOf('function _irMatToLine'), INVJS.indexOf('function _irMatMetaHtml'));
  ok(!/Math\.(ceil|floor|round)/.test(INVMAT.replace(/\/\/[^\n]*/g, '')), 'NC3 Inventory materialized mapping has no gap/carton math');
  ok(/#request-order-section \.op-reco__table\s*\{[^}]*overflow-x:\s*auto/.test(ROCSS), 'CT1 Order Planning result table scrolls internally (containment)');
  ok(/\.replen-recsum-ws__scroll\s*\{[^}]*overflow-x:\s*auto/.test(INVCSS), 'CT2 Inventory diagnostics scroll internally (containment)');

  console.log('\n----------------------------------------');
  console.log('MATERIALIZED READ CUTOVER (F1-4B-FM5-R1): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
}).catch(function (e) { console.error('ERROR', e && e.stack || e); process.exitCode = 1; });
