// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 41_shipping_allocation_schema_audit.gs — Round C2-D1 READ-ONLY schema evidence diagnostic
//
//   Phase-1 Allocation Draft header evidence tool. EDITOR-RUN ONLY.
//   NOT ROUTED: no doGet / doPost / router action / trigger / page ever calls it (verify: 01_router.gs
//   contains no reference; no Runtime function invokes auditShippingAllocationSchemaReadOnly).
//
//   READS ONLY  : shipping_allocation_drafts + shipping_allocation_draft_lines (header row + data rows)
//   of the configured EXACT Production DB (exact-ID guard; wrong/blank target fails closed).
//   ZERO MUTATION: never insertSheet / insertColumn / deleteColumn / moveColumns / setValues / setValue /
//   clear / create / repair / migrate. It is physically read-path only.
//   NO BUSINESS DATA: it returns column NAMES, COUNTS and deterministic HASHES only — never a raw cell value.
//   NO FULL ID     : the configured Spreadsheet id is masked in output.
//
//   Canonical source of truth = the RUNNING-STACK handler constants (single source, no duplication):
//     SHIPPING_ALLOCATION_DRAFTS_HEADERS_ / SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ (16_shipping_allocation_handlers.gs).
//   Phase-1 model authority = Model 1 (D-C2-1). Owner doc: docs/planning/ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md.
//
//   The sad* helpers below are PURE (no SpreadsheetApp / no Date / no Math.random) and are unit-tested in Node
//   (assets/tests/allocation-draft-schema-audit.test.js). Only the auditShippingAllocationSchemaReadOnly wrapper
//   touches SpreadsheetApp, and it performs read calls exclusively. NO live apply function exists in this file.
// ============================================================

// ---- deterministic pure hash — FNV-1a 32-bit, 8 hex chars. No Date/Math.random; identical in Node + Apps Script V8.
function sadAuditHash_(text) {
  var s = String(text == null ? '' : text);
  var h = 0x811c9dc5;                                   // FNV offset basis
  for (var i = 0; i < s.length; i++) {
    h = h ^ s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;                // multiply by FNV prime, keep 32-bit unsigned
  }
  var hex = (h >>> 0).toString(16);
  while (hex.length < 8) hex = '0' + hex;
  return hex;
}

// Normalize one cell to a deterministic string WITHOUT exposing it downstream (only the hash is returned).
function sadAuditNormCell_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return 'D:' + v.getTime();   // epoch → tz-independent
  return String(v);
}

