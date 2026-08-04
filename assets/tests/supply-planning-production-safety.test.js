// Kitchen Mama Operation System — PRODUCTION SAFETY LAYER tests (Production Safety Round S0).
// Run: node assets/tests/supply-planning-production-safety.test.js
// LOCAL / FAKE-ONLY. Exercises the REAL KMSAFE source against write-throwing fake Spreadsheets and asserts the
// permanent safety contract: exact Spreadsheet-ID gate (§11), Header validation without mutation (§12), the
// Header-row write barrier + structural-mutation barrier (§13), migration-authorization boundary, the additive
// ensure contract (§16, via the pure KMPR mirror), and zero side effects on module load (§17). No live access.

'use strict';
var KMSAFE = require('../js/core/supply-planning-production-safety.js');
var KMPR = require('../js/core/supply-planning-persistence-repository.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throws(fn, token, l) { try { fn(); fail++; console.error('FAIL ' + l + ' (did not throw)'); } catch (e) { if (token && e.safetyToken !== token) { fail++; console.error('FAIL ' + l + ' (token ' + e.safetyToken + ' != ' + token + ')'); } else pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// write-throwing fake: every mutating method throws + records (proves validation performs zero writes).
var MUTATORS = ['setValue', 'setValues', 'clear', 'clearContent', 'clearContents', 'deleteRow', 'deleteRows',
  'deleteColumn', 'deleteColumns', 'insertRowsAfter', 'insertColumnsAfter', 'appendRow', 'copyTo', 'moveTo', 'setName'];
var SS_MUTATORS = ['insertSheet', 'deleteSheet', 'setName'];
function makeFake(sheetMap, id) {
  var attempts = [];
  function thrower(w) { return function () { attempts.push(w); throw new Error('WRITE_ATTEMPT:' + w); }; }
  function range(vals) { var r = { getValues: function () { return vals.map(function (x) { return x.slice(); }); } }; MUTATORS.forEach(function (m) { r[m] = thrower('Range.' + m); }); return r; }
  function sheet(name, vals) { var s = { getName: function () { return name; }, getLastRow: function () { return vals.length; }, getLastColumn: function () { return vals[0] ? vals[0].length : 0; }, getDataRange: function () { return range(vals); }, getRange: function () { return range(vals); } }; MUTATORS.forEach(function (m) { s[m] = thrower('Sheet.' + m); }); return s; }
  var ss = { getId: function () { return id === undefined ? 'SS-EXPECTED' : id; }, getSheetByName: function (n) { return Object.prototype.hasOwnProperty.call(sheetMap, n) ? sheet(n, sheetMap[n]) : null; }, getSheets: function () { return Object.keys(sheetMap).map(function (n) { return sheet(n, sheetMap[n]); }); } };
  SS_MUTATORS.forEach(function (m) { ss[m] = thrower('Spreadsheet.' + m); });
  return { ss: ss, attempts: attempts, snapshot: function () { return JSON.stringify(sheetMap); } };
}

// ==========================================================================
section('§11 — EXACT Spreadsheet-ID gate (fail-closed, no fallback)');
(function () {
  var good = makeFake({ t: [['a']] }, 'SS-EXPECTED');
  eq(KMSAFE.assertExpectedSpreadsheetId(good.ss, 'SS-EXPECTED'), { ok: true, spreadsheetId: 'SS-EXPECTED' }, 'S11.1 correct ID passes');
  throws(function () { KMSAFE.assertExpectedSpreadsheetId(makeFake({}, 'SS-WRONG').ss, 'SS-EXPECTED'); }, 'WRONG_SPREADSHEET_TARGET', 'S11.2 wrong ID fails closed');
  throws(function () { KMSAFE.assertExpectedSpreadsheetId(good.ss, ''); }, 'WRONG_SPREADSHEET_TARGET', 'S11.3 missing configured ID fails closed');
  throws(function () { KMSAFE.assertExpectedSpreadsheetId(good.ss, '   '); }, 'WRONG_SPREADSHEET_TARGET', 'S11.4 blank configured ID fails closed');
  throws(function () { KMSAFE.assertExpectedSpreadsheetId(null, 'SS-EXPECTED'); }, 'WRONG_SPREADSHEET_TARGET', 'S11.5 null/standalone Spreadsheet fails closed');
  throws(function () { KMSAFE.assertExpectedSpreadsheetId(makeFake({}, '').ss, 'SS-EXPECTED'); }, 'WRONG_SPREADSHEET_TARGET', 'S11.6 Spreadsheet with empty id fails closed');
  ok(KMSAFE.checkExpectedSpreadsheetId(makeFake({}, 'SS-WRONG').ss, 'SS-EXPECTED').ok === false, 'S11.7 non-throwing check reports mismatch');
})();

section('§12 — Header validation returns a deterministic status with ZERO mutation');
(function () {
  var W = require('../js/core/supply-planning-production-writer.js');
  var H = W.DRAFT_HEADERS.WEEKLY_SHIPPING.header;
  var cases = [
    { name: 'exact', rows: [H.slice()], status: 'SCHEMA_VALID' },
    { name: 'missing sheet', absent: true, status: 'SCHEMA_NOT_PROVISIONED_OR_MISSING' },
    { name: 'blank header', rows: [(function () { var h = H.slice(); h[3] = ''; return h; })()], status: 'HEADER_BLANK' },
    { name: 'duplicate header', rows: [(function () { var h = H.slice(); h[4] = h[3]; return h; })()], status: 'HEADER_DUPLICATE' },
    { name: 'reordered', rows: [(function () { var h = H.slice(); var t = h[1]; h[1] = h[2]; h[2] = t; return h; })()], status: 'HEADER_ORDER_MISMATCH' },
    { name: 'unexpected (BLOCK)', rows: [H.concat(['stray_col'])], status: 'HEADER_UNEXPECTED', policy: 'BLOCK' },
    { name: 'unexpected (ALLOW additive)', rows: [H.concat(['user_edited'])], status: 'SCHEMA_VALID', policy: 'ALLOW' },
    { name: 'zero-row (header only)', rows: [H.slice()], status: 'SCHEMA_VALID' },
    { name: 'data rows present', rows: [H.slice(), H.map(function () { return 'x'; })], status: 'SCHEMA_VALID' },
    { name: 'row-width mismatch', rows: [H.slice(), H.concat(['overflow'])], status: 'ROW_WIDTH_MISMATCH' }
  ];
  cases.forEach(function (c, i) {
    var map = {}; if (!c.absent) map.shipping_allocation_drafts = c.rows;
    var fake = makeFake(map, 'SS-EXPECTED');
    var before = fake.snapshot();
    var rep = KMSAFE.validateCanonicalTable(fake.ss, { sheetName: 'shipping_allocation_drafts', expectedHeaders: H, expectedSpreadsheetId: 'SS-EXPECTED', extraColumnsPolicy: c.policy });
    eq(fake.attempts, [], 'S12.' + i + ' [' + c.name + '] ZERO writes during validation');
    eq(fake.snapshot(), before, 'S12.' + i + ' [' + c.name + '] byte-identical before/after');
    if (c.status === 'SCHEMA_NOT_PROVISIONED_OR_MISSING') ok(rep.schemaStatus === 'SHEET_MISSING', 'S12.' + i + ' [' + c.name + '] → SHEET_MISSING');
    else eq(rep.schemaStatus, c.status, 'S12.' + i + ' [' + c.name + '] → ' + c.status);
  });
})();

section('§13 — Header-row write barrier + structural-mutation barrier (code-enforced)');
(function () {
  throws(function () { KMSAFE.assertDataRowWriteRange({ sheetName: 't', startRow: 1, operation: 'setValues' }); }, 'HEADER_WRITE_PROHIBITED', 'S13.1 setValue on row 1 blocked');
  throws(function () { KMSAFE.assertDataRowWriteRange({ sheetName: 't', startRow: 1, numberOfRows: 5, operation: 'setValues' }); }, 'HEADER_WRITE_PROHIBITED', 'S13.2 range intersecting row 1 blocked');
  eq(KMSAFE.assertDataRowWriteRange({ sheetName: 't', startRow: 2, numberOfRows: 4, operation: 'setValues' }), { ok: true, startRow: 2, endRow: 5 }, 'S13.3 range starting row 2 allowed');
  ['clear', 'clearContent', 'clearContents', 'deleteRow', 'deleteColumn', 'insertColumnsAfter', 'deleteSheet', 'insertSheet', 'copyTo', 'moveTo', 'setName'].forEach(function (op, i) {
    throws(function () { KMSAFE.assertRuntimeMutationAllowed({ operation: op, executionMode: 'RUNTIME_WRITE', startRow: 2 }); }, 'STRUCTURAL_MUTATION_PROHIBITED', 'S13.4.' + i + ' structural op "' + op + '" blocked in runtime');
  });
  throws(function () { KMSAFE.assertRuntimeMutationAllowed({ operation: 'wholeSheetSetValues', executionMode: 'RUNTIME_WRITE' }); }, 'WHOLE_SHEET_REPLACEMENT_PROHIBITED', 'S13.5 whole-sheet replacement blocked');
  throws(function () { KMSAFE.assertRuntimeMutationAllowed({ operation: 'setValues', executionMode: 'SCHEMA_MIGRATION' }); }, 'MIGRATION_AUTHORIZATION_REQUIRED', 'S13.6 migration mode without authorization blocked');
  // valid data-row upsert in RUNTIME_WRITE at row >= 2 passes
  ok(KMSAFE.assertRuntimeMutationAllowed({ operation: 'setValues', executionMode: 'RUNTIME_WRITE', startRow: 2, numberOfRows: 1 }).ok === true, 'S13.7 data-row upsert (row>=2) permitted');
  // read modes must never carry a write op
  throws(function () { KMSAFE.assertRuntimeMutationAllowed({ operation: 'setValues', executionMode: 'DIAGNOSTIC_READ', startRow: 2 }); }, 'STRUCTURAL_MUTATION_PROHIBITED', 'S13.8 write op rejected in DIAGNOSTIC_READ');
})();

section('Migration authorization boundary (a boolean is never sufficient)');
(function () {
  eq(KMSAFE.validateMigrationAuthorization({ isMigration: true }).valid, false, 'MA.1 isMigration:true alone is insufficient');
  eq(KMSAFE.validateMigrationAuthorization(null).missing.length, KMSAFE.MIGRATION_REQUIRED_FIELDS.length, 'MA.2 null → all fields missing');
  var full = { migrationId: 'M1', expectedSpreadsheetId: 'SS-EXPECTED', expectedSheetName: 'shipping_allocation_drafts', expectedOldHeaderHash: 'aaaa', expectedNewHeaderHash: 'bbbb', backupReference: 'gs://backup/1', execute: false, actor: 'admin' };
  eq(KMSAFE.validateMigrationAuthorization(full).valid, true, 'MA.3 full authorization DTO valid');
  ok(KMSAFE.assertRuntimeMutationAllowed({ operation: 'deleteColumn', executionMode: 'SCHEMA_MIGRATION', migrationAuthorization: full }).migration === true, 'MA.4 valid authorization reaches migration path');
  ok(/^[0-9a-f]{8}$/.test(KMSAFE.headerHash(['a', 'b', 'c'])) && KMSAFE.headerHash(['a', 'b']) !== KMSAFE.headerHash(['b', 'a']), 'MA.5 deterministic order-sensitive headerHash');
})();

section('§16 — additive ensure contract (pure KMPR mirror never overwrites a non-empty Header)');
(function () {
  // KMPR.ensureHeaders is the algorithm mirror of the .gs sheetEnsureColumns_ (additive-only).
  var existing = ['a', 'b', 'c'];
  var r = KMPR.ensureHeaders(existing, ['b', 'd', 'e']);
  eq(r.headers, ['a', 'b', 'c', 'd', 'e'], 'S16.1 missing columns appended at the end (never reordered)');
  eq(r.added, ['d', 'e'], 'S16.2 only genuinely-missing columns added');
  eq(existing, ['a', 'b', 'c'], 'S16.3 input Header array not mutated');
  eq(KMPR.ensureHeaders(['a', 'b', 'c'], ['a', 'b', 'c']).changed, false, 'S16.4 fully-present Header → no change (byte-identical)');
})();

section('§17 — module load has zero side effects (no SpreadsheetApp / no top-level write)');
(function () {
  var fs = require('fs'), path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-production-safety.js'), 'utf8');
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(code.indexOf('SpreadsheetApp') === -1, 'S17.1 KMSAFE source never references SpreadsheetApp');
  ok(code.indexOf('LockService') === -1, 'S17.2 KMSAFE source never references LockService');
  ok(!/Date\.now|Math\.random|localeCompare/.test(code), 'S17.3 KMSAFE is deterministic (no clock/random/locale)');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Production Safety Round S0 KMSAFE assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
