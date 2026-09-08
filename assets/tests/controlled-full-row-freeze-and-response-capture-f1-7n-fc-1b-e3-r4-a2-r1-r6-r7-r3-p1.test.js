// F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R3-P1 — FULL-ROW FREEZE, AND THE RESPONSE SOMEBODY ACTUALLY RECEIVED.
//
// R3 froze eighteen fields and called the result byte-identical. The live tables carry 36 header columns and
// 31 line columns, so eighteen fields could not have proved that sentence: a generation that touched
// create_idempotency_key, formula_version, source_data_as_of or expected_arrival would have moved a row while
// every fingerprint stayed equal. A claim that cannot fail is not evidence.
//
// And R3's readback recomputed 61_'s decision and printed it beside the database as though it were the reply
// the browser received. It never was. A run that answered something else entirely would have been reported as
// agreement, because nothing in the readback had ever seen a response body.
//
// So this suite holds four things:
//   (1) the fingerprint covers EVERY canonical column, in the SCHEMA AUTHORITY's order, and a technical
//       exclusion is a STOP rather than a footnote;
//   (2) the freeze covers every id the scope can reach at any status, plus the header-to-line relation, so a
//       row created and immediately cancelled is not invisible;
//   (3) an unreadable reservation table is a named state, never a null standing in for zero;
//   (4) expected_production_decision, actual_browser_response and database_observed_after are three objects
//       and none of them may stand in for another — CONFIRMED needs all three.
//
// Nothing here flips a flag, deploys, presses Generate or writes. The browser snippets are EXECUTED against a
// double rather than eyeballed.
//
// Run: node assets/tests/controlled-full-row-freeze-and-response-capture-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r3-p1.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fail = 0, pass = 0;
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

// ================================================================================================================
// THE WORLD IS LOADED FROM THE R6-R7-R3 SUITE, NOT COPIED — the same rule every round since R2. A second copy
// of the fixtures would let two suites disagree about what production looks like, which is the class of defect
// this round is closing.
// ================================================================================================================
var R3_OF = 'assets/tests/controlled-no-action-activation-manifest-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r3.test.js';
var R3_SRC = read(R3_OF).replace(/\r\n/g, '\n');
var CUT = R3_SRC.indexOf("\nsection('A ");
if (CUT < 0) throw new Error('the R6-R7-R3 suite no longer opens its assertions with section()');
var SHARED = (new Function('require', '__dirname', '__filename', 'module', 'exports', 'console',
  R3_SRC.slice(0, CUT)
  + '\nreturn { World: World, failed: failed, swap: swap, extractFn: extractFn, extractVar: extractVar,'
  + ' extractStmt: extractStmt, snippet: snippet, CENSUS: CENSUS, G61: G61, live: live,'
  + ' projection: projection, NLF: NLF, deployment: deployment, W: W, runIt: runIt, manifest: manifest,'
  + ' lineOf: lineOf, labels: labels, proofOf: proofOf, freezeFrom: freezeFrom, readback: readback,'
  + ' CLEAN_AUDIT: CLEAN_AUDIT, auditSrc: auditSrc, DEPLOYMENT_BUILD: DEPLOYMENT_BUILD };'
))(require, __dirname, __filename, module, exports, { log: function () {}, error: function () {} });

var World = SHARED.World, failed = SHARED.failed, swap = SHARED.swap;
var extractFn = SHARED.extractFn, extractVar = SHARED.extractVar, extractStmt = SHARED.extractStmt;
var snippet = SHARED.snippet, CENSUS = SHARED.CENSUS, G61 = SHARED.G61, live = SHARED.live;
var NLF = SHARED.NLF, W = SHARED.W, runIt = SHARED.runIt, manifest = SHARED.manifest;
var lineOf = SHARED.lineOf, labels = SHARED.labels, proofOf = SHARED.proofOf;
var freezeFrom = SHARED.freezeFrom, readback = SHARED.readback;
var CLEAN_AUDIT = SHARED.CLEAN_AUDIT, auditSrc = SHARED.auditSrc;
var DEPLOYMENT_BUILD = SHARED.DEPLOYMENT_BUILD;

