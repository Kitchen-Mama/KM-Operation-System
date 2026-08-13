// Kitchen Mama Operation System — F1-7E-PREREQ-2-FC-SUMMARY-RAW-FORECAST-OWNER-R1
// GOLD-STANDARD equivalence: the NEW backend 53_ fcrBuild_ (basicFcRawT3Qty + specialEventFcRawQty per SKU) MUST equal
// the CURRENT AI-Plan browser facts — request-order.js basicT3() + _roSpecialEventsTotal() — for the same frozen
// planning-cycle anchor. We run the ACTUAL browser logic (extracted) over records from the ACTUAL db-api normalizers
// with a FROZEN _roTpeNow anchor == planning_cycle, and the ACTUAL backend over raw rows, and assert equality
// (browser null == backend 0). Transport migration: BEFORE FACT == AFTER FACT; PDR-2 time anchor = planning_cycle.
// Run: node assets/tests/api-fc-summary-raw-owner-f1-7e-prereq2-r1.test.js
// NOTE: no 'use strict' — extracted functions bind into module scope via direct eval.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}
function extractVar(src, re) { var m = src.match(re); if (!m) throw new Error('var not found: ' + re); return m[0]; }

var GS53 = read('specs/active/apps-script/53_api_v1_fc_summary_raw_owner.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var ROJS = read('js/pages/request-order.js');

// ---- eval the NEW backend (whole 53_; impure prod*/SpreadsheetApp refs live inside fcrDefaultIo_, only when CALLED) ----
eval(GS53);

// ---- eval the REAL db-api FC normalizers (the browser's input path) ----
eval(extractFn(DBAPI, '_fcParseEventPeriodDates'));
eval(extractFn(DBAPI, 'normalizeFcRegularForecastRecord'));
eval(extractFn(DBAPI, 'normalizeFcSpecialEventRecord'));

// ---- eval the REAL browser semantics from request-order.js (frozen anchor via a stubbed _roTpeNow) ----
var _roTpeNow;                 // FROZEN per fixture (NOT the real clock-based one) — anchor == planning_cycle
var fcByKey, next3, NORM_EVENTS;
var window = { KM: { DB: { getFcSpecialEvents: function () { return NORM_EVENTS; } } } };   // _roScopedActiveEvents source
eval(extractVar(ROJS, /var RO_MONTH_KEYS = \[[^\]]*\];/));
eval(extractVar(ROJS, /var _RO_EVT_DEAD_SET = \{[^}]*\};/));
eval(extractFn(ROJS, '_roUpper'));
eval(extractFn(ROJS, '_roLower'));
eval(extractFn(ROJS, '_roIsActiveFlag'));
eval(extractFn(ROJS, '_roMonthWindow'));
eval(extractFn(ROJS, '_roNextMonths'));
eval(extractFn(ROJS, '_roYmKey'));
eval(extractFn(ROJS, '_roParseDate'));
eval(extractFn(ROJS, '_roEventPrepMonth'));
eval(extractFn(ROJS, '_roEventScopeMatch'));
eval(extractFn(ROJS, '_roScopedActiveEvents'));
eval(extractFn(ROJS, '_roSpecialEventsTotal'));
eval(extractFn(ROJS, 'basicT3'));   // nested — closes over fcByKey + next3 (defined in this scope)

function cycleToNow(cycle) { var m = cycle.match(/^RECO-(\d{4})-(\d{2})$/); return { year: parseInt(m[1], 10), monthIdx: parseInt(m[2], 10) - 1, day: 15 }; }

// The equivalence harness: OLD browser basicT3/_roSpecialEventsTotal (frozen anchor) vs NEW backend, on the SAME raw rows.
function runEquiv(label, cycle, rawFc, rawEvents, scope, skus) {
  _roTpeNow = function () { return cycleToNow(cycle); };                 // freeze the browser window to the cycle month
  var normFc = rawFc.map(normalizeFcRegularForecastRecord);
  NORM_EVENTS = rawEvents.map(normalizeFcSpecialEventRecord);
  next3 = _roNextMonths(3);
  fcByKey = {}; normFc.forEach(function (r) { var k = _roUpper(r.sku) + '|' + _roUpper(r.country) + '|' + _roLower(r.marketplace); (fcByKey[k] = fcByKey[k] || []).push(r); });
  var vm = fcrBuild_({ fc_regular_forecast: rawFc, fc_special_events: rawEvents }, { planning_cycle: cycle, scope: scope, skus: skus });
  var newBySku = {}; vm.items.forEach(function (it) { newBySku[String(it.sku).toUpperCase()] = it; });
  skus.forEach(function (sku) {
    var oldBasic = basicT3(sku, scope.country || '', scope.marketplace || '');
    var oldSpecial = _roSpecialEventsTotal({ sku: sku, company: scope.company || '', country: scope.country || '', marketplace: scope.marketplace || '' });
    var got = newBySku[String(sku).toUpperCase()];
    eq(got.basicFcRawT3Qty, (oldBasic === null ? 0 : oldBasic), label + ' :: BASIC ' + sku + ' (browser ' + JSON.stringify(oldBasic) + ')');
    eq(got.specialEventFcRawQty, (oldSpecial === null ? 0 : oldSpecial), label + ' :: SPECIAL ' + sku + ' (browser ' + JSON.stringify(oldSpecial) + ')');
  });
  return vm;
}

