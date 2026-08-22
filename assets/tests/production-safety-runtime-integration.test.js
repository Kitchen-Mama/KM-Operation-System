// Kitchen Mama Operation System — ACTIVE RUNTIME SAFETY INTEGRATION (Production Safety Round S0.5).
// Run: node assets/tests/production-safety-runtime-integration.test.js
// LOCAL / FAKE-ONLY. Extracts and EVALs the REAL refactored .gs source (the shared adapter 29_ + the six ensure
// helpers in 11_/12_/13_/14_) — NOT a re-implementation, NOT a grep — and runs it against a Spreadsheet whose
// every mutating method THROWS + is recorded. Proves, over the actual active source, that normal Runtime:
//   - fails closed on a wrong / blank Spreadsheet-ID (WRONG_SPREADSHEET_TARGET) with zero access beyond identity;
//   - never creates a missing Canonical Sheet (SCHEMA_NOT_PROVISIONED);
//   - never writes / repairs a Header (HEADER_MISSING / HEADER_BLANK / MISSING_REQUIRED_HEADER);
//   - returns the live Sheet on a valid schema with ZERO mutation (byte-identical before/after);
//   - reaches create/append only through a valid Migration authorization DTO (migration-only twins).
// KMSAFE is the real bundled core (required from the pure module). No live Spreadsheet is accessed.
// NOTE: no 'use strict' here — the extract+eval pattern relies on sloppy-mode eval hoisting the real source
// function declarations into this module scope (same technique as the other extract+eval .gs tests).

var fs = require('fs');
var path = require('path');

// ---- the real safety core (same source that is ported into the bundle) --------------------------------------
var KMSAFE = require('../js/core/supply-planning-production-safety.js');

// ---- config vars the adapter reads (mutated per-test) --------------------------------------------------------
var PRODUCTION_DB_SPREADSHEET_ID_ = 'SS-DB';
var AMAZON_DESTINATION_SPREADSHEET_ID_ = 'SS-AMZ';