var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G41 = read('assets/specs/active/apps-script/41_shipping_allocation_schema_audit.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var G00 = read('assets/specs/active/apps-script/00_config.gs');
var RO = require('./_release-order.js');

function withCensus(src, entry, over, opts) {
  var o = {};
  Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
  o.census = src;
  return runIt(entry, over, o);
}

// The canonical column lists, read from 16_ the same way the census reads them.
var AUTH = vm.runInNewContext([
  extractVar(G16, 'SHIPPING_ALLOCATION_DRAFTS_HEADERS_'),
  extractVar(G16, 'SAD_LIFECYCLE_TAIL_COLUMNS_'),
  extractVar(G16, 'SAD_ROUTE_IDENTITY_TAIL_COLUMNS_'),
  extractVar(G16, 'SAD_CREATE_IDEMPOTENCY_TAIL_COLUMNS_'),
  extractVar(G16, 'SAD_HEADER_OPTIONAL_TAIL_COLUMNS_'),
  extractVar(G16, 'SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_'),
  extractVar(G16, 'SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_'),
  extractVar(G16, 'SAD_LINE_ETA_TAIL_COLUMNS_'),
  extractVar(G16, 'SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_'),
  '({ header: SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_, line: SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_ })'
].join(NLF));

// A pure world holding only the census helpers under test and the project normalizers they call.
var PURE = (function () {
  var src = [
    extractStmt(CENSUS, 'R6R7_SEP_'),
    extractStmt(CENSUS, 'R6R7_SEP2_'),
    extractStmt(CENSUS, 'R6R7_SCHEMA_TABLES_'),
    'function CENSUS_str_(v) { return String(v == null ? "" : v).trim(); }',
    'function CENSUS_low_(v) { return CENSUS_str_(v).toLowerCase(); }',
    extractFn(CENSUS, 'CENSUS_fp_'),
    extractFn(CENSUS, 'CENSUS_r6r7FieldClass_'),
    extractFn(CENSUS, 'CENSUS_r6r7NormCell_'),
    extractFn(CENSUS, 'CENSUS_r6r7FullRowSnapshot_'),
    extractFn(CENSUS, 'CENSUS_r6r7CompareSnapshots_'),
    extractVar(G16, 'SAD_K2_FP_DATE_FIELDS_'),
    extractVar(G16, 'SAD_K2_FP_NUMERIC_FIELDS_'),
    extractFn(G16, 'sadCanonDate_'),
    extractFn(G16, 'sadFpNorm_'),
    extractFn(G16, 'sadFpVal_'),
    extractFn(G41, 'sadAuditNormCell_'),
    '({ snap: CENSUS_r6r7FullRowSnapshot_, norm: CENSUS_r6r7NormCell_, cls: CENSUS_r6r7FieldClass_,',
    '   cmp: CENSUS_r6r7CompareSnapshots_, fp: CENSUS_fp_ })'
  ].join(NLF);
  return vm.runInNewContext(src, { Date: Date, String: String, Number: Number, Math: Math, Object: Object,
    Array: Array, isFinite: isFinite, isNaN: isNaN, JSON: JSON });
})();

// Mutating the LIVE header row of a sheet, the way a migration would. The census must notice.
function headerEdit(table, fn) {
  return '(function(){ var sh = SpreadsheetApp.openById("x").getSheetByName(' + JSON.stringify(table) + ');'
    + ' (' + fn + ')(sh.rows[0]); })();';
}
// A reservations sheet that does not exist in the base double.
function reservations(rows) {
  return '(function(){ var b = SpreadsheetApp.openById("x"); var g = b.getSheetByName;'
    + ' var data = ' + JSON.stringify(rows) + ';'
    + ' b.getSheetByName = function (n) { if (n === "reservations") { return {'
    + '   getDataRange: function () { return { getValues: function () { return data; } }; },'
    + '   getLastRow: function () { return data.length; } }; } return g.call(b, n); }; })();';
}
function unreadableReservations() {
  return '(function(){ var b = SpreadsheetApp.openById("x"); var g = b.getSheetByName;'
    + ' b.getSheetByName = function (n) { if (n === "reservations") { return {'
    + '   getDataRange: function () { throw new Error("BOOM"); },'
    + '   getLastRow: function () { return 1; } }; } return g.call(b, n); }; })();';
}

// ================================================================================================================
section('A — the fingerprint covers every canonical column, in the authority\'s order');
// ================================================================================================================

eq(AUTH.header.length, 36, 'A1  the header authority is 36 columns');
eq(AUTH.line.length, 31, 'A1a and the line authority is 31');

var SA = extractFn(CENSUS, 'CENSUS_r6r7SchemaAuthority_');
ok(SA.indexOf('SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_') > 0
  && SA.indexOf('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_') > 0,
  'A2  the census reads 16_\'s own constants as the column authority');
ok(SA.indexOf('Object.keys') < 0,
  'A2a and never Object.keys — key order on a row read out of a sheet is an accident, not a contract');
ok(extractFn(CENSUS, 'CENSUS_r6r7FullRowSnapshot_').indexOf('Object.keys') < 0,
  'A2b nor does the snapshot builder');

var M = manifest();
eq(M.res.verdict, 'READY_TO_AUTHORIZE', 'A3  a full-schema world is READY_TO_AUTHORIZE');
eq(failed(M.res), [], 'A3a with no condition unmet');
var B = M.res.frozen_before;
eq([B.header_column_count, B.line_column_count], [36, 31], 'A4  the freeze records 36 and 31 columns');
ok(!!B.header_schema_version && !!B.line_schema_version, 'A4a and a schema version for each table');
eq(B.header_schema_version, 'FB4G-A2R3-CREATE-IDEMPOTENCY-1',
  'A4b the header version is one 16_ enumerates, not one this census invented');
ok(!!B.header_column_names_fingerprint && !!B.line_column_names_fingerprint,
  'A4c and a fingerprint over the column NAMES, so a rename is a schema change');

var SNAPS = [['route_a_header_snapshot', 36], ['route_a_line_snapshot', 31],
  ['route_b_header_snapshot', 36], ['route_b_line_snapshot', 31]];
SNAPS.forEach(function (c, i) {
  var sn = B[c[0]];
  eq(sn.canonical_field_count, c[1], 'A5' + (i ? String.fromCharCode(96 + i) : '') + '  ' + c[0] + ' names ' + c[1] + ' canonical columns');
  eq(sn.covered_field_count, c[1], 'A5' + (i ? String.fromCharCode(96 + i) : '') + '-cov and covers all ' + c[1]);
  eq(sn.excluded_fields, [], 'A5' + (i ? String.fromCharCode(96 + i) : '') + '-exc excluding none');
});

// THE COLUMNS THE OLD EIGHTEEN NEVER SAW. Named individually, because 'covers 36' would still pass if the
// snapshot covered thirty-six of the wrong ones.
var OLD18 = vm.runInNewContext(extractStmt(CENSUS, 'R6R7_FP_FIELDS_') + ' R6R7_FP_FIELDS_');
var UNCOVERED = ['create_idempotency_key', 'formula_version', 'source_data_as_of', 'calculated_at',
  'planning_cycle', 'submitted_at', 'cancel_reason', 'expired_by_run_id',
  'recommended_source_warehouse_id', 'recommended_destination_warehouse_id'];
UNCOVERED.forEach(function (f, i) {
  ok(OLD18.indexOf(f) === -1 && Object.prototype.hasOwnProperty.call(B.route_a_header_snapshot.fields, f),
    'A6' + String.fromCharCode(97 + i) + ' ' + f + ' was outside the eighteen and is inside the full row');
});
var LINE_UNCOVERED = ['window_code', 'window_start_date', 'required_by_date', 'units_per_carton',
  'expected_arrival', 'recommendation_flags', 'allocation_sequence', 'site_sku'];
LINE_UNCOVERED.forEach(function (f, i) {
  ok(OLD18.indexOf(f) === -1 && Object.prototype.hasOwnProperty.call(B.route_a_line_snapshot.fields, f),
    'A7' + String.fromCharCode(97 + i) + ' ' + f + ' likewise, on the line');
});

['route_a', 'route_b'].forEach(function (r, i) {
  var h = B[r + '_header_full_fingerprint'], l = B[r + '_line_full_fingerprint'],
    c = B[r + '_combined_full_fingerprint'];
  ok(typeof h === 'string' && h.length === 8 && typeof l === 'string' && l.length === 8
    && typeof c === 'string' && c.length === 8,
    'A8' + (i ? 'a' : '') + '  ' + r + ' carries a header, a line and a combined fingerprint');
  ok(h !== l, 'A8' + (i ? 'b' : '-x') + ' and the two halves are distinct');
});
ok(B.route_a_combined_full_fingerprint !== B.route_b_combined_full_fingerprint,
  'A9  the two routes are different rows');

// ORDER IS PART OF THE CONTRACT. The same cells in a different column order are a different fingerprint,
// which is exactly why the order comes from the authority and not from whatever the sheet handed back.
var row = {}; AUTH.header.forEach(function (c, i) { row[c] = 'v' + i; });
var fwd = PURE.snap('t', row, AUTH.header, AUTH.header);
var rev = PURE.snap('t', row, AUTH.header.slice().reverse(), AUTH.header);
eq(PURE.snap('t', row, AUTH.header, AUTH.header).fingerprint, fwd.fingerprint, 'A10 the snapshot is deterministic');
ok(fwd.fingerprint !== rev.fingerprint, 'A10a a reordered column list is a different fingerprint');
eq(fwd.covered_field_count, 36, 'A10b and the forward one covered all 36');

// A COLUMN THE LIVE SHEET DOES NOT HAVE IS EXCLUDED, AND SAYS SO.
var narrow = PURE.snap('t', row, AUTH.header, AUTH.header.slice(0, 30));
eq(narrow.covered_field_count, 30, 'A11 a 30-column live sheet covers 30');
eq(narrow.excluded_fields.length, 6, 'A11a and names the six it could not cover');
eq(narrow.excluded_fields[0].reason, 'NOT_PRESENT_IN_LIVE_SCHEMA', 'A11b under its own reason');

// ================================================================================================================
section('B — a schema that moved is a STOP, because two schemas are two different tables');
// ================================================================================================================

function schemaStop(label, table, fn, predicate) {
  var m = manifest(live(), { after: headerEdit(table, fn) });
  eq(m.res.verdict, 'STOP', label);
  ok(failed(m.res).indexOf(predicate) >= 0, label + ' — because ' + predicate);
  return m;
}
schemaStop('B1  a 37th header column', 'shipping_allocation_drafts',
  'function (h) { h.push("surprise_col"); }', 'header_schema_is_a_recognized_generation');
schemaStop('B2  a header column removed', 'shipping_allocation_drafts',
  'function (h) { h.pop(); }', 'header_live_columns_equal_the_canonical_authority');
var B2b = manifest(live(), { after: headerEdit('shipping_allocation_drafts', 'function (h) { h.pop(); }') });
ok(failed(B2b.res).indexOf('route_A_excluded_no_field_from_the_byte_identical_claim') >= 0,
  'B2a and the byte-identical claim refuses to be made over a narrower row');
eq(B2b.res.frozen_before.route_a_header_snapshot.excluded_fields.length, 1,
  'B2b the excluded column is named rather than quietly dropped');
schemaStop('B3  two header columns swapped', 'shipping_allocation_drafts',
  'function (h) { var t = h[3]; h[3] = h[4]; h[4] = t; }', 'header_schema_is_a_recognized_generation');
schemaStop('B4  a line column removed', 'shipping_allocation_draft_lines',
  'function (h) { h.pop(); }', 'line_live_columns_equal_the_canonical_authority');
schemaStop('B5  a line column renamed', 'shipping_allocation_draft_lines',
  'function (h) { h[2] = "sku_renamed"; }', 'line_column_names_match_the_authority_byte_for_byte');

// AND A SCHEMA THAT MOVED BETWEEN THE FREEZE AND THE READBACK.
var FZ = freezeFrom();
var B6 = readback(FZ, live(), { after: headerEdit('shipping_allocation_drafts',
  'function (h) { h.pop(); }') });
eq(B6.res.verdict, 'STOP', 'B6  a header column that vanished after the freeze STOPS');
ok(failed(B6.res).indexOf('header_column_count_did_not_move') >= 0
  && failed(B6.res).indexOf('header_column_names_did_not_move') >= 0,
  'B6a naming both the count and the names');
var B7 = readback(FZ, live(), { after: headerEdit('shipping_allocation_draft_lines',
  'function (h) { h[2] = "sku_renamed"; }') });
eq(B7.res.verdict, 'STOP', 'B7  a renamed line column after the freeze STOPS');
ok(failed(B7.res).indexOf('line_column_names_did_not_move') >= 0, 'B7a under the line names predicate');

// ================================================================================================================
section('C — a column the eighteen never covered moves, and the readback catches it');
// ================================================================================================================

function moved(label, over, table, field) {
  var r = readback(FZ, over);
  eq(r.res.verdict, 'STOP', label);
  ok(failed(r.res).indexOf('route_A_' + table + '_is_byte_identical_across_every_column') >= 0
    || failed(r.res).indexOf('route_B_' + table + '_is_byte_identical_across_every_column') >= 0,
    label + ' — the full-row fingerprint moved');
  ok(r.res.changed_fields.some(function (c) { return c.field === field; }),
    label + ' — and ' + field + ' is named');
  return r;
}
var C1 = moved('C1  create_idempotency_key on the header',
  { aHeader: { create_idempotency_key: 'IDEM-XYZ' } }, 'header', 'create_idempotency_key');
// THE POINT OF THE ROUND, IN ONE ASSERTION: the eighteen-field view saw nothing.
ok(failed(C1.res).indexOf('route_A_route_view_is_byte_identical') < 0,
  'C1a while the eighteen-field route view reported no change at all');
eq(C1.res.changed_fields.filter(function (c) { return c.field === 'create_idempotency_key'; })[0].was, '',
  'C1b and the diff carries what it was, so a repair manifest has something to be built from');

var C2 = moved('C2  formula_version on the header',
  { aHeader: { formula_version: 'FV-9' } }, 'header', 'formula_version');
ok(failed(C2.res).indexOf('route_A_route_view_is_byte_identical') < 0, 'C2a invisible to the eighteen');
var C3 = moved('C3  source_data_as_of on the header',
  { aHeader: { source_data_as_of: '2026-09-07' } }, 'header', 'source_data_as_of');
var C4 = moved('C4  expected_arrival on the line',
  { aLine: { expected_arrival: '2026-11-01' } }, 'line', 'expected_arrival');
ok(failed(C4.res).indexOf('route_A_route_view_is_byte_identical') < 0, 'C4a invisible to the eighteen');
var C5 = moved('C5  units_per_carton on the line',
  { aLine: { units_per_carton: '24' } }, 'line', 'units_per_carton');
var C6 = moved('C6  recommendation_flags on the line',
  { aLine: { recommendation_flags: 'AI_SEEDED' } }, 'line', 'recommendation_flags');
var C7 = moved('C7  cancel_reason on Route B\'s header',
  { bHeader: { cancel_reason: 'superseded' } }, 'header', 'cancel_reason');

// AND THE DIFF IS COMPUTED EVERY TIME, not only when a fingerprint disagrees.
var C8 = readback(FZ);
eq(C8.res.verdict, 'CONTROLLED_NO_ACTION_CONFIRMED', 'C8  an untouched plan still CONFIRMS');
eq(C8.res.changed_fields, [], 'C8a with an empty diff that was actually computed');
eq(C8.res.counts.changed_fields, 0, 'C8b and counted');
eq([C8.res.routes_observed[0].covered_field_count, C8.res.routes_observed[1].covered_field_count], [67, 67],
  'C8c 67 columns compared per route — 36 header plus 31 line');

// ================================================================================================================
section('D — the same instant in two representations is not a change; a different instant is');
// ================================================================================================================

var T = Date.UTC(2026, 8, 6, 6, 31, 12);
eq(PURE.norm('updated_at', new Date(T)), PURE.norm('updated_at', new Date(T)),
  'D1  two Date objects for the same instant normalize identically');
ok(PURE.norm('updated_at', new Date(T)).indexOf('D:') === 0,
  'D1a through 41_\'s cell normalizer, which reduces a Date to its epoch');
ok(PURE.norm('updated_at', new Date(T)) !== PURE.norm('updated_at', new Date(T + 1000)),
  'D2  and a different instant is a different value');
eq(PURE.cls('updated_at'), 'INSTANT_OR_TEXT', 'D2a updated_at is an instant, not a calendar day');

eq(PURE.cls('window_start_date'), 'DAY', 'D3  a business date is a DAY field, by 16_\'s own list');
eq(PURE.norm('window_start_date', '2026-09-06'),
  PURE.norm('window_start_date', new Date(Date.UTC(2026, 8, 5, 16, 0, 0))),
  'D3a a day-grained date compares equal to a Date at that Taipei calendar day');
ok(PURE.norm('window_start_date', '2026-09-06') !== PURE.norm('window_start_date', '2026-09-07'),
  'D3b while a different day is still different');

eq(PURE.cls('planned_qty'), 'NUMERIC', 'D4  a quantity is NUMERIC');
eq(PURE.norm('planned_qty', '320'), PURE.norm('planned_qty', 320), 'D4a 320 and "320" are one value');
eq(PURE.norm('planned_qty', '320.0'), PURE.norm('planned_qty', 320), 'D4b and so is 320.0');
ok(PURE.norm('planned_qty', 320) !== PURE.norm('planned_qty', 321), 'D4c 321 is not');

// NO SECOND PARSER. Every normalizer the census uses is named and belongs to the project.
var NORM_FN = extractFn(CENSUS, 'CENSUS_r6r7NormCell_');
ok(NORM_FN.indexOf('sadFpNorm_') > 0 && NORM_FN.indexOf('sadAuditNormCell_') > 0
  && NORM_FN.indexOf('sadFpVal_') > 0, 'D5  the normalizer delegates to the three project authorities');
ok(!/new Date|Date\.parse|getTimezoneOffset|getUTC|\d{4}\)-/.test(NORM_FN),
  'D5a and parses nothing itself — a second timestamp parser is the thing this forbids');
ok(extractFn(CENSUS, 'CENSUS_r6r7FieldClass_').indexOf('SAD_K2_FP_DATE_FIELDS_') > 0,
  'D5b and the field classes come from 16_\'s lists rather than a list typed here');
var NA = manifest().res.normalizers;
eq(NA.available, true, 'D6  the manifest reports the normalizer authority as available');
eq(NA.missing, [], 'D6a with nothing missing');
eq(NA.second_parser_written_here, false, 'D6b and says in the record that it wrote none');

// A REPRESENTATION-ONLY DIFFERENCE END TO END: frozen as a Date, read back as the string for the same day.
var D7 = readback(freezeFrom(live({ aLine: { window_start_date: new Date(Date.UTC(2026, 8, 5, 16, 0, 0)) } })),
  live({ aLine: { window_start_date: '2026-09-06' } }));
eq(D7.res.verdict, 'CONTROLLED_NO_ACTION_CONFIRMED',
  'D7  a Date frozen and a string read back for the SAME day is not a change');
eq(D7.res.changed_fields, [], 'D7a and nothing is listed as moved');
var D8 = readback(freezeFrom(live({ aLine: { window_start_date: new Date(Date.UTC(2026, 8, 5, 16, 0, 0)) } })),
  live({ aLine: { window_start_date: '2026-09-07' } }));
eq(D8.res.verdict, 'STOP', 'D8  a genuinely different day still STOPS');

// ================================================================================================================
section('E — every id the scope can reach, at any status, and the relation between them');
// ================================================================================================================

var U = B.identity_universe;
eq(U.available, true, 'E1  the identity universe is freezable');
eq(U.header_ids, ['SADH-K4-38523A90', 'SADH-K4-A3872518'], 'E1a holding both headers, sorted');
eq(U.line_ids, ['SADL-K2-344FB2B2', 'SADL-K2-92B8BAD2'], 'E1b and both lines');
eq(U.relations.length, 2, 'E1c with the header-to-line relation recorded');
eq(U.counts_by_status_and_provenance, { 'draft|manual': 2 },
  'E1d counted by status AND provenance, not only by status');
ok(!!U.relation_fingerprint && !!U.universe_fingerprint, 'E1e and two fingerprints over the whole set');

function universeStop(label, over, predicate) {
  var r = readback(FZ, over);
  eq(r.res.verdict, 'STOP', label);
  ok(failed(r.res).indexOf(predicate) >= 0, label + ' — because ' + predicate);
  return r;
}
// THE CASE THE ACTIVE-ROW VIEW CANNOT SEE: created, then immediately cancelled.
var E2 = universeStop('E2  a header created and immediately cancelled',
  { extraHeaders: [{ allocation_draft_id: 'SADH-CANX', status: 'cancelled',
      generation_type: 'system_generated', generation_run_id: 'AIRUN-CANX' }] },
  'no_header_id_appeared_at_any_status');
eq(E2.res.new_rows, [], 'E2a and the ACTIVE-row view saw nothing at all, which is the point');
eq(E2.res.universe_diff.new_header_ids, ['SADH-CANX'], 'E2b the universe names the id for the repair manifest');

universeStop('E3  a header created and immediately expired',
  { extraHeaders: [{ allocation_draft_id: 'SADH-EXPX', status: 'expired',
      generation_type: 'system_generated', generation_run_id: 'AIRUN-EXPX' }] },
  'no_header_id_appeared_at_any_status');