// ---- planning_cycle window derivation (PDR-2) + year crossing ----
console.log('\n== planning_cycle N+1..N+3 window (year crossing) ==');
eq(fcrWindow_(fcrParseCycle_('RECO-2026-08')).map(function (m) { return m.label; }), ['2026-09', '2026-10', '2026-11'], 'RECO-2026-08 -> Sep/Oct/Nov 2026');
eq(fcrWindow_(fcrParseCycle_('RECO-2026-10')).map(function (m) { return m.label; }), ['2026-11', '2026-12', '2027-01'], 'RECO-2026-10 -> Nov 2026 / Dec 2026 / Jan 2027');
eq(fcrWindow_(fcrParseCycle_('RECO-2026-11')).map(function (m) { return m.label; }), ['2026-12', '2027-01', '2027-02'], 'RECO-2026-11 -> Dec 2026 / Jan / Feb 2027');
eq(fcrWindow_(fcrParseCycle_('RECO-2026-12')).map(function (m) { return m.label; }), ['2027-01', '2027-02', '2027-03'], 'RECO-2026-12 -> Jan / Feb / Mar 2027');
var badCycle = false; try { fcrParseCycle_('2026-08'); } catch (e) { badCycle = (e.validationCode === 'VALIDATION_FAILED'); }
ok(badCycle, 'malformed planning_cycle -> VALIDATION_FAILED (required + fail-closed; never silent server clock)');

// ---- BEFORE == AFTER equivalence fixtures ----
console.log('\n== BEFORE == AFTER equivalence (basic + special) ==');
// 1 one SKU; 5 regular only; 16 month-name normalization; year in row selection
runEquiv('regular-only single SKU', 'RECO-2026-08', [
  { sku: 'GA0450', country: 'US', marketplace: 'amazon', year: 2026, sep: 100, oct: 200, nov: 50, dec: 999 },
  { sku: 'GA0450', country: 'US', marketplace: 'amazon', year: 2025, sep: 7, oct: 7, nov: 7 }     // wrong year -> not picked for 2026 window
], [], { country: 'US', marketplace: 'amazon', company: 'KM' }, ['GA0450']);   // basic = 100+200+50 = 350

// 2 multiple SKUs; 4 multiple sites; 14 blank country/marketplace; 3 one site
runEquiv('multi-SKU + strict site scope', 'RECO-2026-08', [
  { sku: 'S1', country: 'US', marketplace: 'amazon', year: 2026, sep: 10, oct: 20, nov: 30 },
  { sku: 'S1', country: 'CA', marketplace: 'amazon', year: 2026, sep: 500, oct: 500, nov: 500 },   // different country -> excluded for US scope
  { sku: 'S2', country: 'US', marketplace: 'amazon', year: 2026, sep: 1, oct: 2, nov: 3 }
], [], { country: 'US', marketplace: 'amazon' }, ['S1', 'S2', 'GHOST']);   // S1=60, S2=6, GHOST=0

// 6 special only; 11 exact prep-month boundary; 12 event exactly outside; 17 multiple events; 18 100% qty
// window RECO-2026-08 -> Sep/Oct/Nov 2026. prep = start-30d. Sep prep: start ~ Oct 1 2026 (Oct1-30d=Sep1). Nov prep: start ~ Dec 1.
runEquiv('special-only + boundary + outside', 'RECO-2026-08', [], [
  { sku: 'EV', company: 'KM', country: 'US', marketplace: 'amazon', event_start_date: '2026-10-01', fc_qty: 500, status: 'active' },  // prep 2026-09 IN window -> 500
  { sku: 'EV', company: 'KM', country: 'US', marketplace: 'amazon', event_start_date: '2026-12-15', fc_qty: 700, status: '' },        // prep 2026-11 IN window -> 700
  { sku: 'EV', company: 'KM', country: 'US', marketplace: 'amazon', event_start_date: '2026-09-15', fc_qty: 999, status: 'active' },  // prep 2026-08 OUTSIDE -> excluded
  { sku: 'EV', company: 'KM', country: 'US', marketplace: 'amazon', event_start_date: '2026-10-05', fc_qty: 40, status: 'cancelled' } // dead status -> excluded
], { country: 'US', marketplace: 'amazon', company: 'KM' }, ['EV']);   // special = 500 + 700 = 1200 (100%, each once)