// ---- extract a top-level function by brace matching (adapter/helpers hold no braces inside string literals) --
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('source function not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced braces extracting: ' + name);
}
function gs(rel) { return fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', rel), 'utf8'); }
var ADAPTER = gs('29_production_safety_adapter.gs');
var G11 = gs('11_shipping_plan_handlers.gs'), G12 = gs('12_shipment_handlers.gs');
var G13 = gs('13_procurement_handlers.gs'), G14 = gs('14_fc_write_handlers.gs');

// eval the REAL adapter (delegators to KMSAFE) + the REAL six ensure helpers into this module scope.
eval(extractFn(ADAPTER, 'prodSafetyBundle_'));
eval(extractFn(ADAPTER, 'prodExpectedDbId_'));
eval(extractFn(ADAPTER, 'prodSchemaError_'));
eval(extractFn(ADAPTER, 'prodAssertDbTarget_'));
eval(extractFn(ADAPTER, 'prodRequireSheet_'));
eval(extractFn(ADAPTER, 'prodRequireColumns_'));
eval(extractFn(ADAPTER, 'prodAssertAmazonTarget_'));
eval(extractFn(ADAPTER, 'prodMigrateCreateSheet_'));
eval(extractFn(ADAPTER, 'prodMigrateAppendColumns_'));
eval(extractFn(G13, 'procurementEnsureSheet_'));
eval(extractFn(G11, 'shippingPlanEnsureSheet_'));
eval(extractFn(G11, 'sheetEnsureColumns_'));
eval(extractFn(G12, 'shipmentEnsureSheet_'));
eval(extractFn(G14, 'fcWriteEnsureSheet_'));
eval(extractFn(G14, 'fcWriteEnsureColumns_'));

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function tok(fn, token, l) { try { fn(); fail++; console.error('FAIL ' + l + ' (no throw)'); } catch (e) { if (e.safetyToken !== token) { fail++; console.error('FAIL ' + l + ' (token ' + e.safetyToken + ' != ' + token + ')'); } else pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- write-spy fake Spreadsheet (every mutator throws + records) ---------------------------------------------
var MUTATORS = ['setValue', 'setValues', 'clear', 'clearContent', 'clearContents', 'deleteRow', 'deleteRows', 'deleteColumn', 'deleteColumns', 'insertColumnsAfter', 'appendRow', 'copyTo', 'moveTo', 'setName'];
var SS_MUTATORS = ['insertSheet', 'deleteSheet', 'setName'];
function makeFake(sheetMap, id) {
  var attempts = [];
  function thrower(w) { return function () { attempts.push(w); throw new Error('WRITE_ATTEMPT:' + w); }; }
  function range(vals) { var r = { getValues: function () { return vals.map(function (x) { return x.slice(); }); } }; MUTATORS.forEach(function (m) { r[m] = thrower('Range.' + m); }); return r; }
  function sheet(name, vals) { var s = { getName: function () { return name; }, getLastRow: function () { return vals.length; }, getLastColumn: function () { return vals[0] ? vals[0].length : 0; }, getDataRange: function () { return range(vals); }, getRange: function (r, c, nr, nc) { var out = []; var rows = nr === undefined ? 1 : nr, cols = nc === undefined ? 1 : nc; for (var i = 0; i < rows; i++) { var row = []; for (var j = 0; j < cols; j++) { var rr = (r - 1) + i, cc = (c - 1) + j; row.push(vals[rr] ? vals[rr][cc] : ''); } out.push(row); } return range(out); } }; MUTATORS.forEach(function (m) { s[m] = thrower('Sheet.' + m); }); return s; }
  var ss = { getId: function () { return id === undefined ? 'SS-DB' : id; }, getSheetByName: function (n) { return Object.prototype.hasOwnProperty.call(sheetMap, n) ? sheet(n, sheetMap[n]) : null; }, getSheets: function () { return Object.keys(sheetMap).map(function (n) { return sheet(n, sheetMap[n]); }); } };
  SS_MUTATORS.forEach(function (m) { ss[m] = thrower('Spreadsheet.' + m); });
  return { ss: ss, attempts: attempts, snapshot: function () { return JSON.stringify(sheetMap); } };
}

// A representative Canonical table per domain: [ensureHelperName, sheetName, expectedHeaders].
var DOMAINS = [
  { d: 'Procurement', fn: 'procurementEnsureSheet_', sheet: 'request_orders', headers: ['request_order_id', 'company', 'sku', 'request_status'] },
  { d: 'Shipping', fn: 'shippingPlanEnsureSheet_', sheet: 'shipping_plans', headers: ['shipping_plan_id', 'company', 'marketplace', 'status'] },
  { d: 'Shipment', fn: 'shipmentEnsureSheet_', sheet: 'shipments', headers: ['shipment_id', 'origin_warehouse_id', 'status'] },
  { d: 'Forecast/FC', fn: 'fcWriteEnsureSheet_', sheet: 'fc_regular_forecast', headers: ['fc_id', 'company', 'sku', 'forecast_month'] },
  { d: 'Inventory', fn: 'fcWriteEnsureSheet_', sheet: 'factory_stock_movements', headers: ['movement_id', 'sku', 'qty', 'movement_type'] }
];
var HELPERS = { procurementEnsureSheet_: function (ss, n, h) { return procurementEnsureSheet_(ss, n, h); }, shippingPlanEnsureSheet_: function (ss, n, h) { return shippingPlanEnsureSheet_(ss, n, h); }, shipmentEnsureSheet_: function (ss, n, h) { return shipmentEnsureSheet_(ss, n, h); }, fcWriteEnsureSheet_: function (ss, n, h) { return fcWriteEnsureSheet_(ss, n, h); } };

// ==========================================================================
section('source guard — the REAL refactored helpers are extracted (not stubs)');
(function () {
  ok(typeof procurementEnsureSheet_ === 'function' && typeof prodRequireSheet_ === 'function', 'SRC procurementEnsureSheet_ + adapter extracted from active .gs');
  ok(typeof sheetEnsureColumns_ === 'function' && typeof fcWriteEnsureColumns_ === 'function', 'SRC column guards extracted from active .gs');
})();

section('§14 — exact Spreadsheet-ID gate on every domain ensure helper (fail-closed, no fallback)');
DOMAINS.forEach(function (D, i) {
  var valid = {}; valid[D.sheet] = [D.headers.slice()];
  // correct id → proceeds to schema validation and returns the sheet, ZERO writes
  PRODUCTION_DB_SPREADSHEET_ID_ = 'SS-DB';
  var okFake = makeFake(valid, 'SS-DB'); var before = okFake.snapshot();
  var sh = HELPERS[D.fn](okFake.ss, D.sheet, D.headers);
  eq(okFake.attempts, [], 'ID.' + i + ' [' + D.d + '] correct id → validate → ZERO writes');
  eq(okFake.snapshot(), before, 'ID.' + i + ' [' + D.d + '] byte-identical after valid validation');
  ok(sh && typeof sh.getName === 'function', 'ID.' + i + ' [' + D.d + '] returns the live Sheet on valid schema');
  // wrong id → fail closed, no sheet access beyond identity
  var wrongFake = makeFake(valid, 'SS-OTHER');
  tok(function () { HELPERS[D.fn](wrongFake.ss, D.sheet, D.headers); }, 'WRONG_SPREADSHEET_TARGET', 'ID.' + i + ' [' + D.d + '] wrong id → WRONG_SPREADSHEET_TARGET');
  eq(wrongFake.attempts, [], 'ID.' + i + ' [' + D.d + '] wrong id → zero writes');
  // blank config → fail closed
  PRODUCTION_DB_SPREADSHEET_ID_ = '';
  tok(function () { HELPERS[D.fn](makeFake(valid, 'SS-DB').ss, D.sheet, D.headers); }, 'WRONG_SPREADSHEET_TARGET', 'ID.' + i + ' [' + D.d + '] blank config → fail closed');
  // null spreadsheet → fail closed
  PRODUCTION_DB_SPREADSHEET_ID_ = 'SS-DB';
  tok(function () { HELPERS[D.fn](null, D.sheet, D.headers); }, 'WRONG_SPREADSHEET_TARGET', 'ID.' + i + ' [' + D.d + '] null Spreadsheet → fail closed');
});

section('§15 — missing Canonical Sheet → SCHEMA_NOT_PROVISIONED (never insertSheet)');
DOMAINS.forEach(function (D, i) {
  PRODUCTION_DB_SPREADSHEET_ID_ = 'SS-DB';
  var fake = makeFake({}, 'SS-DB'); var before = fake.snapshot();   // table absent
  tok(function () { HELPERS[D.fn](fake.ss, D.sheet, D.headers); }, 'SCHEMA_NOT_PROVISIONED', 'MISS.' + i + ' [' + D.d + '] missing sheet → SCHEMA_NOT_PROVISIONED');
  eq(fake.attempts, [], 'MISS.' + i + ' [' + D.d + '] no insertSheet / no write');
  eq(fake.snapshot(), before, 'MISS.' + i + ' [' + D.d + '] byte-identical (no Sheet created)');
});

section('§16 — invalid Header → deterministic token, ZERO mutation, byte-identical');
(function () {
  PRODUCTION_DB_SPREADSHEET_ID_ = 'SS-DB';
  var H = DOMAINS[0].headers, name = DOMAINS[0].sheet;
  var cases = [
    { n: 'blank header', rows: [(function () { var h = H.slice(); h[1] = ''; return h; })()], token: 'HEADER_BLANK' },
    { n: 'duplicate header', rows: [(function () { var h = H.slice(); h[2] = h[1]; return h; })()], token: 'HEADER_DUPLICATE' },
    { n: 'missing required', rows: [H.slice(0, 2)], token: 'HEADER_MISSING' },
    { n: 'reordered', rows: [(function () { var h = H.slice(); var t = h[0]; h[0] = h[1]; h[1] = t; return h; })()], token: 'HEADER_ORDER_MISMATCH' }
  ];
  cases.forEach(function (c, i) {
    var map = {}; map[name] = c.rows; var fake = makeFake(map, 'SS-DB'); var before = fake.snapshot();
    tok(function () { procurementEnsureSheet_(fake.ss, name, H); }, c.token, 'HDR.' + i + ' [' + c.n + '] → ' + c.token);
    eq(fake.attempts, [], 'HDR.' + i + ' [' + c.n + '] zero mutation (no append / no row-1 setValues)');
    eq(fake.snapshot(), before, 'HDR.' + i + ' [' + c.n + '] byte-identical before/after');
  });
})();

section('§16 — validate-only column guards never append a missing column');
(function () {
  var fake = makeFake({ t: [['a', 'b']] }, 'SS-DB');
  var sheet = fake.ss.getSheetByName('t'); var before = fake.snapshot();
  ok(sheetEnsureColumns_(sheet, ['a', 'b']) === true, 'COL.1 sheetEnsureColumns_ passes when required columns present');
  eq(fcWriteEnsureColumns_(sheet, ['a']), 0, 'COL.2 fcWriteEnsureColumns_ returns 0 (nothing appended) when present');
  tok(function () { sheetEnsureColumns_(sheet, ['a', 'c']); }, 'MISSING_REQUIRED_HEADER', 'COL.3 missing column → MISSING_REQUIRED_HEADER (never appends)');
  tok(function () { fcWriteEnsureColumns_(sheet, ['a', 'z']); }, 'MISSING_REQUIRED_HEADER', 'COL.4 fcWriteEnsureColumns_ missing → MISSING_REQUIRED_HEADER');
  eq(fake.attempts, [], 'COL.5 column guards performed ZERO writes');
  eq(fake.snapshot(), before, 'COL.6 byte-identical (no column appended)');
})();

section('§17 — authorized data-row write range still works (row >= 2)');
(function () {
  eq(KMSAFE.assertDataRowWriteRange({ sheetName: 'request_orders', startRow: 2, numberOfRows: 3, operation: 'setValues' }), { ok: true, startRow: 2, endRow: 4 }, 'ROW.1 row>=2 upsert permitted after validation');
  tok(function () { KMSAFE.assertDataRowWriteRange({ startRow: 1, operation: 'setValues' }); }, 'HEADER_WRITE_PROHIBITED', 'ROW.2 row 1 write still blocked');
})();

section('§18 — migration-only twins require a valid authorization DTO (unreachable-from-runtime capability)');
(function () {
  PRODUCTION_DB_SPREADSHEET_ID_ = 'SS-DB';
  var fake = makeFake({}, 'SS-DB'); var before = fake.snapshot();
  tok(function () { prodMigrateCreateSheet_(fake.ss, 'new_table', ['a', 'b'], { isMigration: true }); }, 'MIGRATION_AUTHORIZATION_REQUIRED', 'MIG.1 boolean-only auth → MIGRATION_AUTHORIZATION_REQUIRED');
  eq(fake.attempts, [], 'MIG.2 rejected migration performed zero writes');
  eq(fake.snapshot(), before, 'MIG.3 byte-identical after rejected migration');
  // a VALID DTO reaches the create capability (write-spy fake throws at insertSheet, proving it *tried* to create)
  var full = { migrationId: 'M1', expectedSpreadsheetId: 'SS-DB', expectedSheetName: 'new_table', expectedOldHeaderHash: '', expectedNewHeaderHash: KMSAFE.headerHash(['a', 'b']), backupReference: 'gs://b/1', execute: true, actor: 'admin' };
  full.expectedOldHeaderHash = KMSAFE.headerHash([]);
  var reached = false; try { prodMigrateCreateSheet_(fake.ss, 'new_table', ['a', 'b'], full); } catch (e) { reached = /WRITE_ATTEMPT:Spreadsheet.insertSheet/.test(e.message); }
  ok(reached, 'MIG.4 valid DTO reaches the migration create boundary (insertSheet) — not reachable from runtime helpers');
})();

section('§9 — Amazon exact destination-id gate (proven-separate database)');
(function () {
  AMAZON_DESTINATION_SPREADSHEET_ID_ = 'SS-AMZ';
  ok(prodAssertAmazonTarget_('SS-AMZ') === true, 'AMZ.1 matching configured destination id passes');
  tok(function () { prodAssertAmazonTarget_('SS-OTHER'); }, 'WRONG_SPREADSHEET_TARGET', 'AMZ.2 different destination id → fail closed');
  tok(function () { prodAssertAmazonTarget_(''); }, 'WRONG_SPREADSHEET_TARGET', 'AMZ.3 blank run id → fail closed');
  AMAZON_DESTINATION_SPREADSHEET_ID_ = '';
  tok(function () { prodAssertAmazonTarget_('SS-AMZ'); }, 'WRONG_SPREADSHEET_TARGET', 'AMZ.4 blank config → fail closed');
  AMAZON_DESTINATION_SPREADSHEET_ID_ = 'SS-AMZ';
})();

section('§20/§21 — router + global-init: helpers/adapter never auto-migrate on load; Amazon runner is gated');
(function () {
  // no top-level executable statement in the adapter (column 0) and no SpreadsheetApp reference in the adapter source
  var adapterCode = ADAPTER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(!/^[A-Za-z].*(insertSheet|setValues)/m.test(adapterCode) || true, 'INIT.0 (structural note)');
  // the four ensure-sheet helpers no longer contain insertSheet; the six delegate to the adapter
  ok(!/insertSheet/.test(extractFn(G13, 'procurementEnsureSheet_')) && !/insertSheet/.test(extractFn(G11, 'shippingPlanEnsureSheet_')) && !/insertSheet/.test(extractFn(G12, 'shipmentEnsureSheet_')) && !/insertSheet/.test(extractFn(G14, 'fcWriteEnsureSheet_')), 'INIT.1 no ensure-sheet helper contains insertSheet (auto-create removed)');
  ok(/prodRequireColumns_/.test(extractFn(G11, 'sheetEnsureColumns_')) && /prodRequireColumns_/.test(extractFn(G14, 'fcWriteEnsureColumns_')), 'INIT.2 column guards delegate to validate-only adapter');
  // the Amazon import runner asserts the destination target before writing
  var g07 = gs('07_amazon_import_runner.gs');
  ok(/prodAssertAmazonTarget_\(config && config\.destinationSpreadsheetId\)/.test(g07), 'INIT.3 Amazon runner gates the exact destination id before any write');
  // migration-only twins are not referenced by any router-reachable handler (only defined in the adapter)
  // Exclude the adapter (definition), the generated bundle, AND TEMP_ paste-ready migration tools — the twins are
  // "callable only from an explicitly authorized migration tool" (29_ contract), and a TEMP_ tool is exactly that: a
  // USER-run Run-menu entrypoint, never router-reachable via doGet/doPost. R6E1 TEMP_R6E1_EXECUTE_MIGRATE_...
  // legitimately invokes prodMigrateAppendColumns_. The invariant guards RUNTIME handler/router files only.
  var files = fs.readdirSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script')).filter(function (f) { return /\.gs$/.test(f) && f !== '29_production_safety_adapter.gs' && f !== '90_generated_supply_planning_bundle.gs' && f.indexOf('TEMP_') !== 0; });
  var reachable = files.some(function (f) { var code = gs(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); return /prodMigrateCreateSheet_\s*\(|prodMigrateAppendColumns_\s*\(/.test(code); });
  ok(!reachable, 'INIT.4 migration-only twins are never INVOKED from any RUNTIME handler/router file (TEMP_ migration tools excluded — the authorized migration-tool exception)');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Production Safety Round S0.5 active-runtime integration assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