universeStop('E4  a line created under an existing header',
  { extraLines: [{ allocation_draft_line_id: 'SADL-NEWX', allocation_draft_id: 'SADH-K4-38523A90',
      planned_qty: '10' }] },
  'no_line_id_appeared_at_any_status');
universeStop('E5  an existing header soft-deleted out of the scope',
  { aHeader: { marketplace: 'Walmart' } }, 'no_header_id_vanished');
var E6 = universeStop('E6  an existing header flipped to cancelled',
  { bHeader: { status: 'cancelled' } }, 'no_status_or_provenance_moved_anywhere_in_the_scope');
var E7 = universeStop('E7  a run id written onto an existing header',
  { bHeader: { generation_run_id: 'AIRUN-ADOPT' } },
  'no_status_or_provenance_moved_anywhere_in_the_scope');
universeStop('E8  a line reassigned to the other header',
  { aLine: { allocation_draft_id: 'SADH-K4-A3872518' } }, 'the_header_to_line_relation_did_not_change');
universeStop('E9  a line that disappeared', { dropA: true }, 'no_line_id_vanished');

// AND HISTORY THAT DOES NOT MOVE IS NOT A PROBLEM: a terminal row present at both ends still CONFIRMS.
var HIST = { extraHeaders: [{ allocation_draft_id: 'SADH-OLD', status: 'cancelled' }] };
var E10 = readback(freezeFrom(live(HIST)), live(HIST));
eq(E10.res.verdict, 'CONTROLLED_NO_ACTION_CONFIRMED',
  'E10 a terminal row frozen at both ends is history, not a change');
eq(E10.res.counts.universe_headers, 3, 'E10a and it IS in the universe, counted');

// ================================================================================================================
section('F — the reservation observation is a named state, never a null standing in for zero');
// ================================================================================================================

var STATES = vm.runInNewContext(extractStmt(CENSUS, 'R6R7_RESERVATION_STATES_') + ' R6R7_RESERVATION_STATES_');
eq(STATES, ['SHEET_ABSENT', 'SHEET_PRESENT_AND_READABLE', 'SHEET_PRESENT_BUT_UNREADABLE'],
  'F1  three observation states, named');
eq(M.res.reservation_observation.observation_state, 'SHEET_ABSENT',
  'F2  this database has no reservations table');
eq(M.res.reservation_observation.authority, 'SERVER_MANIFEST_GUARANTEED_ZERO_MUTATION',
  'F2a so the claim rests on 61_\'s structural guarantee, and says which leg answered');
eq(M.res.reservation_observation.acceptable, true, 'F2b which is an acceptable answer');
eq(M.res.reservation_observation.row_count, null, 'F2c with NO count invented for it');

// ABSENT WITHOUT THE GUARANTEE CARRIES NOTHING.
var noMan = swap(CENSUS,
  "    var man = (typeof weeklyAiPlanActivationManifest_ === 'function') ? weeklyAiPlanActivationManifest_() : null;",
  '    var man = null;');
