// Kitchen Mama Operation System — F1-7E-PREREQ-4-LEAD-TIME-SCOPED-OWNER-R1
// GOLD-STANDARD equivalence: the NEW backend 55_ ltoBuild_ (leadTimeDays per SKU) MUST equal the CURRENT AI-Plan browser
// fact — request-order.js leadTime() — for the same fixture. We run the ACTUAL browser leadTime() (extracted) over
// records from the ACTUAL db-api normalizer, and the ACTUAL backend over raw rows, asserting exact equality (EMPTY null
// stays null; ZERO 0 stays 0; never conflated). Transport migration: BEFORE FACT == AFTER FACT.
// Run: node assets/tests/api-lead-time-owner-f1-7e-prereq4-r1.test.js
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

var GS55 = read('specs/active/apps-script/55_api_v1_lead_time_owner.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var ROJS = read('js/pages/request-order.js');

// ---- eval the NEW backend (whole 55_; impure prod*/SpreadsheetApp refs live inside ltoDefaultIo_, only when CALLED) ----
eval(GS55);

// ---- eval the REAL db-api supplier_price_list normalizer (the browser's input path) ----
eval(extractFn(DBAPI, 'normalizeSupplierPriceListRecord'));

// ---- eval the REAL browser leadTime() from request-order.js ----
var splBySku;   // leadTime() closes over this (reassigned per fixture)
eval(extractFn(ROJS, '_roUpper'));
eval(extractFn(ROJS, '_roLower'));
eval(extractFn(ROJS, '_roIsActiveFlag'));
eval(extractFn(ROJS, 'leadTime'));   // nested — closes over splBySku

// The equivalence harness: OLD browser leadTime() vs NEW backend, on the SAME raw rows.
function runEquiv(label, rawSpl, scope, skus) {
  var normSpl = rawSpl.map(normalizeSupplierPriceListRecord);
  splBySku = {}; normSpl.forEach(function (r) { (splBySku[_roUpper(r.sku)] = splBySku[_roUpper(r.sku)] || []).push(r); });
  var vm = ltoBuild_({ supplier_price_list: rawSpl }, { scope: scope || {}, skus: skus });
  var newBySku = {}; vm.items.forEach(function (it) { newBySku[String(it.sku).toUpperCase()] = it; });
  skus.forEach(function (sku) {
    var old = leadTime(sku);   // null | number (EMPTY null distinct from ZERO 0)
    var got = newBySku[String(sku).toUpperCase()];
    eq(got.leadTimeDays, old, label + ' :: LEAD ' + sku + ' (browser ' + JSON.stringify(old) + ')');
  });
  return vm;
}

console.log('\n== BEFORE == AFTER equivalence ==');
// 1 one SKU one active; 15 zero lead time distinct from null
runEquiv('single active + zero-vs-null', [
  { sku: 'GA0450', is_active: 'active', effective_from: '2026-01-01', lead_time_days: 30 },
  { sku: 'ZLT', is_active: 'true', effective_from: '2026-01-01', lead_time_days: 0 }     // real 0 -> 0 (NOT null)
], {}, ['GA0450', 'ZLT', 'GHOST']);   // GA0450=30, ZLT=0, GHOST=null (3 unknown SKU)

// 4 duplicate rows same SKU; 11 latest effective_from wins; 5 active + inactive (inactive excluded even if newer)
runEquiv('latest effective_from + active filter', [
  { sku: 'LT', is_active: 'active', effective_from: '2026-01-01', lead_time_days: 10 },
  { sku: 'LT', is_active: 'yes', effective_from: '2026-06-01', lead_time_days: 45 },      // LATEST active -> 45
  { sku: 'LT', is_active: 'inactive', effective_from: '2026-12-01', lead_time_days: 999 } // newer but INACTIVE -> excluded
], {}, ['LT']);   // 45

// 6 multiple suppliers (SKU-only: latest effective_from across suppliers); 7 company IGNORED
runEquiv('multi-supplier + company ignored', [
  { sku: 'MS', supplier_id: 'S1', company: 'KM', is_active: 'active', effective_from: '2026-03-01', lead_time_days: 20 },
  { sku: 'MS', supplier_id: 'S2', company: 'ResTW', is_active: 'active', effective_from: '2026-09-01', lead_time_days: 60 }  // latest -> 60 regardless of supplier/company
], { company: 'KM', supplier_id: 'S1' }, ['MS']);   // 60 (scope.company/supplier do NOT filter)

// prove company scope does NOT change the fact
var vmKM = runEquiv('company-independence KM', [{ sku: 'CI', company: 'KM', is_active: 'active', effective_from: '2026-05-01', lead_time_days: 33 }], { company: 'KM' }, ['CI']);
var vmTW = ltoBuild_({ supplier_price_list: [{ sku: 'CI', company: 'KM', is_active: 'active', effective_from: '2026-05-01', lead_time_days: 33 }] }, { scope: { company: 'ResTW' }, skus: ['CI'] });
eq(vmKM.items[0].leadTimeDays, vmTW.items[0].leadTimeDays, 'lead time company-independent (KM scope == ResTW scope) — leadTime() takes only sku');

// 12 same-date tie -> stable (first active row in sheet order wins); 2 multi-SKU
runEquiv('tie same effective_from (stable) + multi-SKU', [
  { sku: 'TIE', is_active: 'active', effective_from: '2026-04-01', lead_time_days: 7 },   // first in order -> wins on tie
  { sku: 'TIE', is_active: 'active', effective_from: '2026-04-01', lead_time_days: 99 },
  { sku: 'OTHER', is_active: '1', effective_from: '2026-04-01', lead_time_days: 5 }        // is_active '1' -> active
], {}, ['TIE', 'OTHER']);   // TIE=7 (stable first), OTHER=5

// 13 blank lead_time_days on the selected latest active row -> null; 14 invalid numeric -> 0
runEquiv('blank -> null ; invalid -> 0', [
  { sku: 'BLK', is_active: 'active', effective_from: '2026-07-01', lead_time_days: '' },   // latest active but blank -> null
  { sku: 'BLK', is_active: 'active', effective_from: '2026-01-01', lead_time_days: 15 },   // older, not selected
  { sku: 'INV', is_active: 'active', effective_from: '2026-07-01', lead_time_days: 'abc' } // present-but-invalid -> parseFloat||0 -> 0
], {}, ['BLK', 'INV']);   // BLK=null (latest row blank), INV=0

// all-inactive SKU -> null (no active row)
runEquiv('all inactive -> null', [
  { sku: 'DEAD', is_active: 'inactive', effective_from: '2026-07-01', lead_time_days: 50 },
  { sku: 'DEAD', is_active: '', effective_from: '2026-08-01', lead_time_days: 60 }   // blank is_active -> NOT active
], {}, ['DEAD']);   // null

console.log('\n== scope matrix: all dimensions IGNORED except sku ==');
var scoped = ltoBuild_({ supplier_price_list: [{ sku: 'SC', is_active: 'active', effective_from: '2026-01-01', lead_time_days: 12 }] },
  { scope: { company: 'ResUS', country: 'CA', marketplace: 'walmart', factory_id: 'FAC-X', supplier_id: 'S9' }, skus: ['SC'] });
eq(scoped.items[0].leadTimeDays, 12, 'company/country/marketplace/factory/supplier all IGNORED — same lead time');
eq(scoped.scope, { company: 'ResUS', country: 'CA', marketplace: 'walmart', factoryId: 'FAC-X', supplierId: 'S9' }, 'scope echoed verbatim (CONTEXT_ONLY)');

console.log('\n== ZERO / EMPTY / ERROR + missing table ==');
// EMPTY (no data) -> null per requested sku (NOT 0)
var vmEmpty = ltoBuild_({ supplier_price_list: [] }, { scope: {}, skus: ['A', 'B'] });
eq(vmEmpty.items.map(function (i) { return i.leadTimeDays; }), [null, null], 'no supplier rows -> null per sku (EMPTY, NOT zero)');
eq(vmEmpty.count, 2, 'count = requested sku count');
// io: missing (unprovisioned) table -> [] (graceful-empty, not a throw)
var io = ltoDefaultIo_();
eq(io.readTable({ getSheetByName: function () { return null; } }, 'supplier_price_list', [], true), [], 'io: missing optional table -> [] (graceful-empty)');
// orchestrator envelope + ERROR != EMPTY != ZERO
var eio = { now: function () { return 0; }, nextSeq: function () { return 1; }, openTarget: function () { return {}; }, readTable: function () { return [{ sku: 'Q', is_active: 'active', effective_from: '2026-01-01', lead_time_days: 8 }]; } };
var envOk = handleLeadTimeRawGet_({ payload: { scope: {}, skus: ['Q', 'MISS'] } }, eio);
ok(envOk.success === true && envOk.data.items[0].leadTimeDays === 8 && envOk.data.items[1].leadTimeDays === null && envOk.meta.workspace === 'leadTime', 'orchestrator success envelope (valid=8, unknown=null)');
var throwIo = { now: function () { return 0; }, nextSeq: function () { return 1; }, openTarget: function () { var e = new Error('WRONG_SPREADSHEET_TARGET'); e.safetyToken = 'WRONG_SPREADSHEET_TARGET'; throw e; }, readTable: function () { return []; } };
var envErr = handleLeadTimeRawGet_({ payload: { scope: {}, skus: ['Q'] } }, throwIo);
ok(envErr.success === false && envErr.errors[0].code === 'WRONG_SPREADSHEET_TARGET' && envErr.data === null, 'backend failure -> ERROR envelope (never null/zero fact)');

console.log('\n== source guards + no cutover ==');
var code55 = GS55.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/getOperationDb/.test(code55), '55_ never calls getOperationDb');
ok(!/\.setValue\(|appendRow|insertSheet|deleteRow|\.setValues\(/.test(code55), '55_ writes nothing (read-only)');
ok(!/fc_regular_forecast|amazon_inventory_snapshot|overseas_inventory_snapshot|factory_stock|purchase_order_lines|order_planning_gap|generateRecommendation|KMPS|KMHP|KMTPP/.test(code55), '55_ reads no forecast/inventory/PO/gap/recommendation (no second engine, no cross-domain)');
ok(/supplier_price_list/.test(GS55) && !/purchase_orders|warehouses/.test(slice(GS55, 'var LTO_TABLES_', 'var LTO_ACTIVE_FLAG_')), '55_ table scope = supplier_price_list only');
ok(/action === 'leadTime\.raw\.get'/.test(ROUTER) && /handleLeadTimeRawGet_\(body\)/.test(ROUTER), 'router dispatches leadTime.raw.get');
ok(/leadTimeDays/.test(GS55) && !/durationQty|genericDuration/.test(GS55), 'DTO field is the qualified leadTimeDays');
// no AI-Plan cutover this round
ok(/function leadTime\(sku\)/.test(ROJS) && /loadOperationDb\(\{ force: true \}\)/.test(ROJS), 'request-order.js still owns leadTime() + broad cache (NO cutover)');
ok(ROJS.indexOf('leadTime.raw.get') < 0, 'request-order.js does NOT yet consume the new owner (PREREQ-5)');

console.log('\n----------------------------------------');
console.log('API LEAD TIME OWNER (F1-7E-PREREQ-4-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