// 7 both present; 15 company behavior on special (company mismatch excluded); scope_type=sku via scope_id
runEquiv('both + company filter + scope_type', 'RECO-2026-08', [
  { sku: 'CO1100-R', country: 'US', marketplace: 'amazon', year: 2026, sep: 80, oct: 0, nov: 20 }
], [
  { scope_type: 'sku', scope_id: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'amazon', event_start_date: '2026-10-10', fc_qty: 300 },  // matches via scope_id
  { sku: 'CO1100-R', company: 'ResTW', country: 'US', marketplace: 'amazon', event_start_date: '2026-10-10', fc_qty: 999 }                          // company ResTW != KM -> excluded
], { country: 'US', marketplace: 'amazon', company: 'KM' }, ['CO1100-R']);   // basic=100, special=300

// 8 zero/missing; 9 invalid numeric; 10 duplicate rows; year crossing equivalence
runEquiv('zero/invalid/duplicate + year cross', 'RECO-2026-11', [
  { sku: 'YC', country: 'US', marketplace: 'amazon', year: 2026, dec: 11 },                          // Dec 2026 (window month 1)
  { sku: 'YC', country: 'US', marketplace: 'amazon', year: 2027, jan: 'x', feb: 5 },                 // Jan 2027 invalid 'x'->0 ; Feb 2027 = 5
  { sku: 'YC', country: 'US', marketplace: 'amazon', year: 2027, jan: 3, feb: 100 }                  // duplicate 2027 row -> browser picks FIRST 2027 match
], [], { country: 'US', marketplace: 'amazon' }, ['YC', 'NONE']);   // browser: Dec 11 + Jan(first 2027 row 'x'->0) + Feb(first 2027 row 5) = 16 ; NONE=0

// company does NOT participate in BASIC (raw pool) — same basic regardless of scope.company
var vmKM = runEquiv('basic ignores company (KM)', 'RECO-2026-08', [{ sku: 'X', country: 'US', marketplace: 'amazon', year: 2026, sep: 9, oct: 0, nov: 1 }], [], { country: 'US', marketplace: 'amazon', company: 'KM' }, ['X']);
var vmTW = fcrBuild_({ fc_regular_forecast: [{ sku: 'X', country: 'US', marketplace: 'amazon', year: 2026, sep: 9, oct: 0, nov: 1 }], fc_special_events: [] }, { planning_cycle: 'RECO-2026-08', scope: { country: 'US', marketplace: 'amazon', company: 'ResTW' }, skus: ['X'] });
eq(vmKM.items[0].basicFcRawT3Qty, vmTW.items[0].basicFcRawT3Qty, 'BASIC company-independent (KM == ResTW scope) — matches browser key (no company)');

console.log('\n== Target% isolation (19/20) + special-event 100% ==');
// 53_ never reads fc_target_rules / applies Target% — so adding target rules cannot change either raw fact (structural proof)
ok(!/fc_target_rules|target_percentage|targetRate|adjustedRegularFc|planningDemandByMonth/.test(GS53), 'Target% NOT applied: 53_ reads no fc_target_rules and calls no KMPD adjusted/blended demand');
eq(fcrSpecialRawQty_([{ sku: 'A', event_start_date: '2026-10-01', fc_qty: 500 }], { sku: 'A', company: '', country: '', marketplace: '' }, { '2026-09': 1 }), 500, 'special-event counted at 100% (500, never Target%-scaled)');
// basic and special are separate facts — a scope with only regular FC yields special=0, and vice versa
var vmSep = fcrBuild_({ fc_regular_forecast: [{ sku: 'B', country: 'US', marketplace: 'amazon', year: 2026, sep: 12 }], fc_special_events: [] }, { planning_cycle: 'RECO-2026-08', scope: { country: 'US', marketplace: 'amazon' }, skus: ['B'] });
ok(vmSep.items[0].basicFcRawT3Qty === 12 && vmSep.items[0].specialEventFcRawQty === 0, 'basic and special stay separate (regular-only -> special 0, never blended)');