var F3 = withCensus(noMan, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST');
eq(F3.res.verdict, 'STOP', 'F3  an absent table with no server guarantee STOPS');
ok(failed(F3.res).indexOf('reservation_table_is_not_present_but_unreadable') >= 0,
  'F3a because nothing carries the claim');
eq(F3.res.reservation_observation.authority, 'NONE', 'F3b and the authority is honestly NONE');

// PRESENT BUT UNREADABLE IS THE STATE THAT CANNOT BE WORKED AROUND.
var F4 = manifest(live(), { after: unreadableReservations() });
eq(F4.res.reservation_observation.observation_state, 'SHEET_PRESENT_BUT_UNREADABLE', 'F4  named');
eq(F4.res.reservation_observation.acceptable, false, 'F4a and not acceptable');
eq(F4.res.reservation_observation.row_count, null, 'F4b with no count');
eq(F4.res.verdict, 'STOP', 'F4c so the manifest STOPS');

// PRESENT AND READABLE IS COMPARED BY IDS AND BY A FINGERPRINT OVER EVERY COLUMN.
var RESV_HDR = ['reservation_id', 'company', 'country', 'marketplace', 'sku', 'qty', 'status'];
var RESV_BASE = [RESV_HDR, ['RSV-1', 'ResUS', 'US', 'Amazon', 'CO1100-R', 5, 'open'],
  ['RSV-2', 'ResUS', 'US', 'Walmart', 'CO1100-R', 9, 'open']];
var F5m = manifest(live(), { after: reservations(RESV_BASE) });
eq(F5m.res.reservation_observation.observation_state, 'SHEET_PRESENT_AND_READABLE', 'F5  readable when it exists');
eq(F5m.res.reservation_observation.authority, 'OBSERVED_ROWS', 'F5a and the authority is the rows themselves');
eq(F5m.res.reservation_observation.scoped_ids, ['RSV-1'],
  'F5b scoped to the four axes, so another marketplace\'s row is not counted as ours');
eq(F5m.res.reservation_observation.row_count, 2, 'F5c while the whole-table count is still reported');
eq(F5m.res.verdict, 'READY_TO_AUTHORIZE', 'F5d and a readable table is fine to authorize against');

var FZR = freezeFrom(live(), { after: reservations(RESV_BASE) });
var F6 = readback(FZR, live(), { after: reservations(RESV_BASE) });
eq(F6.res.verdict, 'CONTROLLED_NO_ACTION_CONFIRMED', 'F6  an unchanged reservations table CONFIRMS');
var F7 = readback(FZR, live(), { after: reservations(RESV_BASE.concat(
  [['RSV-3', 'ResUS', 'US', 'Amazon', 'CO1100-R', 2, 'open']])) });
eq(F7.res.verdict, 'STOP', 'F7  a new scoped reservation row STOPS');
ok(failed(F7.res).indexOf('no_reservation_row_appeared_in_the_scope') >= 0, 'F7a by name');
var CHANGED = [RESV_HDR, ['RSV-1', 'ResUS', 'US', 'Amazon', 'CO1100-R', 6, 'open'],
  ['RSV-2', 'ResUS', 'US', 'Walmart', 'CO1100-R', 9, 'open']];
var F8 = readback(FZR, live(), { after: reservations(CHANGED) });
eq(F8.res.verdict, 'STOP', 'F8  a scoped row changed IN PLACE STOPS');
ok(failed(F8.res).indexOf('every_scoped_reservation_row_is_byte_identical') >= 0,
  'F8a caught by the per-row fingerprint, which a count alone would have missed');
eq(F8.res.counts.reservation_rows, 2, 'F8b the count is unchanged, which is exactly why the count is not enough');

// AND THE OBSERVATION STATE ITSELF MUST NOT DRIFT.
var F9 = readback(FZR, live());
eq(F9.res.verdict, 'STOP', 'F9  a table that existed at freeze time and is gone now STOPS');
ok(failed(F9.res).indexOf('reservation_observation_state_did_not_change') >= 0, 'F9a by name');

var RB_SRC = extractFn(CENSUS, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK');
ok(RB_SRC.indexOf('resvComparable') < 0,
  'F10 the old nullable-count comparison is gone entirely');
ok(proofOf(M).reservation.observation_state === 'SHEET_ABSENT'
  && proofOf(M).reservation.authority === 'SERVER_MANIFEST_GUARANTEED_ZERO_MUTATION',
  'F11 and the bounded proof carries both the state and the authority');

// ================================================================================================================
section('G — three objects, and none of them stands in for another');
// ================================================================================================================

var G = readback(FZ);
eq(G.res.verdict, 'CONTROLLED_NO_ACTION_CONFIRMED', 'G1  all three present and agreeing CONFIRMS');
eq([G.res.expected_production_decision.measured_here, G.res.expected_production_decision.is_the_actual_response],
  [true, false], 'G1a the expected decision is measured here and is NOT the actual response');
eq(G.res.actual_browser_response.measured_here, false,
  'G1b the actual response is NOT measured here');
eq(G.res.actual_browser_response.supplied_by_operator, true, 'G1c it was supplied by a person');
eq(G.res.database_observed_after.measured_here, true, 'G1d the database is measured here');
ok(String(G.res.actual_browser_response.why_not_measured_here).indexOf('nobody received') > 0,
  'G1e and the reason a recomputed decision may not stand in is stated');

// WITHOUT THE THIRD OBJECT THERE IS NO CONFIRMATION, however perfect the other two are.
var G2 = readback(FZ, live(), { noAudit: true });
eq(G2.res.verdict, 'AWAITING_ACTIVATION',
  'G2  flag off, baseline frozen, database identical: AWAITING_ACTIVATION, not CONFIRMED');
eq(failed(G2.res), [], 'G2a and it is not a failure — nothing has happened yet');
eq(G2.res.actual_browser_response.supplied_by_operator, false, 'G2b the third object is simply absent');
ok(String(G2.res.stop_reason).indexOf('AWAITING_ACTIVATION') === 0,
  'G2c under its own code rather than a generic STOP');
eq(G2.res.expected_production_decision.outcome, 'AI_PLAN_NO_ACTION',
  'G2d even though the expected decision is a perfect no-action');

var G3 = readback(FZ, live(), { noAudit: true, flagTrue: true });
eq(G3.res.verdict, 'AWAITING_BROWSER_AUDIT',
  'G3  flag on and no audit pasted: AWAITING_BROWSER_AUDIT');
ok(G3.res.actual_browser_response.missing_fields.length > 0, 'G3a naming what is missing');
ok(String(G3.res.stop_reason).indexOf('UNKNOWN is not CONFIRMED') > 0,
  'G3b and saying that unknown is not confirmed');

var G4 = readback(FZ, live(), { audit: { captured: false } });
eq(G4.res.verdict, 'ACTUAL_RESPONSE_NOT_CAPTURED',
  'G4  an audit pasted with no captured body has its own verdict');
ok(String(G4.res.stop_reason).indexOf('says a request finished, not what it') > 0,
  'G4a and it says a timeline phase is not a response body');

function auditStop(label, over, predicate) {
  var r = readback(FZ, live(), { audit: over });
  eq(r.res.verdict, 'STOP', label);
  ok(failed(r.res).indexOf(predicate) >= 0, label + ' — because ' + predicate);
  return r;
}
auditStop('G5  the response says it wrote while the rows say it did not',
  { db_writes: 1 }, 'the_actual_response_and_the_database_agree');
auditStop('G6  the response outcome differs from the expected decision',
  { response_outcome: 'AI_PLAN_GENERATED' }, 'the_expected_decision_and_the_actual_response_agree');
auditStop('G7  the response code differs', { response_code: 'PARTIAL' },
  'the_actual_response_code_is_no_replenishment_required');
auditStop('G8  the response created a header', { created_headers: 1 },
  'every_mutation_counter_in_the_actual_response_is_zero');
auditStop('G9  the response says the writer was reached', { writer_reached: true },
  'the_actual_response_says_the_writer_was_not_reached');
auditStop('G10 two generation requests', { generation_requests: 2, exactly_one_generation_request: false,
  new_mutation_requests: 2 }, 'exactly_one_generation_request_was_made');
auditStop('G11 a route save rode along', { route_save_requests: 1 },
  'no_route_save_or_submit_or_reservation_request_rode_along');
auditStop('G12 a Submit rode along', { submit_requests: 1 },
  'no_route_save_or_submit_or_reservation_request_rode_along');
auditStop('G13 the capture never restored the original function', { capture_restored: false },
  'the_capture_restored_the_original_function');
auditStop('G14 a second generation call was made', { capture_calls: 2 },
  'no_second_generation_call_was_made');
auditStop('G15 the response carried a route', { routes_count: 1 },
  'the_actual_response_carries_no_route_and_no_group');

// AND THE DATABASE STILL OUTRANKS A CLEAN-LOOKING RESPONSE.
var G16r = readback(FZ, { aHeader: { create_idempotency_key: 'IDEM-Q' } });
eq(G16r.res.verdict, 'STOP', 'G16 a perfect response beside a moved row is still a STOP');
ok(failed(G16r.res).indexOf('the_actual_response_and_the_database_agree') >= 0,
  'G16a and the disagreement between the two halves is named');

// ================================================================================================================
section('K — R5-R1: the readback expected the OTHER correct class and refused a completed activation');
// ================================================================================================================
//
// THE FALSE NEGATIVE. A controlled activation ran once, produced the correct answer, and the readback said
// STOP on three predicates. None of the three was about production.
//
//   1. no_route_save_or_submit_or_reservation_request_rode_along   expected [0,0,0]  observed [null,null,null]
//   2. the_actual_response_quantities_match_the_frozen_baseline    expected [0,520,0] observed [160,520,0]
//   3. every_mutation_counter_in_the_actual_response_is_zero       …[0,0,0,0,0,0,null,0]
//
// (2) is the root defect: the gate hardcoded `recommended_qty: 0`, which is the VALID_ZERO_RECOMMENDATION
// class written in as though it were the only one. The frozen baseline said 160 and the response said 160,
// and they were compared against a literal that agreed with neither.
//
// (1) and (3) are ONE defect, and it is not a production one: six fields were read by unconditional value
// gates while being absent from R6R7_ACTUAL_RESPONSE_REQUIRED_. An incomplete paste therefore passed the
// completeness check and then failed the value checks — reporting a paste omission in the vocabulary of a
// backend omission. A gate can only be trusted when the completeness check guarantees its input exists.

// THE WORLD THE R5-R1 EVIDENCE DESCRIBES: D18/D30/D45 = 0, D90 = 160, standing manual plan 520.
var K_FC = { gap: { d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 0, d30_suggested_qty: 0,
  d45_gap_qty: 0, d45_suggested_qty: 0, d90_gap_qty: 160, d90_suggested_qty: 160 } };
var KFZ = freezeFrom(live(K_FC));
eq([KFZ.before.recommended_qty, KFZ.before.qualifying_active_planned_qty, KFZ.before.residual_qty],
  [160, 520, 0], 'K0  the frozen baseline is the R5-R1 one: 160 recommended, 520 already planned, 0 residual');

// THE BROWSER RESPONSE ACTUALLY OBSERVED, field for field as the operator reported it.
var K_AUDIT = { response_outcome: 'AI_PLAN_NO_ACTION', response_code: 'NO_REPLENISHMENT_REQUIRED',
  no_action_reason: 'FULLY_COVERED_BY_ACTIVE_PLAN', recommendation_state: 'NONZERO_RECOMMENDATION',
  recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: 0 };
function kb(over, opts) {
  var a = {};
  Object.keys(K_AUDIT).forEach(function (k) { a[k] = K_AUDIT[k]; });
  Object.keys(over || {}).forEach(function (k) { a[k] = over[k]; });
  var o = { audit: a };
  Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
  return readback(KFZ, live(K_FC), o);
}

// ---- K1  THE EXACT R5-R1 EVIDENCE NOW CONFIRMS. --------------------------------------------------------
var K1 = kb();
eq(K1.res.verdict, 'CONTROLLED_NO_ACTION_CONFIRMED',
  'K1  160 / 520 / 0 against a 160 / 520 / 0 baseline CONFIRMS — the false negative is gone');
eq(failed(K1.res), [], 'K1a with no predicate failed');
eq([K1.res.no_action_class_expected.resolved_class,
  K1.res.no_action_class_expected.required_recommendation_state],
  ['FULLY_COVERED_BY_ACTIVE_PLAN', 'NONZERO_RECOMMENDATION'],
  'K1b the class is resolved, and it names the recommendation_state it therefore requires');
ok(String(K1.res.no_action_class_expected.resolved_from).indexOf('R6R7_NO_ACTION_BEFORE_') === 0,
  'K1c resolved from the FROZEN BASELINE, not from the response being marked');
eq(K1.res.no_action_class_expected.cross_class_fallback, 'PROHIBITED — an unresolved class expects nothing and refuses',
  'K1d and cross-class fallback is refused by name');
eq(K1.res.actual_response_counters.by_name,
  { created_headers: 0, created_lines: 0, updated_headers: 0, updated_lines: 0, cancelled_headers: 0,
    cancelled_lines: 0, reservations: 0, db_writes: 0 },
  'K1e every counter is reported UNDER ITS OWN NAME — the seventh never has to be traced again');
eq(K1.res.actual_response_counters.not_a_real_zero, [], 'K1f with none of them missing or non-zero');

// ---- K2  THE OLD CLASS IS UNTOUCHED. -------------------------------------------------------------------
var K2 = readback(FZ);
eq([K2.res.verdict, failed(K2.res)], ['CONTROLLED_NO_ACTION_CONFIRMED', []],
  'K2  a VALID_ZERO activation — 0 / 520 / 0 — still CONFIRMS unchanged');
eq([K2.res.no_action_class_expected.resolved_class,
  K2.res.no_action_class_expected.required_recommendation_state],
  ['VALID_ZERO_RECOMMENDATION', 'VALID_ZERO_RECOMMENDATION'],
  'K2a resolved to the zero class, whose state contract is the VALUE and not the enum key');
var K2names = K2.res.predicates.map(function (x) { return x.predicate; });
eq(K2names.filter(function (n) { return /^the_fully_covered_/.test(n); }), [],
  'K2b and no class-B-only condition is asserted against it');
ok(K1.res.predicates.map(function (x) { return x.predicate; })
  .filter(function (n) { return /^the_fully_covered_/.test(n); }).length === 2,
  'K2c while the class-B run carries two conditions class A cannot state');

// ---- K3  THE QUANTITIES ARE STRICT, TYPED AND CLASS-BOUND. ---------------------------------------------
var KQ = 'the_actual_response_quantities_match_the_frozen_baseline';
[['a FULLY_COVERED response reporting recommended 0 — the old expectation itself',
  { recommended_qty: 0 }, KQ],
 ['a FULLY_COVERED response reporting recommended 161 — one more than frozen',
  { recommended_qty: 161 }, KQ],
 ['a FULLY_COVERED response reporting recommended 159', { recommended_qty: 159 }, KQ],
 ['a qualifying total that is not the frozen one', { qualifying_planned_qty: 519 }, KQ],
 ['a residual that is not zero', { residual_qty: 1 }, KQ],
 ['a recommendation reported as a STRING rather than a number', { recommended_qty: '160' }, KQ],
 ['a plan that does not cover the recommendation',
  { qualifying_planned_qty: 100 }, 'the_fully_covered_response_plan_covers_the_whole_recommendation']
].forEach(function (c, i) {
  var r = kb(c[1]);
  eq(r.res.verdict, 'STOP', 'K3.' + (i + 1) + ' ' + c[0] + ' → STOP');
  ok(failed(r.res).indexOf(c[2]) >= 0,
    'K3.' + (i + 1) + 'a naming ' + c[2], failed(r.res).slice(0, 5));
});
// AND THE STRING CASE IS NOT COERCED. '160' == 160 is true in JavaScript; the gate must not be built on ==.
ok(kb({ recommended_qty: '160' }).res.verdict === 'STOP',
  'K3a a numeric string is not the number — no coercion anywhere in the quantity gate');

// ---- K4  CROSS-CLASS MISMATCH. -------------------------------------------------------------------------
var K4 = kb({ no_action_reason: 'VALID_ZERO_RECOMMENDATION',
  recommendation_state: 'VALID_ZERO_RECOMMENDATION', recommended_qty: 0 });
eq(K4.res.verdict, 'STOP',
  'K4  a VALID_ZERO response against a FULLY_COVERED baseline is a STOP, never absorbed');
ok(failed(K4.res).indexOf('the_actual_response_no_action_reason_is_the_frozen_class') >= 0
  && failed(K4.res).indexOf('the_actual_recommendation_state_is_exactly_the_class_contract') >= 0,
  'K4a refused by BOTH class gates, so the reader is told which class was expected', failed(K4.res));
var K4b = readback(FZ, live(), { audit: { no_action_reason: 'FULLY_COVERED_BY_ACTIVE_PLAN',
  recommendation_state: 'NONZERO_RECOMMENDATION' } });
eq(K4b.res.verdict, 'STOP', 'K4b and the mirror case — FULLY_COVERED response, VALID_ZERO baseline — too');
// THE STATE CONTRACT IS THE VALUE, AND THE ENUM KEY IS NOT IT. Both doubles in this repo had spelled the
// key; production emits the value.
var K4c = kb({ recommendation_state: 'NONZERO' });
ok(K4c.res.verdict === 'STOP'
  && failed(K4c.res).indexOf('the_actual_recommendation_state_is_exactly_the_class_contract') >= 0,
  'K4c an abbreviated recommendation_state is refused — the contract is the exact emitted value');

// ---- K5  A FROZEN BASELINE THAT RESOLVES TO NO CLASS EXPECTS NOTHING. ----------------------------------
// A null or blank frozen recommendation never reaches the class resolution: `recommended_qty` is on
// R6R7_BEFORE_REQUIRED_, so the readback answers BASELINE_NOT_FROZEN first — an earlier and better refusal,
// because it says the freeze did not take rather than describing what the baseline implies. Measured, and
// asserted here so the two refusals are not mistaken for each other.
['null', "''"].forEach(function (v, i) {
  var r = kb({}, { after: '(function(){ R6R7_NO_ACTION_BEFORE_.recommended_qty = ' + v + '; })();' });
  eq([r.res.verdict, r.res.verdict === 'CONTROLLED_NO_ACTION_CONFIRMED'],
    ['BASELINE_NOT_FROZEN', false],
    'K5.0.' + (i + 1) + ' a frozen recommendation of ' + v + ' is BASELINE_NOT_FROZEN, caught before the class');
});
// A value that IS present and still resolves to no class is the case the class gate owns.
[['a frozen recommendation that is negative', '-5'],
 ['a frozen recommendation that is a numeric string', "'160'"],
 ['a frozen recommendation that is a boolean', 'true'],
 ['a frozen recommendation that is not finite', '1/0']
].forEach(function (c, i) {
  var r = kb({}, { after: '(function(){ R6R7_NO_ACTION_BEFORE_.recommended_qty = ' + c[1] + '; })();' });
  eq(r.res.verdict, 'STOP', 'K5.' + (i + 1) + ' ' + c[0] + ' → STOP');
  ok(failed(r.res).indexOf('the_frozen_baseline_resolves_to_exactly_one_no_action_class') >= 0,
    'K5.' + (i + 1) + 'a naming the unresolved class rather than falling back to zero');
  eq(r.res.no_action_class_expected.resolved_class, null,
    'K5.' + (i + 1) + 'b and no class is claimed');
});
var K5e = kb({}, { after: "(function(){ R6R7_NO_ACTION_BEFORE_.residual_qty = 3; })();" });
ok(K5e.res.verdict === 'STOP'
  && failed(K5e.res).indexOf('the_frozen_baseline_residual_is_exactly_zero') >= 0,
  'K5e a frozen baseline whose own residual is not zero is refused before the response is judged');
var K5f = kb({}, { after: "(function(){ R6R7_NO_ACTION_BEFORE_.qualifying_active_planned_qty = 999; })();" });
ok(K5f.res.verdict === 'STOP'
  && failed(K5f.res).indexOf('the_two_frozen_authorities_agree_on_the_qualifying_plan_total') >= 0,
  'K5f and two frozen authorities that disagree is its OWN failure, not a silent preference');

// ---- K6  THE SIX FIELDS THAT WERE CHECKED WITHOUT BEING REQUIRED. --------------------------------------
// A field omitted from the paste is now an AWAITING state that NAMES the field, rather than a STOP whose
// observed value is null. That is a different answer from STOP and the right one: nothing is wrong with the
// run, the evidence is incomplete. Which awaiting state it is depends on the flag, and BOTH are real — the
// press happens with the flag on, and the flag is restored to false afterwards, so a re-paste is read back
// in the off state. Both are asserted so neither reads as a surprise.
var K6REQ = vm.runInNewContext(extractVar(CENSUS, 'R6R7_ACTUAL_RESPONSE_REQUIRED_')
  + ' R6R7_ACTUAL_RESPONSE_REQUIRED_');
['no_action_reason', 'recommendation_state', 'reservations',
 'route_save_requests', 'submit_requests', 'reservation_requests'].forEach(function (f, i) {
  ok(K6REQ.indexOf(f) >= 0, 'K6.' + (i + 1) + ' ' + f + ' is on the REQUIRED list');
  var nul = {}; nul[f] = null;
  var off = kb(nul), on = kb(nul, { flagTrue: true });
  eq([off.res.verdict, on.res.verdict], ['AWAITING_ACTIVATION', 'AWAITING_BROWSER_AUDIT'],
    'K6.' + (i + 1) + 'a a null ' + f + ' is an AWAITING state in both flag phases, never a STOP');
  eq([off.res.actual_browser_response.supplied_by_operator,
    off.res.actual_browser_response.missing_fields.indexOf(f) >= 0], [false, true],
    'K6.' + (i + 1) + 'b the evidence is incomplete and ' + f + ' is NAMED as the reason');
  ok(off.res.verdict !== 'CONTROLLED_NO_ACTION_CONFIRMED'
    && on.res.verdict !== 'CONTROLLED_NO_ACTION_CONFIRMED',
    'K6.' + (i + 1) + 'c and neither phase CONFIRMS');
});
// AND THE OBSERVED VALUE IS NO LONGER A NULL STANDING IN A GATE. This is the exact shape the round is
// closing: the ride-along gate used to report [null,null,null] against [0,0,0], which reads as a backend
// omission. It cannot happen now, because the run does not reach that gate at all.
var K6G = kb({ route_save_requests: null });
eq(failed(K6G.res).indexOf('no_route_save_or_submit_or_reservation_request_rode_along'), -1,
  'K6d an omitted ride-along field no longer fails the VALUE gate — it fails completeness, by name');
eq(failed(K6G.res), [],
  'K6e no predicate fails at all: an incomplete paste is not a wrong answer', failed(K6G.res));
// A key that is ABSENT ENTIRELY, which is not the same act as pasting a null — and is the same answer,
// because both mean nobody supplied a value. Stated rather than left to be inferred.
function kDrop(field) {
  return readback(KFZ, live(K_FC), { noAudit: true, after: auditSrc(K_AUDIT)
    + '(function(){ delete R6R7_ACTUAL_BROWSER_RESPONSE_[' + JSON.stringify(field) + ']; })();' });
}
['route_save_requests', 'reservations'].forEach(function (f, i) {
  var r = kDrop(f);
  eq([r.res.verdict, r.res.actual_browser_response.missing_fields.indexOf(f) >= 0],
    ['AWAITING_ACTIVATION', true],
    'K6a.' + (i + 1) + ' ' + f + ' ABSENT is the same answer as null — nobody supplied a value');
});

// ---- K7  AND A REAL VALUE THAT IS WRONG IS A STOP, which is a different thing again. -------------------
[['a non-zero reservations counter', { reservations: 1 },
  'every_mutation_counter_in_the_actual_response_is_zero'],
 ['a non-zero reservations counter, named by the browser authority', { reservations: 2 },
  'the_browser_response_reservations_counter_is_a_real_zero'],
 ['a route save that rode along', { route_save_requests: 1 },
  'no_route_save_or_submit_or_reservation_request_rode_along'],
 ['a Submit that rode along', { submit_requests: 1 },
  'no_route_save_or_submit_or_reservation_request_rode_along'],
 ['a reservation request that rode along', { reservation_requests: 1 },
  'no_route_save_or_submit_or_reservation_request_rode_along']
].forEach(function (c, i) {
  var r = kb(c[1]);
  eq(r.res.verdict, 'STOP', 'K7.' + (i + 1) + ' ' + c[0] + ' → STOP');
  ok(failed(r.res).indexOf(c[2]) >= 0, 'K7.' + (i + 1) + 'a naming ' + c[2], failed(r.res).slice(0, 5));
});
// THE COUNTER THAT IS NOT A ZERO IS NAMED, so nobody counts positions in an array again.
eq(kb({ reservations: 4 }).res.actual_response_counters.not_a_real_zero, ['reservations=4'],
  'K7a the offending counter is reported BY NAME with its value');

// ---- K8  THE TWO RESERVATION AUTHORITIES ARE DIFFERENT FACTS. ------------------------------------------
var K8 = K1.res.reservation_counter_authorities;
eq(K8.browser_response_reservations, 0, 'K8  the browser response counter is reported on its own');
ok(String(K8.browser_response_source).indexOf('R6R7_ACTUAL_BROWSER_RESPONSE_.reservations') === 0,
  'K8a under the constant it actually came from');
ok(typeof K8.database_observed_state === 'string' && K8.database_observed_state.length > 0,
  'K8b beside the DATABASE-observed state, which is a named state and not a number', K8.database_observed_state);
ok(String(K8.database_observed_source).indexOf('the reservations table') === 0,
  'K8c and the database authority names the table it read');
ok(String(K8.apps_script_sandbox_reservation_writes).indexOf('reservation_writes') > 0
  && String(K8.apps_script_sandbox_reservation_writes).indexOf('neither of the two above') > 0,
  'K8d while reservation_writes is named as a THIRD, different counter, not a synonym for either');

// ================================================================================================================
section('H — the capture snippet, executed against a double');
// ================================================================================================================

var CAP_SNIP = snippet('R6R7_BROWSER_CAPTURE_SNIPPET_');
var AUDIT_SNIP = snippet('R6R7_BROWSER_AUDIT_SNIPPET_');
var BASE_SNIP = snippet('R6R7_BROWSER_BASELINE_SNIPPET_');

// A synchronous thenable. The wrapper only asks `typeof r.then === 'function'`, so this exercises the real
// resolve/reject paths without making the suite asynchronous.
function thenOk(v) { return { then: function (ok2) { return thenOk(ok2 ? ok2(v) : v); } }; }
function thenErr(e) { return { then: function (ok2, er) { if (!er) throw e; return thenOk(er(e)); } }; }

function browserWorld(opts) {
  opts = opts || {};
  var log = [], calls = [], timers = [];
  var ctx = { JSON: JSON, String: String, Number: Number, Math: Math, Object: Object, Array: Array,
    Error: Error, Promise: Promise, RegExp: RegExp, Boolean: Boolean, isFinite: isFinite,
    console: { log: function (m) { log.push(String(m)); } } };
  ctx.window = ctx;
  ctx.setTimeout = function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; };
  var orig = function () {
    calls.push({ self: this, args: Array.prototype.slice.call(arguments) });
    if (opts.mode === 'reject') return thenErr(opts.error || { code: 'TIMEOUT', message: 'gateway timeout' });
    if (opts.mode === 'throw') throw new Error('SYNC_BOOM');
    if (opts.mode === 'pending') return { then: function () { return this; } };
    return thenOk(opts.response === undefined ? { data: { outcome: 'AI_PLAN_NO_ACTION' } } : opts.response);
  };
  ctx.KM = { DB: { generateWeeklyAiPlanDraft: orig },
    transport: { timeline: function () {
      var rows = opts.timeline || [];
      return { request_timeline: rows.slice(), requests: rows.length,
        mutations: rows.filter(function (r) { return r.kind === 'write'; }),
        mutation_requests: rows.filter(function (r) { return r.kind === 'write'; }).length };
    } } };
  vm.createContext(ctx);
  return { ctx: ctx, log: log, calls: calls, timers: timers, orig: orig };
}
function install(w) { return vm.runInContext(CAP_SNIP, w.ctx); }

// R6-R7-R3 - THE FIXTURE WAS MODELLING THE READER, NOT THE CONTRACT, and that is why this suite passed
// while the live capture reported seven nulls. The counters used to sit in `data.summary` here because that
// is where the capture snippet looked; 61_'s weeklyAiPlanNoActionResponse_ has never had a `summary`
// sub-object and states every counter FLAT on `data`. A double that agrees with the code under test instead
// of with the contract cannot fail, and this one could not. It is now the real shape, and F-ENV below reads
// 61_ to prove it stays the real shape.
var NO_ACTION_ENVELOPE = { success: true, data: { outcome: 'AI_PLAN_NO_ACTION',
  code: 'NO_REPLENISHMENT_REQUIRED', no_action_reason: 'VALID_ZERO_RECOMMENDATION',
  recommendation_state: 'VALID_ZERO_RECOMMENDATION', recommended_qty: 0, qualifying_planned_qty: 520, residual_qty: 0,
  db_writes: 0, writer_reached: false, routes: [], groups: [],
  created_headers: 0, created_lines: 0, updated_headers: 0, updated_lines: 0,
  cancelled_headers: 0, cancelled_lines: 0, reservations: 0 },
  // The things a sanitized capture must NOT carry out.
  auth_token: 'SECRET-TOKEN-123', headers: { Authorization: 'Bearer SECRET' },
  request_payload: { everything: 'the page sent' } };

var H1w = browserWorld({ response: NO_ACTION_ENVELOPE });
var H1 = install(H1w);
eq(H1.installed, true, 'H1  the capture installs');
eq(H1w.ctx.KM.DB.generateWeeklyAiPlanDraft === H1w.orig, false, 'H1a and the function is wrapped');
eq(H1w.ctx.__R6R7_ACTUAL_RESPONSE.captured, false, 'H1b with nothing captured yet');

var host = H1w.ctx.KM.DB;
var payload = { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' };
var H2r = host.generateWeeklyAiPlanDraft(payload, 'second-arg');
eq(H1w.calls.length, 1, 'H2  the original was called exactly once — the capture adds no request');
eq(H1w.calls[0].self === host, true, 'H2a with `this` preserved');
eq(H1w.calls[0].args, [payload, 'second-arg'], 'H2b and the arguments forwarded byte-for-byte');
eq(H1w.calls[0].args[0] === payload, true, 'H2c the payload object itself, not a copy the capture built');

var CAP = H1w.ctx.__R6R7_ACTUAL_RESPONSE;
eq(CAP.captured, true, 'H3  the response body is captured');
eq([CAP.response_outcome, CAP.response_code], ['AI_PLAN_NO_ACTION', 'NO_REPLENISHMENT_REQUIRED'],
  'H3a with its outcome and code');
eq([CAP.recommended_qty, CAP.qualifying_planned_qty, CAP.residual_qty], [0, 520, 0], 'H3b and the quantities');
eq([CAP.created_headers, CAP.created_lines, CAP.updated_headers, CAP.updated_lines,
  CAP.cancelled_headers, CAP.cancelled_lines, CAP.db_writes], [0, 0, 0, 0, 0, 0, 0],
  'H3c every mutation counter');
eq([CAP.routes_count, CAP.groups_count, CAP.writer_reached], [0, 0, false], 'H3d routes, groups and the writer');
eq(JSON.stringify(CAP).indexOf('SECRET'), -1,
  'H4  and NOTHING from the token, the headers or the payload came with it');
eq(Object.keys(CAP).filter(function (k) {
  return ['auth_token', 'headers', 'request_payload'].indexOf(k) !== -1; }), [],
  'H4a the capture is a whitelist, not a redaction');
// SINGLE-USE, BUT STILL ARMED. A wrapper that removed itself the instant it had an answer could not
// refuse the second click, so the two jobs are two mechanisms: the capture fires once, and the arm
// comes off only when the audit snippet releases it.
eq(H1w.ctx.KM.DB.generateWeeklyAiPlanDraft === H1w.orig, false,
  'H5  the wrapper stays in place after the capture, so a second click can still be refused');
eq(H1w.ctx.__R6R7_CAPTURE.armed_against_second_call, true, 'H5a and says it is armed');
eq(H1w.ctx.__R6R7_CAPTURE.restored, false, 'H5b and does not yet claim to have restored anything');
H1w.ctx.__R6R7_CAPTURE.release();
eq(H1w.ctx.KM.DB.generateWeeklyAiPlanDraft === H1w.orig, true,
  'H5c release() puts the original function back');
eq(H1w.ctx.__R6R7_CAPTURE.restored, true, 'H5d and only then does restored become true');
var H6got = null; H2r.then(function (v) { H6got = v; });
eq(H6got, NO_ACTION_ENVELOPE, 'H6  the caller still receives the response unchanged');

// A SECOND CALL IS BLOCKED, LOUDLY.
var H7w = browserWorld({ response: NO_ACTION_ENVELOPE });
install(H7w);
var wrapped = H7w.ctx.KM.DB.generateWeeklyAiPlanDraft;
wrapped.call(H7w.ctx.KM.DB, payload);
var H7err = null, H7out = null;
try { H7out = wrapped.call(H7w.ctx.KM.DB, payload); } catch (e) { H7err = e; }
eq(H7w.calls.length, 1, 'H7  a second call never reaches the original');
eq(H7w.ctx.__R6R7_CAPTURE.blocked_second_call, true, 'H7a it is recorded as blocked');
ok(H7w.log.some(function (l) { return l.indexOf('SECOND_GENERATION_CALL_BLOCKED') > 0; }),
  'H7b and announced — a silent block would be as bad as a silent send');
ok(!!H7out && typeof H7out.then === 'function', 'H7c the caller gets a rejected promise, not undefined');

// REJECTION AND A SYNCHRONOUS THROW BOTH RESTORE.
var H8w = browserWorld({ mode: 'reject', error: { code: 'GATEWAY_TIMEOUT', message: 'timed out' } });
install(H8w);
var H8err = null;
try { H8w.ctx.KM.DB.generateWeeklyAiPlanDraft(payload); } catch (e) { H8err = e; }
eq(H8w.ctx.__R6R7_ACTUAL_RESPONSE.captured, false, 'H8  a rejection captures no body');
eq(H8w.ctx.__R6R7_ACTUAL_RESPONSE.resolved_or_rejected, 'rejected', 'H8a and says it was rejected');
eq(H8w.ctx.__R6R7_ACTUAL_RESPONSE.error_code, 'GATEWAY_TIMEOUT', 'H8b carrying the code');
eq(H8w.ctx.__R6R7_CAPTURE.armed_against_second_call, true,
  'H8c and the wrapper stays armed — a failed call is the LAST moment to let a retry through');
eq(H8w.ctx.__R6R7_CAPTURE.release().restored, true, 'H8c2 until release() puts the original back');
ok(H8err !== null, 'H8d while the rejection still reaches the caller');

var H9w = browserWorld({ mode: 'throw' });
install(H9w);
var H9err = null;
try { H9w.ctx.KM.DB.generateWeeklyAiPlanDraft(payload); } catch (e) { H9err = e; }
eq(H9w.ctx.__R6R7_ACTUAL_RESPONSE.captured, false, 'H9  a synchronous throw captures no body');
eq(H9w.ctx.__R6R7_ACTUAL_RESPONSE.resolved_or_rejected, 'threw', 'H9a and is recorded as a throw');
ok(H9err !== null && String(H9err.message).indexOf('SYNC_BOOM') >= 0, 'H9b and rethrown unchanged');

// A CALL THAT NEVER ANSWERS RESTORES ON THE TIMEOUT.
var H10w = browserWorld({ mode: 'pending' });
install(H10w);
H10w.ctx.KM.DB.generateWeeklyAiPlanDraft(payload);
eq(H10w.ctx.KM.DB.generateWeeklyAiPlanDraft === H10w.orig, false, 'H10 a pending call leaves the wrapper in place');
eq(H10w.timers.length, 1, 'H10a with exactly one timer armed');
H10w.timers[0].fn();
eq(H10w.ctx.KM.DB.generateWeeklyAiPlanDraft === H10w.orig, true,
  'H10b which releases and restores the original when it fires, so nothing is left patched');
eq(H10w.ctx.__R6R7_ACTUAL_RESPONSE.resolved_or_rejected, 'timeout', 'H10c and records a timeout');
ok(String(H10w.ctx.__R6R7_ACTUAL_RESPONSE.reason).indexOf('do NOT press Generate again') > 0,
  'H10d telling the operator not to retry');

// INSTALLING TWICE IS REFUSED RATHER THAN NESTED.
var H11w = browserWorld({ response: NO_ACTION_ENVELOPE });
install(H11w);
var H11 = vm.runInContext(CAP_SNIP, H11w.ctx);
eq(H11.installed, false, 'H11 a second install is refused');
ok(String(H11.reason).indexOf('ALREADY_INSTALLED') === 0, 'H11a under its own code');

// ================================================================================================================
section('I — the merged audit, and the round trip a person actually performs');
// ================================================================================================================

function req(seq, action, kind, over) {
  var r = { seq: seq, action: action, kind: kind || 'read', request_id: 'REQ-' + seq, phase: 'SUCCESS',
    outcome: 'OK', code: null, http_status: 200, attempts: 1, overlapped_with: [], routes_in_payload: null,
    allocation_draft_id: null, allocation_draft_line_ids: null, intent: null, mints_new_row: null,
    marks_source: 'OBSERVED', elapsed_ms: 120 };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
var PRIOR = [req(1, 'inventory.read'), req(2, 'inventory.read'),
  req(3, 'shippingAllocationDraft.upsertAtomic', 'write')];
var GEN = req(4, 'weeklyAiPlan.generate', 'write', { request_id: 'REQ-GEN-1', outcome: 'AI_PLAN_NO_ACTION' });

// The full sequence, in order: baseline, capture, one click, audit.
function fullRun(opts) {
  opts = opts || {};
  var rows = PRIOR.slice();
  var w = browserWorld({ response: opts.response === undefined ? NO_ACTION_ENVELOPE : opts.response,
    mode: opts.mode, timeline: rows });
  vm.runInContext(BASE_SNIP, w.ctx);
  if (!opts.noCapture) install(w);
  if (!opts.noClick) {
    try { w.ctx.KM.DB.generateWeeklyAiPlanDraft({ scope: 'ResUS/US/Amazon/CO1100-R' }); } catch (e) {}
    rows.push(opts.extraRequest || GEN);
    if (opts.secondClick) { try { w.ctx.KM.DB.generateWeeklyAiPlanDraft({}); } catch (e2) {}
      rows.push(req(5, 'weeklyAiPlan.generate', 'write')); }
  }
  var audit = vm.runInContext(AUDIT_SNIP, w.ctx);
  return { w: w, audit: audit };
}

var I1 = fullRun();
eq(I1.audit.verdict, 'ONE_GENERATION_REQUEST_AND_RESPONSE_CAPTURED',
  'I1  baseline, capture, one click, audit: the audit confirms both halves');
eq(I1.audit.delta.new_mutation_requests, 1, 'I1a one mutation REQUEST');
eq(I1.audit.delta.baseline_max_seq, 3, 'I1b measured against the baseline, not from zero');
eq(I1.audit.actual_response.captured, true, 'I1c and a response body was captured');
eq(I1.audit.capture.restored, true, 'I1d with the original restored');
eq(I1.audit.response_body_inferred_from_timeline, false,
  'I1e and the audit says the body was NOT inferred from the timeline');
eq(JSON.stringify(I1.audit.paste_block).indexOf('SECRET'), -1, 'I1f the paste block carries no secret');

// THE ROUND TRIP. The audit's paste_block goes into the census constant, and the readback confirms.
function pasteBlockSrc(block) {
  return '(function(){ var T = R6R7_ACTUAL_BROWSER_RESPONSE_; var A = ' + block
    + '; Object.keys(A).forEach(function(k){ T[k] = A[k]; }); })();';
}
var I2 = readback(FZ, live(), { noAudit: true, after: pasteBlockSrc(I1.audit.paste_block) });
eq(I2.res.verdict, 'CONTROLLED_NO_ACTION_CONFIRMED',
  'I2  the browser audit\'s own paste block, pasted verbatim, produces a CONFIRMED readback');
eq(failed(I2.res), [], 'I2a with no predicate failed');
eq(I2.res.actual_browser_response.supplied_by_operator, true, 'I2b and the third object is present');
eq(I2.res.actual_browser_response.values.captured, true, 'I2c carrying the captured body');

// NO CAPTURE INSTALLED: the timeline still says SUCCESS, and the audit refuses anyway.
var I3 = fullRun({ noCapture: true });
eq(I3.audit.delta.verdict, 'ONE_GENERATION_REQUEST', 'I3  the transport delta alone still looks clean');
eq(I3.audit.verdict, 'ACTUAL_RESPONSE_NOT_CAPTURED',
  'I3a but with no captured body the audit refuses — phase SUCCESS is not a response');
var I4 = readback(FZ, live(), { noAudit: true, after: pasteBlockSrc(I3.audit.paste_block) });
eq(I4.res.verdict, 'ACTUAL_RESPONSE_NOT_CAPTURED', 'I4  and the readback refuses on the same grounds');

// TWO CLICKS.
var I5 = fullRun({ secondClick: true });
eq(I5.audit.delta.exactly_one_generation_request, false, 'I5  two generation requests are counted as two');
eq(I5.audit.verdict, 'STOP', 'I5a and the audit STOPS');
eq(I5.audit.capture.blocked_second_call, true, 'I5b with the second call recorded as blocked');
eq(I5.w.calls.length, 1, 'I5c and the original still called only once');

// A REJECTED CALL.
var I6 = fullRun({ mode: 'reject' });
eq(I6.audit.verdict, 'ACTUAL_RESPONSE_NOT_CAPTURED', 'I6  a rejected call captures no body');
eq(I6.audit.actual_response.resolved_or_rejected, 'rejected', 'I6a and says so');

// NO BASELINE AT ALL.
var I7w = browserWorld({ response: NO_ACTION_ENVELOPE, timeline: PRIOR.concat([GEN]) });
install(I7w);
var I7 = vm.runInContext(AUDIT_SNIP, I7w.ctx);
eq(I7.delta.verdict, 'STOP', 'I7  an audit with no baseline refuses to compute a delta');
ok(String(I7.delta.reason).indexOf('NO_BASELINE') === 0, 'I7a under its own code');

// ================================================================================================================
section('J — the steps, the proofs and the record: a design round that wrote nothing');
// ================================================================================================================

var STEPS = M.res.activation_steps;
eq(STEPS.map(function (s) { return s.phase; }),
  ['PREPARE', 'PREPARE', 'PREPARE', 'PREPARE', 'AUTHORIZE', 'ACTIVATE', 'ACTIVATE', 'ACTIVATE',
    'PRESS', 'PRESS', 'READ', 'READ', 'RESTORE', 'RESTORE'],
  'J1  the phases run prepare, authorize, activate, press, read, restore');
ok(String(STEPS[8].do).indexOf('CAPTURE') > 0,
  'J1a the response capture is installed BEFORE the click, in step 9');
ok(STEPS.slice(0, 5).every(function (s) { return String(s.do).indexOf('true') < 0; }),
  'J1b and nothing before the authorization flips anything');

var MAX = vm.runInNewContext(extractStmt(CENSUS, 'R6R7_PROOF_MAX_BYTES_') + ' R6R7_PROOF_MAX_BYTES_');
[['the manifest', M], ['the readback', G]].forEach(function (c, i) {
  var raw = lineOf(c[1].world, 'r6r7_proof');
  var lab = labels(c[1].world);
  ok(raw !== null && raw.length <= MAX,
    'J2' + (i ? 'a' : '') + '  ' + c[0] + ' proof is within the cap (' + (raw ? raw.length : -1) + ' bytes)');
  ok(lab.indexOf('r6r7_proof') < lab.indexOf('r6r7_export'), 'J2' + (i ? 'b' : '-o') + ' and precedes the export');
  eq(JSON.parse(raw).proof_complete, true, 'J2' + (i ? 'c' : '-c') + ' marked complete');
});
// The proof must never carry a field MAP — that is what pushed the export past the cap in the first place.
var MPROOF = lineOf(M.world, 'r6r7_proof');
['route_a_header_snapshot', 'header_snapshot', '"fields"', 'freeze_paste_block', 'activation_steps',
  'capture_snippet', 'audit_snippet', 'relations'].forEach(function (k, i) {
  eq(MPROOF.indexOf(k), -1, 'J3' + String.fromCharCode(97 + i) + ' the proof carries no ' + k);
});

// THE PASTE BLOCK SURVIVES THE LOGGER, IN NUMBERED CHUNKS.
var PM = JSON.parse(lineOf(M.world, 'r6r7_freeze_paste_meta'));
ok(PM.chunks >= 1, 'J4  the freeze block is emitted in ' + PM.chunks + ' numbered chunk(s)');
eq(PM.paste_into, 'R6R7_NO_ACTION_BEFORE_', 'J4a naming where it goes');
var joined = '';
for (var ci = 1; ci <= PM.chunks; ci++) joined += lineOf(M.world, 'r6r7_freeze_paste_block_' + ci + '_of_' + PM.chunks);
eq(joined.length, PM.bytes, 'J4b and the chunks reassemble to the whole block');
eq(joined, M.res.freeze_paste_block, 'J4c byte for byte');
var lab = labels(M.world);
ok(lab.indexOf('r6r7_freeze_paste_block_1_of_' + PM.chunks) < lab.indexOf('r6r7_export'),
  'J4d before the detailed export, which is the part that gets truncated');
var pasted = JSON.parse(joined.slice(joined.indexOf('{')));
['header_schema_version', 'route_a_header_snapshot', 'route_b_line_snapshot', 'identity_universe',
  'reservation_observation', 'route_a_combined_full_fingerprint'].forEach(function (k, i) {
  ok(Object.prototype.hasOwnProperty.call(pasted, k),
    'J5' + String.fromCharCode(97 + i) + ' the paste block carries ' + k);
});
var REQ = vm.runInNewContext(extractStmt(CENSUS, 'R6R7_BEFORE_REQUIRED_') + ' R6R7_BEFORE_REQUIRED_');
eq(REQ.filter(function (k) { return !Object.prototype.hasOwnProperty.call(pasted, k); }), [],
  'J5x every field the readback requires is in the block a person pastes');

// NOTHING WROTE, FLIPPED, DEPLOYED OR GENERATED.
[['manifest', M], ['readback', G], ['awaiting', G2]].forEach(function (c, i) {
  eq([c[1].res.db_writes, c[1].res.writer_constructed, c[1].res.writer_calls, c[1].res.submit_calls,
    c[1].res.route_save_calls, c[1].res.reservation_writes], [0, false, 0, 0, 0, 0],
    'J6' + (i ? String.fromCharCode(96 + i) : '') + '  the ' + c[0] + ' wrote nothing, by six counters');
  eq(c[1].world.dbWrites(), 0, 'J6' + (i ? String.fromCharCode(96 + i) : '') + '-m measured on the sheets');
});
// R6-R7-R3 - RE-AIMED, NOT WAIVED. This suite's round genuinely did not move these stamps, and it was
// right to say so. R6-R7-R3 does move them: 61_ now states `reservations` in the NO_ACTION envelope, so
// the release and 63_ move with it, and the census's capture snippet changed too. An equality against
// THIS round's build can only hold until the next release, so the surviving invariant is the FLOOR - the
// file must not be BEHIND the round this suite covers. What stays exact is the parity that actually
// governs a deployment: 63_'s manifest must expect precisely the build 61_ carries.
ok(RO.stampAtOrAfter(/var WAP_BUILD_VERSION_ = '([^']+)'/.exec(G61)[1], DEPLOYMENT_BUILD),
  'J7  61_ was untouched by THIS round and is not behind it');
ok(RO.stampAtOrAfter(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/.exec(G63)[1], DEPLOYMENT_BUILD),
  'J7a the deployment release did not move for THIS diagnostic patch, and is not behind it');
eq(RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R3-P1'), -1,
  'J7b which is why this round is not in the release order either');
ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false/.test(G00), 'J8  the flag is still false in 00_config');
// Every function this round added is CENSUS_-prefixed, so no new entry point appeared in the editor.
var NEWFNS = ['CENSUS_r6r7SchemaAuthority_', 'CENSUS_r6r7NormalizerAuthority_', 'CENSUS_r6r7FieldClass_',
  'CENSUS_r6r7NormCell_', 'CENSUS_r6r7LiveSchemaOf_', 'CENSUS_r6r7LiveSchema_', 'CENSUS_r6r7FullRowSnapshot_',
  'CENSUS_r6r7RouteFullSnapshot_', 'CENSUS_r6r7CompareSnapshots_', 'CENSUS_r6r7IdentityUniverse_',
  'CENSUS_r6r7ReservationObservation_', 'CENSUS_r6r7RawTables_', 'CENSUS_r6r7RawFind_',
  'CENSUS_r6r7ActualResponseState_', 'CENSUS_r6r7EmitChunked_'];
eq(NEWFNS.filter(function (n) { return n.indexOf('CENSUS_') !== 0; }), [],
  'J9  every function added this round is CENSUS_-prefixed, so none is invocable by accident');
eq(NEWFNS.filter(function (n) {
  var s = extractFn(CENSUS, n);
  return /appendRow|setValues|setValue\s*\(|insertSheet|deleteRow/.test(s)
    || /INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=/.test(s)
    || /handleGenerateWeeklyAiPlanDraft_\s*\(/.test(s);
}), [], 'J9a and none of them writes, flips the flag or calls a generation');
// The snippets touch exactly one production function and no other write action.
ok(CAP_SNIP.indexOf('generateWeeklyAiPlanDraft') > 0, 'J10 the capture wraps the generation call');
eq(CAP_SNIP.match(/KM\.DB\./g) || [], ['KM.DB.'], 'J10a and reaches into KM.DB exactly once');
ok(!/upsertAtomic|submit|reserve|\.save\(/.test(CAP_SNIP), 'J10b touching no other write path');
ok(AUDIT_SNIP.indexOf('KM.DB') < 0, 'J10c and the audit snippet calls no API at all');

// ================================================================================================================
section('N — mutants');
// ================================================================================================================

mut('N1 the fingerprint over a hand-picked subset instead of the full canonical row', function () {
  var m = swap(CENSUS, '  (canonical || []).forEach(function (col) {' + NLF
    + '    if (!liveSet[col]) { excluded.push({ column: col, reason: ' + "'NOT_PRESENT_IN_LIVE_SCHEMA' }); return; }",
    '  (canonical || []).slice(0, 18).forEach(function (col) {' + NLF
    + '    if (!liveSet[col]) { excluded.push({ column: col, reason: ' + "'NOT_PRESENT_IN_LIVE_SCHEMA' }); return; }");
  var over = { aHeader: { create_idempotency_key: 'IDEM-N1' } };
  var clean = readback(FZ, over);
  var bf = freezeFrom(live(), { census: m });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', over,
    { after: bf.source + auditSrc() });
  return failed(clean.res).indexOf('route_A_header_is_byte_identical_across_every_column') >= 0
    && failed(bad.res).indexOf('route_A_header_is_byte_identical_across_every_column') < 0;
});

mut('N2 the snapshot built against the REQUIRED 30-column contract instead of the FULL 36', function () {
  // 16_ deliberately keeps two lists: the 30 columns every sheet must have, and the FULL 36 the write gate
  // validates against. Reading the first one is the easy mistake, and it is a quiet one: the snapshot then
  // covers 30 of its own 30, excludes nothing, and reports a byte-identical row while create_idempotency_key,
  // destination_marketplace and the whole lifecycle tail sit outside the claim.
  var m = swap(CENSUS, "    ? SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ : null; } catch (e1) { hdr = null; }",
    "    ? SHIPPING_ALLOCATION_DRAFTS_HEADERS_ : null; } catch (e1) { hdr = null; }");
  var over = { aHeader: { create_idempotency_key: 'IDEM-N2' } };
  var clean = readback(FZ, over);
  var bf = freezeFrom(live(), { census: m });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', over,
    { after: bf.source + auditSrc() });
  return failed(clean.res).indexOf('route_A_header_is_byte_identical_across_every_column') >= 0
    // the mutant's own snapshot is internally consistent — 30 of 30, nothing excluded — which is exactly
    // why nothing but the full comparison could have caught it.
    && bad.res.routes_observed[0].excluded_fields.length === 0
    && bad.res.routes_observed[0].covered_field_count === 61
    && failed(bad.res).indexOf('route_A_header_is_byte_identical_across_every_column') < 0;
});

mut('N3 an excluded column tolerated while still calling the row byte-identical', function () {
  var m = swap(CENSUS,
    "      f.excluded_fields.length === 0);", '      true);');
  m = swap(m, "    if (exc > 0) missing.push('excluded_fields_contradict_the_byte_identical_claim');",
    "    if (false) { missing.push('x'); }");
  var over = { after: headerEdit('shipping_allocation_drafts', 'function (h) { h.pop(); }') };
  var clean = manifest(live(), over);
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST', live(), over);
  return failed(clean.res).indexOf('route_A_excluded_no_field_from_the_byte_identical_claim') >= 0
    && failed(bad.res).indexOf('route_A_excluded_no_field_from_the_byte_identical_claim') < 0;
});

mut('N4 a schema that moved between the freeze and the readback ignored', function () {
  var m = swap(CENSUS,
    "  P('header_column_names_did_not_move', B.header_column_names_fingerprint, nH.live_names_fingerprint,"
      + NLF + '    nH.live_names_fingerprint === B.header_column_names_fingerprint);',
    "  P('header_column_names_did_not_move', B.header_column_names_fingerprint, nH.live_names_fingerprint, true);");
  var over = { after: headerEdit('shipping_allocation_drafts', 'function (h) { h[3] = "company_renamed"; }') };
  var clean = readback(FZ, live(), over);
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', live(),
    { after: FZ.source + auditSrc() + over.after });
  return failed(clean.res).indexOf('header_column_names_did_not_move') >= 0
    && failed(bad.res).indexOf('header_column_names_did_not_move') < 0;
});

mut('N5 the identity universe filtered to ACTIVE rows, so a created-then-cancelled row is invisible', function () {
  var m = swap(CENSUS, "      && CENSUS_low_(r.marketplace) === CENSUS_low_(scope.marketplace);",
    "      && CENSUS_low_(r.marketplace) === CENSUS_low_(scope.marketplace)" + NLF
    + "      && !term[CENSUS_low_(r.status)];");
  var over = { extraHeaders: [{ allocation_draft_id: 'SADH-N5', status: 'cancelled',
    generation_type: 'system_generated', generation_run_id: 'AIRUN-N5' }] };
  var clean = readback(FZ, over);
  var bf = freezeFrom(live(), { census: m });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', over,
    { after: bf.source + auditSrc() });
  return failed(clean.res).indexOf('no_header_id_appeared_at_any_status') >= 0
    && bad.res.verdict === 'CONTROLLED_NO_ACTION_CONFIRMED';
});

