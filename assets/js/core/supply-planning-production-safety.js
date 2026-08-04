// Kitchen Mama Operation System — PRODUCTION SPREADSHEET SAFETY LAYER (Production Safety Round S0).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC, DEPENDENCY-FREE enforcement primitives that make Canonical production schema boundaries
// unbreakable in NORMAL runtime. This module authors NO business logic. It is the single shared safety owner
// (KMSAFE) referenced by writers/readers/diagnostics to:
//   (1) verify the EXACT configured Spreadsheet identity before any Canonical access (fail-closed, no fallback);
//   (2) validate a Canonical Sheet's Header WITHOUT ever mutating it (validate, never repair);
//   (3) block writes that touch the Header row (row 1);
//   (4) block structural destructive operations (clear/delete/insert column/whole-sheet replacement) in runtime;
//   (5) separate RUNTIME mode from SCHEMA_MIGRATION mode (migration privileges require an explicit authorization
//       DTO — never inferred from a boolean).
// Every mismatch FAILS CLOSED with a deterministic issue token and performs ZERO mutation. No SpreadsheetApp /
// LockService / Date.now / Math.random / locale here (the `.gs` injects the live Spreadsheet; tests inject fakes);
// input is never mutated; reports are JSON-safe.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.productionSafety = api; }
  if (typeof root !== 'undefined' && root) { root.KMSAFE = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  // ---- execution modes (SCHEMA_MIGRATION is NEVER inferred) -------------------------------------------------
  var EXECUTION_MODES = { RUNTIME_READ: 'RUNTIME_READ', RUNTIME_WRITE: 'RUNTIME_WRITE', DIAGNOSTIC_READ: 'DIAGNOSTIC_READ', SCHEMA_MIGRATION: 'SCHEMA_MIGRATION' };

  // ---- deterministic issue / barrier tokens (schemaStatus + fail-closed throws) -----------------------------
  var SCHEMA_STATUS = {
    SCHEMA_VALID: 'SCHEMA_VALID', SHEET_MISSING: 'SHEET_MISSING', HEADER_MISSING: 'HEADER_MISSING',
    HEADER_BLANK: 'HEADER_BLANK', HEADER_DUPLICATE: 'HEADER_DUPLICATE', HEADER_ORDER_MISMATCH: 'HEADER_ORDER_MISMATCH',
    HEADER_UNEXPECTED: 'HEADER_UNEXPECTED', ROW_WIDTH_MISMATCH: 'ROW_WIDTH_MISMATCH',
    WRONG_SPREADSHEET_TARGET: 'WRONG_SPREADSHEET_TARGET', SCHEMA_NOT_PROVISIONED: 'SCHEMA_NOT_PROVISIONED'
  };
  var BARRIER = {
    HEADER_WRITE_PROHIBITED: 'HEADER_WRITE_PROHIBITED', STRUCTURAL_MUTATION_PROHIBITED: 'STRUCTURAL_MUTATION_PROHIBITED',
    WHOLE_SHEET_REPLACEMENT_PROHIBITED: 'WHOLE_SHEET_REPLACEMENT_PROHIBITED', MIGRATION_AUTHORIZATION_REQUIRED: 'MIGRATION_AUTHORIZATION_REQUIRED'
  };

  // Dangerous structural APIs that normal runtime must NEVER invoke on a Canonical table (RULE S0-4).
  var STRUCTURAL_OPS = {
    clear: 1, clearContent: 1, clearContents: 1, deleteRow: 1, deleteRows: 1, deleteColumn: 1, deleteColumns: 1,
    insertRowsBefore: 1, insertRowsAfter: 1, insertColumnsBefore: 1, insertColumnsAfter: 1, insertColumns: 1,
    insertColumn: 1, deleteSheet: 1, insertSheet: 1, copyTo: 1, moveTo: 1, setName: 1, renameSheet: 1,
    resetSheet: 1, reinitializeSheet: 1
  };
  var WHOLE_SHEET_OPS = { wholeSheetSetValues: 1, replaceSheet: 1, rebuildSheet: 1 };

  function safetyError(token, message) { var e = new Error(token + (message ? ': ' + message : '')); e.safetyToken = token; return e; }

  // ---- RULE S0-5 — EXACT SPREADSHEET TARGET (fail-closed, no fallback) --------------------------------------
  // Throws WRONG_SPREADSHEET_TARGET on any doubt: blank/missing configured id, null spreadsheet, absent getId, or
  // id mismatch. Never falls back to active/first-open/first-sheet/fuzzy match. Returns {ok, spreadsheetId}.
  function assertExpectedSpreadsheetId(spreadsheet, expectedSpreadsheetId) {
    var expected = str(expectedSpreadsheetId);
    if (expected === '') throw safetyError(SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, 'no configured expected Spreadsheet ID (fail closed)');
    if (!isObj(spreadsheet) || typeof spreadsheet.getId !== 'function') throw safetyError(SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, 'no Spreadsheet / getId() (fail closed)');
    var actual;
    try { actual = str(spreadsheet.getId()); } catch (e) { throw safetyError(SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, 'getId() threw (fail closed)'); }
    if (actual === '') throw safetyError(SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, 'Spreadsheet has no id (fail closed)');
    if (actual !== expected) throw safetyError(SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, 'expected ' + expected + ' got ' + actual);
    return { ok: true, spreadsheetId: actual };
  }
  // Non-throwing variant for report-style validators.
  function checkExpectedSpreadsheetId(spreadsheet, expectedSpreadsheetId) {
    try { return assertExpectedSpreadsheetId(spreadsheet, expectedSpreadsheetId); }
    catch (e) { return { ok: false, spreadsheetId: (isObj(spreadsheet) && typeof spreadsheet.getId === 'function') ? (function () { try { return str(spreadsheet.getId()); } catch (x) { return ''; } })() : '' }; }
  }

  // ---- RULE S0-1/S0-2 — HEADER VALIDATION (validate, NEVER repair) ------------------------------------------
  function dupHeaders(headers) { var seen = {}, dup = []; headers.forEach(function (h) { if (h === '') return; if (seen[h]) { if (dup.indexOf(h) < 0) dup.push(h); } else seen[h] = 1; }); return dup; }
  function blankIndexes(headers) { var out = []; headers.forEach(function (h, i) { if (h === '') out.push(i); }); return out; }

  // classifySchemaMismatch — PURE over header/row-shape facts (no Spreadsheet). Never mutates; returns a JSON-safe
  // report. extraColumnsPolicy: 'BLOCK' → unexpected headers force HEADER_UNEXPECTED; 'ALLOW' → extra columns are
  // reported but do not fail (follow the owning table's contract — never invent permissive behavior by default).
  function classifySchemaMismatch(input) {
    aType(isObj(input), 'classifySchemaMismatch: input required');
    aType(Array.isArray(input.expectedHeaders), 'classifySchemaMismatch: expectedHeaders[] required');
    var expected = input.expectedHeaders.map(str);
    var exists = input.exists !== false;
    var actual = Array.isArray(input.actualHeaders) ? input.actualHeaders.map(str) : [];
    var rowWidths = Array.isArray(input.rowWidths) ? input.rowWidths.slice() : null;
    var policy = str(input.extraColumnsPolicy).toUpperCase() === 'ALLOW' ? 'ALLOW' : 'BLOCK';

    var have = {}; actual.forEach(function (h) { if (h !== '') have[h] = 1; });
    var expectedSet = {}; expected.forEach(function (h) { expectedSet[h] = 1; });
    var missingHeaders = expected.filter(function (h) { return !have[h]; });
    var duplicateHeaders = dupHeaders(actual);
    var blankHeaderIndexes = blankIndexes(actual);
    var unexpectedHeaders = actual.filter(function (h) { return h !== '' && !expectedSet[h]; });
    // order mismatch: the expected sequence must appear as the leading prefix in the same order.
    var orderMismatch = false;
    for (var i = 0; i < expected.length; i++) { if (actual[i] !== expected[i]) { orderMismatch = true; break; } }
    var rowWidthMismatch = false;
    if (rowWidths) { for (var r = 0; r < rowWidths.length; r++) { if (rowWidths[r] > actual.length) { rowWidthMismatch = true; break; } } }

    // fail-closed status precedence (most structural first). A blank header is NEVER silently accepted.
    var schemaStatus;
    if (!exists) schemaStatus = SCHEMA_STATUS.SHEET_MISSING;
    else if (actual.length === 0) schemaStatus = SCHEMA_STATUS.HEADER_MISSING;
    else if (blankHeaderIndexes.length) schemaStatus = SCHEMA_STATUS.HEADER_BLANK;
    else if (duplicateHeaders.length) schemaStatus = SCHEMA_STATUS.HEADER_DUPLICATE;
    else if (missingHeaders.length) schemaStatus = SCHEMA_STATUS.HEADER_MISSING;
    else if (orderMismatch) schemaStatus = SCHEMA_STATUS.HEADER_ORDER_MISMATCH;
    else if (policy === 'BLOCK' && unexpectedHeaders.length) schemaStatus = SCHEMA_STATUS.HEADER_UNEXPECTED;
    else if (rowWidthMismatch) schemaStatus = SCHEMA_STATUS.ROW_WIDTH_MISMATCH;
    else schemaStatus = SCHEMA_STATUS.SCHEMA_VALID;

    return {
      schemaStatus: schemaStatus, valid: schemaStatus === SCHEMA_STATUS.SCHEMA_VALID,
      actualHeaders: actual, expectedHeaders: expected, missingHeaders: missingHeaders,
      blankHeaderIndexes: blankHeaderIndexes, duplicateHeaders: duplicateHeaders,
      unexpectedHeaders: unexpectedHeaders, orderMismatch: orderMismatch, rowWidthMismatch: rowWidthMismatch,
      extraColumnsPolicy: policy
    };
  }

  // ---- RULE S0-7 — read-only Canonical snapshot (getSheetByName + getDataRange().getValues() ONLY) ----------
  // A dedicated read-only adapter. It reuses NO ensure/create/repair function and performs ZERO mutation.
  function createReadOnlyTableSnapshot(spreadsheet, sheetName) {
    aType(isObj(spreadsheet) && typeof spreadsheet.getSheetByName === 'function', 'createReadOnlyTableSnapshot: spreadsheet.getSheetByName required');
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return { exists: false, headers: [], rows: [], rowCount: 0, rowWidths: [] };
    var lastRow = typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : null;
    if (lastRow === 0) return { exists: true, headers: [], rows: [], rowCount: 0, rowWidths: [] };
    var values = sheet.getDataRange().getValues();
    if (!values || !values.length) return { exists: true, headers: [], rows: [], rowCount: 0, rowWidths: [] };
    var headers = values[0].map(str);
    var rows = [], rowWidths = [];
    for (var r = 1; r < values.length; r++) { rows.push(values[r].slice()); rowWidths.push(values[r].length); }
    return { exists: true, headers: headers, rows: rows, rowCount: rows.length, rowWidths: rowWidths };
  }

  // validateCanonicalHeaders — thin PURE wrapper (headers/rowWidths in → classification report). No Spreadsheet.
  function validateCanonicalHeaders(snapshot, expectedHeaders, opts) {
    opts = isObj(opts) ? opts : {};
    var s = isObj(snapshot) ? snapshot : {};
    return classifySchemaMismatch({
      exists: s.exists, actualHeaders: s.headers || [], rowWidths: s.rowWidths || null,
      expectedHeaders: expectedHeaders, extraColumnsPolicy: opts.extraColumnsPolicy
    });
  }

  // validateCanonicalTable — full JSON-safe report for one Canonical table. Enforces the EXACT Spreadsheet-ID
  // gate FIRST (fail-closed), then validates the Header read-only. Performs ZERO mutation in every case.
  // opts = { sheetName, expectedHeaders, expectedSpreadsheetId, extraColumnsPolicy }
  function validateCanonicalTable(spreadsheet, opts) {
    aType(isObj(opts) && str(opts.sheetName) !== '', 'validateCanonicalTable: opts.sheetName required');
    aType(Array.isArray(opts.expectedHeaders), 'validateCanonicalTable: opts.expectedHeaders[] required');
    var idCheck = checkExpectedSpreadsheetId(spreadsheet, opts.expectedSpreadsheetId);
    if (!idCheck.ok) {
      return {
        ready: false, spreadsheetId: idCheck.spreadsheetId, sheetName: opts.sheetName,
        schemaStatus: SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, actualHeaders: [], expectedHeaders: opts.expectedHeaders.map(str),
        missingHeaders: opts.expectedHeaders.map(str), blankHeaderIndexes: [], duplicateHeaders: [], unexpectedHeaders: [],
        orderMismatch: false, rowCount: 0, issues: [{ reason: SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET }]
      };
    }
    var snap = createReadOnlyTableSnapshot(spreadsheet, opts.sheetName);
    var c = validateCanonicalHeaders(snap, opts.expectedHeaders, { extraColumnsPolicy: opts.extraColumnsPolicy });
    var issues = c.schemaStatus === SCHEMA_STATUS.SCHEMA_VALID ? [] : [{ reason: c.schemaStatus }];
    return {
      ready: c.valid, spreadsheetId: idCheck.spreadsheetId, sheetName: opts.sheetName,
      schemaStatus: c.schemaStatus, actualHeaders: c.actualHeaders, expectedHeaders: c.expectedHeaders,
      missingHeaders: c.missingHeaders, blankHeaderIndexes: c.blankHeaderIndexes, duplicateHeaders: c.duplicateHeaders,
      unexpectedHeaders: c.unexpectedHeaders, orderMismatch: c.orderMismatch, rowCount: snap.rowCount, issues: issues
    };
  }

  // ---- RULE S0-6 — HEADER ROW WRITE BARRIER ----------------------------------------------------------------
  // Enforced by CODE. Any runtime write whose range intersects row 1 throws HEADER_WRITE_PROHIBITED. Data-row
  // writes are permitted only at startRow >= 2 in a write mode. headerRow is fixed at 1 for Canonical tables.
  function assertDataRowWriteRange(op) {
    aType(isObj(op), 'assertDataRowWriteRange: op required');
    var startRow = Number(op.startRow);
    var numRows = op.numberOfRows === undefined ? (op.numRows === undefined ? 1 : Number(op.numRows)) : Number(op.numberOfRows);
    if (!(startRow >= 1)) throw safetyError(BARRIER.HEADER_WRITE_PROHIBITED, 'invalid startRow ' + op.startRow);
    if (numRows < 1) numRows = 1;
    if (startRow <= 1) throw safetyError(BARRIER.HEADER_WRITE_PROHIBITED, (op.operation || 'write') + ' intersects Header row 1 on ' + (op.sheetName || '?'));
    return { ok: true, startRow: startRow, endRow: startRow + numRows - 1 };
  }

  // assertRuntimeMutationAllowed — the single gate every writer routes through. Structural ops throw; whole-sheet
  // replacement throws; SCHEMA_MIGRATION without a valid authorization DTO throws; data-row writes in a write mode
  // are validated against the Header barrier. Returns {ok, mode, operation}.
  function assertRuntimeMutationAllowed(op) {
    aType(isObj(op), 'assertRuntimeMutationAllowed: op required');
    var operation = str(op.operation);
    var mode = str(op.executionMode) || EXECUTION_MODES.RUNTIME_WRITE;

    if (mode === EXECUTION_MODES.SCHEMA_MIGRATION) {
      var auth = validateMigrationAuthorization(op.migrationAuthorization);
      if (!auth.valid) throw safetyError(BARRIER.MIGRATION_AUTHORIZATION_REQUIRED, 'missing: ' + auth.missing.join(','));
      return { ok: true, mode: mode, operation: operation, migration: true };
    }
    // Not migration → structural / whole-sheet operations are hard-blocked regardless of range.
    if (WHOLE_SHEET_OPS[operation]) throw safetyError(BARRIER.WHOLE_SHEET_REPLACEMENT_PROHIBITED, operation + ' outside SCHEMA_MIGRATION');
    if (STRUCTURAL_OPS[operation]) throw safetyError(BARRIER.STRUCTURAL_MUTATION_PROHIBITED, operation + ' outside SCHEMA_MIGRATION');
    if (mode === EXECUTION_MODES.RUNTIME_READ || mode === EXECUTION_MODES.DIAGNOSTIC_READ) {
      // read modes never write; any write operation in a read mode is a header/structural violation.
      if (operation) throw safetyError(BARRIER.STRUCTURAL_MUTATION_PROHIBITED, 'write "' + operation + '" attempted in ' + mode);
      return { ok: true, mode: mode, operation: operation };
    }
    // RUNTIME_WRITE data-row upsert: must clear the Header barrier.
    assertDataRowWriteRange(op);
    return { ok: true, mode: mode, operation: operation };
  }

  // ---- RULE S0-3 — EXPLICIT MIGRATION AUTHORIZATION (a boolean is NEVER sufficient) -------------------------
  var MIGRATION_REQUIRED_FIELDS = ['migrationId', 'expectedSpreadsheetId', 'expectedSheetName', 'expectedOldHeaderHash', 'expectedNewHeaderHash', 'backupReference', 'execute', 'actor'];
  function validateMigrationAuthorization(dto) {
    if (!isObj(dto)) return { valid: false, missing: MIGRATION_REQUIRED_FIELDS.slice() };
    var missing = MIGRATION_REQUIRED_FIELDS.filter(function (f) {
      if (f === 'execute') return typeof dto.execute !== 'boolean';
      return str(dto[f]) === '';
    });
    return { valid: missing.length === 0, missing: missing, execute: dto.execute === true };
  }

  // deterministic Header hash (FNV-1a 32-bit hex) — for migration old/new Header authorization compare. No clock.
  function headerHash(headers) {
    aType(Array.isArray(headers), 'headerHash: headers[] required');
    var canon = headers.map(str).join('');
    var h = 0x811c9dc5;
    for (var i = 0; i < canon.length; i++) { h ^= canon.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  return {
    EXECUTION_MODES: EXECUTION_MODES, SCHEMA_STATUS: SCHEMA_STATUS, BARRIER: BARRIER,
    STRUCTURAL_OPS: Object.keys(STRUCTURAL_OPS), WHOLE_SHEET_OPS: Object.keys(WHOLE_SHEET_OPS),
    MIGRATION_REQUIRED_FIELDS: MIGRATION_REQUIRED_FIELDS.slice(),
    assertExpectedSpreadsheetId: assertExpectedSpreadsheetId,
    checkExpectedSpreadsheetId: checkExpectedSpreadsheetId,
    classifySchemaMismatch: classifySchemaMismatch,
    validateCanonicalHeaders: validateCanonicalHeaders,
    createReadOnlyTableSnapshot: createReadOnlyTableSnapshot,
    validateCanonicalTable: validateCanonicalTable,
    assertDataRowWriteRange: assertDataRowWriteRange,
    assertRuntimeMutationAllowed: assertRuntimeMutationAllowed,
    validateMigrationAuthorization: validateMigrationAuthorization,
    headerHash: headerHash
  };
});