console.log('\n== ZERO / EMPTY / ERROR + missing FC tables ==');
var vmEmpty = fcrBuild_({ fc_regular_forecast: [], fc_special_events: [] }, { planning_cycle: 'RECO-2026-08', scope: {}, skus: ['A', 'B'] });
eq(vmEmpty.items.map(function (i) { return [i.basicFcRawT3Qty, i.specialEventFcRawQty]; }), [[0, 0], [0, 0]], 'no FC rows -> 0/0 per sku (ZERO, not error)');
// io: missing (unprovisioned) FC table -> [] (never SCHEMA_NOT_PROVISIONED) matching browser graceful-empty
var io = fcrDefaultIo_();
eq(io.readTable({ getSheetByName: function () { return null; } }, 'fc_special_events', [], true), [], 'io: missing optional FC table -> [] (graceful-empty, not a throw)');
var specs = {}; FCR_TABLES_.forEach(function (s) { specs[s.name] = s; });
ok(specs['fc_regular_forecast'].optional === true && specs['fc_special_events'].optional === true, 'both FC tables read missing-safe (match browser _opDbCache []-on-missing)');
// orchestrator envelope + error != zero
var eio = { now: function () { return 0; }, nextSeq: function () { return 1; }, openTarget: function () { return {}; }, readTable: function (ss, name) { return name === 'fc_regular_forecast' ? [{ sku: 'Q', country: 'US', marketplace: 'amazon', year: 2026, sep: 5 }] : []; } };
var envOk = handleFcSummaryRawGet_({ payload: { planning_cycle: 'RECO-2026-08', scope: { country: 'US', marketplace: 'amazon' }, skus: ['Q'] } }, eio);
ok(envOk.success === true && envOk.data.items[0].basicFcRawT3Qty === 5 && envOk.meta.workspace === 'fcSummary', 'orchestrator success envelope');
var envErr = handleFcSummaryRawGet_({ payload: { planning_cycle: 'bad', scope: {}, skus: ['Q'] } }, eio);
ok(envErr.success === false && envErr.errors[0].code === 'VALIDATION_FAILED' && envErr.data === null, 'malformed cycle -> ERROR envelope (never converted to zero)');

console.log('\n== source guards + no cutover ==');
var code53 = GS53.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/getOperationDb/.test(code53), '53_ never calls getOperationDb');
ok(!/\.setValue\(|appendRow|insertSheet|deleteRow|\.setValues\(/.test(code53), '53_ writes nothing (read-only)');
ok(!/generateRecommendation|order_planning_gap|slaFifoCompare_|purchase_order_lines|factory_stock/.test(code53), '53_ reads no gap/recommendation/PO/factory tables (no second engine)');
ok(/fc_regular_forecast/.test(GS53) && /fc_special_events/.test(GS53) && !/campaigns|marketplace_skus|sku_details/.test(slice(GS53, 'var FCR_TABLES_', 'var FCR_MONTH_KEYS_')), '53_ table scope = fc_regular_forecast + fc_special_events only');
ok(/action === 'fcSummary\.raw\.get'/.test(ROUTER) && /handleFcSummaryRawGet_\(body\)/.test(ROUTER), 'router dispatches fcSummary.raw.get');
// F1-7G: the broader fcSummary.workspace.get slot now exists (owner 58_) — the 53_ raw owner stays a DISTINCT bounded
// action dispatched to a DIFFERENT handler (it never absorbed the workspace slot).
ok(/action === 'fcSummary\.raw\.get'/.test(ROUTER) && /handleFcSummaryRawGet_\(body\)/.test(ROUTER) &&
   /action === 'fcSummary\.workspace\.get'/.test(ROUTER) && /handleFcSummaryWorkspaceGet_\(body\)/.test(ROUTER) &&
   ROUTER.indexOf('handleFcSummaryRawGet_') !== ROUTER.indexOf('handleFcSummaryWorkspaceGet_'), 'bounded raw action stays DISTINCT from the fcSummary.workspace.get slot (separate handlers)');
// no AI-Plan cutover this round
ok(/function basicT3\(/.test(ROJS) && /function _roSpecialEventsTotal\(/.test(ROJS) && /loadOperationDb\(\{ force: true \}\)/.test(ROJS), 'request-order.js still owns basicT3()/_roSpecialEventsTotal() + broad cache (NO cutover)');
ok(ROJS.indexOf('fcSummary.raw.get') < 0 && ROJS.indexOf('basicFcRawT3Qty') < 0, 'request-order.js does NOT yet consume the new owner (PREREQ-5)');

console.log('\n----------------------------------------');
console.log('API FC SUMMARY RAW OWNER (F1-7E-PREREQ-2-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