mut('N6 the header-to-line relation dropped from the freeze', function () {
  var m = swap(CENSUS,
    "  P('the_header_to_line_relation_did_not_change', UB.relation_fingerprint, UN.relation_fingerprint," + NLF
      + '    !!UN.relation_fingerprint && UN.relation_fingerprint === UB.relation_fingerprint);',
    "  P('the_header_to_line_relation_did_not_change', UB.relation_fingerprint, UN.relation_fingerprint, true);");
  var over = { aLine: { allocation_draft_id: 'SADH-K4-A3872518' } };
  var clean = readback(FZ, over);
  var bf = freezeFrom(live(), { census: m });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', over, { after: bf.source + auditSrc() });
  return failed(clean.res).indexOf('the_header_to_line_relation_did_not_change') >= 0
    && failed(bad.res).indexOf('the_header_to_line_relation_did_not_change') < 0;
});

mut('N7 an ABSENT reservation table accepted without the server guarantee', function () {
  var m = swap(noMan, "    o.acceptable = o.server_guarantee === true;", '    o.acceptable = true;');
  var clean = withCensus(noMan, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST');
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST');
  return failed(clean.res).indexOf('reservation_table_is_not_present_but_unreadable') >= 0
    && failed(bad.res).indexOf('reservation_table_is_not_present_but_unreadable') < 0;
});

mut('N8 the expected decision copied into the actual response', function () {
  // The exact substitution R3 made: recompute 61_'s answer and present it as the reply the browser received.
  var m = swap(CENSUS, '  out.actual_browser_response = CENSUS_r6r7ActualResponseState_();',
    '  out.actual_browser_response = { measured_here: true, supplied_by_operator: true, missing_fields: [],'
    + " source: 'recomputed', why_not_measured_here: 'nobody received', values: { captured: true,"
    + " response_outcome: pp.outcome, response_code: pp.code, recommended_qty: 0, qualifying_planned_qty: 520,"
    + ' residual_qty: 0, created_headers: 0, created_lines: 0, updated_headers: 0, updated_lines: 0,'
    // R6-R7-R3 — `reservations` joins the fabrication for the same reason the others are here: a mutant whose
    // forged object cannot satisfy the contract never reaches CONFIRMED, and then it is no longer testing the
    // lock it claims to test — only that an incomplete forgery fails, which proves nothing about the lock.
    + ' cancelled_headers: 0, cancelled_lines: 0, reservations: 0, db_writes: 0, writer_reached: false,'
    + ' routes_count: 0,'
    + ' groups_count: 0, exactly_one_generation_request: true, new_mutation_requests: 1,'
    + ' generation_requests: 1, capture_installed: true, capture_restored: true, capture_calls: 1,'
    + ' route_save_requests: 0, submit_requests: 0, reservation_requests: 0,'
    // R5-R1 — and the two class-contract fields, for the same reason as `reservations` above.
    + " no_action_reason: 'VALID_ZERO_RECOMMENDATION',"
    + " recommendation_state: 'VALID_ZERO_RECOMMENDATION' } };");
  var clean = readback(FZ, live(), { noAudit: true });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', live(), { after: FZ.source });
  return clean.res.verdict === 'AWAITING_ACTIVATION'
    && bad.res.verdict === 'CONTROLLED_NO_ACTION_CONFIRMED';
});

mut('N9 supplied_by_operator meaning "the constant exists" rather than "the fields are filled in"', function () {
  var m = swap(CENSUS, '    supplied_by_operator: missing.length === 0,',
    '    supplied_by_operator: !!R6R7_ACTUAL_BROWSER_RESPONSE_,');
  var clean = readback(FZ, live(), { noAudit: true });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', live(), { after: FZ.source });
  return clean.res.verdict === 'AWAITING_ACTIVATION'
    && clean.res.actual_browser_response.supplied_by_operator === false
    && bad.res.actual_browser_response.supplied_by_operator === true;
});

mut('N10 a CONFIRMED allowed on an audit that captured no body', function () {
  // Two locks hold this: the noBody short-circuit that gives it its own verdict, and the proof guard.
  // Either alone still refuses, which is the point of having two — so the mutant removes both.
  var m = swap(CENSUS, '  var noBody = A.captured === false;', '  var noBody = false;');
  m = swap(m, "    } else if ((ab.values || {}).captured !== true) {" + NLF
    + "      missing.push('actual_response_not_captured_cannot_be_NO_ACTION_CONFIRMED');" + NLF + '    }',
    '    }');
  m = swap(m, "    P('the_actual_response_was_captured', true, A.captured, A.captured === true);",
    "    P('the_actual_response_was_captured', true, A.captured, true);");
  var aud = { captured: false };
  var clean = readback(FZ, live(), { audit: aud });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', live(),
    { after: FZ.source + auditSrc(aud) });
  return clean.res.verdict === 'ACTUAL_RESPONSE_NOT_CAPTURED'
    && bad.res.verdict === 'CONTROLLED_NO_ACTION_CONFIRMED';
});