// Deterministic header hash over trimmed names.
function sadAuditHeaderHash_(headers) {
  var list = (headers || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  return sadAuditHash_('hdr:' + list.length + ':' + list.join(''));
}

// Deterministic data-row content hash (rolling — bounded memory, no raw values retained).
function sadAuditRowsHash_(rows) {
  var list = rows || [];
  var acc = '';
  for (var r = 0; r < list.length; r++) {
    var row = list[r] || [];
    var parts = [];
    for (var c = 0; c < row.length; c++) parts.push(sadAuditNormCell_(row[c]));
    acc = sadAuditHash_(acc + '|' + parts.join(''));
  }
  return sadAuditHash_('rows:' + list.length + ':' + acc);
}

// Pure header comparison vs the canonical (running-stack) order. Returns a JSON-safe report; never mutates.
function sadAuditCompareHeaders_(actualHeaders, canonicalHeaders) {
  var actual = (actualHeaders || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  var canonical = (canonicalHeaders || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  var count = {};
  var blankHeaderIndexes = [];
  actual.forEach(function (h, i) { if (h === '') blankHeaderIndexes.push(i); else count[h] = (count[h] || 0) + 1; });
  var duplicateHeaders = [];
  for (var k in count) { if (count.hasOwnProperty(k) && count[k] > 1) duplicateHeaders.push(k); }
  var canonSet = {}; canonical.forEach(function (h) { canonSet[h] = 1; });
  var actualSet = {}; actual.forEach(function (h) { if (h !== '') actualSet[h] = 1; });
  var missingHeaders = canonical.filter(function (h) { return !actualSet[h]; });
  var extraHeaders = actual.filter(function (h) { return h !== '' && !canonSet[h]; });
  var prefixMatch = true, firstMismatchIndex = -1, mismatchAt = null;
  for (var j = 0; j < canonical.length; j++) {
    if (actual[j] !== canonical[j]) {
      prefixMatch = false; firstMismatchIndex = j;
      mismatchAt = { index: j, expected: canonical[j], actual: (j < actual.length ? actual[j] : null) };
      break;
    }
  }
  var exactMatch = prefixMatch && actual.length === canonical.length;
  var reorderedHeaders = [];
  canonical.forEach(function (h, ci) { var ai = actual.indexOf(h); if (ai >= 0 && ai !== ci) reorderedHeaders.push({ header: h, canonicalIndex: ci, actualIndex: ai }); });
  return {
    exactMatch: exactMatch, prefixMatch: prefixMatch, firstMismatchIndex: firstMismatchIndex, mismatchAt: mismatchAt,
    missingHeaders: missingHeaders, extraHeaders: extraHeaders, duplicateHeaders: duplicateHeaders,
    blankHeaderIndexes: blankHeaderIndexes, reorderedHeaders: reorderedHeaders
  };
}

// Report NON-canonical, non-blank columns that carry data — NAME + INDEX + non-blank COUNT only (never values).
function sadAuditPopulatedExtraColumns_(actualHeaders, canonicalHeaders, rows) {
  var actual = (actualHeaders || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  var canonSet = {}; (canonicalHeaders || []).forEach(function (h) { canonSet[String(h == null ? '' : h).trim()] = 1; });
  var list = rows || [];
  var out = [];
  actual.forEach(function (h, ci) {
    if (h === '' || canonSet[h]) return;
    var nonBlank = 0;
    for (var r = 0; r < list.length; r++) {
      var v = (list[r] || [])[ci];
      if (v !== null && v !== undefined && String(v).trim() !== '') nonBlank++;
    }
    if (nonBlank > 0) out.push({ header: h, columnIndex: ci, nonBlankCount: nonBlank });   // only columns that actually carry data
  });
  return out;
}

// PLAN-ONLY migration classification. Precedence: most-structural first. Never returns a mutation.
function sadClassifyMigration_(cmp, populatedExtra) {
  if (cmp.duplicateHeaders.length || cmp.blankHeaderIndexes.length) return 'DUPLICATE_OR_BLANK_HEADER_BLOCKED';
  if (cmp.missingHeaders.length) return 'MISSING_CANONICAL_COLUMN_REQUIRES_MIGRATION';
  if ((populatedExtra || []).length) return 'EXTRA_POPULATED_COLUMNS_REQUIRES_MAPPING_DECISION';
  if (cmp.exactMatch) return 'NO_MIGRATION_REQUIRED';
  if (cmp.prefixMatch) return 'EXTRA_EMPTY_COLUMNS_SAFE_CANDIDATE';   // canonical is the exact leading prefix; only empty extras trail
  if (cmp.missingHeaders.length === 0) return 'REORDER_ONLY_SAFE_CANDIDATE';  // all canonical present, no populated extras → name-based reorder is safe
  return 'UNKNOWN_BLOCKED';
}

// PLAN-ONLY proposed mapping. Actions: KEEP / MOVE / ADD_BLANK / PRESERVE_LEGACY / DECISION_REQUIRED.
// It NEVER emits DELETE — dropping any column is a later, explicit, separately-authorized user decision.
function sadBuildMigrationPlan_(actualHeaders, canonicalHeaders, populatedExtra) {
  var actual = (actualHeaders || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  var canonical = (canonicalHeaders || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  var populatedSet = {}; (populatedExtra || []).forEach(function (p) { populatedSet[p.header] = 1; });
  var plan = [];
  canonical.forEach(function (h, ti) {
    var si = actual.indexOf(h);
    if (si < 0) plan.push({ sourceHeader: null, sourceIndex: -1, targetHeader: h, targetIndex: ti, action: 'ADD_BLANK' });
    else if (si === ti) plan.push({ sourceHeader: h, sourceIndex: si, targetHeader: h, targetIndex: ti, action: 'KEEP' });
    else plan.push({ sourceHeader: h, sourceIndex: si, targetHeader: h, targetIndex: ti, action: 'MOVE' });
  });
  var canonSet = {}; canonical.forEach(function (h) { canonSet[h] = 1; });
  actual.forEach(function (h, si) {
    if (h === '' || canonSet[h]) return;
    plan.push({ sourceHeader: h, sourceIndex: si, targetHeader: null, targetIndex: -1, action: populatedSet[h] ? 'DECISION_REQUIRED' : 'PRESERVE_LEGACY' });
  });
  return plan;
}

// Assemble the full per-table evidence report from PURE inputs (headers + rows + canonical). No I/O.
function sadAuditBuildTableReport_(table, exists, actualHeaders, rows, canonicalHeaders) {
  var canonical = (canonicalHeaders || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  if (!exists) {
    return {
      table: table, exists: false, rowCount: 0, columnCount: 0, actualHeaders: [], canonicalHeaders: canonical,
      actualHeaderHash: sadAuditHeaderHash_([]), canonicalHeaderHash: sadAuditHeaderHash_(canonical),
      exactMatch: false, prefixMatch: false, firstMismatchIndex: -1, mismatchAt: null,
      missingHeaders: canonical.slice(), extraHeaders: [], duplicateHeaders: [], blankHeaderIndexes: [],
      reorderedHeaders: [], populatedExtraColumns: [], dataRowContentHash: sadAuditRowsHash_([]),
      migrationClassification: 'UNKNOWN_BLOCKED', proposedMigrationPlan: []
    };
  }
  var cmp = sadAuditCompareHeaders_(actualHeaders, canonical);
  var populated = sadAuditPopulatedExtraColumns_(actualHeaders, canonical, rows);
  return {
    table: table, exists: true, rowCount: (rows || []).length, columnCount: (actualHeaders || []).length,
    actualHeaders: (actualHeaders || []).map(function (h) { return String(h == null ? '' : h).trim(); }),
    canonicalHeaders: canonical,
    actualHeaderHash: sadAuditHeaderHash_(actualHeaders), canonicalHeaderHash: sadAuditHeaderHash_(canonical),
    exactMatch: cmp.exactMatch, prefixMatch: cmp.prefixMatch, firstMismatchIndex: cmp.firstMismatchIndex, mismatchAt: cmp.mismatchAt,
    missingHeaders: cmp.missingHeaders, extraHeaders: cmp.extraHeaders, duplicateHeaders: cmp.duplicateHeaders,
    blankHeaderIndexes: cmp.blankHeaderIndexes, reorderedHeaders: cmp.reorderedHeaders,
    populatedExtraColumns: populated, dataRowContentHash: sadAuditRowsHash_(rows),
    migrationClassification: sadClassifyMigration_(cmp, populated), proposedMigrationPlan: sadBuildMigrationPlan_(actualHeaders, canonical, populated)
  };
}

// Canonical accessors — read the running-stack handler globals (single source of truth); [] if absent (fail soft, report-only).
function sadAuditCanonicalDraftsHeaders_() {
  return (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_ !== 'undefined' && SHIPPING_ALLOCATION_DRAFTS_HEADERS_) ? SHIPPING_ALLOCATION_DRAFTS_HEADERS_.slice() : [];
}
function sadAuditCanonicalLinesHeaders_() {
  return (typeof SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ !== 'undefined' && SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_) ? SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.slice() : [];
}

// ---- exact-ID guard + masking (fail closed; never leaks the full id) --------------------------------------
function sadAuditExpectedId_() {
  return (typeof PRODUCTION_DB_SPREADSHEET_ID_ !== 'undefined' && PRODUCTION_DB_SPREADSHEET_ID_) ? String(PRODUCTION_DB_SPREADSHEET_ID_) : '';
}
function sadAuditMaskId_(id) {
  var s = String(id || '');
  if (s === '') return '';
  if (s.length <= 8) return '***';
  return s.slice(0, 4) + '…' + s.slice(-4);
}
// Opens ONLY the configured exact id (no active/first-open/fuzzy fallback); verifies getId()===id; reuses the
// frozen S0-5 gate when present. Throws (fail closed) on blank/mismatch.
function sadAuditOpenExactTarget_() {
  var id = sadAuditExpectedId_();
  if (id === '') throw new Error('no configured expected Spreadsheet ID (fail closed)');
  var ss = SpreadsheetApp.openById(id);
  if (!ss || typeof ss.getId !== 'function' || String(ss.getId()) !== id) throw new Error('exact-ID mismatch (fail closed)');
  if (typeof prodAssertDbTarget_ === 'function') prodAssertDbTarget_(ss, id);
  return ss;
}

// ---- EDITOR-RUN diagnostic (the ONLY function here that touches SpreadsheetApp; read calls only) -----------
// Run manually from the Apps Script editor against the configured Production DB. NOT routed. Logs + returns JSON.
function auditShippingAllocationSchemaReadOnly() {
  var out = { generatedBy: 'auditShippingAllocationSchemaReadOnly', readOnly: true, mutation: 'NONE', maskedTarget: sadAuditMaskId_(sadAuditExpectedId_()), tables: [] };
  var ss;
  try { ss = sadAuditOpenExactTarget_(); }
  catch (guardErr) {
    out.error = 'WRONG_SPREADSHEET_TARGET';
    out.detail = 'exact-ID guard failed (fail closed) — no sheet read';
    if (typeof Logger !== 'undefined') Logger.log(JSON.stringify(out));
    return out;
  }
  var tables = ['shipping_allocation_drafts', 'shipping_allocation_draft_lines'];
  for (var t = 0; t < tables.length; t++) {
    var name = tables[t];
    var canonical = name === 'shipping_allocation_drafts' ? sadAuditCanonicalDraftsHeaders_() : sadAuditCanonicalLinesHeaders_();
    var sheet = ss.getSheetByName(name);
    if (!sheet) { out.tables.push(sadAuditBuildTableReport_(name, false, [], [], canonical)); continue; }
    var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
    var headers = (lastCol > 0) ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    var rows = (lastRow > 1 && lastCol > 0) ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    out.tables.push(sadAuditBuildTableReport_(name, true, headers, rows, canonical));
  }
  if (typeof Logger !== 'undefined') Logger.log(JSON.stringify(out));
  return out;
}