mut('N11 an audit that reports the page restored without putting the original back', function () {
  var m = AUDIT_SNIP.replace('if (cap0 && typeof cap0.release === "function") cap0.release();', '');
  function probe(auditSrcText) {
    var w = browserWorld({ response: NO_ACTION_ENVELOPE, timeline: PRIOR.slice() });
    vm.runInContext(BASE_SNIP, w.ctx);
    install(w);
    try { w.ctx.KM.DB.generateWeeklyAiPlanDraft({}); } catch (e) {}
    var a = vm.runInContext(auditSrcText, w.ctx);
    return { restored: w.ctx.KM.DB.generateWeeklyAiPlanDraft === w.orig, claimed: a.capture.restored };
  }
  var clean = probe(AUDIT_SNIP), bad = probe(m);
  return clean.restored === true && clean.claimed === true
    && bad.restored === false && bad.claimed === false;
});

mut('N12 the capture passing a second call through instead of blocking it', function () {
  var m = CAP_SNIP.replace('    if (state.calls > 1) {', '    if (false) {');
  function probe(src) {
    var w = browserWorld({ response: NO_ACTION_ENVELOPE });
    vm.runInContext(src, w.ctx);
    var f = w.ctx.KM.DB.generateWeeklyAiPlanDraft;
    try { f.call(w.ctx.KM.DB, {}); } catch (e) {}
    try { f.call(w.ctx.KM.DB, {}); } catch (e2) {}
    return w.calls.length;
  }
  return probe(CAP_SNIP) === 1 && probe(m) === 2;
});

mut('N13 the field diff computed only when the fingerprint disagrees', function () {
  var m = swap(CENSUS, '    out.changed_fields = out.changed_fields' + NLF
    + '      .concat(CENSUS_r6r7CompareSnapshots_(label, R6R7_SCHEMA_TABLES_.header, hSnapWas, f.header_snapshot))'
    + NLF + '      .concat(CENSUS_r6r7CompareSnapshots_(label, R6R7_SCHEMA_TABLES_.line, lSnapWas, f.line_snapshot));',
    '    if (f.combined_full_fingerprint !== cFpWas && false) { out.changed_fields = out.changed_fields'
    + NLF + '      .concat(CENSUS_r6r7CompareSnapshots_(label, R6R7_SCHEMA_TABLES_.header, hSnapWas, f.header_snapshot))'
    + NLF + '      .concat(CENSUS_r6r7CompareSnapshots_(label, R6R7_SCHEMA_TABLES_.line, lSnapWas, f.line_snapshot)); }');
  var over = { aHeader: { create_idempotency_key: 'IDEM-N13' } };
  var clean = readback(FZ, over);
  var bf = freezeFrom(live(), { census: m });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', over, { after: bf.source + auditSrc() });
  return clean.res.changed_fields.length > 0 && bad.res.changed_fields.length === 0;
});

mut('N14 a representation-only difference read as a business change', function () {
  var m = swap(CENSUS, "    if ((cls === 'DAY' || cls === 'NUMERIC') && typeof sadFpNorm_ === 'function') {"
    + NLF + '      return String(sadFpNorm_(column, value));' + NLF + '    }',
    "    if (false) { return ''; }");
  var frozenAs = live({ aLine: { window_start_date: new Date(Date.UTC(2026, 8, 5, 16, 0, 0)) } });
  var readAs = live({ aLine: { window_start_date: '2026-09-06' } });
  var clean = readback(freezeFrom(frozenAs), readAs);
  var bf = freezeFrom(frozenAs, { census: m });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', readAs, { after: bf.source + auditSrc() });
  return clean.res.verdict === 'CONTROLLED_NO_ACTION_CONFIRMED'
    && bad.res.verdict === 'STOP'
    && bad.res.changed_fields.some(function (c) { return c.field === 'window_start_date'; });
});

// ---- N15-N23  R5-R1: THE CLASS-AWARE READBACK. ---------------------------------------------------------
// Each mutant is run against the R5-R1 FULLY_COVERED evidence, and each has to turn a CONFIRMED into a
// STOP or a STOP into a CONFIRMED. A mutant that merely fails for some other reason proves nothing.

function kbCensus(src, over, opts) {
  var a = {};
  Object.keys(K_AUDIT).forEach(function (k) { a[k] = K_AUDIT[k]; });
  Object.keys(over || {}).forEach(function (k) { a[k] = over[k]; });
  var o = { audit: a, census: src };
  Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
  return readback(KFZ, live(K_FC), o);
}

mut('N15 the expected recommendation is hardcoded to zero again — the exact false negative', function () {
  var m = swap(CENSUS, "    recommended_qty: naClass ? frozenRec : null,",
    '    recommended_qty: 0,');
  return kb().res.verdict === 'CONTROLLED_NO_ACTION_CONFIRMED'
    && kbCensus(m).res.verdict === 'STOP'
    && failed(kbCensus(m).res).indexOf('the_actual_response_quantities_match_the_frozen_baseline') >= 0;
});

mut('N16 the class is taken from the RESPONSE instead of the frozen baseline', function () {
  // A response that chooses which test it is marked against is not being tested. Here a FULLY_COVERED
  // baseline is met by a VALID_ZERO response, which the mutant then judges on the class the RESPONSE named.
  var m = swap(CENSUS, '  out.no_action_class_expected = {',
    '  naClass = CENSUS_str_((R6R7_ACTUAL_BROWSER_RESPONSE_ || {}).no_action_reason) || naClass;' + NLF
    + '  naState = CENSUS_str_((R6R7_ACTUAL_BROWSER_RESPONSE_ || {}).recommendation_state) || naState;' + NLF
    + '  out.no_action_class_expected = {');
  var probe = { no_action_reason: 'VALID_ZERO_RECOMMENDATION',
    recommendation_state: 'VALID_ZERO_RECOMMENDATION', recommended_qty: 0,
    qualifying_planned_qty: 520, residual_qty: 0 };
  // Aimed at the two CLASS gates by name. The quantity gate refuses this probe under the mutant too — the
  // frozen 160 is still the expected number — so a verdict-level claim would be measuring that lock and
  // reporting it as this one.
  var clean = kb(probe), bad = kbCensus(m, probe);
  var A = 'the_actual_response_no_action_reason_is_the_frozen_class';
  var B2 = 'the_actual_recommendation_state_is_exactly_the_class_contract';
  return failed(clean.res).indexOf(A) >= 0 && failed(clean.res).indexOf(B2) >= 0
    && failed(bad.res).indexOf(A) === -1 && failed(bad.res).indexOf(B2) === -1;
});

mut('N17 an unresolved class falls back to the zero class instead of refusing', function () {
  var m = swap(CENSUS, "    naUnresolved = 'FROZEN_RECOMMENDED_QTY_IS_NOT_A_FINITE_NON_NEGATIVE_NUMBER: '",
    "    naClass = 'VALID_ZERO_RECOMMENDATION'; naState = 'VALID_ZERO_RECOMMENDATION';" + NLF
    + "    naDiscardedMessage = 'FROZEN_RECOMMENDED_QTY_IS_NOT_A_FINITE_NON_NEGATIVE_NUMBER: '");
  var bend = { after: '(function(){ R6R7_NO_ACTION_BEFORE_.recommended_qty = -5; })();' };
  var probe = { no_action_reason: 'VALID_ZERO_RECOMMENDATION',
    recommendation_state: 'VALID_ZERO_RECOMMENDATION', recommended_qty: 0 };
  var clean = kb(probe, bend), bad = kbCensus(m, probe, bend);
  return clean.res.verdict === 'STOP'
    && failed(clean.res).indexOf('the_frozen_baseline_resolves_to_exactly_one_no_action_class') >= 0
    && failed(bad.res).indexOf('the_frozen_baseline_resolves_to_exactly_one_no_action_class') === -1;
});

mut('N18 the quantity gate compares loosely, so a numeric STRING passes as the number', function () {
  var m = swap(CENSUS, '      && rbNum_(A.recommended_qty) === expShape.recommended_qty',
    '      && A.recommended_qty == expShape.recommended_qty');
  var probe = { recommended_qty: '160' };
  var NM = 'the_actual_response_quantities_match_the_frozen_baseline';
  // The class-B positivity gate reads the same field through rbNum_ and refuses the probe under the mutant
  // as well, which is defence in depth and also why this claim names the gate rather than the verdict.
  return failed(kb(probe).res).indexOf(NM) >= 0
    && failed(kbCensus(m, probe).res).indexOf(NM) === -1;
});

mut('N19 the six fields leave the REQUIRED list again, so a null stands in a value gate', function () {
  // The defect exactly as it was: an incomplete paste passes completeness and then fails the VALUE gate,
  // reporting [null,null,null] against [0,0,0] — a paste omission in the vocabulary of a backend omission.
  var m = swap(CENSUS, "  'route_save_requests', 'submit_requests', 'reservation_requests'," + NLF
    + "  'capture_installed', 'capture_restored'];",
    "  'capture_installed', 'capture_restored'];");
  var probe = { route_save_requests: null };
  var clean = kb(probe), bad = kbCensus(m, probe);
  return clean.res.verdict === 'AWAITING_ACTIVATION' && failed(clean.res).length === 0
    && bad.res.verdict === 'STOP'
    && failed(bad.res).indexOf('no_route_save_or_submit_or_reservation_request_rode_along') >= 0;
});

mut('N20 `reservations` leaves the REQUIRED list, so the seventh counter is a null again', function () {
  var m = swap(CENSUS, "  'cancelled_headers', 'cancelled_lines', 'reservations', 'db_writes', 'writer_reached',",
    "  'cancelled_headers', 'cancelled_lines', 'db_writes', 'writer_reached',");
  var probe = { reservations: null };
  var clean = kb(probe), bad = kbCensus(m, probe);
  return clean.res.verdict === 'AWAITING_ACTIVATION'
    && bad.res.verdict === 'STOP'
    && failed(bad.res).indexOf('every_mutation_counter_in_the_actual_response_is_zero') >= 0;
});

mut('N21 the counter gate treats a missing or null counter as a zero', function () {
  var m = swap(CENSUS, "    var rbBad = rbCounters.filter(function (c) { return !(typeof c[1] === 'number' && c[1] === 0); })",
    '    var rbBad = rbCounters.filter(function (c) { return !(c[1] === 0 || c[1] === null || c[1] === undefined); })');
  // Probed through a census whose REQUIRED list still lets the null through, because the two locks are
  // independent and this one has to be shown to work on its own.
  var noReq = swap(CENSUS, "  'cancelled_headers', 'cancelled_lines', 'reservations', 'db_writes', 'writer_reached',",
    "  'cancelled_headers', 'cancelled_lines', 'db_writes', 'writer_reached',");
  var bothOff = swap(m, "  'cancelled_headers', 'cancelled_lines', 'reservations', 'db_writes', 'writer_reached',",
    "  'cancelled_headers', 'cancelled_lines', 'db_writes', 'writer_reached',");
  var probe = { reservations: null };
  return failed(kbCensus(noReq, probe).res).indexOf('every_mutation_counter_in_the_actual_response_is_zero') >= 0
    && failed(kbCensus(bothOff, probe).res).indexOf('every_mutation_counter_in_the_actual_response_is_zero') === -1;
});

mut('N22 the recommendation_state gate accepts the enum KEY as well as its value', function () {
  // The KEY/VALUE confusion, which both test doubles in this repo carried until this round. 61_ emits
  // WAP_RECOMMENDATION_STATES_.NONZERO, whose VALUE is 'NONZERO_RECOMMENDATION'; 'NONZERO' is the key.
  var m = swap(CENSUS, "      naState !== null && CENSUS_str_(A.recommendation_state) === naState);",
    "      naState !== null && (CENSUS_str_(A.recommendation_state) === naState" + NLF
    + "        || naState.indexOf(CENSUS_str_(A.recommendation_state)) === 0));");
  var probe = { recommendation_state: 'NONZERO' };
  return kb(probe).res.verdict === 'STOP'
    && kbCensus(m, probe).res.verdict === 'CONTROLLED_NO_ACTION_CONFIRMED';
});

mut('N23 the class-B coverage condition is dropped, so a plan short of the recommendation passes', function () {
  var m = swap(CENSUS, "      P('the_fully_covered_response_plan_covers_the_whole_recommendation',",
    "      if (false) P('the_fully_covered_response_plan_covers_the_whole_recommendation',");
  // The quantities gate also refuses this probe, so the claim is aimed at the coverage predicate itself.
  var probe = { qualifying_planned_qty: 100 };
  var NM = 'the_fully_covered_response_plan_covers_the_whole_recommendation';
  return failed(kb(probe).res).indexOf(NM) >= 0
    && failed(kbCensus(m, probe).res).indexOf(NM) === -1;
});

console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
process.exit(fail ? 1 : 0);
